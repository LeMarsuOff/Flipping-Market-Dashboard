# ROADMAP.md — Flipping Market Dashboard

> Single source of truth for task tracking. Updated by agents at the end of every session.
> Supersedes `docs/current-roadmap.md` (kept for historical reference only).

---

## In Progress

_(none)_

---

## TODO — Active

- [ ] **[SEV-HIGH] XSS fix — 6 raw innerHTML injection sites** — `t.pair/outcome/obstacles[]` interpolated raw in innerHTML at `dashboard.js:15057, 14358, 17840, 18774, 36758, 12746`. Fix: wrap through `_escapeHtml()` at all 6 sites. Priority: block community distribution until fixed.

- [ ] **[SEV-MED] Ghost trades** — deleted Notion trades survive in local cache indefinitely. Fix: compare `_notionId` set from full sync vs cache, purge absents. Pending design decision on full-sync cadence.

- [ ] **Optimal RR widget: BE Management filter button.**
  Open questions (blockers — resolve before implementation):
  1. Dynamic values from the live dataset, or a fixed list?
  2. Any-match or all-match exclusion logic?
  3. Scope: widget-only filter, or full dashboard?

- [ ] **Bloc 8: preset export/import JSON** — let users share presets as a file.

- [ ] **Bloc 4: persistence/refresh investigation** — identify which localStorage writes are redundant on refresh and whether a debounce strategy is needed.

- [ ] **Bloc 11: mini grid sidebar polish + guide update** — retours d'usage Max attendus before closing. Code: `_msState`, `_msInitGrid`, `_msPreview`, `_msApplyChanges`, `_applyMagnetSnap`.

---

## TODO — Deferred

- [ ] **Drawdown Intelligence section** — DD by context (setup/session/pair decomposing max DD), Recovery Factor (Total R / |Max DD|), DD Duration distribution, Risk of Ruin estimate. Optional: Underwater curve, Streak/DD scatter, MAR/Calmar (~14 months of data, low priority). Deferred pending community priority signal.

- [ ] **Hardcoded font-sizes (~180 remaining)** — deferred pending community feedback on typography editor coverage.

- [ ] **BYOT + export/import config** — open the dashboard to all users without requiring their Notion credentials. Recommended step before full OAuth rollout. ~1.5 days dev vs weeks for OAuth. Deferred until post-Notion overhaul stabilization.

- [ ] **Mappings not synced cross-device (audit M1)** — `outcomeValueMapping_v1_<profileId>`, `apiFieldOverrides_v1_<profileId>_m15`, `apiFieldNames_v1_<profileId>` absent from `_SYNC_KEYS`. Users reconfigure from scratch on each machine.

- [ ] **Orphaned localStorage keys after profile deletion (audit M2)** — `_deleteJournalProfileById` does not purge scoped keys (`apiTradesCache_*`, `outcomeValueMapping_*`, etc.).

- [ ] **Share view — bottom summary strip** — `WIN DAYS / LOSS DAYS / NO TRADES / BEST DAY / WORST DAY / AVG PER TRADE`. Visible in reference designs, not yet implemented.

- [ ] **Yellow border highlighting on clicked cells** — P&L Calendar, Pair × Session, Monthly P&L in Hover mode.

---

## Done — Last 10

- [x] **CLAUDE.md + ROADMAP.md + AGENTS.md + DECISIONS.md created** (2026-05-17) — repo-level agent memory files replacing ad-hoc context.
- [x] **ROBUST-11 — `importTheme` CSS injection hardening** (2026-05-15) — `_isSafeCssValue` blacklist + unicode escape normalization. PR #22.
- [x] **Mini grid sidebar Phase 1+2** (2026-05-06) — drag/resize, parking "Hidden", Preview/Apply/Cancel, magnet snap, bidirectional drag.
- [x] **Hide widgets feature** (2026-05-06) — `gs_hidden_widgets` global store, `👁 Hide` toolbar button, per-widget eye button, `_layoutOrderCmp` sort.
- [x] **Share view sprint** (2026-05-05/06) — canonical 2400×1032 PNG, bottom-alignment hard rule, `--sv-fs-*` independent typography tokens.
- [x] **Trade Log + drawer overhaul** (2026-05-06) — 9-column sort, `_sortTradesForTradeLog`, adaptive separators, monthly empty-month grid.
- [x] **KPI threshold colors** (2026-05-05) — `_kpiTooltipColor` helper, 6-tier WR/Avg-R palettes applied to all bar + KPI widgets.
- [x] **BE Trades fixes (Share View)** (2026-05-05) — `_getBeOutcomeExcludedTrades`, `beCountOverride` param, "BE not included" sub-label.
- [x] **`_rrFilterBubbleClick`** — ORR bubble click filters full dashboard on `rrMax >= value`. Toggle on re-click. Persisted per preset. `dashboard.js:14174`.
- [x] **Mode `no-be` retired** — PR `feat/kill-no-be-mode`. Boot migration to `be-fallback`. 2 active BE modes remain.

---

## Update rules for agents

At the end of every coding session:
- Move completed items → Done (keep last 10 max, oldest fall off)
- Add any new TODO discovered during the session (with context)
- Update "In Progress" if work is mid-flight
- Commit `ROADMAP.md` in the same commit as the related code change
