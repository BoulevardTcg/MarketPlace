import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "./jwt.js";
import type { AuthUser } from "./types.js";

export type RequestWithUser = Request & { user: AuthUser };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" },
    });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const user = verifyToken(token);
    (req as RequestWithUser).user = user;
    next();
  } catch {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
  }
}
