import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card card-body empty-state">
      {icon && <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>{icon}</div>}
      <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
        {title}
      </h3>
      {description && (
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
