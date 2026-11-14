/**
 * Wallets & double-entry ledger.
 *
 * Design decisions worth defending in an interview:
 *  - Money is BIGINT minor units (paise/cents). NEVER float — floats lose money.
 *  - wallets.version is the OPTIMISTIC LOCK: concurrent debits can't both win.
 *  - wallets.balance is a cached projection of the ledger for O(1) reads.
 *  - ledger_entries is APPEND-ONLY (no UPDATE/DELETE) → audit-grade history.
 *  - amount > 0 with an explicit direction; a transaction's entries sum to zero.
 */

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE wallets (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      currency   CHAR(3) NOT NULL DEFAULT 'INR',
      balance    BIGINT NOT NULL DEFAULT 0,   -- minor units
      version    BIGINT NOT NULL DEFAULT 0,   -- optimistic lock guard
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT balance_non_negative CHECK (balance >= 0)
    );
    CREATE INDEX idx_wallets_tenant ON wallets(tenant_id);

    CREATE TABLE transactions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,                 -- credit | debit | transfer
      status     TEXT NOT NULL DEFAULT 'posted',
      metadata   JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Append-only. Sum of entries for any transaction MUST be zero (double-entry).
    CREATE TABLE ledger_entries (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      transaction_id UUID NOT NULL REFERENCES transactions(id),
      wallet_id      UUID NOT NULL REFERENCES wallets(id),
      direction      TEXT NOT NULL CHECK (direction IN ('debit','credit')),
      amount         BIGINT NOT NULL CHECK (amount > 0),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS ledger_entries;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS wallets;
  `);
};
