# AUDIT — Détails techniques

Fichier compagnon de [`AUDIT_REPORT.md`](AUDIT_REPORT.md). Contient les matrices exhaustives, le call graph détaillé, les tableaux complets de tests et la cartographie line-by-line.

---

## 1. Cartographie détaillée

### 1.1 Constantes système (`dashboard.js:1613-1614, 16321`)

| Nom | Valeur | Usage |
|---|---|---|
| `_SYSTEM_TP_R` | `2.4` | TP référence système (utilisé en Fixed × no-be BE-SL binary, en `computeOptimalRR` cutoff TP1, en `_getSimulatedR`) |
| `_SYSTEM_SL_R` | `-1.0` | SL référence système (utilisé en `_systemRForOutcome` 1620-1624) |
| `_FLIPPING_BE_R` | `2.4` | Trigger hardcoded pour `flipping-be` mode (`_resolveBEDecision` 16373) |

### 1.2 State globaux (`dashboard.js:74-82, 105`)

```javascript
appState.ui = {
  beMode: 'be-fallback',        // 'be-fallback' | 'no-be' | 'flipping-be' (LS: 'flipping_be_mode')
  beRule: 2.4,                  // (legacy ; LS: 'beRule')
  beManagementExclude: [],      // chip exclusion ORR widget
  tpConfig: {                   // mode + multi + personalised sub-configs
    mode: 'fixed',              // 'fixed' | 'multi' | 'personalised'
    multi: { tpCount, partials: {tp1, tp2, tp3} },
    personalised: { tpCount, targets: {tp1, tp2, tp3}, partials: {tp1, tp2, tp3} }
  },
  rrMinFilter: null,            // ORR pill (null sauf user choisit un TP)
};

let _orrSimMode = 'be-fallback'; // 'be-fallback' | 'strict-loss' (LS: 'flipping_orr_sim_mode')
```

### 1.3 Fonctions critiques — signature, line, branches

| Fonction | Ligne | Inputs | Outputs | Branches modes |
|---|---|---|---|---|
| `_hashTpConfig(cfg)` | 1630 | tpConfig | string `mode:...|be:<beMode>` | 4 (fixed/multi/perso/null) × beMode |
| `isWinner(t, cfg)` | 1657 | trade, cfg | bool | cache hit ou compute |
| `isLoser(t, cfg)` | 1662 | trade, cfg | bool | idem |
| `isBE(t, cfg)` | 1667 | trade, cfg | bool | idem |
| `_sortTradesChronological(trades)` | 1691 | array | sorted array | aucune (mode-independent) |
| `computeEffectiveRR(trade, tpConfig)` | 1743 | trade, cfg | number | switch fixed/multi/perso ; outcome BE-* delegate |
| `_enrichTradeClassification(trades, cfg)` | 1903 | array, cfg | mutates | hash gate per trade |
| `_isValidPersonalisedConfig(p)` | 1954 | sub-cfg | bool | shape check |
| `calcStats(trades, tpConfigArg)` | 5195 | array, optional cfg | KPIs object | aucune (délégation) |
| `_getContextFiltered(...)` | 5115 | bool, opts | filtered array | BE management exclusion |
| `getFilteredForORR()` | 5171 | — | filtered array | sans rrMinFilter gate |
| `computeOptimalRR(trades)` | 10918 | array | 12 results | BE-aware branch + standard, x `_orrSimMode` |
| `renderOptimalRRWidget(trades)` | 11032 | trades | DOM | — |
| `_getTradeReachR(trade)` | 13679 | trade | number | aucune |
| `_getSimulatedR(trade)` | 13716 | trade | number\|null | mirror de `computeOptimalRR` |
| `_applySimulation(trades)` | 13791 | array | mutated copies | rrMinFilter active only |
| `_ppSimTrade(rrMax, partials)` | 14244 | reach, plan | number | SL fallback `rrMax<TP1 → -1` |
| `simulateCustomPartialsPlan(legs, rrMaxArr)` | 14260 | plan, array | metrics object | (Partial Planner widget legacy) |
| `_parseBeTriggerR(beManagementArr)` | 16301 | array | number\|null | regex MAX |
| `_activeBeMode()` | 16347 | — | string | reads global |
| `_resolveBEDecision(trade)` | 16351 | trade | decision shape | 3 modes BE × outcome |
| `_resolveBeR(trade, partials, reachR)` | 16387 | trade, plan, reach | number | 3 branches via decision |
| `_resolveBeRMulti(trade, mCfg)` | 16417 | trade, multi cfg | number | idem |
| `_resolveBeRFixed(trade)` | 16448 | trade | number | idem |
| `_poSimTradeBeAware(trade, rrMax, partials)` | 16486 | trade, reach, plan | number | BE-aware route OR `_ppSimTrade` |
| `_poSimulateModel(model, rrMaxArr, trades)` | 16722 | model, reach, trades | metrics object | BE-aware si trades fourni |
| `_poTradesHash(rrMaxArr, config)` | 17001 | array, cfg | string | inclut beMode |
| `_isMultiMappingComplete(multiCfg)` | 21557 | multi cfg | bool | dataset mode dependent |
| `_setBeMode(mode)` | 21222 | string | mutation | invalidate cache + render |
| `_setTpMode(mode)` | 21236 | string | mutation | persist + render |

