import type { PatientIntake } from "../types/intake";
import type { WorkflowStatus } from "../types/workflow";

export function workflowForIntake(current: WorkflowStatus, intake: PatientIntake): WorkflowStatus {
  if (current !== "INTAKE") return current;
  if (intake.concern?.trim()) return "SAFETY_REVIEW";
  return "INTAKE";
}

export function advanceToCareNavigation(current: WorkflowStatus): WorkflowStatus {
  if (current === "SAFETY_REVIEW") return "CARE_NAVIGATION";
  return current;
}

export function advanceToAppointment(current: WorkflowStatus): WorkflowStatus {
  if (current === "CARE_NAVIGATION") return "APPOINTMENT";
  return current;
}
