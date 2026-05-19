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
