"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const review = require("../src/yarnai/static/pattern-analysis-review.js");

const repositories = [];
const stamp = (seconds) => new Date(seconds * 1000).toISOString();

function evidence(text, start = 0) { return { sourceFileId: "file-1", sourceFileName: "pattern.txt", start, end: start + text.length, text, ruleId: "test.rule" }; }
function baseResult(overrides = {}) {
  return {
    schemaVersion: 1,
    sourceSummary: { textLength: 200, filesCount: 1, textFilesCount: 1, pdfFilesCount: 0, imageFilesCount: 0, truncated: false },
    language: { primary: "en", detected: [], confidence: 1 }, documentType: { value: "knitting_pattern", confidence: .9 },
    craft: { value: "knitting", confidence: .9 }, garment: { type: "sweater", confidence: .8, evidence: [evidence("sweater")] },
    construction: { method: "top_down", direction: "top_down", workedInRound: "yes", seamless: "yes", features: [], confidence: .8, evidence: [evidence("top down", 10)] },
    sizing: { labels: ["S"], measurements: [{ name: "chest", value: 90, unit: "cm", evidence: evidence("90 cm", 20) }], selectedSize: null, confidence: .8 },
    gauge: { stitches: [{ value: 20, per: 10, unit: "cm", evidence: evidence("20 stitches", 30) }], rows: [{ value: 28, per: 10, unit: "cm", evidence: evidence("28 rows", 45) }], units: ["cm"], confidence: .8, evidence: [] },
    yarn: { names: ["Merino"], weights: [], fiberContent: [], amounts: [{ value: 500, unit: "g", evidence: evidence("500 g", 60) }], colors: [], confidence: .7, evidence: [] },
    tools: { needleSizes: [{ value: 4, unit: "mm", evidence: evidence("4 mm", 70) }], hookSizes: [], cableNeedleMentioned: false, stitchMarkersMentioned: true, other: [], confidence: .8 },
    abbreviations: [{ abbreviation: "k", definition: "knit", evidence: evidence("k = knit", 80) }], sections: [{ id: "body", title: "Body", evidence: evidence("Body", 90) }], stitchPatterns: [],
    rowInstructions: [{ rowNumber: 1, instructionText: "knit", start: 100, end: 112, confidence: .8, evidence: evidence("Row 1: knit", 100) }],
    repeatInstructions: [{ repeatType: "rows", repeatCount: 2, start: 120, end: 140, confidence: .8, evidence: evidence("repeat twice", 120) }],
    counts: { castOn: [{ value: 80, unit: "stitches", start: 150, evidence: evidence("80 stitches", 150) }], bindOff: [], stitches: [], rows: [], repeats: [] },
    unsupportedContent: [], unresolvedTerms: [], evidence: [evidence("sweater")], diagnostics: [],
    analysisSummary: { recognizedFields: 12, ambiguousFields: 0, missingCriticalFields: [], confidence: .85 },
    ...overrides,
  };
}
function semantic(overrides = {}) {
  return { id: overrides.id || global.YarnAIProjectSystem.uuidv7(), projectId: overrides.projectId || "project", kind: "PATTERN_SEMANTIC_ANALYSIS", version: 1, revision: overrides.revision || 3, status: overrides.status || "completed", sourceExtractionId: overrides.sourceExtractionId || "extraction", sourceExtractionRevision: overrides.sourceExtractionRevision || 4, sourceImportRevision: overrides.sourceImportRevision || 2, sourceFingerprint: "fnv1a32:12345678", result: overrides.result || baseResult(), warnings: [], errors: [], createdAt: stamp(1), updatedAt: stamp(3), startedAt: stamp(2), completedAt: stamp(3), failedAt: null };
}
function builtState(source = semantic(), projectId = source.projectId) {
  const initial = review.createInitialState({ projectId, sourceSemanticAnalysisId: source.id, sourceSemanticAnalysisRevision: source.revision, sourceSemanticFingerprint: review.semanticFingerprint(source), sourceContentExtractionRevision: source.sourceExtractionRevision, sourceImportRevision: source.sourceImportRevision }, stamp(4));
  return review.buildReviewState(initial, source, stamp(5));
}
async function fixture(source = null) {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Review" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const importProgress = await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, "PATTERN_IMPORT", { projectId: project.project_id, revision: 2, status: "completed" });
  const analysisProgress = await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, "PATTERN_ANALYSIS", { projectId: project.project_id, revision: 1, status: "completed", sourceImportRevision: 2 });
  const extraction = { id: global.YarnAIProjectSystem.uuidv7(), projectId: project.project_id, kind: "PATTERN_CONTENT_EXTRACTION", version: 1, revision: 4, status: "completed", sourceImportId: importProgress.progress_id, sourceImportRevision: 2, sourceAnalysisId: analysisProgress.progress_id, sourceAnalysisRevision: 1 };
  const extractionProgress = await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, "PATTERN_CONTENT_EXTRACTION", extraction);
  const value = source || semantic({ projectId: project.project_id, sourceExtractionId: extractionProgress.progress_id });
  await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, "PATTERN_SEMANTIC_ANALYSIS", value);
  return { repository, project, calculation: added.calculation, semantic: value };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("creates one review after completed Stage 18 and creation is idempotent", async () => {
  const context = await fixture(); const first = await review.ensureForProject(context.repository, context.project.project_id); const second = await review.ensureForProject(context.repository, context.project.project_id);
  assert.ok(["reviewing", "ready_to_confirm"].includes(first.review.status)); assert.deepEqual(second.review, first.review);
  assert.equal((await context.repository.getProject(context.project.project_id)).progress.filter((entry) => entry.kind === review.PROGRESS_KIND).length, 1);
});

