import { pool } from '../../db/pool';
import { randomToken } from '../../shared/crypto';
import { secretBox } from '../../shared/secrets';

export async function createEndpoint(tenantId: string, url: string, secret?: string) {
  const signingSecret = secret ?? `whsec_${randomToken(24)}`;
  // Stored encrypted: HMAC signing needs the raw secret back, so it can't be
  // hashed like an API key, but a database dump alone must not expose it.
  const { rows } = await pool.query(
    `INSERT INTO webhook_endpoints (tenant_id, url, secret_ciphertext)
     VALUES ($1, $2, $3)
     RETURNING id, url, enabled, created_at`,
    [tenantId, url, secretBox.encrypt(signingSecret)],
  );
  // Return the secret ONCE so the caller can verify signatures.
  return { ...rows[0], secret: signingSecret };
}

export async function listEndpoints(tenantId: string) {
  const { rows } = await pool.query(
    `SELECT id, url, enabled, created_at FROM webhook_endpoints
     WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows;
}
