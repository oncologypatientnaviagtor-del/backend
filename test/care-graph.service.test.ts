import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VISIT_MAP_QUERY, visitTypeForConcern } from "../src/services/care-graph.service";

describe("visit map", () => {
  it("chooses a breast clinic visit only when the concern mentions the breast", () => {
    assert.equal(visitTypeForConcern("Right breast lump with rash"), "Breast clinic visit");
    assert.equal(visitTypeForConcern("knee pain"), "Clinic visit for this concern");
    assert.equal(visitTypeForConcern(null), null);
    assert.equal(visitTypeForConcern("  "), null);
  });

  it("links a report to the concern and the concern to a visit type", () => {
    assert.match(VISIT_MAP_QUERY, /\[:ABOUT\]/);
    assert.match(VISIT_MAP_QUERY, /\[:LEADS_TO\]/);
    assert.doesNotMatch(VISIT_MAP_QUERY, /age|insurance|location|password/i);
  });
});
