"use strict";

const assert = require("node:assert/strict");
const { afterEach, beforeEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");

const {
  DB_NAME,
  INDEX_MANIFEST,
  ProjectAutosave,
  ProjectRepository,
  ProjectRepositoryError,
  STORE_NAMES,
  checksumPayload,
  isUuidv7,
  uuidv7,
} = global.YarnAIProjectSystem;

let repositories = [];

function repository() {
  const value = new ProjectRepository();
  repositories.push(value);
  return value;
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => {};
  });
}

function calculationInput(width = 50) {
  return {
    axes: ["width"],
    functional_category: "garment",
    width: {
      value: width,
      unit: "cm",
      size_kind: "finished",
      direction: "nearest",
      gauge: {
        method: "ready_value",
        ready_count: 20,
        base_length: 10,
      },
    },
  };
}

function calculationResult(count = 100) {
  return {
    status: "READY",
    normalized_inputs: { width: 50 },
    axes: {
      width: {
        selected_candidate: {
          working_count: count,
        },
      },
    },
    warnings: [],
    errors: [],
    clarifications: [],
    canon_version: "1",
    specification_version: "1",
  };
}

beforeEach(async () => {
  repositories = [];
  await deleteDatabase();
});

afterEach(async () => {
  await Promise.all(repositories.map((entry) => entry.close()));
  await deleteDatabase();
});

test("UUIDv7 has the RFC 9562 shape and remains unique", () => {
  const values = new Set(Array.from({ length: 2000 }, () => uuidv7()));
  assert.equal(values.size, 2000);
  for (const value of values) {
    assert.equal(isUuidv7(value), true);
    assert.equal(value[14], "7");
    assert.match(value[19], /[89ab]/);
  }
});

test("schema migration creates all stores and required indexes", async () => {
  const repo = repository();
  await repo.initialize();
  const database = await repo._database();
  assert.deepEqual(
    [...database.objectStoreNames].sort(),
    [...STORE_NAMES].sort(),
  );
  for (const [storeName, indexes] of Object.entries(INDEX_MANIFEST)) {
    const transaction = database.transaction(storeName, "readonly");
    const actual = [...transaction.objectStore(storeName).indexNames];
    indexes.forEach(([name]) => assert.ok(actual.includes(name), `${storeName}.${name}`));
    await transactionDone(transaction);
  }
});

test("project creation is atomic and can exist without a calculation", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Кардиган" });
  assert.equal(project.title, "Кардиган");
  assert.equal(project.workspace_status, "DRAFT");
  assert.equal(project.active_calculation_id, null);
  assert.equal(project.revision, 1);
  assert.equal(isUuidv7(project.project_id), true);
  const aggregate = await repo.getProject(project.project_id);
  assert.equal(aggregate.calculations.length, 0);
  assert.equal(aggregate.operations.length, 1);
  const database = await repo._database();
  const transaction = database.transaction("checkpoints", "readonly");
  const checkpointCount = await requestResult(
    transaction
      .objectStore("checkpoints")
      .index("by_project_created")
      .count(
        IDBKeyRange.bound(
          [project.project_id, ""],
          [project.project_id, "\uffff"],
        ),
      ),
  );
  await transactionDone(transaction);
  assert.equal(checkpointCount, 2);
});

test("project can be read after the repository is reopened", async () => {
  const first = repository();
  const project = await first.createProject({ title: "После reload" });
  await first.close();
  repositories = repositories.filter((entry) => entry !== first);
  const reopened = repository();
  await reopened.initialize();
  const aggregate = await reopened.getProject(project.project_id);
  assert.equal(aggregate.project.title, "После reload");
});

test("project update validates fields and increments revision", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Шапка" });
  const updated = await repo.updateProject(project.project_id, {
    title: "Шапка с отворотом",
    notes: "Проверить плотность",
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.title, "Шапка с отворотом");
  await assert.rejects(
    repo.updateProject(project.project_id, { browserFingerprint: "x" }),
    (error) => error.code === "UNKNOWN_PROJECT_FIELD",
  );
});

test("active list excludes archive and trash", async () => {
  const repo = repository();
  const active = await repo.createProject({ title: "Активный" });
  const archived = await repo.createProject({ title: "Архивный" });
  const deleted = await repo.createProject({ title: "Удалённый" });
  await repo.archiveProject(archived.project_id);
  await repo.softDeleteProject(deleted.project_id);
  const projects = await repo.listProjects({ section: "active" });
  assert.deepEqual(projects.map((entry) => entry.project_id), [active.project_id]);
});

test("archive and restore preserve the prior lifecycle state", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Плед" });
  const archived = await repo.archiveProject(project.project_id);
  assert.equal(archived.workspace_status, "ARCHIVED");
  assert.equal(archived.status_before_archive, "DRAFT");
  const restored = await repo.restoreProject(project.project_id);
  assert.equal(restored.workspace_status, "DRAFT");
  await assert.rejects(
    repo.restoreProject(project.project_id),
    (error) => error.code === "INVALID_LIFECYCLE_TRANSITION",
  );
});

