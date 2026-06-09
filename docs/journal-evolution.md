# Trading Journal — Guideline d'évolution

> Spec d'évolution du dashboard d'un viewer read-only Notion vers un
> véritable journal de trading autonome (saisie manuelle, schémas
> custom, multi-sources, Notion devient optionnel).
>
> **Statut : démarrable.** Tous les bloquants read-only identifiés au
> brief sont fermés (cf. §9). Démarrage P0 conditionné à la validation
> retention policy §10 et au choix de la séquence §4.
>
> Date du brief : 2026-05-18. Mise à jour : 2026-06-09.

---

## 1. Vision

Le dashboard doit pouvoir **créer / éditer / enrichir** des trades — pas
juste les afficher. Notion devient **une source d'import parmi d'autres**
(CSV, MT5 plus tard, manuel) au lieu d'être le backend. L'objectif
final : un journal de trading **autonome**, qui fonctionne sans Notion
si l'utilisateur n'en veut pas, et qui survit si Notion change ses
conditions.

**Pivot 2026-06-09** : la direction n'est plus "two-way sync avec
Notion" mais "s'en éloigner". Notion reste read-only en import, le
dashboard devient la source de vérité pour les trades nouveaux + les
enrichissements (custom props, edits).

---

## 2. Principes (invariants — ne jamais casser)

1. **La source brute n'est jamais écrasée par le dashboard.** Notion
   reste read-only en import. MT4/MT5 reste read-only par nature
   (leurs APIs n'exposent pas d'écriture trade-niveau). Le dashboard
   écrit uniquement dans son propre store Supabase.
2. **L'overlay est additif, jamais destructif.** Quand on supprime un
   trade côté source, l'overlay reste orphelin (récupérable), pas purgé.
3. **Tout trade a un ID stable et unique** : `notionPageId` |
   `mt4Ticket` | `uuid` (natif). Ce ID est la clé de tout — overlays,
   médias, sync.
4. **Le schéma user est versionné dès le jour 1.** Renommer une prop ne
   casse pas les trades existants : migration explicite.
5. **L'utilisateur peut récupérer toutes ses données à tout moment**
   (export JSON complet). On n'est pas leur prison.
6. **Aucune feature ne sort sans : empty state, error state, loading
   state.** L'UX cassée détruit la confiance.
7. **Soft-delete par défaut, hard-delete par cron.** Toute suppression
   est réversible pendant 30 jours minimum (cf. §10).
8. **Quotas appliqués côté serveur, pas côté UI.** Un client modifié ne
   peut pas dépasser les limites (cf. §10).

---

## 3. Architecture cible

```
┌────────────────────────────────────────────────────────────┐
│ Source brute (import-only, read)                           │
│   ├─ Notion DB (via OAuth + proxy Vercel) — OPTIONNEL      │
│   ├─ MT4/MT5 CSV import (file upload) — futur              │
│   └─ Native (créé dans le dashboard, stocké Supabase)      │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼ join sur trade_id
┌────────────────────────────────────────────────────────────┐
│ Backend Supabase                                           │
│   ├─ trades_native  (uuid, user_id, props_json, deleted_at)│
│   ├─ trade_overlays (user_id, trade_id, props_json,        │
│   │                  deleted_at) ← édition de trades Notion│
│   ├─ user_schemas   (user_id, schema_version, props_def)   │
│   ├─ audit_log      (user_id, trade_id, action, at, diff)  │
│   └─ profiles       (+ last_active_at, deleted_at,         │
│                        delete_reason)                      │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  Dashboard widgets
```

`trades_native` et `trade_overlays` sont séparées : la première porte
des trades dont le dashboard est source de vérité, la seconde porte
uniquement les enrichissements sur des trades Notion/MT5 importés.

---

## 4. Phases (chacune shippable indépendamment)

> **Réordonnancement 2026-06-09** : P3 (Notion two-way) déclassé en
> "optionnel/abandonné". La priorité est P0 → P1 → P2 (native trades)
> pour atteindre l'autonomie le plus vite possible.

