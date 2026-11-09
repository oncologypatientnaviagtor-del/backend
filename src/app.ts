import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { requestLog } from "./middleware/requestLog";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, methods: ["GET", "POST"] }));
  app.use(express.json({ limit: "32kb" }));
  app.use(requestLog);
  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
