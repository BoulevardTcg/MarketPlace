import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PrismaClientCtor: typeof import("@prisma/client").PrismaClient =
  process.env.NODE_ENV === "test"
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
