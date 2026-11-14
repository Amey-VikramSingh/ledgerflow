import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Password hashing uses argon2id — memory-hard, the current standard for
 * password storage. @node-rs/argon2 ships prebuilt binaries (no native
 * compile), which matters on Windows.
 *
 * Passwords are hashed with argon2 (slow, salted, per-password).
 * Tokens/API keys are hashed with sha256 (fast) because they are already
 * high-entropy random values — they don't need a slow KDF, and we need
 * fast lookups by hash.
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain); // argon2id by default
}

export function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  return verify(hashed, plain);
}

/** Deterministic hash for opaque tokens (refresh tokens, API keys). */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically-random, URL-safe opaque token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
