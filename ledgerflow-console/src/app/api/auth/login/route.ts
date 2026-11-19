import { type NextRequest, NextResponse } from 'next/server';
import { API_URL, setTokens } from '@/lib/session';
import type { TokenPair } from '@/lib/types';

// The API is on Render's free tier, which sleeps when idle; the first request
// can take up to ~1 minute while it wakes. Let this handler wait that long.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const creds = await req.json();
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
    cache: 'no-store',
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: { message: 'Login failed' } }));
    return NextResponse.json(err, { status: r.status });
  }
  const tokens = (await r.json()) as TokenPair;
  await setTokens(tokens.access_token, tokens.refresh_token);
  return NextResponse.json({ ok: true });
}
