// POST   /api/shortlists/{id}/people/{person_id} -> add (adding twice changes nothing)
// DELETE /api/shortlists/{id}/people/{person_id} -> remove
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecruiter } from "@/lib/auth";
import { isCandidateId, isUuid, jsonError } from "@/lib/http";
import { findShortlist } from "@/lib/shortlists";
import { userClient } from "@/lib/supabase/user";

type Params = { params: Promise<{ shortlist_id: string; person_id: string }> };
type Loaded = { db: SupabaseClient; shortlist_id: string; person_id: string } | { error: Response };

// Checks the caller, the ids, and that the list belongs to their company.
async function load(request: Request, { params }: Params): Promise<Loaded> {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return { error: jsonError(401, "Sign in to edit shortlists.") };

  const { shortlist_id, person_id } = await params;
  if (!isUuid(shortlist_id)) return { error: jsonError(404, "Shortlist not found.") };
  if (!isCandidateId(person_id)) return { error: jsonError(404, "Candidate not found.") };

  const db = userClient(recruiter.token);
  try {
    // RLS: another company's list is invisible, so it is "not found".
    if (!(await findShortlist(db, shortlist_id))) {
      return { error: jsonError(404, "Shortlist not found.") };
    }
  } catch {
    return { error: jsonError(500, "Something went wrong. Please try again.") };
  }
  return { db, shortlist_id, person_id };
}

export async function POST(request: Request, ctx: Params) {
  const loaded = await load(request, ctx);
  if ("error" in loaded) return loaded.error;
  const { db, shortlist_id, person_id } = loaded;

  // Primary key (shortlist_id, candidate_id) + ignoreDuplicates = adding twice changes nothing.
  const { error } = await db
    .from("shortlist_people")
    .upsert(
      { shortlist_id, candidate_id: person_id },
      { onConflict: "shortlist_id,candidate_id", ignoreDuplicates: true },
    );
  if (error?.code === "23503") return jsonError(404, "Candidate not found.");
  if (error) {
    console.error("Adding to shortlist failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  return Response.json({ shortlist_id, person_id, on_list: true });
}

export async function DELETE(request: Request, ctx: Params) {
  const loaded = await load(request, ctx);
  if ("error" in loaded) return loaded.error;
  const { db, shortlist_id, person_id } = loaded;

  const { error } = await db
    .from("shortlist_people")
    .delete()
    .eq("shortlist_id", shortlist_id)
    .eq("candidate_id", person_id);
  if (error) {
    console.error("Removing from shortlist failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  return Response.json({ shortlist_id, person_id, on_list: false });
}