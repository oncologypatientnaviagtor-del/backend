import { env, isLyzrConfigured } from "../config/env";
import type { IntakeField, IntakePatch } from "../types/intake";
import { logger } from "../utils/logger";
import {
  hasCollectedIntake,
  mergeIntake,
  createEmptyIntake,
  readIntakePatch,
} from "./intake.service";

/**
 * Confirmed HTTP contract from Lyzr's Chat With Agent docs (checked Oct 2026):
 *   POST {LYZR_BASE_URL}/v3/inference/chat/
 *   Header: x-api-key
 *   Body: { user_id, agent_id, session_id, message }
 *   200: { "response": "<string>" }
 *
 * Studio's structured-output setting is not a separate documented HTTP field.
 * Conversation and intake are expected together inside `response`, or in a
 * sibling field if a live payload includes one.
 *
 * If the live payload shape changes, adjust this file only.
 * Callers receive NormalizedLyzrTurn and never see the raw Lyzr body.
 */

const SIBLING_INTAKE_KEYS = [
  "structured_output",
  "structuredOutput",
  "patient_intake",
  "patientIntake",
  "intake",
  "extracted_data",
  "extractedData",
  "data",
  "json",
] as const;

const CONVERSATION_KEYS = [
  "conversational_response",
  "assistant_message",
  "message",
  "reply",
  "text",
] as const;

const INTAKE_ONLY_MESSAGE =
  "Thank you. I have added those details to your information, and we can keep going from here.";

export interface NormalizedLyzrTurn {
  message: string;
  intake: IntakePatch | null;
}

export class LyzrResponseError extends Error {
  constructor() {
    super("Unexpected Lyzr response");
    this.name = "LyzrResponseError";
  }
}

export function normalizeLyzrPayload(payload: unknown): NormalizedLyzrTurn {
  const record = asRecord(payload);
  if (!record) throw new LyzrResponseError();

  const siblingIntake = readSiblingIntake(record);
  const responseValue = record.response;

  if (typeof responseValue === "string") {
    const split = splitConversationAndIntake(responseValue);
    return finishTurn(split.message, combinePatches(split.intake, siblingIntake));
  }

  if (asRecord(responseValue)) {
    const split = splitStructuredRecord(asRecord(responseValue) as Record<string, unknown>);
    return finishTurn(split.message, combinePatches(split.intake, siblingIntake));
  }

  return finishTurn(readConversation(record), combinePatches(readIntakePatch(record), siblingIntake));
}

