import { pool } from '../../db/pool';
import { cacheDel, walletCacheKey } from '../../redis/cache';
import { injectTraceContext } from '../../telemetry/trace';
import {
  NotFoundError,
  ValidationError,
  InsufficientFundsError,
  ConflictError,
} from '../../shared/errors';

const MAX_RETRIES = 3;

export interface TransferInput {
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number; // minor units, positive integer
  metadata?: Record<string, unknown>;
}

export interface PostedTransfer {
  id: string;
  status: 'posted';
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency: string;
}

/**
 * Post a wallet-to-wallet transfer. Four guarantees hold together here:
 *
 *  1. DOUBLE-ENTRY: one debit + one credit of equal amount → entries sum to 0.
 *  2. OPTIMISTIC LOCKING: each wallet update is guarded by `version = $expected`.
 *     If a concurrent txn moved first, rowCount is 0 → we roll back and retry
 *     with a fresh read. No pessimistic row locks, so hot wallets stay fast.
 *  3. NO OVERSELL: the debit update also guards `balance + delta >= 0`, backed
 *     by the balance_non_negative CHECK constraint.
 *  4. TRANSACTIONAL OUTBOX: the `transaction.posted` event is written in the
 *     SAME db transaction as the money movement — no dual-write gap.
 *
 * Wallet updates are applied in canonical (sorted-by-id) order so two
 * concurrent transfers touching the same pair can't deadlock.
 */
export async function postTransfer(
  tenantId: string,
  input: TransferInput,
): Promise<PostedTransfer> {
  if (input.from_wallet_id === input.to_wallet_id) {
    throw new ValidationError('cannot transfer to the same wallet');
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const w = await client.query<{
        id: string;
        balance: string;
        version: string;
        currency: string;
      }>(
        // System wallets are internal counter-accounts (see docs/schema.md);
        // they are never a valid source or destination for a user transfer.
        `SELECT id, balance, version, currency FROM wallets
         WHERE id = ANY($1) AND tenant_id = $2 AND kind = 'user'`,
        [[input.from_wallet_id, input.to_wallet_id], tenantId],
      );

      const from = w.rows.find((r) => r.id === input.from_wallet_id);
      const to = w.rows.find((r) => r.id === input.to_wallet_id);
      if (!from || !to) {
        await client.query('ROLLBACK');
        throw new NotFoundError('wallet not found in this tenant');
      }
      if (from.currency !== to.currency) {
        await client.query('ROLLBACK');
        throw new ValidationError('currency mismatch between wallets');
      }
      if (BigInt(from.balance) < BigInt(input.amount)) {
        await client.query('ROLLBACK');
        throw new InsufficientFundsError();
      }

      const tx = await client.query<{ id: string }>(
        `INSERT INTO transactions (tenant_id, type, metadata)
         VALUES ($1, 'transfer', $2) RETURNING id`,
        [tenantId, input.metadata ?? {}],
      );
      const txId = tx.rows[0]!.id;

      await client.query(
        `INSERT INTO ledger_entries (tenant_id, transaction_id, wallet_id, direction, amount)
         VALUES ($5, $1, $2, 'debit', $3), ($5, $1, $4, 'credit', $3)`,
        [txId, from.id, input.amount, to.id, tenantId],
      );

      // Optimistic, deadlock-safe (canonical order): update lower id first.
      const updates = [
        { id: from.id, delta: -input.amount, version: from.version },
        { id: to.id, delta: input.amount, version: to.version },
      ].sort((a, b) => (a.id < b.id ? -1 : 1));

      let conflict = false;
      for (const u of updates) {
        const r = await client.query(
          `UPDATE wallets
             SET balance = balance + ($1)::bigint, version = version + 1
           WHERE id = $2 AND version = $3 AND balance + ($1)::bigint >= 0`,
          [u.delta.toString(), u.id, u.version],
        );
        if (r.rowCount !== 1) {
          conflict = true;
          break;
        }
      }

      if (conflict) {
        await client.query('ROLLBACK');
        continue; // version changed under us → retry with a fresh read
      }

      // Transactional outbox: event committed atomically with the money move.
      // Store the request's trace context so the eventual webhook delivery
      // continues the same distributed trace end-to-end.
      await client.query(
        `INSERT INTO outbox_events (tenant_id, aggregate, event_type, payload, trace_context)
         VALUES ($1, 'transaction', 'transaction.posted', $2, $3)`,
        [
          tenantId,
          JSON.stringify({
            transaction_id: txId,
            from_wallet_id: from.id,
            to_wallet_id: to.id,
            amount: input.amount,
            currency: from.currency,
          }),
          JSON.stringify(injectTraceContext()),
        ],
      );

      await client.query('COMMIT');

      // Invalidate cached balances for both wallets (best-effort).
      void cacheDel(
        walletCacheKey(tenantId, from.id),
        walletCacheKey(tenantId, to.id),
      ).catch(() => undefined);

      return {
        id: txId,
        status: 'posted',
        from_wallet_id: from.id,
        to_wallet_id: to.id,
        amount: input.amount,
        currency: from.currency,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* txn already closed */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  throw new ConflictError('transaction conflicted with concurrent updates; retry');
}

export async function getTransaction(tenantId: string, id: string) {
  const tx = await pool.query(
    `SELECT id, type, status, metadata, created_at FROM transactions
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (tx.rowCount === 0) return null;
  const entries = await pool.query(
    `SELECT wallet_id, direction, amount FROM ledger_entries
     WHERE transaction_id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return { ...tx.rows[0], entries: entries.rows };
}

export interface ListTransactionsOpts {
  limit: number;
  cursor?: { ts: string; id: string };
  type?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
}

/** Cursor-paginated, filterable transaction list (newest first). */
export async function listTransactions(tenantId: string, opts: ListTransactionsOpts) {
  const params: unknown[] = [tenantId];
  const clauses = ['tenant_id = $1'];

  if (opts.type) {
    params.push(opts.type);
    clauses.push(`type = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    clauses.push(`status = $${params.length}`);
  }
  if (opts.from_date) {
    params.push(opts.from_date);
    clauses.push(`created_at >= $${params.length}`);
  }
  if (opts.to_date) {
    params.push(opts.to_date);
    clauses.push(`created_at <= $${params.length}`);
  }
  if (opts.cursor) {
    params.push(opts.cursor.ts, opts.cursor.id);
    clauses.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
  }
  params.push(opts.limit + 1);

  const { rows } = await pool.query(
    `SELECT id, type, status, metadata, created_at FROM transactions
     WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}
