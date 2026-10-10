// GET /api/colleagues -> the other recruiters at your company: [{ email }]
// Used by "Send to a colleague". Never lists anyone from another company.
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { userClient } from "@/lib/supabase/user";

export async function GET(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to see your colleagues.");

  const { data, error } = await userClient(recruiter.token).rpc("company_colleagues");
  if (error) {
    console.error("Listing colleagues failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  return Response.json((data ?? []).map((c: { email: string }) => ({ email: c.email })));
}
