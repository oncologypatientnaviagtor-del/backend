import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";

const REPORTS_ROOT = path.resolve(process.cwd(), "data", "reports");
const MAX_REPORT_TEXT = 4_000;
const REPORT_QUESTION = /\b(reports?|scans?|results?|mammogra\w*|pdfs?|documents?|uploaded|bi-?rads)\b/i;

export function questionUsesReport(message: string): boolean {
  return REPORT_QUESTION.test(message);
}

export interface StoredReportFile {
  originalName: string;
  storedName: string;
  mimeType: string;
}

export function reportContextForQuestion(question: string, reportText: string): string {
  const excerpt = reportText.trim().slice(0, MAX_REPORT_TEXT);
  if (!excerpt) return question;
  return [
    question,
    "",
    "Report text uploaded for this visit only. Use it to organize what the report says. Do not diagnose or recommend treatment.",
    excerpt,
  ].join("\n");
}

export async function readStoredReportText(sessionId: string, reports: StoredReportFile[]): Promise<string> {
  const parts: string[] = [];
  for (const report of reports) {
    if (report.mimeType !== "application/pdf") continue;
    if (!/^[0-9a-f-]{36}\.pdf$/i.test(report.storedName)) continue;
    const fullPath = path.join(REPORTS_ROOT, sessionId, report.storedName);
    try {
      const bytes = new Uint8Array(await readFile(fullPath));
      const pdf = await getDocumentProxy(bytes);
      const extracted = await extractText(pdf, { mergePages: true });
      const text = (Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text).replace(/\s+/g, " ").trim();
      if (text) parts.push(`${report.originalName}: ${text}`);
    } catch {
      continue;
    }
  }
  return parts.join("\n\n").slice(0, MAX_REPORT_TEXT);
}
