# Business Rules — Flipping Market Dashboard

> Règles métier détaillées. À charger uniquement quand la tâche touche aux calculs RR, classification, ou simulation TP.
> Pour le contexte projet général, voir `CLAUDE.md`.

---

## Méthodologie de trading

Max trade le Forex en swing intraday avec :
- **Méthodologie** : Smart Money Concepts (SMC), formation Flipping Market
- **Pas d'indicateurs** : price action pure (BOS, imbalance, prise de liquidité, niveaux Fibonacci)
- **8 paires** activement tradées
- **Setup type** : retour 4H sur niveau 0.71 fibo + entrée M15 après prise de liquidité
- **TP target standard** : 2.4R (extrémité fibo)
- **SL standard** : niveau 1.0 fibo

Objectif court terme : challenge prop firm FTMO.

---

## Sémantique des 4 outcomes journalisés

C'est le cœur du modèle métier. Tout trade dans Notion porte un `outcome` parmi :

### TP (Take Profit)
Le prix est parti directement au target sans repasser par 0R.
- `trade.r = +2.4R` (ou la valeur "RR TP 1" Notion)
- `rrMax >= TP1`
- Toujours un win

### SL (Stop Loss)
Le prix n'a jamais atteint 1R, est allé directement au stop.
- `trade.r = -1R`
- `rrMax < TP1`
- Toujours un loss

