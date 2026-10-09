-- =========================================================
-- Candidates are served only through our API (server, secret key).
-- Without this, a free-plan recruiter could query the table directly
-- with their own token and skip the 1-search limit.
-- =========================================================
drop policy "recruiters read candidates" on public.candidates;

-- Turns a JSON array like ["React","Go"] into a Postgres text[].
create or replace function public.jsonb_to_text_array(j jsonb)
returns text[]
language sql immutable
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(coalesce(j, '[]'::jsonb))), '{}')
$$;

-- =========================================================
-- SEARCH: filters in, ordered candidate ids out.
-- Every condition is skipped when its filter is empty.
-- =========================================================
create or replace function public.search_candidate_ids(f jsonb)
returns text[]
language sql stable
set search_path = ''
as $$
  with p as (
    select
      public.jsonb_to_text_array(f->'roles')         as roles,
      public.jsonb_to_text_array(f->'seniorities')   as seniorities,
      public.jsonb_to_text_array(f->'cities')        as cities,
      public.jsonb_to_text_array(f->'skills')        as skills,
      public.jsonb_to_text_array(f->'company_types') as company_types,
      public.jsonb_to_text_array(f->'companies')     as companies,
      public.jsonb_to_text_array(f->'schools')       as schools,
      public.jsonb_to_text_array(f->'degrees')       as degrees,
      public.jsonb_to_text_array(f->'fields')        as fields,
      (f->>'min_years')::int                         as min_years,
      (f->>'max_years')::int                         as max_years,
      (f->>'open_to_work')::boolean                  as open_to_work,
      coalesce(jsonb_array_length(f->'unsupported'), 0) as unsupported_count
  )
  select coalesce(
    array_agg(c.id order by c.open_to_work desc, c.years_experience desc, c.id),
    '{}'
  )
  from public.candidates c, p
  where p.unsupported_count = 0                                         -- can't answer it: nobody
    and (cardinality(p.roles) = 0         or c.role = any (p.roles))         -- ANY
    and (cardinality(p.seniorities) = 0   or c.seniority = any (p.seniorities))
    and (cardinality(p.cities) = 0        or c.city = any (p.cities))
    and (cardinality(p.skills) = 0        or c.skills @> p.skills)           -- ALL
    and (cardinality(p.company_types) = 0 or c.company_types @> p.company_types)
    and (cardinality(p.companies) = 0     or c.companies && p.companies)     -- ANY
    and (cardinality(p.schools) = 0       or c.schools && p.schools)
    and (cardinality(p.degrees) = 0       or c.degrees && p.degrees)
    and (cardinality(p.fields) = 0        or c.fields && p.fields)
    and (p.min_years is null              or c.years_experience >= p.min_years)
    and (p.max_years is null              or c.years_experience <= p.max_years)
    and (p.open_to_work is null           or c.open_to_work = p.open_to_work)
$$;

-- =========================================================
-- PLAN AND FREE-SEARCH LIMIT
-- =========================================================
create or replace function public.free_search_limit()
returns integer
language sql immutable
as $$ select 1 $$;

-- Paid while the company has an active Stripe subscription.
create or replace function public.is_paid(p_company_id text)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.company_id = p_company_id
      and s.status in ('active', 'trialing')
  )
$$;

-- Atomically uses one search. Returns false when none are left.
-- The UPDATE locks the company row, so concurrent requests queue up
-- and re-check the condition: only one can take the last free search.
create or replace function public.consume_search(p_company_id text)
returns boolean
language sql volatile
set search_path = ''
as $$
  with used as (
    update public.companies c
    set searches_used = c.searches_used + 1
    where c.id = p_company_id
      and (public.is_paid(p_company_id) or c.searches_used < public.free_search_limit())
    returning 1
  )
  select exists (select 1 from used)
$$;

-- Gives a search back if the search failed after it was counted.
create or replace function public.refund_search(p_company_id text)
returns void
language sql volatile
set search_path = ''
as $$
  update public.companies
  set searches_used = greatest(searches_used - 1, 0)
  where id = p_company_id
$$;

create or replace function public.get_plan(p_company_id text)
returns table (plan text, searches_remaining integer)
language sql stable
set search_path = ''
as $$
  select
    case when public.is_paid(c.id) then 'paid' else 'free' end,
    case when public.is_paid(c.id) then null
         else greatest(public.free_search_limit() - c.searches_used, 0) end
  from public.companies c
  where c.id = p_company_id
$$;

-- =========================================================
-- Only our server (secret key) may call these. A recruiter's token
-- must not be able to refund searches or search for free.
-- =========================================================
revoke execute on function public.search_candidate_ids(jsonb) from public, anon, authenticated;
revoke execute on function public.consume_search(text)        from public, anon, authenticated;
revoke execute on function public.refund_search(text)         from public, anon, authenticated;
revoke execute on function public.get_plan(text)              from public, anon, authenticated;
revoke execute on function public.is_paid(text)               from public, anon, authenticated;
