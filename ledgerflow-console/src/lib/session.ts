import { cookies } from 'next/headers';

/**
 * Tokens live in httpOnly cookies set by our own route handlers. The browser
 * JS never reads them (mitigates XSS token theft); every API call goes through
 * the BFF proxy which attaches the access token server-side.
 */
const ACCESS = 'lf_access';
const REFRESH = 'lf_refresh';

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export function setTokens(access: string, refresh: string, maxAgeSec = 60 * 60 * 24 * 7): void {
  const jar = cookies();
  jar.set(ACCESS, access, { ...base, maxAge: 60 * 15 }); // access ~15m
  jar.set(REFRESH, refresh, { ...base, maxAge: maxAgeSec });
}

export function clearTokens(): void {
  const jar = cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

export function getAccess(): string | undefined {
  return cookies().get(ACCESS)?.value;
}

export function getRefresh(): string | undefined {
  return cookies().get(REFRESH)?.value;
}

export function isAuthed(): boolean {
  return Boolean(getRefresh());
}

export const API_URL = process.env.LEDGERFLOW_API_URL ?? 'http://localhost:3000';
