"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("fake-indexeddb/auto");

require("../src/yarnai/static/pattern-execution-adaptation.js");
require("../src/yarnai/static/pattern-execution-adaptation-validation.js");
const api = require("../src/yarnai/static/pattern-execution-adaptation-promotion.js");
require("../src/yarnai/static/project-system.js");

const PROJECT = "project:one";
const CALCULATION = "calculation:one";
const EXECUTION = "runtime:one";
const NOW = "2026-08-01T10:00:00.000Z";
const LATER = "2026-08-01T11:00:00.000Z";

function evidence(id) { return { evidenceId: id, sourceType: "fixture", sourceId: `fixture:${id}` }; }
function baseSource(overrides = {}) {
  const adaptation = {
    id: "adaptation:one", kind: "PATTERN_EXECUTION_ADAPTATION", type: "PATTERN_EXECUTION_ADAPTATION", projectId: PROJECT, calculationId: CALCULATION, runtimeId: EXECUTION,
    resultId: "result:one", followUpId: "follow-up:one", retrospectiveId: "retrospective:one", learningId: "learning:one", status: "completed", revision: 7, epoch: 1,
    identity: "fnv1a32:adaptation", completedAt: NOW, updatedAt: NOW, adaptationTargets: [{ targetReference: "pattern.checkpoint" }], proposedChanges: [{ targetReference: "pattern.checkpoint" }],
    preservedConstraints: [{ constraintType: "project-identity", protectedReferences: ["project.id"] }],
    validationPlan: { checks: [{ checkId: "check:one" }], acceptanceCriteria: [{ criterionId: "accept:one" }], rollbackCriteria: [{ criterionId: "rollback:one" }] },
    expectedImpact: { correctness: { direction: "improve" } }, confidenceAssessment: {}, criticalReferences: [], sourceIdentities: {},
  };
  const adaptationSnapshot = globalThis.YarnAIPatternExecutionAdaptationValidation.adaptationSnapshot(adaptation);
  const validation = {
    id: "adaptation-validation:one", adaptationValidationId: "adaptation-validation:one", kind: "PATTERN_EXECUTION_ADAPTATION_VALIDATION", type: "PATTERN_EXECUTION_ADAPTATION_VALIDATION",
    projectId: PROJECT, calculationId: CALCULATION, runtimeId: EXECUTION, adaptationId: adaptation.id, adaptationIdentity: adaptation.identity, adaptationSnapshot,
    status: "completed", revision: 9, epoch: 1, identity: "fnv1a32:validation", completedAt: LATER, updatedAt: LATER, finalVerdict: "pass", verdictReasons: [], stale: false, quarantined: false, importedDiagnostic: null,
    declaredValidationPlan: [
      { planItemId: "accept:one", category: "acceptance", required: true, requiresEvidence: true },
      { planItemId: "check:one", category: "check", required: true, requiresEvidence: true },
      { planItemId: "rollback:one", category: "rollback", required: false, requiresEvidence: false },
    ],
    executedValidations: [{ planItemId: "check:one", status: "passed" }, { planItemId: "accept:one", status: "passed" }],
    validationCoverage: { totalRequired: 2, executedRequired: 2 },
    constraintResults: [{ constraintId: "constraint:one", validationStatus: "passed", issues: [], evidenceReferences: [evidence("constraint")], sourceReference: "project.id" }],
    regressionResults: [{ regressionId: "regression:one", area: "execution", status: "passed", issues: [], evidenceReferences: [evidence("regression")] }],
    expectedImpactResults: [{ impactId: "impact:correctness", status: "passed", evidenceReferences: [evidence("impact")], limitations: [] }], unresolvedItems: [],
  };
  const source = { project: { project_id: PROJECT }, projectId: PROJECT, calculation: { calculation_id: CALCULATION }, calculationId: CALCULATION, adaptation, adaptations: [adaptation], validation, validations: [validation] };
  return Object.assign(source, structuredClone(overrides));
}

function withValidation(source, changes) {
  const next = structuredClone(source);
  Object.assign(next.validation, changes);
  next.validations = [next.validation];
  return next;
}
function deciding(source = baseSource()) { const draft = api.createPatternExecutionAdaptationPromotion(source); return api.startDecision(api.startEvaluation(draft, source, { now: NOW }), source, { now: LATER }); }
function completed(source = baseSource()) { return api.completePromotion(deciding(source), source, { now: LATER }); }

