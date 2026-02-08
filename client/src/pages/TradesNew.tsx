import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWithAuth } from "../api";
import {
  type TradeItemRow,
  type Language,
  type CardCondition,
  LANGUAGE_OPTIONS,
  CONDITION_OPTIONS,
  toItemsJson,
} from "../types/trade";

type CollectionItem = {
  id: string;
  cardId: string;
  cardName: string | null;
  setCode: string | null;
  language: Language;
  condition: CardCondition;
  quantity: number;
};

const DEFAULT_EXPIRES_HOURS = 72;

export function TradesNew() {
  const navigate = useNavigate();
  const [receiverUserId, setReceiverUserId] = useState("");
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingCollection, setLoadingCollection] = useState(true);
  const [creatorItems, setCreatorItems] = useState<TradeItemRow[]>([]);
  const [receiverItems, setReceiverItems] = useState<TradeItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadCollection = (cursor?: string) => {
    setLoadingCollection(true);
    const url = cursor
      ? `/collection?limit=50&cursor=${encodeURIComponent(cursor)}`
      : "/collection?limit=50";
    fetchWithAuth(url)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Token invalide" : `Erreur ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const items = (data.data?.items ?? []) as CollectionItem[];
        if (cursor) setCollectionItems((prev) => [...prev, ...items]);
        else setCollectionItems(items);
        setNextCursor(data.data?.nextCursor ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCollection(false));
  };

  useEffect(() => {
    loadCollection();
  }, []);

  const addCreatorItem = (item: CollectionItem, qty: number) => {
    if (qty < 1 || qty > item.quantity) return;
    setCreatorItems((prev) => {
      const existing = prev.find(
        (x) => x.cardId === item.cardId && x.language === item.language && x.condition === item.condition
      );
      if (existing) {
        const newQty = Math.min(item.quantity, existing.quantity + qty);
        return prev.map((x) =>
          x === existing ? { ...x, quantity: newQty } : x
        );
      }
      return [...prev, { cardId: item.cardId, language: item.language, condition: item.condition, quantity: qty }];
    });
  };

  const removeCreatorItem = (index: number) => {
    setCreatorItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addReceiverItem = () => {
    setReceiverItems((prev) => [
      ...prev,
      { cardId: "", language: "FR", condition: "NM", quantity: 1 },
    ]);
  };

  const updateReceiverItem = (index: number, patch: Partial<TradeItemRow>) => {
    setReceiverItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const removeReceiverItem = (index: number) => {
    setReceiverItems((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const receiverId = receiverUserId.trim();
    if (!receiverId) {
      setError("Indiquez l’utilisateur destinataire.");
      return;
    }
    const validReceiver = receiverItems.filter(
      (r) => r.cardId.trim() && r.quantity >= 1
    );
    if (creatorItems.length === 0 && validReceiver.length === 0) {
      setError("Ajoutez au moins un item (ce que vous donnez ou ce que vous demandez).");
      return;
    }
    setSubmitting(true);
    fetchWithAuth("/trade/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiverUserId: receiverId,
        creatorItemsJson: toItemsJson(creatorItems),
        receiverItemsJson: toItemsJson(validReceiver.length ? validReceiver : []),
        expiresInHours: DEFAULT_EXPIRES_HOURS,
      }),
    })
      .then((res) => {
        const data = res.json().then((d) => d).catch(() => ({}));
        if (!res.ok) return data.then((d) => { throw new Error(d?.error?.message ?? `Erreur ${res.status}`); });
        return data;
      })
      .then((data) => {
        const id = data?.data?.tradeOfferId;
        if (id) navigate(`/trades/${id}`, { replace: true });
        else setError("Réponse invalide.");
      })
      .catch((err) => setError(err.message ?? "Erreur"))
      .finally(() => setSubmitting(false));
  };

  return (
    <section>
      <Link to="/trades" className="back-link">
        ← Retour aux échanges
      </Link>

      <h1 className="page-title">Nouvelle offre d’échange</h1>
      <p className="page-subtitle">
        Choisissez les cartes que vous proposez et celles que vous souhaitez en échange.
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={submit}>
        <div className="card card-body" style={{ marginBottom: "var(--space-6)" }}>
          <h3 className="card-title">Destinataire</h3>
          <div className="form-group">
            <label className="label" htmlFor="receiver">
              Utilisateur destinataire (userId)
            </label>
            <input
              id="receiver"
              type="text"
              className="input"
              value={receiverUserId}
              onChange={(e) => setReceiverUserId(e.target.value)}
              placeholder="ID du receveur"
              style={{ maxWidth: "20rem" }}
            />
          </div>
        </div>

        <div className="card card-body" style={{ marginBottom: "var(--space-6)" }}>
          <h3 className="card-title">Ce que je donne (ma collection)</h3>
          {loadingCollection && collectionItems.length === 0 && (
            <p style={{ color: "var(--color-text-muted)" }}>Chargement…</p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {collectionItems.map((item) => (
              <li key={item.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>
                  {item.cardId} · {item.language} · {item.condition} · qty {item.quantity}
                </span>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={item.quantity}
                  defaultValue={1}
                  style={{ width: "4rem" }}
                  id={`qty-${item.id}`}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const el = document.getElementById(`qty-${item.id}`) as HTMLInputElement | null;
                    const qty = el ? parseInt(el.value, 10) : 1;
                    addCreatorItem(item, isNaN(qty) ? 1 : Math.max(1, Math.min(item.quantity, qty)));
                  }}
                >
                  Ajouter
                </button>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <button type="button" className="btn btn-ghost" onClick={() => loadCollection(nextCursor)} style={{ marginTop: "var(--space-2)" }}>
              Charger plus
            </button>
          )}
          {creatorItems.length > 0 && (
            <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
              <p style={{ marginBottom: "var(--space-2)", fontWeight: "var(--font-medium)" }}>Items sélectionnés</p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {creatorItems.map((row, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                    <span style={{ fontSize: "var(--text-sm)" }}>{row.cardId} · {row.language} · {row.condition} · {row.quantity}</span>
                    <button type="button" className="btn btn-ghost" onClick={() => removeCreatorItem(i)}>Retirer</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card card-body" style={{ marginBottom: "var(--space-6)" }}>
          <h3 className="card-title">Ce que je demande</h3>
          <button type="button" className="btn btn-secondary" onClick={addReceiverItem} style={{ marginBottom: "var(--space-3)" }}>
            Ajouter une ligne
          </button>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {receiverItems.map((row, i) => (
              <li key={i} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <input
                  type="text"
                  className="input"
                  placeholder="cardId"
                  value={row.cardId}
                  onChange={(e) => updateReceiverItem(i, { cardId: e.target.value })}
                  style={{ width: "10rem" }}
                />
                <select
                  className="input"
                  value={row.language}
                  onChange={(e) => updateReceiverItem(i, { language: e.target.value as Language })}
                  style={{ width: "6rem" }}
                >
                  {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <select
                  className="input"
                  value={row.condition}
                  onChange={(e) => updateReceiverItem(i, { condition: e.target.value as CardCondition })}
                  style={{ width: "5rem" }}
                >
                  {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="number"
                  className="input"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateReceiverItem(i, { quantity: parseInt(e.target.value, 10) || 1 })}
                  style={{ width: "4rem" }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => removeReceiverItem(i)}>Retirer</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="btn-group">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Création…" : "Créer l’offre"}
          </button>
          <Link to="/trades" className="btn btn-ghost">Annuler</Link>
        </div>
      </form>
    </section>
  );
}
