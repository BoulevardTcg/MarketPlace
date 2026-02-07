# BoulevardTCG Market

Backend de la marketplace et des échanges BoulevardTCG. Projet indépendant de la boutique ; l’auth est déléguée au projet Shop (JWT).

## Prérequis

- Node.js 24+
- PostgreSQL
- npm

## Installation

```bash
cd server
npm install
```

## Configuration

Copier `.env.example` vers `.env` et renseigner les variables :

| Variable        | Description                                      | Obligatoire |
|----------------|--------------------------------------------------|-------------|
| `NODE_ENV`     | `development` \| `production` \| `test`          | Non (défaut: development) |
| `PORT`         | Port d’écoute (défaut: 8081)                     | Non        |
| `DATABASE_URL` | URL de connexion PostgreSQL (base `boulevard_market`) | Oui       |
| `JWT_PUBLIC_KEY` | Clé publique pour vérifier les JWT (RS256)    | Oui*       |
| `JWT_SECRET`   | Secret partagé si HS256 (sinon RS256)            | Oui*       |
| `CORS_ORIGIN`  | Origine CORS autorisée                           | Non        |
| `LISTING_IMAGES_BUCKET` | Bucket S3 pour les images d’annonces (presigned upload) | Non (503 si absent) |
| `AWS_REGION`   | Région AWS pour S3 (ex. `eu-west-1`)              | Si bucket défini |

\* Au moins un de `JWT_PUBLIC_KEY` ou `JWT_SECRET` doit être défini pour utiliser les routes protégées (ex. `/me`).

## Base de données (Prisma)

Modèles principaux :

- **Listing** (marketplace) — annonces avec `category` (CARD | SEALED | ACCESSORY), `game` (POKEMON | ONE_PIECE | MTG | YUGIOH | LORCANA | OTHER), `language`, `condition` (NM | LP | MP | HP | DMG), `setCode`, `cardId`, `cardName`, `edition`, `attributesJson`, `quantity`, `priceCents`, `currency`, `status` (DRAFT | PUBLISHED | SOLD | ARCHIVED), `publishedAt`, `soldAt`.
- **ListingImage** — images d’annonce : `listingId`, `storageKey` (clé S3), `sortOrder`, `contentType`. Max 8 par annonce.
- **Favorite** — favoris (wishlist) : `userId`, `listingId`, unicité (userId, listingId).
- **ListingEvent** — audit des annonces (CREATED, PUBLISHED, UPDATED, SOLD, ARCHIVED).
- **UserCollection** (trade) — collection utilisateur : `userId`, `cardId`, `cardName`, `setCode`, `language`, `condition`, `quantity` ; unicité sur (userId, cardId, language, condition).
- **TradeOffer** — offres d’échange : `creatorItemsJson` / `receiverItemsJson` (JSON avec `schemaVersion` en racine), `status` (PENDING | ACCEPTED | REJECTED | CANCELLED | EXPIRED), `expiresAt`, `counterOfOfferId` (optionnel, lien vers l’offre originale en cas de contre-offre). Relations self : `counterOf` / `counters`.
- **TradeEvent** — audit des offres (CREATED, ACCEPTED, REJECTED, CANCELLED, EXPIRED, COUNTERED).
- **Handover** (P1, remise en main propre) — demande de vérification physique : `listingId` ou `tradeOfferId`, `status` (PENDING_VERIFICATION | VERIFIED | REJECTED), `requestedByUserId`, `verifiedByUserId`.

Générer le client Prisma :

```bash
npm run prisma:generate
```

Créer la base et appliquer les migrations :

```bash
npm run prisma:migrate
```

La première migration crée l’ensemble des tables (Listing, ListingEvent, UserCollection, TradeOffer, TradeEvent). Si vous aviez déjà une base avec l’ancien schéma sans historique de migrations, utilisez `npx prisma migrate reset` (après sauvegarde) ou pointez `DATABASE_URL` vers une base vide.

Ouvrir Prisma Studio (optionnel) :

```bash
npm run prisma:studio
```

## Lancer en dev

```bash
npm run dev
```

Le serveur écoute sur `http://localhost:8081` (ou le `PORT` configuré).

## Sécurité

- **Helmet** — headers HTTP sécurisés (X-Content-Type-Options, X-Frame-Options, etc.).
- **Rate limiting** — 100 req/min global, 20 req/min sur les écritures (POST, PATCH, PUT, DELETE) par IP. Désactivé en mode test. Réponse 429 : `{ "error": { "code": "RATE_LIMITED", "message": "Too many requests" } }`.

## Scripts

