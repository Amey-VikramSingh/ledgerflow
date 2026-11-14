import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';
import { sha256 } from '../shared/crypto';
import { stableStringify } from '../shared/stable-stringify';
import { ValidationError, ConflictError, UnauthorizedError } from '../shared/errors';

/**
 * Idempotency-Key middleware for mutating endpoints.
 *
 *  - First request with a key: claim it via INSERT ... ON CONFLICT DO NOTHING.
 *    The UNIQUE(tenant_id, key) constraint — not app code — decides the winner.
 *    We capture the response and persist it on `finish`.
 *  - Duplicate with SAME body + completed  → replay the stored response.
 *  - Duplicate with DIFFERENT body          → 422 (key reused for another request).
 *  - Duplicate still in_progress            → 409 (concurrent; client retries).
 *
 * On a 5xx (transient) we RELEASE the key so the client can retry; 2xx/4xx are
 * deterministic and get cached.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  void run(req, res, next).catch(next);
}

async function run(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.header('Idempotency-Key');
  if (!key) {
    throw new ValidationError('Idempotency-Key header is required');
  }
  if (!req.user) throw new UnauthorizedError();
  const tenantId = req.user.tenantId;
  const requestHash = sha256(req.method + req.originalUrl + stableStringify(req.body));

  const claim = await pool.query(
    `INSERT INTO idempotency_keys (tenant_id, key, request_hash, status)
     VALUES ($1, $2, $3, 'in_progress')
     ON CONFLICT (tenant_id, key) DO NOTHING
     RETURNING id`,
    [tenantId, key, requestHash],
  );

  if (claim.rowCount === 0) {
    // Key already exists — inspect it.
    const existing = await pool.query<{
      request_hash: string;
      status: string;
      response_code: number | null;
      response_body: unknown;
    }>(
      `SELECT request_hash, status, response_code, response_body
       FROM idempotency_keys WHERE tenant_id = $1 AND key = $2`,
      [tenantId, key],
    );
    const row = existing.rows[0]!;
    if (row.request_hash !== requestHash) {
      throw new ValidationError('Idempotency-Key reused with a different request');
    }
    if (row.status === 'completed') {
      res.status(row.response_code ?? 200).json(row.response_body);
      return;
    }
    // still in_progress elsewhere
    throw new ConflictError('a request with this Idempotency-Key is in progress');
  }

  // We own the key. Capture the response body, persist on finish.
  const originalJson = res.json.bind(res);
  let capturedBody: unknown;
  res.json = (body: unknown) => {
    capturedBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const code = res.statusCode;
    if (code >= 500) {
      // transient failure → release the key so the client may retry
      void pool
        .query('DELETE FROM idempotency_keys WHERE tenant_id = $1 AND key = $2', [
          tenantId,
          key,
        ])
        .catch(() => undefined);
    } else {
      void pool
        .query(
          `UPDATE idempotency_keys
             SET status = 'completed', response_code = $1, response_body = $2,
                 completed_at = now()
           WHERE tenant_id = $3 AND key = $4`,
          [code, capturedBody === undefined ? null : JSON.stringify(capturedBody), tenantId, key],
        )
        .catch(() => undefined);
    }
  });

  next();
}
