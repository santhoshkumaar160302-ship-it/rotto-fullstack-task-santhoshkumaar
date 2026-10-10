// GET  /api/shortlists          -> your shortlists and the ones shared with you, newest first
// POST /api/shortlists { name } -> creates one (private to you), returns { id }
// Runs as the recruiter (their token), so RLS decides what they can see.
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { mySharedLists, ShortlistNameBody } from "@/lib/shortlists";
import { userClient } from "@/lib/supabase/user";

export async function GET(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to see your shortlists.");

  const db = userClient(recruiter.token);
  const [{ data, error }, shared] = await Promise.all([
    db
      .from("shortlists")
      .select("id, name, created_at, created_by, shortlist_people(candidate_id)")
      .order("created_at", { ascending: false }),
    mySharedLists(db).catch(() => null),
  ]);
  if (error || !shared) {
    console.error("Listing shortlists failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }

  const sharedBy = new Map(shared.filter((s) => s.status === "accepted").map((s) => [s.shortlist_id, s]));
  return Response.json(
    data.map((s) => ({
      id: s.id,
      name: s.name,
      created_at: s.created_at,
      candidate_ids: s.shortlist_people.map((p) => p.candidate_id),
      owned: s.created_by === recruiter.userId,
      shared_by: sharedBy.get(s.id)?.from_email ?? null,
      share_id: sharedBy.get(s.id)?.share_id ?? null,
    })),
  );
}

export async function POST(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to create a shortlist.");

  const body = ShortlistNameBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Give the shortlist a name of 1 to 100 characters.");

  // company_id and created_by are filled in by the database from the signed-in recruiter.
  const { data, error } = await userClient(recruiter.token)
    .from("shortlists")
    .insert({ name: body.data.name })
    .select("id, name")
    .single();
  if (error) {
    console.error("Creating shortlist failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  return Response.json(data, { status: 201 });
}
