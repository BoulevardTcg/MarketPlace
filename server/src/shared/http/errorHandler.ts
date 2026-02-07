import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { isAppError } from "./response.js";
import { logger } from "../observability/logger.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
    return;
  }

  if (isAppError(err)) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  logger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}
