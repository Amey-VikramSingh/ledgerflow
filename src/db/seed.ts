import { pool } from './pool';
import { logger } from '../telemetry/logger';
import { secretBox } from '../shared/secrets';

/**
 * Dev seed. Fixed UUIDs + ON CONFLICT → safe to run repeatedly.
 * The user's password_hash is a placeholder (not a valid argon2 hash), so
 * this user can't log in — register through /auth/register for that.
 * This exists so there is data to query and the FK graph is exercised.
 *
 * The opening balance is a real double-entry transaction (credit the user
 * wallet, debit the tenant's system wallet), so the ledger invariant
 * `wallet.balance == sum(entries)` holds from the very first row.
 */
const TENANT = '00000000-0000-0000-0000-000000000001';
const USER = '00000000-0000-0000-0000-000000000002';
const WALLET = '00000000-0000-0000-0000-000000000003';
const ENDPOINT = '00000000-0000-0000-0000-000000000004';
const SYSTEM_WALLET = '00000000-0000-0000-0000-000000000005';
const OPENING_TXN = '00000000-0000-0000-0000-000000000006';

// ₹1,000.00 starting balance, stored as 100000 paise.
const OPENING_BALANCE = 100000;

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
      [USER, TENANT, 'owner@acme.test', 'SEED_PLACEHOLDER_not_a_real_hash'],
    );

    await client.query(
      `INSERT INTO wallets (id, tenant_id, currency, kind)
       VALUES ($1, $3, 'INR', 'user'), ($2, $3, 'INR', 'system')
       ON CONFLICT (id) DO NOTHING`,
      [WALLET, SYSTEM_WALLET, TENANT],
    );

    // Post the opening balance once. If the transaction row already exists the
    // entries exist too (same DB transaction), so there is nothing to do.
    const opening = await client.query(
      `INSERT INTO transactions (id, tenant_id, type, status, metadata)
       VALUES ($1, $2, 'credit', 'posted', '{"reason":"seed opening balance"}')
       ON CONFLICT (id) DO NOTHING`,
      [OPENING_TXN, TENANT],
    );
    if (opening.rowCount === 1) {
      await client.query(
        `INSERT INTO ledger_entries (tenant_id, transaction_id, wallet_id, direction, amount)
         VALUES ($1, $2, $3, 'credit', $5), ($1, $2, $4, 'debit', $5)`,
        [TENANT, OPENING_TXN, WALLET, SYSTEM_WALLET, OPENING_BALANCE],
      );
      // Derive the cached balances from the ledger rather than hard-coding them.
      await client.query(
        `UPDATE wallets w
            SET balance = (
                  SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN amount ELSE -amount END), 0)
                    FROM ledger_entries le
                   WHERE le.wallet_id = w.id
                ),
                version = version + 1
          WHERE w.id IN ($1, $2)`,
        [WALLET, SYSTEM_WALLET],
      );
    }

    // Upsert so an endpoint seeded before secrets were encrypted gets fixed.
    await client.query(
      `INSERT INTO webhook_endpoints (id, tenant_id, url, secret_ciphertext)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext`,
      [ENDPOINT, TENANT, 'https://webhook.site/replace-me', secretBox.encrypt('whsec_seed_secret')],
    );

    await client.query('COMMIT');
    logger.info({ tenant: TENANT, wallet: WALLET }, 'seed complete');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err: unknown) => {
    logger.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
