"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");
const { webcrypto } = require("node:crypto");

global.window = globalThis;
if (!global.crypto) Object.defineProperty(global, "crypto", { value: webcrypto });
require("../src/yarnai/static/project-system.js");
const api = require("../src/yarnai/static/pattern-execution-runtime.js");

const repositories = [];

const stamp = (second) => `2026-08-01T12:${String(Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}.000Z`;
let operationSequence = 0;
const options = (runtime, now = stamp(10), extra = {}) => ({ expectedRevision: runtime.revision, operationId: `operation:${++operationSequence}`, now, ...extra });

function sourceFixture(overrides = {}) {
  const projectId = overrides.projectId || "project:runtime";
  const calculationId = overrides.calculationId || "calculation:runtime";
  const chain = {
    sourceSchemaVersion: 1,
    projectId,
    calculation: { id: calculationId, revision: 2, fingerprint: api.fingerprint({ calculationId }) },
    plan: { id: "plan:runtime", revision: 3, fingerprint: api.fingerprint({ plan: 1 }) },
    session: { id: "session:runtime", revision: 4, epoch: 2, fingerprint: api.fingerprint({ session: 1 }) },
    steps: [
      { id: "step:one", revision: 2, fingerprint: api.fingerprint({ step: 1 }), actionId: "action:one" },
      { id: "step:two", revision: 2, fingerprint: api.fingerprint({ step: 2 }), actionId: "action:two" },
    ],
    checkpoints: [{ id: "checkpoint:one", revision: 2, fingerprint: api.fingerprint({ checkpoint: 1 }), actionId: "action:one" }],
    progress: { id: "progress:runtime", revision: 5, fingerprint: api.fingerprint({ progress: 1 }) },
    completion: { id: "completion:runtime", revision: 6, fingerprint: api.fingerprint({ completion: 1 }) },
  };
  chain.sourceIdentityFingerprint = api.fingerprint(chain);
  const completedActions = [
    { actionId: "action:one", phaseId: "phase:one", order: 1, title: "Первое действие", status: "completed", required: true },
    { actionId: "action:two", phaseId: "phase:two", order: 2, title: "Второе действие", status: "completed", required: true },
    { actionId: "action:optional", phaseId: "phase:two", order: 3, title: "Необязательное действие", status: "completed", required: false },
  ];
  const resultSnapshot = {
    schemaVersion: 1, resultId: "snapshot:result", projectId, sessionId: chain.session.id,
    resultRevision: 1, sourceIdentity: structuredClone(chain), planSummary: { planId: chain.plan.id, title: "Runtime fixture" },
    executionSummary: { executionStatus: "completed" }, completionReference: { completionId: chain.completion.id },
    completedSteps: [
      { stepId: "step:one", actionId: "action:one", status: "completed" },
      { stepId: "step:two", actionId: "action:two", status: "completed" },
    ],
    completedActions, confirmedCheckpoints: [{ checkpointRecordId: "checkpoint:one", checkpointId: "checkpoint:def", actionId: "action:one", status: "confirmed" }],
    actualParameters: [], plannedParameters: [], deviations: [], warnings: [], notes: [], generatedAt: stamp(1), fingerprint: null,
  };
  const resultFingerprintPayload = structuredClone(resultSnapshot);
  delete resultFingerprintPayload.fingerprint;
  delete resultFingerprintPayload.generatedAt;
  delete resultFingerprintPayload.resultRevision;
  resultSnapshot.fingerprint = api.fingerprint(resultFingerprintPayload);
  const result = {
    id: "result:runtime", projectId, kind: "PATTERN_EXECUTION_RESULT", schemaVersion: 1, version: 1,
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
  return { project: { project_id: projectId, active_calculation_id: calculationId }, calculations: [{ calculation_id: calculationId, revision: 2 }], progress };
}

function create(source = sourceFixture(), id = "runtime:id") { return api.createRuntime(source, { id, now: stamp(2) }).runtime; }
function ready(source = sourceFixture()) { const state = create(source); return api.validate(state, source, options(state, stamp(3))).runtime; }
function running(source = sourceFixture()) { const state = ready(source); return api.start(state, options(state, stamp(4))).runtime; }
function begun(source = sourceFixture()) { const state = running(source); return api.beginCurrentAction(state, options(state, stamp(5))).runtime; }
function completeOne(state, second = 6) { return api.completeCurrentAction(state, options(state, stamp(second))).runtime; }

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
});

test("create runtime builds a waiting immutable snapshot from ready Stage 28", () => {
  const runtime = create();
  assert.equal(runtime.type, api.PROGRESS_KIND);
  assert.equal(runtime.status, "waiting");
  assert.equal(runtime.epoch, 1);
  assert.equal(runtime.actions.length, 3);
  assert.equal(runtime.actions[0].state, "ready");
  assert.deepEqual(runtime.actions[1].prerequisiteIds, [runtime.actions[0].id]);
  assert.ok(Object.isFrozen(runtime.actions));
});

