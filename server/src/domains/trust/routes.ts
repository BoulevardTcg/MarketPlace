import { Router } from "express";
import { z } from "zod";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { requireNotBanned } from "../../shared/auth/requireNotBanned.js";
import { requireRole } from "../../shared/auth/requireRole.js";
import { ok, AppError } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { prisma } from "../../shared/db/prisma.js";
import {
  paginationQuerySchema,
  decodeCursor,
  buildPage,
} from "../../shared/http/pagination.js";

const router = Router();

// In-memory rate limit: 5 reports per hour per user (dev-only; use Redis in production)
const REPORT_RATE_WINDOW_MS = 60 * 60 * 1000;
const REPORT_RATE_MAX_PER_HOUR = 5;
const reportTimestampsByUser = new Map<string, number[]>();

export function clearReportRateLimitForTests(): void {
  reportTimestampsByUser.clear();
}

function checkReportRateLimit(userId: string): void {
  const now = Date.now();
  const timestamps = reportTimestampsByUser.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < REPORT_RATE_WINDOW_MS);
  if (recent.length >= REPORT_RATE_MAX_PER_HOUR) {
    throw new AppError("RATE_LIMITED", "Too many reports; try again later", 429);
  }
  reportTimestampsByUser.set(userId, recent);
}

function recordReportCreated(userId: string): void {
  const now = Date.now();
  const timestamps = reportTimestampsByUser.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < REPORT_RATE_WINDOW_MS);
  recent.push(now);
  reportTimestampsByUser.set(userId, recent);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createReportSchema = z.object({
  reason: z.string().min(1).max(200),
  details: z.string().max(2000).optional(),
});

const patchReportSchema = z.object({
  status: z.enum(["RESOLVED", "REJECTED"]),
});

const adminReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(["OPEN", "RESOLVED", "REJECTED"]).optional(),
});

const createModerationActionSchema = z.object({
  targetType: z.enum(["LISTING", "USER", "TRADE"]),
  targetId: z.string().min(1),
  actionType: z.enum(["HIDE", "UNHIDE", "WARN", "BAN", "UNBAN", "NOTE"]),
  note: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// Reports (auth)
// ---------------------------------------------------------------------------

/** POST /reports/listings/:id — report a listing */
router.post(
  "/reports/listings/:id",
  requireAuth,
  requireNotBanned,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const listingId = req.params.id;
    const body = createReportSchema.parse(req.body);

    checkReportRateLimit(userId);

    // Listing must exist
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, userId: true },
    });
    if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);

    // Cannot report own listing
    if (listing.userId === userId) {
      throw new AppError("FORBIDDEN", "Cannot report your own listing", 403);
    }

    // Race-safe: rely on partial unique index ListingReport_open_unique
    // (listingId, reporterUserId) WHERE status = 'OPEN'
    try {
      const report = await prisma.listingReport.create({
        data: {
          listingId,
          reporterUserId: userId,
          reason: body.reason,
          details: body.details,
          status: "OPEN",
        },
      });
      recordReportCreated(userId);
      ok(res, { reportId: report.id, report }, 201);
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002") {
        throw new AppError("ALREADY_REPORTED", "You already have an open report for this listing", 409);
      }
      throw err;
    }
  }),
);

