"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");

Object.assign(global, { indexedDB, IDBKeyRange, window: globalThis });
if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto });
require("../src/yarnai/static/project-system.js");
const planApi = require("../src/yarnai/static/pattern-execution-plan.js");
const sessionApi = require("../src/yarnai/static/pattern-execution-session.js");
const stepApi = require("../src/yarnai/static/pattern-execution-step.js");
const checkpointApi = require("../src/yarnai/static/pattern-execution-checkpoint.js");
const api = require("../src/yarnai/static/pattern-execution-progress.js");

const repositories = [];
const stamp = (second) => `2026-08-01T10:00:${String(second).padStart(2, "0")}.000Z`;
const op = (name) => `${name}:${global.YarnAIProjectSystem.uuidv7()}`;

function makePlan(options = {}) {
  const projectId = options.projectId || "project";
  const checkpoints = options.checkpoints === false ? [] : [
    { id: "checkpoint:one", type: "stitch_count_check", phaseId: "phase:one", componentIds: ["component:one"], expectedValue: 10, unit: "stitches", sourceTargetIds: ["source:one"], required: true, blockingOnFailure: true },
    ...(options.twoCheckpoints ? [{ id: "checkpoint:two", type: "visual_confirmation", phaseId: "phase:two", componentIds: ["component:one"], expectedValue: true, unit: null, sourceTargetIds: ["source:two"], required: true, blockingOnFailure: true }] : []),
  ];
  const phases = [
    { id: "phase:one", order: 1, type: "main_fabric", title: "Основная работа", componentIds: ["component:one"], dependsOnPhaseIds: [], canRunInParallelWith: [], sourceTargetIds: ["source:one"], entryCriteria: [], actions: [{ id: "action:one", order: 1, type: "knit", title: "Первый шаг", description: "Выполнить первый шаг", required: true, sourceTargetIds: ["source:action:one"] }], exitCriteria: [], checkpoints: checkpoints.filter((entry) => entry.phaseId === "phase:one").map((entry) => entry.id), unresolved: [], status: "ready", required: true },
    { id: "phase:two", order: 2, type: "closure", title: "Завершение", componentIds: ["component:one"], dependsOnPhaseIds: ["phase:one"], canRunInParallelWith: [], sourceTargetIds: ["source:two"], entryCriteria: [], actions: [{ id: "action:two", order: 1, type: "bind_off", title: "Второй шаг", description: "Выполнить второй шаг", required: true, sourceTargetIds: ["source:action:two"] }], exitCriteria: [], checkpoints: checkpoints.filter((entry) => entry.phaseId === "phase:two").map((entry) => entry.id), unresolved: [], status: "ready", required: true },
  ];
  const state = {
    id: "plan:id", projectId, kind: planApi.PROGRESS_KIND, schemaVersion: 1, version: 1, revision: options.revision || 5,
    status: options.status || "ready", createdAt: stamp(1), updatedAt: stamp(2),
    sourceTechnologyReviewId: "review:id", sourceTechnologyReviewRevision: 7, sourceTechnologyReviewFingerprint: planApi.fingerprint({ source: "review" }), sourceConfirmedSnapshotFingerprint: planApi.fingerprint({ source: "confirmed" }),
    sourceTechnologyDraftId: "draft:id", sourceTechnologyDraftRevision: 6, sourceTechnologyDraftFingerprint: planApi.fingerprint({ source: "draft" }),
    sourceAnalysisReviewId: "analysis:id", sourceAnalysisReviewRevision: 5, sourceAnalysisReviewFingerprint: planApi.fingerprint({ source: "analysis" }),
    sourceSemanticAnalysisId: "semantic:id", sourceSemanticAnalysisRevision: 4, sourceSemanticAnalysisFingerprint: planApi.fingerprint({ source: "semantic" }),
    sourceImportRevision: 3, sourceAlgorithmVersion: 1, planningAlgorithmVersion: 1, planningInputFingerprint: null,
    planFingerprint: null, blockers: [], warnings: [], audit: [], error: null, interruptedOperation: null,
    plan: {
      schemaVersion: 1, summary: {}, prerequisites: [], materials: [], tools: [], measurements: [], gauge: [],
      components: [{ id: "component:one", type: "body", label: "Корпус", quantity: 1, constructionRole: "body", parentComponentId: null, sourceTargetIds: ["source:component"], dependencies: [], completionCriteria: [], status: "planned", sourceComponentId: "source:component", instance: 1 }],
      phases,
      dependencyGraph: { nodes: phases.map((entry) => ({ id: entry.id, type: "phase", order: entry.order, required: true })), edges: [{ id: "edge:two", from: "phase:one", to: "phase:two", type: "depends_on" }], componentNodes: [{ id: "component:one", type: "component" }] },
      checkpoints, firstAction: { phaseId: "phase:one", actionId: "action:one", title: "Первый шаг", description: "Выполнить первый шаг", prerequisites: [], sourceTargetIds: ["source:action:one"], ready: true, blockedBy: [] }, unresolved: [], completionCriteria: [], planFingerprint: null,
    },
  };
  state.planningInputFingerprint = planApi.fingerprint({
    planningAlgorithmVersion: state.planningAlgorithmVersion, sourceConfirmedSnapshotFingerprint: state.sourceConfirmedSnapshotFingerprint,
    sourceTechnologyReviewId: state.sourceTechnologyReviewId, sourceTechnologyReviewRevision: state.sourceTechnologyReviewRevision,
    sourceTechnologyReviewFingerprint: state.sourceTechnologyReviewFingerprint, sourceTechnologyDraftId: state.sourceTechnologyDraftId,
    sourceTechnologyDraftRevision: state.sourceTechnologyDraftRevision, sourceTechnologyDraftFingerprint: state.sourceTechnologyDraftFingerprint,
    sourceAnalysisReviewId: state.sourceAnalysisReviewId, sourceAnalysisReviewRevision: state.sourceAnalysisReviewRevision,
    sourceAnalysisReviewFingerprint: state.sourceAnalysisReviewFingerprint, sourceSemanticAnalysisId: state.sourceSemanticAnalysisId,
    sourceSemanticAnalysisRevision: state.sourceSemanticAnalysisRevision, sourceSemanticAnalysisFingerprint: state.sourceSemanticAnalysisFingerprint,
    sourceImportRevision: state.sourceImportRevision, sourceAlgorithmVersion: state.sourceAlgorithmVersion,
  });
  state.planFingerprint = planApi.calculatePlanFingerprint(state);
  state.plan.planFingerprint = state.planFingerprint;
  return state;
}