test("creates a deterministic draft with mandatory identities and Stage 39 adaptation.id compatibility", () => {
  const source = baseSource(); const before = structuredClone(source); const record = api.createPatternExecutionAdaptationPromotion(source);
  assert.equal(record.lifecycle, "draft"); assert.equal(record.kind, api.PROGRESS_KIND); assert.equal(record.id, record.adaptationPromotionId);
  assert.equal(record.adaptationId, source.adaptation.id); assert.equal(source.adaptation.adaptationId, undefined); assert.equal(record.adaptationValidationId, source.validation.id);
  assert.equal(record.patternExecutionId, EXECUTION); assert.equal(record.calculationId, CALCULATION); assert.equal(record.sourceProof.fullChainProven, true); assert.equal(record.proofStatus, "proven");
  assert.deepEqual(source, before); assert.ok(Object.isFrozen(record));
});

test("source proof rejects wrong project, execution, adaptation target and identity collisions", () => {
  for (const [mutate, field] of [
    [(source) => { source.validation.projectId = "project:wrong"; }, "sameProject"],
    [(source) => { source.validation.runtimeId = "runtime:wrong"; }, "samePatternExecution"],
    [(source) => { source.validation.adaptationId = "adaptation:wrong"; }, "validationTargetsAdaptation"],
    [(source) => { source.validation.id = source.adaptation.id; source.validation.adaptationValidationId = source.validation.id; }, "collisionFree"],
  ]) {
    const source = baseSource(); mutate(source); source.validations = [source.validation];
    const proof = api.calculateSourceProof(source); assert.equal(proof[field], false, field); assert.equal(proof.fullChainProven, false);
  }
});

test("lifecycle only moves draft-evaluating-deciding-completed, is idempotent for the same state, and terminal is immutable", () => {
  const source = baseSource(); const draft = api.createPatternExecutionAdaptationPromotion(source);
  assert.throws(() => api.startDecision(draft, source), (error) => error.code === "invalid_transition");
  const evaluating = api.startEvaluation(draft, source); assert.equal(evaluating.lifecycle, "evaluating"); assert.equal(api.startEvaluation(evaluating, source), evaluating);
  const decidingRecord = api.startDecision(evaluating, source); assert.equal(decidingRecord.lifecycle, "deciding");
  const done = api.completePromotion(decidingRecord, source); assert.equal(done.lifecycle, "completed"); assert.equal(done.promotionVerdict, "promote");
  assert.throws(() => api.completePromotion(done, source), (error) => error.code === "terminal_promotion");
  assert.throws(() => api.setDecisionConditions(done, []), (error) => error.code === "terminal_promotion");
});

test("verdict promote requires proven chain, sufficient coverage, no blockers, and confirmed impact", () => {
  const record = completed(); assert.equal(record.promotionVerdict, "promote"); assert.equal(record.revisionRequired, false); assert.equal(record.rejectionRequired, false); assert.equal(record.deferredReason, null);
});

test("warning constraints, minor regressions, partial impact, and explicit open conditions produce constrained promotion", () => {
  const warning = withValidation(baseSource(), { finalVerdict: "partial", constraintResults: [{ constraintId: "constraint:warning", validationStatus: "blocked", issues: [{ severity: "warning", reason: "Use only with monitoring." }] }] });
  assert.equal(completed(warning).promotionVerdict, "promote_with_constraints");
  const minor = withValidation(baseSource(), { finalVerdict: "partial", regressionResults: [{ regressionId: "regression:minor", status: "blocked", severity: "minor", issues: [{ severity: "warning", reason: "Small usability regression." }] }] });
  assert.equal(completed(minor).promotionVerdict, "promote_with_constraints");
  const partialImpact = withValidation(baseSource(), { finalVerdict: "partial", expectedImpactResults: [{ impactId: "impact:correctness", status: "partial", evidenceReferences: [evidence("partial")], limitations: [{ reason: "Limited fixture." }] }] });
  assert.equal(completed(partialImpact).promotionVerdict, "promote_with_constraints");
  let record = api.createPatternExecutionAdaptationPromotion(baseSource()); record = api.startEvaluation(record, baseSource());
  record = api.setDecisionConditions(record, [{ conditionId: "condition:one", status: "open", required: false, reason: "Monitor the first use." }]);
  record = api.startDecision(record, baseSource()); assert.equal(record.promotionVerdict, "promote_with_constraints");
});

