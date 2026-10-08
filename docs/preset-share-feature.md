# Preset Share — Dashboard en lecture seule

> Spec d'implémentation du bouton **Share** sur le preset actif.
> Génère un lien public 7 jours qui ouvre **le vrai dashboard**, figé sur
> la section active et les trades du preset au moment du clic.
>
> Date du brief : 2026-10-08.
> Sœur de [share-link-feature.md](share-link-feature.md) (share de chip →
> trade-cards). Réutilise sa table, son RLS, son popover et son proxy OG.
>
> Phase 1 (spec + migration) : ✅ livrée le 2026-10-08 (colonne appliquée en prod).
> Phase 2 (bouton source + payload) : ✅ codée le 2026-10-08 (kill-switch `_PRESET_SHARE_ENABLED`, override `localStorage.presetShareBeta = "1"`).
> Phase 3 (mode lecture seule dans index.html) : ✅ codée le 2026-10-08 — testée en local (`?share=<id>` + simulation de l'injection Vercel, 4 sections, mobile).
> Phase 4 (route Vercel `/dash` + OG) : ✅ déployée le 2026-10-08 (`dpl_9GRnfRh7AZcPKcoUh5ev5VdrK2RJ`) — renvoie 502 tant que l'`index.html` share-mode n'est pas poussé sur github.io. Flag `_PRESET_SHARE_ENABLED = true`. og:image : edge fn `share` inchangée (eyebrow = `stats.dim` = « Global Overview »).

---

## 1. Use case

Max a un preset qui tourne bien et veut montrer **toute la vue** à la
communauté (equity, monthly, heatmaps, bars…), pas juste une liste de
trades. Clic sur **Share** à côté du preset actif → lien
`https://flipping-share-og.vercel.app/dash?id=k7d9mw2a` qui :

- Ouvre le dashboard sur **la Global Overview uniquement** — quelle que soit
  la section affichée au moment du clic (décision Max 2026-10-08, révise
  « section active »). Les autres sections ne sont ni snapshotées ni
  atteignables (onglets masqués, `set-section` bloqué).
- Affiche **exactement** les widgets, la disposition, le thème, le TP mode
  et le BE mode de Max.
- Est **figé** : aucun filtre modifiable (chips, presets, RR bubble,
  temporel), aucune édition (grille, thème, Data Setup).
- Garde les **interactions de lecture** : tooltips, hover, et le
  **drilldown** (clic sur une barre → drawer de trade-cards avec
  screenshots H4/M15/M15A + lightbox).
- **Expire après 7 jours** (server-enforced, même RLS que le share de chip).

Décisions validées par Max (2026-10-08) : vue figée · Global Overview seule ·
drilldown + screenshots inclus · 7 jours.

---

## 2. Principes (invariants)

1. **Snapshot immutable** (inchangé vs share de chip) — pas de policy `UPDATE`.
2. **Données, pas code.** Le viewer réutilise `index.html` + `dashboard.js`.
   Ceci **remplace** l'invariant §2.2 du share de chip (« viewer autonome
   pour ne pas fuiter de code métier ») pour ce type de share : `dashboard.js`
   est déjà servi publiquement sur GitHub Pages, l'isolation du *code* ne
   protège rien. Ce qui est protégé, c'est la **donnée** → whitelist §5.
3. **Le snapshot ne contient que les trades du preset.** On snapshot la
   sortie de `_getContextFiltered(true)` (preset + chips + custom chips +
   temporel + dataset A/B + BE-mgmt exclude), **pas** `appState.trades.items`.
   Les trades hors preset ne quittent jamais le navigateur de Max.
4. **Zéro écriture chez le destinataire.** Le viewer tourne sur une autre
   origine (`flipping-share-og.vercel.app`) **et** derrière un
   `localStorage`/`sessionStorage` en mémoire. Un membre qui utilise lui-même
   le dashboard sur github.io ne voit jamais ses presets/layout/thème touchés.
5. **Zéro réseau privé côté viewer.** Pas d'OAuth, pas de Notion, pas de
   sync Supabase, pas de session auth. Seul appel sortant : le RPC
   `increment_share_view` (fire-and-forget) + les images du CDN screenshots.
