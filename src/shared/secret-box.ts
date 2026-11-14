import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config';

/**
 * Encryption for secrets that must be recoverable (so they can't be hashed),
 * such as webhook HMAC signing secrets. A database dump or a leaked backup
 * then exposes ciphertext only; the key lives in the environment.
 *
 * Format: `v1.<iv>.<auth tag>.<ciphertext>` (base64url parts), AES-256-GCM.
 * The version prefix leaves room for key rotation later.
 */
const VERSION = 'v1';
const key = Buffer.from(config.SECRETS_ENCRYPTION_KEY, 'base64');

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function decryptSecret(boxed: string): string {
  const [version, iv, tag, ciphertext] = boxed.split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error('secret is not in the expected encrypted format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
