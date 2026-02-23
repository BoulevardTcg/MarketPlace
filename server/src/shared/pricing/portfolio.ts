import { PriceSource, Language } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db/prisma.js";

type PrismaLike = Pick<
  PrismaClient,
  "userCollection" | "externalProductRef" | "cardPriceSnapshot" | "userPortfolioSnapshot"
>;

export interface PortfolioValue {
  totalValueCents: number;
  totalCostCents: number;
  pnlCents: number;
  itemCount: number;
  valuedCount: number;
  missingCount: number;
}

export async function computePortfolioValue(
  userId: string,
  db: PrismaLike = defaultPrisma,
): Promise<PortfolioValue> {
  const source = PriceSource.CARDMARKET;
  const items = await db.userCollection.findMany({ where: { userId } });

  if (items.length === 0) {
    return { totalValueCents: 0, totalCostCents: 0, pnlCents: 0, itemCount: 0, valuedCount: 0, missingCount: 0 };
  }

  const pairs = [...new Set(items.map((i) => `${i.cardId}:${i.language}`))];
  const refs = await db.externalProductRef.findMany({
    where: {
      source,
      OR: pairs.map((p) => {
        const [cardId, language] = p.split(":");
        return { cardId, language: language as Language };
      }),
    },
  });
  const refByKey = new Map(refs.map((r) => [`${r.cardId}:${r.language ?? ""}`, r]));

  const externalIds = [...new Set(refs.map((r) => r.externalProductId))];
  const latestSnapshots = await Promise.all(
    externalIds.map((externalProductId) =>
      db.cardPriceSnapshot.findFirst({
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

  return {
    totalValueCents,
    totalCostCents,
    pnlCents: pnlValueCents - pnlCostCents,
    itemCount: items.length,
    valuedCount,
    missingCount,
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
