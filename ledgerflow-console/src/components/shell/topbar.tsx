'use client';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { auth } from '@/lib/api';
import { shortId } from '@/lib/format';
import { Button } from '@/components/ui/button';

export function Topbar({ email, tenantId }: { email: string; tenantId: string }) {
  const router = useRouter();
  async function signOut() {
    await auth.logout().catch(() => undefined);
    router.push('/login');
    router.refresh();
  }
  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-ink-800/80 px-6 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-fg-muted">tenant</span>
        <span className="font-mono text-2xs text-fg">{shortId(tenantId)}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden text-sm text-fg-muted sm:block">{email}</span>
        <Button variant="ghost" onClick={signOut} className="px-2">
          <LogOut className="h-4 w-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
