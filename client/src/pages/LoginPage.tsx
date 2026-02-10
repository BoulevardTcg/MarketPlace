import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [show2FA, setShow2FA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(
      email.trim(),
      password,
      show2FA ? twoFactorCode : undefined
    );
    setSubmitting(false);
    if (result.ok) {
      navigate(returnTo, { replace: true });
      return;
    }
    setError(result.error);
    if (result.requiresTwoFactor) setShow2FA(true);
  };

  return (
    <section>
      <h1 className="page-title">Connexion</h1>
      <p className="page-subtitle">
        Connectez-vous avec votre compte BoulevardTCG pour accéder au marketplace
        et aux échanges.
      </p>

      <div className="card card-body" style={{ maxWidth: "28rem" }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              autoComplete="email"
              required
              disabled={submitting}
            />
          </div>
          <div className="form-group">
            <label className="label" htmlFor="login-password">
              Mot de passe
            </label>
            <input
              id="login-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={show2FA ? "one-time-code" : "current-password"}
              required
              disabled={submitting}
            />
          </div>
          {show2FA && (
            <div className="form-group">
              <label className="label" htmlFor="login-2fa">
                Code 2FA
              </label>
              <input
                id="login-2fa"
                type="text"
                className="input"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="000000"
                autoComplete="one-time-code"
                maxLength={6}
                disabled={submitting}
              />
            </div>
          )}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: "var(--space-4)" }}>
              {error}
            </div>
          )}
          <div className="btn-group">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Connexion…" : "Se connecter"}
            </button>
            <Link to="/" className="btn btn-secondary">
              Annuler
            </Link>
          </div>
        </form>
      </div>

      <p style={{ marginTop: "var(--space-4)", color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>
        Pas de compte ? Inscrivez-vous sur{" "}
        <a href={import.meta.env.VITE_BOUTIQUE_URL ?? "http://localhost:5173"} target="_blank" rel="noopener noreferrer">
          BoulevardTCG
        </a>.
      </p>
    </section>
  );
}
