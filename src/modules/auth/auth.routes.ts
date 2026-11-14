import { Router } from 'express';
import { asyncHandler } from '../../shared/http';
import { validateBody } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  createApiKeySchema,
} from './auth.schemas';
import {
  register,
  loginHandler,
  refreshHandler,
  logoutHandler,
  me,
} from './auth.controller';
import {
  createApiKeyHandler,
  listApiKeysHandler,
  revokeApiKeyHandler,
} from './apikey.controller';

export const authRouter = Router();

// Session lifecycle
authRouter.post('/register', validateBody(registerSchema), asyncHandler(register));
authRouter.post('/login', validateBody(loginSchema), asyncHandler(loginHandler));
authRouter.post('/refresh', validateBody(refreshSchema), asyncHandler(refreshHandler));
authRouter.post('/logout', validateBody(refreshSchema), asyncHandler(logoutHandler));
authRouter.get('/me', requireAuth, asyncHandler(me));

// API key management — requires the apikey:manage permission (owner/admin)
authRouter.post(
  '/api-keys',
  requireAuth,
  requirePermission('apikey:manage'),
  validateBody(createApiKeySchema),
  asyncHandler(createApiKeyHandler),
);
authRouter.get(
  '/api-keys',
  requireAuth,
  requirePermission('apikey:manage'),
  asyncHandler(listApiKeysHandler),
);
authRouter.delete(
  '/api-keys/:id',
  requireAuth,
  requirePermission('apikey:manage'),
  asyncHandler(revokeApiKeyHandler),
);
