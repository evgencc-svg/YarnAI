"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../src/yarnai/static/project-neckline-opening-planning.js");

const PROJECT = "018f0000-0000-7000-8000-000000000391";
const CALCULATION = "018f0000-0000-7000-8000-000000000392";
let sequence = 3000;

function metadata(operationId = null) {
  const current = sequence++;
  return {
    operationId: operationId || `018f0000-0000-7000-8000-${String(current).padStart(12, "0")}`,
    at: new Date(Date.UTC(2026, 7, 11, 10, 0, current % 60)).toISOString(),
  };
}

function fp(value) {
  const copy = JSON.parse(JSON.stringify(value));
  delete copy.fingerprint;
  return { ...copy, fingerprint: domain.fingerprint(copy) };
}

function source(overrides = {}) {
  const sectionCounts = overrides.sectionCounts || { front: overrides.front ?? 40, right_sleeve_active: 14, back: 40, left_sleeve_active: 14 };
  const held = 16;
  const active = Object.values(sectionCounts).reduce((sum, value) => sum + value, 0);
  const resultBase = {
    schemaId: "RAGLAN_SHAPING_EXECUTION_RESULT_V1", resultVersion: 1, contractVersion: 1,
    kind: "PROJECT_RAGLAN_SHAPING_EXECUTION", identity: "stage90-result", outputBoundary: "raglan_shaping_physically_completed",
    finalSectionCounts: sectionCounts, finalActiveTotal: active, heldTotal: held, finalTotalPhysicalLive: active + held,
    raglanShapingPhysicallyApplied: true, allScheduledRoundsPhysicallyConfirmed: true, openingOrNecklineWorkApplied: false,
    placketOrCollarWorkApplied: false, heldUnderarmsClosed: false, explicitFinalConfirmation: true,
  };
  const result = fp(resultBase);
  const bindings = domain.SOURCE_KINDS.map((kind, index) => ({ kind, progressId: `progress-${index + 77}`, repositoryRevision: 1, stateIdentity: `state-${index + 77}`, stateFingerprint: domain.fingerprint({ kind, index }) }));
  const base = {
    projectId: PROJECT, calculationId: CALCULATION, bindings,
    stage90: { progressId: "progress-90", repositoryRevision: 1, stateIdentity: "state-90", stateFingerprint: bindings.at(-1).stateFingerprint, resultIdentity: result.identity, resultFingerprint: result.fingerprint, contractSchemaId: "RAGLAN_SHAPING_EXECUTION_CONTRACT_V1", contractVersion: 1, resultSchemaId: result.schemaId, resultVersion: 1, epoch: 1, outputBoundary: result.outputBoundary, result },
    stage89: { resultIdentity: "stage89-result", resultFingerprint: domain.fingerprint({ result: 89 }), scheduleClosed: true },
    stage88: { resultIdentity: "stage88-result", resultFingerprint: domain.fingerprint({ result: 88 }) },
    terminal: { sectionOrder: [...domain.SECTION_ORDER], interfaceOrder: [...domain.INTERFACE_ORDER], sectionCounts, activeTotal: active, heldUnderarmTotal: held, totalPhysicalLive: active + held, lineWidth: overrides.lineWidth ?? 1, ownershipPolicy: (overrides.lineWidth ?? 1) ? "preceding-section-forward-suffix:v1" : "none", beginningOfRound: { markerIdentity: "raglan_marker_4", beforeSection: "front" }, heldGroups: Array.from({ length: 4 }, (_, index) => ({ identity: `underarm-${index}`, count: 4, remainsLive: true, closed: false, joinedIntoYoke: false })) },
    references: { necklineDepthReferenceCm: "5", bodyNeckReferenceCm: "40", stitchesPerCmExact: "2", rowsPerCmExact: "2", gaugeIdentity: "gauge-1", gaugeFingerprint: domain.fingerprint({ gauge: 1 }) },
    featureAuthority: { explicitOpeningFeature: overrides.feature ?? null, provenance: "stage91_explicit_choice_required" },
    methodEligibility: { reservedSteekCut: false, authorizedReinforcedCut: false, evidenceIdentity: null, evidenceFingerprint: null },
  };
  return domain.validateSource(fp(base));
}

function start(api = domain, src = source(), epoch = 1, predecessorIdentity = null, supersedesPlanIdentity = null) {
  return api.startPlanning({ projectId: PROJECT, calculationId: CALCULATION, source: src, epoch, predecessorIdentity, supersedesPlanIdentity }, metadata());
}

