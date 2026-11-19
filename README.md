# LedgerFlow

Multi-tenant wallet/ledger API with **idempotent transactions**, **double-entry accounting**, and **reliable webhook delivery** via a transactional outbox pattern.

Built with Node.js, TypeScript, Express, PostgreSQL, Redis, and BullMQ.

---

## Architecture

```
┌───────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Client      │─────▶│   API Server     │─────▶│  PostgreSQL  │
│  (HTTP/JWT/   │      │  (Express)       │      │  (16-alpine) │
│   API Key)    │      │  Port 3000       │      └──────┬───────┘
└───────────────┘      └──────┬───────────┘             │
                              │                         │ outbox_events
                              │                         ▼
                       ┌──────▼───────────┐      ┌──────────────┐
                       │     Redis        │◀─────│   Worker     │
                       │  (cache + queue) │      │  (outbox     │
                       │  Port 6379       │      │   relay +    │
                       └──────────────────┘      │   webhook    │
                                                 │   delivery)  │
                                                 └──────────────┘
```

**Two processes, one image:**
- **API server** (`npm run dev`) — handles HTTP requests, writes transactions + outbox events atomically.
- **Worker** (`npm run dev:worker`) — relays outbox events to BullMQ, delivers webhooks with retries.

---

## Prerequisites

- **Node.js** 22+ (the test runner uses Node 22 glob support; the production image runs Node 20)
- **Docker** + Docker Compose

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env

# 3. Start Postgres + Redis
docker compose up postgres redis -d

# 4. Run database migrations
npm run migrate:up

# 5. Seed demo data (1 tenant, 1 user, a wallet with a ₹1000 opening transaction, 1 webhook endpoint)
npm run seed

# 6. Start the API server
npm run dev

# 7. Start the worker (separate terminal)
npm run dev:worker
```

### Verify

```bash
# Liveness probe
curl localhost:3000/health/live
# → {"status":"ok"}

# Readiness probe (checks Postgres + Redis)
curl localhost:3000/health/ready
# → {"status":"ok","checks":{"postgres":"up","redis":"up"}}

