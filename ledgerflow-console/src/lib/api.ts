import type { ApiError } from './types';

/** Client-side fetch to the BFF. Tokens are handled by the proxy, not here. */
export class ApiClientError extends Error {
  constructor(public status: number, public type: string, message: string) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = (body as ApiError)?.error;
    throw new ApiClientError(res.status, e?.type ?? 'error', e?.message ?? 'Request failed');
  }
  return body as T;
}

export const lf = {
  get: <T>(path: string) => fetch(`/api/lf/${path}`, { cache: 'no-store' }).then(handle<T>),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    fetch(`/api/lf/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }).then(handle<T>),
  del: <T>(path: string) => fetch(`/api/lf/${path}`, { method: 'DELETE' }).then(handle<T>),
};

export const auth = {
  login: (email: string, password: string) =>
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(handle<{ ok: boolean }>),
  register: (email: string, password: string, orgName: string) =>
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, orgName }),
    }).then(handle<{ ok: boolean }>),
  logout: () => fetch('/api/auth/logout', { method: 'POST' }).then(handle<{ ok: boolean }>),
};

/** RFC4122-ish id for Idempotency-Key headers (crypto.randomUUID in browser). */
export const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
