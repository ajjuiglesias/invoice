/**
 * Runtime configuration.
 *
 * With no Supabase credentials the app runs exactly as it did in Phase A:
 * everything in the browser, no accounts, nothing uploaded. Supply both
 * variables and it becomes the team platform — same screens, shared data.
 *
 * Set them in `app/.env.local` (see `.env.example`).
 */

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

/** True when this deployment is backed by a database and logins. */
export const teamMode: boolean = Boolean(url && anonKey);

export const MODE_LABEL = teamMode ? 'Team' : 'This device only';
