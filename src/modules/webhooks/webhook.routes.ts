import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { createEndpointSchema } from './webhook.schemas';
import { createEndpointHandler, listEndpointsHandler } from './webhook.controller';

export const webhookRouter = Router();

webhookRouter.post(
  '/',
  authenticate,
  requirePermission('webhook:manage'),
  validateBody(createEndpointSchema),
  asyncHandler(createEndpointHandler),
);
webhookRouter.get(
  '/',
  authenticate,
  requirePermission('webhook:manage'),
  asyncHandler(listEndpointsHandler),
);
