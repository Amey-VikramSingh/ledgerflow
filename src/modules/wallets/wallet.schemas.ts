import { z } from 'zod';

export const createWalletSchema = z.object({
  currency: z.string().length(3).default('INR'),
});
export type CreateWalletInput = z.infer<typeof createWalletSchema>;

export const listWalletsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListWalletsQuery = z.infer<typeof listWalletsQuerySchema>;
