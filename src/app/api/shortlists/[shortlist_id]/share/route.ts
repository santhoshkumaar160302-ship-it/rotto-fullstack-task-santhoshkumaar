// POST /api/shortlists/{id}/share { email } -> sends YOUR list to a colleague at
// YOUR company. They see it after accepting. The database function checks the
// owner, the company and the recipient, so this route can't be talked around.
import { z } from "zod";
import { getRecruiter } from "@/lib/auth";
import { isUuid, jsonError } from "@/lib/http";
import { userClient } from "@/lib/supabase/user";

type Params = { params: Promise<{ shortlist_id: string }> };
const Body = z.object({ email: z.string().trim().min(3).max(254) });

export async function POST(request: Request, { params }: Params) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to share a shortlist.");
  const { shortlist_id } = await params;
  if (!isUuid(shortlist_id)) return jsonError(404, "Shortlist not found.");

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Choose a colleague to send it to.");

  const { data, error } = await userClient(recruiter.token).rpc("share_shortlist", {
    list_id: shortlist_id,
    recipient_email: body.data.email,
  });
  if (error) {
    console.error("Sharing shortlist failed:", error);
    return jsonError(500, "Something went wrong. Please try again.");
  }

  switch (data as string) {
    case "sent":
      return Response.json({ status: "sent" }, { status: 201 });
    case "already_pending":
      return Response.json({ status: "already_pending" });
    case "already_accepted":
      return Response.json({ status: "already_accepted" });
    case "not_colleague":
      return jsonError(400, "That person isn't a recruiter at your company.");
    case "self":
      return jsonError(400, "You can't send a shortlist to yourself.");
    default:
      return jsonError(404, "Shortlist not found.");
  }
}
