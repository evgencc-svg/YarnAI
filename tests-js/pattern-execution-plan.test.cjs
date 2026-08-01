"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const api = require("../src/yarnai/static/pattern-execution-plan.js");
const analysisReviewApi = require("../src/yarnai/static/pattern-analysis-review.js");
const draftApi = require("../src/yarnai/static/pattern-technology-draft.js");
const technologyReviewApi = require("../src/yarnai/static/pattern-technology-review.js");

const repositories = [];
const stamp = (seconds) => new Date(seconds * 1000).toISOString();
const fp = api.fingerprint;

function sourceEntity(id, value, extras = {}) {
  return { id, value, provenanceRefs: [`prov:${id}`], ...extras };
}

function finalDraft(projectId = "project", overrides = {}) {
  const draft = {
    schemaVersion: 1,
    algorithmVersion: 1,
    projectSummary: { id: "summary", projectId },
    craft: sourceEntity("craft", "knitting", { type: "knitting" }),
    product: sourceEntity("product", "sweater", { type: "sweater" }),
    construction: [sourceEntity("construction", "bottom_up", { property: "method" })],
    sizes: [sourceEntity("size", "M", { type: "selected", selected: true })],
    materials: [sourceEntity("material", { name: "Merino", value: 500, unit: "g" }, { type: "amount", unit: "g" })],
    yarn: [sourceEntity("yarn", "Merino", { type: "name" })],
    tools: [sourceEntity("needle", { value: 4, unit: "mm" }, { type: "needle", unit: "mm" })],
    gauge: [sourceEntity("gauge", { value: 20, per: 10, unit: "cm" }, { type: "stitches", normalized: { value: 20, per: 10, unit: "cm" }, unit: "cm" })],
    components: [sourceEntity("source-body", "Body", { name: "Body", order: 1 })],
    sections: [sourceEntity("section-body", "Body", { title: "Body", order: 1, componentId: "source-body" })],
    operations: [
      sourceEntity("op-cast", null, { type: "cast_on", componentId: "source-body", sectionId: "section-body", order: 1, instructionSource: "cast on", parameters: { confirmedCount: 80, countKind: "castOn" }, stitchCountAfter: 80 }),
      sourceEntity("op-knit", null, { type: "knit", componentId: "source-body", sectionId: "section-body", order: 2, instructionSource: "work body", parameters: {}, stitchCountAfter: 80 }),
      sourceEntity("op-shape", null, { type: "decrease", componentId: "source-body", sectionId: "section-body", order: 3, instructionSource: "shape", parameters: {}, countDelta: -4, stitchCountAfter: 76 }),
      sourceEntity("op-bind", null, { type: "bind_off", componentId: "source-body", sectionId: "section-body", order: 4, instructionSource: "bind off", parameters: { confirmedCount: 76 }, stitchCountAfter: 0 }),
      sourceEntity("op-finish", null, { type: "finish", componentId: "source-body", sectionId: "section-body", order: 5, instructionSource: "weave in ends", parameters: {} }),
    ],
    rowInstructions: [], repeats: [], stitchCountChanges: [], finishing: [], abbreviations: [], assumptions: [],
    missingInformation: [], conflicts: [], warnings: [],
    provenance: ["craft", "product", "construction", "size", "material", "yarn", "needle", "gauge", "source-body", "section-body", "op-cast", "op-knit", "op-shape", "op-bind", "op-finish"].map((id) => ({ id: `prov:${id}`, sourceProjectId: projectId, sourceReviewedItemId: id, sourceSemanticAnalysisId: "semantic-1", evidenceFingerprint: fp({ id }) })),
  };
  return { ...draft, ...overrides };
}

