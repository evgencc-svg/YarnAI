"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
require("fake-indexeddb/auto");

global.window = globalThis;
if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto });
require("./project-system.js");
const runtimeApi = require("./pattern-execution-runtime.js");
const api = require("./pattern-execution-monitoring.js");

const repositories = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
});

const stamp = (second) => `2026-08-01T12:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000Z`;
let sequence = 0;
const commandOptions = (snapshot, second = 10, extra = {}) => ({ expectedRevision: snapshot.revision, operationId: `monitoring-operation:${++sequence}`, now: stamp(second), ...extra });
const runtimeOptions = (runtime, second = 10, extra = {}) => ({ expectedRevision: runtime.revision, operationId: `runtime-operation:${++sequence}`, now: stamp(second), ...extra });

function sourceFixture(overrides = {}) {
  const projectId = overrides.projectId || "project:monitoring";
  const calculationId = overrides.calculationId || "calculation:monitoring";
  const chain = {
    sourceSchemaVersion: 1,
    projectId,
    calculation: { id: calculationId, revision: 2, fingerprint: runtimeApi.fingerprint({ calculationId }) },
    plan: { id: "plan:monitoring", revision: 3, fingerprint: runtimeApi.fingerprint({ plan: 1 }) },
    session: { id: "session:monitoring", revision: 4, epoch: 2, fingerprint: runtimeApi.fingerprint({ session: 1 }) },
    steps: [
      { id: "step:one", revision: 2, fingerprint: runtimeApi.fingerprint({ step: 1 }), actionId: "source-action:one" },
      { id: "step:two", revision: 2, fingerprint: runtimeApi.fingerprint({ step: 2 }), actionId: "source-action:two" },
    ],
    checkpoints: [
      { id: "checkpoint:one", revision: 2, fingerprint: runtimeApi.fingerprint({ checkpoint: 1 }), actionId: "source-action:one" },
      { id: "checkpoint:two", revision: 2, fingerprint: runtimeApi.fingerprint({ checkpoint: 2 }), actionId: "source-action:two" },
    ],
    progress: { id: "progress:monitoring", revision: 5, fingerprint: runtimeApi.fingerprint({ progress: 1 }) },
    completion: { id: "completion:monitoring", revision: 6, fingerprint: runtimeApi.fingerprint({ completion: 1 }) },
  };
  chain.sourceIdentityFingerprint = runtimeApi.fingerprint(chain);
  const resultSnapshot = {
    schemaVersion: 1,
    resultId: "snapshot:monitoring",
    projectId,
    sessionId: chain.session.id,
    resultRevision: 1,
    sourceIdentity: structuredClone(chain),
    planSummary: { planId: chain.plan.id, title: "Monitoring fixture" },
    executionSummary: { executionStatus: "completed" },
    completionReference: { completionId: chain.completion.id },
    completedSteps: [
      { stepId: "step:one", actionId: "source-action:one", status: "completed" },
      { stepId: "step:two", actionId: "source-action:two", status: "completed" },
    ],
    completedActions: [
      { actionId: "source-action:one", phaseId: "phase:one", order: 1, title: "Первое действие", status: "completed", required: true },
      { actionId: "source-action:two", phaseId: "phase:two", order: 2, title: "Второе действие", status: "completed", required: true },
    ],
    confirmedCheckpoints: [
      { checkpointRecordId: "checkpoint:one", checkpointId: "checkpoint:def:one", actionId: "source-action:one", status: "confirmed" },
      { checkpointRecordId: "checkpoint:two", checkpointId: "checkpoint:def:two", actionId: "source-action:two", status: "confirmed" },
    ],
    actualParameters: [], plannedParameters: [], deviations: [], warnings: [], notes: [], generatedAt: stamp(1), fingerprint: null,
  };
  const resultFingerprintPayload = structuredClone(resultSnapshot);
  delete resultFingerprintPayload.fingerprint;
  delete resultFingerprintPayload.generatedAt;
  delete resultFingerprintPayload.resultRevision;
  resultSnapshot.fingerprint = runtimeApi.fingerprint(resultFingerprintPayload);
  const result = {
    id: "result:monitoring", projectId, kind: "PATTERN_EXECUTION_RESULT", schemaVersion: 1, version: 1,
    sourceSchemaVersion: 1, revision: 7, resultRevision: 1, status: "ready", createdAt: stamp(1), updatedAt: stamp(2), resultSnapshot,
    resultFingerprint: resultSnapshot.fingerprint, expectedSourceIdentity: structuredClone(chain), expectedSourceIdentityFingerprint: chain.sourceIdentityFingerprint,
    sourceCalculationId: calculationId, blockers: [], warnings: [], staleReasons: [], failure: null, interruptedOperation: null, audit: [], operations: [],
  };
  const record = (kind, state, progressId) => ({ progress_id: progressId, project_id: projectId, calculation_id: calculationId, kind, epoch: 1, state });
  const progress = [
    record("PATTERN_EXECUTION_PLAN", { id: chain.plan.id, revision: chain.plan.revision, planFingerprint: chain.plan.fingerprint }, "record:plan"),
    record("PATTERN_EXECUTION_SESSION", { id: chain.session.id, revision: chain.session.revision, sessionFingerprint: chain.session.fingerprint }, "record:session"),
    ...chain.steps.map((identity, index) => record("PATTERN_EXECUTION_STEP", { id: identity.id, revision: identity.revision, stepFingerprint: identity.fingerprint }, `record:step:${index}`)),
    ...chain.checkpoints.map((identity, index) => record("PATTERN_EXECUTION_CHECKPOINT", { id: identity.id, revision: identity.revision, checkpointFingerprint: identity.fingerprint }, `record:checkpoint:${index}`)),
    record("PATTERN_EXECUTION_PROGRESS", { id: chain.progress.id, revision: chain.progress.revision, progressFingerprint: chain.progress.fingerprint }, "record:progress"),
    record("PATTERN_EXECUTION_COMPLETION", { id: chain.completion.id, revision: chain.completion.revision, completionFingerprint: chain.completion.fingerprint }, "record:completion"),
    record("PATTERN_EXECUTION_RESULT", result, "record:result"),
  ];
  return { project: { project_id: projectId, active_calculation_id: calculationId, revision: 10, imported_from_project_id: null }, calculations: [{ calculation_id: calculationId, revision: 2 }], progress };
}

