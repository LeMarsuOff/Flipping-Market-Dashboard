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

- [ ] **CSV access path after topbar cleanup** — CSV mode is now only reachable via the "⬆ Import CSV" overlay (empty state CTA + mobile button). Consider adding CSV as a virtual data source row in Data & Integrations, similar to the Demo row added on 2026-05-17.

- [ ] **Dead `ds-refresh-btn` topbar button** — `index.html:943` `↺ Refresh` button is always hidden (`updateSourceUI` calls `setVisible(btnRef, false)`, no `setVisible(_, true)` anywhere). Sync now lives per-profile in Data & Integrations. Clean up the button + its spinning-class handlers at `dashboard.js:6922, 8051`.

- [ ] **Concurrent Notion sync mutex** — if the user clicks Sync on profile B while profile A's sync is in flight, both run concurrently with no mutex. Cache writes are profile-scoped so no data loss, but wasted bandwidth. Low priority — defer.

---

## TODO — Deferred

- [ ] **Drawdown Intelligence section** — DD by context (setup/session/pair decomposing max DD), Recovery Factor (Total R / |Max DD|), DD Duration distribution, Risk of Ruin estimate. Optional: Underwater curve, Streak/DD scatter, MAR/Calmar (~14 months of data, low priority). Deferred pending community priority signal.

- [ ] **Hardcoded font-sizes (~180 remaining)** — deferred pending community feedback on typography editor coverage.

- [ ] **BYOT + export/import config** — open the dashboard to all users without requiring their Notion credentials. Recommended step before full OAuth rollout. ~1.5 days dev vs weeks for OAuth. Deferred until post-Notion overhaul stabilization.

- [ ] **Mappings not synced cross-device (audit M1)** — `outcomeValueMapping_v1_<profileId>`, `apiFieldOverrides_v1_<profileId>_m15`, `apiFieldNames_v1_<profileId>` absent from `_SYNC_KEYS`. Users reconfigure from scratch on each machine.

- [ ] **Orphaned localStorage keys after profile deletion (audit M2)** — `_deleteJournalProfileById` does not purge scoped keys (`apiTradesCache_*`, `outcomeValueMapping_*`, etc.).

- [ ] **Share view — bottom summary strip** — `WIN DAYS / LOSS DAYS / NO TRADES / BEST DAY / WORST DAY / AVG PER TRADE`. Visible in reference designs, not yet implemented.

- [ ] **Yellow border highlighting on clicked cells** — P&L Calendar, Pair × Session, Monthly P&L in Hover mode.

- [ ] **Add LICENSE file (MIT recommended)** — currently the public repo has no license, so legally all rights reserved by default. Not urgent since users don't access GitHub directly, but worth adding for legal clarity.

- [ ] **Add README.md** — public-facing landing page on GitHub. Low priority since users access the dashboard via GitHub Pages link, not the repo itself. Would matter if/when the repo becomes a public-facing project (contributions, forks, etc.).

---

## Done — Last 10

- [x] **Local hook automation: cache-bust + JS syntax validation** (2026-05-18) — `.claude/hooks/post-edit.ps1` (gitignored, Windows-only for now) fires on every `Edit/Write/MultiEdit` of `dashboard.js` or `dashboard.css`. Bumps `?v=N` in `index.html` automatically and runs `node -c dashboard.js` after JS edits (exit 2 on syntax error blocks the turn). Registered as `PostToolUse` hook in `.claude/settings.local.json`. Per-machine — recreate on Mac with "install hooks here". Setup documented in `CLAUDE.md` §12 / `AGENTS.md` §12.
- [x] **Per-profile isolation: layout, presets, filters, hidden widgets** (2026-05-18) — `_htfKey()` now wraps `getProfileScopedKey()` so every layout/preset/snapshot/live-filter/hidden-widget key carries the active profile id. Demo gets a fixed `__demo` slot via `_getJournalProfileCacheContext`. One-shot boot migration (`_runProfileScopeMigrationV3` + flag `flipping_profile_scope_migration_v3`) wipes legacy global keys. New helper `_reloadProfileScopedState()` reused by `setHTFSource`, `setDataSource`, `_applyActiveJournalProfile`.
- [x] **Active preset persisted per profile + auto-apply RAW Baseline** (2026-05-18) — New LS key `flipping_active_filter_preset_id` (profile-scoped). `setActivePreset` persists, `_restoreActivePresetForCurrentSlot` restores at boot / switch with fallback to P0 RAW Baseline. `_clearActivePreset` routed through `setActivePreset(null)` so explicit clears survive a round-trip.
- [x] **Profile switch flicker fix** (2026-05-18) — `_applyActiveJournalProfile` pins `_journalProfileCacheContextOverride` for the whole switch flow (try/finally) so reads/writes don't drift if DS_KEY hasn't been flipped to `api` yet. Double restore (before + after `await _reloadJournalProfileSelection`) eliminates the preset-deselect flash during async data fetch.
- [x] **Hidden widgets cross-profile clobber fix** (2026-05-18) — `_loadSectionSlot` no longer overwrites `_hiddenWidgets` from the layout payload (stale snapshot would clobber the dedicated profile-scoped key). New `_visuallyUnhideAllWidgets()` replaces `_unhideAllWidgets()` inside `_reloadProfileScopedState`: visual-only reset, no `_saveHiddenWidgets` / `_saveActiveSlotLive` calls — the new profile's persisted hidden state survives the switch.
- [x] **Demo as first Data source + topbar cleanup** (2026-05-17) — Demo virtual row inserted at top of `_renderJournalProfileSwitchList`. 3 Demo/CSV/API topbar toggle buttons removed (`ds-toggle-group`). `ds-status-bar` removed — status now lives per-profile in Data & Integrations.
- [x] **Notion integration check auto-resolve** (2026-05-17) — fires on `INITIAL_SESSION` / `SIGNED_IN` auth events and on panel open when Data tab is active. Fixed the "stuck on ⏳ Checking…" after page refresh that required a manual Account→Data tab switch to unblock.
- [x] **Notion sync race-fix on profile switch** (2026-05-17) — `_loadNotionTrades` captures `profileId` at start; after `await fetch` pins `_journalProfileCacheContextOverride = profileId` so all scoped cache writes (raw cache, parsed cache, sync cursor) target the captured profile's slot even if the user switched active profile mid-sync. All UI side-effects (`_injectTrades`, `setSourceIndicator`, `showDataStatus`, `_updateLastSync`) gated by `stillActive()` helper.
- [x] **`_injectTrades` pair filter removed** (2026-05-17) — `dashboard.js:6749` no longer drops trades without `pair`. Surfaces ~5 hidden trades (case-by-case Notion data quality issue). Downstream widgets are defensive (`t.pair || ''`).
- [x] **CLAUDE.md + ROADMAP.md + AGENTS.md + DECISIONS.md created** (2026-05-17) — repo-level agent memory files replacing ad-hoc context.

---

## Update rules for agents

At the end of every coding session:
- Move completed items → Done (keep last 10 max, oldest fall off)
- Add any new TODO discovered during the session (with context)
- Update "In Progress" if work is mid-flight
- Commit `ROADMAP.md` in the same commit as the related code change
