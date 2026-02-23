# Inventaire réel & plan V1 production

Document interne : état vérifié dans le code (pas une roadmap théorique) + plan d'implémentation P0/P1.

---

## (1) INVENTAIRE DONE / PARTIAL / MISSING

Vérification faite dans le dépôt (schema, routes, shared/auth, tests).

### Vision globale (features demandées)

| Feature | État | Fichiers concernés |
|--------|------|--------------------|
| Création utilisateurs + choix rôles + formulaire + dashboard utilisateur | **MISSING** | — (identité gérée par Shop ; pas de dashboard ni formulaire côté Market) |
| Inventaire numérique + stats dashboard (courbe prix, qty, master set, demandes actives, messages, cartes similaires, stop-loss) | **PARTIAL** | `server/src/domains/collection/routes.ts` (CRUD inventaire) ; pas de dashboard, pas de stats, pas de master set, pas de messages, pas de "cartes similaires", pas d'endpoint stop-loss |
| Graphiques découpés par langues | **MISSING** | Pas de domaine analytics ni endpoint courbe prix par langue |
| Anti-fake + flow remise en main propre | **MISSING** | — |
| Photo item → pré-remplissage champs via IA | **MISSING** | — |

### P0-1 : Profils + rôles

| Élément | État | Fichiers |
|--------|------|----------|
| Modèle `UserProfile` (userId, username, avatarUrl, bio, trustScore, etc.) | **DONE** | `server/prisma/schema.prisma`, `server/prisma/migrations/20260207130000_add_profiles_analytics_alerts/migration.sql` |
| Extraction `roles` depuis JWT | **DONE** | `server/src/shared/auth/jwt.ts`, `server/src/shared/auth/types.ts` |
| Middleware `requireRole(role)` | **DONE** | `server/src/shared/auth/requireRole.ts` |
| GET /users/:id/profile (public) | **MISSING** | — (aucune route users/profile) |
| PATCH /users/me/profile (auth) | **MISSING** | — |
| Tests : accès public, update auth only, role guard | **MISSING** | — (requireRole non utilisé dans aucune route) |

### P0-2 : Inventaire avancé + privacy + dashboard

| Élément | État | Fichiers |
|--------|------|----------|
| Champ `UserCollection.isPublic` (ou privacy) | **DONE** | `server/prisma/schema.prisma` (isPublic), migration 20260207130000 |
| GET /collection/dashboard (totalQty, totalCostCents, byGame, byLanguage, byCondition) | **DONE** | `server/src/domains/collection/routes.ts` |
| GET /users/:id/collection (vue publique si isPublic) | **MISSING** | `server/src/domains/collection/routes.ts` n'expose que GET /collection pour l'utilisateur connecté |
| Tests privacy + dashboard shape | **MISSING** | — |

### P0-3 : Data / graphiques (courbe prix demandé)

| Élément | État | Fichiers |
|--------|------|----------|
| Modèle `PriceSnapshot` (cardId, language, day, median/min/max, volume) | **DONE** | `server/prisma/schema.prisma`, migration 20260207130000 |
| GET /analytics/cards/:cardId/asked-price?language=FR&range=30d | **MISSING** | Pas de domaine `analytics`, pas de route |
| Lazy snapshot (1er appel du jour → calcul depuis listings PUBLISHED → insert) | **MISSING** | — |
| Découpage par langue | **MISSING** | — |
| Tests : snapshots créés, langue, range | **MISSING** | — |

### P0-4 : Liaison inventaire ↔ trade / marketplace

| Élément | État | Fichiers |
|--------|------|----------|
| Trade ACCEPTED : vérifier items en collection + quantités, puis décrémenter/incrémenter dans la même transaction que le changement de statut | **MISSING** | `server/src/domains/trade/routes.ts` : accept ne fait que status + event, pas de touche à UserCollection |
| Listing SOLD : décrémenter inventaire vendeur si listing a cardId | **MISSING** | `server/src/domains/marketplace/routes.ts` : mark-sold ne modifie pas UserCollection |
| Tests : accept échoue si quantité insuffisante, accept met à jour collections, sold met à jour inventory | **MISSING** | — |

### P0-5 : Stop-loss (alertes)

| Élément | État | Fichiers |
|--------|------|----------|
| Modèle `PriceAlert` (userId, cardId, language, thresholdCents, direction DROP/RISE, active) | **DONE** | `server/prisma/schema.prisma`, migration 20260207130000 |
| Endpoints CRUD alertes | **MISSING** | Pas de domaine ou routes dédiées |
| Vérification / cron (optionnel) | **MISSING** | Prévoir TODO, pas de cron |

### Déjà en place (backend actuel)

| Feature | Fichiers |
|---------|----------|
| Marketplace : CRUD listings, publish, archive, mark-sold, browse public, cursor/sort | `server/src/domains/marketplace/routes.ts`, tests `marketplace/routes.test.ts` |
| Trade : create, list, accept/reject/cancel, expiration safe, race conditions | `server/src/domains/trade/routes.ts`, `server/src/shared/trade/expiration.ts`, tests `trade/routes.test.ts` |
| Collection : GET/PUT/DELETE items, pagination, filtres | `server/src/domains/collection/routes.ts`, tests `collection/routes.test.ts` |
| Auth : JWT, requireAuth, optionalAuth, /me | `server/src/shared/auth/*`, `server/src/domains/auth/routes.ts` |
| Health, rate limit, CORS, error handler | `server/src/app.ts`, `server/src/domains/health/routes.ts` |

---

## (2) IMPLÉMENTATION P0 (ordre strict)

