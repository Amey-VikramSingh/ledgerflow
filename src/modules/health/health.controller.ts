import type { Request, Response } from 'express';
import { pingDb } from '../../db/pool';
import { pingRedis } from '../../redis/client';

/**
 * Liveness: "is the process up?" — no dependency checks. Used by the
 * orchestrator to decide whether to RESTART the container.
 */
export function live(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}

/**
 * Readiness: "can this instance serve traffic?" — checks dependencies.
 * Returns 503 if Postgres or Redis is unreachable, so the load balancer
 * stops routing to this instance until it recovers. Restart vs. route
 * are different decisions — that's why liveness and readiness are separate.
 */
export async function ready(_req: Request, res: Response): Promise<void> {
  const [db, cache] = await Promise.all([pingDb(), pingRedis()]);
  const healthy = db && cache;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks: { postgres: db ? 'up' : 'down', redis: cache ? 'up' : 'down' },
  });
}
