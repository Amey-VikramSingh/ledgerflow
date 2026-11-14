import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors';
import type { Permission } from '../modules/auth/rbac';

/**
 * Authorize the current principal for a specific permission. Runs AFTER an
 * authentication middleware has populated req.user. Returns 403 (authenticated
 * but not allowed) — distinct from 401 (not authenticated).
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!req.user.permissions.includes(permission)) {
      next(new ForbiddenError(`missing permission: ${permission}`));
      return;
    }
    next();
  };
}
