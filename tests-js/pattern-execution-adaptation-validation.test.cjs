"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("fake-indexeddb/auto");

const adaptationApi = require("../src/yarnai/static/pattern-execution-adaptation.js");
const api = require("../src/yarnai/static/pattern-execution-adaptation-validation.js");
require("../src/yarnai/static/project-system.js");

const PROJECT = "project:one";
const CALCULATION = "calculation:one";
const NOW = "2026-08-01T10:00:00.000Z";
const LATER = "2026-08-01T11:00:00.000Z";

function baseSource(overrides = {}) {
  const project = { project_id: PROJECT, materialized_checksum: "fnv1a32:project", workspace_status: "ACTIVE" };
  const calculation = { calculation_id: CALCULATION, project_id: PROJECT, fingerprint: "fnv1a32:calculation" };
  const result = { kind: "PATTERN_EXECUTION_RESULT", id: "result:one", projectId: PROJECT, sourceCalculationId: CALCULATION, status: "ready", revision: 2, resultFingerprint: "fnv1a32:result", updatedAt: NOW };
  const runtime = { kind: "PATTERN_EXECUTION_RUNTIME", id: "runtime:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 3, epoch: 1, runtimeFingerprint: "fnv1a32:runtime", sourceResultId: result.id, sourceResultFingerprint: result.resultFingerprint, updatedAt: NOW };
  const followUp = { kind: "PATTERN_EXECUTION_FOLLOW_UP", id: "follow-up:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 4, epoch: 1, identity: "fnv1a32:follow-up", completedAt: NOW, updatedAt: NOW };
  const retrospective = { kind: "PATTERN_EXECUTION_RETROSPECTIVE", id: "retrospective:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 4, epoch: 1, identity: "fnv1a32:retrospective", sourceResultId: result.id, sourceRuntimeId: runtime.id, sourceFollowUpId: followUp.id, completedAt: NOW, updatedAt: NOW };
  const learning = {
    kind: "PATTERN_EXECUTION_LEARNING", id: "learning:one", projectId: PROJECT, calculationId: CALCULATION, status: "completed", revision: 5, epoch: 1, identity: "fnv1a32:learning",
    sourceResultId: result.id, sourceRuntimeId: runtime.id, sourceFollowUpId: followUp.id, sourceRetrospectiveId: retrospective.id, sourceRetrospectiveIdentity: retrospective.identity,
    lessonsLearned: [{ id: "lesson:one", title: "Stable tension", description: "The checkpoint prevented drift.", supportingFacts: ["fact:one"], confidence: "high", order: 1 }],
    successfulPatterns: [{ id: "success:one", pattern: "Check every section", rationale: "It caught errors early.", supportingFacts: ["fact:one"], confidence: "high", order: 1 }],
    antiPatterns: [{ id: "anti:one", pattern: "Skip measurement", reason: "It hides drift.", possibleMitigation: "Add checkpoint.", supportingFacts: ["fact:one"], confidence: "high", order: 1 }],
    recommendations: [{ id: "recommendation:one", title: "Add checkpoint", priority: "high", rationale: "Detect drift.", expectedBenefit: "Higher correctness.", supportingLessonIds: ["lesson:one"], order: 1 }],
    completedAt: NOW, updatedAt: NOW,
  };
  return { project, projectId: PROJECT, calculation, calculationId: CALCULATION, result, runtime, followUp, followUps: [followUp], retrospective, retrospectives: [retrospective], learning, learnings: [learning], ...structuredClone(overrides) };
}

function makeAdaptation(source) {
  let record = adaptationApi.createPatternExecutionAdaptation(source);
  record = adaptationApi.setAdaptationTargets(record, [{ targetType: "checkpoint", targetReference: "pattern.checkpoints.section-end", rationale: "Verify the learned stability condition.", sourceLearningReferences: ["lesson:one"] }]);
  record = adaptationApi.setProposedChanges(record, [{ changeId: "change:one", targetType: "checkpoint", targetReference: "pattern.checkpoints.section-end", operation: "add", before: null, after: "Measure after each section", rationale: "Use the confirmed lesson.", sourceLessonReferences: ["lesson:one"], riskLevel: "low", reversible: true }]);
  record = adaptationApi.setPreservedConstraints(record, [{ constraintType: "project-identity", rationale: "Keep project identity.", protectedReferences: ["project.id"] }]);
  record = adaptationApi.setValidationPlan(record, {
    checks: [{ checkId: "check:one", description: "Run the changed checkpoint.", proposedChangeIds: ["change:one"] }],
    acceptanceCriteria: [{ criterionId: "accept:one", description: "The checkpoint detects drift.", proposedChangeIds: ["change:one"] }],
    rollbackCriteria: [{ criterionId: "rollback:one", description: "Restore on regression.", proposedChangeIds: ["change:one"] }],
  });
  record = adaptationApi.setExpectedImpact(record, Object.fromEntries(adaptationApi.IMPACT_COMPONENTS.map((component) => [component, { direction: component === "usability" ? "unchanged" : "improve", rationale: `Explain ${component}.` }])));
  record = adaptationApi.setConfidenceAssessment(record, { level: "high", rationale: "Completed learning supports the proposal.", supportingReferences: ["lesson:one"], uncertaintyReferences: ["anti:one"] });
  return adaptationApi.completeAdaptation(adaptationApi.startReview(record, source), source, { now: NOW });
}

function source(overrides = {}) {
  const value = baseSource();
  const adaptation = makeAdaptation(value);
  return { ...value, adaptation, adaptations: [adaptation], ...structuredClone(overrides) };
}

function evidence(id = "evidence:one") { return { evidenceId: id, sourceType: "fixture", sourceId: `fixture:${id}` }; }
function executed(planItemId, overrides = {}) {
  return { validationId: `validation:${planItemId}`, planItemId, validationType: "fixture", targetReference: "pattern.checkpoints.section-end", method: "fixture-based", inputs: { fixture: "stable" }, expectedOutcome: { driftDetected: true }, actualOutcome: { driftDetected: true }, evidenceReferences: [evidence(`evidence:${planItemId}`)], constraintReferences: [], startedAt: NOW, completedAt: LATER, status: "passed", issues: [], ...overrides };
}
function regression(overrides = {}) { return { regressionId: "regression:one", area: "checkpoint sequencing", baselineReference: evidence("baseline:one"), candidateReference: evidence("candidate:one"), method: "fixture-based", expectedInvariant: { terminalRecordsUnchanged: true }, observedResult: { terminalRecordsUnchanged: true }, evidenceReferences: [evidence("evidence:regression")], status: "passed", issues: [], ...overrides }; }
function impactResults(record, overrides = {}) { return api.expectedImpactDefinitions(record.adaptationSnapshot).map((entry) => ({ impactId: entry.impactId, metricOrOutcome: entry.metricOrOutcome, baseline: { value: "baseline" }, expected: entry.expected, observed: { value: "confirmed" }, comparisonMethod: "fixture-based", evidenceReferences: [evidence(`evidence:${entry.impactId}`)], status: "passed", limitations: [], ...overrides })); }

function running(value = source()) { return api.startValidation(api.createPatternExecutionAdaptationValidation(value), value, { now: NOW }); }
function populated(value = source()) {
  let record = running(value);
  record = api.setExecutedValidations(record, record.declaredValidationPlan.map((entry) => executed(entry.planItemId)));
  record = api.setConstraintResults(record, api.constraintDefinitions(record.adaptationSnapshot).map((entry) => ({ constraintId: entry.constraintId, sourceReference: entry.sourceReference, validationStatus: "passed", evidenceReferences: [evidence(`evidence:${entry.constraintId}`)], observedImpact: { preserved: true }, issues: [] })));
  record = api.setRegressionResults(record, [regression()]);
  record = api.setExpectedImpactResults(record, impactResults(record));
  record = api.setEvidenceSummary(record, [{ evidenceSummaryId: "evidence-summary:one", finding: "Fixture and rule checks confirm the proposal.", evidenceReferences: [evidence()], limitations: [] }]);
  return api.setConfidenceAssessment(record, { level: "high", rationale: "All required checks have direct evidence.", evidenceReferences: [evidence()], limitations: [] });
}
function completed(value = source()) { const record = populated(value); return api.completeValidation(api.startReview(record, value, { now: LATER }), value, { now: LATER }); }

test("creates a deterministic draft with the full immutable chain", () => {
  const value = source(); const before = structuredClone(value);
  const record = api.createPatternExecutionAdaptationValidation(value);
  assert.equal(record.status, "draft"); assert.equal(record.kind, api.PROGRESS_KIND); assert.equal(record.id, record.adaptationValidationId);
  for (const field of ["projectId", "calculationId", "resultId", "runtimeId", "followUpId", "retrospectiveId", "learningId", "adaptationId", "adaptationIdentity", "scope", "sourceIdentities", "criticalReferences", "adaptationSnapshot", "declaredValidationPlan", "validationCoverage"]) assert.notEqual(record[field], undefined, field);
  assert.deepEqual(value, before);
});

test("requires a completed latest adaptation", () => {
  const value = source(); value.adaptation = { ...value.adaptation, status: "reviewing" }; value.adaptations = [value.adaptation];
  assert.throws(() => api.createPatternExecutionAdaptationValidation(value), (error) => error.code === "completed_adaptation_required");
  const older = source(); older.adaptations.push({ ...older.adaptation, id: "adaptation:new", identity: "fnv1a32:new", epoch: 2, revision: 1, completedAt: LATER });
  assert.throws(() => api.createPatternExecutionAdaptationValidation(older), (error) => error.code === "critical_integrity" && error.details.issues.some((entry) => entry.code === "older_adaptation_selected"));
});

test("lifecycle allows only draft-running-reviewing-completed and documented returns", () => {
  const value = source(); const draft = api.createPatternExecutionAdaptationValidation(value);
  assert.throws(() => api.completeValidation(draft, value), (error) => error.code === "invalid_transition");
  const active = api.startValidation(draft, value); assert.equal(active.status, "running");
  assert.equal(api.returnToDraft(active, value).status, "draft");
  const ready = populated(value); const reviewing = api.startReview(ready, value); assert.equal(reviewing.status, "reviewing");
  assert.equal(api.returnToRunning(reviewing, value).status, "running");
  assert.equal(api.returnToDraft(reviewing, value).status, "draft");
  assert.equal(api.completeValidation(reviewing, value).status, "completed");
});

test("review requires terminal coverage and completion requires all structured result groups", () => {
  const value = source(); const empty = running(value);
  assert.throws(() => api.startReview(empty, value), (error) => error.code === "minimum_validations_incomplete");
  let checks = api.setExecutedValidations(empty, empty.declaredValidationPlan.filter((entry) => entry.required).map((entry) => executed(entry.planItemId)));
  const reviewing = api.startReview(checks, value);
  assert.throws(() => api.completeValidation(reviewing, value), (error) => error.code === "completion_invalid");
});

test("coverage is exact integer/rational data and rejects duplicate, unknown, pending and running items", () => {
  const record = running(); const required = record.declaredValidationPlan.filter((entry) => entry.required);
  const coverage = api.calculateValidationCoverage(record.declaredValidationPlan, [executed(required[0].planItemId)]);
  assert.equal(coverage.totalRequired, 2); assert.equal(coverage.executedRequired, 1); assert.equal(coverage.coverageBasisPoints, 5000); assert.equal(coverage.coverageRatio, "1/2");
  assert.ok(coverage.uncoveredPlanItemIds.includes(required[1].planItemId));
  assert.throws(() => api.setExecutedValidations(record, [executed("unknown")]), (error) => error.code === "corrupted_input" && error.details.errors.some((entry) => entry.code === "unknown_plan_item_id"));
  assert.throws(() => api.setExecutedValidations(record, [executed(required[0].planItemId), executed(required[0].planItemId, { validationId: "validation:duplicate" })]), (error) => error.details.errors.some((entry) => entry.code === "duplicate_plan_item_id"));
  let pending = api.setExecutedValidations(record, required.map((entry, index) => executed(entry.planItemId, index ? { status: "running", completedAt: null } : { status: "pending", startedAt: null, completedAt: null, evidenceReferences: [] })));
  assert.throws(() => api.startReview(pending, source()), (error) => error.code === "minimum_validations_incomplete");
});

test("skipped, blocked and failed require structured reasons and determine verdict", () => {
  for (const [status, verdict] of [["skipped", "blocked"], ["blocked", "blocked"], ["failed", "failed"]]) {
    const value = source(); let record = populated(value);
    const first = record.executedValidations[0];
    record = api.upsertExecutedValidation(record, { ...first, status, evidenceReferences: [], issues: [{ code: `${status}_reason`, severity: status === "failed" ? "critical" : "warning", reason: "Structured reason", critical: status === "failed" }] });
    const result = api.completeValidation(api.startReview(record, value), value);
    assert.equal(result.finalVerdict, verdict);
  }
  assert.throws(() => api.upsertExecutedValidation(running(), executed("check:one", { status: "skipped", evidenceReferences: [], issues: [] })), (error) => error.details.errors.some((entry) => entry.code === "validation_reason_required"));
});

test("preserved constraints are source-bound and violations cannot pass", () => {
  const value = source(); let record = populated(value); const item = record.constraintResults[0];
  assert.throws(() => api.setConstraintResults(record, [{ ...item, sourceReference: "wrong.source" }]), (error) => error.details.errors.some((entry) => entry.code === "constraint_source_mismatch"));
  record = api.setConstraintResults(record, [{ ...item, validationStatus: "failed", issues: [{ code: "constraint_broken", severity: "critical", reason: "Identity changed", critical: true }] }]);
  const finished = api.completeValidation(api.startReview(record, value), value);
  assert.equal(finished.finalVerdict, "failed");
});

test("regression and expected-impact evidence are required for pass", () => {
  const value = source(); let record = populated(value);
  record = api.setRegressionResults(record, [regression({ evidenceReferences: [] })]);
  assert.throws(() => api.completeValidation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "regression_pass_unproven"));
  record = populated(value); const impacts = impactResults(record); impacts[0] = { ...impacts[0], status: "not-yet-observable", evidenceReferences: [], limitations: [{ code: "requires_execution", reason: "Requires a later execution.", severity: "warning" }] };
  record = api.setExpectedImpactResults(record, impacts);
  const partial = api.completeValidation(api.startReview(record, value), value);
  assert.equal(partial.finalVerdict, "partial");
});

test("a manually supplied incompatible verdict is rejected", () => {
  const value = source(); const reviewing = api.startReview(populated(value), value);
  assert.throws(() => api.completeValidation(reviewing, value, { finalVerdict: "failed" }), (error) => error.code === "verdict_mismatch" && error.details.expected === "pass");
});

test("completed validation is deeply immutable and terminal", () => {
  const value = source(); const before = structuredClone(value); const record = completed(value);
  assert.equal(record.finalVerdict, "pass"); assert.ok(Object.isFrozen(record)); assert.ok(Object.isFrozen(record.executedValidations[0].evidenceReferences[0]));
  assert.deepEqual(value, before);
  assert.throws(() => api.setEvidenceSummary(record, []), (error) => error.code === "terminal_validation");
  assert.throws(() => api.startValidation(record, value), (error) => error.code === "terminal_validation");
  assert.throws(() => api.completeValidation(record, value), (error) => error.code === "terminal_validation");
});

test("identity canonicalizes key order, NFC, whitespace and non-semantic arrays while preserving validation execution order", () => {
  const value = source(); const first = api.createPatternExecutionAdaptationValidation(value); const reversed = Object.fromEntries(Object.entries(value).reverse());
  assert.equal(first.identity, api.createPatternExecutionAdaptationValidation(reversed).identity);
  let a = running(value); let b = running(value);
  a = api.setExecutedValidations(a, [executed("check:one", { actualOutcome: { note: "Caf\u00e9   stable" }, evidenceReferences: [evidence("evidence:z"), evidence("evidence:a")] }), executed("accept:one")]);
  b = api.setExecutedValidations(b, [executed("check:one", { actualOutcome: { note: "Cafe\u0301 stable" }, evidenceReferences: [evidence("evidence:a"), evidence("evidence:z")] }), executed("accept:one")]);
  assert.equal(a.identity, b.identity);
  const reordered = api.setExecutedValidations(running(value), [...b.executedValidations].reverse());
  assert.notEqual(b.identity, reordered.identity);
});

test("fallback timestamp is fixed and does not consult a clock", () => {
  const value = structuredClone(source()); value.adaptation.updatedAt = api.DEFAULT_TIMESTAMP; value.adaptation.completedAt = api.DEFAULT_TIMESTAMP;
  assert.equal(api.createPatternExecutionAdaptationValidation(value).createdAt, api.DEFAULT_TIMESTAMP);
});

test("wrong adaptation, non-completed adaptation, stale snapshots and source identities block completion", () => {
  const value = source(); const record = populated(value);
  const reviewing = api.startReview(record, value);
  const changed = structuredClone(value); changed.adaptation = { ...changed.adaptation, revision: changed.adaptation.revision + 1 }; changed.adaptations = [changed.adaptation];
  assert.throws(() => api.completeValidation(reviewing, changed), (error) => error.code === "critical_integrity" && error.details.issues.some((entry) => entry.code === "adaptation_snapshot_mismatch"));
  const wrong = structuredClone(value); wrong.adaptation = { ...wrong.adaptation, id: "adaptation:wrong" }; wrong.adaptations = [wrong.adaptation];
  assert.ok(api.calculateIntegrity(wrong, record).issues.some((entry) => entry.code === "wrong_adaptation"));
  const uncompleted = structuredClone(value); uncompleted.adaptation.status = "reviewing"; uncompleted.adaptations = [uncompleted.adaptation];
  assert.ok(api.calculateIntegrity(uncompleted, record).issues.some((entry) => entry.code === "adaptation_not_completed"));
  const identity = structuredClone(record); identity.sourceIdentities.learning = "fnv1a32:wrong";
  assert.ok(api.calculateIntegrity(value, identity).issues.some((entry) => entry.code === "source_identity_mismatch"));
});

test("canonical export/import, duplicate, collision, remap and imported-unproven semantics are deterministic", () => {
  const record = completed(); const serialized = api.serializePatternExecutionAdaptationValidation(record);
  assert.deepEqual(api.deserializePatternExecutionAdaptationValidation(serialized), record);
  assert.equal(api.importPatternExecutionAdaptationValidation([record], serialized).status, "duplicate");
  const collision = structuredClone(record); collision.createdAt = LATER;
  assert.equal(api.importPatternExecutionAdaptationValidation([record], api.canonicalize(collision)).status, "collision");
  const map = new Map([[PROJECT, "project:two"], [CALCULATION, "calculation:two"], [record.resultId, "result:two"], [record.runtimeId, "runtime:two"], [record.followUpId, "follow-up:two"], [record.retrospectiveId, "retrospective:two"], [record.learningId, "learning:two"], [record.adaptationId, "adaptation:two"], [record.adaptationIdentity, "fnv1a32:adaptation-two"]]);
  const remapped = api.remapPatternExecutionAdaptationValidation(record, map);
  assert.equal(remapped.projectId, "project:two"); assert.equal(remapped.calculationId, "calculation:two"); assert.equal(remapped.adaptationId, "adaptation:two"); assert.equal(remapped.adaptationSnapshot.adaptationId, "adaptation:two"); assert.equal(remapped.sourceIdentities.adaptation, "fnv1a32:adaptation-two"); assert.notEqual(remapped.id, record.id);
  const stale = api.makeImportedPatternExecutionAdaptationValidationStale(remapped, { collision: true });
  assert.equal(stale.status, "completed"); assert.equal(stale.stale, true); assert.equal(stale.importedDiagnostic.reason, "import_identity_unproven");
  assert.throws(() => api.startValidation(api.makeImportedPatternExecutionAdaptationValidationStale(api.createPatternExecutionAdaptationValidation(source())), source()), (error) => error.code === "stale_validation");
});

test("corruption is safe for quarantine and repository exposes the Stage 40 API", () => {
  assert.equal(api.safeNormalizePatternExecutionAdaptationValidation('{"kind":').corrupted, true);
  const prototype = globalThis.YarnAIProjectSystem.ProjectRepository.prototype;
  for (const method of ["listPatternExecutionAdaptationValidations", "getPatternExecutionAdaptationValidation", "savePatternExecutionAdaptationValidation", "createPatternExecutionAdaptationValidation", "readPatternExecutionAdaptationValidation", "_quarantinePatternExecutionAdaptationValidation"]) assert.equal(typeof prototype[method], "function", method);
});

test("repository stores, lists, reads, exports and quarantines validation in progress", async () => {
  const system = globalThis.YarnAIProjectSystem;
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  const repository = new system.ProjectRepository();
  try {
    const project = await repository.createProject({ title: "Validation repository" });
    const saved = await repository.addCalculation(project.project_id, { axes: ["width"] }, { status: "READY", normalized_inputs: {}, axes: {}, warnings: [], errors: [], clarifications: [] });
    const value = baseSource(); value.project = saved.project; value.projectId = saved.project.project_id; value.calculation = saved.calculation; value.calculationId = saved.calculation.calculation_id;
    for (const record of [value.result, value.runtime, value.followUp, value.retrospective, value.learning]) { record.projectId = value.projectId; record.calculationId = value.calculationId; }
    value.result.sourceCalculationId = value.calculationId; value.runtime.sourceResultId = value.result.id;
    value.retrospective.sourceResultId = value.result.id; value.retrospective.sourceRuntimeId = value.runtime.id; value.retrospective.sourceFollowUpId = value.followUp.id;
    value.learning.sourceResultId = value.result.id; value.learning.sourceRuntimeId = value.runtime.id; value.learning.sourceFollowUpId = value.followUp.id; value.learning.sourceRetrospectiveId = value.retrospective.id; value.learning.sourceRetrospectiveIdentity = value.retrospective.identity;
    repository.getPatternExecutionResult = async () => ({ state: value.result }); repository.getPatternExecutionRuntime = async () => ({ state: value.runtime });
    repository.listPatternExecutionFollowUps = async () => [{ state: value.followUp }]; repository.listPatternExecutionRetrospectives = async () => [{ state: value.retrospective }]; repository.listPatternExecutionLearnings = async () => [{ state: value.learning }];
    value.adaptation = makeAdaptation(value); value.adaptations = [value.adaptation];
    const savedAdaptation = await repository.savePatternExecutionAdaptation(value.projectId, value.adaptation, { timestamp: value.adaptation.updatedAt });
    repository.listPatternExecutionAdaptations = async () => [{ ...savedAdaptation, state: value.adaptation }];
    const record = api.createPatternExecutionAdaptationValidation(value);
    const stored = await repository.savePatternExecutionAdaptationValidation(value.projectId, record, { timestamp: record.updatedAt });
    assert.equal(stored.kind, api.PROGRESS_KIND); assert.equal((await repository.listPatternExecutionAdaptationValidations(value.projectId, value.calculationId)).length, 1);
    const reopened = await repository.readPatternExecutionAdaptationValidation(value.projectId, record.id, record.adaptationId);
    assert.equal(reopened.stale, false); assert.equal(reopened.rawValidation.id, record.id);
    const exported = await repository.exportProject(value.projectId); const exportedRecord = exported.envelope.payload.progress.find((entry) => entry.kind === api.PROGRESS_KIND);
    assert.equal(exportedRecord.state.adaptationSnapshot.identity, record.adaptationSnapshot.identity);
    const database = await repository._database(); const read = database.transaction("progress", "readonly");
    const damaged = await new Promise((resolve, reject) => { const request = read.objectStore("progress").get(stored.progress_id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    damaged.state.identity = "fnv1a32:damaged"; const write = database.transaction("progress", "readwrite"); write.objectStore("progress").put(damaged); await new Promise((resolve, reject) => { write.oncomplete = resolve; write.onabort = () => reject(write.error); });
    assert.equal((await repository.listPatternExecutionAdaptationValidations(value.projectId, value.calculationId)).length, 0);
    const quarantineRead = database.transaction("quarantine", "readonly"); const quarantine = await new Promise((resolve, reject) => { const request = quarantineRead.objectStore("quarantine").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    assert.ok(quarantine.some((entry) => entry.source_key === stored.progress_id && entry.reason_code === "INVALID_IMPORT_EXECUTION_ADAPTATION_VALIDATION"));
  } finally {
    await repository.close(); await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  }
});

test("IndexedDB remains v4 with 16 unique stores and one production createObjectStore call", () => {
  const system = globalThis.YarnAIProjectSystem; assert.equal(system.DB_VERSION, 4); assert.equal(system.STORE_NAMES.length, 16); assert.equal(new Set(system.STORE_NAMES).size, 16);
  const staticRoot = path.join(__dirname, "../src/yarnai/static"); const calls = fs.readdirSync(staticRoot).filter((name) => name.endsWith(".js") && !name.includes(".test.")).flatMap((name) => [...fs.readFileSync(path.join(staticRoot, name), "utf8").matchAll(/createObjectStore\s*\(/g)]);
  assert.equal(calls.length, 1);
});

test("Stage 40 production has no forbidden nondeterminism, free summary, debug output or later stage", () => {
  const files = ["pattern-execution-adaptation-validation.js", "pattern-execution-adaptation-validation-assistant.js", "pattern-execution-adaptation-validation.html", "pattern-execution-adaptation-validation.css"];
  const production = files.filter((name) => fs.existsSync(path.join(__dirname, "../src/yarnai/static", name))).map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n");
  for (const forbidden of [/Date\.now\s*\(/, /new Date\s*\(/, /Math\.random\s*\(/, /crypto\.randomUUID\s*\(/, /console\.(?:log|debug)\s*\(/, /\.stack\b/, /\bTODO\b/, /Stage 41/, /PATTERN_EXECUTION_STAGE_41/, /["']summary["']\s*:/i]) assert.doesNotMatch(production, forbidden);
});
