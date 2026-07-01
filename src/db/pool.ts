import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../telemetry/logger';

/**
 * A single shared connection pool for the process. Never open ad-hoc clients.
 * Pool sizing matters under load (Day 8+); the default (max 10) is fine for now.
 */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected postgres pool error');
});

/** Liveness check for a dependency — used by the readiness probe. */
export async function pingDb(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  } catch (err) {
    logger.warn({ err }, 'postgres ping failed');
    return false;
  }
}
