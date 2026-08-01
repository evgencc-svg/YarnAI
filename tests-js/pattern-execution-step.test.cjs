"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");
const { webcrypto } = require("node:crypto");

Object.assign(global, { indexedDB, IDBKeyRange });
if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto });
require("../src/yarnai/static/project-system.js");
const planApi = require("../src/yarnai/static/pattern-execution-plan.js");
const sessionApi = require("../src/yarnai/static/pattern-execution-session.js");
const api = require("../src/yarnai/static/pattern-execution-step.js");

const repositories = [];
const stamp = (second) => `2026-07-31T10:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000Z`;
const fp = (seed) => api.fingerprint({ seed });
const id = () => global.YarnAIProjectSystem.uuidv7();
let operationSequence = 0;
const op = (type = "operation") => `${type}:${String(++operationSequence).padStart(4, "0")}`;

function makePlan(options = {}) {
  const projectId = options.projectId || "project";
  const actionOne = {
    id: "action:one", order: 1, title: "Первое действие", description: "Выполнить подтверждённый шаг.",
    required: true, sourceTargetIds: ["source:one"], ...(options.action || {}),
  };
  const actions = [actionOne];
  if (options.secondAction) actions.push({
    id: "action:two", order: 2, title: "Второе действие", description: "Выполнить следующий шаг.",
    required: true, sourceTargetIds: ["source:two"], ...(options.secondAction === true ? {} : options.secondAction),
  });
  const checkpoints = options.checkpoint ? [{
    id: "checkpoint:one", type: "stitch_count_check", phaseId: "phase:one", componentIds: ["component:one"],
    expectedValue: options.checkpoint.expectedValue ?? 10, unit: options.checkpoint.unit ?? "stitches",
    label: options.checkpoint.label || "Проверить количество петель", sourceTargetIds: ["source:checkpoint"],
    required: options.checkpoint.required !== false, blockingOnFailure: true,
    allowNotApplicable: options.checkpoint.allowNotApplicable === true,
  }] : [];
  const state = {
    id: options.id || "execution-plan-id", projectId, kind: "PATTERN_EXECUTION_PLAN", schemaVersion: 1, version: 1,
    revision: options.revision || 5, status: options.status || "ready", createdAt: stamp(1), updatedAt: stamp(2),
    sourceTechnologyReviewId: options.reviewId || "review-id", sourceTechnologyReviewRevision: 7,
    sourceTechnologyReviewFingerprint: fp("review"), sourceConfirmedSnapshotFingerprint: fp("confirmed"),
    sourceTechnologyDraftId: options.draftId || "draft-id", sourceTechnologyDraftRevision: 6, sourceTechnologyDraftFingerprint: fp("draft"),
    sourceAnalysisReviewId: options.analysisId || "analysis-review-id", sourceAnalysisReviewRevision: 5, sourceAnalysisReviewFingerprint: fp("analysis-review"),
    sourceSemanticAnalysisId: options.semanticId || "semantic-id", sourceSemanticAnalysisRevision: 4, sourceSemanticAnalysisFingerprint: fp("semantic"),
    sourceImportRevision: 3, sourceAlgorithmVersion: 1, planningAlgorithmVersion: 1, planningInputFingerprint: fp("planning"),
    planFingerprint: null, blockers: [], warnings: [], audit: [], error: null, interruptedOperation: null,
    plan: {
      schemaVersion: 1, summary: {}, prerequisites: [], materials: [], tools: [], measurements: [], gauge: [],
      components: [{ id: "component:one", type: "body", label: "Корпус", quantity: 1, constructionRole: "body", parentComponentId: null, sourceTargetIds: ["source:component"], dependencies: [], completionCriteria: [], status: "planned", sourceComponentId: "source-component", instance: 1 }],
      phases: [{
        id: "phase:one", order: 1, type: "main_fabric", title: "Основная работа", componentIds: ["component:one"],
        dependsOnPhaseIds: [], canRunInParallelWith: [], sourceTargetIds: ["source:phase"], entryCriteria: [],
        actions, exitCriteria: [], checkpoints: checkpoints.map((entry) => entry.id), unresolved: [], status: "ready", required: true,
      }],
      dependencyGraph: { nodes: [{ id: "phase:one", type: "phase", order: 1, required: true }], edges: [], componentNodes: [{ id: "component:one", type: "component" }] },
      checkpoints,
      firstAction: { phaseId: "phase:one", actionId: "action:one", title: actionOne.title, description: actionOne.description, prerequisites: [], sourceTargetIds: actionOne.sourceTargetIds, ready: true, blockedBy: [] },
      unresolved: [], completionCriteria: [], planFingerprint: null,
    },
  };
  state.planFingerprint = planApi.calculatePlanFingerprint(state);
  state.plan.planFingerprint = state.planFingerprint;
  return state;
}

