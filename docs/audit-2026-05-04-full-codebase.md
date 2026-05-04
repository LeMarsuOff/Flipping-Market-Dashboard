# Audit complet — Flipping Market Dashboard

**Date** : 4 mai 2026
**Mode** : Read-only
**Cible** : `index.html` (2 412 lignes), `dashboard.js` (28 562 lignes), `dashboard.css` (14 784 lignes)
**Confidence bar** : conservatrice — chaque finding cite un compte de références ou un line range vérifié.

---

## 0. Résumé exécutif

### Findings par sévérité

| Sévérité | Total |
|---|---|
| Critique | 1 |
| Majeur | 16 |
| Mineur | 28 |
| Cosmétique | 21 |
| **Total** | **66** |

### Findings par catégorie

| Catégorie | Count |
|---|---|
| 1 — Dead code | 22 |
| 2 — Performance runtime | 13 (+ 3 observations blacklist) |
| 3 — Dette technique R1→R12 | 7 pertinents / 5 résolus |
| 4 — Cohérence architecturale | 4 observations |
| 5 — CSS cleanup | 22 |
| 6 — Robustesse / edge cases | 14 |
| 7 — Bundle / chargement initial | 5 |
| 8 — Zones blacklistées (observations) | 4 |

### Top 5 quick wins (effort S, sévérité Majeur+)

1. **PERF-02** — Hoister `cfg = appState.ui.tpConfig` dans 6 render functions et passer le cfg explicite à `isWinner/isLoser/isBE`. Élimine ~3600 hash recompute par render. (S, Faible)
2. **PERF-03** — Réutiliser `t.effectiveR` déjà caché au lieu de recalculer `computeEffectiveRR` 2 fois supplémentaires dans `drawCharts` (lignes 6639/6641). (S, Faible)
3. **PERF-08** — Remplacer `slice(N).filter(isWinner)` par compteur incrémental dans `renderRollingWR`. ~12 000 calls → ~600. (S, Faible)
4. **PERF-09** — Décorer les trades avec `__isLoss` avant le sort dans `renderTable` au lieu d'appeler `isLoser` dans le comparator (~7000 invocations × 2). (S, Aucun)
5. **DEAD-01..03** — Supprimer 3 fonctions JS prouvées sans aucun appelant : `_ppBuildReachDataset` (`dashboard.js:14132`), `_poTypeLabel` (`dashboard.js:15733`), `_poInternalResetLayout` (`dashboard.js:15874`). (S, Aucun)

### Top 3 chantiers à scoper en PR dédiée

1. **PERF-01** (Critique) — Pré-calculer les comptes chip cross-dim en une passe unique sur le dataset filtré au lieu de ~70 appels `getFiltered({skipChipValue})` par render. Plus gros gain perçu sur clics rapides de chips.
2. **PERF-13** (Majeur) — Migrer `renderHeatmap` et `renderPairSession` vers de l'event delegation au niveau container (économie ~500 `addEventListener` calls par render).
3. **CSS audit complet** — Cluster CSS-01..03 + CSS-11..18 + CSS-22 → suppression coordonnée d'environ 60 lignes orphelines + 25 `!important` dispensables (CSS-20/21).

---

## 1. Dead code prouvable

Méthodologie : pour chaque candidat, grep whole-word dans `dashboard.js`, `index.html`, `dashboard.css`. Compte des occurrences ≠ définition. Skipped : `audit/` et `docs/`.

### 1.1 — Fonctions JS sans appelant

#### DEAD-01 — `_ppBuildReachDataset`
- **Catégorie** : 1A — Fonction JS sans appelant
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:14132](dashboard.js:14132)
- **Preuve** : `grep "_ppBuildReachDataset"` → 1 hit (la définition).
- **Recommandation** : supprimer la fonction.
- **Risque** : Aucun

#### DEAD-02 — `_poTypeLabel`
- **Catégorie** : 1A
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:15733](dashboard.js:15733)
- **Preuve** : `grep "_poTypeLabel"` → 1 hit. Le sibling `_poTypeColor` est utilisé.
- **Recommandation** : supprimer la fonction.
- **Risque** : Aucun

#### DEAD-03 — `_poInternalResetLayout`
- **Catégorie** : 1A
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:15874](dashboard.js:15874)
- **Preuve** : `grep "_poInternalResetLayout"` → 1 hit. Les autres `_poInternal*` (Apply, Save) sont câblés.
- **Recommandation** : supprimer la fonction.
- **Risque** : Aucun

### 1.2 — CDN imports

#### DEAD-04 — `hammerjs@2.0.8` directement non utilisé
- **Catégorie** : 1B — CDN import direct non utilisé
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [index.html:2406](index.html:2406)
- **Preuve** : `grep "Hammer"` (whole-word) → 0 hit. `grep "hammerjs|hammer\.js"` → 1 hit (le `<script src=>`).
- **Caveat** : `chartjs-plugin-zoom@2.0.1` configure `pinch:{enabled:true}` à [dashboard.js:16549](dashboard.js:16549). Historiquement, le plugin v1.x dépendait de Hammer pour pinch sur écrans tactiles ; v2.x peut fonctionner sans Hammer pour wheel/drag mais le pinch tactile reste lié à Hammer si présent.
- **Recommandation** : tester sur un device tactile (pinch zoom du graphe Equity) avant de retirer ; si pinch fonctionne sans Hammer, retirer le `<script>`.
- **Risque** : Faible

### 1.3 — HTML id orphelins (jamais ciblés en JS ni CSS)

Méthodologie : pour chaque id, vérifier `js=0 css=0`. Tous les ids ci-dessous ont **0 référence** dans `dashboard.js` et `dashboard.css` (commande `grep -c <id>` sur chaque fichier).

#### DEAD-05 à DEAD-20 — IDs HTML jamais référencés
- **Catégorie** : 1C
- **Sévérité** : Cosmétique (chacun)
- **Effort** : S (suppression groupée)
- **Localisation** : [index.html](index.html), 16 ids :

| ID | Ligne | js refs | css refs |
|---|---|---|---|
| `bcm-opt-binary` | 1167 | 0 | 0 |
| `bcm-opt-quality` | 1160 | 0 | 0 |
| `dhp-health-body` | 1024 | 0 | 0 |
| `dhp-tab-mapping` | 999 | 0 | 0 (référencé via `aria-labelledby` interne HTML uniquement) |
| `filters-accordion-section` | 1425 | 0 | 0 |
| `mob-card-setup` | 81 | 0 | 0 |
| `mob-card-tradelog` | 93 | 0 | 0 |
| `monthly-card` | 1740 | 0 | 0 |
| `monthly-curve-btns` | 1748 | 0 | 0 |
| `nlm-opt-app` | 1138 | 0 | 0 |
| `nlm-opt-tab` | 1146 | 0 | 0 |
| `preset-compare-section` | 1394 | 0 | 0 |
| `tab-api-icon` | 1297 | 0 | 0 |
| `tab-section-optimal-rr` | 1287 | 0 | 0 (l'élément est routé via `data-section`, l'id est superflu) |
| `tab-section-partials` | 1290 | 0 | 0 (idem) |
| `w-stats-card` | 1730 | 0 | 0 |

