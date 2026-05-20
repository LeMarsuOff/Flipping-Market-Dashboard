# DECISIONS.md — Flipping Market Dashboard

> Append-only log of non-trivial architectural decisions.
> Format: ### YYYY-MM-DD — Title / Context / Decision / Consequence
> Never edit past entries. Add new entries at the bottom.

---

### 2026-03-10 — React prototype started

**Context:** Initial exploration of a dashboard for personal trade journaling. React chosen as a familiar starting point.

**Decision:** Begin with a React prototype.

**Consequence:** Prototype validated the data model and widget concepts but introduced toolchain complexity (bundler, hot reload, npm deps) that felt disproportionate for a single-user tool.

---

### 2026-03-17 — Pivot React → vanilla HTML/CSS/JS

**Context:** React prototype existed but the build step and component abstraction added friction. The project is maintained by one person with no CI pipeline.

**Decision:** Rewrite as a single-file vanilla JS/CSS/HTML stack — no bundler, no framework, no npm.

**Consequence:** Simpler deployment (open file in browser = done). No build step. Easier for community members to fork and self-host. Codebase now ~50k lines across 3 files (`index.html`, `dashboard.js`, `dashboard.css`). Trade-off: no tree-shaking, no type safety, monolithic files are hard to navigate — mitigated by the function map in `docs/file-map.md`.

---

### ~2026-04 — BYOT over OAuth as recommended first step for multi-user access

**Context:** Explored opening the dashboard to all Flipping Market community members (~600 users). Full OAuth integration with Notion would require user account management, RGPD compliance review, and Notion integration approval.

**Decision:** Recommend BYOT (Bring Your Own Token) + export/import config as the first step, before committing to full OAuth.

**Consequence:** ~1.5 days dev vs weeks for OAuth. RGPD/Notion review avoided in the short term. Still deferred pending post-Notion-overhaul stabilization.

---

### ~2026-04 — Raw API trade cache moved in-memory only

**Context:** The raw Notion API response cache was stored in localStorage, causing quota overflow errors (~4.6 MB raw cache exceeded the 5 MB browser limit for some users).

**Decision:** Keep the raw trade cache in-memory only (`appState.trades.items`). Store only `apiFieldNames_v1` (field mapping, small) in localStorage. Trade data is refetched on page refresh via incremental sync.

**Consequence:** No more localStorage quota errors. Cache is lost on page refresh (acceptable — incremental sync is fast). Agents must remember to purge `apiTradesCache_v2_rrmax_*` after structural normalization changes.

---

### ~2026-04 — Dataset B as primary analysis reference

**Context:** Two datasets were defined: Dataset A (excludes BE-TP/BE-SL trades from all calculations) and Dataset B (includes all outcomes including BE). The dashboard historically used Dataset A as primary for "clean edge analysis."

**Decision:** Dataset B is primary (operational truth). Dataset A is retained as a crosscheck lens available via filter.

**Consequence:** All EV calculations, KPIs, and default filter presets operate on Dataset B. This matches how a live account actually performs — BE trades are real outcomes with real risk. Dataset A analyses are opt-in via the outcome chip filter.

---

### ~2026-04 — Schema v2 for preset snapshots (unified Filters ↔ Presets)

**Context:** Preset system v1 stored filter state in multiple separate keys (`flipping_preset_overrides`, per-dim arrays on the preset object itself). Adding custom Notion chip support required a unified snapshot format.

**Decision:** Introduce `flipping_preset_snapshots_v2` — a single JSON blob per preset containing all chip state (`chips`, `customChips`, `tpConfig`). Boot-time `_migrateToV2()` silently upgrades v1 data. v1 fields on preset objects are zeroed to prevent drift.

**Consequence:** Cleaner preset isolation. Custom chips and TP config are fully preset-scoped. Breaking this key without a migration silently destroys all user presets — treat as a contract.

---

### 2026-05-15 — ROBUST-11: two-layer CSS injection hardening in `importTheme`