### 1.4 Decision matrix `_resolveBEDecision` (récap)

| BE mode | Outcome | applyBEAware | triggerR | fallbackToNoBE | fallbackVariant |
|---|---|---|---|---|---|
| be-fallback | BE-TP/BE-SL chip parseable | true | parsed MAX R | false | — |
| be-fallback | BE-TP/BE-SL chip null/empty | false | null | false | — |
| no-be | BE-TP/BE-SL | false | null | true | `pure-tp-with-sl` |
| flipping-be | BE-TP | false | null | true | `pure-tp-no-sl` |
| flipping-be | BE-SL reach ≥ 2.4 | true | 2.4 | false | — |
| flipping-be | BE-SL reach < 2.4 | false | null | true | `pure-tp-with-sl` |

### 1.5 Decision matrix `_resolveBe*` consommateurs (récap)

Sortie pour `applyBEAware: true` :
- `_resolveBeR` : `Σ pct·lv if lv ≤ triggerR` (cap au trigger).
- `_resolveBeRMulti` : `Σ (p.tpN/100) · trade.tpN_rr if trade.tpN_rr ≤ triggerR` (cap au trigger sur réalisé).
- `_resolveBeRFixed` : BE-TP → `trade.r` ; BE-SL → 0.

Sortie pour `fallbackToNoBE: true` :
- `_resolveBeR` (variant `pure-tp-no-sl`, BE-TP only) : `Σ pct·lv if reachR ≥ lv` (floored 0, no SL fallback).
- `_resolveBeR` (variant `pure-tp-with-sl`) : `_ppSimTrade(reachR, partials)` (SL fallback fires).
- `_resolveBeRMulti` BE-SL : `trade.r` (passthrough).
- `_resolveBeRMulti` BE-TP : `Σ (p.tpN/100) · trade.tpN_rr` no cap, 0 si aucun hit.
- `_resolveBeRFixed` BE-SL : `rrMax ≥ _SYSTEM_TP_R → +2.4 ; else -1`.
- `_resolveBeRFixed` BE-TP : `trade.r`.

Sortie pour `applyBEAware: false, fallbackToNoBE: false` (be-fallback null chip) :
- `_resolveBeR` : `0` (BE neutre).
- `_resolveBeRMulti` : `0` (BE neutre).
- `_resolveBeRFixed` : `trade.r` (passthrough). ⚠ **Incohérence #1** dans le rapport principal.

### 1.6 Wiring UI vérifié

| Élément | HTML ligne | Handler ligne | Pattern |
|---|---|---|---|
| `#tpm-mode-list` (radios TP) | `index.html:1005-1006` | `dashboard.js:22130` | `change` event |
| `#tpm-be-list` (radios BE) | `index.html:1033` | `dashboard.js:22140` | `change` event ✓ (CLAUDE.md confirmed) |
| `#tpm-toggle-btn` (panel) | `index.html:694` | data-action `toggle-tpm-panel` | event delegation |
| `_setBeMode(mode)` | — | `dashboard.js:21222-21233` | mutate + invalidateFilterCache + force PO recompute |
| `_setTpMode(mode)` | — | `dashboard.js:21236-21250` | mutate + persist (preset-scoped) + render |

