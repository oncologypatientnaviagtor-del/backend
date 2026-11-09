import { Router } from "express";
import { postReport } from "../controllers/document.controller";
import { getSessionById, postAppointment, postCareNavigation, postSession } from "../controllers/session.controller";

export const sessionsRouter = Router();

sessionsRouter.post("/", postSession);
sessionsRouter.post("/:sessionId/documents", postReport);
sessionsRouter.post("/:sessionId/care-navigation", postCareNavigation);
sessionsRouter.post("/:sessionId/appointment", postAppointment);
sessionsRouter.get("/:sessionId", getSessionById);
