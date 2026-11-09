import { Router } from "express";
import { getPatientById } from "../controllers/patient.controller";

export const patientsRouter = Router();

patientsRouter.get("/:patientId", getPatientById);
