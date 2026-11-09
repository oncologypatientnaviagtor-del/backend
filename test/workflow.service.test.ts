import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyIntake } from "../src/services/intake.service";
import { advanceToAppointment, advanceToCareNavigation, workflowForIntake } from "../src/services/workflow.service";

describe("safety review step", () => {
  it("opens safety review when a concern has been collected", () => {
    const intake = { ...createEmptyIntake(), concern: "Right breast lump" };
    assert.equal(workflowForIntake("INTAKE", intake), "SAFETY_REVIEW");
  });

  it("stays on information when the concern is still empty", () => {
    assert.equal(workflowForIntake("INTAKE", createEmptyIntake()), "INTAKE");
    assert.equal(workflowForIntake("INTAKE", { ...createEmptyIntake(), concern: "  " }), "INTAKE");
  });

  it("does not open care navigation from a chat update", () => {
    const intake = { ...createEmptyIntake(), concern: "Right breast lump" };
    assert.equal(workflowForIntake("SAFETY_REVIEW", intake), "SAFETY_REVIEW");
    assert.equal(workflowForIntake("CARE_NAVIGATION", intake), "CARE_NAVIGATION");
  });

  it("opens care navigation only from safety review", () => {
    assert.equal(advanceToCareNavigation("SAFETY_REVIEW"), "CARE_NAVIGATION");
    assert.equal(advanceToCareNavigation("INTAKE"), "INTAKE");
    assert.equal(advanceToCareNavigation("CARE_NAVIGATION"), "CARE_NAVIGATION");
  });

  it("opens appointment only from care navigation", () => {
    assert.equal(advanceToAppointment("CARE_NAVIGATION"), "APPOINTMENT");
    assert.equal(advanceToAppointment("SAFETY_REVIEW"), "SAFETY_REVIEW");
    assert.equal(advanceToAppointment("APPOINTMENT"), "APPOINTMENT");
    assert.equal(workflowForIntake("APPOINTMENT", { ...createEmptyIntake(), concern: "Lump on the throat" }), "APPOINTMENT");
  });
});
