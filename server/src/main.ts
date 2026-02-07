import app from "./app.js";
import { env } from "./shared/config/env.js";
import { logger } from "./shared/observability/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info("Server started", { port: env.PORT, nodeEnv: env.NODE_ENV });
});

server.on("error", (err) => {
  logger.error("Server error", { error: String(err) });
  process.exit(1);
});
