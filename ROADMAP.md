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

- [ ] **[Post-readonly] Trading Journal evolution** — manual trade entry, custom schemas, Notion two-way sync. Spec complète dans `docs/journal-evolution.md`. **Ne pas démarrer avant que le read-only soit clos.** Bloquants identifiés : XSS fix (SEV-HIGH), Ghost trades (SEV-MED), Mappings cross-device sync (audit M1) — tous listés dans le doc §9.

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

- [x] **Data Setup panel redesign — hero card + tabs merge + tier accordions** (2026-05-18) — Multi-phase rewrite of the Data Hub panel (▤ Data button in topbar). **Phase 1** (`19f60b4`): new `#dsh-hero` card between panel header and tabs, surfacing active profile name + connection/sync state + trades + N/M mapped + locked features + coverage ring; includes custom-fields + widgets counts; Sync action stays in Account → Data & Integrations (not duplicated here). **Phase 2** (`efe7335`): Health tab retired, its `#lap-list` + `#dhp-feature-reqs` folded into the Mapping pane as a hidden prelude. 3 tabs instead of 4 (Mapping default · Custom fields · Create Widget); `switchDataHubTab('health')` aliased to 'mapping' for backward compat. **Phase 3** (`86cc8ec`): Mapping tab restructured into 4 `<details>` accordions (Required / Optional / Screenshots / Multi-TP). User-driven open state preserved across re-renders by snapshotting `[open]` from DOM in `_renderMappingSectionsHtml` (more reliable than `toggle` events which queue asynchronously). `_resetOpenMappingTiers()` on panel close → next open re-applies defaults. **Phase 4** (`60cea59`): slim `.dhp-section-intro` (transparent bg + 2px accent left bar), Mapping panel hides the redundant `.ljp-format-row` and `.ljp-section-intro` since hero already covers source line. **Follow-up iterations** (this commit): missing fields shown as 🔴 emoji + label per line in collapsed summary (matches Account disconnected indicator); row sort = missing first alphabetical then mapped alphabetical; full-width tinted Missing (red 20%) / Mapped (green 20%) group header bands inside open accordions, rendered for every non-empty group; Type pill wraps to 2 lines for "URL / File" / "Multi-select" / "Checkbox" instead of clipping the cadre; column order Property → Mapping(+pencil) → Type → Description; `scrollbar-gutter: stable` kills the ~12px panel-width jitter when expanding Optional overflows the panel. Design exploration archived in `mockups/data-setup-{a,b,v2,v3,v4}.html`.

