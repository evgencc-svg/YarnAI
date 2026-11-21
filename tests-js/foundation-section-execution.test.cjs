"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");
global.window = globalThis;

require("../src/yarnai/static/project-system.js");
require("../src/yarnai/static/project-details-experience.js");
require("../src/yarnai/static/project-details-collaboration.js");
require("../src/yarnai/static/project-details-closure.js");
require("../src/yarnai/static/project-initialization.js");
require("../src/yarnai/static/swatch-gauge.js");
require("../src/yarnai/static/project-calculation-entry.js");
require("../src/yarnai/static/project-readiness-engine.js");
require("../src/yarnai/static/project-execution-plan.js");
require("../src/yarnai/static/project-execution-plan-workspace.js");
require("../src/yarnai/static/project-execution-start.js");
require("../src/yarnai/static/project-execution-start-workspace.js");
require("../src/yarnai/static/project-execution-first-step.js");
require("../src/yarnai/static/project-execution-next-step.js");
require("../src/yarnai/static/project-execution-next-step-clarification.js");
require("../src/yarnai/static/foundation-section-execution-preparation.js");
const domain = require("../src/yarnai/static/foundation-section-execution.js");
const executionWorkspace = require("../src/yarnai/static/foundation-section-execution-workspace.js");
const savedProjects = require("../src/yarnai/static/user-workspace-entry.js");
require("../src/yarnai/static/stage70-happy-path-fixture.js");
const fixture = require("../src/yarnai/static/stage71-happy-path-fixture.js");

const system = global.YarnAIProjectSystem;
const PROJECT = "019fc3ba-4100-71c3-b7f9-bd06e3bff304";
const CALCULATION = "019fc3ba-4100-71c3-b7f9-bd06e3bff305";
const PROGRESS = "019fc3ba-4100-71c3-b7f9-bd06e3bff306";
const OPS = ["019fc3ba-4100-71c3-b7f9-bd06e3bff307", "019fc3ba-4100-71c3-b7f9-bd06e3bff308", "019fc3ba-4100-71c3-b7f9-bd06e3bff309"];
const TIMES = ["2026-08-08T10:00:00.000Z", "2026-08-08T10:01:00.000Z", "2026-08-08T10:02:00.000Z", "2026-08-08T10:03:00.000Z"];
let repositories = [];

function assessment(overrides = {}) {
  return {
    lifecycle: "ready", projectId: PROJECT, calculationId: CALCULATION, projectRevision: 8,
    source: { stage70ProgressIdentity: PROGRESS, stage70Epoch: 1, stage70ProgressRevision: 4, stage70StateIdentity: "stage70-state", stage70StateRevision: 4, stage70StateFingerprint: "fnv1a32:1234abcd", completedSnapshotFingerprint: "fnv1a32:2345bcde", sourceRevisions: { project: 7, stage65Progress: 1, stage66Progress: 1, stage67Progress: 4, stage68Progress: 1, stage69Progress: 1, preparationProgress: 3 } },
    executionPlan: { foundationType: "ribbing", ribPattern: { kind: "rib_1x1", repeatLength: 2 }, workingMethod: { value: "in_round", origin: "user", explicit: true, confirmedAt: TIMES[0] }, stitchAllocation: { totalCastOn: 100, edgeCount: 0, workingStitches: 100, repeatLength: 2, repeatCount: 50 }, toolConfirmation: { kind: "user_provided", label: "круговые спицы", explicit: true, confirmedAt: TIMES[0], policyVersion: "tool-confirmation/v1" }, instructionSource: { kind: "user_provided", text: "1 лицевая, 1 изнаночная", contentFingerprint: "fnv1a32:3456cdef", support: { ribPatternKind: "rib_1x1", repeatLength: 2, workingMethod: "in_round", edgeKind: "none", edgeCount: 0, edgePolicyVersion: "foundation-edge-none/v1" }, attestation: { explicit: true, authority: "user", yarnAiTechnicalVerification: false, confirmedAt: TIMES[0] }, policyVersion: "user-instruction-attestation/v1" }, measurementPolicy: { authority: "physical_measurement", target: { kind: "height", value: 5, unit: "cm" }, origin: "physical_start_of_ribbing_after_cast_on_to_current_top_edge", onNeedles: true, tensionState: "natural_unstretched", comparison: "at_least", toleranceCm: null, policyVersion: "foundation-height-physical/v1", acknowledgementRequired: true, physicalCompletionAuthority: "explicit_user_measurement_acknowledgement" }, target: { kind: "height", value: 5, unit: "cm" }, rowEstimate: null },
    ...overrides,
  };
}
function metadata(state, index, source = assessment()) { return { assessment: source, operationId: OPS[index], timestamp: TIMES[index + 1], expectedRevision: state.revision, expectedFingerprint: state.fingerprint }; }
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((value) => value.close().catch(() => undefined))); await deleteDatabase(); });

