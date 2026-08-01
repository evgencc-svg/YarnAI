"use strict";

const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
require("fake-indexeddb/auto");

const interventionApi = require("../src/yarnai/static/pattern-execution-intervention.js");
const actionApi = require("../src/yarnai/static/pattern-execution-action.js");
const api = require("../src/yarnai/static/pattern-execution-evidence.js");
global.window = globalThis;
require("../src/yarnai/static/project-system.js");

const stamp = (second) => `2026-08-01T14:00:${String(second).padStart(2, "0")}.000Z`;
let operation = 0;
const command = (snapshot, second, extra = {}) => ({
  expectedRevision: snapshot.revision, expectedEpoch: snapshot.epoch,
  expectedFingerprint: snapshot.fingerprint, operationId: `evidence-operation:${++operation}`,
  now: stamp(second), ...extra,
});

function completedSource(overrides = {}) {
  const projectId = overrides.projectId || "project:evidence";
  const calculationId = overrides.calculationId || "calculation:one";
  const fingerprint = interventionApi.fingerprint;
  const runtimeFingerprint = fingerprint({ runtime: 1, projectId });
  const monitoringFingerprint = fingerprint({ monitoring: 1, projectId });
  const resultFingerprint = fingerprint({ result: 1, projectId });
  const sourceIdentity = {
    sourceSchemaVersion: 1, project: { id: projectId, revision: 12 },
    calculationIdentity: { id: calculationId, revision: 2, fingerprint: fingerprint({ calculation: 1 }) },
    result: { id: "result:one", revision: 7, fingerprint: resultFingerprint },
    executionPlanIdentity: { id: "plan:one", revision: 3, fingerprint: fingerprint({ plan: 1 }) },
    sessionIdentity: { id: "session:one", revision: 4, epoch: 1, fingerprint: fingerprint({ session: 1 }) },
    runtime: { id: "runtime:one", revision: 5, epoch: 2, fingerprint: runtimeFingerprint },
    runtimeSourceIdentity: { chain: { projectId, plan: { id: "plan:one" }, session: { id: "session:one" } } },
    progressIdentity: { id: "progress:one", revision: 5, fingerprint: fingerprint({ progress: 1 }) },
    completionIdentity: { id: "completion:one", revision: 6, fingerprint: fingerprint({ completion: 1 }) },
    stepIdentities: [], checkpointIdentities: [], importRevision: 9,
  };
  const monitoring = {
    id: "monitoring:one", projectId, type: "PATTERN_EXECUTION_MONITORING", kind: "PATTERN_EXECUTION_MONITORING",
    revision: 8, epoch: 3, fingerprint: monitoringFingerprint, lifecycle: { state: "healthy" }, sourceIdentity,
    runtimeSummary: { lifecycle: "ready", lastConfirmedCheckpoint: null }, progressSummary: { totalSteps: 2, completedSteps: 1 },
    currentActivity: { status: "ready", actionId: null, stepId: null, checkpointId: null, safeToResume: false },
    blockers: [], warnings: [], diagnostics: [],
  };
  const runtime = {
    id: "runtime:one", projectId, revision: 5, epoch: 2, runtimeFingerprint, status: "ready",
    activeActionId: null, actions: [], lastError: null, recovery: null, sourceIdentity: sourceIdentity.runtimeSourceIdentity,
  };
  const result = { id: "result:one", projectId, revision: 7, resultFingerprint };
  let source = {
    projectId, calculationId,
    project: { project_id: projectId, revision: 12, active_calculation_id: calculationId },
    runtime, monitoring, result,
  };
  let intervention = interventionApi.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) });
  const selected = intervention.actions.find((entry) => entry.type === "no_action");
  intervention = interventionApi.selectPatternExecutionInterventionAction(intervention, selected.id, {
    expectedRevision: intervention.revision, expectedEpoch: intervention.epoch,
    operationId: "intervention-select", now: stamp(2), targetIdentity: selected.targetIdentity,
  }).intervention;
  intervention = interventionApi.confirmPatternExecutionIntervention(intervention, source, {
    expectedRevision: intervention.revision, expectedEpoch: intervention.epoch,
    operationId: "intervention-confirm", now: stamp(3), actionId: intervention.selectedAction.id,
    targetIdentity: intervention.selectedAction.targetIdentity, confirmedBy: "user",
  }).intervention;
  source = { ...source, intervention };
  let action = actionApi.buildPatternExecutionAction(source, { id: "execution-action:one", now: stamp(4) });
  action = actionApi.preparePatternExecutionAction(action, source, actionCommand(action, 5)).action;
  action = actionApi.executePatternExecutionAction(action, source, actionCommand(action, 6)).action;
  action = actionApi.verifyPatternExecutionAction(action, source, actionCommand(action, 7)).action;
  return { ...source, action };
}

