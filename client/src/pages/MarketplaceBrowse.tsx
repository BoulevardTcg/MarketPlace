import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { fetchWithAuth } from "../api";
import type { Listing, PaginatedResponse } from "../types/marketplace";
import type { Filters } from "../components/FilterBar";
import {
  ListingCard,
  ListingGridSkeleton,
  FilterBar,
  TrustBanner,
  EmptyState,
  ErrorState,
  LoadMoreButton,
  PageHeader,
} from "../components";

/** Read filters from URL (single source of truth on mount / external link). */
function filtersFromSearchParams(searchParams: URLSearchParams): Filters {
  const search = searchParams.get("search") || undefined;
  const game = searchParams.get("game") || undefined;
  const category = searchParams.get("category") || undefined;
  const language = searchParams.get("language") || undefined;
  const condition = searchParams.get("condition") || undefined;
  const sort = searchParams.get("sort") || undefined;
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  return {
    search: search || undefined,
    game: game as Filters["game"] || undefined,
    category: category as Filters["category"] || undefined,
    language: language as Filters["language"] || undefined,
    condition: condition as Filters["condition"] || undefined,
    sort: sort || undefined,
    minPrice: minPrice != null && minPrice !== "" ? String(Number(minPrice) / 100) : undefined,
    maxPrice: maxPrice != null && maxPrice !== "" ? String(Number(maxPrice) / 100) : undefined,
  };
}

/** Write filters to URL (no cursor, so pagination resets). */
function filtersToSearchParams(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set("search", f.search);
  if (f.game) params.set("game", f.game);
  if (f.category) params.set("category", f.category);
  if (f.language) params.set("language", f.language);
  if (f.condition) params.set("condition", f.condition);
  if (f.sort) params.set("sort", f.sort);
  if (f.minPrice != null && f.minPrice !== "") params.set("minPrice", String(Number(f.minPrice) * 100));
  if (f.maxPrice != null && f.maxPrice !== "") params.set("maxPrice", String(Number(f.maxPrice) * 100));
  return params;
}

export function MarketplaceBrowse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => filtersFromSearchParams(searchParams));
  const [totalHint, setTotalHint] = useState<number | null>(null);

  // Sync URL → filters when URL changes (e.g. navbar search, back button)
  useEffect(() => {
    setFilters(filtersFromSearchParams(searchParams));
  }, [searchParams]);

  const buildQuery = useCallback((f: Filters, cursor?: string): string => {
    const params = new URLSearchParams();
    if (f.game) params.set("game", f.game);
    if (f.category) params.set("category", f.category);
    if (f.language) params.set("language", f.language);
    if (f.condition) params.set("condition", f.condition);
    if (f.search) params.set("search", f.search);
    const sort = f.sort && f.sort !== "delta_asc" ? f.sort : "date_desc";
    params.set("sort", sort);
    if (f.minPrice != null && f.minPrice !== "") params.set("minPrice", String(Number(f.minPrice) * 100));
    if (f.maxPrice != null && f.maxPrice !== "") params.set("maxPrice", String(Number(f.maxPrice) * 100));
    params.set("limit", "20");
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }, []);

  const fetchListings = useCallback(
    async (f: Filters, cursor?: string) => {
      const isLoadMore = !!cursor;
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await fetchWithAuth(`/marketplace/listings?${buildQuery(f, cursor)}`);
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        const json = await res.json();
        const page: PaginatedResponse<Listing> = json.data;

        if (isLoadMore) {
          setListings((prev) => [...prev, ...page.items]);
        } else {
          setListings(page.items);
          setTotalHint(page.items.length);
        }
        setNextCursor(page.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        if (!isLoadMore) setListings([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQuery],
  );

  // Fetch on mount + filter change (debounced for search)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchListings(filters);
    }, filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters, fetchListings]);

  const handleFilterChange = useCallback(
    (newFilters: Filters) => {
      setFilters(newFilters);
      setSearchParams(filtersToSearchParams(newFilters), { replace: true });
    },
    [setSearchParams],
  );

  const handleLoadMore = useCallback(() => {
    if (nextCursor && !loadingMore) {
      fetchListings(filters, nextCursor);
    }
  }, [nextCursor, loadingMore, filters, fetchListings]);

  return (
    <section>
      <PageHeader
        title="Marketplace"
        subtitle="Trouvez la carte parfaite parmi les annonces de la communauté."
        action={
          <Link to="/annonces/new" className="btn btn-primary">
            Vendre / Créer une annonce
          </Link>
        }
      />
      <TrustBanner />

      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* Results summary */}
      {!loading && !error && listings.length > 0 && (
        <div className="results-summary" aria-live="polite" aria-atomic="true">
          <span>
            {totalHint !== null && totalHint > 0
              ? `${listings.length} annonce${listings.length > 1 ? "s" : ""} affichee${listings.length > 1 ? "s" : ""}`
              : ""}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <ErrorState
          message={error}
          onRetry={() => fetchListings(filters)}
        />
      )}

      {/* Loading skeletons */}
      {loading && <ListingGridSkeleton />}

      {/* Empty state */}
      {!loading && !error && listings.length === 0 && (
        <EmptyState
          icon="\u{1F50D}"
          title="Aucune annonce trouvee"
          description="Essayez de modifier vos filtres ou revenez plus tard."
        />
      )}

      {/* Listings grid */}
      {!loading && listings.length > 0 && (
        <>
          <div className="listing-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" role="list" aria-label="Annonces marketplace">
            {listings.map((listing) => (
              <div key={listing.id} role="listitem">
                <ListingCard listing={listing} />
              </div>
            ))}
          </div>

          {nextCursor && (
            <LoadMoreButton onClick={handleLoadMore} loading={loadingMore} />
          )}
        </>
      )}
    </section>
  );
}
