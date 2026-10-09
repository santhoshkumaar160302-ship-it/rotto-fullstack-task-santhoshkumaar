-- Which words of the brief produced which filter, for highlighting in the UI.
-- Display only: search never reads this column.
alter table public.searches
  add column mentions jsonb not null default '[]'
  check (jsonb_typeof(mentions) = 'array');

alter table public.saved_briefs
  add column mentions jsonb not null default '[]'
  check (jsonb_typeof(mentions) = 'array');