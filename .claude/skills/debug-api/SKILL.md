---
description: Debug an API endpoint by tracing the request through middleware, routes, and DB
allowed-tools: Read, Glob, Grep, Bash
---

# Debug API endpoint

Analyse et debug un endpoint API qui ne fonctionne pas correctement.

## Argument

`$ARGUMENTS` = description du problème (ex: `POST /trade/offers returns 500`, `GET /marketplace/listings pagination broken`). Si non fourni, demander à l'utilisateur.

## Procédure de diagnostic

1. **Identifier le domaine et le fichier route** :
   - Chercher le préfixe d'URL dans les fichiers `server/src/domains/*/routes.ts`
   - Lire le handler complet de l'endpoint concerné

2. **Vérifier la chaîne middleware** :
   - `server/src/app.ts` — ordre d'enregistrement
   - Auth middleware utilisé (`requireAuth`, `optionalAuth`, `requireNotBanned`)
   - Rate limiting (si pertinent)

3. **Vérifier la validation** :
   - Schéma Zod du body/query
   - Comparer avec le payload envoyé

4. **Vérifier la couche DB** :
   - `server/prisma/schema.prisma` — structure du modèle
   - Requêtes Prisma dans le handler (findMany, create, update, etc.)
   - Transactions si plusieurs opérations

5. **Vérifier le error handler** :
   - `server/src/shared/http/errorHandler.ts` — comment l'erreur est transformée
   - `server/src/shared/http/response.ts` — AppError utilisé

6. **Lancer le test ciblé** si il existe :
   ```bash
   cd server && npx cross-env NODE_ENV=test DATABASE_URL="file:./.db/test.db" JWT_SECRET=test-jwt-secret npx vitest run src/domains/<domaine>/routes.test.ts
   ```

7. **Synthèse** : expliquer la cause racine et proposer le fix.

## Erreurs fréquentes

| Symptôme | Cause probable |
|----------|---------------|
| 401 Unauthorized | Token manquant/invalide, mauvais `JWT_SECRET` |
| 400 Validation | Body ne match pas le schéma Zod |
| 404 Not Found | Mauvais path, route non enregistrée dans app.ts, ou ID inexistant |
| 403 Forbidden | `userId` ne correspond pas au propriétaire de la ressource |
| 409 Conflict | Contrainte unique violée (Prisma P2002) |
| 500 Internal | Handler non wrappé dans `asyncHandler()`, erreur Prisma non catchée |
| CORS error | Préfixe non ajouté dans `vite.config.ts` proxy ou `CORS_ORIGIN` manquant |
