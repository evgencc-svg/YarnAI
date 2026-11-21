"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
require("../src/yarnai/static/first-blocking.js");
require("../src/yarnai/static/pattern-analysis.js");
const patternImport = require("../src/yarnai/static/pattern-import.js");
const intake = require("../src/yarnai/static/material-intake-experience.js");

const repositories = [];

function image(overrides = {}) {
  return {
    name: "sweater.jpg",
    size: 4096,
    type: "image/jpeg",
    purpose: "garment_photo",
    ...overrides,
  };
}

function pdf(overrides = {}) {
  return {
    name: "pattern.pdf",
    size: 8192,
    type: "application/pdf",
    ...overrides,
  };
}

function stored(overrides = {}) {
  return {
    id: "material-1",
    displayName: "saved.png",
    size: 1024,
    kind: "image",
    purpose: "chart",
    order: 1,
    ...overrides,
  };
}

function namedBlob(name, type, body = "material") {
  const blob = new Blob([body], { type });
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

async function directRepository() {
  const repository = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const project = await repository.createProject({ title: "Кардиган" });
  const created = await repository.addCalculation(
    project.project_id,
    {
      workflow_kind: "material_intake",
      version: 1,
      source: "user_materials",
    },
    {
      status: "READY",
      normalized_inputs: { source: "user_materials" },
      axes: {},
      warnings: [],
      errors: [],
      clarifications: [],
      canon_version: "material-intake-1",
      specification_version: "material-intake-1",
    },
    { engine_version: "material-intake-1" },
  );
  return { repository, project: created.project };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion blocked"));
  });
});

test("empty intake is safe and not ready", () => {
  const model = intake.buildViewModel({
    project: { project_id: "project-1", title: "Жилет" },
    materials: [],
    description: "",
  });
  assert.equal(model.missingProject, false);
  assert.equal(model.summary.ready, false);
  assert.equal(model.summary.title, "Добавь хотя бы один источник");
});

test("text-only intake is ready", () => {
  const ready = intake.computeReadiness({ materials: [], description: "Свободный свитер" });
  assert.equal(ready.ready, true);
  assert.equal(ready.hasDescription, true);
  assert.equal(ready.sourceCount, 1);
});

test("one supported image is normalized", () => {
  const material = intake.normalizeFileMetadata(image());
  assert.equal(material.valid, true);
  assert.equal(material.kind, "image");
  assert.equal(material.purpose, "garment_photo");
});

test("an image can be explicitly classified as a chart", () => {
  const material = intake.normalizeFileMetadata(image({ purpose: "chart" }));
  assert.equal(material.purpose, "chart");
  assert.equal(intake.PURPOSE_LABELS.chart, "Это схема");
});

test("one PDF is normalized without content analysis", () => {
  const material = intake.normalizeFileMetadata(pdf());
  assert.equal(material.valid, true);
  assert.equal(material.kind, "pdf");
  assert.equal(material.purpose, null);
});

test("multiple materials produce a combined source count", () => {
  const summary = intake.buildSummary({
    materials: [image(), pdf()],
    description: "Рукава короче",
  });
  assert.equal(summary.fileCount, 2);
  assert.equal(summary.sourceCount, 3);
  assert.equal(summary.ready, true);
});

test("stable ordering uses order then original position", () => {
  const values = intake.normalizeMaterials([
    stored({ id: "b", order: 2, displayName: "b.png" }),
    stored({ id: "a", order: 1, displayName: "a.png" }),
    stored({ id: "c", order: 2, displayName: "c.png" }),
  ]);
  assert.deepEqual(values.map((entry) => entry.id), ["a", "b", "c"]);
});

test("duplicate detection uses deterministic file metadata", () => {
  const first = image();
  const second = image();
  assert.equal(intake.detectDuplicates([first, second]).length, 1);
  assert.equal(intake.isDuplicate(second, [first]), true);
});