### BE-TP (Break-Even avec TP atteint après)
Le prix a touché le trigger BE management (1R ou 2R), est revenu à 0R → **position coupée à 0R**, puis le prix a continué jusqu'au TP final.
- `trade.r = +2.4R` (= valeur "RR TP 1" Notion, MAIS C'EST FAUX car la position était déjà out à 0R)
- `rrMax >= TP final`
- **Critique** : `rrMax` reflète où le prix est allé, **PAS ce que la position a empoché**

### BE-SL (Break-Even avec SL atteint après)
Le prix a atteint au moins le trigger BE max, est revenu à 0R → **position coupée à 0R**, puis le prix a continué jusqu'au SL final.
- `trade.r = -1R` chez Max, mais peut être 0 ou -0.5 chez d'autres traders selon convention
- `rrMax ≈ trigger BE` (par définition, le prix n'a pas atteint le TP)
- **Critique** : la position était out à 0R, pas à -1R

### Implication pour les calculs
Pour BE-TP et BE-SL, **`rrMax` n'est PAS un proxy fiable du payout réel**. Ce qui compte :
- où la position était coupée (à 0R)
- ce que les partials du plan custom ont pu capturer AVANT le retour BE

---

## BE Management — chips et subtilité multi-chips

Chaque trade BE-TP ou BE-SL a une propriété Notion `beManagement` avec une ou plusieurs chips :
- `"BE si set à 1RR"`
- `"BE si set à 2RR"`
- (potentiellement d'autres niveaux)

### Multi-chips simultanées
**Normal et logique** : si BE armé à 2R, il l'a aussi été à 1R (le prix traverse forcément 1R avant 2R).

### Convention de calcul
`_parseBeTriggerR(trade.beManagement)` prend le **MAX** des chips actives.
Le MAX = le niveau réellement atteint par le prix avant le retour BE = bon référentiel pour le cap des partials.

### Pourquoi BE-TP et BE-SL = mécanique identique
Pour un BE-SL avec trigger=2R : le prix a monté jusqu'à 2R minimum, est revenu à 0R, puis est descendu au SL. Donc en mode personalised avec plan TP1=1R 50% / TP2=3R 50%, **les 50% à 1R ont été réellement empochés** (le prix l'a touché en montant à 2R) avant que la position ne soit coupée à BE.

C'est exactement la même mécanique que pour un BE-TP. La classification "BE-TP/BE-SL = identique en mode perso" est cohérente.

---

## Modes de TP Management

3 modes de simulation TP, sélectionnables dans le topbar :

### Mode `fixed`
R effectif = `trade.r` brut. Aucune simulation.
- TP : +2.4R
- SL : -1R
- BE-TP : +2.4R (valeur Notion, trompeuse mais affichée telle quelle)
- BE-SL : -1R chez Max

### Mode `multi`
Plan multi-TP avec partials configurables (ex: 50% à TP1, 30% à TP2, 20% à TP3). Niveaux TP = `tpN_rr` réalisés (ce que le prix a touché).
- TP : pondération sur `tpN_rr`
- BE-TP : **cap les legs au beTriggerR** (post-fix PR1) — leg avec `tpN_rr > beTriggerR` compte 0R
- BE-SL : passthrough `trade.r` (respecte convention -1/0/-0.5 user)
- SL : passthrough `trade.r`

### Mode `personalised` (custom)
Plan custom user-défini (ex: TP1=1R 50% / TP2=2.4R 50%). Indépendant des `tpN_rr` réalisés.

Le moteur route via `_resolveBEDecision(trade, beMode)` qui retourne un de plusieurs comportements selon le mode BE actif et la présence d'une chip parseable :

- **applyBEAware = true** : `_resolveBeR` itère sur les partials et ne compte que ceux dont `lv ≤ bound` (le bound vient de `_parseBeTriggerR` en `be-fallback`, ou est constant à 2.4R en `flipping-be`). Les partials supérieurs au bound retournent 0R (BE armé, retour ferme le reste).
- **fallbackToNoBE = true** avec `fallbackVariant = 'pure-tp-with-sl'` : `_resolveBeR` appelle `_ppSimTrade(reachR, partials)` standard. Si `reachR < TP1` → -1R (SL fallback).
- **fallbackToNoBE = true** avec `fallbackVariant = 'pure-tp-no-sl'` : `_resolveBeR` floore à 0R (jamais de SL fallback). Utilisé pour BE-TP en `flipping-be` pour enforcer la doctrine "BE-TP can never classify as a real LOSS".

**Exemple BE-TP `be-fallback`, rrMax=4R, beTrigger=1R, plan TP1=1R 50% / TP2=3R 50%** :
- applyBEAware = true, bound = 1R
- partial 1 (1R ≤ 1) : 0.5 × 1 = 0.5R pris
- partial 2 (3R > 1) : 0R (BE armé après partial 1)
- Total : 0.5R

**Exemple BE-TP `be-fallback`, rrMax=4R, beTrigger=1R, plan TP1=2.5R 50% / TP2=3R 50%** :
- TP1 (2.5R) > bound (1R), donc partial 1 jamais pris avant le BE
- Le code délègue à `_ppSimTrade(rrMax, partials)` car aucun BE n'a été armé
- rrMax (4R) couvre TP1 et TP2 → 0.5×2.5 + 0.5×3 = 2.75R

### Cas spécifiques par outcome en mode personalised

- **TP** : `_ppSimTrade` simule chaque leg avec cap sur `rrMax`
- **BE-TP** : route via `_resolveBeR` selon décision de `_resolveBEDecision`
- **BE-SL** : route via `_resolveBeR` selon décision de `_resolveBEDecision` (même mécanique que BE-TP en `flipping-be` ; en `be-fallback` la logique est similaire mais le SL fallback peut s'appliquer)
- **SL** : `_ppSimTrade` retourne -1R (rrMax < TP1)

### Fallback chip vide
Si `beManagement` vide pour un BE-TP/BE-SL → **return 0R + warning console** (signal trade mal taggé Notion).
Cohérent entre `computeEffectiveRR` et `_poSimTradeBeAware`.

### ⚠️ Hypothèse d'uniformité du plan TP

La simulation Partial Planner / Partial Optimizer assume **TP1/TP2 standardisés sur tous les trades**. **Pas applicable si l'utilisateur utilise des TP variables par trade.** À afficher dans les tooltips d'aide des widgets concernés.

---

## Modes BE Management (orthogonaux aux modes TP)

En plus des 3 modes TP, le dashboard a **2 modes BE** sélectionnables séparément (`appState.ui.beMode`, persisté dans `localStorage.flipping_be_mode`) :

### `be-fallback` (default)
Path-aware cap au `_parseBeTriggerR(trade.beManagement)`. C'est le mode "fidèle au journal" :
- Le bound de simulation = MAX des chips BE Management du trade
- Si chip vide → 0R bucket pour BE-TP/BE-SL

### `flipping-be`
BE armé de manière **counterfactuelle à 2.4R** dès que `rrMax (ou _getTradeReachR fallback) ≥ 2.4`. C'est le mode "doctrine Flipping" :
- Trigger BE = constant 2.4R, indépendant de ce que le user a tagué dans Notion
- Pour BE-TP : applique le variant `pure-tp-no-sl` (floor 0R, jamais de SL fallback) — la doctrine "BE-TP can never classify as a real LOSS" est enforcée.

### Architecture du moteur

`_resolveBEDecision(trade, beMode)` est l'**unique source de vérité** pour la politique BE. Elle retourne `{applyBEAware, triggerR, fallbackToNoBE, fallbackVariant}`.

Trois résolveurs par mode TP la consultent :
- `_resolveBeR(trade, partials, reachR)` — pour mode `personalised`
- `_resolveBeRMulti(trade, ...)` — pour mode `multi`
- `_resolveBeRFixed(trade)` — pour mode `fixed`

**Le hash de cache** (`_hashTpConfig`) inclut `|be:<mode>` pour invalider la classification effective au switch BE.

### Migration legacy

Un ancien mode `no-be` a été retiré (PR `feat/kill-no-be-mode`). Les users avec `no-be` en localStorage sont auto-migrés vers `be-fallback` au boot.

### Pour le détail des incohérences inter-modes

Voir `docs/audit-2026-04-28.md` — l'audit du 28 avril 2026 documente :
- 1 incohérence Fixed vs Multi/Personalised sur empty chip (Q2 du rapport)
- 1 question ouverte ORR strict-loss skip r<0 priority (Q3)
- Comportements ORR mode `strict-loss` vs `be-fallback`

---

## Classification win/loss/BE — R-effective-based (post-PR2)

Depuis la PR `fix/be-aware-classification`, classification basée sur le **R effectif sous le mode TP actif**, pas sur l'outcome Notion :

- `effectiveR > 0` → **win**
- `effectiveR < 0` → **loss**
- `effectiveR === 0` → **BE neutre** (ni win ni loss)

### Conséquences post-patches

- **WR / PF / streaks sont mode-dépendants** : un même dataset affiche des chiffres différents en switchant le mode TP. **Intentionnel et assumé** (changer le plan d'exécution change ce que tu captures).
- **`wr = w / n * 100`** : les BE neutres restent au dénominateur (winrate sur n total).
- **Streaks avec BE neutre** : **transparents**. Un BE neutre **ne casse pas** une séquence en cours et ne contribue pas au `runR`. Séquence W,W,BE,W → max win streak = 3. Pour les streak analytics, si un run est en cours et que les trailing trades sont tous BE, le run est quand même flushé à la fin.
- **Profit Factor** : BE neutres exclus des deux côtés. Un BE-SL avec effectiveR > 0 en perso contribue à `gross_w`.
- **`tpConfig` propagé** : tous les appels `calcStats(...)` peuvent passer le `tpConfig` actif (default `appState.ui.tpConfig`).
- **Equity curve** : les BE contribuent 0R, donc la courbe a des segments plats (jamais une chute) sur un BE — Max DD ne s'aggrave pas sur un BE.

### Distinction critique : 2 référentiels parallèles

Le dashboard utilise deux référentiels qui doivent rester clairs :

| Référentiel | Description | Quand l'utiliser |
|---|---|---|
| **Outcome Notion** (immuable) | `t.outcome === 'TP' \| 'BE-TP' \| 'BE-SL' \| 'SL'`. Ne change jamais. | Donut "Outcome Breakdown", tooltip "Trades Count" → utiliser `cnt_tp`, `be_tp`, `be_sl`, `cnt_sl` |
| **Classification effective** (mode-dépendante) | `t.effectiveClass === 'win' \| 'loss' \| 'be'`. Calculée par mode. | WR, streaks, PF → utiliser `stats.w`, `stats.l`, `stats.bes` |

**Ne jamais mélanger les deux référentiels dans un même widget** sans justification explicite.

### Comportement du donut "Outcome Breakdown"

Le donut affiche **toujours 4 segments Notion-pure** (TP, BE-TP, BE-SL, SL) avec les couleurs sémantiques (`--g`, `#2962ff`, `#b478f0`, `--r`), **quel que soit le mode TP**. Comptes utilisés : `cnt_tp`, `be_tp`, `be_sl`, `cnt_sl`. C'est volontaire : le donut reste un référentiel Notion immuable. Pour voir les BE neutres effectifs, utiliser les autres widgets (Stats Overview, Streak Analytics).

### KPI "BE Trades"

Deux compteurs distincts dans `stats` :
- **`be`** = `be_tp + be_sl` (compte Notion-pure, mode-indépendant)
- **`bes`** = `trades.filter(t => isBE(t, tpConfig)).length` (BE neutres effectifs, mode-dépendant)

Choisir le bon compteur selon ce que le widget veut représenter.

---

## Datasets quantitatifs

Max maintient deux datasets de référence pour ses analyses :

| Dataset | Composition | Usage |
|---|---|---|
| **Dataset A** | Exclut BE-TP et BE-SL | Analyse pure de l'edge sans coût de management. Utilisé pour les LABs 1-5 |
| **Dataset B** | Inclut tous les outcomes | **Vérité opérationnelle complète. Référence primaire**, A en crosscheck |