export async function sendMessageToLyzr(input: {
  userId: string;
  sessionId: string;
  message: string;
}): Promise<NormalizedLyzrTurn> {
  if (!isLyzrConfigured()) {
    logger.warn("lyzr_not_configured");
    throw new LyzrResponseError();
  }

  let response: Response;
  try {
    response = await fetch(chatUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.LYZR_API_KEY,
      },
      body: JSON.stringify({
        user_id: input.userId,
        agent_id: env.LYZR_AGENT_ID,
        session_id: input.sessionId,
        message: input.message,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    logger.warn("lyzr_request_failed");
    throw new LyzrResponseError();
  }

  if (!response.ok) {
    logger.warn("lyzr_http_error", { status: response.status });
    throw new LyzrResponseError();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logger.warn("lyzr_invalid_json");
    throw new LyzrResponseError();
  }

  const keys = asRecord(payload) ? Object.keys(payload as object).sort().join(",") : "unparsed";
  const normalized = normalizeLyzrPayload(payload);
  logger.info("lyzr_response_received", {
    keys,
    intakeExtracted: hasCollectedIntake(normalized.intake),
    hasMessage: normalized.message.length > 0,
  });
  return normalized;
}

function finishTurn(message: string, intake: IntakePatch | null): NormalizedLyzrTurn {
  const cleaned = stripRemainingIntakeJson(tidy(message));
  if (cleaned) return { message: cleaned, intake };
  if (hasCollectedIntake(intake)) return { message: INTAKE_ONLY_MESSAGE, intake };
  throw new LyzrResponseError();
}

const LABEL_FIELDS: Record<string, IntakeField> = {
  age: "age",
  gender: "gender",
  location: "location",
  city: "location",
  concern: "concern",
  "reason for visit": "concern",
  "first noticed": "noticed_when",
  noticed: "noticed_when",
  "noticed when": "noticed_when",
  duration: "duration",
  changes: "changes_over_time",
  "changes over time": "changes_over_time",
  "associated symptoms": "relevant_symptoms",
  "patient-reported symptoms": "relevant_symptoms",
  "patient reported symptoms": "relevant_symptoms",
  symptoms: "relevant_symptoms",
  "relevant symptoms": "relevant_symptoms",
  "previous history": "previous_diagnosis_or_history",
  "previous history related to this": "previous_diagnosis_or_history",
  "relevant history": "previous_diagnosis_or_history",
  "medical history": "previous_diagnosis_or_history",
  "previous consultation": "previous_doctor_consultation",
  "previous consultations": "previous_doctor_consultation",
  "doctor visit": "previous_doctor_consultation",
  reports: "existing_reports",
  "existing reports": "existing_reports",
  "available reports": "existing_reports",
  insurance: "insurance_information",
  "insurance information": "insurance_information",
  "preferred location": "preferred_location",
  "preferred hospital": "preferred_location",
  "preferred clinic": "preferred_location",
  "appointment preference": "preferred_location",
  "preferred appointment": "preferred_location",
  "hospital preference": "preferred_location",
  "appointment status": "preferred_appointment_timing",
  "preferred timing": "preferred_appointment_timing",
  "appointment timing": "preferred_appointment_timing",
};

function parseLabeledLine(line: string): { field: IntakeField; value: string } | null {
  const match = line.match(
    /^\s*(?:[-*]\s*)?\*{0,2}\s*([A-Za-z][^:\n*]{0,80}?)\s*\*{0,2}\s*:\s*\*{0,2}\s*(.*?)\s*\*{0,2}\s*$/,
  );
  if (!match) return null;
  const field = LABEL_FIELDS[match[1].trim().toLowerCase()];
  if (!field) return null;
  return { field, value: match[2].trim() };
}

function rememberField(intake: IntakePatch | null, field: IntakeField, values: string[]): IntakePatch | null {
  const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (cleaned.length === 0) return intake;
  const patch =
    field === "relevant_symptoms"
      ? readIntakePatch({ relevant_symptoms: cleaned })
      : readIntakePatch({ [field]: cleaned.join("; ") });
  return combinePatches(intake, patch);
}

function extractLabeledSummary(text: string): { message: string; intake: IntakePatch | null } {
  const kept: string[] = [];
  let intake: IntakePatch | null = null;
  let section: IntakeField | null = null;
  let sectionItems: string[] = [];

  const flushSection = () => {
    if (!section) return;
    intake = rememberField(intake, section, sectionItems);
    section = null;
    sectionItems = [];
  };

  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      flushSection();
      kept.push(line);
      continue;
    }

    const labeled = parseLabeledLine(line);
    if (labeled) {
      flushSection();
      if (!labeled.value || labeled.field === "relevant_symptoms") {
        section = labeled.field;
        sectionItems = labeled.value ? [labeled.value] : [];
        continue;
      }
      intake = rememberField(intake, labeled.field, [labeled.value]);
      continue;
    }

    if (/^\s*(?:[-*]\s*)?[A-Za-z][^:\n]{0,80}:\s*/.test(line)) {
      flushSection();
      kept.push(line);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim();
    if (bullet && section) {
      const livesIn = bullet.match(/^lives in\s+(.+)$/i);
      if (livesIn && section === "previous_diagnosis_or_history") {
        intake = rememberField(intake, "location", [livesIn[1]]);
        continue;
      }
      const ageAndGender = bullet.match(/^(\d{1,3})-year-old\s+([A-Za-z-]+)$/i);
      if (ageAndGender && section === "previous_diagnosis_or_history") {
        intake = combinePatches(
          intake,
          readIntakePatch({ age: Number(ageAndGender[1]), gender: ageAndGender[2].toLowerCase() }),
        );
        continue;
      }
      sectionItems.push(bullet);
      continue;
    }

    flushSection();
    kept.push(line);
  }

  flushSection();
  return { message: kept.join("\n"), intake };
}

function splitConversationAndIntake(
  text: string,
  depth = 0,
): { message: string; intake: IntakePatch | null } {
  const trimmed = text.trim();
  if (!trimmed) return { message: "", intake: null };

  const direct = tryParseRecord(trimmed);
  if (direct) return splitStructuredRecord(direct, depth + 1);

  const labeled = extractLabeledSummary(trimmed);
  let intake: IntakePatch | null = labeled.intake;
  let working = labeled.message.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (full, body: string) => {
    const patch = readIntakePatch(tryParseRecord(body.trim()));
    if (!patch) return full;
    intake = combinePatches(intake, patch);
    return "";
  });

  const matches = extractJsonObjects(working).filter((match) => readIntakePatch(match.value));
  for (const match of [...matches].reverse()) {
    intake = combinePatches(intake, readIntakePatch(match.value));
    working = working.slice(0, match.start) + working.slice(match.end);
  }

  return { message: working, intake };
}