function confirmedReview(projectId = "project", draft = finalDraft(projectId), overrides = {}) {
  const revision = overrides.revision ?? 5;
  const snapshot = {
    schemaVersion: 1,
    reviewIdentity: { id: overrides.id || "technology-review-1", projectId, revision },
    sourceDraftIdentity: { projectId, progressId: "draft-progress", id: "technology-draft-1", kind: "PATTERN_TECHNOLOGY_DRAFT", version: 1, algorithmVersion: 1, revision: 7 },
    sourceReviewIdentity: { id: "analysis-review-1", revision: 6, projectId },
    sourceSemanticIdentity: { id: "semantic-1", revision: 4, projectId },
    sourceImportRevision: 2,
    sourceFingerprints: { draft: fp(draft), validation: fp({ valid: true }), criticalIssues: fp([]) },
    finalDraft: structuredClone(draft), confirmedValues: [], originalValues: [], corrections: [], rejectedFindings: [],
    unresolvedNonBlockingItems: [], assumptions: [], warnings: [], conflicts: [], provenance: structuredClone(draft.provenance),
    confirmationTimestamp: stamp(10), reviewRevision: revision, confirmedSnapshotFingerprint: null,
  };
  snapshot.confirmedSnapshotFingerprint = api.confirmedSnapshotFingerprint(snapshot);
  return {
    id: snapshot.reviewIdentity.id, projectId, kind: "PATTERN_TECHNOLOGY_REVIEW", version: 1, revision,
    status: overrides.status || "confirmed", confirmedSnapshot: overrides.snapshot === null ? null : snapshot,
    confirmedSnapshotFingerprint: snapshot.confirmedSnapshotFingerprint,
    sourceDraftId: snapshot.sourceDraftIdentity.id, sourceDraftRevision: snapshot.sourceDraftIdentity.revision,
    sourceDraftAlgorithmVersion: snapshot.sourceDraftIdentity.algorithmVersion,
    sourceDraftFingerprint: snapshot.sourceFingerprints.draft,
    sourceReviewId: snapshot.sourceReviewIdentity.id, sourceReviewRevision: snapshot.sourceReviewIdentity.revision,
    sourceSemanticAnalysisId: snapshot.sourceSemanticIdentity.id, sourceSemanticAnalysisRevision: snapshot.sourceSemanticIdentity.revision,
    sourceImportRevision: snapshot.sourceImportRevision,
  };
}

function contextFor(review, overrides = {}) {
  return {
    requireCurrentIdentity: true,
    technologyDraft: { id: review.sourceDraftId, projectId: review.projectId, sourceProjectId: review.projectId, revision: review.sourceDraftRevision, draftFingerprint: review.sourceDraftFingerprint, algorithmVersion: review.sourceDraftAlgorithmVersion, sourceImportRevision: review.sourceImportRevision },
    analysisReview: { id: review.sourceReviewId, projectId: review.projectId, revision: review.sourceReviewRevision, sourceImportRevision: review.sourceImportRevision },
    semanticAnalysis: { id: review.sourceSemanticAnalysisId, projectId: review.projectId, revision: review.sourceSemanticAnalysisRevision, sourceImportRevision: review.sourceImportRevision },
    ...overrides,
  };
}

function built(review = confirmedReview(), context = contextFor(review)) {
  return api.buildState(api.createInitialState(review.projectId, review, stamp(11)), review, context, stamp(12));
}

function reviewedValue(itemId, category, subtype, value, start) {
  return { itemId, category, subtype, value: structuredClone(value), unit: value?.unit ?? null, decision: "accepted", notes: "", provenance: { originalValue: structuredClone(value), confidence: .9, evidence: [{ sourceFileId: "file-1", sourceFileName: "pattern.txt", start, end: start + 2, text: subtype, ruleId: "test.rule" }], sourceOffsets: [{ sourceFileId: "file-1", start, end: start + 2 }] } };
}

