"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("fake-indexeddb/auto");

const api = require("../src/yarnai/static/pattern-execution-adaptation.js");
require("../src/yarnai/static/project-system.js");

const PROJECT = "project:one";
const CALCULATION = "calculation:one";
const NOW = "2026-08-01T10:00:00.000Z";

function source(overrides = {}) {
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

function draft(input = {}, value = source()) {
  return api.createPatternExecutionAdaptation(value, input);
}

function target(overrides = {}) {
  return { targetType: "checkpoint", targetReference: "pattern.checkpoints.section-end", rationale: "  Verify   the learned stability condition. ", sourceLearningReferences: ["lesson:one"], ...overrides };
}

function change(overrides = {}) {
  return { changeId: "change:one", targetType: "checkpoint", targetReference: "pattern.checkpoints.section-end", operation: "add", before: null, after: "Measure after each section", rationale: "Use the confirmed lesson.", sourceLessonReferences: ["lesson:one"], riskLevel: "low", reversible: true, ...overrides };
}

function constraints(overrides = {}) {
  return [{ constraintType: "project-identity", rationale: "Keep the source project identity.", protectedReferences: [], ...overrides }];
}

function plan(changeId = "change:one") {
  return {
    checks: [{ checkId: "check:one", description: "Run the changed checkpoint.", proposedChangeIds: [changeId] }],
    acceptanceCriteria: [{ criterionId: "accept:one", description: "The checkpoint detects drift.", proposedChangeIds: [changeId] }],
    rollbackCriteria: [{ criterionId: "rollback:one", description: "Restore when usability decreases.", proposedChangeIds: [changeId] }],
  };
}

function impact() {
  return Object.fromEntries(api.IMPACT_COMPONENTS.map((component) => [component, { direction: component === "usability" ? "unchanged" : "improve", rationale: `Explain ${component}.` }]));
}

function confidence(overrides = {}) {
  return { level: "high", rationale: "Completed evidence supports the proposal.", supportingReferences: ["lesson:one"], uncertaintyReferences: ["anti:one"], ...overrides };
}

function populated(value = source()) {
  let record = draft({}, value);
  record = api.setAdaptationTargets(record, [target()]);
  record = api.setProposedChanges(record, [change()]);
  record = api.setPreservedConstraints(record, constraints());
  record = api.setValidationPlan(record, plan());
  record = api.setExpectedImpact(record, impact());
  return api.setConfidenceAssessment(record, confidence());
}

function completed(value = source()) {
  const reviewing = api.startReview(populated(value), value);
  return api.completeAdaptation(reviewing, value, { now: NOW });
}

test("creates a deterministic draft without mutating the learning", () => {
  const value = source();
  const before = structuredClone(value.learning);
  const record = draft({}, value);
  assert.equal(record.status, "draft");
  assert.equal(record.kind, api.PROGRESS_KIND);
  assert.deepEqual(value.learning, before);
  assert.equal(JSON.stringify(record).includes("Stable tension"), false);
});

test("creation requires a completed latest learning", () => {
  const value = source(); value.learning.status = "reviewing"; value.learnings = [value.learning];
  assert.throws(() => draft({}, value), (error) => error.code === "completed_learning_required");
});

test("required content blocks completion", () => {
  const value = source(); const reviewing = api.startReview(draft({}, value), value);
  assert.throws(() => api.completeAdaptation(reviewing, value), (error) => error.code === "critical_integrity" && error.details.issues.some((entry) => entry.code === "adaptation_targets_required"));
});

test("lifecycle is draft reviewing draft and reviewing completed", () => {
  const value = source(); const first = api.startReview(populated(value), value);
  assert.equal(first.status, "reviewing");
  assert.equal(api.returnToDraft(first, value).status, "draft");
  assert.equal(api.completeAdaptation(first, value).status, "completed");
});

test("draft cannot complete directly", () => assert.throws(() => api.completeAdaptation(populated(), source()), (error) => error.code === "invalid_transition"));

test("completed is terminal and cannot be edited or completed twice", () => {
  const record = completed();
  assert.throws(() => api.returnToDraft(record, source()), (error) => error.code === "terminal_adaptation");
  assert.throws(() => api.setAdaptationTargets(record, [target()]), (error) => error.code === "terminal_adaptation");
  assert.throws(() => api.completeAdaptation(record, source()), (error) => error.code === "terminal_adaptation");
});

test("adaptation target type and fields are validated", () => {
  const value = source(); let record = populated(value); record = api.setAdaptationTargets(record, [target({ targetType: "pattern", rationale: "" })]);
  const reviewing = api.startReview(record, value);
  assert.throws(() => api.completeAdaptation(reviewing, value), (error) => error.details.issues.some((entry) => entry.code === "adaptation_target_invalid"));
});

test("proposed changes and operations are validated", () => {
  const value = source(); let record = populated(value); record = api.setProposedChanges(record, [change({ operation: "mutate" })]);
  record = api.setValidationPlan(record, plan());
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "proposed_change_invalid"));
});

