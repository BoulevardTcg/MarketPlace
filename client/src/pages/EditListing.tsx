import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchWithAuth, getAccessToken } from "../api";
import type { Listing } from "../types/marketplace";
import type {
  Game,
  Language,
  CardCondition,
  ListingCategory,
} from "../types/marketplace";
import {
  GAME_LABELS,
  LANGUAGE_LABELS,
  CONDITION_LABELS,
  CATEGORY_LABELS,
} from "../types/marketplace";
import { ErrorState, PageHeader, CardAutocomplete } from "../components";
import type { CreateListingForm, CollectionItemForListing } from "./CreateListing";
import { parseEurosToCents, parseQuantity } from "../utils/listing";

const GAMES: Game[] = [
  "POKEMON",
  "MTG",
  "YUGIOH",
  "ONE_PIECE",
  "LORCANA",
  "OTHER",
];
const CATEGORIES: ListingCategory[] = ["CARD", "SEALED", "ACCESSORY"];
const LANGUAGES: Language[] = ["FR", "EN", "JP", "DE", "ES", "IT", "OTHER"];
const CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];

function listingToForm(listing: Listing): CreateListingForm {
  return {
    title: listing.title,
    description: listing.description ?? "",
    category: listing.category,
    game: listing.game as Game,
    language: listing.language,
    condition: listing.condition,
    setCode: listing.setCode ?? "",
    cardName: listing.cardName ?? "",
    cardId: listing.cardId ?? "",
    edition: listing.edition ?? "",
    priceEuros: (listing.priceCents / 100).toFixed(2).replace(".", ","),
    quantity: String(listing.quantity),
    publishNow: false,
  };
}

