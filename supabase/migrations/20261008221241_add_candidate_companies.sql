-- Employer names from each candidate's experiences (any job, past or current),
-- so search can filter "worked at Copperline" quickly.
alter table public.candidates
  add column companies text[] not null default '{}';

create index candidates_companies_idx on public.candidates using gin (companies);