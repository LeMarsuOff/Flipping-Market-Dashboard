# Current Roadmap — Flipping Market Dashboard

> Suivi des chantiers livrés et à venir sur le Partial Optimizer et le dashboard.
> Pour le détail des règles métier, voir `docs/business-rules.md`.
> Pour la cartographie fichiers, voir `docs/file-map.md`.
>
> **Dernière mise à jour** : 4 mai 2026

---

## PRs livrées

### Chantier "Audit-driven cleanup" (4 mai 2026) — 3 PRs séquentielles sur main

Audit complet en début de session : `docs/audit-2026-05-04-full-codebase.md` (66 findings, 9 sections, blacklist active sur le moteur de calcul). Les findings d'effort S et de risque Aucun/Faible ont été traités en 3 PRs successives, chacune validée en runtime par l'utilisateur sur dataset 600 trades. Aucune régression observée.

- **PR1 — `cleanup/pr1-dead-code-css`** (commit `5368c36`, mergé via #16)
  - Dead JS : `_ppBuildReachDataset`, `_poTypeLabel`, `_poInternalResetLayout`, ligne `cal-sort-session` orpheline
  - Dead HTML : 16 attributs `id="…"` retirés (`bcm-opt-*`, `dhp-tab-mapping` + paire aria, `mob-card-*`, `monthly-card`, `nlm-opt-*`, `tab-section-*`, `w-stats-card`, etc.)
  - Dead CSS : famille `.charts-grid` + `@media` ciblé orphelin, `.mc-tooltip`, `.pp-gchip--rr-active`
  - CSS dedup : 6 doublons `:root` (`--text-inverse`, `--border-strong`, `--hover-bg`, `--state-active-*`, `--panel-bg`)
  - CSS unused : 11 propriétés (`--shadow-xl`, `--border-thick`, `--state-disabled-opacity`, `--accent-secondary`, `--t2`, `--kpi-accent-height`, `--btn-border/color/radius`, `--input-border/color`) + `--widget-pad-x/y/--widget-gap` dans 3 `@media`
  - Bilan : 139 suppressions / 19 modifs (-120 lignes net)
  - Préservé pour info Max : DEAD-04 hammerjs CDN (test tactile requis), CSS-04/10/20/21 (à investiguer)

- **PR2 — `perf/pr2-quick-wins`** (commits `12e8dca` + 3 follow-ups : `ca6434d` calendar typo, `80b3b2a` showBE bar-tooltip fix, `ab9611f` theme-panel drag, mergés via #17 + #18)
  - **PERF-02** : hoist `cfg = appState.ui.tpConfig` + pass to `is*()` helpers dans 6 render functions (renderHeatmap, renderPairSession, renderTable, renderRollingWR, renderCalendar boucle annuelle, _calRebuildCaches). Élimine ~3600 hash recompute par render.
  - **PERF-03** : `drawCharts` lit `t.effectiveR` caché + fusion equity/DD en 1 passe au lieu de 2 maps séparés.
  - **PERF-05** : hoist `tc('--g/--r/--bg1')` hors des boucles cell de renderHeatmap + renderPairSession.
  - **PERF-06** : `hideEmptyWidgets` single-pass flag accumulation avec early-exit (au lieu de ~18 `arr.some()`).
  - **PERF-07** : `renderRollingWR` rolling counter O(N) au lieu de O(N×W=20). 12 000 isWinner calls → ~600.
  - **PERF-08** : `renderTable` pré-décore `__isLoss` avant le sort, comparator lit la prop cachée.
  - **PERF-09** : agrégats mois (`_totalR/_wins/_losses`) cachés dans `_calRebuildCaches`, `renderCalendar` boucle annuelle lit en O(1) au lieu de 3 traversées par mois.
  - **PERF-10** : `_persistSidebarState` debounced 250ms + diff check + flush `beforeunload`. Original synchrone préservé pour le flush.
  - **Follow-ups intégrés** : retrait des overrides JS sur `--fs-cal-*` (theme editor pilote la typo Calendar), drag horizontal du theme panel avec reset à la fermeture, fix `showBE` undefined depuis l'initial commit (cassait silencieusement le hover de TOUS les bar charts).
  - Bilan : +91 lignes net (PR2 base) + 4 commits suivants pour les fixes UX/régressions découverts en runtime.

- **PR3 — `robust/pr3-silent-failures`** (commit `85299cf`, mergé via #19)
  - **ROBUST-01/02** : try/catch + `console.warn('[layout restore CSV/import]', e.message)` autour de 2 `JSON.parse(localStorage.getItem(...))` non protégés (post-CSV import et post-CSV file import).
  - **ROBUST-03** : isolation par-trade dans 2 callsites `_normalizeAPITrade` (loadFromAPI + _fetchAPICacheSilently). Un trade malformé loggue son `index=N` et est filtré au lieu de faire crasher l'import entier.
  - **ROBUST-12** : 2 `} catch {}` vides convertis en `console.warn('[zoom]', ...)` autour des reads/writes de zoomScale dans `_poRenderScatter`.
  - **ROBUST-13** : 1 `} catch (e) {}` vide dans `_persistSidebarState` synchrone converti en log (le 2nd site identifié dans l'audit avait déjà été loggué par PR2 lors de l'introduction du wrapper debounced).
  - **ROBUST-14** : 2 `} catch {}` vides convertis en `console.warn('[layout persist]', ...)` autour des `setItem(_MC2_SECTION_LAYOUT_KEY)` et `setItem(_PO_INTERNAL_LAYOUT_KEY)`. Le 3e site listé dans l'audit était un catch sur `chart.resize()` (cosmétique, hors scope persistence).
  - Bilan : +52 / -12 (+40 lignes net) sur dashboard.js. Aucune modif du moteur de calcul ni des parsers CSV.
  - Out-of-scope reportés : 3e callsite `_normalizeAPITrade` à `_reapplyAPIOverrides` (audit n'en listait que 2), retry-once wrapper sur layout persist (complexité non justifiée pour le moment).

### Statut R1-R7 (audit 28 avril 2026, recroisé par l'audit 4 mai 2026)

- **R6 — Code mort `simulateCustomPartialsPlan`** : ✅ **RÉSOLU** (fonction supprimée avant l'audit du 4 mai, `grep` confirme 0 occurrence).
- **R4 — Couverture tests automatisée** : partiellement adressé (suite `audit/test_runner.js` toujours en place, 84 cellules testées post-retrait du mode `no-be`).
- **R1, R2, R3, R5, R7** : toujours pertinents, non priorisés cette session.

### Chantier "PO UX/UI Overhaul" (3 mai 2026) — main direct, commit `c54c9aa`

- **Equity baseline + preset identity** — Baseline du graphique Equity verrouillée à `PO_BASELINE_FIXED_TP_R = 2.4` (simulation indépendante via `_poSimulateModel`, label "Baseline (Fixed TP 2.4R)"). Preset sélectionné garde sa couleur d'identité (P1=vert, P2=teal, P3=violet) avec borderWidth 3.6 + autres presets atténués à alpha 0.30 (au lieu d'override gold). Legend ordre forcé via `legend.labels.sort` indépendant du z-order. Checkbox "Baseline avec BE Management filter" supprimée. Divergence assumée : Equity baseline ≠ Bilan baseline (qui reste sur grid baseline).
- **Apply Full TP au dashboard** — Bouton Apply débloqué pour `type === 'full'` (Bilan + tiles Saved Presets). Étape 1 : si `tpFinal` matche bulle ORR (grid `_PO_ORR_BUBBLE_R_VALUES`) → `_setTpMode('fixed')` puis `_rrFilterBubbleClick(tpFinal)` (gardé par check `rrMinFilter !== tpFinal`). Étape 2 fallback : Personalised `tpCount=2`, targets `{tp1, tp1+0.5, 3}`, partials `{100, 0, 0}`. Helper `_poApplyVisualFeedback` factorisé. Forçage explicite `_setTpMode('fixed')` car le mutex ORR↔TPM était purement cosmétique.
- **Saved presets deltas fix** — Bug : la baseline pour les deltas EV/Total R des tiles preset cherchait dans `st.results` qui ne contient un Full TP qu'au `tpFinal` actif → presets stockant un autre tpFinal n'avaient pas de baseline → deltas masqués. Fix dans `_poSimulateSlotModel` : fallback à une simulation Full TP on-demand au `stored.tpFinal`. `result.baselineSim` retourné, `_poRenderPresetsBlock` consomme ce champ.
- **Sweep TP final éditable** — Retire `tpEl.disabled = !!cfg.sweepMode`. Validation input renforcée (empty/NaN/≤0 → 2.4R, clamp [1.5, 20]). Itération : initialement Sweep se désactivait au blur → reverté par utilisateur, Sweep reste actif et la valeur stockée est ignorée par `_poGenerateGrid`.
- **Recalculer button déplacé** — Bouton déplacé de la toolbar Setup du scatter vers la tuile Bootstrap Confidence (3 itérations : ligne dédiée → même ligne que la barre + bouton via flex → couleur gradient gold uniquement, padding/typo intacts après revert utilisateur). Cleanup : `.po-btn-recalc-inline` (3 règles CSS orphelines) supprimées.
- **Bilan rows simplifiés** — `R Saved` et `R Sacrificed` retirés du Bilan. `Net` déplacé en première position. Tooltip `?` ligne associée retirée d'`index.html`. `_poComputeSavedSacrificed` conservé (consommé pour `vsBaseline.net` ailleurs).
- **Tooltip "?" portal fix** — 2 itérations sur le clipping des tooltips Hypothèses du simulateur (PO) + Optimal RR sim mode. Cause racine : `.po-widget > * { z-index: 1 }` créait un stacking context piégeant le `position: fixed`. Solution : portal du popup vers `document.body` au boot. JS-driven show/hide avec grace period 150ms pour préserver le pont souris. CSS `:hover` cascade retirée (DOM split). Refus migration vers `.utip` (cursor-anchored vs element-anchored, `pointer-events: none` casserait le bridge). Helper `_positionInfoPop` avec clamp viewport + flip vertical, RAF-throttled sur resize/scroll capture.
- **Bandeau Best stats responsive** — `.po-block-bandeau` reçoit `container-type: inline-size`. 3 paliers `@container po-bandeau (max-width: 1300/1050/850px)` step-down du `font-size` sur `.po-stat-val` (22→18→15→13px), `.po-stat-name` (11→10px), hero compromise (16→14→13→12px). `line-height: 1.1` figé. Refus de `vw clamp()` (ignore GridStack), wrap (mid-number moche), auto-fit grid (casse hero 3fr).
- **Bandeau hover-zoom magnifier** — Défense en profondeur. `@media (hover: hover)` : `.po-stat-card:hover` → `transform: translateY(-1px) scale(1.06)`, `overflow: visible`, `z-index: 50`, box-shadow renforcée. `transform-origin: left/right center` selon position dans la grille. `.po-stat-val` + `.po-stat-name` au hover du parent → `overflow: visible; text-overflow: clip` (mais `white-space: nowrap` conservé). Coordination `is-active + hover` : box-shadow gold renforcée pour matcher l'élévation.
- **RR-distribution chip active state** — Sélecteur `.pp-gchip.lb-active` ajouté au sélecteur groupé existant avec `.bar-row.lb-active` (réutilisation sémantique). Handler délégué `#po-body` swap la classe au clic + persiste `_poState.activeRRDistLv`. `_poRenderRRDist` réapplique après `wrap.innerHTML`. `closeWidgetDrawer` étendu pour cleanup les 2 scopes.
- **Note runtime** : tous les chantiers testés visuellement par l'utilisateur SAUF chantiers 13 (container queries) et 14 (hover-zoom) qui n'ont été validés qu'au niveau CSS chargé (couche `.layout` masquée en preview à cause du data hub onboarding). À valider visuellement à la prochaine session.
- **Reverts utilisateur** : (a) Sweep auto-disengage au blur du TP final → reverté ; (b) Recalculer style "bold gold uppercase compact" → reverté (couleur seule) ; (c) Max DD delta `invertSign: true` → reverté (default mapping).
- **Workflow GitHub** : mega-commit unique direct sur `main` (pas de branche dédiée). `.claude/launch.json` ajouté au `.gitignore` (config locale Windows/Mac divergente, `git rm --cached` pour untrack sans suppression disque).

### Chantier "Soft Glow redesign" (29 avril 2026)

- **PR-Layout v13** — Réorganisation grille widget (tuiles bandeau, Bilan gauche, Equity/Ranking côte à côte)
- **PR-A** — Tri du Classement par clic sur header de colonne (▲▼, asc/desc toggle)
- **PR-B** — Bouton "Apply to Dashboard" dans le Bilan (push direct vers personalised TP, sans confirmation)
- **PR-C** — Save P1/P2/P3 + tuiles preset avec deltas (data layer + UI, popups DA-compliant, scoped per preset)
- **PR-D** — Equity curves des slots sauvés sur le graph (couleurs distinctes, toggle persistant)
- **Soft Glow PR-1/2/3** — Refonte visuelle "user-friendly" du widget : halos colorés via radial-gradient + blur (perf-safe, pas de backdrop-filter), gradients soft, tuiles preset retravaillées avec deltas vs baseline, watermark sur slots vides, icônes SVG inline
- **Fix sort regression** — `_poRankResults` direction inversée depuis PR-A (desc renvoyait asc). Cassait toutes les Best stat cards + Top scatter + ranking table. Ajout helper `_poColorClass` pour couleurs dynamiques (pos=vert, neg=rouge, neutre=primary) sur EV / Total R / WR / PF / Max DD / TP Final. Stability reste primary fixe. Wrap 2 lignes sur noms de modèles long, hauteur des blocs adaptée.

### Chantier "Refonte modern card-based" (30 avril 2026)

Inspiration Linear/Vercel. Palette Cobalt préservée (pas de violet hardcodé), DM Mono pour numériques, pas de Google Fonts, pas de `backdrop-filter`. Anciennes classes CSS conservées intactes pour rollback safety — les nouvelles règles gagnent par cascade.

- **PR-1 Bilan refonte** — Refonte du bloc "Selected model" du Partial Optimizer en card moderne : hero header avec gradient subtil + dot pulsant vert, 9 rows métriques verticales avec hover, bloc Bootstrap Confidence (bar amber→green), footer 2 boutons (Save preset / Apply to Dashboard). Logique préservée à 100% (deltas, verdict, vsBaseline, wiring). Classes scopées `.po-bilan-*` sous `.po-widget`. Commit `3ec384f` sur `refonte/po-bilan-modern`.
- **PR-2 Saved Presets refonte** — Refonte des 3 tuiles P1/P2/P3 : header tag plain (P1/P2/P3 + dot gris) + actions trash à droite (opacity 0.5 → 1 hover), identity block (nom + type), 4-col stats grid avec border-top, footer Apply full-width. Halo coloré per-slot neutralisé pour look sober. HTML restructuré (trash déplacé dans le head, footer simplifié). Commit `3ec384f`.
- **PR-3 Ranking compact** — Suppression de la colonne PF (decision Max), renommage `Max DD → DD` et `Stability → Stab`, transformation de la colonne `#` en rank pill colorée pour le top 3 (or/argent/bronze via `--gold`/`--g` mix). Guard fallback `rankMode === 'pf' → 'totalR'` pour les legacy presets. Click handler + `_poRankResults` non touchés. Commit `3ec384f`.
- **PR-4 reverté** — Première tentative de refonte des Best stat cards (5+1 hero) en CSS-only override scopé sous `.po-widget`. Bandeau resté coincé sur 1/3 de la largeur du widget (parent grid `cols 1-4 / rows 37-52` non touché), cards écrasées à ~60px de large, valeurs DM Mono tronquées. **Leçon** : un override CSS scopé ne suffit pas quand la refonte requiert un changement structurel du layout grid parent — il faut accepter de modifier les `grid-column` / `grid-row` des blocs voisins.
- **PR-4-bis Best stat cards mockup-aligned** — Bandeau déplacé en `cols 5-12 / rows 1-36` (top-right, 2/3 de largeur), Scatter compressé en `rows 37-164` (au lieu de full-height), Bilan grandit pour occuper toute la colonne gauche `rows 37-164`. 6 cards : 1 hero Best Compromise (3fr, gradient gold + halo radial top-right via `::before`, val 32px) + 5 normales (1fr each, val 22px). Standalone `.po-block-best-comp` retiré du markup, intégré comme premier enfant du bandeau. `_poRenderStatCards` non touchée (queries class-based, pas positionnelles). Commit `9a63951` sur `feat/po-internal-layout-editor`.
- **PR-5 Internal layout editor (Phase A)** — Custom drag/resize sur les 7 sous-blocs principaux du widget PO (rrdist, scatter, bandeau, detail, equity, ranking, presets). Pattern répliqué de `_mc2InitSectionLayoutEdit` (pointer events, snap grid 12×280, gravity, decollision). Persiste dans `localStorage` clé `po-section-layout-v1`. Hook dans `toggleEditMode` global (apply au mount + au toggle ON/OFF, init bind idempotent). Bouton "⟲ Reset layout" en haut-droite (visible uniquement en edit mode). Defaults reflètent exactement le layout PR-4-bis. Fix critique : `#po-detail` wrapped dans inner div (`.po-detail-inner`) pour que `_poRenderDetail`'s `wrap.innerHTML = ...` ne wipe plus les handles drag/resize. Phase B (bandeau internal cards individuellement editables) déferrée. Commit `9a63951`.
- **Default layout JSON sync** — Constante `PARTIAL_PLANNERS_LAYOUT` alignée sur le JSON de production : retrait des contraintes `minW:8 / minH:189` sur `w-partial-optimizer` (autorise des tailles plus petites du widget PO sans GridStack lock). `GLOBAL_OVERVIEW_LAYOUT` et `OPTIMAL_RR_LAYOUT` déjà identiques au JSON, aucun changement. Commit `9a63951`.

---

## 📋 Backlog UI prioritaire

- **Validation runtime bandeau responsive (chantiers 13/14 — 3 mai 2026)** — Container queries + hover-zoom n'ont pas pu être validés visuellement en preview (couche `.layout` masquée par le data hub onboarding pendant la session). À tester à la prochaine session sur 3 largeurs de widget (large desktop / laptop ~1024px / mobile ~380px) + cross-thème (Cobalt → Gold Carbon → Obsidian → Cyber Neon).

## 🛠️ Refactor candidats

- **R11 (NEW post-2026-05-03) — Convergence baselines PO** : Equity graph baseline (Fixed 2.4R hardcoded via `PO_BASELINE_FIXED_TP_R`) ≠ Bilan `vsBaseline` (grid baseline qui suit le `tpFinal` toolbar). Divergence interne assumée à la livraison. Si users le signalent comme confusing, considérer un toggle "Baseline policy" (Fixed 2.4R vs Active TP) appliqué aux 2 endroits.
- **R12 (NEW post-2026-05-03) — Tooltip portal pattern** : la solution portal-to-body de `.pp-be-info-pop` / `.orr-sim-mode-info-pop` (helper `_positionInfoPop` + grace-period 150ms) pourrait s'appliquer à d'autres tooltips si le clipping `position: fixed` réapparaît ailleurs. Cause racine = stacking context créé par un ancêtre (`z-index` numérique sur élément positionné). Pattern extensible.
