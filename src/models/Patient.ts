import { Schema, model, type InferSchemaType } from "mongoose";

const patientSchema = new Schema(
  {
    patientId: { type: String, required: true, unique: true, index: true },
    age: { type: Number, default: null },
    gender: { type: String, default: null },
    location: { type: String, default: null },
    language: { type: String, default: null },
    preferences: {
      preferredLocation: { type: String, default: null },
      preferredAppointmentTiming: { type: String, default: null },
    },
    insuranceInformation: { type: String, default: null },
  },
  { timestamps: true },
);

export type PatientRecord = InferSchemaType<typeof patientSchema>;
export const Patient = model("Patient", patientSchema);
