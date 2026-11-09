import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyIntake } from "../src/services/intake.service";
import {
  applyUploadedReports,
  displayName,
  hasReportSignature,
  reportKind,
} from "../src/services/document.service";

describe("report upload", () => {
  it("keeps a safe file name and drops the folder path", () => {
    assert.equal(displayName("C:\\Users\\patient\\scan; final.pdf"), "scan, final.pdf");
    assert.equal(displayName("   "), "Report");
  });

  it("accepts a pdf or photo and rejects other files", () => {
    assert.equal(reportKind("mammogram.pdf", "application/pdf"), "pdf");
    assert.equal(reportKind("photo.JPG", "image/jpeg"), "jpeg");
    assert.equal(reportKind("scan.png", "application/octet-stream"), "png");
    assert.equal(reportKind("notes.txt", "text/plain"), null);
    assert.equal(reportKind("report.pdf", "image/png"), null);
  });

  it("checks the file contents match the chosen type", () => {
    assert.equal(hasReportSignature("pdf", Buffer.from("%PDF-1.4")), true);
    assert.equal(hasReportSignature("pdf", Buffer.from("hello")), false);
    assert.equal(hasReportSignature("jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])), true);
    assert.equal(
      hasReportSignature("png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      true,
    );
  });

  it("adds the file name to reports and keeps details already collected", () => {
    const existing = { ...createEmptyIntake(), age: 39, location: "Kochi, Kerala" };
    const withFile = applyUploadedReports(existing, ["ultrasound.pdf"]);
    const again = applyUploadedReports(withFile, ["ultrasound.pdf"]);
    const withNote = applyUploadedReports(
      { ...existing, existing_reports: "Mammogram from last year" },
      ["ultrasound.pdf"],
    );

    assert.equal(withFile.age, 39);
    assert.equal(withFile.location, "Kochi, Kerala");
    assert.equal(withFile.existing_reports, "ultrasound.pdf");
    assert.equal(again.existing_reports, "ultrasound.pdf");
    assert.equal(withNote.existing_reports, "Mammogram from last year; ultrasound.pdf");
  });
});
