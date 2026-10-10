// Counts the numbers for the login page demo from the real data and checks the
// final counts against the answers in data/queries.json, so the page can never
// show a number our search wouldn't return. Writes src/app/login/demo-data.json.
// Read-only on the data files. Run it again only if the data or the briefs change:
//   node scripts/login-demo.mts
import { readFileSync, writeFileSync } from "node:fs";

type Candidate = {
  id: string;
  avatar_url: string | null;
  role: string;
  seniority: string;
  years_experience: number;
  location: { city: string };
  open_to_work: boolean;
  skills: string[];
  experiences: { company_type: string }[];
};

const candidates: Candidate[] = JSON.parse(readFileSync("data/candidates.json", "utf8"));
const queries: { brief: string; expected_ids: string[] }[] = JSON.parse(readFileSync("data/queries.json", "utf8"));

function fail(message: string): never {
  console.error(`Stopped: ${message}`);
  process.exit(1);
}

// The same rules our search uses (see search_candidate_ids in the migrations).
type Test = (c: Candidate) => boolean;
const ENGINEERS = [...new Set(candidates.map((c) => c.role))].filter((role) => role.endsWith("Engineer"));
const role = (...names: string[]): Test => (c) => names.includes(c.role);
const seniority = (level: string): Test => (c) => c.seniority === level;
const city = (name: string): Test => (c) => c.location.city === name;
const skill = (name: string): Test => (c) => c.skills.includes(name);
const workedAt = (type: string): Test => (c) => c.experiences.some((e) => e.company_type === type);
const openToWork: Test = (c) => c.open_to_work;

// The three demo briefs, split into plain words and the phrases that become
// filters. "query" is the brief's position in data/queries.json.
type Phrase = { text: string; tag: string; test: Test };
const BRIEFS: { query: number; parts: (string | Phrase)[] }[] = [
  {
    query: 0,
    parts: [
      { text: "senior", tag: "Seniority", test: seniority("senior") },
      " ",
      { text: "React", tag: "Skill", test: skill("React") },
      " ",
      { text: "engineers", tag: "Role", test: role(...ENGINEERS) },
      " in ",
      { text: "New York", tag: "City", test: city("New York") },
      " who have worked at ",
      { text: "a startup", tag: "Worked at", test: workedAt("startup") },
    ],
  },
  {
    query: 1,
    parts: [
      { text: "product designers", tag: "Role", test: role("Product Designer") },
      " in ",
      { text: "San Francisco", tag: "City", test: city("San Francisco") },
      " who are ",
      { text: "open to work", tag: "Open to work", test: openToWork },
    ],
  },
  {
    query: 3,
    parts: [
      { text: "backend engineers", tag: "Role", test: role("Backend Engineer") },
      " in ",
      { text: "Austin", tag: "City", test: city("Austin") },
      " who know ",
      { text: "Go", tag: "Skill", test: skill("Go") },
      " and ",
      { text: "Kubernetes", tag: "Skill", test: skill("Kubernetes") },
    ],
  },
];

// Only plain https links to images go into the page.
const isSafeUrl = (url: string | null): url is string => !!url && /^https:\/\/[\w./-]+$/.test(url);

const briefs = BRIEFS.map(({ query, parts }) => {
  const text = parts.map((part) => (typeof part === "string" ? part : part.text)).join("");
  const official = queries[query];
  if (official?.brief !== text) fail(`brief ${query + 1} in data/queries.json doesn't read "${text}".`);

  // Apply the filters one phrase at a time and count who is left after each.
  let people = candidates;
  const steps = [people.length];
  for (const part of parts) {
    if (typeof part === "string") continue;
    people = people.filter(part.test);
    steps.push(people.length);
  }

  // The people left at the end must be exactly the official answer.
  const expected = new Set(official.expected_ids);
  if (people.length !== expected.size || !people.every((c) => expected.has(c.id))) {
    fail(`"${text}" finds ${people.length} people, but the answer key has ${expected.size}.`);
  }

  // The first five faces, in the same order as our search results.
  const faces = [...people]
    .sort(
      (a, b) =>
        Number(b.open_to_work) - Number(a.open_to_work) ||
        b.years_experience - a.years_experience ||
        (a.id < b.id ? -1 : 1),
    )
    .map((c) => c.avatar_url)
    .filter(isSafeUrl)
    .slice(0, 5);

  console.log(`${text}\n  ${steps.map((n) => n.toLocaleString("en-US")).join(" → ")}  (matches the answer key)`);
  return {
    parts: parts.map((part) => (typeof part === "string" ? { text: part } : { text: part.text, tag: part.tag })),
    steps,
    faces,
  };
});

// Faces for the background wall: the different avatars in the data, at most 160.
const unique = [...new Set(candidates.map((c) => c.avatar_url))].filter(isSafeUrl).sort();
const avatars = unique.filter((_, i) => i % Math.ceil(unique.length / 160) === 0);
if (avatars.length === 0) fail("no avatar links found in data/candidates.json.");

writeFileSync(
  "src/app/login/demo-data.json",
  JSON.stringify({ total: candidates.length, briefs, avatars }, null, 2) + "\n",
);
console.log(`${avatars.length} faces for the background. Wrote src/app/login/demo-data.json`);