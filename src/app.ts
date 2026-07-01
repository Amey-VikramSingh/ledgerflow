import express, { type Express } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from './telemetry/logger';
import { healthRouter } from './modules/health/health.routes';
import { errorHandler, notFoundHandler } from './middleware/error';

/**
 * App factory. Kept separate from server.ts so tests can import the app
 * without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Security headers.
  app.use(helmet());

  // JSON body parsing with a sane limit.
  app.use(express.json({ limit: '1mb' }));

  // Attach a request id and structured request logging. The id flows into
  // every log line and error envelope, setting up correlation for tracing.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );

  // Routes.
  app.use('/health', healthRouter);

  // 404 + centralized error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
