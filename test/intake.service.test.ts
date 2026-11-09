import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStatedSymptoms,
  createEmptyIntake,
  mergeIntake,
  preferencesFromMessages,
  readIntakePatch,
  statedAppointmentPreference,
  statedConcern,
  statedConsultation,
  statedDetails,
  statedSymptoms,
} from "../src/services/intake.service";

describe("intake merge", () => {
  it("keeps a known value when a later response omits it or sends null", () => {
    const existing = { ...createEmptyIntake(), age: 42, gender: "woman" };
    const patch = readIntakePatch({
      age: null,
      location: "Mumbai",
      relevant_symptoms: [],
    });

    const merged = mergeIntake(existing, patch);

    assert.equal(merged.age, 42);
    assert.equal(merged.gender, "woman");
    assert.equal(merged.location, "Mumbai");
    assert.deepEqual(merged.relevant_symptoms, []);
  });

  it("does not invent a value from an invalid age", () => {
    const existing = { ...createEmptyIntake(), age: 42 };
    const merged = mergeIntake(existing, readIntakePatch({ age: "forty-two", location: "Mumbai" }));

    assert.equal(merged.age, 42);
    assert.equal(merged.location, "Mumbai");
  });

  it("replaces symptoms only when a new list is explicitly provided", () => {
    const existing = { ...createEmptyIntake(), relevant_symptoms: ["pain"] };
    const kept = mergeIntake(existing, readIntakePatch({ relevant_symptoms: [] }));
    const replaced = mergeIntake(existing, readIntakePatch({ relevant_symptoms: ["skin changes"] }));

    assert.deepEqual(kept.relevant_symptoms, ["pain"]);
    assert.deepEqual(replaced.relevant_symptoms, ["skin changes"]);
  });

  it("reads a breast lump the patient stated in their own words", () => {
    assert.equal(
      statedConcern("a week ago i observed a lump on my right breast. i am concerned about it"),
      "Lump on the right breast",
    );
    assert.equal(statedConcern("i am concerned about it"), null);
    assert.deepEqual(statedSymptoms("no pain yet. the size of the lump is not increasing"), ["No pain"]);
    assert.deepEqual(statedSymptoms("pain is when i touch it. i saw a nipple discharge tto"), [
      "Pain when touching the lump",
      "Nipple discharge",
    ]);
    assert.deepEqual(
      applyStatedSymptoms(["No pain"], "pain is when i touch it. i saw a nipple discharge tto"),
      ["Pain when touching the lump", "Nipple discharge"],
    );
    assert.equal(statedConsultation("i haven;t consulted a doctor yet"), "Not consulted a doctor yet");
  });

  it("reads age, place, throat lump, duration, and history from one sentence", () => {
    const details = statedDetails(
      "i am a 45 years old male located at Bangalore. i am experiencing a lump on my throat for the past two dats. i don't have any previous medical history. no pain at all",
    );
    assert.equal(details.age, 45);
    assert.equal(details.gender, "male");
    assert.equal(details.location, "Bangalore");
    assert.equal(details.concern, "Lump on the throat");
    assert.equal(details.duration, "Past two days");
    assert.equal(details.noticed_when, "Past two days");
    assert.equal(details.previous_diagnosis_or_history, "No previous medical history");
  });

  it("reads an appointment place the patient or the reply named", () => {
    assert.deepEqual(statedAppointmentPreference("Preferred hospital: Aster Medcity, Kochi"), {
      preferred_location: "Aster Medcity, Kochi",
      preferred_appointment_timing: null,
    });
    assert.deepEqual(statedAppointmentPreference("Appointment preference: Aster Medcity, Kochi, next week"), {
      preferred_location: "Aster Medcity, Kochi",
      preferred_appointment_timing: "next week",
    });
    assert.deepEqual(statedAppointmentPreference("I prefer Aster Medcity, Kochi"), {
      preferred_location: "Aster Medcity, Kochi",
      preferred_appointment_timing: null,
    });
    assert.deepEqual(
      statedAppointmentPreference(
        "i am planning to take an appoinment to Appolo cancer center at hebbal on 8th nov at 11AM",
      ),
      {
        preferred_location: "Appolo cancer center at hebbal",
        preferred_appointment_timing: "8th nov at 11AM",
      },
    );
    assert.deepEqual(statedAppointmentPreference("Preferred timing: Next week morning"), {
      preferred_location: null,
      preferred_appointment_timing: "Next week morning",
    });
    assert.deepEqual(statedAppointmentPreference("Location: Pune"), {
      preferred_location: null,
      preferred_appointment_timing: null,
    });
    assert.deepEqual(
      statedAppointmentPreference(
        "What I can help with next:\n- organize the appointment request for **Aster Medcity, Kochi**\n- prepare a doctor-ready summary",
        "assistant",
      ),
      {
        preferred_location: "Aster Medcity, Kochi",
        preferred_appointment_timing: null,
      },
    );
    assert.deepEqual(
      preferencesFromMessages([
        { role: "patient", content: "I want the appointment at Aster Medcity, Kochi" },
        { role: "assistant", content: "I can organize the appointment request for **Aster Medcity, Kochi**" },
      ]),
      {
        preferred_location: "Aster Medcity, Kochi",
        preferred_appointment_timing: null,
      },
    );
  });
});
