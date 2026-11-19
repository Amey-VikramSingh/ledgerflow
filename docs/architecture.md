# Architecture

LedgerFlow runs as two processes built from one image:

- **API** (`src/server.ts`): HTTP endpoints. Writes money movements and their
  outbox events in a single database transaction.
- **Worker** (`src/worker.ts`): polls the outbox, enqueues webhook deliveries in
  BullMQ, and delivers them.

PostgreSQL is the source of truth. Redis holds rate-limit buckets, a read cache
for wallets, and the BullMQ queue; losing Redis degrades the service but never
corrupts data.

## Transfers

`POST /v1/transactions` (`src/modules/ledger/ledger.service.ts`):

1. Reads both wallets in the caller's tenant. Only `user` wallets can be used;
   `system` wallets are internal counter-accounts.
2. Inserts a transaction and a balanced debit/credit pair of ledger entries.
3. Updates both balances with an optimistic lock
   (`WHERE version = $expected AND balance + delta >= 0`). Updates run in
   sorted wallet-id order, so two transfers between the same pair of wallets
   can't deadlock. If a version moved, the transaction rolls back and retries
   (up to three times, then `409`).
4. Writes a `transaction.posted` outbox event in the same database transaction.

The database backs this up independently of the application code: a deferred
trigger rejects unbalanced transactions at commit, ledger entries are
append-only, and composite foreign keys keep everything inside one tenant. See
[schema](schema.md).

## Idempotency

`POST /v1/transactions` requires an `Idempotency-Key` header
(`src/middleware/idempotency.ts`). The first request claims the key with
`INSERT … ON CONFLICT DO NOTHING` on `UNIQUE (tenant_id, key)`, so the database
decides which concurrent duplicate wins. Later requests with the same key and
body get the stored response; a different body is rejected with `422`; a
request still in progress gets `409`. A `5xx` releases the key so the client can
retry.

## Outbox and webhooks

- **Relay** (`src/workers/outbox-relay.ts`): claims pending events with
  `FOR UPDATE SKIP LOCKED`, so several relays can run without double-claiming;
  creates one delivery row per enabled endpoint
  (`UNIQUE (event_id, endpoint_id)`), enqueues the jobs, then marks the events
  published in the same transaction.
- **Delivery** (`src/workers/webhook-delivery.ts`): signs
  `HMAC-SHA256(secret, "<timestamp>.<body>")`, posts with a timeout, and retries
  with exponential backoff (8 attempts, then the row is marked `dead`).
- **Guarantee:** at-least-once. A request can reach the receiver and still be
  retried if the response is lost, so receivers should deduplicate by event id.
- **Secrets** are stored AES-256-GCM encrypted (`src/shared/secret-box.ts`).
- **SSRF protection** (`src/shared/net-guard.ts`): endpoint URLs must be HTTPS
  to a public host; at delivery time the socket's DNS lookup refuses private,
  loopback, link-local and metadata addresses (which also covers DNS
  rebinding), and redirects are not followed.

## Authentication and authorization

- Passwords are hashed with argon2id. Unknown emails are verified against a
  dummy hash, so response time doesn't reveal which emails exist.
- Access tokens are short-lived HS256 JWTs. Refresh tokens are random, stored as
  SHA-256 hashes, and rotate on every use; presenting an already-rotated token
  revokes its whole family.
- API keys are stored as SHA-256 hashes and carry explicit scopes, which must be
  a subset of the creating user's permissions.
- RBAC maps roles to permissions (`src/modules/auth/rbac.ts`); routes check a
  permission, never a role name.
- Rate limiting is a token bucket implemented as one Lua script in Redis, keyed
  by client IP (`TRUST_PROXY_HOPS` must match the number of proxies in front of
  the API).

## Tests

| Area | Test |
|---|---|
| Double-entry, outbox write, no overdraft under 10 concurrent transfers | `src/modules/ledger/ledger.itest.ts` |
| Refresh rotation and reuse detection | `src/modules/auth/auth.reuse.itest.ts` |
| Unique emails under concurrent sign-up, login timing | `src/modules/auth/auth.email.itest.ts` |
| API key scope limits, pinned JWT algorithm | `src/modules/auth/security.itest.ts` |
| SSRF guard (address ranges, URL rules, guarded connection) | `src/shared/net-guard.test.ts` |
| Error handling, request ids, secret encryption, RBAC | `src/shared/*.test.ts`, `src/modules/auth/rbac.test.ts` |
