/**
 * Base URLs — via reverse proxy (Phase 2) tout passe par la même origine :
 *   /api/*    → Boutique   (login, refresh, logout, …)
 *   /market/* → Marketplace (me, trade, marketplace, …)
 * En dev sans proxy : fallback sur VITE_* env vars.
 */
const MARKET_BASE = import.meta.env.VITE_API_URL ?? "/market";
const BOUTIQUE_BASE = import.meta.env.VITE_BOUTIQUE_API_URL ?? "/api";

export function getApiUrl(): string {
  return MARKET_BASE;
}

export function getBoutiqueApiUrl(): string {
  return BOUTIQUE_BASE;
}

// --- Access token en mémoire (Phase 3 : plus de localStorage pour refresh) ---
let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

/**
 * Silent refresh : appelle POST /api/auth/refresh (cookie httpOnly envoyé automatiquement).
 * Renvoie le nouveau accessToken ou null si la session est expirée.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BOUTIQUE_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include", // Envoie le cookie httpOnly
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const { accessToken } = await res.json();
    if (accessToken) {
      setAccessToken(accessToken);
      return accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch avec auth vers le Marketplace API.
 * Si 401 → tente un silent refresh → retry une fois.
 */
export async function fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${MARKET_BASE}${path}`, { ...options, headers });
  };

  let res = await doFetch(_accessToken);

  // Si 401, tenter un refresh et retrier
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  return res;
}

// --- Recherche / détail cartes (API Boutique, routes publiques) ---

export interface CardSuggestion {
  id: string;
  name: string;
  localId?: string;
  image?: string;
  set?: { id?: string; name?: string };
  series?: { id?: string; name?: string };
}

export interface CardPricingCardmarket {
  unit?: string;
  avg?: number;
  low?: number;
  trend?: number;
  avg1?: number;
  avg7?: number;
  avg30?: number;
  updated?: string;
}

/** Prix marché normalisé (Boutique TCGdex) */
export interface MarketPricing {
  sources: {
    cardmarket?: {
      currency: string;
      updatedAt: string | null;
      normal: { low?: number; avg?: number; trend?: number; avg1?: number; avg7?: number; avg30?: number };
      holo?: { low?: number; avg?: number; trend?: number; avg1?: number; avg7?: number; avg30?: number };
    };
    tcgplayer?: {
      currency: string;
      updatedAt: string | null;
      variants: Record<string, { lowPrice?: number; midPrice?: number; highPrice?: number; marketPrice?: number; directLowPrice?: number }>;
    };
  };
}

export interface CardDetails {
  id: string;
  name: string;
  localId?: string;
  image?: string;
  set?: { id: string; name?: string; logo?: string; symbol?: string };
  series?: { id: string; name: string };
  number?: string;
  rarity?: string;
  pricing?: {
    cardmarket?: CardPricingCardmarket;
    tcgplayer?: Record<string, unknown>;
  };
  marketPricing?: MarketPricing;
}

export interface CardPriceHistoryPoint {
  date: string;
  value: number | null;
}

export interface CardPriceHistoryResponse {
  metadata: { currency: string; market: string; variant: string; lastUpdated: string | null };
  points: CardPriceHistoryPoint[];
}

// --- Boulevard (ventes internes, courbes par langue) ---
export type BoulevardSeriesPoint = { date: string; value: number | null };
export type BoulevardSeries = { lang: string; currency: string; points: BoulevardSeriesPoint[] };
export type BoulevardHistoryResponse = {
  metadata: { bucket: string; metric: string };
  series: BoulevardSeries[];
  hasAnyData: boolean;
};

export async function searchCards(
  q: string,
  limit = 100,
  signal?: AbortSignal
): Promise<CardSuggestion[] | CardDetails> {
  const params = new URLSearchParams({ q: q.trim(), limit: String(Math.min(100, Math.max(1, limit))) });
  const res = await fetch(`${BOUTIQUE_BASE}/trade/cards/search?${params}`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `Erreur ${res.status}`;
    throw new Error(msg);
  }
  const body = await res.json();
  const d = body?.data;
  if (!d) return body as CardDetails;
  if (d.card != null && d.marketPricing != null) {
    return { ...d.card, marketPricing: d.marketPricing } as CardDetails;
  }
  return d as CardDetails;
}

const TCGDEX_LANGS = ["fr", "en", "ja"] as const;
export type TcgdexLang = (typeof TCGDEX_LANGS)[number];

/** Langue formulaire (FR, EN, JP) -> langue TCGdex (fr, en, ja). */
export function toTcgdexLang(lang: string): TcgdexLang {
  const l = lang?.toLowerCase();
  if (l === "jp") return "ja";
  if (TCGDEX_LANGS.includes(l as TcgdexLang)) return l as TcgdexLang;
  return "fr";
}

export async function getCardDetails(
  id: string,
  options?: { lang?: TcgdexLang | string; signal?: AbortSignal }
): Promise<CardDetails> {
  const lang = options?.lang ? toTcgdexLang(String(options.lang)) : "fr";
  const url = `${BOUTIQUE_BASE}/trade/cards/${encodeURIComponent(id)}?lang=${lang}`;
  const res = await fetch(url, {
    credentials: "include",
    signal: options?.signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `Erreur ${res.status}`;
    throw new Error(msg);
  }
  const body = await res.json();
  const data = body?.data !== undefined ? body.data : body;
  if (data && typeof data === "object" && "card" in data && "marketPricing" in data) {
    const { card, marketPricing } = data as { card: Record<string, unknown>; marketPricing: MarketPricing };
    return { ...card, marketPricing } as CardDetails;
  }
  return data as CardDetails;
}

export async function getCardPriceHistory(
  id: string,
  params: { lang?: string; market?: string; variant?: string; days?: number; metric?: string },
  signal?: AbortSignal
): Promise<CardPriceHistoryResponse> {
  const lang = params.lang ? toTcgdexLang(params.lang) : "fr";
  const search = new URLSearchParams({
    lang,
    market: params.market ?? "cardmarket",
    variant: params.variant ?? "normal",
    days: String(params.days ?? 90),
    metric: params.metric ?? "trend",
  });
  const res = await fetch(`${BOUTIQUE_BASE}/trade/cards/${encodeURIComponent(id)}/price-history?${search}`, {
    credentials: "include",
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Erreur ${res.status}`);
  }
  const body = await res.json();
  return body?.data !== undefined ? body.data : body;
}

