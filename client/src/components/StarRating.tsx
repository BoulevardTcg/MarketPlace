import { useState } from "react";

interface StarRatingProps {
  value: number;
  readOnly?: boolean;
  size?: "sm" | "md";
  onChange?: (rating: number) => void;
}

export function StarRating({ value, readOnly = true, size = "md", onChange }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  const fontSize = size === "sm" ? "var(--text-base)" : "var(--text-xl)";
  const active = hovered || value;

  return (
    <span
      style={{ display: "inline-flex", gap: "2px", fontSize, lineHeight: 1 }}
      aria-label={`Note : ${value} sur 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{
            cursor: readOnly ? "default" : "pointer",
            color: star <= active ? "var(--color-warning, #f59e0b)" : "var(--color-border, #334155)",
            transition: "color 0.1s",
            userSelect: "none",
          }}
          onMouseEnter={() => { if (!readOnly) setHovered(star); }}
          onMouseLeave={() => { if (!readOnly) setHovered(0); }}
          onClick={() => { if (!readOnly) onChange?.(star); }}
          role={readOnly ? undefined : "button"}
          aria-label={readOnly ? undefined : `${star} étoile${star > 1 ? "s" : ""}`}
        >
          {star <= Math.floor(value) ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
