// POST /api/shares/{id} { accept: true | false } -> accept or decline a shortlist
// sent to you. Declining one you already accepted removes it from your view.
// Only the person it was sent to can answer; anyone else gets 404.
import { z } from "zod";
import { getRecruiter } from "@/lib/auth";
import { isUuid, jsonError } from "@/lib/http";
import { userClient } from "@/lib/supabase/user";

type Params = { params: Promise<{ share_id: string }> };
const Body = z.object({ accept: z.boolean() });

export async function POST(request: Request, { params }: Params) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to answer this.");
  const { share_id } = await params;
  if (!isUuid(share_id)) return jsonError(404, "Shared shortlist not found.");

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Say whether you accept.");

  const { data, error } = await userClient(recruiter.token).rpc("respond_to_share", {
    share_id,
    accept: body.data.accept,
  });
  if (error) {
    console.error("Answering share failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }
  if (data === "not_found") return jsonError(404, "Shared shortlist not found.");
  return Response.json({ status: data });
}
