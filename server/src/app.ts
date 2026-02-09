import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./shared/config/env.js";
import { requestIdMiddleware, REQUEST_ID_HEADER } from "./shared/observability/requestId.js";
import { httpLoggerMiddleware } from "./shared/observability/httpLogger.js";
import { errorHandler } from "./shared/http/errorHandler.js";
import { healthRoutes } from "./domains/health/routes.js";
import { authRoutes } from "./domains/auth/routes.js";
import { pricingRoutes } from "./domains/pricing/routes.js";
import { marketplaceRoutes } from "./domains/marketplace/routes.js";
import { tradeRoutes } from "./domains/trade/routes.js";
import { collectionRoutes } from "./domains/collection/routes.js";
import { profileRoutes } from "./domains/profile/routes.js";
import { analyticsRoutes } from "./domains/analytics/routes.js";
import { handoverRoutes } from "./domains/handover/routes.js";
import { uploadRoutes } from "./domains/upload/routes.js";
import { trustRoutes } from "./domains/trust/routes.js";
import { profileTypesRoutes } from "./domains/profile-types/routes.js";

const app = express();

app.use(helmet());
app.use(express.json());

// CORS: supports comma-separated origins. In dev, allow Vite client (5173) by default if unset.
const corsOrigin = env.CORS_ORIGIN ?? (env.NODE_ENV === "development" ? "http://localhost:5173" : undefined);
if (corsOrigin) {
  const origins = corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins.length === 1 ? origins[0] : origins }));
}

// Rate limiting (disabled in tests to avoid flaky failures)
if (env.NODE_ENV !== "test") {
  const globalLimiter = rateLimit({
    windowMs: 60_000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
  });

  const writeLimiter = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
  });

  app.use(globalLimiter);
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      return writeLimiter(req, res, next);
    }
    next();
  });
}

app.use(requestIdMiddleware);
app.use((req, res, next) => {
  const id = (req as express.Request & { requestId?: string }).requestId;
  if (id) res.setHeader(REQUEST_ID_HEADER, id);
  next();
});
app.use(httpLoggerMiddleware);

app.use(healthRoutes);
app.use(authRoutes);
app.use(profileRoutes);
app.use(analyticsRoutes);
app.use(handoverRoutes);
app.use(uploadRoutes);
app.use(pricingRoutes);
app.use(marketplaceRoutes);
app.use(tradeRoutes);
app.use(collectionRoutes);
app.use(trustRoutes);
app.use(profileTypesRoutes);

app.use(errorHandler);
app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
});

export default app;
