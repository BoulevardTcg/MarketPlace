import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchWithAuth } from "../../api";
import { useDebounce } from "../../hooks/useDebounce";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { SearchIcon } from "../icons";
import { formatCents } from "../PriceDisplay";
import type { Listing } from "../../types/marketplace";

interface SearchBoxProps {
  onResultClick?: () => void;
  fullWidth?: boolean;
}

export function SearchBox({ onResultClick, fullWidth }: SearchBoxProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  useOutsideClick(wrapperRef, () => setOpen(false));

  const isProductsPage =
    location.pathname === "/produits" || location.pathname === "/marketplace";

  // Sync from URL on /produits
  useEffect(() => {
    if (isProductsPage) {
      const params = new URLSearchParams(location.search);
      const urlSearch = params.get("search") || "";
      setQuery(urlSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // Fetch results
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      if (debouncedQuery.length === 0) setOpen(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchWithAuth(
      `/marketplace/listings?search=${encodeURIComponent(debouncedQuery)}&limit=8`,
    )
      .then((res) => {
        if (!res.ok) throw new Error("Search failed");
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const items: Listing[] = (json.data?.items ?? [])
          .filter((item: Listing) => item.category !== "ACCESSORY")
          .slice(0, 5);
        setResults(items);
        setOpen(items.length > 0);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Sync to URL on /produits
  useEffect(() => {
    if (!isProductsPage) return;
    const params = new URLSearchParams(location.search);
    const currentSearch = params.get("search") || "";
    if (debouncedQuery !== currentSearch) {
      const newParams = new URLSearchParams(location.search);
      if (debouncedQuery) {
        newParams.set("search", debouncedQuery);
      } else {
        newParams.delete("search");
      }
      const qs = newParams.toString();
      navigate(`${location.pathname}${qs ? `?${qs}` : ""}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, isProductsPage]);

  const handleResultClick = useCallback(
    (id: string) => {
      setOpen(false);
      setQuery("");
      onResultClick?.();
      navigate(`/marketplace/${id}`);
    },
    [navigate, onResultClick],
  );

  const handleViewAll = useCallback(() => {
    setOpen(false);
    onResultClick?.();
    navigate(`/produits?search=${encodeURIComponent(query)}`);
  }, [navigate, query, onResultClick]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.slice(0, 100);
    setQuery(val);
    if (val.length >= 2) setOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div
      className="navbar-search"
      ref={wrapperRef}
      style={fullWidth ? { width: "100%" } : undefined}
    >
      <div
        className={`navbar-search-container ${open && results.length > 0 ? "navbar-search--open" : ""}`}
        style={fullWidth ? { maxWidth: "none", minWidth: 0 } : undefined}
      >
        <span className="navbar-search-icon">
          <SearchIcon size={16} />
        </span>
        <input
          ref={inputRef}
          className="navbar-search-input"
          type="search"
          placeholder="Rechercher..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0 && query.length >= 2) setOpen(true);
          }}
          maxLength={100}
          aria-label="Rechercher des produits"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="navbar-search-results"
          role="combobox"
        />
        {loading && (
          <span className="navbar-search-spinner" aria-hidden="true" />
        )}
      </div>

      {open && results.length > 0 && (
        <div
          className="navbar-search-dropdown"
          id="navbar-search-results"
          role="listbox"
        >
          {results.map((item) => (
            <button
              key={item.id}
              className="navbar-search-result"
              onClick={() => handleResultClick(item.id)}
              role="option"
              type="button"
            >
              {item.images && item.images.length > 0 ? (
                <img
                  className="navbar-search-result-img"
                  src={item.images[0].storageKey}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div className="navbar-search-result-img" />
              )}
              <div className="navbar-search-result-info">
                <div className="navbar-search-result-name">{item.title}</div>
                <div className="navbar-search-result-price">
                  {formatCents(item.priceCents, item.currency)}
                </div>
              </div>
            </button>
          ))}
          <button
            className="navbar-search-view-all"
            onClick={handleViewAll}
            type="button"
          >
            Voir tous les résultats
          </button>
        </div>
      )}
    </div>
  );
}