function makeSources(options = {}) {
  const plan = options.plan || makePlan(options);
  let session = sessionApi.createExecutionSession(plan, plan.projectId, { expectedPlanRevision: plan.revision, now: stamp(3) });
  session = sessionApi.startExecutionSession(session, plan, { now: stamp(4) });
  if (options.sessionStatus === "paused") session = sessionApi.pauseExecutionSession(session, { now: stamp(5) });
  if (options.completeFirst) {
    session = sessionApi.completeCurrentAction(session, { actionId: "action:one", operationId: op("complete"), now: stamp(6) });
  }
  const context = { executionPlan: plan, requireCurrentIdentity: false };
  let step = options.withStep === false ? null : stepApi.createExecutionStep(session, plan.projectId, { expectedSessionRevision: session.revision, context, now: stamp(7) });
  if (options.withCheckpoint && step) {
    step = stepApi.startStep(step, { expectedRevision: step.revision, operationId: op("step-start"), now: stamp(7) });
    step = stepApi.checkStep(step, { expectedRevision: step.revision, operationId: op("step-check"), confirmed: true, now: stamp(7) });
  }
  const stepRecords = step ? [record(step, step.kind, 1, "step-record")] : [];
  const checkpointRecords = [];
  if (options.withCheckpoint && step) {
    let checkpoint = checkpointApi.createCheckpoint(session, plan, step, { projectId: plan.projectId, checkpointId: options.completeFirst && options.twoCheckpoints ? "checkpoint:two" : "checkpoint:one", context, now: stamp(8) });
    checkpoint = checkpointApi.prepareCheckpoint(checkpoint, session, plan, step, { expectedRevision: checkpoint.revision, operationId: op("prepare"), context, now: stamp(9) });
    if (options.checkpointStatus === "reviewing") checkpoint = checkpointApi.startReview(checkpoint, { expectedRevision: checkpoint.revision, operationId: op("review"), now: stamp(10) });
    if (options.checkpointStatus === "failed") checkpoint = checkpointApi.markFailed(checkpoint, "corrupted_observations", { expectedRevision: checkpoint.revision, operationId: op("fail"), now: stamp(11) });
    checkpointRecords.push(record(checkpoint, checkpoint.kind, 1, "checkpoint-record"));
  }
  return {
    project: { project_id: plan.projectId, active_calculation_id: "calculation" }, projectId: plan.projectId,
    calculation: { calculation_id: "calculation" }, calculationId: "calculation",
    planRecord: record(plan, plan.kind, 1, "plan-record"), plan,
    sessionRecord: record(session, session.kind, options.sessionEpoch || 1, "session-record"), session, sessionEpoch: options.sessionEpoch || 1,
    stepRecords, checkpointRecords,
  };
}