test("workspace status transitions reject invalid state changes", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Lifecycle" });
  const active = await repo.transitionProjectStatus(project.project_id, "ACTIVE");
  assert.equal(active.workspace_status, "ACTIVE");
  const paused = await repo.transitionProjectStatus(project.project_id, "PAUSED");
  assert.equal(paused.workspace_status, "PAUSED");
  const resumed = await repo.transitionProjectStatus(project.project_id, "ACTIVE");
  assert.equal(resumed.workspace_status, "ACTIVE");
  const completed = await repo.transitionProjectStatus(
    project.project_id,
    "COMPLETED",
  );
  assert.equal(completed.workspace_status, "COMPLETED");
  await assert.rejects(
    repo.transitionProjectStatus(project.project_id, "DRAFT"),
    (error) => error.code === "INVALID_LIFECYCLE_TRANSITION",
  );
});

test("soft delete and restore preserve identity and content", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Носки" });
  const deleted = await repo.softDeleteProject(project.project_id);
  assert.equal(deleted.workspace_status, "DELETED");
  assert.ok(deleted.purge_after);
  assert.equal((await repo.listProjects({ section: "active" })).length, 0);
  const restored = await repo.restoreDeletedProject(project.project_id);
  assert.equal(restored.project_id, project.project_id);
  assert.equal(restored.workspace_status, "DRAFT");
  assert.equal(restored.deleted_at, null);
});

test("permanent delete removes calculations, progress, photos and blobs", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Удалить полностью" });
  await repo.addCalculation(
    project.project_id,
    calculationInput(),
    calculationResult(),
  );
  await repo.addPhoto(
    project.project_id,
    new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
  );
  await repo.softDeleteProject(project.project_id);
  const result = await repo.permanentlyDeleteProject(project.project_id, {
    confirmed: true,
  });
  assert.equal(result.deleted_related.calculations, 1);
  assert.equal(result.deleted_related.progress, 2);
  assert.equal(result.deleted_related.photos, 1);
  assert.equal(result.deleted_related.photo_blobs, 1);
  await assert.rejects(
    repo.getProject(project.project_id),
    (error) => error.code === "PROJECT_NOT_FOUND",
  );
  const database = await repo._database();
  for (const storeName of ["calculations", "progress", "photos", "photo_blobs"]) {
    const transaction = database.transaction(storeName, "readonly");
    assert.equal(await requestResult(transaction.objectStore(storeName).count()), 0);
    await transactionDone(transaction);
  }
});

test("duplicate creates independent IDs and reset progress", async () => {
  const repo = repository();
  const source = await repo.createProject({ title: "Свитер" });
  const saved = await repo.addCalculation(
    source.project_id,
    calculationInput(),
    calculationResult(),
  );
  const duplicate = await repo.duplicateProject(source.project_id);
  assert.notEqual(duplicate.project_id, source.project_id);
  assert.equal(duplicate.duplicated_from_project_id, source.project_id);
  assert.notEqual(
    duplicate.active_calculation_id,
    saved.calculation.calculation_id,
  );
  const aggregate = await repo.getProject(duplicate.project_id);
  assert.equal(aggregate.progress.length, 2);
  assert.ok(aggregate.progress.every((entry) => entry.revision === 1));
});

test("debounced autosave writes the last edit and exposes save states", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Черновик" });
  const states = [];
  const autosave = new ProjectAutosave(repo, project.project_id, {
    delay: 10,
    onStateChange: ({ state }) => states.push(state),
  });
  autosave.update({ notes: "a" });
  autosave.update({ notes: "ab" });
  autosave.update({ notes: "abc" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await autosave.flush();
  const aggregate = await repo.getProject(project.project_id);
  assert.equal(aggregate.project.notes, "abc");
  assert.ok(states.includes("DIRTY"));
  assert.ok(states.includes("SAVING"));
  assert.ok(states.includes("SAVED_LOCAL"));
  await autosave.destroy();
});

test("concurrent saves are serialized in invocation order", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Порядок" });
  const first = repo.updateProject(project.project_id, { notes: "first" });
  const second = repo.updateProject(project.project_id, { notes: "second" });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.revision, 2);
  assert.equal(secondResult.revision, 3);
  assert.equal((await repo.getProject(project.project_id)).project.notes, "second");
});

test("autosave retries a transient write error without losing the patch", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Retry" });
  const original = repo.updateProject.bind(repo);
  let attempts = 0;
  repo.updateProject = async (...args) => {
    attempts += 1;
    if (attempts === 1) {
      throw new ProjectRepositoryError(
        "TEMPORARY",
        "temporary",
        { transient: true },
      );
    }
    return original(...args);
  };
  const autosave = new ProjectAutosave(repo, project.project_id, {
    delay: 0,
    retryDelays: [1],
  });
  autosave.update({ notes: "С retry" });
  await autosave.flush();
  assert.equal(attempts, 2);
  assert.equal((await repo.getProject(project.project_id)).project.notes, "С retry");
  await autosave.destroy();
});

