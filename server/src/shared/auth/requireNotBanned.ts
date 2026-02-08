import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "./requireAuth.js";
import { prisma } from "../db/prisma.js";

/**
 * Middleware that blocks banned users from write operations.
 * Must be placed AFTER requireAuth. Returns 403 USER_BANNED if the user is banned.
 *
 * Admin routes (requireRole("ADMIN")) intentionally skip this middleware:
 * admins cannot be banned, and moderation actions must remain available.
 */
export function requireNotBanned(req: Request, res: Response, next: NextFunction): void {
  const userId = (req as RequestWithUser).user?.userId;
  if (!userId) {
    next();
    return;
  }

  prisma.userModerationState
    .findUnique({
      where: { userId },
      select: { isBanned: true },
    })
    .then((state) => {
      if (state?.isBanned) {
        res.status(403).json({
          error: { code: "USER_BANNED", message: "Your account has been banned" },
        });
        return;
      }
      next();
    })
    .catch(next);
}
