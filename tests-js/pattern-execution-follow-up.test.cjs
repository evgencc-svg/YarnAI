"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const decisionApi = require("../src/yarnai/static/pattern-execution-decision.js");
const api = require("../src/yarnai/static/pattern-execution-follow-up.js");
require("../src/yarnai/static/project-system.js");

const stamp = (second) => `2026-08-01T17:00:${String(second).padStart(2, "0")}.000Z`;

function sourceFor(outcome = "accepted", overrides = {}) {
  const projectId = overrides.projectId || "project:one";
  const calculationId = overrides.calculationId || "calculation:one";
  const verificationStatus = ({ accepted: "verified", more_evidence_required: "needs_evidence", correction_required: "contradicted", rejected: "rejected" })[outcome] || "verified";
  const action = {
    id: "action:one", projectId, calculationId, revision: 4,
    fingerprint: "fnv1a32:action0001", updatedAt: stamp(3),
    sourceIdentity: {
      executionPlanIdentity: { id: "plan:one", revision: 2, fingerprint: "fnv1a32:plan0001" },
      sessionIdentity: { id: "session:one", revision: 3, fingerprint: "fnv1a32:session1" },
    },
  };
  const evidence = [{
    id: "evidence:bundle", projectId, actionId: action.id, revision: 2,
    fingerprint: "fnv1a32:evidence1", lifecycle: "completed", updatedAt: stamp(4),
    evidenceItems: [
      { id: "evidence:item:a", fingerprint: "fnv1a32:item0001", status: "present" },
      { id: "evidence:item:b", fingerprint: "fnv1a32:item0002", status: "present" },
    ],
  }];
  const verification = {
    id: "verification:one", kind: "PATTERN_EXECUTION_VERIFICATION", type: "PATTERN_EXECUTION_VERIFICATION",
    projectId, calculationId, actionId: action.id, actionRevision: action.revision,
    actionFingerprint: action.fingerprint, evidenceIds: [evidence[0].id], status: verificationStatus,
    revision: 3, epoch: 1, fingerprint: `fnv1a32:verification-${verificationStatus}`,
    expectedCriteria: [{ id: "criterion:a" }, { id: "criterion:b" }],
    criterionResults: [
      { criterionId: "criterion:a", supportingEvidenceIds: ["evidence:item:a"], conflictingEvidenceIds: [] },
      { criterionId: "criterion:b", supportingEvidenceIds: ["evidence:item:b"], conflictingEvidenceIds: [] },
    ], updatedAt: stamp(5),
  };
  const base = { projectId, calculationId, project: { project_id: projectId, active_calculation_id: calculationId, updated_at: stamp(5) }, action, evidence, verification };
  let decision = decisionApi.buildPatternExecutionDecision(base, { id: "decision:one", now: stamp(6) });
  if (outcome !== "pending") {
    const reasonCode = ({ accepted: "verification_accepted", more_evidence_required: "insufficient_evidence", correction_required: "action_correction_required", rejected: "verification_rejected" })[outcome];
    decision = decisionApi.decidePatternExecution(decision, base, {
      outcome, reasonCode, explanation: "fixed decision", requiredFollowUp: null,
      selectedCriterionIds: ["criterion:b", "criterion:a"],
      selectedEvidenceIds: ["evidence:item:b", "evidence:item:a"],
      expectedRevision: decision.revision, expectedFingerprint: decision.fingerprint, now: stamp(7),
    });
  }
  return { ...base, decision, ...overrides };
}

