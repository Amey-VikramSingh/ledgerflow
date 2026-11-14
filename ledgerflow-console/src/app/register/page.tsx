'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AuthAside } from '@/components/shell/auth-aside';

export default function RegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.register(email, password, orgName);
      router.push('/overview');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <AuthAside />
      <main className="flex items-center justify-center px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-sm animate-fade-up">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Create a workspace</h1>
          <p className="mt-1 text-sm text-fg-muted">You&apos;ll be the owner of a fresh tenant.</p>

          <div className="mt-8 space-y-4">
            <div>
              <Label>Organization name</Label>
              <Input required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Payments" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-debit/30 bg-debit-soft px-3 py-2 text-sm text-debit">{error}</p>
          )}

          <Button type="submit" disabled={busy} className="mt-6 w-full">
            {busy ? 'Creating…' : 'Create workspace'}
          </Button>
          <p className="mt-6 text-center text-sm text-fg-muted">
            Already have one?{' '}
            <Link href="/login" className="text-action hover:text-action-hover">Sign in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
