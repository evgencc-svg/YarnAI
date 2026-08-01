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
      actions: actionDefinitions.map((entry) => ({ ...entry, sourceTargetIds: [`source:${entry.id}`] })),
      exitCriteria: [], checkpoints: ["checkpoint:one"], unresolved: [], status: "ready",
    },
  ];
  if (secondActions.length) phases.push({
    id: "phase:two", order: 2, type: "closure", title: "Завершение", componentIds: ["component:one"],
    dependsOnPhaseIds: ["phase:one"], canRunInParallelWith: [], sourceTargetIds: ["source:two"], entryCriteria: [],
    actions: secondActions.map((entry) => ({ ...entry, sourceTargetIds: [`source:${entry.id}`] })),
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

async function createExportableProject() {
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
  let session = active(plan);
  session = api.startCurrentAction(session, { actionId: "action:one", now: stamp(8) });
  session = api.completeCurrentAction(session, { actionId: "action:one", now: stamp(9), result: { confirmed: true } });
  await repository.ensureCalculationProgress(project.project_id, calculationId, session.kind, session);
  return { repository, project, calculationId, plan, session };
}

test("34. ordinary export/import retains progress and marks identity unverifiable", async () => { const ctx = await createExportableProject(); const exported = await ctx.repository.exportProject(ctx.project.project_id); await ctx.repository.close(); repositories.splice(repositories.indexOf(ctx.repository), 1); await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); }); const target = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(target); await target.initialize(); const imported = await target.importProject(exported.json); assert.equal(imported.collision, false); const state = (await target.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.status, "stale"); assert.deepEqual(state.completedActionIds, ctx.session.completedActionIds); assert.equal(state.execution.actions[0].startedAt, ctx.session.execution.actions[0].startedAt); });
test("38. repository round-trip and export retain the session", async () => { const ctx = await createExportableProject(); const aggregate = await ctx.repository.getProject(ctx.project.project_id); assert.equal(aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state.sessionFingerprint, ctx.session.sessionFingerprint); const exported = await ctx.repository.exportProject(ctx.project.project_id); assert.ok(exported.envelope.payload.progress.some((entry) => entry.kind === api.PROGRESS_KIND)); });
test("35. collision import remaps project identities but not local action IDs", async () => { const ctx = await createExportableProject(); const imported = await ctx.repository.importProject((await ctx.repository.exportProject(ctx.project.project_id)).json); const aggregate = await ctx.repository.getProject(imported.project_id); const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.projectId, imported.project_id); assert.equal(state.status, "stale"); assert.deepEqual(state.execution.actions.map((entry) => entry.actionId), ctx.session.execution.actions.map((entry) => entry.actionId)); assert.equal(JSON.stringify(state).includes(ctx.project.project_id), false); });
test("36. imported unverifiable identity becomes stale", async () => { const ctx = await createExportableProject(); const imported = await ctx.repository.importProject((await ctx.repository.exportProject(ctx.project.project_id)).json); const state = (await ctx.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.failure.code, "imported_identity_unverifiable"); assert.ok(state.audit.some((entry) => entry.event === "import_marked_stale")); });
test("37. corrupted import is rejected atomically", async () => { const ctx = await createExportableProject(); const exported = await ctx.repository.exportProject(ctx.project.project_id); const envelope = structuredClone(exported.envelope); const state = envelope.payload.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; state.execution.actions[0].prerequisiteActionIds = ["missing-action"]; state.sessionFingerprint = api.calculateSessionFingerprint(state); envelope.export_id = id(); envelope.payload_checksum = await global.YarnAIProjectSystem.checksumPayload(envelope.payload); const before = (await ctx.repository.listProjects()).length; await assert.rejects(ctx.repository.importProject(envelope), { code: "INVALID_IMPORT_EXECUTION_SESSION_REFERENCE" }); assert.equal((await ctx.repository.listProjects()).length, before); });
