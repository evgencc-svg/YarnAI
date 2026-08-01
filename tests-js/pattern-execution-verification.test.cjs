"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
require("fake-indexeddb/auto");
const interventionApi = require("../src/yarnai/static/pattern-execution-intervention.js");
const actionApi = require("../src/yarnai/static/pattern-execution-action.js");
const evidenceApi = require("../src/yarnai/static/pattern-execution-evidence.js");
const api = require("../src/yarnai/static/pattern-execution-verification.js");
global.window = globalThis;
require("../src/yarnai/static/project-system.js");

const stamp = (second) => `2026-08-01T15:00:${String(second).padStart(2, "0")}.000Z`;
const action = Object.freeze({
  id: "action:one", projectId: "project:one", calculationId: "calculation:one",
  revision: 4, fingerprint: "fnv1a32:action01", updatedAt: stamp(4), executedAt: stamp(3),
});
const criteria = Object.freeze([
  { id: "result", label: "Result in range", required: true, evidenceTypes: ["measurement"], rule: { path: "value", operator: "range", min: 10, max: 20 } },
  { id: "note", label: "Optional note", required: false, evidenceTypes: ["note"], rule: { operator: "present" } },
]);

function evidence(id, criterionId, outcome, extra = {}) {
  return {
    id, projectId: action.projectId, actionId: action.id, actionRevision: action.revision,
    criterionId, outcome, observedAt: stamp(5), semanticIdentity: extra.semanticIdentity || id,
    ...extra,
  };
}

function completedRepositorySource(projectId, calculationId) {
  const hash = interventionApi.fingerprint;
  const runtimeFingerprint = hash({ runtime: 1, projectId });
  const monitoringFingerprint = hash({ monitoring: 1, projectId });
  const resultFingerprint = hash({ result: 1, projectId });
  const sourceIdentity = {
    sourceSchemaVersion: 1, project: { id: projectId, revision: 12 },
    calculationIdentity: { id: calculationId, revision: 2, fingerprint: hash({ calculation: 1 }) },
    result: { id: "result:verification", revision: 7, fingerprint: resultFingerprint },
    executionPlanIdentity: { id: "plan:verification", revision: 3, fingerprint: hash({ plan: 1 }) },
    sessionIdentity: { id: "session:verification", revision: 4, epoch: 1, fingerprint: hash({ session: 1 }) },
    runtime: { id: "runtime:verification", revision: 5, epoch: 2, fingerprint: runtimeFingerprint },
    runtimeSourceIdentity: { chain: { projectId, plan: { id: "plan:verification" }, session: { id: "session:verification" } } },
    progressIdentity: { id: "progress:verification", revision: 5, fingerprint: hash({ progress: 1 }) },
    completionIdentity: { id: "completion:verification", revision: 6, fingerprint: hash({ completion: 1 }) },
    stepIdentities: [], checkpointIdentities: [], importRevision: 9,
  };
  const monitoring = {
    id: "monitoring:verification", projectId, type: "PATTERN_EXECUTION_MONITORING", kind: "PATTERN_EXECUTION_MONITORING",
    revision: 8, epoch: 3, fingerprint: monitoringFingerprint, lifecycle: { state: "healthy" }, sourceIdentity,
    runtimeSummary: { lifecycle: "ready", lastConfirmedCheckpoint: null }, progressSummary: { totalSteps: 2, completedSteps: 1 },
    currentActivity: { status: "ready", actionId: null, stepId: null, checkpointId: null, safeToResume: false },
    blockers: [], warnings: [], diagnostics: [],
  };
  const runtime = {
    id: "runtime:verification", projectId, revision: 5, epoch: 2, runtimeFingerprint, status: "ready",
    activeActionId: null, actions: [], lastError: null, recovery: null, sourceIdentity: sourceIdentity.runtimeSourceIdentity,
  };
  const result = { id: "result:verification", projectId, revision: 7, resultFingerprint };
  let source = {
    projectId, calculationId, project: { project_id: projectId, revision: 12, active_calculation_id: calculationId },
    runtime, monitoring, result,
  };
  let intervention = interventionApi.buildPatternExecutionIntervention(source, { id: "intervention:verification", now: stamp(1) });
  const selected = intervention.actions.find((entry) => entry.type === "no_action");
  intervention = interventionApi.selectPatternExecutionInterventionAction(intervention, selected.id, {
    expectedRevision: intervention.revision, expectedEpoch: intervention.epoch, operationId: "verification-intervention-select",
    now: stamp(2), targetIdentity: selected.targetIdentity,
  }).intervention;
  intervention = interventionApi.confirmPatternExecutionIntervention(intervention, source, {
    expectedRevision: intervention.revision, expectedEpoch: intervention.epoch, operationId: "verification-intervention-confirm",
    now: stamp(3), actionId: intervention.selectedAction.id, targetIdentity: intervention.selectedAction.targetIdentity, confirmedBy: "user",
  }).intervention;
  source = { ...source, intervention };
  let executionAction = actionApi.buildPatternExecutionAction(source, { id: "execution-action:verification", now: stamp(4) });
  const actionCommand = (second) => ({ expectedRevision: executionAction.revision, expectedEpoch: executionAction.epoch, expectedFingerprint: executionAction.fingerprint, operationId: `verification-action:${second}`, now: stamp(second) });
  executionAction = actionApi.preparePatternExecutionAction(executionAction, source, actionCommand(5)).action;
  executionAction = actionApi.executePatternExecutionAction(executionAction, source, actionCommand(6)).action;
  executionAction = actionApi.verifyPatternExecutionAction(executionAction, source, actionCommand(7)).action;
  return { ...source, action: executionAction };
}

