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
  PriceSource,
  NotificationType,
  ShippingMethod,
} from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { requireNotBanned, assertNotBannedInTx } from "../../shared/auth/requireNotBanned.js";
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
import {
  getPresignedUploadUrl,
  isPresignedConfigured,
  deleteListingImageFromS3,
} from "../../shared/storage/presigned.js";
import { randomUUID } from "node:crypto";
import { createNotification } from "../../shared/notifications/createNotification.js";

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
  attributesJson: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
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
    attributesJson: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().nullable(),
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

// ─── Market price enrichment ──────────────────────────────────

type ListingWithPrice = {
  id: string;
  cardId: string | null;
  language: Language;
  priceCents: number;
  [k: string]: unknown;
};

async function enrichListingsWithMarketPrice<T extends ListingWithPrice>(
  listings: T[],
): Promise<(T & { marketPriceCents: number | null; deltaCents: number | null })[]> {
  if (listings.length === 0) return [];
  const pairs = new Map<string, { cardId: string; language: Language }>();
  for (const l of listings) {
    if (l.cardId) pairs.set(`${l.cardId}:${l.language}`, { cardId: l.cardId, language: l.language });
  }
  if (pairs.size === 0) {
    return listings.map((l) => ({ ...l, marketPriceCents: null, deltaCents: null }));
  }
  const refs = await prisma.externalProductRef.findMany({
    where: {
      source: PriceSource.CARDMARKET,
      OR: [...pairs.values()].map((p) => ({ cardId: p.cardId, language: p.language })),
    },
  });
  const refByKey = new Map(refs.map((r) => [`${r.cardId}:${r.language ?? ""}`, r]));
  const externalIds = [...new Set(refs.map((r) => r.externalProductId))];
  const latestSnapshots = await Promise.all(
    externalIds.map((externalProductId) =>
      prisma.cardPriceSnapshot.findFirst({
        where: { externalProductId, source: PriceSource.CARDMARKET },
        orderBy: { capturedAt: "desc" },
      }),
    ),
  );
  const snapshotByExternalId = new Map(
    externalIds.map((id, i) => [id, latestSnapshots[i]]),
  );
  return listings.map((l) => {
    const key = l.cardId ? `${l.cardId}:${l.language}` : "";
    const ref = key ? refByKey.get(key) : null;
    const snapshot = ref ? snapshotByExternalId.get(ref.externalProductId) ?? null : null;
    const marketPriceCents = snapshot?.trendCents ?? null;
    const deltaCents =
      marketPriceCents != null ? l.priceCents - marketPriceCents : null;
    return { ...l, marketPriceCents, deltaCents };
  });
}

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
      isHidden: false,
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
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
      },
    });

    const page = buildPage(items, limit, (item) => ({
      s: sort,
      v:
        sortCfg.field === "publishedAt"
          ? item.publishedAt!.toISOString()
          : item.priceCents,
      id: item.id,
    }));

    page.items = await enrichListingsWithMarketPrice(page.items);
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
      include: {
        images: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);

    const isOwner = listing.userId === userId;
    if (listing.status !== ListingStatus.PUBLISHED && !isOwner) {
      throw new AppError("NOT_FOUND", "Listing not found", 404);
    }
    // Hidden listings are invisible to non-owners
    if (listing.isHidden && !isOwner) {
      throw new AppError("NOT_FOUND", "Listing not found", 404);
    }

    const [enriched] = await enrichListingsWithMarketPrice([listing]);
    let isFavorited = false;
    if (userId) {
      const fav = await prisma.favorite.findUnique({
        where: {
          userId_listingId: { userId, listingId },
        },
      });
      isFavorited = !!fav;
    }
    ok(res, { ...enriched, isFavorited });
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

