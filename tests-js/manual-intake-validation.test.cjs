"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const garment = require("../src/yarnai/static/garment-reference-analysis.js");
const requirements = require("../src/yarnai/static/garment-measurement-requirements.js");
const yarnRequirements = require("../src/yarnai/static/garment-yarn-requirements.js");
const intake = require("../src/yarnai/static/manual-calculation-intake.js");
const validation = require("../src/yarnai/static/manual-intake-validation.js");
const preview = require("../src/yarnai/static/garment-calculation-preview.js");
const geometry = require("../src/yarnai/static/garment-set-in-geometry.js");
const finishingDomain = require("../src/yarnai/static/garment-polo-finishing.js");
const designDomain = require("../src/yarnai/static/garment-set-in-design.js");
const poloPlan = require("../src/yarnai/static/garment-polo-plan.js");
const poloExecution = require("../src/yarnai/static/garment-polo-execution.js");

const system = global.YarnAIProjectSystem;
const repositories = [];
const configuration = { provider: "openai", model: "gpt-5.6-terra", enabled: true };

function option(optionId, name) {
  return { option_id: optionId, name, construction_summary: "TEST ONLY", knitting_direction: "TEST ONLY", seam_mode: "TEST ONLY", major_components: ["Корпус", "Рукава"], shaping_approach: "TEST ONLY", yarn_characteristics: ["TEST ONLY"], tools_and_techniques: ["Спицы"], expected_visual_similarity: "TEST ONLY", deliberate_differences: [], advantages: ["TEST ONLY"], risks: ["TEST ONLY"], difficulty_explanation: "TEST ONLY", missing_inputs_before_calculation: ["Мерки"], evidence_observation_ids: ["observed:test"], assumption_inference_ids: ["inferred:test"] };
}

function providerResponse(state) {
  const request = garment.buildAnalysisRequest(state, { requestId: "request:manual-validation" });
  return {
    contract_version: garment.CONTRACT_VERSION,
    source_identity: { project_id: request.project_id, project_revision: request.project_revision, reference_photos: request.reference_photos.map((entry) => ({ photo_id: entry.photo_id, sha256: entry.sha256 })), request_fingerprint: request.request_fingerprint },
    provider: { provider: "openai", model: "gpt-5.6-terra" },
    visible_observations: [{ id: "observed:test", field: "silhouette", value: "TEST ONLY", evidence_photo_ids: [request.reference_photos[0].photo_id], status: "observed", explanation: "TEST ONLY" }],
    inferences: [{ id: "inferred:test", field: "fit", value: "TEST ONLY", status: "inferred", uncertainty: "medium", why_plausible: "TEST ONLY", confirm_or_reject: "TEST ONLY" }],
    unknowns: [{ id: "unknown:test", field: "construction", explanation: "TEST ONLY" }], questions: [],
    technology_options: [option("option:raglan", intake.MANUAL_OPTION_NAMES[0]), option("option:set-in", intake.MANUAL_OPTION_NAMES[1]), option("option:industrial", intake.INDUSTRIAL_OPTION_NAME)],
  };
}

function completeArtifact() {
  const handoff = completeHandoff();
  const profile = requirements.resolveFromTechnologyDecision(handoff);
  const yarnProfile = yarnRequirements.resolveFromTechnologyDecision(handoff);
  return {
    intakeId: "intake:test", revision: 2, status: "draft", fingerprint: "fnv1a32:44444444",
    source: { projectId: "project:test", projectRevision: 12, analysisId: "analysis:test", analysisRequestId: "request:test", sourceAnalysisFingerprint: "fnv1a32:11111111", sourceRequestFingerprint: "fnv1a32:22222222", technologyDecisionId: "decision:test", technologyDecisionRevision: 9, selectedOptionId: "option:raglan", garmentRequirements: requirements.compactBinding(profile), yarnRequirements: yarnRequirements.compactBinding(yarnProfile) },
    garmentRequirementsProfile: profile,
    yarnRequirementsProfile: yarnProfile,
    targetSizing: {
      bodyMeasurements: [{ kind: "bust_circumference", value: 96, unit: "cm" }],
      finishedGarmentMeasurements: [{ kind: "finished_bust_circumference", value: 108, unit: "cm" }, { kind: "finished_body_length", value: 62, unit: "cm" }, { kind: "finished_sleeve_length", value: 58, unit: "cm" }, { kind: "finished_upper_arm_circumference", value: 34, unit: "cm" }, { kind: "finished_cuff_circumference", value: 18, unit: "cm" }, { kind: "finished_neck_width", value: 18, unit: "cm" }, { kind: "finished_front_neck_depth", value: 8, unit: "cm" }, { kind: "finished_yoke_depth", value: 24, unit: "cm" }],
      ease: [{ kind: "bust_ease", value: 12, unit: "cm" }],
      fitPreferences: { body_shaping_preference: "straight", neckline_style: "round_neck", closure_style: "none" },
    },
    constructionInputs: { hem_finish: "rib", cuff_finish: "rib" },
    yarn: { selectionStatus: "selected", name: "TEST ONLY yarn", strandCount: 1, composition: "шерсть", lengthMeters: 200, skeinMassGrams: 100, quantityAvailable: 6, note: null },
    needles: { selectionStatus: "selected", primaryMm: 4.5, additionalMm: [] },
    gauge: { sourceMeasurement: { stitches: 23, widthCm: 12.5, rows: 31, heightCm: 14, needleSizeMm: 4.5, afterTreatment: "yes" } },
    additionalPhotos: [{ role: "back" }, { role: "side" }, { role: "detail" }, { role: "yarn_label" }, { role: "swatch" }], notes: null,
  };
}

function completeHandoff() {
  return {
    isCurrent: true, decisionStatus: "confirmed", projectId: "project:test", sourceProjectRevision: 12, requestBindingProjectRevision: 12,
    analysisId: "analysis:test", analysisRevision: 4, analysisRequestId: "request:test",
    sourceAnalysisFingerprint: "fnv1a32:11111111", sourceRequestFingerprint: "fnv1a32:22222222",
    technologyDecisionId: "decision:test", technologyDecisionRevision: 9, technologyDecisionFingerprint: "fnv1a32:33333333",
    selectedOptionId: "option:raglan", selectedOption: { name: intake.MANUAL_OPTION_NAMES[0], constructionSummary: "ignored UI text" },
  };
}

