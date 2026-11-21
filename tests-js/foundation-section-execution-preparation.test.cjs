"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../src/yarnai/static/foundation-section-execution-preparation.js");

const PROJECT_ID = "019fc3ba-4100-71c3-b7f9-bd06e3bff304";
const CALCULATION_ID = "019fc3ba-4100-71c3-b7f9-bd06e3bff305";
const AT = "2026-08-08T10:00:00.000Z";
const FP = "fnv1a32:1234abcd";
const OPS = [
  "019fc3ba-4100-71c3-b7f9-bd06e3bff306", "019fc3ba-4100-71c3-b7f9-bd06e3bff307",
  "019fc3ba-4100-71c3-b7f9-bd06e3bff308", "019fc3ba-4100-71c3-b7f9-bd06e3bff309",
];

function assessment(options = {}) {
  const identities = Object.fromEntries(domain.SOURCE_STAGE_KEYS.map((key) => [key, `${key}-identity`]));
  const fingerprints = Object.fromEntries(domain.SOURCE_STAGE_KEYS.map((key) => [key, FP]));
  return {
    lifecycle: "ready", projectId: PROJECT_ID, calculationId: CALCULATION_ID,
    workingMethod: options.workingMethod || null, authoritativeTool: options.authoritativeTool || null,
    source: {
      stage69: { progressIdentity: "progress-69", epoch: 1, snapshotIdentity: "snapshot-69", fingerprint: FP },
      stage65: { progressIdentity: "progress-65", planIdentity: "plan-65", planFingerprint: FP, stepIdentity: "step-foundation", stepFingerprint: FP },
      stage67: { progressIdentity: "progress-67", snapshotIdentity: "snapshot-67", fingerprint: FP },
      inheritedSourceIdentities: identities, inheritedSourceFingerprints: fingerprints,
      observedStorageRevisions: { project: 9, stage65Progress: 1, stage66Progress: 1, stage67Progress: 4, stage68Progress: 1, stage69Progress: 1, preparationProgress: null }, validatedAt: AT,
    },
    confirmedContext: { step: { sequence: 2, type: "FOUNDATION_SECTION", identity: "step-foundation", fingerprint: FP }, foundationType: "ribbing", castOnCount: 100, target: { kind: "height", value: 5, unit: "cm" } },
  };
}

function collect(state, source = assessment(), input = {}) {
  return domain.editDraft(state, {
    ribPattern: "rib_1x1", workingMethod: "flat", tool: "спицы 4 мм",
    instruction: "1 лицевая, 1 изнаночная", instructionAttested: true,
    measurementAcknowledged: true, ...input,
  }, { assessment: source, timestamp: AT, operationId: OPS[0] });
}

test("Stage 70 initial draft has no semantic defaults and fixed null row estimate", () => {
  const state = domain.createInitialState(assessment(), { createdAt: AT });
  assert.equal(state.lifecycle, "collecting");
  assert.equal(state.draft.ribPattern, null);
  assert.equal(state.draft.workingMethod, null);
  assert.equal(state.draft.toolConfirmation, null);
  assert.equal(state.draft.instructionSource, null);
  assert.equal(state.draft.rowEstimate, null);
});

test("authoritative Stage 65 method and source-bound tool are reused as locked facts", () => {
  const workingMethod = { value: "in_round", origin: "stage65", source: { planIdentity: "plan-65", planFingerprint: FP, field: "technologyContext.workingMethod" } };
  const authoritativeTool = { kind: "source_bound", source: { kind: "stage63_gauge", identity: "stage63-identity", fingerprint: FP }, label: "спицы 4 мм", authoritative: true, policyVersion: domain.POLICY_VERSIONS.tool };
  const source = assessment({ workingMethod, authoritativeTool });
  const state = domain.createInitialState(source, { createdAt: AT });
  assert.deepEqual(state.draft.workingMethod, workingMethod);
  assert.deepEqual(state.draft.edgePolicy, domain.edgePolicyFor("in_round"));
  assert.deepEqual(state.draft.toolConfirmation, authoritativeTool);
});