- **Preuve** : commandes `grep -c "<id>" dashboard.js` et `grep -c "<id>" dashboard.css` → 0 partout. Validation manuelle sur les exceptions : `dhp-tab-mapping` est référencé en HTML interne via `aria-labelledby` (préserver pour accessibilité ou supprimer attribut + id ensemble), `tab-section-optimal-rr` / `tab-section-partials` sont opérés par `data-section` (id inutile).
- **Recommandation** : supprimer les attributs `id="…"` correspondants. Pour `dhp-tab-mapping`, garder ou retirer la paire `id`/`aria-labelledby` ensemble.
- **Risque** : Aucun (`tab-api-icon`, `nlm-opt-*`, `bcm-opt-*` : Mineur — vérifier qu'aucun téléchargement de thème/preset n'écrit dynamiquement sur ces ids)

### 1.4 — `getElementById` sur id qui n'existe plus

#### DEAD-21 — `cal-sort-session` getElementById obsolète
- **Catégorie** : 1D — Listener attaché à un élément DOM disparu
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.js:12571](dashboard.js:12571)
- **Preuve** : `grep "cal-sort-session"` → 1 hit dans `dashboard.js` (l'appel), 0 hit dans `index.html`. Le `?.` rend l'erreur silencieuse au runtime.
- **Code concerné** : `document.getElementById('cal-sort-session')?.classList.remove('active');`
- **Recommandation** : supprimer la ligne 12571 (cleanup résiduel d'un bouton de tri retiré du Calendar).
- **Risque** : Aucun

### 1.5 — Migration legacy résiduelle

#### DEAD-22 — Strip défensif de l'id retiré `w-partials-planner`
- **Catégorie** : 1A (équivalent — code de migration permanent)
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.js:25376](dashboard.js:25376) dans `_loadSectionSlot`
- **Preuve** : `grep "w-partials-planner"` → 1 hit (cette ligne). Le widget a été retiré (commit antérieur, doc `docs/file-map.md:161`). La ligne `delete partialsData['w-partials-planner']` fait office de migration silencieuse.
- **Recommandation** : décider d'un seuil de rétention de migration (ex. supprimer après 3 mois sans support utilisateur sur ce point). Conservation actuelle assumée.
- **Risque** : Aucun (sans urgence — la ligne est défensive et inoffensive)

---

## 2. Performance runtime

### 2.1 — Top 10 hot paths (par fréquence × coût)

Méthodologie : un hot path = fonction exécutée à `filterDataset()`, à preset switch, ou pour un render impliquant `appState.trades.items` (~600 trades pour Max).

1. **`render()`** ([dashboard.js:17866](dashboard.js:17866)) — orchestrateur appelé à chaque preset switch / chip click / TP-config change / sort change / mobile toggle. Dispatch tous les sub-renders ci-dessous.
2. **`getFiltered()` + `_chipCountFor()` fan-out** via `renderDashboardChrome` ([dashboard.js:14720](dashboard.js:14720)) — 11 dimensions × ~7 valeurs en moyenne → ~70-100 passes filtres complets par render. **Single biggest cost.**
3. **`_enrichTradeClassification()`** ([dashboard.js:1894](dashboard.js:1894)) — pass unique avec hash gate. Appelée par `filterDataset` puis re-déclenchable par `calcStats`.
4. **`calcStats()`** ([dashboard.js:5152](dashboard.js:5152)) — ~10 traversées de `trades` (3 filter + 3 reduce + 4 outcome filters + sort + curve.map + 2 streak forEach).
5. **`drawCharts()`** ([dashboard.js:6598](dashboard.js:6598)) — `groupByDay` + 2 maps `computeEffectiveRR` (lines 6639, 6641).
6. **`renderTable()`** ([dashboard.js:8760](dashboard.js:8760)) — sort O(N log N) avec `isLoser(a)/isLoser(b)` no-cfg + per-row `computeEffectiveRR`.
7. **`renderHeatmap()`** + **`renderPairSession()`** ([dashboard.js:8546](dashboard.js:8546), [dashboard.js:11719](dashboard.js:11719)) — pass unique trades + 50-150 cellules × 4-5 listeners chacune.
8. **`renderCalendar()` + `_calRebuildCaches()`** ([dashboard.js:12576](dashboard.js:12576), [dashboard.js:12704](dashboard.js:12704)) — clone de chaque trade + recompute classification + boucle 12 mois × 3 filter/reduce.
9. **`drawMonthly()`** + 4 `groupByEV` ([dashboard.js:6056](dashboard.js:6056)) — ~5 passes complètes du dataset filtré.
10. **`renderRollingWR()`** ([dashboard.js:10817](dashboard.js:10817)) — O(N × W=20) → ~12 000 `isWinner` calls + 600 array allocations.

### 2.2 — Findings PERF

#### PERF-01 — Cross-dim chip count storm dans `renderDashboardChrome`
- **Catégorie** : 2A + 2B
- **Sévérité** : Critique
- **Effort** : M
- **Localisation** : [dashboard.js:5256](dashboard.js:5256) (`_chipCountFor`), [dashboard.js:5317](dashboard.js:5317) (`buildChips`), appelé 11+ fois sous `renderDashboardChrome`
- **Preuve** : chaque chip-item appelle `getFiltered({skipChipValue})` → cache key unique par valeur ([dashboard.js:5101](dashboard.js:5101)) → ~70 passes filtres complets par render. `_filterStateKey` ([dashboard.js:4767](dashboard.js:4767)) reconstruit + sort à chaque appel.
- **Recommandation** : pré-calculer une fois par dimension un map valeur → count (single trade pass après application du filtre tous-sauf-cette-dim), puis feed `buildChips` depuis ce map.
- **Risque** : Moyen (préserver sémantique cross-dim + skipValue exclusion)

#### PERF-02 — Pattern `is*(t)` no-cfg → hash recompute par trade
- **Catégorie** : 2B
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:8566](dashboard.js:8566) (renderHeatmap), [dashboard.js:11739](dashboard.js:11739) (renderPairSession), [dashboard.js:12733-12734](dashboard.js:12733), [dashboard.js:8793-8794](dashboard.js:8793) (renderTable), [dashboard.js:10841](dashboard.js:10841) (renderRollingWR), [dashboard.js:12654-12655](dashboard.js:12654)
- **Preuve** : `isWinner(t)` sans cfg arg passe par défaut `appState.ui.tpConfig` ([dashboard.js:1648](dashboard.js:1648)) ET appelle `_hashTpConfig` ([dashboard.js:1620](dashboard.js:1620)) à chaque invocation. ~3600+ recompute par render (600 trades × 6 widgets).
- **Recommandation** : hoister `const cfg = appState.ui.tpConfig` une fois en haut de chaque render ; OU lire `t.effectiveClass === 'win'` (déjà caché par `_enrichTradeClassification`).
- **Risque** : Faible