function completeSource() {
  const artifact = completeArtifact();
  return {
    project: { id: "project:test", repositoryRevision: 12 },
    analysis: { id: "analysis:test", revision: 4, fingerprint: "fnv1a32:11111111", requestId: "request:test", requestFingerprint: "fnv1a32:22222222", projectId: "project:test", current: true },
    decision: { id: "decision:test", revision: 9, fingerprint: "fnv1a32:33333333", selectedOptionId: "option:raglan", projectId: "project:test", status: "confirmed", current: true, route: "manual" },
    intake: { id: artifact.intakeId, revision: artifact.revision, fingerprint: artifact.fingerprint, projectId: "project:test", status: "draft", artifact },
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function codes(result) { return result.blockers.map((entry) => entry.reasonCode); }
function ready(source = completeSource()) { return validation.validateSources(source, validation.syntheticFixtureContext()); }

async function repository() { const value = new system.ProjectRepository(); repositories.push(value); await value.initialize(); return value; }
async function seed(optionId = "option:raglan", polo = false, label = null, variant = {}) {
  const repo = await repository();
  const project = await repo.createProject({ title: "TEST ONLY — manual validation", draft_input: { workflow_intent: { version: 1, kind: "garment_reference" } } });
  let inspected = await garment.addPhotosForProject(repo, project.project_id, [new Blob([Buffer.from("front")], { type: "image/png" })]);
  inspected = await garment.applyProviderResponseForProject(repo, project.project_id, providerResponse(inspected.state), configuration, { allowTestProvider: true, requestId: "request:manual-validation" });
  inspected = await garment.selectDraftForProject(repo, project.project_id, optionId);
  await garment.confirmDecisionForProject(repo, project.project_id);
  await intake.ensureForProject(repo, project.project_id);
  await intake.saveDraftForProject(repo, project.project_id, {
    targetSizing: {
      bodyMeasurements: { bust_circumference: (variant.measurements?.finished_bust_circumference ?? 108) - 12, body_shoulder_width: 42, body_back_width: 38 },
      finishedGarmentMeasurements: { finished_bust_circumference: 108, finished_body_length: label ? 60 : 62, finished_sleeve_length: 58, finished_upper_arm_circumference: 34, finished_cuff_circumference: 18, finished_neck_width: 18, finished_front_neck_depth: 8, finished_yoke_depth: 24, finished_armhole_depth: 24, ...variant.measurements },
      ease: { bust_ease: 12 },
      fitPreferences: { body_shaping_preference: "straight", neckline_style: polo ? "polo_collar_with_placket" : "round_neck", closure_style: polo ? "short_front_placket" : "none" },
    },
    constructionInputs: { hem_finish: "rib", cuff_finish: "rib" },
    yarn: { selectionStatus: "selected", name: "TEST ONLY yarn", strandCount: 1, composition: "шерсть", lengthMeters: 200, skeinMassGrams: 100, quantityAvailable: 6 },
    needles: { selectionStatus: "selected", primaryMm: variant.needle ?? 4.5 }, gauge: label ? { source: "manufacturer", label } : { sourceMeasurement: { stitches: 23, widthCm: 12.5, rows: 31, heightCm: 14, needleSizeMm: variant.needle ?? 4.5, afterTreatment: "yes" } },
  });
  return { repo, project };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("01 production context abstains when garment and yarn requirements are absent", () => {
  const source = completeSource();
  delete source.intake.artifact.garmentRequirementsProfile;
  delete source.intake.artifact.source.garmentRequirements;
  delete source.intake.artifact.yarnRequirementsProfile;
  delete source.intake.artifact.source.yarnRequirements;
  const result = validation.validateSources(source);
  assert.equal(result.readyForConfirmation, false);
  assert.ok(codes(result).includes("GARMENT_REQUIREMENTS_UNRESOLVED"));
  assert.ok(codes(result).includes("YARN_REQUIREMENTS_UNRESOLVED"));
});

test("02 complete synthetic fixture is ready_to_confirm", () => { const result = ready(); assert.equal(result.status, "ready_to_confirm"); assert.equal(result.readyForConfirmation, true); assert.equal(result.blockers.length, 0); });
test("03 body plus ease is an allowed deterministic target source", () => { const source = completeSource(); source.intake.artifact.targetSizing.finishedGarmentMeasurements = source.intake.artifact.targetSizing.finishedGarmentMeasurements.filter((entry) => entry.kind !== "finished_bust_circumference"); const result = ready(source); assert.equal(result.normalizedInputs.measurements.finished_bust_circumference.valueCm, 108); assert.equal(result.normalizedInputs.measurements.finished_bust_circumference.source, "body_plus_ease"); });
test("04 direct finished measurement remains the authoritative normalized value", () => { assert.equal(ready().normalizedInputs.measurements.finished_body_length.valueCm, 62); });
test("05 direct and body-plus-ease mismatch is a blocking conflict", () => { const source = completeSource(); source.intake.artifact.targetSizing.finishedGarmentMeasurements[0].value = 110; const result = ready(source); assert.equal(result.status, "needs_attention"); assert.ok(codes(result).includes("MEASUREMENT_CONFLICT")); });
test("06 gauge stitch and row counts must be integers", () => { const source = completeSource(); source.intake.artifact.gauge.sourceMeasurement.stitches = 23.5; const result = ready(source); assert.ok(codes(result).includes("INVALID_NUMERIC_VALUE")); });
test("07 gauge must be measured after treatment", () => { const source = completeSource(); source.intake.artifact.gauge.sourceMeasurement.afterTreatment = "no"; assert.ok(codes(ready(source)).includes("GAUGE_NOT_PROCESSED")); });
test("08 gauge is normalized deterministically to ten centimeters", () => { assert.deepEqual(ready().normalizedInputs.gauge, { stitchesPer10Cm: 18.4, rowsPer10Cm: 22.1429, unit: "10_cm", sourceUnit: "cm" }); });
test("09 missing primary needle blocks confirmation", () => { const source = completeSource(); source.intake.artifact.needles.primaryMm = null; assert.ok(codes(ready(source)).includes("NEEDLE_MISSING")); });
test("10 gauge needle conflict is blocking", () => { const source = completeSource(); source.intake.artifact.gauge.sourceMeasurement.needleSizeMm = 5; assert.ok(codes(ready(source)).includes("GAUGE_NEEDLE_CONFLICT")); });
test("11 a specifically named yarn passes the synthetic minimum", () => { assert.equal(ready().checks.find((entry) => entry.checkId === "required:yarn").status, "passed"); });
test("12 unnamed yarn blocks even when selection flag is set", () => { const source = completeSource(); source.intake.artifact.yarn.name = null; assert.ok(codes(ready(source)).includes("YARN_NOT_SELECTED")); });
test("12a resolved profile removes only the unresolved yarn blocker before yarn selection", () => { const source = completeSource(); source.intake.artifact.yarn = { selectionStatus: "not_selected", name: null, strandCount: null }; const result = ready(source); assert.ok(codes(result).includes("YARN_NOT_SELECTED")); assert.equal(codes(result).includes("YARN_REQUIREMENTS_UNRESOLVED"), false); assert.equal(codes(result).includes("YARN_REQUIRED_FIELD_MISSING"), false); });
test("12b selected yarn without strand count is blocked by the authoritative profile", () => { const source = completeSource(); source.intake.artifact.yarn.strandCount = null; const result = ready(source); assert.ok(codes(result).includes("YARN_REQUIRED_FIELD_MISSING")); assert.equal(codes(result).includes("YARN_REQUIREMENTS_UNRESOLVED"), false); });
test("12c normalized yarn derives strand description only from the explicit count", () => { const result = ready(); assert.equal(result.normalizedInputs.yarn.strands, 1); assert.equal(result.normalizedInputs.yarn.strandsDescription, "strands=1; derived_from=yarn.strandCount"); });
test("13 construction identity fields are resolved by the confirmed technology", () => { const result = ready(); assert.equal(result.normalizedInputs.constructionInputs.shoulder_sleeve_construction.value, "raglan"); assert.equal(result.normalizedInputs.constructionInputs.assembly_method.value, "mostly_seamless"); });
test("14 recommended evidence produces warnings but not blockers", () => { const source = completeSource(); source.intake.artifact.additionalPhotos = []; source.intake.artifact.yarn.composition = null; source.intake.artifact.yarn.quantityAvailable = null; const result = ready(source); assert.equal(result.status, "ready_to_confirm"); assert.equal(result.warnings.length, 5); });
test("15 optional notes do not block", () => { const result = ready(); assert.equal(result.checks.find((entry) => entry.checkId === "optional:notes").status, "optional"); assert.equal(result.readyForConfirmation, true); });
test("16 non-current analysis produces stale status", () => { const source = completeSource(); source.analysis.current = false; const result = ready(source); assert.equal(result.status, "stale"); assert.ok(codes(result).includes("SOURCE_STALE")); });
test("17 mismatched intake binding fails closed", () => { const source = completeSource(); source.intake.artifact.source.analysisId = "analysis:other"; assert.ok(codes(ready(source)).includes("SOURCE_IDENTITY_MISMATCH")); });
test("18 industrial route is unsupported", () => { const source = completeSource(); source.decision.route = "industrial"; assert.ok(codes(ready(source)).includes("INDUSTRIAL_ROUTE_UNSUPPORTED")); });
test("19 identical inputs have identical semantic fingerprints", () => { assert.equal(ready().semanticFingerprint, ready().semanticFingerprint); });
test("20 first action is stable and points to the first required blocker", () => { const source = completeSource(); source.intake.artifact.targetSizing.finishedGarmentMeasurements = []; const first = ready(source).firstAction; const second = ready(source).firstAction; assert.equal(first.issueId, second.issueId); assert.equal(first.reasonCode, "REQUIRED_VALUE_MISSING"); });
test("20a partial draft is incomplete, abstains, and never treats null as zero", () => { const source = completeSource(); source.intake.artifact.targetSizing.finishedGarmentMeasurements = []; source.intake.artifact.targetSizing.bodyMeasurements = []; source.intake.artifact.targetSizing.ease = []; source.intake.artifact.gauge.sourceMeasurement = { stitches: null, widthCm: null, rows: null, heightCm: null, needleSizeMm: null, afterTreatment: "unknown" }; source.intake.artifact.needles.primaryMm = null; source.intake.artifact.yarn = { selectionStatus: "not_selected", name: null }; const result = ready(source); assert.equal(result.status, "incomplete"); assert.equal(result.abstain, true); assert.equal(result.normalizedInputs.gauge, null); assert.ok(result.blockers.every((entry) => !entry.explanation.includes("0 см"))); });
test("20b zero and negative numeric values are rejected", () => { const source = completeSource(); source.intake.artifact.gauge.sourceMeasurement.widthCm = 0; source.intake.artifact.gauge.sourceMeasurement.heightCm = -1; const result = ready(source); assert.equal(result.blockers.filter((entry) => entry.reasonCode === "INVALID_NUMERIC_VALUE").length, 2); });
test("20c photo observations cannot satisfy a required calculation measurement", () => { const source = completeSource(); source.analysis.visibleObservations = [{ field: "finished_body_length", value: "62 см" }]; source.intake.artifact.targetSizing.finishedGarmentMeasurements = source.intake.artifact.targetSizing.finishedGarmentMeasurements.filter((entry) => entry.kind !== "finished_body_length"); const result = ready(source); assert.ok(result.blockers.some((entry) => entry.field === "finished_body_length" && entry.reasonCode === "REQUIRED_VALUE_MISSING")); });
test("20d ready_to_confirm has no blockers, conflicts, or critical unresolved", () => { const result = ready(); assert.equal(result.readyForConfirmation, true); assert.equal(result.blockers.length, 0); assert.equal(result.conflicts.length, 0); assert.equal(result.unresolvedItems.length, 0); });

test("21 validation persists one progress record and survives repository reopen", async () => {
  const { repo, project } = await seed();
  const checked = await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() });
  assert.equal(checked.state.status, "ready_to_confirm");
  await repo.close(); repositories.splice(repositories.indexOf(repo), 1);
  const reopened = await repository();
  const restored = await validation.inspectForProject(reopened, project.project_id);
  assert.equal(restored.state.inputFingerprint, checked.state.inputFingerprint);
  assert.equal(restored.state.contractContextSnapshot.garmentRequirementsProfile.canonicalFingerprint, checked.state.contractContextSnapshot.garmentRequirementsProfile.canonicalFingerprint);
  assert.equal(restored.aggregate.progress.filter((entry) => entry.kind === validation.PROGRESS_KIND).length, 1);
});

test("22 repeated validation with identical input is idempotent", async () => { const { repo, project } = await seed(); const first = await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); const second = await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); assert.equal(second.progress.revision, first.progress.revision); assert.equal(second.state.revision, first.state.revision); });
test("22a validation alone never creates a confirmed snapshot", async () => { const { repo, project } = await seed(); const checked = await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); assert.equal(checked.state.status, "ready_to_confirm"); assert.equal(checked.state.confirmedSnapshot, null); });
test("23 incomplete validation cannot be confirmed", async () => { const { repo, project } = await seed(); await intake.saveDraftForProject(repo, project.project_id, { yarn: { selectionStatus: "not_selected" } }); await validation.validateForProject(repo, project.project_id); await assert.rejects(() => validation.confirmForProject(repo, project.project_id), { code: "CONFIRMATION_BLOCKED" }); });
test("24 explicit confirmation creates an immutable exact snapshot and is idempotent", async () => { const { repo, project } = await seed(); await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); const first = await validation.confirmForProject(repo, project.project_id); const second = await validation.confirmForProject(repo, project.project_id); assert.equal(first.state.status, "confirmed"); assert.equal(first.state.confirmedSnapshotFingerprint, validation.snapshotFingerprint(first.state.confirmedSnapshot)); assert.equal(first.state.confirmedSnapshot.sourceSnapshot.analysis.fingerprint, first.state.sourceSnapshot.analysis.fingerprint); assert.equal(first.state.confirmedSnapshot.sourceSnapshot.decision.revision, first.state.sourceSnapshot.decision.revision); assert.equal(first.state.confirmedSnapshot.sourceSnapshot.intake.fingerprint, first.state.sourceSnapshot.intake.fingerprint); assert.equal(second.progress.revision, first.progress.revision); });
test("24a snapshot mutation is detected by the integrity contract", async () => { const { repo, project } = await seed(); await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); const confirmed = await validation.confirmForProject(repo, project.project_id); const tampered = clone(confirmed.state); tampered.confirmedSnapshot.normalizedInputs.measurements.finished_body_length.valueCm = 999; assert.throws(() => validation.requireValidState(tampered), { code: "CONFIRMED_SNAPSHOT_INVALID" }); });
test("25 explicit reopen preserves snapshot in history and marks active result stale", async () => { const { repo, project } = await seed(); await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); const confirmed = await validation.confirmForProject(repo, project.project_id); const reopened = await validation.reopenForProject(repo, project.project_id); assert.equal(reopened.state.status, "stale"); assert.equal(reopened.state.confirmedSnapshot, null); assert.equal(reopened.state.history.at(-1).snapshot.fingerprint, confirmed.state.confirmedSnapshotFingerprint); });
test("26 a changed intake after validation becomes stale on reconcile", async () => { const { repo, project } = await seed(); await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); await intake.saveDraftForProject(repo, project.project_id, { targetSizing: { finishedGarmentMeasurements: { finished_bust_circumference: 108 } } }); const reconciled = await validation.reconcileForProject(repo, project.project_id); assert.equal(reconciled.state.status, "stale"); });
test("27 validation and confirmation do not mutate analysis or call fetch", async () => { const originalFetch = global.fetch; let fetchCalls = 0; global.fetch = async () => { fetchCalls += 1; throw new Error("network forbidden"); }; try { const { repo, project } = await seed(); const before = await garment.ensureForProject(repo, project.project_id); const analysisBefore = JSON.stringify(before.state.analysis); await validation.validateForProject(repo, project.project_id, { contractContext: validation.syntheticFixtureContext() }); await validation.confirmForProject(repo, project.project_id); const after = await garment.ensureForProject(repo, project.project_id); assert.equal(JSON.stringify(after.state.analysis), analysisBefore); assert.equal(fetchCalls, 0); } finally { global.fetch = originalFetch; } });
test("28 a changed technology decision makes the prior requirements validation stale", () => { const source = completeSource(); source.decision.revision += 1; source.decision.fingerprint = "fnv1a32:aaaaaaaa"; const result = ready(source); assert.equal(result.status, "stale"); assert.ok(codes(result).includes("SOURCE_IDENTITY_MISMATCH")); });
test("29 a changed requirements contract version makes the prior validation stale", () => { const source = clone(completeSource()); source.intake.artifact.garmentRequirementsProfile.contractVersion = "GARMENT_MEASUREMENT_REQUIREMENTS_V2"; source.intake.artifact.source.garmentRequirements.contractVersion = "GARMENT_MEASUREMENT_REQUIREMENTS_V2"; const result = ready(source); assert.equal(result.status, "stale"); assert.ok(codes(result).includes("SOURCE_IDENTITY_MISMATCH")); });
test("30 a changed yarn requirements contract version makes validation stale", () => { const source = clone(completeSource()); source.intake.artifact.yarnRequirementsProfile.contractVersion = "GARMENT_YARN_REQUIREMENTS_V2"; source.intake.artifact.source.yarnRequirements.contractVersion = "GARMENT_YARN_REQUIREMENTS_V2"; const result = ready(source); assert.equal(result.status, "stale"); assert.ok(codes(result).includes("SOURCE_IDENTITY_MISMATCH")); });

