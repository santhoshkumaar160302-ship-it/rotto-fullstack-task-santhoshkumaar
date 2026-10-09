// GET    /api/shortlists/{id}          -> the list and the people on it
// PATCH  /api/shortlists/{id} { name } -> rename it
// DELETE /api/shortlists/{id}          -> delete it (its people go with it)
// Another company's list is invisible through RLS, so every action gets 404.
import { getRecruiter } from "@/lib/auth";
import { isUuid, jsonError } from "@/lib/http";
import { ShortlistNameBody } from "@/lib/shortlists";
import { getCandidateSummaries } from "@/lib/search/candidates";
import { userClient } from "@/lib/supabase/user";

type Params = { params: Promise<{ shortlist_id: string }> };

const NOT_FOUND = () => jsonError(404, "Shortlist not found.");
const FAILED = () => jsonError(500, "Something went wrong. Please try again.");

export async function GET(request: Request, { params }: Params) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to see this shortlist.");
  const { shortlist_id } = await params;
  if (!isUuid(shortlist_id)) return NOT_FOUND();

  const { data, error } = await userClient(recruiter.token)
    .from("shortlists")
    .select("id, name, created_at, shortlist_people(candidate_id, added_at)")
    .eq("id", shortlist_id)
    .maybeSingle();
  if (error) return FAILED();
  if (!data) return NOT_FOUND();

  // Most recently added first.
  const ids = [...data.shortlist_people]
    .sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)))
    .map((p) => p.candidate_id as string);
  const people = await getCandidateSummaries(ids);

  return Response.json({ id: data.id, name: data.name, created_at: data.created_at, people });
}

export async function PATCH(request: Request, { params }: Params) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to rename this shortlist.");
  const { shortlist_id } = await params;
  if (!isUuid(shortlist_id)) return NOT_FOUND();

  const body = ShortlistNameBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Give the shortlist a name of 1 to 100 characters.");

  const { data, error } = await userClient(recruiter.token)
    .from("shortlists")
    .update({ name: body.data.name })
    .eq("id", shortlist_id)
    .select("id, name")
    .maybeSingle();
  if (error) return FAILED();
  if (!data) return NOT_FOUND();
  return Response.json(data);
}

export async function DELETE(request: Request, { params }: Params) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to delete this shortlist.");
  const { shortlist_id } = await params;
  if (!isUuid(shortlist_id)) return NOT_FOUND();

  const { data, error } = await userClient(recruiter.token)
    .from("shortlists")
    .delete()
    .eq("id", shortlist_id)
    .select("id")
    .maybeSingle();
  if (error) return FAILED();
  if (!data) return NOT_FOUND();
  return Response.json({ id: data.id, deleted: true });
}