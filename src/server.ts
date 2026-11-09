import "dotenv/config";
import { createApp } from "./app";
import { env } from "./config/env";
import { connectDatabase } from "./db/connect";
import { linkStoredVisitMaps } from "./services/care-graph.service";
import { logger } from "./utils/logger";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info("server_listening", { port: env.PORT });
});

connectDatabase()
  .then(() => linkStoredVisitMaps())
  .catch(() => {
    logger.error("database_connection_failed");
  });
