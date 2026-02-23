import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiUrl, fetchWithAuth } from "../api";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components";

type OfferItem = {
  id: string;
  status: string;
  creatorUserId: string;
  receiverUserId: string;
  createdAt: string;
  lastMessage: { id: string; body: string; createdAt: string; senderUserId: string } | null;
  unreadCount: number;
};

const statusLabel: Record<string, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
  EXPIRED: "Expirée",
};

export function TradesInbox() {
  const { isAuthenticated } = useAuth();
  const [type, setType] = useState<"sent" | "received">("received");
  const [items, setItems] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !getApiUrl()) {
      setItems([]);
      setError(!getApiUrl() ? "VITE_API_URL non configurée" : null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWithAuth(`/trade/offers?type=${type}&limit=20`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Token invalide" : `Erreur ${res.status}`);
        return res.json();
      })
      .then((data) => { if (!cancelled) setItems(data.data?.items ?? []); })
      .catch((err) => {
        if (!cancelled) { setError(err.message); setItems([]); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAuthenticated, type]);

  return (
    <section>
      <PageHeader
        title="Mes échanges"
        subtitle="Consultez vos offres reçues ou envoyées, répondez et négociez en toute confiance."
        action={
          isAuthenticated ? (
            <Link to="/trades/new" className="btn btn-primary">
              Nouvelle offre
            </Link>
          ) : undefined
        }
      />
      {!isAuthenticated && (
        <div className="card card-body" style={{ marginBottom: "var(--space-4)" }}>
          <p style={{ margin: "0 0 var(--space-3)", color: "var(--color-text-muted)" }}>
            Connectez-vous avec votre compte BoulevardTCG pour voir vos offres d'échange.
          </p>
          <Link to="/connexion?returnTo=/trades" className="btn btn-primary">
            Se connecter
          </Link>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {isAuthenticated && (
        <>
          <div className="tabs" role="tablist" aria-label="Type d'offres">
            <button
              type="button"
              role="tab"
              aria-selected={type === "received"}
              className={`tab ${type === "received" ? "active" : ""}`}
              onClick={() => setType("received")}
            >
              Reçues
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={type === "sent"}
              className={`tab ${type === "sent" ? "active" : ""}`}
              onClick={() => setType("sent")}
            >
              Envoyées
            </button>
          </div>

          <div className="btn-group" style={{ marginBottom: "var(--space-4)" }}>
            <Link to="/trades/new" className="btn btn-primary">
              Nouvelle offre
            </Link>
          </div>

          {loading && (
            <p style={{ color: "var(--color-text-muted)" }} role="status" aria-live="polite">Chargement…</p>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="card card-body empty-state">
              {type === "received" ? "Aucune offre reçue." : "Aucune offre envoyée."}
              <br />
              <Link to="/trades/new" className="btn btn-primary" style={{ marginTop: "var(--space-4)" }}>
                Créer une offre
              </Link>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((offer) => (
                <li key={offer.id}>
                  <Link to={`/trades/${offer.id}`} className="offer-card">
                    <div className="offer-card-header">
                      <span className="offer-card-id">Offre {offer.id.slice(0, 8)}…</span>
                      <span className={`badge badge-status ${offer.status.toLowerCase()}`}>
                        {statusLabel[offer.status] ?? offer.status}
                      </span>
                      {offer.unreadCount > 0 && (
                        <span className="badge badge-unread">
                          {offer.unreadCount} non lu{offer.unreadCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {offer.lastMessage && (
                      <p className="offer-card-preview">
                        {offer.lastMessage.body.slice(0, 80)}{offer.lastMessage.body.length > 80 ? "…" : ""}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
