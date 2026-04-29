# AUDIT — Moteur de calcul Flipping Market Dashboard

**Date** : 2026-04-28
**Périmètre** : `dashboard.js` (28 562 lignes), audit du moteur effectiveR sur les 9 combinaisons (3 modes TP × 3 modes BE) × 4 outcomes (TP / SL / BE-TP / BE-SL), inter-widget convergence, edge cases.
**Backup** : `dashboard.js.backup-pre-audit-2026-04-28`
**Aucune modification de code en production.**
**Détails complets** : [`AUDIT_DETAILS.md`](AUDIT_DETAILS.md)

---

## 1. TL;DR

| Catégorie | Verdict |
|---|---|
| **Calculs unitaires** (effectiveR par cellule) | ✅ **126/126 cellules** : observé = attendu (calculs manuels) |
| **PO ↔ Personalised** (Total R, 3 plans × 3 BE modes) | ✅ Convergence parfaite (Δ=0 partout) |
| **ORR ↔ Σ_getSimulatedR** (mirror function rule) | ✅ Convergence parfaite (Δ=0 sur les 3 BE modes) |
| **Cache invalidation** (`_hashTpConfig` sur switch BE) | ✅ Hash mute correctement, reclassification effective |
| **`_parseBeTriggerR`** multi-chip MAX, empty/null/malformed | ✅ Comportement correct |
| **Wiring UI** (`#tpm-be-list` `change` event, pas `data-action`) | ✅ Conforme |
| **Hashes incluent `\|be:<mode>`** (`_hashTpConfig`, `_poTradesHash`) | ✅ Conforme |
| **Doctrine vs implémentation** | ⚠ **2 asymétries** documentées ci-dessous |
| **Cohérence inter-modes TP** | ⚠ **1 inconsistance Fixed vs Multi/Perso** sur empty chip |

**Verdict global** : le moteur de calcul est **structurellement sain** — toutes les invariants déclarées dans CLAUDE.md tiennent, et la mirror function rule (PO ↔ Personalised, ORR ↔ _getSimulatedR) est respectée numériquement à la rounding près. Les 3 incohérences trouvées sont des **questions de doctrine** (asymétries entre BE modes ou TP modes) plutôt que des erreurs de calcul à proprement parler. Aucune n'est bloquante.

---

## 2. Méthodologie

### Phase 1 — Cartographie statique
3 sous-agents Explore en parallèle ont mappé : (a) fonctions de calcul/classification, (b) state/toggles/persistence des modes, (c) widgets consommateurs. Vérification croisée par lecture directe des plages critiques (`dashboard.js:1613-1985`, `5195-5289`, `10918-11030`, `13670-13810`, `14230-14260`, `16290-16500`).

### Phase 2 — Tests synthétiques
Dataset de **14 trades** couvrant TP propre, SL propre, 5 variantes BE-TP, 5 variantes BE-SL, 2 edge cases (rrMax=null, beManagement=[]).
Calculs manuels par cellule (14 trades × 9 combos = **126 cellules**), comparés au résultat de `computeEffectiveRR` extrait verbatim depuis `dashboard.js`.

### Phase 3 — Convergence inter-widget
- PO Full Plan ↔ Personalised Total R sur 3 plans (1-leg, 2-leg, 3-leg) × 3 BE modes = 9 cellules.
- ORR cumR @ TP=2.4R ↔ Σ `_getSimulatedR(t)` sur les 3 BE modes.
- Multi vs PO breakdown par trade pour identifier l'origine des Δ structurels.

### Phase 4 — Edge cases
Cache invalidation, multi-chip BE parsing, empty/null beManagement, partials sum invalide, hash stability.

### Outils
- `audit/calc_engine.js` : extrait verbatim des fonctions critiques (avec stubs pour `appState`/`_orrSimMode`).
- `audit/test_dataset.js`, `test_runner.js`, `test_runner_extra.js` : suite de tests Node.
- Sortie complète : `audit/test_output.txt`, `audit/test_extra_output.txt`.

