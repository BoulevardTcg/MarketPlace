interface SkeletonProps {
  variant?: "text" | "heading" | "image" | "badge" | "rect";
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({ variant = "text", width, height, className = "" }: SkeletonProps) {
  const variantClass =
    variant === "text"
      ? "skeleton-text"
      : variant === "heading"
        ? "skeleton-heading"
        : variant === "image"
          ? "skeleton-image"
          : variant === "badge"
            ? "skeleton-badge"
            : "";

  return (
    <div
      className={`skeleton ${variantClass} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
