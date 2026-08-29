import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, teamMode } from '../config';

let client: SupabaseClient | null = null;

/**
 * The shared Supabase client, or null when the app is running without a
 * backend. Callers must handle null rather than assume team mode.
 */
export function supabase(): SupabaseClient | null {
  if (!teamMode) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Narrowing helper for code paths that only run in team mode. */
export function requireSupabase(): SupabaseClient {
  const c = supabase();
  if (!c) throw new Error('This action needs the team backend, which is not configured.');
  return c;
}
