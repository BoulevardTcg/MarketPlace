import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { fetchWithAuth } from "../api";
import {
  parseItemsFromJson,
  toItemsJson,
  type TradeItemRow,
  type Language,
  type CardCondition,
  LANGUAGE_OPTIONS,
  CONDITION_OPTIONS,
} from "../types/trade";

type OfferDetail = {
  id: string;
  status: string;
  creatorUserId: string;
  receiverUserId: string;
  creatorItemsJson?: unknown;
  receiverItemsJson?: unknown;
  counterOf: { id: string; status: string; createdAt: string } | null;
  counters: { id: string; status: string; createdAt: string }[];
  lastMessage: { id: string; body: string; createdAt: string; senderUserId: string } | null;
  unreadCount: number;
  events: { type: string; createdAt: string }[];
};

type MessageItem = { id: string; body: string; createdAt: string; senderUserId: string };

const statusLabel: Record<string, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
  CANCELLED: "Annulée",
  EXPIRED: "Expirée",
};

export function TradeThread() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterCreatorItems, setCounterCreatorItems] = useState<TradeItemRow[]>([]);
  const [counterReceiverItems, setCounterReceiverItems] = useState<TradeItemRow[]>([]);

  const loadMe = () => {
    fetchWithAuth("/me")
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.data?.userId) setCurrentUserId(data.data.userId);
      })
      .catch(() => {});
  };

  const loadOffer = () => {
    if (!id) return;
    setLoadingOffer(true);
    setError(null);
    fetchWithAuth(`/trade/offers/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Token invalide" : `Erreur ${res.status}`);
        return res.json();
      })
      .then((data) => setOffer(data.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingOffer(false));
  };

  const loadMessages = (cursor?: string) => {
    if (!id) return;
    setLoadingMessages(true);
    const url = cursor ? `/trade/offers/${id}/messages?limit=50&cursor=${encodeURIComponent(cursor)}` : `/trade/offers/${id}/messages?limit=50`;
    fetchWithAuth(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Token invalide" : `Erreur ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const items = data.data?.items ?? [];
        if (cursor) setMessages((prev) => [...prev, ...items]);
        else setMessages(items);
        setNextCursor(data.data?.nextCursor ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingMessages(false));
  };

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    loadOffer();
  }, [id]);

  useEffect(() => {
    if (!id || !offer) return;
    loadMessages();
  }, [id, offer?.id]);

  useEffect(() => {
    if (!id || !offer || !currentUserId) return;
    if (offer.creatorUserId !== currentUserId && offer.receiverUserId !== currentUserId) return;
    fetchWithAuth(`/trade/offers/${id}/read`, { method: "POST" }).catch(() => {});
  }, [id, offer?.id, currentUserId]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !body.trim() || sending) return;
    setSending(true);
    fetchWithAuth(`/trade/offers/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Token invalide" : `Erreur ${res.status}`);
        setBody("");
        loadMessages();
        loadOffer();
      })
      .catch((err) => setError(err.message))
      .finally(() => setSending(false));
  };

  const handleAction = async (
    action: "accept" | "reject" | "cancel" | "counter",
    bodyPayload?: object
  ) => {
    if (!id || actionLoading) return;
    setActionLoading(action);
    setError(null);
    try {
      const res = await fetchWithAuth(`/trade/offers/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyPayload ? JSON.stringify(bodyPayload) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data?.error?.code;
        const msg = data?.error?.message ?? `Erreur ${res.status}`;
        if (action === "accept" && res.status === 409 && code === "OFFER_COUNTERED") {
          setError("Cette offre a une contre-offre ; acceptez la contre-offre.");
        } else {
          setError(msg);
        }
        return;
      }
      if (action === "counter" && data?.data?.tradeOfferId) {
        navigate(`/trades/${data.data.tradeOfferId}`, { replace: true });
        return;
      }
      loadOffer();
      loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setActionLoading(null);
    }
  };

  const isCreator = currentUserId && offer && offer.creatorUserId === currentUserId;
  const isReceiver = currentUserId && offer && offer.receiverUserId === currentUserId;
  const isParticipant = isCreator || isReceiver;
  const pending = offer?.status === "PENDING";
  const hasCounters = (offer?.counters?.length ?? 0) > 0;
  const canAccept = isReceiver && pending && !hasCounters;

  const openCounterForm = () => {
    if (!offer) return;
    setCounterCreatorItems(parseItemsFromJson(offer.receiverItemsJson));
    setCounterReceiverItems(parseItemsFromJson(offer.creatorItemsJson));
    setShowCounterForm(true);
    setError(null);
  };

  const updateCounterCreatorItem = (index: number, patch: Partial<TradeItemRow>) => {
    setCounterCreatorItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeCounterCreatorItem = (index: number) => {
    setCounterCreatorItems((prev) => prev.filter((_, i) => i !== index));
  };
  const addCounterCreatorItem = () => {
    setCounterCreatorItems((prev) => [...prev, { cardId: "", language: "FR", condition: "NM", quantity: 1 }]);
  };
  const updateCounterReceiverItem = (index: number, patch: Partial<TradeItemRow>) => {
    setCounterReceiverItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeCounterReceiverItem = (index: number) => {
    setCounterReceiverItems((prev) => prev.filter((_, i) => i !== index));
  };
  const addCounterReceiverItem = () => {
    setCounterReceiverItems((prev) => [...prev, { cardId: "", language: "FR", condition: "NM", quantity: 1 }]);
  };

  const submitCounter = () => {
    if (!id || actionLoading) return;
    handleAction("counter", {
      creatorItemsJson: toItemsJson(counterCreatorItems.filter((r) => r.cardId.trim() && r.quantity >= 1)),
      receiverItemsJson: toItemsJson(counterReceiverItems.filter((r) => r.cardId.trim() && r.quantity >= 1)),
      expiresInHours: 72,
    });
  };

  if (!id) return <p>ID manquant.</p>;
  if (loadingOffer && !offer) return <p style={{ color: "var(--color-text-muted)" }}>Chargement…</p>;
  if (error && !offer) return <div className="alert alert-error">{error}</div>;
  if (!offer) return null;

  return (
    <section>
      <Link to="/trades" className="back-link">
        ← Retour aux échanges
      </Link>

      <div className="card card-body" style={{ marginBottom: "var(--space-6)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            Offre {offer.id.slice(0, 8)}…
          </h1>
          <span className={`badge badge-status ${offer.status.toLowerCase()}`}>
            {statusLabel[offer.status] ?? offer.status}
          </span>
          {offer.unreadCount > 0 && (
            <span className="badge badge-unread">{offer.unreadCount} non lu(s)</span>
          )}
        </div>
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
          Créateur : <strong>{offer.creatorUserId}</strong> · Receveur : <strong>{offer.receiverUserId}</strong>
        </p>
        {offer.counterOf && (
          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)" }}>
            Contre-offre de : <Link to={`/trades/${offer.counterOf.id}`} className="nav-link" style={{ display: "inline-block" }}>{offer.counterOf.id.slice(0, 8)}…</Link>
          </p>
        )}
        {offer.counters.length > 0 && (
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)" }}>
            Contre-offres : {offer.counters.map((c) => (
              <Link key={c.id} to={`/trades/${c.id}`} className="nav-link" style={{ marginRight: "var(--space-2)" }}>{c.id.slice(0, 8)}…</Link>
            ))}
          </p>
        )}

        {isParticipant && pending && (
          <div className="btn-group" style={{ marginTop: "var(--space-4)" }}>
            {isReceiver && (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={actionLoading !== null || !canAccept}
                  onClick={() => handleAction("accept")}
                  title={hasCounters ? "Une contre-offre existe ; acceptez la contre-offre." : undefined}
                >
                  {actionLoading === "accept" ? "Envoi…" : "Accepter"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={actionLoading !== null}
                  onClick={openCounterForm}
                >
                  Contre-offre
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={actionLoading !== null}
                  onClick={() => handleAction("reject")}
                >
                  {actionLoading === "reject" ? "…" : "Refuser"}
                </button>
                {hasCounters && (
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                    Une contre-offre existe.
                  </span>
                )}
              </>
            )}
            {isCreator && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={actionLoading !== null}
                onClick={() => handleAction("cancel")}
              >
                {actionLoading === "cancel" ? "…" : "Annuler l’offre"}
              </button>
            )}
          </div>
        )}
      </div>

      {showCounterForm && isReceiver && (
        <div className="card card-body" style={{ marginBottom: "var(--space-6)" }}>
          <h3 className="card-title">Contre-offre — modifier les items</h3>
          <p style={{ marginBottom: "var(--space-2)", fontWeight: "var(--font-medium)" }}>Ce que je donne</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-4)" }}>
            {counterCreatorItems.map((row, i) => (
              <li key={i} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <input type="text" className="input" placeholder="cardId" value={row.cardId} onChange={(e) => updateCounterCreatorItem(i, { cardId: e.target.value })} style={{ width: "10rem" }} />
                <select className="input" value={row.language} onChange={(e) => updateCounterCreatorItem(i, { language: e.target.value as Language })} style={{ width: "6rem" }}>
                  {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <select className="input" value={row.condition} onChange={(e) => updateCounterCreatorItem(i, { condition: e.target.value as CardCondition })} style={{ width: "5rem" }}>
                  {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min={1} className="input" value={row.quantity} onChange={(e) => updateCounterCreatorItem(i, { quantity: parseInt(e.target.value, 10) || 1 })} style={{ width: "4rem" }} />
                <button type="button" className="btn btn-ghost" onClick={() => removeCounterCreatorItem(i)}>Retirer</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={addCounterCreatorItem}>Ajouter une ligne</button>
          <p style={{ margin: "var(--space-4) 0 var(--space-2)", fontWeight: "var(--font-medium)" }}>Ce que je demande</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-4)" }}>
            {counterReceiverItems.map((row, i) => (
              <li key={i} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <input type="text" className="input" placeholder="cardId" value={row.cardId} onChange={(e) => updateCounterReceiverItem(i, { cardId: e.target.value })} style={{ width: "10rem" }} />
                <select className="input" value={row.language} onChange={(e) => updateCounterReceiverItem(i, { language: e.target.value as Language })} style={{ width: "6rem" }}>
                  {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <select className="input" value={row.condition} onChange={(e) => updateCounterReceiverItem(i, { condition: e.target.value as CardCondition })} style={{ width: "5rem" }}>
                  {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min={1} className="input" value={row.quantity} onChange={(e) => updateCounterReceiverItem(i, { quantity: parseInt(e.target.value, 10) || 1 })} style={{ width: "4rem" }} />
                <button type="button" className="btn btn-ghost" onClick={() => removeCounterReceiverItem(i)}>Retirer</button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={addCounterReceiverItem}>Ajouter une ligne</button>
          <div className="btn-group" style={{ marginTop: "var(--space-4)" }}>
            <button type="button" className="btn btn-primary" disabled={actionLoading !== null} onClick={submitCounter}>
              {actionLoading === "counter" ? "Envoi…" : "Envoyer la contre-offre"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowCounterForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <h3 className="card-title">Messages</h3>
          {loadingMessages && messages.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Chargement…</p>}
          {nextCursor && (
            <button type="button" className="btn btn-ghost" onClick={() => loadMessages(nextCursor)} style={{ marginBottom: "var(--space-3)" }}>
              Messages précédents
            </button>
          )}
          <ul className="messages-list">
            {messages.map((m) => (
              <li key={m.id} className="message-item">
                <div className="message-meta">
                  <span className="message-sender">{m.senderUserId}</span>
                  {" · "}
                  {new Date(m.createdAt).toLocaleString("fr-FR")}
                </div>
                <div>{m.body}</div>
              </li>
            ))}
          </ul>

          <form onSubmit={sendMessage} style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <input
              type="text"
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Écrire un message…"
              maxLength={2000}
              style={{ flex: "1", minWidth: "200px" }}
            />
            <button type="submit" className="btn btn-primary" disabled={sending || !body.trim()}>
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          </form>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: "var(--space-4)" }}>{error}</div>}
    </section>
  );
}
