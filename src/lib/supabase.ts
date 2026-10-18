import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Single Supabase client.
 * NOTE: the anon/publishable key is public by design — all authorization is
 * enforced server-side via SECURITY DEFINER RPCs and deny-all RLS.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: { eventsPerSecond: 8 },
  },
  global: {
    headers: { "x-doz-client": "web" },
  },
});
