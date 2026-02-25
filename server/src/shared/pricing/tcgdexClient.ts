/**
 * Minimal TCGdex API client for fetching card market prices.
 * API docs: https://tcgdex.dev
 * Base URL: https://api.tcgdex.net/v2/{lang}/cards/{cardId}
 */

import { logger } from "../observability/logger.js";

const TCGDEX_BASE = "https://api.tcgdex.net/v2";
const TIMEOUT_MS = 10_000;

/** Language mapping: internal Language enum → TCGdex lang code. */
const LANG_MAP: Record<string, string> = {
  FR: "fr",
  EN: "en",
  JP: "ja",
  DE: "de",
  ES: "es",
  IT: "it",
};

export interface TcgdexCardmarketPrices {
  updated?: string;
  unit?: string;
  idProduct?: number;
  avg?: number;
  low?: number;
  trend?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
}

export interface TcgdexCardResponse {
  id: string;
  name?: string;
  image?: string;
  set?: { id?: string; name?: string };
  cardmarket?: TcgdexCardmarketPrices;
}

export interface TcgdexPriceResult {
  cardId: string;
  language: string;
  trendCents: number;
  lowCents: number | null;
  avgCents: number | null;
  highCents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
  rawJson: TcgdexCardmarketPrices;
}

/** Convert EUR decimal to integer cents. */
function eurToCents(value: number | undefined | null): number | null {
  if (value == null || isNaN(value)) return null;
  return Math.round(value * 100);
}

/** Map internal Language enum value to TCGdex lang code. */
export function toTcgdexLang(language: string): string {
  return LANG_MAP[language] ?? "fr";
}

/**
 * Inner: fetch Cardmarket prices from TCGdex for a specific lang code.
 * Returns null on 404, no pricing data, or timeout.
 */
async function fetchCardPriceLang(
  cardId: string,
  lang: string,
  originalLanguage: string,
): Promise<TcgdexPriceResult | null> {
  const url = `${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(cardId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) {
      logger.debug("tcgdex: card not found (404)", { cardId, lang, url });
      return null;
    }
    if (!res.ok) {
      throw new Error(`TCGdex API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TcgdexCardResponse;
    const cm = data.cardmarket;
    if (!cm || cm.trend == null) {
      logger.debug("tcgdex: no cardmarket pricing", { cardId, lang, hasCardmarket: !!cm });
      return null;
    }

    const trendCents = eurToCents(cm.trend);
    if (trendCents == null) return null;

    return {
      cardId,
      language: originalLanguage,
      trendCents,
      lowCents: eurToCents(cm.low),
      avgCents: eurToCents(cm.avg),
      highCents: null,
      avg7Cents: eurToCents(cm.avg7),
      avg30Cents: eurToCents(cm.avg30),
      rawJson: cm,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return null; // timeout → graceful degradation
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a card's Cardmarket prices from TCGdex.
 * Tries the card's own language first, then falls back to "en":
 * Cardmarket prices are EUR-based and language-agnostic, but TCGdex
 * sometimes only indexes the Cardmarket product for the EN endpoint
 * (especially for recent SV-era sets).
 * Returns null if no pricing data is found in any language.
 */
export async function fetchCardPrice(
  cardId: string,
  language: string,
): Promise<TcgdexPriceResult | null> {
  const primaryLang = toTcgdexLang(language);

  const result = await fetchCardPriceLang(cardId, primaryLang, language);
  if (result != null) return result;

  // EN fallback: TCGdex has more complete Cardmarket coverage on the EN endpoint.
  // Skip if primary was already EN.
  if (primaryLang !== "en") {
    const fallback = await fetchCardPriceLang(cardId, "en", language);
    if (fallback != null) {
      logger.debug("tcgdex: pricing found via EN fallback", { cardId, primaryLang });
    }
    return fallback;
  }

  return null;
}

/** Result for card details (image + metadata) from TCGdex. */
export interface TcgdexCardDetailsResult {
  cardId: string;
  name: string | null;
  image: string | null;
  setCode: string | null;
  setName: string | null;
}

/**
 * Fetch card details (including image URL) from TCGdex.
 * Returns null if the card is not found.
 */
export async function fetchCardDetails(
  cardId: string,
  language: string,
): Promise<TcgdexCardDetailsResult | null> {
  const lang = LANG_MAP[language] ?? "fr";
  const url = `${TCGDEX_BASE}/${lang}/cards/${encodeURIComponent(cardId)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`TCGdex API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as TcgdexCardResponse;
    const imageBase = data.image ?? null;
    const imageUrl =
      imageBase != null && imageBase.length > 0
        ? imageBase + "/low.webp"
        : null;

    return {
      cardId: data.id,
      name: data.name ?? null,
      image: imageUrl,
      setCode: data.set?.id ?? null,
      setName: data.set?.name ?? null,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`TCGdex API timeout for ${cardId} (${lang})`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