**Context:** The theme import function (`importTheme`) accepted arbitrary CSS values from a JSON blob (user-controlled or pasted). A malicious or malformed theme could inject `url(https://evil.com)` or `expression(...)` into CSS custom properties.

**Decision:** Add `_isSafeCssValue(val)`: a blacklist check (`url(`, `expression(`, `javascript:`, `data:`) with a 200-char cap. Add a second layer: normalize CSS unicode escapes (`\HH` through `\HHHHHH`) before the blacklist check, preventing bypass via `\75 rl(...)` → `url(...)` at parse time. Fail closed on normalization errors.

**Consequence:** Theme import is now hardened against CSS injection. Values failing the check are dropped with `console.warn`. Legitimate theme values (hex colors, pixel values, font-weight numbers) are unaffected. PR #22.

---

### 2026-05-17 — Workflow restructure: repo-level markdown as shared agent memory

**Context:** Multiple agents (Claude Code, Codex), two machines (Mac + Windows), no shared persistent memory. Context drift between sessions caused repeated re-explanations of architecture and repeated mistakes with localStorage keys and preset schema.

**Decision:** Introduce `CLAUDE.md`, `AGENTS.md`, `ROADMAP.md`, and `DECISIONS.md` at the repo root as the single source of truth for all agents. Every session starts with reading `CLAUDE.md` + `ROADMAP.md`. Every session ends with updating `ROADMAP.md` and optionally appending `DECISIONS.md`.

**Consequence:** Agents start each session with full architectural context without relying on conversation history. Roadmap and decision history are version-controlled alongside code. Trade-off: files must be actively maintained — a stale `ROADMAP.md` is worse than none.

---

### 2026-05-17 — Audit post-Notion overhaul: zero fixes applied, findings deferred

**Context:** Notion OAuth integration, journal profiles, MediaQueue/Supabase storage, incremental sync, outcome value mapping, and cache mode changes added ~9k lines between mid-April and mid-May 2026. A full read-only audit was conducted.

**Decision:** Apply zero fixes during the audit session. Dashboard conserved as-is. All findings documented in `docs/current-roadmap.md` and backlogged in `ROADMAP.md` for prioritization.

**Consequence:** SEV-HIGH findings (XSS at 6 sites, ghost trades) are known but unpatched. SEV-MEDIUM findings (mappings not synced cross-device, orphaned LS keys) are documented. The audit confirmed the calc engine passes (84 test cells, 6 probes, 0 regressions). Future sessions must treat the SEV-HIGH items as priority blockers before any community-facing distribution push.

---

### 2026-05-17 — Race-guard pattern for async profile-scoped writes

**Context:** `_loadNotionTrades` does a multi-second `await fetch` against the Notion proxy. If the user switches the active journal profile while the fetch is in flight, the response landed in the *new* active profile's cache slot (because `getProfileScopedKey()` reads the live active profile at call time) and `_injectTrades` overwrote the dashboard the user was now looking at. Cache pollution + UI pollution.

**Decision:** Adopt a two-part guard inside every async function that touches profile-scoped state:
1. **Capture the profile context at function entry** — `const profileId = String(profile?.id || '').trim()`.
2. **Pin the cache scope after the await** — set `_journalProfileCacheContextOverride = profileId` so all subsequent `getProfileScopedKey` resolutions go to *the captured profile* regardless of who is currently active. Restore in a `finally` block.
3. **Guard UI side-effects with `stillActive()`** — a helper closure that compares the captured `profileId` against `getActiveJournalProfile()?.id`. UI writes (`_injectTrades`, `setSourceIndicator`, `showDataStatus`, `_updateLastSync`, etc.) only fire when the captured profile is still the active one.

**Consequence:** A's cache always lands in A's slot. B's UI is never overwritten by A's response. Profile meta (`notionTradeCount`, `notionSyncState`) was already safe because `_updateJournalProfileSyncMeta(profileId, ...)` takes an explicit ID. **Apply this pattern** to any future async function that mixes profile-scoped storage writes with UI updates (e.g., `_loadFromAPI`, media queue handlers). The mutex against *concurrent* syncs (two profiles syncing at once) is **not** covered by this pattern — that's a separate deferred issue.

