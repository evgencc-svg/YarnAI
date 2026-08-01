"use strict";

const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
require("fake-indexeddb/auto");

const interventionApi = require("../src/yarnai/static/pattern-execution-intervention.js");
const api = require("../src/yarnai/static/pattern-execution-action.js");
global.window = globalThis;
require("../src/yarnai/static/project-system.js");

const stamp = (second) => `2026-08-01T14:00:${String(second).padStart(2, "0")}.000Z`;
let operation = 0;
const command = (snapshot, second = 10, extra = {}) => ({
  expectedRevision: snapshot.revision,
  expectedEpoch: snapshot.epoch,
  expectedFingerprint: snapshot.fingerprint,
  operationId: `action-operation:${++operation}`,
  now: stamp(second),
  ...extra,
});

function sourceFixture(status = "healthy", overrides = {}) {
  const projectId = overrides.projectId || "project:action";
  const runtimeStatus = overrides.runtimeStatus || ({
    healthy: "ready", attention_required: "paused", blocked: "blocked",
    completed: "completed", failed: "failed", stale: "stale",
  })[status] || "ready";
  const runtimeFingerprint = interventionApi.fingerprint({ runtime: 1, projectId, runtimeStatus });
  const monitoringFingerprint = interventionApi.fingerprint({ monitoring: 1, projectId, status });
  const checkpoint = { id: "checkpoint:one", revision: 1, epoch: 2, projectId, sessionId: "session:one", stepId: "step:one" };
  const blocker = { code: "material_missing", severity: "error", source: "runtime_action", messageKey: "runtime.material_missing", relatedStepId: "step:one", relatedActionId: "runtime-action:one", checkpointId: "checkpoint:one", recoverable: true, recommendedCommand: "resolve_blocker" };
  const warning = { code: "runtime_paused", severity: "warning", source: "runtime", messageKey: "runtime.paused", relatedStepId: "step:one", relatedActionId: "runtime-action:one", recoverable: true, recommendedCommand: "review_paused_action" };
  const sourceIdentity = {
    sourceSchemaVersion: 1,
    project: { id: projectId, revision: 12 },
    calculationIdentity: { id: "calculation:one", revision: 2, fingerprint: interventionApi.fingerprint({ calculation: 1 }) },
    result: { id: "result:one", revision: 7, fingerprint: interventionApi.fingerprint({ result: 1 }) },
    executionPlanIdentity: { id: "plan:one", revision: 3, fingerprint: interventionApi.fingerprint({ plan: 1 }) },
    sessionIdentity: { id: "session:one", revision: 4, epoch: 1, fingerprint: interventionApi.fingerprint({ session: 1 }) },
    runtime: { id: "runtime:one", revision: 5, epoch: 2, fingerprint: runtimeFingerprint },
    runtimeSourceIdentity: { chain: { projectId, plan: { id: "plan:one" }, session: { id: "session:one" } } },
    progressIdentity: { id: "progress:one", revision: 5, fingerprint: interventionApi.fingerprint({ progress: 1 }) },
    completionIdentity: { id: "completion:one", revision: 6, fingerprint: interventionApi.fingerprint({ completion: 1 }) },
    stepIdentities: [{ id: "step:one", revision: 1 }],
    checkpointIdentities: [checkpoint],
    importRevision: 9,
  };
  const monitoring = {
    id: "monitoring:one", projectId, type: "PATTERN_EXECUTION_MONITORING", kind: "PATTERN_EXECUTION_MONITORING",
    revision: 8, epoch: 3, fingerprint: monitoringFingerprint, lifecycle: { state: status }, sourceIdentity,
    runtimeSummary: { lifecycle: runtimeStatus, lastConfirmedCheckpoint: status === "blocked" ? checkpoint : null },
    progressSummary: { totalSteps: 2, completedSteps: status === "completed" ? 2 : 1 },
    currentActivity: { status: runtimeStatus, actionId: ["paused", "blocked", "running"].includes(runtimeStatus) ? "runtime-action:one" : null, stepId: "step:one", checkpointId: status === "blocked" ? "checkpoint:one" : null, safeToResume: runtimeStatus === "paused" },
    blockers: status === "blocked" ? [blocker] : [], warnings: status === "attention_required" ? [warning] : [],
    diagnostics: status === "failed" ? [{ code: "runtime_failed", severity: "error", details: { actionId: "runtime-action:one" } }] : [],
  };
  const runtime = {
    id: "runtime:one", projectId, revision: 5, epoch: 2, runtimeFingerprint, status: runtimeStatus,
    activeActionId: monitoring.currentActivity.actionId,
    actions: status === "failed" ? [{ id: "runtime-action:one", state: "failed", error: { retryable: true, recoverable: true } }] : status === "blocked" ? [{ id: "runtime-action:one", state: "blocked" }] : [],
    lastError: status === "failed" ? { code: "runtime_failed", retryable: true, recoverable: true } : null,
    recovery: null, sourceIdentity: sourceIdentity.runtimeSourceIdentity,
  };
  return { projectId, project: { project_id: projectId, revision: 12, active_calculation_id: "calculation:one" }, monitoring, runtime, calculationId: "calculation:one" };
}

