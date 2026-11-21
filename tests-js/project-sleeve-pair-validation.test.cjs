"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");
global.window = globalThis;
[
  "project-system", "project-details-experience", "project-details-collaboration", "project-details-closure", "project-initialization", "swatch-gauge", "project-calculation-entry", "project-readiness-engine", "project-execution-plan", "project-execution-plan-workspace", "project-execution-start", "project-execution-start-workspace", "project-execution-first-step", "project-execution-next-step", "project-execution-next-step-clarification", "foundation-section-execution-preparation", "foundation-section-execution", "foundation-section-measurement", "primary-fabric-preparation", "primary-fabric-execution", "primary-fabric-measurement", "project-next-section-planning", "project-construction-strategy-planning", "project-shaping-policy-planning", "project-sleeve-target-geometry-planning", "project-sleeve-target-geometry-planning-application", "project-sleeve-physical-execution", "project-sleeve-physical-execution-application", "project-sleeve-pair-validation", "project-sleeve-pair-validation-application",
].forEach((name) => require(`../src/yarnai/static/${name}.js`));
["stage70", "stage71", "stage72", "stage73", "stage74", "stage75", "stage76", "stage77", "stage78"].forEach((stage) => require(`../src/yarnai/static/${stage}-happy-path-fixture.js`));

const system = global.YarnAIProjectSystem;
const stage78 = global.YarnAIProjectShapingPolicyPlanning;
const planning = global.YarnAIProjectSleeveTargetGeometryPlanning;
const planningApplication = global.YarnAIProjectSleeveTargetGeometryPlanningApplication;
const execution = global.YarnAIProjectSleevePhysicalExecution;
const executionApplication = global.YarnAIProjectSleevePhysicalExecutionApplication;
const domain = global.YarnAIProjectSleevePairValidation;
const application = global.YarnAIProjectSleevePairValidationApplication;
const START = Date.parse("2026-08-09T10:00:00.000Z");
let repositories = []; let tick = 0;
function meta() { return { at: new Date(START + (++tick) * 1000).toISOString(), operationId: system.uuidv7() }; }
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; tick = 0; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((value) => value.close().catch(() => undefined))); await deleteDatabase(); });

async function seedCompleted79(repo) {
  await repo.initialize(); const seeded = await global.YarnAIStage78HappyPathFixture.seedStage78HappyPath({ repository: repo, startedAt: START }); let aggregate = await repo.getProject(seeded.projectId); const operation = meta();
  const snapshot78 = stage78.createCompletedSnapshot(seeded.assessment78, { policy: "raglan_synchronized" }, { timestamp: operation.at, operationId: operation.operationId, explicitConfirmation: true });
  await repo.ensureProjectShapingPolicyPlanning(seeded.projectId, seeded.calculationId, stage78.createProgressState(snapshot78), { expectedProjectRevision: aggregate.project.revision, timestamp: operation.at, operationId: operation.operationId });
  const app = planningApplication.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }); await app.loadOrStart(seeded.projectId); await app.collectCuffCircumference("20", meta()); await app.collectUpperCircumference("30", meta()); await app.collectCuffToUnderarmLength("40", meta());
  const current = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); const pattern = { ...current.state.construction.mainPattern, source_identity: "stage81:test-cuff", source_fingerprint: planning.fingerprint({ purpose: "stage81-test-cuff" }), origin: "user_override" };
  await app.overrideCuff({ pattern, targetHeightCm: "5", transitionIdentity: "cuff-to-main-same-count-pattern-change:v1" }, meta()); await app.bindCuffGauge({ explicitConfirmation: true }, meta()); await app.bindMainGauge({ explicitConfirmation: true }, meta()); const review = await app.enterReview({}, meta()); await app.confirmReview(review.review.reviewFingerprint, meta()); return seeded;
}
const ACTUALS = Object.freeze({ actualCuffStitchCount: 40, actualUnderarmFullTubeStitchCount: 60, actualCuffToUnderarmLengthCm: "40", actualCuffCircumferenceCm: "20", actualUpperSleeveCircumferenceCm: "30", actualIncreaseEventCount: 10, completionBoundary: execution.COMPLETION_BOUNDARY, observedRoundCount: 80, deviationNote: null });
async function completeSleeve(app, slot, overrides = {}) { const loaded = await app.load(); if (loaded.components[slot].lifecycle === "ready") await app.startComponent(slot, meta()); await app.confirmCuffCount(slot, overrides.actualCuffStitchCount || ACTUALS.actualCuffStitchCount, meta()); await app.declareTargetReached(slot, meta()); await app.openResultReview(slot, meta()); const actuals = { ...ACTUALS, ...overrides }; if (Object.entries(actuals).some(([key, value]) => key !== "deviationNote" && key in ACTUALS && value !== ACTUALS[key])) actuals.deviationNote ||= "Visible fixture difference."; await app.editResultDraft(slot, actuals, meta()); return app.completeComponent(slot, meta()); }
async function seedPair(repo, secondOverrides = {}) { const seeded = await seedCompleted79(repo); const app = executionApplication.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }); await completeSleeve(app, "sleeve_1"); await completeSleeve(app, "sleeve_2", secondOverrides); return { seeded, executionApp: app, validationApp: application.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }) }; }

