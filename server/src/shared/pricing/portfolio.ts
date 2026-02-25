import { PriceSource, Language } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma.js";
import { fetchCardPrice } from "./tcgdexClient.js";
import { fetchBoutiquePrice } from "../../jobs/importPricesFromBoutique.js";
import { logger } from "../observability/logger.js";

const MAX_LIVE_TCGDEX_CALLS = 50;

type PrismaLike = Pick<
  PrismaClient,
  "userCollection" | "externalProductRef" | "cardPriceSnapshot" | "dailyPriceSnapshot" | "userPortfolioSnapshot"
>;

export interface PortfolioBreakdownItem {
  cardId: string;
  cardName: string | null;
  setCode: string | null;
  language: string;
  condition: string;
  quantity: number;
  unitValueCents: number | null;
  totalValueCents: number | null;
  unitCostCents: number | null;
  totalCostCents: number | null;
  pnlCents: number | null;
  roiPercent: number | null;
  priceSource: "CARDMARKET" | "TCGDEX" | null;
}

export interface PortfolioValue {
  totalValueCents: number;
  totalCostCents: number;
  pnlCents: number;
  itemCount: number;
  valuedCount: number;
  missingCount: number;
  breakdown: PortfolioBreakdownItem[];
}

export interface ComputePortfolioOptions {
  /** When true, fetch TCGdex prices on the fly for pairs without snapshot (instant cote). */
  live?: boolean;
}

