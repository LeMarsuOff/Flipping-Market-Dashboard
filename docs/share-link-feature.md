# Share Link — Trade Cards

> Spec d'implémentation pour le bouton **Share** dans la drawer de drilldown.
> Permet à Max de générer un lien public 7-jours pointant vers la **liste
> filtrée de trade-cards** d'un chip donné — sans exposer le reste du
> dashboard.
>
> Date du brief : 2026-05-26.
> Phase 1 (backend + spec) : ✅ livrée le 2026-05-26.
> Phase 2 (source-side button) : ✅ livrée le 2026-05-26.
> Phase 3 (viewer page) : ✅ livrée le 2026-05-26.

---

## 1. Use case

Max identifie un chip qui marche bien (ex: "Contre Order Flow", +43.8R sur
48 trades) et veut le partager à la communauté pour discussion. Cliquer
sur **Share** dans la drawer génère un lien `share.html?id=k7d9mw2a` qui :

- Affiche le **nom du chip** en watermark central
- Affiche **5 stats clés** (trades · winrate · netR · avgR · profit factor)
- Affiche la **drawer complète** (trade-cards avec screenshots H4/M15/M15A)
- Permet d'ouvrir un screenshot en cliquant l'icône caméra
- **N'expose RIEN d'autre** du dashboard (pas de KPI bar, pas de widgets,
  pas de filtres autres)
- **Expire après 7 jours** (server-enforced)

Le destinataire n'a pas besoin de compte. Le lien est unlisted (= shareable
publiquement, qui-conque-le-connaît-y-accède). Cohérent avec l'usage
communauté (~600 membres) et l'absence d'authentification côté lecteur.

---

## 2. Principes (invariants)

1. **Le snapshot est immutable.** Une fois créé, le contenu d'un share ne
   change jamais — même si Max modifie/supprime des trades dans Notion.
   Implémentation : `UPDATE` bloqué par absence de policy RLS.
2. **Le viewer est une page autonome** (`share.html`), pas le dashboard.
   Aucun bundle commun avec `index.html` qui pourrait fuiter du code
   métier sensible (filtres, calculs, mappings).
3. **Aucune donnée brute Notion n'est exposée.** Seuls les champs déjà
   visibles dans la trade-card UI sont snapshotés (pair, date, side,
   outcome, R, RR_max, style, session, obstacles, URLs media).
4. **Les screenshots restent sur leur CDN Supabase d'origine** (table
   `notion_media_cache`). Le share ne dupplique pas les fichiers — il
   référence leurs URLs permanentes.
5. **Le titre watermark = le chip cliqué uniquement.** Même si d'autres
   filtres sont actifs (preset, RR bubble, section filter, etc.), le
   watermark affiche le nom du chip qui a déclenché l'ouverture de la
   drawer. **La drawer côté droite, elle, affiche bien l'intersection
   complète** (= ce que Max voit au moment du clic Share).
6. **Expiration server-enforced.** La policy RLS `expires_at > now()`
   garantit qu'un lien expiré renvoie zéro ligne même avant que le cron
   de purge ne le supprime.

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ SOURCE — Max's dashboard (index.html)                              │
│                                                                    │
│   .wd-drawer (open via chip click)                                 │
│     └─ .wd-drawer-head                                             │
│         ├─ title + sub                                             │
│         ├─ +43.8R total                                            │
│         └─ [Share] button ← NEW (icon-only, link icon)             │
│              ↓ click                                               │
│         .share-popover (anchored below)                            │
│             ├─ URL + Copy button                                   │
│             ├─ "Active · expires in 7d"                            │
│             └─ "N views"                                           │
│                                                                    │
│   On click "Share":                                                │
│     1. Generate 8-char base62 short ID (client-side)               │
│     2. Build snapshot payload (see §5)                             │
│     3. INSERT into public.shares (auth required)                   │
│     4. On success → render popover with URL                        │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              ↕
┌────────────────────────────────────────────────────────────────────┐
│ BACKEND — Supabase                                                 │
│                                                                    │
│   public.shares (RLS-enabled)                                      │
│     - SELECT: anyone, non-expired only                             │
│     - INSERT: authenticated, own row only                          │
│     - DELETE: owner only                                           │
│     - UPDATE: blocked                                              │
│                                                                    │
│   public.increment_share_view(id) — security definer RPC           │
│     Bumps view_count by 1, no auth required.                       │
│                                                                    │
│   pg_cron job (weekly):                                            │
│     DELETE FROM shares WHERE expires_at < now() - interval '1 day' │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
                              ↕
