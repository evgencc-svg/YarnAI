"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
const stage66 = require("../src/yarnai/static/project-execution-start.js");
const domain = require("../src/yarnai/static/project-execution-first-step.js");
require("../src/yarnai/static/project-system.js");
const system = global.YarnAIProjectSystem;

let repositories = [];
function repository() { const value = new system.ProjectRepository(); repositories.push(value); return value; }
function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database blocked"));
  });
}

beforeEach(async () => { repositories = []; await deleteDatabase(); });
afterEach(async () => { await Promise.all(repositories.map((repo) => repo.close().catch(() => undefined))); await deleteDatabase(); });

function operation(index) { return `019fc3ba-4100-7${String(400 + index).slice(-3)}-8af9-bd06e3bff${String(300 + index).slice(-3)}`; }
function time(index) { return `2026-08-02T19:${String(index).padStart(2, "0")}:00.000Z`; }

function startedSnapshot(projectId, calculationId) {
  const assessment = {
    ready: true,
    projectIdentity: projectId,
    source: {
      projectRevision: 2,
      calculationId,
      planProgressIdentity: "stage65-progress-record",
      planIdentity: `${projectId}:execution-plan`,
      planFingerprint: "fnv1a32:stage65",
      sourceIdentities: {
        closure: "stage60-closure",
        initialization: "stage61-initialization",
        gauge: "stage63-gauge",
        calculation: calculationId,
        stage65: `${projectId}:execution-plan`,
      },
      sourceFingerprints: {
        closure: "fnv1a32:stage60",
        initialization: "fnv1a32:stage61",
        gauge: "fnv1a32:stage63",
        calculation: "fnv1a32:stage64",
        stage65: "fnv1a32:stage65",
      },
    },
    preparation: {
      product: "Свитер",
      size: "M",
      recipient: "self",
      yarn: "Шерсть",
      tools: ["Спицы 4 мм"],
      technique: "Лицевая гладь",
      materials: ["Шерсть"],
      gaugeSummary: { stitchesPer10Cm: 20, rowsPer10Cm: 28, display: "20 п. × 28 р. на 10 см" },
      firstStep: { sourceIdentity: `${projectId}:plan-step:cast-on:1`, type: "CAST_ON", instruction: "Набрать 100 петель", stitchCount: 100 },
      warnings: [],
      assumptions: [],
    },
  };
  let snapshot = stage66.buildDraft(assessment, { createdAt: time(0), acknowledged: true, acknowledgedAt: time(0), createdBy: "project_owner" });
  snapshot = stage66.markReady(snapshot, { timestamp: time(0) });
  return stage66.start(snapshot, { startedAt: time(0) });
}

async function setup() {
  const repo = repository();
  await repo.initialize();
  const created = await repo.createProject({ title: "Stage 67 repository" });
  const calculation = await repo.addCalculation(created.project_id, { stage: 67 }, { status: "READY", normalized_inputs: {}, warnings: [], errors: [], clarifications: [] });
  const projectId = created.project_id;
  const calculationId = calculation.calculation.calculation_id;
  const start = startedSnapshot(projectId, calculationId);
  await repo.ensureProjectExecutionStart(projectId, calculationId, stage66.createProgressState(start, calculationId), { timestamp: time(0) });
  const aggregate = await repo.getProject(projectId);
  const source = domain.assessSource({ projectIdentity: projectId, project: aggregate.project, progress: aggregate.progress, stage66Domain: stage66 });
  assert.equal(source.ready, true, source.diagnostic?.code);
  const ready = domain.createSnapshot(source, { createdAt: time(1), operationId: operation(0) });
  return { repo, projectId, calculationId, ready };
}

test("01 repository ensure is unique and reload restores the authoritative snapshot", async () => {
  const { repo, projectId, calculationId, ready } = await setup();
  const state = domain.createProgressState(ready);
  const first = await repo.ensureProjectExecutionFirstStep(projectId, calculationId, state, { timestamp: time(1) });
  const second = await repo.ensureProjectExecutionFirstStep(projectId, calculationId, state, { timestamp: time(1) });
  assert.equal(first.progress_id, second.progress_id);
  assert.equal(first.state.snapshot.identity, domain.deterministicIdentity(domain.assessSource({
    projectIdentity: projectId,
    project: (await repo.getProject(projectId)).project,
    progress: (await repo.getProject(projectId)).progress,
    stage66Domain: stage66,
  })));
  assert.equal((await repo.getProject(projectId)).progress.filter((entry) => entry.kind === domain.KIND).length, 1);
});