test("corrupted metadata fails closed", () => {
  const material = intake.normalizeFileMetadata(null);
  assert.equal(material.valid, false);
  assert.equal(material.validationCode, "CORRUPTED_METADATA");
});

test("unsupported extension is rejected", () => {
  const material = intake.normalizeFileMetadata({
    name: "archive.zip",
    size: 100,
    type: "application/zip",
  });
  assert.equal(material.valid, false);
  assert.equal(material.validationCode, "UNSUPPORTED_EXTENSION");
});

test("unsupported MIME for a known extension is rejected", () => {
  const material = intake.normalizeFileMetadata({
    name: "photo.jpg",
    size: 100,
    type: "application/pdf",
  });
  assert.equal(material.valid, false);
  assert.equal(material.validationCode, "UNSUPPORTED_MIME");
});

test("oversized files use the existing fifty megabyte limit", () => {
  const material = intake.normalizeFileMetadata(
    pdf({ size: intake.MAX_FILE_BYTES + 1 }),
  );
  assert.equal(material.valid, false);
  assert.equal(material.validationCode, "FILE_TOO_LARGE");
});

test("missing name has a user-facing validation result", () => {
  const material = intake.normalizeFileMetadata({ size: 10, type: "image/png" });
  assert.equal(material.validationCode, "MISSING_NAME");
  assert.equal(material.validationMessage, "У файла отсутствует имя.");
});

test("missing size has a user-facing validation result", () => {
  const material = intake.normalizeFileMetadata({ name: "photo.png", type: "image/png" });
  assert.equal(material.validationCode, "MISSING_SIZE");
  assert.match(material.validationMessage, /размер/);
});

test("unknown purpose safely becomes unsure", () => {
  assert.equal(intake.normalizePurpose("technical-magic"), "unknown");
  assert.equal(intake.normalizeFileMetadata(image({ purpose: "technical-magic" })).purpose, "unknown");
});

test("readiness is false without files or text", () => {
  assert.equal(intake.computeReadiness({ materials: [], description: "  " }).ready, false);
});

test("readiness is true with non-empty text", () => {
  assert.equal(intake.computeReadiness({ materials: [], description: "\nОписание\n" }).ready, true);
});

test("readiness is true with one valid file", () => {
  assert.equal(intake.computeReadiness({ materials: [image()], description: "" }).ready, true);
});

test("summary is calm and user-facing", () => {
  const summary = intake.buildSummary({ materials: [pdf()], description: "" });
  assert.equal(summary.title, "Можно продолжать");
  assert.match(summary.receivedLabel, /YarnAI получил/);
  assert.equal(summary.actionLabel, "Проверить материалы");
});

test("summary exposes no raw status or persistence kind", () => {
  const serialized = JSON.stringify(intake.buildSummary({ materials: [pdf()] }));
  assert.equal(/PATTERN_IMPORT|pattern_files|lifecycle|progress kind/.test(serialized), false);
});

test("normalization does not mutate inputs", () => {
  const source = [stored(), image()];
  const before = structuredClone(source);
  intake.normalizeMaterials(source);
  assert.deepEqual(source, before);
});

test("repeated calls are stable", () => {
  const source = { project: { project_id: "p", title: "Топ" }, materials: [pdf()], description: "Легче" };
  assert.deepEqual(intake.buildViewModel(source), intake.buildViewModel(structuredClone(source)));
});

test("domain contains no clocks or randomness", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/yarnai/static/material-intake-experience.js"),
    "utf8",
  );
  for (const token of ["Date" + ".now", "new " + "Date", "Math" + ".random", "crypto" + ".randomUUID"]) {
    assert.equal(source.includes(token), false, token);
  }
});

test("domain does not mention the next stage", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/yarnai/static/material-intake-experience.js"),
    "utf8",
  );
  assert.equal(/stage\s*56/i.test(source), false);
});

