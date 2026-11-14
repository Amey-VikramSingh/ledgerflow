import express, { type Express } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import { config } from './config';
import { logger } from './telemetry/logger';
import { httpMetrics, metricsHandler } from './telemetry/metrics';
import { rateLimit } from './middleware/ratelimit';
import { healthRouter } from './modules/health/health.routes';
import { authRouter } from './modules/auth/auth.routes';
import { walletRouter } from './modules/wallets/wallet.routes';
import { ledgerRouter } from './modules/ledger/ledger.routes';
import { webhookRouter } from './modules/webhooks/webhook.routes';
import { errorHandler, notFoundHandler } from './middleware/error';

export function createApp(): Express {
  const app = express();

  // Behind a load balancer (ALB) — trust the proxy for correct req.ip.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(httpMetrics);

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

  // Global per-IP rate limit.
  app.use(
    rateLimit({
      points: config.RATE_LIMIT_POINTS,
      durationSec: config.RATE_LIMIT_DURATION_SEC,
      prefix: 'global',
      by: 'ip',
    }),
  );

  // Operational endpoints (no rate limit needed).
  app.use('/health', healthRouter);
  app.get('/metrics', metricsHandler);

  // API docs.
  const openapi = yaml.load(
    readFileSync(path.join(process.cwd(), 'openapi.yaml'), 'utf8'),
  ) as swaggerUi.JsonObject;
  app.get('/openapi.json', (_req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  // Auth routes get a stricter per-IP limit.
  app.use(
    '/auth',
    rateLimit({
      points: config.AUTH_RATE_LIMIT_POINTS,
      durationSec: config.AUTH_RATE_LIMIT_DURATION_SEC,
      prefix: 'auth',
      by: 'ip',
    }),
    authRouter,
  );

  app.use('/v1/wallets', walletRouter);
  app.use('/v1/transactions', ledgerRouter);
  app.use('/v1/webhook-endpoints', webhookRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