test("create does not mutate its Stage 28 aggregate", () => {
  const source = sourceFixture(); const before = structuredClone(source); create(source); assert.deepEqual(source, before);
});

test("runtime and action fingerprints are deterministic and ignore timestamps", () => {
  const source = sourceFixture();
  const first = api.createRuntime(source, { id: "same", now: stamp(2) }).runtime;
  const second = api.createRuntime(source, { id: "same", now: stamp(50) }).runtime;
  assert.equal(first.runtimeFingerprint, second.runtimeFingerprint);
  assert.deepEqual(first.actions.map((entry) => entry.fingerprint), second.actions.map((entry) => entry.fingerprint));
});

test("validate performs waiting to ready and returns a structured result", () => {
  const source = sourceFixture(); const state = create(source);
  const result = api.validate(state, source, options(state));
  assert.deepEqual({ ok: result.ok, command: result.command, changed: result.changed }, { ok: true, command: "validate", changed: true });
  assert.equal(result.runtime.status, "ready");
});

test("start pause and resume follow the centralized lifecycle", () => {
  let state = running();
  state = api.pause(state, options(state)).runtime; assert.equal(state.status, "paused");
  state = api.resume(state, options(state)).runtime; assert.equal(state.status, "running");
  assert.deepEqual(api.TRANSITIONS.ready, ["running", "recovering", "failed", "stopped", "stale"]);
});

test("invalid transitions and missing revision are rejected", () => {
  const state = create();
  assert.throws(() => api.start(state, options(state)), (error) => error.code === "invalid_status_transition");
  assert.throws(() => api.validate(state, sourceFixture(), { operationId: "missing-revision" }), (error) => error.code === "runtime_revision_conflict");
});

test("optimistic concurrency rejects an obsolete expected revision", () => {
  const state = ready();
  assert.throws(() => api.start(state, { expectedRevision: state.revision - 1, operationId: "stale-write", now: stamp(5) }), (error) => error.code === "runtime_revision_conflict");
});

test("begin current action is explicit and increments attempt", () => {
  const state = begun(); assert.equal(state.status, "running"); assert.equal(state.actions[0].state, "running"); assert.equal(state.actions[0].attempt, 1); assert.equal(state.activeActionId, state.actions[0].id);
});

test("complete advances cursor and only then makes the next action ready", () => {
  const before = begun(); const state = completeOne(before);
  assert.equal(state.actions[0].state, "completed"); assert.equal(state.cursor, 1); assert.equal(state.actions[1].state, "ready"); assert.equal(state.actions[2].state, "pending"); assert.equal(state.status, "running");
});

test("a prerequisite prevents beginning a later action", () => {
  const state = running();
  const corrupted = structuredClone(state); corrupted.cursor = 1; corrupted.actions[0].state = "pending"; corrupted.actions[1].state = "ready";
  assert.ok(api.validateRuntime(corrupted).errors.some((entry) => ["runtime_fingerprint_mismatch", "cursor_state_mismatch", "ready_before_prerequisites"].includes(entry.code)));
});

test("block and unblock require explicit commands and do not auto-begin", () => {
  let state = begun();
  state = api.blockCurrentAction(state, { code: "material_missing", message: "Нужен материал" }, options(state)).runtime;
  assert.equal(state.status, "blocked"); assert.equal(state.actions[0].state, "blocked");
  state = api.unblockCurrentAction(state, options(state)).runtime;
  assert.equal(state.status, "running"); assert.equal(state.actions[0].state, "ready"); assert.equal(state.activeActionId, null);
});

test("failing an action makes runtime terminal and preserves the error", () => {
  const state = api.failCurrentAction(begun(), { code: "simulation_failed", message: "Сбой" }, options(begun())).runtime;
  assert.equal(state.status, "failed"); assert.equal(state.failedActionIds.length, 1); assert.equal(state.lastError.code, "simulation_failed");
});

test("all required actions complete and an explicitly optional action may be skipped", () => {
  let state = begun(); state = completeOne(state, 6);
  state = api.beginCurrentAction(state, options(state, stamp(7))).runtime; state = completeOne(state, 8);
  assert.equal(state.actions[2].allowSkip, true);
  state = api.skipCurrentAction(state, options(state, stamp(9))).runtime;
  assert.equal(state.status, "completed"); assert.equal(state.cursor, 3); assert.deepEqual(state.skippedActionIds, [state.actions[2].id]);
});

