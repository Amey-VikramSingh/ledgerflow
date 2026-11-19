import { type NextRequest, NextResponse } from 'next/server';
import { API_URL, setTokens } from '@/lib/session';
import type { TokenPair } from '@/lib/types';

// The API is on Render's free tier, which sleeps when idle; the first request
// can take up to ~1 minute while it wakes. Let this handler wait that long.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!reg.ok) {
    const err = await reg.json().catch(() => ({ error: { message: 'Registration failed' } }));
    return NextResponse.json(err, { status: reg.status });
  }
  // Auto-login after successful registration.
  const login = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: 'no-store',
  });
  if (!login.ok) return NextResponse.json({ ok: true, login: false });
  const tokens = (await login.json()) as TokenPair;
  await setTokens(tokens.access_token, tokens.refresh_token);
  return NextResponse.json({ ok: true });
}
