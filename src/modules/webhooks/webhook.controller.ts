import type { Request, Response } from 'express';
import { createEndpoint, listEndpoints } from './webhook.service';
import { UnauthorizedError } from '../../shared/errors';

export async function createEndpointHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const endpoint = await createEndpoint(req.user.tenantId, req.body.url, req.body.secret);
  res.status(201).json({ ...endpoint, message: 'Store the secret — used to verify signatures.' });
}

export async function listEndpointsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const endpoints = await listEndpoints(req.user.tenantId);
  res.status(200).json({ data: endpoints });
}