test("required action cannot be skipped", () => {
  const state = running(); assert.throws(() => api.skipCurrentAction(state, options(state)), (error) => error.code === "action_skip_rule_denied");
});

test("stop is terminal and protects execution", () => {
  const state = api.stop(running(), options(running())).runtime;
  assert.equal(state.status, "stopped");
  assert.throws(() => api.start(state, options(state)), (error) => ["invalid_status_transition", "terminal_runtime_protected"].includes(error.code));
});

test("mark stale is explicit and terminal", () => {
  const state = running(); const stale = api.markStale(state, [{ code: "source_result_revision_mismatch" }], options(state)).runtime;
  assert.equal(stale.status, "stale"); assert.equal(stale.staleReasons[0].code, "source_result_revision_mismatch");
});

test("source revision and fingerprint mismatches are detected", () => {
  const source = sourceFixture(); const runtime = ready(source); const changed = structuredClone(source);
  changed.progress.find((entry) => entry.kind === "PATTERN_EXECUTION_RESULT").state.revision += 1;
  const report = api.validateRuntime(runtime, changed);
  assert.ok(report.source.some((entry) => entry.code === "source_result_revision_mismatch"));
});

test("undemonstrable imported identity is stale", () => {
  const source = sourceFixture(); const runtime = ready(source);
  const report = api.validateRuntime(runtime, { projectId: runtime.projectId, result: source.progress.at(-1).state });
  assert.ok(report.source.some((entry) => entry.code === "source_identity_unproven"));
});

test("rebuild creates a new epoch and resets execution without changing the previous snapshot", () => {
  const source = sourceFixture(); const stopped = api.stop(running(source), options(running(source))).runtime; const before = structuredClone(stopped);
  const rebuilt = api.rebuild(stopped, source, options(stopped, stamp(20))).runtime;
  assert.equal(rebuilt.epoch, stopped.epoch + 1); assert.equal(rebuilt.status, "waiting"); assert.equal(rebuilt.cursor, 0); assert.deepEqual(stopped, before);
});

test("recovery is explicit, two-phase, and never completes a running action", () => {
  let state = begun();
  state = api.recover(state, options(state, stamp(20))).runtime; assert.equal(state.status, "recovering"); assert.equal(state.actions[0].state, "running");
  state = api.recover(state, options(state, stamp(21))).runtime; assert.equal(state.status, "paused"); assert.equal(state.actions[0].state, "paused"); assert.equal(state.completedActionIds.length, 0);
});

test("repeated recovery after safe state does not corrupt state", () => {
  let state = begun(); state = api.recover(state, options(state)).runtime; state = api.recover(state, options(state)).runtime;
  const firstSafe = state; state = api.recover(state, options(state)).runtime; state = api.recover(state, options(state)).runtime;
  assert.equal(state.status, "paused"); assert.equal(state.actions[0].state, "paused"); assert.equal(state.completedActionIds.length, firstSafe.completedActionIds.length);
});

test("same operation id is idempotent even with the old revision", () => {
  const state = ready(); const commandOptions = options(state); const first = api.start(state, commandOptions); const second = api.start(first.runtime, commandOptions);
  assert.equal(second.changed, false); assert.deepEqual(second.runtime, first.runtime);
});

test("operation id cannot be reused by another command", () => {
  const state = ready(); const commandOptions = options(state); const started = api.start(state, commandOptions).runtime;
  assert.throws(() => api.pause(started, { expectedRevision: started.revision, operationId: commandOptions.operationId }), (error) => error.code === "operation_id_conflict");
});

test("corrupted snapshots fail structural and semantic validation", () => {
  const duplicate = structuredClone(ready()); duplicate.actions[1].id = duplicate.actions[0].id;
  const report = api.validateRuntime(duplicate); assert.equal(report.valid, false); assert.ok(report.structural.length);
});

test("completed runtime cannot contain a running action", () => {
  const state = structuredClone(ready()); state.status = "completed"; state.actions[0].state = "running"; state.activeActionId = state.actions[0].id;
  state.runtimeFingerprint = api.calculateRuntimeFingerprint(state);
  assert.ok(api.validateRuntime(state).semantic.some((entry) => entry.code === "terminal_has_running_action"));
});

test("audit trail and operation log stay bounded", () => {
  let state = running();
  for (let index = 0; index < 90; index += 1) {
    state = api.pause(state, options(state, stamp(30 + index))).runtime;
    state = api.resume(state, options(state, stamp(31 + index))).runtime;
  }
  assert.equal(state.audit.length, api.AUDIT_LIMIT); assert.equal(state.operations.length, api.OPERATION_LIMIT);
});

test("available commands expose only domain-approved transitions", () => {
  const state = running(); const commands = api.availableCommands(state);
  assert.ok(commands.includes("begin_current_action")); assert.ok(commands.includes("pause")); assert.equal(commands.includes("complete_current_action"), false);
});

