import type { Request, Response } from 'express';
import { createWallet, getWallet, listWallets } from './wallet.service';
import { decodeCursor, paginate } from '../../shared/pagination';
import { NotFoundError, UnauthorizedError } from '../../shared/errors';
import type { ListWalletsQuery } from './wallet.schemas';

export async function createWalletHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const wallet = await createWallet(req.user.tenantId, req.body.currency);
  res.status(201).json(wallet);
}

export async function getWalletHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const wallet = await getWallet(req.user.tenantId, req.params.id!);
  if (!wallet) throw new NotFoundError('wallet not found');
  res.status(200).json(wallet);
}

export async function listWalletsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const q = res.locals.query as ListWalletsQuery;
  const rows = await listWallets(req.user.tenantId, {
    limit: q.limit,
    cursor: q.cursor ? decodeCursor(q.cursor) : undefined,
  });
  res.status(200).json(paginate(rows, q.limit));
}