┌────────────────────────────────────────────────────────────────────┐
│ RECIPIENT — share.html?id=k7d9mw2a                                 │
│                                                                    │
│   Standalone HTML page (NOT the dashboard).                        │
│                                                                    │
│   On load:                                                         │
│     1. Parse ?id= from URL                                         │
│     2. SELECT from public.shares WHERE id = ?                      │
│     3. If 0 rows → "Link expired" empty state                      │
│     4. If 1 row → render watermark + drawer + cards                │
│     5. Call increment_share_view(id) fire-and-forget               │
│                                                                    │
│   Layout (matches mockup share-link-viewer.html):                  │
│     ┌──────────────────────────────────┬──────────────────┐        │
│     │  WATERMARK                       │  DRAWER          │        │
│     │  chip eyebrow (kind)             │  head: title +   │        │
│     │  CHIP NAME (Anybody, 34-52px)    │       sub + R    │        │
│     │  5 stats (mono labels)           │  body: cards     │        │
│     │  ← Click camera CTA              │       with cams  │        │
│     └──────────────────────────────────┴──────────────────┘        │
│                                                                    │
│   On camera-icon click → swap watermark for the screenshot image.  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Supabase schema

Migration : `20260526_create_shares_table` (livrée).

```sql
create table public.shares (
  id            text primary key,         -- 8-char base62, client-generated
  created_by    uuid not null references auth.users(id) on delete cascade,
  chip_name     text not null,            -- watermark title
  chip_kind     text not null,            -- categorization (see below)
  stats         jsonb not null,           -- pre-computed for watermark
  trades        jsonb not null,           -- snapshot array
  view_count    integer not null default 0,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);
```

**Indexes** : `expires_at`, `created_by`.

**chip_kind taxonomy** (kept open for future) :
`h4_obstacle | m15_obstacle | setup | pair | session | trade_style | rr_bucket | session_time | custom`

**RLS policies** :
- `shares_public_read` — `SELECT` autorisé pour tous (anon inclus) tant que
  `expires_at > now()`.
- `shares_authenticated_insert` — `INSERT` réservé à `auth.uid()` propriétaire.
- `shares_owner_delete` — `DELETE` réservé au créateur (pour un futur "Revoke").
- Pas de policy `UPDATE` → snapshot immutable.

**RPC** : `increment_share_view(p_share_id text)` — security definer,
`grant execute to anon, authenticated`. Bump du view_count.

> **Note linter** : le RPC est flaggé par `anon_security_definer_function_executable`.
> **Intentionnel** : le viewer anonyme doit pouvoir incrémenter le compteur.
> Surface d'attaque limitée à "inflate view_count sur un ID connu" — bénin.
> Si abus constaté plus tard, ajouter rate limit IP côté edge function.

---

## 5. Snapshot payload

### `stats` jsonb

```jsonc
{
  "trades": 48,                  // count
  "wins": 27,
  "losses": 21,
  "winrate": 56.25,              // %
  "netR": 43.8,
  "avgR": 0.913,
  "profitFactor": 2.15
}
```

> Pré-calculé au moment du Share pour que le viewer n'ait pas à
> recalculer (= pas besoin d'embarquer `calcStats` / `filterDataset`
> côté `share.html`). Une seule source de vérité = la valeur affichée
> dans le topbar de Max au moment du clic.

### `trades` jsonb — array of trade snapshots

Chaque entrée contient **uniquement** ce qui s'affiche sur la trade-card.
Aucun champ raw Notion, aucune métadonnée de mapping, aucun ID interne.

