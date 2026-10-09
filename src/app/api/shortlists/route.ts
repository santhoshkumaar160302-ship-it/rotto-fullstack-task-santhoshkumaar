// GET  /api/shortlists          -> the company's shortlists, newest first
// POST /api/shortlists { name } -> creates one, returns { id }
// Runs as the recruiter (their token), so RLS limits it to their company.
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { ShortlistNameBody } from "@/lib/shortlists";
import { userClient } from "@/lib/supabase/user";

export async function GET(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to see your shortlists.");

  const { data, error } = await userClient(recruiter.token)
    .from("shortlists")
    .select("id, name, created_at, shortlist_people(candidate_id)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Listing shortlists failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }

  return Response.json(
    data.map((s) => ({
      id: s.id,
      name: s.name,
      created_at: s.created_at,
      candidate_ids: s.shortlist_people.map((p) => p.candidate_id),
    })),
  );
}

export async function POST(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to create a shortlist.");

  const body = ShortlistNameBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Give the shortlist a name of 1 to 100 characters.");

  // company_id is filled in by the database from the signed-in recruiter.
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