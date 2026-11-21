"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");
global.window = globalThis;
const planDomain = require("../src/yarnai/static/project-execution-plan.js");
const stage66Domain = require("../src/yarnai/static/project-execution-start.js");
const stage67Domain = require("../src/yarnai/static/project-execution-first-step.js");
const domain = require("../src/yarnai/static/project-execution-next-step.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;

const TIME = "2026-08-04T10:00:00.000Z";
const OPS = [
  "019fc4bb-5100-7001-8af9-bd06e3bff201", "019fc4bb-5100-7002-8af9-bd06e3bff202",
  "019fc4bb-5100-7003-8af9-bd06e3bff203", "019fc4bb-5100-7004-8af9-bd06e3bff204",
  "019fc4bb-5100-7005-8af9-bd06e3bff205",
];
let repositories = [];
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("database blocked")); }); }
beforeEach(async () => { repositories = []; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((repo) => repo.close().catch(() => undefined))); await deleteDatabase(); });

function completedPlan(projectId, calculationId) {
  const castOnIdentity = `${projectId}:plan-step:cast_on:1`;
  const steps = [
    { identity: castOnIdentity, sequenceNumber: 1, type: "CAST_ON", title: "Набрать 100 петель", purpose: "Создать начальный набор.", status: "confirmed", source: { stage: "PROJECT_CALCULATION_ENTRY", identity: calculationId }, confidence: "high", requiredInputs: [], expectedOutput: { stitchCount: 100, semanticRole: "body" }, validationCheckpoint: { type: "count_stitches", description: "Проверить 100 петель." }, dependencies: [], warnings: [], assumptions: [], provenance: [{ sourceStage: "PROJECT_CALCULATION_ENTRY", sourceIdentity: calculationId }] },
    { identity: `${projectId}:plan-step:foundation_section:2`, sequenceNumber: 2, type: "FOUNDATION_SECTION", title: "Выполнить начальный участок", purpose: "Связать начальный участок по подтверждённой технологии.", status: "confirmed", source: { stage: "CONFIRMED_TECHNOLOGY", identity: "technology-1" }, confidence: "high", requiredInputs: [], expectedOutput: { foundationType: "ribbing" }, validationCheckpoint: { type: "user_verification", description: "Проверить участок." }, dependencies: [castOnIdentity], warnings: [], assumptions: [], provenance: [{ sourceStage: "CONFIRMED_TECHNOLOGY", sourceIdentity: "technology-1" }] },
  ];
  const sourceIdentities = { project: projectId, closure: "stage60", initialization: "stage61", gauge: "stage63", calculation: calculationId, technology: "technology-1", materials: [] };
  const sourceFingerprints = { closure: "fp60", initialization: "fp61", gauge: "fp63", calculation: "fp64", technology: "fp-tech", materials: [] };
  const boundedInputs = { direction: "unknown", workingMethod: "unknown", foundationType: "ribbing", pieceLayout: "unknown", confirmed: true, provenance: "user_entered_at_stage_65" };
  const dependencies = [{ stepIdentity: steps[1].identity, dependsOn: castOnIdentity }];
  const value = { format: planDomain.FORMAT, version: 1, identity: `${projectId}:execution-plan:repository`, projectIdentity: projectId, lifecycle: "completed", createdAt: TIME, updatedAt: TIME, completedAt: TIME, sourceIdentities, sourceFingerprints, projectContext: { title: "Свитер" }, garmentContext: {}, sizingContext: {}, recipientContext: {}, gaugeContext: { stitchesPer10Cm: 20, rowsPer10Cm: 28, identity: "stage63" }, calculationContext: {}, technologyContext: {}, materialContext: [], planScope: { version: 1, partial: false, boundedInputs, omittedStepTypes: [] }, steps, dependencies, validation: { requiredAcknowledgementCodes: [], acknowledgedWarningCodes: [], boundedInputsConfirmed: true, stale: false }, blockingErrors: [], warnings: [], assumptions: [], provenance: [{ stage: planDomain.KIND, action: "fixture" }], readiness: "ready", audit: { explicitConfirmation: true, sourceChecked: true }, fingerprint: "" };
  value.fingerprint = planDomain.fingerprint({ projectIdentity: projectId, sourceIdentities, sourceFingerprints, boundedInputs, stepTypes: steps.map((item) => item.type), stepParameters: steps.map((item) => ({ type: item.type, status: item.status, expectedOutput: item.expectedOutput, requiredInputs: item.requiredInputs })), dependencies, warningCodes: [], assumptionCodes: [], planScopeVersion: 1 });
  return planDomain.validateSnapshot(value);
}

