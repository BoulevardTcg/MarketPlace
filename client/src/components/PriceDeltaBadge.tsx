/**
 * Shows market price + "good deal" badge when listing is below market.
 * If marketPriceCents or deltaCents missing, renders nothing.
 */
interface PriceDeltaBadgeProps {
  priceCents: number;
  marketPriceCents: number | null | undefined;
  deltaCents: number | null | undefined;
  currency?: string;
  /** Percent threshold below market to show "good deal" (e.g. 5 = 5%) */
  goodDealPercentThreshold?: number;
  size?: "sm" | "md";
}

function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(cents / 100);
}

export function PriceDeltaBadge({
  priceCents,
  marketPriceCents,
  deltaCents,
  currency = "EUR",
  goodDealPercentThreshold = 5,
  size = "md",
}: PriceDeltaBadgeProps) {
  if (marketPriceCents == null || marketPriceCents <= 0) return null;
  const delta = deltaCents ?? priceCents - marketPriceCents;
  const percentDelta =
    marketPriceCents > 0 ? Math.round((delta / marketPriceCents) * 100) : 0;
  const isGoodDeal = delta < 0 && Math.abs(percentDelta) >= goodDealPercentThreshold;

  return (
    <span className={`price-delta-badge price-delta-badge--${size}`}>
      <span className="price-delta-badge__market" aria-label="Prix marché">
        {formatCents(marketPriceCents, currency)}
      </span>
      {delta !== 0 && (
        <span
          className={`price-delta-badge__delta ${delta < 0 ? "negative" : "positive"}`}
          aria-label={delta < 0 ? "Sous le marché" : "Au-dessus du marché"}
        >
          {delta < 0 ? "" : "+"}
          {percentDelta}%
        </span>
      )}
      {isGoodDeal && (
        <span className="price-delta-badge__good-deal" aria-label="Bonne affaire">
          Bonne affaire
        </span>
      )}
    </span>
  );
}