test("100-stitch compatibility matrix is generic modulo arithmetic", () => {
  const cases = [
    ["rib_1x1", "in_round", 0, 100, 50, true], ["rib_2x2", "in_round", 0, 100, 25, true],
    ["rib_1x1", "flat", 2, 98, 49, true], ["rib_2x2", "flat", 2, 98, null, false],
  ];
  for (const [pattern, method, edges, working, repeats, compatible] of cases) {
    const result = domain.allocationFor(domain.ribPattern(pattern), { value: method, origin: "user", explicit: true, confirmedAt: AT });
    assert.deepEqual([result.edgeCount, result.workingStitches, result.repeatCount, result.compatible], [edges, working, repeats, compatible]);
    assert.equal(result.totalCastOn, 100);
  }
  assert.equal(domain.allocationFor(domain.ribPattern("rib_2x2"), { value: "in_round", origin: "user", explicit: true, confirmedAt: AT }, 104).repeatCount, 26);
});

test("flat 2x2 cannot enter reviewing while flat 1x1 can", () => {
  const source = assessment();
  let valid = collect(domain.createInitialState(source, { createdAt: AT }), source);
  valid = domain.startReviewing(valid, { assessment: source, timestamp: AT, operationId: OPS[1] });
  assert.equal(valid.lifecycle, "reviewing");
  const invalid = collect(domain.createInitialState(source, { createdAt: AT }), source, { ribPattern: "rib_2x2" });
  assert.throws(() => domain.startReviewing(invalid, { assessment: source, timestamp: AT, operationId: OPS[1] }), (error) => error.code === "INCOMPATIBLE_REPEAT");
});

test("instruction is normalized inert user text and bound to exact support tuple", () => {
  const source = assessment();
  const state = collect(domain.createInitialState(source, { createdAt: AT }), source, { instruction: "  <b>1 лицевая</b>\r\n  https://example.test  " });
  assert.equal(state.draft.instructionSource.text, "<b>1 лицевая</b>\n https://example.test");
  assert.equal(state.draft.instructionSource.attestation.yarnAiTechnicalVerification, false);
  const wrong = structuredClone(state.draft.instructionSource); wrong.kind = "verified_builtin";
  assert.throws(() => domain.validateInstructionSource(wrong, state.draft.ribPattern, state.draft.workingMethod), (error) => error.code === "INVALID_INSTRUCTION_SOURCE");
  assert.throws(() => domain.normalizeInstruction(" "), (error) => error.code === "MISSING_INSTRUCTION");
  assert.throws(() => domain.normalizeInstruction("я".repeat(10001)), (error) => error.code === "INVALID_INSTRUCTION_SOURCE");
});

test("measurement policy is exact physical authority with no tolerance or row estimate", () => {
  const policy = domain.measurementPolicy();
  assert.deepEqual(policy.target, { kind: "height", value: 5, unit: "cm" });
  assert.equal(policy.comparison, "at_least"); assert.equal(policy.onNeedles, true);
  assert.equal(policy.tensionState, "natural_unstretched"); assert.equal(policy.toleranceCm, null);
  assert.equal(policy.authority, "physical_measurement");
  const changed = structuredClone(policy); changed.toleranceCm = 0.1;
  assert.throws(() => domain.validateMeasurementPolicy(changed), (error) => error.code === "MEASUREMENT_POLICY_VERSION_INVALID");
});

test("collecting -> reviewing -> completed creates immutable deterministic snapshot", () => {
  const source = assessment();
  let state = collect(domain.createInitialState(source, { createdAt: AT }), source);
  const editReplay = collect(state, source);
  assert.equal(editReplay.revision, state.revision);
  state = domain.startReviewing(state, { assessment: source, timestamp: AT, operationId: OPS[1] });
  const reviewFingerprint = state.draft.reviewFingerprint;
  state = domain.complete(state, { assessment: source, timestamp: AT, operationId: OPS[2], explicitConfirmation: true });
  assert.equal(state.lifecycle, "completed"); assert.equal(state.draft, null);
  assert.equal(state.completedSnapshot.fingerprint, reviewFingerprint);
  assert.equal(state.completedSnapshot.rowEstimate, null);
  assert.throws(() => domain.editDraft(state, {}, { assessment: source, timestamp: AT, operationId: OPS[3] }), (error) => error.code === "COMPLETED_PREPARATION_IMMUTABLE");
});

