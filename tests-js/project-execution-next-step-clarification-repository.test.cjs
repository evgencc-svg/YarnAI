"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");
global.window = globalThis;
const planDomain = require("../src/yarnai/static/project-execution-plan.js");
const stage66Domain = require("../src/yarnai/static/project-execution-start.js");
const stage67Domain = require("../src/yarnai/static/project-execution-first-step.js");
const stage68Domain = require("../src/yarnai/static/project-execution-next-step.js");
const domain = require("../src/yarnai/static/project-execution-next-step-clarification.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;

const TIME = "2026-08-04T13:00:00.000Z";
const OPS = [
  "019fc4ee-5100-7001-8af9-bd06e3bf2001", "019fc4ee-5100-7002-8af9-bd06e3bf2002",
  "019fc4ee-5100-7003-8af9-bd06e3bf2003", "019fc4ee-5100-7004-8af9-bd06e3bf2004",
  "019fc4ee-5100-7005-8af9-bd06e3bf2005", "019fc4ee-5100-7006-8af9-bd06e3bf2006",
];
let repositories = [];
function repository() { const result = new system.ProjectRepository(); repositories.push(result); return result; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((repo) => repo.close().catch(() => undefined))); await deleteDatabase(); });

function conditionalPlan(projectId, calculationId) {
  const castOnIdentity = `${projectId}:plan-step:cast_on:1`;
  const steps = [
    { identity: castOnIdentity, sequenceNumber: 1, type: "CAST_ON", title: "Набрать 100 петель", purpose: "Создать начальный набор.", status: "confirmed", source: { stage: "PROJECT_CALCULATION_ENTRY", identity: calculationId }, confidence: "high", requiredInputs: [], expectedOutput: { stitchCount: 100, semanticRole: "body" }, validationCheckpoint: { type: "count_stitches", description: "Проверить 100 петель." }, dependencies: [], warnings: [], assumptions: [], provenance: [{ sourceStage: "PROJECT_CALCULATION_ENTRY", sourceIdentity: calculationId }] },
    { identity: `${projectId}:plan-step:foundation_section:2`, sequenceNumber: 2, type: "FOUNDATION_SECTION", title: "Уточнить начальный участок", purpose: "Перед выполнением выбрать вид и высоту начального участка.", status: "conditional", source: { stage: planDomain.KIND, identity: "assumption:foundation-unknown" }, confidence: "limited", requiredInputs: ["foundation_type", "foundation_height"], expectedOutput: { foundationType: null }, validationCheckpoint: { type: "user_verification", description: "Проверить участок." }, dependencies: [castOnIdentity], warnings: [], assumptions: ["FOUNDATION_DETAILS_UNKNOWN"], provenance: [{ sourceStage: "PROJECT_CALCULATION_ENTRY", sourceIdentity: calculationId }] },
  ];
  const sourceIdentities = { project: projectId, closure: "stage60", initialization: "stage61", gauge: "stage63", calculation: calculationId, technology: null, materials: [] };
  const sourceFingerprints = { closure: "fp60", initialization: "fp61", gauge: "fp63", calculation: "fp64", technology: null, materials: [] };
  const boundedInputs = { direction: "unknown", workingMethod: "unknown", foundationType: "unknown", pieceLayout: "unknown", confirmed: true, provenance: "user_entered_at_stage_65" };
  const dependencies = [{ stepIdentity: steps[1].identity, dependsOn: castOnIdentity }];
  const assumptions = [{ code: "CONDITIONAL_FOUNDATION_SECTION", message: "Детали будут подтверждены до выполнения." }];
  const value = { format: planDomain.FORMAT, version: 1, identity: `${projectId}:execution-plan:stage69`, projectIdentity: projectId, lifecycle: "completed", createdAt: TIME, updatedAt: TIME, completedAt: TIME, sourceIdentities, sourceFingerprints, projectContext: { title: "Свитер" }, garmentContext: {}, sizingContext: {}, recipientContext: {}, gaugeContext: { stitchesPer10Cm: 20, rowsPer10Cm: 28, identity: "stage63" }, calculationContext: {}, technologyContext: {}, materialContext: [], planScope: { version: 1, partial: true, boundedInputs, omittedStepTypes: [] }, steps, dependencies, validation: { requiredAcknowledgementCodes: [], acknowledgedWarningCodes: [], boundedInputsConfirmed: true, stale: false }, blockingErrors: [], warnings: [], assumptions, provenance: [{ stage: planDomain.KIND, action: "fixture" }], readiness: "conditionally-ready", audit: { explicitConfirmation: true, sourceChecked: true }, fingerprint: "" };
  value.fingerprint = planDomain.fingerprint({ projectIdentity: projectId, sourceIdentities, sourceFingerprints, boundedInputs, stepTypes: steps.map((item) => item.type), stepParameters: steps.map((item) => ({ type: item.type, status: item.status, expectedOutput: item.expectedOutput, requiredInputs: item.requiredInputs })), dependencies, warningCodes: [], assumptionCodes: assumptions.map((item) => item.code), planScopeVersion: 1 });
  return planDomain.validateSnapshot(value);
}