6. **Parcours normal intact.** Rien ne change pour un utilisateur qui ouvre
   `index.html` sans payload de share : tout le code share-mode est derrière
   un flag posé avant le chargement de `dashboard.js`.

---

## 3. Architecture

```
SOURCE — dashboard de Max (github.io)
  Topbar · preset actif  [⤴ Share]
     ↓ clic
  1. trades  = _getContextFiltered(true)            (pré-simulation)
  2. payload = _buildPresetSharePayload(trades)      (§5)
  3. INSERT public.shares { chip_kind:'preset', chip_name:<preset>,
                            stats, trades, dashboard, expires_at:+7d }
  4. Popover (réutilise _renderSharePopover*) → URL /dash?id=…

BACKEND
  public.shares (+ colonne `dashboard jsonb`, nullable)   ← phase 1
  increment_share_view(id)                                 (existant)
  Edge fn Supabase `share?img=1` → og:image                (existant, + label 'Preset')

VERCEL — flipping-share-og  GET /dash?id=…                 ← phase 4
  1. SELECT shares (anon key) — 0 ligne → page "Link expired"
  2. fetch github.io/index.html (cache mémoire, comme getScaffold())
  3. Injecte EN TÊTE de <head>, avant tout autre script :
       <base href="https://lemarsuoff.github.io/Flipping-Market-Dashboard/">
       <meta og:*>                         (nom du preset + KPI)
       <script>window.__FM_SHARE__ = { id, row }</script>   (JSON échappé)
       <script>/* shim localStorage + sessionStorage en mémoire */</script>
  4. Renvoie le HTML → le navigateur charge dashboard.js depuis github.io

VIEWER — dashboard.js en share-mode                        ← phase 3
  - window.__FM_SHARE__ présent → html.is-share-mode
  - Pré-remplit le shim avec dashboard.ls (§5.2) avant le boot
  - Parcours de boot Demo, mais loadBuiltinCSV injecte row.trades au lieu
    de DEMO_TRADES (via _injectTrades(…, 'Shared'))
  - setSection(dashboard.section) · grid static · lockdown §6
  - increment_share_view(id) fire-and-forget (fetch REST, pas de client auth)
```

**Pourquoi le payload est inliné par Vercel** (et pas fetché par le
client) : le script pré-paint d'`index.html` (ligne ~12) et le top-level de
`dashboard.js` lisent le `localStorage` **de manière synchrone au parse**.
Le shim doit être rempli avant. Un fetch async imposerait de charger
`dashboard.js` dynamiquement (→ `DOMContentLoaded` déjà passé, ~5 listeners
à rejouer) et de modifier le parcours normal. L'inline garde tout
synchrone et le parcours normal intact.

**Fallback dev (localhost)** : `index.html?share=<id>` sans payload inliné →
le script de tête fait une XHR **synchrone** vers PostgREST pour remplir
`__FM_SHARE__`. Accepté uniquement pour tester en local (warning console
« sync XHR deprecated »), le lien public passe toujours par Vercel.

---

## 4. Supabase

Migration `20261008000000_shares_dashboard_column.sql` :

```sql
alter table public.shares add column if not exists dashboard jsonb;
```

