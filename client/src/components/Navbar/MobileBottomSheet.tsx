import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  CloseIcon,
  CartIcon,
  UserIcon,
  LogOutIcon,
  DashboardIcon,
  SunIcon,
  MoonIcon,
} from "../icons";
import { SearchBox } from "./SearchBox";

interface MobileBottomSheetProps {
  open: boolean;
  onClose: () => void;
  links: ReadonlyArray<{ label: string; path: string }>;
  isActive: (path: string) => boolean;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  user: {
    userId: string;
    username?: string;
    firstName?: string;
    roles: string[];
  } | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  cartCount: number;
  onLogout: () => void;
}

export function MobileBottomSheet({
  open,
  onClose,
  links,
  isActive,
  theme,
  onToggleTheme,
  user,
  isAuthenticated,
  isAdmin,
  cartCount,
  onLogout,
}: MobileBottomSheetProps) {
  const navigate = useNavigate();

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.classList.add("noScroll");
    } else {
      document.body.classList.remove("noScroll");
    }
    return () => {
      document.body.classList.remove("noScroll");
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const displayBadge =
    cartCount > 0 ? (cartCount > 9 ? "9+" : String(cartCount)) : null;

  return createPortal(
    <>
      {/* Overlay */}
      <div
        className="mobile-sheet-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="mobile-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation mobile"
      >
        {/* Handle */}
        <div className="mobile-sheet-handle" />

        {/* Header */}
        <div className="mobile-sheet-header">
          <button
            className="mobile-sheet-logo"
            onClick={() => {
              onClose();
              navigate("/");
            }}
            type="button"
            aria-label="BoulevardTCG - Accueil"
          >
            <img
              src="/img/phoenix-logo.png.png"
              alt="BoulevardTCG"
              style={{ height: 32, objectFit: "contain" }}
            />
          </button>
          <button
            className="mobile-sheet-close"
            onClick={onClose}
            type="button"
            aria-label="Fermer le menu"
          >
            <CloseIcon size={24} />
          </button>
        </div>

        {/* Search */}
        <div className="mobile-sheet-search">
          <SearchBox onResultClick={onClose} fullWidth />
        </div>

        {/* Links */}
        <ul className="mobile-sheet-links">
          {links.map(({ label, path }) => {
            const active = isActive(path);
            return (
              <li key={path}>
                <Link
                  to={path}
                  className={`mobile-sheet-link ${active ? "mobile-sheet-link--active" : ""}`}
                  onClick={onClose}
                  {...(active ? { "aria-current": "page" as const } : {})}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Actions */}
        <div className="mobile-sheet-actions">
          <button
            className="mobile-sheet-action"
            onClick={onToggleTheme}
            type="button"
          >
            {theme === "dark" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
            <span>{theme === "dark" ? "Mode clair" : "Mode sombre"}</span>
          </button>

          <Link
            to="/panier"
            className="mobile-sheet-action mobile-sheet-action-cart"
            onClick={onClose}
          >
            <CartIcon size={20} />
            <span>Panier</span>
            {displayBadge && (
              <span
                className="navbar-cart-badge"
                style={{ position: "static", marginLeft: "auto" }}
              >
                {displayBadge}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <>
              {isAdmin && (
                <Link
                  to="/admin"
                  className="mobile-sheet-action"
                  onClick={onClose}
                >
                  <DashboardIcon size={20} />
                  <span>Administration</span>
                </Link>
              )}
              <Link
                to="/profile"
                className="mobile-sheet-action"
                onClick={onClose}
              >
                <UserIcon size={20} />
                <span>
                  {user?.firstName || user?.username || "Mon compte"}
                </span>
              </Link>
              <button
                className="mobile-sheet-action"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                type="button"
              >
                <LogOutIcon size={20} />
                <span>Déconnexion</span>
              </button>
            </>
          ) : (
            <Link
              to="/connexion"
              className="mobile-sheet-login-cta"
              onClick={onClose}
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
