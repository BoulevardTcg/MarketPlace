import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { createRequire } from "node:module";
import { env } from "../config/env.js";

const require = createRequire(import.meta.url);
const useSqlite = env.DATABASE_URL.startsWith("file:");
const PrismaClientCtor: typeof import("@prisma/client").PrismaClient =
  process.env.NODE_ENV === "test" || useSqlite
    ? require("../../test/prisma-client").PrismaClient
    : require("@prisma/client").PrismaClient;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClientType | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClientCtor({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
