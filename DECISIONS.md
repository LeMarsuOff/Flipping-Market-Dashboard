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
