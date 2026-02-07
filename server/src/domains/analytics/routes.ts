import { Router } from "express";
import { z } from "zod";
import { Language, ListingStatus } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { paginationQuerySchema, decodeCursor, buildPage } from "../../shared/http/pagination.js";
import type { Prisma } from "@prisma/client";

const router = Router();

function parseRange(range: string): number {
  const n = parseInt(range.replace("d", ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : 30;
}

function getDaysInRange(rangeDays: number): Date[] {
  const days: Date[] = [];
  const today = toDateOnly(new Date());
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d);
  }
  return days;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function toDateOnly(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// GET /analytics/cards/:cardId/asked-price?language=FR&range=30d
// Série temporelle (jours en UTC minuit) + stats. Lazy snapshot : si absent pour le jour,
// calcul depuis listings PUBLISHED puis upsert (contrainte unique cardId+language+day évite les doublons en concurrence).
router.get(
  "/analytics/cards/:cardId/asked-price",
  asyncHandler(async (req, res) => {
    const cardId = req.params.cardId;
    const query = z
      .object({
        language: z.nativeEnum(Language),
        range: z.string().default("30d"),
      })
      .parse(req.query);

    const rangeDays = parseRange(query.range);
    const language = query.language;
    const daysInRange = getDaysInRange(rangeDays);
    const today = toDateOnly(new Date());

    // Load existing snapshots for (cardId, language) in range
    const startDay = daysInRange[0]!;
    const endDay = daysInRange[daysInRange.length - 1]!;

    const existing = await prisma.priceSnapshot.findMany({
      where: {
        cardId,
        language,
        day: { gte: startDay, lte: endDay },
      },
      orderBy: { day: "asc" },
    });

    const byDay = new Map<string, { medianPriceCents: number; minPriceCents: number; maxPriceCents: number; volume: number }>();
    for (const s of existing) {
      const key = s.day.toISOString().slice(0, 10);
      byDay.set(key, {
        medianPriceCents: s.medianPriceCents,
        minPriceCents: s.minPriceCents,
        maxPriceCents: s.maxPriceCents,
        volume: s.volume,
      });
    }

    // Lazy snapshot for today if missing
    const todayKey = today.toISOString().slice(0, 10);
    if (!byDay.has(todayKey)) {
      const listings = await prisma.listing.findMany({
        where: {
          status: ListingStatus.PUBLISHED,
          cardId,
          language,
        },
        select: { priceCents: true },
      });
      const prices = listings.map((l) => l.priceCents);
      const volume = listings.reduce((acc, l) => acc + 1, 0);
      const minPriceCents = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPriceCents = prices.length > 0 ? Math.max(...prices) : 0;
      const medianPriceCents = median(prices);

      await prisma.priceSnapshot.upsert({
        where: {
          cardId_language_day: { cardId, language, day: today },
        },
        create: {
          cardId,
          language,
          day: today,
          medianPriceCents,
          minPriceCents,
          maxPriceCents,
          volume,
        },
        update: {
          medianPriceCents,
          minPriceCents,
          maxPriceCents,
          volume,
        },
      });
      byDay.set(todayKey, {
        medianPriceCents,
        minPriceCents,
        maxPriceCents,
        volume,
      });
    }

    const series = daysInRange.map((day) => {
      const key = day.toISOString().slice(0, 10);
      const point = byDay.get(key);
      return {
        day: key,
        medianPriceCents: point?.medianPriceCents ?? null,
        minPriceCents: point?.minPriceCents ?? null,
        maxPriceCents: point?.maxPriceCents ?? null,
        volume: point?.volume ?? null,
      };
    });

    const allMedians = [...byDay.values()].map((p) => p.medianPriceCents).filter((v) => v > 0);
    const allMins = [...byDay.values()].map((p) => p.minPriceCents).filter((v) => v > 0);
    const allMaxs = [...byDay.values()].map((p) => p.maxPriceCents);
    const totalVolume = [...byDay.values()].reduce((acc, p) => acc + p.volume, 0);

    ok(res, {
      cardId,
      language,
      range: query.range,
      series,
      stats: {
        minPriceCents: allMins.length > 0 ? Math.min(...allMins) : null,
        medianPriceCents: allMedians.length > 0 ? median(allMedians) : null,
        maxPriceCents: allMaxs.length > 0 ? Math.max(...allMaxs) : null,
        totalVolume,
      },
    });
  }),
);

// ─── Price Alerts (stop-loss) — TODO: job/cron to check threshold vs PriceSnapshot ───

const createAlertSchema = z.object({
  cardId: z.string().min(1),
  language: z.nativeEnum(Language),
  thresholdCents: z.number().int().min(0),
  direction: z.enum(["DROP", "RISE"]),
});

const updateAlertSchema = z.object({
  active: z.boolean().optional(),
  thresholdCents: z.number().int().min(0).optional(),
});

router.post(
  "/alerts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const body = createAlertSchema.parse(req.body);
    const alert = await prisma.priceAlert.create({
      data: {
        userId,
        cardId: body.cardId,
        language: body.language,
        thresholdCents: body.thresholdCents,
        direction: body.direction as "DROP" | "RISE",
      },
    });
    ok(res, alert, 201);
  }),
);

router.get(
  "/alerts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = paginationQuerySchema.parse(req.query);
    const { cursor, limit } = query;
    const where: Prisma.PriceAlertWhereInput = { userId };
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
    const items = await prisma.priceAlert.findMany({
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

router.get(
  "/alerts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const id = req.params.id;
    const alert = await prisma.priceAlert.findUnique({ where: { id } });
    if (!alert) throw new AppError("NOT_FOUND", "Alert not found", 404);
    if (alert.userId !== userId) throw new AppError("FORBIDDEN", "Not allowed to view this alert", 403);
    ok(res, alert);
  }),
);

router.patch(
  "/alerts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const id = req.params.id;
    const body = updateAlertSchema.parse(req.body);
    const alert = await prisma.priceAlert.findUnique({ where: { id } });
    if (!alert) throw new AppError("NOT_FOUND", "Alert not found", 404);
    if (alert.userId !== userId) throw new AppError("FORBIDDEN", "Not allowed to update this alert", 403);
    const updated = await prisma.priceAlert.update({
      where: { id },
      data: {
        ...(body.active !== undefined && { active: body.active }),
        ...(body.thresholdCents !== undefined && { thresholdCents: body.thresholdCents }),
        updatedAt: new Date(),
      },
    });
    ok(res, updated);
  }),
);

router.delete(
  "/alerts/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const id = req.params.id;
    const alert = await prisma.priceAlert.findUnique({ where: { id } });
    if (!alert) throw new AppError("NOT_FOUND", "Alert not found", 404);
    if (alert.userId !== userId) throw new AppError("FORBIDDEN", "Not allowed to delete this alert", 403);
    await prisma.priceAlert.delete({ where: { id } });
    ok(res, { ok: true });
  }),
);

export const analyticsRoutes = router;
