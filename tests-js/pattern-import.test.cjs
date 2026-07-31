"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const blocking = require("../src/yarnai/static/first-blocking.js");
const patternImport = require("../src/yarnai/static/pattern-import.js");

const repositories = [];

function at(minute) {
  return new Date(Date.UTC(2026, 6, 31, 18, minute)).toISOString();
}

function initial(overrides = {}) {
  return patternImport.createInitialState(
    {
      projectId: "project-stage-15",
      sourceCompleted: true,
      ...overrides,
    },
    at(0),
  );
}

function descriptors() {
  return [
    { name: "description.pdf", type: "application/pdf", size: 2048 },
    { name: "front.jpg", type: "image/jpeg", size: 4096 },
    { name: "notes.txt", type: "text/plain", size: 128 },
  ].map(patternImport.materialFromFile);
}

function ready() {
  return patternImport.addMaterials(initial(), descriptors(), at(1));
}

function completeBlocking(projectId, fingerprint) {
  let state = blocking.createInitialState(
    {
      projectId,
      tailSecuring: {
        id: "tail-stage-13",
        status: "completed",
        revision: 7,
        completedAt: at(0),
      },
      calculation: {
        fingerprint,
        request: {
          garment_type: "шарф",
          target_width: { value: 24, unit: "cm" },
        },
      },
    },
    at(1),
  );
  state = blocking.updateDetails(
    state,
    {
      itemKind: "шарф",
      fiberType: "unknown",
      fiberTypeConfirmed: true,
      careLabelKnown: false,
      itemReady: true,
    },
    at(2),
  );
  state = blocking.updateDetails(
    state,
    { blockingMethod: "gentle_shaping" },
    at(3),
  );
  state = blocking.setMeasurement(
    state,
    { ...state.targetMeasurements[0], confirmed: true },
    at(4),
  );
  for (const item of state.preparationChecklist) {
    if (item.required && item.source === "user" && !item.checked) {
      state = blocking.setChecklistItem(state, item.id, true, at(5));
    }
  }
  state = blocking.startBlocking(state, at(6));
  state = blocking.confirmStep(state, "prepare", { done: true }, at(7));
  state = blocking.confirmStep(state, "treatment", { done: true }, at(8));
  state = blocking.confirmStep(
    state,
    "laid_out",
    {
      flatSurface: true,
      sidesAligned: true,
      seamsStraight: true,
      measurementsChecked: true,
      notOverstretched: true,
      pinsOnlyIfNeeded: true,
    },
    at(9),
  );
  state = blocking.registerDryResult(
    state,
    "all_good",
    {
      fullyDry: true,
      measurementsChecked: true,
      shapeAccepted: true,
      seamsCorrect: true,
      notDeformed: true,
    },
    null,
    at(10),
  );
  return blocking.completeBlocking(state, at(11));
}

