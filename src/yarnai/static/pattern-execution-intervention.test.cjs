"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const api = require("./pattern-execution-intervention.js");

const stamp = (second) => `2026-08-01T12:00:${String(second).padStart(2, "0")}.000Z`;
let operation = 0;
const options = (snapshot, second = 10, extra = {}) => ({ expectedRevision: snapshot.revision, expectedEpoch: snapshot.epoch, operationId: `intervention-operation:${++operation}`, now: stamp(second), ...extra });

function sourceFixture(status = "healthy", overrides = {}) {
  const projectId = overrides.projectId || "project:intervention";
  const runtimeFingerprint = api.fingerprint({ runtime: 1, projectId });
  const monitoringFingerprint = api.fingerprint({ monitoring: 1, projectId, status });
  const runtimeStatus = overrides.runtimeStatus || ({ healthy: "ready", attention_required: "paused", blocked: "blocked", completed: "completed", failed: "failed", stale: "stale" })[status] || "ready";
  const blocker = { code: "material_missing", severity: "error", source: "runtime_action", messageKey: "runtime.material_missing", relatedStepId: "step:one", relatedActionId: "runtime-action:one", recoverable: true, recommendedCommand: "resolve_blocker" };
  const warning = { code: "runtime_paused", severity: "warning", source: "runtime", messageKey: "runtime.paused", relatedStepId: "step:one", relatedActionId: "runtime-action:one", recoverable: true, recommendedCommand: "review_paused_action" };
  const diagnostics = status === "failed" ? [{ code: "runtime_failed", severity: "error", details: { actionId: "runtime-action:one" } }] : [];
  const sourceIdentity = {
    sourceSchemaVersion: 1,
    project: { id: projectId, revision: 12 },
    result: { id: "result:one", revision: 7, fingerprint: api.fingerprint({ result: 1 }) },
    runtime: { id: "runtime:one", revision: 5, epoch: 2, fingerprint: runtimeFingerprint },
    calculationIdentity: { id: "calculation:one", revision: 2, fingerprint: api.fingerprint({ calculation: 1 }) },
    executionPlanIdentity: { id: "plan:one", revision: 3, fingerprint: api.fingerprint({ plan: 1 }) },
    sessionIdentity: { id: "session:one", revision: 4, epoch: 1, fingerprint: api.fingerprint({ session: 1 }) },
    runtimeSourceIdentity: { chain: { projectId, plan: { id: "plan:one" }, session: { id: "session:one" } } },
    progressIdentity: { id: "progress:one", revision: 5, fingerprint: api.fingerprint({ progress: 1 }) },
    completionIdentity: { id: "completion:one", revision: 6, fingerprint: api.fingerprint({ completion: 1 }) },
    stepIdentities: [{ id: "step:two", revision: 2 }, { id: "step:one", revision: 1 }],
    checkpointIdentities: [{ id: "checkpoint:one", revision: 1 }],
    importRevision: 9,
  };
  const monitoring = {
    id: "monitoring:one", projectId, type: "PATTERN_EXECUTION_MONITORING", kind: "PATTERN_EXECUTION_MONITORING",
    revision: 8, epoch: 3, fingerprint: monitoringFingerprint, lifecycle: { state: status }, sourceIdentity,
    runtimeSummary: { lifecycle: runtimeStatus, lastConfirmedCheckpoint: status === "blocked" ? { id: "checkpoint:one", runtimeRevision: 5, actionId: "runtime-action:one" } : null },
    progressSummary: { totalSteps: 2, completedSteps: status === "completed" ? 2 : 1 },
    currentActivity: { status: runtimeStatus, actionId: ["paused", "blocked", "running"].includes(runtimeStatus) ? "runtime-action:one" : null, stepId: "step:one", checkpointId: status === "blocked" ? "checkpoint:one" : null, safeToResume: runtimeStatus === "paused" },
    blockers: status === "blocked" ? [blocker, ...(overrides.duplicateObservations ? [structuredClone(blocker)] : [])] : [],
    warnings: status === "attention_required" ? [warning, ...(overrides.duplicateObservations ? [structuredClone(warning)] : [])] : [],
    diagnostics,
  };
  const runtime = {
    id: "runtime:one", projectId, revision: 5, epoch: 2, runtimeFingerprint, status: runtimeStatus,
    activeActionId: monitoring.currentActivity.actionId, actions: status === "failed" ? [{ id: "runtime-action:one", state: "failed", error: { retryable: true, recoverable: true } }] : [],
    lastError: status === "failed" ? { code: "runtime_failed", retryable: true, recoverable: true } : null,
    recovery: overrides.recovery || null, sourceIdentity: sourceIdentity.runtimeSourceIdentity,
  };
  return { projectId, project: { project_id: projectId, revision: 12, active_calculation_id: "calculation:one" }, monitoring, runtime };
}