function evidenceCommand(snapshot, second) {
  return { expectedRevision: snapshot.revision, expectedEpoch: snapshot.epoch, expectedFingerprint: snapshot.fingerprint, operationId: `verification-evidence:${second}`, now: stamp(second) };
}

test("no action is waiting and malformed action is blocked", () => {
  assert.equal(api.evaluatePatternExecutionVerification(null, [], criteria).status, "waiting");
  assert.equal(api.evaluatePatternExecutionVerification({ id: "broken" }, [], criteria).status, "blocked");
});

test("action without evidence needs evidence", () => {
  const result = api.evaluatePatternExecutionVerification(action, [], criteria);
  assert.equal(result.status, "needs_evidence");
  assert.equal(result.criterionResults[0].outcome, "insufficient");
});

test("all required criteria confirmed verifies and optional insufficient does not block", () => {
  const result = api.evaluatePatternExecutionVerification(action, [evidence("e:1", "result", "confirmed")], criteria);
  assert.equal(result.status, "verified");
  assert.equal(result.criterionResults.find((entry) => entry.criterionId === "note").outcome, "insufficient");
});

test("required insufficient needs evidence", () => {
  assert.equal(api.evaluatePatternExecutionVerification(action, [evidence("e:note", "note", "confirmed")], criteria).status, "needs_evidence");
});

test("required disproved rejects", () => {
  const result = api.evaluatePatternExecutionVerification(action, [evidence("e:no", "result", "disproved")], criteria);
  assert.equal(result.status, "rejected");
  assert.equal(result.criterionResults.find((entry) => entry.criterionId === "result").outcome, "disproved");
});

test("opposite evidence contradicts", () => {
  const result = api.evaluatePatternExecutionVerification(action, [
    evidence("e:yes", "result", "confirmed"), evidence("e:no", "result", "disproved"),
  ], criteria);
  assert.equal(result.status, "contradicted");
  assert.equal(result.criterionResults.find((entry) => entry.criterionId === "result").outcome, "conflicting");
  assert.ok(result.contradictions.some((entry) => entry.code === "opposite_evidence"));
});

test("evidence for another action or project is not used and is diagnosed", () => {
  const wrongAction = evidence("e:wrong-action", "result", "confirmed", { actionId: "action:other" });
  const wrongProject = evidence("e:wrong-project", "result", "confirmed", { projectId: "project:other" });
  const result = api.evaluatePatternExecutionVerification(action, [wrongAction, wrongProject], criteria);
  assert.equal(result.status, "contradicted");
  assert.ok(result.diagnostics.some((entry) => entry.code === "evidence_action_mismatch"));
  assert.ok(result.diagnostics.some((entry) => entry.code === "cross_project_evidence"));
});