test("major regression and unconfirmed impact require revision and return to adaptation", () => {
  const major = withValidation(baseSource(), { finalVerdict: "failed", regressionResults: [{ regressionId: "regression:major", status: "failed", severity: "major", issues: [{ severity: "major", reason: "Correctable regression." }] }] });
  const revised = completed(major); assert.equal(revised.promotionVerdict, "revise"); assert.equal(revised.revisionRequired, true);
  const impact = withValidation(baseSource(), { finalVerdict: "failed", expectedImpactResults: [{ impactId: "impact:correctness", status: "failed", evidenceReferences: [evidence("failed")], limitations: [] }] });
  assert.equal(completed(impact).promotionVerdict, "revise");
});

test("critical constraint or regression has rejection priority over positive expected impact", () => {
  const constraint = withValidation(baseSource(), { finalVerdict: "failed", constraintResults: [{ constraintId: "constraint:critical", validationStatus: "failed", issues: [{ severity: "critical", reason: "Mandatory identity changed." }] }] });
  const rejectedConstraint = completed(constraint); assert.equal(rejectedConstraint.promotionVerdict, "reject"); assert.equal(rejectedConstraint.rejectionRequired, true);
  const regression = withValidation(baseSource(), { finalVerdict: "failed", regressionResults: [{ regressionId: "regression:critical", status: "failed", severity: "critical", issues: [{ severity: "critical", reason: "Unsafe output." }] }] });
  assert.equal(completed(regression).promotionVerdict, "reject");
  const incompleteButCritical = withValidation(regression, { executedValidations: [{ planItemId: "check:one", status: "passed" }] });
  assert.equal(completed(incompleteButCritical).promotionVerdict, "reject");
});

test("insufficient coverage, unknown evidence, stale revisions, and imported-unproven records defer", () => {
  const coverage = withValidation(baseSource(), { executedValidations: [{ planItemId: "check:one", status: "passed" }], finalVerdict: "blocked" });
  const deferredCoverage = completed(coverage); assert.equal(deferredCoverage.coverage.sufficient, false); assert.equal(deferredCoverage.promotionVerdict, "defer"); assert.ok(deferredCoverage.deferredReason);
  const unknown = withValidation(baseSource(), { finalVerdict: "partial", expectedImpactResults: [{ impactId: "impact:correctness", status: "not-yet-observable", evidenceReferences: [], limitations: [{ reason: "Needs later observation." }] }] });
  assert.equal(completed(unknown).promotionVerdict, "defer");
  const original = baseSource(); const changed = structuredClone(original); changed.validation.revision += 1; changed.validations = [changed.validation];
  const staleDeciding = api.startDecision(api.startEvaluation(api.createPatternExecutionAdaptationPromotion(original), changed), changed);
  assert.equal(staleDeciding.stale, true); assert.equal(staleDeciding.promotionVerdict, "defer");
  const imported = api.makeImportedPatternExecutionAdaptationPromotionUnproven(completed());
  assert.equal(imported.proofStatus, "imported-unproven"); assert.equal(imported.promotionVerdict, "defer");
  const restoredProjection = api.revalidatePatternExecutionAdaptationPromotion(imported, baseSource());
  assert.equal(restoredProjection.stale, false); assert.equal(restoredProjection.proofStatus, "proven"); assert.equal(restoredProjection.promotionVerdict, "promote");
});

test("draft and evaluating remain undetermined", () => {
  const source = baseSource(); const draft = api.createPatternExecutionAdaptationPromotion(source); assert.equal(draft.promotionVerdict, "undetermined");
  assert.equal(api.startEvaluation(draft, source).promotionVerdict, "undetermined");
});

test("coverage consumes canonical Stage 40 planItemId values including checks, acceptance, and optional rollback", () => {
  const coverage = api.calculateCoverage(baseSource().validation);
  assert.deepEqual(coverage.required, ["accept:one", "check:one"]); assert.deepEqual(coverage.satisfied, ["accept:one", "check:one"]); assert.deepEqual(coverage.missing, []); assert.equal(coverage.ratio, "2/2"); assert.equal(coverage.sufficient, true);
});

