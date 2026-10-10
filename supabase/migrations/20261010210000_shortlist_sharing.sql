-- =========================================================
-- SHORTLIST SHARING
-- A shortlist is now private to the recruiter who made it.
-- They can send it to a colleague at the SAME company; once
-- the colleague accepts, they can view it (view only).
-- Only the owner adds or removes people, renames or deletes.
-- =========================================================

create table public.shortlist_shares (
  id           uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.shortlists(id) on delete cascade,
  company_id   text not null references public.companies(id),
  from_user    uuid not null references auth.users(id) on delete cascade,
  to_user      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (shortlist_id, to_user),      -- one invite per list per colleague
  check (from_user <> to_user)         -- no sending to yourself
);
create index shortlist_shares_to_idx on public.shortlist_shares (to_user, status);

alter table public.shortlist_shares enable row level security;

-- You can see invites you sent or received, inside your company.
-- There are no insert/update/delete policies on purpose: invites are
-- created and answered only through the checked functions below.
create policy "see shares you sent or received" on public.shortlist_shares
  for select to authenticated
  using (company_id = (select public.current_company_id())
         and (from_user = (select auth.uid()) or to_user = (select auth.uid())));

-- True when this list was sent to the signed-in recruiter and they accepted.
-- "security definer" so the shortlists rule below can ask without the two
-- tables' rules calling each other in a loop.
create or replace function public.shared_with_me(list_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.shortlist_shares
    where shortlist_id = list_id
      and to_user = auth.uid()
      and status = 'accepted'
      and company_id = public.current_company_id())
$$;

-- ---------- Shortlists: owner has full control; accepted colleagues read ----------
drop policy "own company shortlists" on public.shortlists;

create policy "read own or accepted shortlists" on public.shortlists
  for select to authenticated
  using (company_id = (select public.current_company_id())
         and (created_by = (select auth.uid()) or public.shared_with_me(id)));

create policy "create own shortlists" on public.shortlists
  for insert to authenticated
  with check (company_id = (select public.current_company_id())
              and created_by = (select auth.uid()));

create policy "rename own shortlists" on public.shortlists
  for update to authenticated
  using      (company_id = (select public.current_company_id()) and created_by = (select auth.uid()))
  with check (company_id = (select public.current_company_id()) and created_by = (select auth.uid()));

create policy "delete own shortlists" on public.shortlists
  for delete to authenticated
  using (company_id = (select public.current_company_id()) and created_by = (select auth.uid()));

-- ---------- People on shortlists: read if you can see the list; change only your own ----------
drop policy "own company shortlist people" on public.shortlist_people;

create policy "read people on visible shortlists" on public.shortlist_people
  for select to authenticated
  using (exists (select 1 from public.shortlists s where s.id = shortlist_id));  -- uses the shortlists rule above

create policy "add people to own shortlists" on public.shortlist_people
  for insert to authenticated
  with check (exists (
    select 1 from public.shortlists s
    where s.id = shortlist_id
      and s.created_by = (select auth.uid())
      and s.company_id = (select public.current_company_id())));

create policy "remove people from own shortlists" on public.shortlist_people
  for delete to authenticated
  using (exists (
    select 1 from public.shortlists s
    where s.id = shortlist_id
      and s.created_by = (select auth.uid())
      and s.company_id = (select public.current_company_id())));

-- ---------- Functions the API calls (as the signed-in recruiter) ----------

