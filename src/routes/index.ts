import { Router } from "express";
import { getHealth } from "../controllers/health.controller";
import { requireDatabase } from "../middleware/requireDatabase";
import { chatRouter } from "./chat.routes";
import { patientsRouter } from "./patients.routes";
import { sessionsRouter } from "./sessions.routes";

export const apiRouter = Router();

apiRouter.get("/health", getHealth);
apiRouter.use(requireDatabase);
apiRouter.use("/sessions", sessionsRouter);
apiRouter.use("/patient", chatRouter);
apiRouter.use("/patients", patientsRouter);
