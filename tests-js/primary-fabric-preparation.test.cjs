"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto"); global.window = globalThis;
require("../src/yarnai/static/project-system.js"); require("../src/yarnai/static/project-details-experience.js"); require("../src/yarnai/static/project-details-collaboration.js"); require("../src/yarnai/static/project-details-closure.js"); require("../src/yarnai/static/project-initialization.js"); require("../src/yarnai/static/swatch-gauge.js"); require("../src/yarnai/static/project-calculation-entry.js"); require("../src/yarnai/static/project-readiness-engine.js"); require("../src/yarnai/static/project-execution-plan.js"); require("../src/yarnai/static/project-execution-plan-workspace.js"); require("../src/yarnai/static/project-execution-start.js"); require("../src/yarnai/static/project-execution-start-workspace.js"); require("../src/yarnai/static/project-execution-first-step.js"); require("../src/yarnai/static/project-execution-next-step.js"); require("../src/yarnai/static/project-execution-next-step-clarification.js"); require("../src/yarnai/static/foundation-section-execution-preparation.js"); require("../src/yarnai/static/foundation-section-execution.js");
const stage72 = require("../src/yarnai/static/foundation-section-measurement.js");
const domain = require("../src/yarnai/static/primary-fabric-preparation.js");
const workspace = require("../src/yarnai/static/primary-fabric-preparation-workspace.js");
const savedProjects = require("../src/yarnai/static/user-workspace-entry.js");
require("../src/yarnai/static/stage70-happy-path-fixture.js"); require("../src/yarnai/static/stage71-happy-path-fixture.js"); require("../src/yarnai/static/stage72-happy-path-fixture.js");
const fixture = require("../src/yarnai/static/stage73-happy-path-fixture.js");

const system = global.YarnAIProjectSystem; const START = Date.parse("2026-08-08T12:00:00.000Z");
let repositories = [];
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; await deleteDatabase(); }); afterEach(async () => { await Promise.all(repositories.map((value) => value.close().catch(() => undefined))); await deleteDatabase(); });
function assessment(aggregate, projectId) { return domain.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, stage71Domain: global.YarnAIFoundationSectionExecution, stage72Domain: stage72, validatedAt: "2026-08-08T12:02:00.000Z" }); }
function stage72Assessment(aggregate, projectId) { return stage72.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, stage71Domain: global.YarnAIFoundationSectionExecution, validatedAt: "2026-08-08T12:01:00.000Z" }); }
async function seedTarget(repo) { return fixture.seedStage73HappyPath({ repository: repo, startedAt: START }); }
function values(extra = {}) { return { mainPattern: "Лицевая гладь", patternRepeat: "1 лицевая петля в каждом ряду", sectionHeightCm: "30", ...extra }; }

test("TARGET_REACHED exposes exactly the authoritative PRIMARY_FABRIC plan step", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await seedTarget(repo); const aggregate = await repo.getProject(seeded.projectId); const ready = assessment(aggregate, seeded.projectId);
  assert.equal(ready.lifecycle, "ready"); assert.deepEqual(ready.requiredInputs, ["main_pattern", "pattern_repeat", "section_height"]); assert.equal(ready.step.sequenceNumber, 3); assert.equal(ready.step.type, "PRIMARY_FABRIC"); assert.equal(ready.knownContext.stitchCount, 100); assert.equal(ready.knownContext.direction, "unknown"); assert.equal(ready.source.stage72SnapshotFingerprint, seeded.measurement.state.completedSnapshot.fingerprint);
});