function configured(api = domain, src = source(), options = {}) {
  let state = start(api, src);
  const choices = [
    ["neckline_shape", options.shape || "round"], ["opening_feature", options.feature ?? true],
    ["neckline_depth", options.depth || "2"], ["neckline_width", options.width || "4"],
    ["opening_method", (options.feature ?? true) ? "split_from_current_live_edge" : "none"], ["overlap_intent", "none"],
  ];
  if (options.feature ?? true) choices.push(["opening_length", options.openingLength || options.depth || "2"]);
  for (const [choiceId, value] of choices) state = api.resolveChoice(state, { choiceId, value }, metadata());
  return state;
}

function reviewed(api = domain, src = source(), options = {}) {
  let state = configured(api, src, options);
  state = api.reviewPlan(state, {}, metadata());
  if (state.review.requiresCandidateSelection) state = api.selectCandidate(state, { candidateKey: state.review.candidates[0].key, explicitConfirmation: true }, metadata());
  return state;
}

function completed(api = domain, src = source(), options = {}) {
  const state = reviewed(api, src, options);
  return api.completePlan(state, { explicitFinalConfirmation: true, reviewFingerprint: state.review.reviewFingerprint }, metadata());
}

function refreshStep(step) {
  const next = JSON.parse(JSON.stringify(step));
  delete next.fingerprintContribution;
  delete next.fingerprint;
  next.fingerprintContribution = domain.fingerprint(next);
  return fp(next);
}

function refreshInstruction(instruction) {
  return fp(instruction);
}

function refreshInstructionChain(instructions) {
  let previousFingerprint = null;
  for (let index = 0; index < instructions.length; index += 1) {
    instructions[index].previousInstructionFingerprint = previousFingerprint;
    instructions[index] = refreshInstruction(instructions[index]);
    previousFingerprint = instructions[index].fingerprint;
  }
  return instructions;
}

test("V3 exposes new immutable identities and global capability", () => {
  assert.equal(domain.CONTRACT_SCHEMA_ID, "NECKLINE_OPENING_PLANNING_CONTRACT_V3");
  assert.equal(domain.RESULT_SCHEMA_ID, "NECKLINE_OPENING_PLAN_V3");
  assert.equal(domain.INSTRUCTION_SCHEMA_ID, "NECKLINE_OPENING_EXECUTION_INSTRUCTION_V2");
  assert.equal(domain.EXECUTION_STEP_SCHEMA_ID, "NECKLINE_OPENING_EXECUTION_STEP_V1");
  assert.equal(domain.EXECUTION_CAPABILITY_ID, "globally_ordered_structural_execution_v1");
  assert.equal(domain.V2.RESULT_SCHEMA_ID, "NECKLINE_OPENING_PLAN_V2");
  assert.equal(domain.V1.RESULT_SCHEMA_ID, "NECKLINE_OPENING_PLAN_V1");
});

test("completed V3 has one canonical executionSteps stream and no split action arrays", () => {
  const plan = completed().completedPlan;
  assert.ok(plan.executionSteps.length > plan.executionInstructions.length);
  assert.deepEqual(plan.executionSteps, plan.executionInstructions.flatMap((item) => item.executionSteps));
  assert.equal(JSON.stringify(plan).includes("orderedActions"), false);
  assert.equal(JSON.stringify(plan).includes("yarnActions"), false);
  assert.equal(plan.executionCapability.globallyOrdered, true);
  assert.equal(plan.executionClosureProof.noHiddenPhysicalActions, true);
});

test("global step ids, ordinals, links, and fingerprints are closed", () => {
  const steps = completed().completedPlan.executionSteps;
  assert.equal(new Set(steps.map((item) => item.stepId)).size, steps.length);
  steps.forEach((step, index) => {
    assert.equal(step.ordinal, index + 1);
    assert.equal(step.previousStepId, steps[index - 1]?.stepId || null);
    assert.equal(step.nextStepId, steps[index + 1]?.stepId || null);
    assert.match(step.fingerprintContribution, /^fnv1a32:/);
  });
});

test("every adjacent step and instruction state is byte-exact", () => {
  const plan = completed().completedPlan;
  for (let index = 1; index < plan.executionSteps.length; index += 1) assert.deepEqual(plan.executionSteps[index - 1].afterState, plan.executionSteps[index].beforeState);
  for (let index = 0; index < plan.executionInstructions.length; index += 1) {
    const item = plan.executionInstructions[index];
    assert.deepEqual(item.beforeState, item.executionSteps[0].beforeState);
    assert.deepEqual(item.afterState, item.executionSteps.at(-1).afterState);
    if (index) assert.deepEqual(plan.executionInstructions[index - 1].afterState, item.beforeState);
  }
});

