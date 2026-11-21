"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");

Object.assign(global, { indexedDB, IDBKeyRange });
if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto });
require("../src/yarnai/static/project-system.js");
const planApi = require("../src/yarnai/static/pattern-execution-plan.js");
const api = require("../src/yarnai/static/pattern-execution-session.js");

const repositories = [];
const stamp = (second) => `2026-07-31T10:00:${String(second).padStart(2, "0")}.000Z`;
const fp = (seed) => api.fingerprint({ seed });
const id = () => global.YarnAIProjectSystem.uuidv7();

function makePlan(options = {}) {
  const projectId = options.projectId || "project";
  const actionDefinitions = options.actions || [
    { id: "action:one", order: 1, title: "Первое действие", description: "Выполнить первый подтверждённый шаг.", required: true },
    { id: "action:optional", order: 2, title: "Необязательная проверка", description: "При необходимости выполнить проверку.", required: false },
  ];
  const secondActions = options.secondActions === false ? [] : [
    { id: "action:two", order: 1, title: "Второе действие", description: "Выполнить второй подтверждённый шаг.", required: true },
  ];
  const phases = [
    {
      id: "phase:one", order: 1, type: "main_fabric", title: "Основная работа", componentIds: ["component:one"],
      dependsOnPhaseIds: [], canRunInParallelWith: [], sourceTargetIds: ["source:one"], entryCriteria: [],
      actions: actionDefinitions.map((entry, index) => ({ stepId: entry.stepId || `step:${String(index + 1).padStart(3, "0")}`, sourceOperationIdentity: entry.sourceOperationIdentity || `operation:${String(index + 1).padStart(3, "0")}`, ...entry, sourceTargetIds: [`source:${entry.id}`] })),
      exitCriteria: [], checkpoints: ["checkpoint:one"], unresolved: [], status: "ready",
    },
  ];
  if (secondActions.length) phases.push({
    id: "phase:two", order: 2, type: "closure", title: "Завершение", componentIds: ["component:one"],
    dependsOnPhaseIds: ["phase:one"], canRunInParallelWith: [], sourceTargetIds: ["source:two"], entryCriteria: [],
    actions: secondActions.map((entry, index) => ({ stepId: entry.stepId || `step:second:${index + 1}`, sourceOperationIdentity: entry.sourceOperationIdentity || `operation:second:${index + 1}`, ...entry, sourceTargetIds: [`source:${entry.id}`] })),
    exitCriteria: [], checkpoints: [], unresolved: [], status: "ready",
  });
  const blocker = options.softBlocker ? [{
    id: "blocker:soft", code: "CHECK_BEFORE_START", severity: "warning", message: "Проверить перед стартом.",
    relatedPhaseIds: ["phase:one"], relatedComponentIds: ["component:one"], sourceTargetIds: ["source:one"], details: {},
  }] : [];
  const firstAction = phases.flatMap((entry) => entry.actions)[0] || null;
  const state = {
    id: options.id || "execution-plan-id", projectId, kind: "PATTERN_EXECUTION_PLAN", schemaVersion: 1, version: 1,
    revision: options.revision || 5, status: options.status || "ready", createdAt: stamp(1), updatedAt: stamp(2),
    sourceTechnologyReviewId: options.reviewId || "review-id", sourceTechnologyReviewRevision: 7,
    sourceTechnologyReviewFingerprint: fp("review"), sourceConfirmedSnapshotFingerprint: fp("confirmed"),
    sourceTechnologyDraftId: "draft-id", sourceTechnologyDraftRevision: 6, sourceTechnologyDraftFingerprint: fp("draft"),
    sourceAnalysisReviewId: "analysis-review-id", sourceAnalysisReviewRevision: 5, sourceAnalysisReviewFingerprint: fp("analysis-review"),
    sourceSemanticAnalysisId: "semantic-id", sourceSemanticAnalysisRevision: 4, sourceSemanticAnalysisFingerprint: fp("semantic"),
    sourceImportRevision: 3, sourceAlgorithmVersion: 1, planningAlgorithmVersion: 1, planningInputFingerprint: fp("planning"),
    planFingerprint: null, blockers: blocker, warnings: [], audit: [], error: null, interruptedOperation: null,
    plan: {
      schemaVersion: 1, summary: {}, prerequisites: [], materials: [], tools: [], measurements: [], gauge: [],
      components: [{ id: "component:one", type: "body", label: "Корпус", quantity: 1, constructionRole: "body", parentComponentId: null, sourceTargetIds: ["source:component"], dependencies: [], completionCriteria: [], status: "planned", sourceComponentId: "source-component", instance: 1 }],
      phases,
      dependencyGraph: {
        nodes: phases.map((entry) => ({ id: entry.id, type: "phase", order: entry.order, required: true })),
        edges: phases.slice(1).map((entry) => ({ id: `edge:${entry.id}`, from: "phase:one", to: entry.id, type: "depends_on" })),
        componentNodes: [{ id: "component:one", type: "component" }],
      },
      checkpoints: [{ id: "checkpoint:one", type: "stitch_count_check", phaseId: "phase:one", componentIds: ["component:one"], expectedValue: 10, unit: "stitches", sourceTargetIds: ["source:one"], required: true, blockingOnFailure: true }],
      firstAction: { phaseId: firstAction ? "phase:one" : null, actionId: firstAction?.id || null, title: firstAction?.title || "Нет действия", description: firstAction?.description || "", prerequisites: [], sourceTargetIds: firstAction ? [`source:${firstAction.id}`] : [], ready: Boolean(firstAction), blockedBy: [] },
      unresolved: [], completionCriteria: [], planFingerprint: null,
    },
  };
  if (state.status === "blocked") {
    state.blockers = [{ ...blocker[0], id: "blocker:required", code: "REQUIRED_DATA_MISSING", severity: "critical" }];
    if (!state.blockers[0].message) state.blockers[0].message = "Нет обязательных данных.";
    if (!state.blockers[0].sourceTargetIds) state.blockers[0].sourceTargetIds = ["source:one"];
    state.plan.firstAction.ready = false;
    state.plan.firstAction.blockedBy = [state.blockers[0].id];
    state.plan.phases[0].status = "blocked";
  }
  state.planFingerprint = planApi.calculatePlanFingerprint(state);
  state.plan.planFingerprint = state.planFingerprint;
  return state;
}

