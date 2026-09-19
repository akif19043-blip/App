import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {
  FilePersistence,
  SupabasePersistence,
  defaultDemoDatabasePath,
  type Persistence,
} from '@deadline/persistence';
import { serverEnv, supabaseConfigured } from './env';
import { getServerSupabase } from './session';

let fileStore: Persistence | null = null;

/**
 * Persistence for the current request.
 *
 * With Supabase configured the adapter is bound to the *user's* client, so
 * every read and write goes through Row Level Security and the market RPCs see
 * the right `auth.uid()`. Without it, a file-backed store is used — the same
 * file the game server writes, so raids really do update the stash.
 */
export async function getPersistence(): Promise<Persistence> {
  if (supabaseConfigured()) {
    const client = await getServerSupabase();
    if (client) return new SupabasePersistence(client);
  }
  if (!fileStore) {
    fileStore = new FilePersistence(demoPath());
  }
  return fileStore;
}

/**
 * Service-role persistence, used for the few operations a player is not
 * allowed to perform themselves (creating a profile row on first sign-in).
 */
export async function getAdminPersistence(): Promise<Persistence> {
  const env = serverEnv();
  if (supabaseConfigured() && env.serviceRoleKey) {
    const client = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return new SupabasePersistence(client, { serviceRole: true });
  }
  return getPersistence();
}

function demoPath(): string {
  const configured = serverEnv().demoDbPath;
  if (configured) return configured;
  return defaultDemoDatabasePath();
}
