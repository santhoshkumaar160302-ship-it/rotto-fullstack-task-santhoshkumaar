// Shared shortlist helpers. Callers pass a userClient, so Row Level Security
// applies: a list you can't see (another company's, or a colleague's that
// wasn't shared with you) is invisible and comes back as null.
import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ShortlistNameBody = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function findShortlist(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("shortlists")
    .select("id, name, created_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Lists sent to the signed-in recruiter (waiting or accepted), with the sender.
export type SharedList = {
  share_id: string;
  shortlist_id: string;
  name: string;
  from_email: string;
  people: number;
  status: "pending" | "accepted";
  created_at: string;
};

export async function mySharedLists(db: SupabaseClient): Promise<SharedList[]> {
  const { data, error } = await db.rpc("my_shared_lists");
  if (error) throw error;
  return (data ?? []) as SharedList[];
}

// Someone who can see a list but didn't make it gets this on any change.
export const VIEW_ONLY_MESSAGE = "This shortlist was shared with you to view. Only the recruiter who made it can change it.";