```jsonc
{
  "pair": "EURAUD",
  "date": "2025-09-02",
  "side": "Vente",                // localized as already in UI
  "outcome": "TP",                // TP | SL | BE-TP | BE-SL
  "r": 2.4,                       // effective R (post-BE-mode resolution)
  "rrMax": 10.2,
  "style": "Re-confirmation X — Type A",
  "session": "New-York",
  "sessionTime": "16:00",
  "obsH4": ["1 Candle PB Sweep", "Contre Order Flow", "Sweep – Internal", "Volume – Mèche"],
  "obsM15": ["1 Candle Pull-back Break", "1 Candle Pull-back Sweep"],
  "media": {                      // permanent_url from notion_media_cache
    "h4":   "https://...supabase.../h4/...",
    "m15":  "https://...supabase.../m15/...",
    "m15a": "https://...supabase.../m15a/..."
  }
}
```

**Champs exclus du snapshot** (et pourquoi) :
- Notion page ID → fuite l'identifiant interne, inutile au viewer.
- Outcome value mapping → fuite la config du user (`outcomeValueMapping_*`).
- Template ID / detection → fuite la structure de la DB Notion.
- TP config / partial sim slots → champs analytique, pas affichés dans la card.
- Raw timestamps précis (`last_edited_time` etc.) → pas affichés.

**Taille estimée** : ~1.5 KB par trade (média URLs incluses).
Pour 100 trades : ~150 KB.
Pour 1000 shares × 200 KB moyen = 200 MB → bien dans les 500 MB du free tier.

---

## 6. Lifecycle du lien

```
T+0     INSERT → expires_at = now() + interval '7 days'
T+1d    Lecture OK, view_count++
T+6d    Lecture OK
T+7d    expires_at atteint
        ↓
        SELECT policy returns 0 rows immediately
        Viewer affiche "Link expired" empty state
T+8d    pg_cron weekly purge (dimanche 03:00 UTC)
        DELETE FROM shares WHERE expires_at < now() - interval '1 day'
        → row physiquement supprimée
```

> Note : il y a une fenêtre de 0–7 jours entre l'expiration et la purge,
> mais la row expirée est invisible (RLS) — cette fenêtre ne pose aucun
> souci, c'est juste du garbage qui sera ramassé bientôt.

---

## 7. Décisions à valider plus tard (non-bloquantes pour phase 1)

- **pg_cron** n'est pas installé sur ce projet Supabase. Le purge job
  weekly est inactif tant que l'extension n'est pas activée via le
  dashboard Supabase. Pas urgent — la RLS rend les rows expirées
  invisibles dès `now()`. La purge physique peut attendre que le volume
  justifie l'extension.
- **Revoke UX** — pas de bouton "Delete this share" dans la phase 2 du
  MVP. Si besoin, ajout futur dans un panel "Mes shares actifs".
- **Rate limit côté create-share** — pas de limite au MVP. Si abus :
  edge function avec quota par user / par IP.
- **Custom expiration** (3j / 30j / 90j picker au moment du Share) —
  décidé à 7j fixe pour l'instant. Réouverture éventuelle si la
  communauté demande.

---

## 8. Phase 2 — Source-side button (session suivante)

Localisation : `dashboard.js`, dans le renderer de `.wd-drawer-head`.

### 8.1 Changements `dashboard.js`

- Nouveau bloc HTML dans `.wd-drawer-head-side` : bouton icon-only (link
  icon, 32×32, bg bleu `--gold` ou `--b`) — voir mockup
  `mockups/share-link-viewer.html` état "Source · Your drawer".
- Visible uniquement si :
  - `_currentUser()` est authentifié (sinon le INSERT échouera)
  - `appState.trades.items.length > 0` côté drawer (sinon rien à partager)
- Au clic :
  1. Calculer le snapshot via `_buildSharePayload(chipName, chipKind, drawerTrades)`
     (nouvelle fonction).
  2. Générer un short ID 8-char base62 random.
  3. POST `supabase.from('shares').insert(...)`.
  4. En succès → render popover avec URL `https://lemarsuoff.github.io/Flipping-Market-Dashboard/share.html?id=<id>`.
  5. En échec → toast erreur.