-- The other recruiters at your company, for the "send to" picker.
create or replace function public.company_colleagues()
returns table (user_id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select r.user_id, u.email::text
  from public.recruiters r
  join auth.users u on u.id = r.user_id
  where r.company_id = public.current_company_id()
    and r.user_id <> auth.uid()
  order by u.email
$$;

-- Sends one of YOUR lists to a colleague at YOUR company.
-- Returns: 'sent' | 'already_pending' | 'already_accepted' | 'not_found' | 'not_colleague' | 'self'
create or replace function public.share_shortlist(list_id uuid, recipient_email text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me         uuid := auth.uid();
  my_company text := public.current_company_id();
  recipient  uuid;
  existing   text;
begin
  if me is null or my_company is null then
    return 'not_found';
  end if;
  if not exists (select 1 from public.shortlists
                 where id = list_id and created_by = me and company_id = my_company) then
    return 'not_found';
  end if;

  select r.user_id into recipient
  from public.recruiters r
  join auth.users u on u.id = r.user_id
  where lower(u.email) = lower(trim(recipient_email))
    and r.company_id = my_company;
  if recipient is null then
    return 'not_colleague';
  end if;
  if recipient = me then
    return 'self';
  end if;

  select status into existing from public.shortlist_shares
  where shortlist_id = list_id and to_user = recipient;
  if existing = 'pending' then
    return 'already_pending';
  elsif existing = 'accepted' then
    return 'already_accepted';
  elsif existing = 'declined' then
    update public.shortlist_shares
    set status = 'pending', from_user = me, created_at = now(), responded_at = null
    where shortlist_id = list_id and to_user = recipient;
    return 'sent';
  end if;

  insert into public.shortlist_shares (shortlist_id, company_id, from_user, to_user)
  values (list_id, my_company, me, recipient);
  return 'sent';
end
$$;

-- Accept or decline an invite sent to YOU. Declining an accepted list
-- means leaving it. Returns: 'accepted' | 'declined' | 'not_found'
create or replace function public.respond_to_share(share_id uuid, accept boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  update public.shortlist_shares
  set status = case when accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = share_id
    and to_user = auth.uid()
    and company_id = public.current_company_id()
    and (status = 'pending' or (status = 'accepted' and not accept));
  if not found then
    return 'not_found';
  end if;
  return case when accept then 'accepted' else 'declined' end;
end
$$;

-- Lists sent to YOU that are waiting or accepted, with the sender's email,
-- the list name and how many people are on it. (Before accepting, the list
-- itself is still hidden from you; this shows only its name and size.)
create or replace function public.my_shared_lists()
returns table (share_id uuid, shortlist_id uuid, name text, from_email text,
               people integer, status text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select sh.id, s.id, s.name, u.email::text,
         (select count(*)::int from public.shortlist_people p where p.shortlist_id = s.id),
         sh.status, sh.created_at
  from public.shortlist_shares sh
  join public.shortlists s on s.id = sh.shortlist_id
  join auth.users u on u.id = sh.from_user
  where sh.to_user = auth.uid()
    and sh.company_id = public.current_company_id()
    and sh.status in ('pending', 'accepted')
  order by sh.created_at desc
$$;

-- Who YOU sent one of your lists to, and whether they accepted.
create or replace function public.shortlist_recipients(list_id uuid)
returns table (email text, status text)
language sql stable security definer set search_path = ''
as $$
  select u.email::text, sh.status
  from public.shortlist_shares sh
  join public.shortlists s on s.id = sh.shortlist_id
  join auth.users u on u.id = sh.to_user
  where sh.shortlist_id = list_id
    and s.created_by = auth.uid()
    and sh.company_id = public.current_company_id()
  order by u.email
$$;

-- Only signed-in recruiters may call these; nobody signed out.
revoke execute on function public.shared_with_me(uuid)              from public, anon;
revoke execute on function public.company_colleagues()              from public, anon;
revoke execute on function public.share_shortlist(uuid, text)       from public, anon;
revoke execute on function public.respond_to_share(uuid, boolean)   from public, anon;
revoke execute on function public.my_shared_lists()                 from public, anon;
revoke execute on function public.shortlist_recipients(uuid)        from public, anon;
grant  execute on function public.shared_with_me(uuid)              to authenticated;
grant  execute on function public.company_colleagues()              to authenticated;
grant  execute on function public.share_shortlist(uuid, text)       to authenticated;
grant  execute on function public.respond_to_share(uuid, boolean)   to authenticated;
grant  execute on function public.my_shared_lists()                 to authenticated;
grant  execute on function public.shortlist_recipients(uuid)        to authenticated;
