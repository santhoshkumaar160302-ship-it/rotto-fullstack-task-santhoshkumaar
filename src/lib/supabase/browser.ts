// Supabase client for the browser. Uses only the PUBLISHABLE key, which is
// safe to expose: Row Level Security decides what each recruiter can touch.
// Used for signing in and out; all data goes through our API.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}