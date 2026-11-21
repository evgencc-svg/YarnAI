"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/yarnai/static/pattern-execution-plan.js");
const reviewApi = require("../src/yarnai/static/pattern-technology-review.js");

function fixture() {
  const operations = [];
  let total = 0;
  let state = { totalStitches: 0, allocation: { yoke: 0, body: 0, rightSleeve: 0, leftSleeve: 0, neckline: 0 }, held: { rightSleeve: 0, leftSleeve: 0 }, availableEdges: { necklineCastOn: 0 }, rowMode: "round", direction: "round", beginningOfRound: "cast_on", needleState: "smaller" };
  const add = (identity, kind, nextTotal = total, details = {}) => {
    const { allocationAfter, heldAfter, availableEdgesAfter, ...operationDetails } = details;
    const inputState = JSON.parse(JSON.stringify(state));
    total = nextTotal;
    state = { ...JSON.parse(JSON.stringify(state)), totalStitches: total };
    if (allocationAfter) state.allocation = { ...state.allocation, ...allocationAfter };
    if (heldAfter) state.held = { ...state.held, ...heldAfter };
    if (availableEdgesAfter) state.availableEdges = { ...state.availableEdges, ...availableEdgesAfter };
    operations.push({ identity, order: operations.length + 1, kind, sourceEvidenceUnitIdentity: `evidence:${kind}`, sourceLocator: { page: 1, text: kind }, inputState, outputState: JSON.parse(JSON.stringify(state)), change: { input: inputState.totalStitches, delta: total - inputState.totalStitches, repeatCount: 1, output: total }, ...operationDetails });
  };
  add("execution:cast-on", "cast_on", 102, { allocationAfter: { yoke: 102 }, availableEdgesAfter: { necklineCastOn: 102 } });
  add("execution:join-bor", "join_round");
  add("execution:deferred-neckline-initial-round", "deferred_neckline_setup");
  add("execution:neckline-increase", "increase", 140, { allocationAfter: { yoke: 140 }, increaseDistribution: reviewApi.buildEvenIncreaseDistribution(102, 38) });
  add("execution:yoke-marker-setup", "marker_setup");
  for (let repeat = 1; repeat <= 20; repeat += 1) {
    add(`execution:raglan-increase:${repeat}`, "raglan_increase", total + 8, { repeatOrdinal: repeat, allocationAfter: { yoke: total + 8 } });
    add(`execution:raglan-plain:${repeat}`, "raglan_plain_round", total, { repeatOrdinal: repeat });
  }
  add("execution:yoke-depth", "measure_until", total, { physicalCondition: { adaptedValue: 7.75, unit: "in", measurementAuthoritative: true } });
  add("execution:short-row-marker", "short_row_marker_setup");
  for (let row = 1; row <= 12; row += 1) add(`execution:short-row:${row}`, "short_row", total, { physicalRowOrdinal: row, repeatOrdinal: row < 3 ? 1 : Math.floor((row - 3) / 2) + 1, direction: row % 2 ? "RS" : "WS" });
  add("execution:short-row-recovery", "short_row_recovery_round");
  add("execution:shift-bor", "shift_bor");
  add("execution:separation", "separation", 324, { allocationAfter: { yoke: 0, body: 204 }, heldAfter: { rightSleeve: 60, leftSleeve: 60 } });
  add("execution:body-measure", "measure_until", total, { physicalCondition: { adaptedValue: 15, unit: "in", measurementAuthoritative: true } });
  add("execution:body-ribbing", "ribbing", total, { physicalCondition: { adaptedValue: 2, unit: "in", measurementAuthoritative: true } });
  add("execution:body-bind-off", "bind_off", 120, { allocationAfter: { body: 0 } });
  for (const side of ["right", "left"]) {
    const allocationKey = `${side}Sleeve`;
    add(`execution:${side}-sleeve-setup`, "sleeve_setup", total + 12, { allocationAfter: { [allocationKey]: 72 }, heldAfter: { [allocationKey]: 0 } });
    add(`execution:${side}-sleeve-initial-length`, "measure_until", total, { allocationAfter: { [allocationKey]: 72 }, physicalCondition: { adaptedValue: 7, unit: "in", measurementAuthoritative: true } });
    let sleeveStitches = 72;
    for (let repeat = 1; repeat <= 12; repeat += 1) {
      sleeveStitches -= 2;
      add(`execution:${side}-sleeve-decrease:${repeat}`, "sleeve_decrease", total - 2, { repeatOrdinal: repeat, intervalRounds: repeat === 12 ? 0 : 6, allocationAfter: { [allocationKey]: sleeveStitches } });
      if (repeat < 12) add(`execution:${side}-sleeve-even:${repeat}`, "work_even", total, { rounds: 5, allocationAfter: { [allocationKey]: sleeveStitches } });
    }
    add(`execution:${side}-sleeve-to-target`, "measure_until", total, { allocationAfter: { [allocationKey]: 48 }, physicalCondition: { adaptedValue: 18, unit: "in", measurementAuthoritative: true, estimatedRemainingRounds: 7 } });
    add(`execution:${side}-cuff`, "ribbing", total, { allocationAfter: { [allocationKey]: 48 }, physicalCondition: { adaptedValue: 2, unit: "in", measurementAuthoritative: true } });
    add(`execution:${side}-cuff-bind-off`, "bind_off", total - 48, { allocationAfter: { [allocationKey]: 0 } });
  }
  add("execution:neckline-pickup", "pick_up_stitches", 102, { allocationAfter: { neckline: 102 } });
  add("execution:neckline-ribbing", "ribbing", total, { allocationAfter: { neckline: 102 }, physicalCondition: { adaptedValue: 1.25, unit: "in", measurementAuthoritative: true } });
  add("execution:neckline-bind-off", "bind_off", 0, { allocationAfter: { neckline: 0 } });
  add("execution:finish-underarms", "finish_underarms");
  add("execution:weave-ends", "weave_ends");
  add("execution:block", "block");
  assert.equal(operations.length, 127);
  const executable = {
    identity: "executable-technology-plan-input:test", fingerprint: "fnv1a32:11111111", algorithmId: "stage20-v2-branch-resolved-adapted-execution:v5",
    binding: { stage20ResultIdentity: "technology-result:test", stage20SourceProjectionFingerprint: "fnv1a32:22222222", sourceInstructionEvidenceIdentity: "evidence:test", sourceInstructionEvidenceRevision: 42, sourceInstructionEvidenceFingerprint: "fnv1a32:33333333", sourceDocumentIdentity: "document:test", sourceDocumentFingerprint: "sha256:test", userAdaptationProfileFingerprint: "fnv1a32:44444444" },
    evidence: { sourcePatternEvidence: { facts: { needles: [4.5] } }, userAdaptationProfile: { gauge: [{ stitches: 20, rows: 28, per: 10, unit: "cm" }], needles: [{ canonicalValue: 4, unit: "mm" }], yarn: { name: "test yarn" } }, sourceInstructionEvidence: { resultIdentity: "evidence-result:test", resultFingerprint: "fnv1a32:55555555" } },
    numericProvenance: [{ selectedSizeLabel: "ML" }],
    branchSelection: { fingerprint: "fnv1a32:66666666", selectedOptions: [{ groupId: "neckline_method", selectedOptionId: "ribbing_last" }, { groupId: "short_rows", selectedOptionId: "include" }, { groupId: "body_length", selectedOptionId: "regular" }, { groupId: "sleeve_length", selectedOptionId: "long" }] },
    adaptedExecution: { status: "ready", operations, adaptationProfile: { identity: "adaptation:test", revision: 7, fingerprint: "fnv1a32:44444444" }, solverIdentity: "solver:test", solverFingerprint: "fnv1a32:77777777", evidenceFingerprint: "fnv1a32:33333333", branchFingerprint: "fnv1a32:66666666", validation: { isValid: true, errors: [] }, sleeveSchedule: { decreaseCycleRounds: 6 } },
  };
  return { reviewIdentity: { id: "review:test", projectId: "project:test", revision: 19 }, reviewRevision: 19, confirmedSnapshotFingerprint: "fnv1a32:88888888", executableTechnologyPlanInput: executable, confirmedValues: [{ targetId: "executable-plan-review:0b7eaa26", decision: "accepted", value: { identity: executable.identity, adaptedOperationCount: 127 } }] };
}