#### PERF-03 — `drawCharts` recompute `computeEffectiveRR` 3× pour les mêmes trades
- **Catégorie** : 2B + 2E
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:6548](dashboard.js:6548) (groupByDay), [dashboard.js:6639](dashboard.js:6639), [dashboard.js:6641](dashboard.js:6641)
- **Preuve** : `groupByDay` calcule déjà `d.rSum`. `drawCharts` flatMap les jours puis 2 `.map(t => computeEffectiveRR(t,cfg))` séparés pour equity et DD.
- **Recommandation** : construire equity + DD en une seule passe en lisant `t.effectiveR` (déjà caché post-enrich) au lieu de re-invoquer.
- **Risque** : Faible

#### PERF-04 — `_calRebuildCaches` clone tous les trades et perd le cache de classification
- **Catégorie** : 2B + 2E
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:12704-12755](dashboard.js:12704)
- **Preuve** : ligne 12712 `{...raw, r: Number(raw.r) || 0}` alloue ~600 objets throwaway. Le clone copie `effectiveR` mais le code recalcule via `computeEffectiveRR(t, tpConfig)` à 12713 puis rappelle `isWinner(t)` / `isLoser(t)` no-cfg à 12733-12734.
- **Recommandation** : drop le clone (Number coercion peut être inline), lire `r = t.effectiveR`, passer cfg aux helpers.
- **Risque** : Faible (vérifier que les downstream tooltips ne mutent pas l'objet)

#### PERF-05 — `tc()` calls dans des boucles cell / trade
- **Catégorie** : 2B + 2C
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:8654-8656](dashboard.js:8654) (renderHeatmap), [dashboard.js:11884-11885](dashboard.js:11884) (renderPairSession)
- **Preuve** : `tc()` ([dashboard.js:5551](dashboard.js:5551)) appelle `getComputedStyle(document.documentElement)` à chaque invocation (résolution complète du style). Total dans `dashboard.js` : 207 occurrences. Dans `renderHeatmap`, ligne 8656 lit `tc('--bg1')` par cellule (~50-150 cellules).
- **Recommandation** : hoister `cBg1 = tc('--bg1')`, `cG = tc('--g')`, `cR = tc('--r')` AVANT la boucle cell et réutiliser.
- **Risque** : Aucun

#### PERF-06 — `hideEmptyWidgets` exécute ~18 partial scans par render
- **Catégorie** : 2A
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:9323](dashboard.js:9323) (`hideEmptyWidgets`), [dashboard.js:9370](dashboard.js:9370) (`buildRules`)
- **Preuve** : `buildRules` est appelé 2 fois (viewRules à 9386, fullRules à 9387). Chaque rule-set contient 9 keys, chacune `arr.some(...)` → potentiellement 18 passes au worst case.
- **Recommandation** : single trade-pass qui flippe `hasSetup/hasSession/hasDay/hasObs/hasH4/hasHour/hasNotion` booleans, puis construire les 2 rule sets depuis ces flags.
- **Risque** : Faible

#### PERF-07 — `renderRollingWR` O(N × window) `slice` + `filter(isWinner)`
- **Catégorie** : 2A + 2B + 2E
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:10840-10841](dashboard.js:10840)
- **Preuve** : pour chaque trade `i ≥ N-1`, `sorted.slice(i-N+1, i+1)` alloue ~20 éléments puis `.filter(isWinner)` → 20 isWinner calls no-cfg. 600 trades × 20 = 12 000 calls + 600 allocations par render.
- **Recommandation** : compteur incrémental rolling : à entrée de `i`, `wins += isWinner(sorted[i])?1:0` ; à sortie de `i-N`, soustraire. O(N).
- **Risque** : Faible

#### PERF-08 — `renderTable` sort comparator appelle `isLoser` par comparaison
- **Catégorie** : 2A + 2B
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:8793-8794](dashboard.js:8793)
- **Preuve** : comparator (ligne 8783) appelle `isLoser(a)` + `isLoser(b)` par comparaison. ~7000+ invocations × 2 isLoser calls (no-cfg → hash recompute) pour 600 trades.
- **Recommandation** : pré-décorer les trades avec `__isLoss = t.effectiveClass === 'loss'` (déjà caché) AVANT le sort.
- **Risque** : Aucun

#### PERF-09 — Calendar boucle annuelle : per-month filter/reduce répétés
- **Catégorie** : 2B
- **Sévérité** : Majeur
- **Effort** : S
- **Localisation** : [dashboard.js:12653-12655](dashboard.js:12653)
- **Preuve** : 12 mois × `moTrades.reduce((s,t)=>s+computeEffectiveRR(t, appState.ui.tpConfig))` + `filter(isWinner)` + `filter(isLoser)`. `_calRebuildCaches` accumule déjà `d.r/d.wins/d.losses` par jour — le rollup mois est gratuit.
- **Recommandation** : agréger `r/n/wins/losses` au niveau mois directement dans `_calRebuildCaches` (qui itère déjà sur `_calYearMap[year].months[month]`), puis lire en header.
- **Risque** : Faible

#### PERF-10 — `_persistSidebarState` sync stringify + setItem à chaque render
- **Catégorie** : 2D-adjacent (write side)
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:2884](dashboard.js:2884), appelé depuis `render()` ([dashboard.js:17898](dashboard.js:17898))
- **Preuve** : `JSON.stringify` + `localStorage.setItem` synchrones, sans debounce ni diff check, à chaque render. Clics rapides chips paient le coût de sérialisation.
- **Recommandation** : debounce (250ms) + skip setItem si payload sérialisé inchangé. Vérifier flush au beforeunload.
- **Risque** : Faible

#### PERF-11 — `groupByEV` invoqué 3× dans `renderCharts` avec coût répété
- **Catégorie** : 2B
- **Sévérité** : Majeur
- **Effort** : M
- **Localisation** : [dashboard.js:17839-17842](dashboard.js:17839), `groupByEV` à [dashboard.js:6056](dashboard.js:6056)
- **Preuve** : 3 passes complètes sur `filtered` pour bucketer par setup/session/pair, chacune avec `computeEffectiveRR` per trade. Combiné avec `renderObsBars` (6366), `renderH4ObsBars` (6435), `drawMonthly`, etc. → ~10 passes par render.
- **Recommandation** : single trade pass qui produit toutes les bucket maps en une fois, puis chaque render lit du map précomputé.
- **Risque** : Moyen (change la signature de chaque widget bar)

