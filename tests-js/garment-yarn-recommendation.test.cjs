"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const api = require("../src/yarnai/static/garment-yarn-recommendation.js");

function range(min, max, unit) { return { min, max, unit }; }
function variant(kind, meters, stitches, rows, needles, surface = "smooth") {
  return {
    kind, metersPer100g: range(...meters, "m_per_100g"), categoryRu: "средняя толщина",
    targetStitchesPer10cm: range(...stitches, "stitches_per_10cm"),
    targetRowsPer10cm: rows ? range(...rows, "rows_per_10cm") : null,
    rowGaugeUncertainty: rows ? null : "Ряды зависят от пряжи и обработки; уточнить по образцу.",
    initialNeedlesMm: range(...needles, "mm"), strandCount: 1, surface,
    textureEffect: "Вертикальные дорожки остаются читаемыми.", drapeStructure: "Полотно пластичное, но держит форму.",
    garmentWeightVolume: "Изделие средней массы и объёма.", trimBehavior: "Воротник, планка и резинка сохраняют форму.",
    referenceSimilarity: "Даёт близкий к фотографии масштаб фактуры.", risk: "Другой состав может изменить объём.", confidence: "medium",
    basis: ["Это адаптация под ручное вязание выбранной конструкции."],
  };
}
function payload() {
  const value = JSON.parse(fs.readFileSync(path.join(__dirname, "../tests/fixtures/garment_yarn_recommendation_valid.json"), "utf8"));
  value.provenance = { method: "provider_supplement", provider: "openai", model: "gpt-5.6-terra", requestId: "yarn-supplement:test" };
  return value;
}
function bindings() { return { project: { id: "p" }, photo: { id: "photo", sha256: "a".repeat(64) }, analysis: { id: "analysis", revision: 5, fingerprint: "fnv1a32:c37bc08a" }, request: { id: "request", fingerprint: "fnv1a32:1f4f7bc7" }, technologyDecision: { id: "decision:test", revision: 7, fingerprint: "fnv1a32:27b54bd9", selectedOptionId: "pilot-option:set-in" }, garmentRequirements: { fingerprint: "fnv1a32:8caa5190", constructionIdentity: "seamed_set_in_sleeve" }, yarnRequirements: { id: "yarn-req", fingerprint: "fnv1a32:0620fe29" } }; }
function legacyArtifact(sourceBindings = bindings()) {
  const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, "../tests/fixtures/garment_yarn_recommendation_recorded_bad.json"), "utf8"));
  recorded.provenance = { method: "provider_supplement", provider: "openai", model: "gpt-5.6-terra", requestId: "yarn-supplement:legacy" };
  const core = { contractName: api.CONTRACT_VERSION, recommendationId: "garment-yarn-recommendation:20d1248a", revision: 1, status: recorded.status, createdAt: "2026-09-02T12:55:00Z", updatedAt: "2026-09-02T12:55:00Z", sourceBindings, summary: recorded.summary, visualEvidence: recorded.visualEvidence, limitations: recorded.limitations, recommendedMiddle: recorded.recommendedMiddle, thinnerAlternative: recorded.thinnerAlternative, thickerAlternative: recorded.thickerAlternative, surfaceRecommendation: recorded.surfaceRecommendation, swatchRequirement: recorded.swatchRequirement, confidence: recorded.confidence, provenance: recorded.provenance };
  return { ...core, canonicalFingerprint: api.fingerprint(core), integrityStatus: "valid" };
}

test("valid recommendation has exactly three comparable variants and separate evidence", () => {
  const artifact = api.createArtifact(bindings(), payload(), { now: "2026-09-02T10:00:00Z" });
  assert.equal(api.requireValidArtifact(artifact), true);
  assert.deepEqual([artifact.thinnerAlternative.kind, artifact.recommendedMiddle.kind, artifact.thickerAlternative.kind], api.VARIANT_KINDS);
  assert.notDeepEqual(artifact.visualEvidence, artifact.recommendedMiddle);
  assert.equal(artifact.semanticContract.contractName, "GARMENT_YARN_SEMANTIC_V1");
});