function build(status = "healthy", overrides = {}) { return api.buildPatternExecutionIntervention(sourceFixture(status, overrides), { id: "intervention:one", now: stamp(1) }); }
function eligible(snapshot) { return snapshot.actions.filter((entry) => entry.eligible).map((entry) => entry.type).sort(); }
function select(snapshot, type, second = 2) { const action = snapshot.actions.find((entry) => entry.type === type); return api.selectPatternExecutionInterventionAction(snapshot, action.id, options(snapshot, second, { targetIdentity: action.targetIdentity })).intervention; }
function confirm(snapshot, source, second = 3) { return api.confirmPatternExecutionIntervention(snapshot, source, options(snapshot, second, { actionId: snapshot.selectedAction.id, targetIdentity: snapshot.selectedAction.targetIdentity, confirmedBy: "user" })).intervention; }

test("1 healthy monitoring builds deterministically with no intervention required", () => {
  const first = build("healthy"); const second = api.buildPatternExecutionIntervention(sourceFixture("healthy"), { id: "different-id", now: stamp(50) });
  assert.equal(first.lifecycle.state, "ready"); assert.equal(first.requiresIntervention, false); assert.deepEqual(eligible(first), ["acknowledge", "no_action"]); assert.equal(first.recommendation.actionId, "intervention-action:no_action"); assert.equal(first.fingerprint, second.fingerprint);
});

test("2 attention_required exposes only proven pause/resume/review/recovery choices", () => {
  const snapshot = build("attention_required");
  assert.deepEqual(eligible(snapshot), ["acknowledge", "recover_runtime", "resume_runtime", "review_blocker", "stop_runtime"]);
  assert.equal(snapshot.recommendation.actionId, "intervention-action:resume_runtime");
});

test("3 blocked exposes review resolve checkpoint rebuild and stop", () => {
  const snapshot = build("blocked");
  assert.deepEqual(eligible(snapshot), ["rebuild_runtime", "recover_runtime", "resolve_blocker", "return_to_checkpoint", "review_blocker", "stop_runtime"]);
  assert.equal(snapshot.recommendation.actionId, "intervention-action:resolve_blocker");
});

test("4 completed permits acceptance and non-action without destructive runtime choices", () => {
  const snapshot = build("completed"); assert.deepEqual(eligible(snapshot), ["accept_completion", "no_action"]); assert.equal(snapshot.recommendation.actionId, "intervention-action:accept_completion");
});

test("5 failed actions require evidence and prefer inspection", () => {
  const snapshot = build("failed"); assert.deepEqual(eligible(snapshot), ["inspect_failure", "rebuild_monitoring", "rebuild_runtime", "recover_runtime", "retry_runtime"]); assert.equal(snapshot.recommendation.actionId, "intervention-action:inspect_failure");
});

test("6 stale disables ordinary actions and recommendation", () => {
  const snapshot = build("stale"); assert.equal(snapshot.lifecycle.state, "stale"); assert.deepEqual(eligible(snapshot), []); assert.equal(snapshot.recommendation, null);
});

test("7-9 action catalog is closed, blocked reasons stable, recommendation tie break stable", () => {
  const snapshot = build("healthy"); assert.deepEqual(snapshot.actions.map((entry) => entry.type).sort(), [...api.ACTION_TYPES].sort());
  assert.ok(snapshot.actions.filter((entry) => !entry.eligible).every((entry) => typeof entry.blockedReason === "string"));
  const tied = snapshot.actions.map((entry) => ({ ...entry, eligible: ["acknowledge", "no_action"].includes(entry.type), priority: 100 }));
  assert.equal(api.buildRecommendation(tied).actionId, "intervention-action:acknowledge");
});

