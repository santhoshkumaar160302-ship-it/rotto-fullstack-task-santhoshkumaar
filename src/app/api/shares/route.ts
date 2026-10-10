// GET /api/shares -> shortlists colleagues sent you: waiting for your answer, or accepted.
// [{ share_id, shortlist_id, name, from_email, people, status, created_at }]
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { mySharedLists } from "@/lib/shortlists";
import { userClient } from "@/lib/supabase/user";

export async function GET(request: Request) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to see shared shortlists.");
  try {
    return Response.json(await mySharedLists(userClient(recruiter.token)));
  } catch (error) {
    console.error("Listing shared shortlists failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