### 1.7 localStorage keys

| Clé | Type | Source de vérité | Validation |
|---|---|---|---|
| `flipping_be_mode` | string | `appState.ui.beMode` | `dashboard.js:104` (whitelist) |
| `flipping_orr_sim_mode` | string | `_orrSimMode` | `dashboard.js:10869` (whitelist) |
| `beRule` | float | `appState.ui.beRule` | `dashboard.js:98` |
| `flipping_preset_snapshots_v2` | JSON | per-preset snapshots inc tpConfig | shape check |
| `flipping_presets_live` | JSON | per-preset live slot inc tpConfig | shape check |
| `flipping_notion_properties` | JSON | custom props array | shape check |

---

## 2. Matrice complète (126 cellules)

Dataset = 14 trades, plan Personalised = 50% @ TP1=1R + 50% @ TP2=2.4R, Multi = tpCount=2 partials 50/50.

| Trade ID | outcome | r | rrMax | beManagement | tp1_rr | tp2_rr | F·BF | F·NB | F·FB | M·BF | M·NB | M·FB | P·BF | P·NB | P·FB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TP-clean | TP | 2.4 | 3.1 | [1RR] | 1.0 | 2.4 | +2.40 | +2.40 | +2.40 | +1.70 | +1.70 | +1.70 | +1.70 | +1.70 | +1.70 |
| SL-clean | SL | -1 | 0.4 | [] | — | — | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 |
| BETP-1R-low | BE-TP | 0 | 1.5 | [1RR] | 1.0 | — | 0 | 0 | 0 | +0.50 | +0.50 | +0.50 | +0.50 | +0.50 | +0.50 |
| BETP-multi-high | BE-TP | 0 | 3.5 | [1RR,2RR] | 1.0 | 2.0 | 0 | 0 | 0 | +1.50 | +1.50 | +1.50 | **+0.50** | **+1.70** | **+1.70** |
| BESL-2R-high | BE-SL | -1 | 2.8 | [2RR] | 1.0 | 2.0 | **0** | **+2.40** | **0** | **+1.50** | **-1.00** | **+1.50** | **+0.50** | **+1.70** | **+1.70** |
| BESL-empty-chip | BE-SL | -1 | 1.7 | [] | 1.0 | — | **-1.00** | -1.00 | -1.00 | **0** | -1.00 | -1.00 | **0** | +0.50 | +0.50 |
| BETP-1R-rrMax5 | BE-TP | 0 | 5.0 | [1RR] | 1.0 | — | 0 | 0 | 0 | +0.50 | +0.50 | +0.50 | +0.50 | +1.70 | +1.70 |
| BETP-multipart-overcap | BE-TP | 0 | 3.2 | [1RR] | 1.0 | 3.0 | 0 | 0 | 0 | **+0.50** | **+2.00** | **+2.00** | **+0.50** | **+1.70** | **+1.70** |
| BESL-boundary | BE-SL | -1 | 2.4 | [2RR] | 1.0 | 2.0 | 0 | +2.40 | 0 | +1.50 | -1.00 | +1.50 | +0.50 | +1.70 | +1.70 |
| TP-no-rrMax | TP | 2.4 | null | [1RR] | 1.0 | 2.4 | +2.40 | +2.40 | +2.40 | +1.70 | +1.70 | +1.70 | +1.70 | +1.70 | +1.70 |
| BESL-bucket | BE-SL | -1 | 1.5 | [1RR] | 1.0 | — | **0** | **-1.00** | **-1.00** | **+0.50** | **-1.00** | **-1.00** | **+0.50** | **+0.50** | **+0.50** |
| BETP-mid | BE-TP | 0 | 2.5 | [2RR] | 1.0 | 2.0 | 0 | 0 | 0 | +1.50 | +1.50 | +1.50 | +0.50 | +1.70 | +1.70 |
| BETP-rrMax-below-TP1 | BE-TP | 0 | 0.6 | [0.5RR] | 0.5 | — | 0 | 0 | 0 | +0.25 | +0.25 | +0.25 | **0** | **-1.00** | **0** |
| BETP-no-rrMax | BE-TP | 0 | null | [1RR] | 1.0 | — | 0 | 0 | 0 | +0.50 | +0.50 | +0.50 | **+0.50** | **-1.00** | **0** |

