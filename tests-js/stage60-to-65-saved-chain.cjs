"use strict";

global.window = globalThis;

const experience = require("../src/yarnai/static/project-details-experience.js");
require("../src/yarnai/static/project-details-collaboration.js");
const closureDomain = require("../src/yarnai/static/project-details-closure.js");
const initializationDomain = require("../src/yarnai/static/project-initialization.js");
const gaugeDomain = require("../src/yarnai/static/swatch-gauge.js");
const calculationDomain = require("../src/yarnai/static/project-calculation-entry.js");
const planDomain = require("../src/yarnai/static/project-execution-plan.js");
const planWorkspace = require("../src/yarnai/static/project-execution-plan-workspace.js");
const readiness = require("../src/yarnai/static/project-readiness-engine.js");

const PROJECT_ID = "019fc3ba-4100-71c3-b7f9-bd06e3bff304";
const STAGE_60_AT = "2026-08-02T10:00:00.000Z";
const STAGE_61_AT = "2026-08-02T11:00:00.000Z";
const STAGE_63_AT = "2026-08-02T12:00:00.000Z";
const STAGE_64_AT = "2026-08-02T13:00:00.000Z";

function completeDetails() {
  return experience.applyPatch(null, {
    sizeMode: "custom", recipient: "woman", fit: "regular",
    bust: 96, waist: 76, hips: 102, shoulderWidth: 39, upperArm: 30,
    armholeDepth: 21, neck: 36, garmentWidth: 50, garmentLength: 62,
    sleeveLength: 57, necklineDepth: 10,
  });
}

function savedChain() {
  const details = completeDetails();
  const project = {
    project_id: PROJECT_ID,
    title: "Stage 63 — контрольный образец",
    revision: 4,
    workspace_status: "ACTIVE",
    active_calculation_id: null,
    draft_input: {
      project_intent: { garmentType: "свитер" },
      project_details_experience: details,
      project_details_collaboration: {},
    },
  };
  const baseAggregate = { project, calculations: [], progress: [], photos: [] };
  const context = experience.contextFromAggregate(baseAggregate);
  const intent = experience.applyDetailsToIntent(context.intent, context.details);
  const nextDestination = { enabled: true, href: `/swatch-assistant?project=${PROJECT_ID}`, label: "Контрольный образец", description: "Подтверждение плотности." };
  const liveInput = {
    projectId: PROJECT_ID,
    garmentType: intent.garmentType || "изделие",
    details: context.details,
    technology: context.technology,
    intent,
    collaborationState: context.collaborationState,
    safe: true,
    nextDestination,
  };

  const stage60Snapshot = closureDomain.buildProjectDetailsSnapshot(liveInput);
  const stage60Draft = closureDomain.buildClosureDraft({ snapshot: stage60Snapshot }, { closureId: "stage60-closure", createdAt: STAGE_60_AT });
  const stage60Reviewing = closureDomain.startReviewing(stage60Draft, { reviewedAt: STAGE_60_AT });
  const stage60Completed = closureDomain.completeClosure(stage60Reviewing, { completedAt: STAGE_60_AT });
  const closureHistory = closureDomain.appendCompletedClosure(null, stage60Completed);

  const initializationInput = { projectIdentity: PROJECT_ID, closureHistory, liveInput, nextDestination };
  const stage61Draft = initializationDomain.buildInitializationDraft(initializationInput, { identity: "stage61-initialization", createdAt: STAGE_61_AT, createdBy: "project_owner" });
  const stage61Reviewing = initializationDomain.startReviewing(stage61Draft, { reviewedAt: STAGE_61_AT });
  const stage61Ready = initializationDomain.markReady(stage61Reviewing);
  const stage61Initialized = initializationDomain.initializeProject(stage61Ready, { initializedAt: STAGE_61_AT });
  const initializationHistory = initializationDomain.appendInitialized(null, stage61Initialized);

  const gaugeSource = gaugeDomain.buildSourceSnapshot({
    projectIdentity: PROJECT_ID,
    initializationIdentity: stage61Initialized.identity,
    initializationFingerprint: stage61Initialized.integrity.recordFingerprint,
    recipient: stage61Initialized.snapshot.garment.recipient,
    size: stage61Initialized.snapshot.garment.standardSize || stage61Initialized.snapshot.garment.sizeMode,
  });
  const stage63Gauge = gaugeDomain.buildConfirmedRecord({
    stitches: 20, rows: 28, width: 10, height: 10, unit: "cm",
    preparation: { knitted: true, washed: true, dry: true, unstretched: true, representative: true, sameYarn: true, sameTools: true, samePattern: true },
  }, { source: gaugeSource, identity: "stage63-gauge", confirmedAt: STAGE_63_AT, createdBy: "project_owner" });
  const gaugeHistory = gaugeDomain.appendHistory(null, stage63Gauge);

  project.draft_input.project_details_closures = closureHistory;
  project.draft_input[initializationDomain.HISTORY_KEY] = initializationHistory;
  project.draft_input[gaugeDomain.HISTORY_KEY] = gaugeHistory;

  const stage64Preview = calculationDomain.assessEntry({ projectIdentity: PROJECT_ID, project, initialization: stage61Initialized, gauge: stage63Gauge });
  const stage64Assessment = calculationDomain.assessEntry({ projectIdentity: PROJECT_ID, project, initialization: stage61Initialized, gauge: stage63Gauge, acknowledgedWarningCodes: stage64Preview.requiredAcknowledgements });
  let stage64Snapshot = calculationDomain.buildSnapshot({ assessment: stage64Assessment }, { identity: "stage64-calculation-snapshot", createdAt: STAGE_64_AT, createdBy: "project_owner" });
  stage64Snapshot = calculationDomain.startReviewing(stage64Snapshot, { timestamp: STAGE_64_AT });
  stage64Snapshot = calculationDomain.markReady(stage64Snapshot, { timestamp: STAGE_64_AT });
  stage64Snapshot = calculationDomain.complete(stage64Snapshot, { timestamp: STAGE_64_AT });
  const calculation = {
    calculation_id: "stage64-calculation-record",
    project_id: PROJECT_ID,
    request: { project_calculation_entry: { kind: calculationDomain.KIND, version: calculationDomain.VERSION, fingerprint: stage64Snapshot.fingerprint } },
    result: { status: "READY_WITH_WARNINGS", normalized_inputs: {}, warnings: stage64Snapshot.warnings, errors: [], clarifications: [], snapshot: stage64Snapshot },
  };
  project.active_calculation_id = calculation.calculation_id;
  return { project, calculations: [calculation], progress: [], photos: [] };
}

function readinessOptions(aggregate = savedChain()) {
  return {
    aggregate,
    projectId: PROJECT_ID,
    domain: planDomain,
    calculationDomain,
    initialization: initializationDomain,
    gauge: gaugeDomain,
    experience,
    readiness,
  };
}

module.exports = {
  PROJECT_ID,
  calculationDomain,
  experience,
  gaugeDomain,
  initializationDomain,
  planDomain,
  planWorkspace,
  readiness,
  readinessOptions,
  savedChain,
};