- [x] **Custom donut widget — full parity with Outcome Breakdown** (2026-05-18) — New `donut` type for the Create Widget builder. Reuses `_drawDonutSectors` (the native donut draw helper) so hover-grow, dim-others, center-zoom, and gold glow are pixel-identical to `w-outcome`. Top 7 + "Other" aggregation keeps high-cardinality fields (Pair with 30+ symbols) readable. Colors cycle through `--chart-cat-1..8` (already in Theme Editor → tp-chart-colors). Multi-instance ready via `_customDonutStates` keyed by `def.id`; document-level mousemove/click listeners dispatch by `canvas[id^="donutCanvas-"]`. Click sector → `openWidgetDrawer(label, count, trades)` with the slice's trades; click center → all widget trades. Fixed `_redrawAll` so `renderAllCustomWidgets` runs alongside native widget redraws — custom donut/heatmap/bars now grow/shrink with GridStack resize like the native ones (was a regression: customs were frozen at first-render dimensions until the next full render).
- [x] **Create Widget — list of created widgets + per-profile storage** (2026-05-18) — New "Your widgets" section in the Create Widget tab listing every widget the user has created (icon ▮/▦/◕, label, field/field2 sub, type badge, delete ✕). Custom widget defs now stored under `flipping_custom_widgets_<profileId>` (was global). One-shot migration v4 (`flipping_custom_widgets_profile_migration_v1`) copies legacy global payload into the active profile's slot then drops the global key. `_customWidgetDefsCache` invalidates in `_reloadProfileScopedState` so profile switches load the right slot. Removed `flipping_custom_widgets` from `_SYNC_KEYS` (profile-scoped keys are out-of-sync by convention, mirrors audit M1). New props prepend (order: 0) so most-recent appears on top.
- [x] **Custom Fields detection: fix + reload persistence + alphabetical order** (2026-05-18) — Detection walks raw cache via `_extractApiValueForProp` (not `t.extras[k]` which only populates for declared props, so detection dropped every undeclared one). Type inference reads formula/rollup inner result type (`formula.type` → string/number/boolean/date), adds `status→select`, `boolean→checkbox`, `string→text` mappings. When the Vercel proxy flattens trades (loses `propObj.type`), falls back to `_detectColumnType` heuristics with an Array pre-check for multi-select. Dedupe normalized variants (`M15 Pros` + `m15Pros` → keep longer/human variant). Blacklist internal pipeline fields (`_notionId`, `_rawRowIndex`, `effectiveR`, etc.). Persist lightweight `[{key,name,type,sampleCount}]` snapshot to `flipping_detected_fields_v1_<profile>_<source>` so Detected list survives a refresh without re-sync. `_repopulateExtrasForProp` no longer wipes extras when raw source is unavailable (cold-load preserve) + persists via `setCachedAPIData` after non-silent repopulate so the user's prop values survive a refresh. List sorted alphabetically case-insensitive.
- [x] **Topbar cleanup + boot FOUC fixes** (2026-05-18) — Removed dead Notion Live tab + switchToAPI + tab-api badges/loading (sync now per-profile in Data & Integrations). Removed redundant "Custom Fields → Widgets" section from Mapping (Create Widget tab is now the canonical entrypoint). Extended `body.is-booting` opacity gate to `#filter-context-strip` and `#dhb-badge`. Inline pre-paint scripts in `<head>` apply the saved theme to `:root` + sidebar collapsed state to `.layout` before first paint. `#ds-refresh-btn` and `#tpm-active-preset-topbar-btn` get `style="display:none"` in HTML so they don't flash before JS toggles them.
- [x] **`.gitignore` hardening: `.env.*` wildcard + `.vercel/`** (2026-05-18) — Replaced explicit `.env.local` with wildcard `.env.*` to catch `.env.production`, `.env.staging`, etc. Added `.vercel/` (per-machine project link, regenerated via `vercel link`). History audit confirmed no secrets ever leaked (no `service_role`, no JWT, no Notion token in any commit). The Supabase key visible in `dashboard.js:180` is the `sb_publishable_…` (anon), safe by design.
- [x] **Local automation layer: hooks + slash commands** (2026-05-18) — Gitignored, per-machine, full spec committed in `CLAUDE.md` §12 / `AGENTS.md` §12 so a fresh machine can recreate via "install hooks and commands here". (1) `.claude/hooks/post-edit.ps1` (Windows) fires on every `Edit/Write/MultiEdit` of `dashboard.js`/`dashboard.css`: bumps `?v=N` in `index.html` and runs `node -c dashboard.js` (exit 2 on syntax error blocks the turn). (2) Six slash commands in `.claude/commands/`: `/start`, `/end`, `/localhost` (Claude Preview), `/status`, `/undo` (git revert with confirm), `/push` (mid-session safety push).
- [x] **Per-profile isolation: layout, presets, filters, hidden widgets** (2026-05-18) — `_htfKey()` now wraps `getProfileScopedKey()` so every layout/preset/snapshot/live-filter/hidden-widget key carries the active profile id. Demo gets a fixed `__demo` slot via `_getJournalProfileCacheContext`. One-shot boot migration (`_runProfileScopeMigrationV3` + flag `flipping_profile_scope_migration_v3`) wipes legacy global keys. New helper `_reloadProfileScopedState()` reused by `setHTFSource`, `setDataSource`, `_applyActiveJournalProfile`.
- [x] **Active preset persisted per profile + auto-apply RAW Baseline** (2026-05-18) — New LS key `flipping_active_filter_preset_id` (profile-scoped). `setActivePreset` persists, `_restoreActivePresetForCurrentSlot` restores at boot / switch with fallback to P0 RAW Baseline. `_clearActivePreset` routed through `setActivePreset(null)` so explicit clears survive a round-trip.
- [x] **Profile switch flicker fix** (2026-05-18) — `_applyActiveJournalProfile` pins `_journalProfileCacheContextOverride` for the whole switch flow (try/finally) so reads/writes don't drift if DS_KEY hasn't been flipped to `api` yet. Double restore (before + after `await _reloadJournalProfileSelection`) eliminates the preset-deselect flash during async data fetch.

---

## Update rules for agents

At the end of every coding session:
- Move completed items → Done (keep last 10 max, oldest fall off)
- Add any new TODO discovered during the session (with context)
- Update "In Progress" if work is mid-flight
- Commit `ROADMAP.md` in the same commit as the related code change
