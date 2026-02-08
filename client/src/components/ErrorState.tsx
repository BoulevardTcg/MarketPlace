interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="alert alert-error" role="alert">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
        <span>{message}</span>
        {onRetry && (
          <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
            Réessayer
          </button>
        )}
      </div>
    </div>
  );
}
