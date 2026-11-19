import 'dotenv/config';
import { z } from 'zod';

/**
 * Config is validated ONCE at boot. If anything is missing or malformed,
 * the process exits immediately with a clear message rather than failing
 * mysteriously deep in a request handler. This is the "fail-fast" principle:
 * a misconfigured service should refuse to start, not half-run.
 */
/** Values shipped in .env.example — fine for local dev, never for production. */
const DEV_ONLY_JWT_SECRET = 'dev-only-change-me-to-a-long-random-string-min-32-chars';
const DEV_ONLY_SECRETS_KEY = 'bGVkZ2VyZmxvdy1kZXYtb25seS1rZXktMzJieXRlcyE=';

/** A URL string restricted to specific schemes (e.g. only postgres://). */
function urlWithProtocol(protocols: string[], message: string) {
  return z.string().refine((value) => {
    try {
      return protocols.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, { message });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: urlWithProtocol(
    ['postgres:', 'postgresql:'],
    'DATABASE_URL must be a postgres:// or postgresql:// URL',
  ),
  REDIS_URL: urlWithProtocol(['redis:', 'rediss:'], 'REDIS_URL must be a redis:// or rediss:// URL'),

  // AES-256-GCM key (32 bytes, base64) for secrets stored in the database,
  // e.g. webhook signing secrets. Generate one with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, {
      message: 'SECRETS_ENCRYPTION_KEY must be 32 bytes, base64-encoded',
    }),
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
  // Allow webhook URLs that resolve to private/internal addresses (localhost,
  // 10.x, 169.254.x, ...). Unset means: allowed outside production only.
  // Never enable in production: it lets any tenant make the worker send
  // requests into your internal network (SSRF).
  WEBHOOK_ALLOW_PRIVATE_URLS: z.enum(['true', 'false']).optional(),

  // How many reverse proxies sit in front of the app, so req.ip is the real
  // client and not a proxy. Render: 2 (edge + load balancer). Fly.io / a
  // single load balancer: 1. 0 when the app is reached directly.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

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
  // Bearer token required to read the API's /metrics. In production, /metrics
  // is disabled (404) unless this is set; elsewhere it is open for local
  // Prometheus.
  METRICS_TOKEN: z.string().min(16).optional(),
})
  .refine((env) => env.NODE_ENV !== 'production' || env.JWT_SECRET !== DEV_ONLY_JWT_SECRET, {
    path: ['JWT_SECRET'],
    message: 'the example dev secret must not be used in production — generate a real one',
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.SECRETS_ENCRYPTION_KEY !== DEV_ONLY_SECRETS_KEY,
    {
      path: ['SECRETS_ENCRYPTION_KEY'],
      message: 'the example dev key must not be used in production — generate a real one',
    },
  );

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = Object.freeze(parsed.data);
export type Config = typeof config;
