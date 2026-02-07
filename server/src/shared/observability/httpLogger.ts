import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger.js";

type RequestWithId = Request & { requestId?: string };

export function httpLoggerMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    logger.info("request", {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    });
  });
  next();
}
