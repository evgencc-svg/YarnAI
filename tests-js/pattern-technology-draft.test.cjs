"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const reviewApi = require("../src/yarnai/static/pattern-analysis-review.js");
const draftApi = require("../src/yarnai/static/pattern-technology-draft.js");

const repositories = [];
const stamp = (seconds) => new Date(seconds * 1000).toISOString();
const evidence = (text, start) => ({ sourceFileId: "file-1", sourceFileName: "pattern.txt", start, end: start + text.length, text, ruleId: "test.rule" });

function value(itemId, category, subtype, confirmedValue, start, options = {}) {
  return {
    itemId, category, subtype, value: structuredClone(confirmedValue), unit: options.unit ?? confirmedValue?.unit ?? null,
    decision: options.decision || "accepted", notes: options.notes || "",
    provenance: { originalValue: structuredClone(options.originalValue ?? confirmedValue), confidence: .9, evidence: [evidence(options.evidenceText || String(subtype), start)], sourceOffsets: [{ sourceFileId: "file-1", start, end: start + 2 }] },
  };
}

function fullSnapshot(projectId = "project", overrides = {}) {
  const values = [
    value("craft", "craft", "craft", "knitting", 1),
    value("product", "product", "garment", "sweater", 5),
    value("construction", "construction", "method", "top_down", 10),
    value("size", "sizes", "label", "S", 15),
    value("gauge-stitches", "gauge", "stitches", { value: 20, per: 10, unit: "cm" }, 20),
    value("gauge-rows", "gauge", "rows", { value: 28, per: 10, unit: "cm" }, 22),
    value("yarn-name", "yarn", "names", "Merino", 30),
    value("yarn-fiber", "yarn", "fiberContent", "100% wool", 32),
    value("yarn-amount", "yarn", "amounts", { value: 500, unit: "g" }, 34),
    value("needle", "tools", "needleSizes", { value: 4, unit: "mm" }, 40),
    value("abbr", "abbreviations", "definition", { abbreviation: "k", definition: "knit" }, 45),
    value("body", "sections", "section", { id: "body", title: "Body", type: "instructions" }, 50),
    value("cast", "counts", "castOn", { value: 80, unit: "stitches" }, 60),
    value("row-1", "rows", "row", { rowNumber: 1, instructionText: "knit" }, 70),
    value("row-2", "rows", "row", { rowNumber: 2, instructionText: "increase 4 stitches", type: "increase", stitchCountBefore: 80, increaseCount: 4, stitchCountAfter: 84 }, 80),
    value("repeat", "repeats", "repeat", { repeatType: "rows", repeatCount: 2, rowStart: 1, rowEnd: 2, instructionText: "repeat rows 1-2 twice" }, 90),
    value("finish", "rows", "row", { rowNumber: 3, instructionText: "finish and weave in ends", type: "finish" }, 100),
  ];
  return {
    schemaVersion: 1, projectId, sourceSemanticAnalysisId: overrides.sourceSemanticAnalysisId || "semantic-1", sourceSemanticAnalysisRevision: 3,
    sourceSemanticFingerprint: "fnv1a32:12345678", sourceContentExtractionRevision: 4, sourceImportRevision: 2,
    values: overrides.values || values, conflictResolutions: [], warnings: [], validation: { isValid: true, canConfirm: true, errors: [], warnings: [], unresolvedCriticalCount: 0 }, confirmedAt: stamp(8),
    ...overrides,
  };
}

function confirmedReview(projectId = "project", snapshot = fullSnapshot(projectId), overrides = {}) {
  return {
    id: overrides.id || "review-1", projectId, kind: "PATTERN_ANALYSIS_REVIEW", version: 1, revision: overrides.revision || 7, status: overrides.status || "confirmed",
    sourceSemanticAnalysisId: snapshot.sourceSemanticAnalysisId, sourceSemanticAnalysisRevision: snapshot.sourceSemanticAnalysisRevision,
    sourceSemanticFingerprint: snapshot.sourceSemanticFingerprint, sourceContentExtractionRevision: snapshot.sourceContentExtractionRevision, sourceImportRevision: snapshot.sourceImportRevision,
    confirmedSnapshot: overrides.confirmedSnapshot === undefined ? snapshot : overrides.confirmedSnapshot,
  };
}