/** GET /reports/me — list my reports, cursor pagination */
router.get(
  "/reports/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const { cursor, limit } = paginationQuerySchema.parse(req.query);

    const cursorFilter = cursor
      ? (() => {
          const c = decodeCursor(cursor) as { createdAt: string; id: string };
          return {
            OR: [
              { createdAt: { lt: new Date(c.createdAt) } },
              { createdAt: new Date(c.createdAt), id: { lt: c.id } },
            ],
          };
        })()
      : {};

    const reports = await prisma.listingReport.findMany({
      where: { reporterUserId: userId, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = buildPage(reports, limit, (r) => ({
      createdAt: r.createdAt.toISOString(),
      id: r.id,
    }));

    ok(res, page);
  }),
);

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

/** GET /admin/reports/listings — list reports (admin), optional status filter */
router.get(
  "/admin/reports/listings",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { cursor, limit, status } = adminReportsQuerySchema.parse(req.query);

    const statusFilter = status ? { status } : {};

    const cursorFilter = cursor
      ? (() => {
          const c = decodeCursor(cursor) as { createdAt: string; id: string };
          return {
            OR: [
              { createdAt: { lt: new Date(c.createdAt) } },
              { createdAt: new Date(c.createdAt), id: { lt: c.id } },
            ],
          };
        })()
      : {};

    const reports = await prisma.listingReport.findMany({
      where: { ...statusFilter, ...cursorFilter },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        listingId: true,
        reporterUserId: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const page = buildPage(reports, limit, (r) => ({
      createdAt: r.createdAt.toISOString(),
      id: r.id,
    }));

    ok(res, page);
  }),
);

/** GET /admin/reports/listings/:id — report detail (ADMIN only) */
router.get(
  "/admin/reports/listings/:id",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const reportId = req.params.id;
    const report = await prisma.listingReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        listingId: true,
        reporterUserId: true,
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!report) throw new AppError("NOT_FOUND", "Report not found", 404);
    ok(res, report);
  }),
);

/** PATCH /admin/reports/:id — update report status (atomic: only OPEN) */
router.patch(
  "/admin/reports/:id",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const body = patchReportSchema.parse(req.body);

    // Atomic: only update if currently OPEN
    const { count } = await prisma.listingReport.updateMany({
      where: { id, status: "OPEN" },
      data: { status: body.status, updatedAt: new Date() },
    });
    if (count === 0) {
      const exists = await prisma.listingReport.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!exists) throw new AppError("NOT_FOUND", "Report not found", 404);
      throw new AppError("REPORT_NOT_OPEN", `Report is not open (status: ${exists.status})`, 409);
    }

    const updated = await prisma.listingReport.findUnique({ where: { id } });
    ok(res, updated);
  }),
);

/** POST /admin/moderation/actions — create moderation action + enforce side-effects */
router.post(
  "/admin/moderation/actions",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const actorUserId = (req as RequestWithUser).user.userId;
    const body = createModerationActionSchema.parse(req.body);

    // USER: HIDE/UNHIDE not allowed (only LISTING supports hide/unhide)
    if (body.targetType === "USER" && (body.actionType === "HIDE" || body.actionType === "UNHIDE")) {
      throw new AppError("INVALID_ACTION", "Only LISTING supports hide/unhide", 400);
    }
    // TRADE: HIDE/UNHIDE not allowed
    if (body.targetType === "TRADE" && (body.actionType === "HIDE" || body.actionType === "UNHIDE")) {
      throw new AppError("INVALID_ACTION", "TRADE target does not support hide/unhide", 400);
    }
    // UNBAN only valid for USER targets
    if (body.actionType === "UNBAN" && body.targetType !== "USER") {
      throw new AppError("INVALID_ACTION", "UNBAN is only valid for USER targets", 400);
    }

    // LISTING: HIDE/UNHIDE — toggle isHidden
    if (body.targetType === "LISTING" && (body.actionType === "HIDE" || body.actionType === "UNHIDE")) {
      const listing = await prisma.listing.findUnique({
        where: { id: body.targetId },
        select: { id: true },
      });
      if (!listing) throw new AppError("NOT_FOUND", "Listing not found", 404);
      await prisma.listing.update({
        where: { id: body.targetId },
        data: { isHidden: body.actionType === "HIDE" },
      });
    }

    // USER: BAN — set UserModerationState.isBanned, bannedAt, banReason
    if (body.targetType === "USER" && body.actionType === "BAN") {
      const now = new Date();
      await prisma.userModerationState.upsert({
        where: { userId: body.targetId },
        create: {
          userId: body.targetId,
          isBanned: true,
          banReason: body.note ?? null,
          bannedAt: now,
        },
        update: {
          isBanned: true,
          banReason: body.note ?? null,
          bannedAt: now,
          updatedAt: now,
        },
      });
    }

    // USER: UNBAN — clear isBanned, banReason, bannedAt
    if (body.targetType === "USER" && body.actionType === "UNBAN") {
      const existing = await prisma.userModerationState.findUnique({
        where: { userId: body.targetId },
      });
      if (existing) {
        await prisma.userModerationState.update({
          where: { userId: body.targetId },
          data: {
            isBanned: false,
            banReason: null,
            bannedAt: null,
            updatedAt: new Date(),
          },
        });
      }
    }

    // USER: WARN — increment warnCount, lastWarnAt
    if (body.targetType === "USER" && body.actionType === "WARN") {
      const now = new Date();
      const existing = await prisma.userModerationState.findUnique({
        where: { userId: body.targetId },
      });
      if (existing) {
        await prisma.userModerationState.update({
          where: { userId: body.targetId },
          data: {
            warnCount: existing.warnCount + 1,
            lastWarnAt: now,
            updatedAt: now,
          },
        });
      } else {
        await prisma.userModerationState.create({
          data: {
            userId: body.targetId,
            warnCount: 1,
            lastWarnAt: now,
          },
        });
      }
    }

    // USER + NOTE, TRADE + NOTE/WARN/BAN: no state change (ModerationAction only)

    const action = await prisma.moderationAction.create({
      data: {
        targetType: body.targetType,
        targetId: body.targetId,
        actionType: body.actionType,
        note: body.note,
        actorUserId,
      },
    });

    ok(res, { action }, 201);
  }),
);

