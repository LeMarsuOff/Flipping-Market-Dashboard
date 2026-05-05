# CLAUDE.md — Flipping Market Dashboard

> Fichier de contexte pour Claude Code. Lu automatiquement à chaque session.
> Pour le détail métier (outcomes, BE, modes TP), voir `docs/business-rules.md`.
> Pour la cartographie fichiers/fonctions, voir `docs/file-map.md`.

---

## Identité projet

- **Nom** : Flipping Market Dashboard
- **Owner** : Max (LeMarsuOff)
- **Repo GitHub** : `github.com/LeMarsuOff/Flipping-Market-Dashboard` (public)
- **Hosting** : `lemarsuoff.github.io/Flipping-Market-Dashboard/`
- **Backend** : API Vercel `notion-dashboard-api-2.vercel.app` (pont vers base Notion "Flipping Market M15")
- **Stack** : Vanilla HTML/CSS/JS, single bundle, **pas de build step, pas de framework**
- **Fichiers** :
  - `index.html` (~2 200 lignes)
  - `dashboard.js` (~26 500 lignes)
  - `dashboard.css` (~12 700 lignes)
- **Données** : `data/sample_trades.json` (300 trades anonymisés pour le repo public). Les vraies données de Max viennent via API Notion ou import CSV — **jamais commitées**.

## Double cible utilisateur

1. **Personnel** : outil d'analyse quantitative du journal SMC de Max
2. **Communautaire** : distribué à 500-600 traders Flipping Market

**Implication** : aucune convention Max-spécifique hardcodée. Toute logique doit fonctionner avec d'autres conventions de journalisation Notion.

---

## Règles de travail (NON-NÉGOCIABLES)

### Modifications de code

- **Modifier UNIQUEMENT le bloc demandé**. Pas de refactor opportuniste.
- **Ne JAMAIS réécrire un fichier complet** sauf demande explicite.
- **Format de livraison** : FIND / REPLACE quand possible. Indiquer clairement WHERE / WHAT.
- **Ne jamais changer la structure de données** (`appState`, schémas Notion).
- **Ne jamais casser les filtres existants**.
- **Texte visible du dashboard en anglais**.

### Confidence rule (95%)

- Avant tout changement, atteindre **95% de confiance** sur la tâche.
- Si quoi que ce soit est ambigu → **questions de clarification AVANT de coder**.
- Pas d'hypothèses sur les détails manquants. Pas d'exécution partielle.

### Validation avant livraison

- `node -c dashboard.js` (syntax check)
- Comptage `{` vs `}` cohérent (la balance doit être à 0)
- **Backup local optionnel** avant gros refactors : `dashboard.js.backup-pre-{label}-{YYYY-MM-DD}` (le repo git est la source de vérité, mais un backup local facilite les rollbacks rapides sans `git stash`)

### Workflow git (Mac ⇄ Windows)

Le repo est synchronisé via GitHub : `github.com/LeMarsuOff/Flipping-Market-Dashboard`.
Max travaille sur deux machines (Mac + Windows). Workflow standard :

**Au démarrage de session** :
```bash
git pull
```

**Avant un changement structurel important** :
```bash
git add . && git commit -m "snapshot avant {label}"
```
(évite la perte en cas de refactor raté, plus rapide que de gérer un backup manuel)

**En fin de session ou avant changement de machine** :
```bash
git add .
git commit -m "{description claire}"
git push
```

**Règle d'or** : toujours `pull` avant de commencer, toujours `push` avant d'arrêter. Sinon → conflits.

### Workflow code

- **Approche par PRs mentales** : un fix = un commit clair, pas de scope creep.
- **Token efficiency** : pas de re-print de fichiers, diffs ciblés uniquement.
- **Confidence ≥ 95%** avant tout changement de code (voir Confidence rule plus haut).

---

## Cohésion DA / UI / UX

Tout changement doit respecter la grammaire visuelle existante :

- **Thème par défaut** : Cobalt (TradingView-like). Presets : Gold Carbon, Obsidian, Cyber Neon.
- **Couleurs sémantiques** :
  - `--g` vert : gains/wins
  - `--r` rouge : pertes/losses
  - `--gold` : highlights/accents
  - `#2962ff` bleu : tint BE-TP (intentionnellement distincte des wins)
  - `#b478f0` violet : tint BE-SL (intentionnellement distincte des losses)
- **Densité** : VISUAL_DENSITY ~8-9 (data-dense assumée)
- **Animations** : MOTION_INTENSITY 2-3 (sobres)
- **Layout** : GridStack.js (drag/resize/save), presets layout en localStorage
- **Mobile responsive** avec sticky header fusionné
- **Hiérarchie de lecture** : KPIs top → breakdowns → Trade Log

**Avant tout ajout UI** : vérifier que la modif s'intègre dans cette grammaire et qu'un user qui scanne reconnaît immédiatement où regarder.

**Pour nouvelles features** : intégrer dans le panneau de personnalisation correspondant (Color & Typography).

---

## Architecture critique

