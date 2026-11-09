import type { PatientIntake } from "../types/intake";

export interface SafetyEvaluation {
  status: "not_evaluated";
  signals: string[];
  requiresHumanReview: boolean;
}

export function evaluateSafety(
  patientIntake: PatientIntake,
  latestMessage: string,
): SafetyEvaluation {
  // TODO: Replace this placeholder with deterministic rules written by clinicians.
  // TODO: Do not allow the language model alone to decide medical urgency or emergency routing.
  void patientIntake;
  void latestMessage;

  return {
    status: "not_evaluated",
    signals: [],
    requiresHumanReview: false,
  };
}
