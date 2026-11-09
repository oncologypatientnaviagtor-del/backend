import { Encounter } from "../models/Encounter";
import { Patient } from "../models/Patient";
import type { PatientIntake } from "../types/intake";
import type { WorkflowStatus } from "../types/workflow";
import { ASSISTANT_UNAVAILABLE, HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { linkVisitMap } from "./care-graph.service";
import { applyUploadedReports } from "./document.service";
import {
  applyStatedSymptoms,
  emptyFieldsOnly,
  mergeIntake,
  statedAppointmentPreference,
  statedConcern,
  statedConsultation,
  statedDetails,
  toPatientIntake,
} from "./intake.service";
import { AssistantResponseError, sendMessageToAssistant } from "./assistant.service";
import { normalizeLyzrPayload } from "./lyzr.service";
import { questionUsesReport, readStoredReportText, reportContextForQuestion } from "./report-text.service";
import { evaluateSafety } from "./safety.service";
import { workflowForIntake } from "./workflow.service";

export interface ChatResult {
  sessionId: string;
  message: string;
  patientIntake: PatientIntake;
  workflowStatus: WorkflowStatus;
}

export async function handlePatientMessage(sessionId: string, message: string): Promise<ChatResult> {
  const cleanMessage = message.replace(/\u0000/g, "").trim();
  if (!cleanMessage) {
    throw new HttpError(400, "Please enter a message.");
  }

  const encounter = await Encounter.findOne({ sessionId });
  if (!encounter) {
    throw new HttpError(404, "This conversation could not be found. Start a new one.");
  }

  const patient = await Patient.findOne({ patientId: encounter.patientId });
  if (!patient) {
    throw new HttpError(404, "This conversation could not be found. Start a new one.");
  }

  const reportText = questionUsesReport(cleanMessage)
    ? await readStoredReportText(
        encounter.sessionId,
        (encounter.documents ?? []).map((document) => ({
          originalName: document.originalName,
          storedName: document.storedName,
          mimeType: document.mimeType,
        })),
      )
    : "";

  let turn;
  try {
    turn = await sendMessageToAssistant({
      history: encounter.messages.map((message) => ({ role: message.role, content: message.content })),
      question: cleanMessage,
      message: reportContextForQuestion(cleanMessage, reportText),
    });
  } catch (error) {
    if (error instanceof AssistantResponseError) {
      throw new HttpError(502, ASSISTANT_UNAVAILABLE);
    }
    logger.warn("assistant_unexpected_failure");
    throw new HttpError(502, ASSISTANT_UNAVAILABLE);
  }

  let patientIntake = applyUploadedReports(
    mergeIntake(toPatientIntake(encounter.structuredIntake), turn.intake),
    (encounter.documents ?? []).map((document) => document.originalName),
  );
  patientIntake = mergeIntake(patientIntake, normalizeLyzrPayload({ response: cleanMessage }).intake);
  if (!patientIntake.concern?.trim()) {
    const concern = statedConcern(cleanMessage);
    if (concern) patientIntake = mergeIntake(patientIntake, { concern });
  }
  patientIntake = mergeIntake(patientIntake, emptyFieldsOnly(patientIntake, statedDetails(cleanMessage)));
  patientIntake = {
    ...patientIntake,
    relevant_symptoms: applyStatedSymptoms(patientIntake.relevant_symptoms, cleanMessage),
  };
  if (!patientIntake.previous_doctor_consultation?.trim()) {
    const consultation = statedConsultation(cleanMessage);
    if (consultation) patientIntake = mergeIntake(patientIntake, { previous_doctor_consultation: consultation });
  }
  patientIntake = mergeIntake(patientIntake, statedAppointmentPreference(turn.message, "assistant"));
  patientIntake = mergeIntake(patientIntake, statedAppointmentPreference(cleanMessage, "patient"));
  const now = new Date();

  encounter.messages.push(
    { role: "patient", content: cleanMessage, createdAt: now },
    { role: "assistant", content: turn.message, createdAt: now },
  );
  encounter.structuredIntake = {
    ...patientIntake,
    relevant_symptoms: [...patientIntake.relevant_symptoms],
  };
  encounter.safety = evaluateSafety(patientIntake, cleanMessage);
  encounter.workflowStatus = workflowForIntake(encounter.workflowStatus, patientIntake);
  encounter.markModified("structuredIntake");
  await encounter.save();

  patient.age = patientIntake.age;
  patient.gender = patientIntake.gender;
  patient.location = patientIntake.location;
  patient.insuranceInformation = patientIntake.insurance_information;
  patient.preferences = {
    preferredLocation: patientIntake.preferred_location,
    preferredAppointmentTiming: patientIntake.preferred_appointment_timing,
  };
  patient.markModified("preferences");
  await patient.save();

  await linkVisitMap({
    sessionId: encounter.sessionId,
    concern: patientIntake.concern,
    reports: (encounter.documents ?? []).map((document) => ({
      documentId: document.documentId,
      name: document.originalName,
    })),
  });

  return {
    sessionId: encounter.sessionId,
    message: turn.message,
    patientIntake,
    workflowStatus: encounter.workflowStatus,
  };
}