test("five limitation codes and four surface levels remain structured in the authoritative artifact", () => {
  const artifact = api.createArtifact(bindings(), payload());
  assert.deepEqual(artifact.semanticContract.limitations.map((entry) => entry.code), ["exact_fiber_composition_unknown", "exact_brand_article_unknown", "original_yarn_linear_density_unknown", "actual_original_gauge_unknown", "post_wash_behavior_unknown"]);
  assert.deepEqual(artifact.semanticContract.surfaceEffects.map((entry) => entry.level), ["smooth", "slight_halo", "medium_halo", "strong_halo"]);
  assert.notEqual(artifact.surfaceRecommendation.mediumHalo, artifact.surfaceRecommendation.strongHalo);
});

test("owner-selected construction must match bindings and is never stored as visual fabric text", () => {
  const artifact = api.createArtifact(bindings(), payload());
  assert.equal(artifact.semanticContract.manufacturingChoice.provenance, "selected");
  assert.equal(artifact.visualEvidence.fabricBehavior, "предположительно пластичное полотно");
  assert.equal(JSON.stringify(artifact.visualEvidence).includes("seamed_set_in_sleeve"), false);
  const changed = bindings(); changed.technologyDecision.fingerprint = "fnv1a32:aaaaaaaa";
  assert.throws(() => api.createArtifact(changed, payload()), { code: "SELECTED_TECHNOLOGY_BINDING_MISMATCH" });
});

test("historical revision-one artifact remains readable without semantic backfill", () => {
  const artifact = legacyArtifact();
  assert.equal(api.requireValidArtifact(artifact), true);
  assert.equal(artifact.recommendationId, "garment-yarn-recommendation:20d1248a");
  assert.equal(Object.hasOwn(artifact, "semanticContract"), false);
});

test("retry controls distinguish absent valid legacy-invalid stale consumed and unreadable states", () => {
  const ready = { enabled: true, pilotReady: true, requestId: "yarn-supplement:retry", authorizationMatches: true };
  assert.deepEqual(api.retryControlState({ progress: null, artifact: null }, ready, true), { available: true, mode: "initial", reasonCode: "NO_RECOMMENDATION" });

  const current = api.inspectArtifact(api.createArtifact(bindings(), payload()), bindings());
  assert.equal(current.currentValidation.semanticValid, true);
  assert.deepEqual(api.retryControlState(current, ready, true), { available: false, mode: "blocked", reasonCode: "CURRENT_RECOMMENDATION_VALID" });

  const legacy = api.inspectArtifact(legacyArtifact(), bindings());
  assert.deepEqual(legacy.currentValidation, { schemaDomainValid: true, semanticValid: false, bindingValid: true, reasonCode: "RECOMMENDATION_SEMANTIC_CONTRACT_MISSING" });
  assert.deepEqual(api.retryControlState(legacy, ready, true), { available: true, mode: "legacy_retry", reasonCode: "LEGACY_RECOMMENDATION_SEMANTIC_INVALID" });
  assert.deepEqual(api.retryControlState(legacy, { ...ready, pilotReady: false }, true), { available: false, mode: "blocked", reasonCode: "AUTHORIZATION_NOT_APPROVED_OR_CONSUMED" });
  assert.deepEqual(api.retryControlState(legacy, ready, false), { available: false, mode: "blocked", reasonCode: "PHOTO_OR_SANITIZED_PNG_UNAVAILABLE" });

  const changed = bindings(); changed.analysis.fingerprint = "fnv1a32:aaaaaaaa";
  const stale = api.inspectArtifact(legacyArtifact(), changed);
  assert.deepEqual(api.retryControlState(stale, ready, true), { available: false, mode: "blocked", reasonCode: "RECOMMENDATION_BINDING_MISMATCH" });

  const semanticBindingMismatch = structuredClone(api.createArtifact(bindings(), payload()));
  semanticBindingMismatch.semanticContract.manufacturingChoice.decisionFingerprint = "fnv1a32:bbbbbbbb";
  const mismatchCore = structuredClone(semanticBindingMismatch); delete mismatchCore.canonicalFingerprint; delete mismatchCore.integrityStatus;
  semanticBindingMismatch.canonicalFingerprint = api.fingerprint(mismatchCore);
  const mismatchInspected = api.inspectArtifact(semanticBindingMismatch, bindings());
  assert.equal(mismatchInspected.currentValidation.bindingValid, false);
  assert.deepEqual(api.retryControlState(mismatchInspected, ready, true), { available: false, mode: "blocked", reasonCode: "SELECTED_TECHNOLOGY_BINDING_MISMATCH" });

  const corrupt = structuredClone(legacyArtifact()); corrupt.summary += " повреждено";
  const unreadable = { progress: { revision: 1 }, ...api.inspectArtifact(corrupt, bindings()) };
  assert.equal(unreadable.currentValidation.schemaDomainValid, false);
  assert.equal(api.retryControlState(unreadable, ready, true).available, false);
});

