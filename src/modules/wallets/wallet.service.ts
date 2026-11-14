import { pool } from '../../db/pool';
import { remember, walletCacheKey } from '../../redis/cache';
import { config } from '../../config';

// Only `kind = 'user'` wallets are exposed through the API. System wallets are
// internal double-entry counter-accounts (see docs/schema.md) and are
// normally negative, so they must never show up as a customer's wallet.

export async function createWallet(tenantId: string, currency: string) {
  const { rows } = await pool.query(
    `INSERT INTO wallets (tenant_id, currency, kind) VALUES ($1, $2, 'user')
     RETURNING id, currency, balance, version, created_at`,
    [tenantId, currency],
  );
  return rows[0];
}

/**
 * Tenant-scoped read with cache-aside. Cache key includes tenant_id so one
 * tenant can never read another's wallet from cache. Invalidated on transfer.
 */
export async function getWallet(tenantId: string, id: string) {
  return remember(walletCacheKey(tenantId, id), config.CACHE_TTL_SECONDS, async () => {
    const { rows } = await pool.query(
      `SELECT id, currency, balance, version, created_at
       FROM wallets WHERE id = $1 AND tenant_id = $2 AND kind = 'user'`,
      [id, tenantId],
    );
    return rows[0] ?? null;
  });
}

export async function listWallets(
  tenantId: string,
  opts: { limit: number; cursor?: { ts: string; id: string } },
) {
  const params: unknown[] = [tenantId];
  let where = `tenant_id = $1 AND kind = 'user'`;
  if (opts.cursor) {
    params.push(opts.cursor.ts, opts.cursor.id);
    where += ` AND (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  params.push(opts.limit + 1);
  const { rows } = await pool.query(
    `SELECT id, currency, balance, version, created_at FROM wallets
     WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}
