/**
 * Base URLs — via reverse proxy (Phase 2) tout passe par la même origine :
 *   /api/*    → Boutique   (login, refresh, logout, …)
 *   /market/* → Marketplace (me, trade, marketplace, …)
 * En dev sans proxy : fallback sur VITE_* env vars.
 */
const MARKET_BASE = import.meta.env.VITE_API_URL ?? "/market";
const BOUTIQUE_BASE = import.meta.env.VITE_BOUTIQUE_API_URL ?? "/api";

export function getApiUrl(): string {
  return MARKET_BASE;
}

export function getBoutiqueApiUrl(): string {
  return BOUTIQUE_BASE;
}

// --- Access token en mémoire (Phase 3 : plus de localStorage pour refresh) ---
let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

/**
 * Silent refresh : appelle POST /api/auth/refresh (cookie httpOnly envoyé automatiquement).
 * Renvoie le nouveau accessToken ou null si la session est expirée.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(`${BOUTIQUE_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include", // Envoie le cookie httpOnly
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    const { accessToken } = await res.json();
    if (accessToken) {
      setAccessToken(accessToken);
      return accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch avec auth vers le Marketplace API.
 * Si 401 → tente un silent refresh → retry une fois.
 */
export async function fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${MARKET_BASE}${path}`, { ...options, headers });
  };

  let res = await doFetch(_accessToken);

  // Si 401, tenter un refresh et retrier
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  return res;
}
