import { Router } from "express";
import { z } from "zod";
import { PriceSource, Language } from "@prisma/client";
import { requireAuth, type RequestWithUser } from "../../shared/auth/requireAuth.js";
import { ok } from "../../shared/http/response.js";
import { asyncHandler } from "../../shared/http/asyncHandler.js";
import { AppError } from "../../shared/http/response.js";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../shared/config/env.js";
import { requireProfile } from "../../shared/auth/requireProfile.js";
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

const portfolioHistoryQuerySchema = paginationQuerySchema.extend({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

// ─── Routes ───────────────────────────────────────────────────

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

// GET /users/me/portfolio — computed portfolio value (auth required)
router.get(
  "/users/me/portfolio",
  requireAuth,
  profileGate,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const source = PriceSource.CARDMARKET;

    const items = await prisma.userCollection.findMany({
      where: { userId },
    });

    const itemCount = items.length;
    if (itemCount === 0) {
      return ok(res, {
        totalValueCents: 0,
        totalCostCents: 0,
        pnlCents: 0,
        currency: "EUR",
        itemCount: 0,
        valuedCount: 0,
        missingCount: 0,
      });
    }

    const pairs = [...new Set(items.map((i) => `${i.cardId}:${i.language}`))];
    const refs = await prisma.externalProductRef.findMany({
      where: {
        source,
        OR: pairs.map((p) => {
          const [cardId, language] = p.split(":");
          return { cardId, language: language as "FR" | "EN" | "JP" | "DE" | "ES" | "IT" | "OTHER" };
        }),
      },
    });
    const refByKey = new Map(refs.map((r) => [`${r.cardId}:${r.language ?? ""}`, r]));

    const externalIds = [...new Set(refs.map((r) => r.externalProductId))];
    const latestSnapshots = await Promise.all(
      externalIds.map((externalProductId) =>
        prisma.cardPriceSnapshot.findFirst({
          where: { externalProductId, source },
          orderBy: { capturedAt: "desc" },
        }),
      ),
    );
    const snapshotByExternalId = new Map(
      externalIds.map((id, i) => [id, latestSnapshots[i]]),
    );

    let totalValueCents = 0;
    let totalCostCents = 0;
    let pnlValueCents = 0;
    let pnlCostCents = 0;
    let valuedCount = 0;
    let missingCount = 0;

    for (const item of items) {
      const key = `${item.cardId}:${item.language}`;
      const ref = refByKey.get(key);
      const snapshot = ref
        ? snapshotByExternalId.get(ref.externalProductId) ?? null
        : null;

      if (snapshot) {
        valuedCount += 1;
        const value = item.quantity * snapshot.trendCents;
        totalValueCents += value;
        if (item.acquisitionPriceCents != null) {
          const cost = item.quantity * item.acquisitionPriceCents;
          totalCostCents += cost;
          pnlValueCents += value;
          pnlCostCents += cost;
        }
      } else {
        missingCount += 1;
        if (item.acquisitionPriceCents != null) {
          totalCostCents += item.quantity * item.acquisitionPriceCents;
        }
      }
    }

    const pnlCents = pnlValueCents - pnlCostCents;

    ok(res, {
      totalValueCents,
      totalCostCents,
      pnlCents,
      currency: "EUR",
      itemCount,
      valuedCount,
      missingCount,
    });
  }),
);

// POST /users/me/portfolio/snapshot — enregistre la valeur actuelle du portfolio (auth required)
router.post(
  "/users/me/portfolio/snapshot",
  requireAuth,
  profileGate,
  asyncHandler(async (req, res) => {
    const userId = (req as RequestWithUser).user.userId;
    const source = PriceSource.CARDMARKET;

    const items = await prisma.userCollection.findMany({
      where: { userId },
    });

    let totalValueCents = 0;
    let totalCostCents = 0;
    let pnlValueCents = 0;
    let pnlCostCents = 0;

    if (items.length > 0) {
      const pairs = [...new Set(items.map((i) => `${i.cardId}:${i.language}`))];
      const refs = await prisma.externalProductRef.findMany({
        where: {
          source,
          OR: pairs.map((p) => {
            const [cardId, language] = p.split(":");
            return { cardId, language: language as "FR" | "EN" | "JP" | "DE" | "ES" | "IT" | "OTHER" };
          }),
        },
      });
      const refByKey = new Map(refs.map((r) => [`${r.cardId}:${r.language ?? ""}`, r]));
      const externalIds = [...new Set(refs.map((r) => r.externalProductId))];
      const latestSnapshots = await Promise.all(
        externalIds.map((externalProductId) =>
          prisma.cardPriceSnapshot.findFirst({
            where: { externalProductId, source },
            orderBy: { capturedAt: "desc" },
          }),
        ),
      );
      const snapshotByExternalId = new Map(
        externalIds.map((id, i) => [id, latestSnapshots[i]]),
      );

      for (const item of items) {
        const key = `${item.cardId}:${item.language}`;
        const ref = refByKey.get(key);
        const snapshot = ref
          ? snapshotByExternalId.get(ref.externalProductId) ?? null
          : null;
        if (snapshot) {
          const value = item.quantity * snapshot.trendCents;
          totalValueCents += value;
          if (item.acquisitionPriceCents != null) {
            const cost = item.quantity * item.acquisitionPriceCents;
            totalCostCents += cost;
            pnlValueCents += value;
            pnlCostCents += cost;
          }
        } else if (item.acquisitionPriceCents != null) {
          totalCostCents += item.quantity * item.acquisitionPriceCents;
        }
      }
    }

    const pnlCents = pnlValueCents - pnlCostCents;

    await prisma.userPortfolioSnapshot.create({
      data: {
        userId,
        totalValueCents,
        totalCostCents,
        pnlCents,
      },
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

    const where: Parameters<typeof prisma.userPortfolioSnapshot.findMany>[0]["where"] = {
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
