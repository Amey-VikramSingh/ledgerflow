import './telemetry/otel'; // must be first — patches libraries on load
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

server.on('error', (err) => {
  logger.fatal({ err }, 'http server failed to start');
  process.exit(1);
});

/**
 * Graceful shutdown: on SIGTERM/SIGINT stop accepting new connections,
 * drain in-flight requests, then close the pool and Redis. If it takes
 * too long, force-exit so the orchestrator isn't left waiting.
 */
let shuttingDown = false;

function shutdown(reason: string, exitCode = 0): void {
  // A second signal (e.g. Ctrl+C twice) must not close the pool twice.
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ reason }, 'shutdown initiated');

  const forceExit = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(() => {
    Promise.all([pool.end(), redis.quit()])
      .then(() => {
        logger.info('clean shutdown complete');
        process.exit(exitCode);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'error during shutdown');
        process.exit(1);
      });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// A bug that escapes every handler leaves the process in an unknown state:
// log it, then shut down cleanly and let the orchestrator restart us.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  shutdown('uncaughtException', 1);
});
