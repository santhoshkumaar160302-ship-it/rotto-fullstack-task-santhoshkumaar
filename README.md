# Rotto Search

Candidate search for recruiters. Describe who you need in plain English, for example "senior React engineers in New York who have worked at a startup", and get the matching candidates.

**Live site:** https://rotto-fullstack-task-santhoshkumaar.vercel.app

Sign in with `recruiter@globex.test` / `rotto-assessment` (paid plan, unlimited searches).

## Features

- **Plain-English search:** the brief is turned into filters, and the words the app understood are highlighted.
- **Editable filters:** every filter is a chip under the brief. Change it, remove it, or add a new one, and the results update without another AI call.
- **Shortlists:** add candidates to shortlists, share them with a colleague (view only), and export them as CSV.
- **Saved searches:** save a search and run it again later.
- **Plans:** a free plan with one search and a paid plan with unlimited searches, changed through Stripe webhooks.
- **Company isolation:** each company only ever sees its own searches, shortlists and saved searches.
- **Dark mode and phone screens.**

## Tech stack

- **App:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database and sign-in:** Supabase (Postgres, Auth, row-level security)
- **AI:** Google Gemini (`gemini-3.1-flash-lite`, with `gemini-3.5-flash-lite` as fallback)
- **Validation:** zod
- **Billing:** Stripe webhooks
- **Hosting:** Vercel and hosted Supabase

## Live site

- **Account:** `recruiter@globex.test`, password `rotto-assessment`.
- **Plan:** paid, with unlimited searches. It was upgraded by sending the sample Stripe events in `data/stripe-events.json` to the live webhook, the same way Stripe would.
- **Sharing:** the live site has a single account, so sharing a shortlist with a colleague can only be tried locally, where each company has two accounts.
- **Data:** the same 5,000 candidates and database migrations as the local setup.

## Getting started

### Requirements

- Node 24
- Docker
- Supabase CLI

### Install and run

```bash
make setup   # installs packages, starts local Supabase, resets the database, seeds the data
make dev     # starts the app on http://localhost:3000
```

### Settings

`make setup` writes the Supabase settings to `.env`. Add the rest to `.env.local`:

| Name | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Gemini API key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Verifies Stripe webhook signatures |
| `GEMINI_MODEL` | No | Model to use first. Default `gemini-3.1-flash-lite` |
| `GEMINI_FALLBACK_MODEL` | No | Model to fall back on. Default `gemini-3.5-flash-lite`. Set to `""` to turn the fallback off |

All of these are read on the server only.

### Accounts

