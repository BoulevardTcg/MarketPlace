/**
 * Import card prices from the Boutique API (TCGdex via Boutique backend).
 * Stores results in DailyPriceSnapshot (source=TCGDEX).
 *
 * Usage:  npx tsx src/jobs/importPricesFromBoutique.ts
 * npm:    npm run job:boutique-prices
 *
 * Also run automatically: once at server startup (catch-up) and daily at 06:05 UTC (cron).
 *
 * The Boutique API (/api/trade/cards/:id?lang=:lang) returns authoritative
 * Cardmarket + TCGPlayer prices for each card. This is the same data
 * shown in the card add form of the Marketplace client.
 *
 * Env:
 *   BOUTIQUE_API_URL  — base URL of the Boutique API (default: http://localhost:8080/api)
 *   DATABASE_URL      — required
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "../shared/db/prisma.js";
import { PriceSource, Language } from "@prisma/client";

function getBoutiqueUrl() {
  return (process.env.BOUTIQUE_API_URL ?? "http://localhost:8080/api").replace(/\/$/, "");
}

const DELAY_MS = 300;

const LANG_MAP: Record<string, string> = {
  FR: "fr", EN: "en", JP: "ja", DE: "de", ES: "es", IT: "it", OTHER: "fr",
};

function toLang(language: string): string {
  return LANG_MAP[language] ?? "fr";
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

interface BoutiqueCardmarket {
  low?: number;
  avg?: number;
  trend?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
}

export async function fetchBoutiquePrice(
  cardId: string,
  language: string,
): Promise<BoutiqueCardmarket | null> {
  const lang = toLang(language);
  const url = `${getBoutiqueUrl()}/trade/cards/${encodeURIComponent(cardId)}?lang=${lang}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const body = await res.json() as {
      data?: {
        marketPricing?: {
          sources?: {
            cardmarket?: {
              normal?: BoutiqueCardmarket;
            };
          };
        };
      };
    };

    const cm = body?.data?.marketPricing?.sources?.cardmarket?.normal;
    if (!cm || cm.trend == null) return null;
    return cm;
  } catch {
    return null;
  }
}

function eurToCents(val: number | undefined | null): number | null {
  if (val == null || isNaN(val)) return null;
  return Math.round(val * 100);
}

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Fetch and store the Boutique price for a single (cardId, language) pair.
 * Safe to call fire-and-forget. Silently ignores errors.
 */
export async function fetchAndStoreSingleBoutiquePrice(cardId: string, language: string): Promise<void> {
  try {
    const cm = await fetchBoutiquePrice(cardId, language);
    if (!cm || cm.trend == null) return;
    const trendCents = eurToCents(cm.trend);
    if (trendCents == null) return;
    const day = utcToday();
    await prisma.dailyPriceSnapshot.upsert({
      where: { cardId_language_source_day: { cardId, language: language as Language, source: PriceSource.TCGDEX, day } },
      create: { cardId, language: language as Language, source: PriceSource.TCGDEX, day, trendCents, lowCents: eurToCents(cm.low), avgCents: eurToCents(cm.avg), highCents: null, avg7Cents: eurToCents(cm.avg7), avg30Cents: eurToCents(cm.avg30) },
      update: { trendCents, lowCents: eurToCents(cm.low), avgCents: eurToCents(cm.avg), avg7Cents: eurToCents(cm.avg7), avg30Cents: eurToCents(cm.avg30), capturedAt: new Date() },
    });
  } catch {
    // Fire-and-forget: do not throw
  }
}

type Log = { info(msg: string, meta?: Record<string, unknown>): void; error(msg: string, meta?: Record<string, unknown>): void };

let isRunning = false;

export async function runBoutiquePriceSnapshot(log: Log | null = null): Promise<void> {
  const out = log ?? { info: (m: string) => console.log(m), error: (m: string) => console.error(m) };

  if (isRunning) {
    out.info("[boutique-prices] Already running, skipping concurrent execution.");
    return;
  }
  isRunning = true;

  try {
    out.info(`[boutique-prices] Starting price snapshot (Boutique API: ${getBoutiqueUrl()})`);

    const items = await prisma.userCollection.findMany({
      select: { cardId: true, language: true },
      distinct: ["cardId", "language"],
    });

    out.info(`[boutique-prices] ${items.length} unique (cardId, language) pairs to process`);

    const day = utcToday();
    let success = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const { cardId, language } = items[i];

      try {
        const cm = await fetchBoutiquePrice(cardId, language);
        const trendCents = eurToCents(cm?.trend);

        if (!cm || trendCents == null) {
          skipped++;
        } else {
          await prisma.dailyPriceSnapshot.upsert({
            where: {
              cardId_language_source_day: {
                cardId,
                language: language as Language,
                source: PriceSource.TCGDEX,
                day,
              },
            },
            create: {
              cardId,
              language: language as Language,
              source: PriceSource.TCGDEX,
              day,
              trendCents,
              lowCents: eurToCents(cm.low),
              avgCents: eurToCents(cm.avg),
              highCents: null,
              avg7Cents: eurToCents(cm.avg7),
              avg30Cents: eurToCents(cm.avg30),
            },
            update: {
              trendCents,
              lowCents: eurToCents(cm.low),
              avgCents: eurToCents(cm.avg),
              avg7Cents: eurToCents(cm.avg7),
              avg30Cents: eurToCents(cm.avg30),
              capturedAt: new Date(),
            },
          });

          out.info(`[boutique-prices] [ok] ${cardId} (${language}) → trend ${cm.trend}€`);
          success++;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        out.error(`[boutique-prices] [err] ${cardId} (${language}): ${msg}`);
        failed++;
      }

      // Always delay between items — avoids flooding the Boutique API with
      // rapid-fire requests (especially when many cards return null quickly).
      if (i < items.length - 1) await delay(DELAY_MS);
    }

    out.info(`[boutique-prices] Done. success=${success} skipped=${skipped} failed=${failed} total=${items.length}`);
  } finally {
    isRunning = false;
  }
}

// CLI entry point (npm run job:boutique-prices)
const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  dotenv.config({ path: resolve(process.cwd(), ".env") });
  runBoutiquePriceSnapshot()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error("[boutique-prices] Fatal:", e);
      prisma.$disconnect();
      process.exit(1);
    });
}
