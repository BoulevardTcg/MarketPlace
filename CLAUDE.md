# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

BoulevardTCG Market is a C2C marketplace and trading platform for TCG (Trading Card Games). It is a **separate backend** from the main BoulevardTCG Shop (which handles authentication, users, payments). This service:
- Consumes JWTs issued by the Shop project (does not manage identity)
- Handles marketplace listings (sell cards/products between users)
- Handles trade offers (exchange cards between users)
- Manages user collections (for trades/sales)
- Manages user profiles (local cache of user data)
- Provides price analytics and alerts
- Handles handover/anti-fake verification for physical exchanges

**Key principle**: Trading is a core feature, not secondary. Vente et échange are designed together.

**Monorepo**: Front et back sont dissociés à la racine — `server/` (API Express) et `client/` (app Vite + React).

## Commands

**À la racine (workspaces) :**
```bash
npm install               # Installe les deps de server + client
npm run dev               # Lance server (8081) + client (5173) en parallèle
npm run dev:server        # Backend seul
npm run dev:client        # Front seul
npm run build             # Build server puis client
npm test                  # Tests du server
```

**Dans `server/` :**
```bash
npm run dev               # Dev server (port 8081)
npm run build             # Compile TypeScript → dist/
npm run start             # Production
npm test                  # Vitest (SQLite)
npm run prisma:generate   # Génère le client Prisma
npm run prisma:migrate    # Migrations
npm run prisma:studio     # Prisma Studio
```

**Dans `client/` :**
```bash
npm run dev               # Vite dev (port 5173), proxy API → localhost:8081
npm run build             # Build pour prod
npm run preview           # Prévisualise le build
```

## Architecture

```
MarketPlace/                  # Monorepo
├── package.json              # Workspaces: server, client
├── server/                   # Backend API (Express, Prisma)
│   ├── src/
│   │   ├── main.ts           # Entry point
│   │   ├── app.ts            # Express, middleware, routes
│   │   ├── domains/          # Modules métier (voir section Domains)
│   │   │   ├── health/       # Health check
│   │   │   ├── auth/         # /me endpoint
│   │   │   ├── marketplace/  # Listings, images, favoris
│   │   │   ├── trade/        # Offres d'échange, messages, read state
│   │   │   ├── collection/   # Inventaire utilisateur
│   │   │   ├── profile/      # Profils utilisateur
│   │   │   ├── analytics/    # Prix et alertes
│   │   │   ├── handover/     # Vérification anti-fake
│   │   │   ├── upload/       # OCR/IA (stub)
│   │   │   └── trust/        # Reports, modération, réputation
│   │   └── shared/
│   │       ├── auth/         # jwt, requireAuth, optionalAuth, requireRole
│   │       ├── config/       # env (Zod validated)
│   │       ├── db/           # Prisma client (PostgreSQL prod, SQLite test/dev)
│   │       ├── http/         # asyncHandler, errorHandler, response, pagination
│   │       ├── observability/# logger, httpLogger, requestId
│   │       ├── storage/      # S3 presigned URLs
│   │       └── trade/        # items parser, expiration helpers
│   └── prisma/
│       ├── schema.prisma     # PostgreSQL
│       └── test/schema.prisma # SQLite tests
└── client/                   # Frontend (Vite + React + TypeScript)
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── api.ts
    │   ├── pages/            # TradesInbox, TradeThread, TradesNew
    │   └── types/            # trade.ts
    ├── index.html
    └── vite.config.ts        # Proxy /health, /me, /marketplace, /trade, … → 8081
```

## Domains

Each feature lives in `src/domains/<name>/routes.ts`. Add new domains following this pattern and register them in `app.ts`.

| Domain | Préfixe | Description |
|--------|---------|-------------|
| `health` | `/health` | Health check |
| `auth` | `/me` | Identité JWT (GET /me) |
| `pricing` | `/cards`, `/users/me/portfolio` | Prix marché (réf. externes), portfolio utilisateur |
| `marketplace` | `/marketplace` | Listings CRUD, images, favoris, recherche |
| `trade` | `/trade` | Offres d'échange, accept/reject/counter, messages, read state |
| `collection` | `/collection` | Inventaire cartes utilisateur (+ vue publique `/users/:id/collection`) |
| `profile` | `/users` | Profils utilisateur (GET/PATCH /users/me/profile, GET /users/:id/profile) |
| `analytics` | `/analytics` | Prix historiques, alertes de prix |
| `handover` | `/handovers` | Vérification anti-fake (admin-only pour validation) |
| `upload` | `/upload` | Stub OCR/IA pour reconnaissance de cartes |
| `trust` | `/reports`, `/admin`, `/internal` | Reports, modération admin, réputation |

## Key Patterns

**Response Format**: Always use helpers from `src/shared/http/response.ts`:
- Success: `ok(res, data)` → `{ "data": {...} }`
- Error: `fail(res, code, message, status)` → `{ "error": { "code", "message" } }`

**Route Handlers**: Wrap async handlers with `asyncHandler()` to catch promise rejections:
```typescript
router.post("/endpoint", requireAuth, asyncHandler(async (req, res) => { ... }));
```

**Validation**: Use Zod schemas for request bodies. Validation errors are caught by the global error handler (`VALIDATION_ERROR`, 400).

