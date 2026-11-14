import client from 'prom-client';
import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: 'ledgerflow_' });

const httpDuration = new client.Histogram({
  name: 'ledgerflow_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const webhookDeliveries = new client.Counter({
  name: 'ledgerflow_webhook_deliveries_total',
  help: 'Webhook delivery outcomes',
  labelNames: ['status'],
  registers: [registry],
});

// Outbox lag computed on scrape — the canary for reliability.
new client.Gauge({
  name: 'ledgerflow_outbox_lag_seconds',
  help: 'Age of the oldest unpublished outbox event, in seconds',
  registers: [registry],
  async collect() {
    try {
      const { rows } = await pool.query(
        `SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at))), 0) AS lag
         FROM outbox_events WHERE status = 'pending'`,
      );
      this.set(Number(rows[0]?.lag ?? 0));
    } catch {
      /* leave previous value on error */
    }
  },
});

/** Express middleware: observe request duration by route + status. */
export function httpMetrics(req: Request, res: Response, next: NextFunction): void {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ?? req.baseUrl ?? req.path;
    end({ method: req.method, route, status: res.statusCode });
  });
  next();
}

export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
