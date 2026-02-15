import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route, Link } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { CartProvider } from "./hooks/useCart";
import { Navbar } from "./components/Navbar/Navbar";
import { PageHeader, Skeleton } from "./components";
import { ErrorBoundary } from "./components/ErrorBoundary";

const TradesInbox = lazy(() => import("./pages/TradesInbox").then((m) => ({ default: m.TradesInbox })));
const TradeThread = lazy(() => import("./pages/TradeThread").then((m) => ({ default: m.TradeThread })));
const TradesNew = lazy(() => import("./pages/TradesNew").then((m) => ({ default: m.TradesNew })));
const MarketplaceBrowse = lazy(() => import("./pages/MarketplaceBrowse").then((m) => ({ default: m.MarketplaceBrowse })));
const ListingDetail = lazy(() => import("./pages/ListingDetail").then((m) => ({ default: m.ListingDetail })));
const CreateListing = lazy(() => import("./pages/CreateListing").then((m) => ({ default: m.CreateListing })));
const MyListings = lazy(() => import("./pages/MyListings").then((m) => ({ default: m.MyListings })));
const EditListing = lazy(() => import("./pages/EditListing").then((m) => ({ default: m.EditListing })));
const PortfolioDashboard = lazy(() => import("./pages/PortfolioDashboard").then((m) => ({ default: m.PortfolioDashboard })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));

function PageFallback() {
  return (
    <section>
      <Skeleton variant="heading" width="40%" />
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="rect" height="200px" />
    </section>
  );
}

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
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
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
        <Suspense fallback={<PageFallback />}>
          <Routes>
          <Route
            path="/"
            element={
              <section>
                <PageHeader
                  title="BoulevardTCG Market"
                  subtitle="Marketplace et échanges de cartes entre collectionneurs. Créez des offres, négociez en toute confiance."
                  action={
                    <Link to="/produits" className="btn btn-primary">
                      Parcourir le marketplace
                    </Link>
                  }
                />
                <div className="card card-body">
                  <h2 className="card-title">Commencer</h2>
                  <p className="body-md" style={{ margin: "0 0 var(--space-4)" }}>
                    Connectez-vous avec votre compte BoulevardTCG pour accéder au marketplace et créer des offres d'échange.
                  </p>
                  <div className="page-header-actions" style={{ marginTop: "var(--space-3)" }}>
                    <Link to="/trades" className="btn btn-secondary">
                      Mes échanges
                    </Link>
                    <Link to="/trades/new" className="btn btn-secondary">
                      Nouvelle offre
                    </Link>
                    <Link to="/annonces/new" className="btn btn-secondary">
                      Créer une annonce
                    </Link>
                  </div>
                </div>
                <div style={{ marginTop: "var(--space-4)" }}>
                  <span
                    className={`health-badge ${healthError ? "err" : health?.status === "ok" ? "ok" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    {healthError ? "API hors ligne" : health?.status === "ok" ? "API connectée" : "Vérification…"}
                  </span>
                  {healthError && (
                    <p className="body-md" style={{ margin: "var(--space-2) 0 0" }}>
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
        </Suspense>
      </main>

      <footer className="footer">
        BoulevardTCG Market — Échanges sécurisés entre collectionneurs
        {health?.status === "ok" && " · API connectée"}
      </footer>
    </>
  );
}

function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section>
      <PageHeader title={title} subtitle={description} />
    </section>
  );
}

export default App;
