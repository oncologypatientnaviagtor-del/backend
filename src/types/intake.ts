export const INTAKE_FIELDS = [
  "age",
  "gender",
  "location",
  "concern",
  "noticed_when",
  "duration",
  "changes_over_time",
  "relevant_symptoms",
  "previous_diagnosis_or_history",
  "previous_doctor_consultation",
  "existing_reports",
  "insurance_information",
  "preferred_location",
  "preferred_appointment_timing",
] as const;

export type IntakeField = (typeof INTAKE_FIELDS)[number];

export interface PatientIntake {
  age: number | null;
  gender: string | null;
  location: string | null;
  concern: string | null;
  noticed_when: string | null;
  duration: string | null;
  changes_over_time: string | null;
  relevant_symptoms: string[];
  previous_diagnosis_or_history: string | null;
  previous_doctor_consultation: string | null;
  existing_reports: string | null;
  insurance_information: string | null;
  preferred_location: string | null;
  preferred_appointment_timing: string | null;
}

export type IntakePatch = Partial<PatientIntake>;