test("other action revision and pre-action evidence contradict", () => {
  const revision = evidence("e:revision", "result", "confirmed", { actionRevision: 3 });
  const early = evidence("e:early", "result", "confirmed", { observedAt: stamp(2) });
  const result = api.evaluatePatternExecutionVerification(action, [revision, early], criteria);
  assert.equal(result.status, "contradicted");
  assert.ok(result.contradictions.some((entry) => entry.code === "evidence_action_revision_mismatch"));
  assert.ok(result.contradictions.some((entry) => entry.code === "evidence_before_action"));
});

test("success flag cannot override an out-of-range measurement", () => {
  const result = api.evaluatePatternExecutionVerification(action, [{
    id: "e:measure", projectId: action.projectId, actionId: action.id, actionRevision: action.revision,
    criterionId: "result", type: "measurement", status: "present", success: true, value: 30,
    observedAt: stamp(5), semanticIdentity: "measure:one",
  }], criteria);
  assert.equal(result.status, "rejected");
  assert.ok(result.contradictions.some((entry) => entry.code === "success_measurement_violation"));
});

test("evidence permutation does not change deterministic result", () => {
  const values = [evidence("e:a", "result", "confirmed"), evidence("e:b", "note", "confirmed")];
  const left = api.evaluatePatternExecutionVerification(action, values, criteria);
  const right = api.evaluatePatternExecutionVerification(action, [...values].reverse(), [...criteria].reverse());
  assert.deepEqual(left, right);
});

test("semantic duplicates do not change criterion outcome", () => {
  const first = evidence("e:a", "result", "confirmed", { semanticIdentity: "same-observation" });
  const duplicate = evidence("e:b", "result", "confirmed", { semanticIdentity: "same-observation" });
  const single = api.evaluatePatternExecutionVerification(action, [first], criteria);
  const doubled = api.evaluatePatternExecutionVerification(action, [duplicate, first], criteria);
  assert.equal(single.status, doubled.status);
  assert.deepEqual(single.criterionResults, doubled.criterionResults);
  assert.ok(doubled.diagnostics.some((entry) => entry.code === "duplicate_evidence_ignored"));
});

test("opposite claims sharing one semantic identity remain conflicting", () => {
  const confirmed = evidence("e:semantic-yes", "result", "confirmed", { semanticIdentity: "observation:one" });
  const disproved = evidence("e:semantic-no", "result", "disproved", { semanticIdentity: "observation:one" });
  const result = api.evaluatePatternExecutionVerification(action, [confirmed, disproved], criteria);
  assert.equal(result.status, "contradicted");
  assert.equal(result.criterionResults.find((entry) => entry.criterionId === "result").outcome, "conflicting");
  assert.ok(result.diagnostics.some((entry) => entry.code === "semantic_identity_conflict_retained"));
});

test("damaged values return blocked instead of throwing", () => {
  const cyclic = { id: "e:cyclic" }; cyclic.self = cyclic;
  assert.doesNotThrow(() => api.evaluatePatternExecutionVerification(action, [cyclic], criteria));
  assert.equal(api.evaluatePatternExecutionVerification(action, [cyclic], criteria).status, "blocked");
});