- `recruiter@acme.test` and `recruiter@globex.test`, password `rotto-assessment`.
- `recruiter2@acme.test` and `recruiter2@globex.test`, same password, for testing sharing.
- Each browser tab keeps its own sign-in.
- Both companies start on the free plan until the Stripe events are sent (see [Testing the paid plan](#testing-the-paid-plan)).

## Testing

Start the app with `make dev`, then run these in a second terminal.

| Command | What it checks |
| --- | --- |
| `node scripts/eval-search.mts` | The 10 sample briefs return exactly the expected candidates. Also times every search and page |
| `node scripts/eval-search.mts data/queries-or.json` | 13 more briefs with "or" |
| `node scripts/test-security.mts` | 77 checks of company isolation, sharing, billing and hostile briefs, through the API and directly through Supabase |
| `node scripts/replay-stripe-events.mts` | The Stripe webhook: signatures, duplicates, event order |
| `npx tsx scripts/gemini-speed.mts` | Gemini's response time, and a comparison of two models |

To send the sample Stripe events to a deployed site instead, set `APP_URL` and pass that site's settings: `APP_URL=https://... node --env-file=<settings file> scripts/replay-stripe-events.mts`.

Gemini's free tier allows about 10 requests a minute per model. Add a pause between briefs to stay under it: `EVAL_DELAY_MS=7000 node scripts/eval-search.mts`.

### Testing the paid plan

Plans change only through Stripe webhooks. The script sends the sample events from `data/stripe-events.json` to the webhook, the same way Stripe would.

1. Run `make dev` and leave it running.
2. Sign in as `recruiter@globex.test`. The plan badge shows the free plan.
3. In a second terminal, run:
   ```bash
   node scripts/replay-stripe-events.mts
   ```
4. The script prints each event and the plans after it. It also sends a tampered signature and a missing signature, and both are rejected with 400. It ends with:
   ```
   Final plans: {"acme":"free","globex":"paid"}
   Expected:    {"acme":"free","globex":"paid"}

   Billing checks passed.
   ```
5. Go back to the Globex tab. The badge changes to "Paid plan, unlimited searches".
6. Sign in as `recruiter@acme.test` in another tab. Acme is still on the free plan: one search works, and the next one shows the limit and how to upgrade.

The script clears the billing tables first, so it can be run any number of times. To start over completely, run `make setup` again.

## How it works

### Search

1. The brief is sent to Gemini as data, not as instructions. Gemini must reply with JSON that matches a schema. Every field in the schema is a fixed list of values that exist in the data (roles, seniority, cities, skills, company types, schools and others).
2. The server validates the reply with zod, then applies three safety checks for known model mistakes (see [Briefs with "or"](#briefs-with-or)).
3. The Postgres function `search_candidate_ids` applies all filters together and stores the matching ids with the search. A candidate must match any of the listed roles, cities, seniority levels, employers, schools, degrees and fields, have all of the required skills, and have at least one skill from "one of these skills".
4. Each page of results is one database call, `get_search_page`, which returns a slice of the stored ids. It runs with the recruiter's own sign-in, so it only returns the company's own searches. Paging does not call the model and does not use up a search.
5. A correction, from the filter bar or a highlighted word, sends the edited filters directly to the database without calling the model.

### Briefs with "or"

- "or" between allowed values is an ordinary list: "New York or San Francisco" means either city.
- "Python or Go" goes into a separate filter, "one of these skills".
- An alternative that isn't in the data is left out, because the other alternative already satisfies the brief: "London or New York" finds the New York candidates.
- Three safety checks in `src/lib/search/repair.ts` run after the model answers:
  - A phrase marked unsupported that only contains values we have is moved into the right filter.
  - "Frontend engineers" never becomes every engineering role.
  - Something unsupported that is only an alternative no longer empties the search.
- A real requirement the data can't match, such as "speaks Japanese", returns nobody, and the reason is shown.

### Preventing invented filters

- The schema only allows values from the fixed lists, and zod checks this again on the server.
- The safety checks only ever add values from the allowed lists.
- Highlighted phrases are checked against the brief on the server and are used only for display. They never become filters.
- The filter bar and the filter editor only offer allowed values.

### Calling Gemini

- **Settings:** temperature 0, minimal thinking, response storage off.
- **Two models:** on the free tier each model has its own limit. When one says "too many requests" (429) or "overloaded" (503), the next request goes to the other.
- **Slow responses:** if there is no answer after 2 seconds, an identical backup request is sent, and again after 5 and 8 seconds. The first answer is used. A search sends at most 4 requests.
- **No hidden retries:** the Google library's automatic retries are turned off, so every failure is visible and handled in our code.
- **Giving up:** after 15 seconds the search stops with a clear message, and a free-plan search is refunded.

### Security, sharing and billing

- **Company isolation:** every table uses row-level security. Candidate data is read only through the API. Secret keys are used on the server only.
- **Sharing:** shortlists are private to the recruiter who created them. The owner can send one to a colleague at the same company, who can accept or decline. Accepted shortlists are view only. These rules are enforced in the database.
- **Sign-in:** visitors who are not signed in are sent to the login page, then returned to the page they requested. Signing out clears all data from the previous account.
- **Billing:** each webhook signature is verified, duplicate events are ignored, and older events cannot overwrite newer ones. Cancelling returns the company to the free plan.
- **Free plan:** one search, claimed with a single conditional `UPDATE`, so two simultaneous searches cannot both succeed.

## Performance and cost

Measured locally in November 2026:

- **Pages:** the slowest page in each test run took 27–62 ms (target 300 ms).
- **Searches:** 1.3–2.5 seconds when Gemini responds normally (target 3 seconds). Our own part takes about 0.1 seconds; the rest is waiting for Gemini. Under heavy load on Gemini's free tier, searches can take 3–8 seconds.
- **Cost:** development used Gemini's free tier. At paid rates for `gemini-3.1-flash-lite` ($0.25 per million input tokens, $1.50 per million output tokens), a search costs about $0.0008–$0.0010. Paging and corrections cost nothing.

## Project structure

```
src/app/            pages and API routes
src/components/     screens and UI components
src/lib/search/     brief parsing, safety checks, filters, database search
src/lib/supabase/   Supabase clients (browser, signed-in user, server admin)
src/lib/billing/    Stripe signature verification
supabase/migrations database tables, security rules and functions
scripts/            setup, seeding and test scripts
data/               candidates, sample briefs and sample Stripe events
```

## Deployment

The live site runs on Vercel with a hosted Supabase project.

1. **Database:** create a Supabase project, then run `npx supabase link --project-ref <id>` and `npx supabase db push` to apply the migrations.
2. **Data:** run `scripts/seed.mts` with the hosted project's URL and keys to load the candidates and demo accounts.
3. **App:** import the repository into Vercel and add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY` and `STRIPE_WEBHOOK_SECRET` as environment variables.

Every push to `main` deploys automatically.

## Limitations

- **Result order:** results are sorted by open to work first, then years of experience. This keeps paging stable, but it does not measure how closely each candidate fits.
- **Alternatives:** one group of "one of these skills" per search. "React or Vue, and Python or Go" cannot be expressed.
- **Gemini's free tier:** about 10 requests per minute and 500 per day for each model. Beyond that, searches stop with "Too many searches right now" until the limit resets.
- **Search time:** depends on Gemini's load. The 3-second target holds when Gemini responds normally, but not while it is overloaded.
- **Stripe:** there is no Checkout page, and old event timestamps are accepted so the sample events can be replayed.
- **Corrections on the free plan:** a correction counts as a search.
- **Notifications:** sharing notifications are shown in the app only. No emails are sent.

## Roadmap

- **Relevance ranking:** score candidates by skill overlap and recency of matching experience.
- **Caching:** cache parsed briefs so repeated searches are instant and free.
- **Shorter model answers:** work out the highlighted words in code, so the model's answer is shorter and searches are faster.
- **Checkout:** add Stripe Checkout and a billing portal.
- **CI:** run the tests on every push.
- **Sharing:** edit permissions, removing a share, and email notifications.