function selection(kind, source, reverse = false) {
  const criteria = reverse ? ["criterion:b", "criterion:a"] : ["criterion:a", "criterion:b"];
  const evidenceIds = reverse ? ["evidence:item:b", "evidence:item:a"] : ["evidence:item:a", "evidence:item:b"];
  if (kind === "collect_evidence") return {
    selectedCriterionIds: criteria, selectedEvidenceIds: evidenceIds, selectedActionIds: [],
    targetReferences: evidenceIds.map((id) => source.decision.evidenceReferences.find((entry) => entry.id === id)),
    evidenceRequirements: criteria.map((criterionId) => ({ criterionId, requirement: "collect_additional_evidence" })), actionTargets: [],
  };
  if (kind === "corrective_action") return {
    selectedCriterionIds: criteria, selectedEvidenceIds: evidenceIds, selectedActionIds: [source.action.id],
    targetReferences: [{ id: source.action.id, revision: source.action.revision, fingerprint: source.action.fingerprint }],
    evidenceRequirements: [], actionTargets: criteria.map((criterionId) => ({ criterionId, actionId: source.action.id, target: "correct_decided_action" })),
  };
  return { selectedCriterionIds: criteria, selectedEvidenceIds: evidenceIds, selectedActionIds: [], targetReferences: [], evidenceRequirements: [], actionTargets: [] };
}

function creationCommand(source, kind, extra = {}) {
  return {
    id: "follow-up:one", followUpKind: kind, reasonCode: source.decision.decision.reasonCode,
    confirmation: true, ...selection(kind, source), expectedDecisionRevision: source.decision.revision,
    expectedDecisionFingerprint: source.decision.fingerprint, now: stamp(8), ...extra,
  };
}

function build(outcome = "accepted", kind = null, extra = {}) {
  const source = sourceFor(outcome);
  const effectiveKind = kind || ({ accepted: "completion", more_evidence_required: "collect_evidence", correction_required: "corrective_action", rejected: "termination" })[outcome];
  return { source, snapshot: api.createPatternExecutionFollowUp(source, creationCommand(source, effectiveKind, extra)) };
}

function bound(snapshot, extra = {}) {
  return {
    followUpKind: snapshot.followUpKind, reasonCode: snapshot.reasonCode, confirmation: true,
    selectedCriterionIds: snapshot.selectedCriterionIds, selectedEvidenceIds: snapshot.selectedEvidenceIds,
    selectedActionIds: snapshot.selectedActionIds, targetReferences: snapshot.targetReferences,
    evidenceRequirements: snapshot.evidenceRequirements, actionTargets: snapshot.actionTargets,
    expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint, now: stamp(9), ...extra,
  };
}

test("accepted recommends and creates completion", () => {
  const source = sourceFor("accepted");
  assert.equal(api.recommendPatternExecutionFollowUp(source).recommendedKind, "completion");
  assert.equal(api.createPatternExecutionFollowUp(source, creationCommand(source, "completion")).followUpKind, "completion");
});

test("more_evidence_required creates collect_evidence with Stage 33 references", () => {
  const { snapshot } = build("more_evidence_required");
  assert.equal(snapshot.followUpKind, "collect_evidence");
  assert.deepEqual(snapshot.selectedEvidenceIds, ["evidence:item:a", "evidence:item:b"]);
  assert.equal(snapshot.evidenceRequirements.length, 2);
});

test("correction_required creates corrective_action with Stage 32 references", () => {
  const { snapshot } = build("correction_required");
  assert.equal(snapshot.followUpKind, "corrective_action");
  assert.deepEqual(snapshot.selectedActionIds, ["action:one"]);
  assert.equal(snapshot.actionTargets.length, 2);
});

test("rejected requires an explicit corrective_action or termination", () => {
  const source = sourceFor("rejected");
  const recommendation = api.recommendPatternExecutionFollowUp(source);
  assert.equal(recommendation.recommendedKind, null);
  assert.equal(recommendation.requiresExplicitChoice, true);
  assert.throws(() => api.createPatternExecutionFollowUp(source, creationCommand(source, "completion")), (error) => error.code === "explicit_kind_required");
  assert.equal(api.createPatternExecutionFollowUp(source, creationCommand(source, "termination")).followUpKind, "termination");
  assert.equal(api.createPatternExecutionFollowUp(source, creationCommand(source, "corrective_action")).followUpKind, "corrective_action");
});

test("unsupported decision outcome projects blocked", () => {
  const source = sourceFor("accepted");
  source.decision = { ...source.decision, status: "unknown", decision: { ...source.decision.decision, outcome: "unknown" } };
  assert.equal(api.recommendPatternExecutionFollowUp(source).effectiveStatus, "blocked");
});