async function setup() {
  const repo = repository(); await repo.initialize();
  const project = await repo.createProject({ title: "Stage 69 repository" });
  const calculation = await repo.addCalculation(project.project_id, { stage: 69 }, { status: "READY", normalized_inputs: {}, warnings: [], errors: [], clarifications: [] });
  const projectId = project.project_id; const calculationId = calculation.calculation.calculation_id;
  const plan = conditionalPlan(projectId, calculationId);
  const planState = { kind: planDomain.KIND, version: 1, projectId, calculationId, draft: null, currentRevisionIdentity: plan.identity, history: [plan], updatedAt: TIME };
  await repo.ensureProjectExecutionPlanPreparation(projectId, calculationId, planState, { timestamp: TIME });
  const startAssessment = { ready: true, projectIdentity: projectId, source: { projectRevision: 1, calculationId, planProgressIdentity: "plan-progress", planIdentity: plan.identity, planFingerprint: plan.fingerprint, sourceIdentities: { closure: "stage60", initialization: "stage61", gauge: "stage63", calculation: calculationId, stage65: plan.identity }, sourceFingerprints: { closure: "fp60", initialization: "fp61", gauge: "fp63", calculation: "fp64", stage65: plan.fingerprint } }, preparation: { product: "Свитер", size: "M", recipient: "self", yarn: "Шерсть", tools: ["Спицы 4 мм"], technique: "Лицевая гладь", materials: ["Шерсть"], gaugeSummary: { stitchesPer10Cm: 20, rowsPer10Cm: 28, display: "20 п. × 28 р. на 10 см" }, firstStep: { sourceIdentity: plan.steps[0].identity, type: "CAST_ON", instruction: "Набрать 100 петель", stitchCount: 100 }, warnings: [], assumptions: [] } };
  let start = stage66Domain.buildDraft(startAssessment, { createdAt: TIME, acknowledged: true, acknowledgedAt: TIME, createdBy: "project_owner" }); start = stage66Domain.markReady(start, { timestamp: TIME }); start = stage66Domain.start(start, { startedAt: TIME });
  const savedStart = await repo.ensureProjectExecutionStart(projectId, calculationId, stage66Domain.createProgressState(start, calculationId), { timestamp: TIME });
  const firstSource = stage67Domain.assessSource({ projectIdentity: projectId, project: (await repo.getProject(projectId)).project, stage66Record: savedStart, stage66Domain });
  let first = stage67Domain.createSnapshot(firstSource, { createdAt: TIME, operationId: OPS[0] });
  first = stage67Domain.activateFirstStep(first, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[1], timestamp: TIME });
  first = stage67Domain.startCheckingFirstStep(first, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[2], timestamp: TIME });
  first = stage67Domain.completeFirstStep(first, { observedStitchCount: 100, explicitConfirmation: true }, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[3], timestamp: TIME }).snapshot;
  await repo.ensureProjectExecutionFirstStep(projectId, calculationId, stage67Domain.createProgressState(first), { timestamp: TIME });
  let aggregate = await repo.getProject(projectId);
  const stage68Assessment = stage68Domain.assessSource({ projectIdentity: projectId, project: aggregate.project, progress: aggregate.progress, stage65Domain: planDomain, stage66Domain, stage67Domain });
  const next = stage68Domain.createSnapshot(stage68Assessment, { createdAt: TIME, operationId: OPS[4] });
  await repo.ensureProjectExecutionNextStep(projectId, calculationId, stage68Domain.createProgressState(next), { timestamp: TIME, operationId: OPS[4] });
  aggregate = await repo.getProject(projectId);
  const assessment = domain.assessSource({ projectIdentity: projectId, project: aggregate.project, progress: aggregate.progress, stage65Domain: planDomain, stage66Domain, stage67Domain, stage68Domain });
  const snapshot = domain.createCompletedSnapshot(assessment, { foundationType: "ribbing", foundationHeight: 5 }, { createdAt: TIME, confirmedAt: TIME, explicitConfirmation: true, operationId: OPS[5] });
  return { repo, projectId, calculationId, aggregate, assessment, snapshot };
}