test("before and after rules are operation-specific", () => {
  for (const invalidChange of [change({ before: "existing" }), change({ operation: "remove", before: "existing", after: "replacement" }), change({ operation: "replace", before: null, after: "replacement" })]) {
    const value = source(); let record = populated(value); record = api.setProposedChanges(record, [invalidChange]); record = api.setValidationPlan(record, plan());
    assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => ["before_invalid", "after_invalid"].includes(entry.code)));
  }
});

test("immutable identity and critical links cannot be proposed changes", () => {
  const value = source(); let record = populated(value); record = api.setProposedChanges(record, [change({ targetReference: "learning.identity", operation: "replace", before: "old", after: "new" })]); record = api.setValidationPlan(record, plan());
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "immutable_reference_change"));
});

test("preserved constraints are required and conflicts are rejected", () => {
  const value = source(); let record = populated(value); record = api.setPreservedConstraints(record, []);
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "preserved_constraints_required"));
  record = populated(value); record = api.setPreservedConstraints(record, constraints({ constraintType: "safety-constraints" })); record = api.setProposedChanges(record, [change({ targetType: "safety-constraint", operation: "remove", before: "Guard", after: null })]); record = api.setValidationPlan(record, plan());
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "preserved_constraint_conflict"));
});

test("validation plan must cover every proposed change", () => {
  const value = source(); let record = populated(value); record = api.setValidationPlan(record, { checks: [{ checkId: "check:one", description: "Check", proposedChangeIds: ["change:one"] }], acceptanceCriteria: [], rollbackCriteria: [] });
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "validation_plan_required"));
});

test("expected impact requires five explained components", () => {
  const value = source(); let record = populated(value); record = api.setExpectedImpact(record, { correctness: { direction: "improve", rationale: "Good" } });
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "expected_impact_invalid"));
});

test("confidence assessment is structured and high requires support", () => {
  const value = source(); let record = populated(value); record = api.setConfidenceAssessment(record, confidence({ supportingReferences: [] }));
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "confidence_assessment_invalid"));
});

test("project identity mismatch is critical", () => {
  const value = source(); value.runtime.projectId = "project:other";
  assert.ok(api.calculateIntegrity(value).issues.some((entry) => entry.code === "project_mismatch"));
});

test("calculation identity mismatch is critical", () => {
  const value = source(); value.learning.calculationId = "calculation:other";
  assert.ok(api.calculateIntegrity(value).issues.some((entry) => entry.code === "calculation_mismatch"));
});

test("result runtime mismatch is critical", () => {
  const value = source(); value.runtime.sourceResultId = "result:other";
  assert.ok(api.calculateIntegrity(value).issues.some((entry) => entry.code === "result_runtime_mismatch"));
});