# Interactive API docs
open http://localhost:3000/docs
```

---

## API Reference

All business endpoints require authentication via **JWT** (`Authorization: Bearer <token>`) or **API key** (`X-API-Key: lk_live_...`).

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register an organization (creates tenant + owner) |
| `POST` | `/auth/login` | Log in → access token + refresh token |
| `POST` | `/auth/refresh` | Rotate refresh token (reuse detection revokes the family) |

### Wallets

| Method | Endpoint | Auth | Permission |
|--------|----------|------|------------|
| `POST` | `/v1/wallets` | JWT / API Key | `wallet:write` |
| `GET` | `/v1/wallets` | JWT / API Key | `wallet:read` |
| `GET` | `/v1/wallets/:id` | JWT / API Key | `wallet:read` |

### Transactions

| Method | Endpoint | Auth | Permission | Notes |
|--------|----------|------|------------|-------|
| `POST` | `/v1/transactions` | JWT / API Key | `transaction:write` | Requires `Idempotency-Key` header |
| `GET` | `/v1/transactions` | JWT / API Key | `transaction:read` | Cursor-paginated, filterable |
| `GET` | `/v1/transactions/:id` | JWT / API Key | `transaction:read` | |

### Webhooks

| Method | Endpoint | Auth | Permission |
|--------|----------|------|------------|
| `POST` | `/v1/webhook-endpoints` | JWT | `webhook:manage` |
| `GET` | `/v1/webhook-endpoints` | JWT | `webhook:manage` |

### Operational

| Endpoint | Description |
|----------|-------------|
| `GET /health/live` | Liveness probe |
| `GET /health/ready` | Readiness probe (Postgres + Redis) |
| `GET /metrics` | Prometheus metrics |
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI 3.0 spec |

---

## RBAC (Role-Based Access Control)

| Role | Permissions |
|------|-------------|
| **owner** | All permissions including `member:manage` |
| **admin** | Everything except `member:manage` |
| **member** | Wallet + transaction read/write |
| **viewer** | Read-only (wallets + transactions) |
| **api_key** | Scoped to explicit permissions set at creation |

---

## System Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| **Double-entry accounting** | Every transfer creates one debit + one credit entry; a deferred database trigger rejects any transaction whose entries don't sum to zero |
| **Append-only ledger** | Database triggers reject `UPDATE`, `DELETE` and `TRUNCATE` on `ledger_entries` |
| **Tenant isolation** | `ledger_entries.tenant_id` + composite foreign keys: an entry, its transaction and its wallet must belong to the same tenant |
| **No oversell** | Optimistic locking (`version = $expected`) + `balance + delta >= 0` + database CHECK constraint |
| **Deadlock-free** | Wallet updates applied in canonical (sorted-by-id) order |
| **Idempotent writes** | `UNIQUE(tenant_id, key)` constraint; replays return stored response; body mismatch → 422; released on 5xx |
| **Transactional outbox** | Event written in the SAME database transaction as the money movement — no dual-write gap |
| **Safe concurrent relay** | `FOR UPDATE SKIP LOCKED` claims events; enqueue before marking published |
| **At-least-once delivery** | `UNIQUE(event_id, endpoint_id)` + worker skips `status = 'success'`; receivers must dedupe by event id (a timed-out request may be retried after the receiver processed it) |
| **Signed webhooks** | HMAC-SHA256 over `timestamp.body`; signing secrets stored AES-256-GCM encrypted |
| **Retries + DLQ** | BullMQ exponential backoff, 8 attempts max, failed set = dead-letter queue |
| **Refresh token rotation** | Family-based reuse detection — replaying a rotated token revokes the entire family |

---

## Database Schema

All money values are stored as **`BIGINT` minor units** (paise/cents) — never floats.

| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant root — everything scopes to a tenant |
| `users` | Dashboard identity; email is unique across all tenants (login is by email alone) |
| `api_keys` | Programmatic auth — stores `sha256(key)`, never the raw key |
| `refresh_tokens` | Session rotation with `family_id` for reuse detection |
| `wallets` | Balance holder with `version` for optimistic locking; `kind` = `user` \| `system` (internal counter-account) |
| `transactions` | Logical money movement grouping |
| `ledger_entries` | Append-only double-entry lines |
| `idempotency_keys` | Ingress deduplication |
| `outbox_events` | Reliable events (partial index on `pending`) |
| `webhook_endpoints` | Delivery targets with per-tenant HMAC secret (encrypted at rest) |
| `webhook_deliveries` | Delivery tracking with `UNIQUE(event_id, endpoint_id)` |

### Migrations

```bash
npm run migrate:up     # Apply all migrations
npm run migrate:down   # Roll back the latest migration
```

Migration order: `extensions → identity → ledger → idempotency+outbox → webhooks → outbox trace context → integrity hardening → unique user email`

**Upgrading a database created before `1700000000006_integrity-hardening`:** that migration starts storing webhook signing secrets encrypted, but it can't encrypt existing ones (the key isn't in the database). Run this once afterwards, or deliveries to existing endpoints will fail:

```bash
npm run migrate:up
npm run secrets:encrypt   # safe to re-run; already-encrypted rows are skipped
```

Rules the database now enforces (balanced transactions, append-only ledger, tenant isolation, system wallets) are described in [docs/schema.md](docs/schema.md).

---

## Observability

### Prometheus Metrics

Available at `GET /metrics` (API) and port `9100` (worker).

Custom metrics:
- `ledgerflow_http_request_duration_seconds` — HTTP latency histogram
- `ledgerflow_webhook_deliveries_total` — Webhook delivery outcomes
- `ledgerflow_outbox_lag_seconds` — Age of oldest unpublished outbox event

### OpenTelemetry Tracing (opt-in)

A single distributed trace spans **API request → outbox → relay → webhook delivery** across two processes.

```bash
# Start the observability stack
docker compose --profile obs up -d

# Run with tracing enabled (PowerShell)
$env:OTEL_ENABLED="true"; npm run dev
$env:OTEL_ENABLED="true"; npm run dev:worker

# Run with tracing enabled (bash)
OTEL_ENABLED=true npm run dev
OTEL_ENABLED=true npm run dev:worker
```

- **Grafana**: http://localhost:3001 (anonymous admin)
- **Prometheus**: http://localhost:9090
- **API Metrics**: http://localhost:3000/metrics

---

## Testing

```bash
# Unit tests (no dependencies needed)
npm test

# Integration tests (requires Postgres + Redis running)
npm run test:integration

