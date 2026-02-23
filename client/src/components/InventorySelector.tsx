import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getCardDetailsFromMarket } from "../api";
import { GAME_LABELS, LANGUAGE_LABELS, CONDITION_LABELS } from "../types/marketplace";
import type { Language, CardCondition, Game } from "../types/marketplace";
import { sanitizeImageUrl } from "../utils/listing";

/** Item de l’inventaire (collection) affiché dans le sélecteur. */
export interface InventorySelectorItem {
  id: string;
  cardId: string;
  cardName: string | null;
  setCode: string | null;
  game: Game | null;
  language: Language;
  condition: CardCondition;
  quantity: number;
}

export interface InventorySelectorProps {
  items: InventorySelectorItem[];
  loading?: boolean;
  selected: InventorySelectorItem | null;
  onSelect: (item: InventorySelectorItem | null) => void;
  /** Langue utilisée pour récupérer l’image TCGdex (optionnel). */
  imageLanguage?: string;
}

/** Placeholder color by game for card thumb. */
const GAME_COLORS: Record<string, string> = {
  POKEMON: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  MTG: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
  YUGIOH: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
  ONE_PIECE: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  LORCANA: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
  OTHER: "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)",
};

function getGameGradient(game: string | null): string {
  return GAME_COLORS[game ?? "OTHER"] ?? GAME_COLORS.OTHER;
}

export function InventorySelector({
  items,
  loading = false,
  selected,
  onSelect,
  imageLanguage = "FR",
}: InventorySelectorProps) {
  if (loading) {
    return (
      <div className="inventory-selector" aria-busy="true">
        <p className="inventory-selector-title">Votre inventaire</p>
        <div className="inventory-selector-grid" role="list">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="inventory-selector-card inventory-selector-card--skeleton" aria-hidden="true">
              <div className="inventory-selector-card__thumb" />
              <div className="inventory-selector-card__body">
                <span className="inventory-selector-card__skeleton-line" style={{ width: "80%" }} />
                <span className="inventory-selector-card__skeleton-line" style={{ width: "50%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="inventory-selector">
        <p className="inventory-selector-title">Votre inventaire</p>
        <div className="inventory-selector-empty">
          <span className="inventory-selector-empty-icon" aria-hidden="true">📦</span>
          <p>Aucune carte dans votre inventaire.</p>
          <p className="inventory-selector-empty-hint">
            Ajoutez des cartes depuis votre <Link to="/portfolio">Portfolio</Link> pour les proposer à la vente en un clic.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-selector">
      <div className="inventory-selector-header">
        <p className="inventory-selector-title">Choisir une carte de votre inventaire</p>
        <p className="inventory-selector-subtitle">
          Cliquez sur une carte : les champs du formulaire se remplissent automatiquement.
        </p>
        {selected && (
          <button
            type="button"
            className="btn btn-ghost btn-sm inventory-selector-clear"
            onClick={() => onSelect(null)}
          >
            Désélectionner
          </button>
        )}
      </div>
      <div className="inventory-selector-grid" role="list" aria-label="Cartes de l’inventaire">
        {items.map((item) => (
          <InventoryCard
            key={item.id}
            item={item}
            isSelected={selected?.id === item.id}
            onSelect={() => onSelect(selected?.id === item.id ? null : item)}
            imageLanguage={imageLanguage}
          />
        ))}
      </div>
    </div>
  );
}

interface InventoryCardProps {
  item: InventorySelectorItem;
  isSelected: boolean;
  onSelect: () => void;
  imageLanguage: string;
}

function InventoryCard({ item, isSelected, onSelect, imageLanguage }: InventoryCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const gameGradient = getGameGradient(item.game);
  const initial = (item.cardName || item.cardId || "?").charAt(0).toUpperCase();

  useEffect(() => {
    let cancelled = false;
    getCardDetailsFromMarket(item.cardId, { language: imageLanguage })
      .then((d) => {
        if (!cancelled && d?.image) setImageUrl(sanitizeImageUrl(d.image) ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.cardId, imageLanguage]);

  return (
    <button
      type="button"
      className={`inventory-selector-card ${isSelected ? "inventory-selector-card--selected" : ""}`}
      onClick={onSelect}
      role="listitem"
      aria-pressed={isSelected}
      aria-label={`Sélectionner ${item.cardName || item.cardId} — ${LANGUAGE_LABELS[item.language]} — ${CONDITION_LABELS[item.condition]} — Quantité ${item.quantity}`}
    >
      <div
        className="inventory-selector-card__thumb"
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : { background: gameGradient }}
      >
        {!imageUrl && <span className="inventory-selector-card__initial">{initial}</span>}
      </div>
      <div className="inventory-selector-card__body">
        <span className="inventory-selector-card__name">{item.cardName || item.cardId}</span>
        <span className="inventory-selector-card__meta">
          {item.setCode && `${item.setCode} · `}
          {GAME_LABELS[item.game ?? "OTHER"]} · {LANGUAGE_LABELS[item.language]} · {CONDITION_LABELS[item.condition]}
        </span>
        <span className="inventory-selector-card__qty">Qté : {item.quantity}</span>
      </div>
      {isSelected && (
        <span className="inventory-selector-card__check" aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}
