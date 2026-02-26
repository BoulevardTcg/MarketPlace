import { Router } from "express";
import { z } from "zod";
import { Prisma, TradeOfferStatus, TradeEventType, NotificationType } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { requireNotBanned, assertNotBannedInTx } from "../../shared/auth/requireNotBanned.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import { requireProfile } from "../../shared/auth/requireProfile.js";
import {
  paginationQuerySchema,
  decodeCursor,
  buildPage,
} from "../../shared/http/pagination.js";
import {
  markExpiredIfNeeded,
  expirePendingOffers,
} from "../../shared/trade/expiration.js";
import { parseTradeItems } from "../../shared/trade/items.js";
import type { TradeItem } from "../../shared/trade/items.js";
import type { PrismaClient } from "@prisma/client";
import { createNotification } from "../../shared/notifications/createNotification.js";

const router = Router();

// ─── Profile gate (opt-in) ───────────────────────────────────
const tradeProfileGate =
  env.PROFILE_GATE_ENABLED === "true"
    ? requireProfile("TRADER")
    : (_req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) => next();

/** In a transaction: atomic decrement giver (quantity >= N), then increment receiver (upsert). */
async function applyTradeItemMove(
  tx: PrismaClient,
  giverUserId: string,
  receiverUserId: string,
  item: TradeItem,
  _direction: "decrement",
): Promise<void> {
  const { count } = await tx.userCollection.updateMany({
    where: {
      userId: giverUserId,
      cardId: item.cardId,
      language: item.language,
      condition: item.condition,
      quantity: { gte: item.quantity },
    },
    data: { quantity: { decrement: item.quantity } },
  });
  if (count === 0) {
    throw new AppError(
      "INSUFFICIENT_QUANTITY",
      `Insufficient quantity for ${item.cardId} (${item.language}/${item.condition})`,
      409,
    );
  }
  await tx.userCollection.deleteMany({
    where: {
      userId: giverUserId,
      cardId: item.cardId,
      language: item.language,
      condition: item.condition,
      quantity: { lte: 0 },
    },
  });
  const receiver = await tx.userCollection.findUnique({
    where: {
      userId_cardId_language_condition: {
        userId: receiverUserId,
        cardId: item.cardId,
        language: item.language,
        condition: item.condition,
      },
    },
  });
  if (receiver) {
    await tx.userCollection.update({
      where: { id: receiver.id },
      data: { quantity: receiver.quantity + item.quantity },
    });
  } else {
    await tx.userCollection.create({
      data: {
        userId: receiverUserId,
        cardId: item.cardId,
        language: item.language,
        condition: item.condition,
        quantity: item.quantity,
      },
    });
  }
}

// ─── Zod Schemas ──────────────────────────────────────────────

const tradeItemSchema = z.object({
  cardId: z.string().min(1),
  language: z.string().min(1),
  condition: z.string().min(1),
  quantity: z.number().int().min(1),
});

const tradeItemsJsonSchema = z.object({
  schemaVersion: z.number().int(),
  items: z.array(tradeItemSchema).optional(),
});

