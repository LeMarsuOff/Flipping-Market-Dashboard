-- Shares — stop exposing the sharer's user id to the public
--
-- `shares_public_read` lets anyone read any non-expired row, and the table
-- grant covered every column, so `created_by` (the owner's auth uid) was
-- readable with the public anon key. That uid was enough to call the
-- backend on the owner's behalf. Column-level grants keep every column the
-- viewers read (share.js, /dash, /share OG) and drop `created_by`.
--
-- RLS policies that reference created_by (owner insert/delete) are not
-- affected: policy expressions are not subject to column privileges, and
-- inserts use return=minimal.

revoke select on public.shares from anon, authenticated;

grant select (id, chip_name, chip_kind, stats, trades, view_count, created_at, expires_at, dashboard)
  on public.shares to anon, authenticated;
