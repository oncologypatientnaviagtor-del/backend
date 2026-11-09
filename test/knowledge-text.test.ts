import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldSearchSharedKnowledge } from "../src/services/knowledge-text";

describe("shared knowledge search", () => {
  it("searches when the question is about a hospital or doctor", () => {
    assert.equal(shouldSearchSharedKnowledge("Which hospital in Bengaluru has a breast clinic?"), true);
    assert.equal(shouldSearchSharedKnowledge("Do you have a doctor at Aster Medcity?"), true);
  });

  it("leaves ordinary visit details out of the shared list", () => {
    assert.equal(shouldSearchSharedKnowledge("I noticed a lump on my right breast a week ago."), false);
    assert.equal(shouldSearchSharedKnowledge("Preferred timing: next week morning"), false);
  });
});
