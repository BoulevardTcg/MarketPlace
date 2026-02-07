# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

BoulevardTCG Market is a C2C marketplace and trading platform for TCG (Trading Card Games). It is a **separate backend** from the main BoulevardTCG Shop (which handles authentication, users, payments). This service:
- Consumes JWTs issued by the Shop project (does not manage identity)
- Handles marketplace listings (sell cards/products between users)
- Handles trade offers (exchange cards between users)
- Manages user collections (for trades/sales)

**Key principle**: Trading is a core feature, not secondary. Vente et échange are designed together.

## Commands

```bash
# Development
npm run dev              # Start dev server with hot-reload (port 8081)

# Build & Production
npm run build            # Compile TypeScript to dist/
npm run start            # Run production build

# Testing (uses SQLite automatically, no PostgreSQL needed)
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode

# Database
npm run prisma:generate  # Generate Prisma client after schema changes
npm run prisma:migrate   # Create and apply migrations
npm run prisma:studio    # Visual database explorer
```

## Architecture

```
server/
├── src/
│   ├── main.ts              # Entry point (starts server)
│   ├── app.ts               # Express setup, middleware chain, route mounting
│   ├── domains/             # Feature modules (domain-driven)
│   │   ├── auth/            # /me endpoint
│   │   ├── health/          # /health endpoint
│   │   ├── marketplace/     # Listing CRUD (create, publish, etc.)
│   │   └── trade/           # Trade offer creation
│   └── shared/              # Cross-cutting concerns
│       ├── auth/            # JWT verification, requireAuth middleware
│       ├── config/          # Environment validation (Zod)
│       ├── db/              # Prisma client singleton
│       ├── http/            # Response helpers, error handler, asyncHandler
│       └── observability/   # Logger, HTTP logging, request ID
├── prisma/
│   ├── schema.prisma        # Main PostgreSQL schema
│   └── test/schema.prisma   # SQLite test schema
```

## Key Patterns

**Domain Organization**: Each feature lives in `src/domains/<name>/routes.ts`. Add new domains following this pattern.

**Response Format**: Always use helpers from `src/shared/http/response.ts`:
- Success: `ok(res, data)` → `{ "data": {...} }`
- Error: `fail(res, code, message, status)` → `{ "error": { "code", "message" } }`

**Route Handlers**: Wrap async handlers with `asyncHandler()` to catch promise rejections:
```typescript
router.post("/endpoint", requireAuth, asyncHandler(async (req, res) => { ... }));
```

**Validation**: Use Zod schemas for request bodies. Validation errors are caught by the global error handler.

**Database Transactions**: Use Prisma `$transaction` for operations that create related records (e.g., Listing + ListingEvent).

**Error Handling**: Throw `AppError` for domain errors:
```typescript
throw new AppError("NOT_FOUND", "Listing not found", 404);
```

## Database Models

- **Listing**: Marketplace items with status flow (DRAFT → PUBLISHED → SOLD/ARCHIVED)
- **ListingEvent**: Audit trail for listing state changes
- **UserCollection**: User's card inventory for trades
- **TradeOffer**: Exchange proposals with expiration (default 72h)
- **TradeEvent**: Audit trail for trade state changes

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

Protected routes use `requireAuth` middleware which sets `req.user.userId`.

## Environment Variables

Required: `DATABASE_URL` (PostgreSQL connection string)
Required (one of): `JWT_PUBLIC_KEY` or `JWT_SECRET`
Optional: `PORT` (default 8081), `CORS_ORIGIN`, `NODE_ENV`
