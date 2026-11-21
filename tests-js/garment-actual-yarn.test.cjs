"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
require("../src/yarnai/static/garment-measurement-requirements.js");
require("../src/yarnai/static/garment-yarn-requirements.js");
const intake = require("../src/yarnai/static/manual-calculation-intake.js");
const actual = require("../src/yarnai/static/garment-actual-yarn.js");

const PROJECT_ID = "01990000-0000-7000-8000-000000000000";
const CALCULATION_ID = "01990000-0000-7000-8000-000000000001";
const INTAKE_ID = "01990000-0000-7000-8000-000000000002";
const T0 = "2026-09-02T08:00:00.000Z";
const LABEL_PHOTO_ID = "01990000-0000-7000-8000-000000000101";
const YARN_PHOTO_ID = "01990000-0000-7000-8000-000000000102";

function upstream(targetFingerprint = "fnv1a32:60a91f9f") {
  return {
    project: { id: PROJECT_ID, revision: 18 },
    analysis: { id: "garment-analysis:c37bc08a", revision: 5, fingerprint: "fnv1a32:c37bc08a" },
    technologyDecision: { id: "garment-technology-decision:40c92e79", revision: 7, fingerprint: "fnv1a32:27b54bd9" },
    garmentRequirements: { id: "garment-measurement-requirements:8caa5190", revision: 1, fingerprint: "fnv1a32:8caa5190" },
    yarnRequirements: { id: "garment-yarn-requirements:5af5b583", revision: 1, fingerprint: "fnv1a32:0620fe29" },
    yarnRecommendation: { id: "garment-yarn-recommendation:20d1248a", revision: 2, fingerprint: "fnv1a32:2fe4305f" },
    yarnTargetDecision: { id: "garment-yarn-target-decision:06d248ea", revision: 2, fingerprint: targetFingerprint },
  };
}

function targetProfile() {
  return { optionId: "recommended_middle", kind: "recommended_middle", metersPer100g: { min: 160, max: 190, unit: "m_per_100g" } };
}

function context(targetFingerprint = "fnv1a32:60a91f9f") {
  return {
    upstream: upstream(targetFingerprint),
    targetArtifact: { decisionId: "garment-yarn-target-decision:06d248ea", revision: 2, canonicalFingerprint: targetFingerprint, selectedOptionId: "recommended_middle", selectedOptionSnapshot: targetProfile() },
  };
}

function baseState() {
  const artifact = {
    intakeId: INTAKE_ID, revision: 1, status: "draft", routeKind: "manual_knitting", source: { projectId: PROJECT_ID }, garmentRequirementsProfile: null, yarnRequirementsProfile: null,
    targetSizing: { selectedSize: null, bodyMeasurements: [], finishedGarmentMeasurements: [], ease: [], fitPreferences: {} }, constructionInputs: {},
    yarn: intake.normalizeYarn({ selectionStatus: "not_selected" }), needles: { selectionStatus: "not_selected", primaryMm: null, additionalMm: [] },
    gauge: { sourceMeasurement: { stitches: null, widthCm: null, rows: null, heightCm: null, needleSizeMm: null, afterTreatment: "unknown" }, normalizedPer10Cm: null },
    additionalPhotos: [], notes: null, sectionStatus: { targetSizing: false, yarn: false, needles: false, gauge: false, additionalPhotos: false, notes: false }, staleReasons: [], supersededByDecisionId: null, createdAt: T0, updatedAt: T0, fingerprint: "",
  };
  artifact.fingerprint = intake.artifactFingerprint(artifact);
  const state = { contractVersion: intake.CONTRACT_VERSION, schemaVersion: 1, kind: intake.PROGRESS_KIND, projectId: PROJECT_ID, calculationId: CALCULATION_ID, revision: 1, status: "draft", activeIntakeId: INTAKE_ID, intakes: [artifact], audit: [], createdAt: T0, updatedAt: T0, fingerprint: "" };
  state.fingerprint = intake.stateFingerprint(state);
  intake.requireValidState(state);
  return state;
}

