// Works out who is calling from "Authorization: Bearer <token>".
// The company always comes from our database, never from the request body.
import "server-only";
import { admin } from "./supabase/admin";

export type Recruiter = { userId: string; companyId: string; token: string };

export async function getRecruiter(request: Request): Promise<Recruiter | null> {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];

  // Asks Supabase Auth to verify the token (signature and expiry).
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: row } = await admin
    .from("recruiters")
    .select("company_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!row) return null;

  return { userId: data.user.id, companyId: row.company_id, token };
}