function makeSession(plan = makePlan(), options = {}) {
  let session = sessionApi.createExecutionSession(plan, plan.projectId, { now: stamp(3), expectedPlanRevision: plan.revision });
  session = sessionApi.startExecutionSession(session, plan, { now: stamp(4) });
  if (options.startAction) session = sessionApi.startCurrentAction(session, { actionId: session.currentPosition.actionId, now: stamp(5) });
  return session;
}

function context(plan) { return { executionPlan: plan, requireCurrentIdentity: false }; }
function ready(options = {}) {
  const plan = makePlan(options);
  const session = makeSession(plan, options);
  return { plan, session, step: api.createExecutionStep(session, plan.projectId, { now: stamp(6), context: context(plan), expectedSessionRevision: session.revision }) };
}
function start(step) { return api.startStep(step, { expectedRevision: step.revision, operationId: op("start"), now: stamp(7) }); }
function resealSession(session) { session.sessionFingerprint = null; session.sessionFingerprint = sessionApi.calculateSessionFingerprint(session); return session; }
function resealStep(step) { step.stepFingerprint = null; step.stepFingerprint = api.calculateStepFingerprint(step); return step; }

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked"));
  });
});

test("1. creates from a valid execution session", () => { const { step } = ready(); assert.equal(step.kind, api.PROGRESS_KIND); assert.equal(step.status, "ready"); });
test("2. rejects creation without an execution session", () => assert.throws(() => api.createExecutionStep(null, "project", { context: { requireCurrentIdentity: false } }), { code: "source_session_missing" }));
test("3. validates source identity through the execution plan", () => { const { step, session, plan } = ready(); assert.equal(api.validateExecutionStep(step, session, context(plan)).valid, true); });
test("4. selects firstAction for a new session", () => { const { session } = ready({ secondAction: true }); assert.equal(api.selectCurrentAction(session).action.actionId, "action:one"); });
test("5. selects the unfinished action fixed in the session", () => { const plan = makePlan({ secondAction: true }); let session = makeSession(plan); session = sessionApi.completeCurrentAction(session, { actionId: "action:one", now: stamp(8) }); const step = api.createExecutionStep(session, plan.projectId, { context: context(plan) }); assert.equal(step.actionId, "action:two"); });
test("6. binary progress requires an explicit check", () => { let { step } = ready(); step = start(step); step = api.checkStep(step, { expectedRevision: step.revision, operationId: op("check"), confirmed: true }); assert.equal(step.progressState.confirmed, true); assert.equal(step.status, "checking"); });
test("7. counter increments atomically", () => { let { step } = ready({ action: { progressType: "counter", repeatCount: 3 } }); step = start(step); step = api.incrementProgress(step, { expectedRevision: step.revision, operationId: op("inc") }); assert.equal(step.progressState.current, 1); });
test("8. counter decrements atomically", () => { let { step } = ready({ action: { progressType: "counter", repeatCount: 3 } }); step = start(step); step = api.incrementProgress(step, { expectedRevision: step.revision, operationId: op("inc") }); step = api.decrementProgress(step, { expectedRevision: step.revision, operationId: op("dec") }); assert.equal(step.progressState.current, 0); });
test("9. counter cannot become negative", () => { let { step } = ready({ action: { progressType: "counter", repeatCount: 3 } }); step = start(step); assert.throws(() => api.decrementProgress(step, { expectedRevision: step.revision, operationId: op("dec") }), { code: "progress_value_invalid" }); });
test("10. counter cannot exceed its target", () => { let { step } = ready({ action: { progressType: "counter", repeatCount: 1 } }); step = start(step); step = api.incrementProgress(step, { expectedRevision: step.revision, operationId: op("inc") }); assert.throws(() => api.incrementProgress(step, { expectedRevision: step.revision, operationId: op("inc") }), { code: "progress_target_exceeded" }); });
test("11. rows derive a target from the proven range", () => { const { step } = ready({ action: { progressType: "rows", rowRange: { from: 4, to: 8 } } }); assert.equal(step.progressState.target, 5); });
test("12. stitches preserve the proven target", () => { const { step } = ready({ action: { progressType: "stitches", stitchCount: 24 } }); assert.equal(step.progressState.target, 24); });
test("13. matching measurement enters checking", () => { let { step } = ready({ action: { progressType: "measurement", measurementTarget: { value: 12, unit: "cm" } } }); step = start(step); step = api.setMeasurement(step, "12", { expectedRevision: step.revision, operationId: op("measurement"), confirmed: true }); assert.equal(step.progressState.result, "match"); assert.equal(step.status, "checking"); });
test("14. mismatching measurement does not complete", () => { let { step } = ready({ action: { progressType: "measurement", measurementTarget: { value: 12, unit: "cm" } } }); step = start(step); step = api.setMeasurement(step, "10", { expectedRevision: step.revision, operationId: op("measurement"), confirmed: true }); assert.equal(step.progressState.result, "below"); assert.ok(step.blockers.some((entry) => entry.code === "measurement_mismatch")); });
test("15. explicit source checkpoint is delegated to Stage 25", () => { const { step } = ready({ action: { progressType: "checkpoint" }, checkpoint: {} }); assert.equal(step.progressState.type, "binary"); assert.equal(step.immutableSnapshot.externalCheckpointRequired, true); });
test("16. Stage 24 exposes no editable duplicate checkpoint criteria", () => { const { step } = ready({ action: { progressType: "checkpoint" }, checkpoint: {} }); assert.equal(step.immutableSnapshot.allowedUserActions.includes("set_checkpoint_criterion"), false); });
test("17. required checkpoint prevents direct Stage 24 completion", () => { let { step, session } = ready({ action: { progressType: "checkpoint" }, checkpoint: {} }); step = start(step); assert.throws(() => api.beginCompletion(step, session, { expectedRevision: step.revision, operationId: op("complete"), confirmed: true, context: { requireCurrentIdentity: false, executionPlan: makePlan({ action: { progressType: "checkpoint" }, checkpoint: {} }) } }), { code: "external_checkpoint_required" }); });
test("18. activation follows ready to active", () => assert.equal(start(ready().step).status, "active"));
test("19. active step can pause", () => { let step = start(ready().step); step = api.pauseStep(step, { expectedRevision: step.revision, operationId: op("pause"), reason: "break" }); assert.equal(step.status, "paused"); assert.equal(step.lifecycle.pauseReason, "break"); });
test("20. resume restores the same step", () => { let step = start(ready().step); const idBefore = step.id; step = api.pauseStep(step, { expectedRevision: step.revision, operationId: op("pause") }); step = api.resumeStep(step, { expectedRevision: step.revision, operationId: op("resume") }); assert.equal(step.status, "active"); assert.equal(step.id, idBefore); });
test("21. completion is finalized only after session acknowledgement", () => { const ctx = ready(); let step = start(ctx.step); step = api.checkStep(step, { expectedRevision: step.revision, operationId: op("check"), confirmed: true }); const operationId = op("complete"); step = api.beginCompletion(step, ctx.session, { expectedRevision: step.revision, operationId, confirmed: true, context: context(ctx.plan) }); const session = sessionApi.completeCurrentAction(ctx.session, { actionId: step.actionId, operationId, now: stamp(10) }); step = api.finalizeCompletion(step, session, { operationId, now: stamp(11) }); assert.equal(step.status, "completed"); assert.equal(step.completionState.completedBy, "user"); });
test("22. blockers prohibit completion", () => { const ctx = ready({ action: { progressType: "counter", repeatCount: 2 } }); const step = start(ctx.step); assert.throws(() => api.beginCompletion(step, ctx.session, { expectedRevision: step.revision, operationId: op("complete"), confirmed: true, context: context(ctx.plan) }), { code: "completion_blocked" }); });
test("23. completion requires explicit user confirmation", () => { const ctx = ready(); let step = start(ctx.step); step = api.checkStep(step, { expectedRevision: step.revision, operationId: op("check"), confirmed: true }); assert.throws(() => api.beginCompletion(step, ctx.session, { expectedRevision: step.revision, operationId: op("complete"), context: context(ctx.plan) }), { code: "completion_confirmation_required" }); });
test("24. optimistic concurrency returns a structured conflict", () => assert.throws(() => api.startStep(ready().step, { expectedRevision: 999, operationId: op("start") }), { code: "step_revision_conflict" }));
test("25. repeated operationId is idempotent", () => { const initial = ready({ action: { progressType: "counter", repeatCount: 2 } }).step; let step = start(initial); const operationId = op("increment"); const once = api.incrementProgress(step, { expectedRevision: step.revision, operationId }); const twice = api.incrementProgress(once, { expectedRevision: step.revision, operationId }); assert.deepEqual(twice, once); });
test("26. immutable snapshot is deeply frozen and unchanged", () => { let step = ready({ action: { progressType: "counter", repeatCount: 2 } }).step; const snapshot = JSON.stringify(step.immutableSnapshot); assert.ok(Object.isFrozen(step.immutableSnapshot)); step = start(step); step = api.incrementProgress(step, { expectedRevision: step.revision, operationId: op("increment") }); assert.equal(JSON.stringify(step.immutableSnapshot), snapshot); });
test("27. correction audit stores before and after", () => { let step = start(ready({ action: { progressType: "counter", repeatCount: 4 } }).step); step = api.setProgress(step, 2, { expectedRevision: step.revision, operationId: op("set"), reason: "correction" }); const audit = step.audit.at(-1); assert.equal(audit.event, "progress_corrected"); assert.equal(audit.before, 0); assert.equal(audit.after, 2); });
test("28. interrupted completion is recovered exactly once", () => { const ctx = ready(); let step = start(ctx.step); step = api.checkStep(step, { expectedRevision: step.revision, operationId: op("check"), confirmed: true }); const completionId = op("complete"); step = api.beginCompletion(step, ctx.session, { expectedRevision: step.revision, operationId: completionId, confirmed: true, context: context(ctx.plan) }); const session = sessionApi.completeCurrentAction(ctx.session, { actionId: step.actionId, operationId: completionId }); const recovered = api.recoverStep(step, session, { expectedRevision: step.revision, operationId: op("recovery"), context: context(ctx.plan) }); assert.equal(recovered.status, "completed"); assert.equal(recovered.audit.filter((entry) => entry.event === "completion_recovered").length, 1); });
test("29. reload recovery keeps an active step", () => { const ctx = ready(); const step = start(ctx.step); const recovered = api.recoverStep(step, ctx.session, { expectedRevision: step.revision, operationId: op("recovery"), context: context(ctx.plan) }); assert.equal(recovered.status, "active"); assert.equal(recovered.progressState.type, step.progressState.type); });
test("30. session revision change makes the step stale", () => { const ctx = ready(); const session = resealSession({ ...structuredClone(ctx.session), revision: ctx.session.revision + 1, updatedAt: stamp(20) }); assert.equal(api.detectStepStaleness(ctx.step, session, context(ctx.plan)).stale, true); });
test("31. execution plan identity change makes the step stale", () => { const ctx = ready(); const plan = structuredClone(ctx.plan); plan.revision += 1; plan.planFingerprint = planApi.calculatePlanFingerprint(plan); plan.plan.planFingerprint = plan.planFingerprint; assert.equal(api.detectStepStaleness(ctx.step, ctx.session, context(plan)).stale, true); });
test("32. explicit rebuild replaces source snapshot without auto-completion", () => { const ctx = ready(); const rebuilt = api.rebuildStep(start(ctx.step), ctx.session, { expectedRevision: 2, operationId: op("rebuild"), confirmed: true, context: context(ctx.plan) }); assert.equal(rebuilt.status, "ready"); assert.equal(rebuilt.completionState.status, "not_started"); });
test("33. rebuild operationId is idempotent", () => { const ctx = ready(); const operationId = op("rebuild"); const rebuilt = api.rebuildStep(ctx.step, ctx.session, { expectedRevision: ctx.step.revision, operationId, confirmed: true, context: context(ctx.plan) }); assert.deepEqual(api.rebuildStep(rebuilt, ctx.session, { expectedRevision: ctx.step.revision, operationId, confirmed: true, context: context(ctx.plan) }), rebuilt); });
test("34. project export and ordinary import retain the step and mark it stale", async () => { const ctx = await createExportableProject(); const exported = await ctx.repository.exportProject(ctx.project.project_id); await ctx.repository.close(); repositories.splice(repositories.indexOf(ctx.repository), 1); await deleteDatabase(); const target = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(target); await target.initialize(); const imported = await target.importProject(exported.json); const state = (await target.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.status, "stale"); assert.equal(state.progressState.type, ctx.step.progressState.type); assert.ok(state.audit.some((entry) => entry.event === "imported")); });
test("35. collision import remaps project and source record identities", async () => { const ctx = await createExportableProject(); const imported = await ctx.repository.importProject((await ctx.repository.exportProject(ctx.project.project_id)).json); const aggregate = await ctx.repository.getProject(imported.project_id); const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; const session = aggregate.progress.find((entry) => entry.kind === sessionApi.PROGRESS_KIND).state; assert.equal(state.projectId, imported.project_id); assert.equal(state.sourceSessionId, session.id); assert.equal(state.actionId, ctx.step.actionId); assert.ok(state.audit.some((entry) => entry.event === "collision_remapped")); });
test("36. imported unverifiable identity cannot remain completed or active", async () => { const ctx = await createExportableProject(); const imported = await ctx.repository.importProject((await ctx.repository.exportProject(ctx.project.project_id)).json); const state = (await ctx.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state; assert.equal(state.staleReason, "imported_identity_unverifiable"); assert.equal(state.validation.stale, true); });
test("37. audit is limited to 24 entries", () => { let step = start(ready({ action: { progressType: "counter", repeatCount: 40 } }).step); for (let index = 0; index < 30; index += 1) step = api.incrementProgress(step, { expectedRevision: step.revision, operationId: op("increment"), now: stamp(30 + index) }); assert.equal(step.audit.length, 24); });
test("38. structural validation detects immutable snapshot damage", () => { const state = structuredClone(ready().step); state.immutableSnapshot.instruction = "changed"; resealStep(state); assert.ok(api.validateStructural(state).some((entry) => entry.code === "immutable_snapshot_changed")); });
test("39. semantic validation detects corrupted numeric progress", () => { const state = structuredClone(ready({ action: { progressType: "counter", repeatCount: 3 } }).step); state.progressState.current = -1; resealStep(state); assert.ok(api.validateSemantic(state).some((entry) => entry.code === "progress_value_invalid")); });
test("40. source validation checks session, plan, import and selected action", () => { const ctx = ready(); const session = structuredClone(ctx.session); session.sourceImportRevision += 1; resealSession(session); const validation = api.validateExecutionStep(ctx.step, session, context(ctx.plan)); assert.equal(validation.valid, false); assert.equal(validation.stale, true); assert.ok(validation.source.length); });
test("repository synchronization acknowledges one completion operation", async () => {
  const ctx = await createExportableProject();
  let step = api.startStep(ctx.step, { expectedRevision: ctx.step.revision, operationId: op("start") });
  await ctx.repository.updatePatternExecutionStep(ctx.project.project_id, ctx.calculationId, step);
  step = api.checkStep(step, { expectedRevision: step.revision, operationId: op("check"), confirmed: true });
  await ctx.repository.updatePatternExecutionStep(ctx.project.project_id, ctx.calculationId, step);
  const operationId = op("complete");
  step = api.beginCompletion(step, ctx.session, { expectedRevision: step.revision, operationId, confirmed: true, context: context(ctx.plan) });
  await ctx.repository.updatePatternExecutionStep(ctx.project.project_id, ctx.calculationId, step);
  await ctx.repository.syncPatternExecutionStepCompletion(ctx.project.project_id, ctx.calculationId, {
    stepState: step, expectedSessionRevision: ctx.session.revision, operationId,
  });
  const session = (await ctx.repository.getPatternExecutionSession(ctx.project.project_id, ctx.calculationId)).state;
  assert.equal(session.execution.actions.find((entry) => entry.actionId === step.actionId).status, "completed");
  assert.ok(session.audit.some((entry) => entry.event === "action_completed" && entry.operationId === operationId));
  const completed = api.finalizeCompletion(step, session, { operationId });
  await ctx.repository.updatePatternExecutionStep(ctx.project.project_id, ctx.calculationId, completed);
  assert.equal((await ctx.repository.getPatternExecutionStep(ctx.project.project_id, ctx.calculationId)).state.status, "completed");
});

async function createExportableProject() {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Execution step export" });
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
  const plan = makePlan({ projectId: project.project_id, id: id(), reviewId: reviewState.id, draftId: draftState.id, analysisId: analysisState.id, semanticId: semanticState.id, secondAction: true });
  plan.sourceTechnologyReviewRevision = reviewState.revision;
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
  let session = makeSession(plan);
  session = sessionApi.completeCurrentAction(session, { actionId: "action:one", operationId: op("prior") });
  await repository.ensureCalculationProgress(project.project_id, calculationId, session.kind, session);
  const step = api.createExecutionStep(session, project.project_id, { context: context(plan), expectedSessionRevision: session.revision });
  await repository.ensurePatternExecutionStep(project.project_id, calculationId, step);
  return { repository, project, calculationId, plan, session, step };
}

async function deleteDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked"));
  });
}