function routeState(route = actual.ROUTES.ALREADY_HAVE) { return actual.selectRouteState(baseState(), context(), route, { now: "2026-09-02T08:01:00.000Z" }); }
function candidateState(input, at = "2026-09-02T08:02:00.000Z") { return actual.saveCandidateState(routeState(), context(), input, { now: at }); }
function active(state) { return state.intakes.find((entry) => entry.intakeId === state.activeIntakeId); }

test("normalization uses length / weight × 100", () => {
  assert.equal(actual.metersPer100g(50, 100), 200);
  assert.equal(actual.metersPer100g(50, 85), 170);
  assert.equal(actual.metersPer100g(100, 140), 140);
});

test("a new intake safely starts without a selected route", () => {
  const inspected = actual.inspectFlow(null, context(), baseState().intakes[0]);
  assert.equal(inspected.flow.route, "not_selected");
  assert.equal(inspected.effectiveStatus, "route_not_selected");
});

test("both early routes persist without selecting concrete yarn", () => {
  const help = routeState(actual.ROUTES.HELP_CHOOSE);
  const have = routeState(actual.ROUTES.ALREADY_HAVE);
  assert.equal(active(help).actualYarnFlow.route, "help_choose");
  assert.equal(active(have).actualYarnFlow.route, "already_have");
  assert.equal(active(have).yarn.selectionStatus, "not_selected");
  const targetUpstream = upstream();
  delete targetUpstream.yarnTargetDecision;
  const current = actual.currentContext({ current: { upstream: targetUpstream }, effectiveStatus: "confirmed", artifact: context().targetArtifact }, { project: { project_id: PROJECT_ID, revision: 25 } });
  assert.deepEqual(current.upstream.yarnTargetDecision, upstream().yarnTargetDecision);
  assert.equal(current.targetArtifact.selectedOptionId, "recommended_middle");
});

test("thin, middle, and thick yarn produce directional but not exact claims", () => {
  const cases = [
    [{ skeinWeightGrams: 50, lengthMeters: 100 }, "thinner", "больше петель", "usable_with_differences"],
    [{ skeinWeightGrams: 50, lengthMeters: 85 }, "inside", "не гарантирует", "close_to_target"],
    [{ skeinWeightGrams: 100, lengthMeters: 140 }, "thicker", "меньше петель", "usable_with_differences"],
  ];
  for (const [input, direction, phrase, status] of cases) {
    const candidate = actual.createCandidate(input, { projectId: PROJECT_ID, now: T0 });
    const result = actual.assess(candidate, targetProfile(), { now: T0, targetDecisionId: upstream().yarnTargetDecision.id, targetDecisionRevision: 2, targetDecisionFingerprint: upstream().yarnTargetDecision.fingerprint, targetOptionId: "recommended_middle" });
    assert.equal(result.direction, direction);
    assert.equal(result.status, status);
    assert.match(result.likelyChanges.join(" "), new RegExp(phrase));
    assert.doesNotMatch(result.likelyChanges.join(" "), /\b\d+[,.]?\d*\s+петель\b/);
  }
});

test("strong halo warns that texture may be hidden", () => {
  const candidate = actual.createCandidate({ skeinWeightGrams: 50, lengthMeters: 85, surface: "strong_halo" }, { projectId: PROJECT_ID, now: T0 });
  const result = actual.assess(candidate, targetProfile(), { now: T0, targetDecisionId: upstream().yarnTargetDecision.id, targetDecisionRevision: 2, targetDecisionFingerprint: upstream().yarnTargetDecision.fingerprint, targetOptionId: "recommended_middle" });
  assert.equal(result.status, "noticeable_difference_risk");
  assert.match(result.likelyChanges.join(" "), /скрыть мелкую фактуру/);
});

