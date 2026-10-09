// POST /api/search  { brief, filters? } -> { search_id, filters, total, results, searches_remaining }
// With "filters" (the recruiter edited them) the LLM is skipped.
import { z } from "zod";
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { admin } from "@/lib/supabase/admin";
import { FiltersSchema, type Filters } from "@/lib/search/filters";
import { BriefParseError, MAX_BRIEF_LENGTH, parseBrief } from "@/lib/search/parse-brief";
import { findCandidateIds, getPlan, saveSearch } from "@/lib/search/run-search";
import { getCandidateSummaries, PAGE_SIZE } from "@/lib/search/candidates";

const Body = z.object({
  brief: z.string().trim().min(1).max(MAX_BRIEF_LENGTH),
  filters: FiltersSchema.optional(),
});

export async function POST(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to search.");

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, `Write a brief between 1 and ${MAX_BRIEF_LENGTH} characters.`);
  }
  const { brief } = body.data;

  // Use one search atomically BEFORE any work. Free plan: 1 in total.
  const { data: allowed, error } = await admin.rpc("consume_search", {
    p_company_id: recruiter.companyId,
  });
  if (error) return jsonError(500, "Something went wrong. Please try again.");
  if (!allowed) {
    return jsonError(402, "Your free search has been used. Upgrade to keep searching.", {
      searches_remaining: 0,
    });
  }

  try {
    const filters: Filters = body.data.filters ?? (await parseBrief(brief));
    const ids = await findCandidateIds(filters);
    const searchId = await saveSearch(recruiter, brief, filters, ids);
    const [results, plan] = await Promise.all([
      getCandidateSummaries(ids.slice(0, PAGE_SIZE)),
      getPlan(recruiter.companyId),
    ]);
    return Response.json({
      search_id: searchId,
      filters,
      total: ids.length,
      results,
      searches_remaining: plan.searches_remaining,
    });
  } catch (err) {
    // The search did not happen, so it must not count against the plan.
    await admin.rpc("refund_search", { p_company_id: recruiter.companyId });
    if (err instanceof BriefParseError) {
      return jsonError(422, "We couldn't turn that brief into filters. Try rephrasing it.");
    }
    console.error("Search failed:", err);
    return jsonError(500, "Search failed. Please try again.");
  }
}