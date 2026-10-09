// Checks our interpretation of each example brief against queries.json.
// For each brief, tries candidate rules and reports how many people each
// rule returns, how many are correct, and how many are wrong.
// Read-only: uses the JSON files, not the database.
import { readFileSync } from "node:fs";

type Candidate = {
  id: string;
  role: string;
  seniority: string;
  years_experience: number;
  location: { city: string };
  open_to_work: boolean;
  skills: string[];
  experiences: { company_type: string; end_year: number | null }[];
  education: { school: string; degree: string; field: string }[];
};

const candidates: Candidate[] = JSON.parse(readFileSync("data/candidates.json", "utf8"));
const queries: { brief: string; expected_ids: string[] }[] = JSON.parse(
  readFileSync("data/queries.json", "utf8"),
);

const has = (c: Candidate, skill: string) => c.skills.includes(skill);
const workedAt = (c: Candidate, type: string) => c.experiences.some((e) => e.company_type === type);
const currentlyAt = (c: Candidate, type: string) =>
  c.experiences.some((e) => e.end_year === null && e.company_type === type);
const studiedAt = (c: Candidate, name: string) => c.education.some((e) => e.school.includes(name));
const hasDegree = (c: Candidate, d: string) => c.education.some((e) => e.degree === d);
const city = (c: Candidate, name: string) => c.location.city === name;

type Rule = [label: string, test: (c: Candidate) => boolean];

// One list of rules per brief, in the same order as queries.json.
const rules: Rule[][] = [
  [
    ["senior + React + NY + any startup job", (c) => c.seniority === "senior" && has(c, "React") && city(c, "New York") && workedAt(c, "startup")],
    ["senior/staff + React + NY + any startup job", (c) => ["senior", "staff"].includes(c.seniority) && has(c, "React") && city(c, "New York") && workedAt(c, "startup")],
    ["senior + React + NY + CURRENT startup job", (c) => c.seniority === "senior" && has(c, "React") && city(c, "New York") && currentlyAt(c, "startup")],
  ],
  [
    ["Product Designer + SF + open to work", (c) => c.role === "Product Designer" && city(c, "San Francisco") && c.open_to_work],
  ],
  [
    ["Data Scientist + PhD", (c) => c.role === "Data Scientist" && hasDegree(c, "PhD")],
  ],
  [
    ["Backend + Austin + Go AND Kubernetes", (c) => c.role === "Backend Engineer" && city(c, "Austin") && has(c, "Go") && has(c, "Kubernetes")],
  ],
  [
    ["staff + Full Stack + Seattle", (c) => c.seniority === "staff" && c.role === "Full Stack Engineer" && city(c, "Seattle")],
  ],
  [
    ["ML Engineer + Stanford", (c) => c.role === "Machine Learning Engineer" && studiedAt(c, "Stanford")],
  ],
  [
    ["Account Exec + Chicago + skill Enterprise Sales", (c) => c.role === "Account Executive" && city(c, "Chicago") && has(c, "Enterprise Sales")],
    ["Account Exec + Chicago + any enterprise company", (c) => c.role === "Account Executive" && city(c, "Chicago") && workedAt(c, "enterprise")],
  ],
  [
    ["junior + Frontend + Boston + open to work", (c) => c.seniority === "junior" && c.role === "Frontend Engineer" && city(c, "Boston") && c.open_to_work],
  ],
  [
    ["Mobile Engineer + Swift", (c) => c.role === "Mobile Engineer" && has(c, "Swift")],
  ],
  [
    ["nobody (Japanese is not in the data)", () => false],
  ],
];

const tally = (values: string[]) =>
  Object.entries(values.reduce<Record<string, number>>((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {}))
    .map(([k, n]) => `${k}:${n}`)
    .join(", ");

console.log("SCHOOLS:", [...new Set(candidates.flatMap((c) => c.education.map((e) => e.school)))].sort().join(" | "));

queries.forEach((q, i) => {
  const expected = new Set(q.expected_ids);
  const people = candidates.filter((c) => expected.has(c.id));
  console.log(`\n=== ${i + 1}. ${q.brief}  (expected ${expected.size})`);
  if (people.length) {
    console.log(`   expected roles: ${tally(people.map((p) => p.role))}`);
    console.log(`   expected seniority: ${tally(people.map((p) => p.seniority))}`);
  }
  for (const [label, test] of rules[i] ?? []) {
    const got = candidates.filter(test);
    const correct = got.filter((c) => expected.has(c.id)).length;
    const missing = expected.size - correct;
    const wrong = got.length - correct;
    const verdict = missing === 0 && wrong === 0 ? "EXACT MATCH" : "";
    console.log(`   - ${label}: returns ${got.length}, missing ${missing}, wrong ${wrong} ${verdict}`);
  }
});
