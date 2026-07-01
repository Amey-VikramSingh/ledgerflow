# LedgerFlow

Multi-tenant wallet/ledger API with **idempotent transactions** and **reliable webhook delivery** (transactional outbox). Backend flagship — see the full spec for the target architecture; this repo is being built V1-first.

---

## Day 1 — Foundation

Skeleton, dependencies, health probes, config, logging, graceful shutdown.

### Prerequisites
- Node 20+
- Docker + Docker Compose

### Run it
```bash
# 1. install deps
npm install

# 2. copy env
cp .env.example .env

# 3. start Postgres + Redis
docker compose up postgres redis -d

# 4. run migrations (enables pgcrypto + citext)
npm run migrate:up

# 5. start the API in watch mode
npm run dev
```

### Verify
```bash
curl localhost:3000/health/live     # {"status":"ok"}
curl localhost:3000/health/ready    # {"status":"ok","checks":{"postgres":"up","redis":"up"}}

# stop redis and re-check readiness — it should flip to 503 / "down"
docker compose stop redis
curl -i localhost:3000/health/ready # HTTP/1.1 503 ... "redis":"down"
docker compose start redis
```

---

## What exists after Day 1
```
ledgerflow/
├── docker-compose.yml        # postgres + redis (+ optional api)
├── Dockerfile                # multi-stage, non-root
├── migrations/               # node-pg-migrate (extensions enabled)
└── src/
    ├── server.ts             # entrypoint + graceful shutdown
    ├── app.ts                # express factory (helmet, req-id, logging)
    ├── config/               # zod-validated env, fail-fast
    ├── telemetry/logger.ts   # pino + secret redaction
    ├── db/pool.ts            # pg pool + ping
    ├── redis/client.ts       # ioredis + ping
    ├── middleware/error.ts   # error envelope + 404
    ├── shared/errors.ts      # typed AppError
    └── modules/health/       # /health/live + /health/ready
```

## Day-1 Definition of Done
- [x] **Works** — app boots, `/health/live` and `/health/ready` respond
- [x] **Tested** — readiness flips to 503 when a dependency is down (manual check above)
- [x] **Documented** — this README + inline rationale in each file
- [x] **Committed** — see message below
- [ ] **Deployed** — not yet (Day 10)

### Commit
```
chore: bootstrap ledgerflow skeleton + health probes

- feature-sliced project structure (TS, Express, CommonJS)
- docker-compose for postgres + redis with healthchecks
- zod-validated config with fail-fast on boot
- pino structured logging with secret redaction
- pg pool + ioredis clients with ping helpers
- liveness/readiness probes (readiness checks pg + redis)
- request-id + structured request logging
- centralized error envelope
- graceful shutdown on SIGTERM/SIGINT
- node-pg-migrate wired; pgcrypto + citext enabled
```

---

## Next — Day 2 (Schema)
Migrations for `tenants`, `users`, `api_keys`, `refresh_tokens`, then `wallets`
(balance + version), `transactions`, `ledger_entries`, `idempotency_keys`,
`outbox_events`, `webhook_endpoints`, `webhook_deliveries`. Money is `BIGINT`
minor units — never floats.

## Learning objectives (Day 1)
Project structure · Docker Compose with healthchecks · fail-fast config ·
structured logging · liveness vs readiness (restart vs route decisions) ·
graceful shutdown.
```
```
