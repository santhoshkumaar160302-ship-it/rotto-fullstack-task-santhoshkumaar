// GET  /api/saved-briefs                    -> the company's saved searches, newest first
// POST /api/saved-briefs { brief, filters } -> saves one, returns { id }
// Re-running a saved search sends its brief and filters to POST /api/search,
// which skips the LLM because the filters are already known.
// Runs as the recruiter (their token), so RLS limits it to their company.
import { z } from "zod";
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { EMPTY_FILTERS, FiltersSchema, MentionsSchema } from "@/lib/search/filters";
import { MAX_BRIEF_LENGTH } from "@/lib/search/parse-brief";
import { userClient } from "@/lib/supabase/user";

const Body = z.object({
  brief: z.string().trim().min(1).max(MAX_BRIEF_LENGTH),
  // Any filter left out means "no filter"; values must still be allowed ones.
  filters: FiltersSchema.partial(),
  mentions: MentionsSchema.optional(),
});

export async function GET(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to see your saved searches.");

  const { data, error } = await userClient(recruiter.token)
    .from("saved_briefs")
    .select("id, brief, filters, mentions, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Listing saved searches failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  return Response.json(data);
}

export async function POST(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to save a search.");

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError(400, "Send a brief and filters using only the allowed filter values.");
  }

  // company_id is filled in by the database from the signed-in recruiter.
  const { data, error } = await userClient(recruiter.token)
    .from("saved_briefs")
        .insert({
      brief: body.data.brief,
      filters: { ...EMPTY_FILTERS, ...body.data.filters },
      mentions: body.data.mentions ?? [],
    })
    .select("id, brief, filters, created_at")
    .single();
  if (error) {
    console.error("Saving search failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  return Response.json(data, { status: 201 });
}