#### PERF-12 — `bindManagedEvent` per-cell : ~500 listeners par render
- **Catégorie** : 2G
- **Sévérité** : Majeur
- **Effort** : M
- **Localisation** : [dashboard.js:8673-8688](dashboard.js:8673) (renderHeatmap, 4 listeners/cell), [dashboard.js:11906-11919](dashboard.js:11906) (renderPairSession, 5 listeners/cell)
- **Preuve** : 9×7 heatmap = 63 cells × 4 = 252 addEventListener par render. 6×8 pair-session = 48 × 5 = 240. Total > 500/render uniquement pour ces 2 widgets.
- **Recommandation** : delegation au container — un seul `mouseover/mouseout/click` sur `#heatmap-container` lisant `event.target.closest('.hm-cell')` + `dataset.key`.
- **Risque** : Moyen (touch handling + utip stateful per-cell)

#### PERF-13 — `_filterStateKey()` rebuild composite clé sur chaque `getFiltered`
- **Catégorie** : 2B (amplifié par PERF-01)
- **Sévérité** : Majeur
- **Effort** : M
- **Localisation** : [dashboard.js:4767](dashboard.js:4767), appelée depuis [dashboard.js:5103](dashboard.js:5103)
- **Preuve** : iterate + sort sur 11+ chip dimensions + customChips + comboFilters à chaque appel. Avec PERF-01 → 70 calls × ~20 sort/join ops par render.
- **Recommandation** : maintenir une clé d'état cachée invalidée seulement par `invalidateFilterCache()` ; `skipChipValue` peut être appendé cheaply.
- **Risque** : Moyen (couvrir tous les sites de mutation qui doivent buster la clé)

### 2.3 — Clean-bills (vérifié, pas de finding)

- **Chart.js destroy guards** : 9 occurrences `new Chart(` ([dashboard.js:9573](dashboard.js:9573), [dashboard.js:9670](dashboard.js:9670), [dashboard.js:10688](dashboard.js:10688), [dashboard.js:10854](dashboard.js:10854), [dashboard.js:11202](dashboard.js:11202), [dashboard.js:13746](dashboard.js:13746), [dashboard.js:16494](dashboard.js:16494), [dashboard.js:17461](dashboard.js:17461), [dashboard.js:27015](dashboard.js:27015)). Chacune a un `.destroy()` guard correspondant en scope. **Aucune fuite mémoire détectée.**
- **`localStorage.getItem` repeated reads same-function** : 80 occurrences au total dans le fichier, dispersées sur des fonctions distinctes. Pas de hot loop répété.

---

## 3. Dette technique R1 → R12 — état actuel

> Les items R1-R7 viennent de [`docs/audit-2026-04-28.md`](docs/audit-2026-04-28.md). R11-R12 viennent de [`docs/current-roadmap.md`](docs/current-roadmap.md). R8-R10 inexistants.

| ID | Titre court | Statut | Localisation confirmée |
|---|---|---|---|
| R1 | Factoriser le null-chip handling | **Pertinent** | [dashboard.js:16448](dashboard.js:16448) `_resolveBeRFixed` (passthrough), [dashboard.js:16387](dashboard.js:16387) `_resolveBeR` (0R). Incohérence #1 toujours active. |
| R2 | Renommer `pure-tp-no-sl` / `pure-tp-with-sl` | **Pertinent** | Utilisé à [dashboard.js:14834](dashboard.js:14834) et [dashboard.js:11013](dashboard.js:11013). Noms toujours opaques. |
| R3 | Trade Log dual-column R | **Pertinent** | [dashboard.js:8839-8857](dashboard.js:8839). La colonne `R` affiche `_rEff` ([dashboard.js:8838](dashboard.js:8838)) mais le sort utilise `a.r` brut ([dashboard.js:8783-8787](dashboard.js:8783)). UX divergence Q5 toujours présente. |
| R4 | Couverture de tests automatisée | **Partiellement** | `audit/test_runner.js` existe et tourne (84 cellules après retrait `no-be`). Pas de hook CI pour exécution auto. |
| R5 | Diagramme dans `CLAUDE.md` | **Pertinent** | `grep "diagramme\|diagram"` dans `CLAUDE.md` → 0 hit. |
| R6 | Code mort `simulateCustomPartialsPlan` | **RÉSOLU** | `grep "simulateCustomPartialsPlan" dashboard.js` → 0 hit. Fonction supprimée. |
| R7 | Logging des warnings (`_warnComputeRROnce`) | **Pertinent** | [dashboard.js:1694](dashboard.js:1694). Toujours en `console.warn`, aucun panneau Diagnostics exposé. |
| R8 | — | n/a | (non défini dans la doc) |
| R9 | — | n/a | (non défini dans la doc) |
| R10 | — | n/a | (non défini dans la doc) |
| R11 | Convergence baselines PO | **Pertinent** | `PO_BASELINE_FIXED_TP_R = 2.4` à [dashboard.js:15080](dashboard.js:15080). Divergence Equity/Bilan documentée et assumée. |
| R12 | Tooltip portal pattern | **Disponible / non-systématisé** | Helper `_initInfoPopPositioners` à [dashboard.js:11681](dashboard.js:11681), appelé une seule fois au boot ([dashboard.js:18000](dashboard.js:18000)). Pattern documenté mais non re-appliqué ailleurs. |

**Synthèse R1-R12** : 5 résolus ou partiellement (R4, R6 + R8/R9/R10 inexistants), 7 toujours pertinents (R1, R2, R3, R5, R7, R11, R12).

---

## 4. Cohérence architecturale (observations)

> Section observations uniquement, par contrainte blacklist.

#### ARCH-01 — Double définition de `_escapeHtml` avec sémantique divergente
- **Catégorie** : 4 (pattern dupliqué)
- **Sévérité** : Mineur
- **Localisation** : [dashboard.js:21040](dashboard.js:21040) ET [dashboard.js:25499](dashboard.js:25499)
- **Preuve** : `grep -c "^function _escapeHtml" dashboard.js` → 2. Deux définitions top-level avec **comportement différent sur null/undefined** :
  - L'1ère (21040) : `String(s == null ? '' : s).replace(...)` → null/undefined → `""`
  - La 2nde (25499) : `String(s).replace(...)` → null → `"null"`, undefined → `"undefined"`
  - Comportement effectif au runtime : la 2nde shadow la 1ère (function declarations dernière gagne au parse). **Tous les callers utilisent silencieusement la version non null-safe.**
