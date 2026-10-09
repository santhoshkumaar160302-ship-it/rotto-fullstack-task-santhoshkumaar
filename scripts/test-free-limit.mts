// Proves the free plan allows exactly 1 search, even under concurrent requests,
// and that a recruiter cannot reset their own counter through Supabase directly.
// Needs `make dev` running. Uses one real Gemini call.
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env");
const APP = "http://localhost:3000";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const CONCURRENT = 20;

const admin = createClient(URL, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const asRecruiter = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

const { data: auth, error } = await asRecruiter.auth.signInWithPassword({
  email: "recruiter@acme.test",
  password: "rotto-assessment",
});
if (error || !auth.session) throw error ?? new Error("Sign-in failed");
const headers = { Authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" };

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
};

// 1. Start from a fresh free plan.
await admin.from("subscriptions").delete().eq("company_id", "acme");
await admin.from("companies").update({ searches_used: 0 }).eq("id", "acme");

// 2. Fire all searches at the same instant.
const statuses = await Promise.all(
  Array.from({ length: CONCURRENT }, () =>
    fetch(`${APP}/api/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ brief: "staff full stack engineers in Seattle" }),
    }).then((r) => r.status),
  ),
);
const ok = statuses.filter((s) => s === 200).length;
const blocked = statuses.filter((s) => s === 402).length;
check(ok === 1, `${CONCURRENT} simultaneous searches: ${ok} succeeded (expected exactly 1)`);
check(blocked === CONCURRENT - 1, `${blocked} got 402 (expected ${CONCURRENT - 1})`);

const { data: company } = await admin.from("companies").select("searches_used").eq("id", "acme").single();
check(company?.searches_used === 1, `database counter is ${company?.searches_used} (expected 1)`);

// 3. Attacks with the recruiter's own token, straight to Supabase.
const { data: resetRows } = await asRecruiter
  .from("companies")
  .update({ searches_used: 0 })
  .eq("id", "acme")
  .select();
check((resetRows ?? []).length === 0, "recruiter cannot reset their own search counter");

const { error: refundError } = await asRecruiter.rpc("refund_search", { p_company_id: "acme" });
check(refundError !== null, "recruiter cannot call refund_search");

const { error: consumeError } = await asRecruiter.rpc("search_candidate_ids", { f: {} });
check(consumeError !== null, "recruiter cannot run the search function directly");

const { data: candidateRows } = await asRecruiter.from("candidates").select("id").limit(1);
check((candidateRows ?? []).length === 0, "recruiter cannot read candidates directly (only via our API)");

const { data: after } = await admin.from("companies").select("searches_used").eq("id", "acme").single();
check(after?.searches_used === 1, `counter still ${after?.searches_used} after the attacks (expected 1)`);

console.log(failures === 0 ? "\nAll free-plan checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);