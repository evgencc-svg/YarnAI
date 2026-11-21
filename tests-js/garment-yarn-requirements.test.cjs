"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const yarnRequirements = require("../src/yarnai/static/garment-yarn-requirements.js");

function handoff(optionName = "Вязание сверху вниз с рукавами реглан") {
  return {
    isCurrent: true,
    decisionStatus: "confirmed",
    projectId: "project:test",
    sourceProjectRevision: 12,
    analysisId: "analysis:test",
    analysisRevision: 4,
    analysisRequestId: "request:test",
    requestBindingProjectRevision: 12,
    sourceAnalysisFingerprint: "fnv1a32:11111111",
    sourceRequestFingerprint: "fnv1a32:22222222",
    technologyDecisionId: "decision:test",
    technologyDecisionRevision: 9,
    technologyDecisionFingerprint: "fnv1a32:33333333",
    selectedOptionId: optionName.includes("реглан") ? "option:raglan" : "option:set-in",
    selectedOption: { name: optionName },
  };
}

function artifact(yarn = {}) {
  return { yarn: { selectionStatus: "not_selected", name: null, strandCount: null, composition: null, lengthMeters: null, skeinMassGrams: null, quantityAvailable: null, ...yarn } };
}

test("both confirmed manual constructions resolve deterministic profiles", () => {
  const raglan = yarnRequirements.resolveFromTechnologyDecision(handoff());
  const setIn = yarnRequirements.resolveFromTechnologyDecision(handoff("Вязание отдельными деталями с втачным рукавом"));
  assert.equal(raglan.status, "resolved");
  assert.equal(raglan.constructionIdentity, "top_down_raglan");
  assert.equal(setIn.status, "resolved");
  assert.equal(setIn.constructionIdentity, "seamed_set_in_sleeve");
  assert.notEqual(raglan.canonicalFingerprint, setIn.canonicalFingerprint);
});

test("industrial, unconfirmed, incomplete, and mismatched bindings fail closed", () => {
  const industrial = handoff("Промышленное вязание деталей точно по форме");
  assert.equal(yarnRequirements.resolveFromTechnologyDecision(industrial).reasonCode, "YARN_REQUIREMENTS_UNRESOLVED");
  const unconfirmed = handoff(); unconfirmed.decisionStatus = "draft";
  assert.equal(yarnRequirements.resolveFromTechnologyDecision(unconfirmed).status, "unresolved");
  const incomplete = handoff(); incomplete.technologyDecisionFingerprint = null;
  assert.equal(yarnRequirements.resolveFromTechnologyDecision(incomplete).status, "unresolved");
  const mismatch = handoff(); mismatch.requestProjectId = "project:other";
  assert.equal(yarnRequirements.resolveFromTechnologyDecision(mismatch).status, "unresolved");
});

test("required values are only yarn identity and explicit strand count", () => {
  const profile = yarnRequirements.resolveFromTechnologyDecision(handoff());
  const required = profile.requirements.filter((entry) => entry.requirementLevel === "required");
  assert.deepEqual(required.map((entry) => entry.requirementId), ["yarn_identity", "strand_count"]);
  assert.deepEqual(required.map((entry) => entry.valuePath), ["yarn.name", "yarn.strandCount"]);
  assert.ok(required.every((entry) => entry.downstreamConsumers.length > 0));
  assert.deepEqual(profile.requirements.filter((entry) => entry.requirementLevel === "conditional"), []);
  assert.deepEqual(profile.requirements.filter((entry) => entry.requirementLevel === "optional").map((entry) => entry.requirementId), ["skein_mass_grams", "skein_length_meters", "fiber_composition", "quantity_available_skeins"]);
  assert.deepEqual(profile.requirements.filter((entry) => entry.requirementLevel === "informational").map((entry) => entry.requirementId), ["selection_method", "yarn_weight_category", "color_and_dye_lot", "manufacturer_needle_range"]);
});

test("no selection creates no hidden yarn facts and no duplicate field blockers", () => {
  const profile = yarnRequirements.resolveFromTechnologyDecision(handoff());
  const input = artifact({ photoObservation: "Выглядит как толстая шерсть" });
  const before = JSON.stringify(input);
  const result = yarnRequirements.evaluateProfile(profile, input);
  assert.equal(result.selected, false);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.items.find((entry) => entry.requirementId === "strand_count").status, "pending_selection");
  assert.equal(input.yarn.strandCount, null);
  assert.equal(JSON.stringify(input), before);
});

test("selected yarn requires a positive integer strand count without inventing one", () => {
  const profile = yarnRequirements.resolveFromTechnologyDecision(handoff());
  for (const value of [null, "", 0, -1, 1.5, "unknown"]) {
    const result = yarnRequirements.evaluateProfile(profile, artifact({ selectionStatus: "selected", name: "TEST yarn", strandCount: value }));
    assert.deepEqual(result.blockers.map((entry) => entry.requirementId), ["strand_count"]);
  }
  const valid = yarnRequirements.evaluateProfile(profile, artifact({ selectionStatus: "selected", name: "TEST yarn", strandCount: 2 }));
  assert.equal(valid.status, "satisfied");
  assert.equal(valid.blockers.length, 0);
});

test("optional and informational values never replace needle or gauge blockers", () => {
  const profile = yarnRequirements.resolveFromTechnologyDecision(handoff());
  const result = yarnRequirements.evaluateProfile(profile, artifact({ selectionStatus: "selected", name: "TEST yarn", strandCount: 1 }));
  assert.equal(result.status, "satisfied");
  assert.equal(result.items.find((entry) => entry.requirementId === "manufacturer_needle_range").status, "informational");
  assert.equal(result.items.find((entry) => entry.requirementId === "skein_mass_grams").blocks, false);
});

test("fingerprints, compact bindings, and repeated resolution are exact and stable", () => {
  const first = yarnRequirements.resolveFromTechnologyDecision(handoff());
  const second = yarnRequirements.resolveFromTechnologyDecision(handoff());
  assert.equal(first.profileId, second.profileId);
  assert.equal(first.canonicalFingerprint, second.canonicalFingerprint);
  assert.deepEqual(yarnRequirements.compactBinding(first), yarnRequirements.compactBinding(second));
  assert.equal(yarnRequirements.compactBinding(first).requestBindingProjectRevision, 12);
  const changed = handoff(); changed.technologyDecisionFingerprint = "fnv1a32:aaaaaaaa";
  const changedProfile = yarnRequirements.resolveFromTechnologyDecision(changed);
  assert.notEqual(changedProfile.profileId, first.profileId);
  assert.notEqual(changedProfile.canonicalFingerprint, first.canonicalFingerprint);
});

test("profile is deeply immutable and corrupt canonical content is rejected", () => {
  const source = handoff();
  const profile = yarnRequirements.resolveFromTechnologyDecision(source);
  source.selectedOption.name = "mutated";
  assert.equal(profile.upstream.selectedOptionName, "Вязание сверху вниз с рукавами реглан");
  assert.equal(Object.isFrozen(profile.requirements[0].downstreamConsumers), true);
  const corrupt = JSON.parse(JSON.stringify(profile));
  corrupt.requirements[0].labelRu = "tampered";
  assert.throws(() => yarnRequirements.requireValidProfile(corrupt), { code: "YARN_REQUIREMENTS_PROFILE_FINGERPRINT_MISMATCH" });
});
