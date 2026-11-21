"use strict";

const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const evidenceApi = require("../src/yarnai/static/pattern-source-instruction-evidence.js");
const reviewApi = require("../src/yarnai/static/pattern-technology-review.js");
const executionPlanApi = require("../src/yarnai/static/pattern-execution-plan.js");

const repositories = [];
const stamp = (seconds) => new Date(seconds * 1000).toISOString();
const binding = (overrides = {}) => ({
  projectId: "project-1", sourceDocumentIdentity: "pdf-1", sourceDocumentMaterialId: "material-1", sourceDocumentName: "pattern.pdf",
  sourceDocumentFingerprint: "sha256:abcdef", sourceDocumentRevision: 2, sourceExtractionIdentity: "extract-1", sourceExtractionRevision: 4,
  analysisId: "semantic-1", stage19ReviewIdentity: "review-19", stage19AuthoritativeReviewRevision: 7,
  stage19SourceEvidenceFingerprint: "fnv1a32:12345678", selectedSourceSize: "M",
  constructionSequence: [...evidenceApi.CONSTRUCTION_SEQUENCE], extractionAlgorithmVersion: evidenceApi.ALGORITHM_VERSION,
  ...overrides,
});

const pages = [
  { pageNumber: 1, text: `Sizing: XS, S, M, L, XL. Sizes listed in this order.
Neckline: Using smaller needles cast on 80 (85, 90, 95, 100) sts, place BOR marker and join for working in the round. Select one of the following two ribbing methods for the neckline. Ribbing First Method: work immediate ribbing. Ribbing Last Method: after casting on, switch to larger needles, knit a single round, then proceed to neckline increase round. Neckline Increase Round: Knit increasing 30 (32, 34, 36, 38) sts evenly spaced [110 (117, 124, 131, 138) sts].
Yoke: Marker Set-up: arrange sections. Round 1: increase around markers [8 sts inc]. Round 2: knit in pattern. Work rounds 1-2 a total of 16 (17, 18, 19, 20) times, this is 32 (34, 36, 38, 40) rounds [244 (256, 268, 280, 292) total sts, 50 (52, 54, 56, 58) sts at each sleeve, 72 (76, 80, 84, 88) sts at each front and back]. Round 6: check yoke depth: Work in pattern until yoke measures 7 (7.5, 7.75, 8, 8.5) inches. Short Row Shaping (optional): Optional short rows are worked symmetrically around the centre back.
Marker Set-up: place CB marker. Short Row 1 (RS): knit and turn work. Short Row 2 (WS): double the stitch, purl and turn work. Short Row 3 (RS): double the stitch, knit and turn work. Short Row 4 (WS): double the stitch, purl and turn work. Work short rows 3-4 a total of 4 (4, 5, 5, 6) times, this is 8 (8, 10, 10, 12) rows. Next Round: double the stitch and work one complete round. Shift BOR: remove CB marker and knit to the first raglan marker.` },
  { pageNumber: 2, text: `Separate Body and Sleeves: On the separation round sleeve sts are placed on hold. Separation Round: place 50 (52, 54, 56, 58) sts on hold, cast on 8 (9, 10, 11, 12) underarm sts, knit 72 (76, 80, 84, 88) sts to the next marker (front), repeat for the other side [160 (170, 180, 190, 200) body sts].
Body: Work in stockinette until body measures. Regular Length: work 13 (14, 15, 16, 17) inches from underarm. Cropped Length: work 8 (9, 10, 11, 12) inches from underarm. Regular and Cropped Lengths: work ribbing for 2 (2, 2, 2, 2) inches and bind off.
Sleeves: Place 50 (52, 54, 56, 58) held sts back on larger needles. Set-up Round: pick up and knit 4 (4, 5, 5, 6) sts, knit held sts, pick up 4 (4, 5, 5, 6) more [58 (60, 64, 66, 70) sts]. Short Sleeves: work 2 inches and bind off. 3/4 Sleeves: work 4 inches. Decrease Round: decrease 2 sts and repeat. All Sizes: work cuff and bind off. Long Sleeves: work 6 (6.5, 7, 7.5, 8) inches in pattern. Decrease Round: decrease 2 sts. Work 5 (5, 5, 5, 5) rounds even. Work these 6 (6, 6, 6, 6) rounds a total of 10 (10, 11, 11, 12) times [40 (41, 42, 43, 44) sts]. Work even until sleeve measures 17 (17.5, 18, 18.5, 19) inches from underarm. Work ribbing for 2 (2, 2, 2, 2) inches and bind off. Neckline Ribbing: If working neckline ribbing last, pick up and knit one st in each st cast-on, this is 80 (85, 90, 95, 100) sts. Work ribbing for 1 (1, 1.25, 1.25, 1.5) inches and bind off.
Finishing: weave in ends, sew up underarm holes, and block the sweater.` },
];

function builtResult() { return evidenceApi.buildEvidenceResult({ binding: binding(), pages, canonicalSizeOrder: ["XS", "S", "M", "L", "XL"], selectedSize: "M" }); }
function confirmedEvidence() {
  let state = evidenceApi.createInitialState(binding(), stamp(1));
  state = evidenceApi.beginExtraction(state, stamp(2));
  state = evidenceApi.completeExtraction(state, builtResult(), stamp(3));
  const selected = { neckline_method: "ribbing_last", short_rows: "include", body_length: "regular", sleeve_length: "long" };
  for (const question of state.result.reviewQuestions) state = evidenceApi.setReviewDecision(state, question.identity, selected[question.kind], stamp(4));
  return evidenceApi.confirmEvidence(state, stamp(5));
}

function confirmedEvidenceWithSelections(selections) {
  let state = evidenceApi.createInitialState(binding(), stamp(1));
  state = evidenceApi.beginExtraction(state, stamp(2));
  state = evidenceApi.completeExtraction(state, builtResult(), stamp(3));
  for (const question of state.result.reviewQuestions) {
    state = evidenceApi.setReviewDecision(state, question.identity, selections[question.kind], stamp(4));
  }
  return evidenceApi.confirmEvidence(state, stamp(5));
}

function stage20Draft() {
  const draftResult = {
    schemaVersion: 2, algorithmVersion: 2, resultIdentity: "technology-result:test", projectSummary: { projectId: "project-1" },
    sourcePatternEvidence: { fingerprint: "fnv1a32:11111111", facts: { construction: { sequence: [...evidenceApi.CONSTRUCTION_SEQUENCE] }, gauge: [{ stitches: 18, rounds: 24, per: 4, unit: "in" }], needles: [4.5] } },
    userAdaptationProfile: { fingerprint: "fnv1a32:22222222", gauge: [{ stitches: 20, rows: 26, per: 10, unit: "cm" }], needles: [{ canonicalValue: 4, unit: "mm" }] },
    components: [], operations: [], rowInstructions: [], finishing: [], sizes: [], stitchCountChanges: [], missingInformation: [], conflicts: [], warnings: [], assumptions: [], provenance: [],
  };
  return {
    id: "draft-20", kind: "PATTERN_TECHNOLOGY_DRAFT", projectId: "project-1", sourceProjectId: "project-1", status: "ready", revision: 3,
    version: 1, algorithmVersion: 2, inputContractVersion: 2, sourceReviewId: "review-19", sourceReviewRevision: 7,
    sourceSemanticAnalysisId: "semantic-1", sourceSemanticAnalysisRevision: 4, sourceImportRevision: 2,
    sourceProjectionFingerprint: "fnv1a32:33333333", draftResult, validation: { valid: true },
    draftFingerprint: reviewApi.fingerprint(draftResult), criticalIssuesFingerprint: reviewApi.fingerprint([]), audit: [],
  };
}