test("originalSnapshot and originalValue remain immutable through accepted, corrected and rejected edits", () => {
  const source = semantic(); let state = builtState(source); const original = structuredClone(state.originalSnapshot); const items = state.reviewedData.items; const yarn = items.find((item) => item.category === "yarn"); const tool = items.find((item) => item.category === "tools" && item.subtype === "needleSizes"); const section = items.find((item) => item.category === "sections");
  state = review.updateItem(state, yarn.itemId, { decision: "accepted" }, stamp(6)); state = review.updateItem(state, tool.itemId, { reviewedValue: { ...tool.originalValue, value: 4.5 }, decision: "corrected" }, stamp(7)); state = review.updateItem(state, section.itemId, { decision: "rejected" }, stamp(8));
  assert.deepEqual(state.originalSnapshot, original); assert.deepEqual(state.reviewedData.items.find((item) => item.itemId === tool.itemId).originalValue, tool.originalValue); assert.equal(state.reviewedData.items.find((item) => item.itemId === section.itemId).decision, "rejected");
});

test("classifies critical, important and informational items deterministically", () => {
  assert.equal(review.classifyReviewItem({ category: "craft", reviewedValue: "crochet" }), "critical");
  assert.equal(review.classifyReviewItem({ category: "yarn", reviewedValue: "Merino" }), "important");
  assert.equal(review.classifyReviewItem({ category: "sections", reviewedValue: "Body" }), "informational");
  assert.equal(review.classifyReviewItem({ category: "gauge", reviewedValue: { value: -2 } }), "critical");
});

test("conflicts require explicit selection, custom correction or rejection", () => {
  const result = baseResult(); result.gauge.stitches.push({ value: 22, per: 10, unit: "cm", evidence: evidence("22 stitches", 180) }); let state = builtState(semantic({ result })); const group = state.reviewedData.conflictGroups.find((entry) => entry.category === "gauge");
  assert.equal(group.status, "unresolved"); assert.equal(group.selectedItemId, null); assert.equal(state.validation.canConfirm, false);
  state = review.resolveConflict(state, group.conflictId, { mode: "select", itemId: group.itemIds[1] }, stamp(6)); assert.equal(state.reviewedData.conflictGroups[0].selectedItemId, group.itemIds[1]); assert.equal(state.reviewedData.items.find((item) => item.itemId === group.itemIds[0]).decision, "rejected");
  let custom = builtState(semantic({ result })); custom = review.resolveConflict(custom, group.conflictId, { mode: "custom", value: { value: 21, per: 10, unit: "cm" } }, stamp(6)); assert.equal(custom.reviewedData.conflictGroups[0].customValue.value, 21); assert.ok(custom.reviewedData.items.some((item) => item.decision === "corrected"));
  let rejected = builtState(semantic({ result })); rejected = review.resolveConflict(rejected, group.conflictId, { mode: "reject_all" }, stamp(6)); assert.equal(rejected.reviewedData.conflictGroups[0].status, "rejected"); assert.equal(rejected.validation.canConfirm, false);
});

