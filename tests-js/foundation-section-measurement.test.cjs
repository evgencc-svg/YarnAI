"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto"); global.window = globalThis;
require("../src/yarnai/static/project-system.js"); require("../src/yarnai/static/project-details-experience.js"); require("../src/yarnai/static/project-details-collaboration.js"); require("../src/yarnai/static/project-details-closure.js"); require("../src/yarnai/static/project-initialization.js"); require("../src/yarnai/static/swatch-gauge.js"); require("../src/yarnai/static/project-calculation-entry.js"); require("../src/yarnai/static/project-readiness-engine.js"); require("../src/yarnai/static/project-execution-plan.js"); require("../src/yarnai/static/project-execution-plan-workspace.js"); require("../src/yarnai/static/project-execution-start.js"); require("../src/yarnai/static/project-execution-start-workspace.js"); require("../src/yarnai/static/project-execution-first-step.js"); require("../src/yarnai/static/project-execution-next-step.js"); require("../src/yarnai/static/project-execution-next-step-clarification.js"); require("../src/yarnai/static/foundation-section-execution-preparation.js");
const execution = require("../src/yarnai/static/foundation-section-execution.js");
const domain = require("../src/yarnai/static/foundation-section-measurement.js");
const workspace = require("../src/yarnai/static/foundation-section-measurement-workspace.js");
const savedProjects = require("../src/yarnai/static/user-workspace-entry.js");
require("../src/yarnai/static/stage70-happy-path-fixture.js"); require("../src/yarnai/static/stage71-happy-path-fixture.js");
const fixture = require("../src/yarnai/static/stage72-happy-path-fixture.js");

const system = global.YarnAIProjectSystem;
const PROJECT = "019fc3ba-7200-71c3-b7f9-bd06e3bff304"; const CALCULATION = "019fc3ba-7200-71c3-b7f9-bd06e3bff305"; const EXECUTION_PROGRESS = "019fc3ba-7200-71c3-b7f9-bd06e3bff306";
const IDS = ["019fc3ba-7200-71c3-b7f9-bd06e3bff307", "019fc3ba-7200-71c3-b7f9-bd06e3bff308", "019fc3ba-7200-71c3-b7f9-bd06e3bff309", "019fc3ba-7200-71c3-b7f9-bd06e3bff30a"];
const TIMES = ["2026-08-08T12:00:00.000Z", "2026-08-08T12:01:00.000Z", "2026-08-08T12:02:00.000Z", "2026-08-08T12:03:00.000Z", "2026-08-08T12:04:00.000Z"];
let repositories = [];
function context() { return { foundationType: "ribbing", ribPattern: { kind: "rib_1x1", repeatLength: 2 }, workingMethod: { value: "in_round" }, stitchAllocation: { totalCastOn: 100, edgeCount: 0, workingStitches: 100, repeatLength: 2, repeatCount: 50 }, toolConfirmation: { label: "круговые спицы" }, instructionSource: { text: "1 лицевая, 1 изнаночная" }, measurementPolicy: { authority: "physical_measurement", target: { kind: "height", value: 5, unit: "cm" }, origin: "physical_start_of_ribbing_after_cast_on_to_current_top_edge", onNeedles: true, tensionState: "natural_unstretched", comparison: "at_least", toleranceCm: null }, target: { kind: "height", value: 5, unit: "cm" } }; }
function assessment(overrides = {}) { const valueContext = context(); const executionSource = { stage70ProgressIdentity: "source", revisions: { stage69: 1 } }; return { lifecycle: "ready", projectId: PROJECT, calculationId: CALCULATION, projectRevision: 9, source: { executionProgressIdentity: EXECUTION_PROGRESS, executionProgressRevision: 3, executionStateIdentity: `${PROJECT}:execution`, executionStateRevision: 3, executionStateFingerprint: "fnv1a32:1234abcd", executionSource, executionSourceFingerprint: domain.fingerprint(executionSource), executionPlanFingerprint: domain.fingerprint({ ...valueContext, rowEstimate: null }), measurementPolicyFingerprint: domain.fingerprint(valueContext.measurementPolicy) }, context: valueContext, executionState: { lifecycle: "paused" }, ...overrides }; }
function metadata(state, index, source = assessment()) { return { assessment: source, operationId: IDS[index], timestamp: TIMES[index + 1], expectedRevision: state.revision, expectedFingerprint: state.fingerprint, explicitConfirmation: true }; }
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; await deleteDatabase(); }); afterEach(async () => { await Promise.all(repositories.map((value) => value.close().catch(() => undefined))); await deleteDatabase(); });

