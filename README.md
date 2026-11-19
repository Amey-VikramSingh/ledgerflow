# LedgerFlow

[![CI](https://github.com/Amey-VikramSingh/ledgerflow/actions/workflows/ci.yml/badge.svg)](https://github.com/Amey-VikramSingh/ledgerflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A multi-tenant wallet and ledger API: double-entry bookkeeping, idempotent
transfers, and signed webhooks delivered through a transactional outbox.

**Live demo:** [console](https://ledgerflow-console.vercel.app) ·
[API docs](https://ledgerflow-api-2scd.onrender.com/docs) ·
[health](https://ledgerflow-api-2scd.onrender.com/health/ready)

> The demo runs on free hosting. The API sleeps after 15 minutes without
> traffic, so the first request after a quiet period can take up to a minute.

## Stack

TypeScript · Node.js · Express · PostgreSQL · Redis · BullMQ · Zod ·
Next.js (console) · Docker · GitHub Actions · Prometheus · OpenTelemetry

## Highlights

- **Double-entry ledger enforced by the database.** Every transfer writes a
  balanced pair of entries; a deferred trigger rejects any transaction that
  doesn't sum to zero, and entries are append-only.
- **Safe under concurrency.** Optimistic locking on wallet versions, a
  non-negative balance constraint, and canonical lock ordering, so concurrent
  transfers can't overdraw a wallet or deadlock.
- **Idempotent writes.** `POST /v1/transactions` requires an
  `Idempotency-Key`; retries return the stored response, and reusing a key with
  a different body is rejected.
- **Reliable webhooks.** Events are written in the same database transaction as
  the money movement (transactional outbox), relayed with
  `FOR UPDATE SKIP LOCKED`, and delivered by a BullMQ worker with HMAC
  signatures, exponential backoff and a dead-letter state. Delivery is
  at-least-once; receivers deduplicate by event id.
- **Multi-tenant by construction.** Composite foreign keys keep every ledger
  entry, transaction and wallet inside one tenant.
- **Security.** Argon2id passwords, rotating refresh tokens with reuse
  detection, scoped API keys, RBAC, per-IP rate limiting in Redis, SSRF
  protection on webhook URLs, and webhook secrets encrypted at rest.

## Architecture

```
Client ──▶ API (Express) ──▶ PostgreSQL
              │                  │ outbox_events
              ▼                  ▼
           Redis  ◀──────── Worker: outbox relay + webhook delivery
       (rate limits, cache,      │
        BullMQ queue)            └──▶ tenant webhook endpoints (HMAC-signed)
```

One Docker image runs as two processes: the API, and a worker that relays
outbox events and delivers webhooks. The [Next.js console](ledgerflow-console)
is a separate app that talks to the API through its own server routes, so
tokens stay in httpOnly cookies and never reach browser JavaScript.

More detail: [architecture](docs/architecture.md) ·
[database schema](docs/schema.md) · [operations](docs/operations.md)

## Getting started

Requires Node.js 22+ and Docker.

```bash
npm install
cp .env.example .env
docker compose up postgres redis -d
npm run migrate:up
npm run seed            # optional demo tenant, user and wallet
npm run dev             # API on http://localhost:3000
npm run dev:worker      # in a second terminal
```

Interactive API docs are served at `http://localhost:3000/docs`.
`docker compose --profile app up --build` runs the whole stack in containers.

## API

All `/v1` endpoints accept a user JWT (`Authorization: Bearer …`) or an API key
(`X-API-Key: lk_live_…`) and check a permission.

| Method | Path | Permission | Notes |
|---|---|---|---|
| `POST` | `/auth/register` | — | Creates a tenant and its owner |
| `POST` | `/auth/login` | — | Returns an access and refresh token |
| `POST` | `/auth/refresh` | — | Rotates the refresh token |
| `POST` | `/auth/logout` | — | Revokes the refresh token |
| `GET` | `/auth/me` | signed in | Current user |
| `POST` / `GET` / `DELETE` | `/auth/api-keys` | `apikey:manage` | Scoped keys, shown once |
| `POST` | `/v1/wallets` | `wallet:write` | |
| `GET` | `/v1/wallets`, `/v1/wallets/:id` | `wallet:read` | Cursor-paginated list |
| `POST` | `/v1/transactions` | `transaction:write` | Requires `Idempotency-Key` |
| `GET` | `/v1/transactions`, `/v1/transactions/:id` | `transaction:read` | Filterable list |
| `POST` / `GET` | `/v1/webhook-endpoints` | `webhook:manage` | Public HTTPS URLs only |

Roles: **owner** (everything), **admin** (everything except member management),
**member** (read/write wallets and transactions), **viewer** (read-only). An API
key carries an explicit subset of its creator's permissions.

The full contract is in [`openapi.yaml`](openapi.yaml).

## Testing

```bash
npm test                  # unit tests
npm run test:integration  # needs Postgres and Redis (docker compose up postgres redis -d)
npm run typecheck
```

CI runs type checking, unit and integration tests against real Postgres and
Redis, a dependency audit, a full migration rollback and re-apply, and a Docker
build on every pull request.

## Deployment

- **Render + Vercel (free):** [`render.yaml`](render.yaml) is a Render Blueprint
  for the API, worker, Postgres and Redis; the console deploys to Vercel with
  root directory `ledgerflow-console`.
- **Fly.io:** [`fly.toml`](fly.toml) runs the API and worker as separate process
  groups, with migrations as a release step.

See [operations](docs/operations.md) for both, plus observability and load
testing.

## Configuration

Configuration is validated at startup; the process refuses to start if anything
is missing or invalid. See [`.env.example`](.env.example).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | | PostgreSQL connection string |
| `REDIS_URL` | yes | | Redis connection string |
| `JWT_SECRET` | yes | | Access-token signing key (32+ chars) |
| `SECRETS_ENCRYPTION_KEY` | yes | | 32-byte base64 key for webhook secrets at rest |
| `PORT` | | `3000` | API port |
| `TRUST_PROXY_HOPS` | | `1` | Reverse proxies in front of the API (Render: `2`) |
| `METRICS_TOKEN` | | | Bearer token for `/metrics`; disabled in production when unset |
| `WEBHOOK_ALLOW_PRIVATE_URLS` | | off in production | Allow webhooks to private addresses (local development only) |
| `OTEL_ENABLED` | | `false` | Export OpenTelemetry traces |
| `RATE_LIMIT_POINTS` | | `100` | Requests per minute per IP |

The example values for `JWT_SECRET` and `SECRETS_ENCRYPTION_KEY` are rejected
when `NODE_ENV=production`.

## Project structure

```
src/
  server.ts, worker.ts   entry points (API, worker)
  app.ts                 Express app
  config/                environment validation
  middleware/            auth, RBAC, rate limiting, idempotency, validation, errors
  modules/               auth, wallets, ledger, webhooks, health
  workers/               outbox relay, webhook delivery
  shared/                crypto, SSRF guard, webhook signing, pagination
  telemetry/             logging, metrics, tracing
migrations/              database migrations (node-pg-migrate)
ledgerflow-console/      Next.js operator console
load/                    k6 load test
observability/           Prometheus, Grafana and OpenTelemetry Collector config
```

## License

[MIT](LICENSE)
