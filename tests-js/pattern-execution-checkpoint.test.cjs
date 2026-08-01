"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { webcrypto } = require("node:crypto");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");
Object.assign(global, { indexedDB, IDBKeyRange });
if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto });
require("../src/yarnai/static/project-system.js");
const planApi = require("../src/yarnai/static/pattern-execution-plan.js");
const sessionApi = require("../src/yarnai/static/pattern-execution-session.js");
const stepApi = require("../src/yarnai/static/pattern-execution-step.js");
const api = require("../src/yarnai/static/pattern-execution-checkpoint.js");

const stamp = (second) => `2026-08-01T10:00:${String(second).padStart(2, "0")}.000Z`;
const fp = (seed) => api.fingerprint({ seed });
let sequence = 0;
const op = (type) => `${type}:${++sequence}`;

function makePlan(checkpoint = {}, projectId = "project:id") {
  const sourceCheckpoint = {
    id: "checkpoint:one", type: checkpoint.type || "stitch_count_check", phaseId: "phase:one",
    componentIds: ["component:one"], expectedValue: checkpoint.expectedValue ?? 10,
    unit: checkpoint.unit === undefined ? "stitches" : checkpoint.unit, required: true,
    blockingOnFailure: true, sourceTargetIds: ["source:checkpoint"],
    ...(checkpoint.options ? { options: checkpoint.options } : {}), ...(checkpoint.range ? { range: checkpoint.range } : {}),
  };
  const state = {
    id: "plan:id", projectId, kind: "PATTERN_EXECUTION_PLAN", schemaVersion: 1, version: 1,
    revision: 5, status: "ready", createdAt: stamp(1), updatedAt: stamp(2),
    sourceTechnologyReviewId: "review:id", sourceTechnologyReviewRevision: 7, sourceTechnologyReviewFingerprint: fp("review"), sourceConfirmedSnapshotFingerprint: fp("confirmed"),
    sourceTechnologyDraftId: "draft:id", sourceTechnologyDraftRevision: 6, sourceTechnologyDraftFingerprint: fp("draft"),
    sourceAnalysisReviewId: "analysis:id", sourceAnalysisReviewRevision: 5, sourceAnalysisReviewFingerprint: fp("analysis"),
    sourceSemanticAnalysisId: "semantic:id", sourceSemanticAnalysisRevision: 4, sourceSemanticAnalysisFingerprint: fp("semantic"),
    sourceImportRevision: 3, sourceAlgorithmVersion: 1, planningAlgorithmVersion: 1, planningInputFingerprint: fp("planning"),
    blockers: [], warnings: [], audit: [], error: null, interruptedOperation: null, planFingerprint: null,
    plan: {
      schemaVersion: 1, summary: {}, prerequisites: [], materials: [], tools: [], measurements: [], gauge: [],
      components: [{ id: "component:one", type: "body", label: "Корпус", quantity: 1, constructionRole: "body", parentComponentId: null, sourceTargetIds: ["source:component"], dependencies: [], completionCriteria: [], status: "planned", sourceComponentId: "source:component", instance: 1 }],
      phases: [{ id: "phase:one", order: 1, type: "main_fabric", title: "Основная работа", componentIds: ["component:one"], dependsOnPhaseIds: [], canRunInParallelWith: [], sourceTargetIds: ["source:phase"], entryCriteria: [], actions: [{ id: "action:one", order: 1, type: "knit", title: "Связать", description: "Выполнить действие", required: true, sourceTargetIds: ["source:action"] }], exitCriteria: [], checkpoints: [sourceCheckpoint.id], unresolved: [], status: "ready", required: true }],
      dependencyGraph: { nodes: [{ id: "phase:one", type: "phase", order: 1, required: true }], edges: [], componentNodes: [{ id: "component:one", type: "component" }] },
      checkpoints: [sourceCheckpoint], firstAction: { phaseId: "phase:one", actionId: "action:one", ready: true, blockedBy: [] }, unresolved: [], completionCriteria: [], planFingerprint: null,
    },
  };
  state.planFingerprint = planApi.calculatePlanFingerprint(state); state.plan.planFingerprint = state.planFingerprint;
  return state;
}

