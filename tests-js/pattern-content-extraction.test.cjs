"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const analysis = require("../src/yarnai/static/pattern-analysis.js");
const extraction = require("../src/yarnai/static/pattern-content-extraction.js");

const repositories = [];

async function fixture(materials, blobs = []) {
  const repository = new global.YarnAIProjectSystem.ProjectRepository();
  repositories.push(repository);
  await repository.initialize();
  const project = await repository.createProject({ title: "Extraction" });
  const added = await repository.addCalculation(project.project_id, { axes: ["width"] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const sourceImport = { projectId: project.project_id, revision: 4, status: "completed", materials };
  const importProgress = await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, "PATTERN_IMPORT", sourceImport);
  for (let index = 0; index < blobs.length; index += 1) {
    if (blobs[index]) await repository.savePatternFile(project.project_id, materials[index].id, blobs[index], { displayName: materials[index].displayName, mediaType: blobs[index].type });
  }
  const analysisResult = await analysis.ensureForCompletedImport(repository, project.project_id);
  return { repository, project, calculation: added.calculation, sourceImport, importProgress, analysisResult };
}

function material(id, order, displayName, type, size) { return { id, order, displayName, type, size }; }

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME);
    request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked"));
  });
});

test("creates one immutable waiting record after Stage 16", async () => {
  const context = await fixture([material("one", 1, "notes.txt", "text", 5)]);
  const first = await extraction.ensureForProject(context.repository, context.project.project_id);
  const second = await extraction.ensureForProject(context.repository, context.project.project_id);
  assert.equal(first.extraction.status, "waiting");
  assert.deepEqual(first.extraction.result, extraction.emptyResult());
  assert.deepEqual(second.extraction, first.extraction);
  assert.equal((await context.repository.getProject(context.project.project_id)).progress.filter((entry) => entry.kind === extraction.PROGRESS_KIND).length, 1);
});

test("rejects unconfirmed import and missing analysis", async () => {
  const context = await fixture([material("one", 1, "notes.txt", "text", 5)]);
  const aggregate = await context.repository.getProject(context.project.project_id);
  const analysisProgress = aggregate.progress.find((entry) => entry.kind === "PATTERN_ANALYSIS");
  const db = await context.repository._database();
  let tx = db.transaction("progress", "readwrite"); tx.objectStore("progress").delete(analysisProgress.progress_id); await new Promise((resolve) => { tx.oncomplete = resolve; });
  await assert.rejects(extraction.ensureForProject(context.repository, context.project.project_id), { code: "source_analysis_missing" });

  const source = aggregate.progress.find((entry) => entry.kind === "PATTERN_IMPORT");
  tx = db.transaction("progress", "readwrite"); source.state.status = "ready"; tx.objectStore("progress").put(source); await new Promise((resolve) => { tx.oncomplete = resolve; });
  await assert.rejects(extraction.ensureForProject(context.repository, context.project.project_id), { code: "source_import_not_confirmed" });
});

test("checks source import and analysis revisions", async () => {
  const context = await fixture([material("one", 1, "notes.txt", "text", 5)]);
  const created = await extraction.ensureForProject(context.repository, context.project.project_id);
  const damaged = structuredClone(created.extractionProgress);
  damaged.state.sourceImportRevision += 1;
  const db = await context.repository._database(); const tx = db.transaction("progress", "readwrite"); tx.objectStore("progress").put(damaged); await new Promise((resolve) => { tx.oncomplete = resolve; });
  const inspected = extraction.inspectAggregate(await context.repository.getProject(context.project.project_id));
  assert.equal(inspected.state, "corrupted"); assert.equal(inspected.diagnostic.code, "source_revision_mismatch");
});

