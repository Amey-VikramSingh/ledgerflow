import { createApp } from './app';
import { config } from './config';
import { logger } from './telemetry/logger';
import { pool } from './db/pool';
import { redis } from './redis/client';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    'ledgerflow api listening',
  );
});

/**
 * Graceful shutdown: on SIGTERM/SIGINT stop accepting new connections,
 * drain in-flight requests, then close the pool and Redis. If it takes
 * too long, force-exit so the orchestrator isn't left waiting.
 * Reviewers check for this — a service that dies mid-request loses data.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutdown initiated');

  const forceExit = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async () => {
    try {
      await pool.end();
      await redis.quit();
      logger.info('clean shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
