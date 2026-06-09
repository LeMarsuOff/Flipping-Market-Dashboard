-- ============================================================================
-- Journal Evolution P0 — Foundation
-- ============================================================================
-- Spec: docs/journal-evolution.md §3 (architecture) + §10 (retention policy)
-- Date: 2026-06-09
--
-- Scope:
--   1. Retention infra: user_retention table + journal_profiles soft-delete
--   2. Trade autonomy: trades_native, trade_overlays
--   3. User schemas: user_schemas (versioned)
--   4. Audit + email queue: audit_log, pending_emails
--   5. RLS policies for every new table (auth.uid() = user_id, soft-delete hidden)
--   6. Indexes for typical query patterns
--
-- NOT in this migration (deferred to a later step):
--   - pg_cron schedule (extension not installed yet — see ROADMAP Active)
--   - Cron job body (will live in a separate migration once extension is enabled)
--   - Quota triggers (will land in a P0.1 follow-up once basic CRUD is wired)
--
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. user_retention — per-user retention state (last_active_at, soft-delete)
-- ----------------------------------------------------------------------------
-- Keyed on auth.users.id (1 row per user). Separate from journal_profiles
-- because retention is a user-level concern, not a journal-level one.

create table if not exists public.user_retention (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  last_active_at  timestamptz not null default now(),
  deleted_at      timestamptz,
  delete_reason   text check (delete_reason in ('user_request', 'inactive', 'admin') or delete_reason is null),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists user_retention_last_active_idx
  on public.user_retention (last_active_at)
  where deleted_at is null;

create index if not exists user_retention_deleted_idx
  on public.user_retention (deleted_at)
  where deleted_at is not null;

alter table public.user_retention enable row level security;

-- Each user sees / updates only their own row.
create policy user_retention_select_own on public.user_retention
  for select using (auth.uid() = user_id);

create policy user_retention_insert_own on public.user_retention
  for insert with check (auth.uid() = user_id);

create policy user_retention_update_own on public.user_retention
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 2. journal_profiles — add soft-delete column
-- ----------------------------------------------------------------------------
-- Doesn't break existing rows (default NULL = active). RLS adjusted below.

alter table public.journal_profiles
  add column if not exists deleted_at timestamptz;

create index if not exists journal_profiles_deleted_idx
  on public.journal_profiles (deleted_at)
  where deleted_at is not null;


-- ----------------------------------------------------------------------------
-- 3. trades_native — trades created inside the dashboard (no external source)
-- ----------------------------------------------------------------------------
-- props_json holds the entire trade shape; the schema is user-defined via
-- public.user_schemas. We don't constrain the shape at the DB level — the
-- application layer validates against the user's schema version.

create table if not exists public.trades_native (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  profile_id    text not null,
  schema_version int not null default 1,
  props         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  -- Foreign key on (user_id, profile_id) matches the composite PK on journal_profiles.
  constraint trades_native_profile_fk
    foreign key (user_id, profile_id) references public.journal_profiles(user_id, id) on delete cascade
);

create index if not exists trades_native_user_profile_idx
  on public.trades_native (user_id, profile_id)
  where deleted_at is null;

create index if not exists trades_native_updated_at_idx
  on public.trades_native (updated_at)
  where deleted_at is null;

-- jsonb_path_ops is more compact than the default jsonb_ops and is enough
-- for `@>` containment queries (the only pattern we'll need until prop search).
create index if not exists trades_native_props_idx
  on public.trades_native using gin (props jsonb_path_ops);

alter table public.trades_native enable row level security;

create policy trades_native_select_own on public.trades_native
  for select using (auth.uid() = user_id and deleted_at is null);

create policy trades_native_insert_own on public.trades_native
  for insert with check (auth.uid() = user_id);

create policy trades_native_update_own on public.trades_native
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No DELETE policy — soft-delete via UPDATE deleted_at = now() instead.
-- Hard delete happens server-side via the retention cron.


-- ----------------------------------------------------------------------------
-- 4. trade_overlays — custom props attached to a trade from an external source
-- ----------------------------------------------------------------------------
-- Used when the trade itself lives in Notion / MT5 / CSV import. The overlay
-- is keyed by (user_id, profile_id, source_trade_id) so we can resolve back to
-- the source row even after multiple re-syncs.

create table if not exists public.trade_overlays (
  user_id          uuid not null references auth.users(id) on delete cascade,
  profile_id       text not null,
  source_trade_id  text not null,
  schema_version   int not null default 1,
  props            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  primary key (user_id, profile_id, source_trade_id),
  constraint trade_overlays_profile_fk
    foreign key (user_id, profile_id) references public.journal_profiles(user_id, id) on delete cascade
);

create index if not exists trade_overlays_user_profile_idx
  on public.trade_overlays (user_id, profile_id)
  where deleted_at is null;

create index if not exists trade_overlays_props_idx
  on public.trade_overlays using gin (props jsonb_path_ops);

alter table public.trade_overlays enable row level security;

create policy trade_overlays_select_own on public.trade_overlays
  for select using (auth.uid() = user_id and deleted_at is null);

create policy trade_overlays_insert_own on public.trade_overlays
  for insert with check (auth.uid() = user_id);

create policy trade_overlays_update_own on public.trade_overlays
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 5. user_schemas — versioned definition of the user's custom props
-- ----------------------------------------------------------------------------
-- One row per (user_id, profile_id, schema_version). The active version is the
-- max version with active=true. Inactive versions stay in the table for
-- migration / rollback purposes.

create table if not exists public.user_schemas (
  user_id        uuid not null references auth.users(id) on delete cascade,
  profile_id     text not null,
  schema_version int not null,
  props_def      jsonb not null default '[]'::jsonb,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  primary key (user_id, profile_id, schema_version),
  constraint user_schemas_profile_fk
    foreign key (user_id, profile_id) references public.journal_profiles(user_id, id) on delete cascade
);

alter table public.user_schemas enable row level security;

create policy user_schemas_select_own on public.user_schemas
  for select using (auth.uid() = user_id);

create policy user_schemas_insert_own on public.user_schemas
  for insert with check (auth.uid() = user_id);

create policy user_schemas_update_own on public.user_schemas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 6. audit_log — append-only history of write actions
-- ----------------------------------------------------------------------------
-- Used for "what did I edit on this trade" UI and for forensic debugging.
-- NOT used as the source of truth — read paths read trades_native / overlays.

create table if not exists public.audit_log (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  profile_id   text,
  trade_id     text,
  action       text not null check (action in ('create', 'update', 'soft_delete', 'hard_delete', 'restore', 'schema_migrate')),
  diff         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_user_created_idx
  on public.audit_log (user_id, created_at desc);

create index if not exists audit_log_user_trade_idx
  on public.audit_log (user_id, trade_id, created_at desc)
  where trade_id is not null;

alter table public.audit_log enable row level security;

create policy audit_log_select_own on public.audit_log
  for select using (auth.uid() = user_id);

create policy audit_log_insert_own on public.audit_log
  for insert with check (auth.uid() = user_id);

-- No UPDATE / DELETE policies — audit_log is append-only by design.


-- ----------------------------------------------------------------------------
-- 7. pending_emails — queue consumed by an external sender (later)
-- ----------------------------------------------------------------------------
-- The retention cron INSERTs here; an edge function or external worker
-- consumes the queue and marks sent_at. No PII inline — the template name
-- + user_id are enough for the sender to look up the email.

create table if not exists public.pending_emails (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  template    text not null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists pending_emails_unsent_idx
  on public.pending_emails (created_at)
  where sent_at is null;

alter table public.pending_emails enable row level security;

-- Users can see their own queued emails (transparency); only service_role
-- inserts / updates. No client INSERT policy → blocked by default.
create policy pending_emails_select_own on public.pending_emails
  for select using (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 8. updated_at trigger — keep updated_at fresh on UPDATE
-- ----------------------------------------------------------------------------
-- Reuses the existing `auto_bump_updated_at` function (cf. migration
-- 20260525015033). If absent, this block creates it.

create or replace function public.auto_bump_updated_at()
  returns trigger
  language plpgsql
  as $$
  begin
    new.updated_at := now();
    return new;
  end;
  $$;

drop trigger if exists user_retention_bump_updated_at on public.user_retention;
create trigger user_retention_bump_updated_at
  before update on public.user_retention
  for each row execute function public.auto_bump_updated_at();

drop trigger if exists trades_native_bump_updated_at on public.trades_native;
create trigger trades_native_bump_updated_at
  before update on public.trades_native
  for each row execute function public.auto_bump_updated_at();

drop trigger if exists trade_overlays_bump_updated_at on public.trade_overlays;
create trigger trade_overlays_bump_updated_at
  before update on public.trade_overlays
  for each row execute function public.auto_bump_updated_at();


-- ----------------------------------------------------------------------------
-- 9. Backfill — every existing auth.users gets a user_retention row
-- ----------------------------------------------------------------------------
-- Idempotent: ON CONFLICT DO NOTHING so re-running is safe.

insert into public.user_retention (user_id, last_active_at)
select id, coalesce(last_sign_in_at, created_at, now())
from auth.users
on conflict (user_id) do nothing;


-- ============================================================================
-- Rollback (manual, kept here for reference — do not execute by default)
-- ============================================================================
-- drop table if exists public.pending_emails;
-- drop table if exists public.audit_log;
-- drop table if exists public.user_schemas;
-- drop table if exists public.trade_overlays;
-- drop table if exists public.trades_native;
-- alter table public.journal_profiles drop column if exists deleted_at;
-- drop table if exists public.user_retention;
