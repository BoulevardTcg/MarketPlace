# BoulevardTCG Market

Marketplace et échanges BoulevardTCG (C2C). Projet indépendant de la boutique ; l’auth est déléguée au projet Shop (JWT).

**Monorepo** : front et back dissociés — `server/` (API Express), `client/` (Vite + React).

## Prérequis

- Node.js 24+
- Docker (pour PostgreSQL en dev)
- npm

## Installation

À la racine (installe les dépendances de `server` et `client`) :

```bash
npm install
```

Ou uniquement le backend :

```bash
cd server
npm install
```

## Configuration

Copier `.env.example` vers `.env` et renseigner les variables :

| Variable        | Description                                      | Obligatoire |
|----------------|--------------------------------------------------|-------------|
| `NODE_ENV`     | `development` \| `production` \| `test`          | Non (défaut: development) |
| `PORT`         | Port d'écoute (défaut: 8081)                     | Non        |
| `DATABASE_URL` | URL de connexion PostgreSQL (base `boulevard_market`) | Oui (prod), auto en dev via Docker |
| `JWT_PUBLIC_KEY` | Clé publique pour vérifier les JWT (RS256)    | Oui*       |
| `JWT_SECRET`   | Secret partagé si HS256 (sinon RS256)            | Oui*       |
| `CORS_ORIGIN`  | Origine CORS autorisée                           | Non        |
| `LISTING_IMAGES_BUCKET` | Bucket S3 pour les images d'annonces (presigned upload) | Non (503 si absent) |
| `AWS_REGION`   | Région AWS pour S3 (ex. `eu-west-1`)              | Si bucket défini |
| `PRICE_IMPORT_ENABLED` | `true` \| `false` — active l'import CSV Cardmarket Price Guide | Non (défaut: false) |
| `PROFILE_GATE_ENABLED` | `true` \| `false` — active le gating par profil sur pricing/trade | Non (défaut: false) |

\* Au moins un de `JWT_PUBLIC_KEY` ou `JWT_SECRET` doit être défini pour utiliser les routes protégées (ex. `/me`).

## Base de données (Prisma)

Modèles principaux :

