import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../shared/errors';
import { verifyAccessToken } from '../modules/auth/auth.service';
import { resolveApiKey } from '../modules/auth/apikey.service';
import { permissionsForRole } from '../modules/auth/rbac';

/**
 * requireAuth: JWT-only. For user/dashboard routes (e.g. /auth/me, api-key
 * management). Stateless — verifies the self-contained access token, no DB hit.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('missing bearer token'));
    return;
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      tenantId: payload.tenant_id,
      role: payload.role,
      kind: 'user',
      permissions: permissionsForRole(payload.role),
    };
    next();
  } catch {
    next(new UnauthorizedError('invalid or expired token'));
  }
}

/**
 * authenticate: accepts EITHER a user JWT (Authorization: Bearer <jwt>) OR an
 * API key (X-API-Key: lk_live_…). Used on programmatic/business routes so
 * both humans and machines can call them. The resulting principal carries a
 * `permissions` list (role-derived for users, scopes for keys) that RBAC reads.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  void _authenticate(req, res).then(next).catch(next);
}

async function _authenticate(req: Request, _res: Response): Promise<void> {
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
    const resolved = await resolveApiKey(apiKeyHeader);
    if (!resolved) throw new UnauthorizedError('invalid api key');
    req.user = {
      id: resolved.id,
      tenantId: resolved.tenantId,
      role: 'api_key',
      kind: 'api_key',
      permissions: resolved.scopes,
    };
    return;
  }

  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice('Bearer '.length));
      req.user = {
        id: payload.sub,
        tenantId: payload.tenant_id,
        role: payload.role,
        kind: 'user',
        permissions: permissionsForRole(payload.role),
      };
      return;
    } catch {
      throw new UnauthorizedError('invalid or expired token');
    }
  }

  throw new UnauthorizedError('authentication required');
}
