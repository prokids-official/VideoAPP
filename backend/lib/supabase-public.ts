import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/**
 * Public-key Supabase Auth client for flows that must send Supabase emails.
 * Service-role admin APIs intentionally do not send confirmation emails.
 */
export function supabasePublic(): SupabaseClient {
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return client;
}