function waiting(plan = makePlan(), now = stamp(3)) { return api.createExecutionSession(plan, plan.projectId, { now, expectedPlanRevision: plan.revision }); }
function active(plan = makePlan()) { return api.startExecutionSession(waiting(plan), plan, { now: stamp(4) }); }
function reseal(state) { state.sessionFingerprint = null; state.sessionFingerprint = api.calculateSessionFingerprint(state); return state; }

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("blocked"));
  });
});

test("1. creates a waiting session", () => { const state = waiting(); assert.equal(state.status, "waiting"); assert.equal(state.kind, api.PROGRESS_KIND); assert.equal(state.planSnapshot, null); });
test("2. creates only from Stage 22", () => assert.throws(() => api.createExecutionSession({ kind: "OTHER" }, "project"), { code: "execution_plan_invalid" }));
test("3. rejects a missing plan", () => assert.throws(() => api.createExecutionSession(null, "project"), { code: "execution_plan_missing" }));
test("4. rejects a blocked Stage 22", () => assert.throws(() => waiting(makePlan({ status: "blocked" })), { code: "execution_plan_not_ready" }));
test("5. marks identity mismatch stale", () => { const plan = makePlan(); const state = active(plan); const changed = makePlan({ revision: 6 }); const stale = api.resumeExecutionSession(api.pauseExecutionSession(state, { now: stamp(5) }), changed, { now: stamp(6) }); assert.equal(stale.status, "stale"); assert.equal(stale.failure.code, "source_identity_mismatch"); });
test("6. start becomes active", () => assert.equal(active().status, "active"));
test("7. start becomes blocked when the snapshot action has a blocker", () => { const plan = makePlan({ softBlocker: true }); assert.equal(active(plan).status, "blocked"); });
test("8. start completes a plan with no required actions", () => { const plan = makePlan({ actions: [{ id: "action:optional", order: 1, title: "Optional", description: "Optional", required: false }], secondActions: false }); const state = active(plan); assert.equal(state.status, "completed"); assert.equal(state.currentPosition.progressPercent, 100); });
test("9. planSnapshot is deeply immutable", () => { const state = active(); assert.ok(Object.isFrozen(state.planSnapshot)); assert.ok(Object.isFrozen(state.planSnapshot.phases)); assert.throws(() => { state.planSnapshot.phases[0].title = "changed"; }, TypeError); });
test("10. snapshot and session fingerprints are stable", () => { const plan = makePlan(); const one = active(plan); const two = active(plan); assert.equal(one.planSnapshot.snapshotFingerprint, two.planSnapshot.snapshotFingerprint); assert.equal(api.calculateSessionFingerprint(one), one.sessionFingerprint); });
test("11. action ordering is deterministic", () => assert.deepEqual(active().execution.actions.map((entry) => entry.actionId), ["action:one", "action:optional", "action:two"]));
test("12. currentPosition is normalized", () => { const position = active().currentPosition; assert.deepEqual([position.phaseId, position.actionId, position.actionIndex, position.progressPercent], ["phase:one", "action:one", 0, 0]); });
test("13. starts the current action", () => assert.equal(api.startCurrentAction(active(), { actionId: "action:one", now: stamp(5) }).execution.actions[0].status, "in_progress"));
test("14. completes the current action", () => { const state = api.completeCurrentAction(active(), { actionId: "action:one", now: stamp(5) }); assert.deepEqual(state.completedActionIds, ["action:one"]); });
test("15. selects the next action", () => { const state = api.completeCurrentAction(active(), { actionId: "action:one", now: stamp(5) }); assert.equal(state.currentPosition.actionId, "action:optional"); });
test("16. rejects completion of a foreign actionId", () => assert.throws(() => api.completeCurrentAction(active(), { actionId: "action:two" }), { code: "action_not_current" }));
test("17. enforces prerequisites", () => { const state = active(); const changed = structuredClone(state); changed.currentPosition.actionId = "action:two"; changed.currentPosition.phaseId = "phase:two"; changed.currentPosition.actionIndex = 2; changed.execution.actions[0].status = "pending"; changed.execution.actions[2].status = "available"; reseal(changed); assert.throws(() => api.completeCurrentAction(changed, { actionId: "action:two" }), { code: "action_prerequisite_incomplete" }); });
test("18. skips an optional action", () => { let state = api.completeCurrentAction(active(), { actionId: "action:one", now: stamp(5) }); state = api.skipCurrentAction(state, { actionId: "action:optional", now: stamp(6) }); assert.deepEqual(state.skippedActionIds, ["action:optional"]); assert.equal(state.currentPosition.actionId, "action:two"); });
test("19. rejects skipping a required action", () => assert.throws(() => api.skipCurrentAction(active(), { actionId: "action:one" }), { code: "required_action_cannot_be_skipped" }));
test("20. pauses without resetting in-progress action", () => { const started = api.startCurrentAction(active(), { actionId: "action:one", now: stamp(5) }); const paused = api.pauseExecutionSession(started, { now: stamp(6) }); assert.equal(paused.status, "paused"); assert.equal(paused.execution.actions[0].status, "in_progress"); });
test("21. resumes the same current action", () => { const plan = makePlan(); const paused = api.pauseExecutionSession(active(plan), { now: stamp(5) }); const resumed = api.resumeExecutionSession(paused, plan, { now: stamp(6) }); assert.equal(resumed.status, "active"); assert.equal(resumed.currentPosition.actionId, "action:one"); });
test("22. reload recovery changes active to paused", () => assert.equal(api.recoverInterruptedExecutionSession(active(), null, { now: stamp(5) }).status, "paused"));
test("23. interrupted incomplete start returns safely to waiting", () => { const state = structuredClone(waiting()); state.status = "starting"; state.interruption = { type: "start", status: "in_progress", startedAt: stamp(4), baseRevision: 1 }; reseal(state); const recovered = api.recoverInterruptedExecutionSession(state, null, { now: stamp(5) }); assert.equal(recovered.status, "waiting"); assert.equal(recovered.failure, null); });
test("24. create is deterministic and does not duplicate repository identity", () => { const plan = makePlan(); const one = waiting(plan); const two = api.startExecutionSession(one, plan, { now: stamp(4) }); assert.equal(api.startExecutionSession(two, plan).id, two.id); });
test("25. start is idempotent", () => { const plan = makePlan(); const state = active(plan); assert.deepEqual(api.startExecutionSession(state, plan), state); });
test("26. complete is idempotent", () => { let state = api.completeCurrentAction(active(), { actionId: "action:one", now: stamp(5) }); assert.deepEqual(api.completeCurrentAction(state, { actionId: "action:one", now: stamp(6) }), state); });
test("27. detects revision conflicts", () => assert.throws(() => api.pauseExecutionSession(active(), { expectedRevision: 999 }), { code: "session_revision_conflict" }));
test("28. completed is terminal for regular operations", () => { const plan = makePlan({ actions: [{ id: "only", order: 1, title: "Only", description: "Only", required: true }], secondActions: false }); const done = api.completeCurrentAction(active(plan), { actionId: "only", now: stamp(5) }); assert.equal(done.status, "completed"); assert.throws(() => api.resumeExecutionSession(done, plan), { code: "session_already_completed" }); });
test("29. structural validation detects duplicate actionId", () => { const state = structuredClone(active()); state.execution.actions.push(structuredClone(state.execution.actions[0])); reseal(state); assert.ok(api.validateStructural(state).length); });
test("30. semantic validation detects mismatched completion indexes", () => { const state = structuredClone(active()); state.completedActionIds = ["action:one"]; reseal(state); assert.ok(api.validateSemantic(state).some((entry) => entry.code === "session_snapshot_invalid")); });
test("31. semantic validation detects cycles", () => { const state = structuredClone(active()); state.execution.actions[0].prerequisiteActionIds = ["action:two"]; state.execution.actions[2].prerequisiteActionIds = ["action:one"]; reseal(state); assert.ok(api.validateSemantic(state).some((entry) => entry.code === "action_dependency_cycle")); });
test("32. source validation checks the Stage 22 fingerprint", () => { const plan = makePlan(); const state = active(plan); plan.planFingerprint = fp("changed"); assert.equal(api.detectExecutionSessionStaleness(state, plan).isStale, true); });
test("33. audit is trimmed to 24 entries", () => { const plan = makePlan(); let state = active(plan); for (let index = 0; index < 30; index += 1) state = api.rebuildExecutionSession(state, plan, { confirmed: true, now: stamp((index % 50) + 5) }); assert.equal(state.audit.length, 24); });
test("39. operations do not mutate their inputs", () => { const plan = makePlan(); const state = waiting(plan); const beforePlan = structuredClone(plan); const beforeState = structuredClone(state); api.startExecutionSession(state, plan, { now: stamp(4) }); assert.deepEqual(plan, beforePlan); assert.deepEqual(state, beforeState); });
test("40. Stage 23 contains no Stage 24 API", () => { const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-execution-session.js"), "utf8").toLowerCase(); assert.equal(source.includes("stage 24"), false); assert.equal(source.includes("stage-24"), false); });

test("40a. exact evidence-bound Stage 22 passes live evidence into the session gate", () => {
  const plan = makePlan();
  const review = { kind: "PATTERN_TECHNOLOGY_REVIEW", projectId: plan.projectId, id: plan.sourceTechnologyReviewId, revision: plan.sourceTechnologyReviewRevision, status: "confirmed", confirmedSnapshotFingerprint: plan.sourceConfirmedSnapshotFingerprint, sourceDraftId: plan.sourceTechnologyDraftId, sourceDraftRevision: plan.sourceTechnologyDraftRevision, sourceDraftFingerprint: plan.sourceTechnologyDraftFingerprint };
  plan.sourceTechnologyReviewFingerprint = planApi.technologyReviewFingerprint(review);
  plan.planFingerprint = planApi.calculatePlanFingerprint(plan); plan.plan.planFingerprint = plan.planFingerprint;
  const draft = { kind: "PATTERN_TECHNOLOGY_DRAFT", projectId: plan.projectId, sourceProjectId: plan.projectId, id: plan.sourceTechnologyDraftId, revision: plan.sourceTechnologyDraftRevision, draftFingerprint: plan.sourceTechnologyDraftFingerprint, sourceImportRevision: plan.sourceImportRevision };
  const analysis = { kind: "PATTERN_ANALYSIS_REVIEW", projectId: plan.projectId, id: plan.sourceAnalysisReviewId, revision: plan.sourceAnalysisReviewRevision, sourceImportRevision: plan.sourceImportRevision };
  const semantic = { kind: "PATTERN_SEMANTIC_ANALYSIS", projectId: plan.projectId, id: plan.sourceSemanticAnalysisId, revision: plan.sourceSemanticAnalysisRevision, sourceImportRevision: plan.sourceImportRevision };
  const instructionEvidence = { kind: "SOURCE_PATTERN_INSTRUCTION_EVIDENCE", id: "evidence:exact", revision: 42, status: "confirmed" };
  const originalPlanApi = global.YarnAIPatternExecutionPlan;
  let receivedEvidence = null;
  global.YarnAIPatternExecutionPlan = { ...planApi, validateSourceIdentity: (_plan, _review, context) => { receivedEvidence = context.instructionEvidence; return receivedEvidence === instructionEvidence ? [] : [{ code: "SOURCE_INSTRUCTION_EVIDENCE_STALE", severity: "critical" }]; } };
  try {
    const progress = (kind, state) => ({ kind, state, calculation_id: "calculation", epoch: 1 });
    const inspected = api.inspectAggregate({ project: { project_id: plan.projectId, active_calculation_id: "calculation" }, calculations: [{ calculation_id: "calculation" }], progress: [progress("PATTERN_TECHNOLOGY_REVIEW", review), progress("PATTERN_TECHNOLOGY_DRAFT", draft), progress("PATTERN_ANALYSIS_REVIEW", analysis), progress("PATTERN_SEMANTIC_ANALYSIS", semantic), progress("SOURCE_PATTERN_INSTRUCTION_EVIDENCE", instructionEvidence), progress("PATTERN_EXECUTION_PLAN", plan)] });
    assert.equal(inspected.state, "creatable");
    assert.equal(receivedEvidence, instructionEvidence);
  } finally {
    global.YarnAIPatternExecutionPlan = originalPlanApi;
  }
});

test("40b. obsolete V2 planning version cannot create Stage 23", () => {
  const plan = makePlan();
  plan.plan.contractId = "PATTERN_EXECUTION_PLAN_V2";
  plan.planningAlgorithmVersion = planApi.PLANNING_ALGORITHM_VERSION - 1;
  plan.planFingerprint = planApi.calculatePlanFingerprint(plan);
  plan.plan.planFingerprint = plan.planFingerprint;
  const originalPlanApi = global.YarnAIPatternExecutionPlan;
  global.YarnAIPatternExecutionPlan = { ...planApi, validateStructural: () => [], validateSemantic: () => [] };
  try {
    const result = api.validateSourceExecutionPlan(plan, plan.projectId);
    assert.equal(result.isValid, false);
    assert.ok(result.diagnostics.some((entry) => entry.code === "execution_plan_stale" && entry.details.field === "planningAlgorithmVersion"));
    assert.throws(() => api.createExecutionSession(plan, plan.projectId), { code: "execution_plan_stale" });
  } finally {
    global.YarnAIPatternExecutionPlan = originalPlanApi;
  }
});


async function createExportableProject(options = {}) {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Execution session export" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const calculationId = added.calculation.calculation_id;
  const semanticState = { id: id(), projectId: project.project_id, kind: "PATTERN_SEMANTIC_ANALYSIS", version: 1, revision: 4, status: "completed", sourceImportRevision: 3 };
  await repository.ensureCalculationProgress(project.project_id, calculationId, semanticState.kind, semanticState);
  const analysisState = { id: id(), projectId: project.project_id, kind: "PATTERN_ANALYSIS_REVIEW", version: 1, revision: 5, status: "needs_attention", sourceSemanticAnalysisId: semanticState.id, sourceSemanticAnalysisRevision: 4, sourceImportRevision: 3, reviewedData: { items: [], conflictGroups: [] } };
  await repository.ensureCalculationProgress(project.project_id, calculationId, analysisState.kind, analysisState);
  const draftSnapshot = { projectId: project.project_id, sourceSemanticAnalysisId: semanticState.id };
  const draftState = { id: id(), projectId: project.project_id, sourceProjectId: project.project_id, kind: "PATTERN_TECHNOLOGY_DRAFT", version: 1, revision: 6, status: "waiting", immutableSourceSnapshot: draftSnapshot, immutableSourceFingerprint: api.fingerprint(draftSnapshot), sourceConfirmedFingerprint: api.fingerprint(draftSnapshot), sourceReviewId: analysisState.id, sourceSemanticAnalysisId: semanticState.id, sourceImportRevision: 3, draftFingerprint: api.fingerprint({}), algorithmVersion: 1, audit: [] };
  const draftProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, draftState.kind, draftState);
  const reviewSnapshot = { sourceDraftIdentity: { projectId: project.project_id }, sourceReviewIdentity: { projectId: project.project_id }, sourceSemanticIdentity: { projectId: project.project_id }, structuredDraft: {}, validation: {} };
  const reviewState = { id: id(), projectId: project.project_id, kind: "PATTERN_TECHNOLOGY_REVIEW", version: 1, revision: 7, status: "waiting", sourceDraftProgressId: draftProgress.progress_id, sourceDraftId: draftState.id, sourceDraftRevision: 6, sourceDraftFingerprint: draftState.draftFingerprint, confirmedSnapshotFingerprint: null, immutableSourceSnapshot: reviewSnapshot, immutableSourceSnapshotFingerprint: api.fingerprint(reviewSnapshot), sourceValidationFingerprint: api.fingerprint(reviewSnapshot.validation), reviewState: { targets: [] }, decisions: [], corrections: [], audit: [] };
  await repository.ensureCalculationProgress(project.project_id, calculationId, reviewState.kind, reviewState);
  const plan = makePlan({ projectId: project.project_id, id: id(), reviewId: reviewState.id });
  plan.sourceTechnologyReviewRevision = reviewState.revision;
  plan.sourceTechnologyDraftId = draftState.id;
  plan.sourceAnalysisReviewId = analysisState.id;
  plan.sourceSemanticAnalysisId = semanticState.id;
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
  await repository.ensureCalculationProgress(project.project_id, calculationId, plan.kind, plan);
  let session;
  if (options.virtualStale) {
    session = waiting(plan);
    session = api.createVirtualDryRun(session, plan, { expectedRevision: session.revision, now: stamp(4), id: "virtual:history" });
    session = api.startVirtualDryRun(session, plan, { expectedRevision: session.revision, now: stamp(5) });
    for (const action of session.virtualDryRun.execution.actions) {
      const current = session.virtualDryRun.execution.actions[session.virtualDryRun.currentPosition.actionIndex];
      session = api.completeVirtualStep(session, plan, { expectedRevision: session.revision, stepId: current.stepId, actionId: current.actionId, operationId: `virtual:${action.order}`, now: stamp(5 + action.order) });
    }
    session = api.markSessionStale(session, "source_identity_mismatch", stamp(9));
  } else {
    session = active(plan);
    session = api.startCurrentAction(session, { actionId: "action:one", now: stamp(8) });
    session = api.completeCurrentAction(session, { actionId: "action:one", now: stamp(9), result: { confirmed: true } });
  }
  await repository.ensureCalculationProgress(project.project_id, calculationId, session.kind, session);
  return { repository, project, calculationId, plan, session };
}

test("34. ordinary export/import retains progress and marks identity unverifiable", async () => { const ctx = await createExportableProject(); const exported = await ctx.repository.exportProject(ctx.project.project_id); await ctx.repository.close(); repositories.splice(repositories.indexOf(ctx.repository), 1); await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); }); const target = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(target); await target.initialize(); const imported = await target.importProject(exported.json); assert.equal(imported.collision, false); const state = (await target.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.status, "stale"); assert.deepEqual(state.completedActionIds, ctx.session.completedActionIds); assert.equal(state.execution.actions[0].startedAt, ctx.session.execution.actions[0].startedAt); });
test("38. repository round-trip and export retain the session", async () => { const ctx = await createExportableProject(); const aggregate = await ctx.repository.getProject(ctx.project.project_id); assert.equal(aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state.sessionFingerprint, ctx.session.sessionFingerprint); const exported = await ctx.repository.exportProject(ctx.project.project_id); assert.ok(exported.envelope.payload.progress.some((entry) => entry.kind === api.PROGRESS_KIND)); });
test("35. collision import remaps project identities but not local action IDs", async () => { const ctx = await createExportableProject(); const imported = await ctx.repository.importProject((await ctx.repository.exportProject(ctx.project.project_id)).json); const aggregate = await ctx.repository.getProject(imported.project_id); const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.projectId, imported.project_id); assert.equal(state.status, "stale"); assert.deepEqual(state.execution.actions.map((entry) => entry.actionId), ctx.session.execution.actions.map((entry) => entry.actionId)); assert.equal(JSON.stringify(state).includes(ctx.project.project_id), false); });
test("36. imported unverifiable identity becomes stale", async () => { const ctx = await createExportableProject(); const imported = await ctx.repository.importProject((await ctx.repository.exportProject(ctx.project.project_id)).json); const state = (await ctx.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.failure.code, "imported_identity_unverifiable"); assert.ok(state.audit.some((entry) => entry.event === "import_marked_stale")); });
test("37. corrupted import is rejected atomically", async () => { const ctx = await createExportableProject(); const exported = await ctx.repository.exportProject(ctx.project.project_id); const envelope = structuredClone(exported.envelope); const state = envelope.payload.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; state.execution.actions[0].prerequisiteActionIds = ["missing-action"]; state.sessionFingerprint = api.calculateSessionFingerprint(state); envelope.export_id = id(); envelope.payload_checksum = await global.YarnAIProjectSystem.checksumPayload(envelope.payload); const before = (await ctx.repository.listProjects()).length; await assert.rejects(ctx.repository.importProject(envelope), { code: "INVALID_IMPORT_EXECUTION_SESSION_REFERENCE" }); assert.equal((await ctx.repository.listProjects()).length, before); });