**Légende** : F=Fixed, M=Multi, P=Personalised ; BF=be-fallback, NB=no-be, FB=flipping-be. Cellules en **gras** = divergences inter-modes notables (cf. §6 du rapport principal).

**Vérification** : 126 cellules, 0 gap entre observé (test_runner) et attendu (calculs manuels).

### 2.1 Sommaire par catégorie de divergence

| Catégorie | Nombre cellules | Δ max observé | Lien doctrine |
|---|---|---|---|
| TP outcome F vs M/P | 24 | 0.7R/trade | Plan capped to TP1+TP2 (0.5*1+0.5*2.4=1.7) vs Notion 2.4R — by design |
| BE-SL no-be Fixed vs Multi vs Perso | 6 | 3.4R/trade | Incoherence #3 (by design) |
| BE-SL be-fallback empty chip | 1 | 1R/trade | **Incohérence #1** |
| BE-TP no-be Personalised reachR<TP1 | 2 | 1R/trade | **Incohérence #2** |
| BE-TP no-be vs flipping-be Personalised | 12 | up to 1R/trade | Multi/Perso runners + variant pure-tp-no-sl asymmetry |
| Reste (TP/SL purs, BE convergents) | 81 | 0R | ✓ |

---

## 3. Tests détaillés

### 3.1 Convergence PO ↔ Personalised (3 plans × 3 BE modes)

| Plan | BE-mode | Personalised TotalR | PO TotalR | Δ |
|---|---|---|---|---|
| 2R 100% | be-fallback | 11.0000 | 11.0000 | **0.0000 ✓** |
| 2R 100% | no-be | 10.0000 | 10.0000 | **0.0000 ✓** |
| 2R 100% | flipping-be | 13.0000 | 13.0000 | **0.0000 ✓** |
| 1R/2.4R 50/50 | be-fallback | 6.9000 | 6.9000 | **0.0000 ✓** |
| 1R/2.4R 50/50 | no-be | 12.1000 | 12.1000 | **0.0000 ✓** |
| 1R/2.4R 50/50 | flipping-be | 14.1000 | 14.1000 | **0.0000 ✓** |
| 1R/2R/3R 33/33/34 | be-fallback | 7.6100 | 7.6100 | **0.0000 ✓** |
| 1R/2R/3R 33/33/34 | no-be | 9.9900 | 9.9900 | **0.0000 ✓** |
| 1R/2R/3R 33/33/34 | flipping-be | 11.9900 | 11.9900 | **0.0000 ✓** |

**Conclusion** : la mirror function rule entre PO (`_poSimTradeBeAware`) et Personalised (`computeEffectiveRR` perso) est **respectée numériquement** sur 9/9 cellules pour 3 plans différents. L'invariant CLAUDE.md tient.

### 3.2 Multi vs PO breakdown par trade (be-fallback, plan 1R/2.4R 50/50)

| Trade | outcome | tp1/tp2 | Multi | PO | Δ | Pourquoi |
|---|---|---|---|---|---|---|
| TP-clean | TP | 1/2.4 | 1.70 | 1.70 | 0 | converges |
| SL-clean | SL | null/null | -1.00 | -1.00 | 0 | converges (passthrough) |
| BETP-1R-low | BE-TP | 1/null | 0.50 | 0.50 | 0 | converges |
| BETP-multi-high | BE-TP | 1/2 | 1.50 | 0.50 | +1.00 | Multi credits realized tp2_rr=2 (cap au trigger=2) ; PO credits leg lv=2.4 capped (0) |
| BESL-2R-high | BE-SL | 1/2 | 1.50 | 0.50 | +1.00 | idem |
| BESL-empty-chip | BE-SL | 1/null | 0.00 | 0.00 | 0 | converges (BE-fallback null chip → 0R both) |
| BETP-1R-rrMax5 | BE-TP | 1/null | 0.50 | 0.50 | 0 | converges |
| BETP-multipart-overcap | BE-TP | 1/3 | 0.50 | 0.50 | 0 | converges (tp2_rr=3 > trigger=1 → skipped both sides) |
| BESL-boundary | BE-SL | 1/2 | 1.50 | 0.50 | +1.00 | idem BETP-multi-high |
| TP-no-rrMax | TP | 1/2.4 | 1.70 | 1.70 | 0 | converges |
| BESL-bucket | BE-SL | 1/null | 0.50 | 0.50 | 0 | converges |
| BETP-mid | BE-TP | 1/2 | 1.50 | 0.50 | +1.00 | idem |
| BETP-rrMax-below-TP1 | BE-TP | 0.5/null | 0.25 | 0.00 | +0.25 | Multi credits tp1_rr=0.5 ≤ trigger=0.5 ; PO leg lv=1 > trigger → skip |
| BETP-no-rrMax | BE-TP | 1/null | 0.50 | 0.50 | 0 | converges |