test("adapted Stage 22 preserves all 127 confirmed operations one-to-one", () => {
  const snapshot = fixture();
  const { plan, blockers } = api.derivePlan(snapshot, { id: "review:test", revision: 19 });
  assert.equal(blockers.length, 0);
  assert.equal(plan.contractId, "PATTERN_EXECUTION_PLAN_V2");
  assert.equal(plan.steps.length, 127);
  assert.equal(new Set(plan.steps.map((entry) => entry.sourceOperationIdentity)).size, 127);
  assert.equal(plan.steps.filter((entry) => entry.type === "short_row").length, 12);
  assert.equal(plan.steps.filter((entry) => entry.type === "raglan_increase").length, 20);
  assert.equal(plan.steps.find((entry) => entry.sourceOperationIdentity === "execution:right-cuff").activeStitchesAfter, 48);
  assert.equal(plan.steps.find((entry) => entry.sourceOperationIdentity === "execution:left-cuff").activeStitchesAfter, 48);
  const necklinePickup = plan.steps.find((entry) => entry.type === "pick_up_stitches");
  assert.deepEqual([necklinePickup.activeStitchesBefore, necklinePickup.activeStitchesAfter], [0, 102]);
  assert.ok(plan.steps.filter((entry) => entry.type === "ribbing").every((entry) => entry.criterion.type === "measurement"));
  assert.deepEqual(plan.summary.needles, ["4 mm", "4.5 mm"]);
  assert.match(plan.steps[2].instruction, /большие спицы 4\.5 mm/);
  assert.match(plan.steps[3].instruction, /12 раз \[3 лиц\., M1, 3 лиц\., M1, 2 лиц\., M1\]/);
  assert.match(plan.steps[3].instruction, /\[3 лиц\., M1, 3 лиц\., M1\]/);
  assert.match(plan.steps[3].instruction, /102 исходные петли; на спицах 140 петель/);
  assert.match(plan.steps.find((entry) => entry.type === "raglan_plain_round").instruction, /4 лиц\., 14 изн\., 4 лиц\./);
  assert.match(plan.steps.find((entry) => entry.type === "short_row_marker_setup").instruction, /45 из 90 петель спинки/);
  assert.match(plan.steps.find((entry) => entry.type === "short_row_marker_setup").instruction, /останется 45 петель спинки/);
  assert.ok(plan.steps.filter((entry) => entry.type === "short_row" && entry.repeat.physicalRowOrdinal >= 2 && entry.repeat.physicalRowOrdinal % 2 === 0).every((entry) => /до CB, переснять маркер/.test(entry.instruction)));
  assert.equal(plan.initialExecutionState.started, false);
  assert.equal(plan.initialExecutionState.completedStepCount, 0);
  assert.deepEqual(api.validateStructural(plan), []);
  assert.deepEqual(api.validateSemantic(plan), []);
});