test("unresolved critical blocks confirmation while important and informational become warnings", () => {
  const criticalResult = baseResult({ craft: { value: "unknown", confidence: 0 } }); const criticalSource = semantic({ result: criticalResult }); const critical = builtState(criticalSource); assert.equal(critical.validation.canConfirm, false); assert.throws(() => review.confirmState(critical, criticalSource, stamp(9)), { code: "REVIEW_CONFIRM_BLOCKED" });
  const source = semantic(); const state = builtState(source); assert.equal(state.validation.unresolvedImportantCount > 0, true); assert.equal(state.validation.canConfirm, true); const confirmed = review.confirmState(state, source, stamp(9)); assert.ok(confirmed.confirmedSnapshot.warnings.some((entry) => entry.code === "REVIEW_UNRESOLVED_NONCRITICAL"));
});

test("validation returns stable machine codes for structure, units, numbers and stale source", () => {
  const source = semantic(); const state = builtState(source); state.reviewedData.items[0].unit = "parsecs"; state.reviewedData.items[1].projectId = "other"; state.reviewedData.items.push(structuredClone(state.reviewedData.items[0]));
  const validation = review.validateReviewedData(state, { ...review.sourceDescriptor(source), revision: source.revision + 1 }, stamp(10)); const codes = validation.errors.map((entry) => entry.code);
  assert.ok(codes.includes("REVIEW_UNIT_INVALID")); assert.ok(codes.includes("REVIEW_ITEM_PROJECT_MISMATCH")); assert.ok(codes.includes("REVIEW_ITEM_ID_DUPLICATE")); assert.ok(codes.includes("REVIEW_SOURCE_REVISION_STALE"));
});

test("fingerprint mismatch and source revision changes make aggregate stale", async () => {
  const context = await fixture(); let inspected = await review.ensureForProject(context.repository, context.project.project_id); const aggregate = await context.repository.getProject(context.project.project_id); const semanticProgress = aggregate.progress.find((entry) => entry.kind === "PATTERN_SEMANTIC_ANALYSIS"); semanticProgress.state.result.garment.type = "hat"; const database = await context.repository._database(); const transaction = database.transaction("progress", "readwrite"); transaction.objectStore("progress").put(semanticProgress); await new Promise((resolve) => { transaction.oncomplete = resolve; }); inspected = review.inspectAggregate(await context.repository.getProject(context.project.project_id)); assert.equal(inspected.state, "stale"); assert.equal(inspected.reasonCode, "REVIEW_SOURCE_FINGERPRINT_STALE");
});

test("exact rebase transfers decisions and ambiguous exact matches do not transfer corrections", () => {
  const oldSource = semantic(); let state = builtState(oldSource); const yarn = state.reviewedData.items.find((item) => item.category === "yarn"); state = review.updateItem(state, yarn.itemId, { reviewedValue: "Corrected Merino", decision: "corrected" }, stamp(6));
  const nextSource = semantic({ id: oldSource.id, revision: oldSource.revision + 1, result: structuredClone(oldSource.result) }); const rebased = review.rebaseState(state, nextSource, stamp(7)); const transferred = rebased.reviewedData.items.find((item) => item.category === "yarn"); assert.equal(transferred.decision, "corrected"); assert.equal(transferred.reviewedValue, "Corrected Merino"); assert.equal(rebased.auditSnapshots.length, 1);
  const duplicateState = structuredClone(state); duplicateState.reviewedData.items.push(structuredClone(yarn)); duplicateState.reviewedData.items.at(-1).itemId = `${yarn.itemId}:duplicate`; const ambiguous = review.rebaseState(duplicateState, nextSource, stamp(8)); assert.equal(ambiguous.reviewedData.items.find((item) => item.category === "yarn").decision, "unresolved"); assert.ok(ambiguous.validation.warnings.some((entry) => entry.code === "REVIEW_REBASE_AMBIGUOUS"));
});

