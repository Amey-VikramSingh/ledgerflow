# Schema (Day 2)

All money is `BIGINT` **minor units** (paise/cents). Never float. All timestamps `TIMESTAMPTZ`.

## Tables

| Table | Purpose | Key design point |
|---|---|---|
| `tenants` | multi-tenant root | everything scopes to a tenant |
| `users` | dashboard identity | `UNIQUE(tenant_id, email)` — email unique *within* a tenant |
| `api_keys` | programmatic auth | store `sha256(key)`, never the raw key |
| `refresh_tokens` | session rotation | `family_id` + `rotated` enable reuse detection (Day 4) |
| `wallets` | balance holder | `version` = optimistic lock; `balance` = cached ledger projection; `kind` = `user` \| `system` |
| `transactions` | logical money movement | groups ledger entries |
| `ledger_entries` | double-entry lines | **append-only** and **balanced**, both enforced by triggers |
| `idempotency_keys` | ingress dedupe | `UNIQUE(tenant_id, key)` is the concurrency primitive |
| `outbox_events` | reliable events | written in the business txn; partial index on `pending` |
| `webhook_endpoints` | delivery targets | per-tenant HMAC secret, encrypted at rest |
| `webhook_deliveries` | delivery attempts | `UNIQUE(event_id, endpoint_id)` = one delivery record per event per endpoint |

## Why these choices (interview-ready)

- **Money as `BIGINT`** — floating point can't represent 0.10 exactly; a ledger that loses fractions of a cent is a broken ledger. Note that the `pg` driver returns `BIGINT` as a string; convert with `BigInt`, never `Number`.
- **`wallets.version`** — the optimistic-lock guard. A debit does `UPDATE ... SET version = version + 1 WHERE id = $id AND version = $expected`. Two concurrent debits can't both match `$expected`, so one retries. No oversell without pessimistic row locks.
- **Cached `balance`** — reading the balance is O(1) instead of summing the whole ledger. The ledger remains the source of truth; a reconciliation job (later) asserts `balance == sum(entries)`. The dev seed already respects this: the opening balance is a real transaction, not a hard-coded number.
- **`UNIQUE(tenant_id, key)` on idempotency** — the database, not application code, decides which duplicate request wins the insert. Concurrency correctness lives in the constraint.
- **Partial index `WHERE status = 'pending'`** on outbox — the relay's hot query (`SELECT ... WHERE status='pending'`) only scans unpublished rows, staying fast forever.

## Ledger rules the database enforces

These used to be comments. They are now constraints, so an application bug cannot silently corrupt the ledger (`migrations/1700000000005_integrity-hardening.js`).

- **Balance convention.** A wallet's balance is `sum(credits) − sum(debits)`. A credit increases it, a debit decreases it.
- **System wallets.** Double-entry needs a second account for money entering or leaving the system. Each tenant has one `kind = 'system'` wallet per currency. A deposit *credits* the user wallet and *debits* the system wallet; a withdrawal is the reverse. Only system wallets may be negative (`CHECK (kind = 'system' OR balance >= 0)`), and across a tenant all balances in a currency sum to zero.
- **Balanced transactions.** A deferred constraint trigger runs at `COMMIT` and rejects any transaction whose entries don't satisfy `credits == debits`. Deferred, so entries can be inserted one at a time inside the DB transaction.
- **Append-only.** `UPDATE`, `DELETE` and `TRUNCATE` on `ledger_entries` raise an error. Mistakes are corrected with a reversing transaction, never by editing history.
- **Tenant isolation.** `ledger_entries.tenant_id` plus composite foreign keys `(tenant_id, transaction_id)` and `(tenant_id, wallet_id)` guarantee an entry, its transaction and its wallet all belong to the same tenant.
- **No cascading deletes of money.** Deleting a tenant that still has wallets or transactions fails (`ON DELETE RESTRICT`). Offboarding a tenant must be an explicit, audited process.
- **Allowed values.** Every `status` / `role` / `type` column has a `CHECK` constraint.

Not enforced by the database (application responsibility): that both sides of a transaction use the same currency, and that `wallets.balance` is updated in the same DB transaction as the entries.

## Webhooks: what is and isn't guaranteed

- **Delivery is at-least-once, not exactly-once.** `UNIQUE(event_id, endpoint_id)` means a retried relay cannot create a second *delivery row* for the same event and endpoint — it deduplicates our bookkeeping. It cannot stop the same HTTP request reaching the receiver twice (e.g. the receiver processed it but our request timed out before the response arrived, so we retry). Receivers must deduplicate using the event id; exactly-once *processing* is achieved by at-least-once delivery plus an idempotent consumer.
- **Signing secrets are encrypted at rest.** HMAC needs the raw secret, so it can't be hashed like an API key. `webhook_endpoints.secret_ciphertext` holds AES-256-GCM ciphertext (`src/shared/secret-box.ts`); the key comes from `SECRETS_ENCRYPTION_KEY`. A database dump alone does not expose the secrets.
- **Outbox rows can be pruned.** `webhook_deliveries.event_id` is a plain reference with no foreign key, so published `outbox_events` can be deleted by a retention job while delivery history is kept.

## Migration order
`extensions → identity → ledger → idempotency+outbox → webhooks → integrity hardening`
(FK dependencies: users→tenants, refresh_tokens→users, ledger→wallets/tenants, deliveries→endpoints.)

## Run
```bash
npm run migrate:up        # applies all pending migrations
npm run seed              # 1 tenant, 1 user, user + system wallet (₹1000 opening txn), 1 webhook endpoint
npm run migrate:down      # rolls back the latest migration (test your down migrations!)
npm run migrate:down -- 0 # rolls back everything
```
