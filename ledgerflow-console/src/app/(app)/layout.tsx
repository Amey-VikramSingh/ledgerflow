import { redirect } from 'next/navigation';
import { isAuthed, getAccess, API_URL } from '@/lib/session';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import type { User } from '@/lib/types';

async function fetchMe(): Promise<User | null> {
  const token = await getAccess();
  if (!token) return null;
  const r = await fetch(`${API_URL}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!r || !r.ok) return null;
  return (await r.json()) as User;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) redirect('/login');
  const me = await fetchMe();
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={me?.email ?? '—'} tenantId={me?.tenant_id ?? ''} />
        <main className="flex-1 px-6 py-7">{children}</main>
      </div>
    </div>
  );
}
