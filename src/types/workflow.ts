export const WORKFLOW_STATUSES = [
  "INTAKE",
  "SAFETY_REVIEW",
  "CARE_NAVIGATION",
  "APPOINTMENT",
  "DOCUMENTS",
  "INSURANCE",
  "HUMAN_ESCALATION",
  "COMPLETED",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
