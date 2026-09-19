'use client';

import { useTransition } from 'react';
import { signOut } from '@/lib/actions/auth';

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void signOut())}
      className="dl-heading border border-signal px-5 py-2 text-sm text-signal transition-colors hover:bg-signal hover:text-void disabled:opacity-50"
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
