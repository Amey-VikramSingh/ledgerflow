import type { Request, Response } from 'express';
import { postTransfer, getTransaction, listTransactions } from './ledger.service';
import { decodeCursor, paginate } from '../../shared/pagination';
import { NotFoundError, UnauthorizedError } from '../../shared/errors';
import type { ListTransactionsQuery } from './ledger.schemas';

export async function postTransactionHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const result = await postTransfer(req.user.tenantId, req.body);
  res.status(201).json(result);
}

export async function getTransactionHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const tx = await getTransaction(req.user.tenantId, req.params.id!);
  if (!tx) throw new NotFoundError('transaction not found');
  res.status(200).json(tx);
}

export async function listTransactionsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const q = res.locals.query as ListTransactionsQuery;
  const rows = await listTransactions(req.user.tenantId, {
    limit: q.limit,
    cursor: q.cursor ? decodeCursor(q.cursor) : undefined,
    type: q.type,
    status: q.status,
    from_date: q.from_date,
    to_date: q.to_date,
  });
  res.status(200).json(paginate(rows, q.limit));
}
