"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fixture = require("./stage69-source-chain.cjs");
const domain = fixture.stage69Domain;

function completion(assessment = fixture.assessment(), input = { foundationType: "ribbing", foundationHeight: 5 }, metadata = {}) {
  return domain.createCompletedSnapshot(assessment, input, {
    createdAt: fixture.TIMES[6], confirmedAt: fixture.TIMES[6], explicitConfirmation: true, operationId: fixture.OPS[5], ...metadata,
  });
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

test("01 valid real Stage 60→68 source chain is ready", () => {
  const result = fixture.assessment();
  assert.equal(result.lifecycle, "ready", result.diagnostic?.code);
  assert.equal(result.context.stitchCount, 100);
  assert.equal(result.step.sequenceNumber, 2);
  assert.equal(result.step.type, "FOUNDATION_SECTION");
});

test("02 only canonical missing conditional requirements are exposed", () => {
  const result = fixture.assessment();
  assert.deepEqual(result.missingInputs, ["foundation_type", "foundation_height"]);
  assert.deepEqual(result.foundationTypeOptions, ["ribbing", "other"]);
  assert.doesNotMatch(JSON.stringify(result), /rowCount|rowsPer10Cm.*target/i);
});

test("03 foundation type and positive height form a centimetre target", () => {
  assert.deepEqual(domain.resolveClarification(fixture.assessment(), { foundationType: "ribbing", foundationHeight: 5.25 }), {
    stepSequence: 2, stepType: "FOUNDATION_SECTION", foundationType: "ribbing", target: { kind: "height", value: 5.25, unit: "cm" },
  });
});

test("04 canonical snapshot does not invent rows, instructions, or presentation labels", () => {
  const snapshot = completion();
  assert.equal(snapshot.lifecycle, "completed");
  assert.equal(snapshot.confirmation.explicit, true);
  assert.equal(snapshot.clarification.target.unit, "cm");
  assert.doesNotMatch(JSON.stringify(snapshot), /rowCount|rows|резинк|После набора|html|dom/i);
});

test("05 empty or unsupported foundation type is rejected", () => {
  for (const foundationType of ["", "unknown", "stockinette", "<b>ribbing</b>"]) {
    assert.throws(() => domain.resolveClarification(fixture.assessment(), { foundationType, foundationHeight: 5 }), { code: foundationType === "" ? "FOUNDATION_TYPE_REQUIRED" : "FOUNDATION_TYPE_INVALID" });
  }
});

test("06 empty, zero, negative, NaN and Infinity height are rejected", () => {
  for (const foundationHeight of [undefined, "", 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => domain.resolveClarification(fixture.assessment(), { foundationType: "ribbing", foundationHeight }), { code: "FOUNDATION_HEIGHT_INVALID" });
  }
});

test("07 numeric strings and ambiguous units are not canonical height values", () => {
  for (const foundationHeight of ["5", "5 cm", "5,0"]) {
    assert.throws(() => domain.resolveClarification(fixture.assessment(), { foundationType: "ribbing", foundationHeight }), { code: "FOUNDATION_HEIGHT_INVALID" });
  }
});

test("08 completion requires explicit confirmation and UUID-v7 operation", () => {
  const assessment = fixture.assessment();
  assert.throws(() => domain.createCompletedSnapshot(assessment, { foundationType: "ribbing", foundationHeight: 5 }, { createdAt: fixture.TIMES[6], confirmedAt: fixture.TIMES[6], explicitConfirmation: false, operationId: fixture.OPS[5] }), { code: "EXPLICIT_CONFIRMATION_REQUIRED" });
  assert.throws(() => domain.createCompletedSnapshot(assessment, { foundationType: "ribbing", foundationHeight: 5 }, { createdAt: fixture.TIMES[6], confirmedAt: fixture.TIMES[6], explicitConfirmation: true, operationId: "bad" }), { code: "OPERATION_ID_INVALID" });
});

test("09 Stage 65 fingerprint corruption fails closed", () => {
  const source = fixture.build({ mutate({ aggregate }) { const record = aggregate.progress.find((item) => item.kind === fixture.planDomain.KIND); record.state.history[0].fingerprint = "fnv1a32:tampered"; } });
  assert.equal(domain.assessSource(source.input).lifecycle, "blocked");
  assert.equal(domain.assessSource(source.input).diagnostic.code, "STAGE65_FINGERPRINT_MISMATCH");
});

test("10 Stage 67 fingerprint corruption fails closed", () => {
  const source = fixture.build({ mutate({ stage67Record }) { stage67Record.state.snapshot.fingerprint = "fnv1a32:tampered"; } });
  const result = domain.assessSource(source.input);
  assert.equal(result.lifecycle, "blocked");
  assert.equal(result.source, null);
});

test("11 Stage 68 fingerprint corruption fails closed", () => {
  const source = fixture.build({ mutate({ stage68Record }) { stage68Record.state.snapshot.fingerprint = "fnv1a32:tampered"; } });
  const result = domain.assessSource(source.input);
  assert.equal(result.diagnostic.code, "STAGE68_FINGERPRINT_MISMATCH");
  assert.equal(result.source, null);
});

test("12 foreign project UUID and source scope fail closed", () => {
  const source = fixture.build();
  source.input.project = { ...source.input.project, project_id: "019fc4dd-5100-7999-8af9-bd06e3bf1999" };
  assert.equal(domain.assessSource(source.input).diagnostic.code, "SOURCE_PROJECT_MISMATCH");
  const foreign = fixture.build({ mutate({ stage68Record }) { stage68Record.project_id = "019fc4dd-5100-7999-8af9-bd06e3bf1999"; } });
  assert.equal(domain.assessSource(foreign.input).diagnostic.code, "SOURCE_PROJECT_MISMATCH");
});

test("13 Stage 68 must be unavailable for the exact conditional reason", () => {
  const source = fixture.build({ mutate({ stage68Record }) {
    const snapshot = stage68Record.state.snapshot;
    snapshot.reasonCode = "NEXT_STEP_INCOMPLETE";
    snapshot.nextAction = { status: "unavailable", destination: null, label: null, reasonCode: "NEXT_STEP_INCOMPLETE" };
    const semantic = clone(snapshot); delete semantic.fingerprint; snapshot.fingerprint = fixture.stage68Domain.fingerprint(semantic);
  } });
  const result = domain.assessSource(source.input);
  assert.equal(result.lifecycle, "blocked");
  assert.equal(result.diagnostic.code, "STAGE68_FINGERPRINT_MISMATCH");
});

test("14 Stage 67 completion, CAST_ON type, explicit match and count are rechecked transitively", () => {
  for (const mutate of [
    (snapshot) => { snapshot.lifecycle = "checking"; },
    (snapshot) => { snapshot.step.type = "FOUNDATION_SECTION"; },
    (snapshot) => { snapshot.check.explicitConfirmation = false; },
    (snapshot) => { snapshot.check.observedStitchCount = 99; },
  ]) {
    const source = fixture.build({ mutate: ({ stage67Record }) => mutate(stage67Record.state.snapshot) });
    assert.equal(domain.assessSource(source.input).lifecycle, "blocked");
  }
});

test("15 snapshot allowlist, deterministic identity, immutability and semantic fingerprint", () => {
  const left = completion();
  const right = completion();
  assert.deepEqual(Object.keys(left), domain.SNAPSHOT_KEYS);
  assert.equal(left.identity, right.identity);
  assert.equal(left.fingerprint, right.fingerprint);
  assert.equal(Object.isFrozen(left), true);
  assert.throws(() => domain.validateSnapshot({ ...left, html: "<p>bad</p>" }), { code: "SNAPSHOT_NOT_ALLOWLISTED" });
  const changed = clone(left); changed.clarification.target.value = 6;
  assert.throws(() => domain.validateSnapshot(changed), { code: "SOURCE_FINGERPRINT_MISMATCH" });
});

test("16 completed progress binding is immutable to current Stage 65–68 sources", () => {
  const assessment = fixture.assessment();
  const snapshot = completion(assessment);
  assert.equal(domain.validateBinding(snapshot, assessment).fingerprint, snapshot.fingerprint);
  const changed = { ...assessment, source: { ...assessment.source, stage68Fingerprint: "fnv1a32:changed" } };
  assert.throws(() => domain.validateBinding(snapshot, changed), { code: "SOURCE_FINGERPRINT_MISMATCH" });
});

test("17 safe route accepts only the project-scoped clarification URL", () => {
  const valid = `/project-execution-next-step-clarification?project=${fixture.PROJECT_ID}`;
  assert.equal(domain.safeDestination(valid, fixture.PROJECT_ID).valid, true);
  for (const invalid of ["/project-execution-next-step-clarification", `${valid}&extra=1`, `/project-execution-next-step?project=${fixture.PROJECT_ID}`, "javascript:alert(1)"]) {
    assert.equal(domain.safeDestination(invalid, fixture.PROJECT_ID).valid, false);
  }
});
