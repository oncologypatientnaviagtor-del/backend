import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { createSession, getSession, openAppointment, openCareNavigation } from "../services/session.service";
import { HttpError } from "../utils/httpError";

const sessionParams = z.object({
  sessionId: z.string().uuid(),
});

export async function postSession(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await createSession();
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
}

export async function postCareNavigation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = sessionParams.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(404, "This conversation could not be found. Start a new one.");
    }
    const care = await openCareNavigation(params.data.sessionId);
    res.status(200).json(care);
  } catch (error) {
    next(error);
  }
}

export async function postAppointment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = sessionParams.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(404, "This conversation could not be found. Start a new one.");
    }
    const appointment = await openAppointment(params.data.sessionId);
    res.status(200).json(appointment);
  } catch (error) {
    next(error);
  }
}

export async function getSessionById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = sessionParams.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(404, "This conversation could not be found. Start a new one.");
    }
    const session = await getSession(params.data.sessionId);
    res.status(200).json(session);
  } catch (error) {
    next(error);
  }
}