---

## 3. Cartographie du moteur (synthèse)

```
                          appState.ui.beMode  ──┐
                          appState.ui.tpConfig──┤
                                                │
filterDataset (4858) ──→  _enrichTradeClassification (1903) ──→ computeEffectiveRR (1743)
                                                                    │
                                              ┌─────────────────────┼─────────────────────┐
                                              ▼                     ▼                     ▼
                                        case 'fixed'          case 'multi'          case 'personalised'
                                              │                     │                     │
                                       [TP/SL: trade.r]      [TP: weighted     [TP/SL: _ppSimTrade(reach, partials)]
                                       [BE-*: _resolve         tpN_rr]         [BE-*: _resolveBeR(t, partials, reach)]
                                              BeRFixed]      [SL: trade.r]               │
                                              │              [BE-*: _resolveBeRMulti]    │
                                              ▼                     │                     ▼
                                  ┌───────────────────────────────────────────────────────────────────┐
                                  │           _resolveBEDecision (16351) — single source              │
                                  │           [be-fallback / no-be / flipping-be]                      │
                                  └───────────────────────────────────────────────────────────────────┘
                                              │                     │                     │
                                  _resolveBeRFixed (16448)   _resolveBeRMulti (16417)   _resolveBeR (16387)
                                                                                              │
                                                                                       _ppSimTrade (14244)
                                                                                       (BE-SL fallback)

calcStats (5195) ─→ isWinner/isLoser/isBE (1657-1671) ─→ computeEffectiveRR (cached via _hashTpConfig 1630)

ORR widget : computeOptimalRR (10918) ──→ _resolveBEDecision + _resolveBeR + _ppSimTrade
ORR drilldown : _getSimulatedR (13716) ──→ idem (mirror function)

Partial Optimizer : _poSimulateModel (16722) ──→ _poSimTradeBeAware (16486) ──→ _resolveBeR + _ppSimTrade
Partial Planner : simulateCustomPartialsPlan (14260) ──→ _ppSimTrade direct (PAS de BE-aware)
```

**Observations clés** :
- **`_resolveBEDecision` est l'unique source de vérité** pour la politique BE. Tous les `_resolveBe*` la consultent. Bonne architecture.
- **3 résolveurs par shape** (`_resolveBeR`, `_resolveBeRMulti`, `_resolveBeRFixed`) — le code est bien factorisé par mode TP.
- **Le Partial Planner simulator (`_ppSimTrade`)** est utilisé en deux contextes différents : (a) directement par `simulateCustomPartialsPlan` (legacy, sans BE-aware), (b) routé par `_resolveBeR` / `_poSimTradeBeAware` (avec BE-aware). Pas d'incohérence intrinsèque mais à connaître.
- **Le hash de cache** (`_hashTpConfig`) inclut bien `|be:<mode>` (`dashboard.js:1635`) et `_poTradesHash` aussi (`dashboard.js:17009`).

