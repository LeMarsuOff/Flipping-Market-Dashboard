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