test("constraint and regression normalization is order-independent and duplicate handling is deterministic", () => {
  const constraints = [{ constraintId: "c", severity: "warning", status: "open", reason: "z" }, { constraintId: "c", severity: "warning", status: "open", reason: "a" }, { constraintId: "b", severity: "info", status: "satisfied", reason: "ok" }];
  assert.deepEqual(api.normalizeConstraints(constraints), api.normalizeConstraints([...constraints].reverse()));
  assert.deepEqual(api.normalizeRegressions([{ regressionId: "z", severity: "minor", status: "resolved", reason: "ok" }, { regressionId: "a", severity: "major", status: "open", reason: "fix" }]), api.normalizeRegressions([{ regressionId: "a", severity: "major", status: "open", reason: "fix" }, { regressionId: "z", severity: "minor", status: "resolved", reason: "ok" }]));
});

test("waived constraints and accepted regressions require an explicit basis", () => {
  const source = baseSource();
  const waived = api.createPatternExecutionAdaptationPromotion(source); const invalidWaiver = structuredClone(waived);
  invalidWaiver.constraints = [{ constraintId: "constraint:waived", severity: "warning", status: "waived", reason: "" }]; invalidWaiver.identity = api.fingerprint({ broken: true });
  assert.ok(api.validatePatternExecutionAdaptationPromotion(invalidWaiver).errors.some((entry) => ["constraint_invalid", "waiver_reason_required"].includes(entry.code)));
  const accepted = structuredClone(waived); accepted.regressions = [{ regressionId: "regression:accepted", severity: "minor", status: "accepted", reason: "" }]; accepted.identity = api.fingerprint({ broken: true });
  assert.ok(api.validatePatternExecutionAdaptationPromotion(accepted).errors.some((entry) => ["regression_invalid", "acceptance_reason_required"].includes(entry.code)));
});

test("serialization, deserialization, import duplicate/collision, and identity remap are canonical", () => {
  const record = completed(); const serialized = api.serializePatternExecutionAdaptationPromotion(record);
  assert.deepEqual(api.deserializePatternExecutionAdaptationPromotion(serialized), record);
  assert.equal(api.importPatternExecutionAdaptationPromotion([record], serialized).status, "duplicate");
  const collision = structuredClone(record); collision.updatedAt = NOW;
  assert.equal(api.importPatternExecutionAdaptationPromotion([record], api.canonicalize(collision)).status, "collision");
  const remapped = api.remapPatternExecutionAdaptationPromotion(record, new Map([[PROJECT, "project:two"], [CALCULATION, "calculation:two"], [EXECUTION, "runtime:two"], [record.adaptationId, "adaptation:two"], [record.adaptationValidationId, "validation:two"], [record.sourceIdentities.adaptation, "fnv1a32:adaptation-two"], [record.sourceIdentities.validation, "fnv1a32:validation-two"]]));
  assert.equal(remapped.projectId, "project:two"); assert.equal(remapped.patternExecutionId, "runtime:two"); assert.equal(remapped.adaptationId, "adaptation:two"); assert.equal(remapped.adaptationValidationId, "validation:two"); assert.notEqual(remapped.id, record.id);
});

test("source projection detects revision/content staleness without mutating the completed decision", () => {
  const source = baseSource(); const record = completed(source); const before = structuredClone(record); const changed = structuredClone(source); changed.adaptation.revision += 1; changed.adaptations = [changed.adaptation];
  const projection = api.revalidatePatternExecutionAdaptationPromotion(record, changed);
  assert.equal(projection.stale, true); assert.equal(projection.promotionVerdict, "defer"); assert.deepEqual(record, before);
});

