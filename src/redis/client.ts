import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../telemetry/logger';

/**
 * Shared Redis client. Redis is used for caching, rate limiting, and (later)
 * as the BullMQ backing store. It is NEVER a source of truth — losing Redis
 * degrades performance, never correctness.
 */
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on('error', (err) => {
  logger.warn({ err }, 'redis connection error');
});

/** Liveness check for the readiness probe. */
export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.warn({ err }, 'redis ping failed');
    return false;
  }
}
