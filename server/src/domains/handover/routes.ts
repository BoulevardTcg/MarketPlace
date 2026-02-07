import { Router } from "express";
import { z } from "zod";
import { HandoverStatus } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { requireRole } from "../../shared/auth/requireRole.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";

const router = Router();

/** XOR: exactly one of listingId or tradeOfferId (reject both null / both non-null). */
const createHandoverSchema = z
  .object({
    listingId: z.string().min(1).optional(),
    tradeOfferId: z.string().min(1).optional(),
  })
  .refine(
    (data) => {
      const hasListing = Boolean(data.listingId);
      const hasTrade = Boolean(data.tradeOfferId);
      return hasListing !== hasTrade;
    },
    { message: "Provide exactly one of listingId or tradeOfferId (XOR)" },
  );

const patchHandoverSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
});

/** POST /handovers — create handover request (auth). User must own the listing or be creator/receiver of the trade. */
router.post(
  "/handovers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const body = createHandoverSchema.parse(req.body);

    if (body.listingId) {
      const listing = await prisma.listing.findUnique({
        where: { id: body.listingId },
      });
      if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
      if (listing.userId !== userId) throw new AppError("FORBIDDEN", "Not the listing owner", 403);
      const existing = await prisma.handover.findFirst({
        where: { listingId: body.listingId, status: "PENDING_VERIFICATION" },
      });
      if (existing) throw new AppError("CONFLICT", "A pending handover already exists for this listing", 409);
      const handover = await prisma.handover.create({
        data: {
          listingId: body.listingId,
          requestedByUserId: userId,
          status: "PENDING_VERIFICATION",
        },
      });
      return ok(res, { handoverId: handover.id, handover }, 201);
    }

    const tradeOfferId = body.tradeOfferId!;
    const trade = await prisma.tradeOffer.findUnique({
      where: { id: tradeOfferId },
    });
    if (!trade) throw new AppError("NOT_FOUND", "Trade offer not found", 404);
    if (trade.creatorUserId !== userId && trade.receiverUserId !== userId) {
      throw new AppError("FORBIDDEN", "Not a party of this trade", 403);
    }
    const existing = await prisma.handover.findFirst({
      where: { tradeOfferId, status: "PENDING_VERIFICATION" },
    });
    if (existing) throw new AppError("CONFLICT", "A pending handover already exists for this trade", 409);
    const handover = await prisma.handover.create({
      data: {
        tradeOfferId,
        requestedByUserId: userId,
        status: "PENDING_VERIFICATION",
      },
    });
    return ok(res, { handoverId: handover.id, handover }, 201);
  }),
);

/** PATCH /handovers/:id — update status (admin only). Atomic: updateMany(where id + PENDING_VERIFICATION) + count check => 409 if 0. */
router.patch(
  "/handovers/:id",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const id = req.params.id;
    const body = patchHandoverSchema.parse(req.body);

    const { count } = await prisma.handover.updateMany({
      where: { id, status: "PENDING_VERIFICATION" },
      data: {
        status: body.status as HandoverStatus,
        verifiedByUserId: userId,
        updatedAt: new Date(),
      },
    });
    if (count === 0) {
      const exists = await prisma.handover.findUnique({ where: { id } });
      if (!exists) throw new AppError("NOT_FOUND", "Handover not found", 404);
      throw new AppError("CONFLICT", "Handover already verified or rejected", 409);
    }
    const updated = await prisma.handover.findUnique({ where: { id } });
    ok(res, updated!);
  }),
);

/** GET /handovers — list handovers (auth). ?mine=1 (default) → only requested by current user. */
router.get(
  "/handovers",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const mine = req.query.mine !== "0" && req.query.mine !== "false";
    const items = await prisma.handover.findMany({
      where: mine ? { requestedByUserId: userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    ok(res, { items });
  }),
);

export const handoverRoutes = router;