test("only the latest completed follow-up is accepted", () => {
  const value = source(); value.followUps.push({ ...value.followUp, id: "follow-up:two", epoch: 2, revision: 1, completedAt: "2026-08-01T11:00:00.000Z" });
  assert.ok(api.calculateIntegrity(value).issues.some((entry) => entry.code === "older_follow_up_selected"));
});

test("retrospective and learning must be completed", () => {
  const retrospective = source(); retrospective.retrospective.status = "reviewing";
  assert.ok(api.calculateIntegrity(retrospective).issues.some((entry) => entry.code === "retrospective_not_completed"));
  const learning = source(); learning.learning.status = "reviewing";
  assert.ok(api.calculateIntegrity(learning).issues.some((entry) => entry.code === "learning_not_completed"));
});

test("only the latest completed learning is accepted with a stable tie-breaker", () => {
  const value = source(); value.learnings.push({ ...value.learning, id: "learning:two", identity: "fnv1a32:learning-two", epoch: 2 });
  assert.ok(api.calculateIntegrity(value).issues.some((entry) => entry.code === "older_learning_selected"));
  assert.equal(api.latestCompleted(value.learnings).id, "learning:two");
});

test("source identity and learning snapshot mismatches block completion", () => {
  const value = source(); let record = populated(value); const changed = structuredClone(record); changed.sourceIdentities.learning = "fnv1a32:other";
  assert.ok(api.calculateIntegrity(value, changed).issues.some((entry) => entry.code === "source_identity_mismatch"));
  const snapshotChanged = structuredClone(record); snapshotChanged.learningSnapshot.revision += 1;
  assert.ok(api.calculateIntegrity(value, snapshotChanged).issues.some((entry) => entry.code === "learning_snapshot_mismatch"));
});

test("broken critical references block completion", () => {
  const value = source(); const changed = structuredClone(populated(value)); changed.criticalReferences.pop();
  assert.ok(api.calculateIntegrity(value, changed).issues.some((entry) => entry.code === "broken_critical_reference"));
});

test("proposed changes must reference existing learning knowledge", () => {
  const value = source(); let record = populated(value); record = api.setProposedChanges(record, [change({ sourceLessonReferences: ["lesson:missing"] })]); record = api.setValidationPlan(record, plan());
  assert.throws(() => api.completeAdaptation(api.startReview(record, value), value), (error) => error.details.issues.some((entry) => entry.code === "learning_reference_missing"));
});

test("identity is deterministic and independent of object key order", () => {
  const first = source(); const reversed = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(draft({}, first).identity, draft({}, reversed).identity);
  assert.equal(draft().identity, draft().identity);
});

test("NFC and whitespace normalization are deterministic", () => {
  const composed = target({ rationale: "Caf\u00e9   check" }); const decomposed = target({ rationale: "Cafe\u0301 check" });
  assert.deepEqual(api.setAdaptationTargets(draft(), [composed]).adaptationTargets, api.setAdaptationTargets(draft(), [decomposed]).adaptationTargets);
});

test("non-semantic arrays sort while reorder remains semantic", () => {
  let first = draft(); first = api.setProposedChanges(first, [change({ changeId: "change:z" }), change({ changeId: "change:a", targetReference: "pattern.checkpoint.a" })]);
  let second = draft(); second = api.setProposedChanges(second, [change({ changeId: "change:a", targetReference: "pattern.checkpoint.a" }), change({ changeId: "change:z" })]);
  assert.deepEqual(first.proposedChanges, second.proposedChanges);
  const reorderA = api.setProposedChanges(draft(), [change({ changeId: "change:a", operation: "reorder", before: ["a", "b"], after: ["b", "a"] }), change({ changeId: "change:b" })]);
  const reorderB = api.setProposedChanges(draft(), [...reorderA.proposedChanges].reverse());
  assert.notEqual(reorderA.identity, reorderB.identity);
});