test("41. virtual dry run keeps physical session waiting and advances exact 127-step order", () => {
  const actions = Array.from({ length: 127 }, (_, index) => ({
    id: `action:${String(index + 1).padStart(3, "0")}`,
    stepId: `step:${String(index + 1).padStart(3, "0")}`,
    sourceOperationIdentity: `execution:operation:${String(index + 1).padStart(3, "0")}`,
    order: index + 1,
    title: `Шаг ${index + 1}`,
    description: `Инструкция ${index + 1}`,
    required: true,
  }));
  const plan = makePlan({ actions, secondActions: false });
  const physical = waiting(plan);
  let state = api.createVirtualDryRun(physical, plan, { expectedRevision: physical.revision, now: stamp(4), id: "virtual-run:test" });
  assert.equal(state.status, "waiting");
  assert.equal(state.planSnapshot, null);
  assert.equal(state.execution.actions.length, 0);
  assert.deepEqual(state.completedActionIds, []);
  assert.equal(state.virtualDryRun.contractId, api.VIRTUAL_DRY_RUN_CONTRACT_ID);
  assert.equal(state.virtualDryRun.mode, "virtual_dry_run");
  state = api.startVirtualDryRun(state, plan, { expectedRevision: state.revision, now: stamp(5) });
  assert.deepEqual([state.virtualDryRun.currentPosition.currentStepNumber, state.virtualDryRun.currentPosition.totalStepCount], [1, 127]);
  assert.throws(() => api.completeVirtualStep(state, plan, { expectedRevision: state.revision, stepId: "step:002", actionId: "action:002", operationId: "virtual:foreign" }), { code: "action_not_current" });
  for (let index = 0; index < 127; index += 1) {
    const current = state.virtualDryRun.execution.actions[state.virtualDryRun.currentPosition.actionIndex];
    assert.equal(current.stepId, actions[index].stepId);
    assert.equal(current.sourceOperationIdentity, actions[index].sourceOperationIdentity);
    state = api.completeVirtualStep(state, plan, { expectedRevision: state.revision, stepId: current.stepId, actionId: current.actionId, operationId: `virtual:${index + 1}`, now: new Date(Date.parse(stamp(6)) + index * 1000).toISOString() });
    assert.equal(state.status, "waiting");
    assert.equal(state.planSnapshot, null);
    assert.equal(state.completedActionIds.length, 0);
  }
  assert.equal(state.virtualDryRun.status, "completed");
  assert.equal(state.virtualDryRun.completedStepIds.length, 127);
  assert.equal(state.virtualDryRun.receipts.length, 127);
  assert.ok(state.virtualDryRun.receipts.every((entry) => entry.receiptType === "virtual_interface_confirmation" && entry.physicalCompletion === false && entry.fitConfirmed === false));
  assert.deepEqual(state.virtualDryRun.result, { resultType: "virtual_dry_run_completed", completedStepCount: 127, physicalProductCompleted: false, fitConfirmed: false, completedAt: state.virtualDryRun.completedAt });
  assert.equal(api.validateExecutionSession(state, plan).isValid, true);
  const replayed = api.completeVirtualStep(state, plan, { expectedRevision: state.revision, stepId: "step:127", actionId: "action:127", operationId: "virtual:127" });
  assert.deepEqual(replayed, state);
});

