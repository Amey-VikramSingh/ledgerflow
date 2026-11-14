/**
 * Classifies errors raised by Express/body-parser for a bad request
 * (malformed JSON, oversized body, unsupported encoding…). They carry a 4xx
 * status and `expose: true`: the client's fault, not an internal error.
 *
 * Kept free of app imports (config, logger) so it can be unit-tested
 * without a configured environment.
 */
export interface ClientErrorEnvelope {
  status: number;
  type: string;
  message: string;
}

const KNOWN: Record<string, { type: string; message: string }> = {
  'entity.parse.failed': { type: 'invalid_json', message: 'Request body is not valid JSON' },
  'entity.too.large': { type: 'payload_too_large', message: 'Request body is too large' },
};

const GENERIC = { type: 'bad_request', message: 'The request could not be processed' };

export function classifyClientError(err: unknown): ClientErrorEnvelope | null {
  if (typeof err !== 'object' || err === null) return null;
  const candidate = err as {
    status?: unknown;
    statusCode?: unknown;
    expose?: unknown;
    type?: unknown;
  };
  const status = candidate.status ?? candidate.statusCode;
  if (typeof status !== 'number' || status < 400 || status > 499) return null;
  if (candidate.expose !== true) return null;
  const known = typeof candidate.type === 'string' ? KNOWN[candidate.type] : undefined;
  return { status, ...(known ?? GENERIC) };
}