// GET /marketplace/me/sales/summary — monthly sales aggregation
router.get(
  "/marketplace/me/sales/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;

    // Fetch all SOLD listings for this user
    const soldItems = await prisma.listing.findMany({
      where: { userId, status: "SOLD" },
      select: {
        priceCents: true,
        quantity: true,
        soldAt: true,
        game: true,
        language: true,
      },
      orderBy: { soldAt: "asc" },
    });

    // Aggregate by month (YYYY-MM)
    const monthlyMap = new Map<string, { revenueCents: number; count: number }>();
    const byGameMap = new Map<string, { revenueCents: number; count: number }>();
    let totalRevenueCents = 0;
    let totalSold = 0;

    for (const item of soldItems) {
      const revenue = item.priceCents * item.quantity;
      totalRevenueCents += revenue;
      totalSold += item.quantity;

      // Monthly
      const dt = item.soldAt ?? new Date();
      const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const mEntry = monthlyMap.get(monthKey) ?? { revenueCents: 0, count: 0 };
      mEntry.revenueCents += revenue;
      mEntry.count += item.quantity;
      monthlyMap.set(monthKey, mEntry);

      // By game
      const game = item.game;
      const gEntry = byGameMap.get(game) ?? { revenueCents: 0, count: 0 };
      gEntry.revenueCents += revenue;
      gEntry.count += item.quantity;
      byGameMap.set(game, gEntry);
    }

    const monthly = [...monthlyMap.entries()].map(([month, v]) => ({
      month,
      revenueCents: v.revenueCents,
      count: v.count,
    }));

    const byGame = [...byGameMap.entries()].map(([game, v]) => ({
      game,
      revenueCents: v.revenueCents,
      count: v.count,
    }));

    ok(res, { totalRevenueCents, totalSold, monthly, byGame });
  }),
);

// POST /marketplace/listings — create DRAFT
router.post(
  "/marketplace/listings",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const body = createListingBodySchema.parse(req.body ?? {});
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
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    const body = updateListingBodySchema.parse(req.body ?? {});

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
            ? {
                attributesJson:
                  attributesJson === null
                    ? Prisma.JsonNull
                    : (attributesJson as Prisma.InputJsonValue),
              }
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
  requireNotBanned,
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
      await assertNotBannedInTx(tx, userId);

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
  requireNotBanned,
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
  requireNotBanned,
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

    // Atomic: update listing + event; if listing has cardId, decrement seller inventory
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await assertNotBannedInTx(tx, userId);

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
      if (listing.cardId) {
        const { count } = await tx.userCollection.updateMany({
          where: {
            userId,
            cardId: listing.cardId,
            language: listing.language,
            condition: listing.condition,
            quantity: { gte: listing.quantity },
          },
          data: { quantity: { decrement: listing.quantity } },
        });
        if (count === 0) {
          throw new AppError(
            "INSUFFICIENT_QUANTITY",
            "Seller inventory insufficient for this listing",
            409,
          );
        }
        await tx.userCollection.deleteMany({
          where: {
            userId,
            cardId: listing.cardId,
            language: listing.language,
            condition: listing.condition,
            quantity: { lte: 0 },
          },
        });
      }
    });

    ok(res, { ok: true });
  }),
);

// ─── Favorites (toggle + list) ───────────────────────────────────────────

// POST /marketplace/listings/:id/favorite — toggle favorite (auth). Only PUBLISHED listings.
router.post(
  "/marketplace/listings/:id/favorite",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new AppError("INVALID_STATE", "Only PUBLISHED listings can be favorited", 409);
    }

    const existing = await prisma.favorite.findUnique({
      where: {
        userId_listingId: { userId, listingId },
      },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return ok(res, { favorited: false });
    }
    await prisma.favorite.create({
      data: { userId, listingId },
    });
    ok(res, { favorited: true }, 201);
  }),
);

