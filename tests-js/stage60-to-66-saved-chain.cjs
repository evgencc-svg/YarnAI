"use strict";

const chain = require("./stage60-to-65-saved-chain.cjs");
const startDomain = require("../src/yarnai/static/project-execution-start.js");
const startWorkspace = require("../src/yarnai/static/project-execution-start-workspace.js");

const PLAN_AT = "2026-08-02T14:00:00.000Z";
const START_AT = "2026-08-02T15:00:00.000Z";

function withCompletedPlan(options = {}) {
  const aggregate = options.aggregate || chain.savedChain();
  const verification = chain.planWorkspace.assessAggregateReadiness(chain.readinessOptions(aggregate));
  if (!verification.ready) throw new Error(verification.problem?.code || "stage65-fixture-invalid");
  const preview = chain.planDomain.assessPlan({
    sourceChain: verification.verified.sourceChain,
    technology: verification.verified.technology,
    materials: verification.verified.materials,
    boundedInputs: {},
    acknowledgedWarningCodes: [],
  });
  const assessment = chain.planDomain.assessPlan({
    sourceChain: verification.verified.sourceChain,
    technology: verification.verified.technology,
    materials: verification.verified.materials,
    boundedInputs: {},
    acknowledgedWarningCodes: preview.requiredAcknowledgementCodes,
  });
  let snapshot = chain.planDomain.buildSnapshot({ assessment }, { createdAt: PLAN_AT });
  snapshot = chain.planDomain.startReviewing(snapshot, { timestamp: PLAN_AT });
  snapshot = chain.planDomain.markReady(snapshot, { timestamp: PLAN_AT });
  snapshot = chain.planDomain.complete(snapshot, { timestamp: PLAN_AT });
  const calculationId = aggregate.project.active_calculation_id;
  const initial = chain.planDomain.createProgressState({
    projectIdentity: chain.PROJECT_ID,
    calculationId,
    updatedAt: PLAN_AT,
  });
  const state = chain.planDomain.appendCompleted(initial, snapshot, { calculationId, updatedAt: PLAN_AT });
  aggregate.progress.push({
    schema_version: 1,
    progress_id: "stage65-progress-record",
    project_id: chain.PROJECT_ID,
    calculation_id: calculationId,
    kind: chain.planDomain.PROGRESS_KIND,
    epoch: 1,
    state,
    revision: 1,
    created_at: PLAN_AT,
    updated_at: PLAN_AT,
  });
  return aggregate;
}

function readinessOptions(aggregate = withCompletedPlan()) {
  return {
    aggregate,
    projectId: chain.PROJECT_ID,
    domain: startDomain,
    planDomain: chain.planDomain,
    planWorkspace: chain.planWorkspace,
    calculationDomain: chain.calculationDomain,
    initialization: chain.initializationDomain,
    gauge: chain.gaugeDomain,
    experience: chain.experience,
    readiness: chain.readiness,
  };
}

function startedSnapshot(aggregate = withCompletedPlan()) {
  const result = startWorkspace.assessAggregateReadiness(readinessOptions(aggregate));
  if (!result.ready) throw new Error(result.diagnostic?.code || "stage66-fixture-not-ready");
  let snapshot = startDomain.buildDraft(result.assessment, {
    createdAt: START_AT,
    acknowledged: true,
    acknowledgedAt: START_AT,
    createdBy: "project_owner",
  });
  snapshot = startDomain.markReady(snapshot, { timestamp: START_AT });
  return startDomain.start(snapshot, { startedAt: START_AT });
}

module.exports = {
  ...chain,
  PLAN_AT,
  START_AT,
  startDomain,
  startWorkspace,
  withCompletedPlan,
  readinessOptions,
  startedSnapshot,
};
