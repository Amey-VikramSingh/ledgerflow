'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lf } from '@/lib/api';
import type { Page, Wallet } from '@/lib/types';

export function useWallets(limit = 50) {
  return useQuery({
    queryKey: ['wallets', limit],
    queryFn: () => lf.get<Page<Wallet>>(`v1/wallets?limit=${limit}`),
  });
}

export function useWallet(id: string) {
  return useQuery({
    queryKey: ['wallet', id],
    queryFn: () => lf.get<Wallet>(`v1/wallets/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (currency: string) => lf.post<Wallet>('v1/wallets', { currency }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  });
}
