// Runs every brief in a queries file through the REAL API, like the graders:
// POST /api/search, then every page. Scores each brief:
//   recall    = how many of the right people we found
//   precision = how many of the people we returned were right
//   page 1    = how many of the first 20 were right
// Also times the search and the slowest page, and checks nobody appears twice.
//
// Dev tool only. Needs `make dev` running in another terminal. acme is on the
// free plan (1 search), so this resets acme's counter before each brief.
//
// Usage: node scripts/eval-search.mts [path/to/queries.json]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(".env");
const APP = "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type Query = { brief: string; expected_ids: string[] };
type SearchResponse = {
  search_id: string;
  total: number;
  filters: Record<string, unknown>;
  results: { id: string }[];
  error?: string;
};
type PageResponse = { results: { id: string }[] };

const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});
const publicClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

const { data: auth, error: authError } = await publicClient.auth.signInWithPassword({
  email: "recruiter@acme.test",
  password: "rotto-assessment",
});
if (authError || !auth.session) {
  console.error("Sign-in failed:", authError);
  process.exit(1);
}
const headers = {
  Authorization: `Bearer ${auth.session.access_token}`,
  "Content-Type": "application/json",
};

const queries: Query[] = JSON.parse(readFileSync(process.argv[2] ?? "data/queries.json", "utf8"));
const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
const ratio = (hits: number, total: number, ifEmpty: number) => (total === 0 ? ifEmpty : hits / total);
const compact = (f: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(f).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)),
  );

let sumRecall = 0, sumPrecision = 0, sumFirst = 0, slowestSearch = 0, slowestPage = 0;

const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 0);
for (const q of queries) {
  if (DELAY_MS) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    const { error: resetError } = await admin
    .from("companies")
    .update({ searches_used: 0 })
    .eq("id", "acme");
  if (resetError) {
    console.error("Could not reset acme's search counter:", resetError);
    process.exit(1);
  }
  const expected = new Set(q.expected_ids);

  const t0 = performance.now();
  const res = await fetch(`${APP}/api/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ brief: q.brief }),
  });
  const searchMs = Math.round(performance.now() - t0);
  const body = (await res.json()) as SearchResponse;
  if (!res.ok) {
    console.log(`✗ HTTP ${res.status}: ${body.error} | ${q.brief}`);
    continue;
  }

  const firstPage = body.results.map((r) => r.id);
  const all = [...firstPage];
  let pageMs = 0;
  for (let page = 2; (page - 1) * 20 < body.total; page++) {
    const t1 = performance.now();
    const p = (await fetch(`${APP}/api/search/${body.search_id}?page=${page}`, { headers }).then((r) =>
      r.json(),
    )) as PageResponse;
    pageMs = Math.max(pageMs, Math.round(performance.now() - t1));
    all.push(...p.results.map((r) => r.id));
  }

  const hits = all.filter((id) => expected.has(id)).length;
  const recall = ratio(hits, expected.size, all.length === 0 ? 1 : 0);
  const precision = ratio(hits, all.length, expected.size === 0 ? 1 : 0);
  const first = ratio(
    firstPage.filter((id) => expected.has(id)).length,
    firstPage.length,
    expected.size === 0 ? 1 : 0,
  );
  const duplicates = all.length - new Set(all).size;
  const perfect = recall === 1 && precision === 1 && duplicates === 0 && all.length === body.total;

  sumRecall += recall;
  sumPrecision += precision;
  sumFirst += first;
  slowestSearch = Math.max(slowestSearch, searchMs);
  slowestPage = Math.max(slowestPage, pageMs);

  console.log(
    `${perfect ? "✓" : "✗"} recall ${pct(recall)}  precision ${pct(precision)}  page1 ${pct(first)}` +
      `  | ${searchMs}ms search, ${pageMs}ms slowest page` +
      `${duplicates ? `  | ${duplicates} DUPLICATES` : ""}  | ${q.brief}`,
  );
  if (!perfect) console.log(`    filters: ${JSON.stringify(compact(body.filters))}`);
}

const n = queries.length;
console.log(
  `\nAverage: recall ${pct(sumRecall / n)}, precision ${pct(sumPrecision / n)}, page 1 ${pct(sumFirst / n)}`,
);
console.log(`Slowest search: ${slowestSearch}ms (limit 3000ms)`);
console.log(`Slowest page:   ${slowestPage}ms (limit 300ms)`);