function confirmedFixture(status, type, overrides = {}) {
  const source = sourceFixture(status, overrides);
  let intervention = interventionApi.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) });
  const selected = intervention.actions.find((entry) => entry.type === type);
  assert.equal(selected?.eligible, true, `${type} must be eligible for ${status}`);
  intervention = interventionApi.selectPatternExecutionInterventionAction(intervention, selected.id, {
    expectedRevision: intervention.revision, expectedEpoch: intervention.epoch,
    operationId: `intervention-select:${type}`, now: stamp(2), targetIdentity: selected.targetIdentity,
  }).intervention;
  intervention = interventionApi.confirmPatternExecutionIntervention(intervention, source, {
    expectedRevision: intervention.revision, expectedEpoch: intervention.epoch,
    operationId: `intervention-confirm:${type}`, now: stamp(3),
    actionId: intervention.selectedAction.id, targetIdentity: intervention.selectedAction.targetIdentity,
    confirmedBy: "user",
  }).intervention;
  return { ...source, intervention };
}

function buildReady(status, type, overrides = {}) {
  const source = confirmedFixture(status, type, overrides);
  const waiting = api.buildPatternExecutionAction(source, { id: "execution-action:one", now: stamp(4) });
  const ready = api.preparePatternExecutionAction(waiting, source, command(waiting, 5)).action;
  return { source, waiting, ready };
}

function installAdapters() {
  globalThis.YarnAIPatternExecutionRuntime = {
    resume: runtimeMutation("running"),
    pause: runtimeMutation("paused"),
    stop: runtimeMutation("stopped"),
    recover: runtimeMutation("recovering"),
    unblockCurrentAction: runtimeMutation("running"),
    rebuild(runtime, source, options) {
      return { changed: true, runtime: changedRuntime(runtime, "waiting", options, { epoch: runtime.epoch + 1 }) };
    },
  };
  globalThis.YarnAIPatternExecutionMonitoring = {
    rebuild(monitoring, source, options) {
      const next = structuredClone(monitoring);
      next.revision += 1; next.epoch += 1; next.lifecycle = { state: "healthy" };
      next.fingerprint = interventionApi.fingerprint({ monitoring: next.id, revision: next.revision, epoch: next.epoch });
      return { changed: true, monitoring: next };
    },
  };
}

function runtimeMutation(target) {
  return (runtime, options) => {
    if (runtime.status === target) return { changed: false, runtime: structuredClone(runtime) };
    return { changed: true, runtime: changedRuntime(runtime, target, options) };
  };
}
function changedRuntime(runtime, target, options, extra = {}) {
  const next = { ...structuredClone(runtime), status: target, revision: runtime.revision + 1, ...extra };
  next.runtimeFingerprint = interventionApi.fingerprint({ id: next.id, revision: next.revision, epoch: next.epoch, status: next.status, operationId: options.operationId });
  return next;
}
function applyEffects(source, result) {
  const next = structuredClone(source);
  if (result.effects?.runtime) next.runtime = structuredClone(result.effects.runtime);
  if (result.effects?.monitoring) next.monitoring = structuredClone(result.effects.monitoring);
  return next;
}

