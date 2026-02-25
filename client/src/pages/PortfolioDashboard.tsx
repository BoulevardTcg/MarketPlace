import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth, getAccessToken, getCardDetails, toTcgdexLang } from "../api";
import type {
  Portfolio,
  PortfolioBreakdownItem,
  PortfolioSnapshot,
  CollectionDashboard,
  SalesSummary,
  CollectionItem,
} from "../types/marketplace";
import type { Language, CardCondition } from "../types/marketplace";
import { formatCents, Skeleton, ErrorState, PageHeader, EmptyState, CardAutocomplete, CardPriceCharts } from "../components";
import { GAME_LABELS, LANGUAGE_LABELS, CONDITION_LABELS } from "../types/marketplace";

const LANGUAGES: Language[] = ["FR", "EN", "JP", "DE", "ES", "IT", "OTHER"];
const CONDITIONS: CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"];
const GAMES: { value: string; label: string }[] = [
  { value: "POKEMON", label: "Pokémon" },
  { value: "ONE_PIECE", label: "One Piece" },
  { value: "MTG", label: "Magic: The Gathering" },
  { value: "YUGIOH", label: "Yu-Gi-Oh!" },
  { value: "LORCANA", label: "Lorcana" },
  { value: "OTHER", label: "Autre TCG" },
];
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ─── Constants ──────────────────────────────────────────────

type Range = "7d" | "30d" | "90d";

const COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#64748b", // slate
];

const RANGE_LABELS: Record<Range, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "90 jours",
};

