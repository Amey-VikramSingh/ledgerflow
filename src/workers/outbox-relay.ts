import { pool } from '../db/pool';
import { webhookQueue } from '../queue';

/**
 * Outbox relay. Claims pending events with FOR UPDATE SKIP LOCKED so multiple
 * relay instances can run concurrently without publishing an event twice.
 *
 * Ordering matters for crash-safety: we enqueue the delivery jobs BEFORE
 * marking events published, all inside one txn. If enqueue fails, we roll back
 * and the event stays pending (retried later). If we crash after enqueue but
 * before commit, the next run re-processes the event — harmless because the
 * webhook worker is idempotent (UNIQUE(event_id,endpoint_id) + status check).
 *
 * Returns the number of events relayed (for logging/metrics).
 */
export async function runOutboxRelayOnce(batchSize = 50): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const events = await client.query<{ id: string; tenant_id: string; trace_context: Record<string, string> | null }>(
      `SELECT id, tenant_id, trace_context FROM outbox_events
       WHERE status = 'pending'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [batchSize],
    );

    if (events.rowCount === 0) {
      await client.query('COMMIT');
      return 0;
    }

    const jobs: Array<{
      name: string;
      data: { deliveryId: string; _otel: Record<string, string> | null };
    }> = [];

    for (const ev of events.rows) {
      const endpoints = await client.query<{ id: string }>(
        `SELECT id FROM webhook_endpoints WHERE tenant_id = $1 AND enabled = true`,
        [ev.tenant_id],
      );
      for (const ep of endpoints.rows) {
        const del = await client.query<{ id: string }>(
          `INSERT INTO webhook_deliveries (event_id, endpoint_id)
           VALUES ($1, $2)
           ON CONFLICT (event_id, endpoint_id) DO NOTHING
           RETURNING id`,
          [ev.id, ep.id],
        );
        if (del.rowCount === 1) {
          jobs.push({
            name: 'deliver',
            data: { deliveryId: del.rows[0]!.id, _otel: ev.trace_context },
          });
        }
      }
    }

    if (jobs.length > 0) {
      await webhookQueue.addBulk(jobs); // enqueue BEFORE marking published
    }

    await client.query(
      `UPDATE outbox_events SET status = 'published', published_at = now()
       WHERE id = ANY($1)`,
      [events.rows.map((e) => e.id)],
    );

    await client.query('COMMIT');
    return events.rowCount ?? 0;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* already closed */
    }
    throw err;
  } finally {
    client.release();
  }
}
