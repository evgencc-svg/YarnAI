"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const planDomain = require("../src/yarnai/static/project-execution-plan.js");
const stage66Domain = require("../src/yarnai/static/project-execution-start.js");
const stage67Domain = require("../src/yarnai/static/project-execution-first-step.js");
const domain = require("../src/yarnai/static/project-execution-next-step.js");
const userWorkspace = require("../src/yarnai/static/user-workspace-entry.js");
const realChain = require("./stage60-to-66-saved-chain.cjs");

const PROJECT_ID = "019fc4aa-5100-7001-8af9-bd06e3bff101";
const CALCULATION_ID = "019fc4aa-5100-7002-8af9-bd06e3bff102";
const TIMES = Array.from({ length: 10 }, (_, index) => `2026-08-04T08:${String(index).padStart(2, "0")}:00.000Z`);
const OPS = Array.from({ length: 10 }, (_, index) => `019fc4aa-5100-7${String(100 + index).slice(-3)}-8af9-bd06e3bff${String(200 + index).slice(-3)}`);

function planStep(sequenceNumber, overrides = {}) {
  const type = overrides.type || (sequenceNumber === 1 ? "CAST_ON" : "FOUNDATION_SECTION");
  return {
    identity: `${PROJECT_ID}:plan-step:${type.toLowerCase()}:${sequenceNumber}`,
    sequenceNumber,
    type,
    title: overrides.title || (type === "CAST_ON" ? "Набрать 100 петель" : "Выполнить подтверждённый начальный участок"),
    purpose: overrides.purpose || (type === "CAST_ON" ? "Создать подтверждённый начальный набор." : "Связать начальный участок по подтверждённой технологии."),
    status: overrides.status || "confirmed",
    source: overrides.source || { stage: type === "CAST_ON" ? "PROJECT_CALCULATION_ENTRY" : "CONFIRMED_TECHNOLOGY", identity: type === "CAST_ON" ? CALCULATION_ID : "technology-1" },
    confidence: overrides.status === "conditional" ? "limited" : "high",
    requiredInputs: overrides.requiredInputs || [],
    expectedOutput: overrides.expectedOutput || (type === "CAST_ON" ? { stitchCount: 100, semanticRole: "body" } : { foundationType: "ribbing" }),
    validationCheckpoint: { type: type === "CAST_ON" ? "count_stitches" : "user_verification", description: "Проверить результат." },
    dependencies: sequenceNumber === 1 ? [] : [`${PROJECT_ID}:plan-step:cast_on:1`],
    warnings: [], assumptions: [], provenance: [{ sourceStage: "PROJECT_CALCULATION_ENTRY", sourceIdentity: CALCULATION_ID }],
  };
}

function completedPlan(second = planStep(2)) {
  const sourceIdentities = { project: PROJECT_ID, closure: "stage60", initialization: "stage61", gauge: "stage63", calculation: CALCULATION_ID, technology: "technology-1", materials: [] };
  const sourceFingerprints = { closure: "fp60", initialization: "fp61", gauge: "fp63", calculation: "fp64", technology: "fp-tech", materials: [] };
  const steps = second ? [planStep(1), second] : [planStep(1)];
  const dependencies = steps.flatMap((item) => item.dependencies.map((dependsOn) => ({ stepIdentity: item.identity, dependsOn })));
  const boundedInputs = { direction: "unknown", workingMethod: "unknown", foundationType: "ribbing", pieceLayout: "unknown", confirmed: true, provenance: "user_entered_at_stage_65" };
  const value = {
    format: planDomain.FORMAT, version: 1, identity: `${PROJECT_ID}:execution-plan:fixture`, projectIdentity: PROJECT_ID,
    lifecycle: "completed", createdAt: TIMES[0], updatedAt: TIMES[0], completedAt: TIMES[0], sourceIdentities, sourceFingerprints,
    projectContext: { title: "Свитер" }, garmentContext: {}, sizingContext: {}, recipientContext: {},
    gaugeContext: { stitchesPer10Cm: 20, rowsPer10Cm: 28, identity: "stage63" }, calculationContext: {}, technologyContext: {}, materialContext: [],
    planScope: { version: 1, partial: false, boundedInputs, omittedStepTypes: [] }, steps, dependencies,
    validation: { requiredAcknowledgementCodes: [], acknowledgedWarningCodes: [], boundedInputsConfirmed: true, stale: false },
    blockingErrors: [], warnings: [], assumptions: [], provenance: [{ stage: planDomain.KIND, action: "fixture" }], readiness: "ready",
    audit: { explicitConfirmation: true, sourceChecked: true }, fingerprint: "",
  };
  value.fingerprint = planDomain.fingerprint({
    projectIdentity: value.projectIdentity, sourceIdentities, sourceFingerprints, boundedInputs,
    stepTypes: steps.map((item) => item.type), stepParameters: steps.map((item) => ({ type: item.type, status: item.status, expectedOutput: item.expectedOutput, requiredInputs: item.requiredInputs })),
    dependencies, warningCodes: [], assumptionCodes: [], planScopeVersion: 1,
  });
  return planDomain.validateSnapshot(value);
}

