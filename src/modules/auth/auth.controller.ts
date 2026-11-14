import type { Request, Response } from 'express';
import { registerOrg, login, refresh, logout, getUserById } from './auth.service';
import { UnauthorizedError } from '../../shared/errors';

export async function register(req: Request, res: Response): Promise<void> {
  const user = await registerOrg(req.body);
  res.status(201).json({ id: user.id, email: user.email, tenant_id: user.tenant_id });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const tokens = await login(req.body);
  res.status(200).json(tokens);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  const tokens = await refresh(req.body.refresh_token);
  res.status(200).json(tokens);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  await logout(req.body.refresh_token);
  res.status(204).send();
}

/** Protected: demonstrates requireAuth resolving req.user from the JWT. */
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const user = await getUserById(req.user.id);
  if (!user) throw new UnauthorizedError();
  res.status(200).json(user);
}
