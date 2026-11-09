import { Encounter } from "../models/Encounter";
import { Patient } from "../models/Patient";
import type { PatientIntake } from "../types/intake";
import type { WorkflowStatus } from "../types/workflow";
import { HttpError } from "../utils/httpError";
import { createEmptyIntake, toPatientIntake } from "./intake.service";

export interface PatientView {
  patientId: string;
  sessionId: string | null;
  workflowStatus: WorkflowStatus;
  patient: {
    age: number | null;
    gender: string | null;
    location: string | null;
    language: string | null;
    preferences: {
      preferredLocation: string | null;
      preferredAppointmentTiming: string | null;
    };
    insuranceInformation: string | null;
  };
  patientIntake: PatientIntake;
}

export async function getPatient(patientId: string): Promise<PatientView> {
  const patient = await Patient.findOne({ patientId }).lean();
  if (!patient) {
    throw new HttpError(404, "This patient record could not be found.");
  }

  const encounter = await Encounter.findOne({ patientId }).sort({ updatedAt: -1 }).lean();
  const intake = encounter ? toPatientIntake(encounter.structuredIntake) : createEmptyIntake();

  return {
    patientId: patient.patientId,
    sessionId: encounter?.sessionId ?? null,
    workflowStatus: encounter?.workflowStatus ?? "INTAKE",
    patient: {
      age: patient.age ?? null,
      gender: patient.gender ?? null,
      location: patient.location ?? null,
      language: patient.language ?? null,
      preferences: {
        preferredLocation: patient.preferences?.preferredLocation ?? null,
        preferredAppointmentTiming: patient.preferences?.preferredAppointmentTiming ?? null,
      },
      insuranceInformation: patient.insuranceInformation ?? null,
    },
    patientIntake: intake,
  };
}