test("same operation id with changed payload conflicts", () => {
  const source = assessment(); const initial = domain.createInitialState(source, { createdAt: AT });
  const state = collect(initial, source);
  assert.throws(() => domain.editDraft(state, { ribPattern: "rib_1x1", workingMethod: "in_round", tool: "спицы 4 мм", instruction: "текст", instructionAttested: true, measurementAcknowledged: true }, { assessment: source, timestamp: AT, operationId: OPS[0] }), (error) => error.code === "OPERATION_ID_CONFLICT");
});

test("blocked recovery restores meaningful state and stale rebuild keeps predecessor lineage", () => {
  const source = assessment(); let state = collect(domain.createInitialState(source, { createdAt: AT }), source);
  state = domain.block(state, "STORAGE_UNAVAILABLE", { assessment: source, timestamp: AT, operationId: OPS[1] });
  assert.equal(state.lifecycle, "blocked"); assert.equal(state.blocker.previousLifecycle, "collecting");
  state = domain.revalidateBlocked(state, { assessment: source, timestamp: AT, operationId: OPS[2] });
  assert.equal(state.lifecycle, "collecting"); assert.equal(state.blocker, null);
  state = domain.markStale(state, { timestamp: AT, operationId: OPS[3], sourceFingerprint: "changed" });
  assert.equal(state.lifecycle, "stale");
  const rebuilt = domain.createInitialState(source, { epoch: 2, predecessorIdentity: state.identity, createdAt: AT });
  assert.equal(rebuilt.epoch, 2); assert.equal(rebuilt.predecessorIdentity, state.identity); assert.notEqual(rebuilt.identity, state.identity);
});

test("semantic fingerprint rejects extra keys but ignores confirmation timestamps", () => {
  const source = assessment(); let state = collect(domain.createInitialState(source, { createdAt: AT }), source);
  const corrupt = structuredClone(state); corrupt.draft.extra = true; corrupt.fingerprint = domain.fingerprint({});
  assert.throws(() => domain.validateProgressState(corrupt), (error) => error.code === "CORRUPTED_DRAFT");
  const first = state.draft.instructionSource.contentFingerprint;
  assert.equal(first, domain.fingerprint(state.draft.instructionSource.text));
});

test("route accepts exactly one query-only UUID-v7 project identity", () => {
  assert.equal(domain.projectIdentityFromLocation({ href: `http://localhost${domain.ROUTE_PATH}?project=${PROJECT_ID}` }), PROJECT_ID);
  for (const href of [`http://localhost${domain.ROUTE_PATH}`, `http://localhost${domain.ROUTE_PATH}?project=${PROJECT_ID}&extra=1`, `http://localhost${domain.ROUTE_PATH}#project=${PROJECT_ID}`]) assert.throws(() => domain.projectIdentityFromLocation({ href }));
  assert.equal(domain.safeDestination(`${domain.ROUTE_PATH}?project=${PROJECT_ID}`, PROJECT_ID).valid, true);
});

test("source assessment fails closed when Stage 69 is missing", () => {
  const result = domain.assessSource({ projectId: PROJECT_ID, project: { project_id: PROJECT_ID, active_calculation_id: CALCULATION_ID, workspace_status: "ACTIVE" }, progress: [], stage65Domain: {}, stage66Domain: {}, stage67Domain: {}, stage68Domain: {}, stage69Domain: { KIND: "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION" } });
  assert.equal(result.lifecycle, "blocked"); assert.equal(result.diagnostic.code, "STAGE69_MISSING");
});