function actionCommand(snapshot, second) {
  return { expectedRevision: snapshot.revision, expectedEpoch: snapshot.epoch, expectedFingerprint: snapshot.fingerprint, operationId: `action:${second}`, now: stamp(second) };
}

function collected(source = completedSource()) {
  const waiting = api.buildPatternExecutionEvidence(source, { now: stamp(8) });
  return api.collectPatternExecutionEvidence(waiting, source, command(waiting, 9)).evidence;
}

function ready(source = completedSource()) {
  const collectingDone = collected(source);
  return api.validatePatternExecutionEvidence(collectingDone, source, command(collectingDone, 10)).evidence;
}

beforeEach(() => { operation = 0; });

test("creates immutable waiting evidence without collecting", () => {
  const evidence = api.buildPatternExecutionEvidence(completedSource(), { now: stamp(8) });
  assert.equal(evidence.lifecycle, "waiting"); assert.equal(evidence.evidenceItems.length, 0);
  assert.equal(evidence.collectedAt, null); assert.ok(Object.isFrozen(evidence));
});

test("collect accepts only completed verified action and never invokes an adapter", () => {
  const source = completedSource();
  let adapterCalls = 0;
  globalThis.YarnAIPatternExecutionRuntime = { resume() { adapterCalls += 1; throw new Error("must not run"); } };
  const evidence = collected(source);
  assert.equal(evidence.lifecycle, "validating"); assert.equal(adapterCalls, 0);
  assert.equal(source.action.currentAttempt.runtimeActionExecuted, true);
  assert.deepEqual(evidence.evidenceItems.map((item) => item.type), api.EVIDENCE_TYPES);
});

test("invalid and stale actions terminate collection safely", () => {
  const source = completedSource();
  const invalid = structuredClone(source); invalid.action.lifecycle = "failed"; invalid.action.fingerprint = actionApi.fingerprintPatternExecutionAction(invalid.action);
  const invalidWaiting = api.buildPatternExecutionEvidence(invalid, { now: stamp(8) });
  assert.equal(api.collectPatternExecutionEvidence(invalidWaiting, invalid, command(invalidWaiting, 9)).evidence.lifecycle, "blocked");
  const staleSource = structuredClone(source); staleSource.action.importedDiagnostic = { reason: "import" }; staleSource.action.fingerprint = actionApi.fingerprintPatternExecutionAction(staleSource.action);
  const staleWaiting = api.buildPatternExecutionEvidence(staleSource, { now: stamp(8) });
  assert.equal(api.collectPatternExecutionEvidence(staleWaiting, staleSource, command(staleWaiting, 9)).evidence.lifecycle, "stale");
});

test("fingerprints and evidence order are deterministic across serialization", () => {
  const evidence = collected();
  assert.equal(evidence.fingerprint, api.fingerprintPatternExecutionEvidence(evidence));
  const parsed = api.deserializePatternExecutionEvidence(api.serializePatternExecutionEvidence(evidence), { source: completedSource() });
  assert.equal(parsed.fingerprint, evidence.fingerprint);
  assert.deepEqual(parsed.evidenceItems.map((item) => item.type), api.EVIDENCE_TYPES);
});

test("structural validation rejects duplicate items, dynamic values and tampering", () => {
  const evidence = structuredClone(collected());
  evidence.evidenceItems.push(structuredClone(evidence.evidenceItems[0]));
  evidence.fingerprint = api.fingerprintPatternExecutionEvidence(evidence);
  assert.ok(api.validatePatternExecutionEvidenceSnapshot(evidence).structural.some((entry) => entry.code === "evidence_item_id_duplicate"));
  assert.throws(() => api.canonicalize({ bad() {} }), (error) => error.code === "unsupported_evidence_value");
});

