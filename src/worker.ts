import './telemetry/otel'; // must be first — patches libraries on load
import http from 'node:http';
import { config } from './config';
import { logger } from './telemetry/logger';
import { pool } from './db/pool';
import { webhookQueue } from './queue';
import { runOutboxRelayOnce } from './workers/outbox-relay';
import { startWebhookWorker } from './workers/webhook-delivery';
import { registry } from './telemetry/metrics';

// Expose /metrics for Prometheus to scrape the worker process.
const metricsServer = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    void registry.metrics().then((m) => {
      res.setHeader('Content-Type', registry.contentType);
      res.end(m);
    });
  } else {
    res.statusCode = 404;
    res.end();
  }
});
metricsServer.listen(config.METRICS_PORT);

/**
 * Worker process — separate from the API so a webhook spike never degrades
 * API latency. Runs the outbox relay on an interval and the BullMQ delivery
 * worker.
 */
const webhookWorker = startWebhookWorker();
let relayTimer: NodeJS.Timeout | undefined;
let stopping = false;

async function relayLoop(): Promise<void> {
  if (stopping) return;
  try {
    const n = await runOutboxRelayOnce();
    if (n > 0) logger.info({ relayed: n }, 'outbox events relayed');
  } catch (err) {
    logger.error({ err }, 'outbox relay error');
  }
  if (!stopping) {
    relayTimer = setTimeout(() => void relayLoop(), config.OUTBOX_POLL_INTERVAL_MS);
  }
}

void relayLoop();
logger.info('ledgerflow worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutdown initiated');
  stopping = true;
  if (relayTimer) clearTimeout(relayTimer);
  const force = setTimeout(() => process.exit(1), config.SHUTDOWN_TIMEOUT_MS);
  force.unref();
  try {
    await webhookWorker.close();
    await webhookQueue.close();
    await pool.end();
    logger.info('worker clean shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during worker shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
