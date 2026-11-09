import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getPatient } from "../services/patient.service";
import { HttpError } from "../utils/httpError";

const patientParams = z.object({
  patientId: z.string().uuid(),
});

export async function getPatientById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = patientParams.safeParse(req.params);
    if (!params.success) {
      throw new HttpError(404, "This patient record could not be found.");
    }
    const patient = await getPatient(params.data.patientId);
    res.status(200).json(patient);
  } catch (error) {
    next(error);
  }
}
