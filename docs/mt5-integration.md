# MT5 Integration — Spec

> Spec de l'intégration MetaTrader 5 (et, par extension, MT4) comme
> **source de trades automatique, indépendante de l'appareil**.
>
> **Statut : design — pré-code.** Direction d'archi tranchée avec Max
> (2026-07-04). Le modèle économique du token (§5) reste à trancher,
> mais **ne bloque pas** le socle (backend, schéma, front-read sont
> identiques quel que soit ce choix).
>
> Dépend de : registry `INTEGRATIONS` (2026-05-19), socle Supabase
> journal-evolution P0 (2026-06-09, `trade_overlays`/RLS).
> Voir aussi : [journal-evolution.md](journal-evolution.md),
> `mockups/integrations-vs-profiles.html`, DECISIONS.md 2026-05-19.
>
> Date du brief : 2026-07-04.

---

## 1. Le problème (et pourquoi l'EA ne suffit pas)

Max veut que les trades MT5 de ses membres remontent **automatiquement**
dans le dashboard, **à chaque prise de position**, **quel que soit
l'appareil**.

Contrainte dure remontée par Max : **la grande majorité des membres
tradent uniquement depuis l'app mobile MT5.** Ils n'ouvrent jamais le
terminal MT5 desktop.

Conséquence technique décisive :

| Mécanisme | Où il tourne | Mobile-only ? |
|---|---|---|
| **Expert Advisor (EA)** `.ex5` | Dans le terminal MT5 **desktop** (ou un VPS perso) | ❌ **Non** — l'app mobile est un client fermé, aucun EA/plugin |
| **Bridge côté serveur** (MetaApi) | Sur les serveurs de MetaApi, connecté au serveur du broker | ✅ **Oui** — indépendant de l'appareil du user |
| **Import CSV / relevé** | Manuel | ✅ Oui, mais **pas automatique** |

Le seul moyen de lire un compte MT5 **automatiquement et sans que
l'appareil du user fasse quoi que ce soit** est une **connexion côté
serveur au serveur du broker**, via `login` + **mot de passe investisseur
(lecture seule)** + `nom du serveur broker`.

Faire cette connexion soi-même = faire tourner des instances de terminal
MT5 côté serveur (ferme de terminaux) → ingérable à 600 users.
**MetaApi.cloud opère cette ferme pour nous** (modèle identique à Myfxbook
AutoSync / FX Blue / TradeZella).

### Décision (2026-07-04)

- **Chemin principal : bridge côté serveur via MetaApi.cloud.** Mobile
  inclus, auto, temps quasi-réel.
- **Auth : mot de passe investisseur (lecture seule uniquement).** Ne peut
  jamais passer d'ordre. Max a validé ce compromis.
- **L'EA MQL5 maison est reclassé en bonus Phase 2** (optionnel, pour les
  power-users desktop qui veulent éviter tout tiers — cf. §9).

---

## 2. Principes (invariants — ne jamais casser)

Hérités de [journal-evolution.md](journal-evolution.md) §2, spécialisés MT5 :

1. **Lecture seule, toujours.** On ne demande jamais le mot de passe
   maître. Le mot de passe investisseur ne peut pas trader. Aucun chemin
   d'écriture vers le broker n'existe dans le code.
2. **Le mot de passe investisseur ne transite ni ne se stocke jamais dans
   Supabase.** Il est envoyé une seule fois à MetaApi au provisioning
   (TLS), MetaApi le détient. Nous ne stockons qu'un `metaapi_account_id`
   opaque (cf. §6, §8).
3. **La donnée broker brute n'est jamais écrasée par le dashboard.** Les
   trades MT5 synchronisés sont read-only. Tout enrichissement (setup SMC,
   contexte HTF, screenshots, notes) vit dans `trade_overlays`, additif.
4. **ID stable = `positionId` MT5.** Clé de tout (overlays, médias, sync).
   Cf. journal-evolution §2.3 (`notionPageId | mt4Ticket | uuid`).
5. **Idempotence du sync.** Re-synchroniser n'duplique jamais un trade :
   upsert sur `(user_id, profile_id, position_id)`.
6. **Empty / error / loading states obligatoires** (compte non connecté,
   token révoqué, broker injoignable, aucun trade dans la fenêtre).
7. **Quotas & secrets côté serveur.** Un client modifié ne peut pas lire
   le token MetaApi d'un autre user (RLS + service_role, cf. §8).

