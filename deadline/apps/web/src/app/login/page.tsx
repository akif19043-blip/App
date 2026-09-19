import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseConfigured } from '@/lib/env';
import { getSessionUser } from '@/lib/session';
import { AuthPanel } from './AuthPanel';

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/menu');

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="dl-heading mb-8 block text-center text-3xl font-bold">
          DEAD<span className="text-signal">LINE</span>
        </Link>
        <AuthPanel supabaseEnabled={supabaseConfigured()} />
        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
          {supabaseConfigured()
            ? 'Accounts are stored in Supabase. Your raid results are written server side.'
            : 'Supabase is not configured, so DEADLINE is running in demo mode: a local operator profile is created for you and stored in the project’s demo database.'}
        </p>
      </div>
    </div>
  );
}