test("repository exposes CRUD/latest/quarantine APIs and stores promotion in progress", async () => {
  const system = globalThis.YarnAIProjectSystem;
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  const repository = new system.ProjectRepository();
  try {
    const project = await repository.createProject({ title: "Promotion repository" });
    const aggregate = await repository.addCalculation(project.project_id, { axes: ["width"] }, { status: "READY", normalized_inputs: {}, axes: {}, warnings: [], errors: [], clarifications: [] });
    const source = baseSource(); source.project = aggregate.project; source.projectId = aggregate.project.project_id; source.calculation = aggregate.calculation; source.calculationId = aggregate.calculation.calculation_id;
    source.adaptation.projectId = source.projectId; source.adaptation.calculationId = source.calculationId;
    source.validation.projectId = source.projectId; source.validation.calculationId = source.calculationId; source.validation.adaptationSnapshot = globalThis.YarnAIPatternExecutionAdaptationValidation.adaptationSnapshot(source.adaptation);
    source.adaptations = [source.adaptation]; source.validations = [source.validation];
    repository.getPatternExecutionResult = async () => ({ state: null }); repository.getPatternExecutionRuntime = async () => ({ state: null });
    repository.listPatternExecutionFollowUps = async () => []; repository.listPatternExecutionRetrospectives = async () => []; repository.listPatternExecutionLearnings = async () => [];
    repository.listPatternExecutionAdaptations = async () => [{ state: source.adaptation }]; repository.listPatternExecutionAdaptationValidations = async () => [{ state: source.validation }];
    const record = api.createPatternExecutionAdaptationPromotion(source);
    const stored = await repository.savePatternExecutionAdaptationPromotion(source.projectId, record, { timestamp: record.updatedAt });
    assert.equal(stored.kind, api.PROGRESS_KIND); assert.equal((await repository.listPatternExecutionAdaptationPromotions(source.projectId, source.calculationId)).length, 1);
    assert.equal((await repository.getLatestPatternExecutionAdaptationPromotion(source.projectId, source.calculationId)).state.id, record.id);
    assert.equal((await repository.getPatternExecutionAdaptationPromotion(source.projectId, record.id, source.calculationId)).state.id, record.id);
    const exported = await repository.exportProject(source.projectId); assert.ok(exported.envelope.payload.progress.some((entry) => entry.kind === api.PROGRESS_KIND));
    const database = await repository._database(); const read = database.transaction("progress", "readonly");
    const damaged = await new Promise((resolve, reject) => { const request = read.objectStore("progress").get(stored.progress_id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    damaged.state.identity = "fnv1a32:damaged"; const write = database.transaction("progress", "readwrite"); write.objectStore("progress").put(damaged); await new Promise((resolve, reject) => { write.oncomplete = resolve; write.onabort = () => reject(write.error); });
    assert.equal((await repository.listPatternExecutionAdaptationPromotions(source.projectId, source.calculationId)).length, 0);
    const quarantineRead = database.transaction("quarantine", "readonly"); const quarantine = await new Promise((resolve, reject) => { const request = quarantineRead.objectStore("quarantine").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    assert.ok(quarantine.some((entry) => entry.source_key === stored.progress_id));
  } finally {
    await repository.close(); await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase(system.DB_NAME); request.onsuccess = resolve; request.onerror = () => reject(request.error); });
  }
});

test("schema stays v4 with 16 unique stores and one production createObjectStore call", () => {
  const system = globalThis.YarnAIProjectSystem; assert.equal(system.DB_VERSION, 4); assert.equal(system.STORE_NAMES.length, 16); assert.equal(new Set(system.STORE_NAMES).size, 16);
  const root = path.join(__dirname, "../src/yarnai/static"); const calls = fs.readdirSync(root).filter((name) => name.endsWith(".js") && !name.includes(".test.")).flatMap((name) => [...fs.readFileSync(path.join(root, name), "utf8").matchAll(/createObjectStore\s*\(/g)]); assert.equal(calls.length, 1);
});

test("production promotion files contain no forbidden nondeterminism, debug output, or manual verdict control", () => {
  const names = ["pattern-execution-adaptation-promotion.js", "pattern-execution-adaptation-promotion-assistant.js", "pattern-execution-adaptation-promotion.html", "pattern-execution-adaptation-promotion.css"];
  const production = names.map((name) => fs.readFileSync(path.join(__dirname, "../src/yarnai/static", name), "utf8")).join("\n");
  for (const forbidden of [/Date\.now\s*\(/, /new Date\s*\(/, /Math\.random\s*\(/, /crypto\.randomUUID\s*\(/, /console\.(?:log|debug)\s*\(/, /name=["']promotionVerdict/i, /select[^>]+verdict/i]) assert.doesNotMatch(production, forbidden);
});
