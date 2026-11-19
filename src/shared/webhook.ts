import { createHmac } from 'node:crypto';
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';
import { config } from '../config';
import { publicOnlyLookup, validateWebhookUrl } from './net-guard';

/**
 * Sign the webhook body as HMAC-SHA256 over `${timestamp}.${body}`.
 * Including the timestamp lets receivers reject replayed deliveries.
 * Consumers verify by recomputing this with their shared secret.
 */
export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Whether webhook URLs may target private/internal addresses (dev only). */
export function allowPrivateWebhookUrls(): boolean {
  if (config.WEBHOOK_ALLOW_PRIVATE_URLS !== undefined) {
    return config.WEBHOOK_ALLOW_PRIVATE_URLS === 'true';
  }
  return config.NODE_ENV !== 'production';
}

// Every delivery connects through this agent, whose DNS lookup refuses
// private/internal addresses (SSRF guard, checked at connect time).
const publicOnlyAgent = new Agent({ connect: { lookup: publicOnlyLookup } });
const anyAgent = new Agent();

/**
 * POST a webhook with a hard timeout. Redirects are NOT followed: a 3xx is a
 * failed delivery, so a receiver can't bounce the request to an internal URL.
 */
export async function fetchWithTimeout(
  url: string,
  init: UndiciRequestInit,
  timeoutMs: number,
): Promise<{ status: number }> {
  // Re-check on every delivery: endpoints saved before this rule existed may
  // hold internal URLs, and IP-literal URLs skip the DNS lookup guard below.
  const allowPrivate = allowPrivateWebhookUrls();
  const problem = validateWebhookUrl(url, { allowPrivate });
  if (problem) throw new Error(`webhook url rejected: ${problem}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await undiciFetch(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
      dispatcher: allowPrivate ? anyAgent : publicOnlyAgent,
    });
    // Drain the body so the connection is released.
    await res.arrayBuffer().catch(() => undefined);
    return { status: res.status };
  } finally {
    clearTimeout(timer);
  }
}
