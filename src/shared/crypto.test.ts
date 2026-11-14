import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, sha256, randomToken } from './crypto';

test('hashPassword produces a verifiable argon2 hash', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.ok(hash.startsWith('$argon2'), 'should be an argon2 hash');
  assert.equal(await verifyPassword(hash, 'correct horse battery staple'), true);
});

test('verifyPassword rejects a wrong password', async () => {
  const hash = await hashPassword('right-password');
  assert.equal(await verifyPassword(hash, 'wrong-password'), false);
});

test('hashPassword is salted (same input, different hash)', async () => {
  const a = await hashPassword('same');
  const b = await hashPassword('same');
  assert.notEqual(a, b, 'salts must differ');
});

test('sha256 is deterministic', () => {
  assert.equal(sha256('token'), sha256('token'));
  assert.notEqual(sha256('token'), sha256('other'));
});

test('randomToken is high-entropy and unique', () => {
  const a = randomToken();
  const b = randomToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 43); // 32 bytes base64url
});