À faire dans l'ordre ci-dessous, sans refactor massif. Garder `domains/*/routes.ts` + Prisma direct ; au plus 1 helper partagé si besoin. Migrations + tests Vitest/supertest pour chaque P0. Mise à jour README (endpoints + env).

### P0-1 : Profils + rôles (obligatoire)

- **Modèle** : déjà présent (`UserProfile`). Vérifier que les champs correspondent (userId, username, avatarUrl, bio, trustScore, createdAt, updatedAt). Ajouter `country` si utile (déjà en schema).
- **Auth** : roles déjà extraits du JWT ; `requireRole(role)` existe. Utiliser sur les routes qui doivent restreindre par rôle (ex. admin).
- **Routes** :
  - `GET /users/:id/profile` — public, retourne profil (ou 404).
  - `PATCH /users/me/profile` — requireAuth, body partiel (username, avatarUrl, bio, etc.).
- **Fichiers** : nouveau domaine `server/src/domains/profile/routes.ts` (ou étendre `auth`) ; monter dans `app.ts`. Créer/sync migration si champ manquant.
- **Tests** : accès public GET par id ; PATCH réservé au propriétaire ; route protégée par `requireRole("ADMIN")` renvoie 403 si pas le rôle.

### P0-2 : Inventaire avancé + privacy + dashboard (obligatoire)

- **Privacy** : `UserCollection.isPublic` existe. Ajouter au moins :
  - Endpoint pour modifier le flag (ex. PATCH /collection/settings avec `isPublic`) ou par item selon spec.
  - `GET /users/:id/collection` — si profil ou collection en public, retourner les items publics ; sinon 403/404.
- **Dashboard** :
  - `GET /collection/dashboard` — requireAuth. Retourne : `totalQty`, `totalCostCents`, `byGame`, `byLanguage`, `byCondition` (tableaux `{ key, qty, costCents }`). Implémenté.
- **Tests** : dashboard shape (champs attendus) ; GET /users/:id/collection selon isPublic (visible ou refusé).

### P0-3 : Data / graphiques (obligatoire)

- **Route** : `GET /analytics/cards/:cardId/asked-price?language=FR&range=30d` (ou 7d/90d).
- **Comportement** : série temporelle (points par jour) + stats (min/median/max, volume). Données basées sur listings PUBLISHED (prix demandé).
- **Lazy snapshot** : pour chaque (cardId, language, day) dans le range demandé, si pas de ligne dans `PriceSnapshot`, calculer depuis les listings (agrégation prix, volume), insérer, puis renvoyer les snapshots (existants + nouvellement créés). Limiter à "première requête du jour" si besoin (ex. un snapshot par jour max).
- **Domaine** : `server/src/domains/analytics/routes.ts` (ou `data`), monté sous `/analytics`.
- **Tests** : appel avec language + range ; vérifier création de snapshots ; réponse avec séries par langue ; stats cohérentes.

### P0-4 : Liaison inventaire ↔ trade / marketplace (obligatoire)

- **Trade ACCEPTED** (dans `server/src/domains/trade/routes.ts`) :
  - Parser `creatorItemsJson` / `receiverItemsJson` pour extraire les (cardId, language, condition, quantity).
  - Dans la même transaction que le passage en ACCEPTED : pour chaque item, vérifier présence et quantité suffisante dans la collection du donneur ; décrémenter côté donneur, incrémenter côté receveur ; puis update status + event.
  - Si quantité insuffisante ou item absent : rollback, erreur 409 (ex. INSUFFICIENT_QUANTITY).
- **Listing SOLD** (dans `server/src/domains/marketplace/routes.ts`) :
  - Dans la transaction mark-sold : si `listing.cardId` est renseigné, décrémenter la quantité correspondante dans `UserCollection` du vendeur (userId, cardId, language, condition). Gérer quantité > 1 (décrémenter du bon montant). Si pas de cardId : documenter en README que l'inventaire n'est pas mis à jour.
- **Tests** : accept échoue si quantité insuffisante ; accept met à jour les deux collections ; mark-sold avec cardId décrémente l'inventaire ; cas sans cardId (optionnel, doc).

### P0-5 : Stop-loss (optionnel P0, sinon P1)

- **Modèle** : déjà présent (`PriceAlert`).
- **Routes** : CRUD alertes — créer, lire (mes alertes), mettre à jour (activer/désactiver), supprimer. Ex. POST /alerts, GET /alerts, PATCH /alerts/:id, DELETE /alerts/:id (tous requireAuth, scope userId).
- **Vérification** : pas de cron ; commentaire TODO dans le code pour un job futur qui comparera seuil vs PriceSnapshot/listing.
- **Fichiers** : soit nouveau domaine `alerts`, soit sous `analytics` ou `users/me`. Tests basiques CRUD + ownership.

---

## P1 (plan seulement)

- **Anti-fake + remise en main propre** : proposer modèles (ex. table `Handover` ou champ sur listing/trade), états (pending_verification, verified, rejected), et endpoints (création, mise à jour par "vérificateur"). Flux : vérif carte + prix en main propre → validation. Ne pas tout coder si trop lourd.
- **Upload images + OCR/IA pré-remplissage** : proposer architecture minimale — ex. endpoint POST /upload ou délégation à un service externe ; callback ou réponse avec champs pré-remplis (cardId, cardName, condition, etc.) pour alimenter le formulaire listing. Option P1.

---

## Acceptance criteria (rappel)

- Migrations Prisma prêtes pour Railway (PostgreSQL).
- `npm test` vert.
- README à jour (endpoints + env).
- Pas de refactor massif, pas de couche "service" obligatoire, pas de sur-design.
