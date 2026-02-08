---
description: Scaffold a new backend domain module (routes + tests + registration)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Scaffolder de nouveau domaine backend

Crée un nouveau module domaine dans `server/src/domains/` en suivant les conventions du projet.

## Argument

`$ARGUMENTS` = nom du domaine (ex: `notification`, `review`). Si non fourni, demander à l'utilisateur.

## Étapes

1. **Vérifier** que le domaine n'existe pas déjà dans `server/src/domains/`.

2. **Créer `server/src/domains/$ARGUMENTS/routes.ts`** avec ce squelette :

```typescript
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok, AppError } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { prisma } from "../../shared/db/prisma.js";

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────

// TODO: ajouter les schémas de validation

// ─── Routes ───────────────────────────────────────────────────

// TODO: ajouter les routes

export const ${ARGUMENTS}Routes = router;
```

3. **Créer `server/src/domains/$ARGUMENTS/routes.test.ts`** avec ce squelette :

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../../app.js";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { resetDb } from "../../test/db.js";

const secret = process.env.JWT_SECRET ?? "test-jwt-secret";
const makeToken = (userId: string) =>
  jwt.sign({ sub: userId }, secret, { algorithm: "HS256" });

describe("$ARGUMENTS", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // TODO: ajouter les tests
});
```

4. **Enregistrer le domaine dans `server/src/app.ts`** :
   - Ajouter l'import : `import { ${ARGUMENTS}Routes } from "./domains/$ARGUMENTS/routes.js";`
   - Ajouter `app.use(${ARGUMENTS}Routes);` **avant** `app.use(errorHandler);`

5. **Résumer** ce qui a été créé et les prochaines étapes (ajouter le modèle Prisma si besoin, implémenter les routes, écrire les tests).

## Conventions à respecter

- Export nommé : `export const ${name}Routes = router;`
- Réponses : `ok(res, data)` pour le succès, `throw new AppError(code, message, status)` pour les erreurs
- Handlers async : toujours wrapper avec `asyncHandler()`
- Validation : schémas Zod en haut du fichier
- Auth : `requireAuth` pour les routes protégées, `optionalAuth` si l'auth est facultative
- Pagination : utiliser `paginationQuerySchema`, `decodeCursor`, `buildPage` de `../../shared/http/pagination.js`