---

## 3. La synergie à deux couches (le cœur du produit)

MT5 donne l'**exécution objective**. Le dashboard de Max apporte le
**journaling discrétionnaire SMC**. Le socle `trade_overlays` de P0 branche
déjà les deux :

```
┌─ Couche SOURCE (read-only, vient du broker via MetaApi) ─────────┐
│  positionId, symbol, entry/exit price & time, volume, profit,    │
│  commission, swap, SL/TP posés, side (buy/sell)                  │
└──────────────────────────────────────────────────────────────────┘
                    │  join sur position_id
                    ▼
┌─ Couche OVERLAY (écrite par le user dans le dashboard) ──────────┐
│  setup SMC, session, HTF context, obstacles, screenshots,        │
│  R manuel si SL non posé (cf. §7), notes                         │
│  → table trade_overlays (user_id, profile_id, source_trade_id)   │
└──────────────────────────────────────────────────────────────────┘
```

**Ce que MT5 ne donnera jamais** : le setup, le contexte HTF, les
screenshots, la lecture SMC. C'est précisément la valeur ajoutée du
journal → saisie par le user, stockée en overlay. MT5 remplace la saisie
**mécanique** (paires, prix, dates, P&L), pas la saisie **analytique**.

---

## 4. Architecture cible

```
  App mobile MT5 (user)                    Terminal desktop MT5 (optionnel)
        │  trade                                   │
        ▼                                          ▼
┌──────────────────────────────────────────────────────────┐
│  Serveur du BROKER (FTMO, etc.)                           │
└──────────────────────────────────────────────────────────┘
        │  connexion lecture seule (login + investor pwd + server)
        ▼
┌──────────────────────────────────────────────────────────┐
│  MetaApi.cloud  — détient la connexion, expose REST/stream│
└──────────────────────────────────────────────────────────┘
        │  pull REST (deal history) — déclenché serveur
        ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase Edge Function `mt5-sync`  (service_role)        │
│   1. lit les connexions actives (mt5_connections)         │
│   2. appelle MetaApi avec le token du user                │
│   3. agrège deals → positions                             │
│   4. upsert trades_synced (source='mt5')                  │
└──────────────────────────────────────────────────────────┘
        │  écrit
        ▼
┌──────────────────────────────────────────────────────────┐
│  Supabase Postgres  — trades_synced + trade_overlays      │
└──────────────────────────────────────────────────────────┘
        │  read (RLS auth.uid()=user_id)
        ▼
┌──────────────────────────────────────────────────────────┐
│  Dashboard (statique) — getIntegration('mt5') → normalise │
│   → appState.trades.items[]  (miroir du chemin Notion)    │
└──────────────────────────────────────────────────────────┘
```

**Déclenchement du pull.** Un **Edge Function schedulée** (via `pg_cron`,
déjà un TODO Active) tourne toutes les N minutes, parcourt les connexions
actives, pull les nouveaux deals depuis MetaApi, upsert. Le streaming
temps-réel MetaApi est plus lourd (connexion persistante stateful) →
**hors scope Phase 1** ; un pull toutes les ~5 min est largement suffisant
pour un journal (la latence n'est pas critique). Cf. §11 (coût de
déploiement MetaApi vs fréquence de pull).

**Pourquoi une Edge Function et pas le proxy Vercel.** Le proxy
`notion-dashboard-api-2` est un pont Notion read-only stateless. L'ingest
MT5 doit : détenir un secret (token MetaApi) hors du client, écrire en base
avec `service_role`, tourner sur schedule. L'Edge Function Supabase coche
les trois (proximité DB, secrets serveur, cron natif). Cf. DECISIONS
2026-05-19 (« per-broker secret handling »).

---

## 5. Modèle de token & coût — **DÉCISION MAX, à trancher**

MetaApi est un service **payant** : ~5–10 $/compte/mois pour un compte
*déployé* (connexion permanente), avec une petite franchise gratuite
(≈ 1 compte par token). *(Chiffres à re-vérifier sur la page pricing live
au moment de coder — page en JS, non lisible en fetch.)*

Trois modèles possibles. **Le socle technique (§4, §6, §7, §9) est
identique dans les trois** — seule change la couche onboarding/facturation :