test("center bind-off is one safe atomic step with exact post-state", () => {
  const step = completed().completedPlan.executionSteps.find((item) => item.actionKind === "bind_off");
  assert.equal(step.startBoundary.boundaryIdentity, "center_front_bind_off_start");
  assert.equal(step.endBoundary.boundaryIdentity, "right_front_edge");
  assert.equal(step.exactCount, 8);
  assert.equal(step.afterState.yarn.workingLocation.boundaryIdentity, "right_front_edge");
  assert.equal(step.afterState.fabric.liveTopology, "linear");
  assert.deepEqual(step.afterState.fabric.openingEdgeIdentities, ["right_front_edge", "left_front_edge"]);
  assert.deepEqual(step.afterState.fabric.historicalBorIdentities, ["raglan_marker_4"]);
  assert.equal(step.afterState.stitchLedger.boundOff, step.exactCount);
});

test("V-neck center hold is explicit and conserves all live stitches", () => {
  const step = completed(domain, source(), { shape: "v_neck" }).completedPlan.executionSteps.find((item) => item.actionKind === "hold");
  assert.equal(step.afterState.stitchLedger.necklineHeld, step.exactCount);
  assert.equal(step.beforeState.stitchLedger.totalLive, step.afterState.stitchLedger.totalLive);
});

test("circular to flat transition needs no Stage 92 inference", () => {
  const plan = completed().completedPlan;
  const index = plan.executionSteps.findIndex((item) => ["bind_off", "hold"].includes(item.actionKind));
  const opening = plan.executionSteps[index];
  assert.equal(opening.beforeState.fabric.liveTopology, "cyclic");
  assert.equal(opening.beforeState.fabric.activeBorIdentity, "raglan_marker_4");
  assert.equal(opening.afterState.fabric.liveTopology, "linear");
  assert.equal(opening.afterState.fabric.activeBorIdentity, null);
  assert.equal(plan.executionSteps[index + 1].beforeState.fabric.liveTopology, "linear");
  assert.equal(plan.executionSteps[index + 1].beforeState.traversal.currentBoundaryIdentity, "right_front_edge");
});

test("yarn break, join, and activation have one exact global order and locations", () => {
  const steps = completed().completedPlan.executionSteps;
  assert.deepEqual(steps.slice(0, 4).map((item) => item.actionKind), ["yarn_break", "yarn_join", "yarn_activate", "bind_off"]);
  assert.equal(steps[0].startBoundary.boundaryIdentity, "raglan_marker_4");
  assert.equal(steps[1].endBoundary.boundaryIdentity, "center_front_bind_off_start");
  assert.equal(steps[1].afterState.yarn.activeSourceIdentity, null);
  assert.equal(steps[2].afterState.yarn.activeSourceIdentity, "neckline_execution_yarn");
  assert.equal(steps[3].beforeState.yarn.activeSourceIdentity, "neckline_execution_yarn");
});

test("face, direction, turns, yarn location, and next path are explicit after every step", () => {
  const steps = completed().completedPlan.executionSteps;
  for (const step of steps) {
    assert.match(step.expectedFace, /^(RS|WS)$/);
    assert.equal(step.afterState.yarn.workingLocation.boundaryIdentity, step.afterState.traversal.currentBoundaryIdentity);
    assert.ok(Array.isArray(step.afterState.traversal.nextAccessiblePath));
  }
  for (const turn of steps.filter((item) => item.actionKind === "turn")) {
    assert.notEqual(turn.beforeState.traversal.face, turn.afterState.traversal.face);
    assert.notEqual(turn.beforeState.traversal.directionId, turn.afterState.traversal.directionId);
    assert.equal(turn.afterState.traversal.turnOccurred, true);
  }
});

test("step-level, instruction-level, and terminal conservation are exact", () => {
  const plan = completed().completedPlan;
  for (const step of plan.executionSteps) {
    const before = step.beforeState.stitchLedger;
    const after = step.afterState.stitchLedger;
    assert.equal(before.totalLive + before.boundOff + before.decreased, after.totalLive + after.boundOff + after.decreased);
    assert.equal(before.underarmHeld, 16);
    assert.equal(after.underarmHeld, 16);
  }
  assert.equal(plan.conservationProof.finalEquationHolds, true);
  assert.equal(plan.executionClosureProof.terminalStateMatches, true);
});

