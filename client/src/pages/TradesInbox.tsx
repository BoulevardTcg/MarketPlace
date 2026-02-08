import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { JWT_KEY, getApiUrl, fetchWithAuth } from "../api";

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
  const [jwt, setJwt] = useState<string>(() => localStorage.getItem(JWT_KEY) ?? "");
  const [type, setType] = useState<"sent" | "received">("received");
  const [items, setItems] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveJwt = (value: string) => {
    setJwt(value);
    if (value) localStorage.setItem(JWT_KEY, value);
    else localStorage.removeItem(JWT_KEY);
  };

  useEffect(() => {
    if (!jwt || !getApiUrl()) {
      setItems([]);
      setError(!getApiUrl() ? "VITE_API_URL non configurée" : null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchWithAuth(`/trade/offers?type=${type}&limit=20`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Token invalide" : `Erreur ${res.status}`);
        return res.json();
      })
      .then((data) => setItems(data.data?.items ?? []))
      .catch((err) => {
        setError(err.message);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [jwt, type]);

  return (
    <section>
      <h1 className="page-title">Mes échanges</h1>
      <p className="page-subtitle">
        Consultez vos offres reçues ou envoyées, répondez et négociez en toute confiance.
      </p>

      <div className="jwt-section">
        <label className="label" htmlFor="jwt-input">
          Connexion (JWT Boutique)
        </label>
        <input
          id="jwt-input"
          type="password"
          className="input"
          value={jwt}
          onChange={(e) => saveJwt(e.target.value)}
          placeholder="Collez votre token JWT (émis par la Boutique)"
        />
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="tabs">
        <button
          type="button"
          className={`tab ${type === "received" ? "active" : ""}`}
          onClick={() => setType("received")}
        >
          Reçues
        </button>
        <button
          type="button"
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
        <p style={{ color: "var(--color-text-muted)" }}>Chargement…</p>
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
    </section>
  );
}
