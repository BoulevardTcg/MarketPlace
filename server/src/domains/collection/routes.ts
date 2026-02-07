import { Router } from "express";
import { z } from "zod";
import { Prisma, Language, CardCondition } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { paginationQuerySchema, decodeCursor, buildPage } from "../../shared/http/pagination.js";

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────

const collectionQuerySchema = paginationQuerySchema.extend({
  cardId: z.string().optional(),
  language: z.nativeEnum(Language).optional(),
});

const upsertCollectionItemSchema = z.object({
  cardId: z.string().min(1),
  cardName: z.string().optional(),
  setCode: z.string().optional(),
  language: z.nativeEnum(Language),
  condition: z.nativeEnum(CardCondition),
  quantity: z.number().int().min(1),
});

const deleteCollectionItemSchema = z.object({
  cardId: z.string().min(1),
  language: z.nativeEnum(Language),
  condition: z.nativeEnum(CardCondition),
});

// ─── Routes ───────────────────────────────────────────────────

// GET /collection — list user's collection
router.get(
  "/collection",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = collectionQuerySchema.parse(req.query);
    const { cursor, limit, cardId, language } = query;

    const where: Prisma.UserCollectionWhereInput = { userId };
    if (cardId) where.cardId = cardId;
    if (language) where.language = language;

    if (cursor) {
      const c = decodeCursor(cursor);
      const cursorId = c.id as string;
      const val = new Date(c.v as string);
      where.AND = {
        OR: [
          { updatedAt: { lt: val } },
          { updatedAt: val, id: { lt: cursorId } },
        ],
      };
    }

    const items = await prisma.userCollection.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.updatedAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// PUT /collection/items — upsert (create or update quantity)
router.put(
  "/collection/items",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const body = upsertCollectionItemSchema.parse(req.body);

    const item = await prisma.userCollection.upsert({
      where: {
        userId_cardId_language_condition: {
          userId,
          cardId: body.cardId,
          language: body.language,
          condition: body.condition,
        },
      },
      update: {
        quantity: body.quantity,
        ...(body.cardName !== undefined ? { cardName: body.cardName } : {}),
        ...(body.setCode !== undefined ? { setCode: body.setCode } : {}),
      },
      create: {
        userId,
        cardId: body.cardId,
        cardName: body.cardName ?? null,
        setCode: body.setCode ?? null,
        language: body.language,
        condition: body.condition,
        quantity: body.quantity,
      },
    });

    ok(res, { item });
  }),
);

// DELETE /collection/items — remove item
router.delete(
  "/collection/items",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const body = deleteCollectionItemSchema.parse(req.body);

    const existing = await prisma.userCollection.findUnique({
      where: {
        userId_cardId_language_condition: {
          userId,
          cardId: body.cardId,
          language: body.language,
          condition: body.condition,
        },
      },
    });

    if (!existing)
      throw new AppError("NOT_FOUND", "Collection item not found", 404);

    await prisma.userCollection.delete({ where: { id: existing.id } });

    ok(res, { ok: true });
  }),
);

export const collectionRoutes = router;
