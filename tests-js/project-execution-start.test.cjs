"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const fixture = require("./stage60-to-66-saved-chain.cjs");

const domain = fixture.startDomain;

test("01 real saved 60→61→63→64→65 chain is ready for Stage 66", () => {
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions());
  assert.equal(result.ready, true);
  assert.equal(result.assessment.source.sourceIdentities.closure, "stage60-closure");
  assert.equal(result.assessment.source.sourceIdentities.initialization, "stage61-initialization");
  assert.equal(result.assessment.source.sourceIdentities.gauge, "stage63-gauge");
  assert.equal(result.assessment.source.sourceIdentities.calculation, "stage64-calculation-record");
});

test("02 first physical step is copied from Stage 65 without recalculation", () => {
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions());
  assert.equal(result.assessment.preparation.firstStep.instruction, "Набрать 100 петель");
  assert.equal(result.assessment.preparation.firstStep.stitchCount, 100);
});

test("03 lifecycle is draft → ready → started", () => {
  const aggregate = fixture.withCompletedPlan();
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions(aggregate));
  let snapshot = domain.buildDraft(result.assessment, { createdAt: fixture.START_AT, acknowledged: true, acknowledgedAt: fixture.START_AT });
  assert.equal(snapshot.lifecycle, "draft");
  snapshot = domain.markReady(snapshot, { timestamp: fixture.START_AT });
  assert.equal(snapshot.lifecycle, "ready");
  snapshot = domain.start(snapshot, { startedAt: fixture.START_AT });
  assert.equal(snapshot.lifecycle, "started");
});

test("04 direct draft → started transition is forbidden", () => {
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions());
  const draft = domain.buildDraft(result.assessment, { createdAt: fixture.START_AT, acknowledged: true, acknowledgedAt: fixture.START_AT });
  assert.throws(() => domain.start(draft, { startedAt: fixture.START_AT }), { code: "LIFECYCLE_TRANSITION_INVALID" });
});

test("05 acknowledgment is required", () => {
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions());
  const draft = domain.buildDraft(result.assessment, { createdAt: fixture.START_AT, acknowledged: false });
  assert.throws(() => domain.markReady(draft, { timestamp: fixture.START_AT }), { code: "ACKNOWLEDGMENT_REQUIRED" });
});

test("06 started snapshot uses a closed allowlist", () => {
  const snapshot = fixture.startedSnapshot();
  assert.deepEqual(Object.keys(snapshot).sort(), [...domain.SNAPSHOT_KEYS].sort());
  assert.equal(snapshot.audit.events.length, 3);
  assert.equal(snapshot.audit.explicitStart, true);
});

test("07 progress state is project scoped and immutable", () => {
  const snapshot = fixture.startedSnapshot();
  const state = domain.createProgressState(snapshot, "stage64-calculation-record");
  assert.deepEqual(Object.keys(state).sort(), [...domain.PROGRESS_KEYS].sort());
  assert.equal(state.projectId, fixture.PROJECT_ID);
  assert.equal(state.lifecycle, "started");
});

test("08 tampered Stage 66 fingerprint fails closed", () => {
  const snapshot = JSON.parse(JSON.stringify(fixture.startedSnapshot()));
  snapshot.firstStep.stitchCount = 101;
  assert.throws(() => domain.validateSnapshot(snapshot), { code: "SOURCE_FINGERPRINT_MISMATCH" });
});

test("09 Stage 65 from another project is rejected", () => {
  const aggregate = fixture.withCompletedPlan();
  const record = aggregate.progress.find((entry) => entry.kind === fixture.planDomain.PROGRESS_KIND);
  record.project_id = "019fc3ba-4100-71c3-8af9-bd06e3bff305";
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions(aggregate));
  assert.equal(result.ready, false);
  assert.equal(result.diagnostic.code, "STAGE65_SOURCE_INVALID");
});

test("10 changed Stage 64 fingerprint makes the chain stale", () => {
  const aggregate = fixture.withCompletedPlan();
  aggregate.calculations[0].request.project_calculation_entry.fingerprint = "fnv1a32:changed";
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions(aggregate));
  assert.equal(result.ready, false);
  assert.equal(result.diagnostic.code, "STAGE64_SOURCE_INVALID");
});

test("11 changed Stage 65 fingerprint is rejected", () => {
  const aggregate = fixture.withCompletedPlan();
  const record = aggregate.progress.find((entry) => entry.kind === fixture.planDomain.PROGRESS_KIND);
  record.state = JSON.parse(JSON.stringify(record.state));
  record.state.history[0].fingerprint = "fnv1a32:changed";
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions(aggregate));
  assert.equal(result.ready, false);
  assert.ok(["SOURCE_FINGERPRINT_MISMATCH", "STAGE65_SOURCE_INVALID"].includes(result.diagnostic.code));
});

test("12 absent Stage 65 is rejected with recovery", () => {
  const aggregate = fixture.savedChain();
  const result = fixture.startWorkspace.assessAggregateReadiness(fixture.readinessOptions(aggregate));
  assert.equal(result.ready, false);
  assert.equal(result.diagnostic.code, "STAGE65_SOURCE_INVALID");
  assert.equal(result.diagnostic.recovery.path, "/project-execution-plan");
});

test("13 next destination is guarded and old execution route is rejected", () => {
  assert.equal(domain.nextActionDescriptor().destination, null);
  assert.equal(domain.safeDestination(`/pattern-execution-session?project=${fixture.PROJECT_ID}`, fixture.PROJECT_ID).valid, false);
});

test("14 all required diagnostics have recovery mappings", () => {
  for (const code of [
    "PROJECT_NOT_FOUND", "STAGE60_SOURCE_INVALID", "STAGE61_SOURCE_INVALID", "STAGE63_SOURCE_INVALID",
    "STAGE64_SOURCE_INVALID", "STAGE65_SOURCE_INVALID", "STAGE65_NOT_READY", "SOURCE_PROJECT_MISMATCH",
    "SOURCE_FINGERPRINT_MISMATCH", "SOURCE_STALE", "ACKNOWLEDGMENT_REQUIRED",
    "EXECUTION_ALREADY_STARTED", "INVALID_NEXT_DESTINATION",
  ]) assert.ok(domain.recoveryFor(code).path, code);
});

test("15 production contains no DOM, HTML, object URL, binary or Stage 67 path", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/project-execution-start.js"), "utf8").toLowerCase();
  for (const forbidden of ["document.", "innerhtml", "createobjecturl", "arraybuffer", "blob(", "stage 67", "stage_67"]) assert.equal(source.includes(forbidden), false, forbidden);
});
