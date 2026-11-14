import { pool } from '../../db/pool';
import { sha256, randomToken } from '../../shared/crypto';
import { isValidPermission, type Permission } from './rbac';
import { ValidationError } from '../../shared/errors';

/**
 * API keys authenticate programmatic clients. We store only sha256(key); the
 * raw key is shown exactly once at creation and never again. Scopes are an
 * explicit subset of permissions — a key can be strictly less privileged than
 * the user who created it.
 */

export interface CreatedApiKey {
  id: string;
  prefix: string;
  scopes: Permission[];
  api_key: string; // raw — shown once
}

export async function createApiKey(
  tenantId: string,
  name: string,
  scopes: string[],
): Promise<CreatedApiKey> {
  const invalid = scopes.filter((s) => !isValidPermission(s));
  if (invalid.length > 0) {
    throw new ValidationError(`invalid scopes: ${invalid.join(', ')}`);
  }

  const raw = `lk_live_${randomToken(24)}`;
  const prefix = raw.slice(0, 16); // lk_live_ + 8 chars, for display + lookup hinting
  const keyHash = sha256(raw);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO api_keys (tenant_id, prefix, key_hash, scopes)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, prefix, keyHash, scopes],
  );

  return { id: rows[0]!.id, prefix, scopes: scopes as Permission[], api_key: raw };
}

export async function listApiKeys(tenantId: string): Promise<
  Array<{
    id: string;
    prefix: string;
    scopes: string[];
    last_used_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }>
> {
  const { rows } = await pool.query(
    `SELECT id, prefix, scopes, last_used_at, revoked_at, created_at
     FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows;
}

/** Tenant-scoped revoke — a tenant can only revoke its own keys. */
export async function revokeApiKey(tenantId: string, id: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE api_keys SET revoked_at = now()
     WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [id, tenantId],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Resolve a raw API key to its tenant + scopes. Returns null for unknown or
 * revoked keys. Touches last_used_at for observability.
 */
export async function resolveApiKey(rawKey: string): Promise<{
  id: string;
  tenantId: string;
  scopes: string[];
} | null> {
  const keyHash = sha256(rawKey);
  const { rows } = await pool.query<{
    id: string;
    tenant_id: string;
    scopes: string[];
  }>(
    `SELECT id, tenant_id, scopes FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash],
  );
  const key = rows[0];
  if (!key) return null;

  // Best-effort last-used update; don't block auth on it.
  void pool
    .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [key.id])
    .catch(() => undefined);

  return { id: key.id, tenantId: key.tenant_id, scopes: key.scopes };
}
