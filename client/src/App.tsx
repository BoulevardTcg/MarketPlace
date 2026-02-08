import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import { TradesInbox } from "./pages/TradesInbox";
import { TradeThread } from "./pages/TradeThread";
import { TradesNew } from "./pages/TradesNew";

const API = import.meta.env.VITE_API_URL ?? "";

function App() {
  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const location = useLocation();

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

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="logo">
            BoulevardTCG Market
          </Link>
          <nav className="nav">
            <Link to="/" className={`nav-link ${isActive("/") && location.pathname === "/" ? "active" : ""}`}>
              Accueil
            </Link>
            <Link to="/trades" className={`nav-link ${isActive("/trades") && location.pathname === "/trades" ? "active" : ""}`}>
              Échanges
            </Link>
            <Link to="/trades/new" className={`nav-link ${isActive("/trades/new") ? "active" : ""}`}>
              Nouvelle offre
            </Link>
          </nav>
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
                  <span className={`health-badge ${healthError ? "err" : health?.status === "ok" ? "ok" : ""}`}>
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
