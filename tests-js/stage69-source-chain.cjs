"use strict";

const planDomain = require("../src/yarnai/static/project-execution-plan.js");
const stage66Domain = require("../src/yarnai/static/project-execution-start.js");
const stage67Domain = require("../src/yarnai/static/project-execution-first-step.js");
const stage68Domain = require("../src/yarnai/static/project-execution-next-step.js");
const stage69Domain = require("../src/yarnai/static/project-execution-next-step-clarification.js");
const realChain = require("./stage60-to-66-saved-chain.cjs");

const TIMES = Array.from({ length: 12 }, (_, index) => `2026-08-04T12:${String(index).padStart(2, "0")}:00.000Z`);
const OPS = Array.from({ length: 12 }, (_, index) => `019fc4dd-5100-7${String(100 + index).slice(-3)}-8af9-bd06e3bf${String(1000 + index).slice(-4)}`);

function build(options = {}) {
  let aggregate = realChain.withCompletedPlan();
  const calculationId = aggregate.project.active_calculation_id;
  const start = realChain.startedSnapshot(aggregate);
  const stage66Record = {
    progress_id: "stage66-progress-stage69", project_id: realChain.PROJECT_ID, calculation_id: calculationId,
    kind: stage66Domain.KIND, state: stage66Domain.createProgressState(start, calculationId), updated_at: TIMES[0],
  };
  aggregate.progress.push(stage66Record);
  const firstSource = stage67Domain.assessSource({ projectIdentity: realChain.PROJECT_ID, project: aggregate.project, progress: aggregate.progress, stage66Domain });
  let first = stage67Domain.createSnapshot(firstSource, { createdAt: TIMES[1], operationId: OPS[0] });
  first = stage67Domain.activateFirstStep(first, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[1], timestamp: TIMES[2] });
  first = stage67Domain.startCheckingFirstStep(first, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[2], timestamp: TIMES[3] });
  first = stage67Domain.completeFirstStep(first, { observedStitchCount: 100, explicitConfirmation: true }, { expectedRevision: first.revision, expectedFingerprint: first.fingerprint, operationId: OPS[3], timestamp: TIMES[4] }).snapshot;
  const stage67Record = {
    progress_id: "stage67-progress-stage69", project_id: realChain.PROJECT_ID, calculation_id: calculationId,
    kind: stage67Domain.KIND, state: stage67Domain.createProgressState(first), updated_at: TIMES[4],
  };
  aggregate.progress.push(stage67Record);
  const stage68Assessment = stage68Domain.assessSource({
    projectIdentity: realChain.PROJECT_ID, project: aggregate.project, progress: aggregate.progress,
    stage65Domain: planDomain, stage66Domain, stage67Domain,
  });
  const next = stage68Domain.createSnapshot(stage68Assessment, { createdAt: TIMES[5], operationId: OPS[4] });
  const stage68Record = {
    progress_id: "stage68-progress-stage69", project_id: realChain.PROJECT_ID, calculation_id: calculationId,
    kind: stage68Domain.KIND, state: stage68Domain.createProgressState(next), updated_at: TIMES[5],
  };
  aggregate.progress.push(stage68Record);
  let mutableStage66Record = stage66Record;
  let mutableStage67Record = stage67Record;
  let mutableStage68Record = stage68Record;
  if (typeof options.mutate === "function") {
    aggregate = JSON.parse(JSON.stringify(aggregate));
    mutableStage66Record = aggregate.progress.find((entry) => entry.progress_id === stage66Record.progress_id);
    mutableStage67Record = aggregate.progress.find((entry) => entry.progress_id === stage67Record.progress_id);
    mutableStage68Record = aggregate.progress.find((entry) => entry.progress_id === stage68Record.progress_id);
    options.mutate({ aggregate, stage66Record: mutableStage66Record, stage67Record: mutableStage67Record, stage68Record: mutableStage68Record });
  }
  const input = {
    projectIdentity: realChain.PROJECT_ID, project: aggregate.project, progress: aggregate.progress,
    stage65Domain: planDomain, stage66Domain, stage67Domain, stage68Domain,
  };
  return { aggregate, calculationId, stage66Record: mutableStage66Record, stage67Record: mutableStage67Record, stage68Record: mutableStage68Record, first, next, input };
}

function assessment(options = {}) { return stage69Domain.assessSource(build(options).input); }

module.exports = {
  PROJECT_ID: realChain.PROJECT_ID, TIMES, OPS, planDomain, stage66Domain, stage67Domain, stage68Domain, stage69Domain,
  build, assessment,
};
