#!/bin/sh
# Single-container start for hosts that give you one free service (Render's
# free tier has no free background workers): apply migrations, then run the
# API and the webhook worker side by side in this container.
#
# Elsewhere (Fly.io, docker compose) run them as separate processes instead:
# that isolates webhook spikes from API latency.
set -e

npm run migrate:up

node dist/worker.js &
WORKER_PID=$!
node dist/server.js &
SERVER_PID=$!

# Forward shutdown signals so both processes drain gracefully.
term() {
  kill -TERM "$SERVER_PID" "$WORKER_PID" 2>/dev/null || true
}
trap term TERM INT

# If either process exits, stop the other and exit with its status, so the
# platform restarts the container instead of running half a service.
while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$WORKER_PID" 2>/dev/null; do
  sleep 2
done
term
wait "$SERVER_PID" 2>/dev/null; STATUS_SERVER=$?
wait "$WORKER_PID" 2>/dev/null; STATUS_WORKER=$?
[ "$STATUS_SERVER" -ne 0 ] && exit "$STATUS_SERVER"
exit "$STATUS_WORKER"