export async function getCardBoulevardHistory(
  id: string,
  params: {
    langs?: string;
    days?: number;
    bucket?: "day" | "week";
    metric?: "median" | "avg";
    placeholderZero?: boolean;
  },
  signal?: AbortSignal
): Promise<BoulevardHistoryResponse> {
  const search = new URLSearchParams({
    langs: params.langs ?? "fr,en,ja",
    days: String(params.days ?? 365),
    bucket: params.bucket ?? "day",
    metric: params.metric ?? "median",
    placeholderZero: params.placeholderZero ? "1" : "0",
  });
  const res = await fetch(
    `${BOUTIQUE_BASE}/trade/cards/${encodeURIComponent(id)}/boulevard-history?${search}`,
    { credentials: "include", signal }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Erreur ${res.status}`);
  }
  const body = await res.json();
  return body?.data !== undefined ? body.data : body;
}

// --- Market daily price history (Marketplace API) ---

export interface DailyPricePoint {
  day: string;
  trendCents: number;
  lowCents?: number | null;
  avgCents?: number | null;
  highCents?: number | null;
}

export interface DailyPriceHistoryStats {
  firstDay: string | null;
  lastDay: string | null;
  lastTrendCents: number | null;
  minTrendCents: number | null;
  maxTrendCents: number | null;
}

export interface DailyPriceHistoryResponse {
  series: DailyPricePoint[];
  stats: DailyPriceHistoryStats;
}

export async function getMarketDailyHistory(
  cardId: string,
  params: { language: string; days?: number; source?: string },
  signal?: AbortSignal,
): Promise<DailyPriceHistoryResponse> {
  const search = new URLSearchParams({
    language: params.language,
    days: String(params.days ?? 30),
  });
  if (params.source) search.set("source", params.source);

  const res = await fetch(
    `${MARKET_BASE}/cards/${encodeURIComponent(cardId)}/price/history?${search}`,
    { signal },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Erreur ${res.status}`);
  }
  const body = await res.json();
  return body?.data !== undefined ? body.data : body;
}

/** Détails carte (image + métadonnées) depuis l’API Marketplace (TCGdex). */
export interface CardDetailsFromMarket {
  cardId: string;
  name: string | null;
  image: string | null;
  setCode: string | null;
  setName: string | null;
}

export async function getCardDetailsFromMarket(
  cardId: string,
  params: { language: string; signal?: AbortSignal },
): Promise<CardDetailsFromMarket | null> {
  const search = new URLSearchParams({ language: params.language });
  const res = await fetch(
    `${MARKET_BASE}/cards/${encodeURIComponent(cardId)}/details?${search}`,
    { signal: params.signal },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Erreur ${res.status}`);
  }
  const body = await res.json();
  return body?.data !== undefined ? body.data : body;
}

export type CreateSaleTransactionPayload = {
  lang: string;
  price: number;
  currency?: string;
  qty?: number;
  soldAt: string;
  condition?: string;
  finish?: string;
};

export async function createSaleTransaction(
  id: string,
  payload: CreateSaleTransactionPayload,
  signal?: AbortSignal
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BOUTIQUE_BASE}/trade/cards/${encodeURIComponent(id)}/sales`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lang: payload.lang,
      price: payload.price,
      currency: payload.currency ?? "EUR",
      qty: payload.qty ?? 1,
      soldAt: payload.soldAt,
      condition: payload.condition ?? undefined,
      finish: payload.finish ?? undefined,
    }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Erreur ${res.status}`);
  }
  const body = await res.json();
  const data = body?.data;
  return data != null ? data : { ok: true };
}
