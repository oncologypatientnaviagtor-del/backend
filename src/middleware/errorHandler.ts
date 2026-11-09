import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "Please check the information you sent and try again." });
    return;
  }

  logger.error("unhandled_error");
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
