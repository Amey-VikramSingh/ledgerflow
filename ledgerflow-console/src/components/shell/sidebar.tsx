'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Wallet, ArrowLeftRight, Webhook, KeyRound, Activity } from 'lucide-react';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/overview', label: 'Overview', icon: LayoutGrid },
  { href: '/wallets', label: 'Wallets', icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/api-keys', label: 'API keys', icon: KeyRound },
  { href: '/demo', label: 'Live demo', icon: Activity, accent: true },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-ink-800 md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-action/15 font-mono text-sm text-action">≡</div>
        <span className="font-display text-base font-semibold tracking-tight">LedgerFlow</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon, accent }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active ? 'bg-ink-600 text-fg' : 'text-fg-muted hover:bg-ink-700 hover:text-fg',
              )}
            >
              <Icon className={cn('h-4 w-4', accent && !active && 'text-action')} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 font-mono text-2xs text-fg-faint">v1 · paise · IST</div>
    </aside>
  );
}
