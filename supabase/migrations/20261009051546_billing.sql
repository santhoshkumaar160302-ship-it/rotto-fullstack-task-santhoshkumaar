-- Records a Stripe event and applies it to its subscription, atomically.
-- Returns: 'duplicate' (already processed), 'ignored' (not a subscription event
-- for a known company), 'stale' (older than what we know), or 'applied'.
create or replace function public.apply_stripe_event(
  p_event_id        text,
  p_type            text,
  p_created         bigint,
  p_subscription_id text,
  p_company_id      text,
  p_status          text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_rows integer;
begin
  -- 1. Each event id is processed once. A repeat stops here.
  insert into public.stripe_events (id, type, created)
  values (p_event_id, p_type, p_created)
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return 'duplicate';
  end if;

  -- 2. Only subscription events for a company we know change anything.
  if p_subscription_id is null or p_status is null or p_company_id is null
     or not exists (select 1 from public.companies where id = p_company_id) then
    return 'ignored';
  end if;

  -- 3. Newest event wins. An older event never overwrites a newer state.
  --    On an exact tie, a cancellation wins (never leave a company paid by mistake).
  insert into public.subscriptions as s (id, company_id, status, last_event_created)
  values (p_subscription_id, p_company_id, p_status, p_created)
  on conflict (id) do update
    set status             = excluded.status,
        company_id         = excluded.company_id,
        last_event_created = excluded.last_event_created,
        updated_at         = now()
    where excluded.last_event_created > s.last_event_created
       or (excluded.last_event_created = s.last_event_created
           and excluded.status in ('canceled', 'incomplete_expired'));
  get diagnostics v_rows = row_count;

  return case when v_rows = 0 then 'stale' else 'applied' end;
end;
$$;

-- Only our server (secret key) may record billing events.
revoke execute on function public.apply_stripe_event(text, text, bigint, text, text, text)
  from public, anon, authenticated;