- **Observation** : à uniformiser en une seule implémentation. Pas de proposition de fix structurel — juste constat.

#### ARCH-02 — Conventions de nommage `is*(t, cfg?)` vs callers no-cfg
- **Catégorie** : 4
- **Sévérité** : Mineur
- **Localisation** : `isWinner/isLoser/isBE` ([dashboard.js:1647-1670](dashboard.js:1647)) et leurs ~6 sites d'appel mentionnés en PERF-02.
- **Observation** : la signature `is*(t, cfg)` avec arg optionnel a été ajoutée pour `calcStats(trades, presetTpConfig)` (cf. CLAUDE.md), mais la majorité des render functions appellent toujours `is*(t)` sans cfg, perdant le bénéfice du pattern et payant un hash recompute par appel. Le pattern n'est pas appliqué de manière systématique malgré la mention dans `docs/file-map.md`.

#### ARCH-03 — Single-bundle 1.25 MB JS / 440 KB CSS
- **Catégorie** : 4
- **Sévérité** : Mineur (assumé par le projet : « pas de build step »)
- **Localisation** : `dashboard.js` (1 252 KB), `dashboard.css` (439 KB), `index.html` (140 KB)
- **Observation** : 28 562 lignes JS dans un seul fichier, 839 fonctions top-level + 309 expressions. La contrainte « pas de build step, pas de framework » exclut tout module-splitting natif. Conséquence connue : tout chargement initial transfert l'ensemble même si l'utilisateur n'ouvre jamais les widgets Optimal RR ou Partial Optimizer. Pas de proposition de refactor structurel — juste constat.

#### ARCH-04 — `flipping_preset_overrides` : key legacy maintenue en lecture/écriture
- **Catégorie** : 4
- **Sévérité** : Cosmétique
- **Localisation** : [dashboard.js:23303](dashboard.js:23303), `loadPresetOverrides` ([dashboard.js:23322](dashboard.js:23322), 1 callsite à 23223), `savePresetOverrides` ([dashboard.js:23304](dashboard.js:23304), 5 callsites)
- **Observation** : `docs/file-map.md` documente cette clé comme « Legacy (no-op fonctionnel post-v2, conservée en écriture pour compat) ». La fonction `loadPresetOverrides` est appelée **1 fois au boot** ; `savePresetOverrides` est appelée **5 fois** depuis des paths actifs (toggleTunePanel, etc.). Le code n'est pas dead, mais sa raison d'être post-v2 mérite un statut clarifié (compat utilisateur vs cleanup).

---

## 5. CSS cleanup

### 5.1 — Sélecteurs orphelins

#### CSS-01 — Famille `.charts-grid` / `.charts-row2` / `.charts-row3` / `.charts-fullrow` / `.charts-1fr-2fr`
- **Catégorie** : 5A
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.css:2826](dashboard.css:2826), [dashboard.css:2832](dashboard.css:2832), [dashboard.css:2838](dashboard.css:2838), [dashboard.css:2845](dashboard.css:2845), [dashboard.css:2851](dashboard.css:2851)
- **Preuve** : `grep "charts-grid\|charts-row\|charts-fullrow"` → CSS-only, JS=0, HTML=0. Conteneurs pre-GridStack non remplacés.
- **Recommandation** : supprimer les 5 blocs + le `@media (max-width:1100px)` à [dashboard.css:4736-4737](dashboard.css:4736) qui cible deux d'entre eux.
- **Risque** : Aucun

#### CSS-02 — `.mc-tooltip` orphelin
- **Catégorie** : 5A
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.css:513](dashboard.css:513)
- **Preuve** : CSS=1, JS=0, HTML=0. Le tooltip live est `.monthly-tooltip` ([dashboard.css:4228](dashboard.css:4228)).
- **Recommandation** : supprimer le bloc.
- **Risque** : Aucun

#### CSS-03 — `.pp-gchip--rr-active` orphelin
- **Catégorie** : 5A
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.css:9655](dashboard.css:9655)
- **Preuve** : CSS=1, JS=0, HTML=0. La classe active utilisée au runtime est `.pp-gchip.lb-active` (4 sites JS : [dashboard.js:12496](dashboard.js:12496), [dashboard.js:16329-16330](dashboard.js:16329), [dashboard.js:17726](dashboard.js:17726)).
- **Recommandation** : supprimer le bloc (vestige du prototype PR5 `_rrFilterBubbleClick`).
- **Risque** : Aucun

#### CSS-04 — `.po-widget` second bloc rollback-safety
- **Catégorie** : 5A (à investiguer)
- **Sévérité** : Cosmétique
- **Effort** : M
- **Localisation** : [dashboard.css:13564-13585](dashboard.css:13564) (second bloc), [dashboard.css:12106](dashboard.css:12106) (premier bloc)
- **Preuve** : 2 blocs distincts pour `.po-widget`. CLAUDE.md (Refonte modern card-based) documente : « Anciennes classes CSS conservées intactes pour rollback safety — les nouvelles règles gagnent par cascade ».
- **Recommandation** : confirmer avec Max que la fenêtre de rollback est fermée. Si oui, fusionner les 2 blocs en un seul pour réduire la complexité de spécificité.
- **Risque** : Faible

### 5.2 — Doublons / overlapping

#### CSS-05 à CSS-09 — Variables `--*` redéfinies dans le même `:root`

| ID | Variable | Définitions | Action |
|---|---|---|---|
| CSS-05 | `--text-inverse` | [38](dashboard.css:38) ET [146](dashboard.css:146) (valeur `#080d1b` identique) | Supprimer la 2nde |
| CSS-06 | `--border-strong` | [39](dashboard.css:39) ET [151](dashboard.css:151) (valeurs identiques) | Supprimer la 2nde |
| CSS-07 | `--hover-bg` | [40](dashboard.css:40) ET [140](dashboard.css:140) (valeurs identiques) | Supprimer la 2nde |
| CSS-08 | `--state-active-bg`, `--state-active-border` | [41-42](dashboard.css:41) ET [164-165](dashboard.css:164) | Supprimer les 2 doublons à 164-165 |
| CSS-09 | `--panel-bg` | [139](dashboard.css:139) (`var(--bg2)`) ET [226](dashboard.css:226) (`var(--surface-2)` qui aliase `var(--bg2)`) | Garder un seul (Layer C semantic à 226 préférable) |

- **Sévérité** : Cosmétique
- **Effort** : S (chacun)
- **Risque** : Aucun

