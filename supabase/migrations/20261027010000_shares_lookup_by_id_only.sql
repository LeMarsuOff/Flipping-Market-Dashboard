-- Shares — readable only by exact id (no more listing)
--
-- `shares_public_read` let the anon key list every non-expired share with
-- its stats and trades, without knowing any link. Viewers now read through
-- get_share(p_id), which returns at most the one row whose id they hold.
-- PostgREST still applies ?select= and filters (e.g. chip_kind=eq.preset)
-- on the function result, so readers only swap the URL.
--
-- Step 1 (additive): the function. Step 2, once every reader uses it
-- (share.js, index.html preset boot, share-og /dash + /share, the `share`
-- edge function, dashboard view count): drop the public read policy.

create or replace function public.get_share(p_id text)
returns table (
  id          text,
  chip_name   text,
  chip_kind   text,
  stats       jsonb,
  trades      jsonb,
  dashboard   jsonb,
  view_count  integer,
  created_at  timestamptz,
  expires_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.chip_name, s.chip_kind, s.stats, s.trades, s.dashboard,
         s.view_count, s.created_at, s.expires_at
  from public.shares s
  where s.id = p_id
    and s.expires_at > now()
$$;

revoke all on function public.get_share(text) from public;
grant execute on function public.get_share(text) to anon, authenticated;

-- Step 2 (applied after every reader switched to get_share): no direct
-- reads of the table any more, by anyone but the service role. With RLS on
-- and no SELECT policy left, anon/authenticated see zero rows.
drop policy if exists shares_public_read on public.shares;
