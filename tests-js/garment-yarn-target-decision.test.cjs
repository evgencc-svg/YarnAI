"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const recommendationApi = require("../src/yarnai/static/garment-yarn-recommendation.js");
const api = require("../src/yarnai/static/garment-yarn-target-decision.js");

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function payload() {
  const value = JSON.parse(fs.readFileSync(path.join(__dirname, "../tests/fixtures/garment_yarn_recommendation_valid.json"), "utf8"));
  value.provenance = { method: "provider_supplement", provider: "openai", model: "gpt-5.6-terra", requestId: "yarn-supplement:test" };
  return value;
}
function bindings() {
  return {
    project: { id: "project:test" }, photo: { id: "photo:test", sha256: "a".repeat(64) },
    analysis: { id: "analysis:test", revision: 5, fingerprint: "fnv1a32:c37bc08a" },
    request: { id: "request:test", fingerprint: "fnv1a32:1f4f7bc7" },
    technologyDecision: { id: "decision:test", revision: 7, fingerprint: "fnv1a32:27b54bd9", selectedOptionId: "tech_02" },
    garmentRequirements: { fingerprint: "fnv1a32:8caa5190", constructionIdentity: "seamed_set_in_sleeve" },
    yarnRequirements: { id: "garment-yarn-requirements:5af5b583", fingerprint: "fnv1a32:0620fe29" },
  };
}
function recommendation() { return recommendationApi.createArtifact(bindings(), payload(), { now: "2026-09-02T10:00:00Z" }); }
function current(projectRevision = 10, artifact = recommendation()) {
  return {
    recommendation: artifact,
    upstream: {
      project: { id: "project:test", revision: projectRevision },
      analysis: { id: "analysis:test", revision: 5, fingerprint: "fnv1a32:c37bc08a" },
      technologyDecision: { id: "decision:test", revision: 7, fingerprint: "fnv1a32:27b54bd9" },
      garmentRequirements: { id: "garment-measurement-requirements:8caa5190", revision: 1, fingerprint: "fnv1a32:8caa5190" },
      yarnRequirements: { id: "garment-yarn-requirements:5af5b583", revision: 1, fingerprint: "fnv1a32:0620fe29" },
      yarnRecommendation: { id: artifact.recommendationId, revision: artifact.revision, fingerprint: artifact.canonicalFingerprint },
    },
  };
}

test("saved recommendation deterministically identifies exactly one closest option", () => {
  const resolved = api.resolveClosestOption(recommendation());
  assert.equal(resolved.optionId, "recommended_middle");
  assert.match(resolved.selectionReason, /ближе всего/iu);
});

test("ambiguous or missing closest semantics fail closed", () => {
  const ambiguous = payload();
  ambiguous.thinnerAlternative.referenceSimilarity = "Максимально близкий к фотографии вариант.";
  assert.throws(() => api.resolveClosestOption(recommendationApi.createArtifact(bindings(), ambiguous)), { code: "MOST_SIMILAR_OPTION_AMBIGUOUS" });
  const missing = payload();
  missing.recommendedMiddle.referenceSimilarity = "Сопоставимый масштаб фактуры.";
  assert.throws(() => api.resolveClosestOption(recommendationApi.createArtifact(bindings(), missing)), { code: "MOST_SIMILAR_OPTION_AMBIGUOUS" });
});

test("each of the three saved option IDs can be selected under an explicit owner choice", () => {
  for (const optionId of ["thinner", "recommended_middle", "thicker"]) {
    const selected = api.createSelection(current(), optionId, { ownerIntent: api.OWNER_INTENTS.OWNER_SELECTED_TARGET, now: "2026-09-02T11:00:00Z" });
    assert.equal(selected.selectedOptionId, optionId);
    assert.equal(selected.selectedOptionSnapshot.kind, optionId);
  }
});

test("maximum photo similarity intent permits only the recommendation's closest option", () => {
  assert.throws(() => api.createSelection(current(), "thinner", { ownerIntent: api.OWNER_INTENTS.MAXIMUM_PHOTO_SIMILARITY }), { code: "TARGET_OPTION_CONFLICTS_WITH_OWNER_INTENT" });
  assert.equal(api.createSelection(current(), "recommended_middle").status, "ready_to_confirm");
});