### `appState.trades.items`
Source de vérité in-memory. Tous les trades normalisés avec `.extras` pour propriétés Notion custom.

### `apiTradesCache` (localStorage)
**Piège récurrent** : peut être stale après modifications structurelles.
Purge : `localStorage.removeItem('apiTradesCache')` + hard refresh.

### `filterDataset()` (`dashboard.js:4848`)
Point de passage obligé pour tous les widgets. C'est ici que `_enrichTradeClassification` précalcule `t.effectiveR` et `t.effectiveClass`.

### `_hashTpConfig(cfg)`
Hash stable du config TP actif, utilisé comme clé de cache dans `_effectiveClassMode`. Détecte les changements de mode/targets/partials pour invalidation auto.

### Signature `is*(t, cfg)` avec arg optionnel
`isWinner`, `isLoser`, `isBE` prennent un `cfg` optionnel (default `appState.ui.tpConfig`).
Indispensable pour `calcStats(trades, presetTpConfig)` qui doit classifier sous une alt-config sans contaminer la classification active.

### Datasets référence
- **Dataset A** : exclut BE-TP/BE-SL (analyse pure de l'edge)
- **Dataset B** : inclut tous les outcomes — **vérité opérationnelle, primaire**

---

## Décisions UI documentées (trade-offs intentionnels)

### ~~Edit-mode resize handles débordent visuellement sur la topbar~~ — **résolu**

(Note historique conservée pour le contexte.) Anciennement, `.gs-editing .grid-stack-item > .ui-resizable-*` à `z-index: 999` débordait sur la topbar (`--z-topbar: 400`). Le trade-off documenté à l'époque : abaisser z-index sous topbar rendait les coins N/NW/NE non cliquables (topbar interceptrice).

**Fix appliqué** (`dashboard.css:1028+`) : en mode `body.layout-edit-mode`, les 3 bars sticky du header (`.topbar` z=1002, `#filter-context-strip` z=1001, `.view-tabs` z=1000) sont **élevés au-dessus des handles** (z=999) et reçoivent `pointer-events: none` ; leurs enfants directs gardent `pointer-events: auto`. Résultat : les handles sont visuellement masqués par le header, mais leur clic reste accessible à travers les zones vides du header (les flex-gaps entre boutons). Le `#layout-toolbar` (popover Save/Reset/Export...) est exempté à `z-index: 1001` avec `pointer-events: auto` partout.

---

## TODOs actifs

### En cours
- **Optimal RR widget — BE Management filter button**. **Clarifications pendantes** :
  1. Valeurs dynamiques du dataset ou liste fixe ?
  2. Match any ou match all pour exclusion ?
  3. Scope widget-only ou dashboard entier ?

### Backlog UI
- **Yellow border highlighting** on clicked cells (P&L Calendar, Pair × Session, Monthly P&L) en Hover mode. Pas implémenté à ce jour.

### Drawdown Intelligence section (deferred)
Si repris, additions à valeur réelle :
- DD by context (setup/session/pair décomposant Max DD)
- Recovery Factor (Total R / |Max DD|)
- DD Duration distribution
- Risk of Ruin estimate
- Optionnel : Underwater curve, Streak/DD scatter, Pain/Ulcer Index
- MAR/Calmar : low priority (~14 mois d'historique)

---

## PRs récentes (référence)

1. **PR1** `fix/be-aware-effective-rr` ✅ — Cap BE-aware sur BE-TP/BE-SL en multi/personalised
2. **PR2** `fix/be-aware-classification` ✅ — Classification R-effective-based, BE neutres transparents dans streaks
3. **PR3** `fix/donut-outcome-vs-classification` ✅ — `cnt_tp`/`cnt_sl` ajoutés à `calcStats`. Donut "Outcome Breakdown" utilise les comptes Notion-pure (`cnt_tp`, `be_tp`, `be_sl`, `cnt_sl`) **dans tous les modes TP** — c'est volontaire, le donut reste un référentiel Notion immuable.
4. **Audit moteur 28 avril 2026** ✅ — 126 cellules testées (14 trades × 9 combos historiques 3 TP × 3 BE). Résultat : 0 bug de calcul, 3 incohérences doctrinales documentées. Voir `docs/audit-2026-04-28.md`. Backup : `dashboard.js.backup-pre-audit-2026-04-28`.
5. **Mode `no-be` retiré** ✅ — PR `feat/kill-no-be-mode`. Migration auto au boot pour les users sur `no-be` localStorage. 2 modes BE actifs : `be-fallback` (default) et `flipping-be`.
5. **`_rrFilterBubbleClick`** ✅ — Clic direct sur une bulle Optimal RR Analysis filtre tout le dashboard sur `rrMax >= valeur`. Sans modal de confirmation, persisté par preset (`liveSlot.rrMinFilter`). Toggle au reclic. Implémenté `dashboard.js:14174`.
6. **Partial Planner widget retired** ✅ — Le widget a été retiré, seul `w-partial-optimizer` subsiste pour l'analyse partial. Trace : commentaire `dashboard.js:14186`.
7. **KPI threshold colors session 2026-05-05** ✅ — Helper `_kpiTooltipColor(value, kind)` mirroring `_getWinRateTone` (WR, 6 paliers) et `_svProgressTone evr` (Avg R, 6 paliers). Appliqué à : tooltips Monthly P&L / Heatmap S×D / Heatmap P×S / Bar charts ; bilan Optimal RR Analysis ; bar fill + val text dans tous les widgets de bars (desktop + mobile). En mode `barColorMode='binary'` : bar reste binaire (WR ≥40%, EV sign-based) mais le texte de la valeur applique les seuils KPI 6 paliers. Le toggle binary/quality n'affecte plus que mode total. Commit `3bca598`.
8. **BE Trades fixes (Share View) 2026-05-05** ✅ — (a) Le KPI `BE Trades` du share view ne bougeait plus avec le toggle Year/Month parce que `buildStatsOverviewMarkup` appelait `_computeBeTradesKpi()` (global). Ajout param `beCountOverride` ; le share view calcule l'union BE-out + BE Mgmt + outcome-excluded intersectée avec la période active. (b) Nouvelle fonction `_getBeOutcomeExcludedTrades()` : trades dont outcome=BE-TP/BE-SL filtrés par chip `outcome` (excluded explicitement OU absents d'un included non-vide). Ils étaient invisibles partout — désormais comptés dans `_getBeColumnCountAtTp` (impact main + share). (c) Sub-label "BE not included" sur la cellule `Trades` du share view. Commit `e981a24`.
9. **Trade Log + drawer overhaul 2026-05-06** ✅ — (a) Tri Trade Log étendu à 9 colonnes : date, pair, outcome, R, **direction, setup, session, day, obstacles** (day par DAY_ORDER, obstacles par premier chip alpha). Helper `_sortTradesForTradeLog(trades)` partagé entre `renderTable` et le drawer. (b) Le drawer (clic ligne ou screenshot) affiche maintenant **tous les trades filtrés** dans l'ordre exact du Trade Log via `opts.preserveOrder`, plus le trade cliqué `is-active`. Avant : limité aux trades du jour cliqué + always asc chronological. (c) Séparateurs adaptatifs : `opts.groupByCol` insère un `<div class="wd-day-sep">` à chaque changement de la colonne triée (date / pair / session / setup / outcome / direction / day / obstacles ; pas de séparateur pour `r`). Sticky avec `position: sticky; top: 0; z-index: 10`, bg opaque (bg1 base + bg2 overlay), drop shadow. Le drawer body a perdu son `padding-top` pour que le sticky soit flush contre le drawer head. (d) Calendrier monthly : mois vide affiche désormais la grille des jours (cellules grises) avec un watermark "No trades" en overlay au lieu de remplacer toute la grille. (e) Bug screenshot Trade Log : un click hijackait le drawer Selection si une sélection equity était active. Fix : `#sel-tbody` ouvre Selection, `#trade-tbody` ouvre le Trade Log drawer du trade cliqué. (f) Lightbox arrow nav : remplacement de `scrollIntoView({ block: 'nearest' })` par un check manuel "scroll only if fully out of bounds" — plus de retour en arrière à chaque séparateur. Commits `707fa55`, `e52ea95`.

### Conséquences post-patches sur calcStats

- `wr = w / n * 100` (les BE neutres restent au dénominateur — winrate sur n total)
- Streaks : **BE neutres transparents**, ils ne cassent pas une séquence en cours et ne contribuent pas au runR. Séquence W,W,BE,W → max win streak = 3.
- Profit Factor : BE neutres exclus des deux côtés (gross_w et gross_l). Un BE-SL avec effectiveR > 0 en perso contribue à `gross_w`.
- `be` count = `be_tp + be_sl` (compte Notion-pure, mode-indépendant)
- `bes` (différent de `be`) = `trades.filter(t => isBE(t, tpConfig)).length` (BE neutres effectifs, mode-dépendant)
- Tous les appels `calcStats(...)` peuvent passer le `tpConfig` actif (default `appState.ui.tpConfig`)

Pour le détail des PRs livrées (changelog, migration v1→v2 filtres↔presets) : voir `docs/archive/`.

---

## Préférences communication Max

- **Coach trader rentable** : partenaire qui agit comme tel
- **Pas d'éloges** sur idées ou stratégies
- **Pas de questions rhétoriques**
- **Bullet points pour analyses complexes**, prose pour discussions simples
- **Objectivité maximale**, même si ça contredit ses intuitions
- **Questions de clarification AVANT de répondre** si nécessaire

### Tendances comportementales à connaître
- **Perfectionniste** : peut bloquer sur des détails. Rappel à l'objectif (distribution communauté) débloque.
- **Besoin de structure externe** : sans cadre, peut se disperser.
- **Hautement motivé** : si direction claire, exécute vite.
- **Tendance "supprimer quand frustré"** : ne JAMAIS valider une suppression impulsive. Proposer une pause.
