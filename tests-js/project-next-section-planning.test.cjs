"use strict";

const assert = require("node:assert/strict"); const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto"); global.window = globalThis;
[
  "project-system", "project-details-experience", "project-details-collaboration", "project-details-closure", "project-initialization", "swatch-gauge", "project-calculation-entry", "project-readiness-engine", "project-execution-plan", "project-execution-plan-workspace", "project-execution-start", "project-execution-start-workspace", "project-execution-first-step", "project-execution-next-step", "project-execution-next-step-clarification", "foundation-section-execution-preparation", "foundation-section-execution", "foundation-section-measurement", "primary-fabric-preparation", "primary-fabric-execution", "primary-fabric-measurement", "project-next-section-planning",
].forEach((name) => require(`../src/yarnai/static/${name}.js`));
const domain = global.YarnAIProjectNextSectionPlanning; const measurement = global.YarnAIPrimaryFabricMeasurement; const navigation = require("../src/yarnai/static/user-workspace-entry.js");
["stage70", "stage71", "stage72", "stage73", "stage74", "stage75", "stage76"].forEach((stage) => require(`../src/yarnai/static/${stage}-happy-path-fixture.js`));
const system = global.YarnAIProjectSystem; const START = Date.parse("2026-08-08T16:00:00.000Z"); let repositories = [];
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; await deleteDatabase(); }); afterEach(async () => { await Promise.all(repositories.map((value) => value.close().catch(() => undefined))); await deleteDatabase(); });
function dependencies() { return { stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, stage71Domain: global.YarnAIFoundationSectionExecution, stage72Domain: global.YarnAIFoundationSectionMeasurement, stage73Domain: global.YarnAIPrimaryFabricPreparation, stage74Domain: global.YarnAIPrimaryFabricExecution, stage75Domain: measurement }; }
function assess(aggregate, projectId, validatedAt = "2026-08-08T16:10:00.000Z") { return domain.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, ...dependencies(), validatedAt }); }

test("completed Stage 75 TARGET_REACHED is required and the exhausted predecessor is accepted as a normal boundary", async () => {
  const repo = repository(); await repo.initialize(); const before75 = await global.YarnAIStage75HappyPathFixture.seedStage75HappyPath({ repository: repo, startedAt: START }); let aggregate = await repo.getProject(before75.projectId);
  assert.equal(assess(aggregate, before75.projectId).diagnostic.code, "STAGE75_REQUIRED");
  const seeded = await global.YarnAIStage76HappyPathFixture.seedStage76HappyPath({ repository: repo, startedAt: START + 100000 });
  assert.equal(seeded.assessment76.lifecycle, "ready"); assert.equal(seeded.assessment76.firstMissingInput, "construction_direction"); assert.equal(seeded.assessment76.source.predecessorPlanIdentity, seeded.assessment76.source.stage75StateIdentity ? seeded.assessment76.source.predecessorPlanIdentity : null);
  assert.deepEqual(seeded.assessment76.knownInputs, { garmentType: "свитер", garmentLengthCm: 62, armholeDepthCm: 21, necklineDepthCm: 10, sleeveLengthCm: 57, workingWidthCm: 50, stitchCount: 100, stitchesPer10Cm: 20, rowsPer10Cm: 28, workingMethod: "in_round", foundationType: "ribbing", foundationHeightCm: 5, mainPattern: "Лицевая гладь", patternRepeat: "Вязать все петли лицевыми по кругу", primaryFabricHeightCm: 30 });
  assert.deepEqual(seeded.assessment76.derivations, { bottomUpArmholeStartCm: 41, bottomUpAdditionalHeightCm: 11, condition: "only_if_direction_bottom_up_and_no_intermediate_shaping" });
});

