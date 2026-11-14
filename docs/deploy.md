# Hardening & Deploy

## What's in this layer
| Feature | Where | Verified |
|---|---|---|
| Redis token-bucket rate limiting (atomic Lua) | `middleware/ratelimit.ts` | ✅ 8/16 auth reqs throttled |
| Cache-aside + invalidation on write | `redis/cache.ts`, wallet read/transfer | ✅ stale-then-fresh proven |
| Cursor pagination + filtering | `shared/pagination.ts`, list endpoints | ✅ 3 pages, no dupes |
| Swagger / OpenAPI | `openapi.yaml`, `/docs`, `/openapi.json` | ✅ served |
| OpenTelemetry (opt-in) | `telemetry/otel.ts` + `trace.ts` | ✅ init + cross-process trace |
| Prometheus metrics | `telemetry/metrics.ts`, `/metrics` | ✅ custom metrics present |
| CI (GitHub Actions) | `.github/workflows/ci.yml` | config |
| k6 load test | `load/transfer.js` | run post-deploy |
| Fly.io deploy | `fly.toml` | config |

## Run locally with full observability
```bash
docker compose up postgres redis -d
docker compose --profile obs up -d        # otel-collector + prometheus + grafana
OTEL_ENABLED=true npm run dev              # traces → collector
OTEL_ENABLED=true npm run dev:worker
```
- Grafana: http://localhost:3001 (anon admin) → LedgerFlow dashboard
- Prometheus: http://localhost:9090 · API metrics: http://localhost:3000/metrics
- Swagger: http://localhost:3000/docs

## The distributed trace (the impressive bit)
A single trace spans **API request → outbox → relay → webhook delivery**, across
two processes and minutes of delay. Mechanism: the API stores its trace context
on the `outbox_events` row; the relay carries it into the BullMQ job; the worker
resumes it (`withRemoteSpan`). Turn on `OTEL_ENABLED=true` and post a transaction
to a configured webhook endpoint to see the end-to-end trace in Tempo/Jaeger.

## Load test (write path)
```bash
# 1. create funded fixture (dev/staging only — funds via direct DB write)
npm run load:setup > load/fixture.json
# 2. export values and run k6
export API_KEY=... FROM_WALLETS=id1,id2,... TO_WALLET=... BASE=https://your-app
k6 run load/transfer.js
```
Thresholds: p95 < 300ms, error rate < 1%. Put the resulting **p95 and req/s in the
README** — a k6 summary screenshot is what a reviewer believes.

## Deploy to Fly.io
```bash
fly launch --no-deploy            # or: fly apps create ledgerflow
fly postgres create               # sets DATABASE_URL
# managed Redis (Upstash) → fly secrets set REDIS_URL=...
fly secrets set JWT_SECRET=$(openssl rand -base64 48)
fly deploy                        # runs migrate:up as release_command, then web+worker
```
`fly.toml` defines two process groups (`web`, `worker`) from one image; the
release command runs migrations before the new version serves traffic.
