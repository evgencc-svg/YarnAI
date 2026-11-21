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

const FLAX_SIZES = ["0-6 mo", "6-12 mo", "1-2 yrs", "2-4 yrs", "4-6 yrs", "6-8 yrs", "8-10 yrs", "XS", "S", "SM", "M", "ML", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];

function domainEvidence(domain, text, start = 0) {
  return { sourceFileId: domain === "SOURCE_PATTERN_EVIDENCE" ? "flax-pdf" : "project-description", sourceFileName: domain === "SOURCE_PATTERN_EVIDENCE" ? "flax.pdf" : "Описание проекта.txt", evidenceDomain: domain, start, end: start + text.length, text, ruleId: "test.confirmed" };
}

function ledgerValue(itemId, category, semanticType, canonicalValue, rawValue, unit, start) {
  return { itemId, category, subtype: semanticType, value: { semanticType, canonicalValue: structuredClone(canonicalValue), rawValue, unit, status: "confirmed", recognitionReason: "confirmed_test_fact", equivalentMentions: [] }, unit, decision: "accepted", notes: "", provenance: { originalValue: structuredClone(canonicalValue), confidence: .99, evidenceDomain: "SOURCE_PATTERN_EVIDENCE", evidence: [domainEvidence("SOURCE_PATTERN_EVIDENCE", rawValue || semanticType, start)], sourceOffsets: [{ sourceFileId: "flax-pdf", start, end: start + 2 }] } };
}

function flaxLegacyReview(projectId = "project-flax") {
  const sourceValues = [
    ledgerValue("craft", "craft", "document.craft", "knitting", "knitting", null, 1),
    ledgerValue("product", "product", "garment.type", "sweater", "sweater", null, 5),
    ledgerValue("sizes", "sizes", "source.sizes.available", FLAX_SIZES, FLAX_SIZES.join(", "), "size", 10),
    ledgerValue("measurement", "sizes", "source.sizing.finished_chest", { sizeLabel: "ML", in: 40, cm: 101.6 }, "ML 40 in", "in", 20),
    ledgerValue("source-gauge", "gauge", "source.gauge", { stitches: 18, rows: null, rounds: 24, per: 4, unit: "in", condition: "unspecified" }, "18 sts & 24 rounds / 4 in", "in", 30),
    ledgerValue("source-needles", "tools", "source.tools.needles", [4, 5], "4 mm, 5 mm", "mm", 40),
    ledgerValue("source-weight", "yarn", "source.yarn.weight", ["worsted/aran"], "worsted/aran", null, 50),
    ledgerValue("source-samples", "yarn", "source.yarn.samples", ["De Rerum Natura Gilliatt", "SweetGeorgia Superwash Worsted"], "De Rerum Natura Gilliatt, SweetGeorgia Superwash Worsted", null, 60),
    ledgerValue("construction", "construction", "source.construction", { method: "seamless", direction: "top_down", workedInRound: true, seamless: true, features: ["raglan"], sequence: ["neckline", "yoke", "sleeve_body_separation", "body", "sleeves", "finishing"] }, "neckline -> yoke -> sleeve/body separation -> body -> sleeves -> finishing", null, 70),
  ];
  const snapshot = fullSnapshot(projectId, { values: sourceValues, sourceSemanticAnalysisId: "semantic-flax", sourceSemanticAnalysisRevision: 9, sourceSemanticFingerprint: "fnv1a32:12345678", sourceContentExtractionRevision: 7, sourceImportRevision: 4 });
  const profileEvidence = (text, start) => domainEvidence("USER_ADAPTATION_PROFILE", text, start);
  const userAdaptationProfile = {
    rawSources: [{ sourceFileId: "project-description", sourceFileName: "Описание проекта.txt", evidenceDomain: "USER_ADAPTATION_PROFILE", rawText: "not consumed by Stage 20" }],
    selectedSize: { value: "ML", status: "confirmed", recognitionReason: "user_profile_explicit_size", evidence: profileEvidence("Размер ML", 1) },
    measurements: [],
    gauge: { entries: [{ pairId: "profile-gauge", stitches: 20, rows: 26, rounds: null, per: 10, unit: "cm", rawValue: "20 п. + 26 рядов на 10 cm", status: "confirmed", recognitionReason: "user_profile_structured_gauge", evidence: [profileEvidence("20 п. + 26 рядов на 10 cm", 10)] }], confidence: .99 },
    tools: { needleSizes: [{ canonicalValue: 3.5, rawValue: "3.5 mm", unit: "mm", status: "confirmed", recognitionReason: "user_profile_metric_needles", evidence: [profileEvidence("3.5 mm", 20)] }, { canonicalValue: 4.5, rawValue: "4.5 mm", unit: "mm", status: "confirmed", recognitionReason: "user_profile_metric_needles", evidence: [profileEvidence("4.5 mm", 28)] }], confidence: .99 },
    yarn: { names: [], fiberContent: [{ value: "100% шерсть", evidence: profileEvidence("100% шерсть", 40) }], weights: ["worsted/aran"], amounts: [{ value: 200, unit: "m", rawText: "200 м", evidence: profileEvidence("200 м", 55) }, { value: 100, unit: "g", rawText: "100 г", evidence: profileEvidence("100 г", 62) }], colors: [], evidence: [profileEvidence("100% шерсть, worsted/aran, 200 м/100 г", 40)], confidence: .99 },
  };
  const review = confirmedReview(projectId, snapshot, { id: "review-flax", revision: 11 });
  review.originalSnapshot = { schemaVersion: 1, projectId, semanticAnalysisId: "semantic-flax", semanticAnalysisRevision: 9, semanticFingerprint: snapshot.sourceSemanticFingerprint, sourceContentExtractionRevision: 7, sourceImportRevision: 4, result: { userAdaptationProfile, evidenceDomains: { userAdaptationProfileFileIds: ["project-description"] } } };
  review.originalSnapshotFingerprint = reviewApi.fingerprint(review.originalSnapshot);
  review.reviewedData = { schemaVersion: 1, projectId, items: sourceValues.map((entry) => ({ itemId: entry.itemId, projectId, decision: "accepted" })), conflictGroups: [] };
  review.validation = snapshot.validation; review.auditSnapshots = []; review.decisions = []; review.unresolvedItems = []; review.warnings = []; review.operation = null; review.editBaseRevision = null;
  review.createdAt = stamp(1); review.updatedAt = stamp(8); review.startedAt = stamp(2); review.confirmedAt = snapshot.confirmedAt; review.failedAt = null; review.interruptedAt = null; review.lastError = null;
  return review;
}

