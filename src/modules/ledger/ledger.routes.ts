import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validateBody, validateQuery } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { transferSchema, listTransactionsQuerySchema } from './ledger.schemas';
import {
  postTransactionHandler,
  getTransactionHandler,
  listTransactionsHandler,
} from './ledger.controller';

export const ledgerRouter = Router();

ledgerRouter.post(
  '/',
  authenticate,
  requirePermission('transaction:write'),
  validateBody(transferSchema),
  idempotency,
  asyncHandler(postTransactionHandler),
);
ledgerRouter.get(
  '/',
  authenticate,
  requirePermission('transaction:read'),
  validateQuery(listTransactionsQuerySchema),
  asyncHandler(listTransactionsHandler),
);
ledgerRouter.get(
  '/:id',
  authenticate,
  requirePermission('transaction:read'),
  asyncHandler(getTransactionHandler),
);