beforeEach(() => { operation = 0; installAdapters(); });

test("lifecycle keeps create, validation, execution and verification separate", () => {
  const { source, waiting, ready } = buildReady("healthy", "no_action");
  assert.equal(waiting.lifecycle, "waiting");
  assert.equal(ready.lifecycle, "ready");
  assert.deepEqual(ready.audit.slice(-2).map((entry) => entry.event), ["validation_started", "validation_passed"]);
  const executed = api.executePatternExecutionAction(ready, source, command(ready, 6));
  assert.equal(executed.action.lifecycle, "verifying");
  assert.equal(executed.action.currentAttempt.runtimeActionExecuted, true);
  assert.equal(executed.action.currentAttempt.effectApplied, false);
  const verified = api.verifyPatternExecutionAction(executed.action, source, command(executed.action, 7)).action;
  assert.equal(verified.lifecycle, "completed");
  assert.equal(verified.verification.status, "verified");
});

test("all fourteen actions have a closed adapter and deterministic result", () => {
  const cases = [
    ["healthy", "no_action", {}], ["healthy", "acknowledge", {}],
    ["attention_required", "resume_runtime", {}],
    ["attention_required", "pause_runtime", { runtimeStatus: "running" }],
    ["failed", "retry_runtime", { retryEvidence: { retryable: true } }],
    ["blocked", "recover_runtime", {}], ["blocked", "review_blocker", {}],
    ["blocked", "resolve_blocker", { blockerResolutionEvidence: { resolved: true, proof: "user_evidence" } }],
    ["blocked", "return_to_checkpoint", { checkpointEvidence: { confirmed: true } }],
    ["failed", "rebuild_runtime", {}], ["blocked", "stop_runtime", {}],
    ["completed", "accept_completion", {}], ["failed", "inspect_failure", {}],
    ["failed", "rebuild_monitoring", {}],
  ];
  for (const [status, type, extra] of cases) {
    const overrides = type === "pause_runtime" ? { runtimeStatus: "running" } : {};
    const { source, ready } = buildReady(status, type, overrides);
    const result = api.executePatternExecutionAction(ready, source, command(ready, 6, extra));
    assert.equal(result.action.result.actionType, type);
    assert.ok(api.EXECUTION_MODES.includes(result.action.result.executionMode));
    assert.equal(result.action.lifecycle, "verifying");
    assert.equal(result.action.result.changed, !result.action.result.noOp);
    assert.match(result.action.result.effectFingerprint, /^fnv1a32:/);
  }
});

test("no-op semantics do not claim an applied effect", () => {
  for (const [status, type] of [["healthy", "no_action"], ["healthy", "acknowledge"], ["blocked", "review_blocker"], ["failed", "inspect_failure"], ["completed", "accept_completion"]]) {
    const { source, ready } = buildReady(status, type);
    const executed = api.executePatternExecutionAction(ready, source, command(ready, 6)).action;
    assert.equal(executed.result.changed, false); assert.equal(executed.result.noOp, true);
    assert.equal(executed.currentAttempt.runtimeActionExecuted, true); assert.equal(executed.currentAttempt.effectApplied, false);
  }
});

test("runtime effect is not completed until reread state verifies it", () => {
  const { source, ready } = buildReady("attention_required", "resume_runtime");
  const executed = api.executePatternExecutionAction(ready, source, command(ready, 6));
  assert.equal(executed.action.lifecycle, "verifying");
  const actual = applyEffects(source, executed);
  const completed = api.verifyPatternExecutionAction(executed.action, actual, command(executed.action, 7)).action;
  assert.equal(completed.lifecycle, "completed"); assert.equal(completed.result.resultingState, "running");
  assert.equal(completed.currentAttempt.effectApplied, true);
});