**Database Transactions**: Use Prisma `$transaction` for operations that create related records (e.g., Listing + ListingEvent, trade accept + inventory transfer).

**Error Handling**: Throw `AppError` for domain errors:
```typescript
throw new AppError("NOT_FOUND", "Listing not found", 404);
```

**Pagination**: Keyset cursor-based pagination via `src/shared/http/pagination.ts`:
- Query params: `cursor` (base64url) + `limit` (default 20, max 50)
- Response: `{ items: [...], nextCursor: string | null }`
- Use `buildPage()` helper for consistent pagination across endpoints.

**Rate Limiting** (disabled in tests):
- Global: 100 req/min
- Writes (POST/PUT/PATCH/DELETE): 20 req/min

## Database Models

**Marketplace:**
- **Listing**: Items with status flow (DRAFT → PUBLISHED → SOLD/ARCHIVED)
- **ListingEvent**: Audit trail for listing state changes
- **ListingImage**: Images S3 (storageKey, sortOrder, contentType)
- **Favorite**: Wishlist utilisateur (unique userId + listingId)

**Trading:**
- **TradeOffer**: Exchange proposals with expiration (default 72h, range 1-168h). Self-referential counter-offers (counterOf/counters)
- **TradeEvent**: Audit trail (CREATED, ACCEPTED, REJECTED, CANCELLED, EXPIRED, COUNTERED)
- **TradeMessage**: Messaging within trade thread
- **TradeReadState**: Tracks last read message per user per trade

**Collection:**
- **UserCollection**: User's card inventory (unique: userId + cardId + language + condition). `isPublic` controls visibility. Optional acquisition tracking: `acquiredAt`, `acquisitionPriceCents`, `acquisitionCurrency`.

**Pricing & Portfolio (external market data):**
- **ExternalProductRef**: Maps (cardId, language) to external source product IDs (Cardmarket/TCGPlayer). Unique per (source, externalProductId).
- **CardPriceSnapshot**: Price data from external sources (trendCents, avgCents, lowCents, capturedAt). Indexed by externalProductId + capturedAt.
- **UserPortfolioSnapshot**: Historical daily snapshots of a user's portfolio value (totalValueCents, totalCostCents, pnlCents).

**Profiles & Analytics:**
- **UserProfile**: Local cache (username, avatarUrl, bio, country, trustScore, tradeCount, listingCount)
- **PriceSnapshot**: Historical price data (unique: cardId + language + day)
- **PriceAlert**: Price monitoring (direction: DROP/RISE)

**Verification:**
- **Handover**: Physical handoff verification (status: PENDING_VERIFICATION → VERIFIED/REJECTED). XOR: linked to either a Listing or a TradeOffer.

**Trust / Moderation:**
- **ListingReport**: User-submitted listing reports (status: OPEN → RESOLVED/REJECTED). Anti-spam DB-level: unique partial index `(listingId, reporterUserId) WHERE status='OPEN'` (race-safe P2002 → 409).
- **ModerationAction**: Admin actions audit (HIDE/UNHIDE/WARN/BAN/UNBAN/NOTE). HIDE/UNHIDE toggle `Listing.isHidden` (non-destructive, status unchanged). UNBAN clears `UserModerationState.isBanned`.
- **SellerReputation**: Computed score per user (totalSales + totalTrades - reportsCount * 2).

JSON fields (`attributesJson`, `creatorItemsJson`, `receiverItemsJson`) must include `schemaVersion` for future compatibility.

## Testing

Tests use SQLite (auto-configured). Pattern:
```typescript
import { resetDb } from "../../test/db.js";

beforeEach(async () => { await resetDb(prisma); });
```

Run a single test file: `npx vitest run src/domains/marketplace/routes.test.ts`

## Authentication

JWT verification supports both:
- RS256 with `JWT_PUBLIC_KEY` (preferred for production)
- HS256 with `JWT_SECRET` (fallback/dev)

Middleware disponibles dans `src/shared/auth/`:
- `requireAuth` — obligatoire, sets `req.user.userId` + `req.user.roles`
- `optionalAuth` — continue sans erreur si token absent/invalide
- `requireRole(role)` — factory, vérifie `req.user.roles` (ex: `requireRole("ADMIN")`)

## Middleware Stack

L'ordre dans `app.ts` :
1. `helmet()` — security headers
2. `express.json()` — body parsing
3. CORS — configurable via `CORS_ORIGIN` (comma-separated), défaut `http://localhost:5173` en dev
4. Rate limiting (global + writes), désactivé en test
5. `requestIdMiddleware` — génère un ID unique par requête
6. `httpLoggerMiddleware` — logs HTTP
7. Routes (domaines)
8. `errorHandler` — global error handler (ZodError → 400, AppError → status, autres → 500)
9. 404 fallback

## Environment Variables

Required: `DATABASE_URL` (PostgreSQL connection string, ou `file:./path` pour SQLite en dev)
Required (one of): `JWT_PUBLIC_KEY` or `JWT_SECRET`
Optional: `PORT` (default 8081), `CORS_ORIGIN` (comma-separated), `NODE_ENV`
Optional (S3): `LISTING_IMAGES_BUCKET`, `AWS_REGION` — nécessaires pour l'upload d'images listing
Optional (import prix): `PRICE_IMPORT_ENABLED` (`true` | `false`, défaut `false`) — active le job d'import CSV Cardmarket Price Guide
