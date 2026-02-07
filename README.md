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

\* Au moins un de `JWT_PUBLIC_KEY` ou `JWT_SECRET` doit être défini pour utiliser les routes protégées (ex. `/me`).

## Base de données (Prisma)

Modèles principaux :

- **Listing** (marketplace) — annonces avec `category` (CARD \| SEALED \| ACCESSORY), `game` (POKEMON \| ONE_PIECE \| MTG \| YUGIOH \| LORCANA \| OTHER), `language`, `condition` (NM \| LP \| MP \| HP \| DMG), `setCode`, `cardId`, `cardName`, `edition`, `attributesJson`, `quantity`, `priceCents`, `currency`, `status` (DRAFT \| PUBLISHED \| SOLD \| ARCHIVED), `publishedAt`, `soldAt`.
- **ListingEvent** — audit des annonces (CREATED, PUBLISHED, UPDATED, SOLD, ARCHIVED).
- **UserCollection** (trade) — collection utilisateur : `userId`, `cardId`, `cardName`, `setCode`, `language`, `condition`, `quantity` ; unicité sur (userId, cardId, language, condition).
- **TradeOffer** — offres d’échange : `creatorItemsJson` / `receiverItemsJson` (JSON avec `schemaVersion` en racine), `status` (PENDING \| ACCEPTED \| REJECTED \| CANCELLED \| EXPIRED), `expiresAt`.
- **TradeEvent** — audit des offres (CREATED, ACCEPTED, REJECTED, CANCELLED, EXPIRED).

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

Les tests utilisent **SQLite automatiquement** (via `.env.test`), donc **aucun PostgreSQL n’est requis** pour `npm test`.
La base est créée dans `server/.db/test.db` au lancement des tests.

Couverture : marketplace (browse, lifecycle, permissions), trade (accept/reject/cancel, expiration, permissions), collection (CRUD, upsert, filtres). 41 tests au total.

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

### Protégés (JWT)

- **GET /me** — Utilisateur courant (header `Authorization: Bearer <token>`)  
  Réponse : `{ "data": { "userId": "..." } }`  
  Erreur 401 : `{ "error": { "code": "UNAUTHORIZED", "message": "..." } }`

### Marketplace (protégés)

- **GET /marketplace/me/listings** — Mes annonces. Query : `status`, `sort` (date_desc \| date_asc), `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor": string \| null } }`.
- **POST /marketplace/listings** — Créer une annonce (DRAFT). Body : `title`, `priceCents`, `quantity`, `game`, `category`, `language`, `condition`, optionnels : `cardId`, `cardName`, `setCode`, `edition`, `description`, `attributesJson`. Réponse 201 : `{ "data": { "listingId": "..." } }`.
- **PATCH /marketplace/listings/:id** — Modifier une annonce (DRAFT uniquement). Body : champs optionnels (title, description, priceCents, quantity, game, category, language, condition, cardId, cardName, setCode, edition, attributesJson). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 si pas DRAFT.
- **POST /marketplace/listings/:id/publish** — Publier une annonce (DRAFT → PUBLISHED). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 INVALID_STATE.
- **POST /marketplace/listings/:id/archive** — Archiver (DRAFT ou PUBLISHED → ARCHIVED). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 si SOLD ou déjà ARCHIVED.
- **POST /marketplace/listings/:id/mark-sold** — Marquer comme vendu (PUBLISHED → SOLD). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 si pas PUBLISHED.

### Trade (protégés)

- **GET /trade/offers** — Lister les offres envoyées ou reçues. Query : `type` (sent \| received), `status` optionnel, `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor": string \| null } }`.
- **GET /trade/offers/:id** — Détail d'une offre (creator ou receiver uniquement). Inclut les events. Erreurs : 404, 403.
- **POST /trade/offers** — Créer une offre d’échange. Body : `receiverUserId`, `creatorItemsJson`, `receiverItemsJson` (doivent contenir `schemaVersion`), optionnel `expiresInHours` (1..168, défaut 72). Réponse 201 : `{ "data": { "tradeOfferId": "..." } }`.
- **POST /trade/offers/:id/accept** — Accepter (receiver uniquement, PENDING non expiré). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409.
- **POST /trade/offers/:id/reject** — Rejeter (receiver uniquement). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409.
- **POST /trade/offers/:id/cancel** — Annuler (creator uniquement). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409.

### Collection (protégés)

- **GET /collection** — Liste la collection utilisateur. Query : `cardId`, `language`, `cursor`, `limit` (1–100, défaut 50). Réponse : `{ "data": { "items": [...], "nextCursor": string ou null } }`.
- **PUT /collection/items** — Créer ou mettre à jour un item (upsert sur userId, cardId, language, condition). Body : `cardId`, `language`, `condition`, `quantity`, optionnels : `cardName`, `setCode`. Réponse : `{ "data": { "item": {...} } }`.
- **DELETE /collection/items** — Supprimer un item. Body : `cardId`, `language`, `condition`. Réponse : `{ "data": { "ok": true } }`. Erreur 404 si absent.

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
