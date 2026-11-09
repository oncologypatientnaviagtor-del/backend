import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { questionUsesReport, reportContextForQuestion } from "../src/services/report-text.service";

describe("report context", () => {
  it("adds the uploaded report text to the question sent to the assistant", () => {
    const message = reportContextForQuestion("Please summarize my report", "BI-RADS 2. No suspicious mass.");
    assert.match(message, /Please summarize my report/);
    assert.match(message, /BI-RADS 2/);
    assert.match(message, /Do not diagnose/);
  });

  it("leaves the question unchanged when the report has no readable text", () => {
    assert.equal(reportContextForQuestion("Please summarize my report", "  "), "Please summarize my report");
  });

  it("reads a stored report only when the question is about that report", () => {
    assert.equal(questionUsesReport("What does my mammogram report say?"), true);
    assert.equal(questionUsesReport("I noticed a lump last week"), false);
  });
});
