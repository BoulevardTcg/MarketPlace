# Documentation complète du projet BoulevardTCG Market

Ce document décrit l’ensemble du projet : architecture, backend (API, domaines, modèles), frontend (pages, composants, routes), configuration et bonnes pratiques.

---

## Sommaire

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [Architecture globale](#2-architecture-globale)
3. [Backend (server/)](#3-backend-server) — Stack, app, domaines et routes API, shared, Prisma, jobs, env, tests
4. [Frontend (client/)](#4-frontend-client) — Stack, routes React, composants, hooks, API, types
5. [Racine du monorepo](#5-racine-du-monorepo)
6. [Sécurité (résumé)](#6-sécurité-résumé)
7. [Commandes utiles](#7-commandes-utiles)
8. [Technologies (résumé)](#8-technologies-résumé)

---

## 1. Contexte et objectifs

**BoulevardTCG Market** est une plateforme C2C (consumer-to-consumer) de **marketplace** et d’**échanges** de cartes TCG (Trading Card Games). Elle est **séparée** du projet Boutique BoulevardTCG, qui gère l’authentification, les utilisateurs et les paiements.

- **Auth** : le Marketplace ne gère pas l’identité. Il consomme des **JWT** émis par le projet Shop (Boutique).
- **Fonctionnalités** : annonces (listings), échanges (trade offers), collection utilisateur, profils, prix/portfolio, alertes, modération, handover (vérification physique).
- **Principe** : la vente et l’échange sont conçus ensemble ; le trading est une fonctionnalité centrale.

**Monorepo** : à la racine, deux workspaces npm — `server/` (API Express + Prisma) et `client/` (Vite + React).

---

## 2. Architecture globale

```
MarketPlace/
├── package.json              # Workspaces: server, client | scripts: dev, build, test, docker:*
├── docker-compose.yml        # Postgres (5433) + server (8081), volumes hot-reload
├── CLAUDE.md                 # Guide pour l’éditeur / IA
├── README.md                 # Installation, config, exemples API
├── PROJECT-DOCUMENTATION.md  # Ce fichier
│
├── server/                   # Backend API
│   ├── src/
│   │   ├── main.ts           # Point d’entrée (listen PORT)
│   │   ├── app.ts            # Express : Helmet, CORS, rate limit, routes, errorHandler
│   │   ├── domains/          # Modules métier (un routes.ts par domaine, souvent routes.test.ts)
│   │   ├── shared/           # Auth, config, db, http, observability, pricing, storage, trade, test
│   │   └── jobs/             # Import prix (Cardmarket CSV), snapshot quotidien TCGdex (DailyPriceSnapshot)
│   └── prisma/
│       ├── schema.prisma     # PostgreSQL (prod/dev)
│       └── test/schema.prisma # SQLite (tests)
│
└── client/                   # Frontend
    ├── index.html
    ├── vite.config.ts        # Proxy /market → 8081 (préfixe retiré)
    └── src/
        ├── main.tsx          # React + BrowserRouter
        ├── App.tsx           # Layout, Navbar, Routes, health
        ├── api.ts            # fetchWithAuth, refresh, helpers cartes
        ├── index.css         # Design system (variables, typo, composants)
        ├── pages/            # Une page par écran principal
        ├── components/       # Réutilisables (Navbar, ListingCard, FilterBar, etc.)
        ├── hooks/            # useAuth, useDebounce, useCart, etc.
        ├── types/            # marketplace.ts, trade.ts
        └── utils/            # listing.ts, etc.
```

**Ports** : API **8081**, client **5174** (voir `client/vite.config.ts`).

**Appels API depuis le client :** Le client utilise un basePath `/market` (défini dans `client/src/api.ts` : `VITE_API_URL ?? "/market"`). Les requêtes partent donc vers `/market/me`, `/market/marketplace/listings`, etc. En dev, le proxy Vite (`client/vite.config.ts`) envoie tout ce qui commence par `/market` vers le backend (port 8081) en **supprimant** le préfixe `/market` avant envoi. Le backend reçoit donc `/me`, `/marketplace/listings`, etc. — il n’y a pas de préfixe global côté serveur.

---

## 3. Backend (server/)

### 3.1 Stack

- **Runtime** : Node.js 24+
- **Framework** : Express
- **ORM** : Prisma (PostgreSQL en dev/prod, SQLite pour les tests)
- **Langage** : TypeScript
- **Validation** : Zod (body, query, params)
- **Auth** : JWT (RS256 avec clé publique ou HS256 avec secret)
- **Sécurité** : Helmet, CORS, rate limiting (voir `server/src/app.ts` l.34-58 : global 100/min, écritures 20/min ; désactivé en test)
- **Tests** : Vitest, Supertest

### 3.2 Point d’entrée et chaîne Express

| Fichier | Rôle |
|---------|------|
| `src/main.ts` | Charge la config, crée l’app Express, écoute sur `PORT` (défaut 8081). |
| `src/app.ts` | Configure Express : `helmet()`, `express.json()`, CORS (origines depuis `CORS_ORIGIN`), rate limiting (l.34-58, désactivé en test), `requestIdMiddleware`, `httpLoggerMiddleware`, montage des routes domaines (l.68-79, sans préfixe), `errorHandler`, puis 404 JSON. |

**Ordre des middlewares** : Helmet → JSON → CORS → Rate limit → Request ID → HTTP Logger → Routes → Error handler → 404.

**Format des réponses** (voir `shared/http/response.ts`) :
- Succès : `ok(res, data)` → `{ "data": ... }`
- Erreur métier : `throw new AppError("CODE", "message", status)` → `{ "error": { "code", "message" } }`
- Validation (Zod) : 400 `VALIDATION_ERROR`
- Erreur non gérée : 500 `INTERNAL_ERROR` (message générique, pas de stack exposée)

### 3.3 Domaines et routes API

Chaque domaine vit dans `src/domains/<nom>/routes.ts` et est monté dans **`server/src/app.ts` (l.68-79)** avec `app.use(healthRoutes)`, `app.use(authRoutes)`, etc. **Il n’y a pas de préfixe global** (pas de `API_PREFIX`) : chaque router déclare ses chemins en entier (ex. `/me`, `/marketplace/listings`).

---

#### Health

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/health` | Non | Health check. Réponse : `{ "data": { "status": "ok" } }`. |

---

#### Auth

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/me` | Oui | Utilisateur courant (JWT). Réponse : `userId`, `username`, `firstName`, `email`, `isAdmin`, `roles`. 401 si token absent/invalide. |

---

#### Pricing (prix marché, portfolio)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/cards/:cardId/price` | Non | Prix marché pour une carte. Query : `language` (requis), `source` (optionnel). Réponse : prix (trendCents, avgCents, lowCents, capturedAt). 404 si pas de données. |
| GET | `/cards/:cardId/price/history` | Non | Historique journalier des prix pour une carte. Query : `language` (requis), `days` (1–365, défaut 30), `source` (défaut TCGDEX). Données : DailyPriceSnapshot. Réponse : `series` (day, trendCents, lowCents, avgCents, highCents), `stats`. |
| GET | `/users/me/portfolio` | Oui | Valeur du portfolio (collection + prix CARDMARKET). Réponse : totalValueCents, totalCostCents, pnlCents, itemCount, etc. Profile gate si PROFILE_GATE_ENABLED. |
| POST | `/users/me/portfolio/snapshot` | Oui | Enregistre la valeur actuelle du portfolio dans UserPortfolioSnapshot. Profile gate si PROFILE_GATE_ENABLED. |
| GET | `/users/me/portfolio/history` | Oui | Historique des snapshots portfolio. Query : `range` (7d \| 30d \| 90d), `cursor`, `limit`. |

---

#### Marketplace (annonces, favoris, images)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/marketplace/ping` | Non | Ping route. |
| GET | `/marketplace/listings` | Optionnelle | Liste des annonces (browse). Query : `game`, `category`, `language`, `condition`, `minPrice`, `maxPrice`, `sort`, `cursor`, `limit`. Réponse paginée. Annonces PUBLISHED, non hidden. |
| GET | `/marketplace/listings/:id` | Optionnelle | Détail d’une annonce. 404 si draft/hidden pour non-propriétaire. |
| GET | `/marketplace/me/listings` | Oui | Mes annonces. Query : `status`, `sort`, `cursor`, `limit`. |
| POST | `/marketplace/listings` | Oui | Créer une annonce (DRAFT). Body : title, priceCents, quantity, game, category, language, condition, optionnels (cardId, cardName, setCode, edition, description, attributesJson). Réponse 201 : listingId. |
| PATCH | `/marketplace/listings/:id` | Oui | Modifier une annonce (DRAFT uniquement). Propriétaire. 403/409 si pas draft. |
| POST | `/marketplace/listings/:id/publish` | Oui | Publier (DRAFT → PUBLISHED). Propriétaire. |
| POST | `/marketplace/listings/:id/archive` | Oui | Archiver (DRAFT ou PUBLISHED → ARCHIVED). Propriétaire. |
| POST | `/marketplace/listings/:id/mark-sold` | Oui | Marquer vendu (PUBLISHED → SOLD). Décrémente la collection si cardId. Propriétaire. |
| POST | `/marketplace/listings/:id/favorite` | Oui | Toggle favori (annonces PUBLISHED). Réponse : favorited true/false. |
| GET | `/marketplace/me/favorites` | Oui | Liste « mes favoris », paginé. |
| POST | `/marketplace/listings/:id/images/presigned-upload` | Oui | URL presignée S3 pour upload. Body : contentType (optionnel). Propriétaire. 503 si S3 non configuré. |
| POST | `/marketplace/listings/:id/images/attach` | Oui | Enregistrer une image après upload. Body : storageKey (format listings/:listingId/:uuid.ext), sortOrder, contentType. Propriétaire. Vérif que storageKey appartient au listing. |
| GET | `/marketplace/listings/:id/images` | Optionnelle | Lister les images (public si PUBLISHED, sinon owner). |
| DELETE | `/marketplace/listings/:id/images/:imageId` | Oui | Supprimer une image. Propriétaire. |
| PATCH | `/marketplace/listings/:id/images/reorder` | Oui | Réordonner les images. Body : imageIds (ordre). Propriétaire. |

---

#### Trade (offres d’échange)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/trade/ping` | Non | Ping. |
| GET | `/trade/offers` | Oui | Liste offres (sent/received). Query : type, status, cursor, limit. Inclut lastMessage, unreadCount. |
| GET | `/trade/offers/:id` | Oui | Détail d’une offre (creator ou receiver). |
| POST | `/trade/offers` | Oui | Créer une offre. Body : receiverUserId, creatorItemsJson, receiverItemsJson (schemaVersion requis), optionnel expiresInHours (1–168, défaut 72). |
| POST | `/trade/offers/:id/accept` | Oui | Accepter (receiver, PENDING). Transfère les items en collection. 409 si contre-offre existante ou quantité insuffisante. |
| POST | `/trade/offers/:id/reject` | Oui | Rejeter (receiver). |
| POST | `/trade/offers/:id/cancel` | Oui | Annuler (creator). |
| POST | `/trade/offers/:id/counter` | Oui | Créer une contre-offre (receiver de l’originale, PENDING). Body : creatorItemsJson, receiverItemsJson, optionnel expiresInHours. |
| POST | `/trade/offers/:id/read` | Oui | Marquer le thread comme lu (dernier message). |
| POST | `/trade/offers/:id/messages` | Oui | Envoyer un message. Body : body (1–2000 car.). Offre PENDING ou ACCEPTED. |
| GET | `/trade/offers/:id/messages` | Oui | Lister les messages. Query : cursor, limit. |

---

#### Collection

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/collection` | Oui | Ma collection. Query : cardId, language, cursor, limit. |
| GET | `/collection/dashboard` | Oui | Stats : totalQty, totalCostCents, byGame, byLanguage, byCondition (tableaux { key, qty, costCents }). |
| GET | `/users/:id/collection` | Non | Vue publique de la collection (items isPublic=true). Query : cardId, language, cursor, limit. |
| PUT | `/collection/items` | Oui | Upsert item (userId, cardId, language, condition). Body : cardId, language, condition, quantity, optionnels (cardName, setCode, isPublic, acquiredAt, acquisitionPriceCents, acquisitionCurrency). |
| DELETE | `/collection/items` | Oui | Supprimer un item. Body : cardId, language, condition. 404 si absent. |

---

#### Profils

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/users/me/profile` | Oui | Mon profil (cache local). Crée un stub si absent. |
| PATCH | `/users/me/profile` | Oui | Mise à jour partielle. Body : username, avatarUrl, bio, country. |
| GET | `/users/:id/profile` | Non | Profil public par userId. 404 si absent. |

---

#### Profile types (COLLECTOR, SELLER, TRADER, INVESTOR)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/users/me/profiles` | Oui | Liste des profils activés + available. |
| PUT | `/users/me/profiles` | Oui | Activer/désactiver des profils. Body : profiles (tableau). Idempotent. |

Si `PROFILE_GATE_ENABLED=true` : portfolio nécessite INVESTOR ou COLLECTOR ; création de trade nécessite TRADER.

---

#### Analytics (prix demandé, alertes, ventes)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| GET | `/analytics/cards/:cardId/asked-price` | Non | Courbe prix demandé (listings PUBLISHED). Query : language, range (7d \| 30d \| 90d). Réponse : series, stats. |
| POST | `/analytics/alerts` | Oui | Créer une alerte. Body : cardId, language, thresholdCents, direction (DROP \| RISE). |
| GET | `/analytics/alerts` | Oui | Mes alertes. Query : cursor, limit. |
| GET | `/analytics/alerts/:id` | Oui | Détail alerte (owner). |
| PATCH | `/analytics/alerts/:id` | Oui | Mettre à jour (owner). |
| DELETE | `/analytics/alerts/:id` | Oui | Supprimer (owner). |
| GET | `/analytics/me/sales-summary` | Oui | Résumé ventes (revenus, byGame, monthly). |

---

#### Handover (remise en main propre)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| POST | `/handovers` | Oui | Créer une demande. Body : **un seul** de listingId ou tradeOfferId (XOR). Propriétaire listing ou partie du trade. 409 si handover PENDING déjà existant. |
| GET | `/handovers` | Oui | Lister les demandes. Query : mine=1 (défaut) → les siennes. |
| PATCH | `/handovers/:id` | Oui (ADMIN) | Mettre à jour le statut. Body : status (VERIFIED \| REJECTED). Atomique sur PENDING_VERIFICATION. |

---

#### Upload (stub OCR/IA)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| POST | `/upload` | Oui | Stub « suggestions » (imageUrl ou imageDataUrl). Aucun fichier stocké. Réponse : suggested (stub null). Les images d’annonces passent par presigned + attach. |

---

#### Trust (signalements, modération, réputation)

| Méthode | Chemin | Auth | Description |
|---------|--------|------|-------------|
| POST | `/reports/listings/:id` | Oui | Signaler une annonce. Body : reason, details. Pas son propre listing. 409 si déjà report OPEN. Rate limit 5/heure (dev). |
| GET | `/reports/me` | Oui | Mes signalements. Pagination. |
| GET | `/admin/reports/listings` | Oui (ADMIN) | Liste des signalements. Query : status, cursor, limit. |
| GET | `/admin/reports/listings/:id` | Oui (ADMIN) | Détail d’un signalement (id = report id). |
| PATCH | `/admin/reports/:id` | Oui (ADMIN) | Mettre à jour le statut (OPEN → RESOLVED/REJECTED). Atomique. |
| POST | `/admin/moderation/actions` | Oui (ADMIN) | Créer une action. Body : targetType (LISTING \| USER \| TRADE), targetId, actionType (HIDE, UNHIDE, WARN, BAN, UNBAN, NOTE), note. LISTING : HIDE/UNHIDE → isHidden. USER : BAN/UNBAN/WARN. |
| GET | `/users/:id/reputation` | Non | Réputation publique (score, totalSales, totalTrades, etc.). |
| POST | `/internal/reputation/recompute` | Oui (ADMIN) | Recalculer la réputation. Body : userId. |

**Utilisateurs bannis** : `requireNotBanned` bloque toutes les routes d’écriture (403 USER_BANNED). Les routes admin ne l’appliquent pas.

---

### 3.4 Shared (backend)

| Dossier / fichier | Rôle |
|-------------------|------|
| **auth/jwt.ts** | Vérification JWT (RS256 ou HS256). Option `issuer` si `JWT_ISSUER` défini. Normalisation PEM (\\n). |
| **auth/requireAuth.ts** | Middleware : header `Authorization: Bearer <token>`, vérifie le token, pose `req.user`. 401 sinon. |
| **auth/optionalAuth.ts** | Même lecture du token ; si absent/invalide, continue sans user (pas d’erreur). |
| **auth/requireRole.ts** | Factory `requireRole(role)`. Vérifie `req.user.roles`. Pour ADMIN, si `ADMIN_USER_IDS` est défini, exige userId dans la liste. |
| **auth/requireNotBanned.ts** | Vérifie `UserModerationState.isBanned` ; 403 USER_BANNED si banni. |
| **auth/requireProfile.ts** | Factory (optionnel) : vérifie profils actifs si `PROFILE_GATE_ENABLED=true`. |
| **auth/types.ts** | Types AuthUser, etc. |
| **config/env.ts** | Chargement .env (ou .env.test), schéma Zod. Interdit JWT_PRIVATE_KEY. Variables : NODE_ENV, PORT, DATABASE_URL, JWT_*, CORS_ORIGIN, LISTING_IMAGES_BUCKET, AWS_REGION, PRICE_IMPORT_ENABLED, PROFILE_GATE_ENABLED, JWT_ISSUER, ADMIN_USER_IDS. |
| **db/prisma.ts** | Client Prisma singleton (choix schema selon NODE_ENV pour les tests). |
| **http/response.ts** | ok(), fail(), AppError. |
| **http/errorHandler.ts** | Gestionnaire global : ZodError → 400, AppError → status, autre → 500 (message générique). |
| **http/asyncHandler.ts** | Wrapper pour async route handlers (next(err)). |
| **http/pagination.ts** | paginationQuerySchema (cursor, limit), encodeCursor, decodeCursor, buildPage. |
| **observability/logger.ts** | Logger structuré. |
| **observability/httpLogger.ts** | Log de chaque requête (method, path, status, durationMs). |
| **observability/requestId.ts** | Génère un requestId par requête, header de réponse. |
| **storage/presigned.ts** | Génération d’URLs S3 presignées (upload images listings). |
| **trade/expiration.ts** | Marque les offres expirées (PENDING → EXPIRED). |
| **trade/items.ts** | Parsing / validation des items (creatorItemsJson, receiverItemsJson). |
| **pricing/tcgdexClient.ts** | Client API TCGdex (api.tcgdex.net) : fetchCardPrice(cardId, language) → trendCents, lowCents, avgCents, highCents, rawJson. Utilisé par le job snapshot quotidien. |
| **test/db.ts** | resetDb(prisma) pour vider et réinitialiser la base de test. |
| **test/setup.ts** | NODE_ENV=test, DATABASE_URL SQLite, JWT_SECRET, PORT. |

### 3.5 Modèles Prisma (résumé)

- **Listing** : annonces (category, game, language, condition, status DRAFT→PUBLISHED→SOLD/ARCHIVED, isHidden). Relations : ListingEvent, ListingImage, Favorite, ListingReport, Handover.
- **ListingImage** : storageKey (S3), sortOrder, contentType. Max 8 par listing.
- **Favorite** : userId + listingId (unique).
- **UserCollection** : inventaire (userId, cardId, language, condition, quantity, isPublic, acquisitionPriceCents, etc.). Unique (userId, cardId, language, condition).
- **TradeOffer** : creatorUserId, receiverUserId, creatorItemsJson, receiverItemsJson, status, expiresAt, counterOfOfferId (contre-offres). Relations : TradeEvent, TradeMessage, TradeReadState, Handover.
- **TradeMessage** : tradeOfferId, senderUserId, body. Index (tradeOfferId, createdAt, id).
- **TradeReadState** : lastReadAt par (tradeOfferId, userId).
- **UserProfile** : cache local (username, avatarUrl, bio, country, trustScore, tradeCount, listingCount).
- **UserActiveProfile** : profils activés (COLLECTOR, SELLER, TRADER, INVESTOR). Unique (userId, profileType).
- **PriceSnapshot** : prix demandés (listings PUBLISHED) par (cardId, language, day). Rempli à la demande dans analytics.
- **PriceAlert** : userId, cardId, language, thresholdCents, direction (DROP/RISE), active.
- **ExternalProductRef** : mapping (cardId, language) → externalProductId. Sources : CARDMARKET, TCGPLAYER, TCGDEX.
- **CardPriceSnapshot** : derniers prix externes par (source, externalProductId, capturedAt). Pas de granularité jour.
- **DailyPriceSnapshot** : un point de prix par jour par (cardId, language, source, day). Défaut source TCGDEX. Champs : trendCents, lowCents, avgCents, highCents, rawJson. Alimenté par le job tcgdexDailySnapshot.
- **UserPortfolioSnapshot** : snapshots portfolio (totalValueCents, totalCostCents, pnlCents, capturedAt).
- **Handover** : listingId **ou** tradeOfferId (XOR), status PENDING_VERIFICATION→VERIFIED/REJECTED, requestedByUserId, verifiedByUserId.
- **ListingReport** : listingId, reporterUserId, reason, details, status OPEN→RESOLVED/REJECTED. Contrainte unique partielle (listingId, reporterUserId) WHERE status='OPEN'.
- **ModerationAction** : targetType (LISTING/USER/TRADE), targetId, actionType (HIDE, UNHIDE, WARN, BAN, UNBAN, NOTE), actorUserId.
- **UserModerationState** : userId, isBanned, banReason, bannedAt, warnCount.
- **SellerReputation** : userId, score, totalSales, totalTrades, disputesCount, reportsCount.

### 3.6 Jobs

- **src/jobs/importCardmarketPriceGuide.ts** : import des prix depuis un CSV Cardmarket Price Guide vers CardPriceSnapshot. Activé si `PRICE_IMPORT_ENABLED=true`.
- **src/jobs/tcgdexDailySnapshot.ts** : job manuel — appelle l’API TCGdex pour les paires (cardId, language) issues de UserCollection, des listings PUBLISHED/SOLD, ou de ExternalProductRef (source TCGDEX). Crée ou met à jour un **DailyPriceSnapshot** par jour (UTC). Commande : `npm run job:tcgdex`. Rate limit 200 ms entre appels.

### 3.7 Variables d’environnement (server)

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| DATABASE_URL | Oui (sauf dev avec défaut) | URL PostgreSQL. En test, non utilisé (SQLite via script). |
| JWT_PUBLIC_KEY ou JWT_SECRET | Au moins un | RS256 (clé publique) ou HS256 (secret). |
| JWT_PRIVATE_KEY | Interdit | Ne doit jamais être défini (sécurité). |
| JWT_ISSUER | Non | Si défini, les tokens doivent avoir iss correspondant. |
| ADMIN_USER_IDS | Non | Liste d’IDs séparés par des virgules ; allowlist ADMIN. |
| PORT | Non | Défaut 8081. |
| NODE_ENV | Non | development \| production \| test. |
| CORS_ORIGIN | Non | Origines autorisées (virgules). Défaut dev : localhost:5173, 5174. |
| LISTING_IMAGES_BUCKET | Non | Bucket S3 pour images. Si absent, presigned renvoie 503. |
| AWS_REGION | Non | Requis si bucket défini. |
| PRICE_IMPORT_ENABLED | Non | true \| false. Défaut false. |
| PROFILE_GATE_ENABLED | Non | true \| false. Défaut false. |

### 3.8 Tests

- **Base** : SQLite, schéma `prisma/test/schema.prisma`, migrations dans `prisma/test/migrations/`.
- **Setup** : `beforeEach` → `resetDb(prisma)` pour repartir d’une base vide.
- **Fichiers** : `src/domains/*/routes.test.ts` (health, auth, marketplace, trade, collection, pricing, profile, profile-types, analytics, handover, upload, trust).
- **Commande** : `npm test` (ou `npx vitest run`). Un fichier : `npx vitest run src/domains/marketplace/routes.test.ts`.

---

## 4. Frontend (client/)

### 4.1 Stack

- **Build** : Vite
- **UI** : React (version dans `client/package.json`)
- **Routing** : React Router
- **Langage** : TypeScript
- **Styles** : CSS (variables, design system dans `index.css`). Pas de Tailwind.

### 4.2 Entrée et layout

| Fichier | Rôle |
|---------|------|
| `index.html` | Point d’entrée, viewport, polices (Cormorant Garamond, Inter, JetBrains Mono). |
| `src/main.tsx` | Rendu React (StrictMode, BrowserRouter, App). |
| `src/App.tsx` | Providers (ErrorBoundary, AuthProvider, CartProvider), Navbar, toggle thème, health badge, Routes, footer. |
| `src/index.css` | Variables (couleurs, espacements, typo, radius, ombres), thèmes dark/light, classes utilitaires (layout, header, cards, boutons, grilles, responsive, portfolio, etc.). |

**Proxy Vite** : en dev, le client appelle l’API sous le basePath `/market` ; le proxy (`vite.config.ts`) envoie ces requêtes vers `http://localhost:8081` en retirant le préfixe `/market` (voir section 2).

### 4.3 Routes React (pages)

| Route | Composant | Description |
|-------|------------|-------------|
| `/` | Accueil | PageHeader, liens « Commencer », santé API. |
| `/produits` | MarketplaceBrowse | Liste des annonces (filtres, tri, pagination). |
| `/marketplace` | MarketplaceBrowse | Même écran. |
| `/marketplace/:id` | ListingDetail | Détail d’une annonce, images, prix, favoris. |
| `/annonces` | MyListings | Mes annonces (brouillons, publiées, etc.). |
| `/annonces/new` | CreateListing | Création d’annonce (formulaire, upload images). |
| `/annonces/:id/edit` | EditListing | Édition d’annonce (brouillon). |
| `/portfolio` | PortfolioDashboard | Dashboard collection (totalQty, byGame/byLanguage/byCondition, ventes, ROI). |
| `/trade`, `/trades` | TradesInbox | Liste des offres d’échange. |
| `/trades/new` | TradesNew | Nouvelle offre d’échange. |
| `/trades/:id` | TradeThread | Détail d’une offre, messages, accept/reject/counter. |
| `/actualites`, `/contact`, `/panier`, `/profile`, `/admin` | PlaceholderPage | Pages placeholder (titre + description). |
| `/connexion` | LoginPage | Connexion (redirection Boutique ou formulaire). |

Les pages lourdes sont chargées en **lazy** (Suspense + fallback Skeleton).

### 4.4 Composants

| Composant | Fichier | Rôle |
|-----------|---------|------|
| Navbar | Navbar/Navbar.tsx | Navigation principale, liens, toggle thème, recherche. |
| SearchBox | Navbar/SearchBox.tsx | Champ recherche (navbar). |
| MobileBottomSheet | Navbar/MobileBottomSheet.tsx | Menu mobile (drawer). |
| PageHeader | ui/PageHeader.tsx | En-tête de page (titre, sous-titre, action). |
| ListingCard, ListingCardSkeleton, ListingGridSkeleton | ListingCard.tsx | Carte annonce (liste), squelettes. |
| FilterBar | FilterBar.tsx | Filtres marketplace (recherche, game, catégorie, langue, condition, prix). |
| SortSelect | SortSelect.tsx | Tri des listes. |
| PriceDisplay, formatCents | PriceDisplay.tsx | Affichage prix (JetBrains Mono). |
| PriceDeltaBadge | PriceDeltaBadge.tsx | Badge delta prix (positif/négatif). |
| CardAutocomplete | CardAutocomplete.tsx | Autocomplétion cartes (suggestions API Boutique). |
| CardPriceCharts | CardPriceCharts.tsx | Graphiques prix : onglet Historique (courbe jour par jour via GET /cards/:cardId/price/history, DailyPriceSnapshot TCGdex), Marché, Boulevard. |
| ErrorBoundary | ErrorBoundary.tsx | Capture des erreurs React, affichage fallback. |
| ErrorState, EmptyState | ErrorState.tsx, EmptyState.tsx | États d’erreur et liste vide. |
| Skeleton | Skeleton.tsx | Chargement (heading, text, rect). |
| Badge, TrustBanner | Badge.tsx, TrustBanner.tsx | Badges et bannière confiance. |
| LoadMoreButton | LoadMoreButton.tsx | Pagination « Charger plus ». |
| LiquidMetalIconButton | ui/LiquidMetalIconButton.tsx | Bouton icône. |
| icons | icons.tsx | Icônes SVG. |

Exports centralisés dans `src/components/index.ts`.

### 4.5 Hooks et API

| Fichier | Rôle |
|---------|------|
| `api.ts` | `getApiUrl()`, `getAccessToken()` / `setAccessToken()`, `refreshAccessToken()` (cookie httpOnly), `fetchWithAuth(path, options)` (retry après 401 + refresh). Helpers recherche cartes (Boutique). |
| `hooks/useAuth.tsx` | Contexte auth : user, loading, login (redirect ou token), logout. Charge GET /me avec token en mémoire. |
| `hooks/useDebounce.ts` | Valeur debounced. |
| `hooks/useOutsideClick.ts` | Détection clic hors d’un élément. |
| `hooks/useReducedMotion.ts` | Préférence reduced-motion. |
| `hooks/useCart.tsx` | Contexte panier (CartProvider). |

### 4.6 Types et utils

| Fichier | Rôle |
|---------|------|
| `types/marketplace.ts` | Listing, CollectionDashboard, BreakdownEntry, SalesSummary, MonthlySales, etc. |
| `types/trade.ts` | Types offres d’échange, messages. |
| `utils/listing.ts` | Helpers listing (validation, format). |

### 4.7 Config client

| Fichier | Rôle |
|---------|------|
| `vite.config.ts` | Build Vite, proxy `/market` → 8081 (préfixe retiré côté backend). |
| `src/vite-env.d.ts` | Types pour import.meta.env (VITE_*). |

Variables exposées au client : `VITE_API_URL`, `VITE_BOUTIQUE_API_URL` (pas de secrets).

---

## 5. Racine du monorepo

| Élément | Rôle |
|--------|------|
| `package.json` | Workspaces `server`, `client`. Scripts : `dev` (server + client), `dev:server`, `dev:client`, `build`, `test` (server), `docker:up`, `docker:down`, `docker:logs`. |
| `docker-compose.yml` | Services : postgres (port 5433), server (port 8081). Volumes pour hot-reload (server/src, server/prisma). |
| `CLAUDE.md` | Guide pour l’éditeur / IA (contexte, commandes, architecture, patterns, auth, env, Docker). |
| `README.md` | Installation, configuration, variables d’env, modèles Prisma, lancer en dev (Docker ou host), sécurité, scripts, **liste détaillée des routes API** avec body/query/réponses. |

---

## 6. Sécurité (résumé)

- **Helmet** : en-têtes HTTP sécurisés.
- **CORS** : origines configurées (pas de * en prod).
- **Rate limiting** : configuré dans `server/src/app.ts` (globalLimiter, writeLimiter) ; valeurs actuelles 100 req/min global, 20 req/min sur les écritures ; désactivé en test.
- **JWT** : algorithmes explicites (RS256 ou HS256) ; pas d’alg:none. Issuer optionnel ; allowlist ADMIN optionnelle.
- **Erreurs** : pas de stack trace ni détail technique exposé au client.
- **Validation** : Zod sur body/query/params.
- **Autorisation** : vérification propriétaire (listings, trades, collection, handover, alertes) ; routes admin avec requireRole("ADMIN"). Utilisateurs bannis bloqués (requireNotBanned) sur les écritures.
- **Attach image** : storageKey doit commencer par `listings/${listingId}/` (éviter IDOR).
- **Token côté client** : en mémoire uniquement ; refresh via cookie httpOnly.

---

## 7. Commandes utiles

```bash
# Racine
npm install
npm run dev              # server (8081) + client (5174)
npm run dev:server       # backend seul
npm run dev:client       # front seul
npm run build            # build server puis client
npm test                 # tests server
npm run docker:up        # Postgres + server en Docker
npm run docker:down
npm run docker:logs

# Server
cd server
npm run dev              # tsx watch
npm run build && npm run start
npm test                 # Vitest
npm run prisma:generate
npm run prisma:migrate   # migrations
npm run prisma:studio
npm run dev:db           # generate + migrate deploy
npm run job:tcgdex       # snapshot quotidien prix TCGdex → DailyPriceSnapshot

# Client
cd client
npm run dev              # Vite (5174)
npm run build
npm run preview
```

### Dépannage : migration en échec (Docker)

Si au démarrage Docker une migration est marquée comme **failed** (ex. `20260216120000_add_daily_price_snapshot`), exécuter **une fois** (depuis la racine du monorepo) :

```bash
docker compose run --rm server npx prisma migrate resolve --rolled-back "20260216120000_add_daily_price_snapshot"
```

Puis relancer `docker compose up --build`. La migration a été scindée en deux (ALTER TYPE puis CREATE TABLE) pour respecter la contrainte PostgreSQL « nouvelle valeur d’enum doit être commitée avant utilisation ». Détails : `server/prisma/migrations/20260216120000_add_daily_price_snapshot/README.md`.

---

## 8. Technologies (résumé)

| Couche | Technologies |
|--------|--------------|
| Backend | Express, Prisma, Zod, jsonwebtoken, Helmet, CORS, express-rate-limit, Vitest, Supertest |
| Frontend | React (voir `client/package.json`), React Router, Vite, CSS (design system, responsive) |
| Base de données | PostgreSQL (dev/prod), SQLite (tests) |
| Stockage | S3 (presigned) pour images listings (optionnel) |
| Auth | JWT émis par le Shop (RS256 ou HS256), token en mémoire côté client, refresh via cookie httpOnly |

---

*Ce document est une photographie du projet à la date de rédaction. Pour les détails à jour des routes (body, query, codes d’erreur), se référer au README.md et au code source dans `server/src/domains/` et `client/src/`.*
