import { Router } from "express";
import { z } from "zod";
import { Prisma, Language, CardCondition } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { requireNotBanned } from "../../shared/auth/requireNotBanned.js";
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
  isPublic: z.boolean().optional(),
  acquiredAt: z.coerce.date().optional(),
  acquisitionPriceCents: z.number().int().min(0).optional(),
  acquisitionCurrency: z.string().max(3).optional(),
});

const deleteCollectionItemSchema = z.object({
  cardId: z.string().min(1),
  language: z.nativeEnum(Language),
  condition: z.nativeEnum(CardCondition),
});

// ─── Routes ───────────────────────────────────────────────────

// GET /collection/dashboard — stats: total qty, breakdown by game/language/condition, master-set stub
router.get(
  "/collection/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;

    const [total, byGame, byLanguage, byCondition] = await Promise.all([
      prisma.userCollection.aggregate({
        where: { userId },
        _sum: { quantity: true },
      }),
      prisma.userCollection.groupBy({
        by: ["game"],
        where: { userId },
        _sum: { quantity: true },
      }),
      prisma.userCollection.groupBy({
        by: ["language"],
        where: { userId },
        _sum: { quantity: true },
      }),
      prisma.userCollection.groupBy({
        by: ["condition"],
        where: { userId },
        _sum: { quantity: true },
      }),
    ]);

    const totalQty = total._sum.quantity ?? 0;
    const breakdownByGame = Object.fromEntries(
      byGame.map((g) => [g.game ?? "OTHER", g._sum.quantity ?? 0])
    );
    const breakdownByLanguage = Object.fromEntries(
      byLanguage.map((l) => [l.language, l._sum.quantity ?? 0])
    );
    const breakdownByCondition = Object.fromEntries(
      byCondition.map((c) => [c.condition, c._sum.quantity ?? 0])
    );

    // TODO: master-set progress when set referential exists
    const masterSetProgress: null = null;

    ok(res, {
      totalQty,
      breakdownByGame,
      breakdownByLanguage,
      breakdownByCondition,
      masterSetProgress,
    });
  }),
);

// GET /users/:id/collection — public view: items where userId=id and isPublic=true
router.get(
  "/users/:id/collection",
  asyncHandler(async (req, res) => {
    const targetUserId = req.params.id;
    const query = collectionQuerySchema.parse(req.query);
    const { cursor, limit, cardId, language } = query;

    const where: Prisma.UserCollectionWhereInput = {
      userId: targetUserId,
      isPublic: true,
    };
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
  requireNotBanned,
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
      // Ne pas toucher isPublic si absent (évite de casser la privacy sur un simple update de qty)
      update: {
        quantity: body.quantity,
        ...(body.cardName !== undefined ? { cardName: body.cardName } : {}),
        ...(body.setCode !== undefined ? { setCode: body.setCode } : {}),
        ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
        ...(body.acquiredAt !== undefined ? { acquiredAt: body.acquiredAt } : {}),
        ...(body.acquisitionPriceCents !== undefined
          ? { acquisitionPriceCents: body.acquisitionPriceCents }
          : {}),
        ...(body.acquisitionCurrency !== undefined
          ? { acquisitionCurrency: body.acquisitionCurrency }
          : {}),
      },
      create: {
        userId,
        cardId: body.cardId,
        cardName: body.cardName ?? null,
        setCode: body.setCode ?? null,
        language: body.language,
        condition: body.condition,
        quantity: body.quantity,
        isPublic: body.isPublic ?? false,
        acquiredAt: body.acquiredAt ?? null,
        acquisitionPriceCents: body.acquisitionPriceCents ?? null,
        acquisitionCurrency: body.acquisitionCurrency ?? "EUR",
      },
    });

    ok(res, { item });
  }),
);

// DELETE /collection/items — remove item
router.delete(
  "/collection/items",
  requireAuth,
  requireNotBanned,
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
