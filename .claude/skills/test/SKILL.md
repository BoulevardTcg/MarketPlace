---
description: Run backend tests with proper environment setup (Windows + SQLite)
allowed-tools: Bash, Read, Glob, Grep
---

# Lancer les tests

Lance les tests backend avec la configuration correcte pour Windows + SQLite.

## Argument

`$ARGUMENTS` = fichier ou domaine à tester (ex: `marketplace`, `trade`, `src/domains/trade/routes.test.ts`). Si vide, lance tous les tests.

## Commandes

### Tests complets
```bash
cd server && npx cross-env NODE_ENV=test DATABASE_URL="file:./.db/test.db" JWT_SECRET=test-jwt-secret npx vitest run
```

### Test d'un domaine spécifique
```bash
cd server && npx cross-env NODE_ENV=test DATABASE_URL="file:./.db/test.db" JWT_SECRET=test-jwt-secret npx vitest run src/domains/$ARGUMENTS/routes.test.ts
```

### Test d'un fichier spécifique
```bash
cd server && npx cross-env NODE_ENV=test DATABASE_URL="file:./.db/test.db" JWT_SECRET=test-jwt-secret npx vitest run $ARGUMENTS
```

## Pré-requis

Avant de lancer les tests, vérifier que :
1. Le client Prisma est généré : `cd server && npx cross-env DATABASE_URL="file:./.db/test.db" npx prisma generate`
2. Les migrations sont appliquées : `cd server && npx cross-env NODE_ENV=test DATABASE_URL="file:./.db/test.db" npx prisma migrate deploy`

Si les tests échouent avec une erreur Prisma (client not found, table not found), relancer les pré-requis ci-dessus.

## En cas d'échec

1. Lire attentivement le message d'erreur
2. Si erreur de validation Zod : vérifier les schémas dans le fichier routes.ts
3. Si erreur 500 : vérifier les logs, lire le errorHandler et le handler concerné
4. Si erreur de base : vérifier le schema.prisma et les migrations
5. Corriger le code puis relancer uniquement le test qui échoue
