import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../api";
import type {
  Portfolio,
  PortfolioSnapshot,
  CollectionDashboard,
  SalesSummary,
} from "../types/marketplace";
import { formatCents, Skeleton, ErrorState } from "../components";
import { GAME_LABELS, LANGUAGE_LABELS, CONDITION_LABELS } from "../types/marketplace";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ─── Constants ──────────────────────────────────────────────

type Range = "7d" | "30d" | "90d" | "all";

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
  all: "Tout",
};

// ─── Helpers ────────────────────────────────────────────────

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

function euroFormatter(value: number): string {
  return `${value.toFixed(2)} €`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${y.slice(2)}`;
}

// Recharts custom tooltip as render function (inline)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderEuroTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  console.log("[TOOLTIP] active:", active, "label:", label, "payload:", JSON.stringify(payload.map((p: any) => ({ name: p.name, value: p.value, dataKey: p.dataKey, type: typeof p.value }))));
  return (
    <div style={{ background: "#1e1e2e", border: "1px solid #444", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: "#ccc", marginBottom: 4 }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: entry.color || entry.stroke || "#fff" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color || entry.stroke, display: "inline-block" }} />
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
    <div style={{ background: "#1e1e2e", border: "1px solid #444", borderRadius: 8, padding: "8px 14px", fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: "#ccc", marginBottom: 4 }}>{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: entry.color || entry.stroke || "#fff" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color || entry.stroke, display: "inline-block" }} />
          <span>{entry.name} : <strong>{entry.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

// ─── Section component ──────────────────────────────────────

function ChartCard({ title, children, className = "" }: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`chart-card ${className}`}>
      <h3 className="chart-card-title">{title}</h3>
      <div className="chart-card-body">{children}</div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="chart-empty">
      <p>{message}</p>
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
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const historyRange = range === "all" ? "90d" : range;
      const [portfolioRes, historyRes, dashRes, salesRes] = await Promise.all([
        fetchWithAuth("/users/me/portfolio"),
        fetchWithAuth(`/users/me/portfolio/history?range=${historyRange}&limit=50`),
        fetchWithAuth("/collection/dashboard"),
        fetchWithAuth("/marketplace/me/sales/summary"),
      ]);

      if (!portfolioRes.ok) {
        if (portfolioRes.status === 401) throw new Error("Connectez-vous pour acceder a votre portfolio");
        throw new Error(`Erreur ${portfolioRes.status}`);
      }

      const portfolioJson = await portfolioRes.json();
      console.log("[PORTFOLIO] raw response:", JSON.stringify(portfolioJson, null, 2));
      setPortfolio(portfolioJson.data);

      if (historyRes.ok) {
        const historyJson = await historyRes.json();
        console.warn("===== [HISTORY RAW] =====", historyJson);
        const raw = historyJson.data ?? historyJson;
        const items = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
        console.warn("===== [HISTORY ITEMS] count:", items.length, "FIRST:", JSON.stringify(items[0]), "LAST:", JSON.stringify(items[items.length - 1]));
        if (items.length > 0) {
          const first = items[0];
          console.warn("===== [HISTORY FIRST ITEM KEYS]:", Object.keys(first), "totalValueCents:", first.totalValueCents, "typeof:", typeof first.totalValueCents);
        }
        // Sort ascending by date for charts
        const sorted = [...items].sort((a: PortfolioSnapshot, b: PortfolioSnapshot) =>
          new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
        );
        setHistory(sorted);
      }

      if (dashRes.ok) {
        const dashJson = await dashRes.json();
        console.log("[DASHBOARD] raw response:", JSON.stringify(dashJson, null, 2));
        setDashboard(dashJson.data);
      }

      if (salesRes.ok) {
        const salesJson = await salesRes.json();
        console.log("[SALES] raw response:", JSON.stringify(salesJson, null, 2));
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

  const handleSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      const res = await fetchWithAuth("/users/me/portfolio/snapshot", { method: "POST" });
      if (res.ok) await fetchData();
    } finally {
      setSnapshotLoading(false);
    }
  };

  // ─── Derived data for charts ────────────────────────────────

  const portfolioChartData = useMemo(() => {
    const data = history.map((h) => ({
      date: shortDate(h.capturedAt),
      fullDate: new Date(h.capturedAt).toLocaleDateString("fr-FR"),
      valeur: centsToEuros(h.totalValueCents),
      cout: centsToEuros(h.totalCostCents),
      pnl: centsToEuros(h.pnlCents),
    }));
    console.warn("===== [CHART DATA] sample:", JSON.stringify(data.slice(0, 3)), "total:", data.length);
    return data;
  }, [history]);

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
    return dashboard.byGame
      .filter((g) => g.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .map((g) => ({
        name: GAME_LABELS[g.key] ?? g.key,
        value: g.qty,
        costEuros: centsToEuros(g.costCents),
      }));
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

  // Cumulative earnings chart: combine snapshots + sales
  const cumulativeData = useMemo(() => {
    if (!salesSummary?.monthly?.length && history.length === 0) return [];
    // Build a combined dataset from history snapshots
    return history.map((h) => ({
      date: shortDate(h.capturedAt),
      fullDate: new Date(h.capturedAt).toLocaleDateString("fr-FR"),
      inventaire: centsToEuros(h.totalValueCents),
      acquisitions: centsToEuros(h.totalCostCents),
      total: centsToEuros(h.totalValueCents + (salesSummary?.totalRevenueCents ?? 0)),
    }));
  }, [history, salesSummary]);

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
  const totalWealth = portfolio.totalValueCents + totalRevenue;

  return (
    <section className="portfolio-dashboard">
      {/* Header */}
      <div className="portfolio-dashboard-header">
        <div>
          <h1 className="page-title">Mon Portfolio</h1>
          <p className="page-subtitle">
            Analyses detaillees de votre collection, ventes et performance financiere.
          </p>
        </div>
        <div className="portfolio-dashboard-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={snapshotLoading}
            onClick={handleSnapshot}
          >
            {snapshotLoading ? "Enregistrement..." : "Enregistrer un snapshot"}
          </button>
          <Link to="/inventaire" className="btn btn-secondary btn-sm">
            Gerer mon inventaire
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid kpi-grid--wide">
        <div className="kpi-card kpi-highlight">
          <div className="kpi-label">Patrimoine total</div>
          <div className="kpi-value">{formatCents(totalWealth)}</div>
          <div className="kpi-hint">Inventaire + revenus ventes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Valeur inventaire (cote)</div>
          <div className="kpi-value">{formatCents(portfolio.totalValueCents)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cout d'acquisition</div>
          <div className="kpi-value">{formatCents(portfolio.totalCostCents)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">P&L (plus/moins value)</div>
          <div className="kpi-value" style={{ color: pnlPositive ? "var(--color-success)" : "var(--color-danger)" }}>
            {pnlPositive ? "+" : ""}{formatCents(portfolio.pnlCents)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Revenus ventes</div>
          <div className="kpi-value" style={{ color: "var(--color-success)" }}>
            {formatCents(totalRevenue)}
          </div>
          <div className="kpi-hint">{salesSummary?.totalSold ?? 0} carte{(salesSummary?.totalSold ?? 0) > 1 ? "s" : ""} vendue{(salesSummary?.totalSold ?? 0) > 1 ? "s" : ""}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cartes en inventaire</div>
          <div className="kpi-value">
            {portfolio.itemCount}
            {portfolio.missingCount > 0 && (
              <span className="kpi-sub"> ({portfolio.missingCount} sans cote)</span>
            )}
          </div>
        </div>
      </div>

      {/* Range selector */}
      <div className="range-selector">
        <span className="range-label">Periode :</span>
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

      {/* ───── CHART 1: Portfolio Value + Cost Evolution ───── */}
      <ChartCard title="Evolution de la valeur du portfolio" className="chart-full">
        {portfolioChartData.length < 2 ? (
          <EmptyChart message="Enregistrez au moins 2 snapshots pour voir l'evolution de votre portfolio." />
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
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={70} />
              <Tooltip content={renderEuroTooltip} />
              <Legend />
              <Area type="monotone" dataKey="valeur" name="Valeur (cote)" stroke="#6366f1" fill="url(#gradValue)" strokeWidth={2} />
              <Area type="monotone" dataKey="cout" name="Cout d'acquisition" stroke="#f59e0b" fill="url(#gradCost)" strokeWidth={2} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ───── CHART 2: P&L Evolution ───── */}
      <div className="charts-grid charts-grid--2">
        <ChartCard title="Evolution du P&L">
          {portfolioChartData.length < 2 ? (
            <EmptyChart message="Pas assez de donnees pour le P&L." />
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
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
                <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" width={65} />
                <Tooltip content={renderEuroTooltip} />
                <Area type="monotone" dataKey="pnl" name="P&L" stroke="#10b981" fill="url(#gradPnl)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* ───── CHART 3: Patrimoine total (inventaire + ventes) ───── */}
        <ChartCard title="Patrimoine total (inventaire + ventes)">
          {cumulativeData.length < 2 ? (
            <EmptyChart message="Pas assez de donnees. Enregistrez des snapshots." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
                <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" width={65} />
                <Tooltip content={renderEuroTooltip} />
                <Legend />
                <Line type="monotone" dataKey="total" name="Total" stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="inventaire" name="Inventaire" stroke="#6366f1" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="acquisitions" name="Acquisitions" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ───── CHART 4: Revenus mensuels (ventes) ───── */}
      <ChartCard title="Revenus des ventes par mois" className="chart-full">
        {salesChartData.length === 0 ? (
          <EmptyChart message="Aucune vente enregistree pour l'instant." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salesChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <YAxis yAxisId="euros" tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={65} />
              <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={40} />
              <Tooltip content={renderEuroTooltip} />
              <Legend />
              <Bar yAxisId="euros" dataKey="revenus" name="Revenus (€)" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="count" dataKey="ventes" name="Nb ventes" fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ───── CHARTS 5 & 6: Repartition inventaire ───── */}
      <div className="charts-grid charts-grid--3">
        {/* By Game */}
        <ChartCard title="Inventaire par jeu">
          {gameInventoryData.length === 0 ? (
            <EmptyChart message="Aucune carte dans l'inventaire." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={gameInventoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {gameInventoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={renderQtyTooltip} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* By Language */}
        <ChartCard title="Inventaire par langue">
          {languageData.length === 0 ? (
            <EmptyChart message="Aucune donnee de langue." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={languageData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {languageData.map((_, i) => (
                    <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={renderQtyTooltip} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* By Condition */}
        <ChartCard title="Inventaire par etat">
          {conditionData.length === 0 ? (
            <EmptyChart message="Aucune donnee d'etat." />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={conditionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
                <YAxis dataKey="short" type="category" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" width={40} />
                <Tooltip content={renderQtyTooltip} />
                <Bar dataKey="qty" name="Quantite" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ───── CHART 7: Ventes par jeu ───── */}
      {salesByGameData.length > 0 && (
        <ChartCard title="Revenus des ventes par jeu" className="chart-full">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={salesByGameData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
              <YAxis tickFormatter={(v: number) => `${v}€`} tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" width={65} />
              <Tooltip content={renderEuroTooltip} />
              <Bar dataKey="revenus" name="Revenus (€)" radius={[4, 4, 0, 0]}>
                {salesByGameData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ───── Breakdown tables ───── */}
      <div className="charts-grid charts-grid--2">
        {/* Cost breakdown by game */}
        <ChartCard title="Cout d'acquisition par jeu">
          {gameInventoryData.length === 0 ? (
            <EmptyChart message="Aucune donnee." />
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

        {/* Cost breakdown by language */}
        <ChartCard title="Cout d'acquisition par langue">
          {languageData.length === 0 ? (
            <EmptyChart message="Aucune donnee." />
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
  );
}