// GET /marketplace/me/favorites — list my favorites (auth), paginated
router.get(
  "/marketplace/me/favorites",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = paginationQuerySchema.parse(req.query);
    const { cursor, limit } = query;

    const where: Prisma.FavoriteWhereInput = { userId };
    if (cursor) {
      const { v, id: cursorId } = decodeCursor(cursor) as { v?: string; id?: string };
      const val = v ? new Date(v) : undefined;
      if (val && cursorId) {
        where.OR = [
          { createdAt: { lt: val } },
          { createdAt: val, id: { lt: cursorId } },
        ];
      }
    }

    const favorites = await prisma.favorite.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: { listing: true },
    });

    const page = buildPage(favorites, limit, (f) => ({
      v: f.createdAt.toISOString(),
      id: f.id,
    }));
    const items = page.items.map((f) => ({
      favoriteId: f.id,
      createdAt: f.createdAt,
      listing: f.listing,
    }));
    ok(res, { items, nextCursor: page.nextCursor });
  }),
);

// ─── Listing images (presigned upload + attach / delete / reorder) ────────

const MAX_IMAGES_PER_LISTING = 8;
const ALLOWED_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** storageKey must be listings/{listingId}/{uuid}.(jpg|jpeg|png|webp); listingId = CUID alphanum */
const STORAGE_KEY_REGEX = /^listings\/[A-Za-z0-9]+\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i;

const presignedUploadBodySchema = z.object({
  contentType: z
    .enum(ALLOWED_IMAGE_CONTENT_TYPES)
    .optional()
    .default("image/jpeg"),
});

const attachImageBodySchema = z.object({
  storageKey: z
    .string()
    .min(1, "storageKey is required")
    .regex(STORAGE_KEY_REGEX, "storageKey must be listings/{listingId}/{uuid}.jpg|jpeg|png|webp"),
  sortOrder: z.number().int().min(0).optional(),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES).optional(),
});

const reorderImagesBodySchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1, "imageIds must not be empty"),
});

async function getListingAsOwner(
  listingId: string,
  userId: string,
): Promise<{ id: string; userId: string }> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, userId: true },
  });
  if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
  if (listing.userId !== userId) {
    throw new AppError("FORBIDDEN", "Not allowed to modify this listing", 403);
  }
  return listing;
}

// POST /marketplace/listings/:id/images/presigned-upload — get presigned URL for upload (owner only)
router.post(
  "/marketplace/listings/:id/images/presigned-upload",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    await getListingAsOwner(listingId, userId);

    if (!isPresignedConfigured()) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Listing image upload is not configured (LISTING_IMAGES_BUCKET / AWS_REGION)",
        503,
      );
    }
    const body = presignedUploadBodySchema.parse(req.body ?? {});
    const contentType = body.contentType;
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const storageKey = `listings/${listingId}/${randomUUID()}.${ext}`;

    const result = await getPresignedUploadUrl(storageKey, contentType);
    if (!result) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Presigned URL could not be generated",
        503,
      );
    }
    ok(res, {
      uploadUrl: result.uploadUrl,
      storageKey,
      expiresIn: result.expiresIn,
      maxBytes: result.maxBytes,
    });
  }),
);

// POST /marketplace/listings/:id/images/attach — register an uploaded image (owner only), max 8 per listing
router.post(
  "/marketplace/listings/:id/images/attach",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    await getListingAsOwner(listingId, userId);
    const body = attachImageBodySchema.parse(req.body ?? {});

    // Security: storageKey must belong to this listing (prevent attaching another listing's image)
    const expectedPrefix = `listings/${listingId}/`;
    if (!body.storageKey.startsWith(expectedPrefix)) {
      throw new AppError(
        "INVALID_STORAGE_KEY",
        "storageKey must belong to this listing",
        400,
      );
    }

    const count = await prisma.listingImage.count({ where: { listingId } });
    if (count >= MAX_IMAGES_PER_LISTING) {
      throw new AppError(
        "CONFLICT",
        `Maximum ${MAX_IMAGES_PER_LISTING} images per listing`,
        409,
      );
    }
    const maxSort = await prisma.listingImage.aggregate({
      where: { listingId },
      _max: { sortOrder: true },
    });
    const sortOrder = body.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1;

    const image = await prisma.listingImage.create({
      data: {
        listingId,
        storageKey: body.storageKey,
        sortOrder,
        contentType: body.contentType ?? null,
      },
    });
    ok(res, { imageId: image.id, image }, 201);
  }),
);

