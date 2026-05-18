# Trading Journal — Guideline d'évolution

> Spec de réflexion pour faire évoluer le dashboard d'un viewer read-only
> vers un véritable journal de trading (saisie manuelle, schémas custom,
> two-way Notion sync).
>
> **Statut : dormant.** À ne pas démarrer avant que le dashboard read-only
> soit considéré comme terminé (voir ROADMAP.md → Active doit être vidée
> des items bloquants identifiés ci-dessous).
>
> Date du brief : 2026-05-18.

---

## 1. Vision

Le dashboard doit pouvoir **créer / éditer / enrichir** des trades — pas
juste les afficher. La source de vérité reste externe quand elle existe
(Notion, broker MT4/5), mais le dashboard devient autonome quand elle
n'existe pas.

---

## 2. Principes (invariants — ne jamais casser)

1. **La source brute n'est jamais écrasée par le dashboard sans
   confirmation explicite.** MT4 reste lecture-seule. Notion : pas de
   write sans le flag "two-way sync activé" + log d'écriture.
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

---

## 3. Architecture cible

```
┌────────────────────────────────────────────────────────────┐
│ Source brute (read or read-write)                          │
│   ├─ Notion DB (via OAuth + proxy Vercel)                  │
│   ├─ MT4/MT5 CSV import (file upload)                      │
│   └─ Native (créé dans le dashboard, stocké Supabase)      │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼ join sur trade_id
┌────────────────────────────────────────────────────────────┐
│ Overlay Supabase                                           │
│   ├─ trade_overlays (user_id, trade_id, props_json)        │
│   ├─ user_schemas   (user_id, schema_version, props_def)   │
│   └─ audit_log      (user_id, trade_id, action, at, diff)  │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  Dashboard widgets
```

Une table `trades_native` en plus pour les trades sans source externe.

---

## 4. Phases (chacune shippable indépendamment)

| Phase | Scope | Durée estimée | Gate de sortie |
|---|---|---|---|
| **P0 — Foundation** | Tables Supabase (overlays, schema, audit), trade_id unifié dans `_normalizeAPITrade`, schema versioning v1, export JSON complet | 2–3 sem | 100 trades édités, export round-trip OK |
| **P1 — MT4/CSV + overlay** | UI pour éditer les props custom sur les trades importés. Schéma user-défini stocké Supabase. | 3–4 sem | 10 utilisateurs beta enrichissent leurs trades MT4 sans perte au re-import |
| **P2 — Native trades** | Création de trades depuis 0 dans le dashboard (sans source externe). Form de saisie + édition + suppression soft. | 4–6 sem | Un user crée 50 trades, tout reste après refresh & cross-device |
| **P3 — Notion two-way** | Write-back vers Notion (création + update). Détection de conflits (`last_edited_time`). Merge UI quand divergence. | 6–8 sem | 0 perte de donnée sur 30 jours de beta avec 20 users |
| **P4 — Polish** | UX mobile pour saisie rapide, bulk ops (édition en masse), templates de trades, raccourcis clavier | en continu | NPS communauté > 50 sur la feature |

---

## 5. Décisions à acter AVANT P0

Une fois en prod, ces choix sont chers à changer :

- **Shape de l'overlay** : une row par `(user_id, trade_id)` avec
  `props jsonb`, ou une row par `(user_id, trade_id, prop_key)` ?
  → **Recommandation : jsonb par trade.** Plus simple, query patterns
  connus, indexable par prop si besoin via `jsonb_path_ops`.
- **Schema versioning** : numéro de version par schéma (1, 2, 3…) avec
  script de migration par bump.
  → Migrations stockées en code, jamais en BDD, pour qu'elles soient
  reviewable.
- **Politique de conflit two-way** : "last write wins" silencieux, OU
  merge UI bloquant ?
  → **Recommandation : LWW par défaut, merge UI uniquement si edit
  simultané détecté (< 5 min).** Le merge UI bloquant fatigue les users.
- **Auth obligatoire pour l'overlay** : oui (sinon pas de Supabase).
  Mais le mode anonyme actuel doit rester pour la démo ?
  → **Recommandation : sign-in required dès qu'on touche à l'édition.
  Demo + read-only ne demandent rien.**
- **RLS Supabase** : policies row-level pour que `user_id = auth.uid()`
  partout. Pas négociable.
- **Format d'export** : JSON canonique versionné
  (`{"version": 1, "trades": [...], "schema": {...}}`). Garantie de
  portabilité.

---

## 6. Non-goals explicites (pour P0–P3)

- Partage de journal entre users (multi-tenant journal sharing)
- Écriture vers MT4/MT5 (impossible, leurs APIs n'exposent pas ça)
- Real-time collaboration (deux users sur le même trade en même temps)
- Mobile app native (PWA suffit, à voir au cas par cas en P4)
- Reprendre le contrôle des données Notion existantes côté user (on
  respecte leur DB)

---

## 7. Risques majeurs + mitigation

| Risque | Probabilité | Mitigation |
|---|---|---|
| Perte de données user lors d'une migration de schéma | Haute si bâclé | Tests intégration sur dataset réel + dry-run obligatoire avant chaque migration |
| Two-way sync écrase un trade Notion modifié manuellement | Moyenne | Cursor `last_edited_time` + merge UI si divergence < 5 min |
| Atteinte limite Supabase free tier (~1000 users actifs) | Quasi-certaine | Budget : passer en Pro $25/mo dès 700 users actifs |
| Notion API rate limit (3 req/s) bloque la sync | Haute en P3 | Queue côté Supabase avec retry + backoff |
| Bug d'écriture détruit confiance communauté | Catastrophique | Feature flag global + rollback procedure. Pas de feature critique sans kill switch. |

---

## 8. Métriques de succès

- **Trust** : 0 perte de donnée signalée sur 60 jours après P3
- **Adoption** : 30 % des users actifs utilisent au moins une prop
  custom dans les 60 jours après P1
- **Engagement** : nombre médian de trades enrichis par user > 50 % de
  leur dataset
- **Tech debt** : ratio bugs critique / feature shipped reste < 1:5

---

## 9. Pré-requis read-only à clore avant P0

(à compléter / réviser quand on s'approchera du démarrage)

Bloquants identifiés au moment du brief :
- **[SEV-HIGH] XSS fix** — 6 sites raw innerHTML. Pas de write sans
  hygiène d'output, c'est non-négociable.
- **[SEV-MED] Ghost trades** — purge logique des trades supprimés côté
  source. L'overlay s'appuie sur un `trade_id` stable ; faut une vraie
  policy de purge/orphelinage avant d'attacher des données utilisateur
  dessus.
- **Mappings not synced cross-device (audit M1)** — les overlays seront
  scope-per-profil. Faut que les mappings le soient aussi, sinon
  incohérence entre desktop & mobile au moment de l'édition.

Nice-to-have (peuvent cohabiter avec P0–P1 sans risque) :
- Optimal RR widget BE Management filter, Bloc 8 preset export/import,
  Bloc 4 persistence investigation, Bloc 11 mini grid polish.