| Phase | Scope | Durée estimée | Gate de sortie |
|---|---|---|---|
| **P0 — Foundation** | Tables Supabase (overlays, schemas, audit, retention cols), trade_id unifié dans `_normalizeAPITrade`, schema versioning v1, export JSON complet, retention cron stub (no-op au début) | 1–2 sem | 100 trades édités, export round-trip OK, RLS testée |
| **P1 — Custom props sur trades existants** | UI pour éditer les props custom sur les trades importés Notion. Schéma user-défini stocké Supabase. Validation avant de toucher au natif. | 3–4 sem | 10 utilisateurs beta enrichissent leurs trades Notion sans perte au re-sync |
| **P2 — Native trades** | Création de trades depuis 0 dans le dashboard (sans source externe). Form de saisie + édition + soft-delete + trash UI. | 4–6 sem | Un user crée 50 trades, tout reste après refresh & cross-device, trash restore OK |
| **P2.5 — Migration depuis Notion (optionnel mais utile)** | Bouton "Convertir mes trades Notion en trades natifs". Snapshot Notion → trades_native, Notion devient inutile pour l'historique. | 1–2 sem | 1 user convertit 500 trades sans perte |
| **P3 — ~~Notion two-way~~** | **DÉCLASSÉ.** Notion reste read-only en import. À ne réenvisager que si demande communauté forte ET avant aucun autre travail. | ~~6–8 sem~~ | n/a |
| **P3' — MT5 / autres sources** | Voir TODO Deferred ROADMAP. Indépendant de P0–P2, peut être préempté si la demande communauté pousse. | 4–8 sem | dépend de la source |
| **P4 — Polish** | UX mobile pour saisie rapide, bulk ops (édition en masse), templates de trades, raccourcis clavier | en continu | NPS communauté > 50 sur la feature |

---

## 5. Décisions actées AVANT P0

Une fois en prod, ces choix sont chers à changer :

- **Shape de l'overlay** : une row par `(user_id, trade_id)` avec
  `props jsonb`. Plus simple, query patterns connus, indexable par
  prop si besoin via `jsonb_path_ops`.
- **Schema versioning** : numéro de version par schéma (1, 2, 3…) avec
  script de migration par bump. Migrations stockées en code, jamais en
  BDD, pour qu'elles soient reviewable.
- **Politique de conflit** : N/A — Notion two-way déclassé. Pour les
  conflits multi-device sur trades natifs, **LWW** (last write wins)
  basé sur un `updated_at` côté serveur. Pas de merge UI nécessaire
  tant que l'écriture reste single-source.
- **Auth obligatoire** : sign-in required dès qu'on touche à l'édition.
  Demo (sample data) + read-only Notion ne demandent rien.
- **RLS Supabase** : policies row-level pour que `user_id = auth.uid()`
  partout, y compris la clause `deleted_at is null` par défaut. Pas
  négociable.
- **Format d'export** : JSON canonique versionné
  (`{"version": 1, "trades": [...], "schema": {...}, "exported_at": …}`).
  Garantie de portabilité, importable dans un autre instance ou un
  fork.
- **Soft-delete par défaut, hard-delete par cron weekly** (cf. §10).

---

## 6. Non-goals explicites (pour P0–P2)

- Partage de journal entre users (multi-tenant journal sharing) — la
  feature `share-link` existante suffit pour montrer des sélections.
