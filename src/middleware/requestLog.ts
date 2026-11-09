import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on("finish", () => {
    logger.info("request", {
      method: req.method,
      path: req.originalUrl.split("?")[0] ?? req.path,
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
}
