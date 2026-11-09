import { Schema, model, type InferSchemaType } from "mongoose";
import { WORKFLOW_STATUSES } from "../types/workflow";

const messageSchema = new Schema(
  {
    role: { type: String, enum: ["patient", "assistant"], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const intakeSchema = new Schema(
  {
    age: { type: Number, default: null },
    gender: { type: String, default: null },
    location: { type: String, default: null },
    concern: { type: String, default: null },
    noticed_when: { type: String, default: null },
    duration: { type: String, default: null },
    changes_over_time: { type: String, default: null },
    relevant_symptoms: { type: [String], default: [] },
    previous_diagnosis_or_history: { type: String, default: null },
    previous_doctor_consultation: { type: String, default: null },
    existing_reports: { type: String, default: null },
    insurance_information: { type: String, default: null },
    preferred_location: { type: String, default: null },
    preferred_appointment_timing: { type: String, default: null },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    documentId: { type: String, required: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const safetySchema = new Schema(
  {
    status: { type: String, default: "not_evaluated" },
    signals: { type: [String], default: [] },
    requiresHumanReview: { type: Boolean, default: false },
  },
  { _id: false },
);

const encounterSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    patientId: { type: String, required: true, index: true },
    messages: { type: [messageSchema], default: [] },
    structuredIntake: { type: intakeSchema, required: true },
    documents: { type: [documentSchema], default: [] },
    workflowStatus: { type: String, enum: WORKFLOW_STATUSES, default: "INTAKE" },
    safety: { type: safetySchema, required: true },
  },
  { timestamps: true },
);

export type EncounterRecord = InferSchemaType<typeof encounterSchema>;
export const Encounter = model("Encounter", encounterSchema);
