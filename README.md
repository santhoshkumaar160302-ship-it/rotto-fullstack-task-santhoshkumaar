# Rotto Search

**Demo video:** https://www.loom.com/share/7109778d4dab4632a2442746d8881b8c

Recruiters describe who they need in plain English, for example "senior React engineers in New York who have worked at a startup". The app turns the brief into filters, shows which words it understood, and lists the matching candidates. Every filter is shown as a chip under the brief, where it can be changed or removed, and new filters can be added; the highlighted words in the brief can be clicked too. Candidates can be added to shortlists, shortlists can be shared with colleagues and exported as CSV, and searches can be saved. The app supports dark mode and phone screens.

## Changes after review

Fixes for the review feedback (November 2026):

- **Briefs that returned nobody:** briefs with "or", such as "machine learning engineers in New York or San Francisco who know PyTorch", now return all 58 matches. See [Briefs with "or"](#briefs-with-or).
- **Changing a filter:** every filter is now a chip under the brief, with edit, remove and "+ Add filter".
- **Save search:** the button changes to "Saved", a confirmation links to the saved searches, the Saved tab shows how many there are, and a failed save shows the reason.
- **Paging:** about 650 ms → under 65 ms locally. A page is now one database call instead of four in a row, and the next page is loaded in the background.
- **Also:** Gemini calls now handle overload and rate limits (see [Model choice](#model-choice)), and Next.js is updated to 16.4.6 for a security fix.

## Running it

```bash
make setup   # installs packages, starts local Supabase, resets the database, seeds the data
make dev     # starts the app on http://localhost:3000
```

- **Requirements:** Node 24, Docker, Supabase CLI.
- **Settings:**
  - `make setup` writes the Supabase settings to `.env`.
  - Add `GEMINI_API_KEY` and `STRIPE_WEBHOOK_SECRET` to `.env.local`.
  - `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` are optional. The defaults are `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite`.
  - All of these are read on the server only.
- **Accounts:**
  - `recruiter@acme.test` and `recruiter@globex.test`, password `rotto-assessment`.
  - `recruiter2@acme.test` and `recruiter2@globex.test`, same password, are there for testing sharing.
  - Each browser tab keeps its own sign-in.
- **Plans:** both companies start on the free plan until the Stripe events are sent (see the next section).

## Testing the paid plan

Plans change only through Stripe webhooks. The script below sends the sample events from `data/stripe-events.json` to the webhook, the same way Stripe would.

1. **Start the app:** run `make dev` and leave it running.
2. **Check the starting plan:** sign in as `recruiter@globex.test`. The plan badge shows the free plan.
3. **Send the events:** open a second terminal in the project folder and run:
   ```bash
   node scripts/replay-stripe-events.mts
   ```
4. **Read the result:** the script prints each event and the plans after it. It also sends a tampered signature and a missing signature, and both are rejected with 400. It ends with:
   ```
   Final plans: {"acme":"free","globex":"paid"}
   Expected:    {"acme":"free","globex":"paid"}

   Billing checks passed.
   ```
5. **See it in the app:** go back to the Globex tab. The badge changes to "Paid plan, unlimited searches". It refreshes when you return to the tab, or press Cmd+R.
6. **Compare with Acme:** sign in as `recruiter@acme.test` in another tab. Acme is still on the free plan: one search works, and the next one shows the limit and how to upgrade.

The script clears the billing tables before sending, so it can be run any number of times with the same result. To start over completely, run `make setup` again.

## How search works

1. The brief is sent to Gemini as data, not as instructions. Gemini must reply with JSON that matches a schema. Every field in the schema is a fixed list of values that exist in the data (roles, seniority, cities, skills, company types, schools and others).
2. The server validates the reply with zod, then applies three safety checks for known model mistakes (see [Briefs with "or"](#briefs-with-or)).
3. The Postgres function `search_candidate_ids` applies all filters together and stores the matching ids with the search. A candidate must match any of the listed roles, cities, seniority levels, employers, schools, degrees and fields, have all of the required skills, and have at least one skill from "one of these skills".
4. Each page of results is one database call, `get_search_page`, which returns a slice of the stored ids. It runs with the recruiter's own sign-in, so it only ever returns the company's own searches. Paging does not call the model and does not use up a search.
5. A correction, from the filter bar or a highlighted word, sends the edited filters directly to the database without calling the model. The brief then shows the removed words struck out and the new ones added.

All 10 sample briefs, and 13 more briefs with "or" in `data/queries-or.json`, return exactly the expected candidates. To check: `node scripts/eval-search.mts` or `node scripts/eval-search.mts data/queries-or.json`.

## Briefs with "or"

Some briefs list alternatives, for example "machine learning engineers in New York or San Francisco who know PyTorch". Before the fix, the model sometimes marked such a phrase as something the data can't answer, and the search returned nobody, even though 58 candidates match.

- **Instructions to the model:**
  - "or" between allowed values is an ordinary list: "New York or San Francisco" means either city.
  - "Python or Go" goes into a separate filter, "one of these skills".
  - An alternative that isn't in the data is left out, because the other alternative already satisfies the brief: "London or New York" finds the New York candidates, since nobody in the data lives in London.
- **Safety checks in code** (`src/lib/search/repair.ts`), applied after the model answers:
  - A phrase marked unsupported that only contains values we have, such as "New York or San Francisco", is moved into the right filter.
  - "Frontend engineers" never becomes every engineering role.
  - Something unsupported that is only an alternative ("London or New York") no longer empties the search.
- **Unchanged:** a real requirement the data can't match, such as "speaks Japanese", still returns nobody, and the reason is shown.
- **Limits:** the checks only ever add values from the allowed lists.

## Preventing invented filters

- **Allowed values:** the schema only allows values from the fixed lists, and zod checks this again on the server.
- **Unsupported requests:** if the brief requires something the data cannot match, such as a language, the search returns no results and states the reason. It does not drop that part of the brief. An alternative joined by "or" is different: see [Briefs with "or"](#briefs-with-or).
- **Highlights:** highlighted phrases are checked against the brief on the server and are used only for display. They never become filters.
- **Editor:** the filter bar and the filter editor only offer allowed values.

## Model choice

- **Models:** `gemini-3.1-flash-lite` first, with `gemini-3.5-flash-lite` as a fallback. Temperature 0, minimal thinking, response storage off. `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` change them without editing code (`GEMINI_FALLBACK_MODEL=""` turns the fallback off).
- **Why a small model:** the task is mapping one sentence onto known lists. With a strict schema, a small model is as accurate as a large one, and it is normally fast enough for the 3-second target.
- **Why 3.1 first:**
  - Both models return the expected candidates for all 23 test briefs and pass the security tests.
  - Measured side by side with `scripts/gemini-speed.mts` (November 2026): 3.1 typically answered in about 1.4 seconds with no errors. 3.5 typically took 6–9 seconds, up to 13, and failed 4 of 10 requests with "high demand" (503) errors, which other developers have also reported.
  - Load on each model changes from hour to hour, which is why both are configured.
- **Why a fallback:** on Gemini's free tier each model has its own limit, about 10 requests a minute per Google project. When one model says "too many requests" (429) or "overloaded" (503), the next request goes to the other model. A model that asked us to wait is left alone for that long, up to a minute.
- **Slow responses:**
  - If there is no answer after 2 seconds, an identical backup request is sent, and again after 5 and 8 seconds. The first answer is used. A search sends at most 4 requests.
  - The Google library's own automatic retries are turned off. They re-sent refused requests up to 4 times without telling us, which looked like a hang and used up the rate limit.
  - After 15 seconds the search stops with a clear message ("took too long", "too many searches" or "overloaded"), and a free-plan search is refunded.
- **Alternatives tested:**
  - Google's older `generateContent` API was much slower (6–13 seconds for the same model) than the Interactions API used here.
  - The 2.5 models are not available to new accounts.

## Cost per search

Development used Gemini's free tier, so the actual cost was $0. At paid rates for `gemini-3.1-flash-lite` ($0.25 per million input tokens, $1.50 per million output tokens), a request uses about 2,000 input tokens and 200–300 output tokens, which is **about $0.0008–$0.0010 per search** (about $1 per 1,000 searches). When Gemini is slow, backup requests can turn one search into 2–4 requests. Paging and corrections do not call the model and cost nothing.

## Speed

Measured locally in November 2026:

- **Pages:** the slowest page in each test run took 27–62 ms (target 300 ms).
- **Searches:** 1.3–2.5 seconds when Gemini responds normally (target 3 seconds). Our own part of a search takes about 0.1 seconds; the rest is waiting for Gemini. Under heavy load on Gemini's free tier, the backups and the fallback model keep searches from failing, but they can take 3–8 seconds.
- **Measuring:** `scripts/eval-search.mts` times every search and page. `scripts/gemini-speed.mts` separates connection time from Gemini's own time and compares two models.

## Security, sharing and billing

- **Company isolation:**
  - Every table uses row-level security, so one company cannot read or change another company's searches, shortlists or saved searches.
  - Candidate data is read only through the API.
  - Secret keys are used on the server only. A scan of the production build confirms none are in the browser code.
  - Opening another company's link shows "not available".
- **Sharing:**
  - Shortlists are private to the recruiter who created them.
  - The owner can send a shortlist to a colleague at the same company. The colleague sees a notification badge and can accept or decline.
  - Accepted shortlists are view only for the colleague.
  - These rules are enforced in the database.
- **Sign-in:**
  - Visitors who are not signed in are sent to the login page, then returned to the page they requested. Only addresses inside the app are accepted.
  - Signing out reloads the page and clears all data from the previous account.
- **Billing:**
  - Plans change only through Stripe webhooks.
  - Each signature is verified, and duplicate events are ignored.
  - Older events cannot overwrite newer ones.
  - Cancelling a subscription returns the company to the free plan.
- **Free plan:**
  - One search, claimed with a single conditional `UPDATE`, so two simultaneous searches cannot both succeed.
  - The number of remaining searches and the upgrade option are always visible.
- **Tests:** `scripts/test-security.mts` runs 77 checks against these rules, through the API and directly through Supabase, including the paging function. All 77 pass.

## Tradeoffs

- **Result order:** all results match every filter. They are sorted by open to work first, then years of experience. This is predictable and keeps paging stable, but it does not measure how closely each candidate fits, so a stronger match can appear lower.
- **Synonyms:** filters are exact matches. Terms such as "engineers" (all engineering roles) are interpreted by the model. A short list of spellings in `repair.ts` is used only by the safety checks.
- **Alternatives:** one group of "one of these skills" per search. "React or Vue, and Python or Go" cannot be expressed, so the second group is shown as unsupported.
- **Gemini's free tier:** about 10 requests per minute and 500 per day for each model, per Google project. With two models the app can handle about 20 searches a minute. Beyond that, searches stop with "Too many searches right now" until the limit resets, and the search is refunded. A paid key raises these limits.
- **Search time:** depends on Gemini's load. The 3-second target holds when Gemini responds normally, but not while it is overloaded.
- **Stripe timestamps:** old event timestamps are accepted so the sample events can be replayed. A production version should reject old events.
- **Corrections on the free plan:** a correction counts as a search, following a strict reading of "exactly one search".
- **Upgrading:** there is no Stripe Checkout page. The upgrade button explains the paid plan.
- **Notifications:** sharing notifications are shown in the app only. The badge updates when the tab is reopened and every 30 seconds. No emails are sent.

## With another week

- **Relevance ranking:** score each candidate by skill overlap, recency of matching experience, and required versus preferred filters.
- **Caching:** cache parsed briefs so repeated searches are instant, free, and don't count against Gemini's limits.
- **Shorter model answers:** work out the highlighted words in code instead of asking the model for them. The model's answer would be much shorter, so searches would be faster.
- **Checkout:** add Stripe Checkout and a billing portal.
- **Tests in CI:** run the Playwright and security tests on every push.
- **Phones:** a bottom-sheet filter editor.
- **Sharing:**
  - Edit permissions for colleagues.
  - A way for the owner to remove a share.
  - Email notifications.