function fixture(checkpoint = {}) {
  const plan = makePlan(checkpoint); const context = { executionPlan: plan, requireCurrentIdentity: false };
  let session = sessionApi.createExecutionSession(plan, plan.projectId, { expectedPlanRevision: plan.revision, now: stamp(3) });
  session = sessionApi.startExecutionSession(session, plan, { now: stamp(4) });
  let step = stepApi.createExecutionStep(session, plan.projectId, { expectedSessionRevision: session.revision, context, now: stamp(5) });
  step = stepApi.startStep(step, { expectedRevision: step.revision, operationId: op("step-start"), now: stamp(6) });
  step = stepApi.checkStep(step, { expectedRevision: step.revision, operationId: op("step-check"), confirmed: true, now: stamp(7) });
  let state = api.createCheckpoint(session, plan, step, { projectId: plan.projectId, checkpointId: "checkpoint:one", context, now: stamp(8) });
  return { plan, session, step, state, context };
}
function ready(checkpoint = {}) { const value = fixture(checkpoint); value.state = api.prepareCheckpoint(value.state, value.session, value.plan, value.step, { expectedRevision: value.state.revision, operationId: op("prepare"), context: value.context, now: stamp(9) }); return value; }
function reviewing(checkpoint = {}) { const value = ready(checkpoint); value.state = api.startReview(value.state, { expectedRevision: value.state.revision, operationId: op("start"), now: stamp(10) }); return value; }
function setOnlyObservation(value, input) { const spec = value.state.immutableSourceSnapshot.observationSpecs[0]; value.state = api.setObservation(value.state, spec.observationId, input, { expectedRevision: value.state.revision, operationId: op("observe"), now: stamp(11) }); return value; }
function reseal(state) { state.checkpointFingerprint = null; state.checkpointFingerprint = api.calculateCheckpointFingerprint(state); return state; }

test("creates only from a proven Stage 22 checkpoint and keeps immutable snapshot", () => { const value = fixture(); assert.equal(value.state.status, "waiting"); assert.ok(Object.isFrozen(value.state.immutableSourceSnapshot)); assert.equal(value.state.checkpointId, "checkpoint:one"); });
test("does not create when the plan has no checkpoint", () => { const plan = makePlan(); plan.plan.checkpoints = []; plan.plan.phases[0].checkpoints = []; plan.planFingerprint = planApi.calculatePlanFingerprint(plan); plan.plan.planFingerprint = plan.planFingerprint; let session = sessionApi.createExecutionSession(plan, plan.projectId); session = sessionApi.startExecutionSession(session, plan); assert.throws(() => api.createCheckpoint(session, plan, null, { context: { executionPlan: plan, requireCurrentIdentity: false } }), { code: "checkpoint_source_missing" }); });
test("does not infer an unknown source checkpoint type", () => assert.throws(() => fixture({ type: "mystery_check" }), { code: "checkpoint_type_unsupported" }));
test("waiting → ready → reviewing → deferred → reviewing is explicit", () => { let value = ready(); value.state = api.startReview(value.state, { expectedRevision: value.state.revision, operationId: op("start") }); value.state = api.deferCheckpoint(value.state, { expectedRevision: value.state.revision, operationId: op("defer") }); assert.equal(value.state.status, "deferred"); value.state = api.startReview(value.state, { expectedRevision: value.state.revision, operationId: op("resume") }); assert.equal(value.state.status, "reviewing"); });
test("reviewing → rejected records a bounded structured reason", () => { const value = reviewing(); const state = api.rejectCheckpoint(value.state, { expectedRevision: value.state.revision, operationId: op("reject"), reasonCode: "mismatch", comment: "Нужно исправить" }); assert.equal(state.status, "rejected"); assert.equal(state.decision.reasonCode, "mismatch"); });
test("forbids invalid lifecycle transitions and confirmed mutation", () => { const value = ready(); assert.throws(() => api.deferCheckpoint(value.state, { expectedRevision: value.state.revision, operationId: op("defer") }), { code: "invalid_status_transition" }); });
test("structural validation detects immutable snapshot changes", () => { const value = ready(); const state = structuredClone(value.state); state.immutableSourceSnapshot.checkpoint.label = "changed"; reseal(state); assert.ok(api.validateStructural(state).some((entry) => entry.code === "immutable_snapshot_changed")); });
test("rejects unknown observation fields", () => { const value = reviewing(); const spec = value.state.immutableSourceSnapshot.observationSpecs[0]; assert.throws(() => api.setObservation(value.state, spec.observationId, { value: 10, unit: "stitches", extra: true }, { expectedRevision: value.state.revision, operationId: op("observe") }), { code: "observation_unknown_field" }); });
test("rejects NaN, infinity and negative numeric observations", () => { for (const invalid of [NaN, Infinity, -1]) { const value = reviewing(); const spec = value.state.immutableSourceSnapshot.observationSpecs[0]; assert.throws(() => api.setObservation(value.state, spec.observationId, { value: invalid, unit: "stitches" }, { expectedRevision: value.state.revision, operationId: op("observe") })); } });
test("enforces proven units", () => { const value = reviewing(); const spec = value.state.immutableSourceSnapshot.observationSpecs[0]; assert.throws(() => api.setObservation(value.state, spec.observationId, { value: 10, unit: "rows" }, { expectedRevision: value.state.revision, operationId: op("observe") }), { code: "observation_unit_mismatch" }); });

