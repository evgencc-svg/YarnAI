"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const fixture = require("./stage60-to-66-saved-chain.cjs");
const domain = require("../src/yarnai/static/project-execution-first-step.js");

const CREATED_AT = "2026-08-02T16:00:00.000Z";
const TIMES = Array.from({ length: 16 }, (_, index) => `2026-08-02T16:${String(index + 1).padStart(2, "0")}:00.000Z`);
const OP_IDS = Array.from({ length: 20 }, (_, index) => `019fc3ba-4100-7${String(200 + index).slice(-3)}-8af9-bd06e3bff${String(100 + index).slice(-3)}`);

function savedSource() {
  const aggregate = fixture.withCompletedPlan();
  const snapshot = fixture.startedSnapshot(aggregate);
  const calculationId = aggregate.project.active_calculation_id;
  const record = {
    schema_version: 1,
    progress_id: "stage66-progress-record",
    project_id: fixture.PROJECT_ID,
    calculation_id: calculationId,
    kind: fixture.startDomain.PROGRESS_KIND,
    epoch: 1,
    state: fixture.startDomain.createProgressState(snapshot, calculationId),
    revision: 1,
    created_at: fixture.START_AT,
    updated_at: fixture.START_AT,
  };
  aggregate.progress.push(record);
  const assessment = domain.assessSource({
    projectIdentity: fixture.PROJECT_ID,
    project: aggregate.project,
    progress: aggregate.progress,
    stage66Domain: fixture.startDomain,
  });
  return { aggregate, record, assessment };
}

function readySnapshot() {
  const { assessment } = savedSource();
  assert.equal(assessment.ready, true, assessment.diagnostic?.code);
  return domain.createSnapshot(assessment, { createdAt: CREATED_AT, operationId: OP_IDS[0] });
}

function command(snapshot, index) {
  return { expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint, operationId: OP_IDS[index], timestamp: TIMES[index] };
}

function checkingSnapshot() {
  let snapshot = readySnapshot();
  snapshot = domain.activateFirstStep(snapshot, command(snapshot, 1));
  snapshot = domain.startCheckingFirstStep(snapshot, command(snapshot, 2));
  return snapshot;
}

test("01 real saved 60→61→63→64→65→66 chain creates deterministic Stage 67 ready", () => {
  const { assessment } = savedSource();
  assert.equal(assessment.ready, true);
  assert.equal(assessment.step.instruction, "Набрать 100 петель");
  assert.equal(assessment.step.targetStitchCount, 100);
  assert.deepEqual(Object.keys(assessment.source.sourceIdentities), domain.SOURCE_STAGE_KEYS);
  assert.deepEqual(Object.keys(assessment.source.sourceFingerprints), domain.SOURCE_STAGE_KEYS);
  const left = domain.createSnapshot(assessment, { createdAt: CREATED_AT, operationId: OP_IDS[0] });
  const right = domain.createSnapshot(assessment, { createdAt: CREATED_AT, operationId: OP_IDS[0] });
  assert.equal(left.lifecycle, "ready");
  assert.equal(left.identity, right.identity);
  assert.equal(left.identity, domain.deterministicIdentity(assessment));
  assert.deepEqual(Object.keys(left).sort(), [...domain.SNAPSHOT_KEYS].sort());
});

test("02 Stage 67 uses Stage 66 as authority and does not recalculate earlier stages", () => {
  const { aggregate, assessment } = savedSource();
  const changed = JSON.parse(JSON.stringify(aggregate));
  changed.calculations[0].result.snapshot.finalStitchCount = 101;
  const repeated = domain.assessSource({ projectIdentity: fixture.PROJECT_ID, project: changed.project, progress: changed.progress, stage66Domain: fixture.startDomain });
  assert.equal(repeated.ready, true);
  assert.equal(repeated.step.targetStitchCount, 100);
  assert.deepEqual(repeated.source.sourceIdentities, assessment.source.sourceIdentities);
  assert.deepEqual(repeated.source.sourceFingerprints, assessment.source.sourceFingerprints);
});

test("03 absent, non-started, damaged and foreign Stage 66 fail closed", () => {
  const aggregate = fixture.withCompletedPlan();
  let result = domain.assessSource({ projectIdentity: fixture.PROJECT_ID, project: aggregate.project, progress: aggregate.progress, stage66Domain: fixture.startDomain });
  assert.equal(result.diagnostic.code, "STAGE66_NOT_STARTED");

  const foreign = savedSource();
  foreign.record.project_id = "019fc3ba-4100-71c3-8af9-bd06e3bff305";
  result = domain.assessSource({ projectIdentity: fixture.PROJECT_ID, project: foreign.aggregate.project, stage66Record: foreign.record, stage66Domain: fixture.startDomain });
  assert.equal(result.diagnostic.code, "SOURCE_PROJECT_MISMATCH");

  const damaged = savedSource();
  damaged.record.state = JSON.parse(JSON.stringify(damaged.record.state));
  damaged.record.state.snapshot.firstStep.stitchCount = 101;
  result = domain.assessSource({ projectIdentity: fixture.PROJECT_ID, project: damaged.aggregate.project, stage66Record: damaged.record, stage66Domain: fixture.startDomain });
  assert.equal(result.ready, false);
  assert.ok(["SOURCE_FINGERPRINT_MISMATCH", "FIRST_STEP_INVALID"].includes(result.diagnostic.code));
});