test("42. physical start is blocked while a virtual run is active", () => {
  const plan = makePlan({ actions: [{ id: "action:001", stepId: "step:001", sourceOperationIdentity: "execution:001", order: 1, title: "Шаг 1", description: "Проверить шаг", required: true }], secondActions: false });
  let state = waiting(plan);
  state = api.createVirtualDryRun(state, plan, { expectedRevision: state.revision, now: stamp(4) });
  state = api.startVirtualDryRun(state, plan, { expectedRevision: state.revision, now: stamp(5) });
  assert.throws(() => api.startExecutionSession(state, plan, { expectedRevision: state.revision }), { code: "virtual_dry_run_active" });
});

function completedVirtualStale(plan = makePlan()) {
  let state = waiting(plan);
  state = api.createVirtualDryRun(state, plan, { expectedRevision: state.revision, now: stamp(4), id: "virtual:completed-history" });
  state = api.startVirtualDryRun(state, plan, { expectedRevision: state.revision, now: stamp(5) });
  while (state.virtualDryRun.status !== "completed") {
    const current = state.virtualDryRun.execution.actions[state.virtualDryRun.currentPosition.actionIndex];
    state = api.completeVirtualStep(state, plan, { expectedRevision: state.revision, stepId: current.stepId, actionId: current.actionId, operationId: `virtual:${current.order}`, now: stamp(5 + current.order) });
  }
  return api.markSessionStale(state, "source_identity_mismatch", stamp(12));
}

