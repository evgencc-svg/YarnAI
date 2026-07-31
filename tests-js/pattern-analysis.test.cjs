"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const analysis = require("../src/yarnai/static/pattern-analysis.js");

const repositories = [];

function at(minute) {
  return new Date(Date.UTC(2026, 6, 31, 19, minute)).toISOString();
}

async function repositoryWithCompletedImport() {
  const repository = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const project = await repository.createProject({ title: "Pattern analysis" });
  const added = await repository.addCalculation(
    project.project_id,
    { axes: ["width"], target_width: { value: 30, unit: "cm" } },
    {
      status: "READY",
      axes: { width: { selected_candidate: { working_count: 60 } } },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const sourceImport = {
    projectId: project.project_id,
    revision: 7,
    status: "completed",
    materials: [
      { id: "one", displayName: "pattern.pdf" },
      { id: "two", displayName: "front.png" },
    ],
  };
  await repository.ensureCalculationProgress(
    project.project_id,
    added.calculation.calculation_id,
    "PATTERN_IMPORT",
    sourceImport,
    { operationKind: "TEST_PATTERN_IMPORT_COMPLETED" },
  );
  return { repository, project, calculation: added.calculation, sourceImport };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(
      global.YarnAIProjectSystem.DB_NAME,
    );
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
});

test("creates the standalone PATTERN_ANALYSIS waiting record", () => {
  const state = analysis.createInitialState(
    {
      projectId: "project-stage-16",
      sourceImportRevision: 12,
      filesCount: 3,
    },
    at(0),
  );
  assert.deepEqual(state, {
    projectId: "project-stage-16",
    revision: 1,
    status: "waiting",
    createdAt: at(0),
    updatedAt: at(0),
    sourceImportRevision: 12,
    filesCount: 3,
    analysisVersion: 1,
    result: {
      patternDetected: false,
      garmentType: null,
      construction: null,
      confidence: 0,
      missingInformation: [],
      notes: [],
    },
    warnings: [],
    errors: [],
  });
  assert.equal(analysis.PROGRESS_KIND, "PATTERN_ANALYSIS");
  assert.deepEqual(analysis.STATUSES, [
    "waiting",
    "queued",
    "analyzing",
    "completed",
    "failed",
  ]);
});

test("changes status without producing analysis results", () => {
  const waiting = analysis.createInitialState(
    { projectId: "project", sourceImportRevision: 4, filesCount: 1 },
    at(0),
  );
  const queued = analysis.changeStatus(waiting, "queued", at(1));
  const analyzing = analysis.changeStatus(queued, "analyzing", at(2));
  const completed = analysis.changeStatus(analyzing, "completed", at(3));
  assert.deepEqual(
    [waiting.status, queued.status, analyzing.status, completed.status],
    ["waiting", "queued", "analyzing", "completed"],
  );
  assert.equal(completed.revision, 4);
  assert.deepEqual(completed.result, analysis.emptyResult());
  assert.throws(() => analysis.changeStatus(waiting, "completed", at(1)), {
    code: "PATTERN_ANALYSIS_TRANSITION_INVALID",
  });
});

test("persists waiting status and restores it after repository reload", async () => {
  const { repository, project, sourceImport } =
    await repositoryWithCompletedImport();
  const created = await analysis.ensureForCompletedImport(
    repository,
    project.project_id,
  );
  assert.equal(created.analysis.status, "waiting");
  assert.equal(created.analysis.sourceImportRevision, sourceImport.revision);
  assert.equal(created.analysis.filesCount, sourceImport.materials.length);
  assert.equal(created.project.current_stage, "pattern_analysis_waiting");
  await repository.close();
  repositories.splice(repositories.indexOf(repository), 1);

  const reopened = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(reopened);
  await reopened.initialize();
  const restored = analysis.inspectAggregate(
    await reopened.getProject(project.project_id),
  );
  assert.deepEqual(restored.analysis, created.analysis);
  assert.equal(
    (await reopened.getProject(project.project_id)).progress.filter(
      (entry) => entry.kind === analysis.PROGRESS_KIND,
    ).length,
    1,
  );
});

test("repository status change is durable", async () => {
  const { repository, project } = await repositoryWithCompletedImport();
  await analysis.ensureForCompletedImport(repository, project.project_id);
  const queued = await analysis.changeStatusForProject(
    repository,
    project.project_id,
    "queued",
  );
  assert.equal(queued.analysis.status, "queued");
  assert.equal(queued.project.current_stage, "pattern_analysis_queued");
  const aggregate = await repository.getProject(project.project_id);
  assert.equal(
    aggregate.progress.find((entry) => entry.kind === analysis.PROGRESS_KIND)
      .state.status,
    "queued",
  );
});

test("project export and import retain PATTERN_ANALYSIS", async () => {
  const { repository, project } = await repositoryWithCompletedImport();
  const created = await analysis.ensureForCompletedImport(
    repository,
    project.project_id,
  );
  const exported = await repository.exportProject(project.project_id);
  const imported = await repository.importProject(exported.json);
  const aggregate = await repository.getProject(imported.project_id);
  const restored = analysis.inspectAggregate(aggregate);
  assert.equal(restored.analysis.status, "waiting");
  assert.equal(restored.analysis.projectId, imported.project_id);
  assert.equal(
    restored.analysis.sourceImportRevision,
    created.analysis.sourceImportRevision,
  );
  assert.equal(restored.analysis.filesCount, created.analysis.filesCount);
});

test("IndexedDB v3 migration backfills waiting analysis for completed imports", async () => {
  const { DB_NAME, applySchemaMigration, uuidv7 } =
    global.YarnAIProjectSystem;
  const projectId = uuidv7();
  const calculationId = uuidv7();
  const legacy = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () =>
      applySchemaMigration(request.result, request.transaction, 0);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = legacy.transaction("progress", "readwrite");
  transaction.objectStore("progress").add({
    schema_version: 1,
    progress_id: uuidv7(),
    project_id: projectId,
    calculation_id: calculationId,
    partition_key: "guest:local",
    kind: "PATTERN_IMPORT",
    epoch: 1,
    state: {
      projectId,
      revision: 9,
      status: "completed",
      materials: [{ id: "legacy" }],
    },
    created_at: at(0),
    updated_at: at(0),
    revision: 3,
    deleted_at: null,
    purge_after: null,
    sync_status: "LOCAL_ONLY",
    server_version: null,
    last_synced_at: null,
    conflict_id: null,
  });
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
  legacy.close();

  const repository = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const database = await repository._database();
  const read = database.transaction("progress", "readonly");
  const request = read
    .objectStore("progress")
    .index("by_scope_epoch")
    .get([projectId, calculationId, analysis.PROGRESS_KIND, 1]);
  const migrated = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(migrated.state.status, "waiting");
  assert.equal(migrated.state.sourceImportRevision, 9);
  assert.equal(migrated.state.filesCount, 1);
});
