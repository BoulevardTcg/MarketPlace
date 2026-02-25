/**
 * Import Cardmarket JSON data (products + price guide) and link to UserCollection cards.
 *
 * Usage:  npx tsx src/jobs/importCardmarketJson.ts
 * npm:    npm run job:cardmarket-json
 *
 * Requires in server/data/:
 *   products_singles_6.json + price_guide_6.json   (Pokémon)
 *   products_singles_13.json + price_guide_13.json  (Dragon Ball Super — optional)
 *   products_singles_18.json + price_guide_18.json  (One Piece — optional)
 *
 * Algorithm:
 *   1. Load all product catalogs → normalized name → idProduct map
 *   2. Load all price guides → idProduct → prices map
 *   3. For each unique cardId in UserCollection, call TCGdex /en/ to get the English card name
 *   4. Match English name → Cardmarket idProduct → prices
 *   5. Upsert ExternalProductRef + CardPriceSnapshot
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import dotenv from "dotenv";
import { prisma } from "../shared/db/prisma.js";
import { PriceSource, Game, Language } from "@prisma/client";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const DATA_DIR = resolve(process.cwd(), "data");
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en/cards";
const DELAY_MS = 300;

// Files to load → game mapping
const GAME_FILES: { prefix: string; game: Game }[] = [
  { prefix: "6",  game: "POKEMON"  },
  { prefix: "13", game: "OTHER"    }, // Dragon Ball Super → OTHER (not in Game enum)
  { prefix: "18", game: "ONE_PIECE" },
];

interface CmProduct {
  idProduct: number;
  name: string;
  idCategory: number;
  idMetacard?: number;
  game: Game;
}

interface CmPrice {
  idProduct: number;
  trend: number | null;
  avg: number | null;
  low: number | null;
  avg7: number | null;
  avg30: number | null;
}

/** Strip move names in brackets: "Charizard [Fire Spin | ...]" → "Charizard" */
function normalizeName(name: string): string {
  return name.replace(/\s*\[[^\]]*\]\s*$/, "").trim().toLowerCase();
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function loadJson(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

async function fetchTcgdexEnName(cardId: string): Promise<string | null> {
  try {
    const url = `${TCGDEX_BASE}/${encodeURIComponent(cardId)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string };
    return data.name ?? null;
  } catch {
    return null;
  }
}

async function main() {
  // ── 1. Build product catalog ─────────────────────────────────
  // normalized name → CmProduct[] (multiple products can share a name)
  const productsByNorm = new Map<string, CmProduct[]>();

  for (const { prefix, game } of GAME_FILES) {
    const path = join(DATA_DIR, `products_singles_${prefix}.json`);
    const data = loadJson(path);
    if (!data) {
      console.log(`[skip] products_singles_${prefix}.json not found`);
      continue;
    }
    const products = (data.products as CmProduct[]) ?? [];
    console.log(`Loaded ${products.length} products (${game}, prefix ${prefix})`);
    for (const p of products) {
      const norm = normalizeName(p.name);
      const list = productsByNorm.get(norm) ?? [];
      list.push({ ...p, game });
      productsByNorm.set(norm, list);
    }
  }

  // ── 2. Build price guide ──────────────────────────────────────
  const priceByProduct = new Map<number, CmPrice>();

  for (const { prefix } of GAME_FILES) {
    const path = join(DATA_DIR, `price_guide_${prefix}.json`);
    const data = loadJson(path);
    if (!data) continue;
    const entries = (data.priceGuides as Array<Record<string, unknown>>) ?? [];
    for (const e of entries) {
      const id = e.idProduct as number;
      if (!priceByProduct.has(id)) {
        priceByProduct.set(id, {
          idProduct: id,
          trend:  typeof e.trend  === "number" ? e.trend  : null,
          avg:    typeof e.avg    === "number" ? e.avg    : null,
          low:    typeof e.low    === "number" ? e.low    : null,
          avg7:   typeof e.avg7   === "number" ? e.avg7   : null,
          avg30:  typeof e.avg30  === "number" ? e.avg30  : null,
        });
      }
    }
  }
  console.log(`Loaded ${priceByProduct.size} price entries across all games`);

  // ── 3. Unique cardIds from UserCollection ─────────────────────
  const collectionItems = await prisma.userCollection.findMany({
    select: { cardId: true, language: true, game: true },
    distinct: ["cardId", "language"],
  });
  console.log(`\n${collectionItems.length} unique (cardId, language) pairs to process\n`);

  // Fetch English names for all unique cardIds
  const uniqueCardIds = [...new Set(collectionItems.map((i) => i.cardId))];
  const nameByCardId = new Map<string, string>();

  for (let i = 0; i < uniqueCardIds.length; i++) {
    const cardId = uniqueCardIds[i];
    const name = await fetchTcgdexEnName(cardId);
    if (name) {
      nameByCardId.set(cardId, name);
      console.log(`  TCGdex: ${cardId} → "${name}"`);
    } else {
      console.log(`  TCGdex: ${cardId} → not found`);
    }
    if (i < uniqueCardIds.length - 1) await delay(DELAY_MS);
  }

  // ── 4. Match + import ─────────────────────────────────────────
  let refUpserted = 0;
  let snapshotCreated = 0;
  let notMatched = 0;

  console.log("\n--- Matching and importing ---");

  for (const item of collectionItems) {
    const enName = nameByCardId.get(item.cardId);
    if (!enName) {
      console.log(`  [skip] ${item.cardId}: no English name from TCGdex`);
      notMatched++;
      continue;
    }

    const norm = normalizeName(enName);
    const candidates = productsByNorm.get(norm);

    if (!candidates || candidates.length === 0) {
      console.log(`  [skip] ${item.cardId} ("${enName}"): no Cardmarket match`);
      notMatched++;
      continue;
    }

    // Pick first candidate that has a trend price in the guide
    let bestProduct: CmProduct | null = null;
    let bestPrice: CmPrice | null = null;

    for (const p of candidates) {
      const price = priceByProduct.get(p.idProduct);
      if (price && price.trend != null) {
        bestProduct = p;
        bestPrice = price;
        break;
      }
    }

    if (!bestProduct || !bestPrice || bestPrice.trend == null) {
      console.log(`  [skip] ${item.cardId} ("${enName}"): found in catalog but no price`);
      notMatched++;
      continue;
    }

    const externalProductId = String(bestProduct.idProduct);
    const trendCents = Math.round(bestPrice.trend * 100);
    const avgCents   = bestPrice.avg   != null ? Math.round(bestPrice.avg   * 100) : null;
    const lowCents   = bestPrice.low   != null ? Math.round(bestPrice.low   * 100) : null;
    const avg7Cents  = bestPrice.avg7  != null ? Math.round(bestPrice.avg7  * 100) : null;
    const avg30Cents = bestPrice.avg30 != null ? Math.round(bestPrice.avg30 * 100) : null;

    await prisma.externalProductRef.upsert({
      where: {
        source_externalProductId: {
          source: PriceSource.CARDMARKET,
          externalProductId,
        },
      },
      create: {
        source: PriceSource.CARDMARKET,
        game: bestProduct.game,
        cardId: item.cardId,
        language: item.language as Language,
        externalProductId,
      },
      update: {
        cardId: item.cardId,
        language: item.language as Language,
      },
    });
    refUpserted++;

    await prisma.cardPriceSnapshot.create({
      data: {
        source: PriceSource.CARDMARKET,
        externalProductId,
        currency: "EUR",
        trendCents,
        avgCents,
        lowCents,
      },
    });
    snapshotCreated++;

    console.log(
      `  [ok] ${item.cardId} (${item.language}) → idProduct ${externalProductId} → trend ${bestPrice.trend}€`,
    );
  }

  console.log(
    `\nDone. Refs upserted: ${refUpserted}, Snapshots created: ${snapshotCreated}, Not matched: ${notMatched}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("[importCardmarketJson] Fatal:", e);
    prisma.$disconnect();
    process.exit(1);
  });
