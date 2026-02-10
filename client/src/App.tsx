import { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { CartProvider } from "./hooks/useCart";
import { Navbar } from "./components/Navbar/Navbar";
import { TradesInbox } from "./pages/TradesInbox";
import { TradeThread } from "./pages/TradeThread";
import { TradesNew } from "./pages/TradesNew";
import { MarketplaceBrowse } from "./pages/MarketplaceBrowse";
import { ListingDetail } from "./pages/ListingDetail";
import { CreateListing } from "./pages/CreateListing";
import { MyListings } from "./pages/MyListings";
import { EditListing } from "./pages/EditListing";
import { InventoryPage } from "./pages/InventoryPage";
import { PortfolioDashboard } from "./pages/PortfolioDashboard";
import { LoginPage } from "./pages/LoginPage";

// Via reverse proxy : /market/* → Marketplace API
const API = import.meta.env.VITE_API_URL ?? "/market";

function getTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppContent />
      </CartProvider>
    </AuthProvider>
  );
}

function AppContent() {
  const [health, setHealth] = useState<{ status?: string } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(getTheme);

  useEffect(() => {
    setTheme(getTheme());
  }, []);

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
  }, []);

  return (
    <>
      <Navbar theme={theme} onToggleTheme={toggleTheme} />

      <main className="layout navbar-offset">
        <Routes>
          <Route
            path="/"
            element={
              <section>
                <h1 className="page-title">
                  Bienvenue sur BoulevardTCG Market
                </h1>
                <p className="page-subtitle">
                  Marketplace et échanges de cartes entre collectionneurs. Créez
                  des offres, négociez en toute confiance.
                </p>
                <div className="card card-body">
                  <h2 className="card-title">Commencer</h2>
                  <p
                    style={{
                      margin: "0 0 var(--space-4)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Connectez-vous avec votre compte BoulevardTCG pour accéder
                    au marketplace et créer des offres d'échange.
                  </p>
                  <Link to="/trades" className="btn btn-primary">
                    Voir mes échanges
                  </Link>
                  <span style={{ marginLeft: "var(--space-2)" }} />
                  <Link to="/trades/new" className="btn btn-secondary">
                    Nouvelle offre
                  </Link>
                  <span style={{ marginLeft: "var(--space-2)" }} />
                  <Link to="/annonces/new" className="btn btn-secondary">
                    Créer une annonce
                  </Link>
                </div>
                <div style={{ marginTop: "var(--space-4)" }}>
                  <span
                    className={`health-badge ${healthError ? "err" : health?.status === "ok" ? "ok" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {healthError
                      ? "API hors ligne"
                      : health?.status === "ok"
                        ? "API connectée"
                        : "Vérification…"}
                  </span>
                  {healthError && (
                    <p
                      style={{
                        margin: "var(--space-2) 0 0",
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      Lancez l'API : <code>npm run dev:server</code> (port 8081)
                    </p>
                  )}
                </div>
              </section>
            }
          />
          <Route path="/produits" element={<MarketplaceBrowse />} />
          <Route path="/marketplace" element={<MarketplaceBrowse />} />
          <Route path="/marketplace/:id" element={<ListingDetail />} />
          <Route path="/annonces" element={<MyListings />} />
          <Route path="/annonces/new" element={<CreateListing />} />
          <Route path="/annonces/:id/edit" element={<EditListing />} />
          <Route path="/inventaire" element={<InventoryPage />} />
          <Route path="/portfolio" element={<PortfolioDashboard />} />
          <Route path="/trade" element={<TradesInbox />} />
          <Route path="/trades" element={<TradesInbox />} />
          <Route path="/trades/new" element={<TradesNew />} />
          <Route path="/trades/:id" element={<TradeThread />} />
          <Route
            path="/actualites"
            element={
              <PlaceholderPage
                title="Actualités"
                description="Les dernières nouvelles du monde TCG arrivent bientôt."
              />
            }
          />
          <Route
            path="/contact"
            element={
              <PlaceholderPage
                title="Contact"
                description="Contactez-nous pour toute question."
              />
            }
          />
          <Route
            path="/panier"
            element={
              <PlaceholderPage
                title="Panier"
                description="Votre panier est vide."
              />
            }
          />
          <Route
            path="/profile"
            element={
              <PlaceholderPage
                title="Mon profil"
                description="Gestion de votre profil utilisateur."
              />
            }
          />
          <Route path="/connexion" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <PlaceholderPage
                title="Administration"
                description="Panneau d'administration."
              />
            }
          />
        </Routes>
      </main>

      <footer className="footer">
        BoulevardTCG Market — Échanges sécurisés entre collectionneurs
        {health?.status === "ok" && " · API connectée"}
      </footer>
    </>
  );
}

function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section>
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{description}</p>
    </section>
  );
}

export default App;
