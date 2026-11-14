'use client';
import { cn } from '@/lib/cn';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
const styles: Record<Variant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]',
  ghost: 'text-fg-muted hover:text-fg hover:bg-ink-600',
  outline: 'border border-ink-500 text-fg hover:bg-ink-600',
  danger: 'border border-debit/40 text-debit hover:bg-debit-soft',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(({ className, variant = 'primary', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium',
      'transition-colors disabled:opacity-40 disabled:pointer-events-none',
      styles[variant],
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';
