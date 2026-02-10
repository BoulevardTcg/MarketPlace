import type { Filters } from "./FilterBar";

const SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récents" },
  { value: "date_asc", label: "Plus anciens" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "delta_asc", label: "Meilleure affaire (bientôt)", disabled: true },
] as const;

interface SortSelectProps {
  value: string;
  onChange: (sort: Filters["sort"]) => void;
  id?: string;
  className?: string;
}

export function SortSelect({ value, onChange, id = "sort-select", className = "" }: SortSelectProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        Trier par
      </label>
      <select
        id={id}
        className="select"
        value={value || "date_desc"}
        onChange={(e) => onChange((e.target.value || undefined) as Filters["sort"])}
        aria-label="Trier par"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value} disabled={"disabled" in o && o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
