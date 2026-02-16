import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "./requireAuth.js";
import { env } from "../config/env.js";

/** Set des userId autorisés comme ADMIN quand ADMIN_USER_IDS est défini (parsed once). */
const adminUserIdsSet = ((): Set<string> | null => {
  const raw = env.ADMIN_USER_IDS;
  if (!raw?.trim()) return null;
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
})();

/**
 * Factory that returns a middleware checking the authenticated user has the given role.
 * Must be placed AFTER requireAuth. Uses req.user.roles (from JWT payload.roles).
 * For role "ADMIN": if ADMIN_USER_IDS is set, user.userId must also be in that list (allowlist).
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as RequestWithUser).user;
    if (!user?.roles?.includes(role)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: `Requires role: ${role}` },
      });
      return;
    }
    if (role === "ADMIN" && adminUserIdsSet !== null) {
      if (!user.userId || !adminUserIdsSet.has(user.userId)) {
        res.status(403).json({
          error: { code: "FORBIDDEN", message: "Requires role: ADMIN (not in allowlist)" },
        });
        return;
      }
    }
    next();
  };
}
