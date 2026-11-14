import { randomUUID } from 'node:crypto';

/**
 * A client may supply its own `x-request-id` for end-to-end correlation, but
 * the value is untrusted input that ends up in response headers and log
 * lines. Only accept short, plain tokens; anything else (empty, oversized,
 * repeated header, odd characters) is replaced with a fresh UUID.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header)) {
    return header;
  }
  return randomUUID();
}