const createTradeOfferBodySchema = z.object({
  receiverUserId: z.string().min(1, "receiverUserId is required"),
  creatorItemsJson: tradeItemsJsonSchema,
  receiverItemsJson: tradeItemsJsonSchema,
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

const tradeOffersQuerySchema = paginationQuerySchema.extend({
  type: z.enum(["sent", "received"]),
  status: z.nativeEnum(TradeOfferStatus).optional(),
});

const postMessageBodySchema = z.object({
  body: z.string().min(1, "body is required").max(2000, "body must be at most 2000 characters"),
});

const messagesQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const counterOfferBodySchema = z.object({
  creatorItemsJson: tradeItemsJsonSchema,
  receiverItemsJson: tradeItemsJsonSchema,
  expiresInHours: z.number().int().min(1).max(168).optional().default(72),
});

// ─── Routes ───────────────────────────────────────────────────

router.get("/trade/ping", (_req, res) => {
  res.json({ data: { pong: true } });
});

// POST /trade/offers — create trade offer
router.post(
  "/trade/offers",
  requireAuth,
  requireNotBanned,
  tradeProfileGate,
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
      await createNotification(tx, {
        userId: body.receiverUserId,
        type: NotificationType.TRADE_OFFER_RECEIVED,
        title: "Nouvelle offre d'échange",
        body: "Vous avez reçu une nouvelle offre d'échange.",
        dataJson: { tradeOfferId: offer.id, fromUserId: creatorUserId },
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
      include: {
        messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        readStates: { where: { userId } },
      },
    });

    const epoch = new Date(0);
    const enriched = items.map((offer) => {
      const lastReadAt = offer.readStates[0]?.lastReadAt ?? null;
      const unreadCount = offer.messages.filter(
        (m) =>
          m.senderUserId !== userId &&
          (lastReadAt ? m.createdAt > lastReadAt : true),
      ).length;
      const lastMessage = offer.messages[0] ?? null;
      const { messages: _m, readStates: _r, ...rest } = offer;
      return {
        ...rest,
        lastMessage: lastMessage
          ? { id: lastMessage.id, body: lastMessage.body, createdAt: lastMessage.createdAt, senderUserId: lastMessage.senderUserId }
          : null,
        unreadCount,
      };
    });

    const page = buildPage(enriched, limit, (item) => ({
      v: item.createdAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

// GET /trade/offers/:id — detail (creator or receiver only); includes counterOf, counters, lastMessage, unreadCount
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

    // Re-fetch with events, counterOf, counters, messages, readStates
    const result = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        counterOf: { select: { id: true, status: true, createdAt: true } },
        counters: { orderBy: { createdAt: "asc" }, select: { id: true, status: true, createdAt: true } },
        messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        readStates: { where: { userId } },
      },
    });
    if (!result)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);

    const counterOf = result.counterOf
      ? { id: result.counterOf.id, status: result.counterOf.status, createdAt: result.counterOf.createdAt }
      : null;
    const counters = result.counters.map((c) => ({ id: c.id, status: c.status, createdAt: c.createdAt }));
    const lastReadAt = result.readStates[0]?.lastReadAt ?? null;
    const unreadCount = result.messages.filter(
      (m) => m.senderUserId !== userId && (lastReadAt ? m.createdAt > lastReadAt : true),
    ).length;
    const lastMessage = result.messages[0]
      ? { id: result.messages[0].id, body: result.messages[0].body, createdAt: result.messages[0].createdAt, senderUserId: result.messages[0].senderUserId }
      : null;

    const { messages: _m, readStates: _r, counterOf: _co, counters: _cs, ...rest } = result;
    ok(res, {
      ...rest,
      counterOf,
      counters,
      lastMessage,
      unreadCount,
    });
  }),
);

// POST /trade/offers/:id/accept — receiver-only
router.post(
  "/trade/offers/:id/accept",
  requireAuth,
  requireNotBanned,
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

    // Cannot accept if a counter-offer exists (receiver already countered)
    const counterExists = await prisma.tradeOffer.findFirst({
      where: { counterOfOfferId: offerId },
    });
    if (counterExists) {
      throw new AppError(
        "OFFER_COUNTERED",
        "This offer has been countered; accept the counter-offer instead",
        409,
      );
    }

    const creatorItems = parseTradeItems(offer.creatorItemsJson);
    const receiverItems = parseTradeItems(offer.receiverItemsJson);
    const creatorUserId = offer.creatorUserId;
    const receiverUserId = offer.receiverUserId;

    // Atomic: validate collections, apply inventory updates, then status + event
    await prisma.$transaction(async (tx) => {
      // Re-check ban status inside transaction to close the race window
      await assertNotBannedInTx(tx, userId);

      for (const item of creatorItems) {
        const row = await tx.userCollection.findUnique({
          where: {
            userId_cardId_language_condition: {
              userId: creatorUserId,
              cardId: item.cardId,
              language: item.language,
              condition: item.condition,
            },
          },
        });
        if (!row || row.quantity < item.quantity) {
          throw new AppError(
            "INSUFFICIENT_QUANTITY",
            `Creator does not have enough of ${item.cardId} (${item.language}/${item.condition})`,
            409,
          );
        }
      }
      for (const item of receiverItems) {
        const row = await tx.userCollection.findUnique({
          where: {
            userId_cardId_language_condition: {
              userId: receiverUserId,
              cardId: item.cardId,
              language: item.language,
              condition: item.condition,
            },
          },
        });
        if (!row || row.quantity < item.quantity) {
          throw new AppError(
            "INSUFFICIENT_QUANTITY",
            `Receiver does not have enough of ${item.cardId} (${item.language}/${item.condition})`,
            409,
          );
        }
      }

      for (const item of creatorItems) {
        await applyTradeItemMove(
          tx as PrismaClient,
          creatorUserId,
          receiverUserId,
          item,
          "decrement",
        );
      }
      for (const item of receiverItems) {
        await applyTradeItemMove(
          tx as PrismaClient,
          receiverUserId,
          creatorUserId,
          item,
          "decrement",
        );
      }

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
      await createNotification(tx, {
        userId: offer.creatorUserId,
        type: NotificationType.TRADE_OFFER_ACCEPTED,
        title: "Offre d'échange acceptée",
        body: "Votre offre d'échange a été acceptée.",
        dataJson: { tradeOfferId: offerId },
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
  requireNotBanned,
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
      await createNotification(tx, {
        userId: offer.creatorUserId,
        type: NotificationType.TRADE_OFFER_REJECTED,
        title: "Offre d'échange refusée",
        body: "Votre offre d'échange a été refusée.",
        dataJson: { tradeOfferId: offerId },
      });
    });

    ok(res, { ok: true });
  }),
);

