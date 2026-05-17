# Current Roadmap — Flipping Market Dashboard

> Suivi des chantiers livrés et à venir.
> Pour le détail des règles métier, voir `docs/business-rules.md`.
> Pour la cartographie fichiers, voir `docs/file-map.md`.
>
> **Dernière mise à jour** : 17 mai 2026

---

## Audit 2026-05-17 — post-Notion overhaul

Suite à l'ajout massif de features entre mi-avril et mi-mai (Notion OAuth, journal_profiles, MediaQueue/Supabase Storage, sync incrémentale, outcome value mapping, cache modes), un audit complet read-only a été conduit le 17 mai 2026. Le moteur de calcul (audit/ — 84 cellules, 6 probes) est **PASS sans régression**.

**Décision explicite : aucun fix appliqué lors de cet audit. Le dashboard est conservé en l'état. Les findings ci-dessous sont documentés pour priorisation future.**

### Findings SEV-HIGH

**H1 — XSS données Notion dans innerHTML**
- Sites : `dashboard.js:15057`, `14358`, `17840`, `18774`, `36758`, `12746`
- `t.pair`, `t.outcome`, `t.obstacles[]` interpolés sans `_escapeHtml()` dans plusieurs chemins de rendu (streak timeline, Trade Log title, drawer, calendar tooltip, mobile log, selection row)
- Fix : passer ces champs par `_escapeHtml()` dans les 6 sites — la fonction est disponible (98 usages ailleurs)
- Surface réelle : les 600 users communautaires qui importent des bases Notion tierces avec des propriétés arbitraires

**H2 — Ghost trades post-suppression Notion**
- `dashboard.js:5401` (`_mergeTradesByNotionId`), `7979` (fullSync condition)
- Un trade supprimé dans Notion ne réapparaît jamais dans `last_edited_time` filter → reste en cache local indéfiniment
- Fix structurel : comparer `_notionId` du full sync vs cache existant et purger les absents. En incrémental, indétectable sans full sync périodique forcé.

### Findings SEV-MEDIUM

**M1 — Mappings Notion non-syncés cross-device**
- `outcomeValueMapping_v1_<profileId>`, `apiFieldOverrides_v1_<profileId>_m15`, `apiFieldNames_v1_<profileId>` absents de `_SYNC_KEYS`
- Un user qui configure son mapping Notion sur Mac retrouve tous ses trades en "Other" sur Windows jusqu'à remapping manuel
- Fix : ajouter ces keys (scoped par profileId) dans `_SYNC_KEYS`

**M2 — Orphaned localStorage keys après suppression de profil**
- `_deleteJournalProfileById` (`dashboard.js:5254`) ne purge pas les keys scoped : `apiTradesCache_*`, `outcomeValueMapping_*`, `apiTradesMedia_*`, `notionLastSyncCursor_*`
- Accumulation indéfinie — peut contribuer aux pressions quota (threshold 8000 KB)
- Fix : ajouter un loop de cleanup de toutes les keys `getProfileScopedKey(...)` connues au moment de la suppression

**M3 — permanentUrl opaque côté client**
- `_processBatch` (`dashboard.js:7720`) stocke `r.permanentUrl` sans vérifier si c'est réellement une URL Supabase permanente vs une URL S3 re-signée
- Dépend du comportement du backend Vercel `/api/notion/media-sync` — à vérifier côté backend

**M4 — Absence de vérification du state OAuth au callback client**
- `_handleNotionOAuthReturn` (`dashboard.js:4103`) ne lit pas et ne compare pas le paramètre `state` renvoyé par Notion
- Protection CSRF incomplète côté frontend (le backend Vercel gère le `code` exchange, mais le client ne valide rien)

**M5 — Unknown outcome values invisibles en production**
- Les valeurs Notion non-mappées sont loggées via `debugLog` (no-op hors flag `debugDashboard`)
- Aucun signal UI pour l'utilisateur non-technique dont des trades sont silencieusement classifiés "Other"

### Findings SEV-LOW / INFO

**L1 — Failure silencieuse sur batch upload média échoué**
- Si `fetch` vers `/api/notion/media-sync` échoue, le batch est abandonné (console.warn + return). Le trade garde l'URL Notion amazonaws (~1h d'expiration). Le `_done` Set empêche le retry dans la session.

**L2 — ghostMode non-syncé cross-device** (cosmétique)

**L3 — Disconnect Notion ne vide pas le cache localStorage des trades** (UX, pas sécurité)