test("strict presentation parser accepts decimal dot/comma and rejects non-physical values", () => {
  assert.equal(domain.parseMeasurementInput("4.9"), 4.9); assert.equal(domain.parseMeasurementInput("4,9"), 4.9); assert.equal(domain.parseMeasurementInput("5.0"), 5);
  for (const value of ["", "0", "-1", "NaN", "Infinity", "1e2", "4,9.1", NaN, Infinity, 0, -1]) assert.throws(() => domain.parseMeasurementInput(value), (error) => error.code === "MEASUREMENT_VALUE_INVALID");
});

test("physical comparison never rounds a below-target measurement up", () => {
  assert.equal(domain.compareHeight(4.9), "BELOW_TARGET"); assert.equal(domain.compareHeight(5), "TARGET_REACHED"); assert.equal(domain.compareHeight(5.0), "TARGET_REACHED"); assert.equal(domain.compareHeight(5.2), "TARGET_REACHED");
});

test("one save completes a below-target physical measurement atomically", () => {
  let state = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); assert.equal(state.lifecycle, "collecting"); assert.equal(state.measurement, null);
  state = domain.completeMeasurement(state, "4,9", metadata(state, 0)); assert.equal(state.lifecycle, "completed"); assert.equal(state.revision, 2); assert.equal(state.operations.length, 1); assert.equal(state.operations[0].command, "complete"); assert.equal(state.completedSnapshot.result, "BELOW_TARGET"); assert.equal(state.completedSnapshot.measuredHeightCm, 4.9); assert.equal(state.completedSnapshot.source.executionStateRevision, 3);
  assert.throws(() => domain.completeMeasurement(state, "5,1", metadata(state, 1)), (error) => error.code === "INVALID_LIFECYCLE_TRANSITION");
  const corrupted = structuredClone(state); corrupted.completedSnapshot.measuredHeightCm = 5; assert.throws(() => domain.validateProgressState(corrupted), (error) => error.code === "MEASUREMENT_STATE_CORRUPTED");
});

test("one save completes target reached for values equal to or above target", () => {
  for (const [value, measured] of [["5", 5], ["5,1", 5.1]]) { let state = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); state = domain.completeMeasurement(state, value, metadata(state, 0)); assert.equal(state.lifecycle, "completed"); assert.equal(state.completedSnapshot.result, "TARGET_REACHED"); assert.equal(state.completedSnapshot.measuredHeightCm, measured); }
});

test("review can be corrected before confirmation and receipts are idempotent", () => {
  const initial = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); const reviewed = domain.reviewMeasurement(initial, "5.1", metadata(initial, 0));
  assert.deepEqual(domain.reviewMeasurement(reviewed, "5.1", metadata(initial, 0)), reviewed);
  assert.throws(() => domain.reviewMeasurement(reviewed, "4.9", metadata(initial, 0)), (error) => error.code === "OPERATION_ID_CONFLICT");
  const collecting = domain.reviseMeasurement(reviewed, metadata(reviewed, 1)); assert.equal(collecting.lifecycle, "collecting"); assert.equal(collecting.measurement, null);
});

test("source and optimistic revision changes fail closed", () => {
  const initial = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); const stale = assessment(); stale.source.executionStateRevision = 4;
  assert.throws(() => domain.validateProgressState(initial, { assessment: stale }), (error) => error.code === "SOURCE_STALE");
  assert.throws(() => domain.reviewMeasurement(initial, 5, { ...metadata(initial, 0), expectedRevision: 99 }), (error) => error.code === "REVISION_CONFLICT");
});

