// Loads candidates.json and creates the two companies and recruiter logins.
// Run by `make setup` after the database is reset.
// Uses the SECRET key (bypasses RLS): it only ever runs on the developer's
// machine during setup, never inside the app.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const PASSWORD = "rotto-assessment";
const COMPANIES = [
  { id: "acme", name: "Acme" },
  { id: "globex", name: "Globex" },
];
// Two recruiters per company, so shortlists can be shared between colleagues.
const RECRUITERS = [
  { email: "recruiter@acme.test", company_id: "acme" },
  { email: "recruiter2@acme.test", company_id: "acme" },
  { email: "recruiter@globex.test", company_id: "globex" },
  { email: "recruiter2@globex.test", company_id: "globex" },
];

type RawCandidate = {
  id: string;
  full_name: string;
  avatar_url: string;
  headline: string;
  current_title: string;
  current_company: string;
  current_company_logo_url: string;
  role: string;
  seniority: string;
  years_experience: number;
  location: { city: string; state: string; country: string };
  open_to_work: boolean;
  skills: string[];
  experiences: { company: string; company_type: string }[];
  education: { school: string; degree: string; field: string }[];
};

function fail(step: string, error: unknown): never {
  console.error(`Seed failed at: ${step}`, error);
  process.exit(1);
}

const unique = (values: string[]) => [...new Set(values)];

// Flattens one candidate into a database row. The arrays let Postgres
// filter on skills, schools, etc. quickly with GIN indexes.
function toRow(c: RawCandidate) {
  return {
    id: c.id,
    full_name: c.full_name,
    avatar_url: c.avatar_url,
    headline: c.headline,
    current_title: c.current_title,
    current_company: c.current_company,
    current_company_logo_url: c.current_company_logo_url,
    role: c.role,
    seniority: c.seniority,
    years_experience: c.years_experience,
    city: c.location.city,
    state: c.location.state,
    country: c.location.country,
    open_to_work: c.open_to_work,
    skills: c.skills,
    companies: unique(c.experiences.map((e) => e.company)),
    company_types: unique(c.experiences.map((e) => e.company_type)),
    schools: unique(c.education.map((e) => e.school)),
    degrees: unique(c.education.map((e) => e.degree)),
    fields: unique(c.education.map((e) => e.field)),
    experiences: c.experiences,
    education: c.education,
  };
}

// Creates a login, or finds it if setup is run a second time.
async function findOrCreateUser(email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (data.user) return data.user.id;

  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) fail(`looking up ${email}`, listError);
  const existing = list.users.find((u) => u.email === email);
  if (!existing) fail(`creating ${email}`, error);
  return existing.id;
}

// 1. Candidates, in batches of 500
const candidates: RawCandidate[] = JSON.parse(
  readFileSync("data/candidates.json", "utf8"),
);
const rows = candidates.map(toRow);
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await supabase
    .from("candidates")
    .upsert(rows.slice(i, i + 500), { onConflict: "id" });
  if (error) fail(`candidates batch starting at ${i}`, error);
}

// 2. Companies
const { error: companyError } = await supabase
  .from("companies")
  .upsert(COMPANIES, { onConflict: "id" });
if (companyError) fail("companies", companyError);

// 3. Recruiter logins, linked to their company
for (const recruiter of RECRUITERS) {
  const userId = await findOrCreateUser(recruiter.email);
  const { error } = await supabase
    .from("recruiters")
    .upsert({ user_id: userId, company_id: recruiter.company_id }, { onConflict: "user_id" });
  if (error) fail(`linking ${recruiter.email}`, error);
}

// 4. Report
const { count } = await supabase
  .from("candidates")
  .select("*", { count: "exact", head: true });
console.log(`Seeded ${count} candidates, ${COMPANIES.length} companies, ${RECRUITERS.length} recruiters.`);