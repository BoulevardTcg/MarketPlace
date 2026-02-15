import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounce } from "../hooks/useDebounce";
import { searchCards, getCardDetails, toTcgdexLang } from "../api";
import type { CardSuggestion, CardDetails, MarketPricing } from "../api";

const MAX_RESULTS = 100;
const DEBOUNCE_MS = 300;

export interface CardAutocompleteSelectPayload {
  cardId: string;
  cardName: string;
  setCode?: string;
  setName?: string;
  image?: string;
  rarity?: string;
  number?: string;
  pricing?: CardDetails["pricing"];
  marketPricing?: MarketPricing;
}

export interface CardAutocompleteProps {
  onSelect: (card: CardAutocompleteSelectPayload) => void;
  placeholder?: string;
  className?: string;
  /** Langue pour le détail TCGdex (FR, EN, JP -> fr, en, ja). */
  language?: string;
  "aria-label"?: string;
}

function suggestionLabel(s: CardSuggestion): string {
  const sWithSeries = s as CardSuggestion & { series?: { name?: string } };
  if (s.set?.name || sWithSeries.series?.name) {
    const setPart = s.set?.name ?? sWithSeries.series?.name ?? "";
    return `${s.name} — ${setPart}`;
  }
  return s.localId ? `${s.name} — #${s.localId}` : s.name;
}

export function CardAutocomplete({
  onSelect,
  placeholder = "Rechercher une carte…",
  className = "",
  language,
  "aria-label": ariaLabel,
}: CardAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CardSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);

  const fetchSuggestions = useCallback(async (q: string, signal?: AbortSignal) => {
    if (q.length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchCards(q, MAX_RESULTS, signal);
      setItems(Array.isArray(data) ? data : []);
      setHighlight(0);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      const ac = new AbortController();
      fetchSuggestions(debouncedQuery, ac.signal);
      setOpen(true);
      return () => ac.abort();
    }
    setItems([]);
    setError(null);
    setOpen(false);
  }, [debouncedQuery, fetchSuggestions]);

  const selectSuggestion = useCallback(
    async (s: CardSuggestion) => {
      const sWithSeries = s as CardSuggestion & CardDetails;
      const hasSetOrSeries = !!(s.set?.name ?? sWithSeries.series?.name);
      if (hasSetOrSeries) {
        const setName = s.set?.name ?? sWithSeries.series?.name;
        // Image : on stocke l’URL de base (s.image peut être .../low.webp)
        const imageBase = s.image ? s.image.replace(/\/low\.webp$/i, "") : undefined;
        onSelect({
          cardId: s.id,
          cardName: s.name,
          setCode: s.set?.id,
          setName: setName ?? undefined,
          image: imageBase,
          rarity: undefined,
          number: s.localId ?? undefined,
        });
        setOpen(false);
        setQuery("");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const lang = language ? toTcgdexLang(language) : "fr";
        const details = await getCardDetails(s.id, { lang });
        onSelect({
          cardId: details.id,
          cardName: details.name,
          setCode: details.set?.id,
          setName: details.set?.name,
          image: details.image ?? undefined,
          rarity: details.rarity,
          number: details.number,
          pricing: details.pricing,
          marketPricing: details.marketPricing,
        });
        setOpen(false);
        setQuery("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Recherche temporairement indisponible");
      } finally {
        setLoading(false);
      }
    },
    [onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || items.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h < items.length - 1 ? h + 1 : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h > 0 ? h - 1 : items.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      selectSuggestion(items[highlight]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlight] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open]);

  const listboxId = "card-autocomplete-list";
  const optionId = (i: number) => `card-autocomplete-option-${i}`;

  return (
    <div className={`card-autocomplete ${className}`} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.length >= 2 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel ?? "Recherche de carte"}
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={open && items.length > 0 ? optionId(highlight) : undefined}
        id="card-autocomplete-input"
        className="input"
        autoComplete="off"
      />
      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-labelledby="card-autocomplete-input"
          className="card-autocomplete-list"
          style={{
            position: "absolute",
            zIndex: 50,
            top: "100%",
            left: 0,
            right: 0,
            margin: 0,
            padding: 0,
            listStyle: "none",
            maxHeight: 420,
            overflowY: "auto",
            background: "var(--color-bg-elevated, #1e1e2e)",
            border: "1px solid var(--color-border, #333)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          {loading && items.length === 0 && (
            <li style={{ padding: "12px 14px", color: "var(--color-text-muted, #888)" }}>Recherche…</li>
          )}
          {error && (
            <li style={{ padding: "12px 14px", color: "var(--color-danger, #ef4444)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{error.includes("indisponible") ? "Recherche temporairement indisponible." : error}</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginLeft: 4 }}
                onClick={() => {
                  setError(null);
                  fetchSuggestions(debouncedQuery);
                }}
              >
                Réessayer
              </button>
            </li>
          )}
          {!loading && !error && items.length === 0 && query.length >= 2 && (
            <li style={{ padding: "12px 14px", color: "var(--color-text-muted, #888)" }}>Aucun résultat</li>
          )}
          {items.map((s, i) => (
            <li
              key={s.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === highlight}
              style={{
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                background: i === highlight ? "var(--color-bg-hover, #2a2a3e)" : "transparent",
              }}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(s);
              }}
            >
              {s.image && (
                <img
                  src={s.image}
                  alt=""
                  width={60}
                  height={84}
                  style={{ objectFit: "contain", borderRadius: 6, flexShrink: 0 }}
                />
              )}
              <span>{suggestionLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
