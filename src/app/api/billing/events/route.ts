// POST /api/billing/events: receives Stripe webhook events. No recruiter token.
// 400 for a bad signature, 200 otherwise (including repeats and ignored events).
// We never call Stripe: the plan is derived only from these events.
import { z } from "zod";
import { verifyStripeSignature } from "@/lib/billing/stripe-signature";
import { jsonError } from "@/lib/http";
import { admin } from "@/lib/supabase/admin";

const StripeEvent = z.object({
  id: z.string().min(1).max(255),
  type: z.string().min(1).max(255),
  created: z.number().int(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

const Subscription = z.object({
  object: z.literal("subscription"),
  id: z.string().min(1).max(255),
  status: z.string().min(1).max(64),
  metadata: z.object({ company: z.string().optional() }).passthrough().optional(),
});

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return jsonError(500, "Billing is not configured.");
  }

  // The signature covers the exact bytes Stripe sent, so read the raw body.
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secret)) {
    return jsonError(400, "Invalid signature.");
  }

  let event: z.infer<typeof StripeEvent>;
  try {
    const parsed = StripeEvent.safeParse(JSON.parse(rawBody.toString("utf8")));
    if (!parsed.success) return Response.json({ received: true, result: "ignored" });
    event = parsed.data;
  } catch {
    return Response.json({ received: true, result: "ignored" });
  }

  // Only customer.subscription.* events change a plan.
  const sub = event.type.startsWith("customer.subscription.")
    ? Subscription.safeParse(event.data.object)
    : null;
  const subscription = sub?.success ? sub.data : null;
  const status =
    event.type === "customer.subscription.deleted" ? "canceled" : (subscription?.status ?? null);

  const { data: result, error } = await admin.rpc("apply_stripe_event", {
    p_event_id: event.id,
    p_type: event.type,
    p_created: event.created,
    p_subscription_id: subscription?.id ?? null,
    p_company_id: subscription?.metadata?.company ?? null,
    p_status: status,
  });
  if (error) {
    // 500 makes Stripe retry later; the event id was not recorded.
    console.error("Applying Stripe event failed:", error);
    return jsonError(500, "Could not process the event.");
  }

  return Response.json({ received: true, result });
}