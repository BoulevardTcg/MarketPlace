# Audit Complet — BoulevardTCG MarketPlace

**Date** : 23 février 2026
**Branche** : `feature/updates`
**Scope** : Backend (server/), Frontend (client/), Tests, Sécurité, CI/CD

---

## Note Globale : B+

| Axe | Note | Verdict |
|-----|------|---------|
| Architecture Backend | A- | Solide, bien structurée, patterns cohérents |
| Sécurité | B+ | Bonnes bases, quelques gaps de config pour la prod |
| Frontend | C+ | Fonctionnel mais fragile, 0 tests, dette technique |
| Tests | B- | Backend bien couvert, frontend et jobs non testés |
| CI/CD | C | Pipeline GitHub Actions créé (type-check + tests + build) |

---

## Table des matières

1. [Architecture Backend](#1-architecture-backend)
2. [Sécurité](#2-sécurité)
3. [Frontend](#3-frontend)
4. [Tests](#4-tests)
5. [CI/CD](#5-cicd)
6. [Plan d'action priorisé](#6-plan-daction-priorisé)

---

## 1. Architecture Backend

### 1.1 Structure des domaines

12 domaines bien découpés, chacun dans `src/domains/<name>/routes.ts` :

| Domaine | Préfixe | Endpoints clés | Lignes |
|---------|---------|----------------|--------|
| health | `/health` | GET /health | ~10 |
| auth | `/me` | GET /me (identité JWT) | ~20 |
| pricing | `/cards`, `/users/me/portfolio` | Prix marché, historique, portfolio | ~200 |
| marketplace | `/marketplace` | Listings CRUD, images, favoris, recherche | ~900 |
| trade | `/trade` | Offres d'échange, messages, counter-offers | ~600 |
| collection | `/collection` | Inventaire cartes, vue publique | ~300 |
| profile | `/users` | Profils GET/PATCH | ~80 |
| analytics | `/analytics` | Prix historiques, alertes | ~200 |
| handover | `/handovers` | Vérification anti-fake | ~100 |
| upload | `/upload` | Stub OCR/IA | ~30 |
| profile-types | `/users/me/profiles` | COLLECTOR, SELLER, TRADER, INVESTOR | ~100 |
| trust | `/reports`, `/admin` | Reports, modération, bans, réputation | ~300 |

### 1.2 Middleware Stack (app.ts)

Ordre correct et bien structuré :

```
1. helmet()                    → Security headers
2. express.json()              → Body parsing
3. CORS                        → Origins configurables
4. Rate limiting               → Global 100/min, writes 20/min
5. requestIdMiddleware         → UUID par requête
6. httpLoggerMiddleware        → Logs structurés JSON
7. Routes (12 domaines)        → Domain routers
8. errorHandler                → ZodError→400, AppError→status, autres→500
9. 404 fallback                → Route non trouvée
```

### 1.3 Shared Utilities

| Module | Fichier(s) | Rôle | Qualité |
|--------|-----------|------|---------|
| Auth | `shared/auth/jwt.ts` | RS256 (prod) + HS256 (fallback), payload normalisé | Excellent |
| Auth | `shared/auth/requireAuth.ts` | Bearer token → `req.user` | Bon |
| Auth | `shared/auth/optionalAuth.ts` | Auth silencieuse (public+auth endpoints) | Bon |
| Auth | `shared/auth/requireNotBanned.ts` | Check `UserModerationState.isBanned` | Bon (race condition possible) |
| Auth | `shared/auth/requireRole.ts` | Factory + allowlist `ADMIN_USER_IDS` | Bon |
| Auth | `shared/auth/requireProfile.ts` | Gate par type de profil | Bon |
| HTTP | `shared/http/response.ts` | `ok(res, data)` / `fail(res, code, msg, status)` | Excellent |
| HTTP | `shared/http/asyncHandler.ts` | Wrapper async → `catch(next)` | Bon |
| HTTP | `shared/http/errorHandler.ts` | ZodError, AppError, fallback 500 | Bon |
| HTTP | `shared/http/pagination.ts` | Keyset cursor (base64url JSON) | Excellent |
| Pricing | `shared/pricing/tcgdexClient.ts` | Fetch TCGdex API, EUR→cents, timeout 10s | Bon |
| Pricing | `shared/pricing/portfolio.ts` | Calcul valeur portfolio, snapshots | Bon |
| Storage | `shared/storage/presigned.ts` | S3 presigned URLs (15min), delete | Bon |
| Trade | `shared/trade/items.ts` | Parse trade items JSON, schemaVersion | Bon |
| Trade | `shared/trade/expiration.ts` | Expiration lazy + batch, race-safe | Bon |
| Observability | `shared/observability/` | Logger JSON, HTTP logger, requestId | Basique |
| Config | `shared/config/env.ts` | Zod validation de toutes les env vars | Excellent |

### 1.4 Base de données (Prisma)

**23 modèles** répartis en 7 groupes :

- **Marketplace** : Listing, ListingEvent, ListingImage, Favorite
- **Trade** : TradeOffer, TradeEvent, TradeMessage, TradeReadState
- **Collection** : UserCollection
- **Profiles** : UserProfile, UserActiveProfile, UserModerationState
- **Pricing** : PriceSnapshot, PriceAlert, ExternalProductRef, CardPriceSnapshot, DailyPriceSnapshot, UserPortfolioSnapshot
- **Verification** : Handover
- **Trust** : ListingReport, ModerationAction, SellerReputation

**Indexes** : Complets et bien pensés (8 sur Listing, 4 sur TradeOffer, etc.)

**Contraintes uniques** : Bien utilisées (UserCollection, Favorite, TradeReadState, DailyPriceSnapshot, ListingReport partial index)

**Cascading deletes** : Configurés (ListingEvent→Listing, TradeEvent→TradeOffer, etc.)

**Dual migrations** : 17 PostgreSQL + 20 SQLite (gap de 3 migrations à synchroniser)

### 1.5 Jobs standalone

| Job | Commande | Description | Qualité |
|-----|----------|-------------|---------|
| tcgdexDailySnapshot | `npm run job:tcgdex` | Snapshot prix quotidien TCGdex | Bon (rate-limit 200ms, upsert idempotent) |
| importCardmarketPriceGuide | `npx tsx src/jobs/...` | Import CSV Cardmarket | Stub/placeholder |

### 1.6 Problèmes identifiés

| Priorité | Problème | Fichier |
|----------|----------|---------|
| Moyenne | **Code mort** : `normalizeTcgdexPricing.ts` et `snapshotTcgdexPricing.ts` jamais importés | `shared/pricing/` |
| Moyenne | **Pas de portfolio snapshot sur DELETE** de collection | `collection/routes.ts` |
| Basse | **schemaVersion manquant** dans la création de Handover | `handover/routes.ts` |
| Basse | **Gap migrations** : 17 PG vs 20 SQLite | `prisma/` |

### 1.7 Patterns et bonnes pratiques observés

- Transactions Prisma pour les opérations atomiques
- Race condition prevention via `updateMany` avec status guards
- AppError pour les erreurs domaine, Zod pour la validation
- asyncHandler sur tous les handlers async
- Pagination keyset cursor-based (performante, stateless)
- Enums Prisma pour statuts, langues, conditions
- TypeScript strict, pas de `any` sauf casts nécessaires

---

## 2. Sécurité

### 2.1 Points forts

- **Zéro SQL injection** : Prisma ORM partout, aucun `$queryRaw` ni `$executeRaw`
- **Validation Zod** exhaustive sur toutes les entrées utilisateur
- **JWT RS256** préféré en prod, HS256 en fallback dev uniquement
- **Protection clé privée** : crash au démarrage si `JWT_PRIVATE_KEY` est dans l'env
- **Presigned URLs S3** : expiration 15min, validation du storageKey, ownership check
- **Error handler** : pas de fuite d'info interne (stack traces côté serveur uniquement)
- **Helmet** pour les security headers
- **CORS** : pas de wildcard, origins explicites
- **Ownership checks** : toutes les routes vérifient la propriété avant mutation

### 2.2 Vulnérabilités à corriger

#### CRITIQUE (P0 — Avant mise en prod)

**1. JWT_ISSUER optionnel**
- **Fichier** : `server/src/shared/auth/jwt.ts` (ligne 42, 49)
- **Problème** : Si `JWT_ISSUER` n'est pas configuré, aucune vérification de l'émetteur du token. Un JWT valide signé par n'importe quel isseur serait accepté.
- **Impact** : Accès non autorisé si la clé de signature est compromise
- **Fix** : Rendre `JWT_ISSUER` obligatoire en `NODE_ENV=production`

**2. ADMIN_USER_IDS pas requis**
- **Fichier** : `server/src/shared/auth/requireRole.ts` (ligne 26)
- **Problème** : Sans `ADMIN_USER_IDS`, tout JWT avec `role=ADMIN` passe. L'allowlist n'est active que si la variable est définie.
- **Impact** : Role spoofing si la confiance JWT est compromise
- **Fix** : Valider la présence de `ADMIN_USER_IDS` en production

#### HAUTE (P1 — Avant première release)

**3. Rate limiting reports en mémoire**
- **Fichier** : `server/src/domains/trust/routes.ts` (lignes 17-42)
- **Problème** : `Map<string, number[]>` en mémoire — ne scale pas multi-instance, reset au restart
- **Impact** : Contournement du rate limit en production multi-instances
- **Fix** : Migrer vers Redis

**4. Ban check race condition**
- **Fichier** : `server/src/shared/auth/requireNotBanned.ts` (lignes 12-33)
- **Problème** : Fenêtre entre le check middleware et l'écriture effective. Un user banni pendant cette fenêtre peut toujours écrire.
- **Impact** : Opérations en vol par des users bannis
- **Fix** : Déplacer le check dans le contexte de transaction pour les écritures critiques

#### MOYENNE (P2)

**5. `z.record(z.unknown())` trop permissif**
- **Fichiers** : `marketplace/routes.ts` (lignes 40, 53), `trade/routes.ts` (lignes 99-118)
- **Problème** : Accepte des structures JSON arbitraires. Risque DoS par payloads volumineux.
- **Fix** : Restreindre à `z.record(z.union([z.string(), z.number(), z.boolean()]))`

**6. Pas de limite de taille fichier sur les presigned URLs S3**
- **Fichier** : `server/src/shared/storage/presigned.ts`
- **Problème** : Aucun `ContentLength` max sur l'URL signée
- **Fix** : Ajouter un paramètre `ContentLengthRange` (ex: max 10MB)

### 2.3 Analyse des routes — Autorisation

**Routes publiques (correct)** :
- `GET /health`, `/marketplace/ping`
- `GET /marketplace/listings` (published uniquement)
- `GET /marketplace/listings/:id` (check `isHidden`)
- `GET /users/:id/profile`, `/users/:id/collection` (`isPublic` only)
- `GET /analytics/cards/:cardId/asked-price`

**Routes protégées (correct)** :
- Tous les POST/PUT/PATCH/DELETE : `requireAuth` + `requireNotBanned`
- Trade : vérification creator/receiver
- Admin : `requireRole("ADMIN")`
- Profile-gated : `requireProfile()` conditionnel via `PROFILE_GATE_ENABLED`

**Aucune route non protégée qui devrait l'être.**

### 2.4 Checklist production

- [ ] `JWT_ISSUER` configuré
- [ ] `ADMIN_USER_IDS` configuré (liste d'IDs admin)
- [ ] `CORS_ORIGIN` pointant vers le domaine prod
- [ ] Redis pour le rate limiting distribué
- [ ] `npm audit` passé sans vulnérabilité haute
- [ ] HTTPS/TLS sur toutes les connexions
- [ ] Bucket S3 avec CORS et policies restrictives
- [ ] Monitoring/alerting pour les événements de sécurité

---

## 3. Frontend

### 3.1 Structure

**9 pages** :

| Page | Fichier | Description |
|------|---------|-------------|
| Browse | `MarketplaceBrowse.tsx` | Recherche et filtrage des listings |
| Detail | `ListingDetail.tsx` | Vue détaillée listing (galerie, favori, report) |
| Create | `CreateListing.tsx` | Création listing avec CardAutocomplete |
| Edit | `EditListing.tsx` | Edition listings DRAFT uniquement |
| My Listings | `MyListings.tsx` | Gestion des listings utilisateur |
| Login | `LoginPage.tsx` | Login email/password + 2FA optionnel |
| Portfolio | `PortfolioDashboard.tsx` | Dashboard analytics (collection, ventes, valeur) |
| Trades Inbox | `TradesInbox.tsx` | Inbox trades received/sent |
| Trade Thread | `TradeThread.tsx` | Vue trade + messages + counter-offer |

**33 composants**, **5 hooks**, **1 fichier utilitaire**, **2 fichiers types**

### 3.2 API Layer (`api.ts`)

- ~375 lignes, ~15 fonctions exportées
- Deux bases API : `/market` (Marketplace) et `/api` (Boutique Shop)
- Token d'accès en **mémoire** (pas localStorage) — sécurisé
- Silent refresh via cookie httpOnly
- Auto-retry sur 401 avant échec
- Pattern response : `body?.data !== undefined ? body.data : body`

### 3.3 State Management

- **Approche** : React Context + useState (pas de Redux/Zustand)
- **Providers** : `AuthProvider` (user, login, logout), `CartProvider` (count)
- **Pattern local** : `listings`, `nextCursor`, `loading`, `error` par page

### 3.4 Points forts

- Token d'accès stocké en mémoire (sécurisé)
- Loading/Error/Empty states cohérents sur la plupart des pages
- Bonne accessibilité : semantic HTML, ARIA labels, navigation clavier
- Hook `useReducedMotion()` respecté
- Skeleton components avec 5 variantes

### 3.5 Problèmes identifiés

#### HAUTE priorité

| Problème | Fichier | Impact |
|----------|---------|--------|
| **XSS potentiel** : URLs d'images API sans validation (`<img src={s.image}>`) | `CardAutocomplete.tsx:260`, `InventoryCard.tsx:150` | Injection via URL `javascript:` |
| **0 tests frontend** | `client/` | Aucune protection contre les régressions UI |
| **Pas d'annulation de requêtes** au démontage des composants | `CreateListing.tsx`, `MarketplaceBrowse.tsx` | Memory leak, race conditions |

#### MOYENNE priorité

| Problème | Fichier | Impact |
|----------|---------|--------|
| **PortfolioDashboard** : 700+ LOC, 30+ `useState` | `PortfolioDashboard.tsx` | Fichier ingérable |
| **Pas de form validation library** : validation manuelle au submit | `CreateListing.tsx` | UX dégradée |
| **Messages trade jamais rafraîchis** | `TradeThread.tsx:92` | Refresh manuel requis |
| **Port mismatch** : vite.config dit 5174, la doc dit 5173 | `vite.config.ts` | Confusion dev |
| **Pas de code-splitting** : toutes les pages bundlées ensemble | `App.tsx` | Bundle lourd |
| **Duplication** : pattern fetch+parse répété 10+ fois | Multiple fichiers | Maintenance difficile |

#### BASSE priorité

| Problème | Fichier | Impact |
|----------|---------|--------|
| **Code mort** : `useCart` jamais utilisé, `PlaceholderPage` inutile | `useCart.tsx`, `App.tsx` | Bruit dans le code |
| **RecentListings** : échec silencieux (`setListings([])` sans log) | `RecentListings.tsx` | Debugging difficile |
| **Pas de `React.memo()`** sur composants purs (ListingCard) | Multiple | Re-renders inutiles |
| **Pas de virtual scrolling** sur listes longues | `MyListings.tsx`, `TradesInbox.tsx` | Performance |
| **Images S3 full resolution** : pas de redimensionnement | Multiple | Bande passante |

### 3.6 Sécurité Frontend

| Aspect | Statut | Détails |
|--------|--------|---------|
| Token storage | Sécurisé | En mémoire, pas localStorage |
| Refresh token | Sécurisé | Cookie httpOnly (backend-managed) |
| CSRF | Sécurisé | JSON content-type (pas form-encoded) |
| XSS images | Vulnérable | URLs API non validées avant affichage |
| External links | OK | `rel="noopener noreferrer"` présent |
| Credentials | OK | `credentials: "include"` sur les fetch |

### 3.7 Performance

| Aspect | Statut | Détails |
|--------|--------|---------|
| Bundle size | Lourd | `recharts` (439KB) + `@paper-design/shaders-react` |
| Code splitting | Absent | Toutes les pages dans le même bundle |
| useMemo/useCallback | Partiel | Présent dans CardPriceCharts, absent ailleurs |
| React.memo | Absent | ListingCard et autres composants purs non mémoïsés |
| Lazy loading images | Partiel | Présent dans SearchBox/ListingCard, absent ailleurs |
| AbortController | Partiel | CardAutocomplete/SearchBox, pas MarketplaceBrowse |

---

## 4. Tests

### 4.1 Backend : bien couvert (7.5/10)

**10 fichiers de test, 192 cas de test, ~4 245 lignes de code test**

| Domaine | Tests | Couverture | Qualité |
|---------|-------|------------|---------|
| Marketplace | 52+ | 85% | Excellent (CRUD, pagination, images, favoris, tri, hidden) |
| Trade | 42+ | 85% | Excellent (lifecycle, counter, expiration, inventory) |
| Trust | 38+ | 80% | Excellent (reports, modération, race conditions, bans) |
| Handover | 18+ | 80% | Excellent (XOR, permissions, statuts) |
| Collection | 18+ | 80% | Bon (upsert, privacy, portfolio, dashboard) |
| Pricing | 14+ | 75% | Bon (prix, portfolio, history) |
| Profile-Types | 13+ | 75% | Bon (idempotence, validation, gating) |
| Analytics | 8+ | 70% | Bon (lazy snapshots, filtres, stats) |
| Profile | 6+ | 30% | Faible (CRUD basique seulement) |
| Upload | 4+ | 10% | Stub uniquement |
| Health | 0 | 0% | Non testé |
| Auth | 0 | 0% | Testé indirectement |

### 4.2 Qualité des tests

**Points forts** :
- Excellent edge case coverage (cursor pagination, race conditions, state machine)
- Auth testing systématique (401 sans token, 403 pour opérations non autorisées)
- Vérification état DB + réponse HTTP
- Helpers réutilisables (`makeToken`, `createOffer`, `createListing`)
- Audit trail validation (events créés avec le bon type et acteur)

**Points faibles** :
- Pas de tests unitaires des shared utilities (auth, pagination, error handler)
- Pas de tests d'intégration multi-étapes (create → images → publish → sold)
- Pas de tests de performance (pagination avec gros volumes)

### 4.3 Infrastructure de test

```
server/
├── vitest.config.ts          # Node env, setup, no file parallelism
├── src/test/
│   ├── setup.ts              # NODE_ENV=test, DATABASE_URL=SQLite, JWT_SECRET
│   └── db.ts                 # resetDb() — clean toutes les tables
└── prisma/test/
    ├── schema.prisma         # SQLite schema (copie adaptée du PG)
    └── migrations/           # 20 migrations SQLite
```

### 4.4 Gaps critiques

| Gap | Impact | Priorité |
|-----|--------|----------|
| **0 tests frontend** | Aucune protection régressions UI | Critique |
| **0 tests jobs** (`tcgdexDailySnapshot`) | Job non vérifié | Moyenne |
| **0 tests shared utilities** | Testés indirectement uniquement | Moyenne |
| **Pas de tests E2E** | Aucun parcours utilisateur complet | Basse |

---

## 5. CI/CD

### 5.1 Pipeline GitHub Actions

Fichier : `.github/workflows/ci.yml`

**3 jobs parallèles** :

| Job | Ce qu'il fait | Durée estimée |
|-----|---------------|---------------|
| **Type-check** | `tsc --noEmit` sur server + client | ~30s |
| **Server tests** | 192 tests Vitest avec SQLite | ~15s |
| **Build client** | `tsc -b && vite build` | ~10s |

**Triggers** : push sur `main`, `develop`, `feature/**` + toutes les PRs

**Optimisations** :
- `concurrency` : annule les runs précédents sur la même branche
- Cache npm : accélère les installations
- Node 24 : respecte le `engines` du projet

### 5.2 Corrections TypeScript effectuées (pré-requis CI)

| Fichier | Correction |
|---------|-----------|
| `client/src/api.ts:154` | Type retour `searchCards` : `CardSuggestion[]` → `CardSuggestion[] \| CardDetails` |
| `client/src/components/CardPriceCharts.tsx` | 3 `formatter` recharts : `number` → `number \| undefined` |
| `client/src/components/Skeleton.tsx` | Props `width`/`height` : `string` → `string \| number` |

### 5.3 Ce qui manque encore

- Linting (ESLint/Biome) — aucun linter configuré dans le projet
- Tests frontend (quand ils existeront)
- Deploy automatique (staging, production)
- Notifications (Slack, email) sur échec
- Badge status dans le README
- Dependabot pour les mises à jour de dépendances

---

## 6. Plan d'action priorisé

### P0 — Avant mise en prod

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 1 | Rendre `JWT_ISSUER` obligatoire en production | 1h | `shared/config/env.ts` |
| 2 | Rendre `ADMIN_USER_IDS` obligatoire en production | 1h | `shared/config/env.ts`, `shared/auth/requireRole.ts` |
| 3 | Valider les URLs d'images frontend (whitelist `https://`) | 2h | `CardAutocomplete.tsx`, `InventoryCard.tsx` |
| 4 | Limiter la taille des uploads S3 (max 10MB) | 1h | `shared/storage/presigned.ts` |
| 5 | `npm audit` et corriger les vulnérabilités hautes | 1h | `package.json` |

### P1 — Avant la première release

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 6 | Redis pour le rate limiting (remplacer `Map` in-memory) | 4h | `trust/routes.ts`, `app.ts` |
| 7 | Ban check dans les transactions pour les écritures critiques | 3h | `requireNotBanned.ts`, routes d'écriture |
| 8 | AbortController sur toutes les requêtes fetch frontend | 3h | Pages avec fetch |
| 9 | Tests frontend (Vitest + Testing Library, composants critiques) | 8h | `client/` |
| 10 | Tests des jobs avec mocks HTTP | 4h | `jobs/` |

### P2 — Prochain sprint

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 11 | Supprimer le code mort (pricing, useCart, PlaceholderPage) | 1h | Multiple |
| 12 | Refactorer PortfolioDashboard en sous-composants | 4h | `PortfolioDashboard.tsx` |
| 13 | Resserrer `z.record(z.unknown())` en types concrets | 2h | `marketplace/routes.ts`, `trade/routes.ts` |
| 14 | Code-splitting (React.lazy + Suspense) | 2h | `App.tsx` |
| 15 | Portfolio snapshot sur DELETE collection | 1h | `collection/routes.ts` |
| 16 | Synchroniser les migrations PG vs SQLite | 2h | `prisma/` |
| 17 | Configurer ESLint ou Biome + intégrer au CI | 3h | Root, CI |

### P3 — Nice to have

| # | Action | Effort |
|---|--------|--------|
| 18 | Polling/WebSocket pour les messages trade | 8h |
| 19 | Form validation library (React Hook Form + Zod) | 6h |
| 20 | Virtual scrolling sur les longues listes | 4h |
| 21 | Image resizing (CDN ou Lambda@Edge) | 4h |
| 22 | React.memo sur les composants purs | 2h |
| 23 | Storybook pour la documentation des composants | 8h |
| 24 | Tests E2E (Playwright) | 12h |
| 25 | Dependabot + notifications CI | 2h |

---

## Annexe A — Dépendances

### Server

| Dépendance | Version | Rôle |
|-----------|---------|------|
| express | 4.21.0 | Framework HTTP |
| @prisma/client | 6.0.0 | ORM |
| zod | 3.23.8 | Validation |
| jsonwebtoken | 9.0.2 | JWT |
| helmet | 8.1.0 | Security headers |
| express-rate-limit | 8.2.1 | Rate limiting |
| cors | 2.8.5 | CORS |
| @aws-sdk/client-s3 | 3.985.0 | S3 storage |
| dotenv | 16.4.5 | Env vars |

### Client

| Dépendance | Version | Rôle |
|-----------|---------|------|
| react | 18.3.1 | UI |
| react-dom | 18.3.1 | DOM renderer |
| react-router-dom | 7.0.1 | Routing |
| recharts | 3.7.0 | Graphiques |
| @paper-design/shaders-react | 0.0.69 | Effet visuel (LiquidMetal button) |

---

## Annexe B — Variables d'environnement

| Variable | Requis | Défaut | Description |
|----------|--------|--------|-------------|
| `DATABASE_URL` | Oui | localhost PG (dev) | PostgreSQL (prod), SQLite (test) |
| `JWT_PUBLIC_KEY` | Oui (prod) | — | Clé publique RS256 |
| `JWT_SECRET` | Oui (dev) | — | Fallback HS256 |
| `JWT_ISSUER` | **Devrait** | — | Issuer JWT (non validé si absent) |
| `ADMIN_USER_IDS` | **Devrait** | — | IDs admin (non vérifié si absent) |
| `PORT` | Non | 8081 | Port serveur |
| `CORS_ORIGIN` | Non | localhost:5173,5174 | Origins CORS |
| `NODE_ENV` | Non | development | Environnement |
| `LISTING_IMAGES_BUCKET` | Non | — | Bucket S3 images |
| `AWS_REGION` | Non | — | Région AWS |
| `PRICE_IMPORT_ENABLED` | Non | false | Import CSV Cardmarket |
| `PROFILE_GATE_ENABLED` | Non | false | Gating par profil |

---

## Annexe C — Modèles Prisma (23)

```
Listing              ListingEvent         ListingImage         Favorite
TradeOffer           TradeEvent           TradeMessage         TradeReadState
UserCollection       UserProfile          UserActiveProfile    UserModerationState
PriceSnapshot        PriceAlert           ExternalProductRef   CardPriceSnapshot
DailyPriceSnapshot   UserPortfolioSnapshot Handover            ListingReport
ModerationAction     SellerReputation     JobCursor
```
