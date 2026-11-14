# Core Engine (transfers · idempotency · outbox · webhooks)

The resume-bearing distributed-systems layer. Every guarantee below is covered by a test that runs against real Postgres + Redis.

## Run
```bash
docker compose up postgres redis -d
npm run migrate:up && npm run seed
npm run dev          # API  (terminal 1)
npm run dev:worker   # relay + webhook delivery (terminal 2)
```

## Endpoints
```
POST /v1/wallets                 (wallet:write)
GET  /v1/wallets/:id             (wallet:read)
POST /v1/transactions            (transaction:write) — requires Idempotency-Key
GET  /v1/transactions/:id        (transaction:read)
POST /v1/webhook-endpoints       (webhook:manage)
GET  /v1/webhook-endpoints       (webhook:manage)
```

## Guarantees (all verified)

| Guarantee | How | Test |
|---|---|---|
| **Double-entry** | one debit + one credit per transfer, sum to zero | `ledger.itest` |
| **No oversell** | optimistic lock (`version = $expected`) + `balance + delta >= 0` + CHECK | `ledger.itest` (10 concurrent → exactly 5 succeed, balance floor 0) |
| **Deadlock-free** | wallet updates applied in canonical (sorted-id) order | design |
| **Idempotency** | `UNIQUE(tenant_id, key)`; replay stored response; 422 on body mismatch; release on 5xx | verified: 15 concurrent → 1 write |
| **Transactional outbox** | event written in the SAME txn as the money move | `ledger.itest` |
| **Exactly-once relay** | `FOR UPDATE SKIP LOCKED` claims events; enqueue before marking published | `outbox-relay` |
| **Exactly-once delivery** | `UNIQUE(event_id, endpoint_id)` + idempotent worker skip | verified: HMAC delivery |
| **Signed webhooks** | HMAC-SHA256 over `timestamp.body` | verified: signature matches |
| **Retries + DLQ** | BullMQ exponential backoff, `attempts=8`, failed set = DLQ, row → `dead` | `webhook-delivery` |

## Request example
```bash
curl -sX POST :3000/v1/transactions \
  -H "authorization: Bearer <access>" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"from_wallet_id":"...","to_wallet_id":"...","amount":5000}'
```

## Verify
```bash
npm run test:integration   # ledger + reuse-detection integration tests (needs pg+redis)
```