test("BELOW_TARGET and a merely paused Stage 71 cannot open primary-fabric preparation", async () => {
  const repo = repository(); await repo.initialize(); const paused = await global.YarnAIStage72HappyPathFixture.seedStage72HappyPath({ repository: repo, startedAt: START }); let aggregate = await repo.getProject(paused.projectId);
  let gate = assessment(aggregate, paused.projectId); assert.equal(gate.lifecycle, "blocked"); assert.equal(gate.diagnostic.code, "STAGE72_MISSING");
  let source72 = stage72Assessment(aggregate, paused.projectId); let measurement = await repo.ensureFoundationSectionMeasurement(paused.projectId, paused.calculationId, source72, { expectedProjectRevision: aggregate.project.revision, timestamp: "2026-08-08T12:01:10.000Z" }); aggregate = await repo.getProject(paused.projectId); source72 = stage72Assessment(aggregate, paused.projectId);
  const below = stage72.completeMeasurement(measurement.state, "4,3", { assessment: source72, operationId: system.uuidv7(), timestamp: "2026-08-08T12:01:11.000Z", expectedRevision: measurement.state.revision, expectedFingerprint: measurement.state.fingerprint, explicitConfirmation: true }); await repo.updateFoundationSectionMeasurement(paused.projectId, paused.calculationId, below, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: measurement.revision, expectedDomainRevision: measurement.state.revision, timestamp: "2026-08-08T12:01:11.000Z" });
  aggregate = await repo.getProject(paused.projectId); gate = assessment(aggregate, paused.projectId); assert.equal(gate.lifecycle, "blocked"); assert.equal(gate.diagnostic.code, "TARGET_NOT_REACHED");
});

test("a corrupted late Stage 72 record blocks Stage 73 without displacing physical truth", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await seedTarget(repo); const aggregate = await repo.getProject(seeded.projectId); const corrupted = structuredClone(aggregate); const target = corrupted.progress.find((entry) => entry.kind === stage72.KIND); const late = structuredClone(target); late.progress_id = system.uuidv7(); late.epoch = 2; late.state.epoch = 2; late.state.predecessorIdentity = target.state.identity; corrupted.progress.push(late);
  const gate = assessment(corrupted, seeded.projectId); assert.equal(gate.lifecycle, "blocked"); assert.equal(gate.diagnostic.code, "MEASUREMENT_HISTORY_CONFLICT");
});

test("completed preparation is source-bound, provenance-bearing, immutable, and reloadable", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await seedTarget(repo); let aggregate = await repo.getProject(seeded.projectId); const ready = assessment(aggregate, seeded.projectId); const operationId = system.uuidv7(); const state = domain.createCompletedState(ready, values(), { timestamp: "2026-08-08T12:03:00.000Z", operationId, explicitConfirmation: true });
  assert.equal(state.predecessorStage72Identity, ready.source.stage72StateIdentity); assert.equal(state.preparation.step.identity, ready.step.identity); assert.equal(state.preparation.mainPattern.origin, "user_provided"); assert.equal(state.preparation.patternRepeat.origin, "user_provided"); assert.equal(state.preparation.sectionTarget.origin, "user_provided");
  const saved = await repo.ensurePrimaryFabricPreparation(seeded.projectId, seeded.calculationId, state, { operationId, timestamp: "2026-08-08T12:03:00.000Z", expectedProjectRevision: aggregate.project.revision }); assert.equal(saved.state.fingerprint, state.fingerprint);
  aggregate = await repo.getProject(seeded.projectId); const current = await repo.getPrimaryFabricPreparation(seeded.projectId, seeded.calculationId); assert.equal(current.state.fingerprint, state.fingerprint); assert.equal(domain.validateProgressState(current.state, { assessment: assessment(aggregate, seeded.projectId) }).lifecycle, "completed");
  await assert.rejects(() => repo.updatePrimaryFabricPreparation(seeded.projectId, seeded.calculationId, state, { expectedRevision: 1 }), (error) => error.code === "PRIMARY_FABRIC_PREPARATION_IMMUTABLE");
});

