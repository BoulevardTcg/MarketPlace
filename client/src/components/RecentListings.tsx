import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../api";
import type { Listing } from "../types/marketplace";
import { ListingCard, ListingCardSkeleton } from "./ListingCard";

const LIMIT = 6;

export function RecentListings() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ sort: "date_desc", limit: String(LIMIT) });
    fetchWithAuth(`/marketplace/listings?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Erreur"))))
      .then((json) => {
        const items = json?.data?.items ?? json?.items ?? [];
        setListings(Array.isArray(items) ? items : []);
      })
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="recent-listings" aria-labelledby="recent-listings-title">
        <h2 id="recent-listings-title" className="section-title">
          Derniers ajouts
        </h2>
        <div className="listing-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" role="list">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} role="listitem">
              <ListingCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (listings.length === 0) return null;

  return (
    <section className="recent-listings" aria-labelledby="recent-listings-title">
      <div className="recent-listings-header">
        <h2 id="recent-listings-title" className="section-title">
          Derniers ajouts
        </h2>
        <Link to="/produits" className="btn btn-secondary btn-sm">
          Voir tout
        </Link>
      </div>
      <div
        className="listing-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        role="list"
        aria-label="Dernières annonces publiées"
      >
        {listings.map((listing) => (
          <div key={listing.id} role="listitem">
            <ListingCard listing={listing} />
          </div>
        ))}
      </div>
    </section>
  );
}
