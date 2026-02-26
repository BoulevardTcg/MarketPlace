import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchWithAuth, getAccessToken } from "../api";
import type { Listing } from "../types/marketplace";
import { STATUS_LABELS } from "../types/marketplace";
import {
  PriceDisplay,
  ErrorState,
  EmptyState,
  Skeleton,
  PageHeader,
} from "../components";

export function MyListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasAuth = !!getAccessToken();

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!hasAuth) return;
      const isFirst = !cursor;
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("limit", "20");
        if (cursor) qs.set("cursor", cursor);
        const res = await fetchWithAuth(`/marketplace/me/listings?${qs}`);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const json = await res.json();
        const data = json.data;
        const items: Listing[] = data.items ?? [];
        const next = data.nextCursor ?? null;
        if (isFirst) {
          setListings(items);
          setNextCursor(next);
        } else {
          setListings((prev) => [...prev, ...items]);
          setNextCursor(next);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [hasAuth],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!hasAuth) {
    return (
      <section className="card card-body">
        <PageHeader
          title="Mes annonces"
          subtitle="Connectez-vous pour voir et gérer vos annonces."
          action={
            <Link to="/connexion" className="btn btn-primary">
              Se connecter
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <section className="my-listings-page">
      <PageHeader
        title="Mes annonces"
        subtitle="Gérez vos brouillons et annonces en ligne."
        action={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Link to="/achats" className="btn btn-secondary">
              Achats & Commandes
            </Link>
            <Link to="/annonces/new" className="btn btn-primary">
              Nouvelle annonce
            </Link>
          </div>
        }
      />

      {loading && (
        <div className="my-listings-skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="my-listings-row">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="badge" />
              <Skeleton variant="text" width="15%" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <ErrorState
          message={error}
          onRetry={() => load()}
        />
      )}

      {!loading && !error && listings.length === 0 && (
        <EmptyState
          title="Aucune annonce"
          description="Créez votre première annonce pour la mettre en vente sur le marketplace."
          action={
            <Link to="/annonces/new" className="btn btn-primary">
              Créer une annonce
            </Link>
          }
        />
      )}

      {!loading && !error && listings.length > 0 && (
        <>
          <ul className="my-listings-list" role="list" aria-label="Liste de mes annonces">
            {listings.map((listing) => (
              <li key={listing.id} className="my-listings-item">
                <div className="my-listings-item-main">
                  <Link
                    to={`/marketplace/${listing.id}`}
                    className="my-listings-item-title"
                  >
                    {listing.title}
                  </Link>
                  <span className="my-listings-item-meta">
                    {listing.quantity} ×{" "}
                    <PriceDisplay
                      cents={listing.priceCents}
                      currency={listing.currency}
                      size="sm"
                    />
                  </span>
                </div>
                <div className="my-listings-item-actions">
                  <span
                    className={`my-listings-status my-listings-status--${listing.status.toLowerCase()}`}
                  >
                    {STATUS_LABELS[listing.status]}
                  </span>
                  {listing.status === "DRAFT" && (
                    <Link
                      to={`/annonces/${listing.id}/edit`}
                      className="btn btn-sm btn-secondary"
                    >
                      Modifier
                    </Link>
                  )}
                  <Link
                    to={`/marketplace/${listing.id}`}
                    className="btn btn-sm btn-ghost"
                  >
                    Voir
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div className="my-listings-load-more">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loadingMore}
                onClick={() => load(nextCursor)}
              >
                {loadingMore ? "Chargement…" : "Voir plus"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