test("history permits repeated below-target epochs but target reached is terminal", () => {
  let first = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); first = domain.reviewMeasurement(first, 3.8, metadata(first, 0)); first = domain.confirmMeasurement(first, metadata(first, 1));
  const nextAssessment = assessment({ source: { ...assessment().source, executionProgressRevision: 5, executionStateRevision: 5, executionStateFingerprint: "fnv1a32:4567def0" } }); let second = domain.createInitialState(nextAssessment, { epoch: 2, predecessorIdentity: first.identity, createdAt: TIMES[3] }); second = domain.reviewMeasurement(second, 5.1, { ...metadata(second, 2, nextAssessment), timestamp: TIMES[4] });
  assert.equal(domain.validateHistory([{ epoch: 1, state: first }, { epoch: 2, state: second }]).length, 2);
  const broken = structuredClone(second); broken.predecessorIdentity = "wrong"; assert.throws(() => domain.validateHistory([{ epoch: 1, state: first }, { epoch: 2, state: broken }]));
});

test("authoritative history keeps the last valid fact but blocks a corrupted late record", () => {
  let first = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); first = domain.reviewMeasurement(first, 4.3, metadata(first, 0)); first = domain.confirmMeasurement(first, metadata(first, 1));
  const corrupt = structuredClone(first); corrupt.epoch = 2; corrupt.completedSnapshot.measuredHeightCm = 5.1;
  const records = [{ kind: domain.KIND, project_id: PROJECT, calculation_id: CALCULATION, epoch: 1, state: first }, { kind: domain.KIND, project_id: PROJECT, calculation_id: CALCULATION, epoch: 2, state: corrupt }];
  const boundary = domain.resolveAuthoritativeHistory(records);
  assert.equal(boundary.status, "blocked"); assert.equal(boundary.authoritativeState.identity, first.identity); assert.equal(boundary.authoritativeState.completedSnapshot.result, "BELOW_TARGET");
  const action = savedProjects.foundationMeasurementNextAction(records, PROJECT); assert.equal(action.status, "blocked"); assert.equal(action.destination, `${domain.ROUTE_PATH}?project=${PROJECT}`); assert.doesNotMatch(action.destination, /foundation-section-execution/);
  const card = savedProjects.buildWorkspaceViewModel([{ project_id: PROJECT, title: "Проект", revision: 1, workspace_status: "ACTIVE", workspace_foundation_preparation_status: "completed", workspace_foundation_execution_status: "paused", workspace_foundation_measurement_status: "blocked" }], []);
  assert.equal(card.projects[0].action, null); assert.equal(card.projects[0].canContinue, false);
});

test("workspace has one collecting action and renders both completed outcomes without review UI", () => {
  class Element { constructor() { this.hidden = true; this.disabled = false; this.textContent = ""; this.value = ""; this.attributes = {}; this.children = []; } replaceChildren(...children) { this.children = children; } setAttribute(name, value) { this.attributes[name] = String(value); } focus() {} }
  const names = ["root", "loading", "blocked", "blockedMessage", "content", "attempt", "plan", "collecting", "form", "input", "saveButton", "inputError", "completed", "completedHeading", "completedSummary", "completedDetail", "completedActions", "belowAction", "reachedAction", "actionError"]; const ui = Object.fromEntries(names.map((name) => [name, new Element()])); ui.belowAction.textContent = "Продолжить вязать резинку"; ui.reachedAction.textContent = "Вернуться к проекту"; const controller = workspace.createController({ domain, system: {}, document: {}, globalObject: {}, ui });
  let state = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); controller.render(state); assert.equal(ui.collecting.hidden, false); assert.equal(ui.input.value, "");
  state = domain.completeMeasurement(state, 4.3, metadata(state, 0)); controller.render(state); assert.equal(ui.collecting.hidden, true); assert.deepEqual(ui.completedActions.children, [ui.belowAction]); assert.match(ui.completedDetail.textContent, /ещё не достигнута/);
  const visible = names.map((name) => ui[name].textContent).join(" "); assert.doesNotMatch(visible, /2026-|T12:|Stage 72/);
  let reached = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); reached = domain.completeMeasurement(reached, 5.2, metadata(reached, 0)); controller.render(reached); assert.deepEqual(ui.completedActions.children, [ui.reachedAction]); assert.doesNotMatch(ui.completedActions.children.map((entry) => entry.textContent).join(" "), /Продолжить вязать резинку/); assert.match(ui.completedHeading.textContent, /Целевая высота/);
});

