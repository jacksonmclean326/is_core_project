import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export type SessionClient = SupabaseClient;

export function createSupabaseClient(): SessionClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
    },
  });
}
