import type { Response } from "express";

export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}

export function fail(res: Response, code: string, message: string, status: number): void {
  res.status(status).json({ error: { code, message } });
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 500
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
