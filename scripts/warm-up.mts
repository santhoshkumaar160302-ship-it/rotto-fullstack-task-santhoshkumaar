// Runs alongside `make dev`. Next.js dev mode builds each page and API route the
// first time it's opened, which makes that first click slow. This visits every
// route once as soon as the server is up, so nobody waits for a build.
// It sends no sign-in token, so the API routes only answer 401: nothing is read,
// changed, or counted as a search.
const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const SOME_ID = "00000000-0000-4000-8000-000000000000";

const ROUTES = [
  "/login",
  "/",
  "/shortlists",
  "/saved",
  "/api/plan",
  "/api/search",
  `/api/search/${SOME_ID}?page=1`,
  "/api/people/warm-up",
  "/api/shortlists",
  `/api/shortlists/${SOME_ID}`,
  `/api/shortlists/${SOME_ID}/people/warm-up`,
  "/api/saved-briefs",
  `/api/saved-briefs/${SOME_ID}`,
  "/api/billing/events",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function serverIsUp(): Promise<boolean> {
  try {
    await fetch(`${BASE}/login`, { method: "HEAD" });
    return true;
  } catch {
    return false;
  }
}

// Wait up to a minute for `next dev` to start listening.
for (let i = 0; i < 120 && !(await serverIsUp()); i++) await sleep(500);

const started = Date.now();
for (const route of ROUTES) {
  // One at a time, so the builds don't compete with each other.
  await fetch(`${BASE}${route}`).catch(() => {});
}
console.log(`\n✓ Warmed up ${ROUTES.length} routes in ${((Date.now() - started) / 1000).toFixed(1)}s. The app is ready.\n`);