test("completed preparation creates a ready execution without claiming physical achievement", () => {
  const state = domain.createInitialState(assessment(), { createdAt: TIMES[0] });
  assert.equal(state.lifecycle, "ready"); assert.equal(state.physicalResult, null); assert.equal(state.executionPlan.target.value, 5); assert.equal(state.executionPlan.rowEstimate, null);
});

test("execution lifecycle is ready -> active <-> paused", () => {
  let state = domain.createInitialState(assessment(), { createdAt: TIMES[0] });
  state = domain.startExecution(state, metadata(state, 0)); assert.equal(state.lifecycle, "active"); assert.equal(state.physicalResult, null);
  state = domain.pauseExecution(state, metadata(state, 1)); assert.equal(state.lifecycle, "paused");
  state = domain.resumeExecution(state, metadata(state, 2)); assert.equal(state.lifecycle, "active"); assert.equal(state.physicalResult, null);
  assert.deepEqual(state.operations.map((entry) => entry.command), ["start", "pause", "resume"]);
});

test("operation replay is idempotent and conflicting reuse fails closed", () => {
  const initial = domain.createInitialState(assessment(), { createdAt: TIMES[0] }); const started = domain.startExecution(initial, metadata(initial, 0));
  assert.deepEqual(domain.startExecution(started, metadata(initial, 0)), started);
  assert.throws(() => domain.pauseExecution(started, { ...metadata(started, 0), timestamp: TIMES[2] }), (error) => error.code === "OPERATION_ID_CONFLICT");
});

test("stale revision, changed source revision, and physical result are rejected", () => {
  const source = assessment(); const initial = domain.createInitialState(source, { createdAt: TIMES[0] });
  assert.throws(() => domain.startExecution(initial, { ...metadata(initial, 0), expectedRevision: 99 }), (error) => error.code === "REVISION_CONFLICT");
  const changed = structuredClone(source); changed.source.sourceRevisions.stage69Progress = 2;
  assert.throws(() => domain.validateProgressState(initial, { assessment: changed }), (error) => error.code === "SOURCE_STALE");
  const falseClaim = structuredClone(initial); falseClaim.physicalResult = { achieved: true, heightCm: 5 }; falseClaim.fingerprint = domain.fingerprint((({ fingerprint, ...rest }) => rest)(falseClaim));
  assert.throws(() => domain.validateProgressState(falseClaim), (error) => error.code === "PHYSICAL_RESULT_NOT_ALLOWED");
});

test("route is project-scoped and rejects extra or cross-project input", () => {
  assert.equal(domain.projectIdentityFromLocation({ href: `http://localhost${domain.ROUTE_PATH}?project=${PROJECT}` }), PROJECT);
  assert.throws(() => domain.projectIdentityFromLocation({ href: `http://localhost${domain.ROUTE_PATH}?project=${PROJECT}&extra=1` }));
  assert.equal(domain.safeDestination(`${domain.ROUTE_PATH}?project=${PROJECT}`, PROJECT).valid, true);
});

