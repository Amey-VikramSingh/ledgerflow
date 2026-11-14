import { NextResponse } from 'next/server';
import { API_URL, getRefresh, clearTokens } from '@/lib/session';

export async function POST() {
  const refresh = getRefresh();
  if (refresh) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  clearTokens();
  return NextResponse.json({ ok: true });
}