function withRuntime(source, runtime) {
  const aggregate = structuredClone(source);
  aggregate.progress.push({ progress_id: "record:runtime", project_id: runtime.projectId, calculation_id: aggregate.project.active_calculation_id, kind: "PATTERN_EXECUTION_RUNTIME", epoch: 1, state: runtime });
  return aggregate;
}

function runtimeWaiting(source = sourceFixture()) { return runtimeApi.createRuntime(source, { id: "runtime:monitoring", now: stamp(2) }).runtime; }
function runtimeReady(source = sourceFixture()) { const state = runtimeWaiting(source); return runtimeApi.validate(state, source, runtimeOptions(state, 3)).runtime; }
function runtimeRunning(source = sourceFixture()) { const state = runtimeReady(source); return runtimeApi.start(state, runtimeOptions(state, 4)).runtime; }
function runtimeBegun(source = sourceFixture()) { const state = runtimeRunning(source); return runtimeApi.beginCurrentAction(state, runtimeOptions(state, 5)).runtime; }
function monitoringFor(runtime, source = sourceFixture(), options = {}) { return api.createMonitoring(withRuntime(source, runtime), { id: options.id || "monitoring:id", now: options.now || stamp(6) }).monitoring; }
function refreshed(runtime, source = sourceFixture()) { const aggregate = withRuntime(source, runtime); const state = monitoringFor(runtime, source); return api.refresh(state, aggregate, commandOptions(state, 7)).monitoring; }

