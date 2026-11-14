import { redis } from './client';
import { config } from '../config';

/**
 * Cache-aside helpers. Redis is a disposable read accelerator — a miss just
 * falls through to the source of truth. `remember` adds a short single-flight
 * lock so a hot key expiring doesn't stampede the database.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function cacheSet(key: string, value: unknown, ttl = config.CACHE_TTL_SECONDS): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttl);
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length) await redis.del(...keys);
}

/**
 * Read-through with stampede protection: on miss, one caller acquires a lock
 * and loads; others briefly wait and re-read the cache.
 */
export async function remember<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T | null>,
): Promise<T | null> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const lockKey = `${key}:lock`;
  const gotLock = await redis.set(lockKey, '1', 'EX', 5, 'NX');
  if (!gotLock) {
    // someone else is loading — wait briefly, then read whatever they set
    await new Promise((r) => setTimeout(r, 50));
    const retry = await cacheGet<T>(key);
    if (retry !== null) return retry;
  }
  try {
    const value = await loader();
    if (value !== null) await cacheSet(key, value, ttl);
    return value;
  } finally {
    await redis.del(lockKey);
  }
}

export const walletCacheKey = (tenantId: string, id: string) => `cache:wallet:${tenantId}:${id}`;