test("unknown file objects receive a safe fallback", () => {
  const material = intake.normalizeFileMetadata({ value: "mystery" });
  assert.equal(material.kind, "unknown");
  assert.equal(material.valid, false);
  assert.equal(intake.humanReadableFileKind(material), "Файл");
});

test("long names are bounded without HTML processing", () => {
  const material = intake.normalizeFileMetadata(image({ name: `${"а".repeat(260)}.jpg` }));
  assert.equal([...material.displayName].length, 200);
  assert.equal(material.displayName.includes("<"), false);
});

test("duplicate persisted IDs are detected", () => {
  const duplicates = intake.detectDuplicates([
    stored({ id: "same", displayName: "one.png" }),
    stored({ id: "same", displayName: "two.png", order: 2 }),
  ]);
  assert.equal(duplicates.length, 1);
});

test("existing persisted materials keep their identity and purpose", () => {
  const model = intake.buildViewModel({
    project: { project_id: "p", title: "Пуловер" },
    materials: [stored()],
  });
  assert.equal(model.materials[0].id, "material-1");
  assert.equal(model.materials[0].purpose, "chart");
});

test("removed materials disappear without mutating the original list", () => {
  const values = [stored(), stored({ id: "material-2", order: 2 })];
  const remaining = values.filter((entry) => entry.id !== "material-1");
  const model = intake.buildViewModel({ project: { project_id: "p" }, materials: remaining });
  assert.deepEqual(model.materials.map((entry) => entry.id), ["material-2"]);
  assert.equal(values.length, 2);
});

test("mixed valid and invalid materials count only valid sources", () => {
  const ready = intake.computeReadiness({
    materials: [pdf(), { name: "bad.exe", size: 20, type: "application/octet-stream" }],
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.fileCount, 1);
});

test("a direct material-intake calculation reuses PATTERN_IMPORT and analysis", async () => {
  const { repository, project } = await directRepository();
  let result = await patternImport.ensureForProject(repository, project.project_id);
  assert.equal(result.patternImport.status, "not_started");
  const file = namedBlob("cardigan.jpg", "image/jpeg");
  result = await patternImport.addMaterialsForProject(repository, project.project_id, [file]);
  assert.equal(result.patternImport.materials.length, 1);
  const materialId = result.patternImport.materials[0].id;
  assert.ok(await repository.getPatternFile(project.project_id, materialId));
  result = await patternImport.completeForProject(repository, project.project_id, true);
  assert.equal(result.patternImport.status, "completed");
  const aggregate = await repository.getProject(project.project_id);
  assert.equal(
    aggregate.progress.some((entry) => entry.kind === "PATTERN_ANALYSIS"),
    true,
  );
});

test("direct intake deletion removes metadata and blob before confirmation", async () => {
  const { repository, project } = await directRepository();
  await patternImport.ensureForProject(repository, project.project_id);
  let result = await patternImport.addMaterialsForProject(
    repository,
    project.project_id,
    [namedBlob("chart.png", "image/png")],
  );
  const materialId = result.patternImport.materials[0].id;
  result = await patternImport.removeMaterialForProject(
    repository,
    project.project_id,
    materialId,
  );
  assert.equal(result.patternImport.materials.length, 0);
  assert.equal(await repository.getPatternFile(project.project_id, materialId), null);
});

test("reopening a direct intake does not create duplicate progress", async () => {
  const { repository, project } = await directRepository();
  await patternImport.ensureForProject(repository, project.project_id);
  const first = await repository.getProject(project.project_id);
  const reopened = await patternImport.ensureForProject(repository, project.project_id);
  const second = await repository.getProject(project.project_id);
  assert.equal(reopened.patternImport.status, "not_started");
  assert.equal(
    second.progress.filter((entry) => entry.kind === "PATTERN_IMPORT").length,
    1,
  );
  assert.equal(second.project.revision, first.project.revision);
});