test("adapted Stage 22 fails closed when one confirmed operation is lost", () => {
  const { plan } = api.derivePlan(fixture(), { id: "review:test", revision: 19 });
  const damaged = JSON.parse(JSON.stringify(plan));
  damaged.steps.splice(63, 1);
  const codes = [...api.validateStructural(damaged), ...api.validateSemantic(damaged)].map((entry) => entry.code);
  assert.ok(codes.includes("PLAN_SCHEMA_INVALID") || codes.includes("ADAPTED_STEP_COVERAGE_INVALID"));
});

test("adapted Stage 22 fails closed when literal increase distribution is removed", () => {
  const { plan } = api.derivePlan(fixture(), { id: "review:test", revision: 19 });
  const damaged = JSON.parse(JSON.stringify(plan));
  const increase = damaged.steps.find((entry) => entry.type === "increase");
  increase.instruction = increase.description = "Равномерно прибавь 38 петель: 102 → 140.";
  const phaseAction = damaged.phases.flatMap((entry) => entry.actions).find((entry) => entry.type === "increase");
  phaseAction.instruction = phaseAction.description = increase.instruction;
  damaged.resultFingerprint = api.fingerprint({ contractId: damaged.contractId, resultKind: damaged.resultKind, algorithmId: damaged.algorithmId, handoff: damaged.handoff, summary: damaged.summary, phases: damaged.phases, steps: damaged.steps, initialExecutionState: damaged.initialExecutionState, coverage: damaged.coverage });
  assert.ok(api.validateSemantic(damaged).some((entry) => entry.code === "ADAPTED_INCREASE_SCHEDULE_INVALID"));
});

