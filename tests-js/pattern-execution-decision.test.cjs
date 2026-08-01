"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
require("fake-indexeddb/auto");
const interventionApi = require("../src/yarnai/static/pattern-execution-intervention.js");
const actionApi = require("../src/yarnai/static/pattern-execution-action.js");
const evidenceApi = require("../src/yarnai/static/pattern-execution-evidence.js");
const verificationApi = require("../src/yarnai/static/pattern-execution-verification.js");
global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const api = require("../src/yarnai/static/pattern-execution-decision.js");
const followUpApi = require("../src/yarnai/static/pattern-execution-follow-up.js");

const stamp = (second) => `2026-08-01T16:00:${String(second).padStart(2, "0")}.000Z`;

function source(status = "verified", overrides = {}) {
  const projectId = overrides.projectId || "project:one";
  const calculationId = overrides.calculationId || "calculation:one";
  const action = {
    id: "action:one", projectId, calculationId, revision: 4,
    fingerprint: "fnv1a32:action0001", updatedAt: stamp(4),
    sourceIdentity: {
      executionPlanIdentity: { id: "plan:one", revision: 2, fingerprint: "fnv1a32:plan0001" },
      sessionIdentity: { id: "session:one", revision: 3, fingerprint: "fnv1a32:session1" },
    },
  };
  const evidence = [{
    id: "evidence:bundle", projectId, actionId: action.id, revision: 2,
    fingerprint: "fnv1a32:evidence1", lifecycle: "completed", updatedAt: stamp(5),
    evidenceItems: [
      { id: "evidence:item:a", fingerprint: "fnv1a32:item0001", status: "present" },
      { id: "evidence:item:b", fingerprint: "fnv1a32:item0002", status: "present" },
    ],
  }];
  const verification = {
    id: "verification:one", kind: "PATTERN_EXECUTION_VERIFICATION", type: "PATTERN_EXECUTION_VERIFICATION",
    projectId, calculationId, actionId: action.id, actionRevision: action.revision,
    actionFingerprint: action.fingerprint, evidenceIds: [evidence[0].id], status,
    revision: 3, epoch: 1, fingerprint: `fnv1a32:verification-${status}`,
    expectedCriteria: [{ id: "criterion:a" }, { id: "criterion:b" }],
    criterionResults: [
      { criterionId: "criterion:a", supportingEvidenceIds: ["evidence:item:a"], conflictingEvidenceIds: [] },
      { criterionId: "criterion:b", supportingEvidenceIds: ["evidence:item:b"], conflictingEvidenceIds: [] },
    ],
    updatedAt: stamp(6),
  };
  return { projectId, calculationId, project: { project_id: projectId, active_calculation_id: calculationId, updated_at: stamp(6) }, action, evidence, verification, ...overrides };
}

function build(status = "verified", overrides = {}) {
  const current = source(status, overrides);
  return { current, snapshot: api.buildPatternExecutionDecision(current, { id: overrides.id || "decision:one", now: stamp(7) }) };
}

function command(snapshot, outcome, reasonCode, overrides = {}) {
  return {
    outcome, reasonCode, explanation: "  Explicit explanation\u0000  ", requiredFollowUp: { targetId: "action:one" },
    selectedCriterionIds: ["criterion:b", "criterion:a", "criterion:a"],
    selectedEvidenceIds: ["evidence:item:b", "evidence:item:a", "evidence:item:a"],
    expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint, now: stamp(8), ...overrides,
  };
}

test("creates a separate ready immutable-style decision snapshot", () => {
  const { snapshot } = build();
  assert.equal(snapshot.kind, "PATTERN_EXECUTION_DECISION");
  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.decision.outcome, "pending");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(api.validatePatternExecutionDecision(snapshot).valid, true);
});

test("ready is derived from a current reviewable verification", () => {
  for (const status of ["verified", "needs_evidence", "contradicted", "rejected"]) assert.equal(build(status).snapshot.status, "ready");
});

