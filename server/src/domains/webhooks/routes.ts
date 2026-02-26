import { Router } from "express";
import { z } from "zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ListingStatus, ListingEventType, NotificationType } from "@prisma/client";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import { createNotification } from "../../shared/notifications/createNotification.js";
import { assertNotBannedInTx } from "../../shared/auth/requireNotBanned.js";

const router = Router();

const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

const webhookPayloadSchema = z.object({
  eventId: z.string().min(1),
  listingId: z.string().min(1),
  orderId: z.string().min(1),
  status: z.enum(["paid", "failed"]),
  externalRef: z.string().optional(),
  timestamp: z.number().int(), // Unix milliseconds
});

function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): void {
  if (!env.WEBHOOK_SECRET) {
    throw new AppError("SERVICE_UNAVAILABLE", "Webhook secret not configured", 503);
  }
  if (!signatureHeader) {
    throw new AppError("UNAUTHORIZED", "Missing X-Webhook-Signature header", 401);
  }
  // Expected format: "sha256=<hex>"
  const expected = "sha256=" + createHmac("sha256", env.WEBHOOK_SECRET).update(rawBody).digest("hex");
  const actual = signatureHeader;

  // Use timingSafeEqual to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(actual, "utf8");
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new AppError("UNAUTHORIZED", "Invalid webhook signature", 401);
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("UNAUTHORIZED", "Invalid webhook signature", 401);
  }
}

// POST /webhooks/payment — payment confirmation from Shop service
// Uses express.raw() middleware (mounted in app.ts before express.json())
router.post(
  "/webhooks/payment",
  asyncHandler(async (req, res) => {
    // Raw body is available because this route uses express.raw() in app.ts
    const rawBody = req.body as Buffer;
    const signature = req.headers["x-webhook-signature"] as string | undefined;

    verifyWebhookSignature(rawBody, signature);

    // Parse JSON payload from raw body
    let payload: z.infer<typeof webhookPayloadSchema>;
    try {
      payload = webhookPayloadSchema.parse(JSON.parse(rawBody.toString("utf8")));
    } catch {
      throw new AppError("VALIDATION_ERROR", "Invalid webhook payload", 400);
    }

    // Reject stale webhooks (> 5 min old)
    const now = Date.now();
    if (Math.abs(now - payload.timestamp) > WEBHOOK_MAX_AGE_MS) {
      throw new AppError("INVALID_REQUEST", "Webhook timestamp is too old or too far in the future", 400);
    }

    const { eventId, listingId, orderId, status, externalRef } = payload;

    // Idempotency: check if event already processed
    const existing = await prisma.purchaseOrder.findFirst({
      where: { webhookEventId: eventId },
    });
    if (existing) {
      // Already processed — return 200 to prevent Shop from retrying
      return ok(res, { ok: true, skipped: true });
    }

    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError("NOT_FOUND", "Purchase order not found", 404);
    }
    if (order.listingId !== listingId) {
      throw new AppError("INVALID_REQUEST", "Order/listing mismatch", 400);
    }

    if (status === "paid") {
      if (order.status !== "PENDING") {
        // Already completed or failed — idempotent, return ok
        return ok(res, { ok: true, skipped: true });
      }

      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);

      const nowDate = new Date();

      await prisma.$transaction(async (tx) => {
        // Mark order as completed with idempotency key
        await tx.purchaseOrder.update({
          where: { id: orderId },
          data: {
            status: "COMPLETED",
            externalRef: externalRef ?? null,
            webhookEventId: eventId,
          },
        });

        // Mark listing as SOLD (atomic, with status guard)
        const { count } = await tx.listing.updateMany({
          where: { id: listingId, status: ListingStatus.PUBLISHED },
          data: { status: ListingStatus.SOLD, soldAt: nowDate },
        });
        if (count === 0) {
          // Listing already sold — still complete the order but don't error
        } else {
          await tx.listingEvent.create({
            data: {
              listingId,
              type: ListingEventType.SOLD,
              actorUserId: order.buyerUserId,
              metadataJson: { source: "webhook", orderId, eventId },
            },
          });

          // Decrement seller inventory if card is tracked
          if (listing.cardId) {
            const { count: invCount } = await tx.userCollection.updateMany({
              where: {
                userId: listing.userId,
                cardId: listing.cardId,
                language: listing.language,
                condition: listing.condition,
                quantity: { gte: listing.quantity },
              },
              data: { quantity: { decrement: listing.quantity } },
            });
            if (invCount > 0) {
              await tx.userCollection.deleteMany({
                where: {
                  userId: listing.userId,
                  cardId: listing.cardId,
                  language: listing.language,
                  condition: listing.condition,
                  quantity: { lte: 0 },
                },
              });
            }
          }
        }

        // Notify buyer
        await createNotification(tx, {
          userId: order.buyerUserId,
          type: NotificationType.PURCHASE_ORDER_COMPLETED,
          title: "Achat confirmé",
          body: `Votre achat de "${listing.title}" a été confirmé. Le vendeur va vous contacter pour l'envoi.`,
          dataJson: { orderId, listingId, listingTitle: listing.title },
        });

        // Notify seller
        await createNotification(tx, {
          userId: listing.userId,
          type: NotificationType.LISTING_SOLD,
          title: "Annonce vendue",
          body: `Votre annonce "${listing.title}" a été vendue.`,
          dataJson: { orderId, listingId, listingTitle: listing.title, buyerUserId: order.buyerUserId },
        });
      });
    } else {
      // status === "failed"
      await prisma.purchaseOrder.update({
        where: { id: orderId },
        data: { status: "FAILED", webhookEventId: eventId },
      });

      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        select: { title: true },
      });

      await createNotification(prisma, {
        userId: order.buyerUserId,
        type: NotificationType.PURCHASE_ORDER_CANCELLED,
        title: "Paiement échoué",
        body: `Le paiement pour "${listing?.title ?? "l'annonce"}" a échoué. Votre commande a été annulée.`,
        dataJson: { orderId, listingId },
      });
    }

    ok(res, { ok: true });
  }),
);

export const webhooksRoutes = router;
