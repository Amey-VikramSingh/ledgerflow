# Schema (Day 2)

All money is `BIGINT` **minor units** (paise/cents). Never float. All timestamps `TIMESTAMPTZ`.

## Tables

| Table | Purpose | Key design point |
|---|---|---|
| `tenants` | multi-tenant root | everything scopes to a tenant |
| `users` | dashboard identity | `UNIQUE(tenant_id, email)` — email unique *within* a tenant |
| `api_keys` | programmatic auth | store `sha256(key)`, never the raw key |
| `refresh_tokens` | session rotation | `family_id` + `rotated` enable reuse detection (Day 4) |
| `wallets` | balance holder | `version` = optimistic lock; `balance` = cached ledger projection |
| `transactions` | logical money movement | groups ledger entries |
| `ledger_entries` | double-entry lines | **append-only**; `amount > 0` + `direction`; entries sum to zero |
| `idempotency_keys` | ingress dedupe | `UNIQUE(tenant_id, key)` is the concurrency primitive |
| `outbox_events` | reliable events | written in the business txn; partial index on `pending` |
| `webhook_endpoints` | delivery targets | per-tenant HMAC secret |
| `webhook_deliveries` | delivery attempts | `UNIQUE(event_id, endpoint_id)` = exactly-once per endpoint |

## Why these choices (interview-ready)

- **Money as `BIGINT`** — floating point can't represent 0.10 exactly; a ledger that loses fractions of a cent is a broken ledger.
- **`wallets.version`** — the optimistic-lock guard. A debit does `UPDATE ... SET version = version + 1 WHERE id = $id AND version = $expected`. Two concurrent debits can't both match `$expected`, so one retries. No oversell without pessimistic row locks.
- **Cached `balance`** — reading the balance is O(1) instead of summing the whole ledger. The ledger remains the source of truth; a reconciliation job (later) asserts `balance == sum(entries)`.
- **Append-only `ledger_entries`** — no `UPDATE`/`DELETE`. History is immutable and reconstructable — the property audit/finance systems require.
- **`UNIQUE(tenant_id, key)` on idempotency** — the database, not application code, decides which duplicate request wins the insert. Concurrency correctness lives in the constraint.
- **Partial index `WHERE status = 'pending'`** on outbox — the relay's hot query (`SELECT ... WHERE status='pending'`) only scans unpublished rows, staying fast forever.
- **`UNIQUE(event_id, endpoint_id)` on deliveries** — makes redelivery idempotent, turning at-least-once queue semantics into exactly-once delivery per endpoint.

## Migration order
`extensions → identity → ledger → idempotency+outbox → webhooks`
(FK dependencies: users→tenants, refresh_tokens→users, ledger→wallets/tenants, deliveries→outbox/endpoints.)

## Run
```bash
npm run migrate:up   # applies all migrations
npm run seed         # inserts 1 tenant, 1 user, 1 wallet (₹1000), 1 webhook endpoint
npm run migrate:down # rolls back the latest migration (test your down migrations!)
```
