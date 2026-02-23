import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchWithAuth, getAccessToken } from "../api";
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
import { PageHeader, CardAutocomplete, InventorySelector } from "../components";
import { parseEurosToCents, parseQuantity } from "../utils/listing";

/** Item de l'inventaire (collection) — permet de proposer un item en vente et lier l'annonce. */
export interface CollectionItemForListing {
  id: string;
  cardId: string;
  cardName: string | null;
  setCode: string | null;
  game: Game | null;
  language: Language;
  condition: CardCondition;
  quantity: number;
}

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

export interface CreateListingForm {
  title: string;
  description: string;
  category: ListingCategory;
  game: Game;
  language: Language;
  condition: CardCondition;
  setCode: string;
  cardName: string;
  cardId: string;
  edition: string;
  priceEuros: string;
  quantity: string;
  publishNow: boolean;
}

const defaultForm: CreateListingForm = {
  title: "",
  description: "",
  category: "CARD",
  game: "POKEMON",
  language: "FR",
  condition: "NM",
  setCode: "",
  cardName: "",
  cardId: "",
  edition: "",
  priceEuros: "",
  quantity: "1",
  publishNow: true,
};

export function CreateListing() {
  const location = useLocation();
  const [form, setForm] = useState<CreateListingForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [publishDone, setPublishDone] = useState(false);
  const [collectionItems, setCollectionItems] = useState<CollectionItemForListing[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [selectedFromInventory, setSelectedFromInventory] = useState<CollectionItemForListing | null>(null);

  const hasAuth = !!getAccessToken();

  useEffect(() => {
    if (!hasAuth) return;
    let cancelled = false;
    setLoadingCollection(true);
    fetchWithAuth("/collection?limit=100")
      .then((res) => {
        if (!res.ok) return res.json().then(() => []);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const items = (data.data?.items ?? data?.items ?? []) as CollectionItemForListing[];
        setCollectionItems(items);
        const prefill = (location.state as { prefillFromInventory?: { cardId: string; language: string; condition: string } })?.prefillFromInventory;
        if (prefill && items.length > 0) {
          const match = items.find(
            (i) =>
              i.cardId === prefill.cardId &&
              i.language === prefill.language &&
              i.condition === prefill.condition,
          );
          if (match) {
            setSelectedFromInventory(match);
            setForm((prev) => ({
              ...prev,
              game: (match.game ?? "POKEMON") as Game,
              cardId: match.cardId,
              cardName: match.cardName ?? "",
              setCode: match.setCode ?? "",
              language: match.language,
              condition: match.condition,
              quantity: "1",
              title: prev.title || (match.cardName ?? match.cardId) || prev.title,
            }));
          }
        }
      })
      .catch(() => { if (!cancelled) setCollectionItems([]); })
      .finally(() => { if (!cancelled) setLoadingCollection(false); });
    return () => { cancelled = true; };
  }, [hasAuth, location.state]);

  const update = (key: keyof CreateListingForm, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const applyInventoryItem = (item: CollectionItemForListing | null) => {
    setSelectedFromInventory(item);
    if (!item) return;
    setForm((prev) => ({
      ...prev,
      game: (item.game ?? "POKEMON") as Game,
      cardId: item.cardId,
      cardName: item.cardName ?? "",
      setCode: item.setCode ?? "",
      language: item.language,
      condition: item.condition,
      quantity: "1",
      title: prev.title || (item.cardName ?? item.cardId) || prev.title,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAuth) {
      setError("Connectez-vous pour créer une annonce.");
      return;
    }
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
      const res = await fetchWithAuth("/marketplace/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: form.description.trim() || undefined,
          category: form.category,
          game: form.game,
          language: form.language,
          condition: form.condition,
          setCode: form.setCode.trim() || undefined,
          cardName: form.cardName.trim() || undefined,
          cardId: form.cardId.trim() || undefined,
          edition: form.edition.trim() || undefined,
          priceCents,
          quantity,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || `Erreur ${res.status}`);
      }
      const data = await res.json();
      const listingId = data.data?.listingId;
      if (!listingId) throw new Error("Réponse invalide");
      setCreatedId(listingId);

      if (form.publishNow) {
        const pubRes = await fetchWithAuth(
          `/marketplace/listings/${listingId}/publish`,
          { method: "POST" },
        );
        if (pubRes.ok) setPublishDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasAuth) {
    return (
      <section className="card card-body">
        <PageHeader
          title="Créer une annonce"
          subtitle="Connectez-vous pour déposer une annonce (carte, booster, accessoire)."
          action={
            <Link to="/connexion" className="btn btn-primary">
              Se connecter
            </Link>
          }
        />
      </section>
    );
  }

  if (createdId) {
    return (
      <section className="card card-body">
        <h1 className="page-title">
          {publishDone ? "Annonce publiée" : "Annonce créée en brouillon"}
        </h1>
        <p className="page-subtitle">
          {publishDone
            ? "Votre annonce est en ligne. Les acheteurs peuvent la voir sur le marketplace."
            : "Vous pouvez la publier plus tard depuis Mes annonces."}
        </p>
        <div className="create-listing-actions">
          <Link to={`/marketplace/${createdId}`} className="btn btn-primary">
            Voir l&apos;annonce
          </Link>
          <Link to="/annonces" className="btn btn-secondary">
            Mes annonces
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setCreatedId(null);
              setPublishDone(false);
              setForm(defaultForm);
            }}
          >
            Créer une autre annonce
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="create-listing-page">
      <PageHeader
        title="Créer une annonce"
        subtitle="Décrivez votre carte, booster ou accessoire. Un ou plusieurs exemplaires — vous choisissez la quantité."
      />
      <form onSubmit={handleSubmit} className="card card-body create-listing-form">
        {error && (
          <div className="create-listing-error" role="alert">
            {error}
          </div>
        )}

        <div className="create-listing-inventory">
          <InventorySelector
            items={collectionItems}
            loading={loadingCollection}
            selected={selectedFromInventory}
            onSelect={applyInventoryItem}
            imageLanguage={form.language}
          />
          {selectedFromInventory && (
            <p className="create-listing-hint create-listing-inventory-hint">
              Annonce liée à votre inventaire. À la vente, la quantité sera déduite automatiquement. Max. {selectedFromInventory.quantity} exemplaire{selectedFromInventory.quantity > 1 ? "s" : ""}.
            </p>
          )}
          {!selectedFromInventory && (
            <div className="create-listing-field" style={{ marginTop: "var(--space-4)" }}>
              <label>Ou rechercher une carte (sans lien inventaire)</label>
              <CardAutocomplete
                placeholder="ex. Pikachu, Charizard…"
                aria-label="Recherche de carte pour l'annonce"
                language={form.language}
                onSelect={({ cardId, cardName, setCode, setName, pricing }) => {
                  const suggested = pricing?.cardmarket?.avg ?? pricing?.cardmarket?.low;
                  setForm((prev) => ({
                    ...prev,
                    cardId,
                    cardName,
                    setCode: setCode ?? setName ?? prev.setCode,
                    title: prev.title || cardName || prev.title,
                    priceEuros:
                      prev.priceEuros ||
                      (suggested != null ? suggested.toFixed(2).replace(".", ",") : prev.priceEuros),
                  }));
                  setError(null);
                }}
              />
            </div>
          )}
        </div>

        <div className="create-listing-grid">
          <div className="create-listing-field create-listing-field--full">
            <label htmlFor="create-title">Titre *</label>
            <input
              id="create-title"
              type="text"
              className="input"
              placeholder="ex. Charizard Holo Édition Originale"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              minLength={3}
              maxLength={120}
              required
            />
          </div>

          <div className="create-listing-field">
            <label htmlFor="create-category">Type</label>
            <select
              id="create-category"
              className="select"
              value={form.category}
              onChange={(e) => update("category", e.target.value as ListingCategory)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="create-listing-field">
            <label htmlFor="create-game">Jeu</label>
            <select
              id="create-game"
              className="select"
              value={form.game}
              onChange={(e) => update("game", e.target.value as Game)}
            >
              {GAMES.map((g) => (
                <option key={g} value={g}>
                  {GAME_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
          <div className="create-listing-field">
            <label htmlFor="create-language">Langue</label>
            <select
              id="create-language"
              className="select"
              value={form.language}
              onChange={(e) => update("language", e.target.value as Language)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="create-listing-field">
            <label htmlFor="create-condition">État</label>
            <select
              id="create-condition"
              className="select"
              value={form.condition}
              onChange={(e) => update("condition", e.target.value as CardCondition)}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div className="create-listing-field">
            <label htmlFor="create-price">Prix (€) *</label>
            <input
              id="create-price"
              type="text"
              inputMode="decimal"
              className="input"
              placeholder="9,99"
              value={form.priceEuros}
              onChange={(e) => update("priceEuros", e.target.value)}
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="create-quantity">Quantité</label>
            <input
              id="create-quantity"
              type="number"
              min={1}
              max={selectedFromInventory ? selectedFromInventory.quantity : 999}
              className="input"
              value={form.quantity}
              onChange={(e) => update("quantity", e.target.value)}
            />
            <span className="create-listing-hint">
              {selectedFromInventory
                ? `Max. ${selectedFromInventory.quantity} (inventaire). À la vente, déduction automatique.`
                : "Même carte / même prix pour plusieurs exemplaires"}
            </span>
          </div>

          <div className="create-listing-field create-listing-field--full">
            <label htmlFor="create-description">Description (optionnel)</label>
            <textarea
              id="create-description"
              className="input"
              rows={3}
              maxLength={2000}
              placeholder="Détails, défauts éventuels..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          <div className="create-listing-field">
            <label htmlFor="create-set">Set / Code set</label>
            <input
              id="create-set"
              type="text"
              className="input"
              placeholder="ex. BS-6, OP-05"
              value={form.setCode}
              onChange={(e) => update("setCode", e.target.value)}
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="create-cardname">Nom de la carte</label>
            <input
              id="create-cardname"
              type="text"
              className="input"
              placeholder="ex. Charizard"
              value={form.cardName}
              onChange={(e) => update("cardName", e.target.value)}
            />
          </div>
          <div className="create-listing-field">
            <label htmlFor="create-edition">Édition</label>
            <input
              id="create-edition"
              type="text"
              className="input"
              placeholder="ex. 1ère"
              value={form.edition}
              onChange={(e) => update("edition", e.target.value)}
            />
          </div>
        </div>

        <div className="create-listing-publish-option">
          <label className="create-listing-checkbox">
            <input
              type="checkbox"
              checked={form.publishNow}
              onChange={(e) => update("publishNow", e.target.checked)}
            />
            <span>Publier tout de suite (visible sur le marketplace)</span>
          </label>
          <p className="create-listing-hint">
            Décochez pour enregistrer en brouillon et publier plus tard depuis Mes
            annonces.
          </p>
        </div>

        <div className="create-listing-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? "Création…" : "Créer l'annonce"}
          </button>
          <Link to="/annonces" className="btn btn-ghost">
            Annuler
          </Link>
        </div>
      </form>
    </section>
  );
}
