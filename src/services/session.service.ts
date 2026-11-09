import { randomUUID } from "node:crypto";
import { Encounter } from "../models/Encounter";
import { Patient } from "../models/Patient";
import type { PatientIntake } from "../types/intake";
import type { WorkflowStatus } from "../types/workflow";
import { HttpError } from "../utils/httpError";
import { createEmptyIntake, mergeIntake, preferencesFromMessages, toPatientIntake } from "./intake.service";
import { evaluateSafety } from "./safety.service";
import { advanceToAppointment, workflowForIntake } from "./workflow.service";
import { visitTypeForConcern } from "./care-graph.service";

export interface SessionSummary {
  sessionId: string;
  patientId: string;
  createdAt: string;
}

export interface SessionDetail extends SessionSummary {
  updatedAt: string;
  workflowStatus: WorkflowStatus;
  messages: Array<{ role: "patient" | "assistant"; content: string; createdAt: string }>;
  patientIntake: PatientIntake;
  visitType: string | null;
}

export async function createSession(): Promise<SessionSummary> {
  const sessionId = randomUUID();
  const patientId = randomUUID();
  const intake = createEmptyIntake();
  const now = new Date();

  await Patient.create({
    patientId,
    age: null,
    gender: null,
    location: null,
    language: null,
    preferences: {
      preferredLocation: null,
      preferredAppointmentTiming: null,
    },
    insuranceInformation: null,
  });

  const encounter = await Encounter.create({
    sessionId,
    patientId,
    messages: [],
    structuredIntake: intake,
    workflowStatus: "INTAKE",
    safety: evaluateSafety(intake, ""),
    createdAt: now,
    updatedAt: now,
  });

  return {
    sessionId: encounter.sessionId,
    patientId: encounter.patientId,
    createdAt: encounter.createdAt.toISOString(),
  };
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  const encounter = await Encounter.findOne({ sessionId }).lean();
  if (!encounter) {
    throw new HttpError(404, "This conversation could not be found. Start a new one.");
  }

  const storedIntake = toPatientIntake(encounter.structuredIntake);
  const fromChat = preferencesFromMessages(encounter.messages);
  const patientIntake = mergeIntake(storedIntake, {
    preferred_location: storedIntake.preferred_location ? null : fromChat.preferred_location,
    preferred_appointment_timing: storedIntake.preferred_appointment_timing ? null : fromChat.preferred_appointment_timing,
  });
  const workflowStatus = workflowForIntake(encounter.workflowStatus, patientIntake);
  const preferenceChanged =
    patientIntake.preferred_location !== storedIntake.preferred_location ||
    patientIntake.preferred_appointment_timing !== storedIntake.preferred_appointment_timing;
  if (workflowStatus !== encounter.workflowStatus || preferenceChanged) {
    await Encounter.updateOne(
      { sessionId },
      {
        workflowStatus,
        "structuredIntake.preferred_location": patientIntake.preferred_location,
        "structuredIntake.preferred_appointment_timing": patientIntake.preferred_appointment_timing,
      },
    );
  }
  if (preferenceChanged) {
    await Patient.updateOne(
      { patientId: encounter.patientId },
      {
        "preferences.preferredLocation": patientIntake.preferred_location,
        "preferences.preferredAppointmentTiming": patientIntake.preferred_appointment_timing,
      },
    );
  }

  return {
    sessionId: encounter.sessionId,
    patientId: encounter.patientId,
    createdAt: encounter.createdAt.toISOString(),
    updatedAt: encounter.updatedAt.toISOString(),
    workflowStatus,
    messages: encounter.messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
    patientIntake,
    visitType: visitTypeForConcern(patientIntake.concern),
  };
}

export async function openCareNavigation(sessionId: string): Promise<{
  workflowStatus: WorkflowStatus;
  visitType: string;
  report: string | null;
}> {
  const encounter = await Encounter.findOne({ sessionId });
  if (!encounter) {
    throw new HttpError(404, "This conversation could not be found. Start a new one.");
  }

  const patientIntake = toPatientIntake(encounter.structuredIntake);
  const visitType = visitTypeForConcern(patientIntake.concern);
  if (encounter.workflowStatus !== "SAFETY_REVIEW" || !visitType) {
    throw new HttpError(400, "Save the concern in safety review before opening care navigation.");
  }

  encounter.workflowStatus = "CARE_NAVIGATION";
  await encounter.save();

  return {
    workflowStatus: encounter.workflowStatus,
    visitType,
    report: patientIntake.existing_reports,
  };
}

export async function openAppointment(sessionId: string): Promise<{
  workflowStatus: WorkflowStatus;
  visitType: string;
  preferredLocation: string | null;
  preferredTiming: string | null;
}> {
  const encounter = await Encounter.findOne({ sessionId });
  if (!encounter) {
    throw new HttpError(404, "This conversation could not be found. Start a new one.");
  }

  const patientIntake = toPatientIntake(encounter.structuredIntake);
  const visitType = visitTypeForConcern(patientIntake.concern);
  const nextStatus = advanceToAppointment(encounter.workflowStatus);
  if (nextStatus !== "APPOINTMENT" || !visitType) {
    throw new HttpError(400, "Open care navigation before saving an appointment request.");
  }

  encounter.workflowStatus = nextStatus;
  await encounter.save();

  return {
    workflowStatus: encounter.workflowStatus,
    visitType,
    preferredLocation: patientIntake.preferred_location,
    preferredTiming: patientIntake.preferred_appointment_timing,
  };
}