test("43. stale zero-physical session creates a fresh current physical lineage and preserves virtual history byte-logically", () => {
  const oldPlan = makePlan();
  const stale = completedVirtualStale(oldPlan);
  const currentPlan = makePlan({ revision: 6, actions: [
    { id: "action:one", order: 1, title: "Первое действие", description: "Выполнить первый подтверждённый шаг.", required: true },
    { id: "action:optional", order: 2, title: "Необязательная проверка", description: "При необходимости выполнить проверку.", required: false },
  ] });
  const planBefore = structuredClone(currentPlan);
  const virtualBefore = structuredClone(stale.virtualDryRun);
  const next = api.createPhysicalSessionLineage(stale, currentPlan, { expectedRevision: stale.revision, confirmed: true, now: stamp(13), id: "session:current-physical" });
  assert.equal(next.id, "session:current-physical");
  assert.notEqual(next.id, stale.id);
  assert.equal(next.revision, 1);
  assert.equal(next.status, "waiting");
  assert.equal(next.sourceExecutionPlanRevision, currentPlan.revision);
  assert.equal(next.sourceExecutionPlanFingerprint, currentPlan.planFingerprint);
  assert.equal(next.virtualDryRun, null);
  assert.deepEqual(next.historicalVirtualDryRuns, [virtualBefore]);
  assert.equal(next.supersededPhysicalLineages[0].sessionFingerprint, stale.sessionFingerprint);
  assert.deepEqual(next.completedActionIds, []);
  assert.deepEqual(next.execution.actions, []);
  assert.equal(next.planSnapshot, null);
  assert.equal(next.currentPosition.progressPercent, 0);
  assert.equal(api.validateExecutionSession(next, currentPlan).isValid, true);
  assert.deepEqual(currentPlan, planBefore);
});