| Script              | Description                    |
|---------------------|--------------------------------|
| `npm run dev`       | Démarrage en watch (tsx)       |
| `npm run build`     | Compilation TypeScript        |
| `npm run start`     | Démarrage en production       |
| `npm run prisma:generate` | Génère le client Prisma |
| `npm run prisma:migrate`  | Migrations dev        |
| `npm run prisma:studio`   | Interface Prisma     |
| `npm run test`            | Tests Vitest         |

## Tests

```bash
npm test
```

Les tests utilisent **SQLite** automatiquement (base `server/.db/test.db`), aucun PostgreSQL requis. Couverture : marketplace (browse, lifecycle, mark-sold, listing images, favoris), trade (accept/reject/cancel, contre-offres, inventaire), collection, profile, analytics, handover, upload. **95 tests** au total.

## Endpoints

### Publics

- **GET /health** — Healthcheck  
  Réponse : `{ "data": { "status": "ok" } }`

- **GET /marketplace/ping** — Test routing marketplace  
  Réponse : `{ "data": { "pong": true } }`

- **GET /marketplace/listings** — Parcourir les annonces publiées. Query : `game`, `category`, `language`, `condition`, `setCode`, `cardId`, `minPrice`, `maxPrice`, `search`, `sort` (price_asc \| price_desc \| date_desc \| date_asc), `cursor`, `limit` (1–50, défaut 20). Réponse : `{ "data": { "items": [...], "nextCursor": string \| null } }`.

- **GET /marketplace/listings/:id** — Détail d'une annonce. Public si PUBLISHED ; owner uniquement si DRAFT/ARCHIVED/SOLD. Auth optionnelle (Bearer token si connecté). Erreur 404 si non visible.

- **GET /trade/ping** — Test routing échanges  
  Réponse : `{ "data": { "pong": true } }`

- **GET /analytics/cards/:cardId/asked-price** — Courbe prix demandé (listings PUBLISHED). Query : `language` (obligatoire), `range` (7d \| 30d \| 90d, défaut 30d). Réponse : `series` (points par jour, UTC), `stats`. Lazy snapshot : upsert sur (cardId, language, day) évite les doublons.

### Protégés (JWT)

- **GET /me** — Utilisateur courant (header `Authorization: Bearer <token>`)  
  Réponse : `{ "data": { "userId": "..." } }`  
  Erreur 401 : `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }`

### Profils (public + protégés)

- **GET /users/:id/profile** — Profil public par userId. Réponse : `{ "data": { userId, username, avatarUrl, bio, country, trustScore, ... } }`. Erreur 404 si absent.
- **GET /users/me/profile** — Mon profil (auth). Crée un stub si absent. Réponse : `{ "data": { ... } }`.
- **PATCH /users/me/profile** — Mise à jour partielle (auth). Body : optionnels `username`, `avatarUrl`, `bio`, `country`. Réponse : `{ "data": { ... } }`.

### Marketplace (protégés)

- **GET /marketplace/me/listings** — Mes annonces. Query : `status`, `sort` (date_desc \| date_asc), `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor": string \| null } }`.
- **POST /marketplace/listings** — Créer une annonce (DRAFT). Body : `title`, `priceCents`, `quantity`, `game`, `category`, `language`, `condition`, optionnels : `cardId`, `cardName`, `setCode`, `edition`, `description`, `attributesJson`. Réponse 201 : `{ "data": { "listingId": "..." } }`.
- **PATCH /marketplace/listings/:id** — Modifier une annonce (DRAFT uniquement). Body : champs optionnels (title, description, priceCents, quantity, game, category, language, condition, cardId, cardName, setCode, edition, attributesJson). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 si pas DRAFT.
- **POST /marketplace/listings/:id/publish** — Publier une annonce (DRAFT → PUBLISHED). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 INVALID_STATE.
- **POST /marketplace/listings/:id/archive** — Archiver (DRAFT ou PUBLISHED → ARCHIVED). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 si SOLD ou déjà ARCHIVED.
- **POST /marketplace/listings/:id/mark-sold** — Marquer comme vendu (PUBLISHED → SOLD). Si le listing a un `cardId`, décrémente l’inventaire du vendeur (updateMany avec quantity >= N, sinon 409 INSUFFICIENT_QUANTITY). Sans `cardId`, l’inventaire n’est pas modifié. Erreurs : 404, 403, 409 (état ou inventaire insuffisant).

### Favoris (wishlist) — protégés

