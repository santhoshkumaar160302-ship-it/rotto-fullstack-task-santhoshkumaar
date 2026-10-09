-- =========================================================
-- 1. COMPANIES: acme and globex. Tracks free searches used.
--    Paid/free status comes from the subscriptions table.
-- =========================================================
create table public.companies (
  id            text primary key,              -- 'acme' | 'globex'
  name          text not null,
  searches_used integer not null default 0
);

-- =========================================================
-- 2. RECRUITERS: links each Supabase login to its company.
-- =========================================================
create table public.recruiters (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  company_id text not null references public.companies(id)
);

-- Returns the company of whoever is signed in.
-- "security definer" lets it read recruiters without being
-- blocked by that table's own security rules.
create or replace function public.current_company_id()
returns text
language sql stable security definer set search_path = ''
as $$
  select company_id from public.recruiters where user_id = auth.uid()
$$;

-- =========================================================
-- 3. CANDIDATES: shared by everyone. Lists (skills, schools,
--    degrees, fields, company types) are pulled out of the
--    nested JSON into arrays so Postgres can filter them fast.
-- =========================================================
create table public.candidates (
  id                       text primary key,
  full_name                text not null,
  avatar_url               text,
  headline                 text,
  current_title            text,
  current_company          text,
  current_company_logo_url text,
  role                     text not null,
  seniority                text not null,
  years_experience         integer not null,
  city                     text,
  state                    text,
  country                  text,
  open_to_work             boolean not null default false,
  skills                   text[] not null default '{}',
  company_types            text[] not null default '{}',  -- from experiences
  schools                  text[] not null default '{}',  -- from education
  degrees                  text[] not null default '{}',  -- from education
  fields                   text[] not null default '{}',  -- from education
  experiences              jsonb not null default '[]',   -- full detail for the profile page
  education                jsonb not null default '[]'
);

create index candidates_role_idx       on public.candidates (role);
create index candidates_seniority_idx  on public.candidates (seniority);
create index candidates_city_idx       on public.candidates (city);
create index candidates_skills_idx     on public.candidates using gin (skills);
create index candidates_comptypes_idx  on public.candidates using gin (company_types);
create index candidates_schools_idx    on public.candidates using gin (schools);
create index candidates_degrees_idx    on public.candidates using gin (degrees);
create index candidates_fields_idx     on public.candidates using gin (fields);

-- =========================================================
-- 4. SEARCHES: each search stores its ordered result IDs once,
--    so paging is just slicing this list (fast, no LLM call).
-- =========================================================
create table public.searches (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  created_by uuid not null references auth.users(id),
  brief      text not null,
  filters    jsonb not null check (jsonb_typeof(filters) = 'object'),
  result_ids text[] not null,
  created_at timestamptz not null default now()
);
create index searches_company_idx on public.searches (company_id, created_at desc);

-- =========================================================
-- 5. SHORTLISTS and the people on them.
--    company_id fills itself in from the signed-in recruiter.
-- =========================================================
create table public.shortlists (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null default public.current_company_id()
             references public.companies(id),
  name       text not null check (char_length(name) between 1 and 100),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index shortlists_company_idx on public.shortlists (company_id);

create table public.shortlist_people (
  shortlist_id uuid not null references public.shortlists(id) on delete cascade,
  candidate_id text not null references public.candidates(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (shortlist_id, candidate_id)   -- adding twice changes nothing
);

-- =========================================================
-- 6. SAVED SEARCHES: the brief plus the filters, re-run later.
-- =========================================================
create table public.saved_briefs (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null default public.current_company_id()
             references public.companies(id),
  brief      text not null check (char_length(brief) between 1 and 1000),
  filters    jsonb not null check (jsonb_typeof(filters) = 'object'),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index saved_briefs_company_idx on public.saved_briefs (company_id, created_at desc);

-- =========================================================
-- 7. BILLING: written only by our webhook (server side).
--    stripe_events  -> event IDs already handled (ignore repeats)
--    subscriptions  -> latest known state + timestamp of the
--                      event that set it (ignore older events)
-- =========================================================
create table public.stripe_events (
  id          text primary key,
  type        text not null,
  created     bigint not null,
  received_at timestamptz not null default now()
);

create table public.subscriptions (
  id                 text primary key,     -- Stripe subscription id
  company_id         text not null references public.companies(id),
  status             text not null,
  last_event_created bigint not null,
  updated_at         timestamptz not null default now()
);

-- =========================================================
-- 8. ROW LEVEL SECURITY: Postgres itself blocks access to
--    other companies' rows, even on direct Supabase calls.
--    A table with RLS on and no policy = nobody from the
--    browser can touch it (only our server with the secret key).
-- =========================================================
alter table public.companies        enable row level security;
alter table public.recruiters       enable row level security;
alter table public.candidates       enable row level security;
alter table public.searches         enable row level security;
alter table public.shortlists       enable row level security;
alter table public.shortlist_people enable row level security;
alter table public.saved_briefs     enable row level security;
alter table public.stripe_events    enable row level security;
alter table public.subscriptions    enable row level security;

-- Candidates: any signed-in recruiter can read; nobody can change.
create policy "recruiters read candidates" on public.candidates
  for select to authenticated using (true);

-- Companies: read your own company only; no updates from the browser.
create policy "read own company" on public.companies
  for select to authenticated
  using (id = (select public.current_company_id()));

-- Recruiters: read your own row only.
create policy "read own recruiter row" on public.recruiters
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Searches: read your company's searches; only the server creates them.
create policy "read own company searches" on public.searches
  for select to authenticated
  using (company_id = (select public.current_company_id()));

-- Shortlists: full control, own company only.
-- "with check" also stops moving a list to another company.
create policy "own company shortlists" on public.shortlists
  for all to authenticated
  using      (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

-- People on shortlists: allowed only if the list is your company's.
create policy "own company shortlist people" on public.shortlist_people
  for all to authenticated
  using (exists (
    select 1 from public.shortlists s
    where s.id = shortlist_id
      and s.company_id = (select public.current_company_id())))
  with check (exists (
    select 1 from public.shortlists s
    where s.id = shortlist_id
      and s.company_id = (select public.current_company_id())));

-- Saved searches: full control, own company only.
create policy "own company saved briefs" on public.saved_briefs
  for all to authenticated
  using      (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

-- stripe_events and subscriptions: no policies on purpose.