test("A: Stage 81 is unavailable until both current Stage 80 sleeves are completed", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const validationApp = application.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }); await assert.rejects(() => validationApp.load(), (error) => error.code === "STAGE80_REQUIRED");
  const executionApp = executionApplication.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }); await completeSleeve(executionApp, "sleeve_1"); await assert.rejects(() => validationApp.load(), (error) => error.code === "STAGE80_PAIR_NOT_READY"); assert.equal(await repo.getProjectSleevePairValidation(seeded.projectId, seeded.calculationId), null);
});

test("B-C-F: first action freezes a deterministic exact comparison without repeated measurements or tolerance", async () => {
  const repo = repository(); const { seeded, validationApp } = await seedPair(repo); let view = await validationApp.load(); assert.equal(view.lifecycle, "ready"); assert.equal(view.firstAction, "start_pair_review"); assert.equal(view.primaryActionLabel, "Проверить два готовых рукава"); assert.deepEqual(view.comparisons, []); assert.equal(view.tolerancePolicy, null);
  view = await validationApp.startPairReview(meta()); assert.equal(view.lifecycle, "reviewing"); assert.equal(view.comparisonOutcome, "exact_match"); assert.equal(view.comparisons.length, 7); assert.equal(view.detectedDifferences.length, 0); assert.ok(view.comparisons.every((row) => ["equal", "not_compared"].includes(row.outcome)));
  const stored = await repo.getProjectSleevePairValidation(seeded.projectId, seeded.calculationId); assert.equal(stored.state.source.sleeve_1.componentEpoch, 1); assert.equal(stored.state.source.sleeve_2.componentEpoch, 1); assert.equal(stored.state.review.tolerancePolicy, null); assert.equal(stored.state.review.results.sleeve_1.actualCuffToUnderarmLengthCm, "40");
});

test("D-E: every V1 field uses exact comparison and optional observation asymmetry remains visible", () => {
  const base = { ...ACTUALS }; const fields = domain.RESULT_FIELDS.map((item) => item.field);
  for (const field of fields) { const left = { ...base }; const right = { ...base }; right[field] = field.includes("Cm") ? "41" : field === "observedRoundCount" ? 81 : right[field] + 1; const rows = domain.comparisonRows({ sleeve_1: left, sleeve_2: right }); const target = rows.find((row) => row.field === field); assert.equal(target.comparisonPolicy, "exact_v1"); assert.equal(target.outcome, "different"); }
  let rows = domain.comparisonRows({ sleeve_1: { ...base, observedRoundCount: null }, sleeve_2: { ...base, observedRoundCount: null } }); assert.deepEqual(rows.at(-1), { field: "observedRoundCount", comparisonPolicy: "exact_v1", sleeve1Value: null, sleeve2Value: null, observationStatus: "not_observed_both", outcome: "not_compared" });
  rows = domain.comparisonRows({ sleeve_1: { ...base, observedRoundCount: null }, sleeve_2: base }); assert.equal(rows.at(-1).observationStatus, "observed_one_only"); assert.equal(rows.at(-1).outcome, "different");
});

test("G: exact pair still requires explicit confirmation and completes as matched", async () => {
  const repo = repository(); const { seeded, validationApp } = await seedPair(repo); await validationApp.startPairReview(meta()); await assert.rejects(() => validationApp.completePairDecision({ decision: "accept_pair", acceptanceNote: null, reworkComponents: [], explicitConfirmation: false }, meta()), (error) => error.code === "EXPLICIT_CONFIRMATION_REQUIRED");
  const completed = await validationApp.completePairDecision({ decision: "accept_pair", acceptanceNote: null, reworkComponents: [], explicitConfirmation: true }, meta()); assert.equal(completed.currentValidation.outcome, "matched"); assert.equal(completed.pairValidationBoundary.status, "pair_validation_completed"); assert.equal(completed.joinPreparation.available, false);
  const stored = await repo.getProjectSleevePairValidation(seeded.projectId, seeded.calculationId); assert.equal(stored.state.lifecycle, "completed"); assert.equal(stored.state.decision.outputBoundary, "pair_validation_completed");
});