test("verification rejects an adapter effect not present in repository state", () => {
  const { source, ready } = buildReady("attention_required", "resume_runtime");
  const executed = api.executePatternExecutionAction(ready, source, command(ready, 6)).action;
  const rejected = api.verifyPatternExecutionAction(executed, source, command(executed, 7)).action;
  assert.equal(rejected.lifecycle, "failed"); assert.equal(rejected.verification.status, "rejected");
  assert.equal(rejected.currentAttempt.effectApplied, false);
});

test("duplicate execute is idempotent and does not add revision or audit", () => {
  const { source, ready } = buildReady("healthy", "no_action");
  const opts = command(ready, 6);
  const first = api.executePatternExecutionAction(ready, source, opts);
  const repeated = api.executePatternExecutionAction(first.action, source, opts);
  assert.equal(repeated.changed, false); assert.deepEqual(repeated.action, first.action);
  const sameKey = api.executePatternExecutionAction(first.action, source, command(first.action, 7, { idempotencyKey: first.action.currentAttempt.idempotencyKey }));
  assert.equal(sameKey.changed, false); assert.deepEqual(sameKey.action, first.action);
});

test("optimistic revision, epoch and fingerprint are enforced", () => {
  const { source, ready } = buildReady("healthy", "no_action");
  assert.throws(() => api.executePatternExecutionAction(ready, source, { ...command(ready, 6), expectedRevision: ready.revision - 1 }), (error) => error.code === "action_revision_conflict");
  assert.throws(() => api.executePatternExecutionAction(ready, source, { ...command(ready, 6), expectedEpoch: 99 }), (error) => error.code === "action_epoch_conflict");
  assert.throws(() => api.executePatternExecutionAction(ready, source, { ...command(ready, 6), expectedFingerprint: "fnv1a32:00000000" }), (error) => error.code === "action_fingerprint_conflict");
});

test("terminal completed cannot execute twice", () => {
  const { source, ready } = buildReady("healthy", "no_action");
  const executed = api.executePatternExecutionAction(ready, source, command(ready, 6)).action;
  const completed = api.verifyPatternExecutionAction(executed, source, command(executed, 7)).action;
  assert.throws(() => api.executePatternExecutionAction(completed, source, command(completed, 8)), (error) => error.code === "terminal_action_protected");
});

test("retry creates a new attempt and preserves old attempt", () => {
  const { source, ready } = buildReady("attention_required", "resume_runtime");
  const executed = api.executePatternExecutionAction(ready, source, command(ready, 6)).action;
  const failed = api.verifyPatternExecutionAction(executed, source, command(executed, 7)).action;
  const retried = api.retryPatternExecutionAction(failed, source, command(failed, 8)).action;
  assert.equal(retried.lifecycle, "ready"); assert.equal(retried.currentAttempt.ordinal, 2);
  assert.equal(retried.attemptHistory.length, 1); assert.notEqual(retried.currentAttempt.attemptId, failed.currentAttempt.attemptId);
});

test("recover resumes verification without repeating an already invoked adapter", () => {
  const { source, ready } = buildReady("healthy", "no_action");
  const interrupted = structuredClone(api.executePatternExecutionAction(ready, source, command(ready, 6)).action);
  interrupted.lifecycle = "executing"; interrupted.fingerprint = api.fingerprintPatternExecutionAction(interrupted);
  const recovered = api.recoverPatternExecutionAction(interrupted, source, command(interrupted, 7)).action;
  assert.equal(recovered.lifecycle, "verifying"); assert.equal(recovered.audit.at(-1).details.repeatedEffect, false);
});

test("cancel is allowed before effect and forbidden after adapter effect", () => {
  const { source, ready } = buildReady("attention_required", "resume_runtime");
  assert.equal(api.cancelPatternExecutionAction(ready, command(ready, 5)).action.lifecycle, "cancelled");
  const executed = api.executePatternExecutionAction(ready, source, command(ready, 6)).action;
  assert.throws(() => api.cancelPatternExecutionAction(executed, command(executed, 7)), (error) => error.code === "cancellation_not_allowed");
});