test("authorization binding must exactly match the locally prepared request before controls can appear", () => {
  const bytes = Buffer.from("sanitized-png");
  const request = {
    request_id: "yarn-supplement:retry",
    source_identity: { project_id: "p", project_revision: 7, reference_photos: [{ photo_id: "photo", sha256: "a".repeat(64) }], request_fingerprint: "fnv1a32:ignored" },
    source_photo_id: "photo", source_photo_sha256: "a".repeat(64),
    sanitized_image: { content_base64: bytes.toString("base64"), sha256: "b".repeat(64), width: 2, height: 1 },
  };
  const binding = { request_id: request.request_id, source_identity: { project_id: "p", project_revision: 7, reference_photos: [{ photo_id: "photo", sha256: "a".repeat(64) }] }, source_photo_id: "photo", source_photo_sha256: "a".repeat(64), sanitized_photo_sha256: "b".repeat(64), sanitized_width: 2, sanitized_height: 1, sanitized_byte_size: bytes.length };
  assert.equal(api.authorizationMatchesPreparedRequest(binding, request), true);
  for (const mutate of [
    (value) => { value.source_identity.project_revision = 8; },
    (value) => { value.source_photo_sha256 = "c".repeat(64); },
    (value) => { value.sanitized_photo_sha256 = "d".repeat(64); },
    (value) => { value.sanitized_byte_size += 1; },
  ]) {
    const changed = structuredClone(binding); mutate(changed);
    assert.equal(api.authorizationMatchesPreparedRequest(changed, request), false);
  }
  const legacy = api.inspectArtifact(legacyArtifact(), bindings());
  assert.deepEqual(api.retryControlState(legacy, { enabled: true, pilotReady: true, requestId: request.request_id, authorizationMatches: false }, true), { available: false, mode: "blocked", reasonCode: "AUTHORIZATION_BINDING_MISMATCH" });
});

test("exact-brand fields and false exact-recognition language are rejected", () => {
  const extra = payload(); extra.exactBrand = "Example";
  assert.throws(() => api.createArtifact(bindings(), extra), { code: "RECOMMENDATION_SCHEMA_INVALID" });
  const claim = payload(); claim.summary = "Точная марка пряжи распознана.";
  assert.throws(() => api.createArtifact(bindings(), claim), { code: "FALSE_EXACT_YARN_CLAIM" });
});

test("target ranges stay recommendations and do not contain manual yarn or actual gauge fields", () => {
  const artifact = api.createArtifact(bindings(), payload()); const serialized = JSON.stringify(artifact);
  for (const forbidden of ["yarn.name", "selectionStatus", "actualGauge", "gaugeStitches"]) assert.equal(serialized.includes(forbidden), false);
  assert.equal(artifact.swatchRequirement.targetIsNotActualGauge, true);
});