async function confirmedPreviewSeed(optionId, polo = false) {
  const seeded = await seed(optionId, polo);
  await validation.validateForProject(seeded.repo, seeded.project.project_id);
  const confirmed = await validation.confirmForProject(seeded.repo, seeded.project.project_id);
  const inspected = await intake.ensureForProject(seeded.repo, seeded.project.project_id);
  return { ...seeded, confirmed, inspected };
}

test('polo calculation and reload work without unused measurements or optional yarn label facts', async () => {
  const { repo, project } = await seed('option:set-in', true);
  const initial = await intake.ensureForProject(repo, project.project_id);
  const draft = clone(initial.artifact);
  for (const key of ['bodyMeasurements', 'finishedGarmentMeasurements', 'ease']) {
    draft.targetSizing[key] = Object.fromEntries(draft.targetSizing[key].map(row => [row.kind, row.value]));
  }
  draft.targetSizing.bodyMeasurements = { body_shoulder_width: 42 };
  draft.targetSizing.ease = {};
  delete draft.targetSizing.finishedGarmentMeasurements.finished_yoke_depth;
  draft.yarn = { selectionStatus: 'selected', name: 'TEST ONLY specific yarn', strandCount: 1 };
  await intake.saveDraftForProject(repo, project.project_id, draft);
  const checked = await validation.validateForProject(repo, project.project_id);
  assert.equal(checked.state.readyForConfirmation, true);
  await validation.confirmForProject(repo, project.project_id);
  await repo.close();
  const reopened = await repository();
  const restored = await intake.ensureForProject(reopened, project.project_id);
  const verified = await validation.reconcileForProject(reopened, project.project_id);
  assert.equal(verified.state.status, 'confirmed');
  assert.equal(restored.artifact.yarn.name, 'TEST ONLY specific yarn');
  const calculated = geometry.build(verified.state, restored.artifact, geometry.proposals(verified.state.confirmedSnapshot));
  assert.equal(calculated.executable, false);
  assert.equal(restored.artifact.targetSizing.bodyMeasurements.some(row => row.kind === 'body_back_width'), false);
});