# Type checking
npm run typecheck
```

### Load Testing (k6)

```bash
# 1. Create funded test fixtures
npm run load:setup > load/fixture.json

# 2. Run k6
k6 run load/transfer.js
```

---

## Project Structure

```
ledgerflow/
├── docker-compose.yml          # Postgres + Redis (+ optional API, worker, observability)
├── Dockerfile                  # Multi-stage build, non-root runtime
├── fly.toml                    # Fly.io deployment config (web + worker processes)
├── openapi.yaml                # OpenAPI 3.0 specification
├── migrations/                 # node-pg-migrate database migrations
├── load/                       # k6 load test scripts
├── observability/              # Prometheus, Grafana, OTel Collector configs
└── src/
    ├── server.ts               # API entrypoint + graceful shutdown
    ├── worker.ts               # Worker entrypoint (outbox relay + webhook delivery)
    ├── app.ts                  # Express app factory
    ├── config/                 # Zod-validated env config (fail-fast on boot)
    ├── db/                     # PostgreSQL pool + seed script
    ├── redis/                  # ioredis client + cache-aside layer
    ├── queue/                  # BullMQ queue setup
    ├── telemetry/              # Logger (pino), metrics (prom-client), OTel tracing
    ├── middleware/              # Auth, RBAC, rate limiting, idempotency, validation
    ├── shared/                 # Crypto, errors, pagination, webhook signing
    ├── types/                  # Express type augmentations
    ├── modules/
    │   ├── auth/               # Register, login, refresh, logout, API keys, RBAC
    │   ├── health/             # Liveness + readiness probes
    │   ├── wallets/            # Wallet CRUD with Redis cache
    │   ├── ledger/             # Double-entry transfers with optimistic locking
    │   └── webhooks/           # Webhook endpoint management
    └── workers/
        ├── outbox-relay.ts     # Polls outbox → enqueues webhook delivery jobs
        └── webhook-delivery.ts # BullMQ worker: HMAC-signed HTTP delivery + retries
```

---

## Deployment

### Free: Render (API) + Vercel (console)

**API, worker, Postgres and Redis on Render.** [`render.yaml`](render.yaml) is a Render Blueprint:
Render dashboard → **New → Blueprint** → pick this repo → **Apply**. It creates
the Postgres database, a Key Value (Redis) instance and one web service, and
generates `JWT_SECRET` and `SECRETS_ENCRYPTION_KEY`. Render's free tier has no
background workers or pre-deploy step, so the web service runs
[`scripts/start-all.sh`](scripts/start-all.sh): migrations, then the API and
the webhook worker in one container.

Free-tier limits: the service sleeps after 15 minutes idle (the next request
takes up to ~1 minute to wake it), and the free database expires 30 days after
creation unless upgraded.

**Console on Vercel.** Import this repo in Vercel with **Root Directory**
`ledgerflow-console` and set `LEDGERFLOW_API_URL` to the Render URL (no
trailing slash). The console's server routes allow 60 seconds so a sleeping
API has time to wake.

### Fly.io (no sleeping; needs a card)

```bash
fly launch --no-deploy
fly postgres create                                    # Sets DATABASE_URL
fly secrets set REDIS_URL=redis://...                  # Managed Redis (e.g. Upstash)
fly secrets set JWT_SECRET=$(openssl rand -base64 48)
fly secrets set SECRETS_ENCRYPTION_KEY=$(openssl rand -base64 32)
fly deploy                                             # Runs migrate:up, then starts web + worker
```

The `fly.toml` defines two process groups (`web`, `worker`) from one Docker image. Migrations run automatically as a release command before the new version serves traffic.

---

## Environment Variables

See [`.env.example`](.env.example) for all configuration options. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | — | Redis connection string |
| `JWT_SECRET` | ✅ | — | Signing key for access tokens (min 32 chars). The `.env.example` value is rejected in production |
| `SECRETS_ENCRYPTION_KEY` | ✅ | — | 32-byte base64 key encrypting webhook secrets at rest. The `.env.example` value is rejected in production |
| `PORT` | | `3000` | API server port |
| `OTEL_ENABLED` | | `false` | Enable OpenTelemetry tracing |
| `WEBHOOK_MAX_ATTEMPTS` | | `8` | Max webhook delivery retries |
| `RATE_LIMIT_POINTS` | | `100` | Global rate limit (requests per window) |

---

## License

MIT
