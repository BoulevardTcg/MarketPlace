import { useCallback } from "react";
import type { Game, Language, CardCondition, ListingCategory } from "../types/marketplace";
import { GAME_LABELS, LANGUAGE_LABELS, CONDITION_LABELS, CATEGORY_LABELS } from "../types/marketplace";

export interface Filters {
  game?: Game;
  category?: ListingCategory;
  language?: Language;
  condition?: CardCondition;
  minPrice?: string;
  maxPrice?: string;
  search?: string;
  sort?: string;
}

interface FilterBarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

const SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récents" },
  { value: "date_asc", label: "Plus anciens" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "delta_asc", label: "Meilleure affaire (bientôt)", disabled: true },
];

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const update = useCallback(
    (key: keyof Filters, value: string) => {
      onChange({ ...filters, [key]: value || undefined });
    },
    [filters, onChange],
  );

  const activeCount = [
    filters.game,
    filters.category,
    filters.language,
    filters.condition,
    filters.minPrice,
    filters.maxPrice,
  ].filter(Boolean).length;

  const reset = useCallback(() => {
    onChange({ search: filters.search, sort: filters.sort });
  }, [filters.search, filters.sort, onChange]);

  return (
    <div className="filter-bar sticky-bar" role="search" aria-label="Filtres annonces">
      {/* Search */}
      <div className="filter-bar-search">
        <label htmlFor="filter-search" className="sr-only">Rechercher</label>
        <input
          id="filter-search"
          type="search"
          className="input"
          placeholder="Rechercher une carte, un set..."
          value={filters.search ?? ""}
          onChange={(e) => update("search", e.target.value)}
        />
      </div>

      {/* Selects row */}
      <div className="filter-bar-selects">
        <div className="filter-bar-select-group">
          <label htmlFor="filter-game" className="sr-only">Jeu</label>
          <select
            id="filter-game"
            className="select"
            value={filters.game ?? ""}
            onChange={(e) => update("game", e.target.value)}
          >
            <option value="">Tous les jeux</option>
            {(Object.keys(GAME_LABELS) as Game[]).map((g) => (
              <option key={g} value={g}>{GAME_LABELS[g]}</option>
            ))}
          </select>
        </div>

        <div className="filter-bar-select-group">
          <label htmlFor="filter-category" className="sr-only">Categorie</label>
          <select
            id="filter-category"
            className="select"
            value={filters.category ?? ""}
            onChange={(e) => update("category", e.target.value)}
          >
            <option value="">Toutes categories</option>
            {(Object.keys(CATEGORY_LABELS) as ListingCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div className="filter-bar-select-group">
          <label htmlFor="filter-language" className="sr-only">Langue</label>
          <select
            id="filter-language"
            className="select"
            value={filters.language ?? ""}
            onChange={(e) => update("language", e.target.value)}
          >
            <option value="">Toutes langues</option>
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
              <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
            ))}
          </select>
        </div>

        <div className="filter-bar-select-group">
          <label htmlFor="filter-condition" className="sr-only">Etat</label>
          <select
            id="filter-condition"
            className="select"
            value={filters.condition ?? ""}
            onChange={(e) => update("condition", e.target.value)}
          >
            <option value="">Tous etats</option>
            {(Object.keys(CONDITION_LABELS) as CardCondition[]).map((c) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div className="filter-bar-select-group">
          <label htmlFor="filter-sort" className="sr-only">Trier</label>
          <select
            id="filter-sort"
            className="select"
            value={filters.sort ?? "date_desc"}
            onChange={(e) => update("sort", e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={"disabled" in o && o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Price range + reset row */}
      <div className="filter-bar-bottom">
        <div className="filter-bar-price-range">
          <label htmlFor="filter-min-price" className="sr-only">Prix minimum</label>
          <input
            id="filter-min-price"
            type="number"
            className="input"
            placeholder="Min €"
            min="0"
            step="1"
            value={filters.minPrice ?? ""}
            onChange={(e) => update("minPrice", e.target.value)}
            style={{ maxWidth: "100px" }}
          />
          <span style={{ color: "var(--color-text-subtle)" }}>-</span>
          <label htmlFor="filter-max-price" className="sr-only">Prix maximum</label>
          <input
            id="filter-max-price"
            type="number"
            className="input"
            placeholder="Max €"
            min="0"
            step="1"
            value={filters.maxPrice ?? ""}
            onChange={(e) => update("maxPrice", e.target.value)}
            style={{ maxWidth: "100px" }}
          />
        </div>

        {activeCount > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
            Reinitialiser ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