---

### 2026-05-17 — Demo as virtual data source row (vs. real journal profile)

**Context:** User asked to move the Demo data source from the topbar's mode toggle into the Settings → Data & Integrations data source list, as the first entry. Two paths considered: (A) introduce a new `connectionType: 'demo'` journal profile that synthesizes 100 sample trades, (B) render a virtual non-persisted row at the top of `_renderJournalProfileSwitchList` with a dedicated `setDataSource('demo')` action.

**Decision:** Path B — Demo is **not** a real profile. It's a virtual row injected at render time with `data-profile-id="__demo"` and `data-action="journal-profile-row-switch-demo"`. Clicking it bypasses `_handleJournalProfileSelectChange` entirely and calls `setDataSource('demo')` directly. The existing `setActiveJournalProfile` state is untouched when Demo is active; the `is-active` highlight is computed from `localStorage.getItem(DS_KEY) === 'demo'` and overrides the per-profile highlight in the list (`!demoActive && active?.id === profile.id`).

**Consequence:** No new persisted state. No migration. No Supabase row. Demo card has no sync button, no menu, no editor (because it's not a profile — those actions don't apply). The 3 topbar mode buttons (Demo/CSV/API) and the `ds-status-bar` were removed in the same session — all data-source switching now flows through this panel. **Caveat:** CSV mode is now only reachable via the "⬆ Import CSV" overlay (empty state CTA + mobile button). Adding CSV as a sibling virtual row is tracked in `ROADMAP.md` under "CSV access path after topbar cleanup".

---

### 2026-05-18 — Local automation layer: spec-in-CLAUDE.md, files gitignored

**Context:** The user works on two machines (Windows + Mac) and is non-technical (does not read code, verifies changes by refreshing localhost). Two recurring frictions were identified: (1) forgetting to bump `?v=N` in `index.html` after editing `dashboard.js`/`dashboard.css` → user refreshes and sees the old cached version, wastes minutes diagnosing; (2) syntax errors slipping through to delivery → user sees a blank/broken dashboard and has to flag it back. Three options for fixing this: (A) commit hook scripts and slash commands to git so both machines share them, (B) keep all local config gitignored under `.claude/` and require per-machine setup, (C) split — keep scripts under `scripts/` (tracked) and only `settings.local.json` (gitignored).

**Decision:** Path B — full per-machine setup, all under `.claude/` (already gitignored). The **spec** for hooks + slash commands lives in `CLAUDE.md` §12 / `AGENTS.md` §12 (committed). On a fresh machine, the user says "install hooks and commands here" and the agent regenerates everything from the spec. Six slash commands are canonical: `/start`, `/end`, `/localhost`, `/status`, `/undo`, `/push`. The hook script is OS-specific (PowerShell on Windows, bash on macOS) — the spec describes the behavior, not the syntax, so each machine gets a native script.

**Consequence:** Local config never collides between machines (no LF/CRLF flame wars, no Mac scripts in a Windows checkout, no permission-mode drift). The price: a one-shot install per machine (~2 minutes). The benefit: the agent on a fresh machine reads CLAUDE.md §12 and rebuilds everything without ambiguity — the spec is sufficient (no git-tracked script source needed). This pattern should generalize to any future per-machine automation (test runners, browser launchers, etc.) — always keep `.claude/` gitignored, always put the spec in CLAUDE.md §12.

---

### 2026-05-19 — Integrations vs Profiles split: registry pattern, gradual migration

**Context:** Long-term direction is multi-source support beyond Notion: MetaTrader 4/5 (via Expert Advisors), cTrader (Open API OAuth), and potentially Match-Trader / DXtrade / direct broker REST APIs. Today the dashboard's ~30 dispatch sites all branch inline on `profile.connectionType === 'notion'` (else fallback to legacy 'api'). Adding a new source would require finding and editing every one of those sites — high risk of partial migration, easy to miss edge cases. Two surfaces will eventually emerge in the UI: an **Integrations** page (one-time setup per source type) and a **Profiles** page (N profiles per integration, day-to-day switching). The data model split (integrations table + profiles table with FK) is anticipated but not yet implemented; today's `journal_profiles` rows still embed all integration data.

