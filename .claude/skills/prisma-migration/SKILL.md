---
description: Create and apply a Prisma migration (new model, field, index, enum)
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Migration Prisma

Crée ou modifie le schéma Prisma et applique la migration.

## Argument

`$ARGUMENTS` = description du changement (ex: `add Review model`, `add isVerified to UserProfile`). Si non fourni, demander à l'utilisateur.

## Étapes

1. **Lire le schéma actuel** : `server/prisma/schema.prisma`

2. **Modifier le schéma** selon la demande. Respecter les conventions :
   - IDs : `String @id @default(cuid())`
   - Timestamps : `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`
   - Relations : toujours les deux côtés + `@@index` sur les FK
   - Enums : PascalCase, valeurs en UPPER_SNAKE_CASE
   - JSON fields : nommés `*Json` (ex: `attributesJson`, `metadataJson`)
   - Index composites sur les requêtes fréquentes

3. **Mettre à jour le schéma SQLite de test** si il existe : `server/prisma/test/schema.prisma`
   - Même structure mais `provider = "sqlite"` et adaptations SQLite (pas de `@db.Text`, pas d'index partiel natif)

4. **Générer le client Prisma** :
   ```bash
   cd server && npx prisma generate
   ```

5. **Créer la migration** (dev) :
   ```bash
   cd server && npx prisma migrate dev --name $ARGUMENTS_SLUG
   ```
   Où `$ARGUMENTS_SLUG` est le nom en kebab-case (ex: `add-review-model`).

6. **Vérifier** que la migration a été créée dans `server/prisma/migrations/`.

7. **Lancer les tests** pour vérifier que rien n'est cassé :
   ```bash
   cd server && npx cross-env NODE_ENV=test DATABASE_URL="file:./.db/test.db" npx prisma migrate deploy && npx cross-env NODE_ENV=test DATABASE_URL="file:./.db/test.db" JWT_SECRET=test-jwt-secret npx vitest run
   ```

## Conventions de nommage

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Modèle | PascalCase | `UserReview` |
| Champ | camelCase | `trustScore` |
| Enum | PascalCase | `ReviewStatus` |
| Valeur enum | UPPER_SNAKE | `PENDING_REVIEW` |
| Index | `@@index([champs])` | `@@index([userId, createdAt])` |
| Unique | `@@unique([champs])` | `@@unique([userId, listingId])` |

## Exemple de modèle

```prisma
model UserReview {
  id          String       @id @default(cuid())
  reviewerId  String
  targetUserId String
  tradeOfferId String?
  listingId    String?
  rating       Int          // 1-5
  comment      String?
  status       ReviewStatus @default(PUBLISHED)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  tradeOffer   TradeOffer?  @relation(fields: [tradeOfferId], references: [id])
  listing      Listing?     @relation(fields: [listingId], references: [id])

  @@unique([reviewerId, tradeOfferId])
  @@unique([reviewerId, listingId])
  @@index([targetUserId])
  @@index([status, createdAt])
}

enum ReviewStatus {
  PUBLISHED
  HIDDEN
  REMOVED
}
```