test("creates an immutable waiting monitoring snapshot from a valid runtime", () => {
  const source = sourceFixture();
  const runtime = runtimeReady(source);
  const snapshot = monitoringFor(runtime, source);
  assert.equal(snapshot.type, api.PROGRESS_KIND);
  assert.equal(snapshot.lifecycle.state, "waiting");
  assert.equal(snapshot.sourceIdentity.runtime.id, runtime.id);
  assert.equal(snapshot.runtimeSummary.totalSteps, 2);
  assert.ok(Object.isFrozen(snapshot));
});

test("fingerprint and repeated creation are deterministic", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const aggregate = withRuntime(source, runtime);
  const first = api.createMonitoring(aggregate, { id: "same", now: stamp(6) }).monitoring;
  const second = api.createMonitoring(aggregate, { id: "same", now: stamp(40) }).monitoring;
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.runtimeSummary, second.runtimeSummary);
});

test("refresh performs waiting to observing to healthy through the centralized lifecycle", () => {
  const state = refreshed(runtimeReady());
  assert.equal(state.lifecycle.state, "healthy");
  assert.equal(state.lifecycle.previousState, "observing");
  assert.deepEqual(api.TRANSITIONS.waiting, ["observing"]);
});

test("reading an aggregate never changes lifecycle or the stored snapshot", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const monitoring = monitoringFor(runtime, source); const aggregate = withRuntime(source, runtime);
  aggregate.progress.push({ progress_id: "record:monitoring", project_id: runtime.projectId, calculation_id: aggregate.project.active_calculation_id, kind: api.PROGRESS_KIND, epoch: 1, state: monitoring });
  const before = structuredClone(aggregate); const inspected = api.inspectAggregate(aggregate);
  assert.equal(inspected.rawMonitoring.lifecycle.state, "waiting");
  assert.deepEqual(aggregate, before);
});

test("refresh with the same validated input is idempotent", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const aggregate = withRuntime(source, runtime); const initial = monitoringFor(runtime, source);
  const first = api.refresh(initial, aggregate, commandOptions(initial, 7));
  const second = api.refresh(first.monitoring, aggregate, commandOptions(first.monitoring, 8));
  assert.equal(second.changed, false);
  assert.deepEqual(second.monitoring, first.monitoring);
});

test("healthy runtime produces healthy monitoring and open_runtime recommendation", () => {
  const state = refreshed(runtimeReady());
  assert.equal(state.lifecycle.state, "healthy");
  assert.equal(state.recommendedAction.type, "open_runtime");
});

test("paused runtime is preserved as paused and recommends review", () => {
  const source = sourceFixture(); let runtime = runtimeBegun(source); runtime = runtimeApi.pause(runtime, runtimeOptions(runtime, 6)).runtime;
  const state = refreshed(runtime, source);
  assert.equal(state.currentActivity.status, "paused");
  assert.equal(state.lifecycle.state, "attention_required");
  assert.equal(state.recommendedAction.type, "review_paused_action");
});

test("blocked runtime exposes a deterministic blocker and resolve recommendation", () => {
  const source = sourceFixture(); let runtime = runtimeBegun(source);
  runtime = runtimeApi.blockCurrentAction(runtime, { code: "material_missing", message: "Нужен материал" }, runtimeOptions(runtime, 6)).runtime;
  const state = refreshed(runtime, source);
  assert.equal(state.lifecycle.state, "blocked");
  assert.equal(state.blockers[0].code, "material_missing");
  assert.equal(state.recommendedAction.type, "resolve_blocker");
});

test("recovering runtime is distinct and recommends retry_recovery", () => {
  const source = sourceFixture(); let runtime = runtimeBegun(source); runtime = runtimeApi.recover(runtime, runtimeOptions(runtime, 6)).runtime;
  const state = refreshed(runtime, source);
  assert.equal(state.currentActivity.status, "recovering");
  assert.equal(state.recommendedAction.type, "retry_recovery");
});

