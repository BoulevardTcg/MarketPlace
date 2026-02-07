import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  ListingCategory,
  Game,
  Language,
  CardCondition,
  ListingStatus,
  ListingEventType,
} from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import {
  optionalAuth,
  type RequestWithOptionalUser,
} from "../../shared/auth/optionalAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import {
  paginationQuerySchema,
  decodeCursor,
  buildPage,
} from "../../shared/http/pagination.js";

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────

const createListingBodySchema = z.object({
  title: z.string().min(3).max(120),
  priceCents: z.number().int().min(0),
  quantity: z.number().int().min(1).default(1),
  game: z.nativeEnum(Game),
  category: z.nativeEnum(ListingCategory),
  language: z.nativeEnum(Language),
  condition: z.nativeEnum(CardCondition),
  cardId: z.string().optional(),
  cardName: z.string().optional(),
  setCode: z.string().optional(),
  edition: z.string().optional(),
  description: z.string().max(2000).optional(),
  attributesJson: z.record(z.unknown()).optional(),
});

const updateListingBodySchema = z
  .object({
    title: z.string().min(3).max(120).optional(),
    description: z.string().max(2000).optional().nullable(),
    priceCents: z.number().int().min(0).optional(),
    quantity: z.number().int().min(1).optional(),
    game: z.nativeEnum(Game).optional(),
    category: z.nativeEnum(ListingCategory).optional(),
    language: z.nativeEnum(Language).optional(),
    condition: z.nativeEnum(CardCondition).optional(),
    cardId: z.string().optional().nullable(),
    cardName: z.string().optional().nullable(),
    setCode: z.string().optional().nullable(),
    edition: z.string().optional().nullable(),
    attributesJson: z.record(z.unknown()).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const listingsQuerySchema = paginationQuerySchema.extend({
  game: z.nativeEnum(Game).optional(),
  category: z.nativeEnum(ListingCategory).optional(),
  language: z.nativeEnum(Language).optional(),
  condition: z.nativeEnum(CardCondition).optional(),
  setCode: z.string().optional(),
  cardId: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  search: z.string().max(100).optional(),
  sort: z
    .enum(["price_asc", "price_desc", "date_desc", "date_asc"])
    .default("date_desc"),
});

const myListingsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ListingStatus).optional(),
  sort: z.enum(["date_desc", "date_asc"]).default("date_desc"),
});

// ─── Sort Config ──────────────────────────────────────────────

const SORT_CONFIGS = {
  date_desc: { field: "publishedAt", dir: "desc" },
  date_asc: { field: "publishedAt", dir: "asc" },
  price_asc: { field: "priceCents", dir: "asc" },
  price_desc: { field: "priceCents", dir: "desc" },
} as const;

// ─── Routes ───────────────────────────────────────────────────

router.get("/marketplace/ping", (_req, res) => {
  res.json({ data: { pong: true } });
});

