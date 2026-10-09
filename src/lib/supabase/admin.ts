// Supabase client with the SECRET key. It bypasses Row Level Security, so it
// is only used on the server, for work a recruiter's own token must not do:
// reading candidates, counting searches, billing.
// "server-only" makes the build fail if this is ever imported into browser code.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);