test("04 only the six allowed lifecycle transitions succeed", () => {
  let snapshot = readySnapshot();
  assert.deepEqual(domain.LIFECYCLES, ["ready", "active", "paused", "checking", "completed"]);
  snapshot = domain.activateFirstStep(snapshot, command(snapshot, 1));
  assert.equal(snapshot.lifecycle, "active");
  const activatedAt = snapshot.timestamps.activatedAt;
  snapshot = domain.pauseFirstStep(snapshot, command(snapshot, 2));
  assert.equal(snapshot.lifecycle, "paused");
  snapshot = domain.resumeFirstStep(snapshot, command(snapshot, 3));
  assert.equal(snapshot.lifecycle, "active");
  assert.equal(snapshot.timestamps.activatedAt, activatedAt);
  snapshot = domain.startCheckingFirstStep(snapshot, command(snapshot, 4));
  assert.equal(snapshot.lifecycle, "checking");
  snapshot = domain.returnToActiveFromChecking(snapshot, command(snapshot, 5));
  assert.equal(snapshot.lifecycle, "active");
  snapshot = domain.startCheckingFirstStep(snapshot, command(snapshot, 6));
  snapshot = domain.completeFirstStep(snapshot, { observedStitchCount: 100, explicitConfirmation: true }, command(snapshot, 7)).snapshot;
  assert.equal(snapshot.lifecycle, "completed");
});

test("05 reload validation restores every persisted lifecycle without transitions", () => {
  let snapshot = readySnapshot();
  const states = [snapshot];
  snapshot = domain.activateFirstStep(snapshot, command(snapshot, 1)); states.push(snapshot);
  snapshot = domain.pauseFirstStep(snapshot, command(snapshot, 2)); states.push(snapshot);
  snapshot = domain.resumeFirstStep(snapshot, command(snapshot, 3));
  snapshot = domain.startCheckingFirstStep(snapshot, command(snapshot, 4)); states.push(snapshot);
  snapshot = domain.completeFirstStep(snapshot, { observedStitchCount: 100, explicitConfirmation: true }, command(snapshot, 5)).snapshot; states.push(snapshot);
  for (const value of states) {
    const stored = JSON.parse(JSON.stringify(domain.createProgressState(value)));
    const restored = domain.validateProgressState(stored, { projectIdentity: value.projectIdentity, calculationId: value.calculationId });
    assert.equal(restored.snapshot.lifecycle, value.lifecycle);
    assert.equal(restored.snapshot.revision, value.revision);
    assert.equal(restored.snapshot.fingerprint, value.fingerprint);
  }
});

test("06 forbidden transitions and completed mutation are rejected", () => {
  const ready = readySnapshot();
  assert.throws(() => domain.completeFirstStep(ready, { observedStitchCount: 100, explicitConfirmation: true }, command(ready, 1)), { code: "LIFECYCLE_TRANSITION_INVALID" });
  const active = domain.activateFirstStep(ready, command(ready, 1));
  assert.throws(() => domain.completeFirstStep(active, { observedStitchCount: 100, explicitConfirmation: true }, command(active, 2)), { code: "LIFECYCLE_TRANSITION_INVALID" });
  const paused = domain.pauseFirstStep(active, command(active, 2));
  assert.throws(() => domain.startCheckingFirstStep(paused, command(paused, 3)), { code: "LIFECYCLE_TRANSITION_INVALID" });
  let checking = domain.resumeFirstStep(paused, command(paused, 3));
  checking = domain.startCheckingFirstStep(checking, command(checking, 4));
  const completed = domain.completeFirstStep(checking, { observedStitchCount: 100, explicitConfirmation: true }, command(checking, 5)).snapshot;
  assert.throws(() => domain.pauseFirstStep(completed, command(completed, 6)), { code: "LIFECYCLE_TRANSITION_INVALID" });
  assert.equal(completed.timestamps.completedAt, TIMES[5]);
});

test("06 count mismatch is saved atomically and reports the difference", () => {
  let snapshot = checkingSnapshot();
  let result = domain.completeFirstStep(snapshot, { observedStitchCount: 99, explicitConfirmation: true }, command(snapshot, 3));
  snapshot = result.snapshot;
  assert.equal(snapshot.lifecycle, "checking");
  assert.deepEqual(snapshot.check, { method: "manual_count", observedStitchCount: 99, result: "mismatch", explicitConfirmation: true, confirmedBy: null });
  assert.equal(result.diagnostic.code, "COUNT_MISMATCH");
  assert.equal(result.diagnostic.message, "Не хватает 1 петли.");
  result = domain.completeFirstStep(snapshot, { observedStitchCount: 101, explicitConfirmation: false }, command(snapshot, 4));
  assert.equal(result.snapshot.lifecycle, "checking");
  assert.equal(result.diagnostic.message, "Набрана 1 лишняя петля.");
});