- Écriture vers Notion / MT4 / MT5 (par choix, pas par contrainte
  technique — voir §1, on s'en éloigne).
- Real-time collaboration (deux users sur le même trade en même temps).
- Mobile app native (PWA suffit, à voir au cas par cas en P4).
- KYC / paiement / abonnement payant (reste freemium community
  jusqu'à nouvel ordre).

---

## 7. Risques majeurs + mitigation

| Risque | Probabilité | Mitigation |
|---|---|---|
| Perte de données user lors d'une migration de schéma | Haute si bâclé | Tests intégration sur dataset réel + dry-run obligatoire avant chaque migration + export JSON forcé avant migration |
| Atteinte limite Supabase free tier (~1300 users actifs avec retention policy) | Moyenne | Passer en Pro $25/mo dès 1000 users actifs ; retention §10 maintient les inactifs à ~0 Go |
| Bug d'écriture détruit confiance communauté | Catastrophique | Feature flag global + rollback procedure. Pas de feature critique sans kill switch. Soft-delete par défaut amortit les drops. |
| Storage media qui explose (un user upload 5 Go de screenshots) | Moyenne | Quota 500 Mo/user appliqué côté serveur (RLS + size check à l'upload). |
| User hard-deleted qui réclame ses données | Faible | Confirmation explicite avant hard-delete + email avec lien "undo 30 jours" + export forcé proposé avant deletion. |
| Notion change ses CGU / OAuth se ferme | Faible mais existant | P2.5 (migration native) protège : un user qui a converti n'est plus dépendant. |

---

## 8. Métriques de succès

- **Trust** : 0 perte de donnée signalée sur 60 jours après P2
- **Adoption** : 30 % des users actifs utilisent au moins une prop
  custom dans les 60 jours après P1
- **Autonomie** : 50 % des users qui démarrent P2 créent au moins 10
  trades natifs dans les 30 jours
- **Engagement** : nombre médian de trades enrichis par user > 50 % de
  leur dataset
- **Tech debt** : ratio bugs critique / feature shipped reste < 1:5

---

## 9. Pré-requis read-only à clore avant P0

**Status 2026-06-09 : tous les bloquants sont fermés. P0 est
techniquement débloqué.**

| Bloquant identifié au brief | Status | Référence |
|---|---|---|
| [SEV-HIGH] XSS fix (6 sites raw innerHTML) | ✅ Fermé | 2026-05-19 — `escapeHTML` appliqué sur les 6 sites |
| [SEV-MED] Ghost trades (purge logique des trades supprimés Notion) | ✅ Fermé | 2026-05-19 — diff de keys au full sync |
| Mappings cross-device sync (audit M1) | ✅ Fermé | 2026-05-31 / 06-01 — 3 fixes durs : queue + force-flush + dirty-flag local-edit-wins. Testé E2E contre Supabase prod. |

Nice-to-have (peuvent cohabiter avec P0–P1 sans risque) :
- Optimal RR widget BE Management filter, Bloc 8 preset export/import,
  Bloc 4 persistence investigation, Bloc 11 mini grid polish,
  orphaned localStorage keys after profile deletion (audit M2).

---

## 10. Retention policy

> Acté 2026-06-09. À implémenter dès P0 (au moins le schéma + le cron
> stub). La logique des emails warning peut attendre P1 si besoin.

### Principes

1. **User actif → tout conservé, indéfiniment.** Pas de TTL automatique.
2. **Inactif ≠ disparu.** Fenêtre généreuse avant hard-delete.
3. **Toute suppression hard est précédée d'un warning email** (sauf
   "Delete my account" explicite).
4. **Un seul cron hebdo** centralise toute la GC (pas de TTL
   distribués partout dans le code).
5. **Les médias suivent le sort de leur trade.** Hard-delete d'un
   trade = hard-delete du screenshot Supabase Storage (même
   transaction).

### Triggers — 4 scénarios

| Scénario | Soft (réversible) | Hard (irréversible) | Action user |
|---|---|---|---|
| **A. Disconnect Notion integration** | Immédiat : token révoqué | **Jamais.** Métadonnées + trades natifs conservés. | Reconnexion = tout revient. |
| **B. Profile manuellement supprimé** | Immédiat (`deleted_at = now()`) | À J+30 (cron hebdo) | Restore possible J+0 à J+30 via UI "Trash" |
| **C. Inactivité prolongée** | Warning email à 6 mois (`last_active_at < now() - 6mo`), soft-delete à 12 mois | À 13 mois (1 mois après le soft) | Toute reconnexion annule le compte à rebours |
| **D. "Delete my account"** | Immédiat, grace period 30 j | À J+30 si pas de undo | Lien "undo" dans l'email de confirmation |

### Schéma additionnel

```sql
-- profiles
alter table profiles add column last_active_at timestamptz default now();
alter table profiles add column deleted_at     timestamptz;
alter table profiles add column delete_reason  text;
-- 'user_request' | 'inactive' | 'admin'

-- soft-delete sur le contenu
alter table trade_overlays add column deleted_at timestamptz;
alter table trades_native  add column deleted_at timestamptz;

-- email queue (interne, traitée par un edge function ou un service externe)
create table pending_emails (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references profiles(id),
  template  text not null,
  sent_at   timestamptz,
  created_at timestamptz default now()
);
```

`last_active_at` mis à jour côté frontend, **debouncé 1 fois / jour
par user** (pas à chaque requête, pour ne pas péter Supabase).

### RLS

Toutes les SELECT policies excluent `deleted_at is not null` par
défaut → un soft-deleted disparaît immédiatement de l'UI sans
suppression réelle. Une vue admin séparée peut lever la clause pour
le support utilisateur.

### Cron weekly (Supabase pg_cron)

```sql
-- À 03:00 le dimanche
select cron.schedule('retention-purge', '0 3 * * 0', $$
  -- Hard-delete des profils en soft-delete depuis >30j
  delete from profiles
  where deleted_at < now() - interval '30 days';

  -- Warning email à J+180 d'inactivité (pas encore deleted)
  insert into pending_emails (user_id, template)
  select id, 'inactivity_warning'
  from profiles
  where last_active_at < now() - interval '180 days'
    and deleted_at is null
    and not exists (
      select 1 from pending_emails
      where user_id = profiles.id and template = 'inactivity_warning'
    );

  -- Soft-delete des profils inactifs >12 mois
  update profiles
  set deleted_at = now(), delete_reason = 'inactive'
  where last_active_at < now() - interval '365 days'
    and deleted_at is null;
$$);
```

### Quotas appliqués serveur-side

| Resource | Quota | Enforcement |
|---|---|---|
| Trades natifs / user | 10 000 | Trigger BEFORE INSERT côté `trades_native` |
| Storage media / user | 500 Mo | Edge function de pré-signature qui refuse au-delà |
| Trade overlays / user | Pas de plafond | jsonb, négligeable |

Quotas derrière une table `config` ou variable Supabase, pas hardcodé
en JS, pour pouvoir bumper en runtime.

### Cas limite tranchés

1. **User inactif qui a des share-links publics actifs** → warning
   email mentionne explicitement les share-links, propose un export
   PDF static avant deletion.
2. **Retour d'un user hard-deleted** → son `auth.uid()` est nouveau
   (UUID frais), les anciennes données sont perdues. Bandeau de
   confirmation au re-signup avec un email connu.
3. **Données legal/compliance** → aucune obligation (pas de KYC, pas
   de paiement). RGPD impose au contraire le droit à l'effacement →
   on est aligné.

### Coût projeté

- 1000 users actifs × ~6 Mo (trades + media moyennement chargé) = 6 Go
  → free tier Supabase (8 Go) tient.
- 1000 users inactifs hard-deleted dans l'année → ~0 Go résiduel.
- **Retention policy maintient le free tier viable jusqu'à ~1300 users
  actifs concurrents.** Au-delà, Pro $25/mo (cf. §7).

---

## 11. Séquence recommandée pour démarrer

1. **Snapshot ROADMAP** : déplacer "Trading Journal evolution" de
   `Deferred` vers `Active` une fois ce doc validé.
2. **P0 first** (1–2 sem) : tables Supabase + RLS + `last_active_at` +
   export JSON + cron stub. Ne touche pas à l'UI utilisateur, juste
   l'infra.
3. **P1 next** (3–4 sem) : UI custom props sur trades Notion existants.
   C'est le test de feu de l'overlay sans risquer de perdre des
   trades natifs (il n'y en a pas encore).
4. **P2 ensuite** (4–6 sem) : native trades CRUD + trash UI. C'est le
   moment où le dashboard devient vraiment autonome.
5. **P2.5 optionnel** (1–2 sem) : bouton "Migrer mes trades Notion en
   natifs" pour les users qui veulent vraiment couper le cordon.
6. **P3' (MT5)** : à séquencer indépendamment selon demande.

**Total P0+P1+P2 : ~8–12 semaines de travail focalisé.** Chaque phase
est shippable, donc tu peux ralentir/accélérer au cours du chemin sans
casser ce qui est déjà déployé.
