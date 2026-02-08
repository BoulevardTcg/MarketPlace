import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchWithAuth, getJwt } from "../api";
import type { Listing } from "../types/marketplace";
import {
  GAME_LABELS,
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from "../types/marketplace";
import { PriceDisplay, Badge, Skeleton, ErrorState } from "../components";

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);

  const fetchListing = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/marketplace/listings/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Annonce introuvable");
        throw new Error(`Erreur ${res.status}`);
      }
      const json = await res.json();
      const data = json.data;
      setListing(data);
      setIsFavorited(!!data.isFavorited);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const toggleFavorite = async () => {
    if (!id || favoriteLoading) return;
    setFavoriteLoading(true);
    try {
      const res = await fetchWithAuth(`/marketplace/listings/${id}/favorite`, { method: "POST" });
      if (res.ok) {
        const json = await res.json();
        setIsFavorited(json.data.favorited);
      }
    } finally {
      setFavoriteLoading(false);
    }
  };

  const hasAuth = !!getJwt();

  // Loading skeleton
  if (loading) {
    return (
      <section>
        <Link to="/marketplace" className="back-link">&larr; Marketplace</Link>
        <div className="listing-detail-layout">
          <div className="listing-detail-gallery">
            <Skeleton variant="image" height="400px" />
          </div>
          <div className="listing-detail-info">
            <Skeleton variant="heading" width="60%" />
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="100%" />
            <Skeleton variant="rect" height="48px" width="100%" />
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <Link to="/marketplace" className="back-link">&larr; Marketplace</Link>
        <ErrorState message={error} onRetry={fetchListing} />
      </section>
    );
  }

  if (!listing) return null;

  const hasImages = listing.images && listing.images.length > 0;

  return (
    <section>
      <Link to="/marketplace" className="back-link">&larr; Marketplace</Link>

      <div className="listing-detail-layout">
        {/* Gallery */}
        <div className="listing-detail-gallery">
          {hasImages ? (
            <div className="listing-detail-main-image">
              <img
                src={listing.images![0].storageKey}
                alt={listing.title}
              />
            </div>
          ) : (
            <div className="img-placeholder" style={{ aspectRatio: "4/3", fontSize: "var(--text-3xl)" }}>
              {GAME_LABELS[listing.game]?.[0] ?? "?"}
            </div>
          )}
          {hasImages && listing.images!.length > 1 && (
            <div className="listing-detail-thumbs">
              {listing.images!.map((img) => (
                <div key={img.id} className="listing-detail-thumb">
                  <img src={img.storageKey} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="listing-detail-info">
          <div className="listing-detail-badges">
            <Badge variant="primary">{STATUS_LABELS[listing.status]}</Badge>
            <Badge>{GAME_LABELS[listing.game]}</Badge>
            <Badge>{CATEGORY_LABELS[listing.category]}</Badge>
          </div>

          <h1 className="listing-detail-title">{listing.title}</h1>

          {listing.cardName && listing.cardName !== listing.title && (
            <p style={{ margin: "0 0 var(--space-2)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
              {listing.cardName}
              {listing.setCode && <> &middot; {listing.setCode}</>}
              {listing.edition && <> &middot; {listing.edition}</>}
            </p>
          )}

          {/* Attributes row */}
          <div className="listing-detail-attrs">
            <div className="listing-detail-attr">
              <span className="listing-detail-attr-label">Etat</span>
              <span className="listing-detail-attr-value">{CONDITION_LABELS[listing.condition]}</span>
            </div>
            <div className="listing-detail-attr">
              <span className="listing-detail-attr-label">Langue</span>
              <span className="listing-detail-attr-value">{LANGUAGE_LABELS[listing.language]}</span>
            </div>
            <div className="listing-detail-attr">
              <span className="listing-detail-attr-label">Quantite</span>
              <span className="listing-detail-attr-value">{listing.quantity}</span>
            </div>
          </div>

          <hr className="divider" />

          {/* Price block */}
          <div className="listing-detail-price-block">
            <div>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", display: "block", marginBottom: "var(--space-1)" }}>
                Prix demande
              </span>
              <PriceDisplay cents={listing.priceCents} currency={listing.currency} size="lg" deltaCents={listing.deltaCents} />
            </div>
            {listing.marketPriceCents != null && (
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-muted)", display: "block", marginBottom: "var(--space-1)" }}>
                  Cote marche
                </span>
                <PriceDisplay cents={listing.marketPriceCents} currency={listing.currency} size="md" />
              </div>
            )}
          </div>

          {/* Description */}
          {listing.description && (
            <>
              <hr className="divider" />
              <div>
                <h2 style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", margin: "0 0 var(--space-2)" }}>
                  Description
                </h2>
                <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)", whiteSpace: "pre-wrap" }}>
                  {listing.description}
                </p>
              </div>
            </>
          )}

          <hr className="divider" />

          {/* Seller info placeholder */}
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)" }}>
            Vendeur : {listing.userId.slice(0, 8)}...
            {listing.publishedAt && (
              <> &middot; Publiee le {new Date(listing.publishedAt).toLocaleDateString("fr-FR")}</>
            )}
          </div>
        </div>
      </div>

      {/* Sticky mobile CTA */}
      {listing.status === "PUBLISHED" && (
        <div className="sticky-bottom md:hidden">
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button type="button" className="btn btn-primary btn-lg" style={{ flex: 1 }}>
              Acheter &middot; {(listing.priceCents / 100).toFixed(2)} €
            </button>
            {hasAuth && (
              <button
                type="button"
                className={`btn btn-secondary btn-lg ${isFavorited ? "favorited" : ""}`}
                onClick={toggleFavorite}
                disabled={favoriteLoading}
                aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                {isFavorited ? "\u2764\uFE0F" : "\u2661"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
