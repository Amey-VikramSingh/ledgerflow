/**
 * Webhook delivery tables.
 *  - webhook_endpoints: per-tenant destinations with an HMAC signing secret.
 *  - webhook_deliveries: UNIQUE(event_id, endpoint_id) makes redelivery
 *    idempotent on OUR side — a retried relay can't create duplicate delivery
 *    rows. The HTTP delivery itself is still at-least-once; receivers must
 *    deduplicate by event id (see docs/schema.md).
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE webhook_endpoints (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      url        TEXT NOT NULL,
      secret     TEXT NOT NULL,             -- HMAC signing secret
      enabled    BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_id);

    CREATE TABLE webhook_deliveries (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      event_id      BIGINT NOT NULL REFERENCES outbox_events(id),
      endpoint_id   UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      status        TEXT NOT NULL DEFAULT 'pending', -- pending | success | failed | dead
      attempts      INT NOT NULL DEFAULT 0,
      response_code INT,
      next_retry_at TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, endpoint_id)
    );
    -- The delivery worker claims due retries via this index.
    CREATE INDEX idx_deliveries_due ON webhook_deliveries(next_retry_at)
      WHERE status IN ('pending','failed');
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS webhook_deliveries;
    DROP TABLE IF EXISTS webhook_endpoints;
  `);
};
