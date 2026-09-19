'use server';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AnalyticsEvent, track } from '@deadline/shared';
import { DEMO_COOKIE, DEMO_NAME_COOKIE, getServerSupabase } from '../session';
import { getAdminPersistence } from '../persistence';
import { supabaseConfigured } from '../env';

export interface AuthFormState {
  error: string | null;
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
};

function sanitizeUsername(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  return cleaned.length >= 3 ? cleaned : `operator${Math.floor(Math.random() * 9000 + 1000)}`;
}

/** Email + password sign-in against Supabase Auth. */
export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await getServerSupabase();
  if (!supabase) return { error: 'Supabase is not configured. Use guest access instead.' };

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Email and password are required.' };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect('/menu');
}

/** Registration. The database trigger creates the profile, stats and loadout. */
export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const supabase = await getServerSupabase();
  if (!supabase) return { error: 'Supabase is not configured. Use guest access instead.' };

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const username = sanitizeUsername(String(formData.get('username') ?? ''));
  if (!email || password.length < 8) {
    return { error: 'Email and a password of at least 8 characters are required.' };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) return { error: error.message };

  if (data.user) {
    try {
      const persistence = await getAdminPersistence();
      await persistence.ensureProfile(data.user.id, username);
    } catch {
      // The auth trigger is the primary path; this is only a safety net.
    }
    track(AnalyticsEvent.AccountCreated, { player_id: data.user.id });
  }

  if (!data.session) {
    return { error: 'Check your inbox to confirm the account, then sign in.' };
  }
  redirect('/menu');
}

/**
 * Guest access.
 *
 * Creates a local operator identity backed by the demo store. This is how the
 * game is playable with zero configuration; it is disabled whenever Supabase
 * is configured.
 */
export async function signInAsGuest(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (supabaseConfigured()) {
    return { error: 'Guest access is disabled while Supabase authentication is configured.' };
  }
  const username = sanitizeUsername(String(formData.get('username') ?? ''));
  const userId = randomUUID();

  const persistence = await getAdminPersistence();
  await persistence.ensureProfile(userId, username);
  track(AnalyticsEvent.AccountCreated, { player_id: userId, demo: true });

  const cookieStore = await cookies();
  cookieStore.set(DEMO_COOKIE, userId, COOKIE_OPTIONS);
  cookieStore.set(DEMO_NAME_COOKIE, username, { ...COOKIE_OPTIONS, httpOnly: false });
  redirect('/menu');
}

export async function signOut(): Promise<void> {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_COOKIE);
  cookieStore.delete(DEMO_NAME_COOKIE);
  redirect('/');
}
