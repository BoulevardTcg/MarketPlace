---
description: Add a new API endpoint to an existing backend domain
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Ajouter un endpoint API

Ajoute un nouvel endpoint dans un domaine existant en respectant les patterns du projet.

## Argument

`$ARGUMENTS` = description de l'endpoint (ex: `GET /marketplace/listings/:id/reviews`, `POST /trade/offers/:id/rate`). Si non fourni, demander à l'utilisateur le domaine cible et l'endpoint souhaité.

## Étapes

1. **Identifier le domaine cible** depuis le path de l'endpoint. Lire le fichier `server/src/domains/<domaine>/routes.ts` pour comprendre les patterns existants.

2. **Lire les fichiers nécessaires** :
   - `server/src/domains/<domaine>/routes.ts` — routes existantes
   - `server/prisma/schema.prisma` — modèles disponibles
   - `server/src/shared/http/response.ts` — helpers de réponse
   - `server/src/shared/http/pagination.ts` — si c'est un endpoint GET liste

3. **Implémenter l'endpoint** en ajoutant dans le fichier routes.ts :
   - Le schéma Zod de validation (si body ou query params)
   - Le handler avec le bon middleware d'auth
   - La logique Prisma

4. **Ajouter les tests** dans `server/src/domains/<domaine>/routes.test.ts` :
   - Test 401 sans token
   - Test de succès (happy path)
   - Tests des cas d'erreur (404, 400 validation, etc.)

5. **Lancer les tests** pour vérifier que tout passe.

## Patterns obligatoires

```typescript
// GET (liste paginée)
router.get("/prefix/items", optionalAuth, asyncHandler(async (req, res) => {
  const { cursor, limit } = paginationQuerySchema.parse(req.query);
  const where = { /* filtres */ };
  const items = await prisma.model.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: "desc" },
    ...(cursor ? { cursor: { id: decodeCursor(cursor).id as string }, skip: 1 } : {}),
  });
  ok(res, buildPage(items, limit, (item) => ({ id: item.id })));
}));

// GET (détail)
router.get("/prefix/items/:id", optionalAuth, asyncHandler(async (req, res) => {
  const item = await prisma.model.findUnique({ where: { id: req.params.id } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found", 404);
  ok(res, item);
}));

// POST (création)
router.post("/prefix/items", requireAuth, asyncHandler(async (req: RequestWithUser, res) => {
  const body = createSchema.parse(req.body);
  const item = await prisma.model.create({ data: { ...body, userId: req.user.userId } });
  ok(res, { itemId: item.id }, 201);
}));

// PATCH (mise à jour)
router.patch("/prefix/items/:id", requireAuth, asyncHandler(async (req: RequestWithUser, res) => {
  const body = updateSchema.parse(req.body);
  const item = await prisma.model.findUnique({ where: { id: req.params.id } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found", 404);
  if (item.userId !== req.user.userId) throw new AppError("FORBIDDEN", "Not your item", 403);
  const updated = await prisma.model.update({ where: { id: req.params.id }, data: body });
  ok(res, updated);
}));

// DELETE
router.delete("/prefix/items/:id", requireAuth, asyncHandler(async (req: RequestWithUser, res) => {
  const item = await prisma.model.findUnique({ where: { id: req.params.id } });
  if (!item) throw new AppError("NOT_FOUND", "Item not found", 404);
  if (item.userId !== req.user.userId) throw new AppError("FORBIDDEN", "Not your item", 403);
  await prisma.model.delete({ where: { id: req.params.id } });
  ok(res, { deleted: true });
}));
```

## Rappels

- Toujours `asyncHandler()` pour les handlers async
- Transactions Prisma (`$transaction`) si plusieurs écritures liées
- `requireNotBanned` après `requireAuth` pour les actions utilisateur sensibles
- JSON fields : toujours inclure `schemaVersion` pour la compatibilité future