- Nullable, additive → aucun backfill, aucun impact sur les shares de chip.
- RLS existante inchangée (lecture publique tant que non expiré, insert
  propriétaire, delete propriétaire, pas d'update).
- `chip_kind = 'preset'` identifie ce type de share. `chip_name` = nom du
  preset. `stats` = KPI de la vue (alimente og:description + og:image).
- `share.js` (viewer trade-cards) : si `chip_kind === 'preset'` →
  redirige vers `/dash?id=` (les trades n'ont pas le même shape).

---

## 5. Payload

### 5.1 `trades` jsonb — trades normalisés, whitelistés

Shape = celui de `appState.trades.items` (pour que les renderers tournent
sans adaptation), **restreint** à :

| Gardé | Pourquoi |
|---|---|
| `date, month, exitDate, pair, setup, setupDetail, session, sessionUtc, day, hour, timeUtc1, direction, tradeType, badFeeling, invalide` | dimensions des widgets |
| `outcome, outcomeRaw, r, rrMax, tp1_rr, tp2_rr, tp3_rr, beManagement` | classification + simulation TP/BE |
| `obstacles, h4` | heatmaps / bars obstacles |
| `imgM15, imgH4Before, imgM15After` (+ `*Orig`) | drilldown — **pré-résolus** via `_shareResolveMediaSlot` (URL Supabase permanente) |
| `extras[k]` **seulement** pour les clés utilisées par un widget visible de la section ou par `tradeCardFields` | widgets custom / champs de card |

| Exclu | Pourquoi |
|---|---|
| `tradeId` → remplacé par `share:<index>` | identifiant interne |
| `_notionId`, `notionUrl` | fuite de la DB Notion (le lien « Open in Notion » est masqué en share-mode) |
| tout `extras[k]` non référencé | peut contenir notes / commentaires perso |
| annotations lightbox | perso, hors scope v1 |

**Taille** : ~1–1.5 KB/trade → 500 trades ≈ 750 KB. Garde-fou : refus côté
source au-delà de **3 MB** sérialisés (message « Preset too large to share »).

### 5.2 `dashboard` jsonb

```jsonc
{
  "v": 1,
  "section": "global",            // appState.ui.activeSection
  "htfSource": "m15",             // m15 | h4
  "presetName": "London A+",
  "snapshotAt": "2026-10-08T14:02:11Z",
  "ui": {                          // état appState.ui qui influence le rendu
    "tpConfig": { … },
    "rrMinFilter": null,           // ré-appliqué par getFiltered()
    "beManagementExclude": [],
    "showRawAll": false
  },
  "ls": {                          // clés LS (nom de base, sans suffixe profil/HTF)
    "flipping_dashboard_theme": "…",
    "flipping_active_theme_meta": "…",
    "flipping_typo_mode": "…",
    "flipping_be_mode": "…",
    "flipping_bar_mode": "…", "flipping_bar_view": "…", "flipping_bar_color_mode": "…",
    "flipping_orr_sim_mode": "…", "colorblind_mode": "…", "warningThreshold": "…",
    "gs_layout_active_": "…",      // layout de la section active seulement
    "gs_hidden_widgets_": "…",
    "flipping_custom_widgets_": "…", // seulement les w-cust-* de la section
    "flipping_notion_properties_": "…", // seulement les props des widgets custom gardés
    "tradeCardFields_v1_": "…",
    "screenshotOrder_v1_": "…",
    "po_saved_partials_v1_": "…"   // seulement si section = partials
  }
}
```

- **Allowlist stricte** (`_PRESET_SHARE_LS_ALLOWLIST`), jamais un dump du LS :
  pas de tokens, pas d'`apiFieldOverrides`, pas d'`outcomeValueMapping`, pas
  de presets/snapshots, pas de `journalProfiles`.
- Les clés profil-scopées sont ré-écrites côté viewer sur le slot du
  profil Demo (`<prefix>__demo`, + `_h4` si `htfSource = h4`) pour que le
  parcours de boot Demo les lise sans code spécifique.
- La liste exacte des clés lues par chaque widget de chaque section est à
  **confirmer en phase 2** par grep (ex : inputs du Prop Optimizer
  per-profile, réglages ORR). Toute clé manquante = widget rendu avec ses
  défauts → visible au test golden-path.

### 5.3 `stats` jsonb

Même shape que le share de chip (`trades, wins, losses, winrate, netR,
avgR, profitFactor`) calculé sur la sortie de `getFiltered()` (post-
simulation, = la topbar de Max). Sert l'OG et la bannière du viewer.

---

## 6. Lockdown (share-mode)

Flag : `window.__FM_SHARE__` (posé avant `dashboard.js`) →
`document.documentElement.classList.add('is-share-mode')` + helper
`_isShareMode()`.

**Masqué (CSS `html.is-share-mode …`)**
- Sidebar filtres (chips) en entier · barre de presets · onglets des autres
  sections · bouton Share (vue) · Data hub / Data Setup / attention badge ·
  theme editor / typography · sign-in / profil · bouton Share de la drawer ·
  export PDF · « Open in Notion » · menus widget (hide, settings, builder) ·
  mini-sidebar grid.

**Neutralisé (guards JS, early-return si `_isShareMode()`)**
- Clic chip / right-click Include-Exclude (bars, heatmaps, custom bars).
- `applyPreset`, RR bubble (`_rrFilterBubbleClick`), filtres temporels.
- GridStack : `_grid.setStatic(true)`, pas de save de layout.
- Les `data-action` sont filtrées par une **allowlist** (`_SHARE_MODE_ALLOWED_ACTIONS`) :
  seuls l'affichage (tris, onglets, modes de vue) et le drilldown passent.
  Tout le reste (filtres, presets, sections, édition, settings, exports,
  contrôles `po-*`) est bloqué. `contextmenu` est intercepté en capture.
- Les inputs des simulateurs (Prop Optimizer, Monte Carlo, champs du PO)
  restent manipulables : ils ne changent pas le jeu de trades et rien
  n'est persisté (localStorage en mémoire).
- `_SW` : pas de client Supabase auth, pas de sync, pas d'`_autoOpenSignIn`.
- Notion fetch / OAuth / media queue : jamais déclenchés.

**Conservé**
- Tooltips, hover, zoom/pan Chart.js.
- Drilldown → `wd-drawer` (trade-cards + lightbox + nav clavier).

**Ajouté**
- Bannière fixe en haut : `Shared preset · <presetName> · <N> trades ·
  snapshot <date> · expires in <Xd>` + lien « Flipping Research ».
- États vides : id invalide / expiré → page « This link has expired or
  doesn't exist » (servie par Vercel, avant même de charger le dashboard).

---

## 7. Fidélité — écarts connus et acceptés

- Les widgets qui lisent `appState.trades.items` directement (≈68 sites)
  voient **le preset** comme univers complet, pas l'historique total de Max.
  Une comparaison « sélection vs total » affichera donc preset vs preset.
  Accepté : c'est le prix de l'invariant §2.3 (ne jamais exposer les trades
  hors preset).
- Le compteur de chips / la sidebar ne sont pas visibles (masqués).
- Les annotations lightbox ne sont pas partagées.
- Les URLs de screenshots contiennent l'ID de page Notion
  (`<pageId>_m15_before.png`) — déjà le cas pour le share de chip ; un ID
  de page seul ne donne aucun accès au workspace.
- Le format `dashboard.ls` est groupé par scope (`global` / `htf` /
  `profile`) depuis `v: 2`. Les shares `v: 1` (tests du 2026-10-08)
  s'ouvrent sans réglages LS (thème / layout par défaut + `dashboard.layout`).
- Seule écriture dans le vrai storage du viewer : `share_seen_<id>`
  (garde « 1 vue par navigateur », même règle que le viewer trade-cards).

---

## 8. Découpage

| Phase | Contenu | Fichiers |
|---|---|---|
| 1 | Spec + migration | `docs/preset-share-feature.md`, `supabase/migrations/20261008000000_…` |
| 2 | Bouton Share topbar, `_buildPresetSharePayload`, allowlist LS, insert, popover (réutilisé), cache URL (`flipping_share_url_cache_v1`, clé `preset:<id>|<_filterStateKey()>|n|netR`) | `dashboard.js`, `dashboard.css`, `index.html` |
| 3 | Script de tête share-mode (shim + fallback dev), boot Demo détourné, lockdown CSS/JS, bannière, redirect `share.js` pour `chip_kind='preset'` | `index.html`, `dashboard.js`, `dashboard.css`, `share.js` |
| 4 | Route Vercel `/dash` (injection head + OG + page expirée), label `Preset` dans l'og:image | `docs/share-og-vercel/`, `supabase/functions/share/` |

Golden-path de validation (phase 3+4) : partager chaque section
(global, concurrent-positions, optimal-rr, partials) en M15 **et** H4,
ouvrir le lien dans une fenêtre privée puis dans un navigateur où le
dashboard est déjà utilisé → vérifier rendu identique + LS github.io
intact + drilldown + screenshots.

---

## 9. Out of scope

- ❌ Vue interactive (filtrer dans le snapshot) — décidé figé.
- ❌ Plusieurs sections dans un même lien.
- ❌ Révocation / liste « Mes shares » (même dette que le share de chip).
- ❌ Expiration custom.
- ❌ Partage des annotations lightbox.