| Modèle | Coût pour Max | UX onboarding user | Verdict |
|---|---|---|---|
| **A. Managé** (Max détient 1 token maître, le backend provisionne tous les comptes) | ~5–10 $/compte/mois × N → **intenable en gratuit** (200 users ≈ 1–2 k$/mois) | Idéale : user colle 3 champs, le backend fait tout | ❌ sauf si monétisé |
| **B. BYO-token** (chaque user crée son compte MetaApi gratuit, colle *son* token) | **0 $** | Lourde : inscription MetaApi par user (dur pour du mobile non-tech) | ✅ viable gratuit, friction élevée |
| **C. Premium** (sync = feature payante ; le revenu couvre le modèle A) | Couvert par les abonnés | Idéale (comme A) | ✅ si Max ouvre un tier payant |

**Recommandation** : concevoir le socle **agnostique** (le token MetaApi est
une donnée de `mt5_connections`, peu importe qui l'a créé). Reporter le choix
A/B/C au moment d'exposer la feature. Décider tôt uniquement : *où* le token
est saisi (UI) — mais même ça, c'est un seul champ dans l'éditeur MT5.

> ⚠️ **À trancher par Max avant la Phase « exposition publique »** — pas
> avant. Le spike (§10 Phase 1) se fait sur le propre compte FTMO de Max,
> donc modèle A à l'échelle 1 = gratuit (franchise).

---

## 6. Schéma Supabase (nouvelles tables)

Réutilise les conventions P0 : PK composite `(user_id, profile_id[, …])`,
RLS `auth.uid() = user_id`, `deleted_at` soft-delete, trigger
`auto_bump_updated_at`. Migration `supabase/migrations/<ts>_mt5_integration.sql`.

### 6.1 `mt5_connections` — un compte broker lié à un profil

```sql
create table if not exists public.mt5_connections (
  user_id            uuid not null references auth.users(id) on delete cascade,
  profile_id         text not null,
  metaapi_account_id text not null,          -- id opaque provisionné chez MetaApi
  broker_server      text not null,          -- ex. "FTMO-Server"
  login              text not null,          -- n° de compte MT5 (public, pas secret)
  region             text,                   -- région de déploiement MetaApi
  state              text not null default 'provisioning'
                       check (state in ('provisioning','deployed','undeployed','error','revoked')),
  history_start      date,                   -- ne pas synchroniser avant cette date
  last_synced_at     timestamptz,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  primary key (user_id, profile_id),
  constraint mt5_connections_profile_fk
    foreign key (user_id, profile_id) references public.journal_profiles(user_id, id) on delete cascade
);
```

> **Le mot de passe investisseur et le token MetaApi ne sont PAS ici.**
> Cf. §8 pour le stockage sécurisé du token (Vault / table service_role).

### 6.2 `trades_synced` — trades venus d'une source externe automatique

Générique (`source` ∈ mt5/mt4/ctrader) plutôt que `mt5_trades` dédié →
future-proof pour cTrader/MT4 sans nouvelle table. Distinct de
`trades_native` (créés *dans* le dashboard) : ceux-ci viennent du broker,
read-only.

```sql
create table if not exists public.trades_synced (
  user_id      uuid not null references auth.users(id) on delete cascade,
  profile_id   text not null,
  source       text not null check (source in ('mt5','mt4','ctrader')),
  position_id  text not null,                -- positionId broker = ID stable
  props        jsonb not null default '{}'::jsonb,  -- payload normalisé (§7)
  closed_at    timestamptz,                  -- pour l'index temporel / fenêtres
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, profile_id, position_id),
  constraint trades_synced_profile_fk
    foreign key (user_id, profile_id) references public.journal_profiles(user_id, id) on delete cascade
);
-- Index : lecture par profil, tri temporel, containment jsonb (miroir P0).
```

RLS : `select`/`insert`/`update` `auth.uid() = user_id` (comme
`trades_native`). Pas de policy `delete` (soft-delete). **L'`insert`/`update`
réel vient de l'Edge Function en `service_role`** (bypass RLS) ; la policy
`select own` permet au dashboard de lire.

### 6.3 Réutilisation de `trade_overlays` (déjà en place)

Aucune nouvelle table pour l'enrichissement : les overlays MT5 se posent sur
`source_trade_id = position_id`. Le commentaire de la migration P0 anticipe
déjà « trade lives in … MT5 ». **Rien à changer côté overlays.**

---

## 7. Contrat de normalisation (deal MT5 → trade dashboard)

C'est le morceau le plus délicat. MT5 est **deal-based**, le journal est
**position-based**.

### 7.1 Agrégation deals → position

MetaApi expose l'historique en **deals** (chaque exécution). Une position
(`positionId`) = 1 deal d'entrée (`entryType=in`) + 1..N deals de sortie
(`out`, clôtures partielles). Agrégation :

- **entry** : prix/temps du 1er deal `in`.
- **exit** : prix moyen pondéré volume + temps du dernier deal `out`.
- **volume** : somme des volumes `in`.
- **profit net** : Σ(profit + commission + swap) de tous les deals de la
  position.
- **side** : buy/sell du deal d'entrée.
- **symbol** : du deal.
- **SL/TP posés** : lus sur l'ordre/position (si présents).

Deals `type=balance` (dépôts/retraits) → **ignorés** (pas des trades).

### 7.2 Mapping vers le shape `appState.trades.items` (via registry)

Le normaliseur MT5 produit le même shape que `_normalizeAPITrade` (Notion) :
`pair`, `date`, `exitDate`, `outcome`, `rr`/`effectiveRR`, `side`, etc.
Il vit derrière `getIntegration('mt5')` (méthode `normalize`), miroir du
chemin Notion. Cf. §9.

### 7.3 Le problème du R (limite à documenter clairement)

Le journal est centré **RR** (multiple de R). Or MT5 donne le **profit en
devise**, pas un R. Pour dériver R automatiquement il faut le **stop
initial** :

```
R = (prix_sortie − prix_entrée) / (prix_entrée − stop_initial)   [signe selon side]
```

- ✅ **SL posé sur l'ordre broker** → R calculé automatiquement depuis le
  SL enregistré par MetaApi.
- ⚠️ **Pas de SL posé** (SL mental) → R **inconnu** côté broker. Deux
  options (à trancher §11) : (a) le user saisit son risque/SL en **overlay**
  (`riskR` manuel) ; (b) fallback sur un R dérivé du profit en % du solde /
  d'un risque fixe configuré par profil. **Empty state clair** : « R non
  calculable — SL non détecté, saisis ton risque ».

C'est **la** limite produit à communiquer : le sync MT5 est parfait pour le
P&L/exécution, mais le R n'est automatique que si le trader pose ses stops
sur le broker.

---

## 8. Sécurité

1. **Mot de passe investisseur** : jamais stocké chez nous. Saisi dans
   l'UI → envoyé directement à MetaApi (via l'Edge Function de provisioning,
   TLS, non loggé) → MetaApi le détient. On garde `metaapi_account_id`.
