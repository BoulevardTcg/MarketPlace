type LogLevel = "info" | "warn" | "error" | "debug";

interface LogPayload {
  level: LogLevel;
  msg: string;
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

function formatLog(payload: LogPayload): string {
  return JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

export const logger = {
  info(msg: string, meta?: Record<string, unknown>): void {
    process.stdout.write(formatLog({ level: "info", msg, ...meta }) + "\n");
  },
  warn(msg: string, meta?: Record<string, unknown>): void {
    process.stdout.write(formatLog({ level: "warn", msg, ...meta }) + "\n");
  },
  error(msg: string, meta?: Record<string, unknown>): void {
    process.stderr.write(formatLog({ level: "error", msg, ...meta }) + "\n");
  },
  debug(msg: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === "development") {
      process.stdout.write(formatLog({ level: "debug", msg, ...meta }) + "\n");
    }
  },
};