// GET /marketplace/listings/:id/images — list images (owner or public if PUBLISHED)
router.get(
  "/marketplace/listings/:id/images",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true, status: true, isHidden: true },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);

    const userId = (req as RequestWithOptionalUser).user?.userId;
    const isOwner = userId === listing.userId;
    const isPublic = listing.status === ListingStatus.PUBLISHED && !listing.isHidden;
    if (!isOwner && !isPublic) {
      throw new AppError("NOT_FOUND", "Listing not found", 404);
    }

    const images = await prisma.listingImage.findMany({
      where: { listingId },
      orderBy: { sortOrder: "asc" },
    });
    ok(res, { items: images });
  }),
);

// DELETE /marketplace/listings/:id/images/:imageId — remove image (owner only)
router.delete(
  "/marketplace/listings/:id/images/:imageId",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const { id: listingId, imageId } = req.params;
    const userId = (req as RequestWithUser).user.userId;
    await getListingAsOwner(listingId, userId);

    const image = await prisma.listingImage.findFirst({
      where: { id: imageId, listingId },
    });
    if (!image) throw new AppError("NOT_FOUND", "Image not found", 404);

    await deleteListingImageFromS3(image.storageKey);
    await prisma.listingImage.delete({ where: { id: imageId } });
    ok(res, { ok: true });
  }),
);

// PATCH /marketplace/listings/:id/images/reorder — set order (owner only)
router.patch(
  "/marketplace/listings/:id/images/reorder",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    await getListingAsOwner(listingId, userId);
    const body = reorderImagesBodySchema.parse(req.body ?? {});

    const images = await prisma.listingImage.findMany({
      where: { listingId },
      select: { id: true },
    });
    const idSet = new Set(images.map((i) => i.id));
    for (const id of body.imageIds) {
      if (!idSet.has(id)) {
        throw new AppError("NOT_FOUND", `Image ${id} not found on this listing`, 404);
      }
    }

    await prisma.$transaction(
      body.imageIds.map((imageId, index) =>
        prisma.listingImage.update({
          where: { id: imageId },
          data: { sortOrder: index },
        }),
      ),
    );
    const updated = await prisma.listingImage.findMany({
      where: { listingId },
      orderBy: { sortOrder: "asc" },
    });
    ok(res, { items: updated });
  }),
);

// ─── Buyer Purchase Flow ──────────────────────────────────────

// POST /marketplace/listings/:id/buy — buyer initiates a purchase (creates a PurchaseOrder)
router.post(
  "/marketplace/listings/:id/buy",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const buyerUserId = (req as RequestWithUser).user.userId;

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new AppError("INVALID_STATE", "This listing is not available for purchase", 409);
    }
    if (listing.userId === buyerUserId) {
      throw new AppError("FORBIDDEN", "Cannot buy your own listing", 403);
    }

    // Prevent duplicate PENDING orders from the same buyer
    const existingOrder = await prisma.purchaseOrder.findFirst({
      where: { listingId, buyerUserId, status: "PENDING" },
    });
    if (existingOrder) {
      throw new AppError(
        "CONFLICT",
        "You already have a pending order for this listing",
        409,
      );
    }

    const order = await prisma.purchaseOrder.create({
      data: {
        buyerUserId,
        listingId,
        priceCents: listing.priceCents,
        currency: listing.currency,
        status: "PENDING",
      },
    });

    // Notify seller
    await createNotification(prisma, {
      userId: listing.userId,
      type: NotificationType.PURCHASE_ORDER_RECEIVED,
      title: "Nouvelle demande d'achat",
      body: `Un acheteur est intéressé par votre annonce "${listing.title}".`,
      dataJson: { orderId: order.id, listingId, listingTitle: listing.title, buyerUserId },
    });

    ok(res, { orderId: order.id, priceCents: order.priceCents, currency: order.currency }, 201);
  }),
);