test("02 lifecycle update is atomic, idempotent and rejects stale concurrency", async () => {
  const { repo, projectId, calculationId, ready } = await setup();
  await repo.ensureProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(ready), { timestamp: time(1) });
  const command = { expectedRevision: ready.revision, expectedFingerprint: ready.fingerprint, operationId: operation(1), timestamp: time(2) };
  const active = domain.activateFirstStep(ready, command);
  const first = await repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(active), command);
  const replay = await repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(active), command);
  assert.equal(first.progress.state.snapshot.lifecycle, "active");
  assert.equal(replay.replayed, true);
  assert.equal(replay.progress.revision, first.progress.revision);
  assert.equal(replay.progress.state.snapshot.audit.filter((entry) => entry.operationId === command.operationId).length, 1);
  const staleCommand = { expectedRevision: ready.revision, expectedFingerprint: ready.fingerprint, operationId: operation(2), timestamp: time(3) };
  const staleState = domain.activateFirstStep(ready, staleCommand);
  await assert.rejects(repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(staleState), staleCommand), { code: "REVISION_CONFLICT" });
  assert.equal((await repo.getProjectExecutionFirstStep(projectId, calculationId)).state.snapshot.lifecycle, "active");
});

test("03 storage failure leaves the previous lifecycle and fingerprint intact", async () => {
  const { repo, projectId, calculationId, ready } = await setup();
  await repo.ensureProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(ready), { timestamp: time(1) });
  const command = { expectedRevision: ready.revision, expectedFingerprint: ready.fingerprint, operationId: operation(1), timestamp: time(2) };
  const active = domain.activateFirstStep(ready, command);
  const originalUpdate = repo.updateCalculationProgress.bind(repo);
  repo.updateCalculationProgress = async () => { throw new system.ProjectRepositoryError("STORAGE_UNAVAILABLE", "storage failed"); };
  await assert.rejects(repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(active), command), { code: "STORAGE_UNAVAILABLE" });
  repo.updateCalculationProgress = originalUpdate;
  const stored = (await repo.getProjectExecutionFirstStep(projectId, calculationId)).state.snapshot;
  assert.equal(stored.lifecycle, "ready");
  assert.equal(stored.revision, ready.revision);
  assert.equal(stored.fingerprint, ready.fingerprint);
});

test("04 concurrent double completion stores one event and completed stays immutable", async () => {
  const { repo, projectId, calculationId, ready } = await setup();
  await repo.ensureProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(ready), { timestamp: time(1) });
  let snapshot = ready;
  for (const [operationIndex, action] of [
    [1, domain.activateFirstStep],
    [2, domain.startCheckingFirstStep],
  ]) {
    const command = { expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint, operationId: operation(operationIndex), timestamp: time(operationIndex + 1) };
    const next = action(snapshot, command);
    const saved = await repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(next), command);
    snapshot = saved.progress.state.snapshot;
  }
  const completionCommand = { expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint, operationId: operation(3), timestamp: time(4) };
  const completed = domain.completeFirstStep(snapshot, { observedStitchCount: 100, explicitConfirmation: true }, completionCommand).snapshot;
  const [left, right] = await Promise.all([
    repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(completed), completionCommand),
    repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(completed), completionCommand),
  ]);
  const stored = (await repo.getProjectExecutionFirstStep(projectId, calculationId)).state.snapshot;
  assert.equal(left.progress.state.snapshot.lifecycle, "completed");
  assert.equal(right.progress.state.snapshot.lifecycle, "completed");
  assert.equal(stored.audit.filter((entry) => entry.event === "FIRST_STEP_COMPLETED").length, 1);
  assert.equal(stored.timestamps.completedAt, time(4));
  const mutationCommand = { expectedRevision: stored.revision, expectedFingerprint: stored.fingerprint, operationId: operation(4), timestamp: time(5) };
  await assert.rejects(
    repo.updateProjectExecutionFirstStep(projectId, calculationId, domain.createProgressState(stored), mutationCommand),
    { code: "REVISION_CONFLICT" },
  );
});
