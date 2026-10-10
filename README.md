# Rotto Search

Recruiters describe who they need in plain English, for example "senior React engineers in New York who have worked at a startup". The app turns the brief into filters, shows which words it understood, and lists the matching candidates. Any filter can be changed by clicking the highlighted word. Candidates can be added to shortlists, shortlists can be shared with colleagues and exported as CSV, and searches can be saved. The app supports dark mode and phone screens.

## Running it

```bash
make setup   # installs packages, starts local Supabase, resets the database, seeds the data
make dev     # starts the app on http://localhost:3000
```

- **Requirements:** Node 24, Docker, Supabase CLI.
- **Settings:**
  - `make setup` writes the Supabase settings to `.env`.
  - Add `GEMINI_API_KEY` and `STRIPE_WEBHOOK_SECRET` to `.env.local`. `GEMINI_MODEL` is optional.
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
2. The server validates the reply with zod.
3. The Postgres function `search_candidate_ids` applies all filters together and stores the matching ids with the search.
4. Each page of results is a slice of the stored ids. Paging does not call the model and does not use up a search.
5. A correction sends the edited filters directly to the database without calling the model. The brief then shows the removed words struck out and the new ones added.

All 10 sample briefs return exactly the expected candidates.

## Preventing invented filters

- **Allowed values:** the schema only allows values from the fixed lists, and zod checks this again on the server.
- **Unsupported requests:** if the brief asks for something the data cannot match, such as an unknown city, the search returns no results and states the reason. It does not drop that part of the brief.
- **Highlights:** highlighted phrases are checked against the brief on the server and are used only for display. They never become filters.
- **Editor:** the filter editor only offers allowed values.

## Model choice

- **Model:** `gemini-3.5-flash-lite`, temperature 0, minimal thinking, response storage off.
- **Why:** the task is mapping one sentence onto known lists. With a strict schema, a small model is as accurate as a large one, and it is fast enough for the 3-second target.
- **Alternatives tested:**
  - `3.1-flash-lite` sometimes waited 1–13 seconds before answering.
  - The 2.5 models are not available to new accounts.
- **Slow responses:**
  - If there is no reply after 2 seconds, a second request is sent and the first reply is used.
  - After 9 seconds the search stops with an error message, and a free-plan search is refunded.

## Cost per search

Development used Gemini's free tier, so the actual cost was $0. At paid rates ($0.30 per million input tokens, $2.50 per million output tokens), a search uses about 1,480 input tokens and 110–300 output tokens, which is **$0.0007–$0.0012 per search** (about $1 per 1,000 searches). Paging and corrections do not call the model and cost nothing.

## Speed

Measured locally: searches take 1.4–2.1 seconds, and pages load in under 160 ms.

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
- **Tests:** `scripts/test-security.mts` runs 70 checks against these rules, through the API and directly through Supabase. All 70 pass.

## Tradeoffs

- **Result order:** all results match every filter. They are sorted by open to work first, then years of experience. This is predictable and keeps paging stable, but it does not measure how closely each candidate fits, so a stronger match can appear lower.
- **Synonyms:** filters are exact matches. Terms such as "engineers" (all engineering roles) are interpreted by the model, not by a separate synonym list.
- **Stripe timestamps:** old event timestamps are accepted so the sample events can be replayed. A production version should reject old events.
- **Corrections on the free plan:** a correction counts as a search, following a strict reading of "exactly one search".
- **Upgrading:** there is no Stripe Checkout page. The upgrade button explains the paid plan.
- **Notifications:** sharing notifications are shown in the app only. The badge updates when the tab is reopened and every 30 seconds. No emails are sent.

## With another week

- **Relevance ranking:** score each candidate by skill overlap, recency of matching experience, and required versus preferred filters.
- **Caching:** cache parsed briefs so repeated searches are instant and free.
- **Checkout:** add Stripe Checkout and a billing portal.
- **Tests in CI:** run the Playwright and security tests on every push.
- **Phones:** a bottom-sheet filter editor.
- **Sharing:**
  - Edit permissions for colleagues.
  - A way for the owner to remove a share.
  - Email notifications.