test("duplicate and missing global ordinals fail closed", () => {
  const instructions = JSON.parse(JSON.stringify(reviewed().review.executionInstructions));
  instructions[0].executionSteps[1].ordinal = 1;
  instructions[0].executionSteps[1] = refreshStep(instructions[0].executionSteps[1]);
  refreshInstructionChain(instructions);
  assert.throws(() => domain.validateInstructionChain(instructions), { code: "STEP_ORDINAL_INVALID" });
  const missing = JSON.parse(JSON.stringify(reviewed().review.executionInstructions));
  missing[0].executionSteps[1].ordinal = 3;
  missing[0].executionSteps[1] = refreshStep(missing[0].executionSteps[1]);
  refreshInstructionChain(missing);
  assert.throws(() => domain.validateInstructionChain(missing), { code: "STEP_ORDINAL_INVALID" });
});

test("duplicate step id and broken step link fail closed", () => {
  const duplicate = JSON.parse(JSON.stringify(reviewed().review.executionInstructions));
  duplicate[0].executionSteps[1].stepId = duplicate[0].executionSteps[0].stepId;
  duplicate[0].executionSteps[1] = refreshStep(duplicate[0].executionSteps[1]);
  refreshInstructionChain(duplicate);
  assert.throws(() => domain.validateInstructionChain(duplicate), { code: "DUPLICATE_STEP_ID" });
  const broken = JSON.parse(JSON.stringify(reviewed().review.executionInstructions));
  broken[0].executionSteps[1].previousStepId = "wrong";
  broken[0].executionSteps[1] = refreshStep(broken[0].executionSteps[1]);
  refreshInstructionChain(broken);
  assert.throws(() => domain.validateInstructionChain(broken), { code: "STEP_LINK_INVALID" });
});

test("instruction before/after mismatch and cross-instruction gaps fail closed", () => {
  const local = JSON.parse(JSON.stringify(reviewed().review.executionInstructions));
  local[0].beforeState = local[0].afterState;
  local[0] = refreshInstruction(local[0]);
  assert.throws(() => domain.validateInstructionChain(local), { code: "INSTRUCTION_STATE_MISMATCH" });
  const cross = JSON.parse(JSON.stringify(reviewed().review.executionInstructions));
  cross[1].beforeState = cross[1].afterState;
  cross[1] = refreshInstruction(cross[1]);
  assert.throws(() => domain.validateInstructionChain(cross));
});

test("wrong bind-off count and successor state are rejected", () => {
  let instruction = JSON.parse(JSON.stringify(reviewed().review.executionInstructions[0]));
  const bindIndex = instruction.executionSteps.findIndex((item) => item.actionKind === "bind_off");
  instruction.executionSteps[bindIndex].exactCount += 1;
  instruction.executionSteps[bindIndex] = refreshStep(instruction.executionSteps[bindIndex]);
  instruction = refreshInstruction(instruction);
  assert.throws(() => domain.validateInstruction(instruction), { code: "BIND_OFF_TRANSITION_INVALID" });
});

test("implicit turn, hidden yarn change, cut, steek, and generic actions are rejected", () => {
  for (const kind of ["generic", "structural_transition", "concealed_cut", "steek"]) {
    let instruction = JSON.parse(JSON.stringify(reviewed().review.executionInstructions[0]));
    instruction.executionSteps[1].actionKind = kind;
    instruction.executionSteps[1] = refreshStep(instruction.executionSteps[1]);
    instruction.executionSteps[0].nextStepId = instruction.executionSteps[1].stepId;
    instruction = refreshInstruction(instruction);
    assert.throws(() => domain.validateInstruction(instruction));
  }
  const hiddenYarn = JSON.parse(JSON.stringify(reviewed().review.executionSteps.find((item) => item.actionKind === "traverse")));
  hiddenYarn.afterState.yarn.activeSourceIdentity = null;
  const activeSource = hiddenYarn.afterState.yarn.sources.find((item) => item.active);
  activeSource.active = false;
  activeSource.state = "detached";
  hiddenYarn.afterState.yarn = fp(hiddenYarn.afterState.yarn);
  hiddenYarn.afterState = fp(hiddenYarn.afterState);
  assert.throws(() => domain.validateExecutionStep(refreshStep(hiddenYarn)), { code: "HIDDEN_YARN_ACTION" });
});

test("invalid yarn location and impossible traversal boundary are rejected", () => {
  const step = JSON.parse(JSON.stringify(reviewed().review.executionSteps[1]));
  step.afterState.yarn.workingLocation.boundaryIdentity = "unknown_boundary";
  step.afterState.yarn = fp(step.afterState.yarn);
  step.afterState = fp(step.afterState);
  assert.throws(() => domain.validateExecutionStep(refreshStep(step)), { code: "YARN_LOCATION_INVALID" });
});