test("H: detected differences require explicit note for acceptance and preserve unequal actuals", async () => {
  const repo = repository(); const { validationApp } = await seedPair(repo, { actualCuffToUnderarmLengthCm: "41" }); const review = await validationApp.startPairReview(meta()); assert.equal(review.comparisonOutcome, "differences_detected"); assert.deepEqual(review.detectedDifferences.map((item) => item.field), ["actualCuffToUnderarmLengthCm"]);
  await assert.rejects(() => validationApp.completePairDecision({ decision: "accept_pair", acceptanceNote: "", reworkComponents: [], explicitConfirmation: true }, meta()), (error) => error.code === "ACCEPTANCE_NOTE_REQUIRED"); const completed = await validationApp.completePairDecision({ decision: "accept_pair", acceptanceNote: "Проверила рукава рядом и принимаю различие.", reworkComponents: [], explicitConfirmation: true }, meta()); assert.equal(completed.currentValidation.outcome, "accepted_with_deviation"); assert.equal(completed.currentSleeves.sleeve_1.actualCuffToUnderarmLengthCm, "40"); assert.equal(completed.currentSleeves.sleeve_2.actualCuffToUnderarmLengthCm, "41");
});

test("I: rework decision is immutable, presentation-safe, and never mutates Stage 80", async () => {
  const repo = repository(); const { seeded, validationApp } = await seedPair(repo, { actualCuffStitchCount: 42 }); const before = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); await validationApp.startPairReview(meta()); const completed = await validationApp.completePairDecision({ decision: "rework", acceptanceNote: null, reworkComponents: ["sleeve_2"], explicitConfirmation: true }, meta()); const after = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId);
  assert.deepEqual(after, before); assert.equal(completed.currentValidation.status, "rework_required"); assert.deepEqual(completed.nextDestination.componentSlots, ["sleeve_2"]); assert.equal(completed.nextDestination.routePath, "/project-sleeve-physical-execution"); assert.equal(completed.pairValidationBoundary.completed, false);
});

test("J-P: completed result is immutable; exact operation replay is idempotent and conflicting reuse fails", async () => {
  const repo = repository(); const { seeded, validationApp } = await seedPair(repo); const start = meta(); await validationApp.startPairReview(start); const input = { decision: "accept_pair", acceptanceNote: null, reworkComponents: [], explicitConfirmation: true }; await assert.rejects(() => validationApp.completePairDecision(input, start), (error) => error.code === "OPERATION_ID_CONFLICT"); const decision = meta(); await validationApp.completePairDecision(input, decision); const before = await repo.getProjectSleevePairValidation(seeded.projectId, seeded.calculationId); await validationApp.completePairDecision(input, decision); const after = await repo.getProjectSleevePairValidation(seeded.projectId, seeded.calculationId); assert.equal(after.revision, before.revision); assert.equal(after.state.fingerprint, before.state.fingerprint);
  const changed = structuredClone(before.state); changed.decision.acceptanceNote = "rewrite"; assert.throws(() => domain.validateState(changed), (error) => error.code === "DECISION_INVALID" || error.code === "FINGERPRINT_MISMATCH");
});

test("K-R: stale revision and source fingerprints reject concurrent writes", async () => {
  const repo = repository(); const { seeded, validationApp } = await seedPair(repo); await validationApp.startPairReview(meta()); const stored = await repo.getProjectSleevePairValidation(seeded.projectId, seeded.calculationId); const operation = meta(); const next = domain.completeDecision(stored.state, { decision: "accept_pair", acceptanceNote: null, reworkComponents: [], explicitConfirmation: true }, { ...operation, expectedRevision: stored.state.revision, expectedFingerprint: stored.state.fingerprint, expectedReviewFingerprint: stored.state.review.fingerprint }); const aggregate = await repo.getProject(seeded.projectId);
  await assert.rejects(() => repo.saveProjectSleevePairValidation(seeded.projectId, seeded.calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedRepositoryRevision: stored.revision - 1, expectedSource: stored.state.source, timestamp: operation.at, operationId: operation.operationId }), (error) => error.code === "REVISION_CONFLICT");
  const badSource = structuredClone(stored.state.source); badSource.sleeve_1.resultFingerprint = domain.fingerprint({ stale: true }); await assert.rejects(() => repo.saveProjectSleevePairValidation(seeded.projectId, seeded.calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedRepositoryRevision: stored.revision, expectedSource: badSource, timestamp: operation.at, operationId: operation.operationId }), (error) => error.code === "SOURCE_STALE");
});

