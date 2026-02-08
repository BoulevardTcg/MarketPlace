interface PriceDisplayProps {
  cents: number;
  currency?: string;
  size?: "sm" | "md" | "lg";
  deltaCents?: number | null;
  showDelta?: boolean;
}

function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

export function PriceDisplay({ cents, currency = "EUR", size = "md", deltaCents, showDelta = true }: PriceDisplayProps) {
  const sizeClass = size === "lg" ? "price-lg" : "";
  const fontSize = size === "sm" ? "var(--text-sm)" : undefined;

  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "var(--space-2)" }}>
      <span className={`price ${sizeClass}`} style={{ fontSize }}>
        {formatCents(cents, currency)}
      </span>
      {showDelta && deltaCents != null && deltaCents !== 0 && (
        <span className={`price-delta ${deltaCents > 0 ? "positive" : "negative"}`}>
          {deltaCents > 0 ? "+" : ""}
          {formatCents(deltaCents, currency)}
        </span>
      )}
    </span>
  );
}

export { formatCents };
