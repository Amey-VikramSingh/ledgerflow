import 'dotenv/config';
import { z } from 'zod';

/**
 * Config is validated ONCE at boot. If anything is missing or malformed,
 * the process exits immediately with a clear message rather than failing
 * mysteriously deep in a request handler. This is the "fail-fast" principle:
 * a misconfigured service should refuse to start, not half-run.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid postgres URL' }),
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid redis URL' }),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // Auth. JWT_SECRET must be long/random in every environment.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15m
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  // Worker / webhooks
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // Rate limiting (token bucket)
  RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_DURATION_SEC: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_DURATION_SEC: z.coerce.number().int().positive().default(60),

  // Cache
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(30),

  // Observability
  OTEL_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().default('ledgerflow'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  METRICS_PORT: z.coerce.number().int().positive().default(9100),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = Object.freeze(parsed.data);
export type Config = typeof config;
