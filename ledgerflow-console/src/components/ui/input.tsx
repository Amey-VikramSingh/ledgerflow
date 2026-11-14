import { cn } from '@/lib/cn';
import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-fg',
        'placeholder:text-fg-faint focus:border-action focus:outline-none',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-2xs font-medium uppercase tracking-wider text-fg-muted">{children}</label>;
}