#### CSS-10 — Cascade 3 niveaux `.pp-gchip-track` sous `.po-widget`
- **Catégorie** : 5B (à investiguer)
- **Sévérité** : Cosmétique
- **Effort** : M
- **Localisation** : [dashboard.css:9475+](dashboard.css:9475), [dashboard.css:12180](dashboard.css:12180), [dashboard.css:13664](dashboard.css:13664)
- **Preuve** : 3 niveaux de spécificité pour la même propriété visuelle.
- **Recommandation** : à investiguer — consolider en un seul tier de spécificité.
- **Risque** : Faible

### 5.3 — Variables CSS définies non utilisées

| ID | Variable | Définition | Refs `var(...)` |
|---|---|---|---|
| CSS-11 | `--shadow-xl` | [98](dashboard.css:98) | 0 |
| CSS-12 | `--border-thick` | [104](dashboard.css:104) | 0 |
| CSS-13 | `--state-disabled-opacity` | [166](dashboard.css:166) | 0 |
| CSS-14 | `--accent-secondary` | [159](dashboard.css:159) | 0 (`--accent-primary` est utilisé) |
| CSS-15 | `--t2` | [32](dashboard.css:32) | 0 (`--t` utilisé 3 fois) |
| CSS-16 | `--kpi-accent-height` | [216](dashboard.css:216) | 0 |
| CSS-17 | `--btn-border`, `--btn-color`, `--btn-radius`, `--input-border`, `--input-color` | [240-245](dashboard.css:240) | 0 chacun |
| CSS-18 | `--widget-pad-x`, `--widget-pad-y`, `--widget-gap` | redéfinis dans `@media` à [4648-4649](dashboard.css:4648), [4679-4680](dashboard.css:4679), [4714-4715](dashboard.css:4714), [4719](dashboard.css:4719) | 0 chacun (les vars consommées sont `--widget-padding`, `--gap`, `--layout-main-pad`) |

- **Catégorie** : 5C (chacun)
- **Sévérité** : Cosmétique
- **Effort** : S
- **Recommandation** : supprimer les déclarations.
- **Risque** : Aucun

### 5.4 — Clusters `!important`

#### CSS-19 — 12 `!important` sur handles GridStack edit-mode
- **Catégorie** : 5D
- **Sévérité** : Cosmétique (légitime)
- **Effort** : S
- **Localisation** : [dashboard.css:6939-6948](dashboard.css:6939)
- **Preuve** : override d'inline styles imposés par GridStack/jQuery-UI — usage légitime de `!important`.
- **Recommandation** : laisser en place, ajouter un commentaire d'intention `/* override gridstack defaults — required */`.
- **Risque** : Aucun

#### CSS-20 — 18 `!important` sur `.po-widget .po-v-*` color tokens
- **Catégorie** : 5D (à investiguer)
- **Sévérité** : Mineur
- **Effort** : M
- **Localisation** : [dashboard.css:13622-13655](dashboard.css:13622)
- **Preuve** : 9 classes de couleur × 2 (po-stat-val + po-preset-stat-val), chacune en `!important`. Cible interne `.po-widget .po-stat-val` (single class) — la spécificité naturelle suffirait.
- **Recommandation** : à investiguer — drop `!important` et vérifier en DevTools que la cascade naturelle gagne.
- **Risque** : Faible

#### CSS-21 — 7 `!important` sur `.sel-day-sep td`
- **Catégorie** : 5D (à investiguer)
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.css:7462-7470](dashboard.css:7462)
- **Preuve** : brute-force vs `.sel-table td` ([dashboard.css:7455-7456](dashboard.css:7455)).
- **Recommandation** : à investiguer — spécifier `.sel-table tr.sel-day-sep td` au lieu de `!important`.
- **Risque** : Faible

### 5.5 — Media queries sur sélecteurs orphelins

#### CSS-22 — `@media (max-width:1100px)` cible `.charts-grid` / `.charts-row3`
- **Catégorie** : 5E
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.css:4735-4738](dashboard.css:4735)
- **Preuve** : sélecteurs ciblés sont orphelins (cf. CSS-01).
- **Recommandation** : supprimer le bloc `@media` complet en même temps que CSS-01.
- **Risque** : Aucun

---

## 6. Robustesse / edge cases

### 6.1 — `try/catch` manquants

#### ROBUST-01 — `JSON.parse` non protégé pour layout restore (post-CSV)
- **Catégorie** : 6A
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:2757](dashboard.js:2757)
- **Preuve** : `JSON.parse(localStorage.getItem(LS_KEY_PREFIX + savedKey) || 'null')` dans un callback `requestAnimationFrame` sans `try/catch`. Slot LS corrompu → exception non interceptée → restore avorte, GridStack reste sur DEFAULT_LAYOUT.
- **Recommandation** : envelopper d'un try/catch + fallback DEFAULT_LAYOUT.
- **Risque** : Aucun

#### ROBUST-02 — `JSON.parse` non protégé pour layout restore (post-import)
- **Catégorie** : 6A
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:18714](dashboard.js:18714)
- **Preuve** : pattern identique à ROBUST-01.
- **Recommandation** : idem ROBUST-01.
- **Risque** : Aucun

#### ROBUST-03 — `_normalizeAPITrade` errors non isolées par-trade
- **Catégorie** : 6A (loosely)
- **Sévérité** : Majeur
- **Effort** : M
- **Localisation** : [dashboard.js:2822](dashboard.js:2822), [dashboard.js:3339](dashboard.js:3339)
- **Preuve** : `json.trades.map((t,i) => _normalizeAPITrade(t,i)).filter(Boolean)` — si UN trade jette, **toute la map abort**. L'utilisateur voit "Offline — cached data" sans diagnostic.
- **Recommandation** : envelopper le call dans un try/catch par-trade qui retourne null + log diagnostic ; le `.filter(Boolean)` final fait le reste.
- **Risque** : Faible

### 6.2 — Optional chaining `extras` paths

**Clean-bill** : tous les accès `t.extras` audités utilisent soit `t?.extras?.[key]` (5034, 5271, 22486, 22546, 22941), soit un guard explicite. Pas de finding 6B.

### 6.3 — Empty state handling

#### ROBUST-04 — `getFilteredForORR()` empty state à vérifier
- **Catégorie** : 6C
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:17896](dashboard.js:17896) appelle `renderOptimalRRWidget(getFilteredForORR())`
- **Observation** : un rrMin filter excluant tous les trades pourrait laisser ORR widget sans empty state explicite. À vérifier sur le dataset réel.
- **Recommandation** : ajouter un check `if (filtered.length === 0)` avec empty state UI dédié.
- **Risque** : Aucun

#### ROBUST-05 — `renderShareView` reçu par `renderKpis(stats=null)`
- **Catégorie** : 6C
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:14743](dashboard.js:14743)
- **Observation** : si `currentView === 'share'` et `stats === null` (dataset vide), `renderShareView()` est appelé sans propagation explicite du null. À vérifier qu'il null-guard correctement.
- **Recommandation** : ajout d'un guard early-return ou d'un empty state share.
- **Risque** : Aucun

