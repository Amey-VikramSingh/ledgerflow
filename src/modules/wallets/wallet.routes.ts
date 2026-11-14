import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validateBody, validateQuery } from '../../middleware/validate';
import { createWalletSchema, listWalletsQuerySchema } from './wallet.schemas';
import {
  createWalletHandler,
  getWalletHandler,
  listWalletsHandler,
} from './wallet.controller';

export const walletRouter = Router();

walletRouter.post(
  '/',
  authenticate,
  requirePermission('wallet:write'),
  validateBody(createWalletSchema),
  asyncHandler(createWalletHandler),
);
walletRouter.get(
  '/',
  authenticate,
  requirePermission('wallet:read'),
  validateQuery(listWalletsQuerySchema),
  asyncHandler(listWalletsHandler),
);
walletRouter.get(
  '/:id',
  authenticate,
  requirePermission('wallet:read'),
  asyncHandler(getWalletHandler),
);
