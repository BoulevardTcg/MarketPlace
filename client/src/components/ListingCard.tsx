import { Link } from "react-router-dom";
import type { Listing } from "../types/marketplace";
import { CONDITION_SHORT, LANGUAGE_LABELS, GAME_LABELS } from "../types/marketplace";
import { PriceDisplay } from "./PriceDisplay";
import { Badge } from "./Badge";
import { Skeleton } from "./Skeleton";

interface ListingCardProps {
  listing: Listing;
}

export function ListingCard({ listing }: ListingCardProps) {
  const hasImage = listing.images && listing.images.length > 0;

  return (
    <Link
      to={`/marketplace/${listing.id}`}
      className="listing-card"
      aria-label={`${listing.title} — ${(listing.priceCents / 100).toFixed(2)} EUR`}
    >
      <div className="listing-card-image">
        {hasImage ? (
          <img
            src={listing.images![0].storageKey}
            alt={listing.title}
            loading="lazy"
          />
        ) : (
          <div className="img-placeholder">
            <span aria-hidden="true">{GAME_LABELS[listing.game]?.[0] ?? "?"}</span>
          </div>
        )}
      </div>

      <div className="listing-card-body">
        <div className="listing-card-badges">
          <Badge variant="primary">{CONDITION_SHORT[listing.condition]}</Badge>
          <Badge>{LANGUAGE_LABELS[listing.language]}</Badge>
          <Badge>{GAME_LABELS[listing.game]}</Badge>
        </div>

        <h3 className="listing-card-title">{listing.title}</h3>

        {listing.cardName && listing.cardName !== listing.title && (
          <p className="listing-card-subtitle">{listing.cardName}</p>
        )}

        <div className="listing-card-price">
          <PriceDisplay
            cents={listing.priceCents}
            currency={listing.currency}
            size="md"
            deltaCents={listing.deltaCents}
          />
          {listing.marketPriceCents != null && (
            <span className="listing-card-market-price">
              Cote : {(listing.marketPriceCents / 100).toFixed(2)} €
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Skeleton version for loading state */
export function ListingCardSkeleton() {
  return (
    <div className="listing-card" aria-hidden="true">
      <div className="listing-card-image">
        <Skeleton variant="image" />
      </div>
      <div className="listing-card-body">
        <div className="listing-card-badges">
          <Skeleton variant="badge" />
          <Skeleton variant="badge" />
        </div>
        <Skeleton variant="heading" />
        <Skeleton variant="text" width="80%" />
      </div>
    </div>
  );
}