function record(state, kind, epoch, progressId) { return { progress_id: progressId, project_id: state.projectId, calculation_id: "calculation", kind, epoch, state }; }
function built(sources = makeSources(), mode = "build") { return api.buildProgress(api.createInitialState(sources.projectId, { calculationId: sources.calculationId, now: stamp(12) }), sources, { expectedRevision: 1, operationId: op(mode), mode, now: stamp(13) }); }
function resealStep(step) { step.stepFingerprint = null; step.stepFingerprint = stepApi.calculateStepFingerprint(step); return step; }
function resealCheckpoint(checkpoint) { checkpoint.checkpointFingerprint = null; checkpoint.checkpointFingerprint = checkpointApi.calculateCheckpointFingerprint(checkpoint); return checkpoint; }

async function repositoryChain(title = "Progress import") {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const calculationId = added.calculation.calculation_id;
  const semanticState = { id: "semantic:id", projectId: project.project_id, kind: "PATTERN_SEMANTIC_ANALYSIS", version: 1, revision: 4, status: "completed", sourceImportRevision: 3 };
  await repository.ensureCalculationProgress(project.project_id, calculationId, semanticState.kind, semanticState);
  const analysisState = { id: "analysis:id", projectId: project.project_id, kind: "PATTERN_ANALYSIS_REVIEW", version: 1, revision: 5, status: "needs_attention", sourceSemanticAnalysisId: semanticState.id, sourceSemanticAnalysisRevision: 4, sourceImportRevision: 3, reviewedData: { items: [], conflictGroups: [] } };
  await repository.ensureCalculationProgress(project.project_id, calculationId, analysisState.kind, analysisState);
  const draftSnapshot = { projectId: project.project_id, sourceSemanticAnalysisId: semanticState.id };
  const draftState = { id: "draft:id", projectId: project.project_id, sourceProjectId: project.project_id, kind: "PATTERN_TECHNOLOGY_DRAFT", version: 1, revision: 6, status: "waiting", immutableSourceSnapshot: draftSnapshot, immutableSourceFingerprint: api.fingerprint(draftSnapshot), sourceConfirmedFingerprint: api.fingerprint(draftSnapshot), sourceReviewId: analysisState.id, sourceSemanticAnalysisId: semanticState.id, sourceImportRevision: 3, draftFingerprint: api.fingerprint({}), algorithmVersion: 1, audit: [] };
  const draftRecord = await repository.ensureCalculationProgress(project.project_id, calculationId, draftState.kind, draftState);
  const reviewSnapshot = { sourceDraftIdentity: { projectId: project.project_id }, sourceReviewIdentity: { projectId: project.project_id }, sourceSemanticIdentity: { projectId: project.project_id }, structuredDraft: {}, validation: {} };
  const reviewState = { id: "review:id", projectId: project.project_id, kind: "PATTERN_TECHNOLOGY_REVIEW", version: 1, revision: 7, status: "waiting", sourceDraftProgressId: draftRecord.progress_id, sourceDraftId: draftState.id, sourceDraftRevision: 6, sourceDraftFingerprint: draftState.draftFingerprint, confirmedSnapshotFingerprint: null, immutableSourceSnapshot: reviewSnapshot, immutableSourceSnapshotFingerprint: api.fingerprint(reviewSnapshot), sourceValidationFingerprint: api.fingerprint(reviewSnapshot.validation), reviewState: { targets: [] }, decisions: [], corrections: [], audit: [] };
  await repository.ensureCalculationProgress(project.project_id, calculationId, reviewState.kind, reviewState);
  const plan = makePlan({ projectId: project.project_id });
  let session = sessionApi.createExecutionSession(plan, project.project_id, { expectedPlanRevision: plan.revision });
  session = sessionApi.startExecutionSession(session, plan);
  const step = stepApi.createExecutionStep(session, project.project_id, { expectedSessionRevision: session.revision, context: { executionPlan: plan, requireCurrentIdentity: false } });
  await repository.ensureCalculationProgress(project.project_id, calculationId, plan.kind, plan);
  await repository.ensureCalculationProgress(project.project_id, calculationId, session.kind, session);
  await repository.ensurePatternExecutionStep(project.project_id, calculationId, step);
  const inspected = await repository.buildPatternExecutionProgress(project.project_id, { operationId: op("build") });
  assert.equal(inspected.progress.status, "ready");
  return { repository, project, calculationId, inspected };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("creates deterministic progress from a valid Stage 22–25 chain", () => {
  const state = built();
  assert.equal(state.kind, api.PROGRESS_KIND);
  assert.equal(state.status, "ready");
  assert.equal(state.counts.phases.total, 2);
  assert.equal(state.counts.steps.total, 2);
  assert.equal(state.counts.checkpoints.pending, 1);
  assert.equal(state.currentStep.actionId, "action:one");
  assert.equal(state.nextAction.type, "start_step");
  assert.equal(api.validateProgress(state).valid, true);
});

test("empty sources and missing plan/session never become ready", () => {
  const empty = built({ projectId: "project", calculationId: "calculation", stepRecords: [], checkpointRecords: [] });
  assert.equal(empty.status, "failed");
  assert.ok(empty.blockers.length);
  const missingSession = makeSources(); missingSession.session = null; missingSession.sessionRecord = null;
  assert.notEqual(built(missingSession).status, "ready");
});

test("newest session epoch is selected and records from old sessions are excluded", () => {
  const current = makeSources({ sessionEpoch: 2 });
  const old = makeSources({ sessionEpoch: 1 }); old.session = structuredClone(old.session); old.session.id = "old-session"; old.sessionRecord = { ...old.sessionRecord, state: old.session };
  const aggregate = { project: current.project, calculations: [current.calculation], progress: [current.planRecord, old.sessionRecord, current.sessionRecord, ...old.stepRecords, ...current.stepRecords] };
  const normalized = api.normalizeSources(aggregate);
  assert.equal(normalized.sessionEpoch, 2);
  assert.ok(normalized.stepRecords.every((entry) => entry.state.sourceSessionId === current.session.id));
});

test("multiple logical steps use session order and select its current action", () => {
  const sources = makeSources({ completeFirst: true });
  const state = built(sources);
  assert.deepEqual(state.immutableSnapshot.logicalSteps.map((entry) => entry.actionId), ["action:one", "action:two"]);
  assert.equal(state.counts.steps.completed, 1);
  assert.equal(state.currentStep.actionId, "action:two");
});

test("multiple checkpoints are counted independently", () => {
  const state = built(makeSources({ twoCheckpoints: true, withCheckpoint: true }));
  assert.equal(state.counts.checkpoints.total, 2);
  assert.equal(state.counts.checkpoints.pending, 2);
});

for (const status of ["paused", "blocked", "stale", "failed"]) test(`maps ${status} Stage 24 status`, () => {
  const sources = makeSources();
  const step = structuredClone(sources.stepRecords[0].state);
  step.status = status; step.lifecycle.state = status;
  if (status === "blocked") step.blockers = [{ code: "test", message: "Blocked", details: {} }];
  if (status === "stale") step.staleReason = "test";
  if (status === "failed") step.failure = { code: "test", message: "Failed" };
  sources.stepRecords[0].state = resealStep(step);
  const state = built(sources);
  assert.equal(state.counts.steps[status], 1);
  if (["blocked", "stale", "failed"].includes(status)) assert.equal(state.status, "blocked");
});

test("failed checkpoint is counted and blocks progress", () => {
  const state = built(makeSources({ withCheckpoint: true, checkpointStatus: "failed" }));
  assert.equal(state.counts.checkpoints.failed, 1);
  assert.equal(state.status, "blocked");
  assert.ok(state.blockers.some((entry) => entry.code === "current_checkpoint_failed"));
});

test("current step and checkpoint next action selection are deterministic", () => {
  const waiting = built(makeSources({ withCheckpoint: true }));
  assert.equal(waiting.nextAction.type, "review_checkpoint");
  const reviewing = built(makeSources({ withCheckpoint: true, checkpointStatus: "reviewing" }));
  assert.equal(reviewing.nextAction.type, "continue_checkpoint");
});

test("duplicate and incompatible references are blockers", () => {
  const duplicate = makeSources(); duplicate.stepRecords.push(structuredClone(duplicate.stepRecords[0])); duplicate.stepRecords[1].progress_id = "duplicate-step-record";
  assert.ok(built(duplicate).blockers.some((entry) => entry.code === "duplicate_record_identity" || entry.code === "duplicate_step_reference"));
  const incompatible = makeSources(); const changed = structuredClone(incompatible.stepRecords[0].state); changed.sourcePlanId = "another-plan"; incompatible.stepRecords[0].state = resealStep(changed);
  assert.ok(built(incompatible).blockers.some((entry) => entry.code === "incompatible_step_identity"));
});

test("source revision mismatch is rejected", () => {
  const sources = makeSources(); sources.session = structuredClone(sources.session); sources.session.sourceExecutionPlanRevision += 1; sources.session.sessionFingerprint = sessionApi.calculateSessionFingerprint(sources.session); sources.sessionRecord = { ...sources.sessionRecord, state: sources.session };
  const state = built(sources);
  assert.equal(state.status, "blocked");
  assert.ok(state.blockers.some((entry) => entry.code === "source_revision_mismatch"));
});

test("interrupted building recovery is predictable and retry is explicit", () => {
  const initial = api.createInitialState("project", { calculationId: "calculation", now: stamp(1) });
  const building = api.beginBuild(initial, { expectedRevision: 1, operationId: op("build"), now: stamp(2) });
  const recovered = api.recoverInterruptedProgress(building, { expectedRevision: building.revision, now: stamp(3) });
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.failure.code, "interrupted_build");
  const retried = api.retryProgress(recovered, makeSources(), { expectedRevision: recovered.revision, operationId: op("retry"), now: stamp(4) });
  assert.equal(retried.status, "ready");
});