test("completed runtime produces 100 percent and review_result", () => {
  const source = sourceFixture(); let runtime = runtimeBegun(source);
  runtime = runtimeApi.completeCurrentAction(runtime, runtimeOptions(runtime, 6)).runtime;
  runtime = runtimeApi.beginCurrentAction(runtime, runtimeOptions(runtime, 7)).runtime;
  runtime = runtimeApi.completeCurrentAction(runtime, runtimeOptions(runtime, 8)).runtime;
  const state = refreshed(runtime, source);
  assert.equal(state.lifecycle.state, "completed");
  assert.equal(state.progressSummary.completedPercent, 100);
  assert.equal(state.recommendedAction.type, "review_result");
});

test("failed runtime is terminal and recommends inspect_failure", () => {
  const source = sourceFixture(); const begun = runtimeBegun(source);
  const runtime = runtimeApi.failCurrentAction(begun, { code: "needle_broke", message: "Сбой" }, runtimeOptions(begun, 6)).runtime;
  const state = refreshed(runtime, source);
  assert.equal(state.lifecycle.state, "failed");
  assert.equal(state.currentActivity.status, "failed");
  assert.equal(state.recommendedAction.type, "inspect_failure");
});

test("stopped runtime remains distinguishable and recommends rebuild_runtime", () => {
  const source = sourceFixture(); const running = runtimeRunning(source); const runtime = runtimeApi.stop(running, runtimeOptions(running, 6)).runtime;
  const state = refreshed(runtime, source);
  assert.equal(state.currentActivity.status, "stopped");
  assert.equal(state.recommendedAction.type, "rebuild_runtime");
});

test("stale runtime and stale upstream are represented without changing runtime", () => {
  const source = sourceFixture(); const running = runtimeRunning(source); const runtime = runtimeApi.markStale(running, [{ code: "source_changed" }], runtimeOptions(running, 6)).runtime; const before = structuredClone(runtime);
  const state = refreshed(runtime, source);
  assert.equal(state.lifecycle.state, "stale");
  assert.equal(state.currentActivity.status, "stale");
  assert.deepEqual(runtime, before);
});

test("unfinished running action survives reload and requires a user decision", () => {
  const state = refreshed(runtimeBegun());
  assert.equal(state.currentActivity.status, "running");
  assert.equal(state.currentActivity.requiresUserDecision, true);
  assert.equal(state.runtimeSummary.hasUnfinishedRunningAction, true);
  assert.ok(state.warnings.some((entry) => entry.code === "unfinished_running_action"));
});

test("progress aggregation partitions all steps and checkpoints", () => {
  const source = sourceFixture(); let runtime = runtimeBegun(source); runtime = runtimeApi.completeCurrentAction(runtime, runtimeOptions(runtime, 6)).runtime;
  const projection = api.projectRuntime(runtime, source.progress.at(-1).state);
  assert.deepEqual(projection.progressSummary, {
    totalSteps: 2, completedSteps: 1, currentStepIndex: 2, completedPercent: 50,
    totalCheckpoints: 2, completedCheckpoints: 1, blockedCount: 0, warningCount: 0,
    failedCount: 0, remainingCount: 1,
  });
});

test("progress percentage is explicitly rounded to the nearest integer", () => {
  const actions = ["completed", "ready", "ready"].map((state, index) => ({
    id: `action:${index + 1}`, ordinal: index + 1, state,
    sourceReference: { stepIds: [`step:${index + 1}`], checkpointIds: [] },
  }));
  const projection = api.projectRuntime({ status: "running", epoch: 1, revision: 1, actions, audit: [], sourceIdentity: { chain: { checkpoints: [] } } }, null);
  assert.equal(projection.progressSummary.completedPercent, 33);
});

