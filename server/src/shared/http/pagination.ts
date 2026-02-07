import { z } from "zod";
import { AppError } from "./response.js";

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw new AppError("INVALID_CURSOR", "Invalid pagination cursor", 400);
  }
}

export function buildPage<T extends { id: string }>(
  items: T[],
  limit: number,
  cursorData: (item: T) => Record<string, unknown>,
): { items: T[]; nextCursor: string | null } {
  if (items.length > limit) {
    const page = items.slice(0, limit);
    const last = page[page.length - 1];
    return { items: page, nextCursor: encodeCursor(cursorData(last)) };
  }
  return { items, nextCursor: null };
}
