// Replays data/stripe-events.json against POST /api/billing/events, exactly as
// Stripe would deliver it, and checks each company's plan matches the file's
// expected_plans_after. Also sends a tampered signature (must be 400).
// Needs the app running. Resets the billing tables first.
// Local: `make dev`, then `node scripts/replay-stripe-events.mts`.
// Live site: APP_URL=https://... node --env-file=<live settings> scripts/replay-stripe-events.mts
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

type Sample = {
  events: { description: string; headers: { "Stripe-Signature": string }; payload: string }[];
  expected_plans_after: Record<string, "free" | "paid">;
};
const sample: Sample = JSON.parse(readFileSync("data/stripe-events.json", "utf8"));

const plans = async () => {
  const out: Record<string, string> = {};
  for (const company of ["acme", "globex"]) {
    const { data } = await admin.rpc("get_plan", { p_company_id: company }).single();
    out[company] = (data as { plan: string }).plan;
  }
  return out;
};

const send = (payload: string, signature: string) =>
  fetch(`${APP}/api/billing/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": signature },
    body: payload,
  });

// Start clean.
await admin.from("subscriptions").delete().neq("id", "");
await admin.from("stripe_events").delete().neq("id", "");

for (const e of sample.events) {
  const res = await send(e.payload, e.headers["Stripe-Signature"]);
  const body = await res.json();
  const evt = JSON.parse(e.payload);
  console.log(
    `${res.status} ${String(body.result ?? body.error).padEnd(9)} | ${e.description}` +
      `  [${evt.type}, created ${evt.created}, status ${evt.data?.object?.status}]` +
      `  -> ${JSON.stringify(await plans())}`,
  );
}

// A tampered body with the original signature must be rejected.
const first = sample.events[0];
const tampered = await send(first.payload.replace("active", "canceled"), first.headers["Stripe-Signature"]);
console.log(`${tampered.status} tampered body with original signature (expected 400)`);
const missing = await send(first.payload, "");
console.log(`${missing.status} missing signature (expected 400)`);

const final = await plans();
const ok = Object.entries(sample.expected_plans_after).every(([c, p]) => final[c] === p);
console.log(`\nFinal plans: ${JSON.stringify(final)}`);
console.log(`Expected:    ${JSON.stringify(sample.expected_plans_after)}`);
console.log(ok && tampered.status === 400 && missing.status === 400 ? "\nBilling checks passed." : "\nBilling checks FAILED.");