test("saved-project resolver resumes attempts, knitting, and terminal physical result without loops", () => {
  const base = { project_id: PROJECT, title: "Проект", revision: 1, workspace_status: "ACTIVE", workspace_foundation_preparation_status: "completed", workspace_foundation_execution_status: "paused" };
  for (const [status, route] of [["collecting", domain.ROUTE_PATH], ["reviewing", domain.ROUTE_PATH], ["completed_target", domain.ROUTE_PATH], ["completed_below", execution.ROUTE_PATH]]) { const model = savedProjects.buildWorkspaceViewModel([{ ...base, workspace_foundation_measurement_status: status }], []); assert.equal(model.projects[0].action.href, `${route}?project=${PROJECT}`); }
  const next = savedProjects.buildWorkspaceViewModel([{ ...base, workspace_foundation_measurement_status: "completed_below", workspace_foundation_measurement_ready: true }], []); assert.equal(next.projects[0].action.href, `${domain.ROUTE_PATH}?project=${PROJECT}`);
});

test("user workspace resolver keeps TARGET_REACHED on Stage 72", () => {
  let reached = domain.createInitialState(assessment(), { epoch: 1, createdAt: TIMES[0] }); reached = domain.reviewMeasurement(reached, 5.1, metadata(reached, 0)); reached = domain.confirmMeasurement(reached, metadata(reached, 1));
  const records = [{ kind: domain.KIND, project_id: PROJECT, calculation_id: CALCULATION, epoch: 1, state: reached }];
  const direct = savedProjects.foundationMeasurementNextAction(records, PROJECT); assert.equal(direct.destination, `${domain.ROUTE_PATH}?project=${PROJECT}`); assert.notEqual(direct.destination, `${execution.ROUTE_PATH}?project=${PROJECT}`);
  const resolved = savedProjects.determineNextAction({ projectId: PROJECT, initializationAssessment: { verdict: "ready", current: true, canContinue: true, existing: { lifecycle: "initialized" } }, materialState: "ready", progressRecords: records });
  assert.equal(resolved.action, "open-foundation-measurement"); assert.equal(resolved.destination, `${domain.ROUTE_PATH}?project=${PROJECT}`);
});

test("measurement entry rejects ready/active execution and corrupted or cross-scope Stage 71", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await global.YarnAIStage71HappyPathFixture.seedStage71HappyPath({ repository: repo, startedAt: Date.parse(TIMES[0]) }); const { projectId, calculationId } = seeded;
  let aggregate = await repo.getProject(projectId); let source71 = stage71Assessment(aggregate, projectId); let executionRecord = await repo.ensureFoundationSectionExecution(projectId, calculationId, source71, { expectedProjectRevision: aggregate.project.revision, timestamp: new Date().toISOString() });
  aggregate = await repo.getProject(projectId); let gate = stage72Assessment(aggregate, projectId); assert.equal(gate.lifecycle, "blocked"); assert.equal(gate.diagnostic.code, "STAGE71_NOT_STARTED");
  source71 = stage71Assessment(aggregate, projectId); let active = execution.startExecution(executionRecord.state, { assessment: source71, operationId: system.uuidv7(), timestamp: new Date().toISOString(), expectedRevision: executionRecord.state.revision, expectedFingerprint: executionRecord.state.fingerprint }); let saved = await repo.updateFoundationSectionExecution(projectId, calculationId, active, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: executionRecord.revision, expectedDomainRevision: executionRecord.state.revision, timestamp: new Date().toISOString() }); executionRecord = saved.progress;
  aggregate = await repo.getProject(projectId); gate = stage72Assessment(aggregate, projectId); assert.equal(gate.lifecycle, "blocked"); assert.equal(gate.diagnostic.code, "STAGE71_MUST_BE_PAUSED");
  source71 = stage71Assessment(aggregate, projectId); const paused = execution.pauseExecution(executionRecord.state, { assessment: source71, operationId: system.uuidv7(), timestamp: new Date().toISOString(), expectedRevision: executionRecord.state.revision, expectedFingerprint: executionRecord.state.fingerprint }); await repo.updateFoundationSectionExecution(projectId, calculationId, paused, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: executionRecord.revision, expectedDomainRevision: executionRecord.state.revision, timestamp: new Date().toISOString() });
  aggregate = await repo.getProject(projectId); assert.equal(stage72Assessment(aggregate, projectId).lifecycle, "ready");
  const input = { projectId, project: aggregate.project, progress: structuredClone(aggregate.progress), stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, stage71Domain: execution, validatedAt: new Date().toISOString() };
  const executionEntry = () => input.progress.find((entry) => entry.kind === execution.KIND);
  executionEntry().project_id = PROJECT; assert.equal(domain.assessSource(input).diagnostic.code, "PROJECT_MISMATCH"); executionEntry().project_id = projectId;
  executionEntry().calculation_id = CALCULATION; assert.equal(domain.assessSource(input).diagnostic.code, "CALCULATION_MISMATCH"); executionEntry().calculation_id = calculationId;
  executionEntry().conflict_id = system.uuidv7(); assert.equal(domain.assessSource(input).diagnostic.code, "STAGE71_CONFLICT"); executionEntry().conflict_id = null;
  executionEntry().state.fingerprint = "fnv1a32:00000000"; assert.equal(domain.assessSource(input).diagnostic.code, "STAGE71_CONFLICT");
});