test("missing weight or length yields only insufficient-data facts", () => {
  for (const input of [{ lengthMeters: 100 }, { skeinWeightGrams: 50 }]) {
    const candidate = actual.createCandidate(input, { projectId: PROJECT_ID, now: T0 });
    const result = actual.assess(candidate, targetProfile(), { now: T0, targetDecisionId: upstream().yarnTargetDecision.id, targetDecisionRevision: 2, targetDecisionFingerprint: upstream().yarnTargetDecision.fingerprint, targetOptionId: "recommended_middle" });
    assert.equal(result.status, "insufficient_data");
    assert.equal(result.likelyChanges.length, 0);
    assert.equal(result.missingFacts.length, 1);
  }
});

test("candidate save is idempotent and does not select yarn", () => {
  const first = candidateState({ skeinWeightGrams: 50, lengthMeters: 100, availableSkeins: 3 });
  const second = actual.saveCandidateState(first, context(), { skeinWeightGrams: 50, lengthMeters: 100, availableSkeins: 3 }, { now: "2026-09-02T08:03:00.000Z" });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(active(first).yarn.selectionStatus, "not_selected");
});

test("assessment and confirmation are separate and repeat confirmation is idempotent", () => {
  let state = candidateState({ skeinWeightGrams: 50, lengthMeters: 100, availableSkeins: 3 });
  state = actual.assessState(state, context(), { now: "2026-09-02T08:03:00.000Z" });
  assert.equal(active(state).yarn.selectionStatus, "not_selected");
  assert.throws(() => actual.confirmState(state, context(), { now: "2026-09-02T08:04:00.000Z" }), { code: "ACTUAL_YARN_DIFFERENCES_NOT_ACCEPTED" });
  const confirmed = actual.confirmState(state, context(), { now: "2026-09-02T08:04:00.000Z", acceptDifferences: true });
  assert.equal(active(confirmed).yarn.selectionStatus, "selected");
  assert.equal(active(confirmed).gauge.normalizedPer10Cm, null);
  const repeated = actual.confirmState(confirmed, context(), { now: "2026-09-02T08:05:00.000Z", acceptDifferences: true });
  assert.equal(repeated.fingerprint, confirmed.fingerprint);
});

test("changing candidate invalidates assessment and prior confirmation", () => {
  let state = candidateState({ skeinWeightGrams: 50, lengthMeters: 100, availableSkeins: 3 });
  state = actual.assessState(state, context(), { now: "2026-09-02T08:03:00.000Z" });
  state = actual.confirmState(state, context(), { now: "2026-09-02T08:04:00.000Z", acceptDifferences: true });
  const changed = actual.saveCandidateState(state, context(), { skeinWeightGrams: 50, lengthMeters: 85, availableSkeins: 3 }, { now: "2026-09-02T08:06:00.000Z" });
  assert.equal(active(changed).actualYarnFlow.assessment, null);
  assert.equal(active(changed).actualYarnFlow.confirmedActualYarn, null);
  assert.equal(active(changed).actualYarnFlow.confirmationHistory.length, 1);
  assert.equal(active(changed).yarn.selectionStatus, "not_selected");
});