**I1 — notionLastSyncCursor non-syncé cross-device** → full sync automatique sur nouvelle machine (correct, juste lent)

**I2 — Clé Supabase anon exposée** (intentionnel — dépend des RLS policies)

**I3 — setItem(key, '') ne propage pas la suppression vers Supabase** (cas réels rares)

**I4 — Double-write localStorage sur setItem syncé** (idempotent, aucun impact observable)

---

## Backlog pré-overhaul — OBSOLETE

> Le code a grossi de ~45% depuis mai 2026 (26k → 38k lignes). Les items ci-dessous datent de sessions antérieures à l'overhaul Notion et ne reflètent plus l'état du code. Conservés à titre historique uniquement.

<details>
<summary>Backlog antérieur (cliquer pour déplier)</summary>

### Chantier "Audit-driven cleanup" (4 mai 2026)

- PR1 `cleanup/pr1-dead-code-css` — dead code JS/HTML/CSS, dedup CSS (commit `5368c36`, PR #16)
- PR2 `perf/pr2-quick-wins` — hoist cfg, O(N) rolling WR, persist debounced, etc. (commits `12e8dca`+, PR #17 #18)
- PR3 `robust/pr3-silent-failures` — try/catch logging, isolation per-trade _normalizeAPITrade (commit `85299cf`, PR #19)

### Chantier "PO UX/UI Overhaul" (3 mai 2026)

Equity baseline fixed 2.4R, Apply Full TP, saved presets deltas fix, sweep TP éditable, Recalculer déplacé, Bilan rows simplifiés, tooltip portal fix, bandeau responsive, hover-zoom, RR-dist chip active state. Commit `c54c9aa`.

### Chantier "Soft Glow redesign" (29 avril 2026)

PR-Layout v13, PR-A/B/C/D (tri classement, Apply, presets slots, equity curves), Soft Glow PR-1/2/3, fix sort regression.

### Chantier "Refonte modern card-based" (30 avril 2026)

PR-1 Bilan, PR-2 Saved Presets, PR-3 Ranking compact, PR-4-bis Best stat cards, PR-5 Internal layout editor. Commits `3ec384f`, `9a63951`.

### Refactor candidats (antérieurs)

- **R11** — Convergence baselines PO (Equity graph 2.4R hardcoded vs Bilan vsBaseline)
- **R12** — Tooltip portal pattern extensible

### Backlog UI antérieur

- Validation runtime bandeau responsive (container queries + hover-zoom — 3 mai 2026)
- Yellow border highlighting on clicked cells (P&L Calendar, Pair × Session, Monthly P&L)

</details>

---

## TODOs actifs

### En cours

- **Mini grid sidebar** — sidebar 40vw avec mini-stack éditable. Phase 1+2 livrées. Retours d'usage Max attendus avant clôture. Code : `_msState`, `_msInitGrid`, `_msPreview`, `_msApplyChanges`, `_applyMagnetSnap`.
- **Optimal RR widget — BE Management filter button** — clarifications pendantes :
  1. Valeurs dynamiques du dataset ou liste fixe ?
  2. Match any ou match all pour exclusion ?
  3. Scope widget-only ou dashboard entier ?

### Backlog UI

- **Yellow border highlighting** on clicked cells (P&L Calendar, Pair × Session, Monthly P&L) en Hover mode.
- **Share view — bottom summary strip** : `WIN DAYS / LOSS DAYS / NO TRADES / BEST DAY / WORST DAY / AVG PER TRADE` — visible dans référence user, pas implémenté.

### Drawdown Intelligence section (deferred)

Si repris : DD by context, Recovery Factor, DD Duration, Risk of Ruin, Underwater curve, Streak/DD scatter, MAR/Calmar (low priority).

---

## Décisions documentées

| Date | Décision |
|---|---|
| 2026-05-17 | Audit post-overhaul : 0 fix appliqué. Dashboard conservé tel quel. Findings documentés ci-dessus pour priorisation future. |
| 2026-05-17 | Workflow git : commits directs sur main, pas de branches dédiées. |
| 2026-05-15 | ROBUST-11 : `_isSafeCssValue` + hardening unicode escapes dans `importTheme`. PR #22. |
| 2026-05-06 | Mini grid sidebar Phase 1+2 livrées — en attente retours Max. |
| 2026-05-06 | Hide widgets feature livrée. |
| 2026-05-05/06 | Share view sprint — PNG canonique 2400×1032 fixé, bottom-alignment règle dure. |
| 2026-04-28 | Audit moteur : 126 cellules, 0 bug calcul. |
