import cron from "node-cron";
import app from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./shared/observability/logger.js";
import { runTcgdexDailySnapshot } from "./jobs/tcgdexDailySnapshot.js";
import { runBoutiquePriceSnapshot } from "./jobs/importPricesFromBoutique.js";

const server = app.listen(env.PORT, () => {
  logger.info("Server started", { port: env.PORT, nodeEnv: env.NODE_ENV });

  // Skip scheduled jobs in test env
  if (env.NODE_ENV === "test") return;

  // 1. Startup catch-up: run both snapshots once (async, non-blocking)
  runTcgdexDailySnapshot(logger).catch((err) => {
    logger.error("Tcgdex snapshot (startup) failed", { error: String(err) });
  });
  runBoutiquePriceSnapshot(logger).catch((err) => {
    logger.error("Boutique price snapshot (startup) failed", { error: String(err) });
  });

  // 2. Daily at 06:00 UTC — TCGdex
  cron.schedule("0 6 * * *", () => {
    runTcgdexDailySnapshot(logger).catch((err) => {
      logger.error("Tcgdex snapshot (cron) failed", { error: String(err) });
    });
  });

  // 3. Daily at 06:05 UTC — Boutique prices (staggered to avoid overlap)
  cron.schedule("5 6 * * *", () => {
    runBoutiquePriceSnapshot(logger).catch((err) => {
      logger.error("Boutique price snapshot (cron) failed", { error: String(err) });
    });
  });

  logger.info("Jobs scheduled: TCGdex at 06:00 UTC, Boutique prices at 06:05 UTC");
});

server.on("error", (err) => {
  logger.error("Server error", { error: String(err) });
  process.exit(1);
});
