# Grouped Filters — mini-spec v1

> Multi-dim AND'ed filter groups (style Notion). Lets the user express conditions like
> "exclude Confirmation **on GBPUSD**" instead of having to exclude all Confirmation
> trades or all GBPUSD trades.
>
> Spec date: 2026-06-12. 3 open decisions tranchées par Max le même jour (cf. ROADMAP
> Deferred entry now consumed).

---

## 1. Decisions tranchées (recap)

| # | Décision | Choix |
|---|---|---|
| 1 | Sémantique vs chips | **Intersection** — les groupes filtrent *en plus* des chips classiques. Aucun chip n'est touché ou ignoré. |
| 2 | Profondeur | **Plat v1** — 1 groupe = AND simple. Plusieurs groupes du même mode (include/exclude) s'OR-ent entre eux. Imbrication AND/OR mélangés = backlog v2. |
| 3 | Opérateurs numériques | **Égalité + comparateurs dès v1** — `eq`, `gte`, `lte`, `between` sur les dims number/date/hour. |

---

## 2. Catalogue des dims filtrables

Repris depuis `JOURNAL_DIMS` (dashboard.js ~33390). Les screenshots/URL/formula sont exclus.

| Key | Label | Type | Opérateurs v1 |
|---|---|---|---|
| `outcome` | Position Result | select | `eq` |
| `pair` | Pair | select | `eq` |
| `setup` | Setup | select | `eq` |
| `setupDetail` | Setup detail | select | `eq` |
| `session` | Session | select | `eq` |
| `day` | Day of Week | select | `eq` |
| `direction` | Order (direction) | select | `eq` |
| `obstacles` | M15 Obstacles | multiselect | `eq` (any-of), `all` (contains-all) |
| `h4` | H4 Obstacles | multiselect | `eq` (any-of), `all` |
| `beManagement` | BE Management | multiselect | `eq` (any-of), `all` |
| `positionType` | Position Type | multiselect | `eq` (any-of), `all` |
| `badFeeling` | Bad feeling | checkbox | `eq` (Yes/No) |
| `r` | RR TP 1 | number | `eq`, `gte`, `lte`, `between` |
| `rrMax` | RR Max | number | `eq`, `gte`, `lte`, `between` |
| `hour` | Hour | number (0–23) | `eq`, `gte`, `lte`, `between` |
| `date` | Date | date | `eq`, `gte`, `lte`, `between` |
| _custom props_ | (user-defined) | per propType | resolves to the matching row above |

**Opérateurs par type :**
- `select` / `checkbox` / `number` : `is` (eq), `is not` (neq) [+ `≥`/`≤`/`between` pour les number]
- `multiselect` : `has any` (eq), `has none` (none), `has all` (all)

**Sémantique selon le type :**
- `select` `eq` : `trade[dim] ∈ values[]` · `neq` : `trade[dim] ∉ values[]` (un dim null/absent passe le `neq`)
- `multiselect` `eq` (any-of) : `trade[dim][]` intersecte `values[]`
- `multiselect` `none` (has-none) : `trade[dim][]` n'intersecte PAS `values[]` (inverse de `eq`)
- `multiselect` `all` (contains-all) : `values[] ⊆ trade[dim][]`
- `checkbox` : `trade[dim] === values[0]` (un seul Yes/No), `neq` = l'inverse
- `number`/`date` : `eq`/`neq` égalité stricte, `≥`/`≤`/`between` comparateurs

---

## 3. Schéma de persistance

### 3.1 Forme en mémoire — `appState.filters.groupedFilters`

```js
appState.filters.groupedFilters = [
  {
    id: 'g_1',                    // monotonic int as string, stable across renders
    mode: 'exclude',              // 'include' | 'exclude'
    label: null,                  // null = auto-derivé depuis les conditions
    enabled: true,                // false = groupe mué (skip eval, sans suppression)
    conditions: [
      { dim: 'setup', op: 'eq',      values: ['Confirmation'] },
      { dim: 'pair',  op: 'eq',      values: ['GBPUSD'] },
      { dim: 'rrMax', op: 'gte',     value: 2 },
      { dim: 'hour',  op: 'between', min: 8, max: 14 },
      { dim: 'date',  op: 'between', min: '2025-06-01', max: '2025-12-31' }, // bornes ISO (string)
    ]
  },
  // ...
];
```

**Champs additionnels (v1.1, 2026-06-12) :**
- `enabled` (bool, défaut true) — toggle activer/désactiver un groupe sans le supprimer. Skipé dans l'évaluateur quand false. Migration : absent = true.
- Comparateurs de dates (`gte`/`lte`/`between`) : le type de la valeur stockée discrimine numérique (number) vs date (string ISO). L'évaluateur compare les strings ISO lexicographiquement (tri correct).
- Compteur d'impact (`_gfGroupImpactCount`) : nb de trades matchés par un groupe sur le set filtré hors groupes (`_gfBaseTradesForCount`). Affiché sur la pastille + dans le drawer. Pas persisté (recalculé au render).
- Duplication (`_gfDuplicateGroup`) : clone deep + nouvel id, inséré juste après l'original, label suffixé `(copy)`.