test("supports waiting, extracting, completed, partial and failed transitions", () => {
  const waiting = extraction.createInitialState({ projectId: "p", sourceImportId: "i", sourceImportRevision: 1, sourceAnalysisId: "a", sourceAnalysisRevision: 1, filesCount: 2 }, new Date(0).toISOString());
  const extracting = extraction.startState(waiting, new Date(1000).toISOString());
  const good = { sourceFileId: "1", order: 1, name: "a.txt", mediaType: "text/plain", size: 1, extractionStatus: "extracted", text: "a", textLength: 1, warnings: [], error: null };
  const bad = { sourceFileId: "2", order: 2, name: "b.zip", mediaType: "application/zip", size: 1, extractionStatus: "unsupported", text: "", textLength: 0, warnings: [{ code: "unsupported_file_type", message: "no" }], error: { code: "unsupported_file_type", message: "no" } };
  assert.equal(extraction.finishState(extracting, extraction.buildResult([good, good]), new Date(2000).toISOString()).status, "completed");
  assert.equal(extraction.finishState(extracting, extraction.buildResult([good, bad]), new Date(2000).toISOString()).status, "partial");
  assert.equal(extraction.finishState(extracting, extraction.buildResult([bad]), new Date(2000).toISOString()).status, "failed");
  assert.throws(() => extraction.startState(extracting), { code: "extraction_failed" });
});

test("extracts UTF-8 text, removes BOM, normalizes CRLF and keeps HTML inert", async () => {
  const file = material("txt", 1, "notes.md", "text", 30);
  const context = await fixture([file], [new Blob(["\ufeffПривет\r\n<b>ряд</b>\r"], { type: "text/plain" })]);
  const result = await extraction.runForProject(context.repository, context.project.project_id);
  assert.equal(result.extraction.status, "completed");
  assert.equal(result.extraction.result.files[0].text, "Привет\n<b>ряд</b>\n");
  assert.match(result.extraction.result.combinedText, /=== FILE: notes\.md ===\nПривет/);
  const controller = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-content-extraction-assistant.js"), "utf8");
  assert.match(controller, /\.textContent = file\.text/); assert.doesNotMatch(controller, /innerHTML/);
});

test("preserves file order and deterministic PDF page order", async () => {
  const files = [material("b", 2, "second.txt", "text", 1), material("a", 1, "first.pdf", "pdf", 1)];
  const context = await fixture(files, [new Blob(["B"], { type: "text/plain" }), new Blob(["P"], { type: "application/pdf" })]);
  const result = await extraction.runForProject(context.repository, context.project.project_id, { pdf: async () => ({ status: "extracted", pageCount: 2, pages: [{ text: "P1", warnings: [] }, { text: "P2", warnings: [] }], warnings: [] }) });
  assert.deepEqual(result.extraction.result.files.map((entry) => entry.name), ["first.pdf", "second.txt"]);
  assert.equal(result.extraction.result.combinedText, "=== FILE: first.pdf | PAGE: 1 ===\nP1\n\n=== FILE: first.pdf | PAGE: 2 ===\nP2\n\n=== FILE: second.txt ===\nB");
});

test("applies text size limits and reports unsupported, image metadata and missing blob", async () => {
  const base = material("x", 1, "large.txt", "text", extraction.MAX_TEXT_FILE_BYTES + 1);
  const tooLarge = await extraction.extractOne(base, new Blob([new Uint8Array(extraction.MAX_TEXT_FILE_BYTES + 1)], { type: "text/plain" }));
  assert.equal(tooLarge.error.code, "file_too_large");
  const unsupported = await extraction.extractOne(material("u", 1, "a.zip", "other", 1), new Blob(["x"], { type: "application/zip" }));
  assert.equal(unsupported.extractionStatus, "unsupported");
  const image = await extraction.extractOne(material("i", 1, "a.png", "image", 1), new Blob(["x"], { type: "image/png" }), { image: async () => ({ width: 12, height: 34, format: "PNG" }) });
  assert.equal(image.extractionStatus, "metadata_only"); assert.equal(image.width, 12);
  const missing = await extraction.extractOne(material("m", 1, "a.txt", "text", 1), null);
  assert.equal(missing.error.code, "file_blob_missing");
});

