'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, supabaseConfigured } from './env';

let cached: SupabaseClient | null = null;

/** Browser Supabase client, or null when the project is not configured. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (cached) return cached;
  cached = createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return cached;
}
