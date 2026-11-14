import type { ReactNode } from 'react';
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-sm font-medium text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-fg-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
