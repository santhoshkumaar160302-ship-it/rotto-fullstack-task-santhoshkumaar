// Reads the local Supabase settings from `supabase status` and writes
// them to .env, so the app and the seed script can use them.
// Run automatically by `make setup`. .env is git-ignored.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const output = execSync("npx supabase status -o env", {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});

// Each useful line looks like: NAME="value"
const values: Record<string, string> = {};
for (const line of output.split("\n")) {
  const match = line.match(/^([A-Z_]+)="(.*)"$/);
  if (match) values[match[1]] = match[2];
}

for (const name of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (!values[name]) {
    console.error(`Missing ${name} from supabase status. Is Supabase running?`);
    process.exit(1);
  }
}

// NEXT_PUBLIC_ values are allowed in the browser.
// SUPABASE_SECRET_KEY has no prefix, so Next.js keeps it on the server only.
const env = [
  "# Written by scripts/write-env.ts from `supabase status`. Do not commit.",
  `NEXT_PUBLIC_SUPABASE_URL=${values.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${values.PUBLISHABLE_KEY}`,
  `SUPABASE_SECRET_KEY=${values.SECRET_KEY}`,
  "",
].join("\n");

writeFileSync(".env", env);
console.log("Wrote .env with local Supabase settings.");