// Removes recruiter accounts, and the searches, shortlists and saved searches
// they created. Used to keep only one account on the live site.
//
// Shows what it would remove; add --yes to actually remove it.
//   node --env-file=<settings> scripts/remove-accounts.mts a@x.test b@x.test --yes
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env"); // never overrides values from --env-file
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const confirm = process.argv.includes("--yes");
const emails = process.argv.slice(2).filter((a) => a !== "--yes").map((e) => e.toLowerCase());
if (emails.length === 0) {
  console.error("Give the email addresses to remove.");
  process.exit(1);
}

console.log(`Supabase project: ${new URL(url).host}`);
const { data: list, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;

for (const email of emails) {
  const user = list.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    console.log(`- ${email}: not found (already removed?)`);
    continue;
  }
  if (!confirm) {
    console.log(`- ${email}: would be removed`);
    continue;
  }
  // These don't disappear with the account automatically, so remove them first.
  for (const table of ["saved_briefs", "shortlists", "searches"]) {
    const { error } = await admin.from(table).delete().eq("created_by", user.id);
    if (error) throw new Error(`${email}: removing ${table} failed: ${error.message}`);
  }
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`${email}: removing the account failed: ${error.message}`);
  console.log(`- ${email}: removed`);
}

const { data: after } = await admin.auth.admin.listUsers();
console.log(`\nAccounts left: ${after.users.map((u) => u.email).join(", ") || "none"}`);
if (!confirm) console.log("Nothing was changed. Add --yes to remove them.");