test("retry increments revision and interrupted extracting recovers as failed", async () => {
  const context = await fixture([material("one", 1, "notes.txt", "text", 1)], [new Blob(["x"], { type: "text/plain" })]);
  let result = await extraction.runForProject(context.repository, context.project.project_id);
  const firstRevision = result.extraction.revision;
  result = await extraction.runForProject(context.repository, context.project.project_id);
  assert.ok(result.extraction.revision > firstRevision);
  const started = extraction.startState(result.extraction);
  await context.repository.startPatternContentExtraction(context.project.project_id, context.calculation.calculation_id, started);
  await context.repository.close(); repositories.splice(repositories.indexOf(context.repository), 1);
  const reopened = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(reopened); await reopened.initialize();
  result = await extraction.ensureForProject(reopened, context.project.project_id);
  assert.equal(result.extraction.status, "failed"); assert.equal(result.extraction.error.code, "interrupted_extraction");
});

test("export/import remaps references and never preserves false completion", async () => {
  const context = await fixture([material("one", 1, "notes.txt", "text", 1)], [new Blob(["x"], { type: "text/plain" })]);
  await extraction.runForProject(context.repository, context.project.project_id);
  const exported = await context.repository.exportProject(context.project.project_id);
  const imported = await context.repository.importProject(exported.json);
  const aggregate = await context.repository.getProject(imported.project_id);
  const restored = extraction.inspectAggregate(aggregate);
  assert.equal(restored.extraction.status, "failed"); assert.equal(restored.extraction.error.code, "file_blob_missing");
  assert.notEqual(restored.extraction.sourceImportId, context.importProgress.progress_id);
  const repeated = await context.repository.importProject(exported.json); assert.equal(repeated.status, "ALREADY_IMPORTED");
});

test("ordinary export/import keeps references but reports omitted binaries", async () => {
  const context = await fixture([material("one", 1, "notes.txt", "text", 1)], [new Blob(["x"], { type: "text/plain" })]);
  await extraction.runForProject(context.repository, context.project.project_id);
  const exported = await context.repository.exportProject(context.project.project_id);
  await context.repository.softDeleteProject(context.project.project_id);
  await context.repository.permanentlyDeleteProject(context.project.project_id, { confirmed: true });
  const imported = await context.repository.importProject(exported.json);
  assert.equal(imported.collision, false);
  const restored = extraction.inspectAggregate(await context.repository.getProject(imported.project_id));
  assert.equal(restored.extraction.status, "failed");
  assert.equal(restored.extraction.sourceImportId, context.importProgress.progress_id);
  assert.equal(await context.repository.getPatternFile(imported.project_id, "one"), null);
});

test("pattern blobs survive reload, deduplicate and become unavailable on delete", async () => {
  const context = await fixture([material("one", 1, "notes.txt", "text", 1)]);
  const first = await context.repository.savePatternFile(context.project.project_id, "one", new Blob(["one"], { type: "text/plain" }), { displayName: "notes.txt", mediaType: "text/plain" });
  const second = await context.repository.savePatternFile(context.project.project_id, "one", new Blob(["two"], { type: "text/plain" }), { displayName: "notes.txt", mediaType: "text/plain" });
  assert.equal(second.pattern_file_id, first.pattern_file_id);
  await context.repository.close(); repositories.splice(repositories.indexOf(context.repository), 1);
  const reopened = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(reopened); await reopened.initialize();
  const stored = await reopened.getPatternFile(context.project.project_id, "one");
  assert.equal(await stored.blob.text(), "one");
  await reopened.deletePatternFile(context.project.project_id, "one");
  assert.equal(await reopened.getPatternFile(context.project.project_id, "one"), null);
});

test("two starts do not create parallel extraction records", async () => {
  const context = await fixture([material("one", 1, "pattern.pdf", "pdf", 1)], [new Blob(["x"], { type: "application/pdf" })]);
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const adapter = async () => { await gate; return { status: "extracted", pageCount: 1, pages: [{ text: "x", warnings: [] }], warnings: [] }; };
  const first = extraction.runForProject(context.repository, context.project.project_id, { pdf: adapter });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(extraction.runForProject(context.repository, context.project.project_id, { pdf: adapter }));
  release(); await first;
  const aggregate = await context.repository.getProject(context.project.project_id);
  assert.equal(aggregate.progress.filter((entry) => entry.kind === extraction.PROGRESS_KIND).length, 1);
});