test("non-terminal decision remains waiting and creates no snapshot", () => {
  const source = sourceFor("pending");
  assert.equal(api.recommendPatternExecutionFollowUp(source).effectiveStatus, "waiting");
  assert.throws(() => api.createPatternExecutionFollowUp(source, { id: "follow-up:one" }), (error) => error.code === "decision_not_final");
});

test("fingerprint is deterministic", () => {
  const left = build("accepted").snapshot;
  const right = build("accepted").snapshot;
  assert.equal(left.fingerprint, right.fingerprint);
  assert.equal(left.inputFingerprint, right.inputFingerprint);
});

test("semantic set order does not affect fingerprint", () => {
  const source = sourceFor("more_evidence_required");
  const left = api.createPatternExecutionFollowUp(source, creationCommand(source, "collect_evidence"));
  const right = api.createPatternExecutionFollowUp(source, creationCommand(source, "collect_evidence", { ...selection("collect_evidence", source, true) }));
  assert.equal(left.fingerprint, right.fingerprint);
});

test("creation rejects optimistic decision revision and fingerprint conflicts", () => {
  const source = sourceFor("accepted");
  assert.throws(() => api.createPatternExecutionFollowUp(source, creationCommand(source, "completion", { expectedDecisionRevision: 99 })), (error) => error.code === "decision_revision_conflict");
  assert.throws(() => api.createPatternExecutionFollowUp(source, creationCommand(source, "completion", { expectedDecisionFingerprint: "fnv1a32:wrong" })), (error) => error.code === "decision_fingerprint_conflict");
});

test("execution rejects optimistic follow-up revision and fingerprint conflicts", () => {
  const { source, snapshot } = build();
  assert.throws(() => api.schedulePatternExecutionFollowUp(snapshot, source, bound(snapshot, { expectedRevision: 99 })), (error) => error.code === "follow_up_revision_conflict");
  assert.throws(() => api.schedulePatternExecutionFollowUp(snapshot, source, bound(snapshot, { expectedFingerprint: "fnv1a32:wrong" })), (error) => error.code === "follow_up_fingerprint_conflict");
});

test("project isolation and cross-project references are blocked", () => {
  const { source, snapshot } = build();
  const foreign = { ...source, projectId: "project:other", project: { project_id: "project:other" } };
  assert.equal(api.projectPatternExecutionFollowUp(snapshot, foreign).effectiveStatus, "blocked");
  const foreignEvidence = structuredClone(sourceFor("more_evidence_required"));
  foreignEvidence.evidence[0].projectId = "project:other";
  assert.equal(api.recommendPatternExecutionFollowUp(foreignEvidence).effectiveStatus, "blocked");
});

test("missing action and evidence references are blocked", () => {
  const actionSource = sourceFor("correction_required"); actionSource.action = null;
  assert.equal(api.recommendPatternExecutionFollowUp(actionSource).effectiveStatus, "blocked");
  const evidenceSource = sourceFor("more_evidence_required"); evidenceSource.evidence = [];
  assert.equal(api.recommendPatternExecutionFollowUp(evidenceSource).effectiveStatus, "blocked");
});

test("changed current decision dependencies project stale", () => {
  const { source, snapshot } = build();
  const changed = { ...source, verification: { ...source.verification, revision: source.verification.revision + 1 } };
  assert.equal(api.projectPatternExecutionFollowUp(snapshot, changed).effectiveStatus, "stale");
});

test("lifecycle schedule to active to completed", () => {
  const { source, snapshot } = build();
  const scheduling = api.schedulePatternExecutionFollowUp(snapshot, source, bound(snapshot));
  const active = api.activatePatternExecutionFollowUp(scheduling, source, bound(scheduling, { now: stamp(10) }));
  const completed = api.completePatternExecutionFollowUp(active, source, bound(active, { now: stamp(11), terminalResult: { route: "completion" } }));
  assert.deepEqual([scheduling.status, active.status, completed.status], ["scheduling", "active", "completed"]);
  assert.deepEqual(completed.terminalResult, { route: "completion" });
});