- **POST /marketplace/listings/:id/favorite** — Toggle favori (auth). Uniquement annonces PUBLISHED. Réponse : `{ "data": { "favorited": true | false } }` (201 si ajouté, 200 si retiré). Erreurs : 404, 409 si pas PUBLISHED.
- **GET /marketplace/me/favorites** — Liste « mes favoris » (auth), paginé. Query : `cursor`, `limit` (1–50). Réponse : `{ "data": { "items": [{ favoriteId, createdAt, listing }], "nextCursor" } }`.

### Images d’annonces (listing images) — protégés (owner)

- **POST /marketplace/listings/:id/images/presigned-upload** — Obtenir une URL presignée S3 pour uploader une image (auth, owner). Body : `contentType` (optionnel, défaut `image/jpeg`). Réponse : `{ "data": { "uploadUrl", "storageKey", "expiresIn" } }`. 503 si `LISTING_IMAGES_BUCKET` / `AWS_REGION` non configurés.
- **POST /marketplace/listings/:id/images/attach** — Enregistrer une image après upload (auth, owner). Body : `storageKey` (obligatoire), `sortOrder`, `contentType` (optionnels). Réponse 201 : `{ "data": { "imageId", "image" } }`.
- **GET /marketplace/listings/:id/images** — Lister les images (public si annonce PUBLISHED, sinon owner uniquement). Auth optionnelle.
- **DELETE /marketplace/listings/:id/images/:imageId** — Supprimer une image (auth, owner).
- **PATCH /marketplace/listings/:id/images/reorder** — Réordonner les images (auth, owner). Body : `imageIds` (tableau d’ids dans l’ordre voulu). Réponse : `{ "data": { "items": [...] } }`.

### Trade (protégés)

- **GET /trade/offers** — Lister les offres envoyées ou reçues. Query : `type` (sent | received), `status` optionnel, `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor": string | null } }`.
- **GET /trade/offers/:id** — Détail d'une offre (creator ou receiver uniquement). Inclut les events. Erreurs : 404, 403.
- **POST /trade/offers** — Créer une offre d’échange. Body : `receiverUserId`, `creatorItemsJson`, `receiverItemsJson` (doivent contenir `schemaVersion`), optionnel `expiresInHours` (1..168, défaut 72). Réponse 201 : `{ "data": { "tradeOfferId": "..." } }`.
- **POST /trade/offers/:id/accept** — Accepter (receiver uniquement, PENDING non expiré). Si l’offre a déjà une contre-offre, 409 **OFFER_COUNTERED**. Valide que creator/receiver ont les items en collection, puis met à jour les inventaires dans la même transaction. Erreur 409 **INSUFFICIENT_QUANTITY** si quantité insuffisante.
- **POST /trade/offers/:id/reject** — Rejeter (receiver uniquement). Réponse : `{ "data": { "ok": true } }`.
- **POST /trade/offers/:id/cancel** — Annuler (creator uniquement). Réponse : `{ "data": { "ok": true } }`.
- **POST /trade/offers/:id/counter** — Créer une contre-offre (receiver de l’offre originale uniquement). L’offre originale doit être PENDING et non expirée. Body : `creatorItemsJson`, `receiverItemsJson` (avec `schemaVersion`), optionnel `expiresInHours`. Crée une nouvelle offre liée via `counterOfOfferId` + event COUNTERED sur l’originale. Erreurs : 404, 403, 409 (état invalide/expirée).

### Collection (protégés + public)

- **GET /collection** — Liste la collection utilisateur (auth). Query : `cardId`, `language`, `cursor`, `limit` (1–100, défaut 50). Réponse : `{ "data": { "items": [...], "nextCursor": string ou null } }`.
- **GET /collection/dashboard** — Stats inventaire (auth). Réponse : `totalQty`, `breakdownByGame`, `breakdownByLanguage`, `breakdownByCondition`, `masterSetProgress` (stub null).
- **GET /users/:id/collection** — Vue publique de la collection d’un utilisateur (items avec `isPublic: true`). Query : `cardId`, `language`, `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor": ... } }`.
- **PUT /collection/items** — Créer ou mettre à jour un item (upsert sur userId, cardId, language, condition). Body : `cardId`, `language`, `condition`, `quantity`, optionnels : `cardName`, `setCode`, `isPublic`. Si `isPublic` est omis à l’update, la valeur existante est conservée. Réponse : `{ "data": { "item": {...} } }`.
- **DELETE /collection/items** — Supprimer un item. Body : `cardId`, `language`, `condition`. Réponse : `{ "data": { "ok": true } }`. Erreur 404 si absent.

### Upload / pré-remplissage (OCR/IA) — protégés

