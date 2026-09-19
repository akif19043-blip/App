'use client';

import { useActionState, useState } from 'react';
import { signIn, signInAsGuest, signUp, type AuthFormState } from '@/lib/actions/auth';

const initialState: AuthFormState = { error: null };

type Mode = 'signin' | 'signup' | 'guest';

export function AuthPanel({ supabaseEnabled }: { supabaseEnabled: boolean }) {
  const [mode, setMode] = useState<Mode>(supabaseEnabled ? 'signin' : 'guest');
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);
  const [guestState, guestAction, guestPending] = useActionState(signInAsGuest, initialState);

  const error =
    mode === 'signin'
      ? signInState.error
      : mode === 'signup'
        ? signUpState.error
        : guestState.error;

  return (
    <div className="dl-panel dl-cut p-6">
      <div className="mb-6 flex gap-1 border-b border-edge">
        {supabaseEnabled && (
          <>
            <TabButton active={mode === 'signin'} onClick={() => setMode('signin')}>
              Sign in
            </TabButton>
            <TabButton active={mode === 'signup'} onClick={() => setMode('signup')}>
              Register
            </TabButton>
          </>
        )}
        {!supabaseEnabled && (
          <TabButton active onClick={() => setMode('guest')}>
            Guest access
          </TabButton>
        )}
      </div>

      {mode === 'signin' && (
        <form action={signInAction} className="space-y-4">
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <Submit pending={signInPending}>Enter the sector</Submit>
        </form>
      )}

      {mode === 'signup' && (
        <form action={signUpAction} className="space-y-4">
          <Field label="Callsign" name="username" type="text" minLength={3} maxLength={20} required />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Submit pending={signUpPending}>Create operator</Submit>
        </form>
      )}

      {mode === 'guest' && (
        <form action={guestAction} className="space-y-4">
          <Field
            label="Callsign"
            name="username"
            type="text"
            minLength={3}
            maxLength={20}
            defaultValue="operator"
            required
          />
          <Submit pending={guestPending}>Deploy as guest</Submit>
        </form>
      )}

      {error && (
        <p className="mt-4 border border-signal/40 bg-signal/10 px-3 py-2 text-xs text-signal">
          {error}
        </p>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'dl-heading px-4 py-2 text-sm transition-colors',
        active ? 'border-b-2 border-signal text-ink' : 'text-muted hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] tracking-[0.3em] text-muted">
        {label.toUpperCase()}
      </span>
      <input
        {...props}
        className="w-full border border-edge bg-void px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-signal"
      />
    </label>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="dl-heading w-full bg-signal px-4 py-3 text-base font-semibold text-void transition-opacity disabled:opacity-50"
    >
      {pending ? 'Connecting…' : children}
    </button>
  );
}
