"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

global.window = globalThis;
const requirements = require("../src/yarnai/static/garment-measurement-requirements.js");

const RAGLAN = "Вязание сверху вниз с рукавами реглан";
const SET_IN = "Вязание отдельными деталями с втачным рукавом";

function handoff(name = RAGLAN) {
  return {
    isCurrent: true,
    decisionStatus: "confirmed",
    projectId: "project:test",
    analysisId: "analysis:test",
    analysisRevision: 4,
    sourceAnalysisFingerprint: "fnv1a32:11111111",
    analysisRequestId: "request:test",
    sourceRequestFingerprint: "fnv1a32:22222222",
    technologyDecisionId: "decision:test",
    technologyDecisionRevision: 9,
    technologyDecisionFingerprint: "fnv1a32:33333333",
    selectedOptionId: name === RAGLAN ? "option:raglan" : "option:set-in",
    selectedOption: {
      name,
      constructionSummary: "Текст карточки не является частью canonical contract.",
      advantages: ["UI only"],
    },
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function minimumGarmentArtifact(overrides = {}) {
  const artifact = {
    targetSizing: {
      bodyMeasurements: [],
      finishedGarmentMeasurements: [
        { kind: "finished_bust_circumference", value: 108, unit: "cm" },
        { kind: "finished_body_length", value: 62, unit: "cm" },
        { kind: "finished_sleeve_length", value: 58, unit: "cm" },
        { kind: "finished_upper_arm_circumference", value: 34, unit: "cm" },
        { kind: "finished_cuff_circumference", value: 18, unit: "cm" },
        { kind: "finished_neck_width", value: 18, unit: "cm" },
        { kind: "finished_front_neck_depth", value: 8, unit: "cm" },
        { kind: "finished_yoke_depth", value: 24, unit: "cm" },
      ],
      ease: [],
      fitPreferences: { body_shaping_preference: "straight", neckline_style: "round_neck", closure_style: "none" },
    },
    constructionInputs: { hem_finish: "rib", cuff_finish: "rib" },
  };
  return Object.assign(artifact, overrides);
}

test("01 identical confirmed handoff produces identical canonical profile and fingerprint", () => {
  const first = requirements.resolveFromTechnologyDecision(handoff());
  const second = requirements.resolveFromTechnologyDecision(clone(handoff()));
  assert.deepEqual(second, first);
  assert.equal(second.canonicalFingerprint, first.canonicalFingerprint);
});

test("02 a significant construction change changes identity, requirements, and fingerprint", () => {
  const raglan = requirements.resolveFromTechnologyDecision(handoff(RAGLAN));
  const setIn = requirements.resolveFromTechnologyDecision(handoff(SET_IN));
  assert.equal(raglan.constructionIdentity, "top_down_raglan");
  assert.equal(setIn.constructionIdentity, "seamed_set_in_sleeve");
  assert.notDeepEqual(setIn.measurementRequirements, raglan.measurementRequirements);
  assert.notEqual(setIn.canonicalFingerprint, raglan.canonicalFingerprint);
});

test("03 UI-only selected-option fields do not affect canonical fingerprint", () => {
  const firstInput = handoff();
  const secondInput = clone(firstInput);
  secondInput.selectedOption.constructionSummary = "Другая подпись карточки";
  secondInput.selectedOption.advantages = ["Другая подсказка"];
  assert.equal(requirements.resolveFromTechnologyDecision(secondInput).canonicalFingerprint, requirements.resolveFromTechnologyDecision(firstInput).canonicalFingerprint);
});

test("04 an unconfirmed decision returns fail-closed unresolved ABSTAIN", () => {
  const input = handoff();
  input.decisionStatus = "draft";
  const profile = requirements.resolveFromTechnologyDecision(input);
  assert.equal(profile.status, "unresolved");
  assert.equal(profile.abstain, true);
  assert.equal(profile.reasonCode, "GARMENT_REQUIREMENTS_UNRESOLVED");
});

test("05 an unknown construction name returns GARMENT_REQUIREMENTS_UNRESOLVED", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff("Неутверждённая конструкция"));
  assert.equal(profile.reasonCode, "GARMENT_REQUIREMENTS_UNRESOLVED");
  assert.equal(profile.measurementRequirements.length, 0);
});

test("06 required, optional, and conditional levels stay distinct", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff());
  assert.deepEqual([...new Set(profile.measurementRequirements.map((entry) => entry.requirementLevel))].sort(), ["conditional", "optional", "required"]);
});

test("07 an inactive conditional requirement does not block", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff());
  const result = requirements.evaluateProfile(profile, minimumGarmentArtifact());
  const bodyBust = result.items.find((entry) => entry.measurementId === "body_bust_circumference");
  assert.equal(bodyBust.active, false);
  assert.equal(bodyBust.blocks, false);
});