test("meters, stitches, rows, and needles keep distinct units", () => {
  const middle = api.createArtifact(bindings(), payload()).recommendedMiddle;
  assert.deepEqual([middle.metersPer100g.unit, middle.targetStitchesPer10cm.unit, middle.targetRowsPer10cm.unit, middle.initialNeedlesMm.unit], ["m_per_100g", "stitches_per_10cm", "rows_per_10cm", "mm"]);
  assert.deepEqual(api.metersPer50g(middle.metersPer100g), { min: 110, max: 140, unit: "m_per_50g" });
});

test("empty reversed non-finite zero and negative ranges fail closed", () => {
  for (const bad of [[4, 3], [0, 3], [-1, 3], [NaN, 3], [Infinity, Infinity]]) {
    const value = payload(); value.recommendedMiddle.initialNeedlesMm = range(...bad, "mm");
    assert.throws(() => api.createArtifact(bindings(), value), { code: "RECOMMENDATION_RANGE_INVALID" });
  }
});

test("optional row gauge needs an explicit uncertainty explanation", () => {
  assert.equal(api.createArtifact(bindings(), payload()).thickerAlternative.targetRowsPer10cm, null);
  const bad = payload(); bad.thickerAlternative.rowGaugeUncertainty = "";
  assert.throws(() => api.createArtifact(bindings(), bad), { code: "ROW_GAUGE_UNCERTAINTY_INVALID" });
});

test("surface guidance covers Russian halo and brushing meaning", () => {
  const artifact = api.createArtifact(bindings(), payload()); const text = JSON.stringify(artifact.surfaceRecommendation);
  assert.match(text, /слабый ворс/i); assert.match(text, /начёс/); assert.match(text, /вертикальн/); assert.match(text, /образц/);
});

test("strong halo is rejected as a variant unless texture impact is described", () => {
  const bad = payload(); bad.recommendedMiddle.surface = "strong_halo_or_brushed"; bad.recommendedMiddle.textureEffect = "Красиво.";
  assert.throws(() => api.createArtifact(bindings(), bad), { code: "SURFACE_EFFECT_MISSING" });
});

test("weak-photo path allows partial or needs_closeup without numeric corruption", () => {
  for (const status of ["partial", "needs_closeup"]) { const value = payload(); value.status = status; assert.equal(api.createArtifact(bindings(), value).status, status); }
});

test("binding changes make a valid saved recommendation stale", () => {
  const artifact = api.createArtifact(bindings(), payload()); const changedDecision = bindings(); changedDecision.technologyDecision.fingerprint = "fnv1a32:aaaaaaaa";
  assert.equal(api.inspectArtifact(artifact, changedDecision).effectiveStatus, "stale");
  const changedPhoto = bindings(); changedPhoto.photo.sha256 = "b".repeat(64);
  assert.equal(api.inspectArtifact(artifact, changedPhoto).effectiveStatus, "stale");
});

test("fingerprint tampering is detected", () => {
  const artifact = JSON.parse(JSON.stringify(api.createArtifact(bindings(), payload()))); artifact.recommendedMiddle.metersPer100g.min += 1;
  assert.equal(api.inspectArtifact(artifact, bindings()).errorCode, "RECOMMENDATION_FINGERPRINT_MISMATCH");
});

test("saved snapshot is deeply immutable and detached from caller objects", () => {
  const input = payload(); const artifact = api.createArtifact(bindings(), input); input.recommendedMiddle.metersPer100g.min = 1;
  assert.equal(artifact.recommendedMiddle.metersPer100g.min, 220); assert.equal(Object.isFrozen(artifact.recommendedMiddle.metersPer100g), true);
});

test("same canonical payload and timestamp produce stable ID and fingerprint", () => {
  const one = api.createArtifact(bindings(), payload(), { now: "2026-09-02T10:00:00Z" }); const two = api.createArtifact(bindings(), payload(), { now: "2026-09-02T10:00:00Z" });
  assert.equal(one.recommendationId, two.recommendationId); assert.equal(one.canonicalFingerprint, two.canonicalFingerprint);
});

test("thinner-middle-thicker meterage order is enforced", () => {
  const bad = payload(); bad.thinnerAlternative.metersPer100g = range(180, 200, "m_per_100g");
  assert.throws(() => api.createArtifact(bindings(), bad), { code: "YARN_THICKNESS_ORDER_INVALID" });
});

