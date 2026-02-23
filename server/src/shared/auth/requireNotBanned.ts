import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "./requireAuth.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../http/response.js";

/**
 * Re-check ban status inside a Prisma transaction to close the race window
 * between the middleware check and the actual write operation.
 * Use for critical writes (trade accept, listing publish, etc.).
 */
export async function assertNotBannedInTx(
  tx: Pick<typeof prisma, "userModerationState">,
  userId: string,
): Promise<void> {
  const state = await tx.userModerationState.findUnique({
    where: { userId },
    select: { isBanned: true },
  });
  if (state?.isBanned) {
    throw new AppError("USER_BANNED", "Your account has been banned", 403);
  }
}

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