export function EditListing() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<CreateListingForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [publishDone, setPublishDone] = useState(false);
  const [collectionItems, setCollectionItems] = useState<CollectionItemForListing[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [selectedFromInventory, setSelectedFromInventory] = useState<CollectionItemForListing | null>(null);
  const hasAuth = !!getAccessToken();

  const load = useCallback(async () => {
    if (!id || !hasAuth) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/marketplace/listings/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Annonce introuvable");
        if (res.status === 403) throw new Error("Vous ne pouvez pas modifier cette annonce.");
        throw new Error(`Erreur ${res.status}`);
      }
      const json = await res.json();
      const data = json.data;
      if (data.status !== "DRAFT") {
        throw new Error("Seules les annonces en brouillon peuvent être modifiées.");
      }
      setForm(listingToForm(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [id, hasAuth]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!hasAuth || !form) return;
    setLoadingCollection(true);
    fetchWithAuth("/collection?limit=100")
      .then((res) => {
        if (!res.ok) return res.json().then(() => []);
        return res.json();
      })
      .then((data) => {
        const items = (data.data?.items ?? data?.items ?? []) as CollectionItemForListing[];
        setCollectionItems(items);
      })
      .catch(() => setCollectionItems([]))
      .finally(() => setLoadingCollection(false));
  }, [hasAuth, form != null]);

  const applyInventoryItem = (item: CollectionItemForListing | null) => {
    setSelectedFromInventory(item);
    if (!item || !form) return;
    setForm((prev) =>
      prev
        ? {
            ...prev,
            game: (item.game ?? "POKEMON") as Game,
            cardId: item.cardId,
            cardName: item.cardName ?? "",
            setCode: item.setCode ?? "",
            language: item.language,
            condition: item.condition,
            quantity: String(Math.min(parseQuantity(prev.quantity), item.quantity)),
          }
        : prev,
    );
  };

  const update = (key: keyof CreateListingForm, value: string | boolean) => {
    setForm((prev) => prev && { ...prev, [key]: value });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form) return;
    const title = form.title.trim();
    if (title.length < 3) {
      setError("Le titre doit faire au moins 3 caractères.");
      return;
    }
    const priceCents = parseEurosToCents(form.priceEuros);
    if (priceCents <= 0) {
      setError("Indiquez un prix valide (ex. 9,99).");
      return;
    }
    const quantity = parseQuantity(form.quantity);

    if (selectedFromInventory && quantity > selectedFromInventory.quantity) {
      setError(
        `La quantité ne peut pas dépasser ${selectedFromInventory.quantity} (disponible dans votre inventaire).`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/marketplace/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: form.description.trim() || null,
          category: form.category,
          game: form.game,
          language: form.language,
          condition: form.condition,
          setCode: form.setCode.trim() || null,
          cardName: form.cardName.trim() || null,
          cardId: form.cardId.trim() || null,
          edition: form.edition.trim() || null,
          priceCents,
          quantity,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || `Erreur ${res.status}`);
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (!id) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/marketplace/listings/${id}/publish`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setPublishDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la publication.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasAuth) {
    return (
      <section className="card card-body">
        <PageHeader
          title="Modifier l'annonce"
          subtitle="Connectez-vous pour modifier vos annonces."
          action={
            <Link to="/connexion" className="btn btn-primary">
              Se connecter
            </Link>
          }
        />
      </section>
    );
  }

  if (loading) {
    return (
      <section className="card card-body">
        <p className="page-subtitle">Chargement…</p>
      </section>
    );
  }

  if (error && !form) {
    return (
      <section className="card card-body">
        <ErrorState message={error} onRetry={load} />
        <Link to="/annonces" className="btn btn-ghost" style={{ marginTop: "var(--space-3)" }}>
          Retour à Mes annonces
        </Link>
      </section>
    );
  }

  if (!form) {
    return (
      <section className="card card-body">
        <p className="page-subtitle">Chargement…</p>
      </section>
    );
  }

  if (saved || publishDone) {
    return (
      <section className="card card-body">
        <h1 className="page-title">
          {publishDone ? "Annonce publiée" : "Modifications enregistrées"}
        </h1>
        <p className="page-subtitle">
          {publishDone
            ? "Votre annonce est en ligne sur le marketplace."
            : "Vous pouvez la publier quand vous voulez depuis Mes annonces."}
        </p>
        <div className="create-listing-actions">
          <Link to={`/marketplace/${id}`} className="btn btn-primary">
            Voir l&apos;annonce
          </Link>
          <Link to="/annonces" className="btn btn-secondary">
            Mes annonces
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="create-listing-page">
      <PageHeader
        title="Modifier l'annonce"
        subtitle="Brouillon — modifiez les champs puis enregistrez ou publiez."
      />

      <form onSubmit={handleSubmit} className="card card-body create-listing-form">
        {error && (
          <div className="create-listing-error" role="alert">
            {error}
          </div>
        )}

        <div className="create-listing-inventory">
          <label htmlFor="edit-from-inventory">Proposer un item de l&apos;inventaire</label>
          <select
            id="edit-from-inventory"
            className="select"
            value={selectedFromInventory?.id ?? ""}
            onChange={(e) => {
              const itemId = e.target.value;
              const item = itemId ? collectionItems.find((i) => i.id === itemId) ?? null : null;
              applyInventoryItem(item);
            }}
            disabled={loadingCollection}
          >
            <option value="">— Sans lien inventaire</option>
            {collectionItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.cardName || item.cardId} — {LANGUAGE_LABELS[item.language]} — {CONDITION_LABELS[item.condition]} — Qté: {item.quantity}
              </option>
            ))}
          </select>
          {selectedFromInventory && (
            <p className="create-listing-hint create-listing-inventory-hint">
              Annonce liée à votre inventaire. Max. {selectedFromInventory.quantity} exemplaire{selectedFromInventory.quantity > 1 ? "s" : ""}.
            </p>
          )}
          {form && form.game === "POKEMON" && !selectedFromInventory && (
            <div className="create-listing-field" style={{ marginTop: "1rem" }}>
              <label>Rechercher une carte (Pokémon)</label>
              <CardAutocomplete
                placeholder="ex. Pikachu, Dracolosse…"
                aria-label="Recherche de carte Pokémon pour l'annonce"
                onSelect={({ cardId, cardName, setCode, setName, pricing }) => {
                  const suggested = pricing?.cardmarket?.avg ?? pricing?.cardmarket?.low;
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          cardId,
                          cardName,
                          setCode: setCode ?? setName ?? prev.setCode,
                          title: prev.title || cardName || prev.title,
                          priceEuros:
                            prev.priceEuros ||
                            (suggested != null ? suggested.toFixed(2).replace(".", ",") : prev.priceEuros),
                        }
                      : prev
                  );
                  setError(null);
                }}
              />
            </div>
          )}
        </div>

        <div className="create-listing-grid">
          <div className="create-listing-field create-listing-field--full">
            <label htmlFor="edit-title">Titre *</label>
            <input
              id="edit-title"
              type="text"
              className="input"
              placeholder="ex. Charizard Holo"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              minLength={3}
              maxLength={120}
              required
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-category">Type</label>
            <select
              id="edit-category"
              className="select"
              value={form.category}
              onChange={(e) => update("category", e.target.value as ListingCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-game">Jeu</label>
            <select
              id="edit-game"
              className="select"
              value={form.game}
              onChange={(e) => update("game", e.target.value as Game)}
            >
              {GAMES.map((g) => (
                <option key={g} value={g}>{GAME_LABELS[g]}</option>
              ))}
            </select>
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-language">Langue</label>
            <select
              id="edit-language"
              className="select"
              value={form.language}
              onChange={(e) => update("language", e.target.value as Language)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>
              ))}
            </select>
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-condition">État</label>
            <select
              id="edit-condition"
              className="select"
              value={form.condition}
              onChange={(e) => update("condition", e.target.value as CardCondition)}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-price">Prix (€) *</label>
            <input
              id="edit-price"
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="9,99"
              value={form.priceEuros}
              onChange={(e) => update("priceEuros", e.target.value)}
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-quantity">Quantité</label>
            <input
              id="edit-quantity"
              type="number"
              min={1}
              max={selectedFromInventory ? selectedFromInventory.quantity : 999}
              className="input"
              value={form.quantity}
              onChange={(e) => update("quantity", e.target.value)}
            />
            {selectedFromInventory && (
              <span className="create-listing-hint">
                Max. {selectedFromInventory.quantity} (inventaire). À la vente, déduction automatique.
              </span>
            )}
          </div>
          <div className="create-listing-field create-listing-field--full">
            <label htmlFor="edit-description">Description (optionnel)</label>
            <textarea
              id="edit-description"
              className="input"
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-set">Set / Code set</label>
            <input
              id="edit-set"
              type="text"
              className="input"
              value={form.setCode}
              onChange={(e) => update("setCode", e.target.value)}
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-cardname">Nom de la carte</label>
            <input
              id="edit-cardname"
              type="text"
              className="input"
              value={form.cardName}
              onChange={(e) => update("cardName", e.target.value)}
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="edit-edition">Édition</label>
            <input
              id="edit-edition"
              type="text"
              className="input"
              value={form.edition}
              onChange={(e) => update("edition", e.target.value)}
            />
          </div>
        </div>

        <div className="create-listing-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={submitting}
            onClick={handlePublish}
          >
            {submitting ? "Publication…" : "Enregistrer et publier"}
          </button>
          <Link to="/annonces" className="btn btn-ghost">
            Annuler
          </Link>
        </div>
      </form>
    </section>
  );
}