test("crash recovery uses a valid checkpoint for a damaged project", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Recovery" });
  await repo.updateProject(project.project_id, { notes: "confirmed" });
  const database = await repo._database();
  const read = database.transaction("projects", "readonly");
  const damaged = await requestResult(
    read.objectStore("projects").get(project.project_id),
  );
  await transactionDone(read);
  damaged.notes = "corrupted without checksum";
  const write = database.transaction("projects", "readwrite");
  write.objectStore("projects").put(damaged);
  await transactionDone(write);
  const aggregate = await repo.getProject(project.project_id);
  assert.equal(aggregate.project.notes, "confirmed");
  assert.match(aggregate.project.recovery_notice, /восстановлен/i);
});

test("a corrupt draft checkpoint never blocks project opening", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Safe open" });
  const database = await repo._database();
  const transaction = database.transaction("checkpoints", "readwrite");
  transaction.objectStore("checkpoints").add({
    checkpoint_id: uuidv7(),
    project_id: project.project_id,
    aggregate_type: "RECOVERY_DRAFT",
    aggregate_id: project.project_id,
    revision: 1,
    generation: 999,
    snapshot: { broken: true },
    payload_checksum: "0".repeat(64),
    created_at: new Date().toISOString(),
    retention_until: new Date(Date.now() + 10000).toISOString(),
    validation_status: "PENDING_DRAFT",
  });
  await transactionDone(transaction);
  const aggregate = await repo.getProject(project.project_id);
  assert.equal(aggregate.project.title, "Safe open");
  assert.equal(aggregate.recovery_draft, null);
});

test("export and import round trip preserves calculation data", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Перенос" });
  await repo.addCalculation(
    project.project_id,
    calculationInput(52),
    calculationResult(104),
  );
  const exported = await repo.exportProject(project.project_id);
  assert.equal(exported.envelope.format, "yarnai-project");
  assert.match(exported.filename, /\.yarnai-project\.json$/);
  const imported = await repo.importProject(exported.json);
  assert.equal(imported.status, "IMPORTED");
  assert.equal(imported.collision, true);
  assert.notEqual(imported.project_id, project.project_id);
  const restored = await repo.getProject(imported.project_id);
  assert.equal(restored.calculations[0].result.axes.width.selected_candidate.working_count, 104);
  const repeated = await repo.importProject(exported.json);
  assert.equal(repeated.status, "ALREADY_IMPORTED");
  assert.equal(repeated.project_id, imported.project_id);
});

test("invalid import and checksum mismatch are rejected", async () => {
  const repo = repository();
  await assert.rejects(
    repo.importProject("{not json"),
    (error) => error.code === "INVALID_IMPORT_JSON",
  );
  const project = await repo.createProject({ title: "Checksum" });
  const exported = await repo.exportProject(project.project_id);
  exported.envelope.payload.project.title = "tampered";
  await assert.rejects(
    repo.importProject(JSON.stringify(exported.envelope)),
    (error) => error.code === "IMPORT_CHECKSUM_MISMATCH",
  );
});

test("unsupported import version is rejected before writing", async () => {
  const repo = repository();
  const project = await repo.createProject({ title: "Version" });
  const exported = await repo.exportProject(project.project_id);
  exported.envelope.schema_version = 99;
  await assert.rejects(
    repo.importProject(JSON.stringify(exported.envelope)),
    (error) => error.code === "UNSUPPORTED_SCHEMA_VERSION",
  );
  assert.equal((await repo.listProjects({ section: "all" })).length, 1);
});

test("project ID conflict imports as a new project with lineage", async () => {
  const repo = repository();
  const source = await repo.createProject({ title: "Collision" });
  const exported = await repo.exportProject(source.project_id);
  const imported = await repo.importProject(exported.json);
  const copy = await repo.getProject(imported.project_id);
  assert.equal(copy.project.imported_from_project_id, source.project_id);
  assert.equal((await repo.listProjects({ section: "all" })).length, 2);
});

test("invalid import plan is atomic and leaves no partial project", async () => {
  const repo = repository();
  const source = await repo.createProject({ title: "Atomic source" });
  await repo.addCalculation(
    source.project_id,
    calculationInput(),
    calculationResult(),
  );
  const exported = await repo.exportProject(source.project_id);
  exported.envelope.export_id = uuidv7();
  const importedProjectId = uuidv7();
  exported.envelope.payload.project.project_id = importedProjectId;
  exported.envelope.payload.calculations.forEach((entry) => {
    entry.project_id = importedProjectId;
  });
  exported.envelope.payload.progress.forEach((entry) => {
    entry.project_id = importedProjectId;
  });
  exported.envelope.payload.events.forEach((entry) => {
    entry.project_id = importedProjectId;
    if (entry.aggregate_type === "PROJECT") {
      entry.aggregate_id = importedProjectId;
    }
  });
  exported.envelope.payload.progress[0].kind = "EXECUTABLE_SCRIPT";
  exported.envelope.payload_checksum = await checksumPayload(
    exported.envelope.payload,
  );
  const before = (await repo.listProjects({ section: "all" })).length;
  await assert.rejects(
    repo.importProject(JSON.stringify(exported.envelope)),
    (error) => error.code === "INVALID_IMPORT_PROGRESS",
  );
  const after = (await repo.listProjects({ section: "all" })).length;
  assert.equal(after, before);
});