test("zero-step projection is 0 percent and never leaves valid ranges", () => {
  const projection = api.projectRuntime({ status: "waiting", epoch: 1, revision: 1, actions: [], audit: [], sourceIdentity: { chain: { checkpoints: [] } } }, null);
  assert.equal(projection.progressSummary.totalSteps, 0);
  assert.equal(projection.progressSummary.completedPercent, 0);
  assert.equal(projection.progressSummary.currentStepIndex, 0);
});

test("inconsistent progress creates a deterministic diagnostic", () => {
  const projection = api.projectRuntime({ status: "completed", epoch: 1, revision: 1, actions: [{ id: "a", ordinal: 1, state: "ready", sourceReference: { stepIds: ["s"], checkpointIds: [] } }], audit: [] }, null);
  assert.ok(projection.diagnostics.some((entry) => entry.code === "completed_runtime_progress_incomplete"));
});

test("blockers and warnings deduplicate by stable keys", () => {
  const source = sourceFixture(); let runtime = runtimeBegun(source);
  runtime = runtimeApi.blockCurrentAction(runtime, { code: "same", message: "same" }, runtimeOptions(runtime, 6)).runtime;
  const duplicated = structuredClone(runtime);
  duplicated.actions.push({ ...structuredClone(duplicated.actions[0]), ordinal: duplicated.actions.length + 1 });
  const projection = api.projectRuntime(duplicated, source.progress.at(-1).state);
  assert.equal(projection.blockers.filter((entry) => entry.code === "same").length, 1);
  const warningKeys = projection.warnings.map((entry) => `${entry.code}|${entry.source}|${entry.relatedActionId}`);
  assert.equal(new Set(warningKeys).size, warningKeys.length);
});

test("diagnostics have deterministic lexical order", () => {
  const projection = api.projectRuntime(runtimeReady(), null, [{ code: "zeta", severity: "error" }, { code: "alpha", severity: "error" }]);
  assert.deepEqual(projection.diagnostics.map((entry) => entry.code), [...projection.diagnostics.map((entry) => entry.code)].sort());
});

test("timeline is a deterministic bounded projection with stable identities", () => {
  const source = sourceFixture(); let runtime = runtimeRunning(source);
  for (let index = 0; index < 40; index += 1) {
    runtime = runtimeApi.pause(runtime, runtimeOptions(runtime, 10 + index * 2)).runtime;
    runtime = runtimeApi.resume(runtime, runtimeOptions(runtime, 11 + index * 2)).runtime;
  }
  const first = api.projectTimeline(runtime); const second = api.projectTimeline(runtime);
  assert.equal(first.length, api.TIMELINE_LIMIT);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((entry) => entry.id)).size, first.length);
});

test("audit stays bounded at 24 entries", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const aggregate = withRuntime(source, runtime); let state = monitoringFor(runtime, source);
  for (let index = 0; index < 35; index += 1) {
    const rebuilt = api.rebuild(state, aggregate, commandOptions(state, 20 + index));
    state = rebuilt.monitoring;
  }
  assert.equal(state.audit.length, api.AUDIT_LIMIT);
});

test("optimistic concurrency rejects obsolete revisions", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const aggregate = withRuntime(source, runtime); const state = monitoringFor(runtime, source);
  assert.throws(() => api.refresh(state, aggregate, { expectedRevision: state.revision - 1, operationId: "stale", now: stamp(8) }), (error) => error.code === "monitoring_revision_conflict");
});

test("same operation id is idempotent and cannot change command", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const aggregate = withRuntime(source, runtime); const state = monitoringFor(runtime, source); const options = commandOptions(state, 7);
  const first = api.refresh(state, aggregate, options); const second = api.refresh(first.monitoring, aggregate, options);
  assert.equal(second.changed, false);
  assert.throws(() => api.rebuild(first.monitoring, aggregate, { ...options, expectedRevision: first.monitoring.revision }), (error) => error.code === "operation_id_conflict");
});