function exactStyleStage20Draft() {
  const draft = stage20Draft();
  draft.draftResult.sourcePatternEvidence.facts = {
    ...draft.draftResult.sourcePatternEvidence.facts, selectedSize: "M", finishedMeasurement: { sizeLabel: "M", cm: 101.6, in: 40 },
    yarnWeight: ["worsted/aran"], yarnSamples: ["исходная пряжа"],
  };
  draft.draftResult.userAdaptationProfile = {
    ...draft.draftResult.userAdaptationProfile, selectedSize: { value: "M" },
    measurements: [
      { kind: "chest", value: 96, unit: "cm", status: "confirmed" }, { kind: "waist", value: 78, unit: "cm", status: "confirmed" },
      { kind: "hips", value: 102, unit: "cm", status: "confirmed" }, { kind: "ease", value: 5.6, unit: "cm", status: "confirmed" },
      { kind: "total_length", value: 64, unit: "cm", status: "confirmed" },
    ],
    yarn: { names: ["пряжа пользователя"], fibre: ["100% шерсть"], weight: ["worsted/aran"], lengthOrWeight: [{ value: 200, unit: "m" }, { value: 100, unit: "g" }] },
  };
  draft.draftFingerprint = reviewApi.fingerprint(draft.draftResult);
  return draft;
}

function legacyV5Input(draft, evidence) {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(draft, "progress-20", evidence));
  input.algorithmId = reviewApi.LEGACY_EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID;
  delete input.adaptedExecution.causalAuthority;
  delete input.adaptedExecution.causalTrace;
  delete input.readiness.causalTraceComplete;
  delete input.readiness.adaptationFullySupported;
  input.identity = `executable-technology-plan-input:${reviewApi.fingerprint({ schemaId: input.schemaId, contractVersion: input.contractVersion, algorithmId: input.algorithmId, binding: input.binding, evidence: input.evidence, selectedOptions: input.branchSelection.selectedOptions, branchFingerprint: input.branchSelection.fingerprint, solverResultFingerprint: input.adaptedExecution.solverFingerprint }).slice(8)}`;
  input.fingerprint = reviewApi.executableInputFingerprint(input);
  return input;
}

function confirmedLegacyV5Review(draft = exactStyleStage20Draft(), evidence = confirmedEvidence()) {
  const legacyInput = legacyV5Input(draft, evidence);
  let review = structuredClone(reviewApi.createInitialState(draft.projectId, draft, { progressId: "progress-20", instructionEvidence: evidence }, stamp(10)));
  const currentInputIdentity = review.immutableSourceSnapshot.executableTechnologyPlanInput.identity;
  review.immutableSourceSnapshot.executableTechnologyPlanInput = structuredClone(legacyInput);
  review.immutableSourceSnapshotFingerprint = reviewApi.fingerprint(review.immutableSourceSnapshot);
  review.executableInputIdentity = legacyInput.identity;
  review.executableInputFingerprint = legacyInput.fingerprint;
  review.stage20ResultIdentity = legacyInput.binding.stage20ResultIdentity;
  review.sourceProjectionFingerprint = legacyInput.binding.stage20SourceProjectionFingerprint;
  const executableTarget = review.reviewState.targets.find((entry) => entry.id === "executable-plan-review:0b7eaa26" || entry.originalValue?.identity === currentInputIdentity);
  if (executableTarget) {
    executableTarget.originalValue.identity = legacyInput.identity;
    executableTarget.originalValue.fingerprint = legacyInput.fingerprint;
    executableTarget.originalValue.algorithmId = legacyInput.algorithmId;
  }
  review = reviewApi.startReview(review, stamp(11));
  for (const decision of review.decisions.filter((entry) => entry.decision === "pending")) {
    const target = review.reviewState.targets.find((entry) => entry.id === decision.targetId);
    review = reviewApi.setDecision(review, decision.targetId, "accepted", target?.category === "conflict" ? { selectedValue: target.conflictValues[0] } : {}, stamp(12));
  }
  review = reviewApi.confirmReview(review, draft, stamp(13));
  return { draft, evidence, review, legacyInput };
}

function exactContext(draft, evidence) {
  return {
    technologyDraft: draft,
    analysisReview: { projectId: draft.projectId, id: draft.sourceReviewId, revision: draft.sourceReviewRevision, sourceImportRevision: draft.sourceImportRevision },
    semanticAnalysis: { projectId: draft.projectId, id: draft.sourceSemanticAnalysisId, revision: draft.sourceSemanticAnalysisRevision, sourceImportRevision: draft.sourceImportRevision },
    instructionEvidence: evidence,
    requireCurrentIdentity: true,
  };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(global.YarnAIProjectSystem.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked")); });
});

test("canonical order and selected size remain explicit", () => {
  const result = builtResult();
  assert.deepEqual(result.canonicalSizeOrder, ["XS", "S", "M", "L", "XL"]);
  assert.equal(result.selectedSizeIndex, 2);
  const castOn = result.evidenceUnits.find((entry) => entry.operationType === "cast_on");
  assert.equal(castOn.sizeSelections[0].selectedRawValue, "90");
  assert.equal(castOn.sizeSelections[0].normalizedValue, 90);
  assert.equal(castOn.sizeSelections[0].selectionAlgorithmVersion, evidenceApi.SIZE_SELECTION_ALGORITHM);
});

test("nested representation is preserved and mismatch is ambiguous", () => {
  const selected = evidenceApi.parseMultiSizeVector("60 (64, 68, 72, 76)", ["XS", "S", "M", "L", "XL"], "M");
  assert.equal(selected.rawRepresentation.children[1].delimiter, "parentheses");
  assert.equal(selected.normalizedValue, 68);
  const ambiguous = evidenceApi.parseMultiSizeVector("60 (64, 68)", ["XS", "S", "M", "L", "XL"], "M");
  assert.equal(ambiguous.selectionStatus, "ambiguous");
  assert.ok(ambiguous.ambiguityReasons.includes("SIZE_VECTOR_LENGTH_MISMATCH"));
});

test("a different-size conditional vector is not an ML ambiguity", () => {
  const order = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
  const vectors = evidenceApi.vectorCandidates("XXL (3XL, 4XL, 5XL, 6XL): k0 (0, 0, 2, 0) sts, [k28 (9, 5, 4, 3), k2tog]", order, "M");
  assert.ok(vectors.length >= 2);
  assert.ok(vectors.every((entry) => entry.selectionStatus === "not_applicable"));
  assert.ok(vectors.every((entry) => entry.conditionalSizeScope?.appliesToSelectedSize === false));
});

test("conditional size scope carries into following instruction blocks until all sizes", () => {
  const order = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
  const inherited = evidenceApi.conditionalSizeScope("Sizes XL (XXL, 3XL, 4XL, 5XL, 6XL) only:", order, "M");
  const vectors = evidenceApi.vectorCandidates("Round 4: Work rounds 3-4 a total of 2 (2, 3, 4, 4, 5) times.", order, "M", inherited);
  assert.equal(vectors.length, 1);
  assert.equal(vectors[0].selectionStatus, "not_applicable");
  assert.equal(vectors[0].ambiguityReasons.length, 0);
  const fullVector = evidenceApi.vectorCandidates("Neckline ribbing: work 1 (1, 1, 1, 1, 1, 1, 1, 1, 1) inches.", order, "M", inherited);
  assert.equal(fullVector[0].selectionStatus, "selected");
  assert.equal(fullVector[0].normalizedValue, 1);
});

