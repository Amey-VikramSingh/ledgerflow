import { cookies } from 'next/headers';

/**
 * Tokens live in httpOnly cookies set by our own route handlers. The browser
 * JS never reads them (mitigates XSS token theft); every API call goes through
 * the BFF proxy which attaches the access token server-side.
 *
 * Next 15+ makes cookies() async, so every helper here is async too.
 */
const ACCESS = 'lf_access';
const REFRESH = 'lf_refresh';

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export async function setTokens(access: string, refresh: string, maxAgeSec = 60 * 60 * 24 * 7): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS, access, { ...base, maxAge: 60 * 15 }); // access ~15m
  jar.set(REFRESH, refresh, { ...base, maxAge: maxAgeSec });
}

export async function clearTokens(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

export async function getAccess(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS)?.value;
}

export async function getRefresh(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH)?.value;
}

export async function isAuthed(): Promise<boolean> {
  return Boolean(await getRefresh());
}

// No trailing slash, so `${API_URL}/path` never produces a double slash.
export const API_URL = (process.env.LEDGERFLOW_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
