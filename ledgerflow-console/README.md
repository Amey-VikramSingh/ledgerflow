# LedgerFlow Console

Operator console for the LedgerFlow API, built with Next.js (App Router),
TypeScript, Tailwind CSS and TanStack Query.

Live: https://ledgerflow-console.vercel.app

## How authentication works

The browser never handles tokens. The console's own route handlers talk to the
API and keep the access and refresh tokens in httpOnly cookies:

```
browser ──/api/auth/login──▶ console route ──▶ API /auth/login
                             sets lf_access + lf_refresh (httpOnly)
browser ──/api/lf/v1/*────▶ console proxy ──▶ API /v1/*  (Bearer token added here)
                             on 401: refreshes once, retries, updates cookies
```

Keeping tokens out of JavaScript limits what a cross-site scripting bug could
steal. The proxy is `src/app/api/lf/[...path]/route.ts`.

## Running locally

```bash
cp .env.example .env.local   # LEDGERFLOW_API_URL=http://localhost:3000
npm install
npm run dev -- -p 3100       # the API uses port 3000
```

## Design

Colour encodes the direction of a ledger entry (credits green, debits rose), and
amounts use monospaced tabular figures so columns line up. The `Money`
component (`src/components/money.tsx`) applies this everywhere.

## Status

Available: sign-up and sign-in, overview, and wallets (list, create, detail).
Planned: transactions, webhooks and API key management.
