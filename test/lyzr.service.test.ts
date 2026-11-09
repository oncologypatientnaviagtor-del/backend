import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLyzrPayload } from "../src/services/lyzr.service";

const conversation =
  "I understand why this may feel worrying. I can help you collect the relevant information and guide you through the next steps. I cannot diagnose the cause of the lump. May I ask whether you have noticed any other changes such as pain, nipple discharge, skin changes, or whether the lump has changed?";

const intake = {
  age: 42,
  gender: "woman",
  location: "Mumbai",
  concern: "Small lump in breast",
  noticed_when: "yesterday",
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

describe("Lyzr response adapter", () => {
  it("reads the documented chat envelope when it contains only conversation", () => {
    const turn = normalizeLyzrPayload({ response: "Hello. How can I help you today?" });

    assert.equal(turn.message, "Hello. How can I help you today?");
    assert.equal(turn.intake, null);
  });

  it("separates conversational text from a trailing intake object", () => {
    const turn = normalizeLyzrPayload({
      response: `${conversation}\n\n${JSON.stringify(intake, null, 2)}`,
    });

    assert.equal(turn.message, conversation);
    assert.equal(turn.message.includes("{"), false);
    assert.equal(turn.intake?.age, 42);
    assert.equal(turn.intake?.gender, "woman");
    assert.equal(turn.intake?.location, "Mumbai");
    assert.equal(turn.intake?.concern, "Small lump in breast");
    assert.equal(turn.intake?.noticed_when, "yesterday");
  });

  it("separates a fenced JSON block from the conversation", () => {
    const turn = normalizeLyzrPayload({
      response: `${conversation}\n\n\`\`\`json\n${JSON.stringify(intake)}\n\`\`\``,
    });

    assert.equal(turn.message, conversation);
    assert.equal(turn.intake?.location, "Mumbai");
  });

  it("uses a sibling structured field when the API provides one", () => {
    const turn = normalizeLyzrPayload({
      response: conversation,
      structured_output: intake,
    });

    assert.equal(turn.message, conversation);
    assert.equal(turn.intake?.age, 42);
    assert.equal(turn.intake?.gender, "woman");
  });

  it("reads a nested doctor-ready summary into the panel fields", () => {
    const reply = [
      "Thank you — I’ve noted your location, insurance, and preferred hospital.",
      "",
      "Here is your doctor-ready summary:",
      "",
      "- Reason for visit: Right breast lump with rash",
      "- Patient-reported symptoms:",
      "  - Lump on right breast",
      "  - Rash on right breast skin",
      "- Relevant history:",
      "  - 39-year-old woman",
      "  - Lives in Kochi, Kerala",
      "- Available reports:",
      "  - None provided",
      "- Insurance information:",
      "  - Adithya Birla Group insurance",
      "- Appointment information:",
      "  - Preferred hospital: Aster Medcity Hospital, Ernakulam",
      "",
      "If you want, I can help you prepare the appointment details.",
    ].join("\n");

    const turn = normalizeLyzrPayload({ response: reply });

    assert.equal(turn.message.includes("Reason for visit"), false);
    assert.equal(turn.message.includes("Lump on right breast"), false);
    assert.match(turn.message, /prepare the appointment details/);
    assert.equal(turn.intake?.concern, "Right breast lump with rash");
    assert.deepEqual(turn.intake?.relevant_symptoms, ["Lump on right breast", "Rash on right breast skin"]);
    assert.equal(turn.intake?.age, 39);
    assert.equal(turn.intake?.gender, "woman");
    assert.equal(turn.intake?.location, "Kochi, Kerala");
    assert.equal(turn.intake?.existing_reports ?? null, null);
    assert.equal(turn.intake?.insurance_information, "Adithya Birla Group insurance");
    assert.equal(turn.intake?.preferred_location, "Aster Medcity Hospital, Ernakulam");
  });

  it("moves a labeled summary into the panel and leaves the conversational reply", () => {
    const reply = [
      "Thank you. Here is what I have so far.",
      "",
      "- **First noticed:** Yesterday",
      "- **Associated symptoms:** No pain, no skin dimpling, no nipple discharge",
      "- **Preferred location:** Hospital in Mumbai",
      "- **Insurance:** Not provided yet",
      "",
      "If you want, I can help you prepare a short note for the visit.",
    ].join("\n");

    const turn = normalizeLyzrPayload({ response: reply });

    assert.equal(turn.message.includes("First noticed"), false);
    assert.equal(turn.message.includes("Insurance"), false);
    assert.match(turn.message, /short note for the visit/);
    assert.equal(turn.intake?.noticed_when, "Yesterday");
    assert.deepEqual(turn.intake?.relevant_symptoms, ["No pain, no skin dimpling, no nipple discharge"]);
    assert.equal(turn.intake?.preferred_location, "Hospital in Mumbai");
    assert.equal(turn.intake?.insurance_information ?? null, null);
  });

  it("does not infer intake from conversational prose", () => {
    const turn = normalizeLyzrPayload({
      response: "I am a 42-year-old woman living in Mumbai and I found a lump.",
    });

    assert.equal(turn.intake, null);
  });

  it("keeps JSON-only intake out of the chat text", () => {
    const turn = normalizeLyzrPayload({ response: JSON.stringify(intake) });

    assert.equal(turn.message.includes("age"), false);
    assert.equal(turn.message.includes("{"), false);
    assert.equal(turn.intake?.concern, "Small lump in breast");
  });

  it("reads a full patient note into the panel fields", () => {
    const note = [
      "Age: 48",
      "Gender: Woman",
      "Location: Pune",
      "Concern: Lump on the right breast",
      "First noticed: A week ago",
      "Duration: 1 week",
      "Changes: Size is not increasing",
      "Symptoms:",
      "- Pain when touching the lump",
      "- Nipple discharge",
      "Previous consultation: Not consulted a doctor yet",
      "Reports: Mammogram report",
      "Insurance: Niva Bupa",
    ].join("\n");

    const turn = normalizeLyzrPayload({ response: note });

    assert.equal(turn.intake?.age, 48);
    assert.equal(turn.intake?.gender, "Woman");
    assert.equal(turn.intake?.location, "Pune");
    assert.equal(turn.intake?.concern, "Lump on the right breast");
    assert.equal(turn.intake?.noticed_when, "A week ago");
    assert.equal(turn.intake?.duration, "1 week");
    assert.equal(turn.intake?.changes_over_time, "Size is not increasing");
    assert.deepEqual(turn.intake?.relevant_symptoms, ["Pain when touching the lump", "Nipple discharge"]);
    assert.equal(turn.intake?.previous_doctor_consultation, "Not consulted a doctor yet");
    assert.equal(turn.intake?.existing_reports, "Mammogram report");
    assert.equal(turn.intake?.insurance_information, "Niva Bupa");
  });
});
