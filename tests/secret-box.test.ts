import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/shared/secret-box';

describe('secret box', () => {
  it('round-trips a secret', () => {
    const boxed = encryptSecret('whsec_example');
    expect(boxed.startsWith('v1.')).toBe(true);
    expect(boxed).not.toContain('whsec_example');
    expect(decryptSecret(boxed)).toBe('whsec_example');
  });

  it('produces different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects tampered ciphertext', () => {
    const parts = encryptSecret('whsec_example').split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('rejects values that are not in the encrypted format', () => {
    expect(() => decryptSecret('plaintext-secret')).toThrow(/expected encrypted format/);
  });
});
