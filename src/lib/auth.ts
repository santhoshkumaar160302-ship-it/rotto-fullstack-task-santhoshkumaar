// Works out who is calling from "Authorization: Bearer <token>".
// The company always comes from our database, never from the request body.
import "server-only";
import { admin } from "./supabase/admin";

export type Recruiter = { userId: string; companyId: string; token: string };

export async function getRecruiter(request: Request): Promise<Recruiter | null> {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  const token = match[1];

  // Verifies the token (signature and expiry). With Supabase's asymmetric
  // signing keys this happens right here, using the project's public key
  // (fetched once and cached), with no call to Supabase Auth. With the older
  // shared-secret keys it falls back to asking Supabase Auth, as before.
  const { data, error } = await admin.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || data?.claims?.role !== "authenticated") return null;

  const { data: row } = await admin
    .from("recruiters")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return null;

  return { userId, companyId: row.company_id, token };
}