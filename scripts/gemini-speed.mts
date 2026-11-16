// Where does the time go when we ask Gemini? Diagnosis only: it sends 20
// requests to Gemini (no searches are used and nothing is saved) and takes
// about 2 minutes.
//
// For every request it measures, separately:
//   - connecting to Google (only when a new connection is needed)
//   - Gemini working (from sending the request until the answer starts)
// and checks the answer is right for the test brief. It compares the model we
// use with another one (default: our fallback model), in the same run so
// both face the same load on Google's side, after a pause (like searches in
// the app) and straight after another request.
//
// Run: npx tsx scripts/gemini-speed.mts
// Another model to compare: OTHER_MODEL=gemini-3.8-flash npx tsx scripts/gemini-speed.mts
import { existsSync } from "node:fs";
import dc from "node:diagnostics_channel";
import { GoogleGenAI } from "@google/genai";
import { FALLBACK_MODEL, MODEL, RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "../src/lib/search/parse-brief";

for (const file of [".env", ".env.local"]) if (existsSync(file)) process.loadEnvFile(file);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env or .env.local");
const ai = new GoogleGenAI({ apiKey });
const BRIEF = "junior frontend engineers in Boston who are open to work";
const OTHER_MODEL = process.env.OTHER_MODEL || FALLBACK_MODEL || "gemini-3.5-flash-lite";
const ROUNDS = 5;
const PAUSE_MS = 6000;

// Moments Node's fetch reports. We keep the first of each for the current request.
type Marks = { connectStart?: number; connected?: number; sent?: number; firstByte?: number };
let marks: Marks = {};
const note = (key: keyof Marks) => () => {
  marks[key] ??= performance.now();
};
dc.subscribe("undici:client:beforeConnect", note("connectStart"));
dc.subscribe("undici:client:connected", note("connected"));
dc.subscribe("undici:client:sendHeaders", note("sent"));
dc.subscribe("undici:request:headers", note("firstByte"));

// Exactly what the app sends, for a given model.
const ask = (model: string) => async () => {
  const reply = await ai.interactions.create(
    {
      model,
      system_instruction: SYSTEM_INSTRUCTION,
      input: JSON.stringify({ brief: BRIEF }),
      response_format: { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA },
      generation_config: { temperature: 0, thinking_level: "minimal" },
      store: false,
    },
    { maxRetries: 0 },
  );
  // Right answer for the test brief?
  const f = JSON.parse(reply.output_text ?? "{}");
  const right =
    JSON.stringify(f.roles) === '["Frontend Engineer"]' &&
    JSON.stringify(f.seniorities) === '["junior"]' &&
    JSON.stringify(f.cities) === '["Boston"]' &&
    f.open_to_work === true &&
    (f.unsupported ?? []).length === 0;
  return right ? "right answer" : `WRONG answer: ${JSON.stringify({ roles: f.roles, cities: f.cities, unsupported: f.unsupported })}`;
};

type Row = { label: string; total: number | null; connectMs: number | null; geminiMs: number | null; problem: string; right: boolean };
const rows: Row[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ms = (value: number | null) => (value === null || Number.isNaN(value) ? "?" : `${Math.round(value)} ms`);

async function measure(label: string, call: () => Promise<string>) {
  marks = {};
  const start = performance.now();
  let total: number | null = null;
  let problem = "";
  let answer = "";
  try {
    answer = await Promise.race([
      call(),
      sleep(20000).then(() => {
        throw new Error("no answer in 20 s");
      }),
    ]);
    total = performance.now() - start;
  } catch (error) {
    const e = error as { status?: number; message?: string };
    problem = e.status === 429 ? "Gemini said too many requests (429)" : String(e.message ?? error).slice(0, 100);
  }
  const m = marks;
  const row: Row = {
    label,
    total,
    connectMs: m.connectStart !== undefined && m.connected !== undefined ? m.connected - m.connectStart : null,
    geminiMs: m.sent !== undefined && m.firstByte !== undefined ? m.firstByte - m.sent : null,
    problem: problem || answer,
    right: answer === "right answer",
  };
  rows.push(row);
  console.log(
    `${label.padEnd(44)} ${(total === null ? "FAILED" : ms(total)).padStart(8)} | ` +
      `${row.connectMs === null ? "reused connection     " : `new connection: ${ms(row.connectMs).padStart(6)}`} | ` +
      `Gemini working: ${ms(row.geminiMs).padStart(8)} | ${row.problem}`,
  );
}

const OURS = `${MODEL} (ours)`;
console.log(`Comparing ${OURS} with ${OTHER_MODEL}. ${ROUNDS} rounds; each sends the brief 4 times.\n`);
for (let round = 1; round <= ROUNDS; round++) {
  console.log(`Round ${round} of ${ROUNDS}`);
  // Alternate which model goes first, so neither always gets the "after a pause" slot advantage.
  const order = round % 2 ? [MODEL, OTHER_MODEL] : [OTHER_MODEL, MODEL];
  for (const model of order) {
    const name = model === MODEL ? OURS : model;
    await sleep(PAUSE_MS);
    await measure(`${name}, after a pause`, ask(model));
    await measure(`${name}, straight after`, ask(model));
  }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
};
console.log("\nSUMMARY");
for (const label of [...new Set(rows.map((r) => r.label))]) {
  const group = rows.filter((r) => r.label === label);
  const answered = group.filter((r) => r.total !== null).map((r) => r.total!);
  const connects = group.filter((r) => r.connectMs !== null).map((r) => r.connectMs!);
  const working = group.filter((r) => r.geminiMs !== null).map((r) => r.geminiMs!);
  console.log(
    `${label.padEnd(44)} typical ${ms(median(answered))}, slowest ${ms(answered.length ? Math.max(...answered) : NaN)}, ` +
      `over 2 s: ${answered.filter((t) => t > 2000).length}/${group.length}, failed: ${group.length - answered.length}, ` +
      `right answers: ${group.filter((r) => r.right).length}/${group.length} | ` +
      `new connections: ${connects.length}/${group.length}${connects.length ? ` (typical ${ms(median(connects))})` : ""} | ` +
      `Gemini working: typical ${ms(median(working))}`,
  );
}
process.exit(0);
