import { test } from 'node:test';
import assert from 'node:assert/strict';
import { permissionsForRole, isValidPermission } from './rbac';

test('owner has every permission including member:manage', () => {
  assert.ok(permissionsForRole('owner').includes('member:manage'));
  assert.ok(permissionsForRole('owner').includes('apikey:manage'));
});

test('admin can manage api keys but not members', () => {
  const perms = permissionsForRole('admin');
  assert.ok(perms.includes('apikey:manage'));
  assert.ok(!perms.includes('member:manage'));
});

test('member can write transactions but not manage api keys', () => {
  const perms = permissionsForRole('member');
  assert.ok(perms.includes('transaction:write'));
  assert.ok(!perms.includes('apikey:manage'));
});

test('viewer is read-only', () => {
  const perms = permissionsForRole('viewer');
  assert.ok(perms.includes('wallet:read'));
  assert.ok(!perms.includes('wallet:write'));
});

test('unknown role has no permissions', () => {
  assert.deepEqual(permissionsForRole('nonsense'), []);
});

test('isValidPermission gates scope input', () => {
  assert.equal(isValidPermission('wallet:read'), true);
  assert.equal(isValidPermission('delete:everything'), false);
});