test("workspace renders ready, active, and paused without raw timestamps or a height claim", () => {
  class Element { constructor() { this.hidden = true; this.disabled = false; this.textContent = ""; this.children = []; this.dataset = {}; this.attributes = {}; } replaceChildren(...children) { this.children = children; } setAttribute(name, value) { this.attributes[name] = String(value); } }
  const ui = Object.fromEntries(["root", "loading", "blocked", "blockedMessage", "content", "status", "summary", "guidance", "actions", "start", "pause", "resume", "measure", "error"].map((name) => [name, new Element()]));
  const controller = executionWorkspace.createController({ domain, system: {}, document: { createElement() { return new Element(); } }, globalObject: {}, ui });
  let state = domain.createInitialState(assessment(), { createdAt: TIMES[0] }); controller.render(state);
  assert.equal(ui.start.hidden, false); assert.equal(ui.pause.hidden, true); assert.equal(ui.status.textContent, "Готово к началу");
  state = domain.startExecution(state, metadata(state, 0)); controller.render(state);
  assert.equal(ui.pause.hidden, false); assert.equal(ui.status.textContent, "Резинка в работе"); assert.match(ui.guidance.textContent, /не подтверждается/);
  state = domain.pauseExecution(state, metadata(state, 1)); controller.render(state);
  assert.equal(ui.resume.hidden, false); assert.equal(ui.status.textContent, "Выполнение приостановлено");
  controller.render(state, { targetReached: true }); assert.deepEqual(ui.actions.children, [ui.measure]); assert.equal(ui.resume.hidden, true); assert.equal(ui.status.textContent, "Целевая высота подтверждена");
  const visible = [ui.status.textContent, ui.guidance.textContent, ...ui.summary.children.map((node) => node.textContent)].join(" ");
  assert.doesNotMatch(visible, /2026-|T10:|Z/); assert.doesNotMatch(visible, /5 см достигнуты|5 см готово/);
});

test("saved-project resolver resumes execution and falls back to completed preparation", () => {
  const base = { project_id: PROJECT, title: "Проект", revision: 1, workspace_status: "ACTIVE", workspace_foundation_preparation_status: "completed" };
  for (const lifecycle of ["ready", "active", "paused"]) {
    const model = savedProjects.buildWorkspaceViewModel([{ ...base, workspace_foundation_execution_status: lifecycle }], []);
    assert.equal(model.projects[0].action.href, `${domain.ROUTE_PATH}?project=${PROJECT}`);
    assert.equal(model.projects[0].canContinue, true);
  }
  const fallback = savedProjects.buildWorkspaceViewModel([{ ...base, workspace_foundation_execution_status: "blocked" }], []);
  assert.equal(fallback.projects[0].action.href, `${domain.ROUTE_PATH}?project=${PROJECT}`);
  assert.equal(fallback.projects[0].action.label, "Начать вязать резинку");
});

test("production fixture persists completed preparation, then start/pause/resume revision-safely", async () => {
  const repo = repository(); await repo.initialize();
  const seeded = await fixture.seedStage71HappyPath({ repository: repo, startedAt: Date.parse(TIMES[0]) });
  assert.equal(seeded.stage70Record.state.lifecycle, "completed"); assert.equal(seeded.assessment71.lifecycle, "ready"); assert.equal(seeded.assessment71.executionPlan.stitchAllocation.workingStitches, 100);
  let aggregate = await repo.getProject(seeded.projectId); let record = await repo.ensureFoundationSectionExecution(seeded.projectId, seeded.calculationId, seeded.assessment71, { expectedProjectRevision: aggregate.project.revision, timestamp: TIMES[1] });
  let source = domain.assessSource({ projectId: seeded.projectId, project: (aggregate = await repo.getProject(seeded.projectId)).project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, validatedAt: TIMES[1] });
  let state = domain.startExecution(record.state, { ...metadata(record.state, 0, source), timestamp: TIMES[1] });
  let saved = await repo.updateFoundationSectionExecution(seeded.projectId, seeded.calculationId, state, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: record.revision, expectedDomainRevision: record.state.revision, timestamp: TIMES[1] }); record = saved.progress;
  const replay = await repo.updateFoundationSectionExecution(seeded.projectId, seeded.calculationId, state, { expectedProgressRevision: record.revision, expectedDomainRevision: record.state.revision, timestamp: TIMES[1] }); assert.equal(replay.replayed, true);
  aggregate = await repo.getProject(seeded.projectId); source = domain.assessSource({ projectId: seeded.projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, validatedAt: TIMES[2] });
  state = domain.pauseExecution(record.state, { ...metadata(record.state, 1, source), timestamp: TIMES[2] }); saved = await repo.updateFoundationSectionExecution(seeded.projectId, seeded.calculationId, state, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: record.revision, expectedDomainRevision: record.state.revision, timestamp: TIMES[2] }); record = saved.progress;
  aggregate = await repo.getProject(seeded.projectId); source = domain.assessSource({ projectId: seeded.projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: global.YarnAIFoundationSectionExecutionPreparation, validatedAt: TIMES[3] });
  state = domain.resumeExecution(record.state, { ...metadata(record.state, 2, source), timestamp: TIMES[3] }); saved = await repo.updateFoundationSectionExecution(seeded.projectId, seeded.calculationId, state, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: record.revision, expectedDomainRevision: record.state.revision, timestamp: TIMES[3] });
  assert.equal(saved.progress.state.lifecycle, "active"); assert.equal(saved.progress.state.physicalResult, null); assert.equal(saved.project.current_stage, "foundation_section_execution_active");
});