test("BELOW_TARGET cannot open plan extension", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await global.YarnAIStage75HappyPathFixture.seedStage75HappyPath({ repository: repo, startedAt: START }); let aggregate = await repo.getProject(seeded.projectId);
  let record = await repo.ensurePrimaryFabricMeasurement(seeded.projectId, seeded.calculationId, seeded.assessment75, { expectedProjectRevision: aggregate.project.revision, timestamp: "2026-08-08T16:01:00.000Z" }); aggregate = await repo.getProject(seeded.projectId);
  const source75 = measurement.assessSource({ projectId: seeded.projectId, project: aggregate.project, progress: aggregate.progress, ...dependencies(), validatedAt: "2026-08-08T16:01:01.000Z" }); const operationId = system.uuidv7(); const below = measurement.completeMeasurement(record.state, 29.9, { assessment: source75, operationId, timestamp: "2026-08-08T16:01:01.000Z", expectedRevision: record.state.revision, expectedFingerprint: record.state.fingerprint, explicitConfirmation: true });
  await repo.updatePrimaryFabricMeasurement(seeded.projectId, seeded.calculationId, below, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: record.revision, expectedDomainRevision: record.state.revision, timestamp: "2026-08-08T16:01:01.000Z", operationId }); aggregate = await repo.getProject(seeded.projectId);
  assert.equal(assess(aggregate, seeded.projectId).diagnostic.code, "STAGE75_BELOW_TARGET");
});

test("snapshot records one missing input and does not invent or duplicate an execution plan", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await global.YarnAIStage76HappyPathFixture.seedStage76HappyPath({ repository: repo, startedAt: START }); const aggregate = await repo.getProject(seeded.projectId);
  const predecessorBefore = structuredClone(aggregate.progress.find((entry) => entry.kind === global.YarnAIProjectExecutionPlan.KIND).state); const at = "2026-08-08T16:03:00.000Z"; const operationId = system.uuidv7(); const snapshot = domain.createCompletedSnapshot(seeded.assessment76, { direction: "bottom_up" }, { timestamp: at, operationId, explicitConfirmation: true });
  assert.equal(snapshot.boundary.predecessorPlanExhausted, true); assert.equal(snapshot.boundary.authoritativeResult, "TARGET_REACHED"); assert.equal(snapshot.boundary.successor, null); assert.equal(snapshot.clarification.value, "bottom_up");
  assert.equal(snapshot.planOutcome.status, "awaiting_more_inputs"); assert.equal(snapshot.planOutcome.newPlan, null); assert.equal(snapshot.planOutcome.nextMissingInput, "construction_strategy"); assert.deepEqual(snapshot.remainingMissingInputs, ["construction_strategy", "shaping_policy", "joining_strategy", "finishing_strategy"]);
  const saved = await repo.ensureProjectNextSectionPlanning(seeded.projectId, seeded.calculationId, domain.createProgressState(snapshot), { expectedProjectRevision: aggregate.project.revision, timestamp: at, operationId });
  const after = await repo.getProject(seeded.projectId); assert.deepEqual(after.progress.find((entry) => entry.kind === global.YarnAIProjectExecutionPlan.KIND).state, predecessorBefore); assert.equal(after.progress.filter((entry) => entry.kind === global.YarnAIProjectExecutionPlan.KIND).length, 1); assert.equal(after.progress.some((entry) => entry.kind === "PRIMARY_FABRIC_EXECUTION" && entry.state?.revision > 3), false); assert.equal(saved.state.snapshot.fingerprint, snapshot.fingerprint);
});

test("predecessor identity/fingerprint, stale mutations, unsafe records and missing project context fail closed", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await global.YarnAIStage76HappyPathFixture.seedStage76HappyPath({ repository: repo, startedAt: START }); const aggregate = await repo.getProject(seeded.projectId);
  for (const mutate of [
    (value) => { value.progress.find((entry) => entry.kind === global.YarnAIProjectExecutionPlan.KIND).state.history[0].fingerprint = "fnv1a32:00000000"; },
    (value) => { value.progress.find((entry) => entry.kind === measurement.KIND).conflict_id = system.uuidv7(); },
    (value) => { value.project.active_calculation_id = null; },
  ]) { const changed = structuredClone(aggregate); mutate(changed); const result = assess(changed, seeded.projectId); assert.equal(result.lifecycle, "blocked"); }
  const snapshot = domain.createCompletedSnapshot(seeded.assessment76, { direction: "top_down" }, { timestamp: "2026-08-08T16:04:00.000Z", operationId: system.uuidv7(), explicitConfirmation: true }); const stale = structuredClone(snapshot); stale.source.predecessorPlanFingerprint = "fnv1a32:00000000"; stale.fingerprint = domain.fingerprint((({ fingerprint, ...rest }) => rest)(stale)); assert.throws(() => domain.validateBinding(stale, seeded.assessment76), (error) => error.code === "SOURCE_STALE");
});