**Sum Δ = +5.25R** sur 14 trades. Toutes les divergences proviennent de **structurel** (Multi reads `tp_N_rr` réalisé capped au trigger ≠ PO reads plan `lv` capped au trigger). C'est **par design** — CLAUDE.md le documente explicitement.

### 3.3 ORR ↔ Σ_getSimulatedR à TP=2.4R

| BE-mode | ORR cumR | Σ_getSimulatedR | Δ | excluded |
|---|---|---|---|---|
| be-fallback | 3.80 | 3.80 | **0.0000 ✓** | 0 |
| no-be | 13.20 | 13.20 | **0.0000 ✓** | 0 |
| flipping-be | 16.20 | 16.20 | **0.0000 ✓** | 1 (BE-TP no rrMax variant pure-tp-no-sl) |

### 3.4 ORR strict-loss vs be-fallback (à TP=2.4)

Sur ce dataset, identiques (0R) car la fenêtre `[_SYSTEM_TP_R=2.4, tp=2.4)` est vide. La différence apparaît à TP > 2.4 — voir test_output.txt pour la courbe complète par BE mode.

### 3.5 ORR full curves (be-fallback ORR mode)

#### BE = be-fallback

| TP | wins | losses | beOut | excluded | cumR | WR% | EV | PF |
|---|---|---|---|---|---|---|---|---|
| 0.5 | 12 | 1 | 1 | 0 | 5.00 | 85.7 | 0.38 | 6.00 |
| 1.0 | 11 | 1 | 2 | 0 | 10.00 | 78.6 | 0.83 | 11.00 |
| 1.5 | 6 | 1 | 7 | 0 | 8.00 | 42.9 | 1.14 | 9.00 |
| 2.0 | 6 | 1 | 7 | 0 | 11.00 | 42.9 | 1.57 | 12.00 |
| 2.4 | 2 | 1 | 11 | 0 | 3.80 | 14.3 | 1.27 | 4.80 |
| 2.5 | 1 | 1 | 12 | 0 | 1.50 | 7.1 | 0.75 | 2.50 |
| 3.0 | 1 | 1 | 12 | 0 | 2.00 | 7.1 | 1.00 | 3.00 |
| 3.3-5.0 | 0 | 1 | 13 | 0 | -1.00 | 0.0 | -1.00 | 0.00 |

#### BE = no-be

| TP | wins | losses | beOut | excluded | cumR | WR% | EV | PF |
|---|---|---|---|---|---|---|---|---|
| 0.5 | 12 | 2 | 0 | 0 | 4.00 | 85.7 | 0.29 | 3.00 |
| 1.0 | 11 | 3 | 0 | 0 | 8.00 | 78.6 | 0.57 | 3.67 |
| 1.5 | 11 | 3 | 0 | 0 | 13.50 | 78.6 | 0.96 | 5.50 |
| 2.0 | 8 | 6 | 0 | 0 | 10.00 | 57.1 | 0.71 | 2.67 |
| 2.4 | 8 | 6 | 0 | 0 | 13.20 | 57.1 | 0.94 | 3.20 |
| 2.5 | 6 | 6 | 2 | 0 | 9.00 | 42.9 | 0.75 | 2.50 |
| 3.0 | 4 | 7 | 3 | 0 | 5.00 | 28.6 | 0.45 | 1.71 |
| 3.3 | 2 | 8 | 4 | 0 | -1.40 | 14.3 | -0.14 | 0.82 |