test("recovery of interrupted observing monitoring revalidates runtime explicitly", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const aggregate = withRuntime(source, runtime); const waiting = monitoringFor(runtime, source);
  const interrupted = structuredClone(waiting);
  interrupted.lifecycle = { state: "observing", previousState: "waiting", observedAt: stamp(7) };
  interrupted.fingerprint = api.calculateMonitoringFingerprint(interrupted);
  const recovered = api.recover(interrupted, aggregate, commandOptions(interrupted, 8)).monitoring;
  assert.equal(recovered.lifecycle.state, "healthy");
  assert.ok(recovered.audit.some((entry) => entry.event === "monitoring_recovered"));
});

test("rebuild creates a new epoch without mutating the previous snapshot", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const aggregate = withRuntime(source, runtime); const state = refreshed(runtime, source); const before = structuredClone(state);
  const rebuilt = api.rebuild(state, aggregate, commandOptions(state, 20)).monitoring;
  assert.equal(rebuilt.epoch, state.epoch + 1);
  assert.equal(rebuilt.lifecycle.state, "waiting");
  assert.deepEqual(state, before);
});

test("upstream runtime revision mismatch becomes stale only after explicit refresh", () => {
  const source = sourceFixture(); const ready = runtimeReady(source); const state = refreshed(ready, source); const changed = runtimeApi.start(ready, runtimeOptions(ready, 9)).runtime; const aggregate = withRuntime(source, changed);
  assert.equal(state.lifecycle.state, "healthy");
  const stale = api.refresh(state, aggregate, commandOptions(state, 10)).monitoring;
  assert.equal(stale.lifecycle.state, "stale");
  assert.ok(stale.diagnostics.some((entry) => entry.code === "runtime_revision_mismatch"));
});

test("upstream runtime fingerprint mismatch is detected on explicit source validation", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const state = refreshed(runtime, source); const changed = structuredClone(runtime);
  changed.runtimeFingerprint = runtimeApi.fingerprint({ corrupted: true });
  const report = api.validateMonitoring(state, withRuntime(source, changed));
  assert.ok(report.source.some((entry) => ["runtime_fingerprint_mismatch", "runtime_structural_invalid"].includes(entry.code)));
});

test("structural and semantic validation reject corrupted snapshots", () => {
  const state = refreshed(runtimeReady()); const corrupted = structuredClone(state); corrupted.progressSummary.completedPercent = 101; corrupted.fingerprint = api.calculateMonitoringFingerprint(corrupted);
  const report = api.validateMonitoring(corrupted);
  assert.equal(report.valid, false);
  assert.ok(report.semantic.some((entry) => entry.code === "monitoring_progress_range_invalid"));
});

test("imported unverifiable identity can be represented as explicit stale", () => {
  const source = sourceFixture(); const runtime = runtimeReady(source); const state = monitoringFor(runtime, source); const aggregate = withRuntime(source, runtime);
  aggregate.project.revision += 1;
  const stale = api.refresh(state, aggregate, commandOptions(state, 8)).monitoring;
  assert.equal(stale.lifecycle.state, "stale");
  assert.equal(stale.recommendedAction.type, "rebuild_runtime");
});

test("collision remap helper recalculates source timeline recommendation and monitoring fingerprints", () => {
  const state = refreshed(runtimeBegun()); const changed = structuredClone(state);
  changed.projectId = "project:remapped";
  changed.sourceIdentity.project.id = "project:remapped";
  changed.sourceIdentity.runtime.id = "runtime:remapped";
  changed.currentActivity.actionId = "action:remapped";
  changed.timeline.forEach((entry) => { if (entry.actionId) entry.actionId = "action:remapped"; });
  changed.recommendedAction.targetIdentity.projectId = "project:remapped";
  changed.recommendedAction.targetIdentity.runtimeId = "runtime:remapped";
  const remapped = api.remapSnapshotState(changed);
  assert.equal(remapped.sourceIdentity.sourceIdentityFingerprint, api.sourceIdentityFingerprint(remapped.sourceIdentity));
  assert.equal(remapped.recommendedAction.fingerprint, api.recommendedActionFingerprint(remapped.recommendedAction));
  assert.equal(remapped.fingerprint, api.calculateMonitoringFingerprint(remapped));
  assert.ok(remapped.timeline.every((entry) => entry.id.endsWith(api.timelineEntryFingerprint(entry).slice(8))));
});