test("unknown keys in variants are rejected", () => {
  const bad = payload(); bad.recommendedMiddle.brand = "Example";
  assert.throws(() => api.createArtifact(bindings(), bad), { code: "RECOMMENDATION_SCHEMA_INVALID" });
});

test("numeric strings and booleans are not silently normalized", () => {
  for (const value of ["220", true]) {
    const bad = payload(); bad.recommendedMiddle.metersPer100g.min = value;
    assert.throws(() => api.createArtifact(bindings(), bad), { code: "RECOMMENDATION_RANGE_INVALID" });
  }
  const strand = payload(); strand.recommendedMiddle.strandCount = "1";
  assert.throws(() => api.createArtifact(bindings(), strand), { code: "RECOMMENDATION_RANGE_INVALID" });
});

test("shared array limits match the provider contract", () => {
  const limitations = payload(); limitations.limitations = Array.from({ length: 9 }, (_, index) => `Ограничение ${index}.`);
  assert.throws(() => api.createArtifact(bindings(), limitations), { code: "REQUIRED_LIMITATION_MISSING" });
  const basis = payload(); basis.recommendedMiddle.basis = Array.from({ length: 7 }, (_, index) => `Основание ${index}.`);
  assert.throws(() => api.createArtifact(bindings(), basis), { code: "RECOMMENDATION_SCHEMA_INVALID" });
});

test("isolated save and reopen preserve identity bindings and manual blockers without autofill", async () => {
  const calculationId = "calculation:test";
  globalThis.YarnAIGarmentReferenceAnalysis = {
    PROGRESS_KIND: "GARMENT_REFERENCE_ANALYSIS",
    technologyDecisionHandoff() {
      return { isCurrent: true, allowedToStartTechnologyPlan: true, analysisId: "analysis", analysisRevision: 5, sourceAnalysisFingerprint: "fnv1a32:c37bc08a", analysisRequestId: "request", sourceRequestFingerprint: "fnv1a32:1f4f7bc7", technologyDecisionId: "decision:test", technologyDecisionRevision: 7, technologyDecisionFingerprint: "fnv1a32:27b54bd9", selectedOptionId: "pilot-option:set-in" };
    },
  };
  globalThis.YarnAIManualCalculationIntake = { PROGRESS_KIND: "MANUAL_CALCULATION_INTAKE", requireValidState() { return true; } };
  const shared = {
    project: { project_id: "p", active_calculation_id: calculationId },
    calculations: [{ calculation_id: calculationId, request: { workflow_kind: "garment_reference" } }],
    progress: [
      { kind: "GARMENT_REFERENCE_ANALYSIS", calculation_id: calculationId, epoch: 1, state: { source: { referencePhotos: [{ photoId: "photo", sha256: "a".repeat(64) }] } } },
      { kind: "MANUAL_CALCULATION_INTAKE", calculation_id: calculationId, epoch: 1, state: { activeIntakeId: "intake", intakes: [{ intakeId: "intake", yarn: { selectionStatus: "not_selected", name: null, strandCount: null }, needles: { selectionStatus: "not_selected", primaryMm: null }, gauge: { sourceMeasurement: { stitches: null, widthCm: null, rows: null, heightCm: null, needleSizeMm: null, afterTreatment: "unknown" } }, garmentRequirementsProfile: { canonicalFingerprint: "fnv1a32:8caa5190", constructionIdentity: "seamed_set_in_sleeve" }, yarnRequirementsProfile: { profileId: "yarn-req", canonicalFingerprint: "fnv1a32:0620fe29" } }] } },
      { kind: "MANUAL_INTAKE_VALIDATION", calculation_id: calculationId, epoch: 1, state: { status: "incomplete", abstain: true, blockers: [{ reasonCode: "YARN_NOT_SELECTED" }, { reasonCode: "GAUGE_MISSING" }, { reasonCode: "GAUGE_NOT_PROCESSED" }] } },
    ],
  };
  class Repository {
    async getProject() { return structuredClone(shared); }
    async ensureCalculationProgress(_projectId, id, kind, state) { shared.progress.push({ kind, calculation_id: id, epoch: 1, revision: 1, state: structuredClone(state) }); }
    async updateCalculationProgress() { throw new Error("unexpected update"); }
  }
  const first = await api.saveForProject(new Repository(), "p", payload(), { now: "2026-09-02T10:00:00Z" });
  const reopened = await api.inspectForProject(new Repository(), "p");
  assert.equal(first.artifact.recommendationId, reopened.artifact.recommendationId);
  assert.equal(first.artifact.revision, reopened.artifact.revision);
  assert.equal(first.artifact.canonicalFingerprint, reopened.artifact.canonicalFingerprint);
  assert.deepEqual(reopened.artifact.sourceBindings, bindings());
  const intake = shared.progress.find((entry) => entry.kind === "MANUAL_CALCULATION_INTAKE").state.intakes[0];
  assert.deepEqual(intake.yarn, { selectionStatus: "not_selected", name: null, strandCount: null });
  assert.deepEqual(intake.gauge.sourceMeasurement, { stitches: null, widthCm: null, rows: null, heightCm: null, needleSizeMm: null, afterTreatment: "unknown" });
  const validation = shared.progress.find((entry) => entry.kind === "MANUAL_INTAKE_VALIDATION").state;
  assert.equal(validation.status, "incomplete"); assert.equal(validation.abstain, true);
  assert.deepEqual(validation.blockers.map((entry) => entry.reasonCode), ["YARN_NOT_SELECTED", "GAUGE_MISSING", "GAUGE_NOT_PROCESSED"]);
  shared.progress = shared.progress.filter((entry) => entry.kind !== api.PROGRESS_KIND);
  assert.equal(shared.progress.some((entry) => entry.kind === api.PROGRESS_KIND), false);
});