test('31 confirmed set-in preview uses half-body and exact source gauge, never claims executable', async () => {
  const { confirmed, inspected } = await confirmedPreviewSeed('option:set-in');
  const result = preview.build(confirmed.state, inspected.artifact);
  assert.equal(result.construction, 'seamed_set_in_sleeve');
  assert.equal(result.rows[0].value, 100);
  assert.equal(result.rows[0].exact, 54 * 23 / 12.5);
  assert.equal(result.rows.find(row => row.key === 'finished_sleeve_length').exact, 58 * (31 / 14));
  assert.equal(result.executable, false);
  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.rows.every(row => row.formula && row.sources.length === 2));
  assert.equal(result.sourceFingerprint, confirmed.state.confirmedSnapshotFingerprint);
});

test('32 calculation is deterministic across repository reopen and does not write a new record', async () => {
  const { repo, project, confirmed, inspected } = await confirmedPreviewSeed();
  const before = JSON.stringify(await repo.getProject(project.project_id));
  const result = preview.build(confirmed.state, inspected.artifact);
  await repo.close();
  const reopened = await repository();
  const currentValidation = await validation.reconcileForProject(reopened, project.project_id);
  const currentIntake = await intake.ensureForProject(reopened, project.project_id);
  assert.deepEqual(preview.build(currentValidation.state, currentIntake.artifact), result);
  assert.equal(JSON.stringify(await reopened.getProject(project.project_id)), before);
});