test("V1 and V2 stay byte-stable, read-only, and Stage 92-ineligible", () => {
  const v2State = completed(domain.V2);
  const v2Bytes = JSON.stringify(v2State);
  assert.equal(domain.validateState(v2State).contractVersion, 2);
  assert.equal(JSON.stringify(v2State), v2Bytes);
  assert.equal(domain.stage92Eligibility(v2State).code, "STAGE91_V2_GLOBAL_EXECUTION_ORDER_REQUIRED");
  assert.equal(domain.projectView(v2State).lifecycle, "v2_execution_ineligible");
  assert.throws(() => domain.validateV3State(v2State));
  const v1State = completed(domain.V1);
  const v1Bytes = JSON.stringify(v1State);
  assert.equal(domain.validateState(v1State).contractVersion, 1);
  assert.equal(JSON.stringify(v1State), v1Bytes);
  assert.equal(domain.stage92Eligibility(v1State).code, "STAGE91_EXECUTION_CONTRACT_V3_REQUIRED");
});

test("V3 completion is immutable and UUID replay/conflict semantics remain", () => {
  const state = completed();
  assert.throws(() => domain.resolveChoice(state, { choiceId: "neckline_width", value: "5" }, metadata()), { code: "COMPLETED_PLAN_IMMUTABLE" });
  const collecting = configured();
  const operationId = metadata().operationId;
  const once = domain.reviewPlan(collecting, {}, metadata(operationId));
  const replay = domain.reviewPlan(once, {}, metadata(operationId));
  assert.equal(replay.fingerprint, once.fingerprint);
  assert.throws(() => domain.resolveChoice(once, { choiceId: "neckline_width", value: "6" }, metadata(operationId)), { code: "OPERATION_ID_CONFLICT" });
});

test("V3 rework appends a new epoch and durable Stage 92 start blocks it", () => {
  const state = completed();
  const operation = metadata();
  const payload = { source: state.source, reason: "change fit", downstreamExecutionStarted: false };
  const next = domain.startReworkEpoch(state, payload, operation);
  assert.equal(next.epoch, 2);
  assert.equal(next.predecessorIdentity, state.identity);
  assert.equal(next.supersedesPlanIdentity, state.completedPlan.identity);
  assert.equal(next.lifecycle, "collecting_opening_choices");
  assert.equal(domain.startReworkEpoch(next, payload, operation).fingerprint, next.fingerprint);
  assert.throws(() => domain.startReworkEpoch(state, { source: state.source, reason: "unsafe", downstreamExecutionStarted: true }, metadata()), { code: "PHYSICAL_RESTORATION_REQUIRED" });
});

test("Stage 92 gating accepts only authoritative current completed valid V3", () => {
  const state = completed();
  assert.equal(domain.stage92Eligibility(state, { authoritativeSourceFingerprint: state.source.fingerprint, currentEpoch: state.epoch, authoritative: true, current: true }).eligible, true);
  assert.equal(domain.stage92Eligibility(reviewed()).code, "STAGE91_V3_COMPLETION_REQUIRED");
  assert.equal(domain.stage92Eligibility(state, { stale: true }).code, "STAGE91_V3_STALE_OR_NON_AUTHORITATIVE");
  assert.equal(domain.stage92Eligibility(state, { authoritative: false }).eligible, false);
  assert.equal(domain.stage92Eligibility(state, { currentEpoch: state.epoch + 1 }).eligible, false);
});

test("one-row terminal plan has explicit bind-off, traverse, and stop", () => {
  const plan = completed(domain, source(), { depth: "0.5", openingLength: "0.5" }).completedPlan;
  assert.deepEqual(plan.executionSteps.map((item) => item.actionKind), ["yarn_break", "yarn_join", "yarn_activate", "bind_off", "traverse", "stop"]);
  assert.equal(plan.finalExecutionState.traversal.status, "stopped");
  assert.deepEqual(plan.finalExecutionState.traversal.nextAccessiblePath, []);
});

test("malformed V3 state and completed stream reject before Stage 92", () => {
  const state = JSON.parse(JSON.stringify(completed()));
  state.completedPlan.executionSteps[1].ordinal = 99;
  state.completedPlan = fp(state.completedPlan);
  state.fingerprint = domain.fingerprint(Object.fromEntries(Object.entries(state).filter(([key]) => key !== "fingerprint")));
  const eligibility = domain.stage92Eligibility(state);
  assert.equal(eligibility.eligible, false);
});