test("collecting or malformed completed preparation never becomes executable", async () => {
  const repo = repository(); await repo.initialize(); const seed70 = global.YarnAIStage70HappyPathFixture;
  const seeded = await seed70.seedStage70HappyPath({ repository: repo, startedAt: Date.parse(TIMES[0]) }); let aggregate = await repo.getProject(seeded.projectId);
  const stage70 = global.YarnAIFoundationSectionExecutionPreparation; const collecting = stage70.createInitialState(seeded.stage70Assessment, { createdAt: TIMES[1] });
  await repo.ensureFoundationSectionExecutionPreparation(seeded.projectId, seeded.calculationId, collecting, { expectedProjectRevision: aggregate.project.revision, timestamp: TIMES[1] }); aggregate = await repo.getProject(seeded.projectId);
  const input = { projectId: seeded.projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: global.YarnAISwatchGauge, stage65Domain: global.YarnAIProjectExecutionPlan, stage66Domain: global.YarnAIProjectExecutionStart, stage67Domain: global.YarnAIProjectExecutionFirstStep, stage68Domain: global.YarnAIProjectExecutionNextStep, stage69Domain: global.YarnAIProjectExecutionNextStepClarification, stage70Domain: stage70, validatedAt: TIMES[2] };
  assert.equal(domain.assessSource(input).diagnostic.code, "STAGE70_NOT_COMPLETED");
  const wrongProject = { ...input, progress: JSON.parse(JSON.stringify(input.progress)) }; wrongProject.progress.find((entry) => entry.kind === stage70.KIND).project_id = "019fc3ba-4100-71c3-b7f9-bd06e3bff399";
  assert.equal(domain.assessSource(wrongProject).diagnostic.code, "PROJECT_MISMATCH");
  const wrongCalculation = { ...input, progress: JSON.parse(JSON.stringify(input.progress)) }; wrongCalculation.progress.find((entry) => entry.kind === stage70.KIND).calculation_id = "019fc3ba-4100-71c3-b7f9-bd06e3bff398";
  assert.equal(domain.assessSource(wrongCalculation).diagnostic.code, "CALCULATION_MISMATCH");
  const badFingerprint = { ...input, progress: JSON.parse(JSON.stringify(input.progress)) }; badFingerprint.progress.find((entry) => entry.kind === stage70.KIND).state.fingerprint = "fnv1a32:00000000";
  assert.equal(domain.assessSource(badFingerprint).lifecycle, "blocked");
  const corrupt = { ...input, progress: JSON.parse(JSON.stringify(input.progress)) }; const prep = corrupt.progress.find((entry) => entry.kind === stage70.KIND); prep.state.lifecycle = "completed"; prep.state.completedSnapshot = null;
  assert.equal(domain.assessSource(corrupt).lifecycle, "blocked");
});
