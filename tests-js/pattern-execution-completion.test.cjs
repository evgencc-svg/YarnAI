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
const progressApi = require("../src/yarnai/static/pattern-execution-progress.js");
const api = require("../src/yarnai/static/pattern-execution-completion.js");

const repositories = [];
const stamp = (second) => `2026-08-01T11:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000Z`;
const operation = (name) => `${name}:${global.YarnAIProjectSystem.uuidv7()}`;
const record = (state, kind, epoch, progressId) => ({ progress_id: progressId, project_id: state.projectId, calculation_id: "calculation", kind, epoch, state });

function resealPlan(plan) { plan.planFingerprint = null; plan.planFingerprint = planApi.calculatePlanFingerprint(plan); plan.plan.planFingerprint = plan.planFingerprint; return plan; }
function resealSession(session) { session.sessionFingerprint = null; session.sessionFingerprint = sessionApi.calculateSessionFingerprint(session); return session; }
function resealStep(step) { step.stepFingerprint = null; step.stepFingerprint = stepApi.calculateStepFingerprint(step); return step; }
function resealCheckpoint(checkpoint) { checkpoint.checkpointFingerprint = null; checkpoint.checkpointFingerprint = checkpointApi.calculateCheckpointFingerprint(checkpoint); return checkpoint; }
function resealProgress(progress) { progress.progressFingerprint = null; progress.progressFingerprint = progressApi.calculateProgressFingerprint(progress); return progress; }

