# Operations

## Deploying

### Render (API, worker, Postgres, Redis) and Vercel (console)

[`render.yaml`](../render.yaml) is a Render Blueprint. In the Render dashboard,
choose **New → Blueprint**, select this repository and apply. It creates a
Postgres database, a Key Value (Redis) instance and one web service, and
generates `JWT_SECRET` and `SECRETS_ENCRYPTION_KEY`.

Render's free tier has no background workers or pre-deploy step, so the web
service runs [`scripts/start-all.sh`](../scripts/start-all.sh): migrations,
then the API and the worker in one container. Free services sleep after 15
minutes without traffic, and free databases expire 30 days after creation unless
upgraded.

For the console, import the repository in Vercel with root directory
`ledgerflow-console` and set `LEDGERFLOW_API_URL` to the API's URL.

### Fly.io

```bash
fly launch --no-deploy
fly postgres create                                  # sets DATABASE_URL
fly secrets set REDIS_URL=redis://...                # e.g. Upstash
fly secrets set JWT_SECRET=$(openssl rand -base64 48)
fly secrets set SECRETS_ENCRYPTION_KEY=$(openssl rand -base64 32)
fly deploy
```

[`fly.toml`](../fly.toml) runs the API (`web`) and worker as separate process
groups from one image and applies migrations as a release command.

## Migrations

```bash
npm run migrate:up       # apply pending migrations
npm run migrate:down     # roll back the latest
npm run migrate:down -- 0  # roll back everything
```

Databases created before `1700000000006_integrity-hardening` hold plaintext
webhook secrets, which that migration can't encrypt (the key isn't in the
database). Run once after migrating:

```bash
npm run secrets:encrypt   # idempotent
```

## Observability

```bash
docker compose up postgres redis -d
docker compose --profile obs up -d   # OpenTelemetry Collector, Prometheus, Grafana
OTEL_ENABLED=true npm run dev
OTEL_ENABLED=true npm run dev:worker
```

- Grafana: http://localhost:3001 (LedgerFlow dashboard)
- Prometheus: http://localhost:9090
- Metrics: `/metrics` on the API and port `9100` on the worker. In production
  the API's `/metrics` is disabled unless `METRICS_TOKEN` is set, and then
  requires `Authorization: Bearer <METRICS_TOKEN>`.

Custom metrics: `ledgerflow_http_request_duration_seconds`,
`ledgerflow_webhook_deliveries_total`, `ledgerflow_outbox_lag_seconds`.

Traces follow a transfer across both processes: the API stores its trace
context on the outbox row, the relay passes it into the BullMQ job, and the
worker continues the trace for the webhook delivery.

## Load testing

```bash
npm run load:setup > load/fixture.json   # dev/staging only: funds wallets directly
export API_KEY=... FROM_WALLETS=id1,id2 TO_WALLET=... BASE=https://your-api
k6 run load/transfer.js
```

Thresholds: p95 latency under 300 ms and an error rate under 1%.
