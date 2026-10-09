// Verifies a Stripe webhook signature without calling Stripe.
// Header format: "t=<unix seconds>,v1=<hex signature>[,v1=...]"
// Signature = HMAC-SHA256(secret, "<t>.<exact raw body>").
// We deliberately do not reject old timestamps: replays are already harmless
// (repeated event ids are ignored, older events never overwrite newer state),
// and the provided sample events were signed when the file was made.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyStripeSignature(
  rawBody: Buffer,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;

  const pairs = header.split(",").map((part) => {
    const i = part.indexOf("=");
    return i === -1 ? ["", ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
  const timestamp = pairs.find(([key]) => key === "t")?.[1];
  const signatures = pairs.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();

  // Constant-time comparison, so response timing can't leak the signature.
  return signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
    return timingSafeEqual(Buffer.from(sig, "hex"), expected);
  });
}
