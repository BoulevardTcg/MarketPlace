import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useCart } from "../../hooks/useCart";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  CartIcon,
  UserIcon,
  MenuIcon,
  CloseIcon,
  LogOutIcon,
  DashboardIcon,
  SunIcon,
  MoonIcon,
} from "../icons";
import { LiquidMetalIconButton } from "../ui/LiquidMetalIconButton";
import { SearchBox } from "./SearchBox";
import { MobileBottomSheet } from "./MobileBottomSheet";
import "./Navbar.css";

const NAV_LINKS = [
  { label: "Accueil", path: "/" },
  { label: "Marketplace", path: "/produits" },
  { label: "Mes annonces", path: "/annonces" },
  { label: "Portfolio", path: "/portfolio" },
  { label: "Échanges", path: "/trade" },
] as const;

interface NavbarProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export function Navbar({ theme, onToggleTheme }: NavbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { count: cartCount } = useCart();
  const reducedMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handleLogout = () => {
    logout();
  };

  const displayBadge =
    cartCount > 0 ? (cartCount > 9 ? "9+" : String(cartCount)) : null;

  return (
    <>
      <nav
        className={`navbar ${reducedMotion ? "navbar--reduced-motion" : ""}`}
        role="navigation"
        aria-label="Navigation principale"
      >
        <div className="navbar-pill">
          <div className="navbar-container">
            {/* Logo */}
            <button
              className="navbar-logo"
              onClick={() => navigate("/")}
              type="button"
              aria-label="BoulevardTCG - Accueil"
            >
              <img
                src="/img/phoenix-logo.png.png"
                alt="BoulevardTCG"
                className="navbar-logo-img"
              />
            </button>

            {/* Center links — desktop only */}
            <ul className="navbar-links">
              {NAV_LINKS.map(({ label, path }) => {
                const active = isActive(path);
                return (
                  <li key={path}>
                    <Link
                      to={path}
                      className={`navbar-link ${active ? "navbar-link--active" : ""}`}
                      {...(active ? { "aria-current": "page" as const } : {})}
                    >
                      <span className="navbar-link-text">{label}</span>
                      {active && <span className="navbar-underline" />}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Actions */}
            <div className="navbar-actions">
              {/* Search — desktop only */}
              <div className="navbar-search-desktop">
                <SearchBox />
              </div>

              {/* Theme toggle — effet chrome (même que pokecard) */}
              <LiquidMetalIconButton
                onClick={onToggleTheme}
                ariaLabel={
                  theme === "dark"
                    ? "Activer le mode clair"
                    : "Activer le mode sombre"
                }
                ariaPressed={theme === "dark"}
                size={37}
                borderThickness={3}
                intensity="soft"
                className="navbar-theme-toggle"
              >
                <span className="navbar-theme-icon" key={theme}>
                  {theme === "dark" ? (
                    <MoonIcon size={16} />
                  ) : (
                    <SunIcon size={16} />
                  )}
                </span>
              </LiquidMetalIconButton>

              {/* Cart */}
              <button
                className="navbar-icon-btn navbar-cart-btn"
                onClick={() => navigate("/panier")}
                type="button"
                aria-label={`Panier${cartCount > 0 ? ` (${cartCount} article${cartCount > 1 ? "s" : ""})` : ""}`}
              >
                <CartIcon size={18} />
                {displayBadge && (
                  <span className="navbar-cart-badge" aria-hidden="true">
                    {displayBadge}
                  </span>
                )}
              </button>

              {/* Auth actions — desktop only */}
              {isAuthenticated ? (
                <>
                  {isAdmin && (
                    <Link
                      to="/admin"
                      className="navbar-icon-btn navbar-desktop-only"
                      aria-label="Administration"
                    >
                      <DashboardIcon size={18} />
                    </Link>
                  )}
                  <Link
                    to="/profile"
                    className="navbar-account-btn navbar-desktop-only"
                  >
                    <UserIcon size={16} />
                    <span className="navbar-account-name">
                      {user?.firstName || user?.username || "Compte"}
                    </span>
                  </Link>
                  <button
                    className="navbar-icon-btn navbar-desktop-only"
                    onClick={handleLogout}
                    type="button"
                    aria-label="Se déconnecter"
                  >
                    <LogOutIcon size={18} />
                  </button>
                </>
              ) : (
                <Link
                  to="/connexion"
                  className="navbar-connexion-link navbar-desktop-only"
                >
                  Connexion
                </Link>
              )}

              {/* Mobile hamburger */}
              <button
                className="navbar-icon-btn navbar-hamburger"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                type="button"
                aria-label={
                  mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"
                }
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <CloseIcon size={20} />
                ) : (
                  <MenuIcon size={20} />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom sheet */}
      <MobileBottomSheet
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        links={NAV_LINKS}
        isActive={isActive}
        theme={theme}
        onToggleTheme={onToggleTheme}
        user={user}
        isAuthenticated={isAuthenticated}
        isAdmin={isAdmin}
        cartCount={cartCount}
        onLogout={handleLogout}
      />
    </>
  );
}
