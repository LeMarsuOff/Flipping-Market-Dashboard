# File Map — Flipping Market Dashboard

> Cartographie des 3 fichiers et des fonctions clés. À charger pour les tâches d'exploration ou de localisation de code.

---

## Structure du repo

```
/
├── index.html              # Structure dashboard, widgets containers, panels (~2k lignes)
├── dashboard.js            # Toute la logique (~28k lignes)
├── dashboard.css           # Design system, couleurs, layouts (~11k lignes)
├── CLAUDE.md               # Contexte projet pour Claude Code
├── docs/
│   ├── business-rules.md   # Règles métier (outcomes, BE, modes TP)
│   ├── file-map.md         # Ce fichier
│   └── archive/            # Historique de PRs déjà livrées
└── .vscode/, .claude/      # Config locale (launch.json, settings.local.json)
```

---

## `dashboard.js` — fonctions clés par domaine

### Filtrage & datasets

| Fonction | Rôle | Localisation |
|---|---|---|
| `filterDataset(trades)` | **Point de passage obligé pour tous les widgets**. Branche `_enrichTradeClassification` qui précalcule `t.effectiveR` et `t.effectiveClass`. | `dashboard.js:4848` |
| `_enrichTradeClassification(trades, tpConfig)` | Précalcule classification effective pour chaque trade. | `dashboard.js:1893` |
| `getFiltered()` / `_filterTradesBySnapshot()` | Filtre par chip state unifié. | — |
| `filterCustomChips()` | Pipeline custom props, inséré entre `filterChips` et `filterTemporal`. | — |
| `_rrFilterBubbleClick(lv)` | Toggle du filtre `rrMinFilter` au clic sur une bulle Optimal RR. Persisté par preset. | `dashboard.js:14174` |

### Classification & calculs RR

| Fonction | Rôle | Localisation |
|---|---|---|
| `computeEffectiveRR(trade, tpConfig)` | Retourne le R effectif sous le mode TP donné. Cœur de la classification. | `dashboard.js:1732` |
| `isWinner(t, cfg?)` / `isLoser(t, cfg?)` / `isBE(t, cfg?)` | Classification par mode. **Arg `cfg` optionnel** (default `appState.ui.tpConfig`). Indispensable pour `calcStats(trades, presetTpConfig)`. | `dashboard.js:1646-1660` |
| `calcStats(trades, tpConfigArg?)` | Stats agrégées (WR, PF, streaks, cnt_tp/be_tp/be_sl/cnt_sl). | `dashboard.js:5185` |
| `_parseBeTriggerR(beManagementArr)` | Prend le MAX des chips actives. Bon référentiel pour le cap des partials. | `dashboard.js:14417` |
| `_hashTpConfig(cfg)` | Hash stable du config TP, **inclut `\|be:<mode>`** pour invalider au switch BE. Clé de cache pour `_effectiveClassMode`. | `dashboard.js:1619` |
| `_getTradeReachR(trade)` | Retourne le rrMax brut (proxy reach). Utilisé par les sims partial. | `dashboard.js:13638` |
| `_ppSimTrade(rrMax, partials)` | Simule un trade leg-par-leg en mode personalised. | `dashboard.js:13770` |
| `_poSimTradeBeAware(trade, rrMax, partials)` | Variante BE-aware pour Partial Optimizer. Aligné avec `_ppSimTrade`. | `dashboard.js:14600` |

### Architecture BE Management (résolveurs)

| Fonction | Rôle | Localisation |
|---|---|---|
| `_resolveBEDecision(trade, beMode)` | **Unique source de vérité** pour la politique BE. Retourne `{applyBEAware, triggerR, fallbackToNoBE, fallbackVariant}`. | `dashboard.js:16351` |
| `_resolveBeR(trade, partials, reachR)` | Résolveur pour mode TP `personalised`. | `dashboard.js:16387` |
| `_resolveBeRMulti(trade, ...)` | Résolveur pour mode TP `multi`. | `dashboard.js:16417` |
| `_resolveBeRFixed(trade)` | Résolveur pour mode TP `fixed`. | `dashboard.js:16448` |

**Modes BE actifs** (dans `appState.ui.beMode`, persisté `localStorage.flipping_be_mode`) :
- `be-fallback` (default) — path-aware cap au `_parseBeTriggerR(trade)`
- `flipping-be` — BE armé counterfactuellement à 2.4R quand reach ≥ 2.4

**Mode retiré** : `no-be` a été supprimé via PR `feat/kill-no-be-mode`. Migration auto au boot pour les users sur `no-be` (ligne 105-109).

Pour le détail des incohérences inter-modes : voir `docs/audit-2026-04-28.md`.

### State

| Variable | Rôle |
|---|---|
| `appState.trades.items` | **Source de vérité in-memory.** Trades normalisés avec `.extras` pour props Notion custom. |
| `appState.filters.chips[dim]` | Chips natifs (9 dims : setup, session, day, pair, obstacles, h4obs, tradeType, beManagement, hour). 4 Sets : `included`, `excluded`, `includedFromPreset`, `excludedFromPreset`. |
| `appState.filters.customChips[propKey]` | Chips custom Notion, structure `{mode, matchMode, included, excluded}`. |
| `appState.filters.comboFilters` | Filtres combo heatmap (`sessionDay`, `pairSession`). Jamais promus en preset. |
| `appState.ui.tpConfig` | Config TP active (mode + targets + partials). |