- Popover :
  - URL en input readonly.
  - Bouton Copy → `navigator.clipboard.writeText(url)`.
  - Status line "● Active · expires in 7d · 0 views".
  - Fermeture par clic hors-popover.

### 8.2 Build snapshot — sites à reuser

| Pour | Fonction existante |
|---|---|
| Trade list filtrée actuelle | `filterDataset(appState.trades.items, ...)` @13386 |
| Stats agrégées | `calcStats(filteredTrades, tpConfig)` @13756 |
| Effective R | `computeEffectiveRR(trade, tpConfig)` @4682 |
| BE resolution | `_resolveBEDecision(trade, beMode)` @25091 |
| Permanent media URL | depuis `notion_media_cache` join (déjà en cache local) |

### 8.3 Chip kind detection

Détecter `chipKind` à partir du DOM / state qui a ouvert la drawer :
- Click sur `[data-section="obs-h4"]` → `h4_obstacle`
- Click sur `[data-section="obs-m15"]` → `m15_obstacle`
- Click sur `[data-section="setup"]` → `setup`
- Click sur `[data-section="pair"]` → `pair`
- ... etc.
- Fallback : `custom`.

---

## 9. Phase 3 — Viewer page (session d'après)

### 9.1 Nouveau fichier : `share.html`

Standalone, **PAS un import** du dashboard. CDN Supabase JS uniquement.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Trade Cards — Flipping Research</title>
  <link rel="stylesheet" href="share.css?v=1">
</head>
<body>
  <div id="root"></div>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="share.js?v=1"></script>
</body>
</html>
```

### 9.2 `share.css`

Forké du mockup `mockups/share-link-viewer.html` — palette warm sand
light, drawer cream, watermark cream-lighter. **Pas de dépendance à
`dashboard.css`** pour garantir l'isolation.

### 9.3 `share.js`

```js
// Pseudo-code
const params = new URLSearchParams(location.search);
const id = params.get('id');
if (!id) renderError('invalid');

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { data, error } = await sb
  .from('shares')
  .select('chip_name, chip_kind, stats, trades, expires_at, view_count')
  .eq('id', id)
  .maybeSingle();

if (!data) renderError('expired');
else {
  renderWatermark(data);
  renderDrawer(data.trades);
  // fire-and-forget view bump
  sb.rpc('increment_share_view', { p_share_id: id });
}
```

### 9.4 Empty states

- `?id=` manquant → "Invalid link" + back-to-home link.
- 0 rows retournés → "This link has expired or doesn't exist."
- Erreur réseau → "Couldn't load the trade cards. Try refreshing."

---

## 10. Sécurité & abus

| Risque | Mitigation |
|---|---|
| Anyone with link can read | C'est le design (unlisted public). |
| Inflate view_count via scripts | Pas de mitigation MVP. Si abus : rate limit côté RPC. |
| Inflate row count via mass INSERT | Auth requise pour INSERT. Si abus : rate limit par user. |
| Old expired rows occupent l'espace | RLS les masque immédiatement ; pg_cron weekly les purge. |
| Snapshot contient des médias privés | Les URLs Supabase media sont déjà publiques (CDN). Pas de régression. |
| Snapshot contient des notes perso | **Exclu par design** (cf §5). |
| Hijack du créateur (RLS bypass) | Policies vérifient `auth.uid() = created_by` à l'INSERT. |

---

## 11. Out of scope (explicite)

- ❌ Partage d'un widget autre que la drawer trade-cards (ex: equity
  curve, PNL calendar). Si demandé plus tard, feature séparée.
- ❌ Partage d'un trade unique (single trade page). Aujourd'hui, le
  share = liste de trades issus d'un chip.
- ❌ Commentaires / réactions sur les shares.
- ❌ Édition / mise à jour d'un share (snapshot immutable par design).
- ❌ Auth requise côté viewer.
- ❌ Custom expiration picker.