Voir [`AUDIT_DETAILS.md §1`](AUDIT_DETAILS.md#1-cartographie-d%C3%A9taill%C3%A9e) pour le tableau exhaustif des fonctions, signatures, line numbers et call graph.

---

## 4. Matrice de comportement attendu (synthèse)

Pour le plan canonique **Personalised = 50% @ TP1=1R + 50% @ TP2=2.4R**, **Multi = tpCount=2 partials 50/50** :

| Outcome / scénario | Fixed × BF | Fixed × NB | Fixed × FB | Multi × BF | Multi × NB | Multi × FB | Perso × BF | Perso × NB | Perso × FB |
|---|---|---|---|---|---|---|---|---|---|
| TP rrMax=3.1, tp_N=1/2.4 | +2.4 | +2.4 | +2.4 | +1.7 | +1.7 | +1.7 | +1.7 | +1.7 | +1.7 |
| SL rrMax=0.4 | -1 | -1 | -1 | -1 | -1 | -1 | -1 | -1 | -1 |
| BE-TP rrMax=1.5, chip=1RR, tp_N=1 | 0 | 0 | 0 | +0.5 | +0.5 | +0.5 | +0.5 | +0.5 | +0.5 |
| BE-TP rrMax=3.5, chip=[1RR,2RR], tp_N=1/2 | 0 | 0 | 0 | +1.5 | +1.5 | +1.5 | **+0.5** | **+1.7** | **+1.7** |
| BE-SL rrMax=2.8, chip=2RR, tp_N=1/2 | **0** | **+2.4** | **0** | **+1.5** | **-1** | **+1.5** | **+0.5** | **+1.7** | **+1.7** |
| BE-SL rrMax=1.7, chip=[] (empty) | **-1** | -1 | -1 | **0** | -1 | -1 | **0** | +0.5 | +0.5 |
| BE-SL rrMax=1.5, chip=1RR (bucket) | 0 | -1 | -1 | +0.5 | -1 | -1 | +0.5 | +0.5 | +0.5 |
| BE-TP rrMax=0.6 (<TP1=1), chip=0.5RR | 0 | 0 | 0 | +0.25 | +0.25 | +0.25 | 0 | **-1** | **0** |
| BE-TP rrMax=null, chip=1RR | 0 | 0 | 0 | +0.5 | +0.5 | +0.5 | +0.5 | **-1** | 0 |

**Légende** : BF = be-fallback, NB = no-be, FB = flipping-be. Les valeurs en **gras** illustrent les divergences inter-modes notables analysées en §6.
Matrice complète des 14 trades : [`AUDIT_DETAILS.md §2`](AUDIT_DETAILS.md#2-matrice-compl%C3%A8te-126-cellules).

---

## 5. Résultats des tests (synthèse)

```
Cells tested        : 126   ·  Gaps observed=expected : 0  ✓

PO ↔ Personalised convergence (3 plans × 3 BE modes = 9 cells) :
  Plan 2R 100%          : Δ=0 sur be-fallback / no-be / flipping-be  ✓
  Plan 1R/2.4R 50/50    : Δ=0 sur be-fallback / no-be / flipping-be  ✓
  Plan 1R/2R/3R 33/33/34: Δ=0 sur be-fallback / no-be / flipping-be  ✓

ORR cumR ↔ Σ _getSimulatedR (à TP=2.4R, ORR be-fallback) :
  be-fallback : ORR=3.8   sim=3.8   Δ=0  ✓
  no-be       : ORR=13.2  sim=13.2  Δ=0  ✓
  flipping-be : ORR=16.2  sim=16.2  Δ=0  ✓

Cache invalidation (Fixed mode, BESL-2R-high, switch BF→NB) :
  hash before : fixed|be:be-fallback   class=be   effectiveR=0
  hash after  : fixed|be:no-be         class=win  effectiveR=2.4   ✓ recomputed
```

calcStats récap (n=14) :

| TP-mode | BE-mode | n | w | l | be | WR%  | totalR | PF    | maxDD |
|---|---|---|---|---|---|---|---|---|---|
| fixed        | be-fallback | 14 | 2  | 2 | 10 | 14.3 | +2.80  | 2.40  | -2.00 |
| fixed        | no-be       | 14 | 4  | 3 | 7  | 28.6 | +6.60  | 3.20  | -1.00 |
| fixed        | flipping-be | 14 | 2  | 3 | 9  | 14.3 | +1.80  | 1.60  | -2.00 |
| multi        | be-fallback | 14 | 12 | 1 | 1  | 85.7 | +11.15 | 12.15 | -1.00 |
| multi        | no-be       | 14 | 9  | 5 | 0  | 64.3 | +5.15  | 2.03  | -2.00 |
| multi        | flipping-be | 14 | 11 | 3 | 0  | 78.6 | +10.15 | 4.38  | -1.00 |
| personalised | be-fallback | 14 | 11 | 1 | 2  | 78.6 | +6.90  | 7.90  | -1.00 |
| personalised | no-be       | 14 | 11 | 3 | 0  | 78.6 | +12.10 | 5.03  | -2.00 |
| personalised | flipping-be | 14 | 11 | 1 | 2  | 78.6 | +14.10 | 15.10 | -1.00 |

> **Lecture** : sur ce dataset volontairement chargé en BE-* (10/14 trades), le Total R varie de +1.80R (Fixed × flipping-be) à +14.10R (Personalised × flipping-be) — **8x d'écart** selon la combinaison. C'est NORMAL : chaque combo encode une politique différente. Le point d'attention est que **Multi × be-fallback affiche WR=85.7% / PF=12.15** alors qu'à côté Multi × no-be affiche WR=64.3% / PF=2.03 — le user doit comprendre que ces différences sont attendues (BE-aware capping vs no-be passthrough).

---

## 6. Incohérences détectées (CŒUR DU RAPPORT)

> **Important** : aucune des trois trouvailles ci-dessous n'est un bug de calcul à proprement parler. Les calculs sont conformes à ce que le code dit. Ce sont des **questions de doctrine** : le code et CLAUDE.md sont en désaccord (ou ambigus), ce qui peut surprendre un user.

---

### Incohérence #1 — Empty BE chip en be-fallback : Fixed vs Multi/Personalised divergent
**Sévérité** : **MEDIUM** (UX confusion, totaux divergents inter-modes).
**Lieu** : `_resolveBeRFixed` (`dashboard.js:16448-16468`) vs `_resolveBeR` (`dashboard.js:16387-16414`) vs `_resolveBeRMulti` (`dashboard.js:16417-16442`).

**Symptôme** : pour un trade BE-SL avec `beManagement=[]` (chip vide) en `be-fallback` mode :
- Fixed → `trade.r` (passthrough, donc -1R chez Max)
- Multi → 0R (return 0 final, ligne 16441)
- Personalised → 0R (return 0 final, ligne 16413)

Pour un trade BE-SL chez Max avec convention `r=-1`, Fixed donne **-1R** et Multi/Personalised donnent **0R**. **Δ=1R par trade**.

**Cause racine** : `_resolveBEDecision` (16351-16384) en `be-fallback` avec `_parseBeTriggerR(beManagement)===null` retourne `{applyBEAware:false, fallbackToNoBE:false}`. Les trois résolveurs interprètent ce "rien à faire" différemment :
```javascript
// _resolveBeR (16387)        : return 0;          // BE neutre 0R
// _resolveBeRMulti (16417)   : return 0;          // idem
// _resolveBeRFixed (16448)   : return trade.r;    // passthrough
```
Le commentaire ligne 16466-16467 dit "matches pre-feature behavior" — le passthrough est une compatibilité legacy. Mais Multi prédate aussi la feature (`_resolveBeRMulti` n'est PAS fixed-only).

**Impact** :
- Sticky Bar / KPIs : Total R, WR, PF différents pour le même dataset selon le mode TP actif (gap visible).
- Donut center WR (utilise `isWinner` → `effectiveR`) : varie selon le mode.
- Donut legend (compte `outcome` brut) : inchangée → divergence visuelle entre légende et centre (déjà documentée comme "by design" mais amplifiée par ce bug).
- Calendar / heatmaps : tous les widgets respectant `tpConfig` se bougent.

**Trades concernés** (sur ce dataset) : `BESL-empty-chip` (1 trade sur 14). Sur le dataset prod 628 trades de Max, à quantifier — probablement marginal.

**Fix proposé (option A — alignement sur Fixed)** : changer Multi et Personalised pour `return trade.r` au null-chip path :
```javascript
// _resolveBeR ligne 16413
return trade.r;  // au lieu de "return 0;"
// _resolveBeRMulti ligne 16441
return trade.r;  // au lieu de "return 0;"
```
Avantage : cohérent inter-modes, comportement legacy préservé. Inconvénient : un BE-SL r=-1 + chip vide compte comme une vraie loss (pénalise le user qui n'a pas tagué le chip).

**Fix proposé (option B — alignement sur Multi/Personalised)** : changer Fixed pour `return 0` au null-chip path :
```javascript
// _resolveBeRFixed ligne 16466-16467
return 0;  // BE neutre, comme Multi/Personalised
```
Avantage : "pas de chip → pas d'opinion → 0R neutre" est défendable doctrinalement. Inconvénient : casse la compat legacy explicite.

**Recommandation** : option B + warning console "trade en BE-* sans chip parseable, traité comme 0R neutre" (le warning existe déjà dans `computeEffectiveRR` personnalisé via `_warnComputeRROnce` ligne 1877, à étendre à Fixed + Multi).

---

### Incohérence #2 — `Personalised × no-be × BE-TP` avec `reachR < TP1` retourne -1R
**Sévérité** : **MEDIUM** (contredit la doctrine "BE-TP can never be a real LOSS" mais se conforme à la lettre "no-be: BE-TP runs the plan as a pure TP").
**Lieu** : `_resolveBeR` (`dashboard.js:16396-16412`), branch `fallbackToNoBE`.

**Symptôme** : un trade BE-TP avec `rrMax=0.6` (inférieur à TP1=1) en mode `Personalised × no-be` retourne **-1R**. Le même trade en `Personalised × flipping-be` retourne **0R**. Et en `Personalised × be-fallback` retourne **0R** (legs cap au trigger).

```
BETP-rrMax=0.6 (<TP1=1)   : be-fallback=0.00  no-be=-1.00  flipping-be=0.00
BETP-rrMax=null            : be-fallback=0.50  no-be=-1.00  flipping-be=0.00
BETP-rrMax=0.99            : be-fallback=0.00  no-be=-1.00  flipping-be=0.00
BETP-rrMax=2.0             : be-fallback=0.50  no-be=0.50   flipping-be=0.50  (≥TP1, OK)
```

**Cause racine** : `_resolveBEDecision` (16356) renvoie pour `no-be` BE-TP :
```javascript
return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-with-sl' };
```
Le variant `pure-tp-with-sl` (au lieu de `pure-tp-no-sl`) fait que `_resolveBeR` (16411) tombe sur `return _ppSimTrade(reachR, partials)`. Et `_ppSimTrade` (14247) a la règle `if (rrMax < tp1) return -1` — la SL fallback sur le pur. Résultat : un BE-TP qui n'a pas réussi à atteindre TP1 du plan se classe en LOSS.

**Doctrine en conflit** : CLAUDE.md affirme dans la section "Flipping BE — exact semantic per outcome × surface" que :
> 1. **BE-TP** can never classify as a real LOSS — it reached its journaled TP, so the worst counterfactual is BE-out (0R / KPI BE Trades).

C'est cette règle que `pure-tp-no-sl` enforce dans flipping-be. Mais en `no-be`, la règle ne s'applique pas — un BE-TP peut redevenir LOSS si le user a un plan avec TP1 > rrMax.

**Note** : strictement interprétée, la phrase "no-be: BE-TP runs the plan as a pure TP" autorise la SL fallback (un pur TP qui ne touche pas TP1 est -1R). C'est donc consistent avec la **lettre** mais pas avec **l'esprit** de "BE-TP can never lose".

**Impact** :
- Personalised × no-be : tout BE-TP avec `rrMax < TP1` devient une perte. Pour un Personalised plan avec TP1=2R (par exemple), tous les BE-TP qui n'ont pas atteint 2R sont -1R (alors qu'en flipping-be ils seraient 0R, et en be-fallback ils seraient 0R / leg credit).
- ORR widget : `computeOptimalRR` (10984) BE-TP default path appelle `_resolveBeR(t, [{lv:tp, pct:1}], reach)` — pour `no-be` BE-TP, lv=tp ≤ trigger? Trigger=null donc applyBEAware=false → fallbackToNoBE → pure-tp-with-sl → `_ppSimTrade(reach, [{lv:tp,pct:1}])` → si reach<tp → -1R. Idem en ORR.

**Trades concernés** (sur ce dataset) : `BETP-rrMax-below-TP1` (rrMax=0.6) et `BETP-no-rrMax` (reachR=0). Sur prod : tous les BE-TP avec rrMax inférieur au plan TP1 personnalisé du user.

**Fix proposé (option A — étendre `pure-tp-no-sl` à no-be)** :
```javascript
// _resolveBEDecision ligne 16356 (no-be branch) :
if (mode === 'no-be') {
  // Apply pure-tp-no-sl to BE-TP for symmetry with flipping-be (CLAUDE.md doctrine
  // "BE-TP can never classify as a real LOSS" applies regardless of BE mode).
  if (trade.outcome === 'BE-TP') {
    return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-no-sl' };
  }
  return { applyBEAware: false, triggerR: null, fallbackToNoBE: true, fallbackVariant: 'pure-tp-with-sl' };
}
```
Avantage : aligne `no-be` BE-TP sur `flipping-be` BE-TP (doctrine "BE-TP can never lose" enforced uniformément). Convergence ORR ↔ sticky inchangée (ORR utilise déjà la même fonction `_resolveBeR`). Inconvénient : aucun pour la doctrine, mais à valider côté Multi mode (voir ci-dessous).

**Fix proposé (option B — documenter explicitement)** : ajouter un commentaire dans `_resolveBEDecision` ou CLAUDE.md précisant que la doctrine "BE-TP can never lose" s'applique uniquement à `flipping-be`, et que `no-be` autorise un BE-TP à être classé LOSS si le plan personnalisé a un TP1 > rrMax. Pas de changement de code.

**Recommandation** : option A (cohérence doctrinale forte) + ajustement Multi mode pour BE-TP no-be (voir §7 question ouverte #2 ci-dessous). Tests à re-runner après pour vérifier la convergence reste à 0R.

**Note importante** : Multi mode présente la MÊME asymétrie : `_resolveBeRMulti` (16434-16439) en `no-be` BE-TP fait un `weighted sum sans cap` mais retourne **0** (pas -1) si aucun `tp_N_rr` rempli. Le passage par 0R au lieu de -1R en Multi est INCOHERENT avec Personalised qui passe par -1R via `_ppSimTrade`. Si vous adoptez option A, l'incohérence Multi vs Personalised se résout naturellement (les deux retournent 0R sur BE-TP sans données).

---

### Incohérence #3 — `Multi × no-be × BE-SL` retourne `trade.r` (passthrough), Personalised retourne le counterfactuel
**Sévérité** : **LOW** (documenté explicitement dans CLAUDE.md comme "by design" mais crée des Δ visibles inter-modes).
**Lieu** : `_resolveBeRMulti` (`dashboard.js:16432`), branche fallbackToNoBE BE-SL.

**Symptôme** : pour `BESL-2R-high` (rrMax=2.8, tp_N_rr=1/2, beManagement=['2RR'], r=-1) :
- Multi × no-be → -1R (`trade.r` passthrough)
- Personalised × no-be → +1.7R (`_ppSimTrade(2.8, [{1,0.5},{2.4,0.5}])`)
- Fixed × no-be → +2.4R (binary `rrMax≥2.4 → +2.4R`)

Trois valeurs différentes pour le même trade. **Δ=3.4R entre Fixed et Multi**.

**Cause racine** : la doctrine CLAUDE.md (§ "Per-shape resolvers") dit explicitement :
> `_resolveBeRMulti` no-be BE-SL : `return trade.r` (passthrough — matches SL pur convention in Multi).
> `_resolveBeRFixed` no-be BE-SL : `rrMax ≥ _SYSTEM_TP_R → +2.4R, else -1` (binary, no plan to simulate).
> `_resolveBeR` no-be BE-SL : `_ppSimTrade(reachR, partials)` (standard SL pur with rrMax<TP1 → -1R fallback).

Trois politiques distinctes pour le même outcome × BE mode, par mode TP. C'est **structurel**, par design.

**Impact** :
- Switch utilisateur Multi → Personalised déplace les BE-SL d'un tas (passthrough) à un autre (counterfactuel) → Total R bouge significativement.
- Pour `BESL-boundary` (rrMax=2.4, tp_N=1/2) : Multi=-1R, Personalised=+1.7R. Le user qui voit "Total R personalisé > Total R multi" sur un dataset chargé en BE-SL avec rrMax élevés peut être surpris.

**Fix proposé** : aucun, par design. À documenter clairement dans la UI (un tooltip "?" sur le sélecteur BE Management qui explique les conventions par mode TP serait utile).

---

## 7. Zones de doute / questions ouvertes pour Max

### Q1. La doctrine "BE-TP can never classify as a real LOSS" est-elle universelle ou limitée à `flipping-be` ?
- Si **universelle** : option A de l'incohérence #2 à appliquer (étendre `pure-tp-no-sl` à no-be). Cohérence doctrinale renforcée.
- Si **limitée à flipping-be** : documenter explicitement dans CLAUDE.md que `no-be` Personalised peut classer un BE-TP en LOSS si rrMax<TP1. Pas de changement de code.

### Q2. Empty BE chip : qu'est-ce qu'un trade en BE-* sans chip doit produire ?
- Option A : passthrough `trade.r` (comportement Fixed actuel — ce que Max obtient pour la plupart : -1R chez Max BE-SL convention).
- Option B : 0R neutre (comportement Multi/Personalised actuel — "pas de chip → pas d'opinion").
- Option C : warning + exclure du dataset (force le user à fixer le journal).

Actuellement le code mélange A et B selon le mode TP — à uniformiser.

### Q3. ORR `strict-loss` mode : est-ce que la règle "skip r<0 priority" sur BE-SL fallback est volontaire ?
Le code (`_getSimulatedR` lignes 13738-13748 et `computeOptimalRR` lignes 10961-10981) skippe explicitement la priorité `r<0` pour les BE-SL sous fallbackToNoBE, pour permettre au bucket `[TP1, tp)` de fire au lieu de lumper tout en LOSS. Sur ce dataset, l'effet est nul (aucun trade dans la zone), mais sur prod le user pourrait voir des BE-SL avec rrMax in [2.4, 3) être classés "BE-out" en strict-loss au lieu de LOSS. **À vérifier que c'est l'intention** — la formulation CLAUDE.md (§ "Mirror function rule") semble dire oui mais c'est subtil.

### Q4. Multi mode `no-be` BE-TP : `return 0` au lieu de `-1` est-ce voulu ?
`_resolveBeRMulti` ligne 16439 : `return anyHit ? rr : 0;` — un BE-TP `no-be` sans aucun `tp_N_rr` rempli retourne **0R**, pas -1R. C'est inconsistent avec Personalised mode (qui retourne -1R via `_ppSimTrade`). Si la réponse à Q1 est "doctrine universelle", ce comportement Multi est juste — sinon c'est un mini-bug.

### Q5. Trade Log : la colonne "R" affichée (`computeEffectiveRR`) est triée par `trade.r` brut (`dashboard.js:8720`) — est-ce voulu ?
UX fragile : l'utilisateur peut trier par R, voir un ordre qui ne reflète pas la colonne affichée (en particulier en mode Personalised où le R effectif diverge fortement du R brut). À discuter — soit changer le tri pour utiliser `effectiveR`, soit afficher deux colonnes ("R Notion" / "R effectif").

---

## 8. Recommandations de refactor (au-delà des bugs)

### R1. Factoriser le null-chip handling
Les trois résolveurs ont des comportements divergents au null-chip (incohérence #1). Une fois la doctrine fixée (option A ou B), ajouter un helper `_nullChipFallback(trade, tpMode)` ou injecter le comportement dans `_resolveBEDecision` (qui retournerait alors `fallbackVariant: 'null-chip-passthrough'` ou `'null-chip-zero'`).

### R2. Renommer `pure-tp-no-sl` / `pure-tp-with-sl`
Les noms sont opaques — le `with-sl` signifie "applique la SL fallback de `_ppSimTrade` si reachR<TP1" et le `no-sl` signifie "floor à 0R sans SL fallback". Suggérer : `'be-tp-floor-0'` vs `'be-tp-with-sl-fallback'`.

### R3. Trade Log dual-column R
Si la colonne "R" affiche `effectiveR` en mode Multi/Personalised, ajouter une colonne distincte "R Notion" qui affiche `trade.r` brut. Tri sur la colonne effective. Eviterait la confusion documentée en Q5.

### R4. Couverture de tests automatisée
Le fichier `audit/test_runner.js` peut servir de base à un test harness CI : vérifier que les 126 cellules (TP × BE × outcome) ne dérivent pas après refactor. Les invariants PO ↔ Personalised et ORR ↔ _getSimulatedR sont des sentinelles parfaites.

### R5. Diagramme dans CLAUDE.md
Ajouter le diagramme du §3 ci-dessus à CLAUDE.md (section "BE Management modes") — il manque actuellement et le code est devenu complexe à mapper mentalement.

### R6. Code mort potentiel : `simulateCustomPartialsPlan` (`dashboard.js:14260`)
Cette fonction est appelée par le Partial Planner widget (legacy ?) et NE passe PAS par `_poSimTradeBeAware` — elle utilise `_ppSimTrade` directement. Donc le Partial Planner widget IGNORE le mode BE actif. À vérifier si le widget est encore visible en UI (CLAUDE.md mentionne "Phase 2 - widget gallery" comme TODO ; le widget Partial Planner est-il abandonné au profit du Partial Optimizer ?). Si oui, retirer `simulateCustomPartialsPlan`.

### R7. Logging des warnings
`_warnComputeRROnce` (1704) écrit dans `console.warn` mais n'est pas exposé en UI. Pour aider Max à débuger ses propres datasets, exposer un panneau "Diagnostics" qui liste les trades qui ont déclenché un warning (BE chip non-parseable, partials sum invalide, etc.).

---

## 9. Synthèse pour le débrief avec Claude Chat

**À retenir** :
1. **Le moteur de calcul est correct** au sens strict : 126/126 cellules conformes aux calculs manuels, toutes les invariants déclarés (cache, hash, mirror function, PO↔Perso convergence) tiennent.
2. **3 incohérences trouvées**, toutes des **questions de doctrine** plutôt que des bugs. Elles méritent une décision Max sur la sémantique attendue.
3. **5 questions ouvertes** dans §7 attendent un arbitrage produit.
4. **7 recommandations de refactor** (§8), toutes optionnelles et non bloquantes.

**Ce qui manque dans cet audit** (à confirmer côté UI live, pas couvert ici) :
- Tests interactifs sur le browser preview (changement de mode TP/BE dans la UI réelle, vérification que les widgets se redessinent).
- Validation sur le dataset prod 628 trades de Max — quantifier l'impact réel des incohérences (combien de trades par catégorie).
- Test du Partial Planner widget vs Partial Optimizer pour confirmer/infirmer R6.

---

**Fichiers générés** :
- `audit/AUDIT_REPORT.md` — ce fichier (synthèse + bugs).
- `audit/AUDIT_DETAILS.md` — matrices complètes, tests détaillés, line numbers exhaustifs.
- `audit/calc_engine.js` — extrait verbatim du moteur (Node-runnable).
- `audit/test_dataset.js` — 14 trades synthétiques.
- `audit/test_runner.js` + `test_runner_extra.js` — suite de tests.
- `audit/test_output.txt` + `test_extra_output.txt` — outputs bruts.
- `dashboard.js.backup-pre-audit-2026-04-28` — backup intégral du dashboard avant audit.
