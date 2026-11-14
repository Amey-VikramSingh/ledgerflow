import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

/**
 * Money renders an amount signed by direction. In a double-entry ledger,
 * direction is the fundamental fact — so credit reads green, debit reads rose,
 * and figures are monospace + tabular so columns of numbers align like a real
 * ledger. This one component encodes the whole visual thesis.
 */
export function Money({
  minor,
  currency = 'INR',
  direction,
  className,
  showSign = true,
}: {
  minor: string | number;
  currency?: string;
  direction?: 'credit' | 'debit';
  className?: string;
  showSign?: boolean;
}) {
  const color =
    direction === 'credit' ? 'text-credit' : direction === 'debit' ? 'text-debit' : 'text-fg';
  const sign = !showSign || !direction ? '' : direction === 'credit' ? '+' : '−';
  return (
    <span className={cn('tabular font-mono', color, className)}>
      {sign}
      {formatMoney(minor, currency)}
    </span>
  );
}
