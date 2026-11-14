import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/session';

export default function Home() {
  redirect(isAuthed() ? '/overview' : '/login');
}