test("explicit rebuild creates a new immutable snapshot revision", () => {
  const sources = makeSources(); const state = built(sources);
  sources.session = sessionApi.pauseExecutionSession(sources.session, { now: stamp(20) }); sources.sessionRecord.state = sources.session;
  const stale = api.markStale(state, sources, { expectedRevision: state.revision, now: stamp(21) });
  assert.equal(stale.status, "stale");
  const rebuilt = api.rebuildProgress(stale, sources, { expectedRevision: stale.revision, operationId: op("rebuild"), now: stamp(22) });
  assert.equal(rebuilt.status, "ready");
  assert.notEqual(rebuilt.immutableSnapshotFingerprint, state.immutableSnapshotFingerprint);
});

test("snapshot and returned state are deeply immutable", () => {
  const state = built();
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.immutableSnapshot));
  assert.throws(() => { state.immutableSnapshot.counts.steps.total = 99; }, TypeError);
});

test("stale detection covers plan/session/epoch/step/checkpoint composition", () => {
  const sources = makeSources({ withCheckpoint: true }); const state = built(sources);
  assert.equal(api.detectStaleness(state, sources).stale, false);
  const changed = structuredClone(sources); changed.sessionEpoch = 2;
  assert.ok(api.detectStaleness(state, changed).reasons.some((entry) => entry.code === "source_session_epoch_changed"));
  const stepChanged = structuredClone(sources); stepChanged.stepRecords[0].state.revision += 1;
  assert.ok(api.detectStaleness(state, stepChanged).reasons.some((entry) => entry.code === "source_steps_changed"));
  const checkpointChanged = structuredClone(sources); checkpointChanged.checkpointRecords[0].state.revision += 1;
  assert.ok(api.detectStaleness(state, checkpointChanged).reasons.some((entry) => entry.code === "source_checkpoints_changed"));
});