test("a trailing subgroup declaration does not hide earlier all-size values", () => {
  const order = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "6XL"];
  const scopedPages = [{ pageNumber: 1, text: `Sizing: XS, S, M, L, XL, XXL, 3XL, 4XL, 5XL, 6XL. Sizes listed in this order.
Yoke: Round 2: Work rounds 1-2 a total of 10 (11, 12, 13, 14, 15, 16, 17, 18, 19) times. Sizes XL (XXL, 3XL, 4XL, 5XL, 6XL) only: Round 3: Work rounds 3-4 a total of 2 (2, 3, 4, 4, 5) times. All sizes: Round 4: knit.` }];
  const units = evidenceApi.createEvidenceUnits(scopedPages, order, "M", binding({ selectedSourceSize: "M" }));
  const allSizes = units.find((entry) => entry.label === "Round 2");
  const subgroup = units.find((entry) => entry.label === "Round 3");

  assert.equal(allSizes.sizeSelections[0].selectionStatus, "selected");
  assert.equal(allSizes.sizeSelections[0].normalizedValue, 12);
  assert.equal(subgroup.sizeSelections[0].selectionStatus, "not_applicable");
});

test("all construction sections have operations, rows and finishing evidence", () => {
  const result = builtResult();
  assert.equal(result.coverage.complete, true);
  assert.equal(result.coverage.coveredCount, 6);
  assert.ok(result.counts.operations > 0);
  assert.ok(result.counts.rowInstructions > 0);
  assert.ok(result.counts.finishing > 0);
  assert.deepEqual(result.projection.components.map((entry) => entry.type), [...evidenceApi.CONSTRUCTION_SEQUENCE]);
});

test("every instruction is bound to page, span, excerpt and fingerprint", () => {
  for (const unit of builtResult().evidenceUnits) {
    assert.ok(Number.isInteger(unit.sourceLocator.pdfPageIndex));
    assert.ok(unit.sourceLocator.textSpan.end > unit.sourceLocator.textSpan.start);
    assert.ok(unit.sourceLocator.supportingExcerpt.length);
    assert.match(unit.sourceLocator.fragmentFingerprint, /^fnv1a32:[0-9a-f]{8}$/);
    assert.ok(unit.sourceLocator.extractionConfidence > 0);
  }
});

test("confirmation is blocked until branch decisions are explicit", () => {
  let state = evidenceApi.completeExtraction(evidenceApi.beginExtraction(evidenceApi.createInitialState(binding(), stamp(1)), stamp(2)), builtResult(), stamp(3));
  assert.equal(state.status, "draft");
  assert.ok(state.reviewQuestions === undefined);
  assert.throws(() => evidenceApi.confirmEvidence(state), { code: "EVIDENCE_CONFIRM_BLOCKED" });
  assert.deepEqual(new Set(state.unresolvedIssues.map((entry) => entry.kind)), new Set(["neckline_method", "short_rows", "body_length", "sleeve_length"]));
});

test("confirmed snapshot is immutable, valid and resolves only evidenced blockers", () => {
  const state = confirmedEvidence();
  assert.equal(state.status, "confirmed");
  assert.ok(Object.isFrozen(state.confirmedSnapshot));
  assert.equal(evidenceApi.validateConfirmedEvidence(state).valid, true);
  assert.ok(state.confirmedSnapshot.blockerResolutionMap.every((entry) => entry.resolutionStatus === "resolved" && entry.supportingEvidenceIdentities.length));
  const tampered = structuredClone(state); tampered.confirmedSnapshot.evidenceUnits[0].rawText = "fabricated";
  assert.equal(evidenceApi.validateConfirmedEvidence(tampered).valid, false);
});

test("source identity change marks evidence stale and rebuild preserves history", () => {
  const state = confirmedEvidence();
  const stale = evidenceApi.markStale(state, "SOURCE_BINDING_CHANGED", stamp(6));
  assert.equal(stale.status, "stale");
  const rebuilt = evidenceApi.rebuildFromSource(stale, binding({ sourceDocumentFingerprint: "sha256:changed" }), stamp(7));
  assert.equal(rebuilt.status, "waiting");
  assert.equal(rebuilt.history.length, 1);
  assert.equal(rebuilt.history[0].confirmedSnapshotFingerprint, state.confirmedSnapshotFingerprint);
});

test("confirmed instruction projection upgrades Stage 21 without inventing blockers", () => {
  const draft = stage20Draft(); const evidence = confirmedEvidence();
  const input = reviewApi.buildExecutableTechnologyPlanInput(draft, "progress-20", evidence);
  assert.equal(input.algorithmId, reviewApi.EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID);
  assert.ok(input.counts.components > 0 && input.counts.operations > 0 && input.counts.rowInstructions > 0 && input.counts.finishing > 0, JSON.stringify({ counts: input.counts, algorithmId: input.algorithmId, blockers: input.unresolvedBlockers, evidenceValidation: reviewApi.validateInstructionEvidence(evidence, input.binding) }));
  assert.equal(input.coverage.complete, true);
  assert.equal(input.unresolvedBlockers.length, 0, JSON.stringify(input.unresolvedBlockers));
  assert.equal(input.binding.sourceInstructionEvidenceFingerprint, evidence.confirmedSnapshotFingerprint);
  assert.ok(input.numericProvenance.some((entry) => entry.provenance === "SOURCE_SIZE_SELECTED" && entry.rawSizeVector));
  assert.equal(reviewApi.validateExecutableTechnologyPlanInput(input, draft, "progress-20", evidence).isValid, true);
});

test("legacy v5 confirmation is revalidated with an authoritative trace only when execution is equivalent", () => {
  const fixture = confirmedLegacyV5Review();
  const stale = reviewApi.markStale(fixture.review, "EXECUTABLE_INPUT_UPGRADE_REQUIRED", stamp(14));
  const repaired = reviewApi.revalidateConfirmedCausalTrace(stale, fixture.draft, { progressId: "progress-20", instructionEvidence: fixture.evidence }, stamp(15));
  assert.ok(repaired);
  assert.equal(repaired.status, "confirmed");
  assert.equal(repaired.confirmedAt, fixture.review.confirmedAt);
  assert.deepEqual(repaired.decisions, fixture.review.decisions);
  assert.equal(repaired.confirmedSnapshot.executableTechnologyPlanInput.algorithmId, reviewApi.EXECUTABLE_INPUT_EVIDENCE_ALGORITHM_ID);
  assert.equal(repaired.confirmedSnapshot.executableTechnologyPlanInput.adaptedExecution.causalTrace.schemaId, "AUTHORITATIVE_CAUSAL_TRACE_V1");
  assert.equal(reviewApi.canonicalize(reviewApi.authoritativeExecutionProjection(fixture.legacyInput)), reviewApi.canonicalize(reviewApi.authoritativeExecutionProjection(repaired.confirmedSnapshot.executableTechnologyPlanInput)));
  assert.equal(repaired.audit.at(-1).userConfirmationPreserved, true);
});

