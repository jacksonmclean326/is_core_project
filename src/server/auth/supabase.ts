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

export function createServiceSupabaseClient(): SessionClient {
  if (!config.supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY is required for Plaid account storage.");
  }
  return createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