function makeSources(options = {}) {
  const projectId = options.projectId || "project";
  const calculationId = options.calculationId || "calculation";
  const planId = options.planId || "plan:id";
  const sessionId = options.sessionId || "session:id";
  const progressId = options.progressId || "progress:id";
  const sessionEpoch = options.sessionEpoch || 2;
  const actions = [
    { id: "action:one", order: 1, title: "Первый action", required: true, checkpointId: "checkpoint:one" },
    { id: "action:two", order: 2, title: "Второй action", required: true, checkpointId: "checkpoint:two" },
  ];
  const phases = actions.map((entry, index) => ({
    id: `phase:${index + 1}`, order: index + 1, title: `Фаза ${index + 1}`, required: true,
    componentIds: ["component:one"], dependsOnPhaseIds: index ? [`phase:${index}`] : [],
    actions: [{ id: entry.id, order: 1, title: entry.title, required: entry.required, sourceTargetIds: [`source:${entry.id}`] }],
    checkpoints: [entry.checkpointId],
  }));
  const checkpointDefinitions = actions.map((entry, index) => ({ id: entry.checkpointId, phaseId: `phase:${index + 1}`, actionId: entry.id, required: true, componentIds: ["component:one"] }));
  const plan = {
    id: planId, projectId, kind: "PATTERN_EXECUTION_PLAN", schemaVersion: 1, version: 1, revision: options.planRevision || 5,
    status: "ready", createdAt: stamp(1), updatedAt: stamp(2), planningAlgorithmVersion: 1, sourceAlgorithmVersion: 1,
    planningInputFingerprint: null, sourceTechnologyReviewId: "review:id", sourceTechnologyReviewRevision: 7,
    sourceTechnologyReviewFingerprint: planApi.fingerprint({ source: "review" }), sourceConfirmedSnapshotFingerprint: planApi.fingerprint({ source: "confirmed" }),
    sourceTechnologyDraftId: "draft:id", sourceTechnologyDraftRevision: 6, sourceTechnologyDraftFingerprint: planApi.fingerprint({ source: "draft" }),
    sourceAnalysisReviewId: "analysis:id", sourceAnalysisReviewRevision: 5, sourceAnalysisReviewFingerprint: planApi.fingerprint({ source: "analysis" }),
    sourceSemanticAnalysisId: "semantic:id", sourceSemanticAnalysisRevision: 4, sourceSemanticAnalysisFingerprint: planApi.fingerprint({ source: "semantic" }), sourceImportRevision: 3,
    blockers: [], warnings: [], audit: [],
    plan: { schemaVersion: 1, summary: {}, prerequisites: [], materials: [], tools: [], measurements: [], gauge: [], components: [{ id: "component:one" }], phases, checkpoints: checkpointDefinitions, dependencyGraph: { nodes: [], edges: [] }, firstAction: { phaseId: "phase:1", actionId: "action:one" }, unresolved: [], completionCriteria: [], planFingerprint: null },
    planFingerprint: null,
  };
  plan.planningInputFingerprint = planApi.fingerprint({
    planningAlgorithmVersion: plan.planningAlgorithmVersion, sourceConfirmedSnapshotFingerprint: plan.sourceConfirmedSnapshotFingerprint,
    sourceTechnologyReviewId: plan.sourceTechnologyReviewId, sourceTechnologyReviewRevision: plan.sourceTechnologyReviewRevision,
    sourceTechnologyReviewFingerprint: plan.sourceTechnologyReviewFingerprint, sourceTechnologyDraftId: plan.sourceTechnologyDraftId,
    sourceTechnologyDraftRevision: plan.sourceTechnologyDraftRevision, sourceTechnologyDraftFingerprint: plan.sourceTechnologyDraftFingerprint,
    sourceAnalysisReviewId: plan.sourceAnalysisReviewId, sourceAnalysisReviewRevision: plan.sourceAnalysisReviewRevision,
    sourceAnalysisReviewFingerprint: plan.sourceAnalysisReviewFingerprint, sourceSemanticAnalysisId: plan.sourceSemanticAnalysisId,
    sourceSemanticAnalysisRevision: plan.sourceSemanticAnalysisRevision, sourceSemanticAnalysisFingerprint: plan.sourceSemanticAnalysisFingerprint,
    sourceImportRevision: plan.sourceImportRevision, sourceAlgorithmVersion: plan.sourceAlgorithmVersion,
  });
  resealPlan(plan);
  const session = {
    id: sessionId, projectId, kind: "PATTERN_EXECUTION_SESSION", schemaVersion: 1, version: 1, revision: options.sessionRevision || 9,
    status: "completed", createdAt: stamp(3), updatedAt: stamp(4), sourceExecutionPlanId: plan.id,
    sourceExecutionPlanRevision: plan.revision, sourceExecutionPlanFingerprint: plan.planFingerprint,
    sourceSemanticAnalysisId: plan.sourceSemanticAnalysisId, sourceImportRevision: plan.sourceImportRevision,
    sourceConfirmedSnapshotFingerprint: plan.sourceConfirmedSnapshotFingerprint,
    execution: { mode: "sequential", actions: actions.map((entry, index) => ({ actionId: entry.id, phaseId: `phase:${index + 1}`, order: index + 1, required: true, status: "completed" })) },
    currentPosition: { phaseId: null, actionId: null }, completedActionIds: actions.map((entry) => entry.id), skippedActionIds: [], checkpoints: [], blockers: [], audit: [], planSnapshot: null, sessionFingerprint: null,
  };
  resealSession(session);
  const stepRecords = actions.map((entry, index) => {
    const step = {
      id: `step:${index + 1}`, projectId, kind: "PATTERN_EXECUTION_STEP", schemaVersion: 1, version: 1, revision: index + 3,
      status: "completed", createdAt: stamp(5 + index), updatedAt: stamp(7 + index), sourceSessionId: session.id,
      sourceSessionRevision: session.revision, sourceSessionFingerprint: session.sessionFingerprint,
      sourcePlanId: plan.id, sourcePlanRevision: plan.revision, sourcePlanFingerprint: plan.planFingerprint,
      sourceImportRevision: plan.sourceImportRevision, phaseId: `phase:${index + 1}`, actionId: entry.id,
      audit: [], operations: [], validation: { valid: true, stale: false }, stepFingerprint: null,
    };
    return record(resealStep(step), step.kind, index + 1, `step-record:${index + 1}`);
  });
  const checkpointRecords = actions.map((entry, index) => {
    const step = stepRecords[index].state;
    const chain = {
      sourceSessionId: session.id, sourceSessionRevision: session.revision, sourceSessionFingerprint: session.sessionFingerprint, sourceSessionEpoch: sessionEpoch,
      sourcePlanId: plan.id, sourcePlanRevision: plan.revision, sourcePlanFingerprint: plan.planFingerprint,
      sourceStepId: step.id, sourceStepRevision: step.revision, sourceStepFingerprint: step.stepFingerprint, sourceImportRevision: plan.sourceImportRevision,
    };
    const checkpoint = {
      id: `checkpoint-record:${index + 1}`, projectId, kind: "PATTERN_EXECUTION_CHECKPOINT", schemaVersion: 1, version: 1, revision: index + 4,
      status: "confirmed", createdAt: stamp(9 + index), updatedAt: stamp(11 + index), sourceSessionId: session.id,
      sourceSessionEpoch: sessionEpoch, sourcePlanId: plan.id, sourceStepId: step.id, phaseId: `phase:${index + 1}`,
      actionId: entry.id, checkpointId: entry.checkpointId, identityChain: chain, audit: [], operations: [],
      validation: { valid: true, complete: true, matchesExpected: true, stale: false }, checkpointFingerprint: null,
    };
    return record(resealCheckpoint(checkpoint), checkpoint.kind, index + 1, `checkpoint-progress:${index + 1}`);
  });
  const base = {
    project: { project_id: projectId, active_calculation_id: calculationId, title: "Completion fixture" }, projectId,
    calculation: { calculation_id: calculationId, revision: 2, fingerprint: api.fingerprint({ calculationId }) }, calculationId,
    planRecord: record(plan, plan.kind, 1, "plan-progress"), plan,
    sessionRecord: record(session, session.kind, sessionEpoch, "session-progress"), session, sessionEpoch,
    stepRecords, checkpointRecords,
  };
  const progressIdentity = progressApi.sourceIdentity(base);
  const progress = {
    id: progressId, projectId, kind: "PATTERN_EXECUTION_PROGRESS", schemaVersion: 1, version: 1, revision: options.progressRevision || 6,
    status: "ready", createdAt: stamp(13), updatedAt: stamp(14), sourcePlanId: plan.id, sourcePlanRevision: plan.revision,
    sourcePlanFingerprint: plan.planFingerprint, sourceSessionId: session.id, sourceSessionRevision: session.revision,
    sourceSessionEpoch: sessionEpoch, sourceSessionFingerprint: session.sessionFingerprint, sourceImportRevision: plan.sourceImportRevision,
    sourceCalculationId: calculationId, sourceStepsFingerprint: progressIdentity.sourceStepsFingerprint,
    sourceCheckpointsFingerprint: progressIdentity.sourceCheckpointsFingerprint, sourceIdentityFingerprint: progressIdentity.sourceIdentityFingerprint,
    counts: { phases: { total: 2 }, steps: { total: 2, waiting: 0, ready: 0, active: 0, paused: 0, blocked: 0, completed: 2, stale: 0, failed: 0, skipped: 0, resolved: 2, progressPercent: 100 }, checkpoints: { total: 2, pending: 0, reviewing: 0, passed: 2, failed: 0 } },
    currentStep: null, nextAction: null, blockers: [], staleReasons: [], warnings: [], immutableSnapshot: { logicalSteps: actions.map((entry) => ({ actionId: entry.id, required: true, status: "completed" })) }, immutableSnapshotFingerprint: null,
    validation: { valid: true, stale: false }, audit: [], operations: [], progressFingerprint: null,
  };
  progress.immutableSnapshotFingerprint = progressApi.calculateSnapshotFingerprint(progress.immutableSnapshot);
  resealProgress(progress);
  return { ...base, progressRecord: record(progress, progress.kind, 1, "progress-record"), progress };
}

