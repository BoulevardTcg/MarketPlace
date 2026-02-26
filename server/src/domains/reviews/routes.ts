import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { requireNotBanned } from "../../shared/auth/requireNotBanned.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { paginationQuerySchema, decodeCursor, buildPage } from "../../shared/http/pagination.js";

const router = Router();

const createReviewBodySchema = z
  .object({
    sellerUserId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
    listingId: z.string().optional(),
    tradeOfferId: z.string().optional(),
  })
  .refine((d) => d.listingId || d.tradeOfferId, {
    message: "Either listingId or tradeOfferId must be provided",
  })
  .refine((d) => !(d.listingId && d.tradeOfferId), {
    message: "Provide listingId OR tradeOfferId, not both",
  });

// POST /reviews — create a review after a completed transaction
router.post(
  "/reviews",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const reviewerUserId = (req as RequestWithUser).user.userId;
    const body = createReviewBodySchema.parse(req.body ?? {});

    if (reviewerUserId === body.sellerUserId) {
      throw new AppError("FORBIDDEN", "Cannot review yourself", 403);
    }

    // Validate the transaction context
    if (body.listingId) {
      const order = await prisma.purchaseOrder.findFirst({
        where: {
          listingId: body.listingId,
          buyerUserId: reviewerUserId,
          status: "COMPLETED",
        },
      });
      if (!order) {
        throw new AppError(
          "FORBIDDEN",
          "You can only review after completing a purchase",
          403,
        );
      }
      // Verify the seller matches
      const listing = await prisma.listing.findUnique({
        where: { id: body.listingId },
        select: { userId: true },
      });
      if (!listing || listing.userId !== body.sellerUserId) {
        throw new AppError("INVALID_REQUEST", "Seller ID does not match the listing seller", 400);
      }
    } else if (body.tradeOfferId) {
      const trade = await prisma.tradeOffer.findUnique({ where: { id: body.tradeOfferId } });
      if (!trade) throw new AppError("NOT_FOUND", "Trade offer not found", 404);
      if (trade.status !== "ACCEPTED") {
        throw new AppError("FORBIDDEN", "You can only review after an accepted trade", 403);
      }
      if (trade.creatorUserId !== reviewerUserId && trade.receiverUserId !== reviewerUserId) {
        throw new AppError("FORBIDDEN", "You are not a participant in this trade", 403);
      }
      // The seller is the other participant
      const expectedSeller =
        trade.creatorUserId === reviewerUserId ? trade.receiverUserId : trade.creatorUserId;
      if (expectedSeller !== body.sellerUserId) {
        throw new AppError("INVALID_REQUEST", "Seller ID does not match the trade participant", 400);
      }
    }

    try {
      const review = await prisma.$transaction(async (tx) => {
        const newReview = await tx.sellerReview.create({
          data: {
            reviewerUserId,
            sellerUserId: body.sellerUserId,
            rating: body.rating,
            comment: body.comment ?? null,
            listingId: body.listingId ?? null,
            tradeOfferId: body.tradeOfferId ?? null,
          },
        });

        // Upsert SellerReputation — update running average
        const existing = await tx.sellerReputation.findUnique({
          where: { userId: body.sellerUserId },
        });
        if (existing) {
          const newRatingSum = existing.ratingSum + body.rating;
          const newRatingCount = existing.ratingCount + 1;
          await tx.sellerReputation.update({
            where: { userId: body.sellerUserId },
            data: {
              ratingSum: newRatingSum,
              ratingCount: newRatingCount,
              // Score formula: totalSales + totalTrades - reportsCount * 2 + bonus for avg rating
              score:
                existing.totalSales +
                existing.totalTrades -
                existing.reportsCount * 2 +
                Math.round((newRatingSum / newRatingCount) * 10),
            },
          });
        } else {
          await tx.sellerReputation.create({
            data: {
              userId: body.sellerUserId,
              ratingSum: body.rating,
              ratingCount: 1,
              score: Math.round(body.rating * 10),
            },
          });
        }

        return newReview;
      });

      ok(res, { reviewId: review.id }, 201);
    } catch (e: unknown) {
      // P2002 = unique constraint violation → already reviewed
      if (
        e instanceof Error &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        throw new AppError("ALREADY_REVIEWED", "You have already reviewed this transaction", 409);
      }
      throw e;
    }
  }),
);

// GET /users/:id/reviews — list reviews for a seller (paginated, public)
router.get(
  "/users/:id/reviews",
  asyncHandler(async (req, res) => {
    const sellerUserId = req.params.id;
    const query = paginationQuerySchema.parse(req.query);
    const { cursor, limit } = query;

    const where: Prisma.SellerReviewWhereInput = { sellerUserId };
    if (cursor) {
      const c = decodeCursor(cursor);
      where.AND = {
        OR: [
          { createdAt: { lt: new Date(c.v as string) } },
          { createdAt: new Date(c.v as string), id: { lt: c.id as string } },
        ],
      };
    }

    const items = await prisma.sellerReview.findMany({
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

// GET /users/:id/reviews/summary — avg rating + count breakdown
router.get(
  "/users/:id/reviews/summary",
  asyncHandler(async (req, res) => {
    const sellerUserId = req.params.id;

    const rep = await prisma.sellerReputation.findUnique({ where: { userId: sellerUserId } });
    const avgRating =
      rep && rep.ratingCount > 0
        ? Math.round((rep.ratingSum / rep.ratingCount) * 10) / 10
        : null;

    // Breakdown by star rating (1-5)
    const breakdownRows = await prisma.sellerReview.groupBy({
      by: ["rating"],
      where: { sellerUserId },
      _count: { rating: true },
    });

    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of breakdownRows) {
      breakdown[row.rating] = row._count.rating;
    }

    ok(res, {
      avgRating,
      totalCount: rep?.ratingCount ?? 0,
      breakdown,
    });
  }),
);

export const reviewsRoutes = router;