**Decision:** Introduce a runtime registry `INTEGRATIONS[type]` in `dashboard.js` (~line 4625, just after `_renderNotionEditorDbSection`) as the single source of truth for the set of supported / planned data sources. Each entry follows a fixed interface (`id`, `label`, `description`, `icon`, `available`, `isLegacy`, plus methods `isReady(p)`, `getStatusLabel(p)`, `renderEditor()`). Methods are arrow functions so referenced helpers resolve at call time (no hoisting issues across the 27k-line file). A helper `getIntegration(profileOrType)` returns the registry entry, falling back to the `notion` entry for unknown types rather than throwing. Five entries are seeded: `notion` (active, full methods), `api` (active, marked `isLegacy: true`, no UI), `mt5` / `mt4` / `ctrader` (planned, metadata only — `available: false`). The ~30 existing dispatch sites are **not** all migrated at once — only 3 highest-leverage ones in this initial commit (`_renderJournalProfileEditorMarkup` legacy branch + Notion section render, `_getJournalProfilesConnectedCount`, and the connection label at line 27916 area). Remaining sites migrate incrementally (Strangler Fig pattern) as new integrations land or as touched files are revisited for other reasons.

**Consequence:** Adding a fourth or fifth integration (e.g. when MT5 ships) is now bounded: write a new registry entry implementing the interface, no need to chase 30 call sites. The 3 migrated sites already benefit (`_getJournalProfilesConnectedCount` works for any future integration without a code change). Trade-off: until the remaining ~27 sites migrate, the registry is "leaky" — some code still branches inline on `connectionType === 'notion'`, so a new integration would partially work (count + editor + label) but fail at sync/lifecycle paths. The mockup `mockups/integrations-vs-profiles.html` documents the eventual UI target (Integrations page iterates `Object.values(INTEGRATIONS)` showing planned ones as "Coming soon" cards). CSV and Demo are deliberately **not** in the registry — CSV is a one-shot import (no auth, no sync engine) and Demo is a fixed dataset; both stay on their existing code paths until the Integrations page UI is built and we decide whether to model them as pseudo-integrations.

---

### 2026-05-19 — Ghost-trade reconciliation: 24h auto-trigger + invisible background full sync

**Context:** Notion's incremental sync endpoint (`?last_edited_after=<cursor>`) cannot surface deletions — a deleted page just stops appearing in subsequent responses, with no tombstone, no `_deleted` flag, no signal. The local cache (`apiTradesCache_v2_rrmax_<profile>_<source>`) therefore accumulates "ghost trades" indefinitely: rows the user removed in Notion that keep polluting equity curves, KPIs, and heatmaps. Severity tagged SEV-MED in the 2026-05-17 audit. Three cadence options were considered: (a) full sync on every Sync click — quadruple-digit cost for a deletion that happens once a week at most; (b) manual-only button — discoverability is near zero, 90%+ of community users will never use it and the bug persists; (c) periodic auto-trigger — balanced cost / detection latency, invisible to the user.

