import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serverEnv, supabaseConfigured } from './env';

export const DEMO_COOKIE = 'deadline_demo_user';
export const DEMO_NAME_COOKIE = 'deadline_demo_name';

export interface SessionUser {
  readonly id: string;
  readonly username: string;
  readonly demo: boolean;
  /** Supabase access token, forwarded to the game server for validation. */
  readonly accessToken: string | null;
}

/**
 * Server-side Supabase client bound to the request's cookies.
 * Returns null when Supabase is not configured (demo mode).
 */
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured()) return null;
  const env = serverEnv();
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: middleware refreshes the session.
        }
      },
    },
  });
}

/**
 * Resolve the current operator.
 *
 * Supabase Auth when it is configured; otherwise the demo cookie, which is
 * what makes the whole loop playable without provisioning a project.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getServerSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const metadata = data.user.user_metadata as { username?: string } | null;
      const { data: sessionData } = await supabase.auth.getSession();
      return {
        id: data.user.id,
        username:
          metadata?.username ??
          data.user.email?.split('@')[0] ??
          `operator_${data.user.id.slice(0, 6)}`,
        demo: false,
        accessToken: sessionData.session?.access_token ?? null,
      };
    }
    return null;
  }

  const cookieStore = await cookies();
  const demoId = cookieStore.get(DEMO_COOKIE)?.value;
  if (!demoId) return null;
  return {
    id: demoId,
    username: cookieStore.get(DEMO_NAME_COOKIE)?.value ?? `operator_${demoId.slice(0, 6)}`,
    demo: true,
    accessToken: null,
  };
}

/** Same as {@link getSessionUser} but throws — for pages that require auth. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('unauthenticated');
  return user;
}
