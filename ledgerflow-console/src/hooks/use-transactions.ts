'use client';
import { useQuery } from '@tanstack/react-query';
import { lf } from '@/lib/api';
import type { Page, Transaction } from '@/lib/types';

export function useRecentTransactions(limit = 8) {
  return useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: () => lf.get<Page<Transaction>>(`v1/transactions?limit=${limit}`),
  });
}