test("44. physical progress cannot be migrated into a new lineage", () => {
  const plan = makePlan();
  const physical = api.markSessionStale(active(plan), "source_identity_mismatch", stamp(12));
  assert.throws(() => api.createPhysicalSessionLineage(physical, makePlan({ revision: 6 }), { expectedRevision: physical.revision, confirmed: true, now: stamp(13) }), { code: "physical_progress_migration_forbidden" });
});

test("45. same step count with different content creates a new binding and never rebinds the historical virtual run", () => {
  const oldPlan = makePlan();
  const stale = completedVirtualStale(oldPlan);
  const changed = makePlan({ revision: 6, actions: [
    { id: "action:one", order: 1, title: "Первое действие", description: "Материально другая инструкция.", required: true },
    { id: "action:optional", order: 2, title: "Необязательная проверка", description: "При необходимости выполнить проверку.", required: false },
  ] });
  assert.equal(api.buildExecution(api.buildPlanSnapshot(oldPlan)).actions.length, api.buildExecution(api.buildPlanSnapshot(changed)).actions.length);
  const next = api.createPhysicalSessionLineage(stale, changed, { expectedRevision: stale.revision, confirmed: true, now: stamp(13), id: "session:changed-plan" });
  assert.equal(next.sourceExecutionPlanFingerprint, changed.planFingerprint);
  assert.equal(next.historicalVirtualDryRuns[0].sourceExecutionPlanFingerprint, oldPlan.planFingerprint);
  assert.equal(next.historicalVirtualDryRuns[0].runFingerprint, stale.virtualDryRun.runFingerprint);
});

