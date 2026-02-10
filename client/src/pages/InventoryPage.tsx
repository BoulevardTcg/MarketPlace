import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchWithAuth, getAccessToken } from "../api";
import type { Language, CardCondition } from "../types/marketplace";
import { LANGUAGE_LABELS, CONDITION_LABELS } from "../types/marketplace";
import { ErrorState, EmptyState, Skeleton } from "../components";

const LANGUAGES: Language[] = ["FR", "EN", "JP", "DE", "ES", "IT", "OTHER"];
const CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

export interface CollectionItem {
  id: string;
  cardId: string;
  cardName: string | null;
  setCode: string | null;
  game: string | null;
  language: Language;
  condition: CardCondition;
  quantity: number;
  isPublic?: boolean;
}

export function InventoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({
    cardId: "",
    cardName: "",
    setCode: "",
    language: "FR" as Language,
    condition: "NM" as CardCondition,
    quantity: "1",
    acquisitionPriceEuros: "",
    acquiredAt: "",
  });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const hasAuth = !!getAccessToken();

  const load = useCallback(
    (cursor?: string | null) => {
      if (!hasAuth) return;
      const isFirst = !cursor;
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const url = cursor
        ? `/collection?limit=30&cursor=${encodeURIComponent(cursor)}`
        : "/collection?limit=30";
      fetchWithAuth(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Erreur ${res.status}`);
          return res.json();
        })
        .then((data) => {
          const list = (data.data?.items ?? data?.items ?? []) as CollectionItem[];
          const next = data.data?.nextCursor ?? data?.nextCursor ?? null;
          if (isFirst) {
            setItems(list);
            setNextCursor(next);
          } else {
            setItems((prev) => [...prev, ...list]);
            setNextCursor(next);
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [hasAuth],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cardId = addForm.cardId.trim();
    if (!cardId) {
      setAddError("Indiquez l'identifiant de la carte (ex. charizard-001).");
      return;
    }
    const quantity = Math.max(1, Math.min(999, parseInt(addForm.quantity, 10) || 1));
    const acquisitionPriceCents = addForm.acquisitionPriceEuros.trim()
      ? Math.round(parseFloat(addForm.acquisitionPriceEuros.replace(",", ".")) * 100) || undefined
      : undefined;
    const acquiredAt = addForm.acquiredAt.trim() ? addForm.acquiredAt : undefined;
    setAddSubmitting(true);
    setAddError(null);
    fetchWithAuth("/collection/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId,
        cardName: addForm.cardName.trim() || undefined,
        setCode: addForm.setCode.trim() || undefined,
        language: addForm.language,
        condition: addForm.condition,
        quantity,
        acquisitionPriceCents: acquisitionPriceCents != null && acquisitionPriceCents >= 0 ? acquisitionPriceCents : undefined,
        acquisitionCurrency: acquisitionPriceCents != null ? "EUR" : undefined,
        acquiredAt: acquiredAt ? new Date(acquiredAt).toISOString() : undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d?.error?.message ?? `Erreur ${res.status}`); });
        setShowAddForm(false);
        setAddForm({ cardId: "", cardName: "", setCode: "", language: "FR", condition: "NM", quantity: "1", acquisitionPriceEuros: "", acquiredAt: "" });
        load();
      })
      .catch((err) => setAddError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setAddSubmitting(false));
  };

  const handleDelete = (item: CollectionItem) => {
    if (!window.confirm(`Retirer "${item.cardName || item.cardId}" (${LANGUAGE_LABELS[item.language]} – ${CONDITION_LABELS[item.condition]}) de l'inventaire ?`)) return;
    setDeleteId(item.id);
    fetchWithAuth("/collection/items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: item.cardId,
        language: item.language,
        condition: item.condition,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`);
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      })
      .catch(() => setDeleteId(null));
  };

  if (!hasAuth) {
    return (
      <section className="card card-body">
        <h1 className="page-title">Mon inventaire</h1>
        <p className="page-subtitle">
          Connectez-vous pour gérer votre collection de cartes.
        </p>
        <Link to="/connexion" className="btn btn-primary">
          Se connecter
        </Link>
      </section>
    );
  }

  return (
    <section className="inventory-page">
      <div className="inventory-header">
        <div>
          <h1 className="page-title">Mon inventaire</h1>
          <p className="page-subtitle">
            Gérez les cartes de votre collection. Liez-les à vos annonces pour déduire automatiquement à la vente.
          </p>
        </div>
        <div className="inventory-actions">
          <Link to="/portfolio" className="btn btn-ghost">
            Voir mon portfolio (valeur)
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setShowAddForm(!showAddForm); setAddError(null); }}
          >
            {showAddForm ? "Annuler" : "Ajouter une carte"}
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="card card-body inventory-add-form">
          <h2 className="card-title">Ajouter une carte</h2>
          {addError && (
            <div className="create-listing-error" role="alert">
              {addError}
            </div>
          )}
          <div className="inventory-add-grid">
            <div className="create-listing-field">
              <label htmlFor="inv-cardId">Identifiant carte *</label>
              <input
                id="inv-cardId"
                type="text"
                className="input"
                placeholder="ex. charizard-001"
                value={addForm.cardId}
                onChange={(e) => setAddForm((f) => ({ ...f, cardId: e.target.value }))}
              />
            </div>
            <div className="create-listing-field">
              <label htmlFor="inv-cardName">Nom de la carte</label>
              <input
                id="inv-cardName"
                type="text"
                className="input"
                placeholder="ex. Charizard"
                value={addForm.cardName}
                onChange={(e) => setAddForm((f) => ({ ...f, cardName: e.target.value }))}
              />
            </div>
            <div className="create-listing-field">
              <label htmlFor="inv-setCode">Set / Code</label>
              <input
                id="inv-setCode"
                type="text"
                className="input"
                placeholder="ex. BS-6"
                value={addForm.setCode}
                onChange={(e) => setAddForm((f) => ({ ...f, setCode: e.target.value }))}
              />
            </div>
            <div className="create-listing-field">
              <label htmlFor="inv-language">Langue</label>
              <select
                id="inv-language"
                className="select"
                value={addForm.language}
                onChange={(e) => setAddForm((f) => ({ ...f, language: e.target.value as Language }))}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
                ))}
              </select>
            </div>
            <div className="create-listing-field">
              <label htmlFor="inv-condition">État</label>
              <select
                id="inv-condition"
                className="select"
                value={addForm.condition}
                onChange={(e) => setAddForm((f) => ({ ...f, condition: e.target.value as CardCondition }))}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div className="create-listing-field">
              <label htmlFor="inv-quantity">Quantité</label>
              <input
                id="inv-quantity"
                type="number"
                min={1}
                max={999}
                className="input"
                value={addForm.quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
            <div className="create-listing-field">
              <label htmlFor="inv-acquisitionPrice">Prix d&apos;acquisition (€)</label>
              <input
                id="inv-acquisitionPrice"
                type="text"
                inputMode="decimal"
                className="input"
                placeholder="ex. 12,50"
                value={addForm.acquisitionPriceEuros}
                onChange={(e) => setAddForm((f) => ({ ...f, acquisitionPriceEuros: e.target.value }))}
              />
              <span className="create-listing-hint">Pour le coût total et le P&L du portfolio.</span>
            </div>
            <div className="create-listing-field">
              <label htmlFor="inv-acquiredAt">Date d&apos;acquisition</label>
              <input
                id="inv-acquiredAt"
                type="date"
                className="input"
                value={addForm.acquiredAt}
                onChange={(e) => setAddForm((f) => ({ ...f, acquiredAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="create-listing-actions">
            <button type="submit" className="btn btn-primary" disabled={addSubmitting}>
              {addSubmitting ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      )}

      {loading && (
        <div className="inventory-skeleton">
          {[1, 2, 3].map((i) => (
            <div key={i} className="inventory-row">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="badge" />
              <Skeleton variant="text" width="15%" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <ErrorState message={error} onRetry={() => load()} />
      )}

      {!loading && !error && items.length === 0 && !showAddForm && (
        <EmptyState
          title="Aucune carte dans l'inventaire"
          description="Ajoutez des cartes pour les proposer en vente ou en échange."
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddForm(true)}
            >
              Ajouter une carte
            </button>
          }
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <ul className="inventory-list" role="list" aria-label="Liste des cartes de l'inventaire">
            {items.map((item) => (
              <li key={item.id} className="inventory-item">
                <div className="inventory-item-main">
                  <span className="inventory-item-name">{item.cardName || item.cardId}</span>
                  <span className="inventory-item-meta">
                    {item.setCode && `${item.setCode} · `}
                    {LANGUAGE_LABELS[item.language]} · {CONDITION_LABELS[item.condition]} · Qté: {item.quantity}
                  </span>
                </div>
                <div className="inventory-item-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() =>
                      navigate("/annonces/new", {
                        state: {
                          prefillFromInventory: {
                            cardId: item.cardId,
                            language: item.language,
                            condition: item.condition,
                          },
                        },
                      })
                    }
                  >
                    Mettre en vente
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={deleteId === item.id}
                    onClick={() => handleDelete(item)}
                  >
                    {deleteId === item.id ? "Suppression…" : "Retirer"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <div className="inventory-load-more">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loadingMore}
                onClick={() => load(nextCursor)}
              >
                {loadingMore ? "Chargement…" : "Voir plus"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
