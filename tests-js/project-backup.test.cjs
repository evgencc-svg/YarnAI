"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
require("../src/yarnai/static/project-backup.js");

const system = global.YarnAIProjectSystem;
const backup = global.YarnAIFullProjectBackup;
const repositories = [];

function timestamp(offset = 0) {
  return new Date(Date.UTC(2026, 7, 31, 10, 0, offset)).toISOString();
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database blocked"));
  });
}

async function countProjects(repository) {
  const database = await repository._database();
  const transaction = database.transaction("projects", "readonly");
  const request = transaction.objectStore("projects").count();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function flaxFixture() {
  const repository = new system.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const project = await repository.createProject({ title: "Контроль Flax PDF — 20260829T064744Z" });
  const calculationResult = await repository.addCalculation(
    project.project_id,
    { axes: ["width"] },
    { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] },
  );
  const calculationId = calculationResult.calculation.calculation_id;
  const makeProgress = (kind, state, sequence) => ({
    schema_version: 1,
    progress_id: system.uuidv7(Date.parse(timestamp(sequence))),
    project_id: project.project_id,
    calculation_id: calculationId,
    kind,
    epoch: 1,
    state,
    revision: 1,
    created_at: timestamp(sequence),
    updated_at: timestamp(sequence),
    deleted_at: null,
    purge_after: null,
    sync_status: "LOCAL_ONLY",
    server_version: null,
    last_synced_at: null,
    conflict_id: null,
  });
  const planSteps = Array.from({ length: 127 }, (_, index) => ({ id: `step:${index + 1}`, order: index + 1 }));
  const records = [
    makeProgress("PATTERN_TECHNOLOGY_REVIEW", {
      kind: "PATTERN_TECHNOLOGY_REVIEW", projectId: project.project_id,
      revision: 29, status: "confirmed",
    }, 10),
    makeProgress("PATTERN_EXECUTION_PLAN", {
      kind: "PATTERN_EXECUTION_PLAN", projectId: project.project_id,
      revision: 36, status: "ready", planFingerprint: "fnv1a32:c065298e",
      plan: { steps: planSteps, planFingerprint: "fnv1a32:c065298e" },
    }, 11),
    makeProgress("PATTERN_EXECUTION_SESSION", {
      kind: "PATTERN_EXECUTION_SESSION", projectId: project.project_id,
      revision: 130, status: "waiting",
      virtualDryRun: { completedStepIds: planSteps.map((entry) => entry.id), result: { completedStepCount: 127 } },
      physicalProgress: { completedStepIds: [], completedStepCount: 0 },
    }, 12),
  ];
  const database = await repository._database();
  const transaction = database.transaction("progress", "readwrite");
  records.forEach((entry) => transaction.objectStore("progress").add(entry));
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 1, 2, 3, 4, 5]);
  await repository.savePatternFile(
    project.project_id,
    "flax-source",
    new Blob([pdfBytes], { type: "application/pdf" }),
    { displayName: "Flax.pdf", mediaType: "application/pdf" },
  );
  const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 8, 7, 6]);
  await repository.addPhoto(
    project.project_id,
    new Blob([imageBytes], { type: "image/png" }),
    { display_name: "Образец.png" },
  );
  return { repository, project, calculationId, pdfBytes, imageBytes };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close().catch(() => undefined)));
  await deleteDatabase();
});

test("full backup contains exact project closure and every real binary", async () => {
  const fixture = await flaxFixture();
  const exported = await backup.createFullBackup(fixture.repository, fixture.project.project_id);
  const validated = await backup.validateFullBackup(exported.json);
  assert.equal(exported.envelope.format, backup.FORMAT);
  assert.equal(exported.envelope.format_version, 1);
  assert.equal(validated.report.project_title, "Контроль Flax PDF — 20260829T064744Z");
  assert.equal(validated.report.binary_file_count, 2);
  assert.equal(validated.report.checksum_status, "PASS");
  assert.deepEqual(validated.report.execution, {
    stage21_revision: 29,
    stage22_revision: 36,
    stage22_fingerprint: "fnv1a32:c065298e",
    step_count: 127,
    virtual_completed: 127,
    physical_completed: 0,
    physical_session_revision: 130,
  });
  const pdf = validated.binaries.find((entry) => entry.name === "Flax.pdf");
  const image = validated.binaries.find((entry) => entry.name === "Образец.png");
  assert.deepEqual([...pdf.bytes], [...fixture.pdfBytes]);
  assert.deepEqual([...image.bytes], [...fixture.imageBytes]);
  assert.ok(validated.envelope.manifest.records.some((entry) => entry.store === "checkpoints"));
  assert.equal(JSON.stringify(validated.envelope).includes("binary_omitted"), false);
  assert.match(exported.filename, /^Контроль Flax PDF — 20260829T064744Z — полная резервная копия/);
});