test("terminal verified and rejected results are protected from implicit change", () => {
  for (const outcome of ["confirmed", "disproved"]) {
    let snapshot = api.buildPatternExecutionVerification({ projectId: action.projectId, calculationId: action.calculationId, action, evidence: [evidence(`e:${outcome}`, "result", outcome)], expectedCriteria: criteria }, { id: `verification:${outcome}`, now: stamp(6) });
    snapshot = api.startPatternExecutionVerification(snapshot, { expectedRevision: 1, expectedFingerprint: snapshot.fingerprint, now: stamp(7) }).verification;
    snapshot = api.completePatternExecutionVerification(snapshot, { action, evidence: [evidence(`e:${outcome}`, "result", outcome)], expectedCriteria: criteria }, { expectedRevision: 2, expectedFingerprint: snapshot.fingerprint, now: stamp(8) }).verification;
    assert.equal(snapshot.status, outcome === "confirmed" ? "verified" : "rejected");
    const repeated = api.completePatternExecutionVerification(snapshot, { action, evidence: [evidence(`e:${outcome}`, "result", outcome)], expectedCriteria: criteria }, { now: stamp(9) });
    assert.equal(repeated.changed, false); assert.deepEqual(repeated.verification, snapshot);
  }
});

test("changed action or evidence makes a saved terminal verification stale", () => {
  const values = [evidence("e:1", "result", "confirmed")];
  let snapshot = api.buildPatternExecutionVerification({ projectId: action.projectId, calculationId: action.calculationId, action, evidence: values, expectedCriteria: criteria }, { id: "verification:one", now: stamp(6) });
  snapshot = api.startPatternExecutionVerification(snapshot, { now: stamp(7) }).verification;
  snapshot = api.completePatternExecutionVerification(snapshot, { action, evidence: values, expectedCriteria: criteria }, { now: stamp(8) }).verification;
  assert.equal(api.isPatternExecutionVerificationStale(snapshot, { ...action, revision: 5 }, values, criteria), true);
  assert.equal(api.isPatternExecutionVerificationStale(snapshot, action, [...values, evidence("e:2", "note", "confirmed")], criteria), true);
  const protectedResult = api.completePatternExecutionVerification(snapshot, { action: { ...action, revision: 5 }, evidence: values, expectedCriteria: criteria });
  assert.equal(protectedResult.changed, false); assert.equal(protectedResult.effectiveStatus, "stale");
});

test("serialization round trip and explicit rebuild preserve structured result history", () => {
  const values = [evidence("e:1", "result", "confirmed")];
  let snapshot = api.buildPatternExecutionVerification({ projectId: action.projectId, calculationId: action.calculationId, action, evidence: values, expectedCriteria: criteria }, { id: "verification:one", now: stamp(6) });
  snapshot = api.startPatternExecutionVerification(snapshot, { now: stamp(7) }).verification;
  snapshot = api.completePatternExecutionVerification(snapshot, { action, evidence: values, expectedCriteria: criteria }, { now: stamp(8) }).verification;
  const restored = api.deserializePatternExecutionVerification(api.serializePatternExecutionVerification(snapshot));
  assert.deepEqual(restored, snapshot);
  const rebuilt = api.rebuildPatternExecutionVerification(snapshot, { projectId: action.projectId, calculationId: action.calculationId, action: { ...action, revision: 5 }, evidence: values, expectedCriteria: criteria }, { id: "verification:two", now: stamp(9) }).verification;
  assert.equal(rebuilt.epoch, 2); assert.equal(rebuilt.revision, 1); assert.equal(rebuilt.previousVerification.id, snapshot.id);
});

test("remap covers action, evidence and criterion evidence references", () => {
  const values = [{ id: "bundle:one", projectId: action.projectId, actionId: action.id, revision: 1, fingerprint: "fnv1a32:bundle01", evidenceItems: [evidence("item:one", "result", "confirmed")] }];
  let snapshot = api.buildPatternExecutionVerification({ projectId: action.projectId, calculationId: action.calculationId, action, evidence: values, expectedCriteria: criteria }, { id: "verification:one", now: stamp(6) });
  snapshot = api.startPatternExecutionVerification(snapshot, { now: stamp(7) }).verification;
  snapshot = api.completePatternExecutionVerification(snapshot, { action, evidence: values, expectedCriteria: criteria }, { now: stamp(8) }).verification;
  const remapped = api.remapPatternExecutionVerification(snapshot, new Map([[action.projectId, "project:two"], [action.id, "action:two"], ["bundle:one", "bundle:two"], ["item:one", "item:two"]]));
  assert.equal(remapped.projectId, "project:two"); assert.equal(remapped.actionId, "action:two");
  assert.deepEqual(remapped.evidenceIds, ["bundle:two"]);
  assert.ok(remapped.criterionResults.some((entry) => entry.supportingEvidenceIds.includes("item:two")));
  assert.equal(api.validatePatternExecutionVerification(remapped).valid, true);
});