test("repository uses optimistic revision, immutable replay semantics, and survives reload", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await global.YarnAIStage76HappyPathFixture.seedStage76HappyPath({ repository: repo, startedAt: START }); let aggregate = await repo.getProject(seeded.projectId); const at = "2026-08-08T16:05:00.000Z"; const operationId = system.uuidv7(); const snapshot = domain.createCompletedSnapshot(seeded.assessment76, { direction: "bottom_up" }, { timestamp: at, operationId, explicitConfirmation: true }); const state = domain.createProgressState(snapshot);
  await assert.rejects(() => repo.ensureProjectNextSectionPlanning(seeded.projectId, seeded.calculationId, state, { expectedProjectRevision: aggregate.project.revision - 1, timestamp: at, operationId }), (error) => error.code === "REVISION_CONFLICT");
  const saved = await repo.ensureProjectNextSectionPlanning(seeded.projectId, seeded.calculationId, state, { expectedProjectRevision: aggregate.project.revision, timestamp: at, operationId }); const replay = await repo.ensureProjectNextSectionPlanning(seeded.projectId, seeded.calculationId, state, { timestamp: at, operationId }); assert.equal(replay.progress_id, saved.progress_id);
  const conflicting = domain.createCompletedSnapshot(seeded.assessment76, { direction: "top_down" }, { timestamp: "2026-08-08T16:05:01.000Z", operationId, explicitConfirmation: true }); await assert.rejects(() => repo.ensureProjectNextSectionPlanning(seeded.projectId, seeded.calculationId, domain.createProgressState(conflicting), { timestamp: "2026-08-08T16:05:01.000Z", operationId }), (error) => error.code === "OPERATION_ID_CONFLICT");
  await assert.rejects(() => repo.updateProjectNextSectionPlanning(seeded.projectId, seeded.calculationId, state, { expectedRevision: 1 }), (error) => error.code === "PROJECT_NEXT_SECTION_PLANNING_IMMUTABLE");
  await repo.close(); repositories = repositories.filter((value) => value !== repo); const reopened = repository(); await reopened.initialize(); const loaded = await reopened.getProjectNextSectionPlanning(seeded.projectId, seeded.calculationId); assert.equal(domain.validateProgressState(loaded.state).snapshot.clarification.value, "bottom_up");
});

test("navigation after Stage 75 targets planning and never a fabricated execution route", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await global.YarnAIStage76HappyPathFixture.seedStage76HappyPath({ repository: repo, startedAt: START }); let aggregate = await repo.getProject(seeded.projectId); const action = navigation.primaryFabricMeasurementNextAction(aggregate.progress, seeded.projectId);
  assert.equal(action.action, "plan-next-section"); assert.equal(action.destination, `/project-next-section-planning?project=${seeded.projectId}`); assert.doesNotMatch(action.destination, /execution/);
  const at = "2026-08-08T16:06:00.000Z"; const operationId = system.uuidv7(); const snapshot = domain.createCompletedSnapshot(seeded.assessment76, { direction: "bottom_up" }, { timestamp: at, operationId, explicitConfirmation: true }); await repo.ensureProjectNextSectionPlanning(seeded.projectId, seeded.calculationId, domain.createProgressState(snapshot), { expectedProjectRevision: aggregate.project.revision, timestamp: at, operationId }); aggregate = await repo.getProject(seeded.projectId); const savedAction = navigation.nextSectionPlanningNextAction(aggregate.progress, seeded.projectId); assert.equal(savedAction.action, "choose-construction-strategy"); assert.equal(savedAction.destination, `/project-construction-strategy-planning?project=${seeded.projectId}`);
});
