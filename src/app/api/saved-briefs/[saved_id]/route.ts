// DELETE /api/saved-briefs/{id} -> removes a saved search.
// Another company's saved search is invisible through RLS, so it gets 404.
import { getRecruiter } from "@/lib/auth";
import { isUuid, jsonError } from "@/lib/http";
import { userClient } from "@/lib/supabase/user";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saved_id: string }> },
) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to remove a saved search.");

  const { saved_id } = await params;
  if (!isUuid(saved_id)) return jsonError(404, "Saved search not found.");

  const { data, error } = await userClient(recruiter.token)
    .from("saved_briefs")
    .delete()
    .eq("id", saved_id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Removing saved search failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  if (!data) return jsonError(404, "Saved search not found.");
  return Response.json({ id: data.id, deleted: true });
}