### 6.4 — Validation user input

#### ROBUST-06 — `validateCustomPropName` — pas de check duplicate
- **Catégorie** : 6D
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:205](dashboard.js:205)
- **Preuve** : seules les checks "required" et "≤60 chars" — un user peut créer 2 props avec le même `name` (clés différentes).
- **Recommandation** : ajouter une vérification d'unicité du `name` (post-trim, case-folded).
- **Risque** : Aucun

#### ROBUST-07 — `validateCustomPropName` autorise whitespace 1-char + zero-width
- **Catégorie** : 6D
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.js:205](dashboard.js:205)
- **Preuve** : pas de min-length, pas de filtrage U+200B/U+FEFF.
- **Recommandation** : normaliser (NFC) + reject si length < 1 après strip de zero-width.
- **Risque** : Aucun

#### ROBUST-08 — `_RESERVED_PROP_KEYS` case-sensitive sur clés camel
- **Catégorie** : 6D
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:177](dashboard.js:177), [dashboard.js:213](dashboard.js:213)
- **Preuve** : la regex `VALID_PROP_KEY_RE = /^[a-z][a-zA-Z0-9]*$/` autorise `tradetype` (lowercase) qui passe l'unicité contre `tradeType` (camel) du Set reserved.
- **Recommandation** : case-fold avant comparaison reserved.
- **Risque** : Aucun

#### ROBUST-09 — `addCustomProp` no upper bound sur longueur de `key`
- **Catégorie** : 6D
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.js:240](dashboard.js:240)
- **Preuve** : la regex contraint la forme mais pas la longueur. 5 KB key passe.
- **Recommandation** : ajouter un max-length (e.g. 40 chars).
- **Risque** : Aucun

#### ROBUST-10 — `layoutImportJSON` validation shape minimale
- **Catégorie** : 6D
- **Sévérité** : Mineur
- **Effort** : M
- **Localisation** : [dashboard.js:26159](dashboard.js:26159)
- **Preuve** : check uniquement `typeof === 'object' && !Array.isArray`. Ne valide pas les inner items (`{x,y,w,h,id}`).
- **Recommandation** : ajouter une validation de structure (clés requises par item).
- **Risque** : Faible

#### ROBUST-11 — `importTheme` validation valeurs CSS
- **Catégorie** : 6D (security-adjacent)
- **Sévérité** : Mineur
- **Effort** : M
- **Localisation** : [dashboard.js:23119](dashboard.js:23119)
- **Preuve** : le check valide la présence de `--bg` et `--gold` mais pas la **forme** des valeurs. `'--bg': 'url(http://attacker/log)'` passe → `setProperty` injecte l'URL dans la cascade → exfiltration via `background-image` URL request.
- **Recommandation** : whitelist regex pour les valeurs (e.g. couleur hex, rgb, rgba, color-mix, var()) ; refuser tout `url()` ou `expression()`.
- **Risque** : Faible (impact attaquant réel limité — l'utilisateur a déjà importé le fichier)

### 6.5 — Silent error swallowing

#### ROBUST-12 — `} catch {}` sur zoom-state read
- **Catégorie** : 6E
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:16471](dashboard.js:16471), [dashboard.js:16586](dashboard.js:16586)
- **Preuve** : `} catch {}` autour de `xScale.min/max` reads et `zoomScale` re-application. Erreurs `chartjs-plugin-zoom` cachées.
- **Recommandation** : remplacer par `} catch (e) { console.warn('[zoom]', e.message); }`.
- **Risque** : Aucun

#### ROBUST-13 — `} catch (e) {}` sur `_persistSidebarState` quota
- **Catégorie** : 6E
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:2918](dashboard.js:2918), [dashboard.js:2984](dashboard.js:2984)
- **Preuve** : empty bodies — quota localStorage exceeded → silent failure → sidebar state pas sauvegardé entre reloads sans signal user.
- **Recommandation** : log + (optionnel) toast user.
- **Risque** : Aucun

#### ROBUST-14 — `} catch {}` sur `_mc2SaveSectionLayout` / `_poInternalSaveLayout`
- **Catégorie** : 6E
- **Sévérité** : Mineur
- **Effort** : S
- **Localisation** : [dashboard.js:13868](dashboard.js:13868), [dashboard.js:15831](dashboard.js:15831), [dashboard.js:15875](dashboard.js:15875)
- **Preuve** : layouts internes (Mass Compare, PO) silencieusement non persistés sur quota error.
- **Recommandation** : log diagnostic + retry-once.
- **Risque** : Aucun

---

## 7. Bundle / chargement initial

#### BUNDLE-01 — Cache-busters manuels désynchronisés
- **Catégorie** : 7
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [index.html:11](index.html:11) `dashboard.css?v=94`, [index.html:2410](index.html:2410) `dashboard.js?v=108`
- **Preuve** : versionning manuel décorrélé. Risque de stale CSS si bump JS sans bump CSS.
- **Recommandation** : aligner les bumps (et/ou utiliser un git-hash auto-injecté).
- **Risque** : Aucun