test("active can fail", () => {
  const { source, snapshot } = build();
  const scheduling = api.schedulePatternExecutionFollowUp(snapshot, source, bound(snapshot));
  const active = api.activatePatternExecutionFollowUp(scheduling, source, bound(scheduling));
  assert.equal(api.failPatternExecutionFollowUp(active, source, bound(active, { failure: { code: "route_failed" } })).status, "failed");
});

for (const initial of ["ready", "scheduling", "active"]) {
  test(`${initial} can be cancelled`, () => {
    const { source, snapshot } = build();
    let current = snapshot;
    if (initial !== "ready") current = api.schedulePatternExecutionFollowUp(current, source, bound(current));
    if (initial === "active") current = api.activatePatternExecutionFollowUp(current, source, bound(current));
    assert.equal(api.cancelPatternExecutionFollowUp(current, source, bound(current, { cancellation: { reasonCode: "user_cancelled" } })).status, "cancelled");
  });
}

test("terminal snapshots are immutable and stale projection does not mutate them", () => {
  const { source, snapshot } = build();
  const scheduling = api.schedulePatternExecutionFollowUp(snapshot, source, bound(snapshot));
  const active = api.activatePatternExecutionFollowUp(scheduling, source, bound(scheduling));
  const terminal = api.completePatternExecutionFollowUp(active, source, bound(active, { terminalResult: { route: "completion" } }));
  const before = structuredClone(terminal);
  assert.throws(() => api.schedulePatternExecutionFollowUp(terminal, source, bound(terminal)), (error) => error.code === "terminal_follow_up");
  const changed = { ...source, verification: { ...source.verification, revision: 99 } };
  assert.equal(api.projectPatternExecutionFollowUp(terminal, changed).effectiveStatus, "stale");
  assert.deepEqual(terminal, before);
});

test("rebuild creates new ID, increments epoch, and preserves previous snapshot", () => {
  const { source, snapshot } = build();
  const rebuilt = api.rebuildPatternExecutionFollowUp(snapshot, source, {
    ...bound(snapshot), id: "follow-up:two", expectedDecisionRevision: source.decision.revision,
    expectedDecisionFingerprint: source.decision.fingerprint, now: stamp(12),
  });
  assert.equal(rebuilt.followUp.id, "follow-up:two");
  assert.equal(rebuilt.followUp.epoch, 2);
  assert.equal(rebuilt.followUp.previousFollowUpId, snapshot.id);
  assert.deepEqual(rebuilt.previousFollowUp, snapshot);
});

test("serialization supports reload without changing snapshot", () => {
  const { snapshot } = build();
  assert.deepEqual(api.deserializePatternExecutionFollowUp(api.serializePatternExecutionFollowUp(snapshot)), snapshot);
});

test("collision remap covers all follow-up references", () => {
  const { snapshot } = build("correction_required");
  const remapped = api.remapPatternExecutionFollowUp(snapshot, new Map([
    ["project:one", "project:two"], ["calculation:one", "calculation:two"], ["plan:one", "plan:two"],
    ["session:one", "session:two"], ["decision:one", "decision:two"], ["follow-up:one", "follow-up:two"],
    ["verification:one", "verification:two"], ["action:one", "action:two"], ["criterion:a", "criterion:x"],
    ["evidence:item:a", "evidence:item:x"],
  ]));
  assert.equal(remapped.projectId, "project:two");
  assert.equal(remapped.id, "follow-up:two");
  assert.equal(remapped.decisionId, "decision:two");
  assert.ok(remapped.selectedCriterionIds.includes("criterion:x"));
  assert.ok(remapped.selectedActionIds.includes("action:two"));
  assert.equal(api.validatePatternExecutionFollowUp(remapped).valid, true);
});

test("import downgrade preserves terminal history and projects stale", () => {
  const { source, snapshot } = build();
  const scheduling = api.schedulePatternExecutionFollowUp(snapshot, source, bound(snapshot));
  const active = api.activatePatternExecutionFollowUp(scheduling, source, bound(scheduling));
  const terminal = api.completePatternExecutionFollowUp(active, source, bound(active, { terminalResult: { kept: true } }));
  const imported = api.makeImportedPatternExecutionFollowUpStale(terminal, { collision: true });
  assert.equal(imported.status, "completed");
  assert.deepEqual(imported.terminalResult, { kept: true });
  assert.equal(api.projectPatternExecutionFollowUp(imported, source).effectiveStatus, "stale");
});