test("fake success replaces legacy rev1 in place with validated rev2 and hides retry after reopen", async () => {
  const calculationId = "calculation:test";
  globalThis.YarnAIGarmentReferenceAnalysis = {
    PROGRESS_KIND: "GARMENT_REFERENCE_ANALYSIS",
    technologyDecisionHandoff() { return { isCurrent: true, allowedToStartTechnologyPlan: true, analysisId: "analysis", analysisRevision: 5, sourceAnalysisFingerprint: "fnv1a32:c37bc08a", analysisRequestId: "request", sourceRequestFingerprint: "fnv1a32:1f4f7bc7", technologyDecisionId: "decision:test", technologyDecisionRevision: 7, technologyDecisionFingerprint: "fnv1a32:27b54bd9", selectedOptionId: "pilot-option:set-in" }; },
  };
  globalThis.YarnAIManualCalculationIntake = { PROGRESS_KIND: "MANUAL_CALCULATION_INTAKE", requireValidState() { return true; } };
  const legacy = legacyArtifact();
  const shared = {
    project: { project_id: "p", active_calculation_id: calculationId },
    calculations: [{ calculation_id: calculationId, request: { workflow_kind: "garment_reference" } }],
    progress: [
      { kind: "GARMENT_REFERENCE_ANALYSIS", calculation_id: calculationId, epoch: 1, state: { source: { referencePhotos: [{ photoId: "photo", sha256: "a".repeat(64) }] } } },
      { kind: "MANUAL_CALCULATION_INTAKE", calculation_id: calculationId, epoch: 1, state: { activeIntakeId: "intake", intakes: [{ intakeId: "intake", garmentRequirementsProfile: { canonicalFingerprint: "fnv1a32:8caa5190", constructionIdentity: "seamed_set_in_sleeve" }, yarnRequirementsProfile: { profileId: "yarn-req", canonicalFingerprint: "fnv1a32:0620fe29" } }] } },
      { kind: api.PROGRESS_KIND, calculation_id: calculationId, epoch: 1, revision: 1, state: structuredClone(legacy) },
    ],
  };
  class Repository {
    constructor() { this.updateCalls = 0; }
    async getProject() { return structuredClone(shared); }
    async ensureCalculationProgress() { throw new Error("unexpected create"); }
    async updateCalculationProgress(_projectId, id, kind, state, options) {
      const progress = shared.progress.find((entry) => entry.kind === kind && entry.calculation_id === id && entry.epoch === 1);
      assert.equal(options.baseProgressRevision, progress.revision);
      this.updateCalls += 1; progress.revision += 1; progress.state = structuredClone(state);
    }
  }
  const repository = new Repository();
  const saved = await api.saveForProject(repository, "p", payload(), { now: "2026-09-02T15:00:00Z" });
  const reopened = await api.inspectForProject(repository, "p");
  assert.equal(repository.updateCalls, 1);
  assert.equal(saved.artifact.recommendationId, legacy.recommendationId);
  assert.equal(saved.artifact.revision, 2);
  assert.notEqual(saved.artifact.canonicalFingerprint, legacy.canonicalFingerprint);
  assert.equal(reopened.currentValidation.semanticValid, true);
  assert.deepEqual(api.retryControlState(reopened, { enabled: true, pilotReady: true, requestId: "yarn-supplement:unused", authorizationMatches: true }, true), { available: false, mode: "blocked", reasonCode: "CURRENT_RECOMMENDATION_VALID" });
});