test("stale runtime, monitoring, intervention and decision identities block safely", () => {
  for (const mutate of [
    (source) => { source.runtime.revision += 1; },
    (source) => { source.monitoring.fingerprint = interventionApi.fingerprint({ changed: "monitoring" }); },
    (source) => { source.intervention.fingerprint = interventionApi.fingerprint({ changed: "intervention" }); },
    (source) => { source.intervention.decision.fingerprint = interventionApi.fingerprint({ changed: "decision" }); },
  ]) {
    const { source, ready } = buildReady("healthy", "no_action"); const changed = structuredClone(source); mutate(changed);
    const result = api.executePatternExecutionAction(ready, changed, command(ready, 6)).action;
    assert.equal(result.lifecycle, "stale"); assert.equal(result.currentAttempt.runtimeActionExecuted, false);
  }
});

test("target mismatch and checkpoint epoch mismatch are rejected", () => {
  const { source, ready } = buildReady("blocked", "return_to_checkpoint");
  const wrongEpoch = structuredClone(ready); wrongEpoch.sourceIdentity.checkpointIdentities[0].epoch = 99; wrongEpoch.fingerprint = api.fingerprintPatternExecutionAction(wrongEpoch);
  assert.throws(() => api.executeClosedAdapter("return_to_checkpoint", source, wrongEpoch, { checkpointEvidence: { confirmed: true } }), (error) => error.code === "precondition_checkpoint_epoch_mismatch");
  const target = structuredClone(ready); target.targetIdentity.runtimeId = "runtime:wrong"; target.fingerprint = api.fingerprintPatternExecutionAction(target);
  assert.ok(api.validatePatternExecutionAction(target).semantic.some((entry) => entry.code === "selected_target_mismatch"));
});

test("blocker resolution cannot be inferred from a click", () => {
  const { source, ready } = buildReady("blocked", "resolve_blocker");
  const result = api.executePatternExecutionAction(ready, source, command(ready, 6)).action;
  assert.equal(result.lifecycle, "blocked"); assert.equal(result.blockedReason.code, "precondition_blocker_resolution_unproven");
});

test("rebuild creates immutable new Stage 32 epoch without execution", () => {
  const { source, ready } = buildReady("healthy", "no_action"); const before = structuredClone(ready);
  const rebuilt = api.rebuildPatternExecutionAction(ready, source, command(ready, 8)).action;
  assert.equal(rebuilt.epoch, ready.epoch + 1); assert.equal(rebuilt.lifecycle, "waiting");
  assert.equal(rebuilt.previousEpoch.fingerprint, ready.fingerprint); assert.equal(rebuilt.currentAttempt, null);
  assert.deepEqual(ready, before);
});

test("export import round trip, corrupt fingerprint and safe stale import", () => {
  const { source, ready } = buildReady("healthy", "no_action");
  const serialized = api.serializePatternExecutionAction(ready);
  assert.deepEqual(api.deserializePatternExecutionAction(serialized, { source }), ready);
  const damaged = JSON.parse(serialized); damaged.selectedAction.reason += " damaged";
  assert.throws(() => api.deserializePatternExecutionAction(damaged), (error) => error.code === "corrupted_action_snapshot");
  const stale = api.deserializePatternExecutionAction(serialized, { allowUnprovenIdentity: true, now: stamp(9) });
  assert.equal(stale.lifecycle, "stale"); assert.equal(stale.executionPlan.executable, false); assert.equal(stale.currentAttempt.effectApplied, false);
});

