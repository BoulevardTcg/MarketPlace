/**
 * Minimal TCGdex API client for fetching card market prices.
 * API docs: https://tcgdex.dev
 * Base URL: https://api.tcgdex.net/v2/{lang}/cards/{cardId}
 */

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
 * Fetch a card's Cardmarket prices from TCGdex.
 * Returns null if the card is not found or has no pricing data.
 */
export async function fetchCardPrice(
  cardId: string,
  language: string,
): Promise<TcgdexPriceResult | null> {
  const lang = toTcgdexLang(language);
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
    const cm = data.cardmarket;
    if (!cm || cm.trend == null) return null;

    const trendCents = eurToCents(cm.trend);
    if (trendCents == null) return null;

    return {
      cardId,
      language,
      trendCents,
      lowCents: eurToCents(cm.low),
      avgCents: eurToCents(cm.avg),
      highCents: null, // TCGdex doesn't expose a "high" price
      rawJson: cm,
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
