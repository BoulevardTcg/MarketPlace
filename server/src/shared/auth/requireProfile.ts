import type { Request, Response, NextFunction } from "express";
import type { RequestWithUser } from "./requireAuth.js";
import type { UserProfileType } from "@prisma/client";
import { prisma } from "../db/prisma.js";

/**
 * Middleware factory that requires the authenticated user to have at least one
 * of the specified profile types enabled.
 *
 * Must be placed AFTER requireAuth.
 * Returns 403 PROFILE_REQUIRED if the user does not have any of the required profiles.
 *
 * Usage: `requireProfile("INVESTOR", "COLLECTOR")`
 */
export function requireProfile(
  ...profileTypes: [UserProfileType, ...UserProfileType[]]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = (req as RequestWithUser).user?.userId;
    if (!userId) {
      next();
      return;
    }

    prisma.userActiveProfile
      .findFirst({
        where: {
          userId,
          profileType: { in: profileTypes },
        },
        select: { id: true },
      })
      .then((match) => {
        if (!match) {
          res.status(403).json({
            error: {
              code: "PROFILE_REQUIRED",
              message: `One of the following profiles is required: ${profileTypes.join(", ")}`,
            },
          });
          return;
        }
        next();
      })
      .catch(next);
  };
}
