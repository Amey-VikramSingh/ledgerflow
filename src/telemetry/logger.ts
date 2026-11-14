import pino from 'pino';
import { config } from '../config';

/**
 * Structured JSON logging. Every log line is one machine-parseable event.
 *
 * Redaction is a safety net, not a guarantee: pino matches fixed paths, so the
 * list below covers known-sensitive headers plus sensitive keys up to three
 * levels deep. Handlers should still avoid logging secrets in the first place.
 */
const SENSITIVE_KEYS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'token_hash',
  'key_hash',
  'api_key',
  'secret',
  'secret_ciphertext',
  'authorization',
];

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

/**
 * pino-pretty is a dev dependency. A production-style install (the Docker
 * image) doesn't have it, so only use it when it can actually be resolved —
 * otherwise fall back to plain JSON instead of crashing at boot.
 */
function prettyTransportAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const usePretty = config.NODE_ENV === 'development' && prettyTransportAvailable();

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  ...(usePretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});
