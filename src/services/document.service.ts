import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Encounter } from "../models/Encounter";
import type { PatientIntake } from "../types/intake";
import type { WorkflowStatus } from "../types/workflow";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { linkVisitMap } from "./care-graph.service";
import { toPatientIntake } from "./intake.service";
import { workflowForIntake } from "./workflow.service";

export const MAX_REPORT_BYTES = 10 * 1024 * 1024;
export const MAX_REPORTS_PER_VISIT = 10;

const REPORTS_ROOT = path.resolve(process.cwd(), "data", "reports");

export type ReportKind = "pdf" | "jpeg" | "png";

export interface IncomingReport {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export function displayName(originalName: string): string {
  const base = originalName.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").replace(/;/g, ",").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "Report";
}

export function reportKind(originalName: string, mimeType: string): ReportKind | null {
  const name = displayName(originalName).toLowerCase();
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  const kind: ReportKind | null = name.endsWith(".pdf")
    ? "pdf"
    : name.endsWith(".png")
      ? "png"
      : name.endsWith(".jpg") || name.endsWith(".jpeg")
        ? "jpeg"
        : null;

  if (!kind) return null;

  const expected = kind === "pdf" ? "application/pdf" : kind === "png" ? "image/png" : "image/jpeg";
  const acceptable = mime === expected || mime === "" || mime === "application/octet-stream";
  return acceptable ? kind : null;
}

export function hasReportSignature(kind: ReportKind, bytes: Buffer): boolean {
  if (kind === "pdf") return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  if (kind === "jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

export function applyUploadedReports(intake: PatientIntake, names: string[]): PatientIntake {
  const labels = names.map((name) => displayName(name));
  if (labels.length === 0) return intake;

  const current = intake.existing_reports?.trim() ?? "";
  const listed = new Set(current.split(";").map((part) => part.trim()).filter(Boolean));
  const missing = labels.filter((label) => !listed.has(label));
  if (current && missing.length === 0) return intake;

  return {
    ...intake,
    existing_reports: [current, ...missing].filter(Boolean).join("; "),
  };
}

function extensionFor(kind: ReportKind): string {
  if (kind === "pdf") return ".pdf";
  if (kind === "png") return ".png";
  return ".jpg";
}

export async function saveReport(
  sessionId: string,
  file: IncomingReport,
): Promise<{ sessionId: string; patientIntake: PatientIntake; workflowStatus: WorkflowStatus }> {
  const kind = reportKind(file.originalname, file.mimetype);
  const size = file.buffer.length;
  if (!kind || size <= 0 || size > MAX_REPORT_BYTES || !hasReportSignature(kind, file.buffer)) {
    throw new HttpError(400, "Please choose a PDF or a photo (JPG or PNG).");
  }

  const encounter = await Encounter.findOne({ sessionId });
  if (!encounter) {
    throw new HttpError(404, "This conversation could not be found. Start a new one.");
  }
  if (encounter.documents.length >= MAX_REPORTS_PER_VISIT) {
    throw new HttpError(400, "This visit already has the maximum number of reports.");
  }

  const documentId = randomUUID();
  const storedName = `${documentId}${extensionFor(kind)}`;
  const directory = path.join(REPORTS_ROOT, sessionId);
  const fullPath = path.join(directory, storedName);
  const label = displayName(file.originalname);

  await mkdir(directory, { recursive: true });
  await writeFile(fullPath, file.buffer, { flag: "wx" });

  try {
    encounter.documents.push({
      documentId,
      originalName: label,
      storedName,
      mimeType: kind === "pdf" ? "application/pdf" : kind === "png" ? "image/png" : "image/jpeg",
      sizeBytes: size,
      uploadedAt: new Date(),
    });
    const patientIntake = applyUploadedReports(
      toPatientIntake(encounter.structuredIntake),
      encounter.documents.map((document) => document.originalName),
    );
    encounter.structuredIntake = {
      ...patientIntake,
      relevant_symptoms: [...patientIntake.relevant_symptoms],
    };
    encounter.workflowStatus = workflowForIntake(encounter.workflowStatus, patientIntake);
    encounter.markModified("structuredIntake");
    encounter.markModified("documents");
    await encounter.save();
    logger.info("report_saved");
    await linkVisitMap({
      sessionId: encounter.sessionId,
      concern: patientIntake.concern,
      reports: encounter.documents.map((document) => ({
        documentId: document.documentId,
        name: document.originalName,
      })),
    });
    return { sessionId: encounter.sessionId, patientIntake, workflowStatus: encounter.workflowStatus };
  } catch (error) {
    await rm(fullPath, { force: true });
    if (error instanceof HttpError) throw error;
    logger.error("report_store_failed");
    throw new HttpError(500, "We couldn't save that report. Please try again.");
  }
}
