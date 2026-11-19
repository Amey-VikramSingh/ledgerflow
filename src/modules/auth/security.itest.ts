import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { pool } from '../../db/pool';
import { config } from '../../config';
import { registerOrg, verifyAccessToken, signAccessToken } from './auth.service';
import { createApiKey } from './apikey.service';
import { permissionsForRole } from './rbac';
import { ForbiddenError } from '../../shared/errors';

/**
 * Integration test — requires Postgres with migrations applied.
 * Security regressions found in review.
 */

let tenantId: string;

before(async () => {
  const org = await registerOrg({
    email: `sec_${Date.now()}_${Math.random().toString(36).slice(2)}@test.local`,
    password: 'supersecret123',
    orgName: 'SecCo',
  });
  tenantId = org.tenant_id;
});

after(async () => {
  await pool.end();
});

test('an admin cannot mint an API key with owner-only permissions', async () => {
  await assert.rejects(
    () => createApiKey(tenantId, 'escalate', ['member:manage'], permissionsForRole('admin')),
    ForbiddenError,
  );
});

test('an API key cannot mint a more powerful API key', async () => {
  const limited = ['apikey:manage', 'wallet:read'];
  await assert.rejects(
    () => createApiKey(tenantId, 'escalate', ['transaction:write'], limited),
    ForbiddenError,
  );
  const ok = await createApiKey(tenantId, 'narrower', ['wallet:read'], limited);
  assert.deepEqual(ok.scopes, ['wallet:read']);
});

test('the owner can still mint any valid scope', async () => {
  const key = await createApiKey(tenantId, 'full', ['member:manage', 'wallet:read'], permissionsForRole('owner'));
  assert.ok(key.api_key.startsWith('lk_live_'));
});

test('access tokens signed with a different algorithm are rejected', () => {
  const claims = { sub: 'u', tenant_id: tenantId, role: 'owner' };
  const hs512 = jwt.sign(claims, config.JWT_SECRET, { algorithm: 'HS512' });
  assert.throws(() => verifyAccessToken(hs512), /invalid algorithm/);

  const unsigned = jwt.sign(claims, '', { algorithm: 'none' });
  assert.throws(() => verifyAccessToken(unsigned));

  const good = signAccessToken({ id: 'u', tenant_id: tenantId, role: 'owner' });
  assert.equal(verifyAccessToken(good).tenant_id, tenantId);
});
