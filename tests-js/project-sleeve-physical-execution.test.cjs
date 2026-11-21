"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");
global.window = globalThis;
[
  "project-system", "project-details-experience", "project-details-collaboration", "project-details-closure", "project-initialization", "swatch-gauge", "project-calculation-entry", "project-readiness-engine", "project-execution-plan", "project-execution-plan-workspace", "project-execution-start", "project-execution-start-workspace", "project-execution-first-step", "project-execution-next-step", "project-execution-next-step-clarification", "foundation-section-execution-preparation", "foundation-section-execution", "foundation-section-measurement", "primary-fabric-preparation", "primary-fabric-execution", "primary-fabric-measurement", "project-next-section-planning", "project-construction-strategy-planning", "project-shaping-policy-planning", "project-sleeve-target-geometry-planning", "project-sleeve-target-geometry-planning-application", "project-sleeve-physical-execution", "project-sleeve-physical-execution-application",
].forEach((name) => require(`../src/yarnai/static/${name}.js`));
["stage70", "stage71", "stage72", "stage73", "stage74", "stage75", "stage76", "stage77", "stage78"].forEach((stage) => require(`../src/yarnai/static/${stage}-happy-path-fixture.js`));

const system = global.YarnAIProjectSystem;
const stage78 = global.YarnAIProjectShapingPolicyPlanning;
const planning = global.YarnAIProjectSleeveTargetGeometryPlanning;
const planningApplication = global.YarnAIProjectSleeveTargetGeometryPlanningApplication;
const domain = global.YarnAIProjectSleevePhysicalExecution;
const application = global.YarnAIProjectSleevePhysicalExecutionApplication;
const START = Date.parse("2026-08-09T08:00:00.000Z");
let repositories = []; let tick = 0;
function meta() { return { at: new Date(START + (++tick) * 1000).toISOString(), operationId: system.uuidv7() }; }
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; tick = 0; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((value) => value.close().catch(() => undefined))); await deleteDatabase(); });

async function seedCompleted79(repo) {
  await repo.initialize();
  const seeded = await global.YarnAIStage78HappyPathFixture.seedStage78HappyPath({ repository: repo, startedAt: START });
  let aggregate = await repo.getProject(seeded.projectId); let operation = meta();
  const snapshot78 = stage78.createCompletedSnapshot(seeded.assessment78, { policy: "raglan_synchronized" }, { timestamp: operation.at, operationId: operation.operationId, explicitConfirmation: true });
  await repo.ensureProjectShapingPolicyPlanning(seeded.projectId, seeded.calculationId, stage78.createProgressState(snapshot78), { expectedProjectRevision: aggregate.project.revision, timestamp: operation.at, operationId: operation.operationId });
  const app = planningApplication.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true });
  await app.loadOrStart(seeded.projectId); await app.collectCuffCircumference("20", meta()); await app.collectUpperCircumference("30", meta()); await app.collectCuffToUnderarmLength("40", meta());
  const current = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId);
  const pattern = { ...current.state.construction.mainPattern, source_identity: "stage79:test-cuff", source_fingerprint: planning.fingerprint({ purpose: "stage80-test-cuff" }), origin: "user_override" };
  await app.overrideCuff({ pattern, targetHeightCm: "5", transitionIdentity: "cuff-to-main-same-count-pattern-change:v1" }, meta());
  await app.bindCuffGauge({ explicitConfirmation: true }, meta()); await app.bindMainGauge({ explicitConfirmation: true }, meta());
  const review = await app.enterReview({}, meta()); await app.confirmReview(review.review.reviewFingerprint, meta());
  return seeded;
}
function controller(repo, seeded) { return application.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }); }
const ACTUALS = Object.freeze({ actualCuffStitchCount: 40, actualUnderarmFullTubeStitchCount: 60, actualCuffToUnderarmLengthCm: "40", actualCuffCircumferenceCm: "20", actualUpperSleeveCircumferenceCm: "30", actualIncreaseEventCount: 10, completionBoundary: domain.COMPLETION_BOUNDARY });
async function reachReview(app, slot = "sleeve_1") { await app.confirmCuffCount(slot, ACTUALS.actualCuffStitchCount, meta()); await app.declareTargetReached(slot, meta()); await app.openResultReview(slot, meta()); return app.editResultDraft(slot, ACTUALS, meta()); }
async function completeSleeve(app, slot) { const loaded = await app.load(); if (loaded.components[slot].lifecycle === "ready") await app.startComponent(slot, meta()); await reachReview(app, slot); return app.completeComponent(slot, meta()); }

test("A-D: completed Stage 79 projects open with no preliminary input and first action starts sleeve_1", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded);
  const ready = await app.load(seeded.projectId); assert.equal(ready.lifecycle, "ready"); assert.equal(ready.firstAction, "start_sleeve_1_from_saved_plan"); assert.equal(ready.primaryActionLabel, "Начать рукав 1 по сохранённому плану");
  assert.equal(await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId), null);
  const started = await app.startComponent("sleeve_1", meta()); assert.equal(started.components.sleeve_1.lifecycle, "in_progress"); assert.equal(started.components.sleeve_2.lifecycle, "ready");
  const stored = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); const importedUnknown = structuredClone(stored.state); importedUnknown.preparation.unknownField = true; assert.throws(() => domain.validateState(importedUnknown), (error) => error.code === "PREPARATION_INVALID");
});