test("collision remap updates nested identities and recalculates all keys", () => {
  const { ready } = buildReady("blocked", "review_blocker");
  const remapped = api.remapPatternExecutionAction(ready, new Map([
    ["project:action", "project:remapped"], ["execution-action:one", "execution-action:remapped"],
    ["intervention:one", "intervention:remapped"], ["runtime:one", "runtime:remapped"],
    ["monitoring:one", "monitoring:remapped"], ["result:one", "result:remapped"],
    ["calculation:one", "calculation:remapped"], ["plan:one", "plan:remapped"],
    ["session:one", "session:remapped"], ["progress:one", "progress:remapped"],
    ["completion:one", "completion:remapped"], ["step:one", "step:remapped"],
    ["checkpoint:one", "checkpoint:remapped"], [ready.currentAttempt.attemptId, "attempt:remapped"],
  ]));
  assert.equal(remapped.projectId, "project:remapped"); assert.equal(remapped.id, "execution-action:remapped");
  assert.equal(remapped.sourceIdentity.runtime.id, "runtime:remapped"); assert.equal(remapped.currentAttempt.attemptId, "attempt:remapped");
  assert.notEqual(remapped.currentAttempt.idempotencyKey, ready.currentAttempt.idempotencyKey);
  assert.equal(remapped.fingerprint, api.fingerprintPatternExecutionAction(remapped));
  assert.ok(!JSON.stringify(remapped).includes("project:action"));
});

test("fingerprint is deterministic, key order independent and domain sensitive", () => {
  const { ready } = buildReady("healthy", "no_action");
  const reordered = JSON.parse(api.canonicalize(ready));
  assert.equal(api.fingerprintPatternExecutionAction(ready), api.fingerprintPatternExecutionAction(reordered));
  const decision = structuredClone(ready); decision.decisionIdentity.fingerprint = interventionApi.fingerprint({ different: true });
  assert.notEqual(api.fingerprintPatternExecutionAction(ready), api.fingerprintPatternExecutionAction(decision));
  const target = structuredClone(ready); target.targetIdentity.runtimeId = "runtime:other";
  assert.notEqual(api.fingerprintPatternExecutionAction(ready), api.fingerprintPatternExecutionAction(target));
  const withEffect = structuredClone(ready); withEffect.result = { actionType: "no_action", executionMode: "no_op", sourceState: "ready", requestedTargetState: "ready", resultingState: "ready", changed: false, noOp: true, blockedReason: null, effectSummary: "effect", affectedIdentity: { id: "runtime:one" }, preconditionFingerprint: api.fingerprint({ precondition: 1 }), effectFingerprint: api.fingerprint({ effect: 1 }), evidence: {}, warnings: [] };
  assert.notEqual(api.fingerprintPatternExecutionAction(ready), api.fingerprintPatternExecutionAction(withEffect));
  const withVerification = structuredClone(ready); withVerification.verification.reasonCode = "different";
  assert.notEqual(api.fingerprintPatternExecutionAction(ready), api.fingerprintPatternExecutionAction(withVerification));
});

test("read inspection is pure and never executes or writes", () => {
  const { source, ready } = buildReady("healthy", "no_action");
  const aggregate = { ...source, progress: [{ kind: api.PROGRESS_KIND, state: ready, revision: 1, epoch: 1 }] };
  const before = structuredClone(aggregate); const inspected = api.inspectAggregate(aggregate);
  assert.deepEqual(aggregate, before); assert.equal(inspected.action.lifecycle, "ready");
  assert.equal(inspected.action.currentAttempt.runtimeActionExecuted, false);
});

