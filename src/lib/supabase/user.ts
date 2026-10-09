// Supabase client that acts AS the signed-in recruiter, using their own access
// token, so Row Level Security applies: it only ever sees their company's rows.
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function userClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}