test("adapted Stage 22 fails closed when an even short row omits the CB marker transfer", () => {
  const { plan } = api.derivePlan(fixture(), { id: "review:test", revision: 19 });
  const damaged = JSON.parse(JSON.stringify(plan));
  const row4 = damaged.steps.find((entry) => entry.type === "short_row" && entry.repeat.physicalRowOrdinal === 4);
  row4.instruction = row4.description = row4.instruction.replace("до CB, переснять маркер, изнаночными ", "");
  const phaseAction = damaged.phases.flatMap((entry) => entry.actions).find((entry) => entry.stepId === row4.stepId);
  phaseAction.instruction = phaseAction.description = row4.instruction;
  damaged.resultFingerprint = api.fingerprint({ contractId: damaged.contractId, resultKind: damaged.resultKind, algorithmId: damaged.algorithmId, handoff: damaged.handoff, summary: damaged.summary, phases: damaged.phases, steps: damaged.steps, initialExecutionState: damaged.initialExecutionState, coverage: damaged.coverage });
  assert.ok(api.validateSemantic(damaged).some((entry) => entry.code === "ADAPTED_SHORT_ROW_MARKER_INVALID"));
});

test("adapted Stage 22 fails closed when short row 2 omits the CB marker transfer", () => {
  const { plan } = api.derivePlan(fixture(), { id: "review:test", revision: 19 });
  const damaged = JSON.parse(JSON.stringify(plan));
  const row2 = damaged.steps.find((entry) => entry.type === "short_row" && entry.repeat.physicalRowOrdinal === 2);
  row2.instruction = row2.description = row2.instruction.replace("до CB, переснять маркер, ", "");
  const phaseAction = damaged.phases.flatMap((entry) => entry.actions).find((entry) => entry.stepId === row2.stepId);
  phaseAction.instruction = phaseAction.description = row2.instruction;
  damaged.resultFingerprint = api.fingerprint({ contractId: damaged.contractId, resultKind: damaged.resultKind, algorithmId: damaged.algorithmId, handoff: damaged.handoff, summary: damaged.summary, phases: damaged.phases, steps: damaged.steps, initialExecutionState: damaged.initialExecutionState, coverage: damaged.coverage });
  assert.ok(api.validateSemantic(damaged).some((entry) => entry.code === "ADAPTED_SHORT_ROW_MARKER_INVALID"));
});

test("adapted Stage 22 fails closed when CB uses the unadapted back center", () => {
  const { plan } = api.derivePlan(fixture(), { id: "review:test", revision: 19 });
  const damaged = JSON.parse(JSON.stringify(plan));
  const marker = damaged.steps.find((entry) => entry.type === "short_row_marker_setup");
  marker.instruction = marker.description = "Лицевыми до третьего маркера, затем 40 лицевых и поставь маркер центра спинки (CB).";
  const phaseAction = damaged.phases.flatMap((entry) => entry.actions).find((entry) => entry.stepId === marker.stepId);
  phaseAction.instruction = phaseAction.description = marker.instruction;
  damaged.resultFingerprint = api.fingerprint({ contractId: damaged.contractId, resultKind: damaged.resultKind, algorithmId: damaged.algorithmId, handoff: damaged.handoff, summary: damaged.summary, phases: damaged.phases, steps: damaged.steps, initialExecutionState: damaged.initialExecutionState, coverage: damaged.coverage });
  assert.ok(api.validateSemantic(damaged).some((entry) => entry.code === "ADAPTED_SHORT_ROW_CENTER_INVALID"));
});
