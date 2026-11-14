import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client.
 *
 * Returns null rather than throwing when the environment is not configured.
 * The pipeline that fills this database runs offline and lands late, so the
 * app has to render a useful empty state on a machine that has never seen a
 * Supabase key -- otherwise nobody can work on the UI until the data is in.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  client ??= createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return client;
}

export const isSupabaseConfigured = Boolean(url && anonKey);