test("recommendation maps verified to accepted", () => assert.equal(build("verified").snapshot.recommendation, "accepted"));
test("recommendation maps needs_evidence to more_evidence_required", () => assert.equal(build("needs_evidence").snapshot.recommendation, "more_evidence_required"));

test("accepted requires an explicit command for verified", () => {
  const { current, snapshot } = build("verified");
  const accepted = api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted"));
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.decision.outcome, "accepted");
  assert.equal(accepted.decision.explanation, "Explicit explanation");
});

for (const status of ["needs_evidence", "contradicted"]) {
  test(`accepted is forbidden for ${status}`, () => {
    const { current, snapshot } = build(status);
    assert.throws(() => api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted")), (error) => error.code === "unsupported_outcome");
  });
}

test("correction_required is explicit and supported", () => {
  const { current, snapshot } = build("contradicted");
  assert.equal(api.decidePatternExecution(snapshot, current, command(snapshot, "correction_required", "action_correction_required")).status, "correction_required");
});

test("more_evidence_required is explicit and supported", () => {
  const { current, snapshot } = build("needs_evidence");
  assert.equal(api.decidePatternExecution(snapshot, current, command(snapshot, "more_evidence_required", "insufficient_evidence")).status, "more_evidence_required");
});

test("rejected is explicit and supported", () => {
  const { current, snapshot } = build("rejected");
  assert.equal(api.decidePatternExecution(snapshot, current, command(snapshot, "rejected", "verification_rejected")).status, "rejected");
});

test("missing or corrupted verification projects to blocked", () => {
  const { snapshot } = build();
  assert.equal(api.projectPatternExecutionDecision(snapshot, source("verified", { verification: null })).effectiveStatus, "blocked");
  assert.equal(api.projectPatternExecutionDecision(snapshot, source("verified", { verification: { id: "broken" } })).effectiveStatus, "blocked");
});

test("cross-project reference projects to blocked", () => {
  const { snapshot, current } = build();
  const foreign = { ...current, projectId: "project:other", project: { project_id: "project:other" } };
  const projected = api.projectPatternExecutionDecision(snapshot, foreign);
  assert.equal(projected.effectiveStatus, "blocked");
  assert.equal(projected.reasonCode, "cross_project_reference");
});

test("changed verification revision projects to stale", () => {
  const { snapshot, current } = build();
  assert.equal(api.projectPatternExecutionDecision(snapshot, { ...current, verification: { ...current.verification, revision: 4 } }).effectiveStatus, "stale");
});

test("changed verification fingerprint projects to stale", () => {
  const { snapshot, current } = build();
  assert.equal(api.projectPatternExecutionDecision(snapshot, { ...current, verification: { ...current.verification, fingerprint: "fnv1a32:changed" } }).effectiveStatus, "stale");
});

for (const [outcome, reasonCode] of [["accepted", "verification_accepted"], ["rejected", "verification_rejected"]]) {
  test(`terminal ${outcome} cannot be changed implicitly`, () => {
    const { current, snapshot } = build(outcome === "accepted" ? "verified" : "rejected");
    const terminal = api.decidePatternExecution(snapshot, current, command(snapshot, outcome, reasonCode));
    assert.throws(() => api.updatePatternExecutionDecision(terminal, { status: "ready" }, current, { expectedRevision: terminal.revision, expectedFingerprint: terminal.fingerprint }), (error) => error.code === "terminal_decision");
    assert.throws(() => api.decidePatternExecution(terminal, current, command(terminal, "correction_required", "action_correction_required")), (error) => error.code === "terminal_decision");
  });
}

test("rebuild creates a new identity, epoch, and previousDecisionId", () => {
  const { current, snapshot } = build();
  const rebuilt = api.rebuildPatternExecutionDecision(snapshot, current, { id: "decision:two", expectedRevision: 1, expectedFingerprint: snapshot.fingerprint, now: stamp(9) }).decision;
  assert.equal(rebuilt.id, "decision:two");
  assert.equal(rebuilt.epoch, 2);
  assert.equal(rebuilt.previousDecisionId, snapshot.id);
  assert.equal(snapshot.previousDecisionId, null);
});

test("optimistic revision conflict is rejected", () => {
  const { current, snapshot } = build();
  assert.throws(() => api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted", { expectedRevision: 99 })), (error) => error.code === "decision_revision_conflict");
});

test("optimistic fingerprint conflict is rejected", () => {
  const { current, snapshot } = build();
  assert.throws(() => api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted", { expectedFingerprint: "fnv1a32:wrong" })), (error) => error.code === "decision_fingerprint_conflict");
});

test("selected IDs are normalized and deduplicated", () => {
  const { current, snapshot } = build();
  const decided = api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted"));
  assert.deepEqual(decided.decision.selectedCriterionIds, ["criterion:a", "criterion:b"]);
  assert.deepEqual(decided.decision.selectedEvidenceIds, ["evidence:item:a", "evidence:item:b"]);
});

test("selected ID order does not affect the fingerprint", () => {
  const left = build(); const right = build();
  const a = api.decidePatternExecution(left.snapshot, left.current, command(left.snapshot, "accepted", "verification_accepted"));
  const b = api.decidePatternExecution(right.snapshot, right.current, command(right.snapshot, "accepted", "verification_accepted", { selectedCriterionIds: ["criterion:a", "criterion:b"], selectedEvidenceIds: ["evidence:item:a", "evidence:item:b"] }));
  assert.equal(a.fingerprint, b.fingerprint);
});

test("invalid selected criterion is rejected", () => {
  const { current, snapshot } = build();
  assert.throws(() => api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted", { selectedCriterionIds: ["criterion:foreign"] })), (error) => error.code === "invalid_reference");
});

test("invalid selected evidence is rejected", () => {
  const { current, snapshot } = build();
  assert.throws(() => api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted", { selectedEvidenceIds: ["evidence:foreign"] })), (error) => error.code === "invalid_reference");
});

test("serialization round trip preserves the decision", () => {
  const { snapshot } = build();
  assert.deepEqual(api.deserializePatternExecutionDecision(api.serializePatternExecutionDecision(snapshot)), snapshot);
});

test("collision remap covers all supporting and selected references", () => {
  const { current, snapshot } = build();
  const decided = api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted"));
  const remapped = api.remapPatternExecutionDecision(decided, new Map([
    ["project:one", "project:two"], ["calculation:one", "calculation:two"], ["decision:one", "decision:two"],
    ["plan:one", "plan:two"], ["session:one", "session:two"], ["action:one", "action:two"],
    ["verification:one", "verification:two"], ["criterion:a", "criterion:x"], ["evidence:item:a", "evidence:item:x"],
  ]));
  assert.equal(remapped.projectId, "project:two");
  assert.equal(remapped.executionPlanId, "plan:two");
  assert.equal(remapped.sessionId, "session:two");
  assert.equal(remapped.verificationId, "verification:two");
  assert.ok(remapped.decision.selectedCriterionIds.includes("criterion:x"));
  assert.ok(remapped.decision.selectedEvidenceIds.includes("evidence:item:x"));
  assert.equal(api.validatePatternExecutionDecision(remapped).valid, true);
});

test("import downgrade is stale and keeps historical terminal metadata", () => {
  const { current, snapshot } = build();
  const accepted = api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted"));
  const stale = api.makeImportedPatternExecutionDecisionStale(accepted, { now: stamp(9), collision: true });
  assert.equal(stale.status, "stale");
  assert.equal(stale.decision.outcome, "stale");
  assert.equal(stale.importedDiagnostic.previousOutcome, "accepted");
});

test("read wrapper reloads a saved decision without executing prerequisites", async () => {
  const { current, snapshot } = build();
  const calls = [];
  const repository = {
    async getProject() { calls.push("project"); return { project: current.project }; },
    async listPatternExecutionVerification() { calls.push("verification"); return [{ state: current.verification }]; },
    async getPatternExecutionAction() { calls.push("action"); return { state: current.action }; },
    async listPatternExecutionEvidence() { calls.push("evidence"); return current.evidence.map((state) => ({ state })); },
    async getPatternExecutionDecision() { calls.push("decision"); return { progress_id: "progress:decision", state: snapshot }; },
  };
  const inspected = await api.readForProject(repository, current.projectId);
  assert.equal(inspected.effectiveStatus, "ready");
  assert.deepEqual(calls, ["project", "verification", "action", "evidence", "decision"]);
});

test("project isolation rejects foreign source", () => {
  const { snapshot, current } = build();
  const foreignVerification = { ...current.verification, projectId: "project:other" };
  assert.equal(api.projectPatternExecutionDecision(snapshot, { ...current, verification: foreignVerification }).effectiveStatus, "blocked");
});

test("deletion cleanup is delegated to project-scoped progress storage", () => {
  assert.equal(api.PROGRESS_KIND, "PATTERN_EXECUTION_DECISION");
  assert.equal(api.PROGRESS_KIND.startsWith("PATTERN_EXECUTION_"), true);
});

test("input objects are not mutated", () => {
  const current = source(); const before = structuredClone(current);
  const snapshot = api.buildPatternExecutionDecision(current, { id: "decision:one", now: stamp(7) });
  api.decidePatternExecution(snapshot, current, command(snapshot, "accepted", "verification_accepted"));
  assert.deepEqual(current, before);
});

test("decision code never executes action, creates evidence, or mutates verification", () => {
  const code = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-execution-decision.js"), "utf8");
  assert.doesNotMatch(code, /executePatternExecutionAction|collectPatternExecutionEvidence|completePatternExecutionVerification/);
});

test("domain result has no random or internal-current-time dependency", () => {
  const code = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-execution-decision.js"), "utf8");
  assert.doesNotMatch(code, /Math\.random|Date\.now|new Date\s*\(/);
});

function completedRepositorySource(projectId, calculationId) {
  const hash = interventionApi.fingerprint;
  const runtimeFingerprint = hash({ runtime: 1, projectId });
  const monitoringFingerprint = hash({ monitoring: 1, projectId });
  const resultFingerprint = hash({ result: 1, projectId });
  const sourceIdentity = {
    sourceSchemaVersion: 1, project: { id: projectId, revision: 12 },
    calculationIdentity: { id: calculationId, revision: 2, fingerprint: hash({ calculation: 1 }) },
    result: { id: "result:decision", revision: 7, fingerprint: resultFingerprint },
    executionPlanIdentity: { id: "plan:decision", revision: 3, fingerprint: hash({ plan: 1 }) },
    sessionIdentity: { id: "session:decision", revision: 4, epoch: 1, fingerprint: hash({ session: 1 }) },
    runtime: { id: "runtime:decision", revision: 5, epoch: 2, fingerprint: runtimeFingerprint },
    runtimeSourceIdentity: { chain: { projectId, plan: { id: "plan:decision" }, session: { id: "session:decision" } } },
    progressIdentity: { id: "progress:decision", revision: 5, fingerprint: hash({ progress: 1 }) },
    completionIdentity: { id: "completion:decision", revision: 6, fingerprint: hash({ completion: 1 }) },
    stepIdentities: [], checkpointIdentities: [], importRevision: 9,
  };
  const monitoring = {
    id: "monitoring:decision", projectId, type: "PATTERN_EXECUTION_MONITORING", kind: "PATTERN_EXECUTION_MONITORING",
    revision: 8, epoch: 3, fingerprint: monitoringFingerprint, lifecycle: { state: "healthy" }, sourceIdentity,
    runtimeSummary: { lifecycle: "ready", lastConfirmedCheckpoint: null }, progressSummary: { totalSteps: 2, completedSteps: 1 },
    currentActivity: { status: "ready", actionId: null, stepId: null, checkpointId: null, safeToResume: false },
    blockers: [], warnings: [], diagnostics: [],
  };
  const runtime = { id: "runtime:decision", projectId, revision: 5, epoch: 2, runtimeFingerprint, status: "ready", activeActionId: null, actions: [], lastError: null, recovery: null, sourceIdentity: sourceIdentity.runtimeSourceIdentity };
  const result = { id: "result:decision", projectId, revision: 7, resultFingerprint };
  let current = { projectId, calculationId, project: { project_id: projectId, revision: 12, active_calculation_id: calculationId }, runtime, monitoring, result };
  let intervention = interventionApi.buildPatternExecutionIntervention(current, { id: "intervention:decision", now: stamp(1) });
  const selected = intervention.actions.find((entry) => entry.type === "no_action");
  intervention = interventionApi.selectPatternExecutionInterventionAction(intervention, selected.id, { expectedRevision: intervention.revision, expectedEpoch: intervention.epoch, operationId: "decision-intervention-select", now: stamp(2), targetIdentity: selected.targetIdentity }).intervention;
  intervention = interventionApi.confirmPatternExecutionIntervention(intervention, current, { expectedRevision: intervention.revision, expectedEpoch: intervention.epoch, operationId: "decision-intervention-confirm", now: stamp(3), actionId: intervention.selectedAction.id, targetIdentity: intervention.selectedAction.targetIdentity, confirmedBy: "user" }).intervention;
  current = { ...current, intervention };
  let executionAction = actionApi.buildPatternExecutionAction(current, { id: "execution-action:decision", now: stamp(4) });
  const actionCommand = (second) => ({ expectedRevision: executionAction.revision, expectedEpoch: executionAction.epoch, expectedFingerprint: executionAction.fingerprint, operationId: `decision-action:${second}`, now: stamp(second) });
  executionAction = actionApi.preparePatternExecutionAction(executionAction, current, actionCommand(5)).action;
  executionAction = actionApi.executePatternExecutionAction(executionAction, current, actionCommand(6)).action;
  executionAction = actionApi.verifyPatternExecutionAction(executionAction, current, actionCommand(7)).action;
  return { ...current, action: executionAction };
}

function evidenceCommand(snapshot, second) {
  return { expectedRevision: snapshot.revision, expectedEpoch: snapshot.epoch, expectedFingerprint: snapshot.fingerprint, operationId: `decision-evidence:${second}`, now: stamp(second) };
}

test("repository persists, reopens, isolates, exports, remaps, rebuilds and deletes decisions", async () => {
  const { DB_NAME, ProjectRepository, uuidv7 } = globalThis.YarnAIProjectSystem;
  await deleteDatabase(DB_NAME);
  const repository = new ProjectRepository();
  try {
    const project = await repository.createProject({ title: "Decision repository" });
    const calculation = await repository.addCalculation(project.project_id, {
      axes: ["width"], functional_category: "garment",
      width: { value: 50, unit: "cm", size_kind: "finished", direction: "nearest", gauge: { method: "ready_value", ready_count: 20, base_length: 10 } },
    }, {
      status: "READY", normalized_inputs: { width: 50 }, axes: { width: { selected_candidate: { working_count: 100 } } },
      warnings: [], errors: [], clarifications: [], canon_version: "1", specification_version: "1",
    });
    const calculationId = calculation.calculation.calculation_id;
    const current = completedRepositorySource(project.project_id, calculationId);
    await repository.ensurePatternExecutionAction(project.project_id, calculationId, current.action);
    let bundle = evidenceApi.buildPatternExecutionEvidence(current, { id: "execution-evidence:decision", now: stamp(8) });
    let bundleRecord = await repository.savePatternExecutionEvidence(project.project_id, calculationId, bundle);
    for (const [operation, second] of [[evidenceApi.collectPatternExecutionEvidence, 9], [evidenceApi.validatePatternExecutionEvidence, 10], [evidenceApi.completePatternExecutionEvidence, 11]]) {
      bundle = operation(bundle, current, evidenceCommand(bundle, second)).evidence;
      bundleRecord = await repository.savePatternExecutionEvidence(project.project_id, calculationId, bundle, { recordId: bundleRecord.progress_id, expectedRevision: bundleRecord.state.revision, expectedFingerprint: bundleRecord.state.fingerprint });
    }
    const expectedCriteria = verificationApi.deriveExpectedCriteria(current.action);
    let verification = verificationApi.buildPatternExecutionVerification({ ...current, evidence: [bundle], expectedCriteria }, { id: uuidv7(), now: stamp(12) });
    let verificationRecord = await repository.savePatternExecutionVerification(project.project_id, calculationId, verification);
    verification = verificationApi.startPatternExecutionVerification(verification, { expectedRevision: 1, expectedFingerprint: verification.fingerprint, now: stamp(13) }).verification;
    verificationRecord = await repository.savePatternExecutionVerification(project.project_id, calculationId, verification, { recordId: verificationRecord.progress_id, expectedRevision: 1, expectedFingerprint: verificationRecord.state.fingerprint });
    verification = verificationApi.completePatternExecutionVerification(verification, { action: current.action, evidence: [bundle], expectedCriteria }, { expectedRevision: 2, expectedFingerprint: verification.fingerprint, now: stamp(14) }).verification;
    await repository.savePatternExecutionVerification(project.project_id, calculationId, verification, { recordId: verificationRecord.progress_id, expectedRevision: 2, expectedFingerprint: verificationRecord.state.fingerprint });
    assert.equal(verification.status, "verified");

    let inspected = await repository.createPatternExecutionDecision(project.project_id, { now: stamp(15) });
    assert.equal(inspected.effectiveStatus, "ready");
    inspected = await repository.updatePatternExecutionDecision(project.project_id, inspected.rawDecision.id, { status: "deciding" }, inspected.rawDecision.revision, inspected.rawDecision.fingerprint, { now: stamp(16) });
    inspected = await repository.decidePatternExecution(project.project_id, inspected.rawDecision.id, { outcome: "accepted", reasonCode: "verification_accepted", explanation: "Repository acceptance", requiredFollowUp: null, selectedCriterionIds: inspected.rawDecision.criterionIds, selectedEvidenceIds: inspected.rawDecision.evidenceReferences.map((entry) => entry.id), expectedRevision: inspected.rawDecision.revision, expectedFingerprint: inspected.rawDecision.fingerprint, now: stamp(17) });
    assert.equal(inspected.rawDecision.status, "accepted");
    await assert.rejects(repository.updatePatternExecutionDecision(project.project_id, inspected.rawDecision.id, { status: "ready" }, inspected.rawDecision.revision, inspected.rawDecision.fingerprint), (error) => error.code === "terminal_decision");

    const followUpSelection = {
      selectedCriterionIds: inspected.rawDecision.decision.selectedCriterionIds,
      selectedEvidenceIds: inspected.rawDecision.decision.selectedEvidenceIds,
      selectedActionIds: [], targetReferences: [], evidenceRequirements: [], actionTargets: [],
    };
    let followUp = await repository.createPatternExecutionFollowUp(project.project_id, {
      decisionId: inspected.rawDecision.id, followUpKind: "completion", reasonCode: "verification_accepted",
      confirmation: true, ...followUpSelection, expectedDecisionRevision: inspected.rawDecision.revision,
      expectedDecisionFingerprint: inspected.rawDecision.fingerprint, now: stamp(18),
    });
    assert.equal(followUp.rawFollowUp.status, "ready");
    const followUpCommand = () => ({
      followUpKind: followUp.rawFollowUp.followUpKind, reasonCode: followUp.rawFollowUp.reasonCode,
      confirmation: true, selectedCriterionIds: followUp.rawFollowUp.selectedCriterionIds,
      selectedEvidenceIds: followUp.rawFollowUp.selectedEvidenceIds, selectedActionIds: followUp.rawFollowUp.selectedActionIds,
      targetReferences: followUp.rawFollowUp.targetReferences, evidenceRequirements: followUp.rawFollowUp.evidenceRequirements,
      actionTargets: followUp.rawFollowUp.actionTargets, expectedRevision: followUp.rawFollowUp.revision,
      expectedFingerprint: followUp.rawFollowUp.fingerprint, now: stamp(19),
    });
    followUp = await repository.schedulePatternExecutionFollowUp(project.project_id, followUp.rawFollowUp.id, followUpCommand());
    followUp = await repository.activatePatternExecutionFollowUp(project.project_id, followUp.rawFollowUp.id, followUpCommand());
    followUp = await repository.completePatternExecutionFollowUp(project.project_id, followUp.rawFollowUp.id, { ...followUpCommand(), terminalResult: { route: "completion" } });
    assert.equal(followUp.rawFollowUp.status, "completed");
    await assert.rejects(repository.schedulePatternExecutionFollowUp(project.project_id, followUp.rawFollowUp.id, followUpCommand()), (error) => error.code === "terminal_follow_up");

    const reopened = new ProjectRepository();
    await reopened.initialize();
    assert.equal((await reopened.getPatternExecutionDecision(project.project_id)).state.status, "accepted");
    assert.equal((await reopened.getPatternExecutionFollowUp(project.project_id)).state.status, "completed");
    await reopened.close();

    const other = await repository.createProject({ title: "Decision isolation" });
    assert.deepEqual(await repository.listPatternExecutionDecisions(other.project_id), []);
    assert.deepEqual(await repository.listPatternExecutionFollowUps(other.project_id), []);
    const exported = await repository.exportProject(project.project_id);
    assert.ok(exported.envelope.payload.progress.some((entry) => entry.kind === api.PROGRESS_KIND));
    assert.ok(exported.envelope.payload.progress.some((entry) => entry.kind === followUpApi.PROGRESS_KIND));
    const payload = JSON.parse(exported.json);
    const payloadBefore = structuredClone(payload);
    const imported = await repository.importProject(payload);
    assert.deepEqual(payload, payloadBefore);
    const importedDecision = (await repository.getPatternExecutionDecision(imported.project_id)).state;
    const importedVerification = (await repository.getPatternExecutionVerification(imported.project_id)).state;
    assert.equal(importedDecision.status, "stale");
    assert.equal(importedDecision.projectId, imported.project_id);
    assert.equal(importedDecision.verificationId, importedVerification.id);
    assert.notEqual(importedDecision.id, inspected.rawDecision.id);
    assert.equal(importedDecision.previousDecisionId, null);
    const importedFollowUp = (await repository.getPatternExecutionFollowUp(imported.project_id)).state;
    assert.equal(importedFollowUp.status, "completed");
    assert.deepEqual(importedFollowUp.terminalResult, { route: "completion" });
    assert.equal(importedFollowUp.importedDiagnostic.reason, "import_identity_unproven");
    assert.equal((await repository.readPatternExecutionFollowUp(imported.project_id)).effectiveStatus, "stale");

    const rebuilt = await repository.rebuildPatternExecutionDecision(imported.project_id, importedDecision.id, { expectedRevision: importedDecision.revision, expectedFingerprint: importedDecision.fingerprint, now: stamp(18) });
    assert.notEqual(rebuilt.rawDecision.id, importedDecision.id);
    assert.equal(rebuilt.rawDecision.previousDecisionId, importedDecision.id);
    assert.equal((await repository.listPatternExecutionDecisions(imported.project_id)).length, 2);

    await repository.softDeleteProject(project.project_id);
    await repository.permanentlyDeleteProject(project.project_id, { confirmed: true });
    await assert.rejects(repository.getPatternExecutionDecision(project.project_id));
    await assert.rejects(repository.getPatternExecutionFollowUp(project.project_id));
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
