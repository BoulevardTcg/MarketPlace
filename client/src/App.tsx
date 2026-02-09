import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { TradesInbox } from "./pages/TradesInbox";
import { TradeThread } from "./pages/TradeThread";
import { TradesNew } from "./pages/TradesNew";
import { MarketplaceBrowse } from "./pages/MarketplaceBrowse";
import { ListingDetail } from "./pages/ListingDetail";
import { PortfolioDashboard } from "./pages/PortfolioDashboard";

const API = import.meta.env.VITE_API_URL ?? "";

function getTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function App() {
  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(getTheme);
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setTheme(getTheme());
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    if (next === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    setTheme(next);
  };

  useEffect(() => {
    fetch(`${API}/health`)
      .then((res) => res.json())
      .then((data) => setHealth(data.data ?? data))
      .catch((err) => setHealthError(err.message));
  }, [API]);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const closeNav = () => setNavOpen(false);

  return (
    <>
      <header className={`header ${navOpen ? "nav-open" : ""}`}>
        <div className="header-inner">
          <Link to="/" className="logo" onClick={closeNav}>
            BoulevardTCG Market
          </Link>
          <nav id="main-nav" className="nav" aria-label="Navigation principale" onClick={(e) => { if (e.target instanceof HTMLElement && !e.target.closest(".nav-link")) closeNav(); }}>
            <Link to="/" className={`nav-link ${isActive("/") && location.pathname === "/" ? "active" : ""}`} {...(location.pathname === "/" ? { "aria-current": "page" as const } : {})} onClick={closeNav}>
              Accueil
            </Link>
            <Link to="/marketplace" className={`nav-link ${isActive("/marketplace") ? "active" : ""}`} {...(isActive("/marketplace") ? { "aria-current": "page" as const } : {})} onClick={closeNav}>
              Marketplace
            </Link>
            <Link to="/portfolio" className={`nav-link ${isActive("/portfolio") ? "active" : ""}`} {...(isActive("/portfolio") ? { "aria-current": "page" as const } : {})} onClick={closeNav}>
              Portfolio
            </Link>
            <Link to="/trades" className={`nav-link ${isActive("/trades") && location.pathname === "/trades" ? "active" : ""}`} {...(location.pathname === "/trades" ? { "aria-current": "page" as const } : {})} onClick={closeNav}>
              Échanges
            </Link>
            <Link to="/trades/new" className={`nav-link ${isActive("/trades/new") ? "active" : ""}`} {...(isActive("/trades/new") ? { "aria-current": "page" as const } : {})} onClick={closeNav}>
              Nouvelle offre
            </Link>
          </nav>
          <div className="header-actions">
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={navOpen}
              aria-controls="main-nav"
              aria-label={navOpen ? "Fermer le menu" : "Ouvrir le menu"}
              onClick={() => setNavOpen(!navOpen)}
            >
              {navOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={toggleTheme} aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}>
              {theme === "dark" ? "☀" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      <main className="layout">
        <Routes>
          <Route
            path="/"
            element={
              <section>
                <h1 className="page-title">Bienvenue sur BoulevardTCG Market</h1>
                <p className="page-subtitle">
                  Marketplace et échanges de cartes entre collectionneurs. Créez des offres, négociez en toute confiance.
                </p>
                <div className="card card-body">
                  <h2 className="card-title">Commencer</h2>
                  <p style={{ margin: "0 0 var(--space-4)", color: "var(--color-text-muted)" }}>
                    Connectez-vous avec votre compte Boutique (JWT) pour accéder à vos échanges et créer des offres.
                  </p>
                  <Link to="/trades" className="btn btn-primary">
                    Voir mes échanges
                  </Link>
                  <span style={{ marginLeft: "var(--space-2)" }} />
                  <Link to="/trades/new" className="btn btn-secondary">
                    Nouvelle offre
                  </Link>
                </div>
                <div style={{ marginTop: "var(--space-4)" }}>
                  <span className={`health-badge ${healthError ? "err" : health?.status === "ok" ? "ok" : ""}`} role="status" aria-live="polite">
                    {healthError ? "API hors ligne" : health?.status === "ok" ? "API connectée" : "Vérification…"}
                  </span>
                  {healthError && (
                    <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>
                      Lancez l’API : <code>npm run dev:server</code> (port 8081)
                    </p>
                  )}
                </div>
              </section>
            }
          />
          <Route path="/marketplace" element={<MarketplaceBrowse />} />
          <Route path="/marketplace/:id" element={<ListingDetail />} />
          <Route path="/portfolio" element={<PortfolioDashboard />} />
          <Route path="/trades" element={<TradesInbox />} />
          <Route path="/trades/new" element={<TradesNew />} />
          <Route path="/trades/:id" element={<TradeThread />} />
        </Routes>
      </main>

      <footer className="footer">
        BoulevardTCG Market — Échanges sécurisés entre collectionneurs
        {health?.status === "ok" && " · API connectée"}
      </footer>
    </>
  );
}

export default App;
