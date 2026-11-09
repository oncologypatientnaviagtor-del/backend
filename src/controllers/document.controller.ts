import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { MAX_REPORT_BYTES, reportKind, saveReport } from "../services/document.service";
import { HttpError } from "../utils/httpError";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_REPORT_BYTES, files: 1 },
  fileFilter(_req, file, callback) {
    if (!reportKind(file.originalname, file.mimetype)) {
      callback(new HttpError(400, "Please choose a PDF or a photo (JPG or PNG)."));
      return;
    }
    callback(null, true);
  },
});

const sessionParams = z.object({
  sessionId: z.string().uuid(),
});

export function postReport(req: Request, res: Response, next: NextFunction): void {
  const params = sessionParams.safeParse(req.params);
  if (!params.success) {
    next(new HttpError(404, "This conversation could not be found. Start a new one."));
    return;
  }

  upload.single("report")(req, res, (error: unknown) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(400, "That file is too large. Please choose a file under 10 MB."));
        return;
      }
      next(error instanceof HttpError ? error : new HttpError(400, "Please choose a PDF or a photo (JPG or PNG)."));
      return;
    }

    const file = req.file;
    if (!file) {
      next(new HttpError(400, "Please choose a file."));
      return;
    }

    saveReport(params.data.sessionId, file)
      .then((saved) => {
        res.status(201).json(saved);
      })
      .catch(next);
  });
}