test('33 changed intake cannot be calculated against an old confirmation', async () => {
  const { repo, project, confirmed, inspected } = await confirmedPreviewSeed();
  const changed = await intake.saveDraftForProject(repo, project.project_id, { notes: 'Changed facts' });
  assert.throws(() => preview.build(confirmed.state, changed.artifact), /изменились/);
  const reconciled = await validation.reconcileForProject(repo, project.project_id);
  assert.throws(() => preview.build(reconciled.state, inspected.artifact));
});

test('34 preview rejects corrupt confirmation and reopened input', async () => {
  const { repo, project, confirmed, inspected } = await confirmedPreviewSeed();
  const corrupt = clone(confirmed.state);
  corrupt.confirmedSnapshot.normalizedInputs.measurements.finished_bust_circumference.valueCm = 999;
  assert.throws(() => preview.build(corrupt, inspected.artifact));
  const corruptIntake = clone(inspected.artifact);
  corruptIntake.gauge.sourceMeasurement.stitches = 99;
  assert.throws(() => preview.build(confirmed.state, corruptIntake), /изменились/);
  const reopened = await validation.reopenForProject(repo, project.project_id);
  assert.throws(() => preview.build(reopened.state, inspected.artifact));
});

test('35 geometric contradiction is refused even when all fields individually validate', async () => {
  const { repo, project } = await seed('option:set-in');
  const initial = await intake.ensureForProject(repo, project.project_id);
  const draft = clone(initial.artifact);
  for (const key of ['bodyMeasurements', 'finishedGarmentMeasurements', 'ease']) {
    draft.targetSizing[key] = Object.fromEntries(draft.targetSizing[key].map(row => [row.kind, row.value]));
  }
  draft.targetSizing.finishedGarmentMeasurements.finished_body_length = 20;
  await intake.saveDraftForProject(repo, project.project_id, draft);
  await validation.validateForProject(repo, project.project_id);
  const confirmed = await validation.confirmForProject(repo, project.project_id);
  const inspected = await intake.ensureForProject(repo, project.project_id);
  assert.throws(() => preview.build(confirmed.state, inspected.artifact), /Глубина проймы/);
});

test('36 polo geometry conserves every body and sleeve stitch and fits estimated seam lengths', async () => {
  const { confirmed, inspected } = await confirmedPreviewSeed('option:set-in', true);
  const result = geometry.build(confirmed.state, inspected.artifact, geometry.proposals(confirmed.state.confirmedSnapshot));
  const b = result.body, s = result.sleeve;
  assert.equal(b.panelStitches, 102);
  for (const neck of [b.frontNeck, b.backNeck]) {
    const gap = neck === b.frontNeck ? b.placket.stitches : 0;
    assert.equal(b.panelStitches - 2 * (b.armhole.initialBindOffEach + b.armhole.decreasesEach) - gap - 2 * neck.totalRemovedEach - 2 * b.shoulder.stitchesEach, 0);
    assert.equal(neck.perSide.reduce((n, e) => n + e.count, 0), neck.totalRemovedEach);
  }
  assert.equal(b.shoulder.bindOffGroups.reduce((a,b) => a+b, 0), b.shoulder.stitchesEach);
  let stitches = s.upperStitches;
  for (const event of s.cap.events) {
    stitches -= event.count * (event.edge === 'both' ? 2 : 1);
    assert.equal(stitches, event.afterStitches);
    assert.ok(stitches > 0);
  }
  assert.equal(stitches, s.cap.finalBindOff);
  assert.equal(s.bodyRows + s.cap.rows, s.totalRows);
  assert.ok(s.cap.easeCm >= 0 && s.cap.easeCm <= 1);
  assert.equal(result.executable, false);
  assert.deepEqual(result, geometry.build(confirmed.state, inspected.artifact, result.design));
});

test('37 shape review persists and confirmation is explicit, idempotent and survives reopen', async () => {
  const { repo, project, confirmed } = await confirmedPreviewSeed('option:set-in', true);
  const id = project.project_id;
  const calculated = await designDomain.saveForProject(repo, id, geometry.proposals(confirmed.state.confirmedSnapshot), 0);
  assert.equal(calculated.state.status, 'review');
  assert.equal(calculated.state.confirmedAt, null);
  const accepted = await designDomain.confirmForProject(repo, id, calculated.geometry.fingerprint, calculated.progress.revision);
  const again = await designDomain.confirmForProject(repo, id, accepted.geometry.fingerprint, accepted.progress.revision);
  assert.equal(accepted.progress.revision, again.progress.revision);
  await repo.close();
  const reopened = await repository();
  const restored = await designDomain.inspectForProject(reopened, id);
  assert.equal(restored.state.status, 'confirmed');
  assert.deepEqual(restored.geometry, calculated.geometry);
  assert.equal(restored.geometry.executable, false);
});

test('38 changed sources block old shape confirmation and never silently re-confirm', async () => {
  const { repo, project, confirmed } = await confirmedPreviewSeed('option:set-in', true);
  const calculated = await designDomain.saveForProject(repo, project.project_id, geometry.proposals(confirmed.state.confirmedSnapshot), 0);
  await validation.reopenForProject(repo, project.project_id);
  const current = await designDomain.inspectForProject(repo, project.project_id);
  assert.equal(current.current, false);
  assert.equal(current.geometry, null);
  await assert.rejects(() => designDomain.confirmForProject(repo, project.project_id, calculated.geometry.fingerprint, calculated.progress.revision), { code:'DESIGN_CONFIRMATION_STALE' });
});

test('39 revised design preserves old confirmation and rejects concurrent stale writes', async () => {
  const { repo, project, confirmed } = await confirmedPreviewSeed('option:set-in', true);
  const params = geometry.proposals(confirmed.state.confirmedSnapshot);
  const calculated = await designDomain.saveForProject(repo, project.project_id, params, 0);
  const accepted = await designDomain.confirmForProject(repo, project.project_id, calculated.geometry.fingerprint, calculated.progress.revision);
  await assert.rejects(() => designDomain.saveForProject(repo, project.project_id, {...params,placketLengthCm:10}, calculated.progress.revision), {code:'DESIGN_REVISION_CONFLICT'});
  const changed = await designDomain.saveForProject(repo, project.project_id, {...params,placketLengthCm:10}, accepted.progress.revision);
  assert.equal(changed.state.status,'review');
  assert.equal(changed.state.history.at(-1).geometryFingerprint, accepted.geometry.fingerprint);
  await assert.rejects(() => designDomain.confirmForProject(repo, project.project_id, accepted.geometry.fingerprint, changed.progress.revision), {code:'DESIGN_CONFIRMATION_STALE'});
});

