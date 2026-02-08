import { useEffect, useState, useCallback } from "react";
import { fetchWithAuth } from "../api";
import type { Portfolio, PortfolioSnapshot } from "../types/marketplace";
import { formatCents, Skeleton, ErrorState, EmptyState } from "../components";

type Range = "7d" | "30d" | "90d";

export function PortfolioDashboard() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [range, setRange] = useState<Range>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [portfolioRes, historyRes] = await Promise.all([
        fetchWithAuth("/users/me/portfolio"),
        fetchWithAuth(`/users/me/portfolio/history?range=${range}&limit=50`),
      ]);

      if (!portfolioRes.ok) {
        if (portfolioRes.status === 401) throw new Error("Connectez-vous pour acceder a votre portfolio");
        throw new Error(`Erreur ${portfolioRes.status}`);
      }

      const portfolioJson = await portfolioRes.json();
      setPortfolio(portfolioJson.data);

      if (historyRes.ok) {
        const historyJson = await historyRes.json();
        setHistory(historyJson.data?.items ?? []);
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

  if (loading) {
    return (
      <section>
        <h1 className="page-title">Mon Portfolio</h1>
        <p className="page-subtitle">Suivez la valeur de votre collection en temps reel.</p>
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="kpi-card">
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="heading" width="80%" />
            </div>
          ))}
        </div>
        <Skeleton variant="rect" height="200px" />
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <h1 className="page-title">Mon Portfolio</h1>
        <p className="page-subtitle">Suivez la valeur de votre collection en temps reel.</p>
        <ErrorState message={error} onRetry={fetchData} />
      </section>
    );
  }

  if (!portfolio) return null;

  const pnlPositive = portfolio.pnlCents >= 0;
  const historyMin = history.length > 0 ? Math.min(...history.map((h) => h.totalValueCents)) : 0;
  const historyMax = history.length > 0 ? Math.max(...history.map((h) => h.totalValueCents)) : 0;
  const historyRange = historyMax - historyMin || 1;

  return (
    <section>
      <h1 className="page-title">Mon Portfolio</h1>
      <p className="page-subtitle">Suivez la valeur de votre collection en temps reel.</p>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Valeur totale</div>
          <div className="kpi-value">{formatCents(portfolio.totalValueCents)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cout d'acquisition</div>
          <div className="kpi-value">{formatCents(portfolio.totalCostCents)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">P&L</div>
          <div className="kpi-value" style={{ color: pnlPositive ? "var(--color-success)" : "var(--color-danger)" }}>
            {pnlPositive ? "+" : ""}{formatCents(portfolio.pnlCents)}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cartes</div>
          <div className="kpi-value">
            {portfolio.itemCount}
            {portfolio.missingCount > 0 && (
              <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-normal)", color: "var(--color-warning)", marginLeft: "var(--space-2)" }}>
                ({portfolio.missingCount} sans prix)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chart section */}
      <div className="card card-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Evolution</h2>
          <div className="tabs" style={{ margin: 0, border: "none" }}>
            {(["7d", "30d", "90d"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`tab ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {history.length === 0 ? (
          <EmptyState
            title="Pas encore de donnees"
            description="Les snapshots de votre portfolio seront visibles ici sous quelques jours."
          />
        ) : (
          <div className="portfolio-chart" role="img" aria-label={`Evolution du portfolio sur ${range}`}>
            {/* Simple SVG sparkline */}
            <svg
              viewBox={`0 0 ${history.length - 1 || 1} 100`}
              preserveAspectRatio="none"
              className="portfolio-chart-svg"
            >
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Area fill */}
              <path
                d={
                  history
                    .map((h, i) => {
                      const x = i;
                      const y = 100 - ((h.totalValueCents - historyMin) / historyRange) * 90 - 5;
                      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                    })
                    .join(" ") +
                  ` L ${history.length - 1} 100 L 0 100 Z`
                }
                fill="url(#chartGrad)"
              />
              {/* Line */}
              <polyline
                points={history
                  .map((h, i) => {
                    const x = i;
                    const y = 100 - ((h.totalValueCents - historyMin) / historyRange) * 90 - 5;
                    return `${x},${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <div className="portfolio-chart-labels">
              <span>{formatCents(historyMin)}</span>
              <span>{formatCents(historyMax)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ marginTop: "var(--space-4)", display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div className="card card-body" style={{ flex: 1, minWidth: "200px" }}>
          <h3 className="card-title">Repartition</h3>
          <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
              <span>Avec prix marche</span>
              <span style={{ fontWeight: "var(--font-semibold)", color: "var(--color-text)" }}>{portfolio.valuedCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Sans prix (manquants)</span>
              <span style={{ fontWeight: "var(--font-semibold)", color: portfolio.missingCount > 0 ? "var(--color-warning)" : "var(--color-text)" }}>
                {portfolio.missingCount}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