test("timestamp fallback is fixed and no source clock is consulted", () => {
  const value = source(); for (const item of [value.result, value.runtime, value.followUp, value.retrospective, value.learning]) { delete item.createdAt; delete item.updatedAt; delete item.completedAt; }
  assert.equal(draft({}, value).createdAt, api.DEFAULT_TIMESTAMP);
});

test("export import round trip and identical duplicate are deterministic", () => {
  const record = completed(); const serialized = api.serializePatternExecutionAdaptation(record);
  assert.deepEqual(api.deserializePatternExecutionAdaptation(serialized), record);
  assert.equal(api.importPatternExecutionAdaptation([record], serialized).status, "duplicate");
});

test("identity collision never silently overwrites", () => {
  const record = completed(); const colliding = structuredClone(record); colliding.updatedAt = "2026-08-01T12:00:00.000Z";
  assert.equal(api.importPatternExecutionAdaptation([record], api.canonicalize(colliding)).status, "collision");
});

test("identity remap updates every source reference", () => {
  const record = populated();
  const map = new Map([[PROJECT, "project:two"], [CALCULATION, "calculation:two"], [record.resultId, "result:two"], [record.runtimeId, "runtime:two"], [record.followUpId, "follow-up:two"], [record.retrospectiveId, "retrospective:two"], [record.learningId, "learning:two"], [record.sourceIdentities.learning, "fnv1a32:learning-two"]]);
  const remapped = api.remapPatternExecutionAdaptation(record, map);
  assert.equal(remapped.projectId, "project:two"); assert.equal(remapped.calculationId, "calculation:two"); assert.equal(remapped.learningId, "learning:two");
  assert.equal(remapped.learningSnapshot.id, "learning:two"); assert.equal(remapped.learningSnapshot.identity, "fnv1a32:learning-two");
  assert.notEqual(remapped.identity, record.identity);
});

test("imported-unproven adaptation becomes stale", () => {
  const stale = api.makeImportedPatternExecutionAdaptationStale(populated(), { collision: true });
  assert.equal(stale.status, "stale"); assert.equal(stale.importedDiagnostic.reason, "import_identity_unproven");
  assert.equal(api.validatePatternExecutionAdaptation(stale).valid, true);
});

test("corrupted import is rejected safely for quarantine", () => {
  const safe = api.safeNormalizePatternExecutionAdaptation('{"kind":');
  assert.equal(safe.corrupted, true); assert.equal(safe.record, null);
});

test("repository exposes adaptation persistence and quarantine", () => {
  const prototype = globalThis.YarnAIProjectSystem.ProjectRepository.prototype;
  for (const method of ["listPatternExecutionAdaptations", "getPatternExecutionAdaptation", "savePatternExecutionAdaptation", "createPatternExecutionAdaptation", "readPatternExecutionAdaptation", "_quarantinePatternExecutionAdaptation"]) assert.equal(typeof prototype[method], "function", method);
});