- **Listing** (marketplace) — annonces avec `category` (CARD | SEALED | ACCESSORY), `game` (POKEMON | ONE_PIECE | MTG | YUGIOH | LORCANA | OTHER), `language`, `condition` (NM | LP | MP | HP | DMG), `setCode`, `cardId`, `cardName`, `edition`, `attributesJson`, `quantity`, `priceCents`, `currency`, `status` (DRAFT | PUBLISHED | SOLD | ARCHIVED), `isHidden` (modération admin, default false), `publishedAt`, `soldAt`. Un listing hidden n'apparaît pas en browse/détail public mais reste visible par son owner.
- **ListingImage** — images d’annonce : `listingId`, `storageKey` (clé S3), `sortOrder`, `contentType`. Max 8 par annonce.
- **Favorite** — favoris (wishlist) : `userId`, `listingId`, unicité (userId, listingId).
- **ListingEvent** — audit des annonces (CREATED, PUBLISHED, UPDATED, SOLD, ARCHIVED).
- **UserCollection** (trade) — collection utilisateur : `userId`, `cardId`, `cardName`, `setCode`, `language`, `condition`, `quantity` ; unicité sur (userId, cardId, language, condition). Optionnels : `acquiredAt`, `acquisitionPriceCents`, `acquisitionCurrency` (suivi d'acquisition).
- **ExternalProductRef** (pricing) — mapping (cardId, language) vers IDs produit externes (Cardmarket/TCGPlayer). Unique (source, externalProductId).
- **CardPriceSnapshot** (pricing) — snapshots de prix externes : `trendCents`, `avgCents`, `lowCents`, `capturedAt`.
- **UserPortfolioSnapshot** (pricing) — snapshots historiques de la valeur du portfolio utilisateur : `totalValueCents`, `totalCostCents`, `pnlCents`, `capturedAt`.
- **TradeOffer** — offres d’échange : `creatorItemsJson` / `receiverItemsJson` (JSON avec `schemaVersion` en racine), `status` (PENDING | ACCEPTED | REJECTED | CANCELLED | EXPIRED), `expiresAt`, `counterOfOfferId` (optionnel, lien vers l’offre originale en cas de contre-offre). Relations self : `counterOf` / `counters`.
- **TradeEvent** — audit des offres (CREATED, ACCEPTED, REJECTED, CANCELLED, EXPIRED, COUNTERED).
- **TradeMessage** — chat sur une offre : `tradeOfferId`, `senderUserId`, `body` (max 2000), `createdAt`. Index `(tradeOfferId, createdAt, id)`.
- **TradeReadState** — état de lecture par offre/utilisateur : `tradeOfferId`, `userId`, `lastReadAt`, unicité (tradeOfferId, userId). Index `(userId, updatedAt)`.
- **Handover** (P1, remise en main propre) — demande de vérification physique : `listingId` ou `tradeOfferId`, `status` (PENDING_VERIFICATION | VERIFIED | REJECTED), `requestedByUserId`, `verifiedByUserId`.
- **ListingReport** (trust) — signalement d'annonce : `listingId`, `reporterUserId`, `reason`, `details?`, `status` (OPEN | RESOLVED | REJECTED). Anti-spam DB-level : unique partial index `(listingId, reporterUserId) WHERE status='OPEN'` (race-safe, conflit P2002 → 409). Index : (listingId, status, createdAt), (reporterUserId, createdAt).
- **ModerationAction** (trust) — action admin : `targetType` (LISTING | USER | TRADE), `targetId`, `actionType` (HIDE | UNHIDE | WARN | BAN | UNBAN | NOTE), `note?`, `actorUserId`. LISTING : HIDE/UNHIDE togglent `Listing.isHidden`. USER : BAN met à jour `UserModerationState`, UNBAN → `UserModerationState.isBanned=false` (clear banReason/bannedAt), WARN incrémente `warnCount` ; HIDE/UNHIDE invalides (400). TRADE : HIDE/UNHIDE invalides (400) ; NOTE/WARN/BAN enregistrés sans état métier. UNBAN invalide sur LISTING/TRADE (400). Index : (targetType, targetId, createdAt), (actorUserId, createdAt).
- **UserModerationState** (trust) — état de modération utilisateur : `userId` (unique), `isBanned`, `banReason?`, `bannedAt?`, `warnCount`, `lastWarnAt?`, `updatedAt`. Utilisé pour bloquer les utilisateurs bannis sur les routes d’écriture (403 USER_BANNED). Index : (isBanned), (warnCount).
- **SellerReputation** (trust) — réputation vendeur : `userId` (unique), `score`, `totalSales`, `totalTrades`, `disputesCount`, `reportsCount`. Score V1 = totalSales + totalTrades - reportsCount * 2.
- **UserActiveProfile** (profile-types) — profils actifs d'un utilisateur : `userId`, `profileType` (COLLECTOR | SELLER | TRADER | INVESTOR). Unicité (userId, profileType). Permet d'activer/désactiver des fonctionnalités en fonction du profil utilisateur. Quand `PROFILE_GATE_ENABLED=true`, les routes portfolio nécessitent INVESTOR ou COLLECTOR, et la création de trade nécessite TRADER.

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

### Option A : PostgreSQL Docker + serveur sur le host (recommande)

```bash
# 1. Demarrer PostgreSQL
docker compose up -d postgres

# 2. Setup
cd server
cp .env.example .env            # credentials alignes avec docker-compose
npm run dev:db                   # prisma generate + migrate deploy vers PG Docker

# 3. Lancer
cd ..
npm run dev                      # server (8081) + client (5173) en parallele
```

### Option B : tout dans Docker

```bash
docker compose up -d             # PG + server avec hot-reload (bind mount src/ + prisma/)
```

### Acces

- API : `http://localhost:8081`
- Front : `http://localhost:5173` (Vite proxy vers l'API)

### Docker scripts

```bash
# Depuis la racine :
npm run docker:up               # docker compose up -d
npm run docker:down             # docker compose down
npm run docker:logs             # docker compose logs -f

# Depuis server/ :
npm run docker:up               # utilise ../docker-compose.yml
npm run docker:down
```

**Ou separement :**
- `npm run dev:server` — backend seul (port 8081)
- `npm run dev:client` — front seul (port 5173) ; l'API doit tourner sur 8081 pour les appels proxy.

## Sécurité

- **Helmet** — headers HTTP sécurisés (X-Content-Type-Options, X-Frame-Options, etc.).
- **Rate limiting** — 100 req/min global, 20 req/min sur les écritures (POST, PATCH, PUT, DELETE) par IP. Désactivé en mode test. Réponse 429 : `{ "error": { "code": "RATE_LIMITED", "message": "Too many requests" } }`.

## Scripts

**Racine (monorepo) :** `npm run dev` (server + client), `npm run dev:server`, `npm run dev:client`, `npm run build`, `npm test` (tests du server).

**Dans `server/` :**

| Script              | Description                    |
|---------------------|--------------------------------|
| `npm run dev`       | Démarrage en watch (tsx)       |
| `npm run build`     | Compilation TypeScript        |
| `npm run start`     | Démarrage en production       |
| `npm run prisma:generate` | Génère le client Prisma |
| `npm run prisma:migrate`  | Migrations dev        |
| `npm run prisma:studio`   | Interface Prisma     |
| `npm run test`            | Tests Vitest         |

**Import prix (Cardmarket Price Guide) :** avec `PRICE_IMPORT_ENABLED=true` et un fichier CSV (colonnes : idProduct, language, trendPrice, avgPrice, lowPrice, cardId, game), exécuter depuis `server/` : `npx tsx src/jobs/importCardmarketPriceGuide.ts <chemin-vers-csv>`. Le script upsert les références externes (ExternalProductRef) et crée les snapshots de prix (CardPriceSnapshot) par lots de 500.

**Dans `client/` :** `npm run dev` (Vite), `npm run build`, `npm run preview`. Routes : `/` (accueil), `/trades` (inbox sent/received), `/trades/new` (créer une offre d’échange), `/trades/:id` (thread messages + envoi + contre-offre).

## Tests

Depuis la racine (workspaces) :

```bash
npm test --workspace=server
```

Sous **PowerShell**, préférer `;` à `&&`, ou utiliser `Set-Location` :

```powershell
Set-Location "C:\chemin\vers\MarketPlace"
npm test --workspace=server
```

Pour un fichier de test précis :

```powershell
npm test --workspace=server -- --run src/domains/trade/routes.test.ts
```

Les tests utilisent **SQLite** automatiquement (base `server/.db/test.db`), aucun PostgreSQL requis. Couverture : marketplace (browse, lifecycle, mark-sold, listing images, favoris), trade (accept/reject/cancel, contre-offres, messages, inbox unread/lastMessage, mark-read, inventaire), collection, profile, analytics, handover, upload. Le **nombre de tests** est à valider après un `npm test --workspace=server` vert (voir section Dépannage si lock Prisma).

### Dépannage Windows (lock Prisma)

Si `prisma generate` échoue avec **EPERM** (rename du `query_engine-*.dll`), un process Node garde souvent le client Prisma chargé (serveur dev, vitest watch, etc.).

1. Arrêter tous les process Node liés au repo :
   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
   ```
2. Supprimer la génération Prisma côté server :
   ```powershell
   Set-Location ".\server"
   Remove-Item -Recurse -Force .\node_modules\.prisma -ErrorAction SilentlyContinue
   ```
3. Depuis la racine, regénérer et relancer les tests :
   ```powershell
   Set-Location ".."
   npm run prisma:generate --workspace=server
   npm test --workspace=server
   ```
4. Si ça relock encore : fermer dev server / vitest watch dans les autres terminaux. Dernier recours : `Remove-Item -Recurse -Force .\server\node_modules` puis `npm i` et `npm run prisma:generate --workspace=server`.

## Endpoints

### Publics

- **GET /health** — Healthcheck  
  Réponse : `{ "data": { "status": "ok" } }`

- **GET /marketplace/ping** — Test routing marketplace  
  Réponse : `{ "data": { "pong": true } }`

- **GET /marketplace/listings** — Parcourir les annonces publiées. Query : `game`, `category`, `language`, `condition`, `setCode`, `cardId`, `minPrice`, `maxPrice`, `search`, `sort` (price_asc \| price_desc \| date_desc \| date_asc), `cursor`, `limit` (1–50, défaut 20). Réponse : `{ "data": { "items": [...], "nextCursor": string \| null } }`.

- **GET /marketplace/listings/:id** — Détail d'une annonce. Public si PUBLISHED ; owner uniquement si DRAFT/ARCHIVED/SOLD. Auth optionnelle (Bearer token si connecté). Erreur 404 si non visible. Réponse enrichie avec `marketPriceCents` et `deltaCents` si un snapshot de prix existe pour la carte.

- **GET /cards/:cardId/price** — Prix marché pour une carte. Query : `language` (obligatoire), `source` (optionnel, défaut CARDMARKET). Réponse : `{ "data": { cardId, language, source, externalProductId, currency, trendCents, avgCents, lowCents, capturedAt } }`. 404 si pas de référence ou pas de snapshot.

### Prix marché & portfolio (protégés)

- **GET /users/me/portfolio** — Valeur du portfolio (auth). Calcul à partir de la collection + derniers prix (CARDMARKET). Réponse : `{ "data": { totalValueCents, totalCostCents, pnlCents, currency, itemCount, valuedCount, missingCount } }`.
- **GET /users/me/portfolio/history** — Historique des snapshots portfolio (auth). Query : `range` (7d \| 30d \| 90d, défaut 30d), `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor" } }`.

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

### Profile Types (protégés)

- **GET /users/me/profiles** — Liste des profils activés (auth). Réponse : `{ "data": { "profiles": ["COLLECTOR", ...], "available": ["COLLECTOR", "SELLER", "TRADER", "INVESTOR"] } }`.
- **PUT /users/me/profiles** — Activer/désactiver des profils (idempotent, auth). Body : `{ "profiles": ["COLLECTOR", "TRADER"] }`. Réponse : `{ "data": { "profiles": [...], "available": [...] } }`.

Quand `PROFILE_GATE_ENABLED=true` : les routes portfolio (GET /users/me/portfolio, /portfolio/history) nécessitent INVESTOR ou COLLECTOR. La création de trade (POST /trade/offers) nécessite TRADER.

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

- **GET /trade/offers** — Lister les offres envoyées ou reçues. Query : `type` (sent | received), `status` optionnel, `cursor`, `limit`. Chaque item inclut `lastMessage` (dernier message du thread) et `unreadCount` (messages non lus pour l’utilisateur courant). Réponse : `{ "data": { "items": [...], "nextCursor": string | null } }`.
- **GET /trade/offers/:id** — Détail d'une offre (creator ou receiver uniquement). Inclut les events. Erreurs : 404, 403.
- **POST /trade/offers** — Créer une offre d’échange. Body : `receiverUserId`, `creatorItemsJson`, `receiverItemsJson` (doivent contenir `schemaVersion`), optionnel `expiresInHours` (1..168, défaut 72). Réponse 201 : `{ "data": { "tradeOfferId": "..." } }`.
- **POST /trade/offers/:id/accept** — Accepter (receiver uniquement, PENDING non expiré). Si l’offre a déjà une contre-offre, 409 **OFFER_COUNTERED**. Valide que creator/receiver ont les items en collection, puis met à jour les inventaires dans la même transaction. Erreur 409 **INSUFFICIENT_QUANTITY** si quantité insuffisante.
- **POST /trade/offers/:id/reject** — Rejeter (receiver uniquement). Réponse : `{ "data": { "ok": true } }`.
- **POST /trade/offers/:id/cancel** — Annuler (creator uniquement). Réponse : `{ "data": { "ok": true } }`.
- **POST /trade/offers/:id/counter** — Créer une contre-offre (receiver de l’offre originale uniquement). L’offre originale doit être PENDING et non expirée. Body : `creatorItemsJson`, `receiverItemsJson` (avec `schemaVersion`), optionnel `expiresInHours`. Crée une nouvelle offre liée via `counterOfOfferId` + event COUNTERED sur l’originale. Erreurs : 404, 403, 409 (état invalide/expirée).
- **POST /trade/offers/:id/read** — Marquer le thread comme lu (creator ou receiver uniquement). L’offre doit être PENDING ou ACCEPTED (après `markExpiredIfNeeded`). Met à jour `TradeReadState.lastReadAt` sur le dernier message du thread (ou now si aucun). Réponse : `{ "data": { "ok": true } }`. Erreurs : 404, 403, 409 OFFER_EXPIRED / INVALID_STATE.
- **POST /trade/offers/:id/messages** — Envoyer un message sur une offre (creator ou receiver uniquement). L’offre doit être PENDING ou ACCEPTED (après `markExpiredIfNeeded`). Body : `body` (string, 1–2000 caractères). Réponse 201 : `{ "data": { "message" } }`. Erreurs : 404, 403, 409 **OFFER_EXPIRED** (offre expirée), 409 **INVALID_STATE** (REJECTED/CANCELLED).
- **GET /trade/offers/:id/messages** — Lister les messages d’une offre (creator ou receiver uniquement). Même règle d’état (PENDING ou ACCEPTED). Query : `cursor`, `limit` (1–50). Tri par `createdAt` asc, `id` asc. Réponse : `{ "data": { "items": [...], "nextCursor" } }`. Erreurs : 404, 403, 409 (OFFER_EXPIRED / INVALID_STATE).

### Collection (protégés + public)

- **GET /collection** — Liste la collection utilisateur (auth). Query : `cardId`, `language`, `cursor`, `limit` (1–100, défaut 50). Réponse : `{ "data": { "items": [...], "nextCursor": string ou null } }`.
- **GET /collection/dashboard** — Stats inventaire (auth). Réponse : `totalQty`, `totalCostCents`, `byGame`, `byLanguage`, `byCondition` (tableaux `{ key, qty, costCents }`).
- **GET /users/:id/collection** — Vue publique de la collection d’un utilisateur (items avec `isPublic: true`). Query : `cardId`, `language`, `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor": ... } }`.
- **PUT /collection/items** — Créer ou mettre à jour un item (upsert sur userId, cardId, language, condition). Body : `cardId`, `language`, `condition`, `quantity`, optionnels : `cardName`, `setCode`, `isPublic`, `acquiredAt`, `acquisitionPriceCents`, `acquisitionCurrency`. Si `isPublic` est omis à l’update, la valeur existante est conservée. Réponse : `{ "data": { "item": {...} } }`.
- **DELETE /collection/items** — Supprimer un item. Body : `cardId`, `language`, `condition`. Réponse : `{ "data": { "ok": true } }`. Erreur 404 si absent.

### Upload / pré-remplissage (OCR/IA) — protégés

- **POST /upload** — **Stub « suggestions »** (pas un vrai upload de fichier). Envoyer une image (URL ou data URL) pour obtenir des champs suggérés pour le formulaire listing (auth). Aucun fichier n’est stocké. Body : `imageUrl` ou `imageDataUrl`, au moins un requis. Réponse : `{ "data": { "suggested": { ... } } }` (stub null pour l’instant ; TODO OCR/IA). Les vraies images d’annonces passent par les endpoints listing images (presigned + attach).

### Remise en main propre (Handover) — protégés

- **POST /handovers** — Créer une demande de vérification physique (auth). Body : **exactement un** de `listingId` ou `tradeOfferId` (XOR ; 400 si les deux null ou les deux présents). Réservé au propriétaire du listing ou à une partie du trade. 409 si un handover PENDING existe déjà pour cette ref. Réponse 201 : `{ "data": { "handoverId", "handover" } }`. Erreurs : 400 (XOR), 404, 403, 409.
- **GET /handovers** — Lister les demandes (auth). Query : `mine=1` (défaut) → uniquement les siennes. Réponse : `{ "data": { "items": [...] } }`.
- **PATCH /handovers/:id** — Mettre à jour le statut (admin uniquement, `requireRole("ADMIN")`). Body : `status` (VERIFIED \| REJECTED). Mise à jour atomique (updateMany where id + PENDING_VERIFICATION ; 409 si 0). Réponse : `{ "data": { ...handover } }`. Erreurs : 404, 409.
- **JWT / requireRole** : `req.user.roles` est rempli par `requireAuth` depuis le JWT (claim `roles`, tableau de strings, ex. `["ADMIN"]`). En prod, vérifier avec le Shop le claim exact (ex. `realm_access.roles`).

### Trust / Modération

**Enforcement utilisateur banni :** Les routes d’écriture (marketplace create/update/publish/archive/mark-sold/favorite/images, trade create/accept/reject/cancel/counter/messages/read, collection items, reports) appliquent le middleware `requireNotBanned`. Si l’utilisateur est banni (`UserModerationState.isBanned=true`), réponse **403** `USER_BANNED`.

**Reports (auth) :**
- **POST /reports/listings/:id** — Signaler une annonce. Body : `{ reason, details? }`. L'annonce doit exister et ne pas appartenir au reporter. 1 report OPEN max par (reporter, listing) → 409 `ALREADY_REPORTED`. Limite : 5 reports/heure/utilisateur (in-memory, dev-only) → **429** `RATE_LIMITED`. Réponse 201 : `{ "data": { "reportId", "report" } }`.
- **GET /reports/me** — Mes signalements, pagination cursor/limit. Réponse : `{ "data": { "items": [...], "nextCursor" } }`.

**Admin modération (ADMIN only) :**
- **GET /admin/reports/listings** — Lister les signalements. Query : `status` optionnel (OPEN | RESOLVED | REJECTED), `cursor`, `limit`. Réponse : `{ "data": { "items": [...], "nextCursor" } }`.
- **GET /admin/reports/listings/:id** — Détail d’un signalement (id = report id). Réponse : `{ "data": { id, listingId, reporterUserId, reason, details, status, createdAt, updatedAt } }`. 404 si absent.
- **PATCH /admin/reports/:id** — Mettre à jour le statut d'un signalement. Body : `{ status: "RESOLVED" | "REJECTED" }`. Atomique : seuls les rapports OPEN sont modifiables → 409 **REPORT_NOT_OPEN** si déjà résolu/rejeté. Réponse : `{ "data": { ...report } }`.
- **POST /admin/moderation/actions** — Créer une action de modération. Body : `{ targetType, targetId, actionType, note? }`. LISTING : HIDE/UNHIDE → `Listing.isHidden`. USER : BAN → `UserModerationState.isBanned`, UNBAN → clears ban (`isBanned=false`, `banReason=null`, `bannedAt=null`), WARN → incrément `warnCount` ; HIDE/UNHIDE → 400 INVALID_ACTION. TRADE : HIDE/UNHIDE → 400 INVALID_ACTION ; NOTE/WARN/BAN enregistrés. UNBAN invalide sur LISTING/TRADE (400). Réponse 201 : `{ "data": { "action" } }`.

**Réputation (public + admin) :**
- **GET /users/:id/reputation** — Réputation publique. Réponse : `{ "data": { score, totalSales, totalTrades, disputesCount, reportsCount, updatedAt } }`. Renvoie des zéros si aucun enregistrement.
- **POST /internal/reputation/recompute** — Recalculer la réputation (ADMIN). Body : `{ userId }`. Calcule depuis les tables existantes (SOLD listings, ACCEPTED trades, OPEN reports). Réponse : `{ "data": { ...reputation } }`.

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
