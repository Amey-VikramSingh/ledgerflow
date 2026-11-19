'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useWallet } from '@/hooks/use-wallets';
import { PageHeading } from '@/components/page-heading';
import { Card, CardBody } from '@/components/ui/card';
import { Money } from '@/components/money';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyButton } from '@/components/ui/copy';
import { formatRelative } from '@/lib/format';

export default function WalletDetailPage() {
  // Client component: read the route param with useParams (page props.params is a Promise in Next 15+).
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet(id);

  return (
    <>
      <Link href="/wallets" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Wallets
      </Link>
      <PageHeading title="Wallet" subtitle="A single account in the ledger." />

      {wallet.isLoading ? (
        <Skeleton className="h-40 w-full max-w-xl" />
      ) : wallet.isError ? (
        <Card><CardBody className="py-10 text-center text-sm text-debit">This wallet could not be found in your tenant.</CardBody></Card>
      ) : wallet.data ? (
        <Card className="max-w-xl">
          <CardBody className="pt-6">
            <p className="text-2xs uppercase tracking-wider text-fg-muted">Balance</p>
            <Money minor={wallet.data.balance} currency={wallet.data.currency} className="mt-1 block text-4xl font-medium" />
            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 text-sm">
              <Field label="Wallet ID"><span className="font-mono text-2xs">{wallet.data.id}</span><CopyButton value={wallet.data.id} /></Field>
              <Field label="Currency"><span>{wallet.data.currency}</span></Field>
              <Field label="Version (optimistic lock)"><span className="font-mono tabular">{wallet.data.version}</span></Field>
              <Field label="Created"><span>{formatRelative(wallet.data.created_at)}</span></Field>
            </dl>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-fg-faint">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 text-fg">{children}</dd>
    </div>
  );
}