test("repository saves, reloads and enforces optimistic concurrency", async () => {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Progress repository" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const state = api.createInitialState(project.project_id, { calculationId: added.calculation.calculation_id });
  const saved = await repository.ensurePatternExecutionProgress(project.project_id, added.calculation.calculation_id, state);
  assert.deepEqual((await repository.getPatternExecutionProgress(project.project_id)).state, saved.state);
  const building = api.beginBuild(saved.state, { expectedRevision: saved.state.revision, operationId: op("build") });
  await repository.updatePatternExecutionProgress(project.project_id, added.calculation.calculation_id, building, { expectedRevision: saved.state.revision });
  await assert.rejects(repository.updatePatternExecutionProgress(project.project_id, added.calculation.calculation_id, building, { expectedRevision: saved.state.revision }), { code: "PATTERN_EXECUTION_PROGRESS_REVISION_CONFLICT" });
  await repository.close(); repositories.pop();
  const reopened = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(reopened); await reopened.initialize();
  assert.equal((await reopened.getPatternExecutionProgress(project.project_id)).state.status, "building");
});

test("export contains Stage 26 without changing the IndexedDB version", async () => {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Progress export" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  await repository.ensurePatternExecutionProgress(project.project_id, added.calculation.calculation_id, api.createInitialState(project.project_id, { calculationId: added.calculation.calculation_id }));
  const exported = await repository.exportProject(project.project_id);
  assert.ok(exported.envelope.payload.progress.some((entry) => entry.kind === api.PROGRESS_KIND));
  assert.equal(global.YarnAIProjectSystem.DB_VERSION, 4);
});

