import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config, HttpError } from "./config.js";

let client: SupabaseClient | undefined;

export function database(): SupabaseClient {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, "The Supabase database is not configured.", "SETUP_REQUIRED");
  }
  client ??= createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