**Decision:** Implement option (c) with a 24-hour cadence (`_FULL_SYNC_INTERVAL_MS`). After every successful non-force `_loadNotionTrades` call, `_maybeQueueGhostSyncReconcile(profile, force)` checks `Date.now() - _getLastFullSyncAt() > 24h`; if true, it schedules a follow-up `_loadNotionTrades(profile, { force: true, background: true })` via `setTimeout(0)`. The `setTimeout(0)` defer is load-bearing: it lets the outer call's `finally` block restore `_journalProfileCacheContextOverride` first, otherwise the recursive call would read a stale cache scope after the outer's finally fires post-`await`. The reconcile leverages the existing `force: true` path, which already replaces the cache wholesale (`mergedParsed = parsed` when `fullSync`) — purge is implicit, no separate diff/delete logic needed. A new `background: true` option to `_loadNotionTrades` suppresses every transient UI artifact: no "Loading…" toast, no "syncing…" pill flash, no success toast, no source indicator change, no `_injectTrades` if `purgedCount === 0`. The user sees nothing unless a ghost is actually purged. Power-user escape hatch: a manual "Full resync" item in the profile row's ⋯ menu (`dashboard.js:5252`), gated on `connectionType === 'notion'`, calls `_loadNotionTrades(profile, { force: true })` with normal UI feedback and a completion toast (`N ghost(s) purged · M total` / `complete · M trades · no ghosts` / `failed`). Result communicated to the manual handler via a module-level `_lastFullSyncResult = { purgedCount, tradeCount, ranAt }` sentinel — chosen over modifying `_loadNotionTrades`'s return signature (would touch too many call sites).

**Consequence:** Ghost trades self-purge with at most ~24h latency, fully transparent in the common case. Bandwidth cost: one extra full Notion fetch per user per day (~200–500 trades = ~50–200 KB), each user's own OAuth token (no global rate limit) — negligible at 600-user scale. Edge case: if the user deletes ALL trades in Notion, the empty-trades branch (`dashboard.js:8606`) sets the profile to error state — acceptable, that's a destructive op the user shouldn't accidentally trigger. Concurrent sync mutex still missing (already a TODO Active) — clicking manual "Full resync" while a background reconcile is in flight runs both concurrently; cache writes are profile-scoped so no data loss, just wasted bandwidth. The initial implementation placed the manual button inside `_renderNotionSyncSection` — which turned out to be unreachable dead code (contradictory render gates between `dashboard.js:5267` and `dashboard.js:5136`). Moved to the ⋯ menu in the profile row; the dead-code finding logged as a TODO Active cleanup item.

---

### 2026-05-19 — Vercel `DASHBOARD_URL` is single-tenant prod (no dev/prod split)