test("semantic contradiction fails and missing mandatory evidence blocks", () => {
  const source = completedSource();
  let contradiction = structuredClone(collected(source));
  const boundary = contradiction.evidenceItems.find((item) => item.type === "SIDE_EFFECT_BOUNDARY");
  boundary.status = "contradictory"; boundary.observedValue.unexpectedSideEffects = [{ code: "outside_target" }];
  boundary.fingerprint = api.fingerprintEvidenceItem(boundary); contradiction.fingerprint = api.fingerprintPatternExecutionEvidence(contradiction);
  contradiction = api.validatePatternExecutionEvidence(contradiction, source, command(contradiction, 10)).evidence;
  assert.equal(contradiction.lifecycle, "failed"); assert.ok(contradiction.unexpectedChanges.length);
  let missing = structuredClone(collected(source));
  const audit = missing.evidenceItems.find((item) => item.type === "AUDIT_PROOF"); audit.status = "missing"; audit.fingerprint = api.fingerprintEvidenceItem(audit); missing.fingerprint = api.fingerprintPatternExecutionEvidence(missing);
  missing = api.validatePatternExecutionEvidence(missing, source, command(missing, 10)).evidence;
  assert.equal(missing.lifecycle, "blocked"); assert.ok(missing.assertions.some((entry) => entry.status === "unknown" || entry.status === "failed"));
});

test("changed source after collect is stale and unknown is never passed", () => {
  const source = completedSource(); const evidence = collected(source); const changed = structuredClone(source);
  changed.monitoring.fingerprint = interventionApi.fingerprint({ changed: true });
  const result = api.validatePatternExecutionEvidence(evidence, changed, command(evidence, 10)).evidence;
  assert.equal(result.lifecycle, "stale");
  assert.ok(result.assertions.find((entry) => entry.type === "SOURCE_CHAIN_MATCHED").status !== "passed");
});

test("complete is ready-only and repeated complete is exactly idempotent", () => {
  const source = completedSource(); const validating = collected(source);
  assert.throws(() => api.completePatternExecutionEvidence(validating, source, command(validating, 10)), (error) => error.code === "complete_not_allowed");
  const prepared = api.validatePatternExecutionEvidence(validating, source, command(validating, 10)).evidence;
  assert.equal(prepared.lifecycle, "ready");
  const completed = api.completePatternExecutionEvidence(prepared, source, command(prepared, 11)).evidence;
  const repeated = api.completePatternExecutionEvidence(completed, source, { ...command(completed, 12), operationId: completed.operations.at(-1).operationId });
  assert.equal(completed.lifecycle, "completed"); assert.equal(repeated.changed, false); assert.deepEqual(repeated.evidence, completed);
});

test("terminal commands do not mutate and optimistic conflicts are enforced", () => {
  const source = completedSource(); const completed = api.completePatternExecutionEvidence(ready(source), source, command(ready(source), 11));
  assert.equal(api.collectPatternExecutionEvidence(completed.evidence, source, command(completed.evidence, 12)).changed, false);
  const waiting = api.buildPatternExecutionEvidence(source, { now: stamp(8) });
  assert.throws(() => api.collectPatternExecutionEvidence(waiting, source, { ...command(waiting, 9), expectedRevision: 99 }), (error) => error.code === "evidence_revision_conflict");
});

test("retry preserves the failed attempt and rebuild creates a new evidence epoch without action execution", () => {
  const source = completedSource(); let failed = structuredClone(collected(source));
  const boundary = failed.evidenceItems.find((item) => item.type === "SIDE_EFFECT_BOUNDARY"); boundary.status = "contradictory"; boundary.fingerprint = api.fingerprintEvidenceItem(boundary); failed.fingerprint = api.fingerprintPatternExecutionEvidence(failed);
  failed = api.validatePatternExecutionEvidence(failed, source, command(failed, 10)).evidence;
  const actionBefore = structuredClone(source.action);
  const retried = api.retryPatternExecutionEvidence(failed, source, command(failed, 11));
  assert.equal(retried.evidence.evidenceAttemptOrdinal, 2); assert.notEqual(retried.evidence.id, failed.id); assert.deepEqual(retried.previousEvidence, failed);
  const rebuilt = api.rebuildPatternExecutionEvidence(failed, source, command(failed, 12));
  assert.equal(rebuilt.evidence.evidenceEpoch, failed.evidenceEpoch + 1); assert.deepEqual(source.action, actionBefore);
});

