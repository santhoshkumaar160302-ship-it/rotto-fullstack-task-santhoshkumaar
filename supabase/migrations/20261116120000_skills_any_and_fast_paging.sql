-- =========================================================
-- 1. "Python or Go": a new filter, skills_any. A candidate needs
--    AT LEAST ONE of these skills (skills still needs ALL).
--    Everything else is unchanged from search_functions.sql.
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
      public.jsonb_to_text_array(f->'skills_any')    as skills_any,
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
    and (cardinality(p.skills_any) = 0    or c.skills && p.skills_any)       -- ANY
    and (cardinality(p.company_types) = 0 or c.company_types @> p.company_types)
    and (cardinality(p.companies) = 0     or c.companies && p.companies)     -- ANY
    and (cardinality(p.schools) = 0       or c.schools && p.schools)
    and (cardinality(p.degrees) = 0       or c.degrees && p.degrees)
    and (cardinality(p.fields) = 0        or c.fields && p.fields)
    and (p.min_years is null              or c.years_experience >= p.min_years)
    and (p.max_years is null              or c.years_experience <= p.max_years)
    and (p.open_to_work is null           or c.open_to_work = p.open_to_work)
$$;

revoke execute on function public.search_candidate_ids(jsonb) from public, anon, authenticated;

-- =========================================================
-- 2. FAST PAGING: one page of a saved search in ONE database call.
--    Before, a page took four trips one after another (check the
--    token with Auth, find the recruiter, read the search, read the
--    candidates). Now the API makes a single call with the
--    recruiter's own token: the database checks the token, and the
--    company check below means you only ever see your own company's
--    searches (another company's search id returns nothing -> 404).
--    It only returns people already in that saved search, so it
--    can't be used to search for free.
-- =========================================================
create or replace function public.get_search_page(p_search_id uuid, p_page integer)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'search_id', s.id,
    'brief',     s.brief,
    'filters',   s.filters,
    'mentions',  s.mentions,
    'total',     cardinality(s.result_ids),
    'results',   coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'full_name', c.full_name,
          'avatar_url', c.avatar_url,
          'headline', c.headline,
          'current_title', c.current_title,
          'current_company', c.current_company,
          'current_company_logo_url', c.current_company_logo_url,
          'role', c.role,
          'seniority', c.seniority,
          'years_experience', c.years_experience,
          'city', c.city,
          'state', c.state,
          'open_to_work', c.open_to_work,
          'skills', c.skills
        ) order by page.ord)
      from unnest(s.result_ids[(p_page - 1) * 20 + 1 : p_page * 20]) with ordinality as page(id, ord)
      join public.candidates c on c.id = page.id
    ), '[]'::jsonb)
  )
  from public.searches s
  where s.id = p_search_id
    and s.company_id = public.current_company_id()
    and p_page between 1 and 100000
$$;

revoke execute on function public.get_search_page(uuid, integer) from public, anon;
grant execute on function public.get_search_page(uuid, integer) to authenticated;
