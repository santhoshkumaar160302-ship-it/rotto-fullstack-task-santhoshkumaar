// GET /api/search/{search_id}?page=N -> page N (from 1), 20 per page.
// Never counts as a search and never calls the LLM: it slices the saved ids.
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { userClient } from "@/lib/supabase/user";
import { getCandidateSummaries, PAGE_SIZE } from "@/lib/search/candidates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ search_id: string }> },
) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to view results.");

  const { search_id } = await params;
  if (!UUID.test(search_id)) return jsonError(404, "Search not found.");

  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1) {
    return jsonError(400, "page must be a whole number, starting at 1.");
  }

  // Read with the recruiter's own token: RLS hides other companies' searches.
  const { data: search, error } = await userClient(recruiter.token)
    .from("searches")
    .select("id, brief, filters, mentions, result_ids")
    .eq("id", search_id)
    .maybeSingle();
  if (error) return jsonError(500, "Something went wrong. Please try again.");
  if (!search) return jsonError(404, "Search not found.");

  const ids = search.result_ids as string[];
  const start = (page - 1) * PAGE_SIZE;
  const results = await getCandidateSummaries(ids.slice(start, start + PAGE_SIZE));

  return Response.json({
    search_id: search.id,
    brief: search.brief,
    filters: search.filters,
    mentions: search.mentions,
    page,
    page_size: PAGE_SIZE,
    total: ids.length,
    total_pages: Math.ceil(ids.length / PAGE_SIZE),
    results,
  });
}