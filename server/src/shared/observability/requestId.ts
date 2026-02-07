import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const id = (req.headers[REQUEST_ID_HEADER] as string) ?? randomUUID();
  (req as Request & { requestId: string }).requestId = id;
  next();
}