test("causal compatibility repair fails closed when authoritative Stage 20 changes", () => {
  const fixture = confirmedLegacyV5Review();
  const stale = reviewApi.markStale(fixture.review, "EXECUTABLE_INPUT_UPGRADE_REQUIRED", stamp(14));
  const changed = structuredClone(fixture.draft);
  changed.revision += 1;
  assert.equal(reviewApi.revalidateConfirmedCausalTrace(stale, changed, { progressId: "progress-20", instructionEvidence: fixture.evidence }, stamp(15)), null);
});

test("historic snapshot-invalid stale marker can revalidate only through the same exact causal proof", () => {
  const fixture = confirmedLegacyV5Review();
  const stale = reviewApi.markStale(fixture.review, "CONFIRMED_SNAPSHOT_INVALID", stamp(14));
  const repaired = reviewApi.revalidateConfirmedCausalTrace(stale, fixture.draft, { progressId: "progress-20", instructionEvidence: fixture.evidence }, stamp(15));
  assert.equal(repaired.status, "confirmed");
  assert.equal(repaired.audit.at(-1).previousErrorCode, "CONFIRMED_SNAPSHOT_INVALID");
  const changed = structuredClone(fixture.draft);
  changed.revision += 1;
  assert.equal(reviewApi.revalidateConfirmedCausalTrace(stale, changed, { progressId: "progress-20", instructionEvidence: fixture.evidence }, stamp(16)), null);
});

test("existing Stage 22 accepts only the proved causal-trace-only revalidation", () => {
  const fixture = confirmedLegacyV5Review();
  const context = exactContext(fixture.draft, fixture.evidence);
  const plan = executionPlanApi.buildState(executionPlanApi.createInitialState(fixture.draft.projectId, fixture.review, stamp(20)), fixture.review, context, stamp(21));
  const stale = reviewApi.markStale(fixture.review, "EXECUTABLE_INPUT_UPGRADE_REQUIRED", stamp(22));
  const repaired = reviewApi.revalidateConfirmedCausalTrace(stale, fixture.draft, { progressId: "progress-20", instructionEvidence: fixture.evidence }, stamp(23));
  const sourceValidation = executionPlanApi.validateSourceReview(repaired, fixture.draft.projectId, context);
  assert.equal(sourceValidation.diagnostics.length, 0, JSON.stringify(sourceValidation.diagnostics));
  assert.equal(executionPlanApi.causalTraceOnlyPlanCompatibility(plan, repaired, sourceValidation), true, JSON.stringify({ plan: executionPlanApi.sourceIdentity({ ...plan, confirmedSnapshot: null }), repaired: executionPlanApi.sourceIdentity(repaired) }));
  assert.equal(executionPlanApi.validateSourceIdentity(plan, repaired, context).length, 0);
  assert.equal(plan.revision, executionPlanApi.buildState(executionPlanApi.createInitialState(fixture.draft.projectId, fixture.review, stamp(20)), fixture.review, context, stamp(21)).revision);
  const forged = structuredClone(plan);
  forged.sourceSolverResultFingerprint = "fnv1a32:00000000";
  assert.ok(executionPlanApi.validateSourceIdentity(forged, repaired, context).length > 0);
});

test("diagnostic: Stage 21 removes rejected source branches by typed selected options", () => {
  const evidence = confirmedEvidenceWithSelections({
    neckline_method: "ribbing_last", short_rows: "include", body_length: "regular", sleeve_length: "long",
  });
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", evidence);
  const roles = input.operations.map((entry) => entry.source?.executionRole).filter(Boolean);
  assert.ok(roles.includes("neckline_deferred_setup"));
  assert.ok(roles.includes("sleeve_long_start"));
  assert.equal(roles.includes("neckline_ribbing_immediate"), false);
  assert.equal(roles.includes("sleeve_short"), false);
  assert.equal(roles.includes("sleeve_three_quarter_start"), false);
});

test("diagnostic: Stage 21 materializes the solver into a complete adapted chain", () => {
  const evidence = confirmedEvidenceWithSelections({
    neckline_method: "ribbing_last", short_rows: "include", body_length: "regular", sleeve_length: "long",
  });
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", evidence);
  assert.equal(input.readiness.adaptationCalculated, true, JSON.stringify({ blockers: input.unresolvedBlockers, sourceCounts: input.adaptedExecution?.sourceCounts, roles: input.operations.map((entry) => entry.source?.executionRole) }));
  assert.ok(Array.isArray(input.adaptedExecution?.operations));
  assert.ok(input.adaptedExecution.operations.length > 0);
  assert.ok(input.adaptedExecution.operations.every((operation) => operation.inputState && operation.outputState));
  assert.equal(input.readiness.sequentialValidationComplete, true);
});

test("diagnostic: literal short-row expansion counts rows 1-2 plus five 3-4 pairs", () => {
  const expansion = reviewApi.expandPhysicalShortRows({
    firstInstructionIdentity: "short-row-1",
    secondInstructionIdentity: "short-row-2",
    repeatedPair: ["short-row-3", "short-row-4"],
    pairExecutionsTotal: 5,
    stitchCount: 300,
  });
  assert.equal(expansion.length, 12);
  assert.deepEqual(expansion.map((entry) => entry.sourceInstructionIdentity), [
    "short-row-1", "short-row-2",
    "short-row-3", "short-row-4", "short-row-3", "short-row-4", "short-row-3", "short-row-4",
    "short-row-3", "short-row-4", "short-row-3", "short-row-4",
  ]);
});

test("typed branch resolver rejects missing, unknown and duplicate exclusive selections", () => {
  const snapshot = structuredClone(confirmedEvidence().confirmedSnapshot);
  const missing = structuredClone(snapshot); missing.selectedOptions = missing.selectedOptions.filter((entry) => entry.question.kind !== "body_length");
  assert.throws(() => reviewApi.resolveSelectedInstructionBranches(missing), { code: "BRANCH_SELECTION_MISSING" });
  const unknown = structuredClone(snapshot); unknown.selectedOptions.find((entry) => entry.question.kind === "body_length").selectedOptionId = "fabricated";
  assert.throws(() => reviewApi.resolveSelectedInstructionBranches(unknown), { code: "BRANCH_SELECTION_UNKNOWN" });
  const duplicate = structuredClone(snapshot); duplicate.selectedOptions.push(structuredClone(duplicate.selectedOptions[0]));
  assert.throws(() => reviewApi.resolveSelectedInstructionBranches(duplicate), { code: "BRANCH_SELECTION_MULTIPLE" });
});

test("typed branch projection is deterministic under input reordering and retains common operations", () => {
  const snapshot = structuredClone(confirmedEvidence().confirmedSnapshot);
  const bindingValue = reviewApi.instructionEvidenceBinding(confirmedEvidence());
  const firstResolution = reviewApi.resolveSelectedInstructionBranches(snapshot);
  const first = reviewApi.filterProjectionByBranches(reviewApi.executableProjectionFromInstructions(snapshot, bindingValue), firstResolution);
  const reordered = structuredClone(snapshot); reordered.evidenceUnits.reverse(); reordered.projection.operations.reverse(); reordered.projection.rowInstructions.reverse(); reordered.selectedOptions.reverse();
  const secondResolution = reviewApi.resolveSelectedInstructionBranches(reordered);
  const second = reviewApi.filterProjectionByBranches(reviewApi.executableProjectionFromInstructions(reordered, bindingValue), secondResolution);
  assert.equal(firstResolution.fingerprint, secondResolution.fingerprint);
  assert.deepEqual(first.operations.map((entry) => entry.identity), second.operations.map((entry) => entry.identity));
  assert.ok(first.operations.some((entry) => !entry.source.choiceMembership.length));
});

