import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { pool } from '../../db/pool';
import { config } from '../../config';
import { hashPassword, verifyPassword, sha256, randomToken } from '../../shared/crypto';
import { ConflictError, UnauthorizedError } from '../../shared/errors';
import type { RegisterInput, LoginInput } from './auth.schemas';

export interface AccessPayload {
  sub: string; // user id
  tenant_id: string;
  role: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

interface UserRow {
  id: string;
  tenant_id: string;
  role: string;
  email: string;
  password_hash: string;
}

/** Sign a short-lived, self-contained access token. */
export function signAccessToken(user: {
  id: string;
  tenant_id: string;
  role: string;
}): string {
  const payload: AccessPayload = {
    sub: user.id,
    tenant_id: user.tenant_id,
    role: user.role,
  };
  return jwt.sign(payload, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS,
  });
}

/** Verify an access token; throws if invalid/expired. */
export function verifyAccessToken(token: string): AccessPayload {
  // Pin the algorithm: accept only what we sign with, never a token that
  // names a different one (e.g. "none" or an asymmetric alg).
  return jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as AccessPayload;
}

/** Postgres unique_violation on the global email index. */
function isDuplicateEmail(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && e.constraint === 'users_email_unique';
}

/**
 * Signup creates a new tenant (organization) and an owner user, atomically.
 * Email is globally unique, because login identifies a user by email alone.
 * The pre-check below gives the usual fast answer; the users_email_unique
 * index (migration 1700000000007) is what actually guarantees it when two
 * sign-ups for the same email race past the pre-check together.
 */
export async function registerOrg(input: RegisterInput): Promise<{
  id: string;
  email: string;
  tenant_id: string;
  role: string;
}> {
  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [
    input.email,
  ]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new ConflictError('email already registered');
  }

  const passwordHash = await hashPassword(input.password);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tenant = await client.query<{ id: string }>(
      'INSERT INTO tenants (name) VALUES ($1) RETURNING id',
      [input.orgName],
    );
    const tenantId = tenant.rows[0]!.id;

    const user = await client.query<{ id: string; email: string; role: string }>(
      `INSERT INTO users (tenant_id, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, 'owner', false)
       RETURNING id, email, role`,
      [tenantId, input.email, passwordHash],
    );
    await client.query('COMMIT');

    const row = user.rows[0]!;
    return { id: row.id, email: row.email, tenant_id: tenantId, role: row.role };
  } catch (err) {
    await client.query('ROLLBACK');
    if (isDuplicateEmail(err)) {
      throw new ConflictError('email already registered');
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A real argon2 hash of a random password, computed once. Login verifies
 * against it when the email is unknown, so an unknown email takes as long
 * as a wrong password and response time doesn't reveal which emails exist.
 */
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken());
  return dummyHash;
}

/**
 * Verify credentials and issue tokens. Returns the SAME error, after the
 * same amount of work, for unknown email and wrong password, so we don't
 * leak which emails exist.
 */
export async function login(input: LoginInput): Promise<TokenPair> {
  // Email is globally unique (users_email_unique), so this is at most one row.
  const { rows } = await pool.query<UserRow>(
    'SELECT id, tenant_id, role, email, password_hash FROM users WHERE email = $1',
    [input.email],
  );
  const user = rows[0];
  let ok = false;
  if (user) {
    ok = await verifyPassword(user.password_hash, input.password);
  } else {
    await verifyPassword(await getDummyHash(), input.password); // timing only; result ignored
  }
  if (!user || !ok) {
    throw new UnauthorizedError('invalid credentials');
  }
  return issueTokens(user);
}

/**
 * Issue an access JWT + an opaque refresh token. The refresh token is random
 * (not a JWT) because we must track it in the DB for rotation/reuse detection.
 * We store only sha256(token), never the raw token.
 * A fresh family_id groups all tokens descended from this login.
 */