test("invalid fake response cannot reach persistence and leaves legacy rev1 unchanged", async () => {
  const calculationId = "calculation:test";
  globalThis.YarnAIGarmentReferenceAnalysis = {
    PROGRESS_KIND: "GARMENT_REFERENCE_ANALYSIS",
    technologyDecisionHandoff() { return { isCurrent: true, allowedToStartTechnologyPlan: true, analysisId: "analysis", analysisRevision: 5, sourceAnalysisFingerprint: "fnv1a32:c37bc08a", analysisRequestId: "request", sourceRequestFingerprint: "fnv1a32:1f4f7bc7", technologyDecisionId: "decision:test", technologyDecisionRevision: 7, technologyDecisionFingerprint: "fnv1a32:27b54bd9", selectedOptionId: "pilot-option:set-in" }; },
  };
  globalThis.YarnAIManualCalculationIntake = { PROGRESS_KIND: "MANUAL_CALCULATION_INTAKE", requireValidState() { return true; } };
  const legacy = legacyArtifact();
  const shared = {
    project: { project_id: "p", active_calculation_id: calculationId }, calculations: [{ calculation_id: calculationId, request: { workflow_kind: "garment_reference" } }],
    progress: [
      { kind: "GARMENT_REFERENCE_ANALYSIS", calculation_id: calculationId, epoch: 1, state: { source: { referencePhotos: [{ photoId: "photo", sha256: "a".repeat(64) }] } } },
      { kind: "MANUAL_CALCULATION_INTAKE", calculation_id: calculationId, epoch: 1, state: { activeIntakeId: "intake", intakes: [{ intakeId: "intake", garmentRequirementsProfile: { canonicalFingerprint: "fnv1a32:8caa5190", constructionIdentity: "seamed_set_in_sleeve" }, yarnRequirementsProfile: { profileId: "yarn-req", canonicalFingerprint: "fnv1a32:0620fe29" } }] } },
      { kind: api.PROGRESS_KIND, calculation_id: calculationId, epoch: 1, revision: 1, state: structuredClone(legacy) },
    ],
  };
  class Repository {
    constructor() { this.updateCalls = 0; }
    async getProject() { return structuredClone(shared); }
    async ensureCalculationProgress() { throw new Error("unexpected create"); }
    async updateCalculationProgress() { this.updateCalls += 1; }
  }
  const repository = new Repository(); const invalid = payload(); invalid.limitations = invalid.limitations.slice(0, 4);
  await assert.rejects(() => api.saveForProject(repository, "p", invalid), { code: "REQUIRED_LIMITATION_MISSING" });
  assert.equal(repository.updateCalls, 0);
  assert.deepEqual(shared.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state, legacy);
  assert.equal(shared.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state.revision, 1);
});
