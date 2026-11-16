// A safety net after the model has read the brief.
//
// Anything in "unsupported" makes the search return nobody, so a phrase put
// there by mistake (for example "New York or San Francisco") hides every right
// person. This looks at each unsupported phrase and, if it is really just
// values we DO have, moves them into the right filter.
//
// It only ever adds values from the allowed lists, so it can't let anything
// unexpected reach the database. Pure code, no network: easy to test.
import {
  CITIES, COMPANIES, DEGREES, FIELDS, ROLES, SCHOOLS, SENIORITIES, SKILLS,
  type Filters, type Mention,
} from "./filters";

type ListKey = "roles" | "seniorities" | "cities" | "skills" | "companies" | "schools" | "degrees" | "fields";

// Every way of writing a value that we understand, lowercased, mapped to the
// filter it belongs to and the value(s) it means.
const WORDS = new Map<string, { key: ListKey; values: string[] }>();
function add(key: ListKey, values: string[], ...spellings: string[]) {
  for (const s of spellings) WORDS.set(s.toLowerCase(), { key, values });
}

for (const v of CITIES) add("cities", [v], v);
add("cities", ["New York"], "nyc", "ny", "new york city", "brooklyn", "manhattan");
add("cities", ["San Francisco"], "sf", "san fran", "bay area", "the bay area");
add("cities", ["Los Angeles"], "la", "l.a.");
add("cities", ["San Francisco", "Los Angeles"], "california", "ca");
add("cities", ["Austin"], "texas", "tx");
add("cities", ["Seattle"], "washington state");
add("cities", ["Boston"], "massachusetts");
add("cities", ["Chicago"], "illinois");
add("cities", ["Denver"], "colorado");
add("cities", ["Atlanta"], "georgia");
add("cities", ["Miami"], "florida");

for (const v of ROLES) add("roles", [v], v);
add("roles", ["Machine Learning Engineer"], "ml engineer");
add("roles", ["Backend Engineer"], "backend", "back end", "back-end", "backend developer");
add("roles", ["Frontend Engineer"], "frontend", "front end", "front-end", "frontend developer");
add("roles", ["Full Stack Engineer"], "full stack", "fullstack", "full-stack", "fullstack engineer", "full-stack engineer");
add("roles", ["Mobile Engineer"], "mobile");
add("roles", ["DevOps Engineer"], "devops", "sre", "site reliability engineer", "platform engineer");
add("roles", ["Data Engineer"], "data engineering");
add("roles", ["Product Manager"], "pm", "product management");
add("roles", ["Product Designer"], "designer", "ux designer", "ui designer");
add("roles", ["Account Executive"], "ae", "salesperson");
add("roles", ["Marketing Manager"], "marketer");

add("seniorities", ["junior"], "junior", "entry-level", "entry level", "graduate");
add("seniorities", ["mid"], "mid", "mid-level", "mid level");
add("seniorities", ["senior"], "senior");
add("seniorities", ["staff"], "staff");

for (const v of SKILLS) add("skills", [v], v);
add("skills", ["JavaScript"], "js");
add("skills", ["TypeScript"], "ts");
add("skills", ["Go"], "golang");
add("skills", ["Kubernetes"], "k8s");
add("skills", ["Postgres"], "postgresql");
add("skills", ["Ruby on Rails"], "rails", "ror");
add("skills", ["Node.js"], "node", "nodejs");
add("skills", ["GCP"], "google cloud");
add("skills", ["AWS"], "amazon web services");

for (const v of COMPANIES) add("companies", [v], v);

for (const v of SCHOOLS) add("schools", [v], v);
add("schools", ["UC Berkeley"], "berkeley");
add("schools", ["Carnegie Mellon University"], "cmu", "carnegie mellon");
add("schools", ["University of Texas at Austin"], "ut austin");
add("schools", ["University of Illinois"], "uiuc");
add("schools", ["University of Washington"], "uw");
add("schools", ["University of Michigan"], "umich");
add("schools", ["New York University"], "nyu");
add("schools", ["Stanford University"], "stanford");
add("schools", ["Columbia University"], "columbia");
add("schools", ["Cornell University"], "cornell");

for (const v of DEGREES) add("degrees", [v], v);
add("degrees", ["PhD"], "doctorate");
add("degrees", ["MS"], "master's", "masters");