function stage19Snapshot(projectId, semanticId) {
  const values = [
    reviewedValue("craft", "craft", "craft", "knitting", 1),
    reviewedValue("product", "product", "garment", "sweater", 5),
    reviewedValue("construction", "construction", "method", "top_down", 10),
    reviewedValue("size", "sizes", "label", "M", 15),
    reviewedValue("gauge", "gauge", "stitches", { value: 20, per: 10, unit: "cm" }, 20),
    reviewedValue("yarn", "yarn", "names", "Merino", 25),
    reviewedValue("needle", "tools", "needleSizes", { value: 4, unit: "mm" }, 30),
    reviewedValue("body", "sections", "section", { id: "body", title: "Body", type: "instructions" }, 40),
    reviewedValue("cast", "counts", "castOn", { value: 80, unit: "stitches" }, 50),
    reviewedValue("row", "rows", "row", { rowNumber: 1, instructionText: "knit" }, 60),
    reviewedValue("finish", "rows", "row", { rowNumber: 2, instructionText: "finish", type: "finish" }, 70),
  ];
  return { schemaVersion: 1, projectId, sourceSemanticAnalysisId: semanticId, sourceSemanticAnalysisRevision: 3, sourceSemanticFingerprint: null, sourceContentExtractionRevision: 4, sourceImportRevision: 2, values, conflictResolutions: [], warnings: [], validation: { isValid: true, canConfirm: true, errors: [], warnings: [], unresolvedCriticalCount: 0 }, confirmedAt: stamp(8) };
}

function semanticResult() { return { schemaVersion: 1, sourceSummary: { textLength: 100 }, craft: { value: "knitting" }, garment: { type: "sweater" }, construction: {}, sizing: {}, gauge: {}, yarn: {}, tools: {}, abbreviations: [], sections: [], rowInstructions: [], repeatInstructions: [], counts: { castOn: [], bindOff: [], stitches: [], rows: [], repeats: [] }, evidence: [], analysisSummary: { recognizedFields: 2 } }; }

