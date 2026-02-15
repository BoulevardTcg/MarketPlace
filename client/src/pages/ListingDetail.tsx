import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchWithAuth, getAccessToken } from "../api";
import type { Listing } from "../types/marketplace";
import {
  GAME_LABELS,
  CONDITION_LABELS,
  LANGUAGE_LABELS,
  CATEGORY_LABELS,
  STATUS_LABELS,
} from "../types/marketplace";
import { PriceDisplay, PriceDeltaBadge, Badge, Skeleton, ErrorState } from "../components";

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSent, setReportSent] = useState(false);

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

  useEffect(() => {
    setGalleryIndex(0);
  }, [id]);

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

  const submitReport = async () => {
    if (!id || !reportReason.trim() || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const res = await fetchWithAuth(`/reports/listings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      if (res.ok) {
        setReportSent(true);
        setReportOpen(false);
        setReportReason("");
      }
    } finally {
      setReportSubmitting(false);
    }
  };

  const hasAuth = !!getAccessToken();

  // Loading skeleton
  if (loading) {
    return (
      <section>
        <Link to="/produits" className="back-link">&larr; Marketplace</Link>
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
        <Link to="/produits" className="back-link">&larr; Marketplace</Link>
        <ErrorState message={error} onRetry={fetchListing} />
      </section>
    );
  }

  if (!listing) return null;

  const hasImages = listing.images && listing.images.length > 0;
  const images = listing.images ?? [];
  const currentImage = images[galleryIndex];
  const canPrev = images.length > 1 && galleryIndex > 0;
  const canNext = images.length > 1 && galleryIndex < images.length - 1;

  return (
    <section>
      <Link to="/produits" className="back-link">&larr; Marketplace</Link>

      <div className="listing-detail-layout">
        {/* Gallery / carousel */}
        <div className="listing-detail-gallery">
          {hasImages ? (
            <>
              <div className="listing-detail-main-image">
                <img
                  src={currentImage!.storageKey}
                  alt={`${listing.title} — image ${galleryIndex + 1}`}
                />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="listing-detail-carousel-btn listing-detail-carousel-btn--prev"
                      onClick={() => setGalleryIndex((i) => Math.max(0, i - 1))}
                      disabled={!canPrev}
                      aria-label="Image précédente"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="listing-detail-carousel-btn listing-detail-carousel-btn--next"
                      onClick={() => setGalleryIndex((i) => Math.min(images.length - 1, i + 1))}
                      disabled={!canNext}
                      aria-label="Image suivante"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div className="listing-detail-dots" role="tablist" aria-label="Images">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={i === galleryIndex}
                      aria-label={`Image ${i + 1}`}
                      className={`listing-detail-dot ${i === galleryIndex ? "active" : ""}`}
                      onClick={() => setGalleryIndex(i)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="img-placeholder" style={{ aspectRatio: "4/3", fontSize: "var(--text-3xl)" }}>
              {GAME_LABELS[listing.game]?.[0] ?? "?"}
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
              <span className="listing-detail-price-label">Prix demandé</span>
              <PriceDisplay cents={listing.priceCents} currency={listing.currency} size="lg" deltaCents={listing.deltaCents} />
            </div>
            <PriceDeltaBadge
              priceCents={listing.priceCents}
              marketPriceCents={listing.marketPriceCents}
              deltaCents={listing.deltaCents}
              currency={listing.currency}
              size="md"
            />
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

          {/* Seller info (backend does not return seller username yet) */}
          <div className="listing-detail-seller">
            Vendeur : {listing.userId.slice(0, 8)}…
            {listing.publishedAt && (
              <> · Publiée le {new Date(listing.publishedAt).toLocaleDateString("fr-FR")}</>
            )}
          </div>

          {/* Report listing */}
          {hasAuth && listing.status === "PUBLISHED" && (
            <div className="listing-detail-report">
              {reportSent ? (
                <p className="listing-detail-report-sent">Signalement envoyé.</p>
              ) : reportOpen ? (
                <div className="listing-detail-report-form">
                  <label htmlFor="report-reason" className="sr-only">Raison du signalement</label>
                  <textarea
                    id="report-reason"
                    className="input"
                    rows={2}
                    placeholder="Raison du signalement (obligatoire)"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    maxLength={200}
                  />
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={submitReport}
                      disabled={!reportReason.trim() || reportSubmitting}
                    >
                      {reportSubmitting ? "Envoi…" : "Envoyer"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setReportOpen(false); setReportReason(""); }}
                      disabled={reportSubmitting}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setReportOpen(true)}
                >
                  Signaler cette annonce
                </button>
              )}
            </div>
          )}
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
