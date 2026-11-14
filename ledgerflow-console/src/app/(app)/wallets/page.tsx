'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useWallets, useCreateWallet } from '@/hooks/use-wallets';
import { PageHeading } from '@/components/page-heading';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Money } from '@/components/money';
import { Empty } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyButton } from '@/components/ui/copy';
import { formatRelative } from '@/lib/format';

export default function WalletsPage() {
  const wallets = useWallets();
  const create = useCreateWallet();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState('INR');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await create.mutateAsync(currency.toUpperCase());
    setOpen(false);
    setCurrency('INR');
  }

  return (
    <>
      <PageHeading
        title="Wallets"
        subtitle="Accounts that hold balances. New wallets start at zero."
        action={<Button onClick={() => setOpen((v) => !v)}><Plus className="h-4 w-4" /> New wallet</Button>}
      />

      {open && (
        <Card className="mb-4 animate-fade-up">
          <form onSubmit={submit} className="flex items-end gap-3 p-4">
            <div className="w-40">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} placeholder="INR" />
            </div>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create wallet'}</Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </form>
        </Card>
      )}

      <Card>
        {wallets.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : wallets.data?.data.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-fg-muted">
                <th className="px-5 py-3 font-medium">Wallet</th>
                <th className="px-5 py-3 font-medium">Currency</th>
                <th className="px-5 py-3 font-medium text-right">Balance</th>
                <th className="px-5 py-3 font-medium text-right">Version</th>
                <th className="px-5 py-3 font-medium text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {wallets.data.data.map((w) => (
                <tr key={w.id} className="group hover:bg-ink-700/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/wallets/${w.id}`} className="font-mono text-2xs text-fg hover:text-action">{w.id.slice(0, 13)}…</Link>
                      <CopyButton value={w.id} className="opacity-0 group-hover:opacity-100" />
                    </div>
                  </td>
                  <td className="px-5 py-3 text-fg-muted">{w.currency}</td>
                  <td className="px-5 py-3 text-right"><Money minor={w.balance} currency={w.currency} /></td>
                  <td className="px-5 py-3 text-right font-mono tabular text-2xs text-fg-faint">{w.version}</td>
                  <td className="px-5 py-3 text-right font-mono text-2xs text-fg-faint">{formatRelative(w.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty
            title="No wallets yet"
            hint="Create your first wallet to start holding and moving balances."
            action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New wallet</Button>}
          />
        )}
      </Card>
    </>
  );
}
