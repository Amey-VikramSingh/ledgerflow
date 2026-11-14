import { Worker, type Job } from 'bullmq';
import { pool } from '../db/pool';
import { config } from '../config';
import { connection, WEBHOOK_QUEUE } from '../queue';
import { signWebhook, fetchWithTimeout } from '../shared/webhook';
import { secretBox } from '../shared/secrets';
import { withRemoteSpan } from '../telemetry/trace';
import { webhookDeliveries } from '../telemetry/metrics';
import { logger } from '../telemetry/logger';

interface DeliveryJob {
  deliveryId: string;
  _otel?: Record<string, string> | null;
}

/**
 * Delivers a single (event, endpoint) webhook. At-least-once: the status check
 * skips jobs already marked 'success', but if the receiver processed a request
 * whose response we never saw (e.g. timeout), it will be delivered again.
 * Receivers must deduplicate by event id.
 * Retries use BullMQ's exponential backoff; after the final attempt the job
 * lands in the failed set (DLQ) and the delivery row is marked 'dead'.
 */
export function startWebhookWorker(): Worker {
  const worker = new Worker<DeliveryJob>(
    WEBHOOK_QUEUE,
    async (job: Job<DeliveryJob>) =>
      withRemoteSpan('webhook.deliver', job.data._otel, async () => {
        const { deliveryId } = job.data;

        const { rows } = await pool.query<{
          status: string;
          payload: unknown;
          event_type: string;
          url: string;
          secret_ciphertext: string;
        }>(
          `SELECT d.status, e.payload, e.event_type, w.url, w.secret_ciphertext
           FROM webhook_deliveries d
           JOIN outbox_events e ON e.id = d.event_id
           JOIN webhook_endpoints w ON w.id = d.endpoint_id
           WHERE d.id = $1`,
          [deliveryId],
        );
        const del = rows[0];
        if (!del) return;
        if (del.status === 'success') return; // idempotent skip on duplicate job

        const body = JSON.stringify({ type: del.event_type, data: del.payload });
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = signWebhook(secretBox.decrypt(del.secret_ciphertext), timestamp, body);
        const attemptNo = job.attemptsMade + 1;

        try {
          const res = await fetchWithTimeout(
            del.url,
            {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'X-LedgerFlow-Signature': signature,
                'X-LedgerFlow-Timestamp': timestamp,
                'X-LedgerFlow-Event': del.event_type,
              },
              body,
            },
            config.WEBHOOK_TIMEOUT_MS,
          );

          if (res.status >= 200 && res.status < 300) {
            await pool.query(
              `UPDATE webhook_deliveries SET status = 'success', attempts = $1, response_code = $2 WHERE id = $3`,
              [attemptNo, res.status, deliveryId],
            );
            webhookDeliveries.inc({ status: 'success' });
            return;
          }
          throw new Error(`non-2xx response: ${res.status}`);
        } catch (err) {
          const isFinal = attemptNo >= config.WEBHOOK_MAX_ATTEMPTS;
          await pool.query(
            `UPDATE webhook_deliveries SET status = $1, attempts = $2 WHERE id = $3`,
            [isFinal ? 'dead' : 'failed', attemptNo, deliveryId],
          );
          webhookDeliveries.inc({ status: isFinal ? 'dead' : 'failed' });
          throw err; // let BullMQ apply backoff; final failure → DLQ
        }
      }),
    { connection, concurrency: 20 },
  );

  worker.on('failed', (job, err) => {
    logger.warn(
      { deliveryId: job?.data.deliveryId, attempts: job?.attemptsMade, err: err.message },
      'webhook delivery attempt failed',
    );
  });

  return worker;
}