#### BE = flipping-be

| TP | wins | losses | beOut | excluded | cumR | WR% | EV | PF |
|---|---|---|---|---|---|---|---|---|
| 0.5 | 12 | 1 | 0 | 1 | 5.00 | 85.7 | 0.38 | 6.00 |
| 1.0 | 11 | 1 | 1 | 1 | 10.00 | 78.6 | 0.83 | 11.00 |
| 1.5 | 11 | 1 | 1 | 1 | 15.50 | 78.6 | 1.29 | 16.50 |
| 2.0 | 8 | 3 | 2 | 1 | 13.00 | 57.1 | 1.18 | 5.33 |
| 2.4 | 8 | 3 | 2 | 1 | 16.20 | 57.1 | 1.47 | 6.40 |
| 2.5 | 5 | 3 | 5 | 1 | 9.50 | 35.7 | 1.19 | 4.17 |

**Observation** : `excluded=1` apparaît UNIQUEMENT en flipping-be parce que `BETP-no-rrMax` (rrMax=null, r=0) tombe dans la branche `pure-tp-no-sl` qui retourne `excluded` quand rMax est null. En no-be / be-fallback, le même trade va dans une branche différente qui le compte comme beOut ou loss.

### 3.6 Cache invalidation

Trade `BESL-2R-high` (outcome=BE-SL, rrMax=2.8, beManagement=['2RR'], r=-1) en mode Fixed :

```
État initial (BE=be-fallback) :
  effectiveR = 0   (BE-aware: BE-SL → 0R)
  class      = be
  hash       = fixed|be:be-fallback

Switch BE → no-be (sans clear manuel) :
  _enrichTradeClassification([t], cfg) detect hash mismatch → recompute
  effectiveR = 2.4  (no-be BE-SL: rrMax=2.8 ≥ 2.4 → +2.4R)
  class      = win
  hash       = fixed|be:no-be
```

**Résultat** : le hash mute (`be-fallback` → `no-be`), la reclassification est effective (`be` → `win`), aucun stale cache.

### 3.7 Multi-chip BE parsing

```
['BE si set à 1RR', 'BE si set à 2RR']  → MAX = 2  ✓
['BE si set à 2RR', 'BE si set à 1RR']  → MAX = 2  ✓ (ordre indifférent)
[]                                       → null
null                                     → null
undefined                                → null
['BE rule that does not parse']          → null
['BE 1RR', 42, null, 'BE 3R']            → 3 (les types non-string sont skip)
```

### 3.8 Personalised partials sum invariant

```
config.personalised.partials = { tp1: 70, tp2: 70, tp3: 0 }  // sum = 140
trade = { outcome: 'TP', r: 5, rrMax: 5 }
computeEffectiveRR(t, cfg) → 5  (fallback to trade.r ✓)
```

### 3.9 _hashTpConfig stability

```
cfgA = { mode:'personalised', perso: {tp1:1, tp2:2.4, tp3:3, partials:50/50/0} }
cfgB = identique à cfgA mais nouvel objet
cfgC = comme cfgA mais tp2=2.5 au lieu de 2.4

hash(A) = "personalised:2:1/2.4/3:50/50/0|be:be-fallback"
hash(B) = "personalised:2:1/2.4/3:50/50/0|be:be-fallback"  → A == B ✓
hash(C) = "personalised:2:1/2.5/3:50/50/0|be:be-fallback"  → A != C ✓

Switch BE → no-be :
hash(A) = "personalised:2:1/2.4/3:50/50/0|be:no-be"  → différent de avant ✓
```

---

## 4. Risques de divergence inter-widgets (synthèse de la cartographie agent #3)

