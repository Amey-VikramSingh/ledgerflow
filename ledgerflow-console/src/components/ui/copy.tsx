'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/cn';

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className={cn('inline-grid h-6 w-6 place-items-center rounded text-fg-faint hover:text-fg', className)}
      aria-label="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-credit" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