test("double submit is idempotent while operation reuse and stale alternatives fail closed", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await seedTarget(repo); const aggregate = await repo.getProject(seeded.projectId); const ready = assessment(aggregate, seeded.projectId); const operationId = system.uuidv7(); const state = domain.createCompletedState(ready, values(), { timestamp: "2026-08-08T12:03:00.000Z", operationId, explicitConfirmation: true });
  const first = await repo.ensurePrimaryFabricPreparation(seeded.projectId, seeded.calculationId, state, { operationId, timestamp: "2026-08-08T12:03:00.000Z", expectedProjectRevision: aggregate.project.revision }); const replay = await repo.ensurePrimaryFabricPreparation(seeded.projectId, seeded.calculationId, state, { operationId, timestamp: "2026-08-08T12:03:00.000Z", expectedProjectRevision: aggregate.project.revision }); assert.equal(replay.progress_id, first.progress_id);
  const reused = domain.createCompletedState(ready, values({ mainPattern: "Платочная вязка" }), { timestamp: "2026-08-08T12:03:00.000Z", operationId, explicitConfirmation: true }); await assert.rejects(() => repo.ensurePrimaryFabricPreparation(seeded.projectId, seeded.calculationId, reused, { operationId }), (error) => error.code === "OPERATION_ID_CONFLICT");
  const stale = domain.createCompletedState(ready, values({ sectionHeightCm: "31" }), { timestamp: "2026-08-08T12:03:01.000Z", operationId: system.uuidv7(), explicitConfirmation: true }); await assert.rejects(() => repo.ensurePrimaryFabricPreparation(seeded.projectId, seeded.calculationId, stale, { expectedProjectRevision: aggregate.project.revision }), (error) => error.code === "PRIMARY_FABRIC_PREPARATION_IMMUTABLE" || error.code === "REVISION_CONFLICT");
});

test("saved-project and user-workspace resolvers move TARGET_REACHED to Stage 73", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await seedTarget(repo); const aggregate = await repo.getProject(seeded.projectId); const destination = `${domain.ROUTE_PATH}?project=${seeded.projectId}`;
  const direct = savedProjects.primaryFabricPreparationNextAction(aggregate.progress, seeded.projectId); assert.equal(direct.action, "prepare-primary-fabric"); assert.equal(direct.destination, destination);
  const resolved = savedProjects.determineNextAction({ projectId: seeded.projectId, initializationAssessment: { verdict: "ready", current: true, canContinue: true, existing: { lifecycle: "initialized" } }, materialState: "ready", progressRecords: aggregate.progress }); assert.equal(resolved.destination, destination); assert.notEqual(resolved.destination, stage72.ROUTE_PATH);
  const card = savedProjects.buildWorkspaceViewModel([{ project_id: seeded.projectId, title: "Проект", revision: 1, workspace_status: "ACTIVE", workspace_foundation_measurement_status: "completed_target", workspace_primary_fabric_preparation_status: "ready" }], []); assert.equal(card.projects[0].action.href, destination);
});

test("workspace uses one meaningful save action and does not invent a direction question", async () => {
  class Element { constructor() { this.hidden = true; this.disabled = false; this.textContent = ""; this.value = ""; this.attributes = {}; } setAttribute(name, value) { this.attributes[name] = String(value); } focus() {} }
  const names = ["root", "loading", "blocked", "blockedMessage", "content", "stitches", "method", "tool", "direction", "form", "pattern", "repeat", "height", "patternError", "repeatError", "heightError", "summary", "save", "formError", "completed", "completedSummary"]; const ui = Object.fromEntries(names.map((name) => [name, new Element()])); const controller = workspace.createController({ domain, system: {}, document: {}, globalObject: {}, ui, stage63Domain: {}, stage65Domain: {}, stage66Domain: {}, stage67Domain: {}, stage68Domain: {}, stage69Domain: {}, stage70Domain: {}, stage71Domain: {}, stage72Domain: {} });
  const repo = repository(); await repo.initialize(); const seeded = await seedTarget(repo); const aggregate = await repo.getProject(seeded.projectId); const ready = { lifecycle: "ready", assessment: assessment(aggregate, seeded.projectId) }; controller.renderReady(ready); assert.equal(ui.direction.textContent, "не зафиксировано в плане"); assert.equal(ui.save.disabled, true);
  ui.pattern.value = "Лицевая гладь"; ui.repeat.value = "1 лицевая петля"; ui.height.value = "30"; controller.renderValidation(); assert.equal(ui.save.disabled, false); assert.match(ui.summary.textContent, /30 см/); assert.equal(Object.keys(ui).some((key) => /review/i.test(key)), false);
});

test("fixture reaches TARGET_REACHED through production APIs and opens the semantic route", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await seedTarget(repo); assert.equal(seeded.measurement.state.completedSnapshot.result, "TARGET_REACHED"); assert.equal(seeded.assessment73.lifecycle, "ready"); assert.match(seeded.url, /\/project-primary-fabric-preparation\?project=/); assert.equal(await repo.getPrimaryFabricPreparation(seeded.projectId, seeded.calculationId), null);
});