for (const [name, checkpoint, input] of [
  ["row count", { type: "row_count_check", expectedValue: 12, unit: "rows" }, { value: 12, unit: "rows" }],
  ["stitch count", { type: "stitch_count_check", expectedValue: 10, unit: "stitches" }, { value: 10, unit: "stitches" }],
  ["measurement", { type: "measurement_check", expectedValue: 20, unit: "cm" }, { value: 20, unit: "cm" }],
  ["size length", { type: "length_check", expectedValue: 30, unit: "cm" }, { value: 30, unit: "cm" }],
  ["visual", { type: "visual_confirmation", expectedValue: true, unit: null }, { value: true }],
  ["checkpoint match", { type: "gauge_check", expectedValue: { rows: 20 }, unit: null }, { value: "matched" }],
  ["required result", { type: "component_completion_check", expectedValue: "completed", unit: null }, { value: true }],
  ["choice", { type: "choice", expectedValue: null, unit: null, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, { value: "a" }],
  ["informational", { type: "informational", expectedValue: true, unit: null }, { value: true }],
]) test(`supports ${name} observations`, () => { const value = setOnlyObservation(reviewing(checkpoint), input); const validation = api.validateObservations(value.state); assert.equal(validation.complete, true); assert.equal(validation.matchesExpected, true); });

test("optimistic concurrency returns a structured conflict", () => { const value = ready(); assert.throws(() => api.startReview(value.state, { expectedRevision: 999, operationId: op("start") }), { code: "checkpoint_revision_conflict" }); });
test("same operationId and payload is idempotent", () => { const value = ready(); const operationId = op("start"); const once = api.startReview(value.state, { expectedRevision: value.state.revision, operationId }); const twice = api.startReview(once, { expectedRevision: value.state.revision, operationId }); assert.deepEqual(twice, once); });
test("same operationId with another payload conflicts", () => { const value = reviewing(); const spec = value.state.immutableSourceSnapshot.observationSpecs[0]; const operationId = op("observe"); const once = api.setObservation(value.state, spec.observationId, { value: 10, unit: "stitches" }, { expectedRevision: value.state.revision, operationId }); assert.throws(() => api.setObservation(once, spec.observationId, { value: 9, unit: "stitches" }, { expectedRevision: once.revision, operationId }), { code: "operation_id_conflict" }); });
test("confirmation is two-phase and shares operationId with Stage 23/24/25", () => { const value = setOnlyObservation(reviewing(), { value: 10, unit: "stitches" }); const operationId = op("confirm"); let state = api.beginConfirmation(value.state, value.session, value.plan, value.step, { expectedRevision: value.state.revision, operationId, confirmed: true, context: value.context, now: stamp(12) }); assert.equal(state.status, "sync_pending"); const session = sessionApi.completeCurrentAction(value.session, { actionId: state.actionId, operationId, result: { source: api.PROGRESS_KIND, checkpointRecordId: state.id }, now: stamp(13) }); const step = stepApi.finalizeCheckpointCompletion(value.step, session, state, { expectedRevision: value.step.revision, operationId, now: stamp(14) }); state = api.finalizeConfirmation(state, session, step, { operationId, now: stamp(15) }); assert.equal(state.status, "confirmed"); assert.ok(session.audit.some((entry) => entry.operationId === operationId)); assert.ok(step.audit.some((entry) => entry.operationId === operationId)); assert.ok(state.audit.some((entry) => entry.operationId === operationId)); });
test("cannot confirm incomplete or mismatching observations", () => { let value = reviewing(); assert.throws(() => api.beginConfirmation(value.state, value.session, value.plan, value.step, { expectedRevision: value.state.revision, operationId: op("confirm"), confirmed: true, context: value.context }), { code: "observations_invalid" }); value = setOnlyObservation(value, { value: 9, unit: "stitches" }); assert.throws(() => api.beginConfirmation(value.state, value.session, value.plan, value.step, { expectedRevision: value.state.revision, operationId: op("confirm"), confirmed: true, context: value.context }), { code: "observations_invalid" }); });
test("reload in reviewing and deferred preserves lifecycle", () => { let value = reviewing(); let recovered = api.recoverCheckpoint(value.state, value.session, value.plan, value.step, { expectedRevision: value.state.revision, operationId: op("recovery"), context: value.context }); assert.equal(recovered.status, "reviewing"); value.state = api.deferCheckpoint(value.state, { expectedRevision: value.state.revision, operationId: op("defer") }); recovered = api.recoverCheckpoint(value.state, value.session, value.plan, value.step, { expectedRevision: value.state.revision, operationId: op("recovery"), context: value.context }); assert.equal(recovered.status, "deferred"); });
test("missing linked Stage 24 becomes stale during recovery", () => { const value = ready(); const stale = api.recoverCheckpoint(value.state, value.session, value.plan, null, { expectedRevision: value.state.revision, operationId: op("recovery"), context: value.context }); assert.equal(stale.status, "stale"); });
test("corrupted observations fail deterministically", () => { const value = ready(); const state = structuredClone(value.state); state.observations[0].type = "unknown"; reseal(state); const failed = api.recoverCheckpoint(state, value.session, value.plan, value.step, { expectedRevision: state.revision, operationId: op("recovery"), context: value.context }); assert.equal(failed.status, "failed"); });
test("stale detection covers plan/session/step identity", () => { const value = ready(); assert.equal(api.detectStaleness(value.state, value.session, value.plan, value.step, value.context).stale, false); assert.equal(api.detectStaleness(value.state, value.session, value.plan, null, value.context).stale, true); const plan = structuredClone(value.plan); plan.revision += 1; plan.planFingerprint = planApi.calculatePlanFingerprint(plan); plan.plan.planFingerprint = plan.planFingerprint; assert.equal(api.detectStaleness(value.state, value.session, plan, value.step, value.context).stale, true); });
test("rebuild preserves only fully compatible observations", () => { let value = setOnlyObservation(reviewing(), { value: 10, unit: "stitches" }); let rebuilt = api.rebuildCheckpoint(value.state, value.session, value.plan, value.step, { expectedRevision: value.state.revision, operationId: op("rebuild"), confirmed: true, context: value.context }); assert.deepEqual(rebuilt.observations[0].value, { value: 10, unit: "stitches" }); const incompatible = fixture({ type: "row_count_check", expectedValue: 10, unit: "rows" }); rebuilt = api.rebuildCheckpoint(value.state, incompatible.session, incompatible.plan, incompatible.step, { expectedRevision: value.state.revision, operationId: op("rebuild"), confirmed: true, context: incompatible.context }); assert.equal(rebuilt.observations[0].value, null); });
test("repeating rebuild with the same operationId is idempotent", () => { const value = setOnlyObservation(reviewing(), { value: 10, unit: "stitches" }); const operationId = op("rebuild"); const options = { expectedRevision: value.state.revision, operationId, confirmed: true, context: value.context }; const once = api.rebuildCheckpoint(value.state, value.session, value.plan, value.step, options); const twice = api.rebuildCheckpoint(once, value.session, value.plan, value.step, options); assert.deepEqual(twice, once); });
test("audit and operation logs are bounded", () => { let value = reviewing({ type: "informational", expectedValue: true, unit: null }); for (let index = 0; index < 110; index += 1) { value.state = api.setObservation(value.state, value.state.observations[0].observationId, { value: index % 2 === 0 }, { expectedRevision: value.state.revision, operationId: op("observe"), now: stamp(11) }); } assert.ok(value.state.audit.length <= api.AUDIT_LIMIT); assert.ok(value.state.operations.length <= api.OPERATION_LIMIT); });
test("module contains no network, OCR, LLM or image analysis path", () => { const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-execution-checkpoint.js"), "utf8").toLowerCase(); for (const forbidden of ["fetch(", "xmlhttprequest", "websocket", "tesseract", "api.openai.com", "filereader", "innerhtml"]) assert.equal(source.includes(forbidden), false); });

test("repository stores multiple-epoch checkpoint records and atomically synchronizes Stage 23/24/25", async () => {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); await repository.initialize();
  try {
    const project = await repository.createProject({ title: "Checkpoint repository" });
    const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
    const calculationId = added.calculation.calculation_id; const plan = makePlan({}, project.project_id); const context = { executionPlan: plan, requireCurrentIdentity: false };
    const semanticState = { id: "semantic:id", projectId: project.project_id, kind: "PATTERN_SEMANTIC_ANALYSIS", version: 1, revision: 4, status: "completed", sourceImportRevision: 3 };
    await repository.ensureCalculationProgress(project.project_id, calculationId, semanticState.kind, semanticState);
    const analysisState = { id: "analysis:id", projectId: project.project_id, kind: "PATTERN_ANALYSIS_REVIEW", version: 1, revision: 5, status: "needs_attention", sourceSemanticAnalysisId: semanticState.id, sourceSemanticAnalysisRevision: 4, sourceImportRevision: 3, reviewedData: { items: [], conflictGroups: [] } };
    await repository.ensureCalculationProgress(project.project_id, calculationId, analysisState.kind, analysisState);
    const draftSnapshot = { projectId: project.project_id, sourceSemanticAnalysisId: semanticState.id };
    const draftState = { id: "draft:id", projectId: project.project_id, sourceProjectId: project.project_id, kind: "PATTERN_TECHNOLOGY_DRAFT", version: 1, revision: 6, status: "waiting", immutableSourceSnapshot: draftSnapshot, immutableSourceFingerprint: api.fingerprint(draftSnapshot), sourceConfirmedFingerprint: api.fingerprint(draftSnapshot), sourceReviewId: analysisState.id, sourceSemanticAnalysisId: semanticState.id, sourceImportRevision: 3, draftFingerprint: api.fingerprint({}), algorithmVersion: 1, audit: [] };
    const draftProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, draftState.kind, draftState);
    const reviewSnapshot = { sourceDraftIdentity: { projectId: project.project_id }, sourceReviewIdentity: { projectId: project.project_id }, sourceSemanticIdentity: { projectId: project.project_id }, structuredDraft: {}, validation: {} };
    const reviewState = { id: "review:id", projectId: project.project_id, kind: "PATTERN_TECHNOLOGY_REVIEW", version: 1, revision: 7, status: "waiting", sourceDraftProgressId: draftProgress.progress_id, sourceDraftId: draftState.id, sourceDraftRevision: 6, sourceDraftFingerprint: draftState.draftFingerprint, confirmedSnapshotFingerprint: null, immutableSourceSnapshot: reviewSnapshot, immutableSourceSnapshotFingerprint: api.fingerprint(reviewSnapshot), sourceValidationFingerprint: api.fingerprint(reviewSnapshot.validation), reviewState: { targets: [] }, decisions: [], corrections: [], audit: [] };
    await repository.ensureCalculationProgress(project.project_id, calculationId, reviewState.kind, reviewState);
    plan.planningInputFingerprint = api.fingerprint({
      planningAlgorithmVersion: plan.planningAlgorithmVersion, sourceConfirmedSnapshotFingerprint: plan.sourceConfirmedSnapshotFingerprint,
      sourceTechnologyReviewId: plan.sourceTechnologyReviewId, sourceTechnologyReviewRevision: plan.sourceTechnologyReviewRevision,
      sourceTechnologyReviewFingerprint: plan.sourceTechnologyReviewFingerprint, sourceTechnologyDraftId: plan.sourceTechnologyDraftId,
      sourceTechnologyDraftRevision: plan.sourceTechnologyDraftRevision, sourceTechnologyDraftFingerprint: plan.sourceTechnologyDraftFingerprint,
      sourceAnalysisReviewId: plan.sourceAnalysisReviewId, sourceAnalysisReviewRevision: plan.sourceAnalysisReviewRevision,
      sourceAnalysisReviewFingerprint: plan.sourceAnalysisReviewFingerprint, sourceSemanticAnalysisId: plan.sourceSemanticAnalysisId,
      sourceSemanticAnalysisRevision: plan.sourceSemanticAnalysisRevision, sourceSemanticAnalysisFingerprint: plan.sourceSemanticAnalysisFingerprint,
      sourceImportRevision: plan.sourceImportRevision, sourceAlgorithmVersion: plan.sourceAlgorithmVersion,
    });
    plan.planFingerprint = planApi.calculatePlanFingerprint(plan); plan.plan.planFingerprint = plan.planFingerprint;
    let session = sessionApi.createExecutionSession(plan, plan.projectId, { expectedPlanRevision: plan.revision }); session = sessionApi.startExecutionSession(session, plan);
    let step = stepApi.createExecutionStep(session, plan.projectId, { expectedSessionRevision: session.revision, context }); const initialStep = step;
    step = stepApi.startStep(step, { expectedRevision: step.revision, operationId: op("step-start") }); step = stepApi.checkStep(step, { expectedRevision: step.revision, operationId: op("step-check"), confirmed: true });
    await repository.ensureCalculationProgress(project.project_id, calculationId, plan.kind, plan);
    await repository.ensureCalculationProgress(project.project_id, calculationId, session.kind, session);
    await repository.ensurePatternExecutionStep(project.project_id, calculationId, initialStep);
    const activeStep = stepApi.startStep(initialStep, { expectedRevision: initialStep.revision, operationId: step.operations[0].operationId });
    await repository.updatePatternExecutionStep(project.project_id, calculationId, activeStep);
    await repository.updatePatternExecutionStep(project.project_id, calculationId, step);
    let state = api.createCheckpoint(session, plan, step, { projectId: project.project_id, checkpointId: "checkpoint:one", context });
    let record = await repository.createPatternExecutionCheckpoint(project.project_id, calculationId, state, { operationId: op("create") });
    state = api.prepareCheckpoint(record.state, session, plan, step, { expectedRevision: record.state.revision, operationId: op("prepare"), context });
    record = await repository.updatePatternExecutionCheckpoint(project.project_id, record.progress_id, state, { expectedRevision: record.state.revision, operationId: state.operations.at(-1).operationId });
    state = api.startReview(record.state, { expectedRevision: record.state.revision, operationId: op("start") });
    record = await repository.updatePatternExecutionCheckpoint(project.project_id, record.progress_id, state, { expectedRevision: record.state.revision, operationId: state.operations.at(-1).operationId });
    const spec = record.state.immutableSourceSnapshot.observationSpecs[0]; state = api.setObservation(record.state, spec.observationId, { value: 10, unit: "stitches" }, { expectedRevision: record.state.revision, operationId: op("observe") });
    record = await repository.updatePatternExecutionCheckpoint(project.project_id, record.progress_id, state, { expectedRevision: record.state.revision, operationId: state.operations.at(-1).operationId });
    const baseRevision = record.state.revision;
    const firstOperationId = op("confirm"); const secondOperationId = op("confirm");
    const firstPending = api.beginConfirmation(record.state, session, plan, step, { expectedRevision: baseRevision, operationId: firstOperationId, confirmed: true, context });
    const secondPending = api.beginConfirmation(record.state, session, plan, step, { expectedRevision: baseRevision, operationId: secondOperationId, confirmed: true, context });
    const rivalRepository = new global.YarnAIProjectSystem.ProjectRepository(); await rivalRepository.initialize();
    let confirmations; let persistedPending;
    try {
      confirmations = await Promise.allSettled([
        repository.updatePatternExecutionCheckpoint(project.project_id, record.progress_id, firstPending, { expectedRevision: baseRevision, operationId: firstOperationId }),
        rivalRepository.updatePatternExecutionCheckpoint(project.project_id, record.progress_id, secondPending, { expectedRevision: baseRevision, operationId: secondOperationId }),
      ]);
      persistedPending = await rivalRepository.getPatternExecutionCheckpoint(project.project_id, record.progress_id, calculationId);
    } finally { await rivalRepository.close(); }
    const successfulConfirmations = confirmations.filter((entry) => entry.status === "fulfilled");
    const rejectedConfirmations = confirmations.filter((entry) => entry.status === "rejected");
    assert.equal(successfulConfirmations.length, 1); assert.equal(rejectedConfirmations.length, 1);
    assert.equal(rejectedConfirmations[0].reason.code, "PATTERN_EXECUTION_CHECKPOINT_REVISION_CONFLICT");
    record = successfulConfirmations[0].value; const operationId = record.state.synchronization.operationId;
    assert.equal(record.state.status, "sync_pending");
    assert.deepEqual(persistedPending, record);
    record = await repository.syncPatternExecutionCheckpoint(project.project_id, record.progress_id, { expectedRevision: record.state.revision, operationId });
    const storedSession = (await repository.getPatternExecutionSession(project.project_id, calculationId)).state;
    const storedStep = (await repository.getPatternExecutionStep(project.project_id, calculationId)).state;
    assert.equal(record.state.status, "confirmed"); assert.equal(storedStep.status, "completed");
    assert.equal(storedSession.execution.actions[0].status, "completed");
    assert.ok(record.state.audit.some((entry) => entry.operationId === operationId)); assert.ok(storedStep.audit.some((entry) => entry.operationId === operationId)); assert.ok(storedSession.audit.some((entry) => entry.operationId === operationId));
    assert.equal((await repository.listPatternExecutionCheckpoints(project.project_id, calculationId)).length, 1);
    const projectRevisionAfterCommit = (await repository.getProject(project.project_id)).project.revision;
    const replayed = await repository.syncPatternExecutionCheckpoint(project.project_id, record.progress_id, { expectedRevision: record.state.revision, operationId });
    assert.deepEqual(replayed, record);
    assert.equal((await repository.getProject(project.project_id)).project.revision, projectRevisionAfterCommit);
    const exported = await repository.exportProject(project.project_id);
    const imported = await repository.importProject(exported.json);
    const importedAggregate = await repository.getProject(imported.project_id);
    const importedCheckpoint = importedAggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
    const importedSession = importedAggregate.progress.find((entry) => entry.kind === sessionApi.PROGRESS_KIND).state;
    const importedStep = importedAggregate.progress.find((entry) => entry.kind === stepApi.PROGRESS_KIND).state;
    assert.equal(importedCheckpoint.status, "stale"); assert.equal(importedCheckpoint.projectId, imported.project_id);
    assert.equal(importedCheckpoint.sourceSessionId, importedSession.id); assert.equal(importedCheckpoint.sourceStepId, importedStep.id);
    assert.equal(importedCheckpoint.checkpointId, "checkpoint:one"); assert.equal(importedCheckpoint.actionId, "action:one");
    assert.ok(importedCheckpoint.audit.some((entry) => entry.event === "collision_remapped"));
    await repository.close();
    await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
    const ordinaryRepository = new global.YarnAIProjectSystem.ProjectRepository(); await ordinaryRepository.initialize();
    try {
      const ordinary = await ordinaryRepository.importProject(exported.json); const ordinaryAggregate = await ordinaryRepository.getProject(ordinary.project_id);
      const ordinaryCheckpoint = ordinaryAggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
      assert.equal(ordinary.collision, false); assert.equal(ordinaryCheckpoint.status, "stale");
      assert.ok(ordinaryCheckpoint.audit.some((entry) => entry.event === "imported"));
    } finally { await ordinaryRepository.close(); }
  } finally {
    await repository.close();
    await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  }
});