export async function computePortfolioValue(
  userId: string,
  db: PrismaLike = defaultPrisma,
  options?: ComputePortfolioOptions,
): Promise<PortfolioValue> {
  const items = await db.userCollection.findMany({ where: { userId } });

  if (items.length === 0) {
    return { totalValueCents: 0, totalCostCents: 0, pnlCents: 0, itemCount: 0, valuedCount: 0, missingCount: 0, breakdown: [] };
  }

  const pairs = [...new Set(items.map((i) => `${i.cardId}:${i.language}`))];
  const pairObjects = pairs.map((p) => {
    const [cardId, language] = p.split(":");
    return { cardId, language: language as Language };
  });

  // ── 1. Cardmarket prices (primary) ──────────────────────────
  const refs = await db.externalProductRef.findMany({
    where: { source: PriceSource.CARDMARKET, OR: pairObjects },
  });
  const refByKey = new Map(refs.map((r) => [`${r.cardId}:${r.language ?? ""}`, r]));

  const externalIds = [...new Set(refs.map((r) => r.externalProductId))];
  const latestSnapshots = await Promise.all(
    externalIds.map((externalProductId) =>
      db.cardPriceSnapshot.findFirst({
        where: { externalProductId, source: PriceSource.CARDMARKET },
        orderBy: { capturedAt: "desc" },
      }),
    ),
  );
  const snapshotByExternalId = new Map(
    externalIds.map((id, i) => [id, latestSnapshots[i]]),
  );

  // ── 2. TCGdex prices (fallback for items without Cardmarket ref) ──
  const unpricedPairs = pairObjects.filter((p) => !refByKey.has(`${p.cardId}:${p.language}`));
  const tcgdexByKey = new Map<string, number>();

  if (unpricedPairs.length > 0) {
    const dailyRows = await db.dailyPriceSnapshot.findMany({
      where: {
        source: PriceSource.TCGDEX,
        OR: unpricedPairs,
      },
      orderBy: { day: "desc" },
      select: { cardId: true, language: true, trendCents: true },
    });
    // Keep only the latest per (cardId, language) — result is sorted day DESC
    for (const row of dailyRows) {
      const key = `${row.cardId}:${row.language}`;
      if (!tcgdexByKey.has(key) && row.trendCents != null) {
        tcgdexByKey.set(key, row.trendCents);
      }
    }

    // ── 2b. Live: fetch TCGdex API for all TCGdex fallback pairs (instant cote) ──
    if (options?.live) {
      const toFetch = unpricedPairs.slice(0, MAX_LIVE_TCGDEX_CALLS);
      if (toFetch.length > 0) {
        logger.info("portfolio live: fetching TCGdex prices", {
          count: toFetch.length,
          userId,
          pairs: toFetch.map((p) => `${p.cardId}:${p.language}`),
        });
        // Use .catch(() => null) per-call so a single timeout/error does NOT
        // reject the whole Promise.all and kill the portfolio response (500).
        const results = await Promise.all(
          toFetch.map((p) => fetchCardPrice(p.cardId, p.language).catch(() => null)),
        );
        let liveHits = 0;
        results.forEach((r, i) => {
          if (r != null && toFetch[i]) {
            tcgdexByKey.set(
              `${toFetch[i].cardId}:${toFetch[i].language}`,
              r.trendCents,
            );
            liveHits++;
          }
        });
        logger.info("portfolio live: TCGdex prices fetched", {
          requested: toFetch.length,
          hits: liveHits,
          misses: toFetch.length - liveHits,
        });

        // ── 2c. Boutique API fallback for cards TCGdex can't price ────────────
        // TCGdex has no Cardmarket data for recent SV sets — the Boutique API
        // has richer coverage. Fetch + persist so future calls skip the API.
        const stillMissing = toFetch.filter((p) => !tcgdexByKey.has(`${p.cardId}:${p.language}`));
        if (stillMissing.length > 0) {
          logger.info("portfolio live: fetching Boutique prices", {
            count: stillMissing.length,
            pairs: stillMissing.map((p) => `${p.cardId}:${p.language}`),
          });
          const boutiqueResults = await Promise.all(
            stillMissing.map((p) => fetchBoutiquePrice(p.cardId, p.language).catch(() => null)),
          );
          const day = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
          let boutiqueHits = 0;
          boutiqueResults.forEach((cm, i) => {
            if (cm && cm.trend != null && stillMissing[i]) {
              const pair = stillMissing[i]!;
              const trendCents = Math.round(cm.trend * 100);
              tcgdexByKey.set(`${pair.cardId}:${pair.language}`, trendCents);
              boutiqueHits++;
              // Persist for future requests (fire-and-forget)
              defaultPrisma.dailyPriceSnapshot.upsert({
                where: { cardId_language_source_day: { cardId: pair.cardId, language: pair.language as Language, source: PriceSource.TCGDEX, day } },
                create: { cardId: pair.cardId, language: pair.language as Language, source: PriceSource.TCGDEX, day, trendCents, lowCents: cm.low != null ? Math.round(cm.low * 100) : null, avgCents: cm.avg != null ? Math.round(cm.avg * 100) : null, highCents: null },
                update: { trendCents, lowCents: cm.low != null ? Math.round(cm.low * 100) : null, avgCents: cm.avg != null ? Math.round(cm.avg * 100) : null, capturedAt: new Date() },
              }).catch(() => {});
            }
          });
          logger.info("portfolio live: Boutique prices fetched", {
            requested: stillMissing.length,
            hits: boutiqueHits,
            misses: stillMissing.length - boutiqueHits,
          });
        }
      } else {
        logger.debug("portfolio live: no unpriced pairs (all cards have Cardmarket refs)", { userId });
      }
    }
  }

  // ── 3. Build breakdown + aggregate totals ────────────────────
  let totalValueCents = 0;
  let totalCostCents = 0;
  let pnlValueCents = 0;
  let pnlCostCents = 0;
  let valuedCount = 0;
  let missingCount = 0;
  const breakdown: PortfolioBreakdownItem[] = [];

  for (const item of items) {
    const key = `${item.cardId}:${item.language}`;
    const ref = refByKey.get(key);
    const cmSnapshot = ref ? snapshotByExternalId.get(ref.externalProductId) ?? null : null;

    let unitValueCents: number | null = null;
    let priceSource: "CARDMARKET" | "TCGDEX" | null = null;

    if (cmSnapshot) {
      unitValueCents = cmSnapshot.trendCents;
      priceSource = "CARDMARKET";
    } else if (tcgdexByKey.has(key)) {
      unitValueCents = tcgdexByKey.get(key)!;
      priceSource = "TCGDEX";
    }

    const itemTotalValueCents = unitValueCents != null ? item.quantity * unitValueCents : null;
    const unitCostCents = item.acquisitionPriceCents ?? null;
    const itemTotalCostCents = unitCostCents != null ? item.quantity * unitCostCents : null;
    const itemPnlCents =
      itemTotalValueCents != null && itemTotalCostCents != null
        ? itemTotalValueCents - itemTotalCostCents
        : null;
    const itemRoiPercent =
      itemPnlCents != null && itemTotalCostCents != null && itemTotalCostCents > 0
        ? Math.round((itemPnlCents / itemTotalCostCents) * 1000) / 10
        : null;

    breakdown.push({
      cardId: item.cardId,
      cardName: item.cardName ?? null,
      setCode: item.setCode ?? null,
      language: item.language,
      condition: item.condition,
      quantity: item.quantity,
      unitValueCents,
      totalValueCents: itemTotalValueCents,
      unitCostCents,
      totalCostCents: itemTotalCostCents,
      pnlCents: itemPnlCents,
      roiPercent: itemRoiPercent,
      priceSource,
    });

    if (unitValueCents != null) {
      valuedCount += 1;
      const value = item.quantity * unitValueCents;
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

  // Sort: priced cards first (by total value desc), then unpriced (by cost desc)
  breakdown.sort((a, b) => {
    const av = a.totalValueCents ?? -Infinity;
    const bv = b.totalValueCents ?? -Infinity;
    if (bv !== av) return bv - av;
    return (b.totalCostCents ?? -Infinity) - (a.totalCostCents ?? -Infinity);
  });

  return {
    totalValueCents,
    totalCostCents,
    pnlCents: pnlValueCents - pnlCostCents,
    itemCount: items.length,
    valuedCount,
    missingCount,
    breakdown,
  };
}

/**
 * Always create a portfolio snapshot (e.g. after each add/update in collection).
 * Use when you want one point per action (one point per card add).
 */
export async function snapshotPortfolio(
  userId: string,
  db: PrismaLike = defaultPrisma,
): Promise<void> {
  const { totalValueCents, totalCostCents, pnlCents } =
    await computePortfolioValue(userId, db);

  await db.userPortfolioSnapshot.create({
    data: { userId, totalValueCents, totalCostCents, pnlCents },
  });
}

/**
 * Create a portfolio snapshot only if totals differ from the last one.
 * Returns true if a new snapshot was created.
 */
export async function snapshotPortfolioIfChanged(
  userId: string,
  db: PrismaLike = defaultPrisma,
): Promise<boolean> {
  const { totalValueCents, totalCostCents, pnlCents } =
    await computePortfolioValue(userId, db);

  const last = await db.userPortfolioSnapshot.findFirst({
    where: { userId },
    orderBy: { capturedAt: "desc" },
  });

  if (
    last &&
    last.totalValueCents === totalValueCents &&
    last.totalCostCents === totalCostCents &&
    last.pnlCents === pnlCents
  ) {
    return false;
  }

  await db.userPortfolioSnapshot.create({
    data: { userId, totalValueCents, totalCostCents, pnlCents },
  });
  return true;
}
