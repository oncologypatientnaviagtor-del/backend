import type { NextFunction, Request, Response } from "express";
import { isDatabaseReady } from "../db/connect";
import { DATABASE_UNAVAILABLE } from "../utils/httpError";

export function requireDatabase(_req: Request, res: Response, next: NextFunction): void {
  if (!isDatabaseReady()) {
    res.status(503).json({ error: DATABASE_UNAVAILABLE });
    return;
  }
  next();
}
