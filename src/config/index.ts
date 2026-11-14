import 'dotenv/config';
import { z } from 'zod';

/**
 * Config is validated ONCE at boot. If anything is missing or malformed,
 * the process exits immediately with a clear message rather than failing
 * mysteriously deep in a request handler. This is the "fail-fast" principle:
 * a misconfigured service should refuse to start, not half-run.
 */

/** The key shipped in .env.example — fine for local dev, never for production. */
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

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: urlWithProtocol(
      ['postgres:', 'postgresql:'],
      'DATABASE_URL must be a postgres:// or postgresql:// URL',
    ),
    REDIS_URL: urlWithProtocol(
      ['redis:', 'rediss:'],
      'REDIS_URL must be a redis:// or rediss:// URL',
    ),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    // AES-256-GCM key (32 bytes, base64) used to encrypt secrets at rest,
    // e.g. webhook signing secrets. Generate one with:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    SECRETS_ENCRYPTION_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, {
        message: 'SECRETS_ENCRYPTION_KEY must be 32 bytes, base64-encoded',
      }),
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
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = Object.freeze(parsed.data);
export type Config = typeof config;