test("46. current waiting lineage replay is idempotent and creates no duplicate evidence", () => {
  const stale = completedVirtualStale();
  const currentPlan = makePlan({ revision: 6 });
  const next = api.createPhysicalSessionLineage(stale, currentPlan, { expectedRevision: stale.revision, confirmed: true, now: stamp(13), id: "session:current" });
  const replay = api.createPhysicalSessionLineage(next, currentPlan, { expectedRevision: next.revision, confirmed: true, now: stamp(14), id: "session:duplicate" });
  assert.deepEqual(replay, next);
  assert.equal(replay.supersededPhysicalLineages.length, 1);
  assert.equal(replay.historicalVirtualDryRuns.length, 1);
});

test("47. repository lineage replacement is one atomic project revision and rejects replay", async () => {
  const ctx = await createExportableProject({ virtualStale: true });
  const currentPlan = makePlan({ projectId: ctx.project.project_id, id: ctx.plan.id, reviewId: ctx.plan.sourceTechnologyReviewId, revision: ctx.plan.revision + 1 });
  const next = api.createPhysicalSessionLineage(ctx.session, currentPlan, { expectedRevision: ctx.session.revision, confirmed: true, now: stamp(13), id: "session:repository-current" });
  const before = await ctx.repository.getProject(ctx.project.project_id);
  const beforeOperations = before.operations.length;
  const checkpointCount = async () => {
    const database = await ctx.repository._database();
    const transaction = database.transaction("checkpoints", "readonly");
    const request = transaction.objectStore("checkpoints").index("by_project_created").count(IDBKeyRange.bound([ctx.project.project_id, ""], [ctx.project.project_id, "\uffff"]));
    return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  };
  const beforeCheckpoints = await checkpointCount();
  await ctx.repository.replacePatternExecutionSessionLineage(ctx.project.project_id, ctx.calculationId, next, {
    operationKind: "PATTERN_EXECUTION_PHYSICAL_LINEAGE_CREATED", projectStage: "pattern_execution_session_waiting",
    expectedPreviousSessionId: ctx.session.id, expectedPreviousSessionRevision: ctx.session.revision, expectedPreviousSessionFingerprint: ctx.session.sessionFingerprint,
  });
  const after = await ctx.repository.getProject(ctx.project.project_id);
  const stored = after.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  assert.equal(stored.id, next.id);
  assert.deepEqual(stored.historicalVirtualDryRuns, next.historicalVirtualDryRuns);
  assert.equal(after.project.revision, before.project.revision + 1);
  assert.equal(after.operations.length, beforeOperations + 1);
  assert.equal(await checkpointCount(), beforeCheckpoints + 1);
  await assert.rejects(ctx.repository.replacePatternExecutionSessionLineage(ctx.project.project_id, ctx.calculationId, next, {
    expectedPreviousSessionId: ctx.session.id, expectedPreviousSessionRevision: ctx.session.revision, expectedPreviousSessionFingerprint: ctx.session.sessionFingerprint,
  }), { code: "PATTERN_EXECUTION_LINEAGE_REPLACEMENT_INVALID" });
});