2. **Token MetaApi** (le secret qui permet à l'Edge Function de puller) :
   stocké dans **Supabase Vault** (ou une table `mt5_secrets` **sans policy
   `select` client** → lisible seulement en `service_role`). Jamais renvoyé
   au dashboard. En modèle A (managé) c'est un seul token d'env de l'Edge
   Function ; en modèle B (BYO) c'est per-user → Vault.
3. **RLS** : `mt5_connections` / `trades_synced` en `auth.uid() = user_id`.
   Un client modifié ne voit que ses propres lignes.
4. **Révocation** : régénérer / supprimer une connexion → undeploy MetaApi +
   `state='revoked'`. Les trades déjà synchronisés restent (l'utilisateur
   possède ses données, cf. principe journal-evolution §2.5).
5. **Lecture seule garantie côté code** : aucune méthode d'écriture broker
   n'existe. Le `renderEditor` MT5 ne demande que l'investor password.

---

## 9. Front — activation registry + UI

1. **Registry** ([dashboard.js:7008](../dashboard.js)) : passer `mt5` à
   `available: true`, implémenter l'interface complète comme `notion` :
   `isReady(p)` (= connexion `deployed`), `getStatusLabel(p)` (provisioning
   / synced / error / revoked), `renderEditor()` (form investor-password +
   server + login + history start), et surtout la méthode de **chargement
   des trades** (lecture Supabase `trades_synced` → normalise §7 →
   `appState.trades.items`), miroir de `_loadNotionTrades`.
2. **Migrer les sites de dispatch restants** — le TODO Active « ~26 checks
   inline `connectionType === 'notion'` → registry ». **C'est ici qu'on le
   fait** : MT5 est la 2e implémentation concrète qui justifie l'abstraction
   (cf. la note du TODO : « deferred until MT5 ships »). Chaque site
   sync/lifecycle qui branche sur `'notion'` doit passer par
   `getIntegration(p)`.
3. **Page Integrations** : construire depuis `mockups/integrations-vs-profiles.html`
   (itère `Object.values(INTEGRATIONS)`). MT5 devient une carte connectable.
4. **Éditeur MT5** : sections du mockup adaptées au modèle bridge (le token
   MetaApi remplace le « sync token EA » ; pas de download `.ex5` en Phase 1).
5. **Cache & scope** : trades MT5 scopés `apiTradesCache_v2_*_<profile>_<htf?>`
   comme Notion. MT5 n'a pas de notion HTF M15/H4 → scope simple par profil.

### EA maison — Phase 2 bonus (référence)

Le mockup contient tout le flux EA (sync token, download `.ex5`, WebRequest
→ endpoint d'ingest). **Reclassé bonus desktop** : pour les power-users qui
refusent tout tiers, un EA qui push vers le **même** endpoint d'ingest
(l'Edge Function accepte alors deux sources : pull MetaApi *ou* push EA).
Non compilable sur la machine actuelle (pas de MetaEditor). À ne PAS
démarrer avant que le chemin MetaApi soit validé end-to-end.

---

## 10. Phasage

| Phase | Contenu | Dépend de | Testable |
|---|---|---|---|
| **P1 — Spike** | Provisionner le compte FTMO de Max chez MetaApi (modèle A échelle 1, gratuit) ; Edge Function `mt5-sync` minimale ; 1 pull manuel ; upsert `trades_synced` ; log. Valider : deals → positions → shape correct. | Accès Supabase (auth) + compte MetaApi + FTMO de Max | ✅ end-to-end sur vrai compte |
| **P2 — Schéma + read** | Migration §6 ; normaliseur §7 complet (R + SL) ; lecture Supabase → `appState` ; registry `mt5.available=true` + méthode load. | P1 | Dashboard affiche les vrais trades FTMO |
| **P3 — UI** | Page Integrations + éditeur MT5 + états empty/error/loading ; migration des ~26 dispatch sites. | P2 | Connexion via UI par Max |
| **P4 — Automatisation** | `pg_cron` → pull schedulé ; gestion déploiement/undeploy (coût §11) ; révocation. | P3 + `pg_cron` installé | Sync passif |
| **P5 — Exposition** | Trancher modèle token §5 ; onboarding ; doc membres ; (option EA bonus §9). | P4 + décision Max | Rollout communauté |

**Séquençage** : P1 est un spike jetable, faisable dès qu'on a l'accès
Supabase + un compte MetaApi. Le reste s'enchaîne. Aucun blocage sur le
modèle token avant P5.

---

## 11. Points ouverts (à trancher)

1. **Modèle token/coût A/B/C** (§5) — décision Max, repoussable à P5.
2. **R sans SL posé** (§7.3) — overlay manuel vs fallback risque-fixe.
   Recommandation : overlay manuel (`riskR`), plus honnête.
3. **Fréquence de pull vs coût de déploiement MetaApi** — un compte
   *déployé* en permanence coûte ; undeploy entre pulls économise mais
   ajoute de la latence (redeploy lent). À arbitrer en P4 selon le pricing
   réel.
4. **MT4** — MetaApi supporte MT4 aussi ; le socle générique (`trades_synced.source`)
   le prévoit. Activer après MT5 stable, quasi gratuit en incrément.
5. **cTrader** — chemin *différent* (OAuth Open API natif, pas MetaApi,
   pas de coût de bridge). Hors scope de cette spec mais la table générique
   l'accueille.
6. **Prop-firm multi-comptes** — le mockup montre 2 comptes MT5 (FTMO
   Funded + Challenge) = 2 profils. Confirmé par le modèle 1 connexion / profil (§6.1).

---

## 12. Ce qui existe déjà (ne pas refaire)

- Registry `INTEGRATIONS` + `getIntegration()` — [dashboard.js:6969](../dashboard.js).
- `trade_overlays` + RLS + soft-delete — migration P0 2026-06-09.
- Mockup UI complet — `mockups/integrations-vs-profiles.html`.
- Logos MT5/MT4/cTrader + CSS — `assets/logos/`, `dashboard.css:8172`.
- Pattern de normalisation Notion à mirrorer — `_normalizeAPITrade`
  [dashboard.js:8968](../dashboard.js).
