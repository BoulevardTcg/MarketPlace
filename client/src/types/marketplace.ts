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

export interface PortfolioBreakdownItem {
  cardId: string;
  cardName: string | null;
  setCode: string | null;
  language: string;
  condition: string;
  quantity: number;
  unitValueCents: number | null;
  totalValueCents: number | null;
  unitCostCents: number | null;
  totalCostCents: number | null;
  pnlCents: number | null;
  roiPercent: number | null;
  priceSource: "CARDMARKET" | "TCGDEX" | null;
}

export interface Portfolio {
  totalValueCents: number;
  totalCostCents: number;
  pnlCents: number;
  currency: string;
  itemCount: number;
  valuedCount: number;
  missingCount: number;
  breakdown?: PortfolioBreakdownItem[];
}

export interface PortfolioSnapshot {
  id: string;
  userId: string;
  totalValueCents: number;
  totalCostCents: number;
  pnlCents: number;
  capturedAt: string;
}

/** Item de la collection utilisateur (inventaire) */
export interface CollectionItem {
  id: string;
  cardId: string;
  cardName: string | null;
  setCode: string | null;
  game: string | null;
  language: Language;
  condition: CardCondition;
  quantity: number;
  isPublic?: boolean;
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

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | "TRADE_OFFER_RECEIVED"
  | "TRADE_OFFER_ACCEPTED"
  | "TRADE_OFFER_REJECTED"
  | "TRADE_OFFER_CANCELLED"
  | "TRADE_OFFER_COUNTERED"
  | "TRADE_MESSAGE_RECEIVED"
  | "LISTING_SOLD"
  | "LISTING_QUESTION_RECEIVED"
  | "LISTING_QUESTION_ANSWERED"
  | "PRICE_ALERT_TRIGGERED"
  | "PURCHASE_ORDER_RECEIVED"
  | "PURCHASE_ORDER_COMPLETED"
  | "PURCHASE_ORDER_CANCELLED";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  dataJson?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export type PurchaseOrderStatus = "PENDING" | "COMPLETED" | "CANCELLED" | "FAILED";

export interface PurchaseOrder {
  id: string;
  buyerUserId: string;
  listingId: string;
  status: PurchaseOrderStatus;
  priceCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  listing?: {
    id: string;
    title: string;
    priceCents: number;
    currency: string;
    status: string;
    images?: ListingImage[];
  };
}

export const ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  PENDING: "En attente",
  COMPLETED: "Complété",
  CANCELLED: "Annulé",
  FAILED: "Échoué",
};

// ─── Shipping ─────────────────────────────────────────────────────────────────

export type ShippingMethod = "PICKUP" | "COLISSIMO" | "MONDIAL_RELAY" | "LETTRE_SUIVIE" | "OTHER";

export interface ListingShipping {
  id: string;
  listingId: string;
  method: ShippingMethod;
  isFree: boolean;
  priceCents?: number;
  currency: string;
  estimatedDays?: string;
  description?: string;
}

export const SHIPPING_METHOD_LABELS: Record<ShippingMethod, string> = {
  PICKUP: "Remise en main propre",
  COLISSIMO: "Colissimo",
  MONDIAL_RELAY: "Mondial Relay",
  LETTRE_SUIVIE: "Lettre suivie",
  OTHER: "Autre",
};

// ─── Q&A ──────────────────────────────────────────────────────────────────────

export interface ListingQuestion {
  id: string;
  listingId: string;
  askerId: string;
  question: string;
  answer?: string;
  answeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Seller Reviews ───────────────────────────────────────────────────────────

export interface SellerReview {
  id: string;
  reviewerUserId: string;
  sellerUserId: string;
  rating: number;
  comment?: string;
  listingId?: string;
  tradeOfferId?: string;
  createdAt: string;
}

export interface SellerReviewSummary {
  avgRating: number | null;
  totalCount: number;
  breakdown: { 1: number; 2: number; 3: number; 4: number; 5: number };
}
