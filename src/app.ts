import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './telemetry/logger';
import { healthRouter } from './modules/health/health.routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { resolveRequestId } from './shared/request-id';

/**
 * App factory. Kept separate from server.ts so tests can import the app
 * without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Security headers.
  app.use(helmet());

  // Attach a request id and structured request logging. This runs BEFORE body
  // parsing so that a request rejected by the parser (malformed JSON, body too
  // large) is still logged and still gets a request id in its error envelope.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = resolveRequestId(req.headers['x-request-id']);
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );

  // JSON body parsing with a sane limit.
  app.use(express.json({ limit: '1mb' }));

  // Routes.
  app.use('/health', healthRouter);

  // 404 + centralized error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
