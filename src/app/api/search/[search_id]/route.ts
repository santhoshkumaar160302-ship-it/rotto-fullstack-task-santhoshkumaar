// GET /api/search/{search_id}?page=N -> page N (from 1), 20 per page.
// Never counts as a search and never calls the LLM: it slices the saved ids.
//
// Speed: this is ONE database call. The recruiter's own token goes straight
// to the database function get_search_page, which checks the token and only
// returns searches from the recruiter's company. (Before, a page waited on
// four calls one after another: Auth, recruiter, search, candidates.)
import { jsonError } from "@/lib/http";
import { userClient } from "@/lib/supabase/user";
import { PAGE_SIZE, type CandidateSummary } from "@/lib/search/candidates";
import { withDefaults } from "@/lib/search/filters";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE = 100000; // the same limit as in get_search_page

type Row = {
  search_id: string;
  brief: string;
  filters: unknown;
  mentions: unknown;
  total: number;
  results: CandidateSummary[];
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ search_id: string }> },
) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return jsonError(401, "Sign in to view results.");

  const { search_id } = await params;
  if (!UUID.test(search_id)) return jsonError(404, "Search not found.");

  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    return jsonError(400, "page must be a whole number, starting at 1.");
  }

  const { data, error, status } = await userClient(token).rpc("get_search_page", {
    p_search_id: search_id,
    p_page: page,
  });
  // The database rejects a missing, expired or forged token with 401.
  if (status === 401 || error?.code === "PGRST301" || error?.code === "PGRST303") {
    return jsonError(401, "Sign in to view results.");
  }
  if (error) {
    console.error("Loading a results page failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  const search = data as Row | null;
  if (!search) return jsonError(404, "Search not found.");

  return Response.json({
    search_id: search.search_id,
    brief: search.brief,
    filters: withDefaults(search.filters),
    mentions: Array.isArray(search.mentions) ? search.mentions : [],
    page,
    page_size: PAGE_SIZE,
    total: search.total,
    total_pages: Math.ceil(search.total / PAGE_SIZE),
    results: search.results,
  });
}