function verified(sources = makeSources(), options = {}) {
  const state = api.createInitialState(sources.projectId, { calculationId: sources.calculationId, now: stamp(20) });
  return api.verifyCompletion(state, sources, { expectedRevision: state.revision, operationId: operation("verify"), mode: "verify", now: options.now || stamp(21) });
}
function blockerCodes(state) { return state.blockers.map((entry) => entry.code); }
function mutateSource(sources, callback) { const next = structuredClone(sources); callback(next); return next; }

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("1. successful completion creates a ready immutable proof", () => { const state = verified(); assert.equal(state.status, "ready"); assert.equal(state.completionSnapshot.executionStatus, "completed"); assert.deepEqual(state.completionSnapshot.counts, { phases: 2, logicalSteps: 2, actions: 2, completedActions: 2, requiredCheckpoints: 2, confirmedCheckpoints: 2 }); });
test("2-5. snapshot and fingerprint are deterministic, immutable and input-order independent", () => {
  const sources = makeSources(); const first = verified(sources, { now: stamp(21) });
  const shuffled = structuredClone(sources); shuffled.stepRecords.reverse(); shuffled.checkpointRecords.reverse();
  const second = verified(shuffled, { now: stamp(59) });
  assert.deepEqual(first.completionSnapshot.phaseSummaries, second.completionSnapshot.phaseSummaries);
  assert.equal(first.completionFingerprint, second.completionFingerprint);
  assert.equal(api.calculateCompletionFingerprint(first.completionSnapshot), first.completionFingerprint);
  assert.ok(Object.isFrozen(first)); assert.ok(Object.isFrozen(first.completionSnapshot)); assert.ok(Object.isFrozen(first.completionSnapshot.stepSummaries));
  assert.throws(() => { first.completionSnapshot.counts.actions = 99; }, TypeError);
});
test("fingerprint changes for a required checkpoint, action status, session epoch and progress fingerprint", () => {
  const snapshot = structuredClone(verified().completionSnapshot);
  const values = [];
  for (const mutate of [
    (item) => { item.checkpointSummaries[0].status = "missing"; },
    (item) => { item.stepSummaries[0].actionStatus = "pending"; },
    (item) => { item.sessionEpoch += 1; },
    (item) => { item.progressIdentity.fingerprint = api.fingerprint({ changed: true }); item.sourceFingerprints.progress = item.progressIdentity.fingerprint; },
  ]) { const changed = structuredClone(snapshot); mutate(changed); values.push(api.calculateCompletionFingerprint(changed)); }
  assert.ok(values.every((value) => value !== snapshot.completionFingerprint));
  assert.equal(new Set(values).size, values.length);
});

