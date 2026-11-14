import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerOrg, login, verifyAccessToken } from './auth.service';
import { pool } from '../../db/pool';
import { ConflictError, UnauthorizedError } from '../../shared/errors';

/**
 * Integration test — requires Postgres with migrations applied.
 * Login identifies users by email alone, so an email must belong to exactly
 * one user across all tenants.
 */

after(async () => {
  await pool.end();
});

const unique = (label: string) => `${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.local`;

test('registering an email that already exists (any case) is a conflict', async () => {
  const email = unique('dup');
  await registerOrg({ email, password: 'supersecret123', orgName: 'First Co' });
  await assert.rejects(
    () => registerOrg({ email: email.toUpperCase(), password: 'supersecret123', orgName: 'Second Co' }),
    ConflictError,
  );
});

test('concurrent sign-ups with the same email create exactly one user', async () => {
  const email = unique('race');
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      registerOrg({ email, password: 'supersecret123', orgName: `Race Co ${i}` }),
    ),
  );
  const ok = results.filter((r) => r.status === 'fulfilled');
  const conflicts = results.filter(
    (r) => r.status === 'rejected' && r.reason instanceof ConflictError,
  );
  assert.equal(ok.length, 1, 'exactly one sign-up wins');
  assert.equal(conflicts.length, results.length - 1, 'every other sign-up is a 409, not a 500');

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [email]);
  assert.equal(rows[0].n, 1, 'one user row for the email');

  // ...and login lands in the tenant that actually won.
  const winner = (ok[0] as PromiseFulfilledResult<{ tenant_id: string }>).value;
  const tokens = await login({ email, password: 'supersecret123' });
  assert.equal(verifyAccessToken(tokens.access_token).tenant_id, winner.tenant_id);
});

test('the database rejects a second user with the same email in another tenant', async () => {
  const email = unique('db');
  const org = await registerOrg({ email, password: 'supersecret123', orgName: 'DB Co' });
  const other = await pool.query<{ id: string }>(`INSERT INTO tenants (name) VALUES ('Other') RETURNING id`);
  await assert.rejects(
    () =>
      pool.query(
        `INSERT INTO users (tenant_id, email, password_hash) VALUES ($1, $2, 'x')`,
        [other.rows[0]!.id, email.toUpperCase()],
      ),
    /users_email_unique/,
  );
  assert.ok(org.tenant_id);
});

test('unknown email and wrong password fail the same way', async () => {
  const email = unique('login');
  await registerOrg({ email, password: 'supersecret123', orgName: 'Login Co' });
  await assert.rejects(() => login({ email, password: 'wrong-password' }), UnauthorizedError);
  await assert.rejects(
    () => login({ email: unique('nobody'), password: 'whatever123' }),
    UnauthorizedError,
  );
});
