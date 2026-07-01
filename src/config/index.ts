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