for (const [name, mutate, code] of [
  ["6. missing Stage 22", (s) => { s.plan = null; s.planRecord = null; }, "stage_22_missing"],
  ["7. missing Stage 23", (s) => { s.session = null; s.sessionRecord = null; }, "stage_23_missing"],
  ["8. missing Stage 26", (s) => { s.progress = null; s.progressRecord = null; }, "stage_26_missing"],
  ["9. Stage 26 is not ready", (s) => { s.progress.status = "blocked"; resealProgress(s.progress); }, "stage_26_not_ready"],
  ["10. Stage 26 blockers", (s) => { s.progress.blockers = [{ code: "source_blocked" }]; resealProgress(s.progress); }, "stage_26_has_blockers"],
  ["11. unfinished next action", (s) => { s.progress.nextAction = { type: "continue_step" }; resealProgress(s.progress); }, "stage_26_next_action_pending"],
  ["12. unfinished required step", (s) => { s.stepRecords[0].state.status = "active"; resealStep(s.stepRecords[0].state); }, "action_not_completed"],
  ["13. missing checkpoint", (s) => { s.checkpointRecords.shift(); }, "required_checkpoint_missing"],
  ["14. duplicate action", (s) => { s.session.execution.actions.push(structuredClone(s.session.execution.actions[0])); resealSession(s.session); }, "duplicate_action"],
  ["15. duplicate checkpoint", (s) => { const duplicate = structuredClone(s.checkpointRecords[0]); duplicate.progress_id = "duplicate-checkpoint"; duplicate.state.id = "duplicate-checkpoint"; resealCheckpoint(duplicate.state); s.checkpointRecords.push(duplicate); }, "duplicate_checkpoint"],
  ["16. checkpoint old session epoch", (s) => { s.checkpointRecords[0].state.sourceSessionEpoch -= 1; s.checkpointRecords[0].state.identityChain.sourceSessionEpoch -= 1; resealCheckpoint(s.checkpointRecords[0].state); }, "checkpoint_old_epoch"],
  ["17. incompatible action identity", (s) => { s.stepRecords[0].state.actionId = "unknown-action"; resealStep(s.stepRecords[0].state); }, "incompatible_action_identity"],
  ["18. incompatible checkpoint identity", (s) => { s.checkpointRecords[0].state.sourceStepId = "unknown-step"; resealCheckpoint(s.checkpointRecords[0].state); }, "incompatible_checkpoint_identity"],
  ["19. plan revision mismatch", (s) => { s.session.sourceExecutionPlanRevision += 1; resealSession(s.session); }, "revision_mismatch"],
  ["20. session fingerprint mismatch", (s) => { s.session.sessionFingerprint = api.fingerprint({ invalid: true }); }, "fingerprint_mismatch"],
  ["21. progress fingerprint mismatch", (s) => { s.progress.progressFingerprint = api.fingerprint({ invalid: true }); }, "fingerprint_mismatch"],
  ["empty execution plan", (s) => { s.plan.plan.phases = []; s.plan.plan.checkpoints = []; resealPlan(s.plan); }, "execution_plan_empty"],
]) test(name, () => { const state = verified(mutateSource(makeSources(), mutate)); assert.equal(state.status, "blocked"); assert.ok(blockerCodes(state).includes(code), blockerCodes(state).join(",")); });