test("adapted execution proves raglan, separation, sleeve chains and source/adapted provenance", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  assert.deepEqual(input.adaptedExecution.raglanChain, [140, 148, 156, 164, 172, 180, 188, 196, 204, 212, 220, 228, 236, 244, 252, 260, 268, 276, 284, 292, 300]);
  assert.deepEqual(input.adaptedExecution.separation, { yoke: 300, front: 90, back: 90, sleeves: [60, 60], underarms: [12, 12], body: 204 });
  assert.deepEqual(input.adaptedExecution.sleeveChain[0].counts, [72, 70, 68, 66, 64, 62, 60, 58, 56, 54, 52, 50, 48]);
  const castOn = input.adaptedExecution.operations.find((entry) => entry.identity === "execution:cast-on").executableValue;
  assert.equal(castOn.sourceValue, 90); assert.equal(castOn.adaptedValue, 102);
  assert.ok(castOn.sourceEvidenceUnitIdentity); assert.ok(castOn.solverResultIdentity); assert.ok(castOn.adaptationProfile.fingerprint);
});

test("human adaptation explanation proves before, after and a concrete calculation reason", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const explanation = reviewApi.buildAdaptationExplanation(input);
  const start = explanation.changes.find((entry) => entry.title === "Набор и начало кокетки");
  assert.match(start.before, /набор: 90 п\./); assert.match(start.after, /набор: 102 п\./);
  assert.match(start.why, /18 п\..*24 круг\..*4 дюйм\..*20 п\..*26 р\..*10 см/);
  assert.match(start.why, /симметрию переда и спинки.*целые повторы реглана/);
});

test("human explanation never swaps source and adapted values", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const explanation = reviewApi.buildAdaptationExplanation(input);
  const yoke = explanation.changes.find((entry) => entry.title === "Кокетка и разделение");
  assert.match(yoke.before, /кокетка перед разделением: 268 п\./);
  assert.match(yoke.after, /кокетка перед разделением: 300 п\./);
});

test("one calculation reason groups related changes without flattening them into operations", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const explanation = reviewApi.buildAdaptationExplanation(input);
  assert.equal(explanation.changes.filter((entry) => entry.title === "Кокетка и разделение").length, 1);
  const grouped = explanation.changes.find((entry) => entry.title === "Кокетка и разделение");
  for (const label of ["перед", "петли каждого рукава на удержании", "петли каждого подреза", "корпус"]) assert.match(grouped.after, new RegExp(label));
  assert.ok(explanation.changes.length < input.adaptedExecution.operations.length);
  const sleeves = explanation.changes.find((entry) => entry.title === "Рукава и манжеты");
  assert.match(sleeves.before, /повторы убавок на каждом рукаве: 11 повторов/);
  assert.match(sleeves.after, /повторы убавок на каждом рукаве: 12 повторов/);
  assert.ok(explanation.unchanged.some((entry) => entry.includes("цикл между убавками: 6 кругов")));
  assert.ok(explanation.operationCoverage.total >= 12);
  assert.ok(explanation.operationCoverage.explained >= 2);
  assert.equal(explanation.operationCoverage.gaps, 0);
  assert.equal(explanation.operationCoverage.complete, true);
});

test("exact-style explanation links proved measurements and exposes every unproved dependency", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const explanation = reviewApi.buildAdaptationExplanation(input);
  assert.equal(explanation.status, "partial");
  assert.match(explanation.sourceVariant, /96 см плюс свобода облегания 5,6 см дают 101,6 см/);
  const start = explanation.changes.find((entry) => entry.title === "Набор и начало кокетки");
  assert.match(start.before, /прибавки горловины: 34 п\./); assert.match(start.after, /прибавки горловины: 38 п\./);
  assert.match(start.before, /подъём петель отложенной горловины: 90 п\./); assert.match(start.after, /подъём петель отложенной горловины: 102 п\./);
  const split = explanation.changes.find((entry) => entry.title === "Кокетка и разделение");
  assert.match(split.before, /спинка: 80 п\..*центр спинки: 40 п\./); assert.match(split.after, /спинка: 90 п\..*центр спинки: 45 п\./);
  for (const area of ["Мерка «обхват талии»", "Мерка «обхват бёдер»", "Мерка «желаемая общая длина»", "Количество пряжи"]) assert.ok(explanation.gaps.some((entry) => entry.area === area), area);
  assert.ok(explanation.changes.some((entry) => entry.title === "Распределение прибавок горловины" && /повторить 12 раз/.test(entry.after)));
  assert.doesNotMatch(JSON.stringify(explanation), /6 мотков/);
});

test("unchanged values are separated from actual changes", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const explanation = reviewApi.buildAdaptationExplanation(input);
  assert.ok(explanation.unchanged.some((entry) => entry.includes("Размер M оставлен без изменения")));
  assert.equal(explanation.changes.some((entry) => entry.title === "Размерный вариант"), false);
  assert.ok(explanation.unchanged.some((entry) => entry.includes("глубина кокетки")));
});

test("confirmed branch keys become Russian user choices", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const explanation = reviewApi.buildAdaptationExplanation(input);
  const branches = explanation.changes.find((entry) => entry.title === "Выбранные варианты инструкции");
  assert.match(branches.after, /обработка горловины — связать резинку горловины в конце/);
  assert.match(branches.after, /укороченные ряды — выполнить укороченные ряды/);
  assert.doesNotMatch(branches.after, /neckline_method|ribbing_last|short_rows|include/);
  assert.equal(reviewApi.userOperationLabel("cast_on"), "набор петель");
});

test("primary explanation contains no internal identities, fingerprints or raw JSON", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const serialized = JSON.stringify(reviewApi.buildAdaptationExplanation(input));
  for (const forbidden of ["fnv1a32:", "sha256:", "executable-technology-plan-input:", "constraint-solver-result:", "stage20-v2", "sourceEvidenceUnitIdentity", "solverResultIdentity"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("human explanation is deterministic and does not mutate Stage 21 or downstream data", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const before = reviewApi.canonicalize(input);
  const first = reviewApi.buildAdaptationExplanation(input); const second = reviewApi.buildAdaptationExplanation(structuredClone(input));
  assert.deepEqual(first, second); assert.equal(reviewApi.canonicalize(input), before);
});

test("serialized Stage 21 reopen rebuilds the same explanation without changing Stage 22 or execution truth", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const saved = {
    immutableSourceSnapshot: { executableTechnologyPlanInput: input },
    downstream: {
      stage22: { revision: 33, planFingerprint: "fnv1a32:c69cf30c", stepCount: 127 },
      virtual: { completedStepCount: 127, totalStepCount: 127, physicalCompletion: false, fitConfirmed: false },
      physical: { started: false, completedStepCount: 0, totalStepCount: 127 },
    },
  };
  const before = structuredClone(saved.downstream);
  const first = reviewApi.buildAdaptationExplanation(saved.immutableSourceSnapshot.executableTechnologyPlanInput);
  const reopened = JSON.parse(JSON.stringify(saved));
  const second = reviewApi.buildAdaptationExplanation(reopened.immutableSourceSnapshot.executableTechnologyPlanInput);
  assert.deepEqual(second, first);
  assert.deepEqual(saved.downstream, before);
  assert.deepEqual(reopened.downstream, before);
  assert.deepEqual(reopened.downstream.virtual, { completedStepCount: 127, totalStepCount: 127, physicalCompletion: false, fitConfirmed: false });
  assert.deepEqual(reopened.downstream.physical, { started: false, completedStepCount: 0, totalStepCount: 127 });
});

test("legacy input without authoritative trace produces a specific partial gap instead of invented success", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence()));
  delete input.adaptedExecution.causalTrace;
  const explanation = reviewApi.buildAdaptationExplanation(input);
  assert.equal(explanation.status, "partial");
  assert.ok(explanation.gaps.some((entry) => entry.area === "Причинная цепочка"));
  assert.equal(explanation.changes.some((entry) => entry.title === "Плотность вязания"), false);
  assert.doesNotMatch(JSON.stringify(explanation), /для лучшей посадки|система оптимизировала|с учётом ваших параметров/i);
});