test("read projection turns damaged references into a safe blocked state", async () => {
  const bundle = { id: "bundle:missing", revision: 1, fingerprint: "fnv1a32:bundle01" };
  const snapshot = api.buildPatternExecutionVerification({ projectId: action.projectId, calculationId: action.calculationId, action, evidence: [bundle], expectedCriteria: criteria }, { id: "verification:broken", now: stamp(6) });
  const repository = {
    async getProject() { return { project: { project_id: action.projectId, active_calculation_id: action.calculationId, title: "Broken refs" } }; },
    async getPatternExecutionAction() { return { state: action }; },
    async listPatternExecutionEvidence() { return []; },
    async getPatternExecutionVerification() { return { progress_id: "progress:verification", state: snapshot }; },
  };
  const inspected = await api.readForProject(repository, action.projectId);
  assert.equal(inspected.effectiveStatus, "blocked");
  assert.equal(inspected.brokenReferences, true);
  assert.deepEqual(inspected.availableCommands, []);
});

test("repository persists, isolates, exports, remaps and deletes verification in progress", async () => {
  const { DB_NAME, ProjectRepository, uuidv7 } = globalThis.YarnAIProjectSystem;
  await deleteDatabase(DB_NAME);
  const repository = new ProjectRepository();
  try {
    const project = await repository.createProject({ title: "Verification repository" });
    const calculation = await repository.addCalculation(project.project_id, {
      axes: ["width"], functional_category: "garment",
      width: { value: 50, unit: "cm", size_kind: "finished", direction: "nearest", gauge: { method: "ready_value", ready_count: 20, base_length: 10 } },
    }, {
      status: "READY", normalized_inputs: { width: 50 }, axes: { width: { selected_candidate: { working_count: 100 } } },
      warnings: [], errors: [], clarifications: [], canon_version: "1", specification_version: "1",
    });
    const calculationId = calculation.calculation.calculation_id;
    const source = completedRepositorySource(project.project_id, calculationId);
    await repository.ensurePatternExecutionAction(project.project_id, calculationId, source.action);

    let bundle = evidenceApi.buildPatternExecutionEvidence(source, { id: "execution-evidence:verification", now: stamp(8) });
    await repository.savePatternExecutionEvidence(project.project_id, calculationId, bundle);
    bundle = evidenceApi.collectPatternExecutionEvidence(bundle, source, evidenceCommand(bundle, 9)).evidence;
    let evidenceRecord = await repository.getPatternExecutionEvidence(project.project_id);
    await repository.savePatternExecutionEvidence(project.project_id, calculationId, bundle, { recordId: evidenceRecord.progress_id, expectedRevision: 1, expectedFingerprint: evidenceRecord.state.fingerprint });
    bundle = evidenceApi.validatePatternExecutionEvidence(bundle, source, evidenceCommand(bundle, 10)).evidence;
    evidenceRecord = await repository.getPatternExecutionEvidence(project.project_id);
    await repository.savePatternExecutionEvidence(project.project_id, calculationId, bundle, { recordId: evidenceRecord.progress_id, expectedRevision: 2, expectedFingerprint: evidenceRecord.state.fingerprint });
    bundle = evidenceApi.completePatternExecutionEvidence(bundle, source, evidenceCommand(bundle, 11)).evidence;
    evidenceRecord = await repository.getPatternExecutionEvidence(project.project_id);
    await repository.savePatternExecutionEvidence(project.project_id, calculationId, bundle, { recordId: evidenceRecord.progress_id, expectedRevision: 3, expectedFingerprint: evidenceRecord.state.fingerprint });

    const expectedCriteria = api.deriveExpectedCriteria(source.action);
    let verification = api.buildPatternExecutionVerification({ ...source, evidence: [bundle], expectedCriteria }, { id: uuidv7(), now: stamp(12) });
    let verificationRecord = await repository.savePatternExecutionVerification(project.project_id, calculationId, verification);
    verification = api.startPatternExecutionVerification(verification, { expectedRevision: 1, expectedFingerprint: verification.fingerprint, now: stamp(13) }).verification;
    verificationRecord = await repository.savePatternExecutionVerification(project.project_id, calculationId, verification, { recordId: verificationRecord.progress_id, expectedRevision: 1, expectedFingerprint: verificationRecord.state.fingerprint });
    verification = api.completePatternExecutionVerification(verification, { action: source.action, evidence: [bundle], expectedCriteria }, { expectedRevision: 2, expectedFingerprint: verification.fingerprint, now: stamp(14) }).verification;
    verificationRecord = await repository.savePatternExecutionVerification(project.project_id, calculationId, verification, { recordId: verificationRecord.progress_id, expectedRevision: 2, expectedFingerprint: verificationRecord.state.fingerprint });
    assert.equal(verification.status, "verified", JSON.stringify({ results: verification.criterionResults, contradictions: verification.contradictions, diagnostics: verification.diagnostics }));
    assert.equal((await repository.listPatternExecutionVerification(project.project_id)).length, 1);
    assert.deepEqual((await repository.getPatternExecutionVerification(project.project_id)).state, verification);
    const reopenedRepository = new ProjectRepository();
    await reopenedRepository.initialize();
    assert.deepEqual((await reopenedRepository.getPatternExecutionVerification(project.project_id)).state, verification);
    await reopenedRepository.close();

    const other = await repository.createProject({ title: "Isolated project" });
    const otherCalculation = await repository.addCalculation(other.project_id, {
      axes: ["width"], functional_category: "garment",
      width: { value: 40, unit: "cm", size_kind: "finished", direction: "nearest", gauge: { method: "ready_value", ready_count: 20, base_length: 10 } },
    }, {
      status: "READY", normalized_inputs: { width: 40 }, axes: { width: { selected_candidate: { working_count: 80 } } },
      warnings: [], errors: [], clarifications: [], canon_version: "1", specification_version: "1",
    });
    assert.deepEqual(await repository.listPatternExecutionVerification(other.project_id), []);
    const crossProject = api.remapPatternExecutionVerification(verification, new Map([[project.project_id, other.project_id], [calculationId, otherCalculation.calculation.calculation_id]]));
    await assert.rejects(
      repository.savePatternExecutionVerification(other.project_id, otherCalculation.calculation.calculation_id, crossProject),
      (error) => error.code === "PATTERN_EXECUTION_VERIFICATION_ACTION_REFERENCE_INVALID",
    );

    const exported = await repository.exportProject(project.project_id);
    const imported = await repository.importProject(exported.json);
    assert.equal(imported.collision, true);
    const importedVerification = (await repository.getPatternExecutionVerification(imported.project_id)).state;
    const importedAction = (await repository.getPatternExecutionAction(imported.project_id)).state;
    const importedEvidence = (await repository.getPatternExecutionEvidence(imported.project_id)).state;
    assert.equal(importedVerification.status, "stale");
    assert.equal(importedVerification.projectId, imported.project_id);
    assert.equal(importedVerification.actionId, importedAction.id);
    assert.deepEqual(importedVerification.evidenceIds, [importedEvidence.id]);
    const importedItemIds = new Set(importedEvidence.evidenceItems.map((item) => item.id));
    assert.ok(importedVerification.criterionResults.flatMap((entry) => [...entry.supportingEvidenceIds, ...entry.conflictingEvidenceIds]).every((id) => importedItemIds.has(id)));
    assert.notEqual(importedVerification.id, verification.id);
    assert.equal(api.validatePatternExecutionVerification(importedVerification).valid, true);

    await repository.softDeleteProject(project.project_id);
    await repository.permanentlyDeleteProject(project.project_id, { confirmed: true });
    await assert.rejects(repository.getPatternExecutionVerification(project.project_id));
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
