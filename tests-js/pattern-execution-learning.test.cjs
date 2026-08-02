"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const retrospectiveApi = require("../src/yarnai/static/pattern-execution-retrospective.js");
const api = require("../src/yarnai/static/pattern-execution-learning.js");
require("../src/yarnai/static/project-system.js");

const PROJECT = "project:one";
const CALCULATION = "calculation:one";
const NOW = "2026-08-01T10:00:00.000Z";

function executionSource() {
  const result = { kind: "PATTERN_EXECUTION_RESULT", id: "result:one", projectId: PROJECT, sourceCalculationId: CALCULATION, status: "ready", revision: 4, resultFingerprint: "fnv1a32:result", updatedAt: NOW };
  const runtime = { kind: "PATTERN_EXECUTION_RUNTIME", id: "runtime:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 7, epoch: 1, runtimeFingerprint: "fnv1a32:runtime", sourceResultId: result.id, sourceResultFingerprint: result.resultFingerprint, updatedAt: NOW };
  const followUp = { kind: "PATTERN_EXECUTION_FOLLOW_UP", id: "follow-up:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 4, epoch: 1, inputFingerprint: "fnv1a32:chain", fingerprint: "fnv1a32:follow-up", updatedAt: NOW };
  return { projectId: PROJECT, calculationId: CALCULATION, result, runtime, followUp, followUps: [followUp] };
}

function completedRetrospective(base = executionSource(), now = NOW) {
  let retrospective = retrospectiveApi.createPatternExecutionRetrospective(base, { includeAutomaticFacts: false, now });
  retrospective = retrospectiveApi.addFact(retrospective, { id: "fact:one", text: "Needle checks prevented a repeated sizing defect", sourceType: "result", sourceRefs: [{ sourceType: "result", sourceId: "result:one" }], evidenceLevel: "direct" });
  retrospective = retrospectiveApi.addConclusion(retrospective, { id: "conclusion:one", text: "The execution benefited from explicit verification", factIds: ["fact:one"], status: "confirmed" });
  return retrospectiveApi.completeRetrospective(retrospectiveApi.startReview(retrospective, base), base);
}

function source(overrides = {}) {
  const base = executionSource();
  const retrospective = completedRetrospective(base);
  return { ...base, retrospective, retrospectives: [retrospective], ...structuredClone(overrides) };
}

function draft(input = {}, sourceValue = source()) {
  return api.createPatternExecutionLearning(sourceValue, input);
}

function lesson(id = "lesson:one") {
  return { id, title: "Verify gauge before shaping", description: "Future projects should make gauge confirmation an explicit gate before shaping begins.", supportingFacts: ["fact:one"], confidence: "high" };
}

function recommendation(lessonId = "lesson:one") {
  return { id: "recommendation:one", title: "Add a gauge gate", priority: "high", rationale: "The learned control should be reusable in similar projects.", expectedBenefit: "Reduce preventable sizing rework.", supportingLessonIds: [lessonId] };
}

function completeRecord(sourceValue = source()) {
  let record = draft({}, sourceValue);
  record = api.addLesson(record, lesson());
  record = api.addSuccessfulPattern(record, { pattern: "Verify before irreversible work", rationale: "Early checks contained downstream risk.", supportingFacts: ["fact:one"], confidence: "high" });
  record = api.addAntiPattern(record, { pattern: "Proceed with an unverified gauge", reason: "It propagates dimensional uncertainty.", possibleMitigation: "Require an explicit gauge checkpoint.", supportingFacts: ["fact:one"], confidence: "medium" });
  record = api.addRecommendation(record, recommendation());
  record = api.setConfidenceAssessment(record, { level: "high", rationale: "The lesson is supported by a direct retrospective fact.", coverage: "One completed execution cycle.", limitations: ["Validate across more projects"] });
  return api.completeLearning(api.startReview(record, sourceValue), sourceValue);
}

test("creates an immutable deterministic draft from a completed retrospective", () => {
  const first = draft(); const second = draft();
  assert.deepEqual(first, second);
  assert.equal(first.kind, "PATTERN_EXECUTION_LEARNING");
  assert.equal(first.status, "draft");
  assert.ok(Object.isFrozen(first));
});

test("creation is forbidden without a completed retrospective", () => {
  const missing = executionSource();
  assert.throws(() => draft({}, missing), (error) => error.code === "completed_retrospective_required");
  const incomplete = completedRetrospective();
  const reviewing = { ...incomplete, status: "reviewing" };
  assert.throws(() => draft({}, { ...executionSource(), retrospective: reviewing, retrospectives: [reviewing] }), (error) => error.code === "completed_retrospective_required");
});

test("learning creates new structured knowledge and never copies retrospective text", () => {
  const record = draft();
  const serialized = api.serializePatternExecutionLearning(record);
  assert.doesNotMatch(serialized, /Needle checks prevented/);
  assert.doesNotMatch(serialized, /execution benefited/);
  for (const field of ["lessonsLearned", "successfulPatterns", "antiPatterns", "recommendations", "confidenceAssessment"]) assert.ok(Object.hasOwn(record, field), field);
  assert.equal(Object.hasOwn(record, "summary"), false);
});

test("all required domain blocks normalize NFC whitespace and stable arrays", () => {
  let record = api.addLesson(draft(), { ...lesson("lesson:z"), title: "  Verify   gauge  ", supportingFacts: ["fact:one", "fact:one"] });
  record = api.addLesson(record, { ...lesson("lesson:a"), order: 1 });
  record = api.addSuccessfulPattern(record, { pattern: "Stable check", rationale: "It worked", supportingFacts: ["fact:one"], confidence: "medium" });
  record = api.addAntiPattern(record, { pattern: "Skipped check", reason: "It raised risk", possibleMitigation: "Add a gate", supportingFacts: ["fact:one"], confidence: "low" });
  record = api.addRecommendation(record, recommendation("lesson:a"));
  record = api.setConfidenceAssessment(record, { level: "medium", rationale: "Direct support", coverage: "One cycle", limitations: ["b", "a", "a"] });
  assert.equal(record.lessonsLearned.find((item) => item.id === "lesson:z").title, "Verify gauge");
  assert.deepEqual(record.confidenceAssessment.limitations, ["a", "b"]);
  assert.equal(api.validatePatternExecutionLearning(record).valid, true);
});

test("lesson recommendation and anti-pattern required fields are enforced", () => {
  assert.throws(() => api.addLesson(draft(), { title: "Missing support", description: "No facts", confidence: "high" }), (error) => error.code === "corrupted_input");
  assert.throws(() => api.addAntiPattern(draft(), { pattern: "x", reason: "y", supportingFacts: ["fact:one"], confidence: "low" }), (error) => error.code === "corrupted_input");
  const withLesson = api.addLesson(draft(), lesson());
  assert.throws(() => api.addRecommendation(withLesson, { title: "x", priority: "high", rationale: "y", expectedBenefit: "z", supportingLessonIds: ["missing"] }), (error) => error.code === "corrupted_input");
});

test("lifecycle allows draft reviewing draft and reviewing completed", () => {
  const value = source();
  let record = completeRecord(value);
  assert.equal(record.status, "completed");
  assert.throws(() => api.returnToDraft(record, value), (error) => error.code === "terminal_learning");
  assert.throws(() => api.addLesson(record, lesson("lesson:two")), (error) => error.code === "terminal_learning");
  const reviewing = api.startReview(draft(), value);
  assert.equal(api.returnToDraft(reviewing, value).status, "draft");
  assert.throws(() => api.completeLearning(draft(), value), (error) => error.code === "invalid_transition");
});

test("completion requires sourced knowledge and confidence assessment", () => {
  const value = source();
  assert.throws(() => api.completeLearning(api.startReview(draft(), value), value), (error) => error.code === "learning_incomplete");
  let record = api.addLesson(draft({}, value), { ...lesson(), supportingFacts: ["missing"] });
  record = api.addRecommendation(record, recommendation());
  record = api.setConfidenceAssessment(record, { level: "medium", rationale: "Some support", coverage: "One cycle" });
  assert.throws(() => api.completeLearning(api.startReview(record, value), value), (error) => error.code === "learning_incomplete");
});

for (const critical of ["result", "runtime", "followUp", "retrospective"]) {
  test(`missing critical source ${critical} blocks integrity`, () => {
    const value = source(); value[critical] = null;
    if (critical === "followUp") value.followUps = [];
    if (critical === "retrospective") value.retrospectives = [];
    assert.equal(api.calculateIntegrity(value).valid, false);
  });
}

test("identity project and source mismatches are critical", () => {
  const value = source(); value.runtime.projectId = "project:other";
  assert.ok(api.calculateIntegrity(value).issues.some((entry) => entry.code === "project_mismatch"));
  const chain = source(); chain.retrospective = { ...chain.retrospective, sourceRuntimeId: "runtime:other" }; chain.retrospectives = [chain.retrospective];
  assert.ok(api.calculateIntegrity(chain).issues.some((entry) => entry.code === "source_identity_mismatch"));
});

test("source-chain fingerprint detects stale learning", () => {
  const value = source(); const record = draft({}, value);
  value.followUp = { ...value.followUp, revision: value.followUp.revision + 1 }; value.followUps = [value.followUp];
  assert.equal(api.isPatternExecutionLearningStale(record, value), true);
});

test("creation is forbidden when the completed retrospective source snapshot is no longer current", () => {
  const value = source();
  value.runtime = { ...value.runtime, revision: value.runtime.revision + 1 };
  assert.throws(() => draft({}, value), (error) => error.code === "critical_integrity");
  assert.ok(api.calculateIntegrity(value).issues.some((entry) => entry.code === "retrospective_source_changed"));
});

test("canonical JSON identity is independent of object key order and uses fixed timestamp fallback", () => {
  const base = executionSource(); delete base.result.updatedAt; delete base.runtime.updatedAt; delete base.followUp.updatedAt;
  const retrospective = completedRetrospective(base, null);
  const value = { ...base, retrospective, retrospectives: [retrospective] };
  const first = draft({}, value);
  const reversed = draft({}, Object.fromEntries(Object.entries(value).reverse()));
  assert.equal(first.identity, reversed.identity);
  assert.equal(first.createdAt, api.DEFAULT_TIMESTAMP);
});

test("export import duplicate remap and imported-unproven stale are deterministic", () => {
  const record = completeRecord();
  const serialized = api.serializePatternExecutionLearning(record);
  assert.deepEqual(api.deserializePatternExecutionLearning(serialized), record);
  assert.equal(api.importPatternExecutionLearning([record], serialized).status, "duplicate");
  const remapped = api.remapPatternExecutionLearning(record, new Map([[PROJECT, "project:two"], [CALCULATION, "calculation:two"], ["result:one", "result:two"], ["runtime:one", "runtime:two"], ["follow-up:one", "follow-up:two"], [record.sourceRetrospectiveId, "retrospective:two"], [record.sourceRetrospectiveIdentity, "fnv1a32:retrospective-two"]]));
  assert.equal(remapped.projectId, "project:two");
  assert.equal(remapped.sourceRetrospectiveId, "retrospective:two");
  assert.notEqual(remapped.identity, record.identity);
  const stale = api.makeImportedPatternExecutionLearningStale(remapped, { collision: true });
  assert.equal(stale.status, "stale");
  assert.equal(stale.importedDiagnostic.reason, "import_identity_unproven");
  assert.equal(api.validatePatternExecutionLearning(stale).valid, true);
});

test("corrupted learning is rejected safely for quarantine", () => {
  const safe = api.safeNormalizePatternExecutionLearning('{"kind":');
  assert.equal(safe.corrupted, true);
  assert.equal(safe.record, null);
});

test("repository exposes learning save load list and quarantine support", () => {
  const prototype = globalThis.YarnAIProjectSystem.ProjectRepository.prototype;
  for (const method of ["listPatternExecutionLearnings", "getPatternExecutionLearning", "savePatternExecutionLearning", "createPatternExecutionLearning", "readPatternExecutionLearning", "_quarantinePatternExecutionLearning"]) assert.equal(typeof prototype[method], "function", method);
});

test("IndexedDB remains version 4 with 16 canonical stores", () => {
  const system = globalThis.YarnAIProjectSystem;
  assert.equal(system.DB_VERSION, 4);
  assert.equal(system.STORE_NAMES.length, 16);
  assert.equal(new Set(system.STORE_NAMES).size, 16);
});

test("production contains no clock randomness debug output raw stack later stage or TODO markers", () => {
  const files = ["pattern-execution-learning.js", "pattern-execution-learning-assistant.js", "pattern-execution-learning.html", "pattern-execution-learning.css"];
  const production = files.map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n");
  for (const forbidden of [/Date\.now\s*\(/, /new Date\s*\(/, /Math\.random\s*\(/, /crypto\.randomUUID\s*\(/, /console\.(?:log|debug)\s*\(/, /\.stack\b/, /Stage 39/, /\bTODO\b/]) assert.doesNotMatch(production, forbidden);
});