async function setup() {
  const repo = repository(); await repo.initialize();
  const project = await repo.createProject({ title: "Stage 68 repository" });
  const calculation = await repo.addCalculation(project.project_id, { stage: 68 }, { status: "READY", normalized_inputs: {}, warnings: [], errors: [], clarifications: [] });
  const projectId = project.project_id; const calculationId = calculation.calculation.calculation_id;
  const plan = completedPlan(projectId, calculationId);
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
  const aggregate = await repo.getProject(projectId);
  const assessment = domain.assessSource({ projectIdentity: projectId, project: aggregate.project, progress: aggregate.progress, stage65Domain: planDomain, stage66Domain, stage67Domain });
  const snapshot = domain.createSnapshot(assessment, { createdAt: TIME, operationId: OPS[4] });
  return { repo, projectId, calculationId, assessment, snapshot };
}

test("01 ensure, reload and concurrent double click keep one immutable snapshot", async () => {
  const { repo, projectId, calculationId, assessment, snapshot } = await setup();
  const state = domain.createProgressState(snapshot);
  const [left, right] = await Promise.all([
    repo.ensureProjectExecutionNextStep(projectId, calculationId, state, { timestamp: TIME, operationId: OPS[4] }),
    repo.ensureProjectExecutionNextStep(projectId, calculationId, state, { timestamp: TIME, operationId: OPS[4] }),
  ]);
  assert.equal(left.progress_id, right.progress_id);
  const restored = await repo.getProjectExecutionNextStep(projectId, calculationId);
  assert.equal(restored.state.snapshot.fingerprint, snapshot.fingerprint);
  assert.equal((await repo.getProject(projectId)).progress.filter((item) => item.kind === domain.KIND).length, 1);
  const conflicting = domain.createSnapshot(assessment, { createdAt: "2026-08-04T10:01:00.000Z", operationId: OPS[4] });
  await assert.rejects(repo.ensureProjectExecutionNextStep(projectId, calculationId, domain.createProgressState(conflicting), { timestamp: TIME, operationId: OPS[4] }), { code: "OPERATION_ID_CONFLICT" });
  const laterEnsure = domain.createSnapshot(assessment, { createdAt: "2026-08-04T10:02:00.000Z", operationId: OPS[0] });
  const replay = await repo.ensureProjectExecutionNextStep(projectId, calculationId, domain.createProgressState(laterEnsure), { timestamp: TIME, operationId: OPS[0] });
  assert.equal(replay.state.snapshot.fingerprint, snapshot.fingerprint);
});

test("02 mutation and conflicting revision paths cannot overwrite Stage 68", async () => {
  const { repo, projectId, calculationId, snapshot } = await setup();
  await repo.ensureProjectExecutionNextStep(projectId, calculationId, domain.createProgressState(snapshot), { timestamp: TIME, operationId: OPS[4] });
  await assert.rejects(repo.updateProjectExecutionNextStep(projectId, calculationId, domain.createProgressState(snapshot), { expectedRevision: 0 }), { code: "REVISION_CONFLICT" });
  await assert.rejects(repo.updateProjectExecutionNextStep(projectId, calculationId, domain.createProgressState(snapshot), { expectedRevision: 1 }), { code: "PROJECT_EXECUTION_NEXT_STEP_IMMUTABLE" });
  const stored = await repo.getProjectExecutionNextStep(projectId, calculationId);
  assert.equal(stored.state.snapshot.revision, 1);
  assert.equal(stored.state.snapshot.fingerprint, snapshot.fingerprint);
});
