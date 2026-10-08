-- Preset Share — read-only dashboard snapshot (spec: docs/preset-share-feature.md)
--
-- Adds a nullable `dashboard` jsonb column to public.shares. NULL for the
-- existing chip shares (trade-cards viewer). For preset shares
-- (chip_kind = 'preset') it carries the frozen render config of the
-- active section: layout, theme, tpConfig, widget settings (§5.2 of the spec).
--
-- Additive + nullable → no backfill, no impact on existing rows, existing
-- RLS policies (public read while not expired, owner insert/delete, no
-- update) apply unchanged to the new column.

alter table public.shares
  add column if not exists dashboard jsonb;

comment on column public.shares.dashboard is
  'Preset share only (chip_kind = ''preset''): frozen dashboard render config. NULL for chip shares.';
