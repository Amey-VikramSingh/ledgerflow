import { cn } from '@/lib/cn';

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'credit' | 'debit' | 'action' }) {
  const tones = {
    neutral: 'border-ink-500 text-fg-muted',
    credit: 'border-credit/30 text-credit bg-credit-soft',
    debit: 'border-debit/30 text-debit bg-debit-soft',
    action: 'border-action/30 text-action bg-action-soft',
  };
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-medium tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}
