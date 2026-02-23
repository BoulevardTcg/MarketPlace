import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Primary CTA (one per page when applicable) */
  action?: ReactNode;
  /** Secondary actions (links or buttons) */
  secondaryActions?: ReactNode;
  className?: string;
}

/**
 * Consistent page header: title + subtitle + primary action.
 * Secondary actions appear after the primary on desktop.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  secondaryActions,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`}>
      <div className="page-header-text">
        <h1 className="page-header-title">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {(action || secondaryActions) && (
        <div className="page-header-actions">
          {secondaryActions}
          {action}
        </div>
      )}
    </header>
  );
}