// GET /marketplace/listings — public browse (PUBLISHED only)
router.get(
  "/marketplace/listings",
  asyncHandler(async (req, res) => {
    const query = listingsQuerySchema.parse(req.query);
    const {
      cursor,
      limit,
      sort,
      search,
      game,
      category,
      language,
      condition,
      setCode,
      cardId,
      minPrice,
      maxPrice,
    } = query;
    const sortCfg = SORT_CONFIGS[sort];

    const where: Prisma.ListingWhereInput = {
      status: ListingStatus.PUBLISHED,
    };

    if (game) where.game = game;
    if (category) where.category = category;
    if (language) where.language = language;
    if (condition) where.condition = condition;
    if (setCode) where.setCode = setCode;
    if (cardId) where.cardId = cardId;
    if (search) {
      // mode: 'insensitive' is PostgreSQL-only; SQLite is case-insensitive by default
      where.title = env.NODE_ENV === "test"
        ? { contains: search }
        : { contains: search, mode: "insensitive" as Prisma.QueryMode };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.priceCents = {};
      if (minPrice !== undefined) where.priceCents.gte = minPrice;
      if (maxPrice !== undefined) where.priceCents.lte = maxPrice;
    }

    // Seek cursor (includes sort key for validation)
    if (cursor) {
      const c = decodeCursor(cursor);
      if (c.s !== sort) {
        throw new AppError("INVALID_CURSOR", "Cursor does not match current sort", 400);
      }
      const cursorId = c.id as string;
      const isDesc = sortCfg.dir === "desc";

      if (sortCfg.field === "publishedAt") {
        const val = new Date(c.v as string);
        where.AND = {
          OR: [
            { publishedAt: isDesc ? { lt: val } : { gt: val } },
            {
              publishedAt: val,
              id: isDesc ? { lt: cursorId } : { gt: cursorId },
            },
          ],
        };
      } else {
        const val = c.v as number;
        where.AND = {
          OR: [
            { priceCents: isDesc ? { lt: val } : { gt: val } },
            {
              priceCents: val,
              id: isDesc ? { lt: cursorId } : { gt: cursorId },
            },
          ],
        };
      }
    }

    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
      sortCfg.field === "publishedAt"
        ? [{ publishedAt: sortCfg.dir }, { id: sortCfg.dir }]
        : [{ priceCents: sortCfg.dir }, { id: sortCfg.dir }];

    const items = await prisma.listing.findMany({
      where,
      orderBy,
      take: limit + 1,
    });

    const page = buildPage(items, limit, (item) => ({
      s: sort,
      v:
        sortCfg.field === "publishedAt"
          ? item.publishedAt!.toISOString()
          : item.priceCents,
      id: item.id,
    }));

    ok(res, page);
  }),
);

// GET /marketplace/listings/:id — public detail (non-PUBLISHED visible to owner only)
router.get(
  "/marketplace/listings/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithOptionalUser).user?.userId;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);

    if (listing.status !== ListingStatus.PUBLISHED && listing.userId !== userId) {
      throw new AppError("NOT_FOUND", "Listing not found", 404);
    }

    ok(res, listing);
  }),
);

// GET /marketplace/me/listings — my listings
router.get(
  "/marketplace/me/listings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = myListingsQuerySchema.parse(req.query);
    const { cursor, limit, status, sort } = query;
    const dir = sort === "date_desc" ? ("desc" as const) : ("asc" as const);

    const where: Prisma.ListingWhereInput = { userId };
    if (status) where.status = status;

    if (cursor) {
      const c = decodeCursor(cursor);
      const cursorId = c.id as string;
      const val = new Date(c.v as string);
      const isDesc = dir === "desc";
      where.AND = {
        OR: [
          { updatedAt: isDesc ? { lt: val } : { gt: val } },
          {
            updatedAt: val,
            id: isDesc ? { lt: cursorId } : { gt: cursorId },
          },
        ],
      };
    }

    const items = await prisma.listing.findMany({
      where,
      orderBy: [{ updatedAt: dir }, { id: dir }],
      take: limit + 1,
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.updatedAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// POST /marketplace/listings — create DRAFT
router.post(
  "/marketplace/listings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createListingBodySchema.parse(req.body);
    const userId = (req as RequestWithUser).user.userId;

    const result = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.create({
        data: {
          userId,
          title: body.title,
          description: body.description ?? null,
          category: body.category,
          game: body.game,
          language: body.language,
          condition: body.condition,
          setCode: body.setCode ?? null,
          cardId: body.cardId ?? null,
          cardName: body.cardName ?? null,
          edition: body.edition ?? null,
          attributesJson: (body.attributesJson ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          quantity: body.quantity,
          priceCents: body.priceCents,
          currency: "EUR",
          status: ListingStatus.DRAFT,
        },
      });
      await tx.listingEvent.create({
        data: {
          listingId: listing.id,
          type: ListingEventType.CREATED,
          actorUserId: userId,
          metadataJson: { source: "api" },
        },
      });
      return listing;
    });

    ok(res, { listingId: result.id }, 201);
  }),
);