test("export/import retains Stage 26 and marks unverifiable identity stale", async () => {
  const context = await repositoryChain("Progress ordinary import");
  const exported = await context.repository.exportProject(context.project.project_id);
  await context.repository.softDeleteProject(context.project.project_id);
  await context.repository.permanentlyDeleteProject(context.project.project_id, { confirmed: true });
  const imported = await context.repository.importProject(exported.json);
  assert.equal(imported.collision, false);
  const aggregate = await context.repository.getProject(imported.project_id);
  const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  assert.equal(state.status, "stale");
  assert.ok(state.staleReasons.some((entry) => entry.code === "import_identity_unproven"));
  assert.equal(state.nextAction.type, "rebuild_progress");
});

test("collision import remaps Stage 26 project and internal source references without overwrite", async () => {
  const context = await repositoryChain("Progress collision import");
  const original = context.inspected.progress;
  const exported = await context.repository.exportProject(context.project.project_id);
  const imported = await context.repository.importProject(exported.envelope);
  assert.equal(imported.collision, true);
  assert.notEqual(imported.project_id, context.project.project_id);
  const aggregate = await context.repository.getProject(imported.project_id);
  const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  const plan = aggregate.progress.find((entry) => entry.kind === planApi.PROGRESS_KIND).state;
  const session = aggregate.progress.find((entry) => entry.kind === sessionApi.PROGRESS_KIND).state;
  assert.notEqual(state.id, original.id);
  assert.equal(state.projectId, imported.project_id);
  assert.equal(state.sourceCalculationId, aggregate.project.active_calculation_id);
  assert.equal(state.sourcePlanId, plan.id);
  assert.equal(state.sourceSessionId, session.id);
  assert.equal(state.immutableSnapshot.sourceIdentity.projectId, imported.project_id);
  assert.equal(state.status, "stale");
  assert.ok(state.audit.some((entry) => entry.event === "collision_remapped"));
  assert.equal((await context.repository.getProject(context.project.project_id)).project.project_id, context.project.project_id);
});

test("module has no network, OCR, LLM, file reanalysis or unsafe DOM path", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-execution-progress.js"), "utf8").toLowerCase();
  for (const forbidden of ["fetch(", "xmlhttprequest", "websocket", "tesseract", "api.openai.com", "filereader", "innerhtml"]) assert.equal(source.includes(forbidden), false);
});
