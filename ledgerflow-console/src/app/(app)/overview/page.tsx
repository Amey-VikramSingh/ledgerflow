'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useWallets } from '@/hooks/use-wallets';
import { useRecentTransactions } from '@/hooks/use-transactions';
import { PageHeading } from '@/components/page-heading';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/money';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney, formatRelative, shortId } from '@/lib/format';

export default function OverviewPage() {
  const wallets = useWallets();
  const txns = useRecentTransactions(9);

  const totalMinor = useMemo(
    () => (wallets.data?.data ?? []).reduce((sum, w) => sum + Number(w.balance), 0),
    [wallets.data],
  );
  const byBalance = useMemo(
    () => [...(wallets.data?.data ?? [])].sort((a, b) => Number(b.balance) - Number(a.balance)),
    [wallets.data],
  );

  return (
    <>
      <PageHeading title="Overview" subtitle="The state of your ledger, at a glance." />

      {/* Stat row — held balances, conserved. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="pt-5">
            <p className="text-2xs uppercase tracking-wider text-fg-muted">Held balance</p>
            {wallets.isLoading ? (
              <Skeleton className="mt-2 h-8 w-40" />
            ) : (
              <p className="mt-1 font-mono tabular text-2xl font-medium text-fg">{formatMoney(totalMinor)}</p>
            )}
            <p className="mt-2 text-2xs text-fg-faint">Sum across all wallets · moves, never leaks</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="pt-5">
            <p className="text-2xs uppercase tracking-wider text-fg-muted">Wallets</p>
            {wallets.isLoading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-mono tabular text-2xl font-medium text-fg">{wallets.data?.data.length ?? 0}</p>
            )}
            <p className="mt-2 text-2xs text-fg-faint">Accounts in this tenant</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="pt-5">
            <p className="text-2xs uppercase tracking-wider text-fg-muted">Recent transfers</p>
            {txns.isLoading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 font-mono tabular text-2xl font-medium text-fg">{txns.data?.data.length ?? 0}</p>
            )}
            <p className="mt-2 text-2xs text-fg-faint">Latest postings to the journal</p>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Journal tape — the signature. */}
        <Card>
          <CardHeader>
            <CardTitle>Journal</CardTitle>
            <Link href="/transactions" className="text-2xs text-action hover:text-action-hover">View all →</Link>
          </CardHeader>
          <CardBody className="pt-0">
            {txns.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : txns.data?.data.length ? (
              <ul className="divide-y divide-line">
                {txns.data.data.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xs text-fg-muted">{shortId(t.id)}</span>
                      <span className="text-sm text-fg">{t.type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="credit">{t.status}</Badge>
                      <span className="w-16 text-right font-mono text-2xs text-fg-faint">{formatRelative(t.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-fg-muted">No postings yet. Move money on the Transactions tab.</p>
            )}
          </CardBody>
        </Card>

        {/* Top wallets. */}
        <Card>
          <CardHeader>
            <CardTitle>Wallets by balance</CardTitle>
            <Link href="/wallets" className="text-2xs text-action hover:text-action-hover">Manage →</Link>
          </CardHeader>
          <CardBody className="pt-0">
            {wallets.isLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : byBalance.length ? (
              <ul className="divide-y divide-line">
                {byBalance.slice(0, 6).map((w) => (
                  <li key={w.id} className="flex items-center justify-between py-2.5">
                    <Link href={`/wallets/${w.id}`} className="font-mono text-2xs text-fg-muted hover:text-fg">{shortId(w.id)}</Link>
                    <Money minor={w.balance} currency={w.currency} className="text-sm" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-fg-muted">No wallets yet.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
