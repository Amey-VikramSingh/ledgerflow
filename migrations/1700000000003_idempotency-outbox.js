/* eslint-disable camelcase */

/**
 * Idempotency (ingress guarantee) + transactional outbox (egress guarantee).
 *
 *  - idempotency_keys: UNIQUE(tenant_id, key) is the concurrency primitive.
 *    The DB — not app code — arbitrates which duplicate request wins.
 *  - outbox_events: written in the SAME transaction as the business change,
 *    then shipped by a relay. Partial index keeps the relay's hot query tiny.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE idempotency_keys (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      key           TEXT NOT NULL,
      request_hash  TEXT NOT NULL,          -- sha256(method+path+body)
      status        TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
      response_code INT,
      response_body JSONB,
      locked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at  TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
      UNIQUE (tenant_id, key)
    );
    -- Cleanup job (later) prunes expired keys efficiently.
    CREATE INDEX idx_idem_expires ON idempotency_keys(expires_at);

    CREATE TABLE outbox_events (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      tenant_id    UUID NOT NULL,
      aggregate    TEXT NOT NULL,           -- 'transaction' | 'wallet'
      event_type   TEXT NOT NULL,           -- 'transaction.posted'
      payload      JSONB NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending', -- pending | published
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ
    );
    -- Partial index: the relay only ever scans unpublished rows, so this stays
    -- tiny and fast even when the table holds millions of published events.
    CREATE INDEX idx_outbox_pending ON outbox_events(created_at)
      WHERE status = 'pending';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS outbox_events;
    DROP TABLE IF EXISTS idempotency_keys;
  `);
};