function splitStructuredRecord(
  record: Record<string, unknown>,
  depth = 0,
): { message: string; intake: IntakePatch | null } {
  const intake = combinePatches(readIntakePatch(record), readSiblingIntake(record));
  const message = readConversation(record);

  if (depth < 2 && message && (message.includes("```") || message.trim().startsWith("{"))) {
    const split = splitConversationAndIntake(message, depth + 1);
    return { message: split.message, intake: combinePatches(intake, split.intake) };
  }

  return { message, intake };
}

function readSiblingIntake(record: Record<string, unknown>, depth = 0): IntakePatch | null {
  if (depth > 3) return null;

  for (const key of SIBLING_INTAKE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    const direct = readIntakePatch(value);
    if (direct) return direct;
    const nested = asRecord(value);
    if (!nested) continue;
    const inner = readSiblingIntake(nested, depth + 1);
    if (inner) return inner;
  }

  return null;
}

function readConversation(record: Record<string, unknown>): string {
  for (const key of CONVERSATION_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function combinePatches(base: IntakePatch | null, next: IntakePatch | null): IntakePatch | null {
  if (!base) return next;
  if (!next) return base;
  return mergeIntake(mergeIntake(createEmptyIntake(), base), next);
}

function stripRemainingIntakeJson(message: string): string {
  const matches = extractJsonObjects(message).filter((match) => readIntakePatch(match.value));
  let next = message;
  for (const match of [...matches].reverse()) {
    next = next.slice(0, match.start) + next.slice(match.end);
  }
  return tidy(next);
}

function extractJsonObjects(text: string): Array<{ start: number; end: number; value: Record<string, unknown> }> {
  const found: Array<{ start: number; end: number; value: Record<string, unknown> }> = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{") continue;
    const end = findMatchingBrace(text, index);
    if (end < 0) continue;
    const value = tryParseRecord(text.slice(index, end + 1));
    if (value) {
      found.push({ start: index, end: end + 1, value });
      index = end;
    }
  }

  return found;
}

function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function tryParseRecord(text: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function tidy(message: string): string {
  return message.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function chatUrl(): string {
  const base = env.LYZR_BASE_URL.replace(/\/$/, "");
  if (base.endsWith("/v3/inference/chat")) return `${base}/`;
  return `${base}/v3/inference/chat/`;
}
