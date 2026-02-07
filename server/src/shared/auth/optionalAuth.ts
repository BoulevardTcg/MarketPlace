import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./jwt.js";
import type { AuthUser } from "./types.js";

export type RequestWithOptionalUser = Request & { user?: AuthUser };

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }
  try {
    const token = header.slice(7);
    const user = verifyToken(token);
    (req as RequestWithOptionalUser).user = user;
  } catch {
    // Invalid token → continue as unauthenticated
  }
  next();
}
