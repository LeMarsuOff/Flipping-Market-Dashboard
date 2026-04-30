# Current Roadmap — Flipping Market Dashboard

> Suivi des chantiers livrés et à venir sur le Partial Optimizer et le dashboard.
> Pour le détail des règles métier, voir `docs/business-rules.md`.
> Pour la cartographie fichiers, voir `docs/file-map.md`.

---

## PRs livrées

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