test("monitoring never mutates its Stage 29 input", () => {
  const source = sourceFixture(); const runtime = runtimeBegun(source); const aggregate = withRuntime(source, runtime); const before = structuredClone(aggregate);
  const state = api.createMonitoring(aggregate, { id: "immutable", now: stamp(7) }).monitoring;
  api.refresh(state, aggregate, commandOptions(state, 8));
  assert.deepEqual(aggregate, before);
});

async function repositoryFixture(title = "Monitoring repository") {
  const repository = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const project = await repository.createProject({ title });
  const added = await repository.addCalculation(
    project.project_id,
    { axes: [] },
    { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] },
  );
  const calculationId = added.calculation.calculation_id;
  const source = sourceFixture({ projectId: project.project_id, calculationId });
  const result = source.progress.find((entry) => entry.kind === "PATTERN_EXECUTION_RESULT").state;
  const runtime = runtimeApi.createRuntime(source, { id: global.YarnAIProjectSystem.uuidv7(), now: stamp(2) }).runtime;
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_EXECUTION_RESULT", result);
  await repository.ensurePatternExecutionRuntime(project.project_id, calculationId, runtime);
  const created = await repository.createPatternExecutionMonitoring(project.project_id, { id: global.YarnAIProjectSystem.uuidv7(), now: stamp(6) });
  return { repository, project, calculationId, source, result, runtime, monitoring: created.rawMonitoring };
}

test("repository persists monitoring in the existing progress store and lists it by project", async () => {
  const context = await repositoryFixture();
  assert.equal(global.YarnAIProjectSystem.DB_VERSION, 4);
  assert.ok(global.YarnAIProjectSystem.STORE_NAMES.includes("progress"));
  assert.equal(global.YarnAIProjectSystem.STORE_NAMES.includes("monitoring"), false);
  const stored = await context.repository.getPatternExecutionMonitoring(context.project.project_id);
  assert.equal(stored.kind, api.PROGRESS_KIND);
  assert.equal(stored.state.lifecycle.state, "waiting");
  const listed = await context.repository.listPatternExecutionMonitoringByProject(context.project.project_id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].progress_id, stored.progress_id);
});

test("repository refresh uses optimistic concurrency", async () => {
  const context = await repositoryFixture();
  const refreshedState = await context.repository.refreshPatternExecutionMonitoring(context.project.project_id, commandOptions(context.monitoring, 8));
  assert.equal(refreshedState.rawMonitoring.lifecycle.state, "stale");
  assert.ok(refreshedState.rawMonitoring.diagnostics.some((entry) => entry.code.includes("source")));
  await assert.rejects(
    context.repository.updatePatternExecutionMonitoring(context.project.project_id, context.calculationId, refreshedState.rawMonitoring, { expectedRevision: context.monitoring.revision }),
    (error) => error.code === "PATTERN_EXECUTION_MONITORING_REVISION_CONFLICT",
  );
});

test("valid export and import preserve monitoring but mark unverifiable identity stale", async () => {
  const context = await repositoryFixture("Monitoring round trip");
  const archive = await context.repository.exportProject(context.project.project_id);
  await context.repository.softDeleteProject(context.project.project_id);
  await context.repository.permanentlyDeleteProject(context.project.project_id, { confirmed: true });
  const imported = await context.repository.importProject(archive.json);
  const aggregate = await context.repository.getProject(imported.project_id);
  const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  assert.equal(state.lifecycle.state, "stale");
  assert.ok(state.diagnostics.some((entry) => entry.code === "import_identity_unproven"));
  assert.equal(state.recommendedAction.type, "rebuild_runtime");
  assert.equal(api.validateMonitoring(state).valid, true);
});