- **POST /upload** — **Stub « suggestions »** (pas un vrai upload de fichier). Envoyer une image (URL ou data URL) pour obtenir des champs suggérés pour le formulaire listing (auth). Aucun fichier n’est stocké. Body : `imageUrl` ou `imageDataUrl`, au moins un requis. Réponse : `{ "data": { "suggested": { ... } } }` (stub null pour l’instant ; TODO OCR/IA). Les vraies images d’annonces passent par les endpoints listing images (presigned + attach).

### Remise en main propre (Handover) — protégés

- **POST /handovers** — Créer une demande de vérification physique (auth). Body : **exactement un** de `listingId` ou `tradeOfferId` (XOR ; 400 si les deux null ou les deux présents). Réservé au propriétaire du listing ou à une partie du trade. 409 si un handover PENDING existe déjà pour cette ref. Réponse 201 : `{ "data": { "handoverId", "handover" } }`. Erreurs : 400 (XOR), 404, 403, 409.
- **GET /handovers** — Lister les demandes (auth). Query : `mine=1` (défaut) → uniquement les siennes. Réponse : `{ "data": { "items": [...] } }`.
- **PATCH /handovers/:id** — Mettre à jour le statut (admin uniquement, `requireRole("ADMIN")`). Body : `status` (VERIFIED \| REJECTED). Mise à jour atomique (updateMany where id + PENDING_VERIFICATION ; 409 si 0). Réponse : `{ "data": { ...handover } }`. Erreurs : 404, 409.
- **JWT / requireRole** : `req.user.roles` est rempli par `requireAuth` depuis le JWT (claim `roles`, tableau de strings, ex. `["ADMIN"]`). En prod, vérifier avec le Shop le claim exact (ex. `realm_access.roles`).

### Alertes prix (stop-loss) — protégés

- **POST /alerts** — Créer une alerte. Body : `cardId`, `language`, `thresholdCents`, `direction` (DROP \| RISE). Réponse 201. Vérification seuil : TODO (pas de cron).
- **GET /alerts** — Mes alertes. Query : `cursor`, `limit`.
- **GET /alerts/:id** — Détail (owner uniquement).
- **PATCH /alerts/:id** — Mettre à jour (active, thresholdCents). Owner uniquement.
- **DELETE /alerts/:id** — Supprimer. Owner uniquement.

### Format des réponses

- Succès : `{ "data": ... }`
- Erreur : `{ "error": { "code": string, "message": string } }`

Chaque réponse peut inclure le header `x-request-id` pour le suivi des requêtes.

## Quick test (curl)

Serveur lancé en dev sur le port 8081, avec `JWT_SECRET` (ou `JWT_PUBLIC_KEY`) et `DATABASE_URL` configurés.

**Healthcheck :**
```bash
curl -s http://localhost:8081/health
# → { "data": { "status": "ok" } }
```

**Parcourir les annonces (public) :**
```bash
curl -s "http://localhost:8081/marketplace/listings?game=POKEMON&limit=5"
# → { "data": { "items": [...], "nextCursor": "..." } }
```

**Utilisateur courant (/me)** — Header `Authorization: Bearer <token>` avec un JWT émis par le projet Shop (ou un token de test signé avec le même secret) :
```bash
curl -s -H "Authorization: Bearer VOTRE_JWT" http://localhost:8081/me
# → { "data": { "userId": "..." } }
```

**Créer une annonce (marketplace) :**
```bash
curl -s -X POST http://localhost:8081/marketplace/listings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_JWT" \
  -d '{"title":"Ma carte","priceCents":1000,"quantity":1,"game":"POKEMON","category":"CARD","language":"FR","condition":"NM"}'
# → 201 { "data": { "listingId": "..." } }
```

**Publier une annonce :**
```bash
curl -s -X POST "http://localhost:8081/marketplace/listings/LISTING_ID/publish" \
  -H "Authorization: Bearer VOTRE_JWT"
# → { "data": { "ok": true } }
```

**Créer une offre d’échange (trade) :**
```bash
curl -s -X POST http://localhost:8081/trade/offers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_JWT" \
  -d '{"receiverUserId":"user-receiver-id","creatorItemsJson":{"schemaVersion":1,"items":[]},"receiverItemsJson":{"schemaVersion":1,"items":[]}}'
# → 201 { "data": { "tradeOfferId": "..." } }
```

**Ajouter une carte à la collection :**
```bash
curl -s -X PUT http://localhost:8081/collection/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_JWT" \
  -d '{"cardId":"card-001","cardName":"Charizard","language":"FR","condition":"NM","quantity":2}'
# → { "data": { "item": {...} } }
```