test("E-H: planned values remain comparisons and actuals appear only after explicit physical confirmations", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); let view = await app.startComponent("sleeve_1", meta());
  assert.equal(view.preparation.planned.underarmFullTubeStitchCount, 60); assert.equal(view.components.sleeve_1.completedResult, null); assert.equal(view.components.sleeve_1.progress.actualCuffStitchCount, null);
  await app.confirmCuffCount("sleeve_1", 40, meta()); await app.declareTargetReached("sleeve_1", meta()); view = await app.openResultReview("sleeve_1", meta());
  assert.equal(view.components.sleeve_1.lifecycle, "reviewing_result"); assert.equal(view.components.sleeve_1.resultDraft.actualUnderarmFullTubeStitchCount, null);
  view = await app.editResultDraft("sleeve_1", ACTUALS, meta()); assert.equal(view.components.sleeve_1.resultDraft.actualUnderarmFullTubeStitchCount, 60);
});

test("F-G: pause/resume and target_reached transitions fail closed", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); await app.startComponent("sleeve_1", meta());
  let view = await app.pauseComponent("sleeve_1", meta()); assert.equal(view.components.sleeve_1.lifecycle, "paused");
  await assert.rejects(() => app.declareTargetReached("sleeve_1", meta()), (error) => error.code === "TRANSITION_INVALID");
  view = await app.resumeComponent("sleeve_1", meta()); assert.equal(view.components.sleeve_1.lifecycle, "in_progress"); await app.confirmCuffCount("sleeve_1", 40, meta());
  view = await app.declareTargetReached("sleeve_1", meta()); assert.equal(view.components.sleeve_1.lifecycle, "target_reached"); assert.equal(view.components.sleeve_1.completedResult, null);
});

test("H-K: review completion freezes every required actual result field", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); await app.startComponent("sleeve_1", meta()); await reachReview(app);
  const completed = await app.completeComponent("sleeve_1", meta()); const result = completed.components.sleeve_1.completedResult;
  for (const [key, value] of Object.entries(ACTUALS)) assert.equal(result[key], value); assert.equal(result.underarmStitchesHeldOrRemoved, false); assert.equal(completed.components.sleeve_1.lifecycle, "completed");
  await assert.rejects(() => app.editResultDraft("sleeve_1", { actualCuffCircumferenceCm: "21" }, meta()), (error) => error.code === "TRANSITION_INVALID");
});

test("L-O: sleeves own independent states, revisions, epochs, and rework histories", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); await app.startComponent("sleeve_1", meta()); await app.startComponent("sleeve_2", meta());
  let stored = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); const sleeve2Before = structuredClone(stored.state.components.sleeve_2);
  await app.confirmCuffCount("sleeve_1", 40, meta()); stored = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); assert.deepEqual(stored.state.components.sleeve_2, sleeve2Before); assert.notEqual(stored.state.components.sleeve_1.attempts[0].revision, stored.state.components.sleeve_2.attempts[0].revision);
  await app.declareTargetReached("sleeve_1", meta()); await app.openResultReview("sleeve_1", meta()); await app.editResultDraft("sleeve_1", ACTUALS, meta()); await app.completeComponent("sleeve_1", meta()); await reachReview(app, "sleeve_2"); const pairReady = await app.completeComponent("sleeve_2", meta()); assert.equal(pairReady.lifecycle, "awaiting_pair_validation"); assert.equal(pairReady.pairValidation.status, "awaiting_pair_validation"); assert.equal(pairReady.pairValidation.performed, false);
  stored = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); const sleeve2Result = structuredClone(stored.state.components.sleeve_2.attempts[0].completedResultSnapshot); const sleeve1Old = structuredClone(stored.state.components.sleeve_1.attempts[0].completedResultSnapshot);
  await app.startComponentRework("sleeve_1", meta()); stored = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId);
  assert.equal(stored.state.components.sleeve_1.attempts.length, 2); assert.equal(stored.state.components.sleeve_2.attempts.length, 1); assert.deepEqual(stored.state.components.sleeve_1.attempts[0].completedResultSnapshot, sleeve1Old); assert.deepEqual(stored.state.components.sleeve_2.attempts[0].completedResultSnapshot, sleeve2Result);
});

test("P-Q: exact operation replay is idempotent and conflicting reuse is rejected", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); const operation = meta();
  await app.startComponent("sleeve_1", operation); const before = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); await app.startComponent("sleeve_1", operation); const after = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); assert.equal(after.revision, before.revision); assert.equal(after.state.fingerprint, before.state.fingerprint);
  await assert.rejects(() => app.startComponent("sleeve_2", operation), (error) => error.code === "OPERATION_ID_CONFLICT");
});