test("checkpoint with unknown action has a stable blocker", () => { const sources = mutateSource(makeSources(), (s) => { s.checkpointRecords[0].state.actionId = "unknown-action"; resealCheckpoint(s.checkpointRecords[0].state); }); const state = verified(sources); assert.ok(blockerCodes(state).includes("checkpoint_unknown_action")); });
test("corrupted project/calculation identity is blocked safely", () => { const sources = makeSources(); sources.calculationId = null; sources.calculation = null; const state = verified(sources); assert.equal(state.status, "blocked"); assert.ok(blockerCodes(state).includes("source_identity_corrupt")); });

test("22. stale detection is read-only until explicit persistence and never rebuilds", () => {
  const sources = makeSources(); const state = verified(sources); const changed = structuredClone(sources); changed.progress.revision += 1; resealProgress(changed.progress);
  const detected = api.detectStaleness(state, changed); assert.equal(detected.stale, true); assert.ok(detected.reasons.some((entry) => entry.code === "progress_revision_changed")); assert.equal(state.status, "ready");
});
test("stale detection covers project, calculation, import, plan, session, steps, checkpoints and source schema", () => {
  const sources = makeSources(); const state = verified(sources);
  const cases = [
    [(s) => { s.projectId = "changed-project"; s.project.project_id = "changed-project"; }, "project_identity_changed"],
    [(s) => { s.calculation.fingerprint = "changed"; }, "calculation_identity_changed"],
    [(s) => { s.plan.sourceImportRevision += 1; resealPlan(s.plan); }, "import_identity_changed"],
    [(s) => { s.plan.revision += 1; resealPlan(s.plan); }, "plan_revision_changed"],
    [(s) => { s.session.revision += 1; resealSession(s.session); }, "session_revision_changed"],
    [(s) => { s.sessionEpoch += 1; }, "session_epoch_changed"],
    [(s) => { s.stepRecords[0].state.revision += 1; resealStep(s.stepRecords[0].state); }, "steps_composition_changed"],
    [(s) => { s.checkpointRecords[0].state.revision += 1; resealCheckpoint(s.checkpointRecords[0].state); }, "checkpoints_composition_changed"],
  ];
  for (const [change, code] of cases) assert.ok(api.detectStaleness(state, mutateSource(sources, change)).reasons.some((entry) => entry.code === code), code);
  const wrongSchema = structuredClone(state); wrongSchema.sourceSchemaVersion += 1; assert.ok(api.detectStaleness(wrongSchema, sources).reasons.some((entry) => entry.code === "source_schema_version_changed"));
});