test("01 save, read, reload and double click keep one completed snapshot", async () => {
  const { repo, projectId, calculationId, aggregate, snapshot } = await setup();
  const state = domain.createProgressState(snapshot);
  const options = { timestamp: TIME, operationId: OPS[5], expectedProjectRevision: aggregate.project.revision };
  const [left, right] = await Promise.all([repo.ensureProjectExecutionNextStepClarification(projectId, calculationId, state, options), repo.ensureProjectExecutionNextStepClarification(projectId, calculationId, state, options)]);
  assert.equal(left.progress_id, right.progress_id);
  const restored = await repo.getProjectExecutionNextStepClarification(projectId, calculationId);
  assert.equal(restored.state.snapshot.fingerprint, snapshot.fingerprint);
  assert.equal((await repo.getProject(projectId)).progress.filter((item) => item.kind === domain.KIND).length, 1);
});

test("02 operation conflict, immutable completion and stale revision are rejected", async () => {
  const { repo, projectId, calculationId, aggregate, assessment, snapshot } = await setup();
  await assert.rejects(repo.ensureProjectExecutionNextStepClarification(projectId, calculationId, domain.createProgressState(snapshot), { timestamp: TIME, operationId: OPS[5], expectedProjectRevision: aggregate.project.revision - 1 }), { code: "REVISION_CONFLICT" });
  await repo.ensureProjectExecutionNextStepClarification(projectId, calculationId, domain.createProgressState(snapshot), { timestamp: TIME, operationId: OPS[5], expectedProjectRevision: aggregate.project.revision });
  const conflict = domain.createCompletedSnapshot(assessment, { foundationType: "other", foundationHeight: 7 }, { createdAt: TIME, confirmedAt: TIME, explicitConfirmation: true, operationId: OPS[5] });
  await assert.rejects(repo.ensureProjectExecutionNextStepClarification(projectId, calculationId, domain.createProgressState(conflict), { timestamp: TIME, operationId: OPS[5] }), { code: "OPERATION_ID_CONFLICT" });
  await assert.rejects(repo.updateProjectExecutionNextStepClarification(projectId, calculationId, domain.createProgressState(snapshot), { expectedRevision: 0 }), { code: "REVISION_CONFLICT" });
  await assert.rejects(repo.updateProjectExecutionNextStepClarification(projectId, calculationId, domain.createProgressState(snapshot), { expectedRevision: 1 }), { code: "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION_IMMUTABLE" });
});

test("03 project isolation and Stage 65–68 immutability are preserved", async () => {
  const { repo, projectId, calculationId, aggregate, snapshot } = await setup();
  const before = aggregate.progress.filter((item) => [planDomain.KIND, stage66Domain.KIND, stage67Domain.KIND, stage68Domain.KIND].includes(item.kind)).map((item) => JSON.stringify(item.state));
  await repo.ensureProjectExecutionNextStepClarification(projectId, calculationId, domain.createProgressState(snapshot), { timestamp: TIME, operationId: OPS[5], expectedProjectRevision: aggregate.project.revision });
  const other = await repo.createProject({ title: "Другой проект" });
  assert.equal(await repo.getProjectExecutionNextStepClarification(other.project_id, calculationId), null);
  const after = (await repo.getProject(projectId)).progress.filter((item) => [planDomain.KIND, stage66Domain.KIND, stage67Domain.KIND, stage68Domain.KIND].includes(item.kind)).map((item) => JSON.stringify(item.state));
  assert.deepEqual(after, before);
});
