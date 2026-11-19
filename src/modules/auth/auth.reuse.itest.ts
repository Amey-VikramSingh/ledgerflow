import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerOrg, login, refresh, verifyAccessToken } from './auth.service';
import { pool } from '../../db/pool';

/**
 * Integration test — requires a running Postgres with migrations applied.
 *   docker compose up postgres -d && npm run migrate:up
 *   npm run test:integration
 *
 * Covers refresh-token rotation and reuse detection: replaying a rotated
 * token revokes every token in its family.
 */

let refreshToken: string;
let email: string;

before(async () => {
  email = `reuse_${Date.now()}@test.local`;
  await registerOrg({ email, password: 'supersecret123', orgName: 'ReuseCo' });
  const tokens = await login({ email, password: 'supersecret123' });
  refreshToken = tokens.refresh_token;
});

after(async () => {
  await pool.end();
});

test('rotation issues a new, valid token pair', async () => {
  const next = await refresh(refreshToken);
  assert.notEqual(next.refresh_token, refreshToken, 'refresh token must change');
  const payload = verifyAccessToken(next.access_token);
  assert.ok(payload.sub, 'new access token is valid');
  // keep the rotated (old) token for the reuse test below
});

test('replaying a rotated token is detected and rejected', async () => {
  // refreshToken was rotated in the previous test → replaying it is reuse
  await assert.rejects(
    () => refresh(refreshToken),
    (err: Error) => err.message === 'token_reuse_detected',
    'reuse of a rotated token must be detected',
  );
});

test('reuse revokes the entire family (the successor is now dead too)', async () => {
  // Fresh login → R1 → rotate to R2 → replay R1 (reuse) → R2 must also be dead.
  const email2 = `family_${Date.now()}@test.local`;
  await registerOrg({ email: email2, password: 'supersecret123', orgName: 'FamCo' });
  const { refresh_token: r1 } = await login({ email: email2, password: 'supersecret123' });
  const { refresh_token: r2 } = await refresh(r1); // r1 rotated → r2 live

  await assert.rejects(() => refresh(r1), /token_reuse_detected/); // replay r1

  // r2 belonged to the same family → now revoked → unusable
  await assert.rejects(() => refresh(r2), /invalid refresh token|token_reuse_detected/);
});