async function repositoryWithCompletedStage14() {
  const repository = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const project = await repository.createProject({ title: "Import Pattern" });
  const added = await repository.addCalculation(
    project.project_id,
    {
      axes: ["width"],
      target_width: { value: 24, unit: "cm" },
    },
    {
      status: "READY",
      axes: { width: { selected_candidate: { working_count: 48 } } },
      warnings: [],
      errors: [],
      clarifications: [],
    },
  );
  const calculation = added.calculation;
  await repository.ensureCalculationProgress(
    project.project_id,
    calculation.calculation_id,
    blocking.PROGRESS_KIND,
    completeBlocking(project.project_id, calculation.fingerprint),
    { operationKind: "TEST_FIRST_BLOCKING_COMPLETED" },
  );
  return { repository, project, calculation };
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

test("defines the isolated PATTERN_IMPORT contract", () => {
  const state = initial();
  assert.equal(patternImport.PROGRESS_KIND, "PATTERN_IMPORT");
  assert.deepEqual(patternImport.STATUSES, [
    "not_started",
    "collecting",
    "ready",
    "importing",
    "completed",
    "blocked",
  ]);
  assert.equal(state.status, "not_started");
  assert.equal(state.version, 1);
  assert.equal(state.revision, 1);
  assert.equal(state.sourceFingerprint, null);
  assert.deepEqual(state.materials, []);
  for (const field of [
    "id",
    "projectId",
    "revision",
    "version",
    "status",
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
    "sourceFingerprint",
    "materials",
    "warnings",
    "blockers",
    "history",
  ]) {
    assert.ok(Object.hasOwn(state, field), field);
  }
});

test("accepts PDF, image and text metadata without file contents", () => {
  const state = ready();
  assert.deepEqual(
    state.materials.map((entry) => entry.type),
    ["pdf", "image", "text"],
  );
  assert.deepEqual(
    state.materials.map((entry) => entry.order),
    [1, 2, 3],
  );
  assert.equal(state.status, "ready");
  assert.match(state.sourceFingerprint, /^[0-9a-f]{64}$/);
  for (const material of state.materials) {
    assert.deepEqual(Object.keys(material).sort(), [
      "createdAt",
      "displayName",
      "id",
      "order",
      "size",
      "status",
      "type",
    ]);
    assert.equal(material.status, "collected");
  }
});

test("rejects unsupported, empty and oversized files atomically", () => {
  const state = initial();
  assert.throws(
    () =>
      patternImport.addMaterials(
        state,
        [{ name: "archive.zip", type: "application/zip", size: 12 }],
        at(1),
      ),
    { code: "MATERIAL_TYPE_UNSUPPORTED" },
  );
  assert.throws(
    () =>
      patternImport.addMaterials(
        state,
        [{ name: "empty.txt", type: "text/plain", size: 0 }],
        at(1),
      ),
    { code: "MATERIAL_EMPTY" },
  );
  assert.throws(
    () =>
      patternImport.addMaterials(
        state,
        [
          {
            name: "large.pdf",
            type: "application/pdf",
            size: patternImport.MAX_MATERIAL_BYTES + 1,
          },
        ],
        at(1),
      ),
    { code: "MATERIAL_TOO_LARGE" },
  );
  assert.deepEqual(state.materials, []);
});

test("reorders materials and fingerprints the ordered intake", () => {
  const state = ready();
  const firstFingerprint = state.sourceFingerprint;
  const moved = patternImport.moveMaterial(
    state,
    state.materials[2].id,
    1,
    at(2),
  );
  assert.deepEqual(
    moved.materials.map((entry) => entry.displayName),
    ["notes.txt", "description.pdf", "front.jpg"],
  );
  assert.deepEqual(
    moved.materials.map((entry) => entry.order),
    [1, 2, 3],
  );
  assert.notEqual(moved.sourceFingerprint, firstFingerprint);
  assert.equal(moved.history.at(-1).type, "material_reordered");
});

test("deleting all materials returns collecting", () => {
  let state = ready();
  for (const material of [...state.materials]) {
    state = patternImport.removeMaterial(state, material.id, at(2));
  }
  assert.equal(state.status, "collecting");
  assert.equal(state.sourceFingerprint, null);
  assert.deepEqual(state.materials, []);
  assert.equal(state.completedAt, null);
});

test("completion requires explicit confirmation and at least one material", () => {
  assert.throws(
    () => patternImport.completeImport(initial(), true, at(2)),
    { code: "IMPORT_NOT_READY" },
  );
  const state = ready();
  assert.throws(
    () => patternImport.completeImport(state, false, at(2)),
    { code: "CONFIRMATION_REQUIRED" },
  );
  const completed = patternImport.completeImport(state, true, at(2));
  assert.equal(completed.status, "completed");
  assert.equal(completed.completedAt, at(2));
  assert.equal(completed.history.at(-1).details.confirmed, true);
});

test("completed intake is terminal and creates no future state", () => {
  const completed = patternImport.completeImport(ready(), true, at(2));
  assert.throws(
    () =>
      patternImport.addMaterials(
        completed,
        [{ name: "extra.txt", type: "text/plain", size: 10 }],
        at(3),
      ),
    { code: "PATTERN_IMPORT_COMPLETED" },
  );
  assert.equal(JSON.stringify(completed).includes("STAGE_16"), false);
  assert.deepEqual(patternImport.completeImport(completed, true, at(3)), completed);
});

test("restoration rejects damaged ordering and fingerprint", () => {
  const state = ready();
  const badOrder = structuredClone(state);
  badOrder.materials[0].order = 2;
  assert.equal(patternImport.safeRestore(badOrder).ok, false);
  const badFingerprint = structuredClone(state);
  badFingerprint.sourceFingerprint = "0".repeat(64);
  assert.equal(patternImport.safeRestore(badFingerprint).ok, false);
  assert.equal(patternImport.safeRestore(patternImport.serializeState(state)).ok, true);
});

test("Stage 14 completion is a hard prerequisite", () => {
  const state = patternImport.createInitialState(
    { projectId: "blocked", sourceCompleted: false },
    at(0),
  );
  assert.equal(state.status, "blocked");
  assert.equal(state.blockers[0].code, "FIRST_BLOCKING_NOT_COMPLETED");
  assert.throws(
    () => patternImport.addMaterials(state, descriptors(), at(1)),
    { code: "PATTERN_IMPORT_BLOCKED" },
  );
});

test("ProjectRepository persists one isolated PATTERN_IMPORT across reload", async () => {
  const { repository, project } = await repositoryWithCompletedStage14();
  let result = await patternImport.ensureForProject(
    repository,
    project.project_id,
  );
  assert.equal(result.patternImport.status, "not_started");
  result = await patternImport.addMaterialsForProject(
    repository,
    project.project_id,
    descriptors(),
  );
  result = await patternImport.moveMaterialForProject(
    repository,
    project.project_id,
    result.patternImport.materials[2].id,
    1,
  );
  const saved = result.patternImport;
  await repository.close();
  repositories.splice(repositories.indexOf(repository), 1);

  const reopened = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(reopened);
  await reopened.initialize();
  result = await patternImport.ensureForProject(reopened, project.project_id);
  assert.deepEqual(result.patternImport, saved);
  const aggregate = await reopened.getProject(project.project_id);
  assert.equal(
    aggregate.progress.filter(
      (entry) => entry.kind === patternImport.PROGRESS_KIND,
    ).length,
    1,
  );
  assert.equal(
    aggregate.progress.some((entry) => /STAGE_?16|TECHNOLOGY/i.test(entry.kind)),
    false,
  );
});

test("repository completion is explicit, durable and does not add Stage 16", async () => {
  const { repository, project } = await repositoryWithCompletedStage14();
  await patternImport.ensureForProject(repository, project.project_id);
  await patternImport.addMaterialsForProject(
    repository,
    project.project_id,
    descriptors(),
  );
  await assert.rejects(
    patternImport.completeForProject(repository, project.project_id, false),
    { code: "CONFIRMATION_REQUIRED" },
  );
  const completed = await patternImport.completeForProject(
    repository,
    project.project_id,
    true,
  );
  assert.equal(completed.patternImport.status, "completed");
  assert.equal(completed.project.current_stage, "pattern_import_completed");
  const aggregate = await repository.getProject(project.project_id);
  assert.deepEqual(
    aggregate.progress.map((entry) => entry.kind).sort(),
    ["FIRST_BLOCKING", "PATTERN_IMPORT", "SMART_START", "STEP_ASSISTANT"],
  );
  assert.equal(
    aggregate.operations.some((entry) => /STAGE_?16|TECHNOLOGY/i.test(entry.kind)),
    false,
  );
});

test("project export and import retain Stage 14 and PATTERN_IMPORT", async () => {
  const { repository, project } = await repositoryWithCompletedStage14();
  await patternImport.ensureForProject(repository, project.project_id);
  await patternImport.addMaterialsForProject(
    repository,
    project.project_id,
    descriptors(),
  );
  const exported = await repository.exportProject(project.project_id);
  const imported = await repository.importProject(exported.json);
  const aggregate = await repository.getProject(imported.project_id);
  assert.ok(
    aggregate.progress.some((entry) => entry.kind === "FIRST_BLOCKING"),
  );
  assert.ok(
    aggregate.progress.some((entry) => entry.kind === "PATTERN_IMPORT"),
  );
});