#### BUNDLE-02 — 6 CDN scripts chargés synchroniquement en fin de body
- **Catégorie** : 7
- **Sévérité** : Mineur
- **Effort** : M
- **Localisation** : [index.html:2404-2410](index.html:2404)
- **Preuve** : gridstack, Chart.js, hammerjs, chartjs-plugin-zoom, dom-to-image, sortablejs — tous synchrones, aucun `defer`/`async`.
- **Recommandation** : marquer `defer` sur les 6 (l'ordre d'évaluation reste préservé) ; voir DEAD-04 pour hammerjs.
- **Risque** : Faible (tester ordre d'init de plugins Chart.js)

#### BUNDLE-03 — TODO(Phase 3) ×3 dupliqués
- **Catégorie** : 7
- **Sévérité** : Cosmétique
- **Effort** : S
- **Localisation** : [dashboard.js:18304](dashboard.js:18304), [dashboard.js:18440](dashboard.js:18440), [dashboard.js:18540](dashboard.js:18540)
- **Preuve** : commentaire `// TODO(Phase 3): detect optional beManagement column (currently API-only)` dupliqué 3 fois (3 parsers CSV — Pro Template, Beginner, custom).
- **Recommandation** : consolider en un seul commentaire au-dessus du dispatcher CSV ; ou créer une fonction helper `_detectBeManagementColumn(headers)` partagée.
- **Risque** : Aucun (à investiguer en zone parsers — voir blacklist)

#### BUNDLE-04 — `domtoimage` chargé pour 2 features peu utilisées
- **Catégorie** : 7
- **Sévérité** : Mineur
- **Effort** : M
- **Localisation** : [index.html:2408](index.html:2408), 3 callsites JS ([dashboard.js:24318](dashboard.js:24318), [dashboard.js:24366](dashboard.js:24366), [dashboard.js:28443](dashboard.js:28443))
- **Preuve** : utilisé uniquement pour export PNG du Tune panel et de la share view. Charge 19 KB sur tous les boots.
- **Recommandation** : lazy-load via `import()` dynamique au moment de l'export user, ou `<script>` injection on-demand.
- **Risque** : Faible

#### BUNDLE-05 — Un seul fichier JS de 28 562 lignes / 1.25 MB
- **Catégorie** : 7
- **Sévérité** : Mineur (assumé)
- **Effort** : L
- **Localisation** : `dashboard.js`
- **Preuve** : single bundle, 839 fonctions top-level. Toute branche (mobile, share view, partial optimizer) chargée même si jamais visitée.
- **Recommandation** : à investiguer si la contrainte « no build step » peut accepter un script splitting natif ESM (3-4 fichiers `<script type="module">` `import`-able). Hors scope si la contrainte est dure.
- **Risque** : Élevé (refactor structurel — non recommandé sans validation explicite)

---

## 8. Zones blacklistées — observations sans recommandation

> **Pour info Max uniquement.** Aucun fix proposé dans ces zones.

### BL-01 — `calcStats` traverses ~10 fois le même array
- **Localisation** : [dashboard.js:5152-5240](dashboard.js:5152)
- **Observation** : 3 `filter` (wins/losses/bes) + 3 `reduce` (totalR/gross_w/gross_l) + `_sortTradesChronological` (clone+sort) + `curve.map` + 2 streak `forEach` + 4 outcome filters → ~10 traversées du dataset filtré. Un seul `for (const t of trades)` accumulant tout produirait le même résultat avec 1 passe.

### BL-02 — `computeEffectiveRR` non utilisé même quand le cache est disponible
- **Localisation** : multiples sites listés en PERF-02
- **Observation** : `_enrichTradeClassification` peuple `t.effectiveR` et `t.effectiveClass` à chaque `filterDataset` ; cependant, plusieurs callers en aval ré-invoquent `computeEffectiveRR(t, cfg)` ou `isWinner(t)` no-cfg au lieu de lire les props cachées. L'enrichissement supporte donc une pénalité de coût sans bénéfice complet.

### BL-03 — Q1-Q5 (incohérences doctrinales) toujours ouvertes
- **Localisation** : `_resolveBEDecision` ([dashboard.js:16351](dashboard.js:16351)) et résolveurs [dashboard.js:16387-16448](dashboard.js:16387)
- **Observation** : les 5 questions ouvertes documentées dans `docs/audit-2026-04-28.md` §7 (Q1 doctrine BE-TP, Q2 empty chip, Q3 ORR strict-loss, Q4 Multi no-be `return 0`, Q5 Trade Log sort) restent non-arbitrées. Ce ne sont pas des bugs au sens strict (le moteur produit des résultats cohérents avec sa logique), mais des choix sémantiques attendant Max.

### BL-04 — `apiTradesCache_v2_rrmax` quota localStorage à surveiller
- **Localisation** : [dashboard.js:2290](dashboard.js:2290)
- **Observation** : le cache enrichi avec `rrMax` est documenté comme « Quota localStorage à surveiller » dans `docs/file-map.md`. Aucun mécanisme automatique de truncation/pruning constaté en dehors du `_runCacheCleanupMigration` ([dashboard.js:2241](dashboard.js:2241)) qui ne tourne qu'une fois (gated par `flipping_cache_cleanup_v1`). À grande dataset (>3000 trades), risque de quota.

---

## 9. Méthodologie

### 9.1 — Commandes grep utilisées (échantillon)

```bash
# Cartographie
wc -l index.html dashboard.js dashboard.css
grep -cE "^[[:space:]]*function" dashboard.js          # 842 top-level
grep -cE "^[[:space:]]*(const|let|var) +\w+ *= *(\(|function|async)" dashboard.js  # 309 expressions
grep -cE "^\s*--[a-zA-Z]" dashboard.css                # 362 custom props
grep -cE "!important" dashboard.css                    # 98 !important

# Dead code
grep -c "<NAME>\b" dashboard.js index.html dashboard.css  # par candidat
grep -nE "data-gs-id=\"([^\"]+)\"" index.html             # 21 widget IDs

# Performance
grep -nE "new Chart\(" dashboard.js                       # 9 charts
grep -nE "\.destroy\(\)" dashboard.js                     # destroy guards
grep -nE "tc\('--" dashboard.js                           # 207 style reads
grep -nE "localStorage\.(getItem|setItem|removeItem)" dashboard.js  # 163

# Robustness
grep -nE "JSON\.parse\(" dashboard.js
grep -nE "} catch \{|} catch \(\w*\) \{\s*\}" dashboard.js
grep -nE "fetch\(" dashboard.js

# CSS
grep -nE "^\s*\.[\w-]+ *\{" dashboard.css
grep -cE "var\(--shadow-xl\)" dashboard.css dashboard.js  # 0 → unused
```

### 9.2 — Limites de l'analyse read-only

- **Tests browser non effectués** : aucune validation runtime (Hammer pinch zoom sur tactile, ORR widget empty state, share view sans dataset, etc.).
- **Mesures perf non capturées** : pas de profiling DevTools — les findings PERF-01 à PERF-13 sont des regressions de coût analytiquement déduites, non profilées.
- **Données réelles non utilisées** : audit sur le code seul, pas sur le dataset prod 600+ trades de Max — l'impact réel des findings PERF (ms par render) reste à mesurer.
- **CSS dynamique non-couvert** : les classes ajoutées via `classList.add(...)` avec template literals (e.g. `'oc-' + t.outcome.toLowerCase()`) ne sont pas exhaustivement remontées. Les findings CSS-* listés sont un sous-ensemble conservatif.
- **Branches conditionnelles** : pas d'analyse de couverture statique pour détecter les branches `if` toujours fausses dynamiquement (out of scope sans exécution).

### 9.3 — Sources

- [`CLAUDE.md`](CLAUDE.md) — règles non-négociables et conventions
- [`docs/business-rules.md`](docs/business-rules.md) — sémantique outcomes / BE / TP modes
- [`docs/file-map.md`](docs/file-map.md) — cartographie fonctions
- [`docs/audit-2026-04-28.md`](docs/audit-2026-04-28.md) — précédent audit (R1-R7 + Q1-Q5)
- [`docs/audit-2026-04-28-details.md`](docs/audit-2026-04-28-details.md) — matrices détaillées du moteur
- [`docs/current-roadmap.md`](docs/current-roadmap.md) — R11-R12

---

**Fin de l'audit.**
