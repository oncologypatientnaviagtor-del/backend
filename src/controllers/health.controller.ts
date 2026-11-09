import type { Request, Response } from "express";
import { isDatabaseReady } from "../db/connect";

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: "ok",
    database: isDatabaseReady() ? "connected" : "disconnected",
  });
}
