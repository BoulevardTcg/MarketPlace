interface LoadMoreButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export function LoadMoreButton({ onClick, loading = false }: LoadMoreButtonProps) {
  return (
    <div style={{ textAlign: "center", marginTop: "var(--space-6)" }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onClick}
        disabled={loading}
      >
        {loading ? "Chargement..." : "Voir plus"}
      </button>
    </div>
  );
}