test("removing one yarn photo preserves the other and invalidates evidence", () => {
  const photo = (photoId, displayName) => ({
    photo_id: photoId,
    display_name: displayName,
    sha256: "a".repeat(64),
    source_mime: "image/png",
    purpose: intake.PHOTO_PURPOSE,
  });
  let state = routeState();
  state = intake.attachPhoto(state, photo(LABEL_PHOTO_ID, "label.png"), "yarn_label", { now: "2026-09-02T08:01:10.000Z" });
  state = intake.attachPhoto(state, photo(YARN_PHOTO_ID, "yarn.png"), "yarn_appearance", { now: "2026-09-02T08:01:20.000Z" });
  state = actual.saveCandidateState(state, context(), { skeinWeightGrams: 50, lengthMeters: 85, availableSkeins: 3 }, { now: "2026-09-02T08:02:00.000Z" });
  state = actual.assessState(state, context(), { now: "2026-09-02T08:03:00.000Z" });
  state = actual.confirmState(state, context(), { now: "2026-09-02T08:04:00.000Z" });

  const removed = actual.removePhotoState(state, context(), LABEL_PHOTO_ID, { now: "2026-09-02T08:05:00.000Z" });
  const artifact = active(removed);
  assert.deepEqual(artifact.additionalPhotos.map((entry) => entry.photoId), [YARN_PHOTO_ID]);
  assert.deepEqual(artifact.actualYarnFlow.candidate.data.photoRefs.map((entry) => entry.photoId), [YARN_PHOTO_ID]);
  assert.equal(artifact.actualYarnFlow.candidate.revision, 2);
  assert.equal(artifact.actualYarnFlow.assessment, null);
  assert.equal(artifact.actualYarnFlow.confirmedActualYarn, null);
  assert.equal(artifact.actualYarnFlow.assessmentHistory.at(-1).reason, "photo_removed");
  assert.equal(artifact.actualYarnFlow.confirmationHistory.at(-1).reason, "photo_removed");
  assert.equal(artifact.yarn.selectionStatus, "not_selected");
  assert.equal(removed.audit.at(-1).event, "actual_yarn_photo_removed");
  assert.throws(() => actual.removePhotoState(removed, context(), LABEL_PHOTO_ID), { code: "ACTUAL_YARN_PHOTO_NOT_FOUND" });
});

test("changed target identity makes saved evidence stale", () => {
  let state = candidateState({ skeinWeightGrams: 50, lengthMeters: 85, availableSkeins: 3 });
  state = actual.assessState(state, context(), { now: "2026-09-02T08:03:00.000Z" });
  const artifact = active(state);
  const changed = context("fnv1a32:aaaaaaaa");
  const inspected = actual.inspectFlow(artifact.actualYarnFlow, changed, artifact);
  assert.equal(inspected.current, false);
  assert.equal(inspected.effectiveStatus, "stale");
  assert.equal(inspected.errorCode, "ACTUAL_YARN_UPSTREAM_CHANGED");
  const changedRecommendation = context();
  changedRecommendation.upstream.yarnRecommendation.fingerprint = "fnv1a32:bbbbbbbb";
  assert.equal(actual.inspectFlow(artifact.actualYarnFlow, changedRecommendation, artifact).effectiveStatus, "stale");
});

test("confirmation keeps immutable candidate, assessment, target, and full upstream snapshots", () => {
  let state = candidateState({ skeinWeightGrams: 50, lengthMeters: 85, availableSkeins: 3, surface: "smooth" });
  state = actual.assessState(state, context(), { now: "2026-09-02T08:03:00.000Z" });
  state = actual.confirmState(state, context(), { now: "2026-09-02T08:04:00.000Z" });
  const snapshot = active(state).actualYarnFlow.confirmedActualYarn;
  actual.requireValidConfirmed(snapshot);
  assert.equal(snapshot.targetProfileSnapshot.metersPer100g.min, 160);
  assert.deepEqual(Object.keys(snapshot.upstream), ["project", "analysis", "technologyDecision", "garmentRequirements", "yarnRequirements", "yarnRecommendation", "yarnTargetDecision"]);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(active(state).gauge.normalizedPer10Cm, null);
  const restoredState = JSON.parse(JSON.stringify(state));
  intake.requireValidState(restoredState);
  const restoredArtifact = active(restoredState);
  const restored = actual.inspectFlow(restoredArtifact.actualYarnFlow, context(), restoredArtifact);
  assert.equal(restored.effectiveStatus, "confirmed");
  assert.equal(restored.flow.confirmedActualYarn.canonicalFingerprint, snapshot.canonicalFingerprint);
});
