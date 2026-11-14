/**
 * Integrity hardening. Moves rules that were only comments into the database,
 * so a bug in application code cannot silently corrupt the ledger.
 *
 *  1. Allowed values for every status/role/type column (CHECK constraints).
 *  2. System wallets: the counter-account for money entering/leaving the
 *     system. A deposit credits the user wallet and debits the tenant's
 *     system wallet, so every transaction still sums to zero. Only system
 *     wallets may go negative.
 *  3. Tenant isolation on the ledger: ledger_entries carries tenant_id and
 *     composite FKs guarantee an entry, its transaction and its wallet all
 *     belong to the same tenant.
 *  4. Double-entry enforced: a deferred constraint trigger rejects a commit
 *     that leaves any transaction's credits != debits.
 *  5. Append-only enforced: UPDATE/DELETE/TRUNCATE on ledger_entries raise.
 *  6. Deleting a tenant no longer cascades into wallets/transactions.
 *  7. Missing indexes for known query paths.
 *  8. webhook_deliveries no longer blocks pruning of published outbox rows.
 *  9. Webhook signing secrets are stored encrypted (see src/shared/secret-box.ts).
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Allowed values ------------------------------------------------------
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_status_check CHECK (status IN ('active','suspended'));
    ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role IN ('owner','admin','member','viewer'));
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_type_check CHECK (type IN ('credit','debit','transfer')),
      ADD CONSTRAINT transactions_status_check CHECK (status IN ('pending','posted','reversed'));
    ALTER TABLE idempotency_keys
      ADD CONSTRAINT idempotency_keys_status_check CHECK (status IN ('in_progress','completed'));
    ALTER TABLE outbox_events
      ADD CONSTRAINT outbox_events_status_check CHECK (status IN ('pending','published'));
    ALTER TABLE webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_status_check
        CHECK (status IN ('pending','success','failed','dead'));
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_currency_check CHECK (currency ~ '^[A-Z]{3}$');

    -- 2. System wallets ------------------------------------------------------
    ALTER TABLE wallets
      ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'
        CONSTRAINT wallets_kind_check CHECK (kind IN ('user','system'));
    ALTER TABLE wallets DROP CONSTRAINT balance_non_negative;
    ALTER TABLE wallets
      ADD CONSTRAINT balance_non_negative CHECK (kind = 'system' OR balance >= 0);
    -- At most one system wallet per tenant per currency.
    CREATE UNIQUE INDEX uq_wallets_system ON wallets(tenant_id, currency)
      WHERE kind = 'system';

    -- 3. Tenant isolation on the ledger --------------------------------------
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_tenant_id_id_key UNIQUE (tenant_id, id);
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_tenant_id_id_key UNIQUE (tenant_id, id);

    ALTER TABLE ledger_entries ADD COLUMN tenant_id UUID;
    UPDATE ledger_entries le
       SET tenant_id = t.tenant_id
      FROM transactions t
     WHERE t.id = le.transaction_id;
    ALTER TABLE ledger_entries ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE ledger_entries
      ADD CONSTRAINT ledger_entries_tenant_transaction_fkey
        FOREIGN KEY (tenant_id, transaction_id) REFERENCES transactions(tenant_id, id),
      ADD CONSTRAINT ledger_entries_tenant_wallet_fkey
        FOREIGN KEY (tenant_id, wallet_id) REFERENCES wallets(tenant_id, id);

    -- 4. Double-entry: credits must equal debits per transaction -------------
    -- Deferred to COMMIT so a transaction's entries can be inserted one by one.
    CREATE FUNCTION ledger_assert_balanced() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    DECLARE
      diff NUMERIC;
    BEGIN
      SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN amount ELSE -amount END), 0)
        INTO diff
        FROM ledger_entries
       WHERE transaction_id = NEW.transaction_id;
      IF diff <> 0 THEN
        RAISE EXCEPTION 'transaction % is unbalanced (credits - debits = %)',
          NEW.transaction_id, diff
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NULL;
    END
    $fn$;

    CREATE CONSTRAINT TRIGGER trg_ledger_entries_balanced
      AFTER INSERT ON ledger_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION ledger_assert_balanced();

    -- 5. Append-only ---------------------------------------------------------
    CREATE FUNCTION ledger_entries_append_only() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      RAISE EXCEPTION 'ledger_entries is append-only (% is not allowed)', TG_OP
        USING ERRCODE = 'restrict_violation';
    END
    $fn$;

    CREATE TRIGGER trg_ledger_entries_no_update_delete
      BEFORE UPDATE OR DELETE ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();
    CREATE TRIGGER trg_ledger_entries_no_truncate
      BEFORE TRUNCATE ON ledger_entries
      FOR EACH STATEMENT EXECUTE FUNCTION ledger_entries_append_only();

    -- 6. Deleting a tenant must not silently delete financial records --------
    ALTER TABLE wallets DROP CONSTRAINT wallets_tenant_id_fkey;
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
    ALTER TABLE transactions DROP CONSTRAINT transactions_tenant_id_fkey;
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;

    -- 7. Indexes -------------------------------------------------------------
    CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
    CREATE INDEX idx_transactions_tenant_created ON transactions(tenant_id, created_at DESC);
    CREATE INDEX idx_rt_user ON refresh_tokens(user_id);

    -- 8. Let published outbox rows be pruned ---------------------------------
    -- event_id stays as a plain reference; delivery history outlives the event.
    ALTER TABLE webhook_deliveries DROP CONSTRAINT webhook_deliveries_event_id_fkey;

    -- 9. Webhook secrets encrypted at rest -----------------------------------
    -- Rows written before this migration hold plaintext and must be re-saved
    -- through the application (the dev seed does this). NOT VALID enforces the
    -- format for every new or updated row without failing on old ones.
    ALTER TABLE webhook_endpoints RENAME COLUMN secret TO secret_ciphertext;
    ALTER TABLE webhook_endpoints
      ADD CONSTRAINT webhook_endpoints_secret_encrypted
        CHECK (secret_ciphertext LIKE 'v1.%') NOT VALID;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE webhook_endpoints DROP CONSTRAINT webhook_endpoints_secret_encrypted;
    ALTER TABLE webhook_endpoints RENAME COLUMN secret_ciphertext TO secret;

    ALTER TABLE webhook_deliveries
      ADD CONSTRAINT webhook_deliveries_event_id_fkey
        FOREIGN KEY (event_id) REFERENCES outbox_events(id) NOT VALID;

    DROP INDEX idx_rt_user;
    DROP INDEX idx_transactions_tenant_created;
    DROP INDEX idx_ledger_transaction;

    ALTER TABLE transactions DROP CONSTRAINT transactions_tenant_id_fkey;
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    ALTER TABLE wallets DROP CONSTRAINT wallets_tenant_id_fkey;
    ALTER TABLE wallets
      ADD CONSTRAINT wallets_tenant_id_fkey
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

    DROP TRIGGER trg_ledger_entries_no_truncate ON ledger_entries;
    DROP TRIGGER trg_ledger_entries_no_update_delete ON ledger_entries;
    DROP FUNCTION ledger_entries_append_only();
    DROP TRIGGER trg_ledger_entries_balanced ON ledger_entries;
    DROP FUNCTION ledger_assert_balanced();

    ALTER TABLE ledger_entries
      DROP CONSTRAINT ledger_entries_tenant_wallet_fkey,
      DROP CONSTRAINT ledger_entries_tenant_transaction_fkey;
    ALTER TABLE ledger_entries DROP COLUMN tenant_id;
    ALTER TABLE transactions DROP CONSTRAINT transactions_tenant_id_id_key;
    ALTER TABLE wallets DROP CONSTRAINT wallets_tenant_id_id_key;

    -- System wallets are normally negative (they mirror money brought into
    -- the system), so the old "no wallet below zero" rule is restored NOT
    -- VALID: it applies to new and updated rows but does not fail the
    -- rollback on existing system wallets.
    DROP INDEX uq_wallets_system;
    ALTER TABLE wallets DROP CONSTRAINT balance_non_negative;
    ALTER TABLE wallets ADD CONSTRAINT balance_non_negative CHECK (balance >= 0) NOT VALID;
    ALTER TABLE wallets DROP COLUMN kind;

    ALTER TABLE wallets DROP CONSTRAINT wallets_currency_check;
    ALTER TABLE webhook_deliveries DROP CONSTRAINT webhook_deliveries_status_check;
    ALTER TABLE outbox_events DROP CONSTRAINT outbox_events_status_check;
    ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_status_check;
    ALTER TABLE transactions
      DROP CONSTRAINT transactions_status_check,
      DROP CONSTRAINT transactions_type_check;
    ALTER TABLE users DROP CONSTRAINT users_role_check;
    ALTER TABLE tenants DROP CONSTRAINT tenants_status_check;
  `);
};
