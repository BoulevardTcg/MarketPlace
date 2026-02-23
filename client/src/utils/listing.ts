/**
 * Utilitaires partagés pour les formulaires d'annonces (CreateListing, EditListing).
 */

/** Valide qu'une URL d'image utilise un protocole sûr (https/http). Retourne null si invalide. */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
    return null;
  } catch {
    return null;
  }
}

export function parseEurosToCents(value: string): number {
  const cleaned = value.replace(",", ".").trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function parseQuantity(value: string): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return 1;
  return Math.min(n, 999);
}