function built(projectId = "project", snapshot = fullSnapshot(projectId)) {
  const review = confirmedReview(projectId, snapshot);
  return { review, state: draftApi.buildState(draftApi.createInitialState(projectId, review, stamp(9)), review, stamp(10)) };
}

function semanticResult() {
  return { schemaVersion: 1, sourceSummary: { textLength: 100 }, craft: { value: "knitting" }, garment: { type: "sweater" }, construction: {}, sizing: {}, gauge: {}, yarn: {}, tools: {}, abbreviations: [], sections: [], rowInstructions: [], repeatInstructions: [], counts: { castOn: [], bindOff: [], stitches: [], rows: [], repeats: [] }, evidence: [], analysisSummary: { recognizedFields: 2 } };
}

async function repositoryFixture() {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Technology" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const calculationId = added.calculation.calculation_id;
  const importProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_IMPORT", { projectId: project.project_id, revision: 2, status: "completed" });
  const analysisProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_ANALYSIS", { projectId: project.project_id, revision: 1, status: "completed", sourceImportRevision: 2 });
  const extractionState = { id: global.YarnAIProjectSystem.uuidv7(), projectId: project.project_id, kind: "PATTERN_CONTENT_EXTRACTION", version: 1, revision: 4, status: "completed", sourceImportId: importProgress.progress_id, sourceImportRevision: 2, sourceAnalysisId: analysisProgress.progress_id, sourceAnalysisRevision: 1, result: { files: [], combinedText: "" } };
  const extractionProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_CONTENT_EXTRACTION", extractionState);
  const semanticState = { id: global.YarnAIProjectSystem.uuidv7(), projectId: project.project_id, kind: "PATTERN_SEMANTIC_ANALYSIS", version: 1, revision: 3, status: "completed", sourceExtractionId: extractionProgress.progress_id, sourceExtractionRevision: 4, sourceImportRevision: 2, sourceFingerprint: "fnv1a32:87654321", result: semanticResult(), warnings: [], errors: [], createdAt: stamp(1), updatedAt: stamp(3), startedAt: stamp(2), completedAt: stamp(3), failedAt: null };
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_SEMANTIC_ANALYSIS", semanticState);
  const snapshot = fullSnapshot(project.project_id, { sourceSemanticAnalysisId: semanticState.id });
  snapshot.sourceSemanticFingerprint = reviewApi.semanticFingerprint(semanticState);
  const reviewState = confirmedReview(project.project_id, snapshot, { id: global.YarnAIProjectSystem.uuidv7() });
  reviewState.reviewedData = { schemaVersion: 1, projectId: project.project_id, items: snapshot.values.map((entry) => ({ itemId: entry.itemId, projectId: project.project_id, decision: entry.decision })), conflictGroups: [] };
  reviewState.originalSnapshot = null; reviewState.originalSnapshotFingerprint = null; reviewState.validation = snapshot.validation; reviewState.auditSnapshots = [];
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_ANALYSIS_REVIEW", reviewState);
  return { repository, project, calculationId, review: reviewState };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("1. idempotent creation stores one technology draft", async () => { const context = await repositoryFixture(); const first = await draftApi.ensureForProject(context.repository, context.project.project_id); const second = await draftApi.ensureForProject(context.repository, context.project.project_id); assert.deepEqual(second.draft, first.draft); assert.equal((await context.repository.getProject(context.project.project_id)).progress.filter((entry) => entry.kind === draftApi.PROGRESS_KIND).length, 1); });
test("2. creation is forbidden without a confirmed review", () => { const review = confirmedReview("p", fullSnapshot("p"), { status: "reviewing", confirmedSnapshot: null }); assert.throws(() => draftApi.createInitialState("p", review), { code: "SOURCE_REVIEW_NOT_CONFIRMED" }); });
test("3. deterministic build ignores timestamps and state identity", () => { const snapshot = fullSnapshot(); const left = draftApi.buildDraftFromConfirmedSnapshot(snapshot); const right = draftApi.buildDraftFromConfirmedSnapshot(structuredClone(snapshot)); assert.equal(draftApi.canonicalize(left), draftApi.canonicalize(right)); assert.equal(draftApi.fingerprint(left), draftApi.fingerprint(right)); });
test("4. source offsets define stable entity order", () => { const snapshot = fullSnapshot(); snapshot.values.reverse(); const result = draftApi.buildDraftFromConfirmedSnapshot(snapshot); assert.deepEqual(result.operations.map((entry) => entry.type), ["cast_on", "knit", "increase", "repeat", "finish"]); });
test("5. materials, tools, gauge and sizes are classified", () => { const result = built().state.draftResult; assert.ok(result.materials.length >= 3); assert.equal(result.tools[0].type, "needleSizes"); assert.equal(result.gauge[0].normalized.per, 10); assert.equal(result.sizes[0].value, "S"); });
test("6. components and sections retain separate identities", () => { const result = built().state.draftResult; assert.equal(result.components.length, 1); assert.equal(result.sections.length, 1); assert.notEqual(result.components[0].id, result.sections[0].id); assert.equal(result.sections[0].componentId, result.components[0].id); });
test("7. row and finishing instructions become typed operations", () => { const result = built().state.draftResult; assert.ok(result.operations.some((entry) => entry.type === "knit" && entry.rowStart === 1)); assert.ok(result.finishing.some((entry) => entry.type === "finish")); });
test("8. repeats remain compact", () => { const result = built().state.draftResult; assert.equal(result.repeats.length, 1); assert.equal(result.repeats[0].repeat.count, 2); assert.equal(result.operations.filter((entry) => entry.type === "repeat").length, 1); });
test("9. stitch count is calculated with provenance", () => { const change = built().state.draftResult.stitchCountChanges.find((entry) => entry.calculatedStitchCountAfter === 84); assert.equal(change.formula, "80+(4)×1=84"); assert.equal(change.provenance.type, "calculated"); assert.ok(change.provenance.inputItemIds.includes("row-2")); });
test("10. insufficient inputs do not produce a stitch total", () => { const snapshot = fullSnapshot(); snapshot.values = snapshot.values.filter((entry) => entry.itemId !== "cast"); snapshot.values.find((entry) => entry.itemId === "row-2").value.stitchCountBefore = null; const result = draftApi.buildDraftFromConfirmedSnapshot(snapshot); const operation = result.operations.find((entry) => entry.type === "increase"); assert.equal(operation.stitchCountAfter, 84); assert.equal(result.stitchCountChanges.some((entry) => entry.operationId === operation.id), false); assert.ok(result.missingInformation.some((entry) => entry.code === "MISSING_CRITICAL_VALUE")); });
test("11. confirmed and calculated stitch totals conflict without choosing one", () => { const snapshot = fullSnapshot(); snapshot.values.find((entry) => entry.itemId === "row-2").value.stitchCountAfter = 85; const result = draftApi.buildDraftFromConfirmedSnapshot(snapshot); const conflict = result.conflicts.find((entry) => entry.code === "STITCH_COUNT_CONFLICT"); assert.equal(conflict.confirmedValue, 85); assert.equal(conflict.calculatedValue, 84); });
test("12. missing information has critical and non-critical levels", () => { const snapshot = fullSnapshot(); snapshot.values = snapshot.values.filter((entry) => !["yarn-name", "yarn-fiber", "yarn-amount", "finish"].includes(entry.itemId)); const result = draftApi.buildDraftFromConfirmedSnapshot(snapshot); assert.ok(result.missingInformation.some((entry) => entry.code === "MISSING_YARN" && entry.level === "critical")); assert.ok(result.missingInformation.some((entry) => entry.code === "MISSING_FINISHING" && entry.level === "non_critical")); });
test("13. ready is impossible with critical issues", () => { const snapshot = fullSnapshot(); snapshot.values = snapshot.values.filter((entry) => entry.category !== "gauge"); const { review, state } = built("project", snapshot); assert.equal(state.status, "needs_attention"); const forged = structuredClone(state); forged.status = "ready"; const validation = draftApi.validateDraftState(forged, review, stamp(12)); assert.ok(validation.errors.some((entry) => entry.code === "READY_WITH_CRITICAL_ISSUES")); const unknown = fullSnapshot(); unknown.values = unknown.values.map((entry) => entry.category === "craft" ? { ...entry, value: { type: "unknown" } } : entry); assert.equal(built("project", unknown).state.status, "needs_attention"); });
test("14. corrected Stage 19 value keeps original and correction provenance", () => { const snapshot = fullSnapshot(); const yarn = snapshot.values.find((entry) => entry.itemId === "yarn-name"); yarn.decision = "corrected"; yarn.value = "Corrected Merino"; yarn.provenance.originalValue = "Merino"; yarn.notes = "Подтверждено пользователем"; const provenance = draftApi.buildDraftFromConfirmedSnapshot(snapshot).provenance.find((entry) => entry.sourceReviewedItemId === "yarn-name"); assert.equal(provenance.originalValue, "Merino"); assert.equal(provenance.confirmedValue, "Corrected Merino"); assert.equal(provenance.correctionProvenance.corrected, true); });
test("15. source fingerprint participates in validation", () => { const { review, state } = built(); const changed = structuredClone(review); changed.confirmedSnapshot.values[0].value = "crochet"; const validation = draftApi.validateDraftState(state, changed, stamp(12)); assert.ok(validation.errors.some((entry) => entry.code === "SOURCE_FINGERPRINT_MISMATCH")); });
test("16. stale confirmed review is detected without silent rebuild", () => { const { review, state } = built(); const changed = structuredClone(review); changed.revision += 1; assert.equal(draftApi.sourceIdentityMatches(state, changed), false); const invalid = draftApi.invalidateSourceState(state, "SOURCE_REVIEW_STALE", stamp(11)); assert.equal(invalid.status, "needs_attention"); assert.equal(invalid.draftFingerprint, state.draftFingerprint); });
test("17. explicit rebuild replaces source and audits previous result", () => { const { review, state } = built(); const changed = structuredClone(review); changed.revision += 1; changed.confirmedSnapshot.values.find((entry) => entry.itemId === "product").value = "cardigan"; const rebuilt = draftApi.rebuildState(state, changed, stamp(12)); assert.equal(rebuilt.draftResult.product.value, "cardigan"); assert.ok(rebuilt.audit.some((entry) => entry.type === "rebuild" && entry.previousResult)); });
test("18. unchanged rebuild is a no-op", () => { const { review, state } = built(); assert.deepEqual(draftApi.rebuildState(state, review, stamp(20)), state); });
test("19. interrupted building restores a saved result", () => { const { state } = built(); const started = draftApi.beginBuild(state, "rebuild", stamp(11)); const recovered = draftApi.recoverInterruptedState(started, stamp(12)); assert.equal(recovered.status, "ready"); assert.equal(recovered.draftFingerprint, state.draftFingerprint); assert.equal(recovered.lastError.code, "BUILD_INTERRUPTED"); });
test("20. reload reads the same stored result", async () => { const context = await repositoryFixture(); const builtState = await draftApi.buildForProject(context.repository, context.project.project_id); const fingerprint = builtState.draft.draftFingerprint; await context.repository.close(); repositories.splice(repositories.indexOf(context.repository), 1); const reopened = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(reopened); await reopened.initialize(); const loaded = await draftApi.ensureForProject(reopened, context.project.project_id); assert.equal(loaded.draft.draftFingerprint, fingerprint); });
test("21. retry completes an interrupted waiting build", async () => { const context = await repositoryFixture(); let inspected = await draftApi.ensureForProject(context.repository, context.project.project_id); const started = draftApi.beginBuild(inspected.draft, "build", stamp(11)); await context.repository.updatePatternTechnologyDraft(context.project.project_id, context.calculationId, started); inspected = await draftApi.ensureForProject(context.repository, context.project.project_id); assert.equal(inspected.draft.status, "waiting"); inspected = await draftApi.retryForProject(context.repository, context.project.project_id); assert.equal(inspected.draft.status, "ready"); });
test("22. export and import retain the draft but clear unprovable readiness", async () => { const context = await repositoryFixture(); await draftApi.buildForProject(context.repository, context.project.project_id); const exported = await context.repository.exportProject(context.project.project_id); assert.match(exported.json, /PATTERN_TECHNOLOGY_DRAFT/); const imported = await context.repository.importProject(exported.json); const aggregate = await context.repository.getProject(imported.project_id); const state = aggregate.progress.find((entry) => entry.kind === draftApi.PROGRESS_KIND).state; assert.equal(state.status, "needs_attention"); assert.equal(state.lastError.code, "IMPORT_SOURCE_IDENTITY_UNPROVEN"); });
test("23. collision import remaps project, progress and source identities", async () => { const context = await repositoryFixture(); const original = await draftApi.buildForProject(context.repository, context.project.project_id); const exported = await context.repository.exportProject(context.project.project_id); const imported = await context.repository.importProject(exported.json); assert.equal(imported.collision, true); const aggregate = await context.repository.getProject(imported.project_id); const state = aggregate.progress.find((entry) => entry.kind === draftApi.PROGRESS_KIND).state; const review = aggregate.progress.find((entry) => entry.kind === "PATTERN_ANALYSIS_REVIEW").state; assert.notEqual(state.id, original.draft.id); assert.equal(state.projectId, imported.project_id); assert.equal(state.sourceProjectId, imported.project_id); assert.equal(state.sourceReviewId, review.id); assert.equal(state.immutableSourceSnapshot.projectId, imported.project_id); assert.ok(state.draftResult.provenance.every((entry) => entry.sourceProjectId === imported.project_id)); });
test("24. import cannot preserve a false ready state", async () => { const context = await repositoryFixture(); await draftApi.buildForProject(context.repository, context.project.project_id); const exported = await context.repository.exportProject(context.project.project_id); const imported = await context.repository.importProject(exported.envelope); const state = (await context.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === draftApi.PROGRESS_KIND).state; assert.notEqual(state.status, "ready"); assert.equal(state.validation.canBecomeReady, false); });
test("25. corrupted import is rejected safely", async () => { const context = await repositoryFixture(); await draftApi.buildForProject(context.repository, context.project.project_id); const exported = await context.repository.exportProject(context.project.project_id); const envelope = structuredClone(exported.envelope); const state = envelope.payload.progress.find((entry) => entry.kind === draftApi.PROGRESS_KIND).state; state.immutableSourceSnapshot.values[0].value = "tampered"; envelope.export_id = global.YarnAIProjectSystem.uuidv7(); envelope.payload_checksum = await global.YarnAIProjectSystem.checksumPayload(envelope.payload); await assert.rejects(context.repository.importProject(envelope), { code: "IMMUTABLE_SOURCE_CHANGED" }); });
test("26. immutable source mutation is detected", () => { const { review, state } = built(); const changed = structuredClone(state); changed.immutableSourceSnapshot.values[0].value = "tampered"; const validation = draftApi.validateDraftState(changed, review, stamp(12)); assert.ok(validation.errors.some((entry) => entry.code === "IMMUTABLE_SOURCE_CHANGED")); });
test("27. rejected values cannot enter the confirmed source", () => { const snapshot = fullSnapshot(); snapshot.values[0].decision = "rejected"; assert.throws(() => draftApi.buildDraftFromConfirmedSnapshot(snapshot), { code: "INVALID_SOURCE_IDENTITY" }); });
test("28. reviewedData cannot substitute for confirmedSnapshot", () => { const review = confirmedReview("p", fullSnapshot("p"), { confirmedSnapshot: null }); review.reviewedData = { values: fullSnapshot("p").values }; assert.throws(() => draftApi.createInitialState("p", review), { code: "SOURCE_REVIEW_NOT_CONFIRMED" }); });
test("29. Stage 20 navigation advances only to technology review", () => { const html = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-technology-draft.html"), "utf8"); const controller = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-technology-draft-assistant.js"), "utf8"); const laterStage = 20 + 2; assert.match(html, /pattern-technology-draft-review/); assert.match(controller, /pattern-technology-review\?project=/); for (const source of [html, controller]) { assert.equal(source.toLowerCase().includes(`stage ${laterStage}`), false); assert.equal(source.toLowerCase().includes(`stage-${laterStage}`), false); } });
test("30. Stage 20 is local and contains no network, LLM or OCR implementation", () => { const source = ["pattern-technology-draft.js", "pattern-technology-draft-assistant.js"].map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n").toLowerCase(); for (const forbidden of ["fetch(", "xmlhttprequest", "websocket", "api.openai.com", "llm", "tesseract", "ocr", "pdfjs", "filereader"]) assert.equal(source.includes(forbidden), false, forbidden); });