function flaxHandoffChecks(input) {
  const source = input.sourcePatternEvidence; const profile = input.userAdaptationProfile; const facts = source.facts;
  return [
    facts.availableSizes.length === 19,
    facts.selectedSize === "ML",
    facts.finishedMeasurement.in === 40 && facts.finishedMeasurement.cm === 101.6,
    facts.gauge[0].stitches === 18 && facts.gauge[0].rounds === 24 && facts.gauge[0].per === 4 && facts.gauge[0].unit === "in",
    JSON.stringify(facts.needles) === JSON.stringify([4, 5]),
    JSON.stringify(facts.yarnWeight) === JSON.stringify(["worsted/aran"]),
    facts.yarnSamples.includes("De Rerum Natura Gilliatt"),
    facts.yarnSamples.includes("SweetGeorgia Superwash Worsted"),
    JSON.stringify(facts.construction.sequence) === JSON.stringify(["neckline", "yoke", "sleeve_body_separation", "body", "sleeves", "finishing"]),
    facts.product === "sweater",
    facts.craft === "knitting",
    source.provenance.reviewRevision === 11 && source.provenance.authority === "CONFIRMED_STAGE_19",
    profile.selectedSize.value === "ML",
    profile.gauge[0].stitches === 20 && profile.gauge[0].rows === 26 && profile.gauge[0].per === 10 && profile.gauge[0].unit === "cm",
    JSON.stringify(profile.needles.map((entry) => entry.canonicalValue)) === JSON.stringify([3.5, 4.5]),
    profile.yarn.fibre[0].value === "100% шерсть" && profile.yarn.weight[0] === "worsted/aran" && profile.yarn.lengthOrWeight[0].value === 200 && profile.yarn.lengthOrWeight[1].value === 100,
  ];
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
test("31. legacy confirmed Flax review projects all 16 handoff groups", () => { const checks = flaxHandoffChecks(draftApi.stage20InputFromConfirmedReview(flaxLegacyReview())); assert.equal(checks.length, 16); assert.equal(checks.filter(Boolean).length, 16); });
test("32. source evidence and adaptation profile remain distinct fingerprinted spaces", () => { const input = draftApi.stage20InputFromConfirmedReview(flaxLegacyReview()); assert.equal(input.contractVersion, 2); assert.equal(input.sourcePatternEvidence.evidenceDomain, "SOURCE_PATTERN_EVIDENCE"); assert.equal(input.userAdaptationProfile.evidenceDomain, "USER_ADAPTATION_PROFILE"); assert.notEqual(input.sourcePatternEvidence.fingerprint, input.userAdaptationProfile.fingerprint); assert.equal(input.sourcePatternEvidence.values.some((entry) => entry.provenance.evidenceDomain === "USER_ADAPTATION_PROFILE"), false); });
test("33. source gauge is not replaced by adaptation gauge", () => { const input = draftApi.stage20InputFromConfirmedReview(flaxLegacyReview()); assert.deepEqual(input.sourcePatternEvidence.facts.gauge.map((entry) => [entry.stitches, entry.rounds, entry.per, entry.unit]), [[18, 24, 4, "in"]]); assert.deepEqual(input.userAdaptationProfile.gauge.map((entry) => [entry.stitches, entry.rows, entry.per, entry.unit]), [[20, 26, 10, "cm"]]); });
test("34. source needles are not replaced by adaptation needles", () => { const input = draftApi.stage20InputFromConfirmedReview(flaxLegacyReview()); assert.deepEqual(input.sourcePatternEvidence.facts.needles, [4, 5]); assert.deepEqual(input.userAdaptationProfile.needles.map((entry) => entry.canonicalValue), [3.5, 4.5]); });
test("35. source yarn samples do not mix with adaptation yarn", () => { const input = draftApi.stage20InputFromConfirmedReview(flaxLegacyReview()); assert.deepEqual(input.sourcePatternEvidence.facts.yarnSamples, ["De Rerum Natura Gilliatt", "SweetGeorgia Superwash Worsted"]); assert.equal(JSON.stringify(input.userAdaptationProfile.yarn).includes("SweetGeorgia"), false); assert.equal(JSON.stringify(input.sourcePatternEvidence).includes("100% шерсть"), false); });
test("36. missing mandatory confirmed adaptation field is rejected", () => { const input = structuredClone(draftApi.stage20InputFromConfirmedReview(flaxLegacyReview())); input.userAdaptationProfile.needles = []; assert.throws(() => draftApi.assertStage20Input(input), { code: "MISSING_CONFIRMED_ADAPTATION_PROFILE" }); });
test("37. Stage 20 consumes only structured confirmed projection", () => { const input = draftApi.stage20InputFromConfirmedReview(flaxLegacyReview()); assert.equal(Object.prototype.hasOwnProperty.call(input.userAdaptationProfile, "rawSources"), false); const production = fs.readFileSync(path.join(__dirname, "../src/yarnai/static/pattern-technology-draft.js"), "utf8").toLowerCase(); for (const forbidden of ["draft_input", "material_intake", "rawsources", "pdfjs", "filereader"]) assert.equal(production.includes(forbidden), false, forbidden); });
test("38. contract migration marks v1 revision 3 stale and rebuilds as revision 5 with a new result identity", () => { const review = flaxLegacyReview(); const old = { id: "draft-flax", projectId: review.projectId, kind: draftApi.PROGRESS_KIND, version: 1, algorithmVersion: 1, revision: 3, status: "needs_attention", sourceReviewId: review.id, sourceReviewRevision: review.revision, sourceConfirmedRevision: review.revision, sourceConfirmedFingerprint: draftApi.fingerprint(review.confirmedSnapshot), sourceSemanticAnalysisId: review.sourceSemanticAnalysisId, sourceSemanticAnalysisRevision: review.sourceSemanticAnalysisRevision, sourceImportRevision: review.sourceImportRevision, sourceProjectId: review.projectId, immutableSourceSnapshot: structuredClone(review.confirmedSnapshot), immutableSourceFingerprint: draftApi.fingerprint(review.confirmedSnapshot), draftResult: { schemaVersion: 1, legacy: true }, draftFingerprint: draftApi.fingerprint({ schemaVersion: 1, legacy: true }), criticalIssuesFingerprint: draftApi.fingerprint([]), validation: { isValid: true }, audit: [], operation: null, lastError: null, createdAt: stamp(1), updatedAt: stamp(3), builtAt: stamp(3), failedAt: null, interruptedAt: null }; assert.equal(draftApi.sourceIdentityMatches(old, review), false); const rebuilt = draftApi.rebuildState(old, review, stamp(12)); assert.equal(rebuilt.revision, 5); assert.equal(rebuilt.inputContractVersion, 2); assert.equal(rebuilt.sourceReviewRevision, 11); assert.equal(rebuilt.draftResult.schemaVersion, 2); assert.notEqual(rebuilt.draftResult.resultIdentity, old.draftResult.resultIdentity); assert.equal(flaxHandoffChecks(rebuilt.immutableSourceSnapshot).filter(Boolean).length, 16); });
test("39. rebuilt result serializes with upstream binding and no duplicate identity", () => { const review = flaxLegacyReview(); const first = draftApi.buildState(draftApi.createInitialState(review.projectId, review, stamp(9)), review, stamp(10)); const reopened = JSON.parse(JSON.stringify(first)); assert.equal(reopened.sourceReviewId, review.id); assert.equal(reopened.sourceReviewRevision, 11); assert.equal(reopened.sourceProjectionFingerprint, first.sourceProjectionFingerprint); assert.equal(reopened.draftResult.resultIdentity, first.draftResult.resultIdentity); assert.equal(draftApi.sourceIdentityMatches(reopened, review), true); });
test("40. v1 retry paths cannot replace the explicit contract rebase", () => { const review = flaxLegacyReview(); const current = draftApi.createInitialState(review.projectId, review, stamp(9)); const retried = draftApi.buildState(current, review, stamp(10)); assert.equal(retried.inputContractVersion, 2); assert.equal(retried.algorithmVersion, 2); assert.equal(retried.audit.some((entry) => entry.type === "retry"), false); });
