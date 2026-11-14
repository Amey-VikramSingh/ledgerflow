import { pool } from './pool';
import { logger } from '../telemetry/logger';
import { secretBox } from '../shared/secrets';

/**
 * One-off upgrade step for databases created before webhook secrets were
 * encrypted (migration 1700000000006_integrity-hardening).
 *
 * That migration renames `secret` to `secret_ciphertext` but cannot encrypt
 * existing values itself, because the key lives in the environment, not in
 * the database. Until this runs, those endpoints can't be signed, and their
 * deliveries fail. Run once after migrating:
 *
 *   npm run migrate:up && npm run secrets:encrypt
 *
 * Safe to run repeatedly: rows already in the encrypted format are skipped.
 */
async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; secret_ciphertext: string }>(
      `SELECT id, secret_ciphertext FROM webhook_endpoints
        WHERE secret_ciphertext NOT LIKE 'v1.%'
        FOR UPDATE`,
    );
    for (const row of rows) {
      await client.query(`UPDATE webhook_endpoints SET secret_ciphertext = $1 WHERE id = $2`, [
        secretBox.encrypt(row.secret_ciphertext),
        row.id,
      ]);
    }
    // Every row is now encrypted, so the format check can cover old rows too.
    await client.query(
      `ALTER TABLE webhook_endpoints VALIDATE CONSTRAINT webhook_endpoints_secret_encrypted`,
    );
    await client.query('COMMIT');
    logger.info({ encrypted: rows.length }, 'webhook secrets encrypted');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err: unknown) => {
    logger.error({ err }, 'encrypting webhook secrets failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
