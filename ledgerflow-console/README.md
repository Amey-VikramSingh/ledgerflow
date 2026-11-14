# LedgerFlow Console

Operator console for the LedgerFlow API. Next.js 14 (App Router) · TypeScript ·
Tailwind · TanStack Query.

## Architecture — Backend-for-Frontend (BFF)
The browser never touches tokens. Auth happens through this app's own route
handlers, which store the access/refresh tokens in **httpOnly cookies**:

```
browser ──/api/auth/login──▶ Next route ──▶ LedgerFlow /auth/login
                             sets lf_access + lf_refresh (httpOnly)
browser ──/api/lf/v1/*────▶ Next proxy  ──▶ LedgerFlow /v1/*  (Bearer attached here)
                             on 401: rotates refresh once, retries, re-sets cookies
```
This mitigates XSS token theft and exercises the API's refresh-rotation +
reuse-detection transparently. See `src/app/api/lf/[...path]/route.ts`.

## Run
```bash
cp .env.example .env.local   # set LEDGERFLOW_API_URL to your API
npm install
npm run dev                  # http://localhost:3000  (API on a separate port)
```

## Design
Color encodes double-entry **direction**: credit-in is green, debit-out is rose,
figures are monospace + tabular so they column-align like a real ledger. The
`Money` component (`src/components/money.tsx`) carries this everywhere.

## Status
Shipped: auth (login/register via BFF), Overview, Wallets (list/create/detail).
Next: Transactions (create + filters), Webhooks, API keys, and a live-demo tab
that visualizes concurrency (no oversell), idempotency dedup, and outbox→webhook.