// GET /marketplace/me/purchases — buyer's purchase orders (paginated)
router.get(
  "/marketplace/me/purchases",
  requireAuth,
  asyncHandler(async (req, res) => {
    const buyerUserId = (req as RequestWithUser).user.userId;
    const query = paginationQuerySchema.parse(req.query);
    const { cursor, limit } = query;

    const where: Prisma.PurchaseOrderWhereInput = { buyerUserId };
    if (cursor) {
      const c = decodeCursor(cursor);
      where.AND = {
        OR: [
          { createdAt: { lt: new Date(c.v as string) } },
          { createdAt: new Date(c.v as string), id: { lt: c.id as string } },
        ],
      };
    }

    const items = await prisma.purchaseOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            priceCents: true,
            currency: true,
            status: true,
            images: { orderBy: { sortOrder: "asc" }, take: 1 },
          },
        },
      },
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.createdAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// GET /marketplace/me/orders — seller's incoming purchase orders (paginated)
router.get(
  "/marketplace/me/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = paginationQuerySchema.parse(req.query);
    const { cursor, limit } = query;

    // Get orders for listings owned by this user
    const where: Prisma.PurchaseOrderWhereInput = {
      listing: { userId },
    };
    if (cursor) {
      const c = decodeCursor(cursor);
      where.AND = {
        OR: [
          { createdAt: { lt: new Date(c.v as string) } },
          { createdAt: new Date(c.v as string), id: { lt: c.id as string } },
        ],
      };
    }

    const items = await prisma.purchaseOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            priceCents: true,
            currency: true,
            status: true,
          },
        },
      },
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.createdAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// ─── Shipping Information ─────────────────────────────────────

const shippingBodySchema = z.object({
  method: z.nativeEnum(ShippingMethod),
  isFree: z.boolean().default(false),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().max(3).default("EUR"),
  estimatedDays: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
});

// POST /marketplace/listings/:id/shipping — set shipping info (owner only)
router.post(
  "/marketplace/listings/:id/shipping",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    const body = shippingBodySchema.parse(req.body ?? {});

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true, status: true },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.userId !== userId) throw new AppError("FORBIDDEN", "Not allowed", 403);
    if (
      listing.status !== ListingStatus.DRAFT &&
      listing.status !== ListingStatus.PUBLISHED
    ) {
      throw new AppError("INVALID_STATE", "Cannot set shipping on a listing in its current state", 409);
    }
    if (!body.isFree && body.priceCents === undefined) {
      throw new AppError("VALIDATION_ERROR", "priceCents is required when isFree is false", 400);
    }

    const shipping = await prisma.listingShipping.upsert({
      where: { listingId },
      create: {
        listingId,
        method: body.method,
        isFree: body.isFree,
        priceCents: body.isFree ? null : body.priceCents ?? null,
        currency: body.currency,
        estimatedDays: body.estimatedDays ?? null,
        description: body.description ?? null,
      },
      update: {
        method: body.method,
        isFree: body.isFree,
        priceCents: body.isFree ? null : body.priceCents ?? null,
        currency: body.currency,
        estimatedDays: body.estimatedDays ?? null,
        description: body.description ?? null,
      },
    });

    ok(res, { shipping }, 201);
  }),
);

// GET /marketplace/listings/:id/shipping — get shipping info (public)
router.get(
  "/marketplace/listings/:id/shipping",
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, isHidden: true },
    });
    if (!listing || listing.isHidden) {
      throw new AppError("NOT_FOUND", "Listing not found", 404);
    }

    const shipping = await prisma.listingShipping.findUnique({ where: { listingId } });
    ok(res, { shipping: shipping ?? null });
  }),
);