test("48. invalid current Stage 22 remains fail-closed during lineage creation", () => {
  const stale = completedVirtualStale();
  assert.throws(() => api.createPhysicalSessionLineage(stale, makePlan({ status: "blocked", softBlocker: true }), { expectedRevision: stale.revision, confirmed: true }), { code: "execution_plan_not_ready" });
});

test("49. current-plan virtual run is fresh, exactly bound, displayed before immutable history, and idempotent", () => {
  const oldPlan = makePlan();
  const stale = completedVirtualStale(oldPlan);
  const currentPlan = makePlan({ revision: 6, actions: [
    { id: "action:one", order: 1, title: "Первое действие", description: "Текущая инструкция Stage 22.", required: true },
    { id: "action:optional", order: 2, title: "Необязательная проверка", description: "Текущая проверка Stage 22.", required: false },
  ] });
  const physical = api.createPhysicalSessionLineage(stale, currentPlan, { expectedRevision: stale.revision, confirmed: true, now: stamp(13), id: "session:current" });
  const historyBefore = structuredClone(physical.historicalVirtualDryRuns);
  const created = api.createVirtualDryRun(physical, currentPlan, { expectedRevision: physical.revision, now: stamp(14), id: "virtual:current-plan" });

  assert.equal(created.virtualDryRun.id, "virtual:current-plan");
  assert.equal(created.virtualDryRun.status, "ready");
  assert.equal(created.virtualDryRun.sourceExecutionPlanId, currentPlan.id);
  assert.equal(created.virtualDryRun.sourceExecutionPlanRevision, currentPlan.revision);
  assert.equal(created.virtualDryRun.sourceExecutionPlanFingerprint, currentPlan.planFingerprint);
  assert.deepEqual(created.virtualDryRun.completedStepIds, []);
  assert.deepEqual(created.virtualDryRun.receipts, []);
  assert.deepEqual(created.historicalVirtualDryRuns, historyBefore);
  assert.notEqual(created.virtualDryRun.id, created.historicalVirtualDryRuns[0].id);
  assert.equal(api.getDisplayVirtualDryRun(created).id, "virtual:current-plan");
  assert.equal(created.status, "waiting");
  assert.equal(created.currentPosition.progressPercent, 0);

  const replay = api.createVirtualDryRun(created, currentPlan, { expectedRevision: created.revision, now: stamp(15), id: "virtual:duplicate" });
  assert.deepEqual(replay, created);
  assert.equal(replay.historicalVirtualDryRuns.length, 1);
});
