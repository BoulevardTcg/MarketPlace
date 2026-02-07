import { z } from "zod";
import dotenv from "dotenv";
import path from "node:path";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().min(0).max(65535).default(8081),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  /** S3 bucket for listing images (presigned upload). If unset, presigned-upload returns 503. */
  LISTING_IMAGES_BUCKET: z.string().optional(),
  /** AWS region for S3 (e.g. eu-west-1). Required when LISTING_IMAGES_BUCKET is set. */
  AWS_REGION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  return parsed.data;
}

export const env = loadEnv();
