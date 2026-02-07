import { Router } from "express";
import { z } from "zod";
import { Prisma, TradeOfferStatus, TradeEventType } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import {
  paginationQuerySchema,
  decodeCursor,
  buildPage,
} from "../../shared/http/pagination.js";
import {
  markExpiredIfNeeded,
  expirePendingOffers,
} from "../../shared/trade/expiration.js";

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────

const createTradeOfferBodySchema = z.object({
  receiverUserId: z.string().min(1, "receiverUserId is required"),
  creatorItemsJson: z
    .record(z.unknown())
    .refine(
      (obj) =>
        obj &&
        typeof obj === "object" &&
        "schemaVersion" in obj &&
        typeof (obj as { schemaVersion: unknown }).schemaVersion === "number",
      { message: "creatorItemsJson must contain schemaVersion (number)" },
    ),
  receiverItemsJson: z
    .record(z.unknown())
    .refine(
      (obj) =>
        obj &&
        typeof obj === "object" &&
        "schemaVersion" in obj &&
        typeof (obj as { schemaVersion: unknown }).schemaVersion === "number",
      { message: "receiverItemsJson must contain schemaVersion (number)" },
    ),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

const tradeOffersQuerySchema = paginationQuerySchema.extend({
  type: z.enum(["sent", "received"]),
  status: z.nativeEnum(TradeOfferStatus).optional(),
});

// ─── Routes ───────────────────────────────────────────────────

router.get("/trade/ping", (_req, res) => {
  res.json({ data: { pong: true } });
});

// POST /trade/offers — create trade offer
router.post(
  "/trade/offers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = createTradeOfferBodySchema.parse(req.body);
    const creatorUserId = (req as RequestWithUser).user.userId;

    if (body.receiverUserId === creatorUserId) {
      throw new AppError(
        "INVALID_REQUEST",
        "Cannot create trade offer with yourself",
        400,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + body.expiresInHours);

    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.tradeOffer.create({
        data: {
          creatorUserId,
          receiverUserId: body.receiverUserId,
          creatorItemsJson: body.creatorItemsJson as object,
          receiverItemsJson: body.receiverItemsJson as object,
          status: TradeOfferStatus.PENDING,
          expiresAt,
        },
      });
      await tx.tradeEvent.create({
        data: {
          tradeOfferId: offer.id,
          type: TradeEventType.CREATED,
          actorUserId: creatorUserId,
          metadataJson: { source: "api" },
        },
      });
      return offer;
    });

    ok(res, { tradeOfferId: result.id }, 201);
  }),
);

// GET /trade/offers — list sent or received offers
router.get(
  "/trade/offers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = tradeOffersQuerySchema.parse(req.query);
    const { type, status, cursor, limit } = query;

    // Lazy-expire PENDING offers past their expiresAt
    await expirePendingOffers(userId);

    const where: Prisma.TradeOfferWhereInput =
      type === "sent"
        ? { creatorUserId: userId }
        : { receiverUserId: userId };

    if (status) where.status = status;

    if (cursor) {
      const c = decodeCursor(cursor);
      const cursorId = c.id as string;
      const val = new Date(c.v as string);
      where.AND = {
        OR: [
          { createdAt: { lt: val } },
          { createdAt: val, id: { lt: cursorId } },
        ],
      };
    }

    const items = await prisma.tradeOffer.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.createdAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// GET /trade/offers/:id — detail (creator or receiver only)
router.get(
  "/trade/offers/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const offerId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (offer.creatorUserId !== userId && offer.receiverUserId !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Not allowed to view this trade offer",
        403,
      );
    }

    // Lazy-expire if needed
    await markExpiredIfNeeded(offer);

    // Re-fetch with events (status may have changed)
    const result = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!result)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);

    ok(res, result);
  }),
);

// POST /trade/offers/:id/accept — receiver-only
router.post(
  "/trade/offers/:id/accept",
  requireAuth,
  asyncHandler(async (req, res) => {
    const offerId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (offer.receiverUserId !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Only the receiver can accept this offer",
        403,
      );
    }

    // Check expiration before accepting
    if (
      offer.status === TradeOfferStatus.PENDING &&
      offer.expiresAt &&
      offer.expiresAt < new Date()
    ) {
      await markExpiredIfNeeded(offer);
      throw new AppError("INVALID_STATE", "Trade offer has expired", 409);
    }

    if (offer.status !== TradeOfferStatus.PENDING) {
      throw new AppError(
        "INVALID_STATE",
        `Trade offer cannot be accepted (status: ${offer.status})`,
        409,
      );
    }

    // Atomic: updateMany with status guard prevents race conditions
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.tradeOffer.updateMany({
        where: { id: offerId, status: TradeOfferStatus.PENDING },
        data: { status: TradeOfferStatus.ACCEPTED },
      });
      if (count === 0) {
        throw new AppError(
          "INVALID_STATE",
          "Trade offer cannot be accepted (status already changed)",
          409,
        );
      }
      await tx.tradeEvent.create({
        data: {
          tradeOfferId: offerId,
          type: TradeEventType.ACCEPTED,
          actorUserId: userId,
          metadataJson: { source: "api" },
        },
      });
    });

    ok(res, { ok: true });
  }),
);

// POST /trade/offers/:id/reject — receiver-only
// Allowed from PENDING even if expired by time (explicit rejection takes priority)
router.post(
  "/trade/offers/:id/reject",
  requireAuth,
  asyncHandler(async (req, res) => {
    const offerId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (offer.receiverUserId !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Only the receiver can reject this offer",
        403,
      );
    }
    if (offer.status !== TradeOfferStatus.PENDING) {
      throw new AppError(
        "INVALID_STATE",
        `Trade offer cannot be rejected (status: ${offer.status})`,
        409,
      );
    }

    // Atomic: updateMany with status guard prevents race conditions
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.tradeOffer.updateMany({
        where: { id: offerId, status: TradeOfferStatus.PENDING },
        data: { status: TradeOfferStatus.REJECTED },
      });
      if (count === 0) {
        throw new AppError(
          "INVALID_STATE",
          "Trade offer cannot be rejected (status already changed)",
          409,
        );
      }
      await tx.tradeEvent.create({
        data: {
          tradeOfferId: offerId,
          type: TradeEventType.REJECTED,
          actorUserId: userId,
          metadataJson: { source: "api" },
        },
      });
    });

    ok(res, { ok: true });
  }),
);

// POST /trade/offers/:id/cancel — creator-only
// Allowed from PENDING even if expired by time (explicit cancellation takes priority)
router.post(
  "/trade/offers/:id/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const offerId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (offer.creatorUserId !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Only the creator can cancel this offer",
        403,
      );
    }
    if (offer.status !== TradeOfferStatus.PENDING) {
      throw new AppError(
        "INVALID_STATE",
        `Trade offer cannot be cancelled (status: ${offer.status})`,
        409,
      );
    }

    // Atomic: updateMany with status guard prevents race conditions
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.tradeOffer.updateMany({
        where: { id: offerId, status: TradeOfferStatus.PENDING },
        data: { status: TradeOfferStatus.CANCELLED },
      });
      if (count === 0) {
        throw new AppError(
          "INVALID_STATE",
          "Trade offer cannot be cancelled (status already changed)",
          409,
        );
      }
      await tx.tradeEvent.create({
        data: {
          tradeOfferId: offerId,
          type: TradeEventType.CANCELLED,
          actorUserId: userId,
          metadataJson: { source: "api" },
        },
      });
    });

    ok(res, { ok: true });
  }),
);

export const tradeRoutes = router;