// ─── Listing Q&A ──────────────────────────────────────────────

const askQuestionBodySchema = z.object({
  question: z.string().min(5).max(500),
});

const answerQuestionBodySchema = z.object({
  answer: z.string().min(1).max(1000),
});

// POST /marketplace/listings/:id/questions — ask a question (auth, not owner)
router.post(
  "/marketplace/listings/:id/questions",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const askerId = (req as RequestWithUser).user.userId;
    const body = askQuestionBodySchema.parse(req.body ?? {});

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true, status: true, title: true, isHidden: true },
    });
    if (!listing || listing.isHidden) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new AppError("INVALID_STATE", "Can only ask questions on published listings", 409);
    }
    if (listing.userId === askerId) {
      throw new AppError("FORBIDDEN", "Cannot ask a question on your own listing", 403);
    }

    const question = await prisma.listingQuestion.create({
      data: { listingId, askerId, question: body.question },
    });

    // Notify listing owner
    await createNotification(prisma, {
      userId: listing.userId,
      type: NotificationType.LISTING_QUESTION_RECEIVED,
      title: "Nouvelle question sur votre annonce",
      body: `Question : "${body.question.slice(0, 100)}${body.question.length > 100 ? "…" : ""}"`,
      dataJson: { questionId: question.id, listingId, listingTitle: listing.title, askerId },
    });

    ok(res, { questionId: question.id }, 201);
  }),
);

// GET /marketplace/listings/:id/questions — list Q&A (public: answered only; owner: all)
router.get(
  "/marketplace/listings/:id/questions",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const listingId = req.params.id;
    const userId = (req as RequestWithOptionalUser).user?.userId;
    const query = paginationQuerySchema.parse(req.query);
    const { cursor, limit } = query;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true, isHidden: true },
    });
    if (!listing || listing.isHidden) throw new AppError("NOT_FOUND", "Listing not found", 404);

    const isOwner = userId === listing.userId;
    const where: Prisma.ListingQuestionWhereInput = { listingId };

    // Non-owners only see answered questions
    if (!isOwner) where.answer = { not: null };

    if (cursor) {
      const c = decodeCursor(cursor);
      where.AND = {
        OR: [
          { createdAt: { lt: new Date(c.v as string) } },
          { createdAt: new Date(c.v as string), id: { lt: c.id as string } },
        ],
      };
    }

    const items = await prisma.listingQuestion.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.createdAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// POST /marketplace/listings/:id/questions/:qid/answer — answer a question (owner only)
router.post(
  "/marketplace/listings/:id/questions/:qid/answer",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const { id: listingId, qid: questionId } = req.params;
    const userId = (req as RequestWithUser).user.userId;
    const body = answerQuestionBodySchema.parse(req.body ?? {});

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { userId: true, title: true },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
    if (listing.userId !== userId) throw new AppError("FORBIDDEN", "Only the listing owner can answer", 403);

    const question = await prisma.listingQuestion.findFirst({
      where: { id: questionId, listingId },
    });
    if (!question) throw new AppError("NOT_FOUND", "Question not found", 404);
    if (question.answer) throw new AppError("CONFLICT", "This question already has an answer", 409);

    await prisma.listingQuestion.update({
      where: { id: questionId },
      data: { answer: body.answer, answeredAt: new Date() },
    });

    // Notify asker
    await createNotification(prisma, {
      userId: question.askerId,
      type: NotificationType.LISTING_QUESTION_ANSWERED,
      title: "Réponse à votre question",
      body: `Le vendeur a répondu à votre question sur "${listing.title}".`,
      dataJson: { questionId, listingId, listingTitle: listing.title },
    });

    ok(res, { ok: true });
  }),
);

export const marketplaceRoutes = router;
