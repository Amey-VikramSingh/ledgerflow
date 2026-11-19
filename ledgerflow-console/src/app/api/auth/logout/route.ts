import { NextResponse } from 'next/server';
import { API_URL, getRefresh, clearTokens } from '@/lib/session';

// The API is on Render's free tier, which sleeps when idle; the first request
// can take up to ~1 minute while it wakes. Let this handler wait that long.
export const maxDuration = 60;

export async function POST() {
  const refresh = await getRefresh();
  if (refresh) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  await clearTokens();
  return NextResponse.json({ ok: true });
}
