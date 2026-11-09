import {
  INTAKE_FIELDS,
  type IntakeField,
  type IntakePatch,
  type PatientIntake,
} from "../types/intake";

export function createEmptyIntake(): PatientIntake {
  return {
    age: null,
    gender: null,
    location: null,
    concern: null,
    noticed_when: null,
    duration: null,
    changes_over_time: null,
    relevant_symptoms: [],
    previous_diagnosis_or_history: null,
    previous_doctor_consultation: null,
    existing_reports: null,
    insurance_information: null,
    preferred_location: null,
    preferred_appointment_timing: null,
  };
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const maybeDocument = value as { toObject?: () => Record<string, unknown> };
  if (typeof maybeDocument.toObject === "function") return maybeDocument.toObject();
  return value as Record<string, unknown>;
}

function normalizeAge(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 130) {
    return value;
  }
  if (typeof value === "string" && /^\d{1,3}$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed >= 0 && parsed <= 130) return parsed;
  }
  return null;
}

function isUnknownText(value: string): boolean {
  return /^(not provided( yet)?|none( provided)?|n\/a|na|null|unknown|not mentioned|no information(?: provided)?)$/i.test(
    value.trim(),
  );
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || isUnknownText(trimmed)) return null;
  return trimmed;
}

function normalizeSymptoms(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || isUnknownText(trimmed)) return [];
    return [trimmed];
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeField(field: IntakeField, value: unknown): PatientIntake[IntakeField] {
  if (field === "age") return normalizeAge(value);
  if (field === "relevant_symptoms") return normalizeSymptoms(value);
  return normalizeText(value);
}

export function readIntakePatch(value: unknown): IntakePatch | null {
  const record = asRecord(value);
  if (!record) return null;

  const patch: IntakePatch = {};
  let found = false;

  for (const field of INTAKE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    found = true;
    patch[field] = normalizeField(field, record[field]) as never;
  }

  return found ? patch : null;
}

export function mergeIntake(existing: PatientIntake, patch: IntakePatch | null): PatientIntake {
  const next: PatientIntake = {
    ...existing,
    relevant_symptoms: [...existing.relevant_symptoms],
  };
  if (!patch) return next;

  for (const field of INTAKE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const incoming = patch[field];
    if (isEmptyValue(incoming)) continue;

    if (field === "age" && typeof incoming === "number") {
      next.age = incoming;
      continue;
    }
    if (field === "relevant_symptoms" && Array.isArray(incoming)) {
      next.relevant_symptoms = [...incoming];
      continue;
    }
    if (field !== "age" && field !== "relevant_symptoms" && typeof incoming === "string") {
      next[field] = incoming;
    }
  }

  return next;
}

export function toPatientIntake(value: unknown): PatientIntake {
  return mergeIntake(createEmptyIntake(), readIntakePatch(value));
}

