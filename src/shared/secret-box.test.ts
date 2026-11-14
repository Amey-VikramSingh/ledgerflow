import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSecretBox } from './secret-box';

const box = createSecretBox(randomBytes(32).toString('base64'));

test('round-trips a secret', () => {
  const boxed = box.encrypt('whsec_example');
  assert.ok(boxed.startsWith('v1.'));
  assert.ok(!boxed.includes('whsec_example'));
  assert.equal(box.decrypt(boxed), 'whsec_example');
});

test('produces different ciphertext each time (random IV)', () => {
  assert.notEqual(box.encrypt('same'), box.encrypt('same'));
});

test('rejects tampered ciphertext', () => {
  const parts = box.encrypt('whsec_example').split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => box.decrypt(parts.join('.')));
});

test('a different key cannot decrypt', () => {
  const other = createSecretBox(randomBytes(32).toString('base64'));
  assert.throws(() => other.decrypt(box.encrypt('whsec_example')));
});

test('rejects values that are not in the encrypted format', () => {
  assert.throws(() => box.decrypt('plaintext-secret'), /expected encrypted format/);
});

test('rejects a key that is not 32 bytes', () => {
  assert.throws(() => createSecretBox(Buffer.from('short').toString('base64')), /32 bytes/);
});