test("isolated restore is exact, survives repository reload, and keeps source bytes", async () => {
  const fixture = await flaxFixture();
  const exported = await backup.createFullBackup(fixture.repository, fixture.project.project_id);
  const validated = await backup.validateFullBackup(exported.json);
  await fixture.repository.close();
  repositories.splice(repositories.indexOf(fixture.repository), 1);
  await deleteDatabase();
  const isolated = new system.ProjectRepository();
  repositories.push(isolated);
  await isolated.initialize();
  const restored = await backup.restoreFullBackup(isolated, validated, {
    currentOrigin: "http://127.0.0.1:8001",
    canonicalOrigin: "http://127.0.0.1:8000",
  });
  assert.equal(restored.status, "RESTORED_AND_VERIFIED");
  assert.equal(restored.execution.stage21_revision, 29);
  assert.equal(restored.execution.stage22_revision, 36);
  assert.equal(restored.execution.stage22_fingerprint, "fnv1a32:c065298e");
  assert.equal(restored.execution.step_count, 127);
  assert.equal(restored.execution.virtual_completed, 127);
  assert.equal(restored.execution.physical_completed, 0);
  assert.equal(restored.execution.physical_session_revision, 130);
  await isolated.close();
  repositories.splice(repositories.indexOf(isolated), 1);
  const reloaded = new system.ProjectRepository();
  repositories.push(reloaded);
  await reloaded.initialize();
  const aggregate = await reloaded.getProject(fixture.project.project_id);
  assert.equal(aggregate.project.project_id, fixture.project.project_id);
  const stored = await reloaded.getPatternFile(fixture.project.project_id, "flax-source");
  assert.deepEqual([...new Uint8Array(await stored.blob.arrayBuffer())], [...fixture.pdfBytes]);
});

test("damaged, missing, wrong-checksum and extra binaries fail before restore", async () => {
  const fixture = await flaxFixture();
  const exported = await backup.createFullBackup(fixture.repository, fixture.project.project_id);
  const base = JSON.parse(exported.json);
  const damaged = structuredClone(base);
  const bytes = Buffer.from(damaged.data.binaries[0].data_base64, "base64");
  bytes[0] ^= 0xff;
  damaged.data.binaries[0].data_base64 = bytes.toString("base64");
  await assert.rejects(backup.validateFullBackup(damaged), { code: "BACKUP_BINARY_CHECKSUM_MISMATCH" });
  const missing = structuredClone(base);
  missing.data.binaries.pop();
  await assert.rejects(backup.validateFullBackup(missing), { code: "BACKUP_BINARY_MISSING" });
  const wrongChecksum = structuredClone(base);
  wrongChecksum.data.binaries[0].sha256 = "0".repeat(64);
  await assert.rejects(backup.validateFullBackup(wrongChecksum), { code: "BACKUP_BINARY_CHECKSUM_MISMATCH" });
  const extra = structuredClone(base);
  extra.data.binaries.push({ ...structuredClone(extra.data.binaries[0]), id: system.uuidv7(), data_base64: extra.data.binaries[0].data_base64 });
  await assert.rejects(backup.validateFullBackup(extra), { code: "BACKUP_EXTRA_BINARY" });
});

test("duplicate IDs, foreign project records, omitted bytes and canonical target fail closed", async () => {
  const fixture = await flaxFixture();
  const exported = await backup.createFullBackup(fixture.repository, fixture.project.project_id);
  const base = JSON.parse(exported.json);
  const duplicate = structuredClone(base);
  duplicate.data.records.operations.push(structuredClone(duplicate.data.records.operations[0]));
  await assert.rejects(backup.validateFullBackup(duplicate), { code: "BACKUP_DUPLICATE_ID" });
  const foreign = structuredClone(base);
  foreign.data.records.progress[0].project_id = system.uuidv7();
  await assert.rejects(backup.validateFullBackup(foreign), { code: "BACKUP_FOREIGN_PROJECT_RECORD" });
  const omitted = structuredClone(base);
  omitted.data.records.projects[0].media_policy = "binary_omitted";
  await assert.rejects(backup.validateFullBackup(omitted), { code: "BACKUP_BINARY_OMITTED" });
  const validated = await backup.validateFullBackup(base);
  await assert.rejects(backup.restoreFullBackup(fixture.repository, validated, {
    currentOrigin: "http://127.0.0.1:8000",
    canonicalOrigin: "http://127.0.0.1:8000",
  }), { code: "BACKUP_CANONICAL_RESTORE_FORBIDDEN" });
  assert.equal(await countProjects(fixture.repository), 1);
});

test("failed isolated preflight writes nothing into a non-empty target", async () => {
  const fixture = await flaxFixture();
  const exported = await backup.createFullBackup(fixture.repository, fixture.project.project_id);
  const validated = await backup.validateFullBackup(exported.json);
  await assert.rejects(backup.restoreFullBackup(fixture.repository, validated, {
    currentOrigin: "http://127.0.0.1:8001",
    canonicalOrigin: "http://127.0.0.1:8000",
  }), { code: "BACKUP_ISOLATED_STORAGE_NOT_EMPTY" });
  assert.equal(await countProjects(fixture.repository), 1);
});