function chain(options = {}) {
  const plan = completedPlan(options.second === undefined ? planStep(2) : options.second);
  const startAssessment = {
    ready: true, projectIdentity: PROJECT_ID,
    source: { projectRevision: 1, calculationId: CALCULATION_ID, planProgressIdentity: "stage65-progress", planIdentity: plan.identity, planFingerprint: plan.fingerprint,
      sourceIdentities: { closure: "stage60", initialization: "stage61", gauge: "stage63", calculation: CALCULATION_ID, stage65: plan.identity },
      sourceFingerprints: { closure: "fp60", initialization: "fp61", gauge: "fp63", calculation: "fp64", stage65: plan.fingerprint } },
    preparation: { product: "Свитер", size: "M", recipient: "self", yarn: "Шерсть", tools: ["Спицы 4 мм"], technique: "Лицевая гладь", materials: ["Шерсть"],
      gaugeSummary: { stitchesPer10Cm: 20, rowsPer10Cm: 28, display: "20 п. × 28 р. на 10 см" },
      firstStep: { sourceIdentity: plan.steps[0].identity, type: "CAST_ON", instruction: "Набрать 100 петель", stitchCount: 100 }, warnings: [], assumptions: [] },
  };
  let stage66 = stage66Domain.buildDraft(startAssessment, { createdAt: TIMES[0], acknowledged: true, acknowledgedAt: TIMES[0], createdBy: "project_owner" });
  stage66 = stage66Domain.markReady(stage66, { timestamp: TIMES[0] });
  stage66 = stage66Domain.start(stage66, { startedAt: TIMES[0] });
  const stage66Record = { kind: stage66Domain.KIND, progress_id: "stage66-progress", project_id: PROJECT_ID, calculation_id: CALCULATION_ID, state: stage66Domain.createProgressState(stage66, CALCULATION_ID), updated_at: TIMES[0] };
  const stage67Source = stage67Domain.assessSource({ projectIdentity: PROJECT_ID, project: { project_id: PROJECT_ID, active_calculation_id: CALCULATION_ID }, stage66Record, stage66Domain });
  let stage67 = stage67Domain.createSnapshot(stage67Source, { createdAt: TIMES[1], operationId: OPS[0] });
  stage67 = stage67Domain.activateFirstStep(stage67, { expectedRevision: stage67.revision, expectedFingerprint: stage67.fingerprint, operationId: OPS[1], timestamp: TIMES[2] });
  stage67 = stage67Domain.startCheckingFirstStep(stage67, { expectedRevision: stage67.revision, expectedFingerprint: stage67.fingerprint, operationId: OPS[2], timestamp: TIMES[3] });
  stage67 = stage67Domain.completeFirstStep(stage67, { observedStitchCount: 100, explicitConfirmation: true }, { expectedRevision: stage67.revision, expectedFingerprint: stage67.fingerprint, operationId: OPS[3], timestamp: TIMES[4] }).snapshot;
  if (options.stage67Lifecycle) { stage67 = JSON.parse(JSON.stringify(stage67)); stage67.lifecycle = options.stage67Lifecycle; }
  const stage67Record = { kind: stage67Domain.KIND, progress_id: "stage67-progress", project_id: PROJECT_ID, calculation_id: CALCULATION_ID, state: options.rawStage67State || stage67Domain.createProgressState(stage67), updated_at: TIMES[4] };
  const stage65Record = { kind: planDomain.KIND, progress_id: "stage65-progress", project_id: PROJECT_ID, calculation_id: CALCULATION_ID,
    state: { kind: planDomain.KIND, version: 1, projectId: PROJECT_ID, calculationId: CALCULATION_ID, draft: null, currentRevisionIdentity: plan.identity, history: [plan], updatedAt: TIMES[0] }, updated_at: TIMES[0] };
  const progress = [stage65Record, stage66Record, stage67Record];
  return { projectIdentity: PROJECT_ID, project: { project_id: PROJECT_ID, active_calculation_id: CALCULATION_ID }, progress, stage65Domain: planDomain, stage66Domain, stage67Domain, plan, stage66, stage67 };
}

test("01 canonical FOUNDATION_SECTION without a measurable goal is unavailable", () => {
  const result = domain.assessSource(chain());
  assert.equal(result.lifecycle, "unavailable");
  assert.equal(result.reasonCode, "NEXT_STEP_INCOMPLETE");
  assert.equal(result.nextStep, null);
});

