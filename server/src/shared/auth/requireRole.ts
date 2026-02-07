import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "./requireAuth.js";

/**
 * Factory that returns a middleware checking the authenticated user has the given role.
 * Must be placed AFTER requireAuth in the middleware chain.
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
    next();
  };
}
