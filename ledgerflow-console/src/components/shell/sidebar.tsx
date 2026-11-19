'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Wallet, ArrowLeftRight, Webhook, KeyRound, Activity } from 'lucide-react';
import { cn } from '@/lib/cn';

// `soon` items have no page yet: they're shown (so the roadmap is visible)
// but not linked, so visitors never land on a 404.
const NAV = [
  { href: '/overview', label: 'Overview', icon: LayoutGrid },
  { href: '/wallets', label: 'Wallets', icon: Wallet },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight, soon: true },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook, soon: true },
  { href: '/api-keys', label: 'API keys', icon: KeyRound, soon: true },
  { href: '/demo', label: 'Live demo', icon: Activity, accent: true, soon: true },
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
        {NAV.map(({ href, label, icon: Icon, accent, soon }) => {
          if (soon) {
            return (
              <span
                key={href}
                aria-disabled="true"
                title="Not built yet"
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-faint"
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {label}
                <span className="ml-auto rounded bg-ink-700 px-1.5 py-0.5 font-mono text-2xs">soon</span>
              </span>
            );
          }
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