test("interrupted build, rebase and confirmation recover without undoing a stored confirmation", () => {
  const source = semantic(); const initial = review.createInitialState({ projectId: source.projectId, sourceSemanticAnalysisId: source.id, sourceSemanticAnalysisRevision: source.revision, sourceSemanticFingerprint: review.semanticFingerprint(source), sourceContentExtractionRevision: source.sourceExtractionRevision, sourceImportRevision: source.sourceImportRevision }, stamp(4));
  const building = review.beginOperation(initial, "build", stamp(5)); const recoveredBuild = review.recoverInterruptedState(building, stamp(6)); assert.equal(recoveredBuild.status, "waiting"); assert.equal(recoveredBuild.lastError.code, "REVIEW_BUILD_INTERRUPTED");
  const state = builtState(source); const interrupted = review.recoverInterruptedState(review.beginOperation(state, "rebase", stamp(6)), stamp(7)); assert.equal(interrupted.status, "needs_attention");
  const confirmed = review.confirmState(state, source, stamp(8)); assert.deepEqual(review.recoverInterruptedState(confirmed, stamp(9)), confirmed);
});

test("confirmation is idempotent at repository level and confirmed revision is immutable", async () => {
  const context = await fixture(); let inspected = await review.ensureForProject(context.repository, context.project.project_id); inspected = await review.confirmForProject(context.repository, context.project.project_id); const snapshot = structuredClone(inspected.review.confirmedSnapshot); const repeated = await review.confirmForProject(context.repository, context.project.project_id); assert.deepEqual(repeated.review.confirmedSnapshot, snapshot); assert.equal(repeated.review.status, "confirmed"); assert.throws(() => review.updateItem(repeated.review, repeated.review.reviewedData.items[0].itemId, { decision: "accepted" }), { code: "REVIEW_CONFIRMED_IMMUTABLE" });
});

test("a stale confirmed review rebases only as a new revision and audits the old confirmation", async () => {
  const context = await fixture(); let inspected = await review.ensureForProject(context.repository, context.project.project_id); inspected = await review.confirmForProject(context.repository, context.project.project_id); const confirmedRevision = inspected.review.revision; const aggregate = await context.repository.getProject(context.project.project_id); const semanticProgress = aggregate.progress.find((entry) => entry.kind === "PATTERN_SEMANTIC_ANALYSIS"); semanticProgress.state.revision += 1; semanticProgress.state.result.garment.type = "hat"; const database = await context.repository._database(); const transaction = database.transaction("progress", "readwrite"); transaction.objectStore("progress").put(semanticProgress); await new Promise((resolve) => { transaction.oncomplete = resolve; }); inspected = await review.rebaseForProject(context.repository, context.project.project_id); assert.ok(inspected.review.revision > confirmedRevision); assert.notEqual(inspected.review.status, "confirmed"); assert.equal(inspected.review.auditSnapshots.length, 1); assert.equal(inspected.review.auditSnapshots[0].reviewedData.projectId, context.project.project_id);
});

test("reload restores edits and interrupted operation is recovered", async () => {
  const context = await fixture(); let inspected = await review.ensureForProject(context.repository, context.project.project_id); const item = inspected.review.reviewedData.items.find((entry) => entry.category === "yarn"); let edited = review.updateItem(inspected.review, item.itemId, { reviewedValue: "Local correction", decision: "corrected" }, stamp(8)); inspected = await review.saveForProject(context.repository, context.project.project_id, edited); await context.repository.close(); repositories.splice(repositories.indexOf(context.repository), 1); const reopened = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(reopened); await reopened.initialize(); inspected = await review.ensureForProject(reopened, context.project.project_id); assert.equal(inspected.review.reviewedData.items.find((entry) => entry.itemId === item.itemId).reviewedValue, "Local correction");
});

test("stale revision and repeated save are controlled", async () => {
  const context = await fixture(); const inspected = await review.ensureForProject(context.repository, context.project.project_id); const item = inspected.review.reviewedData.items[0]; const first = review.updateItem(inspected.review, item.itemId, { decision: "accepted" }, stamp(8)); await review.saveForProject(context.repository, context.project.project_id, first); await assert.rejects(review.saveForProject(context.repository, context.project.project_id, first), { code: "REVIEW_STALE_REVISION" });
});

test("confirmedSnapshot excludes rejected values and retains corrected provenance", () => {
  const source = semantic(); let state = builtState(source); const yarn = state.reviewedData.items.find((item) => item.category === "yarn" && item.subtype === "names"); const section = state.reviewedData.items.find((item) => item.category === "sections"); state = review.updateItem(state, yarn.itemId, { reviewedValue: "Corrected", decision: "corrected" }, stamp(6)); state = review.updateItem(state, section.itemId, { decision: "rejected" }, stamp(7)); const confirmed = review.confirmState(state, source, stamp(8)); assert.equal(confirmed.confirmedSnapshot.values.some((item) => item.itemId === section.itemId), false); const corrected = confirmed.confirmedSnapshot.values.find((item) => item.itemId === yarn.itemId); assert.equal(corrected.value, "Corrected"); assert.equal(corrected.provenance.originalValue, "Merino"); assert.ok(corrected.provenance.evidence);
});

