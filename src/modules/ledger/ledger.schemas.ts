import { z } from 'zod';

export const transferSchema = z.object({
  from_wallet_id: z.string().uuid(),
  to_wallet_id: z.string().uuid(),
  amount: z.number().int().positive(),
  metadata: z.record(z.unknown()).optional(),
});
export type TransferBody = z.infer<typeof transferSchema>;

export const listTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  type: z.enum(['transfer', 'credit', 'debit']).optional(),
  status: z.enum(['posted']).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
