import { type NextRequest, NextResponse } from 'next/server';
import { API_URL, getAccess, getRefresh, setTokens, clearTokens } from '@/lib/session';
import type { TokenPair } from '@/lib/types';

/**
 * Backend-for-Frontend proxy. Every /api/lf/* call is forwarded to LedgerFlow
 * with the access token attached server-side. On a 401 we transparently rotate
 * the refresh token once and retry — so the browser never handles a token and
 * never sees an auth blip. Idempotency-Key and query strings are preserved.
 */
export const dynamic = 'force-dynamic';

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const search = req.nextUrl.search;
  const target = `${API_URL}/${path.join('/')}${search}`;
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();

  const headers = new Headers();
  headers.set('content-type', req.headers.get('content-type') ?? 'application/json');
  const idem = req.headers.get('idempotency-key');
  if (idem) headers.set('Idempotency-Key', idem);

  const doFetch = (token?: string): Promise<Response> => {
    const h = new Headers(headers);
    if (token) h.set('authorization', `Bearer ${token}`);
    return fetch(target, { method: req.method, headers: h, body, cache: 'no-store' });
  };

  let upstream = await doFetch(getAccess());

  // Access expired → try one refresh + retry.
  let rotated: TokenPair | null = null;
  if (upstream.status === 401 && getRefresh()) {
    const r = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: getRefresh() }),
      cache: 'no-store',
    });
    if (r.ok) {
      rotated = (await r.json()) as TokenPair;
      upstream = await doFetch(rotated.access_token);
    } else {
      clearTokens();
    }
  }

  const payload = await upstream.text();
  const res = new NextResponse(payload, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  });
  if (rotated) setTokens(rotated.access_token, rotated.refresh_token);
  return res;
}

export const GET = (req: NextRequest, ctx: { params: { path: string[] } }) => forward(req, ctx.params.path);
export const POST = (req: NextRequest, ctx: { params: { path: string[] } }) => forward(req, ctx.params.path);
export const PATCH = (req: NextRequest, ctx: { params: { path: string[] } }) => forward(req, ctx.params.path);
export const DELETE = (req: NextRequest, ctx: { params: { path: string[] } }) => forward(req, ctx.params.path);