test("tampered causal trace stays a visible explanation gap", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence()));
  input.adaptedExecution.causalTrace.parameterDecisions[0].status = "UNSUPPORTED";
  const explanation = reviewApi.buildAdaptationExplanation(input);
  assert.equal(explanation.status, "partial");
  assert.ok(explanation.gaps.some((entry) => entry.area === "Причинная цепочка"));
});

test("sequential validator fails closed on null counts, broken state, stale evidence and stale solver", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence());
  const expected = { binding: input.binding, branchResolution: { fingerprint: input.branchSelection.fingerprint }, solverIdentity: input.adaptedExecution.solverIdentity, solverFingerprint: input.adaptedExecution.solverFingerprint };
  const nullCount = structuredClone(input.adaptedExecution); nullCount.operations[1].change.output = null;
  assert.ok(reviewApi.validateSequentialExecution(nullCount, expected).errors.some((entry) => entry.code === "EXECUTION_COUNT_MISSING"));
  const broken = structuredClone(input.adaptedExecution); broken.operations[2].inputState.totalStitches += 1;
  assert.ok(reviewApi.validateSequentialExecution(broken, expected).errors.some((entry) => entry.code === "EXECUTION_SEQUENTIAL_STATE_MISMATCH"));
  const staleEvidence = structuredClone(input.adaptedExecution); staleEvidence.evidenceFingerprint = "fnv1a32:00000000";
  assert.ok(reviewApi.validateSequentialExecution(staleEvidence, expected).errors.some((entry) => entry.code === "EXECUTION_EVIDENCE_STALE"));
  const staleSolver = structuredClone(input.adaptedExecution); staleSolver.solverFingerprint = "fnv1a32:00000000";
  assert.ok(reviewApi.validateSequentialExecution(staleSolver, expected).errors.some((entry) => entry.code === "EXECUTION_SOLVER_STALE"));
});

test("ready executable Stage 21 exposes one plan-level user confirmation target and remains awaiting user", () => {
  const draft = stage20Draft(); const evidence = confirmedEvidence();
  const state = reviewApi.createInitialState(draft.projectId, draft, { progressId: "progress-20", instructionEvidence: evidence }, stamp(20));
  assert.equal(state.decisions.length, 1);
  assert.equal(state.reviewState.targets[0].code, "EXECUTABLE_TECHNOLOGY_PLAN");
  assert.equal(state.status, "waiting");
  assert.ok(state.validation.critical.some((entry) => entry.code === "REQUIRED_DECISION_PENDING"));
  assert.equal(state.confirmedSnapshot, null);
});

test("tampered source instruction evidence cannot be projected into Stage 21", () => {
  const evidence = structuredClone(confirmedEvidence()); evidence.confirmedSnapshot.projection.operations[0].actions = ["invented"];
  const input = reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", evidence);
  assert.equal(input.algorithmId, reviewApi.EXECUTABLE_INPUT_ALGORITHM_ID);
  assert.equal(input.counts.operations, 0);
});

test("constraint-aware adaptation searches candidates and preserves topology", () => {
  const calculated = reviewApi.calculateConstraintAwareTopDownCounts({
    sourceCounts: { castOn: 90, yokeStart: 124, yokeFinal: 268, front: 80, sleeveHeld: 54, underarm: 10, body: 180, sleeveStart: 64, cuff: 42, yokeRepeats: 18 },
    sourceGauge: { stitches: 18, per: 4, unit: "in" }, adaptationGauge: { stitches: 20, per: 10, unit: "cm" }, raglanDeltaPerRepeat: 8,
  }, { projectId: "project-1", sourceInstructionEvidenceFingerprint: "fnv1a32:12345678" });
  assert.equal(calculated.status, "calculated");
  assert.ok(calculated.candidatesEvaluated > 1);
  assert.ok(calculated.constraints.every((entry) => entry.satisfied));
  assert.equal(calculated.chosenCandidate.yokeFinal, 2 * calculated.chosenCandidate.front + 2 * calculated.chosenCandidate.sleeveHeld);
  assert.equal(calculated.chosenCandidate.body, 2 * calculated.chosenCandidate.front + 2 * calculated.chosenCandidate.underarm);
  assert.equal(calculated.chosenCandidate.sleeveStart, calculated.chosenCandidate.sleeveHeld + calculated.chosenCandidate.underarm);
  assert.ok(calculated.numericProvenance.every((entry) => entry.provenance === "ADAPTATION_CALCULATED" && entry.algorithmId && entry.evidenceBinding));
});

test("constraint-aware adaptation stays unresolved without an authoritative count", () => {
  const calculated = reviewApi.calculateConstraintAwareTopDownCounts({ sourceCounts: { castOn: 90 }, sourceGauge: { stitches: 18, per: 4, unit: "in" }, adaptationGauge: { stitches: 20, per: 10, unit: "cm" } }, { projectId: "project-1" });
  assert.equal(calculated.status, "unresolved");
  assert.ok(calculated.missingFields.includes("yokeFinal"));
  assert.equal(calculated.chosenCandidate, null);
});

test("row gauge adaptation converts inches to centimeters with numeric provenance", () => {
  const calculated = reviewApi.calculateAdaptedRowCount(24, { rows: 24, per: 4, unit: "in" }, { rows: 26, per: 10, unit: "cm" }, "NEAREST_INTEGER_HALF_UP", { projectId: "project-1", sourceInstructionEvidenceFingerprint: "fnv1a32:12345678" });
  assert.equal(calculated.value, 26);
  assert.equal(calculated.provenance.algorithmId, "gauge-ratio-row-adaptation:v1");
  assert.equal(calculated.provenance.provenance, "ADAPTATION_CALCULATED");
  assert.equal(calculated.provenance.inputs[1].unit, "rows/4 in");
});

test("causal trace gives every accepted parameter exactly one proved disposition", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const trace = input.adaptedExecution.causalTrace;
  assert.equal(trace.parameterDecisions.length, new Set(trace.parameterDecisions.map((entry) => entry.semanticParameterId)).size);
  assert.equal(trace.coverage.acceptedParameterCount, trace.coverage.uniquelyDisposedParameterCount);
  assert.equal(trace.parameterDecisions.find((entry) => entry.semanticParameterId === "gauge").status, "USED");
  assert.equal(trace.parameterDecisions.find((entry) => entry.semanticParameterId === "selected_size").status, "UNCHANGED");
  assert.equal(trace.parameterDecisions.find((entry) => entry.semanticParameterId === "measurement.waist").status, "UNSUPPORTED");
  assert.equal(trace.parameterDecisions.find((entry) => entry.semanticParameterId === "measurement.total_length").status, "MISSING_EVIDENCE");
});

