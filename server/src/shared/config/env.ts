import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// SÉCURITÉ : le Marketplace ne doit JAMAIS avoir accès à la clé privée (fuite, logs, dump env).
if (process.env.JWT_PRIVATE_KEY) {
  throw new Error(
    "JWT_PRIVATE_KEY must never be set in Marketplace. Use only JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH (Boutique private key stays on Boutique)."
  );
}

const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const defaultDevDb = "postgresql://boulevard:boulevard_dev@localhost:5432/boulevard_market";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().min(0).max(65535).default(8081),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .optional()
    .transform((v) => (v || (isDev ? defaultDevDb : undefined))!)
    .refine((v) => v?.length, { message: "DATABASE_URL is required" }),
  JWT_PUBLIC_KEY: z.string().optional(),
  /** Chemin vers le fichier PEM de la clé publique (alternative à JWT_PUBLIC_KEY, évite PEM dans l'env). */
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  /** Issuer attendu du JWT (ex. URL du Shop). Si défini, jwt.verify rejette les tokens dont iss ne correspond pas. */
  JWT_ISSUER: z.string().min(1).optional(),
  /** Liste d'IDs utilisateur autorisés comme ADMIN (séparés par des virgules). Si défini, requireRole("ADMIN") exige userId dans cette liste en plus du rôle JWT. */
  ADMIN_USER_IDS: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  /** S3 bucket for listing images (presigned upload). If unset, presigned-upload returns 503. */
  LISTING_IMAGES_BUCKET: z.string().optional(),
  /** AWS region for S3 (e.g. eu-west-1). Required when LISTING_IMAGES_BUCKET is set. */
  AWS_REGION: z.string().optional(),
  /** Enable Cardmarket Price Guide CSV import job. */
  PRICE_IMPORT_ENABLED: z.enum(["true", "false"]).default("false"),
  /** Enable profile-type gating on pricing/trade routes. Default OFF for backwards compatibility. */
  PROFILE_GATE_ENABLED: z.enum(["true", "false"]).default("false"),
  /** HMAC-SHA256 secret for verifying payment webhooks from the Shop service. */
  WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  const data = parsed.data;

  // Production guards: ces variables sont critiques pour la sécurité en prod.
  if (data.NODE_ENV === "production") {
    if (!data.JWT_ISSUER) {
      throw new Error("JWT_ISSUER is required in production (prevents accepting tokens from untrusted issuers).");
    }
    if (!data.ADMIN_USER_IDS) {
      throw new Error("ADMIN_USER_IDS is required in production (prevents any JWT with role=ADMIN from gaining admin access).");
    }
  }

  return data;
}

export const env = loadEnv();

/** Retourne la clé publique PEM (fichier si JWT_PUBLIC_KEY_PATH, sinon env JWT_PUBLIC_KEY). */
export function getJwtPublicKey(): string | undefined {
  const pathKey = env.JWT_PUBLIC_KEY_PATH;
  if (pathKey) {
    try {
      return fs.readFileSync(pathKey, "utf8").trim();
    } catch (e) {
      throw new Error(`JWT_PUBLIC_KEY_PATH: cannot read file ${pathKey}: ${e}`);
    }
  }
  return env.JWT_PUBLIC_KEY;
}
