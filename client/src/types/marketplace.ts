export type Game = "POKEMON" | "MAGIC" | "MTG" | "YUGIOH" | "ONEPIECE" | "ONE_PIECE" | "LORCANA" | "DRAGONBALL" | "OTHER";
export type ListingCategory = "CARD" | "SEALED" | "ACCESSORY";
export type Language = "FR" | "EN" | "JP" | "DE" | "ES" | "IT" | "OTHER";
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";
export type ListingStatus = "DRAFT" | "PUBLISHED" | "SOLD" | "ARCHIVED";

export interface Listing {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  category: ListingCategory;
  game: Game;
  language: Language;
  condition: CardCondition;
  setCode?: string | null;
  cardId?: string | null;
  cardName?: string | null;
  edition?: string | null;
  attributesJson?: Record<string, unknown> | null;
  quantity: number;
  priceCents: number;
  currency: string;
  status: ListingStatus;
  isHidden: boolean;
  publishedAt?: string | null;
  soldAt?: string | null;
  createdAt: string;
  updatedAt: string;
  images?: ListingImage[];
  isFavorited?: boolean;
  marketPriceCents?: number | null;
  deltaCents?: number | null;
}

export interface ListingImage {
  id: string;
  listingId: string;
  storageKey: string;
  sortOrder: number;
  contentType: string;
  createdAt: string;
}

export interface Portfolio {
  totalValueCents: number;
  totalCostCents: number;
  pnlCents: number;
  currency: string;
  itemCount: number;
  valuedCount: number;
  missingCount: number;
}

export interface PortfolioSnapshot {
  id: string;
  userId: string;
  totalValueCents: number;
  totalCostCents: number;
  pnlCents: number;
  capturedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

/** Collection dashboard breakdown entry */
export interface BreakdownEntry {
  key: string;
  qty: number;
  costCents: number;
}

/** Collection dashboard response */
export interface CollectionDashboard {
  totalQty: number;
  totalCostCents: number;
  byGame: BreakdownEntry[];
  byLanguage: BreakdownEntry[];
  byCondition: BreakdownEntry[];
}

/** Monthly sales entry */
export interface MonthlySales {
  month: string;
  revenueCents: number;
  count: number;
}

/** Sales summary response */
export interface SalesSummary {
  totalRevenueCents: number;
  totalSold: number;
  monthly: MonthlySales[];
  byGame: { game: string; revenueCents: number; count: number }[];
}

/** Label maps for display (inclut variantes API: ONE_PIECE, MTG) */
export const GAME_LABELS: Record<string, string> = {
  POKEMON: "Pokemon",
  MAGIC: "Magic",
  MTG: "Magic",
  YUGIOH: "Yu-Gi-Oh!",
  ONEPIECE: "One Piece",
  ONE_PIECE: "One Piece",
  LORCANA: "Lorcana",
  DRAGONBALL: "Dragon Ball",
  OTHER: "Autre",
};

export const CONDITION_LABELS: Record<CardCondition, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

export const CONDITION_SHORT: Record<CardCondition, string> = {
  NM: "NM",
  LP: "LP",
  MP: "MP",
  HP: "HP",
  DMG: "DMG",
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  FR: "Francais",
  EN: "English",
  JP: "Japonais",
  DE: "Deutsch",
  ES: "Espanol",
  IT: "Italiano",
  OTHER: "Autre",
};

export const CATEGORY_LABELS: Record<ListingCategory, string> = {
  CARD: "Carte",
  SEALED: "Scelle",
  ACCESSORY: "Accessoire",
};

export const STATUS_LABELS: Record<ListingStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "En vente",
  SOLD: "Vendu",
  ARCHIVED: "Archive",
};