test("02 complete FOUNDATION_SECTION becomes prepared without starting work", () => {
  const fixture = chain({ second: planStep(2, { expectedOutput: { foundationType: "ribbing", rowCount: 12 } }) });
  const result = domain.assessSource(fixture);
  assert.equal(result.lifecycle, "prepared");
  assert.equal(result.nextStep.type, "FOUNDATION_SECTION");
  assert.deepEqual(result.nextStep.measurableGoal, { value: 12, unit: "rows", criterion: "row_count" });
  const snapshot = domain.createSnapshot(result, { createdAt: TIMES[5], operationId: OPS[4] });
  assert.deepEqual(snapshot.nextAction, { status: "unavailable", destination: null, label: null, reasonCode: "NEXT_STEP_EXECUTION_ROUTE_UNAVAILABLE" });
});

test("03 missing, conditional, incomplete and unsupported next steps stay unavailable", () => {
  const cases = [
    [null, "NO_NEXT_PLAN_STEP"],
    [planStep(2, { status: "conditional", requiredInputs: ["foundation_height"] }), "NEXT_STEP_CONDITIONAL"],
    [planStep(2), "NEXT_STEP_INCOMPLETE"],
    [planStep(2, { type: "PRIMARY_FABRIC", expectedOutput: { rowCount: 10 } }), "NEXT_STEP_UNSUPPORTED"],
  ];
  for (const [second, code] of cases) {
    const result = domain.assessSource(chain({ second }));
    assert.equal(result.reasonCode, code);
    assert.equal(result.nextStep, null);
    assert.doesNotMatch(JSON.stringify(result.nextStep), /резинк|лицев.{0,5}глад|сантиметр|кругов/i);
  }
});

test("04 selection uses immutable identity and canonical order", () => {
  const fixture = chain({ second: planStep(2, { expectedOutput: { foundationType: "ribbing", rowCount: 8 } }) });
  const presentationVariant = JSON.parse(JSON.stringify(fixture.plan));
  presentationVariant.steps[1].title = "Переведённый DOM-текст не является ключом";
  const result = domain.classifyNextStep(presentationVariant, presentationVariant.steps[0].identity);
  assert.equal(result.nextStep.identity, fixture.plan.steps[1].identity);
  assert.equal(domain.classifyNextStep(fixture.plan, "wrong").reasonCode, "COMPLETED_STEP_MISMATCH");
});

test("05 Stage 67 must be completed with the exact confirmed result", () => {
  const incomplete = chain();
  incomplete.progress[2] = JSON.parse(JSON.stringify(incomplete.progress[2]));
  incomplete.progress[2].state.lifecycle = "checking";
  incomplete.progress[2].state.snapshot.lifecycle = "checking";
  assert.equal(domain.assessSource(incomplete).diagnostic.code, "STAGE67_NOT_COMPLETED");
  const bad = chain();
  bad.progress[2] = JSON.parse(JSON.stringify(bad.progress[2]));
  bad.progress[2].state.snapshot.check.explicitConfirmation = false;
  assert.equal(domain.assessSource(bad).diagnostic.code, "STAGE67_FINGERPRINT_MISMATCH");
});

test("06 tampered Stage 65, 66 and 67 fingerprints fail closed", () => {
  for (const [index, code] of [[0, "STAGE65_FINGERPRINT_MISMATCH"], [1, "STAGE66_FINGERPRINT_MISMATCH"], [2, "STAGE67_FINGERPRINT_MISMATCH"]]) {
    const fixture = chain(); fixture.progress[index].state = JSON.parse(JSON.stringify(fixture.progress[index].state));
    if (index === 0) fixture.progress[index].state.history[0].fingerprint = "fnv1a32:tampered";
    else fixture.progress[index].state.snapshot.fingerprint = "fnv1a32:tampered";
    assert.equal(domain.assessSource(fixture).diagnostic.code, code);
  }
});

test("07 foreign project identity is rejected without source details", () => {
  const fixture = chain(); fixture.project.project_id = "019fc4aa-5100-7009-8af9-bd06e3bff109";
  const result = domain.assessSource(fixture);
  assert.equal(result.diagnostic.code, "SOURCE_PROJECT_MISMATCH");
  assert.equal(result.source, null);
});

test("08 snapshot allowlist, immutability and deterministic fingerprint", () => {
  const assessment = domain.assessSource(chain());
  const left = domain.createSnapshot(assessment, { createdAt: TIMES[5], operationId: OPS[4] });
  const right = domain.createSnapshot(assessment, { createdAt: TIMES[5], operationId: OPS[4] });
  assert.deepEqual(Object.keys(left), domain.SNAPSHOT_KEYS);
  assert.equal(left.fingerprint, right.fingerprint);
  assert.equal(left.identity, right.identity);
  assert.equal(Object.isFrozen(left), true);
  assert.throws(() => domain.validateSnapshot({ ...left, extra: true }), { code: "SNAPSHOT_NOT_ALLOWLISTED" });
});

