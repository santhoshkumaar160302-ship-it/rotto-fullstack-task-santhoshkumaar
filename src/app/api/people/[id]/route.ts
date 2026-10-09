// GET /api/people/{id} -> one candidate: profile, experience, education, skills.
// Candidates are shared by every company, but only signed-in recruiters can read them.
import { getRecruiter } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getCandidateProfile } from "@/lib/search/candidates";

const CANDIDATE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const recruiter = await getRecruiter(request);
  if (!recruiter) return jsonError(401, "Sign in to view candidates.");

  const { id } = await params;
  if (!CANDIDATE_ID.test(id)) return jsonError(404, "Candidate not found.");

  try {
    const candidate = await getCandidateProfile(id);
    if (!candidate) return jsonError(404, "Candidate not found.");
    return Response.json(candidate);
  } catch (err) {
    console.error("Candidate lookup failed:", err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}