function stage71Assessment(aggregate, projectId) { return execution.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, validatedAt: new Date().toISOString() }); }
function stage72Assessment(aggregate, projectId) { return domain.assessSource({ projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, stage71Domain: execution, validatedAt: new Date().toISOString() }); }

test("production fixture supports 4.3 -> further execution -> 5.1 with immutable attempt history", async () => {
  const repo = repository(); await repo.initialize(); const seeded = await fixture.seedStage72HappyPath({ repository: repo, startedAt: Date.parse(TIMES[0]) }); const { projectId, calculationId } = seeded;
  let aggregate = await repo.getProject(projectId); let source72 = stage72Assessment(aggregate, projectId); let attempt = await repo.ensureFoundationSectionMeasurement(projectId, calculationId, source72, { expectedProjectRevision: aggregate.project.revision, timestamp: new Date().toISOString() });
  aggregate = await repo.getProject(projectId); source72 = stage72Assessment(aggregate, projectId); const firstOperation = system.uuidv7(); const firstTimestamp = new Date().toISOString(); let next = domain.completeMeasurement(attempt.state, 4.3, { assessment: source72, operationId: firstOperation, timestamp: firstTimestamp, expectedRevision: attempt.state.revision, expectedFingerprint: attempt.state.fingerprint, explicitConfirmation: true }); const writeOptions = { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: attempt.revision, expectedDomainRevision: attempt.state.revision, timestamp: firstTimestamp, operationId: firstOperation }; const repeated = await Promise.all([repo.updateFoundationSectionMeasurement(projectId, calculationId, next, writeOptions), repo.updateFoundationSectionMeasurement(projectId, calculationId, next, writeOptions)]); let saved = repeated[0]; const first = saved.progress; assert.equal(first.state.completedSnapshot.result, "BELOW_TARGET"); assert.equal(repeated.filter((result) => result.replayed).length, 1); assert.equal((await repo.listFoundationSectionMeasurements(projectId, calculationId)).length, 1);
  aggregate = await repo.getProject(projectId); const belowAction = savedProjects.foundationMeasurementNextAction(aggregate.progress, projectId); assert.equal(belowAction.destination, `${execution.ROUTE_PATH}?project=${projectId}`); await assert.rejects(() => repo.ensureFoundationSectionMeasurement(projectId, calculationId, stage72Assessment(aggregate, projectId), { expectedProjectRevision: aggregate.project.revision, timestamp: new Date().toISOString() }), (error) => error.code === "NEW_EXECUTION_REQUIRED");
  aggregate = await repo.getProject(projectId); let source71 = stage71Assessment(aggregate, projectId); let executionRecord = await repo.getFoundationSectionExecution(projectId, calculationId); next = execution.resumeExecution(executionRecord.state, { assessment: source71, operationId: system.uuidv7(), timestamp: new Date().toISOString(), expectedRevision: executionRecord.state.revision, expectedFingerprint: executionRecord.state.fingerprint }); saved = await repo.updateFoundationSectionExecution(projectId, calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: executionRecord.revision, expectedDomainRevision: executionRecord.state.revision, timestamp: new Date().toISOString() }); executionRecord = saved.progress;
  aggregate = await repo.getProject(projectId); assert.equal(stage72Assessment(aggregate, projectId).diagnostic.code, "STAGE71_MUST_BE_PAUSED");
  aggregate = await repo.getProject(projectId); source71 = stage71Assessment(aggregate, projectId); next = execution.pauseExecution(executionRecord.state, { assessment: source71, operationId: system.uuidv7(), timestamp: new Date().toISOString(), expectedRevision: executionRecord.state.revision, expectedFingerprint: executionRecord.state.fingerprint }); saved = await repo.updateFoundationSectionExecution(projectId, calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: executionRecord.revision, expectedDomainRevision: executionRecord.state.revision, timestamp: new Date().toISOString() });
  aggregate = await repo.getProject(projectId); source72 = stage72Assessment(aggregate, projectId); attempt = await repo.ensureFoundationSectionMeasurement(projectId, calculationId, source72, { expectedProjectRevision: aggregate.project.revision, timestamp: new Date().toISOString() }); assert.equal(attempt.epoch, 2); assert.equal(attempt.state.predecessorIdentity, first.state.identity);
  aggregate = await repo.getProject(projectId); source72 = stage72Assessment(aggregate, projectId); next = domain.completeMeasurement(attempt.state, 5.1, { assessment: source72, operationId: system.uuidv7(), timestamp: new Date().toISOString(), expectedRevision: attempt.state.revision, expectedFingerprint: attempt.state.fingerprint, explicitConfirmation: true }); saved = await repo.updateFoundationSectionMeasurement(projectId, calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: attempt.revision, expectedDomainRevision: attempt.state.revision, timestamp: new Date().toISOString() }); assert.equal(saved.progress.state.completedSnapshot.result, "TARGET_REACHED");
  const history = await repo.listFoundationSectionMeasurements(projectId, calculationId); assert.equal(history.length, 2); assert.equal(history[0].state.completedSnapshot.measuredHeightCm, 4.3); assert.equal(history[1].state.completedSnapshot.measuredHeightCm, 5.1);
  aggregate = await repo.getProject(projectId); source71 = stage71Assessment(aggregate, projectId); executionRecord = await repo.getFoundationSectionExecution(projectId, calculationId); const resume = execution.resumeExecution(executionRecord.state, { assessment: source71, operationId: system.uuidv7(), timestamp: new Date().toISOString(), expectedRevision: executionRecord.state.revision, expectedFingerprint: executionRecord.state.fingerprint }); await assert.rejects(() => repo.updateFoundationSectionExecution(projectId, calculationId, resume, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: executionRecord.revision, expectedDomainRevision: executionRecord.state.revision, timestamp: new Date().toISOString() }), (error) => error.code === "TARGET_ALREADY_REACHED");
  const secondTab = repository(); await secondTab.initialize(); const reloaded = await secondTab.getProject(projectId); const reloadedHistory = await secondTab.listFoundationSectionMeasurements(projectId, calculationId); const boundary = domain.resolveAuthoritativeHistory(reloadedHistory);
  assert.equal(reloaded.project.current_stage, "foundation_section_measurement_target_reached"); assert.equal(boundary.terminalReached, true); assert.equal(boundary.authoritativeState.completedSnapshot.measuredHeightCm, 5.1);
  const reloadedAction = savedProjects.foundationMeasurementNextAction(reloaded.progress, projectId); assert.equal(reloadedAction.destination, `${domain.ROUTE_PATH}?project=${projectId}`); assert.doesNotMatch(reloadedAction.destination, /foundation-section-execution/);
});