test("repository stores adaptation in progress and quarantines a corrupted record", async () => {
  const system = globalThis.YarnAIProjectSystem;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve; request.onerror = () => reject(request.error);
  });
  const repository = new system.ProjectRepository();
  try {
    const project = await repository.createProject({ title: "Adaptation repository" });
    const saved = await repository.addCalculation(project.project_id, { axes: ["width"] }, { status: "READY", normalized_inputs: {}, axes: {}, warnings: [], errors: [], clarifications: [] });
    const value = source();
    value.project = saved.project; value.projectId = saved.project.project_id;
    value.calculation = saved.calculation; value.calculationId = saved.calculation.calculation_id;
    for (const record of [value.result, value.runtime, value.followUp, value.retrospective, value.learning]) {
      record.projectId = value.projectId; record.calculationId = value.calculationId;
    }
    value.result.sourceCalculationId = value.calculationId;
    value.runtime.sourceResultId = value.result.id;
    value.retrospective.sourceResultId = value.result.id; value.retrospective.sourceRuntimeId = value.runtime.id; value.retrospective.sourceFollowUpId = value.followUp.id;
    value.learning.sourceResultId = value.result.id; value.learning.sourceRuntimeId = value.runtime.id; value.learning.sourceFollowUpId = value.followUp.id; value.learning.sourceRetrospectiveId = value.retrospective.id; value.learning.sourceRetrospectiveIdentity = value.retrospective.identity;
    repository.getPatternExecutionResult = async () => ({ state: value.result });
    repository.getPatternExecutionRuntime = async () => ({ state: value.runtime });
    repository.listPatternExecutionFollowUps = async () => [{ state: value.followUp }];
    repository.listPatternExecutionRetrospectives = async () => [{ state: value.retrospective }];
    repository.listPatternExecutionLearnings = async () => [{ state: value.learning }];
    const record = api.createPatternExecutionAdaptation(value);
    const stored = await repository.savePatternExecutionAdaptation(value.projectId, record, { timestamp: record.updatedAt });
    assert.equal(stored.kind, api.PROGRESS_KIND);
    assert.equal((await repository.listPatternExecutionAdaptations(value.projectId, value.calculationId)).length, 1);
    const reopened = await repository.readPatternExecutionAdaptation(value.projectId, record.id);
    assert.equal(reopened.stale, false);
    assert.equal(reopened.rawAdaptation.id, record.id);
    const exported = await repository.exportProject(value.projectId);
    const exportedAdaptation = exported.envelope.payload.progress.find((entry) => entry.kind === api.PROGRESS_KIND);
    assert.equal(exportedAdaptation.state.id, record.id);
    assert.equal(exportedAdaptation.state.learningSnapshot.identity, record.learningSnapshot.identity);
    const database = await repository._database();
    const read = database.transaction("progress", "readonly");
    const damaged = await new Promise((resolve, reject) => {
      const request = read.objectStore("progress").get(stored.progress_id);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    damaged.state.identity = "fnv1a32:damaged";
    const write = database.transaction("progress", "readwrite");
    write.objectStore("progress").put(damaged);
    await new Promise((resolve, reject) => { write.oncomplete = resolve; write.onabort = () => reject(write.error); });
    assert.equal((await repository.listPatternExecutionAdaptations(value.projectId, value.calculationId)).length, 0);
    const quarantineRead = database.transaction("quarantine", "readonly");
    const quarantine = await new Promise((resolve, reject) => {
      const request = quarantineRead.objectStore("quarantine").getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    assert.ok(quarantine.some((entry) => entry.source_key === stored.progress_id && entry.reason_code === "INVALID_IMPORT_EXECUTION_ADAPTATION"));
  } finally {
    await repository.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(system.DB_NAME);
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
  }
});

test("IndexedDB remains version 4 with 16 unique stores", () => {
  const system = globalThis.YarnAIProjectSystem;
  assert.equal(system.DB_VERSION, 4); assert.equal(system.STORE_NAMES.length, 16); assert.equal(new Set(system.STORE_NAMES).size, 16);
});

test("production contains no forbidden clock randomness debug stack placeholder or later stage", () => {
  const files = ["pattern-execution-adaptation.js", "pattern-execution-adaptation-assistant.js", "pattern-execution-adaptation.html", "pattern-execution-adaptation.css"];
  const existing = files.filter((name) => fs.existsSync(path.join(__dirname, "../src/yarnai/static", name)));
  const production = existing.map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n");
  for (const forbidden of [/Date\.now\s*\(/, /new Date\s*\(/, /Math\.random\s*\(/, /crypto\.randomUUID\s*\(/, /console\.(?:log|debug)\s*\(/, /\.stack\b/, /\bTODO\b/, /Stage 40/, /PATTERN_EXECUTION_STAGE_40/]) assert.doesNotMatch(production, forbidden);
});
