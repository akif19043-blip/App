/**
 * Environment access.
 *
 * `NEXT_PUBLIC_*` values are inlined into the browser bundle; everything else
 * is server-only and must never be referenced from a client component.
 */
export const publicEnv = {
  supabaseUrl: process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
  supabaseAnonKey: process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
  gameServerUrl: process.env['NEXT_PUBLIC_GAME_SERVER_URL'] ?? 'ws://localhost:2567',
  demoMode: (process.env['NEXT_PUBLIC_DEMO_MODE'] ?? 'true') === 'true',
} as const;

export function supabaseConfigured(): boolean {
  return publicEnv.supabaseUrl !== '' && publicEnv.supabaseAnonKey !== '';
}

export function serverEnv() {
  return {
    supabaseUrl: process.env['SUPABASE_URL'] ?? publicEnv.supabaseUrl,
    supabaseAnonKey: process.env['SUPABASE_ANON_KEY'] ?? publicEnv.supabaseAnonKey,
    serviceRoleKey: process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
    demoDbPath: process.env['DEMO_DB_PATH'] ?? '',
  } as const;
}
