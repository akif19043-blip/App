import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { persistenceEnabled, serverConfig } from './config.js';
import { log } from './logger.js';

/**
 * Service-role Supabase client.
 *
 * This key bypasses RLS, so it never leaves the game server and is only used
 * for writes the player is not allowed to make themselves (raid results, stash
 * transfers, stats, XP).
 */
let serviceClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient | null {
  if (!persistenceEnabled) return null;
  if (serviceClient) return serviceClient;
  serviceClient = createClient(serverConfig.supabaseUrl!, serverConfig.supabaseServiceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-deadline-service': 'game-server' } },
  });
  log.info('supabase.connected', { url: serverConfig.supabaseUrl });
  return serviceClient;
}

/** Anonymous client used only to validate player access tokens. */
let authClient: SupabaseClient | null = null;

export function getAuthClient(): SupabaseClient | null {
  if (!serverConfig.supabaseUrl || !serverConfig.supabaseAnonKey) return null;
  if (authClient) return authClient;
  authClient = createClient(serverConfig.supabaseUrl, serverConfig.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return authClient;
}
