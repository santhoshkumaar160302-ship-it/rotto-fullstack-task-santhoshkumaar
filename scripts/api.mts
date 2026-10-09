// Calls our API as one of the seeded recruiters and prints the response.
// Needs `make dev` running.
// Usage: node scripts/api.mts <METHOD> <path> [acme|globex] ['{"json":"body"}']
// e.g.   node scripts/api.mts GET /api/plan globex
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env");
const [method = "GET", path = "/api/plan", company = "acme", body] = process.argv.slice(2);

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);
const { data, error } = await client.auth.signInWithPassword({
  email: `recruiter@${company}.test`,
  password: "rotto-assessment",
});
if (error || !data.session) {
  console.error("Sign-in failed:", error);
  process.exit(1);
}

const res = await fetch(`http://localhost:3000${path}`, {
  method,
  headers: {
    Authorization: `Bearer ${data.session.access_token}`,
    ...(body ? { "Content-Type": "application/json" } : {}),
  },
  body,
});
const text = await res.text();
let output = text;
try {
  output = JSON.stringify(JSON.parse(text), null, 2);
} catch {
  // not JSON: print as-is
}
console.log(`${method} ${path} as ${company} -> ${res.status}`);
console.log(output);