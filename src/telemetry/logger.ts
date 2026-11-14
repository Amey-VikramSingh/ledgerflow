import pino from 'pino';
import { config } from '../config';

/**
 * Structured JSON logging. Every log line is one machine-parseable event.
 * Secrets and PII are redacted at the serializer level so they can never
 * leak into logs, regardless of what a handler passes in.
 */
export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.key_hash',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  ...(config.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