test("set-in polo needs shoulders and armhole but does not demand unused back width", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff(SET_IN));
  const artifact = minimumGarmentArtifact();
  artifact.targetSizing.bodyMeasurements = [{ kind: "body_shoulder_width", value: 42, unit: "cm" }];
  artifact.targetSizing.finishedGarmentMeasurements.push({ kind: "finished_armhole_depth", value: 24, unit: "cm" });
  const evaluated = requirements.evaluateProfile(profile, artifact);
  assert.equal(evaluated.status, "complete");
  assert.equal(evaluated.items.find(item => item.measurementId === "body_back_width").blocks, false);
  artifact.targetSizing.bodyMeasurements = [];
  assert.equal(requirements.evaluateProfile(profile, artifact).blockers[0].measurementId, "body_shoulder_width");
});

test("08 an active conditional requirement blocks when missing", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff());
  const artifact = minimumGarmentArtifact();
  artifact.targetSizing.fitPreferences.body_shaping_preference = "shaped";
  const result = requirements.evaluateProfile(profile, artifact);
  assert.equal(result.items.find((entry) => entry.measurementId === "finished_waist_circumference").blocks, true);
  assert.equal(result.items.find((entry) => entry.measurementId === "finished_hip_circumference").blocks, true);
});

test("09 null, empty string, and missing stay missing and never normalize to zero", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff());
  const artifact = minimumGarmentArtifact();
  artifact.targetSizing.finishedGarmentMeasurements = artifact.targetSizing.finishedGarmentMeasurements.filter((entry) => entry.kind !== "finished_body_length");
  artifact.targetSizing.finishedGarmentMeasurements.push({ kind: "finished_body_length", value: "", unit: "cm" });
  const first = requirements.evaluateProfile(profile, artifact).items.find((entry) => entry.measurementId === "finished_body_length");
  artifact.targetSizing.finishedGarmentMeasurements.at(-1).value = null;
  const second = requirements.evaluateProfile(profile, artifact).items.find((entry) => entry.measurementId === "finished_body_length");
  assert.deepEqual([first.status, first.normalizedValue, second.status, second.normalizedValue], ["missing", null, "missing", null]);
});

test("10 zero, negative, nonnumeric, and out-of-range garment values are invalid", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff());
  for (const value of [0, -1, "not-a-number", 501]) {
    const artifact = minimumGarmentArtifact();
    artifact.targetSizing.finishedGarmentMeasurements.find((entry) => entry.kind === "finished_body_length").value = value;
    const item = requirements.evaluateProfile(profile, artifact).items.find((entry) => entry.measurementId === "finished_body_length");
    assert.equal(item.status, "invalid");
    assert.equal(item.blocks, true);
  }
});

test("11 AI observations cannot satisfy a missing user measurement", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff());
  const artifact = minimumGarmentArtifact({ visibleObservations: [{ field: "finished_body_length", value: "62 см" }] });
  artifact.targetSizing.finishedGarmentMeasurements = artifact.targetSizing.finishedGarmentMeasurements.filter((entry) => entry.kind !== "finished_body_length");
  const item = requirements.evaluateProfile(profile, artifact).items.find((entry) => entry.measurementId === "finished_body_length");
  assert.equal(item.status, "missing");
  assert.equal(item.blocks, true);
});

test("12 profile fingerprint and compact binding survive an exact serialized reload", () => {
  const profile = requirements.resolveFromTechnologyDecision(handoff());
  const restored = JSON.parse(JSON.stringify({ profile, binding: requirements.compactBinding(profile) }));
  assert.equal(requirements.requireValidProfile(restored.profile), true);
  assert.deepEqual(restored.binding, requirements.compactBinding(restored.profile));
});

test("13 a changed technology decision changes the authoritative profile binding", () => {
  const first = requirements.resolveFromTechnologyDecision(handoff());
  const changedInput = handoff();
  changedInput.technologyDecisionRevision += 1;
  changedInput.technologyDecisionFingerprint = "fnv1a32:44444444";
  const second = requirements.resolveFromTechnologyDecision(changedInput);
  assert.notDeepEqual(requirements.compactBinding(second), requirements.compactBinding(first));
  assert.notEqual(second.canonicalFingerprint, first.canonicalFingerprint);
});

test("14 a contract-version change invalidates the prior canonical profile", () => {
  const tampered = clone(requirements.resolveFromTechnologyDecision(handoff()));
  tampered.contractVersion = "GARMENT_MEASUREMENT_REQUIREMENTS_V2";
  assert.throws(() => requirements.requireValidProfile(tampered), { code: "GARMENT_REQUIREMENTS_PROFILE_INVALID" });
});

test("15 repeated resolution is idempotent and creates no changing identity", () => {
  const input = handoff();
  const snapshots = Array.from({ length: 3 }, () => requirements.compactBinding(requirements.resolveFromTechnologyDecision(input)));
  assert.deepEqual(snapshots[1], snapshots[0]);
  assert.deepEqual(snapshots[2], snapshots[0]);
});

test("16 resolving requirements does not mutate analysis or decision input", () => {
  const input = handoff();
  const before = JSON.stringify(input);
  requirements.resolveFromTechnologyDecision(input);
  assert.equal(JSON.stringify(input), before);
});