export function statedDetails(message: string): IntakePatch {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return {};

  const patch: IntakePatch = {};
  const age = text.match(/\b(\d{1,3})\s*-?\s*years?\s*old\b/i);
  if (age) {
    const years = Number(age[1]);
    if (years >= 0 && years <= 130) patch.age = years;
  }

  const gender = text.match(/\b(male|female|man|woman)\b/i)?.[1]?.toLowerCase();
  if (gender === "man") patch.gender = "male";
  else if (gender === "woman") patch.gender = "female";
  else if (gender) patch.gender = gender;

  const location = text.match(/\b(?:located(?:\s+at|\s+in)?|living in|live in|based in)\s+([A-Za-z][A-Za-z .'-]{1,40})/i)?.[1];
  const place = location?.replace(/[.,].*$/, "").trim();
  if (place) patch.location = place;

  if (/\blump\b/i.test(text) && /\bthroat\b/i.test(text)) patch.concern = "Lump on the throat";

  const duration = text.match(
    /\b(?:for\s+)?(?:the\s+)?past\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\s+(days?|dats|weeks?|months?)\b/i,
  );
  if (duration) {
    const count = /^(a|an)$/i.test(duration[1]) ? "1" : duration[1].toLowerCase();
    const unit = /^dat/i.test(duration[2]) ? "days" : duration[2].toLowerCase();
    patch.duration = `Past ${count} ${unit}`;
    patch.noticed_when = patch.duration;
  }

  if (/\b(?:do not|don't|dont)\s+have\s+any\s+previous\b|\bno\s+previous\s+(?:medical\s+)?history\b/i.test(text)) {
    patch.previous_diagnosis_or_history = "No previous medical history";
  }

  return patch;
}

export function emptyFieldsOnly(existing: PatientIntake, patch: IntakePatch): IntakePatch {
  const gaps: IntakePatch = {};
  for (const field of INTAKE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    if (!isEmptyValue(existing[field]) || isEmptyValue(patch[field])) continue;
    gaps[field] = patch[field] as never;
  }
  return gaps;
}

export function statedConcern(message: string): string | null {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const side = text.match(/\blump\b.{0,40}\b(right|left)\s+breast\b/i)?.[1]?.toLowerCase();
  if (side) return `Lump on the ${side} breast`;
  if (/\blump\b/i.test(text) && /\bbreast\b/i.test(text)) return "Breast lump";

  const explicit = text.match(/\b(?:my concern is|i am concerned about|i'm concerned about)\s+(.+?)(?:\.|$)/i)?.[1]?.trim();
  if (explicit && !/^it\b/i.test(explicit)) return explicit.charAt(0).toUpperCase() + explicit.slice(1);
  return null;
}

export function statedSymptoms(message: string): string[] {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const symptoms: string[] = [];
  const saysNoPain = /\bno pain\b/i.test(text);
  const saysPain = /\bpain\b/i.test(text) && !saysNoPain;
  if (saysNoPain) symptoms.push("No pain");
  else if (saysPain && /\btouch/.test(text)) symptoms.push("Pain when touching the lump");
  else if (saysPain && /\blump\b/i.test(text)) symptoms.push("Pain around the lump");
  else if (saysPain) symptoms.push("Pain");

  if (/\bnipple discharge\b/i.test(text)) symptoms.push("Nipple discharge");
  return symptoms;
}

export function applyStatedSymptoms(existing: string[], message: string): string[] {
  const stated = statedSymptoms(message);
  if (stated.length === 0) return existing;

  const replacesPain = stated.some((item) => /pain/i.test(item));
  const kept = replacesPain ? existing.filter((item) => !/pain/i.test(item)) : [...existing];
  for (const item of stated) {
    if (!kept.some((current) => current.toLowerCase() === item.toLowerCase())) kept.push(item);
  }
  return kept;
}

export function statedConsultation(message: string): string | null {
  const text = message.replace(/\s+/g, " ").trim();
  if (/\bhaven['’;]?t\s+consulted\b/i.test(text) || /\bhave not consulted\b/i.test(text)) {
    return "Not consulted a doctor yet";
  }
  return null;
}

const TIMING_PHRASE =
  "as soon as possible|next week|this week|tomorrow|(?:in the )?morning|(?:in the )?afternoon|(?:in the )?evening|weekday|weekend|earliest(?:\\s+\\w+){0,2}|(?:mon|tues|wednes|thurs|fri|satur|sun)day";

function cleanPhrase(value: string): string | null {
  const cleaned = value
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .replace(/^["']+|["']+$/g, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
  if (!cleaned || cleaned.length > 160 || isUnknownText(cleaned)) return null;
  return cleaned;
}

function isTimingOnly(value: string): boolean {
  return new RegExp(`^(?:${TIMING_PHRASE})$`, "i").test(value);
}

function looksLikePlace(value: string): boolean {
  if (isTimingOnly(value)) return false;
  if (/\b(doctor|oncologist|surgeon|female|male)\b/i.test(value) && !/\b(hospital|clinic|medcity|medical|centre|center|institute)\b/i.test(value)) {
    return false;
  }
  if (/,/.test(value)) return true;
  if (/\b(hospital|clinic|medcity|medical|centre|center|institute|memorial)\b/i.test(value)) return true;
  return /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(value) && value.split(/\s+/).length <= 4;
}

const DATED_TIMING =
  "(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\s+\\d{1,2}(?:st|nd|rd|th)?)(?:\\s+\\d{4})?(?:\\s+at\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)?";

function splitPlaceAndTiming(raw: string): { place: string | null; timing: string | null } {
  const cleaned = cleanPhrase(raw);
  if (!cleaned) return { place: null, timing: null };
  if (isTimingOnly(cleaned)) return { place: null, timing: cleaned };
  const withoutPrefix = cleaned.replace(/^(?:to|at|in)\s+(?:the\s+)?/i, "");
  if (withoutPrefix !== cleaned && (isTimingOnly(withoutPrefix) || isTimingOnly(cleaned))) {
    return { place: null, timing: cleaned };
  }

  const dated = cleaned.match(new RegExp(`^(.+?)\\s+on\\s+(${DATED_TIMING})$`, "i"));
  if (dated) {
    const datedPlace = cleanPhrase(dated[1] ?? "");
    const datedTiming = cleanPhrase(dated[2] ?? "");
    if (datedPlace && datedTiming && looksLikePlace(datedPlace)) {
      return { place: datedPlace, timing: datedTiming };
    }
  }

  const trailing = cleaned.match(new RegExp(`(?:,|\\s+and|\\s+on|\\s+for|\\s+at|\\s+)(${TIMING_PHRASE})\\b(.*)$`, "i"));
  if (!trailing || trailing.index === undefined || trailing.index < 2) {
    return looksLikePlace(cleaned) ? { place: cleaned, timing: null } : { place: null, timing: null };
  }

  const place = cleanPhrase(cleaned.slice(0, trailing.index));
  const timing = cleanPhrase(`${trailing[1]}${trailing[2] ?? ""}`);
  if (!place || !looksLikePlace(place)) return { place: null, timing };
  return { place, timing };
}

export function statedAppointmentPreference(
  message: string,
  source: "patient" | "assistant" = "patient",
): { preferred_location: string | null; preferred_appointment_timing: string | null } {
  const text = message.replace(/\r/g, "").trim();
  if (!text) return { preferred_location: null, preferred_appointment_timing: null };

  const flat = text.replace(/\*+/g, "").replace(/\s+/g, " ");
  const timingLabel = flat.match(
    /\b(?:preferred\s+timing|appointment\s+timing|preferred\s+appointment\s+timing)\s*(?:is|:)\s+([^.;]+)/i,
  );
  let timing = cleanPhrase(timingLabel?.[1] ?? "");

  const labeledPlace = flat.match(
    /\b(?:preferred\s+(?:hospital|location|clinic)|appointment\s+preference|preferred\s+appointment|hospital\s+preference)\s*(?:is|:|to)\s+([^.;]+)/i,
  );
  const requestPlace = text.match(/appointment request for\s+\*{0,2}\s*([^*\n]+?)\s*\*{0,2}\s*$/im);
  const appointmentAt =
    source === "patient"
      ? flat.match(
          /\b(?:want|like|prefer|plan(?:ning)?|going|tak(?:e|ing)|book(?:ing)?|schedul(?:e|ing))\s+(?:to\s+)?(?:take\s+)?(?:an?\s+|the\s+)?appoint?m\w*\s+(?:to|at|in|with|for)\s+([^.;]+)/i,
        )
      : null;
  const preferPlace =
    source === "patient"
      ? flat.match(
          /\b(?:i\s+)?prefer(?:red)?\s+(?!timing\b|hospital\b|location\b|clinic\b|appointment\b)(?:to\s+(?:go|visit)\s+)?([^.;]+)/i,
        )
      : null;

  const rawPlace = labeledPlace?.[1] ?? requestPlace?.[1] ?? appointmentAt?.[1] ?? preferPlace?.[1] ?? null;
  const split = rawPlace ? splitPlaceAndTiming(rawPlace) : { place: null, timing: null };
  if (!timing && split.timing) timing = split.timing;

  return {
    preferred_location: split.place,
    preferred_appointment_timing: timing,
  };
}

export function preferencesFromMessages(
  messages: Array<{ role: "patient" | "assistant"; content: string }>,
): { preferred_location: string | null; preferred_appointment_timing: string | null } {
  let preferred_location: string | null = null;
  let preferred_appointment_timing: string | null = null;

  for (const message of messages) {
    if (message.role !== "patient" && message.role !== "assistant") continue;
    const stated = statedAppointmentPreference(message.content, message.role);
    if (stated.preferred_location) preferred_location = stated.preferred_location;
    if (stated.preferred_appointment_timing) preferred_appointment_timing = stated.preferred_appointment_timing;
  }

  return { preferred_location, preferred_appointment_timing };
}

export function hasCollectedIntake(patch: IntakePatch | null): boolean {
  if (!patch) return false;
  return INTAKE_FIELDS.some((field) => !isEmptyValue(patch[field]));
}