test("import tampering, unsafe identity and collision remap are safe", () => {
  const source = completedSource(); const evidence = ready(source); const damaged = JSON.parse(api.serializePatternExecutionEvidence(evidence));
  damaged.actionId = "action:tampered";
  assert.throws(() => api.deserializePatternExecutionEvidence(damaged), (error) => error.code === "corrupted_evidence_snapshot");
  const stale = api.deserializePatternExecutionEvidence(api.serializePatternExecutionEvidence(evidence), { allowUnprovenIdentity: true, now: stamp(12) });
  assert.equal(stale.lifecycle, "stale"); assert.notEqual(stale.validationStatus, "successful");
  const firstItem = evidence.evidenceItems[0];
  const remapped = api.remapPatternExecutionEvidence(evidence, new Map([
    [evidence.projectId, "project:remapped"], [evidence.id, "evidence:remapped"], [evidence.actionId, "action:remapped"],
    [evidence.actionAttemptId, "attempt:remapped"], [firstItem.id, "item:remapped"],
  ]));
  assert.equal(remapped.projectId, "project:remapped"); assert.equal(remapped.evidenceItems[0].id, "item:remapped");
  assert.ok(remapped.assertions.some((assertion) => assertion.evidenceItemIds.includes("item:remapped")));
  assert.equal(remapped.fingerprint, api.fingerprintPatternExecutionEvidence(remapped));
});

test("audit is bounded and source files contain no prohibited dynamic constructs or later stage", () => {
  const evidence = collected(); assert.ok(evidence.audit.length <= api.AUDIT_LIMIT);
  const text = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-execution-evidence.js"), "utf8");
  assert.ok(!/\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(|import\s*\(/.test(text));
  assert.ok(!text.includes(`Stage ${30 + 4}`));
});

test("repository list/get/save enforces optimistic revision and fallback collision import is stale", async () => {
  const { DB_NAME, ProjectRepository } = globalThis.YarnAIProjectSystem;
  await deleteDatabase(DB_NAME);
  const repository = new ProjectRepository();
  try {
    const project = await repository.createProject({ title: "Evidence repository" });
    const calculation = await repository.addCalculation(project.project_id, {
      axes: ["width"], functional_category: "garment",
      width: { value: 50, unit: "cm", size_kind: "finished", direction: "nearest", gauge: { method: "ready_value", ready_count: 20, base_length: 10 } },
    }, {
      status: "READY", normalized_inputs: { width: 50 }, axes: { width: { selected_candidate: { working_count: 100 } } },
      warnings: [], errors: [], clarifications: [], canon_version: "1", specification_version: "1",
    });
    const source = completedSource({ projectId: project.project_id, calculationId: calculation.calculation.calculation_id });
    const waiting = api.buildPatternExecutionEvidence(source, { now: stamp(8) });
    const saved = await repository.savePatternExecutionEvidence(project.project_id, source.calculationId, waiting);
    assert.equal((await repository.listPatternExecutionEvidence(project.project_id)).length, 1);
    assert.equal((await repository.getPatternExecutionEvidence(project.project_id, waiting.id)).state.id, waiting.id);
    const collectedState = api.collectPatternExecutionEvidence(waiting, source, command(waiting, 9)).evidence;
    await repository.savePatternExecutionEvidence(project.project_id, source.calculationId, collectedState, {
      recordId: saved.progress_id, expectedRevision: waiting.revision, expectedFingerprint: waiting.fingerprint,
    });
    await assert.rejects(repository.savePatternExecutionEvidence(project.project_id, source.calculationId, collectedState, {
      recordId: saved.progress_id, expectedRevision: waiting.revision, expectedFingerprint: waiting.fingerprint,
    }), (error) => error.code === "PATTERN_EXECUTION_EVIDENCE_REVISION_CONFLICT");

    const exported = await repository.exportProject(project.project_id);
    const savedApi = globalThis.YarnAIPatternExecutionEvidence;
    delete globalThis.YarnAIPatternExecutionEvidence;
    let imported;
    try { imported = await repository.importProject(exported.json); }
    finally { globalThis.YarnAIPatternExecutionEvidence = savedApi; }
    const importedEvidence = await repository.getPatternExecutionEvidence(imported.project_id);
    assert.equal(imported.collision, true); assert.equal(importedEvidence.state.lifecycle, "stale");
    assert.equal(importedEvidence.state.validationStatus, "stale");
    assert.equal(importedEvidence.state.projectId, imported.project_id);
    assert.equal(importedEvidence.state.fingerprint, api.fingerprintPatternExecutionEvidence(importedEvidence.state));
  } finally {
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