test("L-O-S: sleeve rework makes prior validation stale, preserves history, and new completion creates a new epoch", async () => {
  const repo = repository(); const { seeded, executionApp, validationApp } = await seedPair(repo); await validationApp.startPairReview(meta()); await validationApp.completePairDecision({ decision: "accept_pair", acceptanceNote: null, reworkComponents: [], explicitConfirmation: true }, meta()); const first = await repo.getProjectSleevePairValidation(seeded.projectId, seeded.calculationId); await executionApp.startComponentRework("sleeve_1", meta()); await assert.rejects(() => validationApp.load(), (error) => error.code === "STAGE80_PAIR_NOT_READY"); await completeSleeve(executionApp, "sleeve_1"); const ready = await validationApp.load(); assert.equal(ready.lifecycle, "ready"); assert.equal(ready.currentValidation.staleCount, 1); const reviewing = await validationApp.startPairReview(meta()); assert.equal(reviewing.lifecycle, "reviewing"); let history = await repo.getProjectSleevePairValidationHistory(seeded.projectId, seeded.calculationId); assert.equal(history.length, 2); assert.equal(history[1].state.predecessorIdentity, history[0].state.identity); assert.equal(history[0].state.fingerprint, first.state.fingerprint); assert.equal(history[1].state.source.sleeve_1.componentEpoch, 2); assert.equal(history[1].state.source.sleeve_2.componentEpoch, 1);
  await validationApp.completePairDecision({ decision: "accept_pair", acceptanceNote: null, reworkComponents: [], explicitConfirmation: true }, meta()); history = await repo.getProjectSleevePairValidationHistory(seeded.projectId, seeded.calculationId); assert.equal(history[0].state.fingerprint, first.state.fingerprint);
  await executionApp.startComponentRework("sleeve_2", meta()); await assert.rejects(() => validationApp.load(), (error) => error.code === "STAGE80_PAIR_NOT_READY"); await completeSleeve(executionApp, "sleeve_2"); const readyAfterSleeve2 = await validationApp.load(); assert.equal(readyAfterSleeve2.currentValidation.staleCount, 2); await validationApp.startPairReview(meta()); history = await repo.getProjectSleevePairValidationHistory(seeded.projectId, seeded.calculationId); assert.equal(history.length, 3); assert.equal(history[2].state.source.sleeve_1.componentEpoch, 2); assert.equal(history[2].state.source.sleeve_2.componentEpoch, 2); assert.equal(history[0].state.fingerprint, first.state.fingerprint);
});

test("T-Z: reload projection is safe, navigation exists, storage stays V4, and forbidden boundaries are absent", async () => {
  let repo = repository(); const { seeded, validationApp } = await seedPair(repo, { actualUpperSleeveCircumferenceCm: "31" }); const view = await validationApp.startPairReview(meta()); await repo.close(); repositories = repositories.filter((item) => item !== repo); repo = repository(); await repo.initialize(); const reloaded = application.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }); assert.deepEqual(await reloaded.reconstructAfterReload(seeded.projectId), view);
  const serialized = JSON.stringify(view); assert.doesNotMatch(serialized, /fingerprint|operationReceipts|repositoryRevision|aggregateRevision|componentEpoch/); assert.equal(view.joinPreparation.available, false); assert.equal(system.DB_VERSION, 4); assert.equal(system.STORE_NAMES.length, 16); assert.equal(system.STORE_NAMES.includes("sleeve_pair_validation"), false);
  const production = ["project-sleeve-pair-validation.js", "project-sleeve-pair-validation-application.js"].map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n"); assert.doesNotMatch(production, /bodyUnderarmStitchCount|underarmAllocationPolicy|combinedYoke|poloPlacket|poloCollar/); assert.match(fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-sleeve-physical-execution.html"), "utf8"), /project-sleeve-pair-validation/);
});