test("unknown option IDs are rejected", () => {
  assert.throws(() => api.createSelection(current(), "unknown-option"), { code: "UNKNOWN_TARGET_OPTION" });
});

test("selection and confirmation are separate revisions", () => {
  const selected = api.createSelection(current(), "recommended_middle", { now: "2026-09-02T11:00:00Z" });
  assert.equal(selected.status, "ready_to_confirm");
  assert.equal(selected.confirmedAt, null);
  const confirmed = api.confirm(selected, current(), { now: "2026-09-02T11:01:00Z" });
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.revision, 2);
  assert.equal(confirmed.confirmedAt, "2026-09-02T11:01:00Z");
});

test("confirmed selected option snapshot is immutable and detached", () => {
  const selected = api.createSelection(current(), "recommended_middle");
  const snapshot = clone(selected.selectedOptionSnapshot);
  const confirmed = api.confirm(selected, current());
  assert.deepEqual(confirmed.selectedOptionSnapshot, snapshot);
  assert.equal(Object.isFrozen(confirmed.selectedOptionSnapshot), true);
  assert.throws(() => api.reselection(confirmed, current(), "thicker"), { code: "CONFIRMED_TARGET_IMMUTABLE" });
});

test("repeat confirmation is idempotent and creates no new revision", () => {
  const selected = api.createSelection(current(), "recommended_middle");
  const confirmed = api.confirm(selected, current(), { now: "2026-09-02T11:01:00Z" });
  assert.equal(api.confirm(confirmed, current(), { now: "2026-09-02T11:02:00Z" }), confirmed);
});

test("recommendation revision or fingerprint change makes the old decision stale", () => {
  const confirmed = api.confirm(api.createSelection(current(), "recommended_middle"), current());
  const changedRevision = current(); changedRevision.upstream.yarnRecommendation.revision += 1;
  assert.equal(api.inspectArtifact(confirmed, changedRevision).effectiveStatus, "stale");
  const changedFingerprint = current(); changedFingerprint.upstream.yarnRecommendation.fingerprint = "fnv1a32:aaaaaaaa";
  assert.equal(api.inspectArtifact(confirmed, changedFingerprint).effectiveStatus, "stale");
});

test("downstream project revisions do not stale an unchanged confirmed target", () => {
  const confirmed = api.confirm(api.createSelection(current(), "recommended_middle", { now: "2026-09-02T08:00:00Z" }), current(), { now: "2026-09-02T08:01:00Z" });
  const downstream = current(999);
  assert.equal(api.inspectArtifact(confirmed, downstream).effectiveStatus, "confirmed");
  assert.equal(api.inspectArtifact(confirmed, downstream).current, true);
});

test("JSON round-trip restores the same confirmed decision and fingerprint", () => {
  const confirmed = api.confirm(api.createSelection(current(), "recommended_middle"), current());
  const restored = JSON.parse(JSON.stringify(confirmed));
  assert.equal(api.requireValidArtifact(restored), true);
  assert.equal(api.inspectArtifact(restored, current()).effectiveStatus, "confirmed");
  assert.equal(restored.canonicalFingerprint, confirmed.canonicalFingerprint);
});

test("unknown row gauge stays null and is never invented in the immutable snapshot", () => {
  const source = payload();
  source.recommendedMiddle.targetRowsPer10cm = null;
  source.recommendedMiddle.rowGaugeUncertainty = "Ряды неизвестны до фактического образца.";
  const artifact = recommendationApi.createArtifact(bindings(), source);
  const selected = api.createSelection(current(10, artifact), "recommended_middle");
  assert.equal(selected.selectedOptionSnapshot.targetRowsPer10cm, null);
  assert.equal(selected.selectedOptionSnapshot.rowGaugeUncertainty, "Ряды неизвестны до фактического образца.");
});

test("fingerprint tampering fails without changing the source recommendation", () => {
  const source = recommendation(); const before = JSON.stringify(source);
  const selected = clone(api.createSelection(current(10, source), "recommended_middle"));
  selected.selectedOptionSnapshot.initialNeedlesMm.min = 99;
  assert.throws(() => api.requireValidArtifact(selected), { code: "TARGET_DECISION_FINGERPRINT_MISMATCH" });
  assert.equal(JSON.stringify(source), before);
});