export async function issueTokens(user: {
  id: string;
  tenant_id: string;
  role: string;
}): Promise<TokenPair> {
  const familyId = randomUUID();
  const refresh = randomToken();
  const refreshHash = sha256(refresh);
  const expiresAt = new Date(
    Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, familyId, refreshHash, expiresAt],
  );

  return {
    access_token: signAccessToken(user),
    refresh_token: refresh,
    token_type: 'Bearer',
    expires_in: config.ACCESS_TOKEN_TTL_SECONDS,
  };
}

type RefreshOutcome =
  | { kind: 'ok'; pair: TokenPair }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'reuse' };

/**
 * Refresh with ROTATION + REUSE DETECTION — the security heart of the auth
 * system. All work happens in one transaction with the token row locked
 * FOR UPDATE, which also serializes concurrent refreshes of the same token.
 *
 *  - unknown/expired token            → 401
 *  - token already rotated (replayed) → an old copy is in the wild, so we
 *    REVOKE THE ENTIRE FAMILY and force re-login (401 token_reuse_detected)
 *  - valid + unrotated                → mark rotated, mint a new token in the
 *    same family, return a fresh pair
 *
 * We never throw mid-transaction; we compute an outcome, close the txn
 * cleanly, then translate the outcome to a response. This avoids the classic
 * "rollback after commit" bug.
 */
export async function refresh(rawToken: string): Promise<TokenPair> {
  const tokenHash = sha256(rawToken);
  const client = await pool.connect();
  let outcome: RefreshOutcome;

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      id: string;
      family_id: string;
      rotated: boolean;
      expires_at: string;
      user_id: string;
      tenant_id: string;
      role: string;
    }>(
      `SELECT rt.id, rt.family_id, rt.rotated, rt.expires_at,
              u.id AS user_id, u.tenant_id, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       FOR UPDATE`,
      [tokenHash],
    );

    const t = rows[0];

    if (!t) {
      await client.query('ROLLBACK');
      outcome = { kind: 'invalid' };
    } else if (new Date(t.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      outcome = { kind: 'expired' };
    } else if (t.rotated) {
      // Reuse detected: a rotated token was presented again → burn the family.
      await client.query(
        'UPDATE refresh_tokens SET rotated = true WHERE family_id = $1',
        [t.family_id],
      );
      await client.query('COMMIT');
      outcome = { kind: 'reuse' };
    } else {
      // Happy path: rotate this token, mint a successor in the same family.
      await client.query('UPDATE refresh_tokens SET rotated = true WHERE id = $1', [
        t.id,
      ]);
      const newRaw = randomToken();
      const expiresAt = new Date(
        Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      );
      await client.query(
        `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [t.user_id, t.family_id, sha256(newRaw), expiresAt],
      );
      await client.query('COMMIT');
      outcome = {
        kind: 'ok',
        pair: {
          access_token: signAccessToken({
            id: t.user_id,
            tenant_id: t.tenant_id,
            role: t.role,
          }),
          refresh_token: newRaw,
          token_type: 'Bearer',
          expires_in: config.ACCESS_TOKEN_TTL_SECONDS,
        },
      };
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* already closed */
    }
    throw err;
  } finally {
    client.release();
  }

  if (outcome.kind === 'ok') return outcome.pair;
  if (outcome.kind === 'reuse') {
    throw new UnauthorizedError('token_reuse_detected');
  }
  throw new UnauthorizedError(
    outcome.kind === 'expired' ? 'refresh token expired' : 'invalid refresh token',
  );
}

/** Logout revokes the whole token family. Idempotent for unknown tokens. */
export async function logout(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  await pool.query(
    `UPDATE refresh_tokens SET rotated = true
     WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
    [tokenHash],
  );
}

export async function getUserById(id: string): Promise<{
  id: string;
  email: string;
  role: string;
  tenant_id: string;
  email_verified: boolean;
} | null> {
  const { rows } = await pool.query(
    'SELECT id, email, role, tenant_id, email_verified FROM users WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}
