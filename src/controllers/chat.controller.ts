import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { z } from "zod";
import { handlePatientMessage } from "../services/chat.service";
import { HttpError } from "../utils/httpError";

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

export async function postChat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = chatSchema.parse(req.body);
    const result = await handlePatientMessage(body.sessionId, body.message);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      next(new HttpError(400, chatValidationMessage(error)));
      return;
    }
    next(error);
  }
}

function chatValidationMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (issue?.path[0] === "message") {
    return issue.code === "too_big" ? "Please send a shorter message." : "Please enter a message.";
  }
  return "This conversation could not be found. Start a new one.";
}