test("repository flow restores one progress record and repeat confirmation adds no duplicate", async () => {
  const artifact = recommendation();
  global.YarnAIGarmentReferenceAnalysis = Object.freeze({
    PROGRESS_KIND: "GARMENT_REFERENCE_ANALYSIS",
    technologyDecisionHandoff() { return { isCurrent: true, allowedToStartTechnologyPlan: true, analysisId: "analysis:test", analysisRevision: 5, sourceAnalysisFingerprint: "fnv1a32:c37bc08a", analysisRequestId: "request:test", sourceRequestFingerprint: "fnv1a32:1f4f7bc7", technologyDecisionId: "decision:test", technologyDecisionRevision: 7, technologyDecisionFingerprint: "fnv1a32:27b54bd9", selectedOptionId: "tech_02" }; },
  });
  global.YarnAIManualCalculationIntake = Object.freeze({ PROGRESS_KIND: "MANUAL_CALCULATION_INTAKE", requireValidState() { return true; } });
  const shared = {
    project: { project_id: "project:test", active_calculation_id: "calc:test", revision: 10 },
    calculations: [{ calculation_id: "calc:test", request: { workflow_kind: "garment_reference" } }],
    progress: [
      { kind: "GARMENT_REFERENCE_ANALYSIS", calculation_id: "calc:test", epoch: 1, state: { source: { referencePhotos: [{ photoId: "photo:test", sha256: "a".repeat(64) }] } } },
      { kind: "MANUAL_CALCULATION_INTAKE", calculation_id: "calc:test", epoch: 1, state: { activeIntakeId: "intake:test", intakes: [{ intakeId: "intake:test", garmentRequirementsProfile: { schemaVersion: 1, canonicalFingerprint: "fnv1a32:8caa5190", constructionIdentity: "seamed_set_in_sleeve" }, yarnRequirementsProfile: { schemaVersion: 1, profileId: "garment-yarn-requirements:5af5b583", canonicalFingerprint: "fnv1a32:0620fe29" } }] } },
      { kind: recommendationApi.PROGRESS_KIND, calculation_id: "calc:test", epoch: 1, revision: 1, state: artifact },
    ],
    operations: [], photos: [],
  };
  class Repository {
    async getProject() { return clone(shared); }
    async ensureCalculationProgress(_projectId, calculationId, kind, state, options) { shared.progress.push({ kind, calculation_id: calculationId, epoch: 1, revision: 1, state: clone(state) }); shared.project.revision += 1; shared.operations.push({ kind: options.operationKind }); }
    async updateCalculationProgress(_projectId, _calculationId, kind, state, options) { const record = shared.progress.find((entry) => entry.kind === kind); record.revision += 1; record.state = clone(state); shared.project.revision += 1; shared.operations.push({ kind: options.operationKind }); }
  }
  const repository = new Repository();
  const ready = await api.inspectForProject(repository, "project:test");
  assert.equal(ready.effectiveStatus, "ready_to_choose");
  const selected = await api.selectForProject(repository, "project:test", "recommended_middle", { now: "2026-09-02T11:00:00Z" });
  assert.equal(selected.effectiveStatus, "ready_to_confirm");
  const confirmed = await api.confirmForProject(repository, "project:test", { now: "2026-09-02T11:01:00Z" });
  const repeated = await api.confirmForProject(repository, "project:test", { now: "2026-09-02T11:02:00Z" });
  assert.equal(repeated.artifact.canonicalFingerprint, confirmed.artifact.canonicalFingerprint);
  assert.equal(shared.progress.filter((entry) => entry.kind === api.PROGRESS_KIND).length, 1);
  assert.equal(shared.operations.filter((entry) => entry.kind === "GARMENT_YARN_TARGET_DECISION_CONFIRMED").length, 1);
  assert.equal(shared.operations.some((entry) => /STAGE|CALCUL|PROVIDER|ANALYSIS_POST/.test(entry.kind)), false);
});