// POST /trade/offers/:id/counter — receiver-only. Creates new offer (creator = original receiver, receiver = original creator).
router.post(
  "/trade/offers/:id/counter",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const originalOfferId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    const body = counterOfferBodySchema.parse(req.body);

    const original = await prisma.tradeOffer.findUnique({
      where: { id: originalOfferId },
    });
    if (!original)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (original.receiverUserId !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Only the receiver of the original offer can counter",
        403,
      );
    }
    const afterExpiry = await markExpiredIfNeeded(original);
    if (afterExpiry.status !== TradeOfferStatus.PENDING) {
      throw new AppError(
        "INVALID_STATE",
        `Cannot counter (offer status: ${afterExpiry.status})`,
        409,
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + body.expiresInHours);

    const result = await prisma.$transaction(async (tx) => {
      const counterOffer = await tx.tradeOffer.create({
        data: {
          creatorUserId: original.receiverUserId,
          receiverUserId: original.creatorUserId,
          creatorItemsJson: body.creatorItemsJson as object,
          receiverItemsJson: body.receiverItemsJson as object,
          status: TradeOfferStatus.PENDING,
          expiresAt,
          counterOfOfferId: originalOfferId,
        },
      });
      await tx.tradeEvent.create({
        data: {
          tradeOfferId: counterOffer.id,
          type: TradeEventType.CREATED,
          actorUserId: userId,
          metadataJson: { source: "api", counterOffer: true },
        },
      });
      await tx.tradeEvent.create({
        data: {
          tradeOfferId: originalOfferId,
          type: TradeEventType.COUNTERED,
          actorUserId: userId,
          metadataJson: { source: "api", counterOfferId: counterOffer.id },
        },
      });
      await createNotification(tx, {
        userId: original.creatorUserId,
        type: NotificationType.TRADE_OFFER_COUNTERED,
        title: "Contre-offre reçue",
        body: "Votre offre d'échange a reçu une contre-proposition.",
        dataJson: { tradeOfferId: originalOfferId, counterOfferId: counterOffer.id },
      });
      return counterOffer;
    });

    ok(res, { tradeOfferId: result.id }, 201);
  }),
);

// POST /trade/offers/:id/cancel — creator-only
// Allowed from PENDING even if expired by time (explicit cancellation takes priority)
router.post(
  "/trade/offers/:id/cancel",
  requireAuth,
  requireNotBanned,
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
      await createNotification(tx, {
        userId: offer.receiverUserId,
        type: NotificationType.TRADE_OFFER_CANCELLED,
        title: "Offre d'échange annulée",
        body: "Une offre d'échange que vous avez reçue a été annulée.",
        dataJson: { tradeOfferId: offerId },
      });
    });

    ok(res, { ok: true });
  }),
);

// POST /trade/offers/:id/read — creator or receiver only; mark thread as read (PENDING or ACCEPTED only)
router.post(
  "/trade/offers/:id/read",
  requireAuth,
  requireNotBanned,
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
        "Only the creator or receiver can mark this offer as read",
        403,
      );
    }

    const afterExpiry = await markExpiredIfNeeded(offer);
    if (afterExpiry.status === TradeOfferStatus.EXPIRED) {
      throw new AppError("OFFER_EXPIRED", "Trade offer has expired", 409);
    }
    if (
      afterExpiry.status === TradeOfferStatus.REJECTED ||
      afterExpiry.status === TradeOfferStatus.CANCELLED
    ) {
      throw new AppError(
        "INVALID_STATE",
        `Cannot mark as read (offer status: ${afterExpiry.status})`,
        409,
      );
    }

    const latestInThread = await prisma.tradeMessage.findFirst({
      where: { tradeOfferId: offerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    const lastReadAt = latestInThread?.createdAt ?? new Date();

    await prisma.tradeReadState.upsert({
      where: {
        tradeOfferId_userId: { tradeOfferId: offerId, userId },
      },
      create: {
        tradeOfferId: offerId,
        userId,
        lastReadAt,
      },
      update: { lastReadAt, updatedAt: new Date() },
    });

    ok(res, { ok: true });
  }),
);