test("10-11 observation order and exact duplicates do not affect actions recommendation or fingerprint", () => {
  const duplicate = build("blocked", { duplicateObservations: true }); const plain = build("blocked");
  assert.equal(duplicate.observations.length, plain.observations.length); assert.equal(duplicate.fingerprint, plain.fingerprint);
  const source = sourceFixture("blocked"); source.monitoring.blockers.reverse(); const reordered = api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) });
  assert.equal(reordered.fingerprint, plain.fingerprint); assert.deepEqual(reordered.actions, plain.actions);
});

test("12-15 selection is separate, confirmation is explicit, decision immutable and intent-only", () => {
  const source = sourceFixture("blocked"); const initial = api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) });
  const selected = select(initial, "resolve_blocker"); assert.equal(selected.lifecycle.state, "confirmation_required"); assert.equal(selected.confirmation, null); assert.equal(selected.decision, null);
  const confirmed = confirm(selected, source); assert.equal(confirmed.lifecycle.state, "confirmed"); assert.ok(Object.isFrozen(confirmed.decision)); assert.equal(confirmed.decision.runtimeActionExecuted, false); assert.equal(confirmed.decision.effectApplied, false);
});

test("16 unavailable action cannot be selected or confirmed", () => {
  const snapshot = build("healthy"); assert.throws(() => select(snapshot, "rebuild_runtime"), (error) => error.code === "action_not_eligible");
});

test("17-18 confirmation rejects stale revision and mismatched target identity", () => {
  const source = sourceFixture("healthy"); const selected = select(api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) }), "no_action");
  assert.throws(() => api.confirmPatternExecutionIntervention(selected, source, { ...options(selected, 3, { actionId: selected.selectedAction.id }), expectedRevision: selected.revision - 1 }), (error) => error.code === "intervention_revision_conflict");
  assert.throws(() => api.confirmPatternExecutionIntervention(selected, source, options(selected, 3, { actionId: selected.selectedAction.id, targetIdentity: { projectId: "wrong" } })), (error) => error.code === "target_identity_mismatch");
});

test("19 duplicate command is idempotent and conflicting reuse is rejected", () => {
  const snapshot = build("healthy"); const command = options(snapshot, 2); const first = api.selectPatternExecutionInterventionAction(snapshot, "no_action", command);
  const repeated = api.selectPatternExecutionInterventionAction(first.intervention, "no_action", command); assert.equal(repeated.changed, false); assert.deepEqual(repeated.intervention, first.intervention);
  assert.throws(() => api.cancelPatternExecutionIntervention(first.intervention, command), (error) => error.code === "operation_id_conflict");
});

test("20 terminal state is protected while confirmed may be cancelled before completion", () => {
  const source = sourceFixture("healthy"); let snapshot = select(api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) }), "no_action"); snapshot = confirm(snapshot, source);
  const cancelled = api.cancelPatternExecutionIntervention(snapshot, options(snapshot, 4)).intervention; assert.equal(cancelled.lifecycle.state, "cancelled"); assert.equal(api.CONFIRMED_CANCELLATION_POLICY, "allowed_until_completed");
  assert.throws(() => api.cancelPatternExecutionIntervention(cancelled, options(cancelled, 5)), (error) => error.code === "terminal_intervention_protected");
});

test("21-23 read is non-mutating, never recovers, and detects interrupted assessing", () => {
  const ready = build("healthy"); const assessing = structuredClone(ready); assessing.lifecycle = { ...assessing.lifecycle, state: "assessing", previousState: "waiting" }; assessing.fingerprint = api.fingerprintPatternExecutionIntervention(assessing);
  const before = structuredClone(assessing); const read = api.readPatternExecutionIntervention(assessing, sourceFixture("healthy"));
  assert.deepEqual(assessing, before); assert.equal(read.intervention.lifecycle.state, "assessing"); assert.equal(read.interrupted, true); assert.equal(read.recoverRequired, true);
});

test("24-25 explicit recover rechecks both source identities and never executes runtime action", () => {
  const source = sourceFixture("healthy"); const assessing = structuredClone(api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) })); assessing.lifecycle = { ...assessing.lifecycle, state: "assessing", previousState: "waiting" }; assessing.fingerprint = api.fingerprintPatternExecutionIntervention(assessing);
  const recovered = api.recoverPatternExecutionIntervention(assessing, source, options(assessing, 4)).intervention; assert.equal(recovered.lifecycle.state, "ready"); assert.equal(recovered.decision, null); assert.ok(recovered.audit.at(-1).details.runtimeActionExecuted === false);
  const changed = sourceFixture("healthy"); changed.runtime.revision += 1; const stale = api.recoverPatternExecutionIntervention(assessing, changed, options(assessing, 5)).intervention; assert.equal(stale.lifecycle.state, "stale");
});

