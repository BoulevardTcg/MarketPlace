/**
 * Standalone script to import Cardmarket Price Guide CSV.
 * Usage: npx tsx src/jobs/importCardmarketPriceGuide.ts <path-to-csv>
 * Requires PRICE_IMPORT_ENABLED=true and DATABASE_URL.
 *
 * CSV columns: idProduct, language, trendPrice, avgPrice, lowPrice, cardId, game
 * Prices are in EUR (decimal); stored as cents (integer).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { prisma } from "../shared/db/prisma.js";
import { PriceSource, Game } from "@prisma/client";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const ENABLED = process.env.PRICE_IMPORT_ENABLED === "true";
const CSV_PATH = process.argv[2];

const GAME_MAP: Record<string, Game> = {
  Pokemon: "POKEMON",
  "One Piece": "ONE_PIECE",
  MTG: "MTG",
  Magic: "MTG",
  Yugioh: "YUGIOH",
  Lorcana: "LORCANA",
  Other: "OTHER",
};

const LANGUAGE_MAP: Record<string, string> = {
  "1": "FR",
  "2": "EN",
  "3": "DE",
  "4": "ES",
  "5": "IT",
  "6": "JP",
  French: "FR",
  English: "EN",
  German: "DE",
  Spanish: "ES",
  Italian: "IT",
  Japanese: "JP",
  FR: "FR",
  EN: "EN",
  DE: "DE",
  ES: "ES",
  IT: "IT",
  JP: "JP",
};

function parseCsv(filePath: string): { idProduct: string; language: string | null; trendPrice: number; avgPrice: number | null; lowPrice: number | null; cardId: string; game: Game }[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const idx = (name: string) => {
    const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (i === -1) throw new Error(`Missing column: ${name}. Header: ${header.join(", ")}`);
    return i;
  };
  const iId = idx("idProduct");
  const iLang = header.findIndex((h) => h.toLowerCase() === "language");
  const iTrend = idx("trendPrice");
  const iAvgCol = header.findIndex((h) => /avg\s*price?/i.test(h)) >= 0
    ? header.findIndex((h) => /avg\s*price?/i.test(h))
    : header.findIndex((h) => h.toLowerCase() === "avgprice");
  const iLowCol = header.findIndex((h) => /low\s*price?/i.test(h)) >= 0
    ? header.findIndex((h) => /low\s*price?/i.test(h))
    : header.findIndex((h) => h.toLowerCase() === "lowprice");
  const iCardId = idx("cardId");
  const iGame = idx("game");

  const rows: { idProduct: string; language: string | null; trendPrice: number; avgPrice: number | null; lowPrice: number | null; cardId: string; game: Game }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const idProduct = cells[iId] ?? "";
    const cardId = cells[iCardId] ?? "";
    if (!idProduct || !cardId) continue;
    const langRaw = iLang >= 0 ? cells[iLang] : "";
    const language = langRaw ? (LANGUAGE_MAP[langRaw] ?? langRaw) : null;
    const trendRaw = cells[iTrend] ?? "0";
    const trendPrice = Math.round(parseFloat(String(trendRaw).replace(",", ".")) * 100);
    const avgRaw = iAvgCol >= 0 ? cells[iAvgCol] : "";
    const avgPrice = avgRaw ? Math.round(parseFloat(String(avgRaw).replace(",", ".")) * 100) : null;
    const lowRaw = iLowCol >= 0 ? cells[iLowCol] : "";
    const lowPrice = lowRaw ? Math.round(parseFloat(String(lowRaw).replace(",", ".")) * 100) : null;
    const gameRaw = cells[iGame] ?? "Other";
    const game = GAME_MAP[gameRaw] ?? "OTHER";
    rows.push({ idProduct, language, trendPrice, avgPrice, lowPrice, cardId, game });
  }
  return rows;
}

async function main() {
  if (!ENABLED) {
    console.error("PRICE_IMPORT_ENABLED is not 'true'. Aborting.");
    process.exit(1);
  }
  if (!CSV_PATH) {
    console.error("Usage: npx tsx src/jobs/importCardmarketPriceGuide.ts <path-to-csv>");
    process.exit(1);
  }

  const path = resolve(process.cwd(), CSV_PATH);
  console.log("Parsing CSV:", path);
  const rows = parseCsv(path);
  console.log("Rows to import:", rows.length);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let refUpserted = 0;
  let snapshotCreated = 0;

  for (const row of rows) {
    await prisma.externalProductRef.upsert({
      where: {
        source_externalProductId: {
          source: PriceSource.CARDMARKET,
          externalProductId: row.idProduct,
        },
      },
      create: {
        source: PriceSource.CARDMARKET,
        game: row.game,
        cardId: row.cardId,
        language: row.language as "FR" | "EN" | "JP" | "DE" | "ES" | "IT" | "OTHER" | null,
        externalProductId: row.idProduct,
      },
      update: {
        game: row.game,
        cardId: row.cardId,
        language: row.language as "FR" | "EN" | "JP" | "DE" | "ES" | "IT" | "OTHER" | null,
      },
    });
    refUpserted++;
  }
  console.log("ExternalProductRef upserted:", refUpserted);

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.cardPriceSnapshot.createMany({
      data: chunk.map((r) => ({
        source: PriceSource.CARDMARKET,
        externalProductId: r.idProduct,
        currency: "EUR",
        trendCents: r.trendPrice,
        avgCents: r.avgPrice,
        lowCents: r.lowPrice,
      })),
    });
    snapshotCreated += chunk.length;
    console.log("CardPriceSnapshot created:", snapshotCreated, "/", rows.length);
  }

  console.log("Done. Refs:", refUpserted, "Snapshots:", snapshotCreated);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