**Context:** Mid-session, OAuth Notion redirected to `localhost:8766` after authorization (Max's local front runs on `localhost:8000`). Investigation : la function Vercel `notion-dashboard-api-2` lit `DASHBOARD_URL` (env var) pour rediriger après le callback OAuth. La variable était `http://localhost:8766` scope **Production AND Preview** depuis 2 jours → la prod (github.io users, ~600) était silencieusement cassée pour toute nouvelle connexion Notion. Aucun mécanisme dans le code backend pour distinguer prod vs dev front.

**Decision:** Remettre `DASHBOARD_URL = https://lemarsuoff.github.io/Flipping-Market-Dashboard/` (Production + Preview) et redéployer. Pour le dev OAuth local : **option pragmatique** — tester l'OAuth sur la prod uniquement, garder localhost pour le reste (UI, calculs, widgets). L'option propre (dynamic redirect via `Origin`/`Referer` + allowlist + state encoding) est trackée dans `ROADMAP.md` § Deferred, nécessite l'accès au repo backend qui n'est pas sur cette machine.

**Consequence:** Prod restaurée immédiatement (deploy `dpl_HA7pr4HH7EasGdYBUMXSpL2r2cjV`). Local OAuth flow inutilisable sans flipper temporairement la variable Vercel (ce qui casse la prod) — accepté comme trade-off jusqu'à ce que le backend repo soit accessible. **Règle pour les futurs agents** : ne jamais modifier `DASHBOARD_URL` côté Vercel sans confirmer que c'est volontaire et temporaire — la variable contrôle directement le redirect des 600 utilisateurs prod.

---

### 2026-05-20 — Global `localStorage.setItem` dedup wrap (Bloc 4 persistence/refresh investigation)

**Context:** Bloc 4 of the ROADMAP — "identify which localStorage writes are redundant on refresh and whether a debounce strategy is needed." Started by instrumenting `localStorage.setItem` at the very top of `dashboard.js` (gated `?lsAudit=1`) to capture per-key write counts, redundant calls (where the new value matches what's already stored), and payload sizes. Real-usage measurement on Max's 30-second interaction with a 658-trade M15 profile: **230 setItem calls, of which ~152 were exact duplicates of the value already in storage — about 800 KB of fully-redundant writes**. The redundancy was structural, not bursty: `presetLiveFilters_v1_<profile>` fired 28× with 100% identical payloads, `gs_layout_active_<profile>` and `gs_layout_default_<profile>` fired in tandem with identical 13.5 KB payloads on every drag/resize, `flipping_custom_widgets_<profile>` rewrote 22 KB on every heatmap threshold-slider move (due to a `changed = true` bug — see consequence). Targeted fixes per-callsite would have required touching 5-7 unrelated code areas with different ownership patterns. The 122-site grep made it clear a centralized fix was much higher leverage.

**Decision:** Wrap `localStorage.setItem` globally at the very top of `dashboard.js` (before any code runs, even before `DEMO_TRADES`). On every call, compare the proposed value against `localStorage.getItem(key)` — if identical, short-circuit and return without invoking the original setter. Cost is one extra `getItem` per `setItem` call (cheap, no I/O). The audit instrument was kept (still opt-in via `?lsAudit=1`) but merged into the same IIFE — the wrap always dedups; the audit toggle just adds stats tracking on top. Targeted fixes complementary to the wrap (none of these are strictly necessary now that dedup is global, but they avoid wasted CPU on `JSON.stringify` of large payloads): (a) `loadSavedTheme` — only re-writes the merged theme if `JSON.stringify(currentTheme) !== saved`, avoiding a 4.6 KB stringify+write per refresh; (b) sidebar state — unified sync (`_persistSidebarState`) + debounced (`_persistSidebarStateDebounced`) writers through a shared helper `_writeSidebarStateIfChanged` that caches the last payload in memory + compares against localStorage on the first call of the session; (c) `_saveBootSnapshot` — removed the dead `savedAt: Date.now()` field from the payload (only `topbarStatsHtml` is read on boot, per the index.html restore script), so the payload becomes stable when the topbar HTML doesn't change and the dedup wrap catches it; (d) `_commitLinkedSettingsToAllCustomHeatmaps` — replaced the `defs.forEach(def => { changed = true; def.settings = {...} })` bug with a real `prev.metricMode === _sdMetric && prev.threshold === _heatmapThreshold && prev.hardMode === _hmHardMode` short-circuit, which prevents the 22 KB stringify entirely on every heatmap-slider tick. Also added a transitive dedup short-circuit inside `safeSetLocalStorage` itself for defense in depth (most call sites go through it but not all). The `storage` event behavior is unchanged — the browser already only fires it when the value actually changes, so cross-tab listeners are unaffected.

**Consequence:** No call site needs to know about the dedup — it's transparent infrastructure. Future code that writes to localStorage automatically benefits without ceremony. Measured impact on the same 30-second user session, after all fixes: 232 setItem calls → 80 actually reach storage (66% short-circuited), ~444 KB legitimately written + ~800 KB redundancy neutralized. The remaining "true" writes are dominated by GridStack layout persistence (~270 KB across `gs_layout_active` and `gs_layout_<preset>`) and custom widget defs (~107 KB) — both are semantically required state changes, not bugs. **Caveats** logged as deferred TODOs: (i) `gs_layout_active` and `gs_layout_<preset>` write the same 13.5 KB payload to two LS keys on every drag (semantically different: autosave vs per-preset state — global dedup can't help between distinct keys); (ii) ~50% of `gs_layout_*` writes are dedup'd, meaning the GridStack `resizestop dragstop` handler fires even on drags that didn't move anything (snap-back, micro-clicks) — the dedup absorbs the I/O but `JSON.stringify` of 13.5 KB still runs. Both deferred to the next preset/layout architecture pass. The audit instrument stays installed (gated `?lsAudit=1`, zero overhead when disabled) for future investigations — call `__lsAudit({sortBy: "total"|"redundant"|"bytes"})` in the console.
