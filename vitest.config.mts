import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The config module validates the environment at import time, so tests
    // need a complete (fake) environment. Nothing here is ever connected to:
    // the Postgres pool and Redis client are mocked in the tests.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'fatal',
      DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      SECRETS_ENCRYPTION_KEY: 'bGVkZ2VyZmxvdy1kZXYtb25seS1rZXktMzJieXRlcyE=',
    },
  },
});