| Risque | Sévérité | Description |
|---|---|---|
| Trade Log sort par `trade.r` brut, colonne affichée par `effectiveR` | **MOYEN** | UX : tri ne correspond pas à la valeur affichée (`dashboard.js:8720` vs `8783`). Surtout visible en Personalised mode. |
| Donut legend (outcome-pure cnt_tp/cnt_sl) vs centre WR (effectiveR-based w/n) | LOW | Documenté dans calcStats:5278-5282. Mismatch possible mais "by design". |
| ORR widget vs Sticky bar : "même" KPI mais différentes sémantiques | LOW | ORR = counterfactual à TP fixe ; Sticky = mode actif réalisé. À ne PAS confondre. |
| PO Reach Reintegration vs Sticky strict dataset | LOW | PO peut afficher 150% reach si chips BE réintégrés. Documenté. |
| Partial Planner widget (`simulateCustomPartialsPlan`) IGNORE le mode BE | **À VÉRIFIER** | `dashboard.js:14260` n'appelle pas `_poSimTradeBeAware`. Le widget est-il encore actif en UI ? Si oui → bug réel (résultats incoherents avec PO/Personalised). |

---

## 5. Reproduction

```bash
cd "/c/Users/maxim/OneDrive/Bureau/Claude Code"
node audit/test_runner.js > audit/test_output.txt 2>&1
node audit/test_runner_extra.js > audit/test_extra_output.txt 2>&1
```

Sortie attendue :
```
SUMMARY : 126 cells tested · 0 gap(s) vs expected
cross-TP divergences > 0.01 : 39 cases
```

Si un futur refactor casse l'invariant 0 gaps, l'output `gaps detail` listera la cellule fautive (trade.id × tp × be × expected × observed).

---

## 6. Annexes — extraits code clés (référence)

### 6.1 `computeEffectiveRR` switch principal (`dashboard.js:1743-1885`)

```javascript
function computeEffectiveRR(trade, tpConfig) {
  if (trade && trade._simulated) return trade.r;
  const mode = tpConfig && tpConfig.mode;
  switch (mode) {
    case 'fixed': /* BE-* delegate to _resolveBeRFixed ; else trade.r */ break;
    case 'multi': /* TP weighted, SL passthrough, BE-* delegate to _resolveBeRMulti */ break;
    case 'personalised': /* TP/SL via _ppSimTrade, BE-* via _resolveBeR */ break;
    default: return trade.r;
  }
}
```

### 6.2 `_resolveBeR` core (`dashboard.js:16387-16414`)

```javascript
function _resolveBeR(trade, partials, reachR) {
  const d = _resolveBEDecision(trade);
  if (d.applyBEAware) {
    let r = 0;
    for (const { pct, lv } of partials) if (lv <= d.triggerR) r += pct * lv;
    return r;
  }
  if (d.fallbackToNoBE) {
    if (d.fallbackVariant === 'pure-tp-no-sl' && trade.outcome === 'BE-TP') {
      let r = 0;
      for (const { pct, lv } of partials) if (reachR >= lv) r += pct * lv;
      return r;
    }
    return _ppSimTrade(reachR, partials);  // ← SL fallback fires here for no-be BE-TP rrMax<TP1
  }
  return 0;
}
```

### 6.3 `_resolveBEDecision` (`dashboard.js:16351-16384`)

```javascript
function _resolveBEDecision(trade) {
  const mode = _activeBeMode();
  if (mode === 'no-be') {
    return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-with-sl' };
    // ⚠ Incohérence #2 : BE-TP devrait peut-être avoir 'pure-tp-no-sl' ici aussi
  }
  if (mode === 'flipping-be') {
    if (trade.outcome === 'BE-TP') {
      return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-no-sl' };
    }
    const reach = _getTradeReachR(trade);
    if (Number.isFinite(reach) && reach >= _FLIPPING_BE_R) {
      return { applyBEAware: true, triggerR: _FLIPPING_BE_R, fallbackToNoBE: false };
    }
    return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-with-sl' };
  }
  // be-fallback
  const trigger = _parseBeTriggerR(trade.beManagement);
  if (trigger === null) return { applyBEAware: false, triggerR: null, fallbackToNoBE: false };
  return { applyBEAware: true, triggerR: trigger, fallbackToNoBE: false };
}
```

### 6.4 `_resolveBeRFixed` null-chip path (`dashboard.js:16466-16467`)

```javascript
// be-fallback null chip → passthrough (matches pre-feature behavior).
return trade.r;  // ⚠ Incohérence #1 : Multi/Personalised retournent 0 ici, pas trade.r
```