test("R: aggregate, component, and repository stale revisions are rejected", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); await app.startComponent("sleeve_1", meta()); const stored = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId); const operation = meta();
  assert.throws(() => domain.confirmCuffCount(stored.state, "sleeve_1", { actualCuffStitchCount: 40 }, { ...operation, expectedAggregateRevision: 0 }), (error) => error.code === "AGGREGATE_REVISION_CONFLICT");
  const next = domain.confirmCuffCount(stored.state, "sleeve_1", { actualCuffStitchCount: 40 }, { ...operation, expectedAggregateRevision: stored.state.aggregateRevision, expectedComponentRevision: 1 });
  const aggregate = await repo.getProject(seeded.projectId);
  await assert.rejects(() => repo.saveProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedRepositoryRevision: stored.revision - 1, timestamp: operation.at, operationId: operation.operationId }), (error) => error.code === "REVISION_CONFLICT");
});

test("S-T: source fingerprint supersession blocks silent continuation and preserves prior history", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); await app.startComponent("sleeve_1", meta()); const first = await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId);
  const planningApp = planningApplication.createController({ repository: repo, projectId: seeded.projectId, throwErrors: true }); await planningApp.startNewEpoch(meta());
  await planningApp.collectCuffCircumference("20", meta()); await planningApp.collectUpperCircumference("30", meta()); await planningApp.collectCuffToUnderarmLength("41", meta());
  const current79 = await repo.getProjectSleeveTargetGeometryPlanning(seeded.projectId, seeded.calculationId); const replacementPattern = { ...current79.state.construction.mainPattern, source_identity: "stage79:test-cuff-2", source_fingerprint: planning.fingerprint({ purpose: "stage80-test-cuff-2" }), origin: "user_override" };
  await planningApp.overrideCuff({ pattern: replacementPattern, targetHeightCm: "5", transitionIdentity: "cuff-to-main-same-count-pattern-change:v1" }, meta()); await planningApp.bindCuffGauge({ explicitConfirmation: true }, meta()); await planningApp.bindMainGauge({ explicitConfirmation: true }, meta()); const review = await planningApp.enterReview({}, meta()); await planningApp.confirmReview(review.review.reviewFingerprint, meta());
  await assert.rejects(() => app.load(), (error) => error.code === "SOURCE_SUPERSEDED"); let history = await repo.getProjectSleevePhysicalExecutionHistory(seeded.projectId, seeded.calculationId); assert.equal(history.length, 1); assert.equal(history[0].state.fingerprint, first.state.fingerprint);
  const next = await app.startSupersedingPreparation("sleeve_1", meta()); assert.equal(next.components.sleeve_1.lifecycle, "in_progress"); history = await repo.getProjectSleevePhysicalExecutionHistory(seeded.projectId, seeded.calculationId); assert.equal(history.length, 2); assert.equal(history[1].state.predecessorPreparationIdentity, history[0].state.preparation.identity); assert.equal(history[0].state.fingerprint, first.state.fingerprint);
});

test("U-V: reload restores both branches and underarm actual count is never copied from plan", async () => {
  let repo = repository(); const seeded = await seedCompleted79(repo); let app = controller(repo, seeded); const view = await app.startComponent("sleeve_1", meta()); await repo.close(); repositories = repositories.filter((item) => item !== repo); repo = repository(); await repo.initialize(); app = controller(repo, seeded); assert.deepEqual(await app.reconstructAfterReload(seeded.projectId), view);
  const state = (await repo.getProjectSleevePhysicalExecution(seeded.projectId, seeded.calculationId)).state; assert.equal(state.components.sleeve_1.attempts[0].resultDraft, null); assert.equal(JSON.stringify(state).includes('"actualUnderarmFullTubeStitchCount":60'), false);
});

test("W-X: Stage 80 invents no tolerance, pair validation, allocation, join, or yoke execution", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); await app.startComponent("sleeve_1", meta()); const view = await completeSleeve(app, "sleeve_1"); assert.equal(view.preparation.tolerancePolicy, null); assert.equal(view.pairValidation.performed, false); assert.equal(view.joinPreparation.available, false);
  const production = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-sleeve-physical-execution.js"), "utf8"); assert.doesNotMatch(production, /underarmAllocation|combinedYokeStitchCount|heldUnderarmStitches|acceptPairDeviation|validatePair/);
});

test("Y: presentation projection omits fingerprints, operation receipts, and storage revisions", async () => {
  const repo = repository(); const seeded = await seedCompleted79(repo); const app = controller(repo, seeded); const view = await app.startComponent("sleeve_1", meta()); const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /fingerprint|operationReceipt|repositoryRevision|aggregateRevision/); assert.match(serialized, /sleeve_1/); assert.equal(view.preparation.planned.cuffStitchCount, 40);
});

test("storage remains IndexedDB v4 and uses the existing progress store", () => {
  assert.equal(system.DB_VERSION, 4); assert.equal(system.STORE_NAMES.length, 16); assert.equal(system.STORE_NAMES.includes("sleeve_execution"), false);
  const production = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-system.js"), "utf8"); assert.equal((production.match(/createObjectStore\s*\(/g) || []).length, 1);
});
