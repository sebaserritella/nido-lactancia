import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createAppClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
