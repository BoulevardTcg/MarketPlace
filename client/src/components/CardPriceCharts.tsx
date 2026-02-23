import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  getCardPriceHistory,
  getCardBoulevardHistory,
  getMarketDailyHistory,
  toTcgdexLang,
} from "../api";
import type {
  CardPriceHistoryResponse,
  BoulevardHistoryResponse,
  BoulevardSeries,
  DailyPriceHistoryResponse,
} from "../api";
import { Skeleton } from "./Skeleton";

const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
const LANG_LABELS: Record<string, string> = { fr: "FR", en: "EN", ja: "JP" };

const METRIC_LABELS: Record<string, string> = {
  trendCents: "Tendance",
  lowCents: "Bas",
  avgCents: "Moyenne",
};

export type CardPriceChartsProps = {
  cardId: string;
  /** Langue courante du formulaire (pour Marché par défaut). */
  lang?: string;
};

type TabId = "historique" | "marche" | "boulevard";

const tabStyle = (active: boolean) => ({
  padding: "6px 12px",
  border: "none",
  background: active ? "var(--color-primary, #6366f1)" : "transparent",
  color: active ? "#fff" : "inherit",
  borderRadius: 6,
  cursor: "pointer" as const,
  fontWeight: 500,
});

export function CardPriceCharts({ cardId, lang = "FR" }: CardPriceChartsProps) {
  const [tab, setTab] = useState<TabId>("historique");

  // Historique (daily snapshots from Marketplace API)
  const [histDays, setHistDays] = useState<7 | 30 | 90>(30);
  const [histMetric, setHistMetric] = useState<"trendCents" | "lowCents" | "avgCents">("trendCents");
  const [histData, setHistData] = useState<DailyPriceHistoryResponse | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);

  // Marché
  const [market, setMarket] = useState<"cardmarket" | "tcgplayer">("cardmarket");
  const [variant, setVariant] = useState("normal");
  const [metric, setMetric] = useState("trend");
  const [marketHistory, setMarketHistory] = useState<CardPriceHistoryResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Boulevard
  const [boulevardLangs, setBoulevardLangs] = useState<string[]>(["fr", "en", "ja"]);
  const [bucket, setBucket] = useState<"day" | "week">("day");
  const [boulevardMetric, setBoulevardMetric] = useState<"median" | "avg">("median");
  const [placeholderZero, setPlaceholderZero] = useState(false);
  const [boulevardHistory, setBoulevardHistory] = useState<BoulevardHistoryResponse | null>(null);
  const [boulevardLoading, setBoulevardLoading] = useState(false);
  const [boulevardError, setBoulevardError] = useState<string | null>(null);

  const tcgLang = toTcgdexLang(lang);

  // ── Historique fetch ──────────────────────────────────────
  useEffect(() => {
    if (!cardId || tab !== "historique") return;
    setHistLoading(true);
    setHistError(null);
    const ctrl = new AbortController();
    getMarketDailyHistory(cardId, { language: lang, days: histDays }, ctrl.signal)
      .then(setHistData)
      .catch((e) => setHistError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setHistLoading(false));
    return () => ctrl.abort();
  }, [cardId, tab, lang, histDays]);

  // ── Marché fetch ──────────────────────────────────────────
  useEffect(() => {
    if (!cardId || tab !== "marche") return;
    setMarketLoading(true);
    setMarketError(null);
    const ctrl = new AbortController();
    getCardPriceHistory(
      cardId,
      { lang: tcgLang, market, variant, days: 90, metric },
      ctrl.signal,
    )
      .then(setMarketHistory)
      .catch((e) => setMarketError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setMarketLoading(false));
    return () => ctrl.abort();
  }, [cardId, tab, tcgLang, market, variant, metric]);

  // ── Boulevard fetch ───────────────────────────────────────
  useEffect(() => {
    if (!cardId || tab !== "boulevard") return;
    setBoulevardLoading(true);
    setBoulevardError(null);
    const ctrl = new AbortController();
    getCardBoulevardHistory(
      cardId,
      {
        langs: boulevardLangs.join(","),
        days: 365,
        bucket,
        metric: boulevardMetric,
        placeholderZero,
      },
      ctrl.signal,
    )
      .then(setBoulevardHistory)
      .catch((e) => setBoulevardError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setBoulevardLoading(false));
    return () => ctrl.abort();
  }, [cardId, tab, boulevardLangs, bucket, boulevardMetric, placeholderZero]);

  // ── Chart data ────────────────────────────────────────────

  const histChartData = useMemo(() => {
    if (!histData?.series?.length) return [];
    return histData.series.map((s) => ({
      day: s.day,
      trendCents: s.trendCents != null ? s.trendCents / 100 : null,
      lowCents: s.lowCents != null ? s.lowCents / 100 : null,
      avgCents: s.avgCents != null ? s.avgCents / 100 : null,
    }));
  }, [histData]);

  const marketVariants = useMemo(() => {
    if (market === "cardmarket") return ["normal", "holo"];
    return ["normal", "holofoil", "reverseHolofoil"];
  }, [market]);

  const marcheChartData = useMemo(() => {
    if (!marketHistory?.points) return [];
    return marketHistory.points.map((p) => ({
      date: p.date,
      value: p.value,
      [marketHistory.metadata.currency]: p.value,
    }));
  }, [marketHistory, market]);

  const boulevardChartData = useMemo(() => {
    if (!boulevardHistory?.series?.length) return [];
    const dates = [
      ...new Set(boulevardHistory.series.flatMap((s) => s.points.map((x) => x.date))),
    ].sort();
    return dates.map((date) => {
      const row: Record<string, string | number | null> = { date };
      for (const s of boulevardHistory.series) {
        const pt = s.points.find((p) => p.date === date);
        row[s.lang] = pt?.value ?? null;
      }
      return row;
    });
  }, [boulevardHistory]);

  const toggleBoulevardLang = (l: string) => {
    setBoulevardLangs((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  return (
    <div className="card-price-charts" style={{ marginTop: 16 }}>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          borderBottom: "1px solid var(--color-border, #e5e7eb)",
          paddingBottom: 8,
        }}
      >
        <button type="button" role="tab" aria-selected={tab === "historique"} onClick={() => setTab("historique")} style={tabStyle(tab === "historique")}>
          Historique
        </button>
        <button type="button" role="tab" aria-selected={tab === "marche"} onClick={() => setTab("marche")} style={tabStyle(tab === "marche")}>
          Marché
        </button>
        <button type="button" role="tab" aria-selected={tab === "boulevard"} onClick={() => setTab("boulevard")} style={tabStyle(tab === "boulevard")}>
          Boulevard
        </button>
      </div>

      {/* ── Tab: Historique (daily snapshots) ──────────────── */}
      {tab === "historique" && (
        <>
          <div
            style={{
              padding: "10px 12px",
              marginBottom: 12,
              background: "var(--color-bg-muted, #f3f4f6)",
              borderRadius: 8,
              fontSize: "0.9em",
              color: "var(--color-text-muted, #6b7280)",
            }}
          >
            Historique des prix journaliers collectés depuis les marchés (1 point/jour).
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.9em" }}>Période</span>
              <select
                className="select"
                value={histDays}
                onChange={(e) => setHistDays(Number(e.target.value) as 7 | 30 | 90)}
                style={{ padding: "4px 8px", borderRadius: 4 }}
              >
                <option value={7}>7 jours</option>
                <option value={30}>30 jours</option>
                <option value={90}>90 jours</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.9em" }}>Métrique</span>
              <select
                className="select"
                value={histMetric}
                onChange={(e) => setHistMetric(e.target.value as "trendCents" | "lowCents" | "avgCents")}
                style={{ padding: "4px 8px", borderRadius: 4 }}
              >
                <option value="trendCents">Tendance</option>
                <option value="lowCents">Bas</option>
                <option value="avgCents">Moyenne</option>
              </select>
            </label>
          </div>
          {histLoading && <Skeleton height={200} />}
          {histError && (
            <p style={{ color: "var(--color-error, #dc2626)", fontSize: "0.9em" }}>{histError}</p>
          )}
          {!histLoading && !histError && histData && (
            <>
              {histChartData.length < 2 ? (
                <div
                  style={{
                    padding: 16,
                    background: "var(--color-bg-muted, #f3f4f6)",
                    borderRadius: 8,
                    color: "var(--color-text-muted, #6b7280)",
                    fontSize: "0.9em",
                  }}
                >
                  <p style={{ margin: 0 }}>
                    Historique en cours de collecte ({histChartData.length} point{histChartData.length !== 1 ? "s" : ""}).
                    La courbe s'affichera quand au moins 2 points seront disponibles.
                  </p>
                  {histData.stats.lastTrendCents != null && (
                    <p style={{ margin: "8px 0 0", fontWeight: 500 }}>
                      Dernier prix : {(histData.stats.lastTrendCents / 100).toFixed(2)} €
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={histChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit=" €" />
                      <Tooltip
                        formatter={(value: number | undefined) =>
                          value != null ? `${Number(value).toFixed(2)} €` : "—"
                        }
                        labelFormatter={(label) => String(label)}
                      />
                      <Line
                        type="monotone"
                        dataKey={histMetric}
                        stroke={CHART_COLORS[0]}
                        strokeWidth={2}
                        dot={histChartData.length <= 30}
                        connectNulls={false}
                        name={METRIC_LABELS[histMetric] ?? histMetric}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  {histData.stats.minTrendCents != null && histData.stats.maxTrendCents != null && (
                    <div style={{ display: "flex", gap: 16, fontSize: "0.85em", color: "var(--color-text-muted, #6b7280)", marginTop: 4 }}>
                      <span>Min : {(histData.stats.minTrendCents / 100).toFixed(2)} €</span>
                      <span>Max : {(histData.stats.maxTrendCents / 100).toFixed(2)} €</span>
                      {histData.stats.lastTrendCents != null && (
                        <span>Dernier : {(histData.stats.lastTrendCents / 100).toFixed(2)} €</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── Tab: Marché (external APIs) ───────────────────── */}
      {tab === "marche" && (
        <>
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              marginBottom: 12,
              background: "var(--color-bg-muted, #f3f4f6)",
              borderRadius: 8,
              fontSize: "0.9em",
              color: "var(--color-text-muted, #6b7280)",
            }}
          >
            Changer la langue de la fiche n'implique pas forcément un prix différent. Les prix Marché
            viennent du marketplace (agrégé).
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.9em" }}>Marché</span>
              <select
                className="select"
                value={market}
                onChange={(e) => setMarket(e.target.value as "cardmarket" | "tcgplayer")}
                style={{ padding: "4px 8px", borderRadius: 4 }}
              >
                <option value="cardmarket">Cardmarket</option>
                <option value="tcgplayer">TCGplayer</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.9em" }}>Variante</span>
              <select
                className="select"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 4 }}
              >
                {marketVariants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.9em" }}>Métrique</span>
              <select
                className="select"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 4 }}
              >
                <option value="trend">Tendance</option>
                <option value="avg7">Moy. 7j</option>
                <option value="avg">Moyenne</option>
                <option value="low">Bas</option>
                {market === "tcgplayer" && <option value="marketPrice">Market</option>}
              </select>
            </label>
          </div>
          {marketLoading && <Skeleton height={200} />}
          {marketError && (
            <p style={{ color: "var(--color-error, #dc2626)", fontSize: "0.9em" }}>{marketError}</p>
          )}
          {!marketLoading && !marketError && marketHistory && (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={marcheChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number | undefined) =>
                    marketHistory.metadata.currency === "USD"
                      ? `$${Number(value ?? 0).toFixed(2)}`
                      : `${Number(value ?? 0).toFixed(2)} €`
                  }
                  labelFormatter={(label) => String(label)}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  name={marketHistory.metadata.currency}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      )}

      {/* ── Tab: Boulevard (internal marketplace) ─────────── */}
      {tab === "boulevard" && (
        <>
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              marginBottom: 12,
              background: "var(--color-bg-muted, #f3f4f6)",
              borderRadius: 8,
              fontSize: "0.9em",
              color: "var(--color-text-muted, #6b7280)",
            }}
          >
            Courbes basées sur vos ventes / votre plateforme, segmentées par langue.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "0.9em" }}>Langues</span>
              {(["fr", "en", "ja"] as const).map((l) => (
                <label key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="checkbox"
                    checked={boulevardLangs.includes(l)}
                    onChange={() => toggleBoulevardLang(l)}
                  />
                  <span>{LANG_LABELS[l] ?? l}</span>
                </label>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.9em" }}>Période</span>
              <select
                className="select"
                value={bucket}
                onChange={(e) => setBucket(e.target.value as "day" | "week")}
                style={{ padding: "4px 8px", borderRadius: 4 }}
              >
                <option value="day">Jour</option>
                <option value="week">Semaine</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: "0.9em" }}>Métrique</span>
              <select
                className="select"
                value={boulevardMetric}
                onChange={(e) => setBoulevardMetric(e.target.value as "median" | "avg")}
                style={{ padding: "4px 8px", borderRadius: 4 }}
              >
                <option value="median">Médiane</option>
                <option value="avg">Moyenne</option>
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={placeholderZero}
                onChange={(e) => setPlaceholderZero(e.target.checked)}
              />
              <span style={{ fontSize: "0.9em" }}>Placeholder 0</span>
            </label>
          </div>
          {boulevardLoading && <Skeleton height={200} />}
          {boulevardError && (
            <p style={{ color: "var(--color-error, #dc2626)", fontSize: "0.9em" }}>
              {boulevardError}
            </p>
          )}
          {!boulevardLoading && !boulevardError && boulevardHistory && (
            <>
              {!boulevardHistory.hasAnyData && !placeholderZero && (
                <p
                  style={{
                    padding: 16,
                    background: "var(--color-bg-muted, #f3f4f6)",
                    borderRadius: 8,
                    color: "var(--color-text-muted, #6b7280)",
                    fontSize: "0.9em",
                  }}
                >
                  Pas encore de ventes pour cette carte. La courbe s'alimentera automatiquement.
                </p>
              )}
              {(boulevardHistory.hasAnyData || placeholderZero) &&
                boulevardHistory.series.length > 0 && (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart
                      data={boulevardChartData}
                      margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number | undefined) =>
                          value != null ? `${Number(value).toFixed(2)} €` : "—"
                        }
                        labelFormatter={(label) => String(label)}
                      />
                      <Legend />
                      {boulevardHistory.series.map((s: BoulevardSeries, i: number) => (
                        <Line
                          key={s.lang}
                          type="monotone"
                          dataKey={s.lang}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls={false}
                          name={LANG_LABELS[s.lang] ?? s.lang}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
            </>
          )}
        </>
      )}
    </div>
  );
}