test("USED and UNCHANGED dispositions carry real dependencies and checks", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const trace = input.adaptedExecution.causalTrace;
  for (const entry of trace.parameterDecisions.filter((item) => item.status === "USED")) {
    assert.ok(entry.appliedRule);
    assert.ok(entry.affectedOperationIdentities.length || entry.affectedTargetPaths.length);
  }
  for (const entry of trace.parameterDecisions.filter((item) => item.status === "UNCHANGED")) {
    assert.ok(entry.applicabilityRule);
    assert.ok(entry.checkedBy.length);
  }
  assert.equal(reviewApi.validateAuthoritativeCausalTrace(trace, input.adaptedExecution.operations, input.adaptedExecution).isValid, true);
});

test("empty self-fingerprinted causal trace cannot claim complete coverage", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence()));
  const trace = input.adaptedExecution.causalTrace;
  trace.parameterDecisions = [];
  trace.valueDecisions = [];
  trace.productBlockers = [];
  trace.coverage = { requiredParameterIds: [], requiredValueIds: [], acceptedParameterCount: 0, uniquelyDisposedParameterCount: 0, executableValueCount: 0, changedExecutableValueCount: 0, coveredChangedExecutableValueCount: 0, uncoveredChangedValues: [], complete: true };
  trace.fingerprint = reviewApi.causalTraceFingerprint(trace);
  const validation = reviewApi.validateAuthoritativeCausalTrace(trace, input.adaptedExecution.operations, input.adaptedExecution);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((entry) => ["CAUSAL_COVERAGE_INCOMPLETE", "CAUSAL_TRACE_NOT_AUTHORITATIVE_PROJECTION"].includes(entry.code)));
});

test("self-fingerprinted invented solver result is rejected against materialization", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence()));
  const trace = input.adaptedExecution.causalTrace;
  trace.valueDecisions.find((entry) => entry.semanticValueId === "solver.castOn").result = 999;
  trace.fingerprint = reviewApi.causalTraceFingerprint(trace);
  const validation = reviewApi.validateAuthoritativeCausalTrace(trace, input.adaptedExecution.operations, input.adaptedExecution);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((entry) => entry.code === "CAUSAL_TRACE_NOT_AUTHORITATIVE_PROJECTION"));
});

test("v6 executable input requires an authoritative causal trace", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence()));
  delete input.adaptedExecution.causalTrace;
  input.fingerprint = reviewApi.executableInputFingerprint(input);
  const validation = reviewApi.validateExecutableTechnologyPlanInput(input);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.some((entry) => entry.code === "CAUSAL_TRACE_MISSING"));
});

test("Stage 22 rejects a re-fingerprinted invented derived causal value", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence()));
  const trace = input.adaptedExecution.causalTrace;
  trace.valueDecisions.find((entry) => entry.semanticValueId === "derived.backCentre").result = 999;
  trace.fingerprint = reviewApi.causalTraceFingerprint(trace);
  const diagnostics = [];
  executionPlanApi.validateCausalTraceContract(input, (code, details) => diagnostics.push({ code, ...details }));
  assert.ok(diagnostics.some((entry) => entry.field === "causalTrace.authoritativeProjection"));
});

test("Stage 21 and Stage 22 reject causal authority that diverges from evidence", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence()));
  const authority = input.adaptedExecution.causalAuthority;
  authority.userAdaptationProfile.measurements.find((entry) => entry.kind === "waist").value = 999;
  authority.fingerprint = reviewApi.fingerprint({ schemaId: authority.schemaId, sourcePatternFacts: authority.sourcePatternFacts, userAdaptationProfile: authority.userAdaptationProfile, binding: authority.binding, branchResolution: authority.branchResolution });
  input.fingerprint = reviewApi.executableInputFingerprint(input);
  const stage21 = reviewApi.validateExecutableTechnologyPlanInput(input);
  assert.ok(stage21.errors.some((entry) => entry.code === "CAUSAL_AUTHORITY_BINDING_INVALID"));
  const diagnostics = [];
  executionPlanApi.validateCausalTraceContract(input, (code, details) => diagnostics.push({ code, ...details }));
  assert.ok(diagnostics.some((entry) => entry.field === "causalAuthority.binding"));
});

test("NOT_APPLICABLE requires and preserves a concrete construction rule", () => {
  const draft = exactStyleStage20Draft();
  draft.draftResult.userAdaptationProfile.notApplicableParameters = [{ semanticParameterId: "measurement.head", applicabilityRule: "pullover-without-hood-has-no-head-circumference-dependent-section:v1", explanationKey: "not_applicable", productPromise: "optional" }];
  draft.draftFingerprint = reviewApi.fingerprint(draft.draftResult);
  const input = reviewApi.buildExecutableTechnologyPlanInput(draft, "progress-20", confirmedEvidence());
  const decision = input.adaptedExecution.causalTrace.parameterDecisions.find((entry) => entry.semanticParameterId === "measurement.head");
  assert.equal(decision.status, "NOT_APPLICABLE");
  assert.match(decision.applicabilityRule, /without-hood/);
});

test("UNSUPPORTED remains a product blocker and never becomes successful adaptation", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  assert.equal(input.readiness.adaptationFullySupported, false);
  assert.ok(input.adaptedExecution.causalTrace.productBlockers.some((entry) => entry.semanticParameterId === "measurement.waist" && entry.status === "UNSUPPORTED"));
  assert.equal(reviewApi.buildAdaptationExplanation(input).status, "partial");
});

test("MISSING_EVIDENCE names missing authority and does not guess length or skeins", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const decisions = input.adaptedExecution.causalTrace.parameterDecisions;
  const length = decisions.find((entry) => entry.semanticParameterId === "measurement.total_length");
  const skeins = decisions.find((entry) => entry.semanticParameterId === "yarn.quantity");
  assert.ok(length.missingAuthoritativeFields.includes("source.lengthSectionDecomposition"));
  assert.equal(length.calculation.formula, null);
  assert.ok(skeins.missingAuthoritativeFields.includes("solver.adaptedYarnConsumption"));
  assert.equal(skeins.calculation, null);
  assert.doesNotMatch(reviewApi.canonicalize(skeins), /linear|proportion|stitch.*ratio/i);
});

test("CONFLICT blocks false confirmation", () => {
  const draft = exactStyleStage20Draft();
  draft.draftResult.userAdaptationProfile.measurements.find((entry) => entry.kind === "chest").value = 95;
  draft.draftFingerprint = reviewApi.fingerprint(draft.draftResult);
  const input = reviewApi.buildExecutableTechnologyPlanInput(draft, "progress-20", confirmedEvidence());
  assert.equal(input.adaptedExecution.causalTrace.parameterDecisions.find((entry) => entry.semanticParameterId === "measurement.chest").status, "CONFLICT");
  assert.equal(input.adaptedExecution.status, "blocked");
  assert.equal(input.readiness.executableReady, false);
  assert.ok(input.unresolvedBlockers.some((entry) => entry.code === "CAUSAL_CONFLICT_BLOCKS_CONFIRMATION"));
});

test("causal trace survives canonical materialization and JSON reload identically", () => {
  const one = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const two = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  assert.equal(reviewApi.canonicalize(one.adaptedExecution.causalTrace), reviewApi.canonicalize(two.adaptedExecution.causalTrace));
  assert.deepEqual(JSON.parse(JSON.stringify(one.adaptedExecution.causalTrace)), one.adaptedExecution.causalTrace);
  assert.equal(one.adaptedExecution.causalTrace.fingerprint, two.adaptedExecution.causalTrace.fingerprint);
});