test("07 invalid counts and missing confirmation never change lifecycle", () => {
  const snapshot = checkingSnapshot();
  for (const value of [null, "", 1.5, 0, -1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => domain.completeFirstStep(snapshot, { observedStitchCount: value, explicitConfirmation: true }, command(snapshot, 3)), { code: "COUNT_INVALID" });
  }
  assert.throws(() => domain.completeFirstStep(snapshot, { observedStitchCount: 100, explicitConfirmation: false }, command(snapshot, 3)), { code: "CONFIRMATION_REQUIRED" });
  assert.equal(snapshot.lifecycle, "checking");
  assert.equal(snapshot.revision, 3);
});

test("08 exact 100 plus checkbox completes once with Stage 68 next action", () => {
  const checking = checkingSnapshot();
  const operation = command(checking, 3);
  const completed = domain.completeFirstStep(checking, { observedStitchCount: 100, explicitConfirmation: true }, operation).snapshot;
  assert.deepEqual(completed.check, { method: "manual_count", observedStitchCount: 100, result: "match", explicitConfirmation: true, confirmedBy: "project_owner" });
  assert.deepEqual(completed.nextAction, { status: "available", destination: `/project-execution-next-step?project=${fixture.PROJECT_ID}`, reasonCode: null });
  const replay = domain.completeFirstStep(completed, { observedStitchCount: 100, explicitConfirmation: true }, operation);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.snapshot, completed);
  assert.equal(replay.snapshot.revision, completed.revision);
});

test("09 optimistic concurrency and operation IDs fail closed", () => {
  const snapshot = readySnapshot();
  assert.throws(() => domain.activateFirstStep(snapshot, { ...command(snapshot, 1), expectedRevision: 0 }), { code: "REVISION_CONFLICT" });
  assert.throws(() => domain.activateFirstStep(snapshot, { ...command(snapshot, 1), expectedFingerprint: "fnv1a32:stale" }), { code: "SOURCE_FINGERPRINT_MISMATCH" });
  assert.throws(() => domain.activateFirstStep(snapshot, { ...command(snapshot, 1), operationId: "not-an-operation" }), { code: "OPERATION_ID_INVALID" });
  assert.equal(snapshot.lifecycle, "ready");
  assert.equal(snapshot.revision, 1);
});

test("10 snapshot tampering, unsafe payloads and legacy routes are rejected", () => {
  const cases = [];
  const extra = JSON.parse(JSON.stringify(readySnapshot())); extra.extra = true; cases.push(extra);
  const target = JSON.parse(JSON.stringify(readySnapshot())); target.step.targetStitchCount = 101; cases.push(target);
  const type = JSON.parse(JSON.stringify(readySnapshot())); type.step.type = "HTML"; cases.push(type);
  const html = JSON.parse(JSON.stringify(readySnapshot())); html.context.product = "<img src=x>"; cases.push(html);
  const blob = JSON.parse(JSON.stringify(readySnapshot())); blob.context.yarn = "blob:http://localhost/value"; cases.push(blob);
  const route = JSON.parse(JSON.stringify(readySnapshot())); route.nextAction.destination = "/pattern-execution-session"; cases.push(route);
  for (const value of cases) assert.throws(() => domain.validateSnapshot(value));
  assert.equal(domain.safeDestination(`/pattern-execution-session?project=${fixture.PROJECT_ID}`, fixture.PROJECT_ID).valid, false);
  assert.equal(domain.safeDestination(`/project-execution-first-step?project=${fixture.PROJECT_ID}`, fixture.PROJECT_ID).valid, true);
});

test("11 damaged Stage 67 fingerprint and project mismatch expose no valid state", () => {
  const damaged = JSON.parse(JSON.stringify(readySnapshot()));
  damaged.check.result = "mismatch";
  assert.throws(() => domain.validateSnapshot(damaged), { code: "SOURCE_FINGERPRINT_MISMATCH" });
  const state = domain.createProgressState(readySnapshot());
  assert.throws(() => domain.validateProgressState(state, { projectIdentity: "019fc3ba-4100-71c3-8af9-bd06e3bff305", calculationId: state.calculationId }));
});

test("12 production domain is DOM-free and does not use legacy execution entities", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-first-step.js"), "utf8").toLowerCase();
  for (const forbidden of ["document.", "innerhtml", "createobjecturl", "patternexecutionsession", "patternexecutionstep", "pattern-execution-session"]) assert.equal(source.includes(forbidden), false, forbidden);
});