// ─── Helpers ────────────────────────────────────────────────

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function euroFormatter(value: number): string {
  return `${value.toFixed(2)} €`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${y.slice(2)}`;
}

/** Locale TCGdex pour les assets (images) selon la langue du formulaire */
const LANGUAGE_TO_TCGDEX_LOCALE: Record<Language, string> = {
  FR: "fr",
  EN: "en",
  JP: "ja",
  DE: "de",
  ES: "es",
  IT: "it",
  OTHER: "en",
};

/** Retourne l’URL de base de l’image carte pour la langue sélectionnée (assets TCGdex). */
function getCardImageBaseForLanguage(baseUrl: string, language: Language): string {
  if (!baseUrl || !baseUrl.includes("assets.tcgdex.net")) return baseUrl;
  const locale = LANGUAGE_TO_TCGDEX_LOCALE[language] ?? "en";
  return baseUrl.replace(/^(https:\/\/assets\.tcgdex\.net\/)[^/]+/, `$1${locale}`);
}

// Recharts custom tooltip as render function (inline)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderEuroTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const labelText = typeof label === "number"
    ? new Date(label).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : String(label);
  return (
    <div className="recharts-custom-tooltip">
      <div className="recharts-custom-tooltip-label">{labelText}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="recharts-custom-tooltip-row" style={{ color: entry.color || entry.stroke || "var(--color-text)" }}>
          <span className="recharts-custom-tooltip-dot" style={{ background: entry.color || entry.stroke }} />
          <span>{entry.name} : <strong>{Number(entry.value).toFixed(2)} €</strong></span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderQtyTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="recharts-custom-tooltip">
      <div className="recharts-custom-tooltip-label">{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="recharts-custom-tooltip-row" style={{ color: entry.color || entry.stroke || "var(--color-text)" }}>
          <span className="recharts-custom-tooltip-dot" style={{ background: entry.color || entry.stroke }} />
          <span>{entry.name} : <strong>{entry.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

// ─── Section components ──────────────────────────────────────

function ChartCard({ title, subtitle, children, className = "" }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`chart-card ${className}`}>
      <h3 className="chart-card-title">{title}</h3>
      {subtitle && <p className="chart-card-subtitle">{subtitle}</p>}
      <div className="chart-card-body">{children}</div>
    </div>
  );
}

function KpiTooltip({ text, id }: { text: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.left + rect.width / 2 });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <span className={`kpi-info ${open ? "kpi-info--open" : ""}`} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="kpi-info-trigger"
        aria-expanded={open}
        aria-describedby={id}
        onClick={handleToggle}
      >
        i
      </button>
      {open && createPortal(
        <span
          ref={panelRef}
          id={id}
          className="kpi-info-panel"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="chart-empty">
      <p>{message}</p>
    </div>
  );
}

function DistributionBar({
  items,
  colorOffset = 0,
}: {
  items: { name: string; value: number; costEuros: number }[];
  colorOffset?: number;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (items.length === 0) return null;
  return (
    <div className="dist-list">
      {items.map((item, idx) => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        const color = COLORS[(idx + colorOffset) % COLORS.length];
        return (
          <div key={idx} className="dist-row">
            <div className="dist-row-top">
              <span className="dist-dot" style={{ background: color }} />
              <span className="dist-name">{item.name}</span>
              <span className="dist-count">{item.value}</span>
              <span className="dist-pct">{pct}%</span>
            </div>
            <div className="dist-track">
              <div className="dist-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        );
      })}
      <p className="dist-total">{total} carte{total > 1 ? "s" : ""} au total</p>
    </div>
  );
}

type PnlSortKey = "totalValueCents" | "totalCostCents" | "pnlCents" | "roiPercent";

function PnlBreakdownTable({ items }: { items: PortfolioBreakdownItem[] }) {
  const [sortKey, setSortKey] = useState<PnlSortKey>("totalValueCents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);
  const PAGE = 20;

  const handleSort = (key: PnlSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = b[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [items, sortKey, sortDir]);

  const visible = expanded ? sorted : sorted.slice(0, PAGE);

  const sortIcon = (key: PnlSortKey) => {
    if (sortKey !== key) return <span className="pnl-sort-icon">⇅</span>;
    return <span className="pnl-sort-icon pnl-sort-icon--active">{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  if (items.length === 0) {
    return <EmptyChart message="Aucune carte dans la collection." />;
  }

  return (
    <div className="pnl-breakdown-wrapper">
      <div className="pnl-breakdown-scroll">
        <table className="pnl-breakdown-table">
          <thead>
            <tr>
              <th className="pnl-col-name">Carte</th>
              <th className="pnl-col-meta">Langue · État · Qté</th>
              <th
                className={`pnl-col-num pnl-sortable ${sortKey === "totalValueCents" ? "pnl-sorted" : ""}`}
                onClick={() => handleSort("totalValueCents")}
              >
                Cote totale {sortIcon("totalValueCents")}
              </th>
              <th
                className={`pnl-col-num pnl-sortable ${sortKey === "totalCostCents" ? "pnl-sorted" : ""}`}
                onClick={() => handleSort("totalCostCents")}
              >
                Investi {sortIcon("totalCostCents")}
              </th>
              <th
                className={`pnl-col-num pnl-sortable ${sortKey === "pnlCents" ? "pnl-sorted" : ""}`}
                onClick={() => handleSort("pnlCents")}
              >
                P&L {sortIcon("pnlCents")}
              </th>
              <th
                className={`pnl-col-num pnl-sortable ${sortKey === "roiPercent" ? "pnl-sorted" : ""}`}
                onClick={() => handleSort("roiPercent")}
              >
                ROI {sortIcon("roiPercent")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item, i) => {
              const hasPnl = item.pnlCents != null;
              const positive = hasPnl && item.pnlCents! >= 0;
              return (
                <tr key={`${item.cardId}-${item.language}-${item.condition}-${i}`} className="pnl-row">
                  <td className="pnl-col-name">
                    <span className="pnl-card-name">{item.cardName || item.cardId}</span>
                    {item.setCode && <span className="pnl-card-set">{item.setCode}</span>}
                  </td>
                  <td className="pnl-col-meta">
                    <span className="badge badge-sm">{item.language}</span>
                    {" "}{item.condition}
                    {item.quantity > 1 && <span className="pnl-qty"> ×{item.quantity}</span>}
                  </td>
                  <td className="pnl-col-num">
                    {item.totalValueCents != null ? euroFormatter(item.totalValueCents / 100) : <span className="pnl-na">—</span>}
                  </td>
                  <td className="pnl-col-num">
                    {item.totalCostCents != null ? euroFormatter(item.totalCostCents / 100) : <span className="pnl-na">—</span>}
                  </td>
                  <td className="pnl-col-num" style={{ color: hasPnl ? (positive ? "var(--color-success)" : "var(--color-danger)") : undefined }}>
                    {hasPnl
                      ? `${positive ? "+" : ""}${euroFormatter(item.pnlCents! / 100)}`
                      : <span className="pnl-na">—</span>}
                  </td>
                  <td className="pnl-col-num" style={{ color: item.roiPercent != null ? (item.roiPercent >= 0 ? "var(--color-success)" : "var(--color-danger)") : undefined }}>
                    {item.roiPercent != null
                      ? `${item.roiPercent >= 0 ? "+" : ""}${item.roiPercent} %`
                      : <span className="pnl-na">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE && (
        <div className="pnl-show-more">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Réduire" : `Voir les ${sorted.length - PAGE} autres cartes`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function PortfolioDashboard() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [dashboard, setDashboard] = useState<CollectionDashboard | null>(null);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inventaire (collection) — chargé une fois le portfolio dispo
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [collectionNextCursor, setCollectionNextCursor] = useState<string | null>(null);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [loadingMoreCollection, setLoadingMoreCollection] = useState(false);
  const [errorCollection, setErrorCollection] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cardImageFallbackEn, setCardImageFallbackEn] = useState(false);
  const [addForm, setAddForm] = useState({
    game: "POKEMON",
    cardId: "",
    cardName: "",
    setCode: "",
    cardImage: "",
    cardSetName: "",
    cardRarity: "",
    cardNumber: "",
    cardPricing: undefined as { cardmarket?: { avg?: number; low?: number; trend?: number; avg7?: number; avg30?: number; unit?: string } } | undefined,
    marketPricing: undefined as import("../api").MarketPricing | undefined,
    language: "FR" as Language,
    condition: "NM" as CardCondition,
    quantity: "1",
    acquisitionPriceEuros: "",
    acquiredAt: "",
  });
  const navigate = useNavigate();
  /** Langue pour laquelle on a déjà chargé les détails (évite double fetch à la sélection). */
  const lastFetchedLangRef = useRef<string | null>(null);

  const loadCollection = useCallback((cursor?: string | null) => {
    if (!getAccessToken()) return;
    const isFirst = !cursor;
    if (isFirst) setLoadingCollection(true);
    else setLoadingMoreCollection(true);
    setErrorCollection(null);
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
          setCollectionItems(list);
          setCollectionNextCursor(next);
        } else {
          setCollectionItems((prev) => [...prev, ...list]);
          setCollectionNextCursor(next);
        }
      })
      .catch((err) => setErrorCollection(err instanceof Error ? err.message : "Erreur"))
      .finally(() => {
        setLoadingCollection(false);
        setLoadingMoreCollection(false);
      });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const historyRange = range;
      const [portfolioRes, historyRes, dashRes, salesRes] = await Promise.all([
        fetchWithAuth("/users/me/portfolio?live=true"),
        fetchWithAuth(`/users/me/portfolio/history?range=${historyRange}&limit=50`),
        fetchWithAuth("/collection/dashboard"),
        fetchWithAuth("/marketplace/me/sales/summary"),
      ]);

      if (!portfolioRes.ok) {
        if (portfolioRes.status === 401) throw new Error("Connectez-vous pour acceder a votre portfolio");
        throw new Error(`Erreur ${portfolioRes.status}`);
      }

      const portfolioJson = await portfolioRes.json();
      setPortfolio(portfolioJson.data);

      if (historyRes.ok) {
        const historyJson = await historyRes.json();
        const raw = historyJson.data ?? historyJson;
        const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
        const sorted = [...items].sort((a: PortfolioSnapshot, b: PortfolioSnapshot) =>
          new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
        setHistory(sorted);
      }

      if (dashRes.ok) {
        const dashJson = await dashRes.json();
        setDashboard(dashJson.data);
      }

      if (salesRes.ok) {
        const salesJson = await salesRes.json();
        setSalesSummary(salesJson.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (portfolio) loadCollection();
  }, [portfolio, loadCollection]);

  // Re-fetch détails de la carte (nom, set, pricing) quand la langue change et qu'une carte est déjà sélectionnée
  useEffect(() => {
    const cardId = addForm.cardId?.trim();
    if (!cardId) return;
    const lang = addForm.language;
    if (lastFetchedLangRef.current === lang) return;
    lastFetchedLangRef.current = lang;
    let cancelled = false;
    const tcgLang = toTcgdexLang(lang);
    getCardDetails(cardId, { lang: tcgLang })
      .then((details) => {
        if (cancelled) return;
        setAddForm((prev) => ({
          ...prev,
          cardName: details.name ?? prev.cardName,
          cardSetName: details.set?.name ?? prev.cardSetName,
          cardRarity: details.rarity ?? prev.cardRarity,
          cardNumber: details.number ?? prev.cardNumber,
          cardImage: details.image ?? prev.cardImage,
          cardPricing: details.pricing ?? prev.cardPricing,
          marketPricing:
            details.marketPricing !== undefined && details.marketPricing !== null
              ? details.marketPricing
              : prev.marketPricing,
        }));
      })
      .catch(() => {
        if (!cancelled) lastFetchedLangRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [addForm.cardId, addForm.language]);

  const handleAddCollection = (e: React.FormEvent) => {
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
        game: addForm.game || undefined,
        language: addForm.language,
        condition: addForm.condition,
        quantity,
        acquisitionPriceCents: acquisitionPriceCents != null && acquisitionPriceCents >= 0 ? acquisitionPriceCents : undefined,
        acquisitionCurrency: acquisitionPriceCents != null ? "EUR" : undefined,
        acquiredAt: acquiredAt ? new Date(acquiredAt).toISOString() : undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((d: { error?: { message?: string } }) => { throw new Error(d?.error?.message ?? `Erreur ${res.status}`); });
        setShowAddForm(false);
        setAddForm({ game: "POKEMON", cardId: "", cardName: "", setCode: "", cardImage: "", cardSetName: "", cardRarity: "", cardNumber: "", cardPricing: undefined, marketPricing: undefined, language: "FR", condition: "NM", quantity: "1", acquisitionPriceEuros: "", acquiredAt: "" });
        loadCollection();
        fetchData();
      })
      .catch((err) => setAddError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setAddSubmitting(false));
  };

  const handleDeleteCollection = (item: CollectionItem) => {
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
        setCollectionItems((prev) => prev.filter((i) => i.id !== item.id));
        fetchData();
      })
      .catch(() => setDeleteId(null));
  };

  // ─── Derived data for charts ────────────────────────────────

  const portfolioChartData = useMemo(() => {
    const rows = [...history]
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
      .map((h) => {
        const ts = new Date(h.capturedAt).getTime();
        return {
          ts,
          label: new Date(h.capturedAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
          valeur: centsToEuros(h.totalValueCents),
          cout: centsToEuros(h.totalCostCents),
          pnl: centsToEuros(h.pnlCents),
        };
      });

    if (portfolio) {
      const now = new Date();
      rows.push({
        ts: now.getTime(),
        label: "Maintenant",
        valeur: centsToEuros(portfolio.totalValueCents),
        cout: centsToEuros(portfolio.totalCostCents),
        pnl: centsToEuros(portfolio.pnlCents),
      });
    }

    return rows;
  }, [history, portfolio]);

  const salesChartData = useMemo(() => {
    if (!salesSummary?.monthly?.length) return [];
    return salesSummary.monthly.map((m) => ({
      month: monthLabel(m.month),
      revenus: centsToEuros(m.revenueCents),
      ventes: m.count,
    }));
  }, [salesSummary]);

  const gameInventoryData = useMemo(() => {
    if (!dashboard?.byGame?.length) return [];
    // Merge entries with the same display name (e.g. MTG + MAGIC → "Magic")
    const merged = new Map<string, { value: number; costEuros: number }>();
    for (const g of dashboard.byGame) {
      if (g.qty === 0) continue;
      const displayName = GAME_LABELS[g.key] ?? g.key;
      const existing = merged.get(displayName) ?? { value: 0, costEuros: 0 };
      existing.value += g.qty;
      existing.costEuros += centsToEuros(g.costCents);
      merged.set(displayName, existing);
    }
    return [...merged.entries()]
      .map(([name, { value, costEuros }]) => ({ name, value, costEuros }))
      .sort((a, b) => b.value - a.value);
  }, [dashboard]);

  const languageData = useMemo(() => {
    if (!dashboard?.byLanguage?.length) return [];
    return dashboard.byLanguage
      .filter((l) => l.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .map((l) => ({
        name: LANGUAGE_LABELS[l.key as keyof typeof LANGUAGE_LABELS] ?? l.key,
        value: l.qty,
        costEuros: centsToEuros(l.costCents),
      }));
  }, [dashboard]);

  const conditionData = useMemo(() => {
    if (!dashboard?.byCondition?.length) return [];
    const order = ["NM", "LP", "MP", "HP", "DMG"];
    return [...dashboard.byCondition]
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .filter((c) => c.qty > 0)
      .map((c) => ({
        name: CONDITION_LABELS[c.key as keyof typeof CONDITION_LABELS] ?? c.key,
        short: c.key,
        qty: c.qty,
        costEuros: centsToEuros(c.costCents),
      }));
  }, [dashboard]);

  const salesByGameData = useMemo(() => {
    if (!salesSummary?.byGame?.length) return [];
    return salesSummary.byGame
      .filter((g) => g.count > 0)
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .map((g) => ({
        name: GAME_LABELS[g.game] ?? g.game,
        revenus: centsToEuros(g.revenueCents),
        ventes: g.count,
      }));
  }, [salesSummary]);

  // ─── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="portfolio-dashboard">
        <h1 className="page-title">Mon Portfolio</h1>
        <p className="page-subtitle">Analyses detaillees de votre collection, ventes et performance.</p>
        <div className="kpi-grid kpi-grid--wide">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="kpi-card">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="heading" width="80%" />
            </div>
          ))}
        </div>
        <div className="charts-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="chart-card"><Skeleton variant="rect" height="250px" /></div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="portfolio-dashboard">
        <h1 className="page-title">Mon Portfolio</h1>
        <ErrorState message={error} onRetry={fetchData} />
      </section>
    );
  }

  if (!portfolio) return null;

  const pnlPositive = portfolio.pnlCents >= 0;
  const totalRevenue = salesSummary?.totalRevenueCents ?? 0;
  const pricedCount = Math.max(0, portfolio.itemCount - portfolio.missingCount);
  const lastSnapshotDate = history.length > 0
    ? history[history.length - 1].capturedAt
    : null;
  const roiPercent = portfolio.totalCostCents > 0
    ? Math.round((portfolio.pnlCents / portfolio.totalCostCents) * 1000) / 10
    : null;

  return (
    <section className="portfolio-dashboard">
      <PageHeader
        title="Mon Portfolio"
        subtitle="Votre collection, vos ventes et votre performance en un coup d'œil."
      />

      {/* Navigation rapide */}
      <nav className="portfolio-nav" aria-label="Navigation rapide dans le portfolio">
        <a href="#performance" className="portfolio-nav-link">Performance</a>
        <a href="#ventes" className="portfolio-nav-link">Ventes</a>
        <a href="#repartition" className="portfolio-nav-link">Répartition</a>
        <a href="#pnl-detail" className="portfolio-nav-link">P&amp;L / carte</a>
        <a href="#inventaire" className="portfolio-nav-link">Inventaire</a>
      </nav>

      {/* KPIs */}
      <div className="kpi-grid kpi-grid--wide">
        <div className="kpi-card kpi-highlight">
          <div className="kpi-label">
            Valeur actuelle (cote)
            <KpiTooltip id="kpi-valeur" text="Valeur de revente estimée de votre inventaire (cote actuelle). Les cartes sans cote ne sont pas incluses." />
          </div>
          <div className="kpi-value">{formatCents(portfolio.totalValueCents)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            Montant investi
            <KpiTooltip id="kpi-investi" text="Somme des coûts d'acquisition renseignés pour vos cartes." />
          </div>
          <div className="kpi-value">{formatCents(portfolio.totalCostCents)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            Gain / perte potentiel
            <KpiTooltip id="kpi-pnl" text="Différence entre valeur actuelle (cote) et montant investi. Potentiel : la vente réelle peut différer." />
          </div>
          <div className="kpi-value" style={{ color: pnlPositive ? "var(--color-success)" : "var(--color-danger)" }}>
            {pnlPositive ? "+" : ""}{formatCents(portfolio.pnlCents)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            ROI potentiel (%)
            <KpiTooltip id="kpi-roi" text="Pourcentage de gain ou perte par rapport au montant investi. Basé sur la cote actuelle." />
          </div>
          <div className="kpi-value" style={{ color: roiPercent != null && roiPercent >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
            {roiPercent != null ? `${roiPercent >= 0 ? "+" : ""}${roiPercent} %` : "—"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            Chiffre d&apos;affaires ventes
            <KpiTooltip id="kpi-ca" text="Montant total des ventes (CA), pas le profit : les coûts d'acquisition ne sont pas déduits." />
          </div>
          <div className="kpi-value" style={{ color: "var(--color-success)" }}>
            {formatCents(totalRevenue)}
          </div>
          <div className="kpi-hint">{salesSummary?.totalSold ?? 0} carte{(salesSummary?.totalSold ?? 0) > 1 ? "s" : ""} vendue{(salesSummary?.totalSold ?? 0) > 1 ? "s" : ""}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            Cartes · couverture cote
            <KpiTooltip id="kpi-couverture" text="Nombre de cartes avec une cote connue (valeur actuelle) vs sans cote (non valorisées)." />
          </div>
          <div className="kpi-value">
            {portfolio.itemCount} cartes
            {portfolio.itemCount > 0 && (
              <span className="kpi-sub"> ({pricedCount} avec cote{portfolio.missingCount > 0 ? `, ${portfolio.missingCount} sans cote` : ""})</span>
            )}
          </div>
        </div>
      </div>

      {lastSnapshotDate && (
        <p className="portfolio-last-snapshot" role="status">
          Dernier snapshot : {new Date(lastSnapshotDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      )}

      {/* Range selector */}
      <div className="range-selector-row">
        <span className="range-label">Période</span>
        <div className="range-selector">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            className={`range-btn ${range === r ? "active" : ""}`}
            onClick={() => setRange(r)}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        </div>
      </div>

      {/* ───── Section: Performance ───── */}
      <section id="performance" className="portfolio-section" aria-labelledby="section-performance">
        <h2 id="section-performance" className="portfolio-section-title">Performance</h2>

        <ChartCard
          title="Valeur vs investissement"
          subtitle="Un point est créé à chaque ajout ou modification de carte dans l'inventaire."
          className="chart-full"
        >
          {portfolioChartData.length < 2 ? (
            <EmptyChart message="Ajoutez des cartes à votre collection pour voir l'évolution." />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={portfolioChartData}>
                <defs>
                  <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fontSize: 12 }}
                  stroke="var(--color-text-muted)"
                  tickFormatter={(ts: number) =>
                    new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                  }
                />
                <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={70} />
                <Tooltip content={renderEuroTooltip} />
                <Legend />
                <Area type="monotone" dataKey="valeur" name="Valeur actuelle (cote)" stroke="#6366f1" fill="url(#gradValue)" strokeWidth={2} />
                <Area type="monotone" dataKey="cout" name="Montant investi" stroke="#f59e0b" fill="url(#gradCost)" strokeWidth={2} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <div className="charts-grid charts-grid--2">
          <ChartCard
            title="Gain / perte potentiel (P&L)"
            subtitle="Différence entre valeur (cote) et montant investi à chaque snapshot."
          >
            {portfolioChartData.length < 2 ? (
              <EmptyChart message="Ajoutez des cartes pour voir l'évolution du gain/perte." />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={portfolioChartData}>
                  <defs>
                    <linearGradient id="gradPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-text-muted)"
                    tickFormatter={(ts: number) =>
                      new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                    }
                  />
                  <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" width={65} />
                  <Tooltip content={renderEuroTooltip} />
                  <Legend />
                  <Area type="monotone" dataKey="pnl" name="Gain / perte potentiel" stroke="#10b981" fill="url(#gradPnl)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            title="Valeur et coût dans le temps"
            subtitle="Même données que le graphique ci-dessus, vue compacte. Données historiques uniquement (pas de CA)."
          >
            {portfolioChartData.length < 2 ? (
              <EmptyChart message="Ajoutez des cartes pour voir l'évolution." />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={portfolioChartData}>
                  <defs>
                    <linearGradient id="gradValueSmall" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCostSmall" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-text-muted)"
                    tickFormatter={(ts: number) =>
                      new Date(ts).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                    }
                  />
                  <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" width={65} />
                  <Tooltip content={renderEuroTooltip} />
                  <Legend />
                  <Area type="monotone" dataKey="valeur" name="Valeur actuelle (cote)" stroke="#6366f1" fill="url(#gradValueSmall)" strokeWidth={2} />
                  <Area type="monotone" dataKey="cout" name="Montant investi" stroke="#f59e0b" fill="url(#gradCostSmall)" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ───── Section: Ventes ───── */}
      <section id="ventes" className="portfolio-section" aria-labelledby="section-ventes">
        <h2 id="section-ventes" className="portfolio-section-title">Ventes</h2>

        <ChartCard
          title="Revenus mensuels (ventes)"
          subtitle="Chiffre d'affaires par mois (CA des ventes, pas le profit après coûts)."
          className="chart-full"
        >
        {salesChartData.length === 0 ? (
          <EmptyChart message="Aucune vente enregistrée pour l'instant." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <YAxis yAxisId="euros" tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={65} />
              <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={40} />
              <Tooltip content={renderEuroTooltip} />
              <Legend />
              <Bar yAxisId="euros" dataKey="revenus" name="CA (€)" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="count" dataKey="ventes" name="Nombre de ventes" fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        )}
        </ChartCard>

        {salesByGameData.length > 0 && (
          <ChartCard
            title="Chiffre d'affaires par jeu"
            subtitle="Répartition du CA des ventes par univers (jeu)."
            className="chart-full"
          >
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={salesByGameData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
                <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={65} />
                <Tooltip content={renderEuroTooltip} />
                <Legend />
                <Bar dataKey="revenus" name="CA (€)" radius={[4, 4, 0, 0]}>
                  {salesByGameData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </section>

      {/* ───── Section: Répartition inventaire ───── */}
      <section id="repartition" className="portfolio-section" aria-labelledby="section-repartition">
        <h2 id="section-repartition" className="portfolio-section-title">Répartition inventaire</h2>

        <div className="charts-grid charts-grid--3">
          <ChartCard
            title="Inventaire par jeu"
            subtitle="Nombre de cartes par univers."
          >
          {gameInventoryData.length === 0 ? (
            <EmptyChart message="Aucune carte dans l'inventaire." />
          ) : (
            <DistributionBar items={gameInventoryData} />
          )}
        </ChartCard>

        <ChartCard
          title="Inventaire par langue"
          subtitle="Nombre de cartes par langue."
        >
          {languageData.length === 0 ? (
            <EmptyChart message="Aucune donnée de langue." />
          ) : (
            <DistributionBar items={languageData} colorOffset={3} />
          )}
        </ChartCard>

        <ChartCard
          title="Inventaire par état"
          subtitle="Nombre de cartes par état (NM, LP, MP, HP, DMG)."
        >
          {conditionData.length === 0 ? (
            <EmptyChart message="Aucune donnée d'état." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={conditionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
                <YAxis dataKey="short" type="category" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" width={40} />
                <Tooltip content={renderQtyTooltip} />
                <Bar dataKey="qty" name="Nombre de cartes" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="charts-grid charts-grid--2">
        <ChartCard
          title="Coût d'acquisition par jeu"
          subtitle="Répartition du montant investi par univers."
        >
          {gameInventoryData.length === 0 ? (
            <EmptyChart message="Aucune donnée." />
          ) : (
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>Jeu</th>
                  <th>Cartes</th>
                  <th>Cout total</th>
                </tr>
              </thead>
              <tbody>
                {gameInventoryData.map((g, i) => (
                  <tr key={i}>
                    <td>
                      <span className="breakdown-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      {g.name}
                    </td>
                    <td>{g.value}</td>
                    <td>{euroFormatter(g.costEuros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>

        <ChartCard
          title="Coût d'acquisition par langue"
          subtitle="Répartition du montant investi par langue."
        >
          {languageData.length === 0 ? (
            <EmptyChart message="Aucune donnée." />
          ) : (
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>Langue</th>
                  <th>Cartes</th>
                  <th>Cout total</th>
                </tr>
              </thead>
              <tbody>
                {languageData.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <span className="breakdown-dot" style={{ background: COLORS[(i + 3) % COLORS.length] }} />
                      {l.name}
                    </td>
                    <td>{l.value}</td>
                    <td>{euroFormatter(l.costEuros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ChartCard>
      </div>
      </section>

      {/* ───── Section: Détail P&L par carte ───── */}
      <section id="pnl-detail" className="portfolio-section" aria-labelledby="section-pnl">
        <h2 id="section-pnl" className="portfolio-section-title">P&amp;L par carte (non réalisé)</h2>
        <ChartCard
          title="Détail par position"
          subtitle="Cote marché (Cardmarket) vs coût d'acquisition renseigné. Le P&L et le ROI ne sont calculés que si vous avez saisi un prix d'acquisition. Triez les colonnes en cliquant sur les en-têtes."
          className="chart-full"
        >
          <PnlBreakdownTable items={portfolio.breakdown ?? []} />
        </ChartCard>
      </section>

      {/* Cartes de ma collection (inventaire) */}
      <section id="inventaire" className="portfolio-inventaire" aria-labelledby="inventaire-title">
        <h2 id="inventaire-title" className="chart-card-title">Cartes de ma collection</h2>

        {loadingCollection && (
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

        {errorCollection && !loadingCollection && (
          <ErrorState message={errorCollection} onRetry={() => loadCollection()} />
        )}

        {!loadingCollection && !errorCollection && collectionItems.length === 0 && !showAddForm && (
          <EmptyState
            title="Aucune carte dans la collection"
            description="Ajoutez des cartes pour suivre votre inventaire et les proposer en vente ou en échange."
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

        {!loadingCollection && !errorCollection && collectionItems.length > 0 && (
          <>
            <ul className="inventory-list" role="list" aria-label="Liste des cartes de la collection">
              {collectionItems.map((item) => (
                <li key={item.id} className="inventory-item">
                  <div className="inventory-item-thumb" aria-hidden="true">
                    {(item.cardName || item.cardId).charAt(0).toUpperCase()}
                  </div>
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
                      onClick={() => handleDeleteCollection(item)}
                    >
                      {deleteId === item.id ? "Suppression…" : "Retirer"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {collectionNextCursor && (
              <div className="inventory-load-more">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loadingMoreCollection}
                  onClick={() => loadCollection(collectionNextCursor)}
                >
                  {loadingMoreCollection ? "Chargement…" : "Voir plus"}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Actions principales : en bas de page, après la collection */}
      <footer className="portfolio-actions-bar" aria-label="Actions du portfolio">
        <div className="portfolio-actions-bar-inner">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setShowAddForm(!showAddForm); setAddError(null); }}
          >
            {showAddForm ? "Annuler l'ajout" : "Ajouter une carte"}
          </button>
        </div>
      </footer>

      {/* Formulaire d'ajout : formulaire à gauche, aperçu carte à droite (layout plus grand) */}
      {showAddForm && (
        <>
        <div className="portfolio-add-form-wrapper" style={{ display: "flex", flexWrap: "wrap", gap: "2rem", alignItems: "flex-start", maxWidth: "1200px" }}>
          <form onSubmit={handleAddCollection} className="card card-body inventory-add-form" style={{ flex: "1 1 420px", minWidth: 0 }}>
            <h3 className="card-title">Ajouter une carte à la collection</h3>
            {addError && (
              <div className="create-listing-error" role="alert">
                {addError}
              </div>
            )}

            {/* Sélecteur de jeu — en premier */}
            <div className="create-listing-field">
              <label htmlFor="inv-game">Jeu *</label>
              <div className="inv-game-selector">
                {GAMES.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    className={`inv-game-btn${addForm.game === g.value ? " inv-game-btn--active" : ""}`}
                    onClick={() => setAddForm((f) => ({ ...f, game: g.value, cardId: "", cardName: "", setCode: "", cardImage: "", cardSetName: "", cardRarity: "", cardNumber: "", cardPricing: undefined, marketPricing: undefined }))}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recherche automatique — Pokémon via TCGdex, note pour les autres */}
            <div className="create-listing-field">
              <label>Recherche rapide{addForm.game === "POKEMON" ? "" : " (Pokémon uniquement)"}</label>
              {addForm.game === "POKEMON" ? (
                <CardAutocomplete
                  placeholder="Rechercher une carte Pokémon…"
                  aria-label="Recherche de carte pour ajout à la collection"
                  language={addForm.language}
                  onSelect={({ cardId, cardName, setCode, setName, image, rarity, number, pricing, marketPricing }) => {
                    setCardImageFallbackEn(false);
                    lastFetchedLangRef.current = addForm.language;
                    setAddForm((f) => ({
                      ...f,
                      cardId,
                      cardName,
                      setCode: setCode ?? setName ?? f.setCode,
                      cardImage: image ?? "",
                      cardSetName: setName ?? f.cardSetName,
                      cardRarity: rarity ?? "",
                      cardNumber: number ?? "",
                      cardPricing: pricing ?? undefined,
                      marketPricing: marketPricing ?? undefined,
                    }));
                  }}
                />
              ) : (
                <p className="create-listing-hint" style={{ marginTop: 2 }}>
                  La recherche automatique est disponible pour Pokémon. Pour {GAMES.find((g) => g.value === addForm.game)?.label ?? "ce jeu"}, renseignez les informations manuellement ci-dessous.
                </p>
              )}
            </div>

            <div className="inventory-add-grid">
              <div className="create-listing-field">
                <label htmlFor="inv-cardId">Identifiant carte *</label>
                <input
                  id="inv-cardId"
                  type="text"
                  className="input"
                  placeholder="ex. op01-001, yst001, charizard-001"
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
                  placeholder="ex. Luffy, Charizard, Black Lotus"
                  value={addForm.cardName}
                  onChange={(e) => setAddForm((f) => ({ ...f, cardName: e.target.value }))}
                />
              </div>
              <div className="create-listing-field">
                <label htmlFor="inv-setCode">Set (code)</label>
                <input
                  id="inv-setCode"
                  type="text"
                  className="input"
                  placeholder="ex. OP01, cel25, LEA"
                  value={addForm.setCode}
                  onChange={(e) => setAddForm((f) => ({ ...f, setCode: e.target.value }))}
                />
                {addForm.cardSetName && (
                  <p className="create-listing-hint" style={{ marginTop: 4 }}>
                    Set : {addForm.cardSetName}
                  </p>
                )}
              </div>
              <div className="create-listing-field">
                <label htmlFor="inv-language">Langue</label>
                <select
                  id="inv-language"
                  className="select"
                  value={addForm.language}
                  onChange={(e) => {
                    setCardImageFallbackEn(false);
                    setAddForm((f) => ({ ...f, language: e.target.value as Language }));
                  }}
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
                {addSubmitting ? "Ajout…" : "Ajouter la carte"}
              </button>
            </div>
          </form>

          {/* Aperçu carte à droite (hors formulaire) : image + infos API */}
          {addForm.cardImage && (
            <aside
              className="inventory-card-preview-panel card card-body"
              style={{
                flex: "0 0 auto",
                width: "min(380px, 100%)",
                padding: "1.25rem",
              }}
              aria-label="Aperçu de la carte sélectionnée"
            >
              <div style={{ textAlign: "center", marginBottom: "1rem" }}>
                <img
                  src={`${getCardImageBaseForLanguage(addForm.cardImage, cardImageFallbackEn ? "EN" : addForm.language)}/high.png`}
                  alt=""
                  width={320}
                  height={438}
                  style={{ objectFit: "contain", borderRadius: 10, maxWidth: "100%", height: "auto" }}
                  onError={() => setCardImageFallbackEn(true)}
                />
              </div>
              <dl style={{ margin: 0, fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {addForm.cardName && (
                  <div>
                    <dt style={{ margin: 0, color: "var(--color-text-muted, #888)", fontWeight: 500 }}>Nom</dt>
                    <dd style={{ margin: "0.15rem 0 0", fontWeight: 600 }}>{addForm.cardName}</dd>
                  </div>
                )}
                {(addForm.cardSetName || addForm.setCode) && (
                  <div>
                    <dt style={{ margin: 0, color: "var(--color-text-muted, #888)", fontWeight: 500 }}>Set</dt>
                    <dd style={{ margin: "0.15rem 0 0" }}>{addForm.cardSetName || addForm.setCode}</dd>
                  </div>
                )}
                {addForm.cardNumber && (
                  <div>
                    <dt style={{ margin: 0, color: "var(--color-text-muted, #888)", fontWeight: 500 }}>N°</dt>
                    <dd style={{ margin: "0.15rem 0 0" }}>{addForm.cardNumber}</dd>
                  </div>
                )}
                {addForm.cardRarity && (
                  <div>
                    <dt style={{ margin: 0, color: "var(--color-text-muted, #888)", fontWeight: 500 }}>Rareté</dt>
                    <dd style={{ margin: "0.15rem 0 0" }}>{addForm.cardRarity}</dd>
                  </div>
                )}
                {addForm.marketPricing?.sources?.cardmarket && (() => {
                  const n = addForm.marketPricing!.sources.cardmarket!.normal;
                  const parts: string[] = [];
                  if (n.low != null) parts.push(`Bas : ${n.low.toFixed(2)} €`);
                  if (n.trend != null) parts.push(`Tendance : ${n.trend.toFixed(2)} €`);
                  if (n.avg7 != null) parts.push(`Moy. 7j : ${n.avg7.toFixed(2)} €`);
                  if (parts.length === 0) return null;
                  return (
                    <div>
                      <dt style={{ margin: 0, color: "var(--color-text-muted, #888)", fontWeight: 500 }}>Marché (Cardmarket – EUR)</dt>
                      <dd style={{ margin: "0.15rem 0 0" }}>{parts.join(" · ")}</dd>
                    </div>
                  );
                })()}
                {addForm.marketPricing?.sources?.tcgplayer && Object.keys(addForm.marketPricing.sources.tcgplayer.variants).length > 0 && (
                  <div>
                    <dt style={{ margin: 0, color: "var(--color-text-muted, #888)", fontWeight: 500 }}>Marché (TCGplayer – USD)</dt>
                    <dd style={{ margin: "0.15rem 0 0", fontSize: "0.85em" }}>
                      {Object.entries(addForm.marketPricing.sources.tcgplayer.variants).slice(0, 2).map(([variant, v]) =>
                        (v.marketPrice != null || v.midPrice != null) ? `${variant} : ${(v.marketPrice ?? v.midPrice ?? 0).toFixed(2)} $` : null
                      ).filter(Boolean).join(" · ")}
                    </dd>
                  </div>
                )}
                {!addForm.marketPricing?.sources?.cardmarket && addForm.cardPricing?.cardmarket && (addForm.cardPricing.cardmarket.avg != null || addForm.cardPricing.cardmarket.low != null) && (
                  <div>
                    <dt style={{ margin: 0, color: "var(--color-text-muted, #888)", fontWeight: 500 }}>Cote (Cardmarket)</dt>
                    <dd style={{ margin: "0.15rem 0 0" }}>
                      Bas : {addForm.cardPricing.cardmarket.low != null ? `${addForm.cardPricing.cardmarket.low.toFixed(2)}` : "—"} € · Tendance : {addForm.cardPricing.cardmarket.trend != null ? `${addForm.cardPricing.cardmarket.trend.toFixed(2)}` : "—"} € · Moy. 7j : {addForm.cardPricing.cardmarket.avg7 != null ? `${addForm.cardPricing.cardmarket.avg7.toFixed(2)}` : "—"} €
                    </dd>
                  </div>
                )}
              </dl>
            </aside>
          )}
        </div>
        {addForm.cardId?.trim() && (
          <div style={{ marginTop: 24, width: "100%" }}>
            <CardPriceCharts cardId={addForm.cardId.trim()} lang={addForm.language} />
          </div>
        )}
        </>
      )}
    </section>
  );
}
