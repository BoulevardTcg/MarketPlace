import type { Language, CardCondition } from "@prisma/client";

export interface TradeItem {
  cardId: string;
  language: Language;
  condition: CardCondition;
  quantity: number;
}

const VALID_LANGUAGES: Language[] = [
  "FR",
  "EN",
  "JP",
  "DE",
  "ES",
  "IT",
  "OTHER",
];
const VALID_CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

function isLanguage(s: unknown): s is Language {
  return typeof s === "string" && VALID_LANGUAGES.includes(s as Language);
}
function isCondition(s: unknown): s is CardCondition {
  return typeof s === "string" && VALID_CONDITIONS.includes(s as CardCondition);
}

/**
 * Parse trade items from creatorItemsJson / receiverItemsJson.
 * Expected format: { schemaVersion: number, items?: Array<{ cardId, language, condition, quantity }> }.
 * Returns empty array if items is missing or not an array.
 */
export function parseTradeItems(json: unknown): TradeItem[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  const items = obj.items;
  if (!Array.isArray(items)) return [];
  const result: TradeItem[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const cardId = e.cardId;
    const language = e.language;
    const condition = e.condition;
    const quantity = e.quantity;
    if (
      typeof cardId !== "string" ||
      !cardId ||
      !isLanguage(language) ||
      !isCondition(condition) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      continue;
    }
    result.push({ cardId, language, condition, quantity });
  }
  return result;
}