test('40 shape cannot be substituted for another technology or neckline', async () => {
  const {confirmed,inspected}=await confirmedPreviewSeed('option:set-in');
  assert.throws(()=>geometry.build(confirmed.state,inspected.artifact,geometry.proposals(confirmed.state.confirmedSnapshot)),{code:'DESIGN_UNSUPPORTED'});
  const other=await confirmedPreviewSeed('option:raglan',true);
  assert.throws(()=>geometry.build(other.confirmed.state,other.inspected.artifact,geometry.proposals(other.confirmed.state.confirmedSnapshot)),{code:'CONSTRUCTION_UNSUPPORTED'});
});

test('41 impossible design is rejected without changing stored review', async () => {
  const {repo,project,confirmed}=await confirmedPreviewSeed('option:set-in',true);
  const params=geometry.proposals(confirmed.state.confirmedSnapshot);
  const calculated=await designDomain.saveForProject(repo,project.project_id,params,0);
  for(const patch of [{shoulderWidthCm:70},{backNeckDepthCm:0.5},{placketWidthCm:''}]) {
    await assert.rejects(()=>designDomain.saveForProject(repo,project.project_id,{...params,...patch},calculated.progress.revision));
  }
  const current=await designDomain.inspectForProject(repo,project.project_id);
  assert.equal(current.progress.revision,calculated.progress.revision);
  assert.deepEqual(current.geometry,calculated.geometry);
});

test('42 cap contour accounts for all rows and calculates seam length independently', async () => {
  const {confirmed,inspected}=await confirmedPreviewSeed('option:set-in',true);
  const g=geometry.build(confirmed.state,inspected.artifact,geometry.proposals(confirmed.state.confirmedSnapshot));
  const c=g.sleeve.cap,gs=g.gauge.stitchesPerCm,gr=g.gauge.rowsPerCm;
  assert.equal(c.zones.reduce((n,z)=>n+z.rows,0),c.rows);
  assert.equal(c.events.at(-1).row,c.rows);
  assert.equal(c.rows%2,0);
  const side=c.initialBindOffEach/gs+2/gr+Math.hypot(c.lower/gs,c.lower/gr)+Math.hypot(c.middle/gs,c.middle*c.middleRate/gr)+Math.hypot(c.upper/gs,c.upper/gr)+Math.hypot(c.topStep/gs,2/gr);
  assert.ok(Math.abs(c.perimeterCm-(2*side+c.top/gs))<1e-10);
  assert.ok(c.heightCm<g.body.armhole.outerHeightCm);
});

function finishingFixture() {
  return {mainFabricConfirmed:true,ribTreated:true,buttonholeTested:true,ribStitches:22,ribWidthCm:10,ribRows:30,ribHeightCm:10,ribNeedleMm:3.5,
    hemHeightCm:4,cuffHeightCm:4,collarHeightCm:7,buttonCount:3,buttonDiameterCm:1.5,buttonholeStitches:3,buttonEndMarginCm:1.5,
    mainMassGrams:12,mainFullWidthCm:14,mainFullHeightCm:16,ribMassGrams:10,ribFullWidthCm:12,ribFullHeightCm:12,reservePercent:15,availableGrams:600};
}
require("./polo-audit.cjs")({seed, intake, validation, preview, geometry, finishingDomain, poloPlan, finishingFixture});
async function finishingSeed() {
  const seeded=await confirmedPreviewSeed('option:set-in',true),id=seeded.project.project_id;
  const design=await designDomain.saveForProject(seeded.repo,id,geometry.proposals(seeded.confirmed.state.confirmedSnapshot),0);
  const accepted=await designDomain.confirmForProject(seeded.repo,id,design.geometry.fingerprint,design.progress.revision);
  return {...seeded,accepted};
}

test('43 finishing uses its own treated rib gauge and preserves total length across the gauge change', async()=>{
  const {accepted}=await finishingSeed();
  const f=finishingDomain.build(accepted.geometry,accepted.intake.artifact,finishingFixture());
  assert.equal(f.rib.stitchesPerCm,2.2);
  assert.equal(f.hem.rows,12);
  assert.equal(f.hem.stitches,122);
  assert.equal(f.hem.transition.to,102);
  assert.equal(f.body.mainRows,128);
  assert.equal(f.body.totalPhysicalRows,140);
  assert.ok(Math.abs(f.body.achievedLengthCm-62)<1/(31/14));
  assert.ok(Math.abs(f.sleeve.achievedLengthCm-58)<1/(31/14));
  assert.equal(f.sleeve.increaseRows.length,accepted.geometry.sleeve.increasePairs);
  assert.ok(f.sleeve.increaseRows.every(r=>r%2===1&&r>1&&r<f.sleeve.beforeCapRows));
  assert.equal(new Set(f.sleeve.increaseRows).size,f.sleeve.increaseRows.length);
  assert.equal(f.executable,false);
});
test('44 unmeasured rib, untested buttonhole, missing weight and conflicting swatch area never become guessed values',async()=>{
  const {accepted}=await finishingSeed();
  for(const patch of [{ribTreated:false},{mainFabricConfirmed:false},{buttonholeTested:false},{mainMassGrams:''},{ribFullWidthCm:5}]) {
    assert.throws(()=>finishingDomain.build(accepted.geometry,accepted.intake.artifact,{...finishingFixture(),...patch}));
  }
});
test('45 buttonholes neither overlap nor consume edge stitches, stock shortage remains explicit',async()=>{
  const {accepted}=await finishingSeed();
  const f=finishingDomain.build(accepted.geometry,accepted.intake.artifact,{...finishingFixture(),availableGrams:1});
  assert.equal(f.band.holes.length,3);
  assert.ok(f.band.holes.every(h=>h.firstStitch>=3&&h.lastStitch<=f.band.stitches-2));
  assert.ok(f.band.holes.every(h=>Math.abs(h.centerCm-h.targetCenterCm)<=0.5/f.rib.stitchesPerCm+1e-10));
  assert.equal(f.band.recastRow,f.band.holeRow+1);
  assert.equal(f.yarn.status,'shortage');
  assert.equal(f.yarn.shortageGrams,f.yarn.requiredGrams-1);
  assert.ok(f.yarn.requiredGrams>f.yarn.baseGrams);
  assert.equal(f.yarn.approximate,true);
  assert.throws(()=>finishingDomain.build(accepted.geometry,accepted.intake.artifact,{...finishingFixture(),buttonholeStitches:12,buttonCount:6}),{code:'BUTTONHOLES_OVERLAP'});
});
test('46 finishing persists independently, confirmation survives reopen and shape change invalidates it',async()=>{
  const {repo,project,accepted}=await finishingSeed();
  const saved=await designDomain.saveFinishingForProject(repo,project.project_id,finishingFixture(),accepted.progress.revision);
  assert.equal(saved.state.finishing.status,'review');
  const confirmed=await designDomain.confirmFinishingForProject(repo,project.project_id,saved.finishing.fingerprint,saved.progress.revision);
  await repo.close();
  const reopened=await repository(),restored=await designDomain.inspectForProject(reopened,project.project_id);
  assert.deepEqual(restored.finishing,confirmed.finishing);
  assert.equal(restored.state.finishing.status,'confirmed');
  const changed=await designDomain.saveForProject(reopened,project.project_id,{...restored.state.design,placketLengthCm:10},restored.progress.revision);
  assert.equal(changed.finishing,null);
  assert.equal(changed.state.finishing,undefined);
  assert.equal(changed.state.history.at(-1).finishing.status,'confirmed');
  await assert.rejects(()=>designDomain.confirmFinishingForProject(reopened,project.project_id,confirmed.finishing.fingerprint,changed.progress.revision),{code:'FINISH_CONFIRMATION_STALE'});
});