test("09 route allowlist keeps old execution routes and future work route closed", () => {
  assert.equal(domain.safeDestination(`/project-execution-next-step?project=${PROJECT_ID}`, PROJECT_ID).valid, true);
  for (const path of ["/pattern-execution-session", "/step-assistant", "/project-execution-next-step-work"]) assert.equal(domain.safeDestination(`${path}?project=${PROJECT_ID}`, PROJECT_ID).valid, false);
});

test("10 saved projects opens Stage 68 only after Stage 67 completion", () => {
  const base = { project_id: PROJECT_ID, title: "Свитер", workspace_status: "ACTIVE", created_at: TIMES[0], updated_at: TIMES[4], revision: 1 };
  const completed = userWorkspace.buildWorkspaceViewModel([{ ...base, workspace_stage67_status: "completed" }], []).projects[0];
  assert.equal(completed.action.href, `/project-execution-next-step?project=${PROJECT_ID}`);
  const checking = userWorkspace.buildWorkspaceViewModel([{ ...base, workspace_stage67_status: "checking" }], []).projects[0];
  assert.equal(checking.action.href, `/project-execution-first-step?project=${PROJECT_ID}`);
});

test("11 Stage 67 exposes the exact project-scoped Stage 68 destination", () => {
  const completed = chain().stage67;
  assert.deepEqual(completed.nextAction, { status: "available", destination: `/project-execution-next-step?project=${PROJECT_ID}`, reasonCode: null });
});
test("12 blocked lifecycle can be sealed without copying untrusted source data", () => {
  const fixture = chain();
  fixture.progress[2] = JSON.parse(JSON.stringify(fixture.progress[2]));
  fixture.progress[2].state.snapshot.fingerprint = "fnv1a32:tampered";
  const assessment = domain.assessSource(fixture);
  assert.equal(assessment.lifecycle, "blocked");
  const snapshot = domain.createSnapshot(assessment, { createdAt: TIMES[5], operationId: OPS[5] });
  assert.equal(snapshot.lifecycle, "blocked");
  assert.equal(snapshot.source, null);
  assert.equal(snapshot.nextStep, null);
  assert.deepEqual(snapshot.nextAction, { status: "available", destination: "/saved-projects", label: "Мои проекты", reasonCode: "STAGE67_FINGERPRINT_MISMATCH" });
});
test("13 real saved 60→61→63→64→65→66→67 chain stays unavailable without invented data", () => {
  const aggregate = realChain.withCompletedPlan();
  const start = realChain.startedSnapshot(aggregate);
  const calculationId = aggregate.project.active_calculation_id;
  const stage66Record = { progress_id: "real-stage66-progress", project_id: realChain.PROJECT_ID, calculation_id: calculationId, kind: stage66Domain.KIND, state: stage66Domain.createProgressState(start, calculationId), updated_at: TIMES[0] };
  aggregate.progress.push(stage66Record);
  const firstSource = stage67Domain.assessSource({ projectIdentity: realChain.PROJECT_ID, project: aggregate.project, progress: aggregate.progress, stage66Domain });
  let first = stage67Domain.createSnapshot(firstSource, { createdAt: TIMES[1], operationId: OPS[0] });
  first = stage67Domain.activateFirstStep(first, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[1], timestamp: TIMES[2] });
  first = stage67Domain.startCheckingFirstStep(first, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[2], timestamp: TIMES[3] });
  first = stage67Domain.completeFirstStep(first, { observedStitchCount: 100, explicitConfirmation: true }, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[3], timestamp: TIMES[4] }).snapshot;
  aggregate.progress.push({ progress_id: "real-stage67-progress", project_id: realChain.PROJECT_ID, calculation_id: calculationId, kind: stage67Domain.KIND, state: stage67Domain.createProgressState(first), updated_at: TIMES[4] });
  const plan = aggregate.progress.find((item) => item.kind === planDomain.KIND).state.history.at(-1);
  const assessment = domain.assessSource({ projectIdentity: realChain.PROJECT_ID, project: aggregate.project, progress: aggregate.progress, stage65Domain: planDomain, stage66Domain, stage67Domain });
  assert.equal(plan.steps[1].type, "FOUNDATION_SECTION");
  assert.equal(plan.steps[1].status, "conditional");
  assert.equal(assessment.lifecycle, "unavailable", assessment.diagnostic?.code);
  assert.equal(assessment.reasonCode, "NEXT_STEP_CONDITIONAL");
  assert.equal(assessment.nextStep, null);
});