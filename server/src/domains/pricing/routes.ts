import { Router } from "express";
import { z } from "zod";
import { Prisma, PriceSource, Language } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import { requireProfile } from "../../shared/auth/requireProfile.js";
import { computePortfolioValue } from "../../shared/pricing/portfolio.js";
import { fetchCardDetails } from "../../shared/pricing/tcgdexClient.js";
import type { Request, Response, NextFunction } from "express";
import {
  paginationQuerySchema,
  decodeCursor,
  buildPage,
} from "../../shared/http/pagination.js";

const router = Router();

// ─── Profile gate (opt-in) ───────────────────────────────────
const profileGate =
  env.PROFILE_GATE_ENABLED === "true"
    ? requireProfile("INVESTOR", "COLLECTOR")
    : (_req: Request, _res: Response, next: NextFunction) => next();

// ─── Zod Schemas ──────────────────────────────────────────────

const priceQuerySchema = z.object({
  language: z.nativeEnum(Language),
  source: z.nativeEnum(PriceSource).default(PriceSource.CARDMARKET),
});

const priceHistoryQuerySchema = z.object({
  language: z.nativeEnum(Language),
  days: z.coerce.number().int().min(1).max(365).default(30),
  source: z.nativeEnum(PriceSource).default(PriceSource.TCGDEX),
});

const portfolioHistoryQuerySchema = paginationQuerySchema.extend({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

const cardDetailsQuerySchema = z.object({
  language: z.nativeEnum(Language).default(Language.FR),
});

// ─── Routes ───────────────────────────────────────────────────

// GET /cards/:cardId/details — card metadata + image URL from TCGdex (for inventory selector, etc.)
router.get(
  "/cards/:cardId/details",
  asyncHandler(async (req, res) => {
    const cardId = req.params.cardId;
    const query = cardDetailsQuerySchema.parse(req.query);
    const details = await fetchCardDetails(cardId, query.language);
    if (!details) {
      throw new AppError("NOT_FOUND", "Card not found", 404);
    }
    ok(res, details);
  }),
);

// GET /cards/:cardId/price — latest market price for a card
router.get(
  "/cards/:cardId/price",
  asyncHandler(async (req, res) => {
    const cardId = req.params.cardId;
    const query = priceQuerySchema.parse(req.query);
    const { language, source } = query;

    const ref = await prisma.externalProductRef.findFirst({
      where: { cardId, language, source },
    });
    if (!ref)
      throw new AppError("NOT_FOUND", "Price reference not found for this card", 404);

    const snapshot = await prisma.cardPriceSnapshot.findFirst({
      where: { externalProductId: ref.externalProductId, source },
      orderBy: { capturedAt: "desc" },
    });
    if (!snapshot)
      throw new AppError("NOT_FOUND", "No price snapshot found for this card", 404);

    ok(res, {
      cardId,
      language,
      source,
      externalProductId: ref.externalProductId,
      currency: snapshot.currency,
      trendCents: snapshot.trendCents,
      avgCents: snapshot.avgCents,
      lowCents: snapshot.lowCents,
      capturedAt: snapshot.capturedAt,
    });
  }),
);

// GET /cards/:cardId/price/history — daily price history for a card
router.get(
  "/cards/:cardId/price/history",
  asyncHandler(async (req, res) => {
    const cardId = req.params.cardId;
    const query = priceHistoryQuerySchema.parse(req.query);
    const { language, days, source } = query;

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const snapshots = await prisma.dailyPriceSnapshot.findMany({
      where: {
        cardId,
        language,
        source,
        day: { gte: since },
      },
      orderBy: { day: "asc" },
      select: {
        day: true,
        trendCents: true,
        lowCents: true,
        avgCents: true,
        highCents: true,
      },
    });

    const series = snapshots.map((s) => ({
      day: s.day.toISOString().slice(0, 10),
      trendCents: s.trendCents,
      lowCents: s.lowCents,
      avgCents: s.avgCents,
      highCents: s.highCents,
    }));

    const trendValues = snapshots
      .map((s) => s.trendCents)
      .filter((v): v is number => v != null);

    const stats = {
      firstDay: series.length > 0 ? series[0].day : null,
      lastDay: series.length > 0 ? series[series.length - 1].day : null,
      lastTrendCents: trendValues.length > 0 ? trendValues[trendValues.length - 1] : null,
      minTrendCents: trendValues.length > 0 ? Math.min(...trendValues) : null,
      maxTrendCents: trendValues.length > 0 ? Math.max(...trendValues) : null,
    };

    ok(res, { series, stats });
  }),
);

// GET /users/me/portfolio — computed portfolio value (auth required)
router.get(
  "/users/me/portfolio",
  requireAuth,
  profileGate,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const portfolio = await computePortfolioValue(userId);
    ok(res, { ...portfolio, currency: "EUR" });
  }),
);

// POST /users/me/portfolio/snapshot — enregistre la valeur actuelle du portfolio (auth required)
router.post(
  "/users/me/portfolio/snapshot",
  requireAuth,
  profileGate,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const { totalValueCents, totalCostCents, pnlCents } = await computePortfolioValue(userId);

    await prisma.userPortfolioSnapshot.create({
      data: { userId, totalValueCents, totalCostCents, pnlCents },
    });

    ok(res, { ok: true });
  }),
);

// GET /users/me/portfolio/history — paginated portfolio snapshots (auth required)
router.get(
  "/users/me/portfolio/history",
  requireAuth,
  profileGate,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const query = portfolioHistoryQuerySchema.parse(req.query);
    const { cursor, limit, range } = query;

    const now = new Date();
    const rangeStart = new Date(now);
    if (range === "7d") rangeStart.setDate(rangeStart.getDate() - 7);
    else if (range === "30d") rangeStart.setDate(rangeStart.getDate() - 30);
    else rangeStart.setDate(rangeStart.getDate() - 90);

    const where: Prisma.UserPortfolioSnapshotWhereInput = {
      userId,
      capturedAt: { gte: rangeStart },
    };
    if (cursor) {
      const c = decodeCursor(cursor);
      const cursorId = c.id as string;
      const val = new Date(c.v as string);
      where.AND = {
        OR: [
          { capturedAt: { lt: val } },
          { capturedAt: val, id: { lt: cursorId } },
        ],
      };
    }

    const items = await prisma.userPortfolioSnapshot.findMany({
      where,
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const page = buildPage(items, limit, (item) => ({
      v: item.capturedAt.toISOString(),
      id: item.id,
    }));

    ok(res, { items: page.items, nextCursor: page.nextCursor });
  }),
);

export const pricingRoutes = router;