test("26-27 rebuild creates a new epoch without mutating old snapshot and resets intent", () => {
  const source = sourceFixture("healthy"); const old = select(api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) }), "no_action"); const before = structuredClone(old);
  const rebuilt = api.rebuildPatternExecutionIntervention(old, source, options(old, 5)).intervention; assert.equal(rebuilt.epoch, old.epoch + 1); assert.equal(rebuilt.selectedAction, null); assert.equal(rebuilt.previousEpoch.fingerprint, old.fingerprint); assert.deepEqual(old, before);
});

test("28-31 fingerprints ignore key/array order and audit timestamps but track domain changes", () => {
  const snapshot = build("blocked"); const reordered = structuredClone(snapshot); reordered.observations.reverse(); reordered.actions.reverse(); reordered.sourceIdentity.stepIdentities.reverse();
  assert.equal(api.fingerprintPatternExecutionIntervention(snapshot), api.fingerprintPatternExecutionIntervention(reordered));
  const changedAction = structuredClone(snapshot); changedAction.actions[0].expectedEffect += " changed"; assert.notEqual(api.fingerprintPatternExecutionIntervention(snapshot), api.fingerprintPatternExecutionIntervention(changedAction));
  const changedRecommendation = structuredClone(snapshot); changedRecommendation.recommendation.priority += 1; assert.notEqual(api.fingerprintPatternExecutionIntervention(snapshot), api.fingerprintPatternExecutionIntervention(changedRecommendation));
  const later = api.buildPatternExecutionIntervention(sourceFixture("blocked"), { id: "other", now: stamp(55) }); assert.equal(snapshot.fingerprint, later.fingerprint);
});

test("30 confirmed decision changes snapshot fingerprint", () => {
  const source = sourceFixture("healthy"); const initial = api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) }); const selected = select(initial, "no_action"); const confirmed = confirm(selected, source); assert.notEqual(initial.fingerprint, selected.fingerprint); assert.notEqual(selected.fingerprint, confirmed.fingerprint);
});

test("32-34 structural semantic and lifecycle validation reject contradictions", () => {
  const snapshot = build("healthy"); const structural = structuredClone(snapshot); structural.actions = null; structural.fingerprint = api.fingerprintPatternExecutionIntervention(structural); assert.ok(api.validatePatternExecutionIntervention(structural).structural.length);
  const semantic = structuredClone(snapshot); semantic.recommendation.priority += 1; semantic.fingerprint = api.fingerprintPatternExecutionIntervention(semantic); assert.ok(api.validatePatternExecutionIntervention(semantic).semantic.some((entry) => entry.code === "intervention_recommendation_mismatch"));
  const lifecycle = structuredClone(snapshot); lifecycle.lifecycle.state = "confirmed"; lifecycle.fingerprint = api.fingerprintPatternExecutionIntervention(lifecycle); assert.ok(api.validatePatternExecutionIntervention(lifecycle).semantic.some((entry) => entry.code === "intervention_lifecycle_requires_selection"));
});

test("35-39 serialization round trip verifies fingerprints and makes unproven imports safe stale", () => {
  const source = sourceFixture("healthy"); let snapshot = select(api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) }), "no_action"); snapshot = confirm(snapshot, source);
  const serialized = api.serializePatternExecutionIntervention(snapshot); assert.deepEqual(api.deserializePatternExecutionIntervention(serialized), snapshot);
  const damaged = JSON.parse(serialized); damaged.assessmentReason += " damaged"; assert.throws(() => api.deserializePatternExecutionIntervention(damaged), (error) => error.code === "corrupted_intervention_snapshot");
  const changed = sourceFixture("healthy"); changed.runtime.runtimeFingerprint = api.fingerprint({ changed: true });
  const stale = api.deserializePatternExecutionIntervention(serialized, { source: changed, allowUnprovenIdentity: true, now: stamp(8) }); assert.equal(stale.lifecycle.state, "stale"); assert.equal(stale.selectedAction, null); assert.equal(stale.confirmation, null); assert.equal(stale.decision, null); assert.equal(stale.importedDiagnostic.decisionFingerprint, snapshot.decision.fingerprint);
});