// PATCH /marketplace/listings/:id — edit DRAFT only
router.patch(
  "/marketplace/listings/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    const body = updateListingBodySchema.parse(req.body);

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.userId !== userId)
      throw new AppError("FORBIDDEN", "Not allowed to edit this listing", 403);
    if (listing.status !== ListingStatus.DRAFT)
      throw new AppError(
        "INVALID_STATE",
        "Only DRAFT listings can be edited",
        409,
      );

    const { attributesJson, ...fields } = body;

    await prisma.$transaction(async (tx) => {
      await tx.listing.update({
        where: { id: listingId },
        data: {
          ...fields,
          ...(attributesJson !== undefined
            ? { attributesJson: attributesJson as Prisma.InputJsonValue | null }
            : {}),
        },
      });
      await tx.listingEvent.create({
        data: {
          listingId,
          type: ListingEventType.UPDATED,
          actorUserId: userId,
          metadataJson: { source: "api", fields: Object.keys(body) },
        },
      });
    });

    ok(res, { ok: true });
  }),
);

// POST /marketplace/listings/:id/publish
router.post(
  "/marketplace/listings/:id/publish",
  requireAuth,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.userId !== userId)
      throw new AppError(
        "FORBIDDEN",
        "Not allowed to publish this listing",
        403,
      );
    if (listing.status !== ListingStatus.DRAFT) {
      throw new AppError(
        "INVALID_STATE",
        "Listing cannot be published in its current state",
        409,
      );
    }

    // Atomic: updateMany with status guard prevents race conditions
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { id: listingId, userId, status: ListingStatus.DRAFT },
        data: { status: ListingStatus.PUBLISHED, publishedAt: now },
      });
      if (count === 0) {
        throw new AppError(
          "INVALID_STATE",
          "Listing cannot be published (status already changed)",
          409,
        );
      }
      await tx.listingEvent.create({
        data: {
          listingId,
          type: ListingEventType.PUBLISHED,
          actorUserId: userId,
          metadataJson: { source: "api" },
        },
      });
    });

    ok(res, { ok: true });
  }),
);

// POST /marketplace/listings/:id/archive — from DRAFT or PUBLISHED
router.post(
  "/marketplace/listings/:id/archive",
  requireAuth,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.userId !== userId)
      throw new AppError(
        "FORBIDDEN",
        "Not allowed to archive this listing",
        403,
      );
    if (
      listing.status === ListingStatus.SOLD ||
      listing.status === ListingStatus.ARCHIVED
    ) {
      throw new AppError(
        "INVALID_STATE",
        "Listing cannot be archived in its current state",
        409,
      );
    }

    // Atomic: updateMany with status guard prevents race conditions
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: {
          id: listingId,
          userId,
          status: { in: [ListingStatus.DRAFT, ListingStatus.PUBLISHED] },
        },
        data: { status: ListingStatus.ARCHIVED },
      });
      if (count === 0) {
        throw new AppError(
          "INVALID_STATE",
          "Listing cannot be archived (status already changed)",
          409,
        );
      }
      await tx.listingEvent.create({
        data: {
          listingId,
          type: ListingEventType.ARCHIVED,
          actorUserId: userId,
          metadataJson: { source: "api" },
        },
      });
    });

    ok(res, { ok: true });
  }),
);

// POST /marketplace/listings/:id/mark-sold — from PUBLISHED only
router.post(
  "/marketplace/listings/:id/mark-sold",
  requireAuth,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.userId !== userId)
      throw new AppError(
        "FORBIDDEN",
        "Not allowed to mark this listing as sold",
        403,
      );
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new AppError(
        "INVALID_STATE",
        "Only PUBLISHED listings can be marked as sold",
        409,
      );
    }

    // Atomic: updateMany with status guard prevents race conditions
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { id: listingId, userId, status: ListingStatus.PUBLISHED },
        data: { status: ListingStatus.SOLD, soldAt: now },
      });
      if (count === 0) {
        throw new AppError(
          "INVALID_STATE",
          "Listing cannot be marked as sold (status already changed)",
          409,
        );
      }
      await tx.listingEvent.create({
        data: {
          listingId,
          type: ListingEventType.SOLD,
          actorUserId: userId,
          metadataJson: { source: "api" },
        },
      });
    });

    ok(res, { ok: true });
  }),
);

export const marketplaceRoutes = router;