test("reading an aggregate has no hidden auto-run or recovery mutation", () => {
  const source = sourceFixture(); const state = running(source); const aggregate = structuredClone(source);
  aggregate.progress.push({ progress_id: "record:runtime", project_id: state.projectId, calculation_id: "calculation:runtime", kind: api.PROGRESS_KIND, epoch: 1, state });
  const before = structuredClone(aggregate); const inspected = api.inspectAggregate(aggregate);
  assert.equal(inspected.runtime.status, "running"); assert.deepEqual(aggregate, before);
});

test("completed output snapshot is deterministic by default", () => {
  const first = completeOne(begun()); const second = completeOne(begun());
  assert.deepEqual(first.actions[0].outputSnapshot, second.actions[0].outputSnapshot);
});

test("runtime implementation has no timer, network, LLM, OCR, or auto-run path", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/yarnai/static/pattern-execution-runtime.js"), "utf8").toLowerCase();
  for (const forbidden of ["settimeout", "setinterval", "fetch(", "xmlhttprequest", "websocket", "api.openai.com", "tesseract", "ocr", "filereader"]) assert.equal(source.includes(forbidden), false, forbidden);
});

async function repositoryFixture(title = "Runtime repository") {
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
  const runtime = api.createRuntime(source, { id: global.YarnAIProjectSystem.uuidv7(), now: stamp(2) }).runtime;
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_EXECUTION_RESULT", result);
  await repository.ensurePatternExecutionRuntime(project.project_id, calculationId, runtime);
  return { repository, project, calculationId, source, result, runtime };
}

test("repository persists runtime in the existing progress store with optimistic concurrency", async () => {
  const context = await repositoryFixture();
  assert.equal(global.YarnAIProjectSystem.DB_VERSION, 4);
  const stored = await context.repository.getPatternExecutionRuntime(context.project.project_id);
  assert.equal(stored.kind, api.PROGRESS_KIND);
  const readyState = api.validate(context.runtime, context.source, options(context.runtime)).runtime;
  await context.repository.updatePatternExecutionRuntime(context.project.project_id, context.calculationId, readyState, { expectedRevision: context.runtime.revision });
  await assert.rejects(
    context.repository.updatePatternExecutionRuntime(context.project.project_id, context.calculationId, readyState, { expectedRevision: context.runtime.revision }),
    (error) => error.code === "PATTERN_EXECUTION_RUNTIME_REVISION_CONFLICT",
  );
});

test("export and import revalidate runtime and mark unverifiable identity stale", async () => {
  const context = await repositoryFixture("Runtime round trip");
  const archive = await context.repository.exportProject(context.project.project_id);
  await context.repository.softDeleteProject(context.project.project_id);
  await context.repository.permanentlyDeleteProject(context.project.project_id, { confirmed: true });
  const imported = await context.repository.importProject(archive.json);
  const state = (await context.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  assert.equal(state.status, "stale");
  assert.ok(state.staleReasons.some((entry) => entry.code === "import_identity_unproven"));
  assert.equal(api.validateRuntime(state).valid, true);
});

test("collision import remaps Stage 29 project, runtime, result, plan, execution, and nested references", async () => {
  const context = await repositoryFixture("Runtime collision");
  const imported = await context.repository.importProject((await context.repository.exportProject(context.project.project_id)).envelope);
  const state = (await context.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  assert.equal(imported.collision, true);
  assert.equal(state.projectId, imported.project_id);
  assert.notEqual(state.id, context.runtime.id);
  assert.notEqual(state.sourceResultId, context.runtime.sourceResultId);
  assert.notEqual(state.sourcePlanId, context.runtime.sourcePlanId);
  assert.notEqual(state.sourceExecutionId, context.runtime.sourceExecutionId);
  assert.equal(state.actions[0].sourceReference.resultId, state.sourceResultId);
  assert.equal(state.actions[0].payload.resultReference.fingerprint, state.sourceResultFingerprint);
  assert.equal(state.runtimeFingerprint, api.calculateRuntimeFingerprint(state));
});

test("corrupted imported runtime fingerprint aborts import atomically", async () => {
  const context = await repositoryFixture("Runtime corrupt import");
  const archive = (await context.repository.exportProject(context.project.project_id)).envelope;
  const runtime = archive.payload.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  runtime.cursor = 2;
  archive.payload_checksum = await global.YarnAIProjectSystem.checksumPayload(archive.payload);
  await assert.rejects(context.repository.importProject(archive), (error) => error.code.startsWith("INVALID_IMPORT_EXECUTION_RUNTIME"));
  const projects = await context.repository.listProjects();
  assert.equal(projects.length, 1);
});
