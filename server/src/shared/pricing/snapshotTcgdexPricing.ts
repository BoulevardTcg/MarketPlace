/**
 * Upsert des snapshots TCGdex dans DailyPriceSnapshot (idempotent).
 * Clé unique : (cardId, language, source, day).
 */

import { PriceSource } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { NormalizedTcgdexPricing } from "./normalizeTcgdexPricing.js";

/** Map code langue TCGdex (fr, en, ja, …) vers enum Prisma Language. */
const TCGDEX_LANG_TO_ENUM: Record<string, string> = {
  fr: "FR",
  en: "EN",
  ja: "JP",
  de: "DE",
  es: "ES",
  it: "IT",
};

function toLanguageEnum(lang: string): "FR" | "EN" | "JP" | "DE" | "ES" | "IT" | "OTHER" {
  const mapped = TCGDEX_LANG_TO_ENUM[lang.toLowerCase()];
  return (mapped as "FR" | "EN" | "JP" | "DE" | "ES" | "IT") ?? "OTHER";
}

/** Normalise une date à minuit UTC (granularité jour). */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Upsert un snapshot quotidien TCGdex pour (cardId, lang).
 * Idempotent : utilise la contrainte unique (cardId, language, source, day).
 */
export async function upsertTcgdexSnapshots(
  cardId: string,
  lang: string,
  marketPricing: NormalizedTcgdexPricing,
): Promise<void> {
  const day = utcDay(new Date());
  const language = toLanguageEnum(lang);

  await prisma.dailyPriceSnapshot.upsert({
    where: {
      cardId_language_source_day: {
        cardId,
        language,
        source: PriceSource.TCGDEX,
        day,
      },
    },
    create: {
      cardId,
      language,
      source: PriceSource.TCGDEX,
      day,
      trendCents: marketPricing.trendCents,
      lowCents: marketPricing.lowCents,
      avgCents: marketPricing.avgCents,
      highCents: marketPricing.highCents,
      rawJson: marketPricing.rawJson as object,
    },
    update: {
      trendCents: marketPricing.trendCents,
      lowCents: marketPricing.lowCents,
      avgCents: marketPricing.avgCents,
      highCents: marketPricing.highCents,
      rawJson: marketPricing.rawJson as object,
      capturedAt: new Date(),
    },
  });
}
