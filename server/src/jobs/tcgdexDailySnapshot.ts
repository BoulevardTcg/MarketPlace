/**
 * Daily job: fetch card prices from TCGdex and upsert DailyPriceSnapshot.
 *
 * Usage:  npx tsx src/jobs/tcgdexDailySnapshot.ts
 * npm:    npm run job:tcgdex
 *
 * Also run automatically: once at server startup (catch-up) and daily at 06:00 UTC (cron).
 *
 * Cards to fetch are determined from:
 *   1. Distinct (cardId, language) in UserCollection
 *   2. Distinct (cardId, language) in Listing (status PUBLISHED or SOLD)
 *   3. Fallback: ExternalProductRef where source = TCGDEX
 *
 * Each card is fetched once per (cardId, language) per day (UTC).
 * If a snapshot already exists for today, it is updated (upsert).
 * avg7Cents / avg30Cents from TCGdex are persisted for curves.
 */

import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../shared/db/prisma.js";
import { fetchCardPrice } from "../shared/pricing/tcgdexClient.js";
import { PriceSource } from "@prisma/client";

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

  const collectionPairs = await prisma.userCollection.findMany({
    select: { cardId: true, language: true },
    distinct: ["cardId", "language"],
  });
  for (const p of collectionPairs) addPair(p.cardId, p.language);

  const listingPairs = await prisma.listing.findMany({
    where: { status: { in: ["PUBLISHED", "SOLD"] }, cardId: { not: null } },
    select: { cardId: true, language: true },
    distinct: ["cardId", "language"],
  });
  for (const p of listingPairs) addPair(p.cardId, p.language);

  if (pairs.length === 0) {
    const refs = await prisma.externalProductRef.findMany({
      where: { source: PriceSource.TCGDEX },
      select: { cardId: true, language: true },
    });
    for (const r of refs) addPair(r.cardId, r.language ?? "FR");
  }

  return pairs;
}

export interface TcgdexSnapshotResult {
  success: number;
  skipped: number;
  failed: number;
  total: number;
}

type Log = { info(msg: string, meta?: Record<string, unknown>): void; error(msg: string, meta?: Record<string, unknown>): void };

/** Guard against concurrent executions (startup catch-up + cron firing at the same time). */
let isRunning = false;

/**
 * Run the TCGdex daily snapshot job (fetch prices, upsert DailyPriceSnapshot for today).
 * Does not disconnect Prisma — caller manages connection.
 * Safe to call from server startup or cron. Skips silently if already running.
 */
export async function runTcgdexDailySnapshot(log: Log | null = null): Promise<TcgdexSnapshotResult> {
  const out = log ?? { info: (m: string) => console.log(m), error: (m: string) => console.error(m) };

  if (isRunning) {
    out.info("[tcgdex-snapshot] Already running, skipping concurrent execution.");
    return { success: 0, skipped: 0, failed: 0, total: 0 };
  }
  isRunning = true;

  const day = utcToday();
  out.info(`[tcgdex-snapshot] Starting daily snapshot for ${day.toISOString().slice(0, 10)}`);

  try {
    const pairs = await collectCardPairs();
    out.info(`[tcgdex-snapshot] ${pairs.length} card/language pairs to process`, { count: pairs.length });

    if (pairs.length === 0) {
      out.info("[tcgdex-snapshot] No cards to process. Done.");
      return { success: 0, skipped: 0, failed: 0, total: 0 };
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
            avg7Cents: result.avg7Cents,
            avg30Cents: result.avg30Cents,
            rawJson: result.rawJson as any,
          },
          update: {
            trendCents: result.trendCents,
            lowCents: result.lowCents,
            avgCents: result.avgCents,
            highCents: result.highCents,
            avg7Cents: result.avg7Cents,
            avg30Cents: result.avg30Cents,
            rawJson: result.rawJson as any,
            capturedAt: new Date(),
          },
        });
        success++;
      } catch (err: any) {
        failed++;
        out.error(`[tcgdex-snapshot] Error for ${cardId}/${language}: ${err.message}`, { cardId, language });
      }

      if (i < pairs.length - 1) await delay(200);
    }

    out.info(
      `[tcgdex-snapshot] Done. success=${success} skipped=${skipped} failed=${failed} total=${pairs.length}`,
      { success, skipped, failed, total: pairs.length },
    );
    return { success, skipped, failed, total: pairs.length };
  } finally {
    isRunning = false;
  }
}

// When run as CLI script (npm run job:tcgdex), not when imported by main
const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  dotenv.config({ path: resolve(process.cwd(), ".env") });
  runTcgdexDailySnapshot()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("[tcgdex-snapshot] Fatal error:", e);
      prisma.$disconnect();
      process.exit(1);
    });
}