test("input payload is never mutated", () => {
  const source = sourceFor("correction_required");
  const command = creationCommand(source, "corrective_action");
  const beforeSource = structuredClone(source); const beforeCommand = structuredClone(command);
  api.createPatternExecutionFollowUp(source, command);
  assert.deepEqual(source, beforeSource); assert.deepEqual(command, beforeCommand);
});

test("read wrapper is safe and does not execute dependencies", async () => {
  const { source, snapshot } = build();
  const calls = [];
  const repository = {
    async getProject() { calls.push("project"); return { project: source.project }; },
    async getPatternExecutionDecision() { calls.push("decision"); return { state: source.decision }; },
    async getPatternExecutionAction() { calls.push("action"); return { state: source.action }; },
    async listPatternExecutionEvidence() { calls.push("evidence"); return source.evidence.map((state) => ({ state })); },
    async listPatternExecutionVerification() { calls.push("verification"); return [{ state: source.verification }]; },
    async getPatternExecutionFollowUp() { calls.push("follow-up"); return { progress_id: "progress:follow-up", state: snapshot }; },
  };
  const inspected = await api.readForProject(repository, source.projectId);
  assert.equal(inspected.effectiveStatus, "ready");
  assert.deepEqual(calls, ["project", "decision", "action", "evidence", "verification", "follow-up"]);
});

test("domain has no nondeterministic clock or random and never reruns prior stages", () => {
  const code = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-execution-follow-up.js"), "utf8");
  assert.doesNotMatch(code, /Math\.random|Date\.now|new Date\s*\(/);
  assert.doesNotMatch(code, /executePatternExecutionAction|collectPatternExecutionEvidence|completePatternExecutionVerification|decidePatternExecution/);
});

test("progress kind keeps project deletion cleanup in the existing progress store", () => {
  assert.equal(api.PROGRESS_KIND, "PATTERN_EXECUTION_FOLLOW_UP");
});

test("repository exposes the complete Stage 36 API", () => {
  const prototype = globalThis.YarnAIProjectSystem.ProjectRepository.prototype;
  for (const method of [
    "listPatternExecutionFollowUps", "getPatternExecutionFollowUp", "savePatternExecutionFollowUp",
    "updatePatternExecutionFollowUp", "createPatternExecutionFollowUp", "readPatternExecutionFollowUp",
    "schedulePatternExecutionFollowUp", "activatePatternExecutionFollowUp", "completePatternExecutionFollowUp",
    "failPatternExecutionFollowUp", "cancelPatternExecutionFollowUp", "rebuildPatternExecutionFollowUp",
  ]) assert.equal(typeof prototype[method], "function", method);
});

test("IndexedDB remains version 4 with exactly the canonical 16 stores", () => {
  const system = globalThis.YarnAIProjectSystem;
  const canonical = [
    "cache", "calculations", "checkpoints", "meta", "migration_records", "operations",
    "pattern_file_blobs", "pattern_files", "photo_blobs", "photos", "progress", "projects",
    "quarantine", "settings", "sync_state", "transfer_receipts",
  ];
  assert.equal(system.DB_VERSION, 4);
  assert.equal(system.STORE_NAMES.length, 16);
  assert.equal(new Set(system.STORE_NAMES).size, 16);
  assert.deepEqual([...system.STORE_NAMES].sort(), canonical);
});

test("Stage 36 adds no production object store creation", () => {
  const staticRoot = path.join(__dirname, "../src/yarnai/static");
  const files = fs.readdirSync(staticRoot).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js") && !name.endsWith(".test.cjs"));
  const calls = files.flatMap((name) => [...fs.readFileSync(path.join(staticRoot, name), "utf8").matchAll(/createObjectStore\s*\(/g)]);
  assert.equal(calls.length, 1);
});