test("23. explicit retry keeps the expected identity", () => { const sources = mutateSource(makeSources(), (s) => { s.progress.nextAction = { type: "continue" }; resealProgress(s.progress); }); const blocked = verified(sources); const retried = api.retryCompletion(blocked, sources, { expectedRevision: blocked.revision, operationId: operation("retry"), now: stamp(30) }); assert.equal(retried.status, "blocked"); assert.ok(retried.audit.some((entry) => entry.event === "retry_requested")); });
test("retry refuses changed identity and returns stale", () => { const sources = mutateSource(makeSources(), (s) => { s.progress.nextAction = { type: "continue" }; resealProgress(s.progress); }); const blocked = verified(sources); const changed = structuredClone(sources); changed.sessionEpoch += 1; const retried = api.retryCompletion(blocked, changed, { expectedRevision: blocked.revision, operationId: operation("retry"), now: stamp(31) }); assert.equal(retried.status, "stale"); assert.ok(retried.staleReasons.some((entry) => entry.code === "retry_source_identity_changed")); });
test("24. explicit rebuild accepts current identity and creates a new revision", () => { const sources = mutateSource(makeSources(), (s) => { s.progress.nextAction = { type: "continue" }; resealProgress(s.progress); }); const blocked = verified(sources); const fixed = makeSources(); const rebuilt = api.rebuildCompletion(blocked, fixed, { expectedRevision: blocked.revision, operationId: operation("rebuild"), now: stamp(32) }); assert.equal(rebuilt.status, "ready"); assert.ok(rebuilt.revision > blocked.revision); assert.ok(rebuilt.audit.some((entry) => entry.event === "rebuild_requested")); });
test("rebuild operation is idempotent for the same operation id", () => { const blockedSources = mutateSource(makeSources(), (s) => { s.progress.nextAction = { type: "continue" }; resealProgress(s.progress); }); const state = verified(blockedSources); const operationId = operation("rebuild"); const rebuilt = api.rebuildCompletion(state, makeSources(), { expectedRevision: state.revision, operationId, now: stamp(33) }); const repeated = api.rebuildCompletion(rebuilt, makeSources(), { expectedRevision: rebuilt.revision, operationId, now: stamp(34) }); assert.deepEqual(repeated, rebuilt); });

test("25-26. interrupted verifying recovery is failed and idempotent", () => { const initial = api.createInitialState("project", { calculationId: "calculation", now: stamp(1) }); const verifying = api.beginVerification(initial, makeSources(), { expectedRevision: initial.revision, operationId: operation("verify"), mode: "verify", now: stamp(2) }); const recovered = api.recoverInterruptedCompletion(verifying, { expectedRevision: verifying.revision, now: stamp(3) }); const repeated = api.recoverInterruptedCompletion(recovered, { now: stamp(4) }); assert.equal(recovered.status, "failed"); assert.equal(recovered.failure.code, "interrupted_verification"); assert.deepEqual(repeated, recovered); assert.equal(recovered.audit.filter((entry) => entry.event === "interrupted_recovery").length, 1); });
test("27-28. audit and operation history stay bounded", () => { let sources = mutateSource(makeSources(), (s) => { s.progress.nextAction = { type: "continue" }; resealProgress(s.progress); }); let state = verified(sources); for (let index = 0; index < 120; index += 1) state = api.retryCompletion(state, sources, { expectedRevision: state.revision, operationId: operation(`retry-${index}`), now: stamp(40 + index) }); assert.equal(state.audit.length, api.AUDIT_LIMIT); assert.equal(state.operations.length, api.OPERATION_LIMIT); });

async function repositoryFixture(title = "Completion repository") {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const calculationId = added.calculation.calculation_id;
  const planId = global.YarnAIProjectSystem.uuidv7(); const sessionId = global.YarnAIProjectSystem.uuidv7(); const progressId = global.YarnAIProjectSystem.uuidv7();
  const sources = makeSources({ projectId: project.project_id, calculationId, planId, sessionId, progressId });
  const completion = verified(sources);
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
  const waitingSession = { id: sessionId, projectId: project.project_id, kind: "PATTERN_EXECUTION_SESSION", schemaVersion: 1, version: 1, revision: 1, status: "waiting", createdAt: stamp(1), updatedAt: stamp(1), sourceExecutionPlanId: planId, sourceExecutionPlanRevision: sources.plan.revision, sourceExecutionPlanFingerprint: sources.plan.planFingerprint, completedActionIds: [], skippedActionIds: [], checkpoints: [], blockers: [], audit: [], execution: { mode: "sequential", actions: [] }, currentPosition: {}, planSnapshot: null, sessionFingerprint: null };
  resealSession(waitingSession);
  await repository.ensureCalculationProgress(project.project_id, calculationId, sources.plan.kind, sources.plan);
  await repository.ensureCalculationProgress(project.project_id, calculationId, waitingSession.kind, waitingSession);
  await repository.ensureCalculationProgress(project.project_id, calculationId, sources.progress.kind, sources.progress);
  await repository.ensureCalculationProgress(project.project_id, calculationId, api.PROGRESS_KIND, completion);
  return { repository, project, calculationId, completion, sources };
}