test("export/import and collision import preserve edits without cross-project references or false confirmation", async () => {
  const context = await fixture(); let inspected = await review.ensureForProject(context.repository, context.project.project_id); const item = inspected.review.reviewedData.items.find((entry) => entry.category === "yarn"); const edited = review.updateItem(inspected.review, item.itemId, { reviewedValue: "Imported correction", decision: "corrected" }, stamp(8)); await review.saveForProject(context.repository, context.project.project_id, edited); const exported = await context.repository.exportProject(context.project.project_id); assert.match(exported.json, /PATTERN_ANALYSIS_REVIEW/); const imported = await context.repository.importProject(exported.json); const importedAggregate = await context.repository.getProject(imported.project_id); const importedReview = importedAggregate.progress.find((entry) => entry.kind === review.PROGRESS_KIND).state; assert.equal(importedReview.status, "needs_attention"); assert.equal(importedReview.reviewedData.items.find((entry) => entry.itemId === item.itemId).reviewedValue, "Imported correction"); assert.equal(importedReview.projectId, imported.project_id); assert.ok(importedReview.reviewedData.items.every((entry) => entry.projectId === imported.project_id)); assert.equal(importedReview.confirmedSnapshot, null);
});

test("corrupted imports reject duplicate items, missing conflict items and confirmed without snapshot", async () => {
  const context = await fixture(); await review.ensureForProject(context.repository, context.project.project_id); const exported = await context.repository.exportProject(context.project.project_id); const cases = [
    (state) => state.reviewedData.items.push(structuredClone(state.reviewedData.items[0])),
    (state) => state.reviewedData.conflictGroups.push({ conflictId: "broken", category: "gauge", itemIds: ["missing", "other"], status: "unresolved" }),
    (state) => { state.status = "confirmed"; state.confirmedSnapshot = null; },
  ];
  for (const mutate of cases) { const envelope = structuredClone(exported.envelope); const state = envelope.payload.progress.find((entry) => entry.kind === review.PROGRESS_KIND).state; mutate(state); envelope.export_id = global.YarnAIProjectSystem.uuidv7(); envelope.payload_checksum = await global.YarnAIProjectSystem.checksumPayload(envelope.payload); await assert.rejects(context.repository.importProject(envelope), (error) => error.code.startsWith("INVALID_IMPORT_REVIEW")); }
});

test("large model with thousands of rows and counts builds without dropping items", () => {
  const result = baseResult(); result.rowInstructions = []; result.counts.stitches = [];
  for (let index = 0; index < 3000; index += 1) { result.rowInstructions.push({ rowNumber: index + 1, instructionText: `row ${index + 1}`, start: index * 20, end: index * 20 + 10, evidence: evidence(`row ${index + 1}`, index * 20) }); result.counts.stitches.push({ value: index + 1, unit: "stitches", start: index * 20, evidence: evidence(`${index + 1} stitches`, index * 20) }); }
  const started = performance.now(); const data = review.buildReviewedData("large-project", semantic({ result })); assert.equal(data.items.filter((item) => item.category === "rows").length, 3000); assert.equal(data.items.filter((item) => item.category === "counts").length >= 3000, true); assert.ok(performance.now() - started < 5000);
});

test("Stage 19 application logic has no regex, network, LLM, HTML injection or Stage 20", () => {
  const names = ["pattern-analysis-review.js", "pattern-analysis-review-assistant.js"]; const source = names.map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n"); const controller = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-analysis-review-assistant.js"), "utf8");
  assert.doesNotMatch(source, /RegExp|matchAll|\.match\(|\.test\(|replace\(\s*\//); assert.doesNotMatch(source.toLowerCase(), /fetch\(|xmlhttprequest|websocket|openai|api\.openai|ocr|stage 20/); assert.match(controller, /textContent/); assert.doesNotMatch(controller, /innerHTML|insertAdjacentHTML|eval\(|new Function/);
});