test("catalog forbids dynamic dispatch and later-stage references", () => {
  const textValue = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-execution-action.js"), "utf8");
  assert.deepEqual([...api.ACTION_TYPES].sort(), ["no_action", "acknowledge", "resume_runtime", "pause_runtime", "retry_runtime", "recover_runtime", "review_blocker", "resolve_blocker", "return_to_checkpoint", "rebuild_runtime", "stop_runtime", "accept_completion", "inspect_failure", "rebuild_monitoring"].sort());
  assert.ok(!/\beval\s*\(|\bFunction\s*\(|import\s*\(/.test(textValue));
  const forbidden = `Stage ${30 + 3}`; assert.ok(!textValue.includes(forbidden));
});

test("fallback import without the Stage 32 domain module remaps collisions and disables execution", async () => {
  const { DB_NAME, ProjectRepository } = globalThis.YarnAIProjectSystem;
  await deleteDatabase(DB_NAME);
  const repository = new ProjectRepository();
  const project = await repository.createProject({ title: "Fallback action import" });
  const saved = await repository.addCalculation(project.project_id, {
    axes: ["width"], functional_category: "garment",
    width: { value: 50, unit: "cm", size_kind: "finished", direction: "nearest", gauge: { method: "ready_value", ready_count: 20, base_length: 10 } },
  }, {
    status: "READY", normalized_inputs: { width: 50 },
    axes: { width: { selected_candidate: { working_count: 100 } } },
    warnings: [], errors: [], clarifications: [], canon_version: "1", specification_version: "1",
  });
  const selectedAction = {
    id: "intervention-action:no_action", type: "no_action", label: "No action",
    reason: "healthy:no_action", sourceObservationIds: [], requiresConfirmation: false,
    expectedEffect: "No runtime mutation.", targetIdentity: { projectId: project.project_id, runtimeId: "runtime:source" },
    priority: 100, impact: "low",
  };
  const now = stamp(1);
  const snapshot = {
    schemaVersion: 1, version: 1, kind: api.PROGRESS_KIND, type: api.PROGRESS_KIND,
    id: "execution-action:source", projectId: project.project_id, epoch: 1, revision: 1,
    lifecycle: "waiting", createdAt: now, updatedAt: now,
    interventionIdentity: { id: "intervention:source", revision: 3, epoch: 1, lifecycle: "confirmed" },
    interventionFingerprint: api.fingerprint({ intervention: "source" }),
    decisionIdentity: { fingerprint: api.fingerprint({ decision: "source" }), interventionId: "intervention:source", interventionRevision: 3, interventionEpoch: 1 },
    selectedAction, targetIdentity: structuredClone(selectedAction.targetIdentity),
    sourceIdentity: { project: { id: project.project_id }, runtime: { id: "runtime:source", revision: 4, epoch: 1, fingerprint: api.fingerprint({ runtime: "source" }) }, monitoring: { id: "monitoring:source", revision: 2, epoch: 1, fingerprint: api.fingerprint({ monitoring: "source" }) }, stepIdentities: [], checkpointIdentities: [] },
    executionPlan: { actionType: "no_action", executionMode: "no_op", targetKind: "none", sourceState: "ready", requestedTargetState: "ready", expectedEffect: selectedAction.expectedEffect, executable: true, adapterVersion: api.ADAPTER_VERSION },
    currentAttempt: null, attemptHistory: [],
    verification: { status: "pending", verifiedAt: null, expectedState: null, actualState: null, targetIdentity: null, evidence: {}, reasonCode: null, fingerprint: null },
    result: null, blockedReason: null, failure: null, audit: [], operations: [], previousEpoch: null, importedDiagnostic: null, fingerprint: null,
  };
  snapshot.fingerprint = api.fingerprintPatternExecutionAction(snapshot);
  const savedGlobal = globalThis.YarnAIPatternExecutionAction;
  delete globalThis.YarnAIPatternExecutionAction;
  try {
    await repository.ensurePatternExecutionAction(project.project_id, saved.calculation.calculation_id, snapshot);
    const exported = await repository.exportProject(project.project_id);
    const imported = await repository.importProject(exported.json);
    const aggregate = await repository.getProject(imported.project_id);
    const action = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND)?.state;
    assert.equal(imported.collision, true); assert.ok(action);
    assert.equal(action.projectId, imported.project_id); assert.equal(action.lifecycle, "stale");
    assert.equal(action.executionPlan.executable, false); assert.equal(action.blockedReason.code, "import_identity_unproven");
    assert.equal(action.currentAttempt, null); assert.equal(action.fingerprint, api.fingerprintPatternExecutionAction(action));
  } finally {
    globalThis.YarnAIPatternExecutionAction = savedGlobal;
    await repository.close();
    await deleteDatabase(DB_NAME);
  }
});

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}
