# LedgerFlow

Multi-tenant wallet/ledger API with **idempotent transactions** and **reliable webhook delivery** (transactional outbox). Backend flagship — see the full spec for the target architecture; this repo is being built V1-first.

**Status:** Day 1 (foundation) and Day 2 (schema) are done. There are no business endpoints yet — only health probes. Next up is Day 3 (auth).

---

## Prerequisites
- Node 20+
- Docker + Docker Compose

## Run it
```bash
# 1. install deps
npm install

# 2. copy env (includes a dev-only SECRETS_ENCRYPTION_KEY)
cp .env.example .env

# 3. start Postgres + Redis
docker compose up postgres redis -d

# 4. apply all migrations
npm run migrate:up

# 5. (optional) insert dev data: 1 tenant, 1 user, 2 wallets, 1 webhook endpoint
npm run seed

# 6. start the API in watch mode
npm run dev
```

To run everything in containers instead (migrations are applied automatically
by the `migrate` service before the API starts):
```bash
docker compose --profile app up --build
```

## Verify
```bash
curl localhost:3000/health/live     # {"status":"ok"}
curl localhost:3000/health/ready    # {"status":"ok","checks":{"postgres":"up","redis":"up"}}

# stop redis and re-check readiness — it should flip to 503 / "down"
docker compose stop redis
curl -i localhost:3000/health/ready # HTTP/1.1 503 ... "redis":"down"
docker compose start redis
```

## Checks
```bash
npm run lint        # eslint
npm run typecheck   # tsc --noEmit (src + tests)
npm test            # vitest — no Postgres/Redis needed, dependencies are mocked
npm run build       # compile to dist/
```
CI (`.github/workflows/ci.yml`) runs all of the above, then applies every
migration against a real Postgres, seeds twice, rolls everything back and
re-applies — so broken `down` migrations are caught.

## Configuration
Validated once at boot (`src/config`); the process refuses to start if anything is missing or malformed.

| Variable | Notes |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | default `3000` |
| `DATABASE_URL` | must be `postgres://` or `postgresql://` |
| `REDIS_URL` | must be `redis://` or `rediss://` |
| `LOG_LEVEL` | default `info` |
| `SHUTDOWN_TIMEOUT_MS` | default `10000` |
| `SECRETS_ENCRYPTION_KEY` | 32 bytes, base64. Encrypts webhook signing secrets at rest. The value in `.env.example` is rejected when `NODE_ENV=production`. |

## Error responses
Every error has the same shape:
```json
{ "error": { "type": "invalid_json", "message": "...", "request_id": "..." } }
```
`request_id` matches the `x-request-id` response header and the log lines for
that request. A client-supplied `x-request-id` is honoured only if it is a
short plain token (`[A-Za-z0-9._-]`, max 128 chars); otherwise a UUID is generated.

---

## Layout
```
ledgerflow/
├── docker-compose.yml        # postgres + redis (+ optional migrate & api)
├── Dockerfile                # multi-stage, non-root, npm ci
├── migrations/               # node-pg-migrate — see docs/schema.md
├── tests/                    # vitest + supertest
└── src/
    ├── server.ts             # entrypoint + graceful shutdown
    ├── app.ts                # express factory (helmet, req-id, logging)
    ├── config/               # zod-validated env, fail-fast
    ├── telemetry/logger.ts   # pino + secret redaction
    ├── db/pool.ts            # pg pool + ping
    ├── db/seed.ts            # idempotent dev seed
    ├── redis/client.ts       # ioredis + ping
    ├── middleware/error.ts   # error envelope + 404
    ├── shared/               # typed errors, async handler, request id, secret box
    └── modules/health/       # /health/live + /health/ready
```

Schema design and the reasoning behind it: [docs/schema.md](docs/schema.md).

## Things to know before writing transaction code
- `pg` returns `BIGINT` columns (balances, amounts) as **strings**. Convert
  with `BigInt(...)`, never `Number(...)`/`parseFloat`.
- Every async route handler must be wrapped in `asyncHandler` — Express 4 does
  not catch rejected promises on its own.
- Ledger rules are enforced by the database (balanced transactions,
  append-only entries, tenant isolation). Violations surface as Postgres
  errors, so map them to typed `AppError`s at the service layer.

## Progress
- [x] **Day 1 — Foundation:** skeleton, config, logging, health probes, graceful shutdown
- [x] **Day 2 — Schema:** identity, wallets, double-entry ledger, idempotency, outbox, webhooks
- [ ] **Day 3 — Auth**
- [ ] **Deployed** (Day 10)