test("40-42 collision remap updates nested identity and all targets then recalculates fingerprints", () => {
  const source = sourceFixture("blocked"); let snapshot = select(api.buildPatternExecutionIntervention(source, { id: "intervention:one", now: stamp(1) }), "resolve_blocker"); snapshot = confirm(snapshot, source);
  const remapped = api.remapPatternExecutionIntervention(snapshot, new Map([["project:intervention", "project:remapped"], ["runtime:one", "runtime:remapped"], ["monitoring:one", "monitoring:remapped"], ["result:one", "result:remapped"], ["plan:one", "plan:remapped"], ["session:one", "session:remapped"], ["step:one", "step:remapped"], ["checkpoint:one", "checkpoint:remapped"]]));
  assert.equal(remapped.projectId, "project:remapped"); assert.equal(remapped.sourceIdentity.runtime.id, "runtime:remapped"); assert.equal(remapped.recommendation.targetIdentity.projectId, "project:remapped"); assert.equal(remapped.selectedAction.targetIdentity.runtimeId, "runtime:remapped"); assert.equal(remapped.decision.targetIdentity.monitoringId, "monitoring:remapped");
  assert.equal(remapped.fingerprint, api.fingerprintPatternExecutionIntervention(remapped)); assert.equal(remapped.decision.fingerprint, api.decisionFingerprint(remapped.decision)); assert.ok(!JSON.stringify(remapped).includes("project:intervention"));
});

test("43 epoch and revision optimistic concurrency are both enforced", () => {
  const snapshot = build("healthy"); assert.throws(() => api.selectPatternExecutionInterventionAction(snapshot, "no_action", { ...options(snapshot, 2), expectedEpoch: 99 }), (error) => error.code === "intervention_epoch_conflict");
});

test("44-46 empty missing optional values are handled without mutating inputs", () => {
  const source = sourceFixture("healthy"); source.monitoring.sourceIdentity.progressIdentity = null; source.monitoring.sourceIdentity.completionIdentity = null; source.monitoring.sourceIdentity.stepIdentities = []; source.monitoring.sourceIdentity.checkpointIdentities = []; const before = structuredClone(source);
  const snapshot = api.buildPatternExecutionIntervention(source, { id: "intervention:empty", now: stamp(1) }); assert.equal(snapshot.sourceIdentity.progressIdentity, null); assert.deepEqual(source, before);
  const missing = { projectId: "project:missing" }; const blocked = api.buildPatternExecutionIntervention(missing, { now: stamp(1) }); assert.equal(blocked.lifecycle.state, "blocked"); assert.ok(blocked.blockers.some((entry) => entry.code === "monitoring_missing"));
});

test("47 audit is bounded and deterministic by domain content", () => {
  let snapshot = build("healthy"); for (let index = 0; index < 40; index += 1) snapshot = api.rebuildPatternExecutionIntervention(snapshot, sourceFixture("healthy"), options(snapshot, (index % 50) + 2)).intervention;
  assert.equal(snapshot.audit.length, api.AUDIT_LIMIT); assert.equal(new Set(snapshot.audit.map((entry) => entry.id)).size, snapshot.audit.length);
});

test("48 unknown action and status are rejected by commands or validation", () => {
  const snapshot = build("healthy"); assert.throws(() => api.selectPatternExecutionInterventionAction(snapshot, "unknown_action", options(snapshot, 2)), (error) => error.code === "unknown_action");
  const unknown = structuredClone(snapshot); unknown.monitoringStatus = "unknown"; unknown.fingerprint = api.fingerprintPatternExecutionIntervention(unknown); assert.ok(api.validatePatternExecutionIntervention(unknown).structural.some((entry) => entry.code === "intervention_monitoring_status_invalid"));
});

test("49 implementation does not name a non-existent later stage", () => {
  const files = ["pattern-execution-intervention.js", "pattern-execution-intervention-assistant.js", "pattern-execution-intervention.html", "pattern-execution-intervention.css", "pattern-execution-intervention.test.cjs"];
  const combined = files.map((name) => fs.readFileSync(path.join(__dirname, name), "utf8")).join("\n"); const forbidden = `Stage ${30 + 2}`; assert.ok(!combined.includes(forbidden)); assert.ok(!combined.toLowerCase().includes(forbidden.toLowerCase()));
});