for (const v of FIELDS) add("fields", [v], v);
add("fields", ["Computer Science"], "cs");
add("fields", ["Human-Computer Interaction"], "hci");
add("fields", ["Electrical Engineering"], "ee");
add("fields", ["Mathematics"], "math", "maths");
add("fields", ["Statistics"], "stats");

// Short words that can come before the values: "in", "based in", "who know"...
const LEAD = /^(?:(?:who|that)\s+)?(?:(?:are|is)\s+)?(?:based\s+in|located\s+in|living\s+in|in|at|from|knows?|knowing|with|using|has|have|either|worked\s+at|studied\s+at|studied)\s+/i;

// Looks one written value up, trying a few natural variations.
function normalize(raw: string): string {
  let word = raw.trim().replace(/^["'(]+|["').!?]+$/g, "").replace(/\s+/g, " ").toLowerCase();
  for (let i = 0; i < 3; i++) {
    const before = word;
    word = word.replace(LEAD, "");
    if (word === before) break;
  }
  return word.replace(/^(?:a|an|the)\s+/, "");
}

// The words of a part without the lead-in, keeping their case: "in New York" -> "New York".
function bare(raw: string): string {
  let text = raw.trim();
  for (let i = 0; i < 3; i++) {
    const before = text;
    text = text.replace(LEAD, "");
    if (text === before) break;
  }
  return text.replace(/^(?:a|an|the)\s+/i, "").trim();
}

function lookup(raw: string): { key: ListKey; values: string[] } | null {
  const word = normalize(raw);
  const tries = [
    word,
    word.replace(/s$/, ""),                                    // "recruiters"
    word.replace(/\s+(?:engineers?|developers?)$/, ""),        // "backend engineers" -> "backend"
    word.replace(/\s+developers?$/, " engineer"),              // "backend developers"
    word.replace(/\s+(?:skills?|experience)$/, ""),            // "pytorch experience"
    word.replace(/\s+(?:degree|grads?|graduates?|alumni)$/, ""), // "stanford grads"
  ];
  for (const t of tries) {
    const hit = WORDS.get(t);
    if (hit) return hit;
  }
  return null;
}

export type Repair = { filters: Filters; mentions: Mention[]; repaired: string[] };

// Moves unsupported phrases that are only known values into their filter.
export function repairUnsupported(filters: Filters, brief: string): Repair {
  const lowerBrief = brief.toLowerCase();
  let next: Filters = { ...filters };
  const mentions: Mention[] = [];
  const repaired: string[] = [];
  const keep: string[] = [];

  for (const phrase of filters.unsupported) {
    const isOr = /\bor\b|\s\/\s|\beither\b/i.test(phrase);
    // "A, B or C" / "A or B" / "A and B". "/" is only a separator when spaced
    // ("Python / Go"), so "CI/CD" and "A/B Testing" stay whole.
    const parts = phrase.split(/\s*,\s*|\s+(?:and\/or|or|and|&)\s+|\s+\/\s+/i).filter((p) => p.trim());
    const hits = parts.map((p) => ({ text: p, hit: lookup(p) }));
    const known = hits.filter((h) => h.hit !== null);
    const keys = new Set(known.map((h) => h.hit!.key));

    // Every value must belong to the same filter. With "or", a value we don't
    // have can be left out: nobody in the data has it, so "London or New York"
    // finds exactly the New York people. With "and", every part must be known.
    // A part we drop must look like a single value ("London", "Haskell"), never
    // a clause that may hide something we'd lose ("engineers in New York").
    const droppable = (text: string) => {
      const word = normalize(text);
      return word.length > 0 && word.split(" ").length <= 3 && !/\b(?:in|at|who|with|that|know|knows)\b/.test(word);
    };
    const unknownOk = hits.every((h) => h.hit !== null || (isOr && droppable(h.text)));
    const ok = known.length > 0 && keys.size === 1 && unknownOk;
    if (!ok) {
      keep.push(phrase);
      continue;
    }

    let key: ListKey | "skills_any" = known[0].hit!.key;
    if (key === "skills" && isOr) {
      // Only one group of alternatives can be expressed. A second one can't.
      if (next.skills_any.length > 0) {
        keep.push(phrase);
        continue;
      }
      key = "skills_any";
    }
    const values = [...new Set(known.flatMap((h) => h.hit!.values))];
    const current = next[key] as string[];
    next = { ...next, [key]: [...new Set([...current, ...values])] };
    repaired.push(phrase);

    // Highlight each value's own words in the brief, or the whole phrase.
    let placed = false;
    for (const h of known) {
      const words = bare(h.text);
      if (words && lowerBrief.includes(words.toLowerCase())) {
        mentions.push({ phrase: words, filter: key, values: h.hit!.values });
        placed = true;
      }
    }
    if (!placed && lowerBrief.includes(phrase.toLowerCase())) {
      mentions.push({ phrase, filter: key, values });
    }
  }

  next = { ...next, unsupported: keep };
  return { filters: next, mentions, repaired };
}

// Safety net 2: "frontend engineers" must never become every engineer role.
// "Engineers" on its own means all engineer roles, so the model sometimes
// returns that whole set even when the brief names a type of engineer. If it
// did, and the brief does name one or more types, keep only those types.
const ENGINEER_ROLES = ROLES.filter((r) => r.endsWith("Engineer"));
const ENGINEER_TYPES: [RegExp, (typeof ROLES)[number]][] = [
  [/\bfront[- ]?end\b/i, "Frontend Engineer"],
  [/\bback[- ]?end\b/i, "Backend Engineer"],
  [/\bfull[- ]?stack\b/i, "Full Stack Engineer"],
  [/\bmobile\b/i, "Mobile Engineer"],
  [/\bdevops\b|\bsres?\b|\bsite reliability\b|\bplatform engineers?\b/i, "DevOps Engineer"],
  [/\bdata engineers?\b/i, "Data Engineer"],
  [/\b(?:ml|machine learning) engineers?\b/i, "Machine Learning Engineer"],
];

export function narrowEngineerRoles(filters: Filters, brief: string): Filters {
  const isEveryEngineer =
    filters.roles.length === ENGINEER_ROLES.length && ENGINEER_ROLES.every((r) => filters.roles.includes(r));
  if (!isEveryEngineer) return filters;
  const named = ENGINEER_TYPES.filter(([words]) => words.test(brief)).map(([, role]) => role);
  return named.length > 0 ? { ...filters, roles: named } : filters;
}

// Safety net 3: "London or New York". If something we can't search for is
// only an alternative ("or") to a value we ARE filtering on, it isn't a
// requirement: everyone matching the other value already satisfies the brief.
// So it shouldn't make the search return nobody. "speaks Japanese" on its own
// is a real requirement and stays unsupported.
const MAX_WORDS = 4;

// Is this text (or its first/last few words) a value the filters already use?
function isUsedValue(text: string, filters: Filters, fromStart: boolean): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  for (let n = Math.min(MAX_WORDS, words.length); n >= 1; n--) {
    const part = fromStart ? words.slice(0, n) : words.slice(words.length - n);
    const hit = lookup(part.join(" "));
    if (!hit) continue;
    const used: string[] =
      hit.key === "skills" ? [...filters.skills, ...filters.skills_any] : [...(filters[hit.key] as string[])];
    if (hit.values.some((v) => used.includes(v))) return true;
  }
  return false;
}

export function dropUnknownAlternatives(filters: Filters, brief: string): Filters {
  if (filters.unsupported.length === 0) return filters;
  const words = brief.replace(/[,;()]/g, " ").split(/\s+/).filter(Boolean);
  const keep = filters.unsupported.filter((phrase) => {
    const target = bare(phrase).toLowerCase();
    if (!target) return true;
    for (let i = 0; i < words.length; i++) {
      if (words[i].toLowerCase() !== "or") continue;
      const left = words.slice(Math.max(0, i - MAX_WORDS), i).join(" ");
      const right = words.slice(i + 1, i + 1 + MAX_WORDS).join(" ");
      const leftLower = left.toLowerCase();
      const rightLower = right.toLowerCase();
      // "<unsupported> or <used value>"
      if ((leftLower === target || leftLower.endsWith(` ${target}`)) && isUsedValue(right, filters, true)) return false;
      // "<used value> or <unsupported>"
      if ((rightLower === target || rightLower.startsWith(`${target} `)) && isUsedValue(left, filters, false)) return false;
    }
    return true;
  });
  return keep.length === filters.unsupported.length ? filters : { ...filters, unsupported: keep };
}
