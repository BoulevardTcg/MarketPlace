import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthUser } from "./types.js";

/**
 * JWT payload attendu (Shop / issuer).
 * - userId / sub : identifiant utilisateur
 * - roles : tableau de rôles pour requireRole(). req.user.roles est alimenté ici.
 *   Claim exact attendu : payload.roles (array de strings). Valeurs ex. "ADMIN", "SELLER".
 *   En prod : vérifier avec l'issuer (Shop) le claim réel (peut être realm_access.roles
 *   ou resource_access.<client>.roles selon Keycloak/OAuth). Adapter l'extraction si besoin.
 */
interface JwtPayload {
  sub: string;
  userId?: string;
  roles?: string[];
  [key: string]: unknown;
}

function getVerifyOptions(): { key: string; algorithms: jwt.Algorithm[] } {
  if (env.JWT_PUBLIC_KEY) {
    return { key: env.JWT_PUBLIC_KEY, algorithms: ["RS256"] };
  }
  if (env.JWT_SECRET) {
    return { key: env.JWT_SECRET, algorithms: ["HS256"] };
  }
  throw new Error("JWT config missing: set JWT_PUBLIC_KEY (RS256) or JWT_SECRET (HS256)");
}

export function verifyToken(token: string): AuthUser {
  const { key, algorithms } = getVerifyOptions();
  const payload = jwt.verify(token, key, { algorithms }) as JwtPayload;
  const userId = payload.userId ?? payload.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid token: missing userId/sub");
  }
  return {
    userId,
    roles: Array.isArray(payload.roles) ? payload.roles : undefined,
  };
}