// ---------------------------------------------------------------------------
// Reputation (public + admin)
// ---------------------------------------------------------------------------

/** GET /users/:id/reputation — public reputation */
router.get(
  "/users/:id/reputation",
  asyncHandler(async (req, res) => {
    const userId = req.params.id;

    const reputation = await prisma.sellerReputation.findUnique({
      where: { userId },
      select: {
        score: true,
        totalSales: true,
        totalTrades: true,
        disputesCount: true,
        reportsCount: true,
        updatedAt: true,
      },
    });

    if (!reputation) {
      // Return zeroed-out shape even if no record exists
      ok(res, {
        score: 0,
        totalSales: 0,
        totalTrades: 0,
        disputesCount: 0,
        reportsCount: 0,
        updatedAt: null,
      });
      return;
    }

    ok(res, reputation);
  }),
);

/** POST /internal/reputation/recompute — recompute reputation from existing data (admin) */
router.post(
  "/internal/reputation/recompute",
  requireAuth,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const targetUserId = z.object({ userId: z.string().min(1) }).parse(req.body).userId;

    // Count SOLD listings
    const totalSales = await prisma.listing.count({
      where: { userId: targetUserId, status: "SOLD" },
    });

    // Count ACCEPTED trades (as creator or receiver)
    const totalTrades = await prisma.tradeOffer.count({
      where: {
        status: "ACCEPTED",
        OR: [
          { creatorUserId: targetUserId },
          { receiverUserId: targetUserId },
        ],
      },
    });

    // Count OPEN reports against this user's listings
    const reportsCount = await prisma.listingReport.count({
      where: {
        listing: { userId: targetUserId },
        status: "OPEN",
      },
    });

    // Simple score: sales + trades - (reports * 2)
    const score = totalSales + totalTrades - reportsCount * 2;

    const reputation = await prisma.sellerReputation.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        score,
        totalSales,
        totalTrades,
        disputesCount: 0,
        reportsCount,
      },
      update: {
        score,
        totalSales,
        totalTrades,
        reportsCount,
      },
    });

    ok(res, reputation);
  }),
);

export const trustRoutes = router;