async function fullRepositoryPlan() {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Exportable execution plan" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const calculationId = added.calculation.calculation_id;
  const importProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_IMPORT", { projectId: project.project_id, revision: 2, status: "completed" });
  const analysisProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_ANALYSIS", { projectId: project.project_id, revision: 1, status: "completed", sourceImportRevision: 2 });
  const extractionState = { id: global.YarnAIProjectSystem.uuidv7(), projectId: project.project_id, kind: "PATTERN_CONTENT_EXTRACTION", version: 1, revision: 4, status: "completed", sourceImportId: importProgress.progress_id, sourceImportRevision: 2, sourceAnalysisId: analysisProgress.progress_id, sourceAnalysisRevision: 1, result: { files: [], combinedText: "" } };
  const extractionProgress = await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_CONTENT_EXTRACTION", extractionState);
  const semanticState = { id: global.YarnAIProjectSystem.uuidv7(), projectId: project.project_id, kind: "PATTERN_SEMANTIC_ANALYSIS", version: 1, revision: 3, status: "completed", sourceExtractionId: extractionProgress.progress_id, sourceExtractionRevision: 4, sourceImportRevision: 2, sourceFingerprint: "fnv1a32:87654321", result: semanticResult(), warnings: [], errors: [], createdAt: stamp(1), updatedAt: stamp(3), startedAt: stamp(2), completedAt: stamp(3), failedAt: null };
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_SEMANTIC_ANALYSIS", semanticState);
  const snapshot = stage19Snapshot(project.project_id, semanticState.id);
  snapshot.sourceSemanticFingerprint = analysisReviewApi.semanticFingerprint(semanticState);
  const state19 = { id: global.YarnAIProjectSystem.uuidv7(), projectId: project.project_id, kind: "PATTERN_ANALYSIS_REVIEW", version: 1, revision: 7, status: "confirmed", sourceSemanticAnalysisId: semanticState.id, sourceSemanticAnalysisRevision: 3, sourceSemanticFingerprint: snapshot.sourceSemanticFingerprint, sourceContentExtractionRevision: 4, sourceImportRevision: 2, confirmedSnapshot: snapshot, reviewedData: { schemaVersion: 1, projectId: project.project_id, items: snapshot.values.map((entry) => ({ itemId: entry.itemId, projectId: project.project_id, decision: entry.decision })), conflictGroups: [] }, originalSnapshot: null, originalSnapshotFingerprint: null, validation: snapshot.validation, auditSnapshots: [] };
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_ANALYSIS_REVIEW", state19);
  await draftApi.buildForProject(repository, project.project_id);
  let inspected = await technologyReviewApi.ensureForProject(repository, project.project_id);
  inspected = await technologyReviewApi.startForProject(repository, project.project_id);
  for (const decision of inspected.review.decisions.filter((entry) => entry.decision === "pending")) {
    const target = inspected.review.reviewState.targets.find((entry) => entry.id === decision.targetId);
    inspected = await technologyReviewApi.decideForProject(repository, project.project_id, decision.targetId, "accepted", target?.category === "conflict" ? { selectedValue: target.conflictValues[0] } : {});
  }
  await technologyReviewApi.confirmForProject(repository, project.project_id);
  const execution = await api.buildForProject(repository, project.project_id);
  return { repository, project, calculationId, execution };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("1. creates a stable waiting record", () => { const state = api.createInitialState("project", null, stamp(1)); assert.equal(state.status, "waiting"); assert.equal(state.kind, api.PROGRESS_KIND); assert.equal(state.schemaVersion, 1); });
test("2. reports missing Stage 21", () => assert.equal(api.validateSourceReview(null, "project").diagnostics[0].code, "SOURCE_REVIEW_MISSING"));
test("3. rejects an unconfirmed Stage 21", () => { const review = confirmedReview(); review.status = "reviewing"; assert.ok(api.validateSourceReview(review, "project").diagnostics.some((entry) => entry.code === "SOURCE_REVIEW_NOT_CONFIRMED")); });
test("4. rejects a stale Stage 21", () => { const review = confirmedReview(); review.status = "stale"; assert.ok(api.validateSourceReview(review, "project").diagnostics.some((entry) => entry.code === "SOURCE_REVIEW_STALE")); });
test("5. detects changed confirmedSnapshot", () => { const review = confirmedReview(); review.confirmedSnapshot.finalDraft.product.type = "cardigan"; assert.ok(api.validateSourceReview(review, "project").diagnostics.some((entry) => entry.code === "SOURCE_SNAPSHOT_FINGERPRINT_INVALID")); });
test("6. detects ownership mismatch", () => assert.ok(api.validateSourceReview(confirmedReview("other"), "project").diagnostics.some((entry) => entry.code === "SOURCE_IDENTITY_MISMATCH")));
test("7. detects import revision mismatch", () => { const review = confirmedReview(); const context = contextFor(review); context.semanticAnalysis.sourceImportRevision = 9; assert.ok(api.validateSourceReview(review, "project", context).diagnostics.some((entry) => entry.code === "SOURCE_IMPORT_REVISION_MISMATCH")); });
test("8. builds a simple sequential plan", () => { const state = built(); assert.equal(state.status, "ready"); assert.deepEqual(state.plan.phases.map((entry) => entry.type), ["cast_on", "main_fabric", "shaping", "closure", "edge_finishing"]); });
test("9. keeps multiple confirmed components", () => { const draft = finalDraft(); draft.components.push(sourceEntity("source-sleeve", "Sleeve", { name: "Sleeve", order: 2 })); const review = confirmedReview("project", draft); assert.equal(built(review, contextFor(review)).plan.components.length, 2); });
test("10. expands identical components and marks parallel phases", () => { const draft = finalDraft(); draft.components[0].quantity = 2; const review = confirmedReview("project", draft); const state = built(review, contextFor(review)); assert.equal(state.plan.components.length, 2); assert.ok(state.plan.phases.some((entry) => entry.canRunInParallelWith.length)); });
test("11. joining depends on completed components", () => { const draft = finalDraft(); draft.components.push(sourceEntity("source-sleeve", "Sleeve", { name: "Sleeve", order: 2 })); draft.operations.push(sourceEntity("op-join", null, { type: "seam", componentId: null, sectionId: "section-body", order: 6, instructionSource: "seam", parameters: {} })); const review = confirmedReview("project", draft); const state = built(review, contextFor(review)); const join = state.plan.phases.find((entry) => entry.type === "joining"); assert.ok(join.dependsOnPhaseIds.length > 0); });
test("12. finishing follows main work", () => { const state = built(); const finish = state.plan.phases.find((entry) => entry.type === "edge_finishing"); assert.ok(finish.order > state.plan.phases.find((entry) => entry.type === "main_fabric").order); });
test("13-16. nested IDs are stable", () => { const one = built(); const two = built(); for (const key of ["components", "phases", "checkpoints"]) assert.deepEqual(one.plan[key].map((entry) => entry.id), two.plan[key].map((entry) => entry.id)); assert.deepEqual(one.plan.phases.flatMap((entry) => entry.actions.map((action) => action.id)), two.plan.phases.flatMap((entry) => entry.actions.map((action) => action.id))); });
test("17. plan fingerprint is deterministic", () => assert.equal(built().planFingerprint, built().planFingerprint));
test("18. repeated build is a no-op", () => { const review = confirmedReview(); const context = contextFor(review); const one = built(review, context); const two = api.buildState(one, review, context, stamp(99)); assert.deepEqual(two, one); });
test("20. blocks when a required material is absent", () => { const draft = finalDraft(); draft.materials = []; draft.yarn = []; const review = confirmedReview("project", draft); const state = built(review, contextFor(review)); assert.equal(state.status, "blocked"); assert.ok(state.blockers.some((entry) => entry.code === "REQUIRED_MATERIAL_MISSING")); });
test("21. never invents missing stitch counts", () => { const draft = finalDraft(); draft.operations[0].parameters = {}; draft.operations[0].stitchCountAfter = null; const review = confirmedReview("project", draft); const state = built(review, contextFor(review)); assert.ok(state.blockers.some((entry) => entry.code === "REQUIRED_STITCH_COUNT_MISSING")); assert.ok(!JSON.stringify(state.plan).includes("80 петель")); });
test("22. exposes the first available action", () => { const first = built().plan.firstAction; assert.equal(first.ready, true); assert.ok(first.phaseId && first.actionId); });
test("23. blocks the first action with concrete blocker IDs", () => { const draft = finalDraft(); draft.tools = []; const review = confirmedReview("project", draft); const first = built(review, contextFor(review)).plan.firstAction; assert.equal(first.ready, false); assert.ok(first.blockedBy.length); });
test("24. non-critical source warning does not block", () => { const draft = finalDraft(); draft.warnings.push({ id: "warning-source", code: "CHECK_LATER", level: "non_critical", message: "Check later", provenanceRefs: ["prov:product"] }); const review = confirmedReview("project", draft); const state = built(review, contextFor(review)); assert.equal(state.status, "ready"); assert.ok(state.warnings.some((entry) => entry.code === "CHECK_LATER")); });
test("25. detects a dependency cycle", () => { const state = built(); const phases = structuredClone(state.plan.phases); phases[0].dependsOnPhaseIds = [phases.at(-1).id]; assert.ok(api.validateGraph(phases, { edges: [] }).some((entry) => entry.code === "DEPENDENCY_CYCLE")); });
test("26. detects invalid dependency reference", () => { const state = built(); const changed = structuredClone(state); changed.plan.phases[0].dependsOnPhaseIds = ["missing"]; assert.ok(api.validateSemantic(changed).some((entry) => entry.code === "DEPENDENCY_REFERENCE_INVALID")); });
test("27. structural validation returns diagnostics", () => { const state = built(); const changed = structuredClone(state); changed.plan.components.push(structuredClone(changed.plan.components[0])); assert.ok(api.validateStructural(changed).some((entry) => entry.code === "DUPLICATE_PLAN_ID")); });
test("28. semantic validation returns diagnostics", () => { const state = built(); const changed = structuredClone(state); changed.plan.firstAction.actionId = "missing"; assert.ok(api.validateSemantic(changed).some((entry) => entry.code === "FIRST_ACTION_INVALID")); });
test("29. source identity validation is structured", () => { const review = confirmedReview(); const state = built(review, contextFor(review)); const changed = structuredClone(review); changed.revision += 1; assert.ok(api.validateSourceIdentity(state, changed, contextFor(changed)).some((entry) => entry.code === "SOURCE_IDENTITY_MISMATCH")); });
test("30. interrupted planning recovers safely", () => { const review = confirmedReview(); const started = api.beginPlanning(api.createInitialState("project", review, stamp(1)), review, contextFor(review), stamp(2)); const recovered = api.recoverInterruptedState(started, stamp(3)); assert.equal(recovered.status, "waiting"); assert.equal(recovered.interruptedOperation.status, "interrupted"); });
test("31. retry preserves deterministic meaning", () => { const review = confirmedReview(); const state = api.buildState(api.recoverInterruptedState(api.beginPlanning(api.createInitialState("project", review, stamp(1)), review, contextFor(review), stamp(2))), review, contextFor(review), stamp(3), "retry"); assert.equal(state.planFingerprint, built(review, contextFor(review)).planFingerprint); });
test("32. Stage 21 revision change is stale", () => { const review = confirmedReview(); const state = built(review, contextFor(review)); const changed = confirmedReview("project", finalDraft(), { revision: 6 }); assert.ok(api.validateSourceIdentity(state, changed, contextFor(changed)).length); });
test("33. snapshot fingerprint change is stale", () => { const review = confirmedReview(); const state = built(review, contextFor(review)); const changed = confirmedReview("project", finalDraft("project", { product: sourceEntity("product", "cardigan", { type: "cardigan" }) })); assert.ok(api.validateSourceIdentity(state, changed, contextFor(changed)).length); });
test("34. planning algorithm version participates in input", () => { const review = confirmedReview(); assert.notEqual(api.planningInputFingerprint(review, 1), api.planningInputFingerprint(review, 2)); });
test("35. stale preserves old plan and disables first action", () => { const state = built(); const stale = api.markStale(state); assert.equal(stale.status, "stale"); assert.ok(stale.plan); assert.equal(stale.plan.firstAction.ready, false); });
test("36. audit is capped at 24 entries", () => { let state = built(); state = structuredClone(state); for (let index = 0; index < 30; index += 1) { state.audit.push({ auditId: `extra-${index}`, type: "X", at: stamp(index), revision: state.revision }); state.audit = state.audit.slice(-api.AUDIT_LIMIT); } assert.equal(state.audit.length, 24); });

test("19, 37. repository ensure is idempotent and reload-persistent", async () => {
  const repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Execution plan" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const review = confirmedReview(project.project_id);
  review.id = global.YarnAIProjectSystem.uuidv7();
  review.confirmedSnapshot.reviewIdentity.id = review.id;
  review.confirmedSnapshot.confirmedSnapshotFingerprint = api.confirmedSnapshotFingerprint(review.confirmedSnapshot);
  review.confirmedSnapshotFingerprint = review.confirmedSnapshot.confirmedSnapshotFingerprint;
  review.sourceDraftId = global.YarnAIProjectSystem.uuidv7(); review.confirmedSnapshot.sourceDraftIdentity.id = review.sourceDraftId;
  review.sourceReviewId = global.YarnAIProjectSystem.uuidv7(); review.confirmedSnapshot.sourceReviewIdentity.id = review.sourceReviewId;
  review.sourceSemanticAnalysisId = global.YarnAIProjectSystem.uuidv7(); review.confirmedSnapshot.sourceSemanticIdentity.id = review.sourceSemanticAnalysisId;
  review.confirmedSnapshot.confirmedSnapshotFingerprint = api.confirmedSnapshotFingerprint(review.confirmedSnapshot); review.confirmedSnapshotFingerprint = review.confirmedSnapshot.confirmedSnapshotFingerprint;
  const calculationId = added.calculation.calculation_id;
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_SEMANTIC_ANALYSIS", { id: review.sourceSemanticAnalysisId, projectId: project.project_id, revision: review.sourceSemanticAnalysisRevision, sourceImportRevision: 2, status: "completed" });
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_ANALYSIS_REVIEW", { id: review.sourceReviewId, projectId: project.project_id, revision: review.sourceReviewRevision, sourceImportRevision: 2, status: "confirmed" });
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_TECHNOLOGY_DRAFT", { id: review.sourceDraftId, projectId: project.project_id, sourceProjectId: project.project_id, revision: review.sourceDraftRevision, draftFingerprint: review.sourceDraftFingerprint, algorithmVersion: 1, sourceImportRevision: 2, status: "ready" });
  await repository.ensureCalculationProgress(project.project_id, calculationId, "PATTERN_TECHNOLOGY_REVIEW", review);
  const one = await api.ensureForProject(repository, project.project_id);
  const two = await api.ensureForProject(repository, project.project_id);
  assert.equal(one.executionPlan.id, two.executionPlan.id);
  assert.equal((await repository.getProject(project.project_id)).progress.filter((entry) => entry.kind === api.PROGRESS_KIND).length, 1);
  const result = await api.buildForProject(repository, project.project_id);
  assert.ok(["ready", "blocked"].includes(result.executionPlan.status));
  assert.equal((await api.ensureForProject(repository, project.project_id)).executionPlan.planFingerprint, result.executionPlan.planFingerprint);
});

test("38. export/import retains the old plan but downgrades it to stale", async () => {
  const ctx = await fullRepositoryPlan();
  const exported = await ctx.repository.exportProject(ctx.project.project_id);
  const imported = await ctx.repository.importProject(exported.json);
  const state = (await ctx.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  assert.equal(state.status, "stale");
  assert.ok(state.plan);
  assert.equal(state.plan.firstAction.ready, false);
  assert.ok(state.blockers.some((entry) => entry.code === "IMPORT_SOURCE_IDENTITY_UNPROVEN"));
});

test("39. collision import remaps Stage 22 identities without old project references", async () => {
  const ctx = await fullRepositoryPlan();
  const imported = await ctx.repository.importProject((await ctx.repository.exportProject(ctx.project.project_id)).json);
  const state = (await ctx.repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  assert.equal(state.projectId, imported.project_id);
  assert.notEqual(state.sourceTechnologyReviewId, ctx.execution.executionPlan.sourceTechnologyReviewId);
  assert.equal(JSON.stringify(state).includes(ctx.project.project_id), false);
  assert.equal(state.planFingerprint, api.calculatePlanFingerprint(state));
});

test("40. a corrupted nested reference import is rejected atomically", async () => {
  const ctx = await fullRepositoryPlan();
  const exported = await ctx.repository.exportProject(ctx.project.project_id);
  const envelope = structuredClone(exported.envelope);
  const state = envelope.payload.progress.find((entry) => entry.kind === api.PROGRESS_KIND).state;
  state.plan.phases[0].dependsOnPhaseIds = ["missing-phase"];
  state.planFingerprint = api.calculatePlanFingerprint(state);
  state.plan.planFingerprint = state.planFingerprint;
  envelope.export_id = global.YarnAIProjectSystem.uuidv7();
  envelope.payload_checksum = await global.YarnAIProjectSystem.checksumPayload(envelope.payload);
  const before = (await ctx.repository.listProjects()).length;
  await assert.rejects(ctx.repository.importProject(envelope), { code: "INVALID_IMPORT_EXECUTION_PLAN_REFERENCE" });
  assert.equal((await ctx.repository.listProjects()).length, before);
});
