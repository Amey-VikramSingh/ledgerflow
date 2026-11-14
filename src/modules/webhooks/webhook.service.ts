import { pool } from '../../db/pool';
import { randomToken } from '../../shared/crypto';

export async function createEndpoint(tenantId: string, url: string, secret?: string) {
  const signingSecret = secret ?? `whsec_${randomToken(24)}`;
  const { rows } = await pool.query(
    `INSERT INTO webhook_endpoints (tenant_id, url, secret)
     VALUES ($1, $2, $3)
     RETURNING id, url, enabled, created_at`,
    [tenantId, url, signingSecret],
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
