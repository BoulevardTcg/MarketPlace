/**
 * Normalise la réponse détail carte TCGdex (GET /v2/{lang}/cards/{id})
 * pour en extraire les prix Cardmarket (pricing.cardmarket ou cardmarket).
 */

import type { TcgdexCardmarketPrices } from "./tcgdexClient.js";

export interface NormalizedTcgdexPricing {
  trendCents: number;
  lowCents: number | null;
  avgCents: number | null;
  highCents: number | null;
  rawJson: TcgdexCardmarketPrices | Record<string, unknown>;
}

function eurToCents(value: number | undefined | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100);
}

function extractCardmarket(data: any): TcgdexCardmarketPrices | null {
  if (!data || typeof data !== "object") return null;
  const cm = data.pricing?.cardmarket ?? data.cardmarket;
  if (!cm || typeof cm !== "object") return null;
  return cm as TcgdexCardmarketPrices;
}

/**
 * Normalise le détail d'une carte TCGdex en structure de prix (cents).
 * Retourne null si pas de prix Cardmarket (ex. trend absent).
 */
export function normalizeTcgdexPricing(cardDetail: any): NormalizedTcgdexPricing | null {
  const cm = extractCardmarket(cardDetail);
  if (!cm || cm.trend == null) return null;

  const trendCents = eurToCents(cm.trend);
  if (trendCents == null) return null;

  return {
    trendCents,
    lowCents: eurToCents(cm.low),
    avgCents: eurToCents(cm.avg),
    highCents: null,
    rawJson: cm,
  };
}
