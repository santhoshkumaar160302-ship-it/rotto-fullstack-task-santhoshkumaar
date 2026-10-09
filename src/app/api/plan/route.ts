// GET /api/plan -> { plan: "free" | "paid", searches_remaining: number | null }
// searches_remaining is null on the paid plan (unlimited).
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getPlan } from "@/lib/search/run-search";

export async function GET(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to see your plan.");
  try {
    return Response.json(await getPlan(recruiter.companyId));
  } catch (err) {
    console.error("Plan lookup failed:", err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}