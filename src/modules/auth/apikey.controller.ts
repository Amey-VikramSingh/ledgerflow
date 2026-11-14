import type { Request, Response } from 'express';
import { createApiKey, listApiKeys, revokeApiKey } from './apikey.service';
import { NotFoundError, UnauthorizedError } from '../../shared/errors';

export async function createApiKeyHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { name, scopes } = req.body;
  const key = await createApiKey(req.user.tenantId, name, scopes);
  // The raw api_key is returned ONCE. Warn the caller it won't be shown again.
  res.status(201).json({ ...key, message: 'Store this key now — it will not be shown again.' });
}

export async function listApiKeysHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const keys = await listApiKeys(req.user.tenantId);
  res.status(200).json({ data: keys });
}

export async function revokeApiKeyHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const revoked = await revokeApiKey(req.user.tenantId, req.params.id!);
  if (!revoked) throw new NotFoundError('api key not found or already revoked');
  res.status(204).send();
}