test('47 physical row compiler reaches every body endpoint with reachable bind-offs and no zero-stitch decrease',async()=>{
  const {accepted}=await finishingSeed();
  const g=accepted.geometry,f=finishingDomain.build(g,accepted.intake.artifact,finishingFixture());
  for(const front of [false,true]) {
    const result=poloPlan.bodyRows(g,f,front);
    assert.equal(result.rows.at(-1).afterStitches,0);
    assert.equal(result.rows.length,f.body.mainRows);
    assert.equal(result.rows[0].beforeStitches,f.hem.stitches);
    for(const row of result.rows) {
      assert.ok(row.afterStitches>=0);
      for(const e of row.events.filter(e=>e.kind==='bind_off')) {
        const start=e.part==='A'?(row.row%2?'outer':'neck'):(row.row%2?'neck':'outer');
        assert.equal(e.edge,start);
      }
    }
    assert.ok(result.adjustments.every(a=>Math.abs(a.fromRow-a.toRow)===1));
  }
  const sleeve=poloPlan.sleeveRows(g,f);
  assert.equal(sleeve.at(-1).afterStitches,g.sleeve.cap.finalBindOff);
  assert.equal(sleeve[0].beforeStitches,f.cuff.stitches);
  assert.equal(sleeve.length,f.sleeve.mainRows);
});

async function executionSeed(finishInput = finishingFixture()){
  const seeded=await finishingSeed(),id=seeded.project.project_id;
  const saved=await designDomain.saveFinishingForProject(seeded.repo,id,finishInput,seeded.accepted.progress.revision);
  const finished=await designDomain.confirmFinishingForProject(seeded.repo,id,saved.finishing.fingerprint,saved.progress.revision);
  return{...seeded,finished};
}
function syntheticCompletion(step){return Object.fromEntries(step.fields.map(f=>[f.key,f.type==='checkbox'?true:f.type==='select'?f.options[0].value:f.target]));}

test("audit: an incompatible upper slit cannot strand saved progress and the plain slit needs no buttonholes",async()=>{
  const fixture={...finishingFixture(),buttonholeStitches:5,buttonEndMarginCm:2.75};
  const {repo,project}=await executionSeed(fixture), id=project.project_id;
  let view=await poloExecution.startForProject(repo,id);
  while(view.plan.steps[view.state.stepIndex].id!=="front_measure"){
    const step=view.plan.steps[view.state.stepIndex];
    if(step.rows) view=await poloExecution.savePositionForProject(repo,id,step.id,step.rows.length,"",view.progress.revision);
    view=await poloExecution.completeStepForProject(repo,id,step.id,syntheticCompletion(step),view.progress.revision);
  }
  const step=view.plan.steps[view.state.stepIndex], actual=syntheticCompletion(step);
  const short=actual.slitA-0.49, revision=view.progress.revision;
  await assert.rejects(()=>poloExecution.completeStepForProject(repo,id,step.id,{...actual,slitA:short},revision),{code:"PLAN_BUTTON_EDGE_CONFLICT"});
  await repo.close();
  const reopened=await repository();
  view=await poloExecution.inspectForProject(reopened,id);
  assert.equal(view.current,true);assert.equal(view.progress.revision,revision);
  const next=await poloExecution.completeStepForProject(reopened,id,step.id,{...actual,slitB:short},revision);
  assert.equal(next.current,true);
  assert.equal(next.plan.steps.find(s=>s.id==="lower_pickup").derived.holes.length,0);
});

test('48 full synthetic polo route reaches user-reported completion including actual-edge pickup recalculation',async()=>{
  const {repo,project}=await executionSeed(),id=project.project_id;
  let current=await poloExecution.startForProject(repo,id);
  const seen=[];
  while(current.state.status==='active'){
    assert.equal(current.current,true,current.problem?.message);
    const step=current.plan.steps[current.state.stepIndex];seen.push(step.id);
    if(step.rows)current=await poloExecution.savePositionForProject(repo,id,step.id,step.rows.length,'TEST ONLY — no physical knitting',current.progress.revision);
    current=await poloExecution.completeStepForProject(repo,id,step.id,syntheticCompletion(step),current.progress.revision);
  }
  assert.equal(current.current,true,current.problem?.message);
  assert.equal(current.state.status,'completed_reported');
  assert.equal(current.state.records.length,current.plan.steps.length);
  for(const required of ['back_main','front_main','sleeve1_main','sleeve2_main','shoulders','lower_rib','upper_rib','collar_rib','sleeve_fit','attach_sleeves','side_seams','buttons','final'])assert.ok(seen.includes(required));
  assert.equal(current.plan.physicalFitProven,false);
  assert.ok(current.state.records.every(r=>r.evidence==='user_report'));
  const snapshot=clone(current.state);
  await repo.close();const reopened=await repository();
  const restored=await poloExecution.inspectForProject(reopened,id);
  assert.equal(restored.current,true,restored.problem?.message);
  assert.deepEqual(restored.state,snapshot);
});

test('49 row checkpoint resumes, stale clicks and incomplete row steps are refused',async()=>{
  const {repo,project}=await executionSeed(),id=project.project_id;
  let current=await poloExecution.startForProject(repo,id);
  for(const expected of ['prepare','back_cast']){
    const step=current.plan.steps[current.state.stepIndex];assert.equal(step.id,expected);
    current=await poloExecution.completeStepForProject(repo,id,step.id,syntheticCompletion(step),current.progress.revision);
  }
  const staleRev=current.progress.revision;
  current=await poloExecution.savePositionForProject(repo,id,'back_rib',3,'Stopped after row 3',staleRev);
  await assert.rejects(()=>poloExecution.savePositionForProject(repo,id,'back_rib',4,'',staleRev),{code:'EXECUTION_REVISION_CONFLICT'});
  await assert.rejects(()=>poloExecution.completeStepForProject(repo,id,'back_rib',{stitches:122},current.progress.revision),{code:'PLAN_ROWS_INCOMPLETE'});
  await repo.close();const reopened=await repository();
  const restored=await poloExecution.inspectForProject(reopened,id);
  assert.equal(restored.state.completedRows,3);assert.equal(restored.state.note,'Stopped after row 3');
  assert.equal(restored.plan.steps[restored.state.stepIndex].rows[3].row,4);
});

