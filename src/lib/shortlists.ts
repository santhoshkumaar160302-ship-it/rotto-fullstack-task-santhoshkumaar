// Shared shortlist helpers. Callers pass a userClient, so Row Level Security
// applies: another company's list is invisible and comes back as null.
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ShortlistNameBody = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function findShortlist(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("shortlists")
    .select("id, name, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}