test("collision import remaps monitoring, runtime, result, plan, session, actions, steps and checkpoints", async () => {
  const context = await repositoryFixture("Monitoring collision");
  const sourceState = structuredClone(context.monitoring);
  const imported = await context.repository.importProject((await context.repository.exportProject(context.project.project_id)).envelope);
  const aggregate = await context.repository.getProject(imported.project_id);
  const state = aggregate.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  const runtime = aggregate.progress.find((entry) => entry.kind === "PATTERN_EXECUTION_RUNTIME").state;
  assert.equal(imported.collision, true);
  assert.equal(state.projectId, imported.project_id);
  assert.notEqual(state.id, sourceState.id);
  assert.notEqual(state.sourceIdentity.runtime.id, sourceState.sourceIdentity.runtime.id);
  assert.notEqual(state.sourceIdentity.result.id, sourceState.sourceIdentity.result.id);
  assert.notEqual(state.sourceIdentity.executionPlanIdentity.id, sourceState.sourceIdentity.executionPlanIdentity.id);
  assert.notEqual(state.sourceIdentity.sessionIdentity.id, sourceState.sourceIdentity.sessionIdentity.id);
  assert.notEqual(runtime.actions[0].id, context.runtime.actions[0].id);
  assert.notEqual(state.sourceIdentity.stepIdentities[0].id, sourceState.sourceIdentity.stepIdentities[0].id);
  assert.notEqual(state.sourceIdentity.checkpointIdentities[0].id, sourceState.sourceIdentity.checkpointIdentities[0].id);
  assert.equal(state.recommendedAction.targetIdentity.projectId, imported.project_id);
  assert.equal(state.recommendedAction.targetIdentity.runtimeId, runtime.id);
  assert.equal(state.sourceIdentity.sourceIdentityFingerprint, api.sourceIdentityFingerprint(state.sourceIdentity));
  assert.equal(state.recommendedAction.fingerprint, api.recommendedActionFingerprint(state.recommendedAction));
  assert.equal(state.fingerprint, api.calculateMonitoringFingerprint(state));
});

test("corrupted imported monitoring is rejected atomically", async () => {
  const context = await repositoryFixture("Monitoring corrupt import");
  const archive = (await context.repository.exportProject(context.project.project_id)).envelope;
  const monitoring = archive.payload.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  monitoring.progressSummary.completedPercent = 101;
  archive.payload_checksum = await global.YarnAIProjectSystem.checksumPayload(archive.payload);
  await assert.rejects(context.repository.importProject(archive), (error) => error.code.startsWith("INVALID_IMPORT_EXECUTION_MONITORING"));
  const projects = await context.repository.listProjects();
  assert.equal(projects.length, 1);
});

test("implementation has no timers, network, LLM, OCR, or hidden runtime command", () => {
  const source = fs.readFileSync(path.join(__dirname, "pattern-execution-monitoring.js"), "utf8").toLowerCase();
  for (const forbidden of ["settimeout", "setinterval", "fetch(", "xmlhttprequest", "websocket", "api.openai.com", "tesseract", "ocr", "completecurrentaction", "executepatternexecutionruntimecommand"]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("new monitoring files do not name a later stage", () => {
  const files = ["pattern-execution-monitoring.js", "pattern-execution-monitoring.test.cjs"];
  const combined = files.map((name) => fs.readFileSync(path.join(__dirname, name), "utf8")).join("\n");
  const forbidden = `Stage ${30 + 1}`;
  assert.equal(combined.includes(forbidden), false);
  assert.equal(combined.toLowerCase().includes(forbidden.toLowerCase()), false);
});
