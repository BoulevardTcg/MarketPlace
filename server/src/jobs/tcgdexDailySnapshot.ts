/**
 * Daily job: fetch card prices from TCGdex and upsert DailyPriceSnapshot.
 *
 * Usage:  npx tsx src/jobs/tcgdexDailySnapshot.ts
 * npm:    npm run job:tcgdex
 *
 * Cards to fetch are determined from:
 *   1. Distinct (cardId, language) in UserCollection
 *   2. Distinct (cardId, language) in Listing (status PUBLISHED or SOLD)
 *   3. Fallback: ExternalProductRef where source = TCGDEX
 *
 * Each card is fetched once per (cardId, language) per day (UTC).
 * If a snapshot already exists for today, it is updated (upsert).
 */

import dotenv from "dotenv";
import { resolve } from "node:path";
import { prisma } from "../shared/db/prisma.js";
import { fetchCardPrice } from "../shared/pricing/tcgdexClient.js";
import { PriceSource } from "@prisma/client";

dotenv.config({ path: resolve(process.cwd(), ".env") });

/** Normalize a Date to UTC midnight (day granularity). */
function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Delay helper to avoid hammering the API. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function collectCardPairs(): Promise<{ cardId: string; language: string }[]> {
  const seen = new Set<string>();
  const pairs: { cardId: string; language: string }[] = [];

  const addPair = (cardId: string | null | undefined, language: string) => {
    if (!cardId) return;
    const key = `${cardId}:${language}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ cardId, language });
  };

  // 1. UserCollection
  const collectionPairs = await prisma.userCollection.findMany({
    select: { cardId: true, language: true },
    distinct: ["cardId", "language"],
  });
  for (const p of collectionPairs) addPair(p.cardId, p.language);

  // 2. Published / Sold listings
  const listingPairs = await prisma.listing.findMany({
    where: { status: { in: ["PUBLISHED", "SOLD"] }, cardId: { not: null } },
    select: { cardId: true, language: true },
    distinct: ["cardId", "language"],
  });
  for (const p of listingPairs) addPair(p.cardId, p.language);

  // 3. Fallback: ExternalProductRef with TCGDEX source
  if (pairs.length === 0) {
    const refs = await prisma.externalProductRef.findMany({
      where: { source: PriceSource.TCGDEX },
      select: { cardId: true, language: true },
    });
    for (const r of refs) addPair(r.cardId, r.language ?? "FR");
  }

  return pairs;
}

async function main() {
  const day = utcToday();
  console.log(`[tcgdex-snapshot] Starting daily snapshot for ${day.toISOString().slice(0, 10)}`);

  const pairs = await collectCardPairs();
  console.log(`[tcgdex-snapshot] ${pairs.length} card/language pairs to process`);

  if (pairs.length === 0) {
    console.log("[tcgdex-snapshot] No cards to process. Done.");
    return;
  }

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < pairs.length; i++) {
    const { cardId, language } = pairs[i];

    try {
      const result = await fetchCardPrice(cardId, language);

      if (!result) {
        skipped++;
        continue;
      }

      await prisma.dailyPriceSnapshot.upsert({
        where: {
          cardId_language_source_day: {
            cardId,
            language: language as any,
            source: PriceSource.TCGDEX,
            day,
          },
        },
        create: {
          cardId,
          language: language as any,
          source: PriceSource.TCGDEX,
          day,
          trendCents: result.trendCents,
          lowCents: result.lowCents,
          avgCents: result.avgCents,
          highCents: result.highCents,
          rawJson: result.rawJson as any,
        },
        update: {
          trendCents: result.trendCents,
          lowCents: result.lowCents,
          avgCents: result.avgCents,
          highCents: result.highCents,
          rawJson: result.rawJson as any,
          capturedAt: new Date(),
        },
      });
      success++;
    } catch (err: any) {
      failed++;
      console.error(`[tcgdex-snapshot] Error for ${cardId}/${language}: ${err.message}`);
    }

    // Rate-limit: 200ms between requests
    if (i < pairs.length - 1) await delay(200);
  }

  console.log(
    `[tcgdex-snapshot] Done. success=${success} skipped=${skipped} failed=${failed} total=${pairs.length}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("[tcgdex-snapshot] Fatal error:", e);
    prisma.$disconnect();
    process.exit(1);
  });