test("UI refuses post-hoc causal inference when an old project has no trace", () => {
  const input = structuredClone(reviewApi.buildExecutableTechnologyPlanInput(stage20Draft(), "progress-20", confirmedEvidence()));
  delete input.adaptedExecution.causalTrace;
  const explanation = reviewApi.buildAdaptationExplanation(input);
  assert.equal(explanation.status, "partial");
  assert.equal(explanation.changes.length, 0);
  assert.match(explanation.gaps[0].message, /нет структурированного причинного следа/);
});

test("all changed executable values are covered by existing operations", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const trace = input.adaptedExecution.causalTrace;
  assert.equal(trace.coverage.complete, true);
  assert.equal(trace.coverage.changedExecutableValueCount, trace.coverage.coveredChangedExecutableValueCount);
  assert.deepEqual(trace.coverage.uncoveredChangedValues, []);
  const operationIds = new Set(input.adaptedExecution.operations.map((entry) => entry.identity));
  for (const value of trace.valueDecisions.filter((entry) => Number(entry.sourceValue) !== Number(entry.result))) assert.ok(value.affectedOperationIdentities.every((identity) => operationIds.has(identity)));
});

test("38 neckline increases have an executable quotient-remainder distribution", () => {
  const distribution = reviewApi.buildEvenIncreaseDistribution(102, 38);
  assert.equal(distribution.intervals.length, 38);
  assert.equal(distribution.intervals.reduce((sum, value) => sum + value, 0), 102);
  assert.deepEqual(distribution.repeatedGroup, { repeatCount: 12, intervals: [3, 3, 2] });
  assert.deepEqual(distribution.trailingIntervals, [3, 3]);
  assert.equal(distribution.outputStitches, 140);
  assert.equal(distribution.checks.maxIntervalDifference, 1);
});

test("key yoke, back-centre, sleeve and body arithmetic is causal and conserved", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const byField = new Map(input.adaptedExecution.causalTrace.valueDecisions.map((entry) => [entry.field, entry]));
  assert.deepEqual([byField.get("yokeFinal").sourceValue, byField.get("yokeFinal").result], [268, 300]);
  assert.deepEqual([byField.get("back").sourceValue, byField.get("back").result], [80, 90]);
  assert.deepEqual([byField.get("backCentre").sourceValue, byField.get("backCentre").result], [40, 45]);
  assert.deepEqual([byField.get("sleeveStart").sourceValue, byField.get("sleeveStart").result], [64, 72]);
  assert.equal(byField.get("body").result, 2 * byField.get("front").result + 2 * byField.get("underarm").result);
  assert.equal(byField.get("yokeFinal").result, 2 * byField.get("front").result + 2 * byField.get("sleeveHeld").result);
});

test("vertical decisions use confirmed row gauge while total length stays unresolved", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const cycle = input.adaptedExecution.causalTrace.valueDecisions.find((entry) => entry.field === "sleeveCycleRounds");
  assert.equal(cycle.acceptedConstraint.source.rows, 24);
  assert.equal(cycle.acceptedConstraint.adaptation.rows, 26);
  assert.equal(cycle.roundingPolicy, "CONSTRAINT_SOLVER_SELECTION");
  assert.ok(cycle.intermediateCalculation.exactResult.rowGaugeScaledExact > 6);
  assert.equal(cycle.intermediateCalculation.exactResult.rowGaugeRounded, 7);
  assert.equal(cycle.intermediateCalculation.exactResult.measurementCap, 6);
  assert.equal(cycle.result, 6);
  const straight = input.adaptedExecution.causalTrace.valueDecisions.find((entry) => entry.field === "sleeveRemainingStraightRounds");
  assert.equal(straight.result, 7);
  assert.ok(straight.affectedOperationIdentities.length);
  const totalLength = input.adaptedExecution.causalTrace.parameterDecisions.find((entry) => entry.semanticParameterId === "measurement.total_length");
  assert.equal(totalLength.calculation.inputs[0].value.rows, 24);
  assert.equal(totalLength.calculation.inputs[1].value.rows, 26);
  assert.equal(totalLength.calculation.formula, null);
});

test("constraint solver provenance describes selection rather than false half-up rounding", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const byField = new Map(input.adaptedExecution.causalTrace.valueDecisions.map((entry) => [entry.field, entry]));
  for (const field of ["yokeFinal", "body", "underarm", "cuff", "back"]) {
    const decision = byField.get(field);
    assert.equal(decision.roundingPolicy, "CONSTRAINT_SOLVER_SELECTION");
    assert.ok(Array.isArray(decision.intermediateCalculation.selectionConstraints));
    assert.ok(decision.intermediateCalculation.selectionConstraints.length);
  }
  assert.notEqual(Math.round(byField.get("yokeFinal").intermediateCalculation.gaugeScaledTarget), byField.get("yokeFinal").result);
  assert.equal(byField.get("back").intermediateCalculation.inputs[0].name, "sourceCounts.front");
});

test("rendering explanation cannot change the execution plan", () => {
  const input = reviewApi.buildExecutableTechnologyPlanInput(exactStyleStage20Draft(), "progress-20", confirmedEvidence());
  const snapshot = { reviewIdentity: { id: "review:test", projectId: "project-1", revision: 19 }, reviewRevision: 19, confirmedSnapshotFingerprint: "fnv1a32:88888888", executableTechnologyPlanInput: input, confirmedValues: [{ targetId: "executable-plan-review:test", decision: "accepted", value: { identity: input.identity, adaptedOperationCount: input.adaptedExecution.operations.length } }] };
  const before = executionPlanApi.derivePlan(snapshot, { id: "review:test", revision: 19 });
  reviewApi.buildAdaptationExplanation(input);
  const after = executionPlanApi.derivePlan(snapshot, { id: "review:test", revision: 19 });
  assert.deepEqual(after, before);
  assert.equal(before.plan.steps.length, 127);
});

test("generic repository persists and reloads the evidence state", async () => {
  let repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const project = await repository.createProject({ title: "Evidence persistence" });
  const added = await repository.addCalculation(project.project_id, { axes: [] }, { status: "READY", axes: {}, warnings: [], errors: [], clarifications: [] });
  const state = evidenceApi.createInitialState(binding({ projectId: project.project_id }), stamp(1));
  await repository.ensureCalculationProgress(project.project_id, added.calculation.calculation_id, evidenceApi.PROGRESS_KIND, state);
  repository.close(); repositories.pop();
  repository = new global.YarnAIProjectSystem.ProjectRepository(); repositories.push(repository); await repository.initialize();
  const reloaded = await repository.getCalculationProgress(project.project_id, added.calculation.calculation_id, evidenceApi.PROGRESS_KIND);
  assert.deepEqual(reloaded.state, state);
  const imported = await repository.importProject((await repository.exportProject(project.project_id)).json);
  const importedState = (await repository.getProject(imported.project_id)).progress.find((entry) => entry.kind === evidenceApi.PROGRESS_KIND).state;
  assert.equal(importedState.status, "stale");
  assert.equal(importedState.freshness, "stale");
  assert.equal(importedState.error.code, "IMPORT_SOURCE_IDENTITY_UNPROVEN");
  assert.equal(importedState.binding.projectId, imported.project_id);
  assert.notEqual(importedState.id, state.id);
});