test("29. export/import round trip retains completion and marks its identity stale", async () => { const context = await repositoryFixture("Completion round trip"); const exported = await context.repository.exportProject(context.project.project_id); await context.repository.softDeleteProject(context.project.project_id); await context.repository.permanentlyDeleteProject(context.project.project_id, { confirmed: true }); const imported = await context.repository.importProject(exported.json); const state = (await context.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.status, "stale"); assert.ok(state.audit.some((entry) => entry.event === "import")); assert.ok(state.operations.some((entry) => entry.type === "import")); assert.ok(state.staleReasons.some((entry) => entry.code === "import_identity_unproven")); });
test("30. collision import remaps completion project/session/progress identity", async () => { const context = await repositoryFixture("Completion collision"); const imported = await context.repository.importProject((await context.repository.exportProject(context.project.project_id)).envelope); const aggregate = await context.repository.getProject(imported.project_id); const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; const session = aggregate.progress.find((entry) => entry.kind === "PATTERN_EXECUTION_SESSION").state; const progress = aggregate.progress.find((entry) => entry.kind === "PATTERN_EXECUTION_PROGRESS").state; assert.equal(imported.collision, true); assert.notEqual(state.id, context.completion.id); assert.equal(state.projectId, imported.project_id); assert.equal(state.expectedSourceIdentity.projectId, imported.project_id); assert.equal(state.expectedSourceIdentity.session.id, session.id); assert.equal(state.expectedSourceIdentity.progress.id, progress.id); assert.ok(state.audit.some((entry) => entry.event === "collision_import_remap")); assert.ok(state.operations.some((entry) => entry.type === "collision_import_remap")); });
test("31. imported unprovable completion cannot remain ready", async () => { const context = await repositoryFixture("Completion unprovable"); const imported = await context.repository.importProject((await context.repository.exportProject(context.project.project_id)).json); const state = (await context.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.notEqual(state.status, "ready"); assert.equal(state.completionSnapshot.executionStatus, "completed"); });
test("32. collision import never overwrites newer local completion", async () => { const context = await repositoryFixture("Completion no overwrite"); const before = (await context.repository.getPatternExecutionCompletion(context.project.project_id)).state; const imported = await context.repository.importProject((await context.repository.exportProject(context.project.project_id)).json); const after = (await context.repository.getPatternExecutionCompletion(context.project.project_id)).state; assert.notEqual(imported.project_id, context.project.project_id); assert.deepEqual(after, before); });
test("33. project deletion removes completion from the progress store", async () => { const context = await repositoryFixture("Completion cleanup"); await context.repository.softDeleteProject(context.project.project_id); await context.repository.permanentlyDeleteProject(context.project.project_id, { confirmed: true }); const database = await context.repository._database(); const transaction = database.transaction("progress", "readonly"); const records = await new Promise((resolve, reject) => { const request = transaction.objectStore("progress").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); assert.equal(records.some((entry) => entry.project_id === context.project.project_id && entry.kind === api.PROGRESS_KIND), false); });
test("34. corrupted persisted records are handled without stack traces or mutation", () => { const sources = makeSources(); const corrupt = { id: "broken", projectId: "project", kind: api.PROGRESS_KIND, schemaVersion: 1, version: 1, revision: 1, status: "ready" }; const aggregate = { project: sources.project, calculations: [sources.calculation], progress: [{ progress_id: "completion", calculation_id: sources.calculationId, kind: api.PROGRESS_KIND, epoch: 1, state: corrupt }] }; const inspected = api.inspectAggregate(aggregate); assert.equal(inspected.corrupt, true); assert.equal(inspected.completion.status, "failed"); assert.equal(JSON.stringify(inspected.completion).includes("stack"), false); });
test("repository keeps IndexedDB version and uses the existing progress store", async () => { const context = await repositoryFixture("Completion DB"); assert.equal(global.YarnAIProjectSystem.DB_VERSION, 4); const exported = await context.repository.exportProject(context.project.project_id); assert.ok(exported.envelope.payload.progress.some((entry) => entry.kind === api.PROGRESS_KIND)); });
test("module has no network, OCR, LLM, source reanalysis or unsafe DOM path", () => { const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-execution-completion.js"), "utf8").toLowerCase(); for (const forbidden of ["fetch(", "xmlhttprequest", "websocket", "tesseract", "api.openai.com", "filereader", "innerhtml"]) assert.equal(source.includes(forbidden), false); });
