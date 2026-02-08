import type { CSSProperties } from "react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "primary";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  style?: CSSProperties;
}

const variantStyles: Record<BadgeVariant, CSSProperties> = {
  default: { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" },
  success: { background: "var(--color-success-bg)", color: "var(--color-success)" },
  warning: { background: "var(--color-warning-bg)", color: "var(--color-warning)" },
  danger: { background: "var(--color-danger-bg)", color: "var(--color-danger)" },
  info: { background: "var(--color-info-bg)", color: "var(--color-info)" },
  primary: { background: "var(--color-primary-light)", color: "var(--color-primary)" },
};

export function Badge({ children, variant = "default", className = "", style }: BadgeProps) {
  return (
    <span className={`badge ${className}`} style={{ ...variantStyles[variant], ...style }}>
      {children}
    </span>
  );
}
