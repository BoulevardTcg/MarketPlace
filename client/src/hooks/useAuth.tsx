import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getAccessToken,
  setAccessToken,
  refreshAccessToken,
  fetchWithAuth,
  getBoutiqueApiUrl,
} from "../api";

export interface User {
  userId: string;
  username?: string;
  firstName?: string;
  roles: string[];
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  /** Connexion via API Boutique (email + mot de passe, 2FA si activé) */
  login: (email: string, password: string, twoFactorCode?: string) => Promise<{ ok: true } | { ok: false; error: string; requiresTwoFactor?: boolean }>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const loadIdRef = useRef(0);

  /** Charge l'utilisateur via GET /market/me avec le token en mémoire. */
  const loadUser = useCallback(async () => {
    const myId = ++loadIdRef.current;
    setLoading(true);

    // Si pas de token en mémoire → tenter un silent refresh (cookie httpOnly)
    let token = getAccessToken();
    if (!token) {
      token = await refreshAccessToken();
    }
    if (!token) {
      if (myId === loadIdRef.current) {
        setUser(null);
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetchWithAuth("/me");
      if (myId !== loadIdRef.current) return;
      if (!res.ok) throw new Error("Not authenticated");
      const json = await res.json();
      if (myId !== loadIdRef.current) return;
      const data = json.data ?? json;
      setUser({
        userId: data.userId,
        username: data.username,
        firstName: data.firstName,
        roles: data.roles ?? [],
      });
    } catch {
      if (myId !== loadIdRef.current) return;
      setUser(null);
    } finally {
      if (myId === loadIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      twoFactorCode?: string
    ): Promise<{ ok: true } | { ok: false; error: string; requiresTwoFactor?: boolean }> => {
      const base = getBoutiqueApiUrl();
      if (!base) {
        return { ok: false, error: "API Boutique non configurée" };
      }
      const body: { email: string; password: string; twoFactorCode?: string } = {
        email,
        password,
      };
      if (twoFactorCode !== undefined && twoFactorCode !== "") body.twoFactorCode = twoFactorCode;

      const res = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Reçoit le cookie httpOnly refresh
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.requiresTwoFactor === true && !twoFactorCode) {
        return { ok: false, error: data.message ?? "Code 2FA requis", requiresTwoFactor: true };
      }
      if (!res.ok) {
        return {
          ok: false,
          error: data.error ?? `Erreur ${res.status}`,
          requiresTwoFactor: !!data.requiresTwoFactor,
        };
      }
      const token = data.accessToken;
      const u = data.user;
      if (!token) {
        return { ok: false, error: "Réponse invalide (pas de token)" };
      }

      // Access token en mémoire (plus de localStorage)
      setAccessToken(token);
      loadIdRef.current += 1;
      setUser({
        userId: u?.id ?? data.userId,
        username: u?.username,
        firstName: u?.firstName,
        roles: u?.isAdmin ? ["ADMIN"] : (data.roles ?? []),
      });
      return { ok: true };
    },
    []
  );

  const logout = useCallback(async () => {
    const base = getBoutiqueApiUrl();
    try {
      // Appelle logout Boutique pour invalider le refresh + clear cookie
      await fetch(`${base}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // Ignorer les erreurs réseau
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = !!user;
  const isAdmin = user?.roles?.includes("ADMIN") ?? false;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