**Forme d'une `condition`** (discriminée par `op`) :
- `{ dim, op: 'eq',      values: string[] }` — select / multiselect / checkbox / number-exact / date-exact
- `{ dim, op: 'all',     values: string[] }` — multiselect contains-all
- `{ dim, op: 'gte',     value:  number }` — number / date / hour
- `{ dim, op: 'lte',     value:  number }` — idem
- `{ dim, op: 'between', min:    number, max: number }` — idem

### 3.2 LocalStorage

**Pas de nouvelle clé top-level.** Réutilise les 2 slots de presets existants :

- `presetLiveFilters_v1` (per-preset live slot) → ajoute `groupedFilters: GroupedFilter[]` au schéma
- `flipping_preset_snapshots_v2` (per-preset snapshot) → ajoute `groupedFilters: GroupedFilter[]`

**Pas de FromPreset/live split** (contrairement aux chips). Les groupes sont **intégralement live** :
modifier un groupe ne le marque pas comme un override, c'est juste la nouvelle valeur live. Le bouton
"Update preset" promeut le live courant dans le snapshot. Pas de halo de "valeur héritée du preset".
Rationale : un groupe = une entité atomique avec UI dédiée, pas une valeur dans une liste de chips.

### 3.3 Sync cross-device

Ajouter `presetLiveFilters_v1` au préfixe déjà sync ? **Il y est déjà** (les chips/comboFilters le sont).
Les groupes piggyback dessus, rien de neuf à câbler côté Supabase. Comme pour la PO-slot fix du
2026-06-11, surveiller la fenêtre apply-remote : la save passe par `_SW.set` (déjà le cas), pas de
`localStorage.setItem` direct → la fenêtre ne droppera pas le push.

### 3.4 Migration

**Aucune.** Slot inexistant = `[]` (no groupes). Boot-time guard : si `slot.groupedFilters` n'est
pas un array, le ré-initialiser à `[]` (defensive comme pour `comboFilters`).

---

## 4. Evaluator — pseudo-code

Insertion **dans `filterChips`** (dashboard.js ~14124), à la toute fin du `.filter(t => …)`,
**après** les checks chips + comboFilters existants.

```js
function _evalCondition(t, c) {
  const v = _readDimValue(t, c.dim);   // helper qui sait extraire la bonne propriété
  switch (c.op) {
    case 'eq':
      if (Array.isArray(v)) {
        // multiselect : any-of
        return c.values.some(x => v.includes(x));
      }
      return c.values.includes(v);
    case 'all':
      // multiselect contains-all
      return Array.isArray(v) && c.values.every(x => v.includes(x));
    case 'gte':     return Number(v) >= c.value;
    case 'lte':     return Number(v) <= c.value;
    case 'between': {
      const n = Number(v);
      return n >= c.min && n <= c.max;
    }
  }
  return false;
}

function _evalGroup(t, g) {
  // AND sur toutes les conditions du groupe
  return g.conditions.every(c => _evalCondition(t, c));
}

function _applyGroupedFilters(t, groups) {
  if (!groups?.length) return true;
  const excl = groups.filter(g => g.mode === 'exclude');
  const incl = groups.filter(g => g.mode === 'include');
  // Exclude wins : un seul match exclude → trade out.
  if (excl.some(g => _evalGroup(t, g))) return false;
  // Include : s'il y en a au moins un, le trade doit matcher au moins un.
  if (incl.length && !incl.some(g => _evalGroup(t, g))) return false;
  return true;
}

// Au bout du filter callback dans filterChips :
if (!_applyGroupedFilters(t, appState.filters.groupedFilters)) return false;
```

Mirror exact dans `_filterTradesBySnapshot` (~14029) en lisant `snap.groupedFilters`.

**Complexité** : O(trades × groups × conditionsPerGroup). Sur 5000 trades × 5 groupes × 3 conds
= 75k ops par render. Négligeable.

---

## 5. UI — drawer builder

Side-drawer style Theme editor (pas un modal). Ouvert depuis :
- Bouton **"+ Group filter"** en bas de la sidebar des chips
- Clic sur une pastille de groupe active dans la sidebar → drawer focus sur ce groupe

```
┌─ Group filters ─────────────────────────── ✕ ┐
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ [⊗ EXCLUDE ▾]   Custom name…    🗑    │    │  ← header per group
│  ├──────────────────────────────────────┤    │
│  │ Setup       [ is ▾]  [Confirmation▾]❌│    │  ← condition row (select)
│  │   AND                                │    │
│  │ Pair        [ is ▾]  [GBPUSD ▾]    ❌ │    │
│  │   AND                                │    │
│  │ RR Max      [ ≥ ▾]   [ 2.0  ]      ❌ │    │  ← condition row (number)
│  │   AND                                │    │
│  │ Hour    [between▾]  [ 8 ]–[ 14 ]   ❌ │    │  ← between = 2 inputs
│  ├──────────────────────────────────────┤    │
│  │ + Add condition                      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ [✓ INCLUDE ▾]   …                    │    │
│  │   …                                  │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  + Add filter group                          │
│                                              │
└──────────────────────────────────────────────┘
```