// POST /trade/offers/:id/messages — creator or receiver only; offer must be PENDING or ACCEPTED
router.post(
  "/trade/offers/:id/messages",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const offerId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    const body = postMessageBodySchema.parse(req.body ?? {});

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (offer.creatorUserId !== userId && offer.receiverUserId !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Only the creator or receiver can send messages on this offer",
        403,
      );
    }

    const afterExpiry = await markExpiredIfNeeded(offer);
    if (afterExpiry.status === TradeOfferStatus.EXPIRED) {
      throw new AppError("OFFER_EXPIRED", "Trade offer has expired", 409);
    }
    if (
      afterExpiry.status === TradeOfferStatus.REJECTED ||
      afterExpiry.status === TradeOfferStatus.CANCELLED
    ) {
      throw new AppError(
        "INVALID_STATE",
        `Cannot send messages (offer status: ${afterExpiry.status})`,
        409,
      );
    }

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.tradeMessage.create({
        data: {
          tradeOfferId: offerId,
          senderUserId: userId,
          body: body.body,
        },
      });
      await tx.tradeReadState.upsert({
        where: {
          tradeOfferId_userId: { tradeOfferId: offerId, userId },
        },
        create: {
          tradeOfferId: offerId,
          userId,
          lastReadAt: msg.createdAt,
        },
        update: { lastReadAt: msg.createdAt, updatedAt: new Date() },
      });
      // Notify the other participant
      const recipientUserId =
        offer.creatorUserId === userId ? offer.receiverUserId : offer.creatorUserId;
      await createNotification(tx, {
        userId: recipientUserId,
        type: NotificationType.TRADE_MESSAGE_RECEIVED,
        title: "Nouveau message",
        body: `Nouveau message dans votre échange : "${body.body.slice(0, 80)}${body.body.length > 80 ? "…" : ""}"`,
        dataJson: { tradeOfferId: offerId, messageId: msg.id },
      });
      return msg;
    });

    ok(res, { message }, 201);
  }),
);

// GET /trade/offers/:id/messages — creator or receiver only; cursor pagination, sort by createdAt asc, id asc
router.get(
  "/trade/offers/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const offerId = req.params.id;
    const userId = (req as RequestWithUser).user.userId;
    const query = messagesQuerySchema.parse(req.query);
    const { cursor, limit } = query;

    const offer = await prisma.tradeOffer.findUnique({
      where: { id: offerId },
    });
    if (!offer)
      throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (offer.creatorUserId !== userId && offer.receiverUserId !== userId) {
      throw new AppError(
        "FORBIDDEN",
        "Only the creator or receiver can read messages on this offer",
        403,
      );
    }

    const afterExpiry = await markExpiredIfNeeded(offer);
    if (afterExpiry.status === TradeOfferStatus.EXPIRED) {
      throw new AppError("OFFER_EXPIRED", "Trade offer has expired", 409);
    }
    if (
      afterExpiry.status === TradeOfferStatus.REJECTED ||
      afterExpiry.status === TradeOfferStatus.CANCELLED
    ) {
      throw new AppError(
        "INVALID_STATE",
        `Cannot read messages (offer status: ${afterExpiry.status})`,
        409,
      );
    }

    const where: Prisma.TradeMessageWhereInput = { tradeOfferId: offerId };
    if (cursor) {
      const c = decodeCursor(cursor);
      const cursorDate = new Date(c.createdAt as string);
      const cursorId = c.id as string;
      where.OR = [
        { createdAt: { gt: cursorDate } },
        { createdAt: cursorDate, id: { gt: cursorId } },
      ];
    }

    const items = await prisma.tradeMessage.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit + 1,
    });

    const latestInThread = await prisma.tradeMessage.findFirst({
      where: { tradeOfferId: offerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    const lastReadAt = latestInThread?.createdAt ?? new Date();
    await prisma.tradeReadState.upsert({
      where: {
        tradeOfferId_userId: { tradeOfferId: offerId, userId },
      },
      create: {
        tradeOfferId: offerId,
        userId,
        lastReadAt,
      },
      update: { lastReadAt, updatedAt: new Date() },
    });

    const page = buildPage(items, limit, (item) => ({
      createdAt: item.createdAt.toISOString(),
      id: item.id,
    }));

    ok(res, page);
  }),
);

export const tradeRoutes = router;
