import { createHmac } from 'node:crypto';

/**
 * Sign the webhook body as HMAC-SHA256 over `${timestamp}.${body}`.
 * Including the timestamp lets receivers reject replayed deliveries.
 * Consumers verify by recomputing this with their shared secret.
 */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** fetch with a hard timeout via AbortController. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