**Comportements UI :**
- Mode pill `[EXCLUDE ▾]` / `[INCLUDE ▾]` : toggle via dropdown
- "Add condition" → ouvre un select de dim (catégorisé : Categorical / Numeric / Date)
- Operator select : restreint dynamiquement aux ops valides pour le `propType` de la dim
- Value picker : multi-select chips pour `eq` sur select/multiselect, number input pour `gte`/`lte`/`eq` numérique, 2 inputs pour `between`
- Suppression d'une condition vide → ligne retirée
- Groupe vide (0 conditions) → bouton "Remove group" remplace le bouton "Add condition"
- Pas de bouton Apply : tout est live, debounce 150 ms entre l'edit et le re-render des widgets

**Auto-label** : si `label === null`, dérivé à l'affichage :
- 1 condition : `<dimLabel> <op> <value>` → ex. `Setup = Confirmation`
- 2 conditions : `<dim1>=<v1> × <dim2>=<v2>` → ex. `Setup=Confirmation × Pair=GBPUSD`
- 3+ : `<dim1>=<v1> × +N conds`

### 5.1 Pastilles sidebar

Au-dessus de la liste des chips classiques, nouveau bloc compact :

```
┌─ GROUPED FILTERS (3) ───┐
│ ⊗ Confirmation×GBPUSD   │  ← rouge tinté (exclude), click = edit
│ ⊗ Asian Sess.×Mon       │
│ ✓ London×RR Max≥2       │  ← vert tinté (include)
│   + Add group           │
└─────────────────────────┘
```

Hover → tooltip avec la liste exhaustive des conditions.

---

## 6. Hooks dans le code existant

| Site | Action |
|---|---|
| `appState.filters` init (~133) | Ajouter `groupedFilters: []` |
| `_blankSnapshot()` | Ajouter `groupedFilters: []` |
| `_blankLiveSlot()` (~38905) | Ajouter `groupedFilters: []` |
| `_blankLiveSlotKeepPO()` (~38641, ajouté 2026-06-11) | Reporter `groupedFilters` (analog au keep-PO pour Update/Reset/Clear all) |
| `savePresetSnapshots` / `loadPresetSnapshots` | Sérialiser le champ |
| `savePresetLiveFilters` / `loadPresetLiveFilters` | Sérialiser le champ |
| `applyPreset(id)` (~13029) | Hydrater `appState.filters.groupedFilters` depuis le live slot |
| `_snapshotChipsToLiveSlot` (~3350) | Capturer `groupedFilters` dans le snapshot |
| `_clearGroupedFilters()` (nouveau) | Analog à `_clearComboFilters`, vide le tableau |
| `filterChips` (~14124) | Append `_applyGroupedFilters` à la fin |
| `_filterTradesBySnapshot` (~14029) | Mirror eval depuis `snap.groupedFilters` |
| `_filterCounts` (sidebar count badges) | Recalculer en tenant compte des groupes (skipValue logic à étendre — TODO si touche le hit-count des chips) |
| `index.html` | Ajouter le drawer (HTML squelette) + le bouton "+ Group filter" sous les chips |
| `dashboard.css` | Tokens `--gf-*` (palette include vert / exclude rouge tinté), styles drawer + pills |

---

## 7. Phases de livraison

| Phase | Scope | Estimé | Vérification |
|---|---|---|---|
| **A — Data model + evaluator** | appState slot, blank/clear/save/load, `_applyGroupedFilters`, hook dans `filterChips` + `_filterTradesBySnapshot`. Pas d'UI. | 1 session | Console : injecter un groupe en mémoire, vérifier que les widgets recalculent. |
| **B — Drawer builder UI** | HTML drawer, ajout/suppression de groupes + conditions, dim/op/value pickers, sync vers appState. | 1–2 sessions | Créer un groupe end-to-end sur démo, vérifier persistence (reload). |
| **C — Sidebar pills + presets integration** | Pastilles dans la sidebar, snapshot/restore depuis preset, Update/Reset/Clear all behavior, cross-device sync verify. | 1 session | Round-trip preset save/load avec un groupe ; switch preset ; reset/clear. |

Total : ~3 sessions. **Aucune dépendance externe.**

---

## 8. Non-goals v1 (parked → v2)

- Imbrication AND/OR mélangée (sous-groupes)
- Opérateurs `contains` / `starts_with` / regex sur les select
- Comparateurs sur les dates (en v1 : seulement `eq` exact = même jour)
- Drag-to-reorder des groupes / conditions
- Templates de groupes pré-faits ("My A+ setups", etc.)
- Logique OR à l'intérieur d'un groupe (workaround : faire 2 groupes du même mode)

---

## 9. Open questions à confirmer avant de coder

Une seule à valider avant de partir :

**Q1** — Quand un groupe `exclude` a 0 condition (groupe vide en cours de construction), il est :
- (a) inactif (skip l'eval, "draft" status visible dans l'UI) → recommandé
- (b) supprimé automatiquement (UX plus stricte mais perd un groupe en cours d'édition)

Q1 default = (a).

---

_End of spec._