test('50 input changes preserve execution but refuse continuation under a different source',async()=>{
  const {repo,project}=await executionSeed(),id=project.project_id;
  const execution=await poloExecution.startForProject(repo,id);
  await validation.reopenForProject(repo,id);
  const inspected=await poloExecution.inspectForProject(repo,id);
  assert.equal(inspected.current,false);
  assert.deepEqual(inspected.state,execution.state);
  await assert.rejects(()=>poloExecution.completeStepForProject(repo,id,'prepare',{upperBand:'A',done:true},execution.progress.revision));
});

test('51 actual seam mismatch, absent choice and wrong measurement are not accepted by confirmation alone',async()=>{
  const {finished}=await executionSeed();
  const plan=poloPlan.build(finished);
  assert.throws(()=>poloPlan.validateCompletion(finished,plan,plan.steps[0],{done:true},0),{code:'PLAN_CHOICE_REQUIRED'});
  const measure=plan.steps.find(s=>s.id==='back_measure');
  assert.throws(()=>poloPlan.validateCompletion(finished,plan,measure,{...syntheticCompletion(measure),widthCm:99},0),{code:'PLAN_MEASUREMENT_MISMATCH'});
  const records=[['prepare',{upperBand:'A'}],['front_measure',{armA:26,armB:26,slitA:12,slitB:12}],['back_measure',{armA:26,armB:26}],['sleeve1_measure',{capCm:54}],['sleeve2_measure',{capCm:52.5}]].map(([stepId,input])=>({stepId,input}));
  const actual=poloPlan.build(finished,records),fit=actual.steps.find(s=>s.id==='sleeve_fit');
  assert.throws(()=>poloPlan.validateCompletion(finished,actual,fit,{done:true},0),{code:'PLAN_SEAM_MISMATCH'});
});

test("manufacturer label requires both axes and distinguishes recommended needles", () => {
  const source = completeSource();
  const label = { stitchesPer10Cm: 20.5, recommendedNeedleMm: 4 };
  source.intake.artifact.gauge = intake.normalizeGauge({source: "manufacturer", label});
  const incomplete = ready(source);
  assert.ok(incomplete.blockers.some(item => item.field === "gauge.rows"));
  assert.ok(!codes(incomplete).includes("GAUGE_NOT_PROCESSED"));
  source.intake.artifact.gauge = intake.normalizeGauge({source: "manufacturer", label: {...label, rowsPer10Cm: 28}});
  const valid = ready(source);
  assert.equal(valid.readyForConfirmation, true);
  assert.equal(valid.normalizedInputs.gauge.stitchesPer10Cm, 20.5);
  assert.ok(valid.warnings.some(item => item.reasonCode === "LABEL_NEEDLE_DIFFERENCE"));
});

test("manufacturer polo saves, reopens and compiles all sections without swatch facts", async () => {
  const label = {stitchesPer10Cm: 20, rowsPer10Cm: 28, recommendedNeedleMm: 4.5};
  const {repo, project} = await seed("option:set-in", true, label);
  const id = project.project_id;
  await validation.validateForProject(repo, id);
  const confirmed = await validation.confirmForProject(repo, id);
  const {artifact} = await intake.ensureForProject(repo, id);
  assert.equal(artifact.gauge.sourceMeasurement, undefined);
  const base = preview.build(confirmed.state, artifact);
  assert.equal(base.gaugeStatus, "Расчёт по плотности производителя");
  assert.equal(base.rows.find(row => row.key === "finished_bust_circumference").value, 108);
  assert.equal(base.rows.find(row => row.key === "finished_body_length").value, 168);
  const shape = await designDomain.saveForProject(repo, id, geometry.proposals(confirmed.state.confirmedSnapshot), 0);
  const accepted = await designDomain.confirmForProject(repo, id, shape.geometry.fingerprint, shape.progress.revision);
  const input = {ribStitchesPer10Cm: 22, ribRowsPer10Cm: 30, ribNeedleMm: 4, hemHeightCm: 4,
    cuffHeightCm: 4, collarHeightCm: 7, buttonCount: 3, buttonDiameterCm: 1.5, buttonEndMarginCm: 1.5};
  assert.throws(() => finishingDomain.build(accepted.geometry, artifact, {...input, ribRowsPer10Cm: null}), {code:"FINISH_INPUT_INVALID"});
  const review = await designDomain.saveFinishingForProject(repo, id, input, accepted.progress.revision);
  const final = await designDomain.confirmFinishingForProject(repo, id, review.finishing.fingerprint, review.progress.revision);
  const plan = poloPlan.build(final);
  assert.equal(final.finishing.yarn.status, "unknown");
  assert.equal(final.finishing.rib.source, "design_target");
  assert.equal(final.finishing.input.ribTreated, undefined);
  assert.equal(final.finishing.input.buttonholeStitches, 3);
  assert.equal(plan.physicalFitProven, false);
  const step = id => plan.steps.find(s => s.id === id);
  assert.match(step("prepare").text.join(" "), /Точный расход пряжи не определён/);
  assert.equal(plan.steps.length, 36);
  assert.match(step("upper_rib").text.join(" "), /примерь пуговицу/);
  for (const id of ["upper_rib", "lower_rib", "collar_rib"]) assert.ok(step(id).rows.length > 0);
  assert.equal(step("upper_rib").rows.at(-1).afterStitches, final.finishing.band.stitches);
  assert.equal(final.finishing.sleeve.increaseRows.length * 2, final.geometry.sleeve.upperStitches - final.geometry.sleeve.cuffStitchesAtMainGauge);
  assert.ok(step("attach_sleeves") && step("side_seams") && step("buttons") && step("final"));
  await repo.close();
  const reopened = await designDomain.inspectForProject(await repository(), id);
  assert.deepEqual(reopened.intake.artifact.gauge.label, label);
  assert.equal(reopened.intake.artifact.gauge.source, "manufacturer");
  assert.deepEqual(poloPlan.build(reopened), plan);
});

test("switching gauge source preserves entered values without mixing them", () => {
  const sourceMeasurement = {stitches: 24, rows: 32, widthCm: 12, heightCm: 12, needleSizeMm: 4, afterTreatment: "no"};
  const label = {stitchesPer10Cm: 19, rowsPer10Cm: 27, recommendedNeedleMm: 4.5};
  const manufacturer = intake.normalizeGauge({source: "manufacturer", label, sourceMeasurement});
  assert.deepEqual(intake.gaugeBasis(manufacturer), {stitches:19, rows:27, widthCm:10, heightCm:10, needleSizeMm:4.5});
  const measured = intake.normalizeGauge({...manufacturer, source:"measured"});
  assert.deepEqual(measured.sourceMeasurement, sourceMeasurement);
  assert.deepEqual(measured.label, label);
  const source = completeSource();
  source.intake.artifact.gauge = measured;
  assert.ok(codes(ready(source)).includes("GAUGE_NOT_PROCESSED"));
});
