// Supabase client for the browser. Uses only the PUBLISHABLE key, which is
// safe to expose: Row Level Security decides what each recruiter can touch.
// Used for signing in and out; all data goes through our API.
//
// Each browser tab keeps its own sign-in (in sessionStorage, under a key unique
// to the tab), so one tab can be Acme while another is Globex. Closing a tab
// ends its sign-in.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// A random id for this tab, kept for as long as the tab is open. It also names
// the channel Supabase uses to tell other tabs about sign-ins, so tabs never
// hear about each other's.
function tabStorageKey(): string {
  let id = window.sessionStorage.getItem("rotto-tab");
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem("rotto-tab", id);
  }
  return `rotto-auth-${id}`;
}

export function supabaseBrowser(): SupabaseClient {
  client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    typeof window === "undefined"
      ? undefined
      : { auth: { storage: window.sessionStorage, storageKey: tabStorageKey() } },
  );
  return client;
}