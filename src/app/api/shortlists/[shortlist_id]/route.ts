// GET    /api/shortlists/{id}          -> the list and the people on it
// PATCH  /api/shortlists/{id} { name } -> rename it (owner only)
// DELETE /api/shortlists/{id}          -> delete it, with its people and invites (owner only)
// A list you can't see is invisible through RLS, so every action gets 404.
// A list shared with you to view gets 403 on any change.
import { getRecruiter } from "@/lib/auth";
import { isUuid, jsonError } from "@/lib/http";
import { findShortlist, mySharedLists, ShortlistNameBody, VIEW_ONLY_MESSAGE } from "@/lib/shortlists";
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

  const db = userClient(recruiter.token);
  const { data, error } = await db
    .from("shortlists")
    .select("id, name, created_at, created_by, shortlist_people(candidate_id, added_at)")
    .eq("id", shortlist_id)
    .maybeSingle();
  if (error) return FAILED();
  if (!data) return NOT_FOUND();

  // Most recently added first.
  const ids = [...data.shortlist_people]
    .sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)))
    .map((p) => p.candidate_id as string);
  const owned = data.created_by === recruiter.userId;
  const [people, recipients, shared] = await Promise.all([
    getCandidateSummaries(ids),
    owned ? db.rpc("shortlist_recipients", { list_id: shortlist_id }).then((r) => r.data ?? []) : [],
    owned ? [] : mySharedLists(db).catch(() => []),
  ]);
  const share = shared.find((s) => s.shortlist_id === shortlist_id);

  return Response.json({
    id: data.id,
    name: data.name,
    created_at: data.created_at,
    people,
    owned,
    shared_by: share?.from_email ?? null,
    share_id: share?.share_id ?? null,
    recipients, // [{ email, status }] for the owner; empty otherwise
  });
}

// Loads the list for a change: 404 if you can't see it, 403 if it is view only.
async function ownedList(request: Request, shortlist_id: string, verb: string) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return { error: jsonError(401, `Sign in to ${verb} this shortlist.`) };
  if (!isUuid(shortlist_id)) return { error: NOT_FOUND() };
  const db = userClient(recruiter.token);
  try {
    const list = await findShortlist(db, shortlist_id);
    if (!list) return { error: NOT_FOUND() };
    if (list.created_by !== recruiter.userId) return { error: jsonError(403, VIEW_ONLY_MESSAGE) };
  } catch {
    return { error: FAILED() };
  }
  return { db };
}

export async function PATCH(request: Request, { params }: Params) {
  const { shortlist_id } = await params;
  const loaded = await ownedList(request, shortlist_id, "rename");
  if ("error" in loaded) return loaded.error;

  const body = ShortlistNameBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Give the shortlist a name of 1 to 100 characters.");

  const { data, error } = await loaded.db
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
  const { shortlist_id } = await params;
  const loaded = await ownedList(request, shortlist_id, "delete");
  if ("error" in loaded) return loaded.error;

  const { data, error } = await loaded.db
    .from("shortlists")
    .delete()
    .eq("id", shortlist_id)
    .select("id")
    .maybeSingle();
  if (error) return FAILED();
  if (!data) return NOT_FOUND();
  return Response.json({ id: data.id, deleted: true });
}
