select
  (select count(*) from public.candidates) as total_candidates,
  (select count(*) from public.candidates
     where city = 'New York' and seniority = 'senior') as ny_senior,
  (select count(*) from public.candidates
     where city = 'New York' and seniority = 'senior'
       and skills @> '{React}') as plus_react,
  (select count(*) from public.candidates
     where city = 'New York' and seniority = 'senior'
       and skills @> '{React}' and company_types @> '{startup}') as plus_startup,
  public.jsonb_to_text_array('["React","Go"]'::jsonb) as array_helper;

  select id, company_types, companies from public.candidates limit 3;

select cardinality(public.search_candidate_ids('{
  "roles": ["Backend Engineer","Data Engineer","DevOps Engineer","Frontend Engineer","Full Stack Engineer","Machine Learning Engineer","Mobile Engineer"],
  "seniorities": ["senior"], "cities": ["New York"], "skills": ["React"],
  "company_types": ["startup"], "companies": [], "schools": [], "degrees": [], "fields": [],
  "min_years": null, "max_years": null, "open_to_work": null, "unsupported": []
}'::jsonb)) as matches;