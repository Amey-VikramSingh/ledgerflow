import { pool } from './pool';
import { logger } from '../telemetry/logger';

/**
 * Dev seed. Fixed UUIDs + ON CONFLICT DO NOTHING → safe to run repeatedly.
 * The user's password_hash is a placeholder; Day 3 replaces it with a real
 * argon2id hash via the register endpoint. This exists so Day 3+ has data
 * to query and the FK graph is exercised end to end.
 */
const TENANT = '00000000-0000-0000-0000-000000000001';
const USER = '00000000-0000-0000-0000-000000000002';
const WALLET = '00000000-0000-0000-0000-000000000003';
const ENDPOINT = '00000000-0000-0000-0000-000000000004';

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tenants (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, 'Acme Corp'],
    );

    await client.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, role, email_verified)
       VALUES ($1, $2, $3, $4, 'owner', true)
       ON CONFLICT (id) DO NOTHING`,
      [USER, TENANT, 'owner@acme.test', 'SEED_PLACEHOLDER_replaced_on_day3'],
    );

    // ₹1,000.00 starting balance, stored as 100000 paise.
    await client.query(
      `INSERT INTO wallets (id, tenant_id, currency, balance)
       VALUES ($1, $2, 'INR', 100000)
       ON CONFLICT (id) DO NOTHING`,
      [WALLET, TENANT],
    );

    await client.query(
      `INSERT INTO webhook_endpoints (id, tenant_id, url, secret)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [ENDPOINT, TENANT, 'https://webhook.site/replace-me', 'whsec_seed_secret'],
    );

    await client.query('COMMIT');
    logger.info({ tenant: TENANT, wallet: WALLET }, 'seed complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
}

seed().catch((err) => {
  logger.error({ err }, 'seed failed');
  process.exit(1);
});