### Presets & live filters

| Fonction | Rôle | Localisation |
|---|---|---|
| `applyPreset(id)` | Sync sortant → strip → flip activeId → hydrate glow → hydrate live → render. | `dashboard.js:4500` |
| `_hydrateChipsFromSnapshot(snap)` | Hydrate chips depuis snapshot preset (glow). | — |
| `_hydrateChipsFromLiveSlot(slot)` | Hydrate chips depuis slot live (respecte règle "glow prime"). | — |
| `_syncLiveSlotFromActiveChips()` | Miroir live → slot du preset actif. Appelée à chaque mutation. | — |
| `getPresetLiveSlot(id)` | Lazy getter avec backfill du slot live. | — |
| `commitLiveFiltersToActivePreset()` | Promote live → glow (Save > Update). | — |
| `savePresetFromLive()` | Crée nouveau preset depuis live + glow source. | — |
| `resetLiveFilters()` | Vide le slot live du preset actif. | — |
| `renderSaveButton()` | Render du bouton Save contextuel (split + dropdown). | — |

### Custom Notion properties

| Fonction | Rôle |
|---|---|
| `loadCustomProps()` / `addCustomProp()` / `updateCustomProp()` / `deleteCustomProp()` | CRUD config props custom. |
| `_repopulateExtrasForProp()` | Pattern "Option B ingestion" — réhydrate `t.extras` après modif config. |
| `_resolveChipEntry(key)` | Routing namespace `custom:<key>`. |
| `_customEntryPasses(t, entry)` | Matcher partagé live + preset overrides. |
| `_serializeCustomChips()` / `_deserializeCustomChips()` | Set ↔ Array pour persistance localStorage. |

### Rendering widgets

| Fonction | Widget |
|---|---|
| `renderEquity()` | Equity & Drawdown chart |
| `renderStats()` | Statistics Overview |
| `renderOutcome()` | Outcome Breakdown (donut, utilise comptes Notion-pure) |
| `renderMonthlyPnL()` | Monthly P&L |
| `renderCalendar()` | P&L Calendar |
| `renderHeatmap()` | Session × Day Heatmap |
| `renderPairSession()` | Pair × Session |
| `renderTradeLog()` | Trade Log (affiche effectiveR) |

---

## localStorage — clés en usage

| Clé | Rôle |
|---|---|
| `flipping_schema_version` | Version de schéma (`"2"` après migration v2). |
| `flipping_preset_snapshots_v2` | Snapshots glow par preset (source unique). |
| `presetLiveFilters_v1` | Slots live filters par preset (sœur jumelle). |
| `flipping_presets` | Liste des presets existants. |
| `flipping_preset_overrides` | **Legacy** (no-op fonctionnel post-v2, conservé en écriture pour compat). |
| `flipping_notion_properties` | Custom props déclarées par l'user. |
| `flipping_sidebar_state` | État UI sidebar. |
| `apiTradesCache` | **Piège récurrent** : peut être stale. Purger via `localStorage.removeItem('apiTradesCache')` + hard refresh à chaque changement structurel. |
| `apiTradesCache_v2_rrmax` | Cache enrichi avec rrMax. **Quota localStorage à surveiller**. |
| `flipping_api_url` | URL API Vercel. |
| `beRule`, `ghostMode` | Settings UI. |

---

## Widgets — IDs GridStack

21 widgets identifiés par `data-gs-id` (vérifié dans `index.html`) :

| ID | Titre |
|---|---|
| `w-stats` | Statistics Overview |
| `w-equity` | Equity & Drawdown |
| `w-outcome` | Outcome Breakdown |
| `w-selection` | Selection |
| `w-monthly` | Monthly P&L |
| `w-calendar` | P&L Calendar |
| `w-setup` | Setup Performance |
| `w-session` | Session Performance |
| `w-day` | Day Performance |
| `w-pair` | Pair Performance |
| `w-hour` | Hour DST Performance |
| `w-heatmap` | Session × Day Heatmap |
| `w-pair-session` | Pair × Session |
| `w-m15` | M15 Obstacle Performance |
| `w-h4` | H4 Obstacle Performance |
| `w-streak-analytics` | Streak Analytics |
| `w-recovery` | Post-Drawdown Recovery |
| `w-montecarlo` | Monte Carlo Simulation |
| `w-optimal-rr` | Optimal RR Analysis |
| `w-partial-optimizer` | Partial Optimizer |
| `w-tradelog` | Trade Log |

**Note historique** : `w-partials-planner` a été retiré (commentaire `dashboard.js:14186` "Partial Planner widget retired"). Seul `w-partial-optimizer` subsiste pour les analyses de partials.

`DEFAULT_LAYOUT` codé en dur à `dashboard.js:23251`.

---

## Sources de données

| Source | Description |
|---|---|
| **Demo** | Dataset embarqué pour onboarding / partage public |
| **CSV upload** | 3 formats supportés (Pro Template, Beginner, custom). Détection auto. |
| **API Notion** | Via Vercel proxy `notion-dashboard-api-2.vercel.app`. Custom props ingérées dans `t.extras`. |

---

## Panneaux flottants

Tous via `.classList.toggle('open')` :
- Settings panel
- Theme panel
- Notion Properties panel
- Tune panel (⚙ par preset)

Event delegation : `data-action` attribute → `handleActionClick()`.
