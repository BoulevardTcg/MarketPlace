import jwt from "jsonwebtoken";
import { env, getJwtPublicKey } from "../config/env.js";
import type { AuthUser } from "./types.js";

/** Normalise une clé PEM : remplace les littéraux \\n par de vrais retours à la ligne
 *  (nécessaire quand Docker env_file ne convertit pas les \\n). */
function normalizePem(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * JWT payload attendu (Boutique / issuer).
 * - userId / sub : identifiant utilisateur
 * - roles : tableau de rôles (Boutique envoie roles: ['ADMIN'] si isAdmin)
 * - isAdmin : si présent et roles absent, on déduit roles
 * - username, firstName, email : pour GET /me et navbar
 */
interface JwtPayload {
  sub?: string;
  userId?: string;
  roles?: string[];
  isAdmin?: boolean;
  username?: string;
  firstName?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Options de vérification JWT.
 * Règle stricte : si clé publique présente → UNIQUEMENT RS256 (pas de fallback HS256, évite alg confusion).
 * Si JWT_ISSUER est défini, seuls les tokens avec iss correspondant sont acceptés.
 */
function getVerifyOptions(): { key: string; algorithms: jwt.Algorithm[]; issuer?: string } {
  const pubKeyRaw = getJwtPublicKey();
  const pubKey = normalizePem(pubKeyRaw);
  if (pubKey) {
    return {
      key: pubKey,
      algorithms: ["RS256"],
      ...(env.JWT_ISSUER ? { issuer: env.JWT_ISSUER } : {}),
    };
  }
  if (env.JWT_SECRET) {
    return {
      key: env.JWT_SECRET,
      algorithms: ["HS256"],
      ...(env.JWT_ISSUER ? { issuer: env.JWT_ISSUER } : {}),
    };
  }
  throw new Error("JWT config missing: set JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH (RS256) or JWT_SECRET (HS256)");
}

export function verifyToken(token: string): AuthUser {
  const { key, algorithms, issuer } = getVerifyOptions();
  const payload = jwt.verify(token, key, { algorithms, ...(issuer ? { issuer } : {}) }) as JwtPayload;
  const userId = payload.userId ?? payload.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid token: missing userId/sub");
  }
  const roles = Array.isArray(payload.roles)
    ? payload.roles
    : payload.isAdmin === true
      ? ["ADMIN"]
      : undefined;
  return {
    userId,
    roles,
    username: typeof payload.username === "string" ? payload.username : undefined,
    firstName: typeof payload.firstName === "string" ? payload.firstName : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    isAdmin: !!payload.isAdmin,
  };
}
