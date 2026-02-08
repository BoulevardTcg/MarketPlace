// Aligné avec le schéma API (Language, CardCondition)
export type Language = "FR" | "EN" | "JP" | "DE" | "ES" | "IT" | "OTHER";
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export const LANGUAGE_OPTIONS: Language[] = ["FR", "EN", "JP", "DE", "ES", "IT", "OTHER"];
export const CONDITION_OPTIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

export interface TradeItemRow {
  cardId: string;
  language: Language;
  condition: CardCondition;
  quantity: number;
}

/** Parse items from creatorItemsJson / receiverItemsJson (schemaVersion 1). */
export function parseItemsFromJson(json: unknown): TradeItemRow[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  const items = obj.items;
  if (!Array.isArray(items)) return [];
  const result: TradeItemRow[] = [];
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
      !LANGUAGE_OPTIONS.includes(language as Language) ||
      !CONDITION_OPTIONS.includes(condition as CardCondition) ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      continue;
    }
    result.push({ cardId, language: language as Language, condition: condition as CardCondition, quantity });
  }
  return result;
}

export function toItemsJson(items: TradeItemRow[]): { schemaVersion: number; items: TradeItemRow[] } {
  return { schemaVersion: 1, items };
}
