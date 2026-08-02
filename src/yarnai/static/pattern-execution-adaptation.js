"use strict";

(function exposePatternExecutionAdaptation(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_ADAPTATION";
  const STATUSES = Object.freeze(["draft", "reviewing", "completed", "stale", "corrupted"]);
  const TARGET_TYPES = Object.freeze(["instruction", "sequence", "checkpoint", "monitoring", "intervention", "verification", "decision-rule", "follow-up", "safety-constraint", "user-guidance"]);
  const OPERATIONS = Object.freeze(["add", "replace", "remove", "reorder", "constrain", "clarify"]);
  const RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);
  const CONFIDENCE_LEVELS = Object.freeze(["low", "medium", "high"]);
  const IMPACT_DIRECTIONS = Object.freeze(["decrease", "unchanged", "improve"]);
  const IMPACT_COMPONENTS = Object.freeze(["correctness", "usability", "safety", "repeatability", "observability"]);
  const PRESERVED_CONSTRAINT_TYPES = Object.freeze(["project-identity", "calculation-identity", "deterministic-execution", "safety-constraints", "confirmed-user-measurements", "completed-evidence", "terminal-historical-records"]);
  const SOURCE_TYPES = Object.freeze(["project", "calculation", "result", "runtime", "follow_up", "retrospective", "learning"]);
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const IMMUTABLE_REFERENCES = Object.freeze([
    "id", "identity", "project.id", "project.identity", "projectId", "calculation.id", "calculation.identity", "calculationId",
    "result.id", "result.identity", "resultId", "runtime.id", "runtime.identity", "runtimeId", "followUp.id", "followUp.identity", "followUpId",
    "retrospective.id", "retrospective.identity", "retrospectiveId", "learning.id", "learning.identity", "learningId", "sourceIdentities", "criticalReferences",
    "createdAt", "updatedAt", "completedAt", "revision", "epoch", "terminalHistoricalRecords",
  ]);

  class PatternExecutionAdaptationError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionAdaptationError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function compare(left, right) {
    const a = String(left ?? "");
    const b = String(right ?? "");
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw adaptationError("corrupted_input", "Adaptation contains an invalid number.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw adaptationError("corrupted_input", "Adaptation contains an unsupported value.");
    if (seen.has(value)) throw adaptationError("corrupted_input", "Adaptation cannot contain cyclic data.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      result = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw adaptationError("corrupted_input", "Adaptation accepts canonical JSON objects only.");
    }
    seen.delete(value);
    return result;
  }

  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }

  function normalizeText(value) {
    return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : "";
  }

  function normalizeContent(value) {
    if (typeof value === "string") return normalizeText(value);
    if (Array.isArray(value)) return value.map(normalizeContent);
    if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      const next = {};
      for (const key of Object.keys(value).sort(compare)) next[normalizeText(key)] = normalizeContent(value[key]);
      return next;
    }
    return value;
  }

  function stableStrings(values) {
    return [...new Set(array(values).map(normalizeText).filter(Boolean))].sort(compare);
  }

  function recordId(value, type = "record") {
    if (!value || typeof value !== "object") return null;
    const candidates = [value.id, value.resultId, value.project_id, value.calculation_id, value[`${type}Id`]];
    return candidates.map(normalizeText).find(Boolean) || null;
  }

  function recordIdentity(value, type = "record") {
    if (!value || typeof value !== "object") return null;
    const candidates = type === "project"
      ? [value.identity, value.project_id, value.projectId, value.id, value.materialized_checksum]
      : type === "calculation"
        ? [value.identity, value.fingerprint, value.payload_checksum, value.calculation_id, value.calculationId, value.id]
        : [value.identity, value.fingerprint, value.resultFingerprint, value.runtimeFingerprint, value.inputFingerprint];
    return candidates.map(normalizeText).find(Boolean) || null;
  }

  function recordStatus(value) {
    return normalizeText(value?.status || value?.workspace_status || value?.lifecycle?.state || value?.lifecycle) || null;
  }

  function recordProjectId(value) {
    return normalizeText(value?.projectId || value?.project_id) || null;
  }

  function recordCalculationId(value) {
    return normalizeText(value?.calculationId || value?.calculation_id || value?.sourceCalculationId) || null;
  }

  function timestampOf(value) {
    return [value?.completedAt, value?.updatedAt, value?.updated_at, value?.createdAt, value?.created_at].find(isTimestamp) || DEFAULT_TIMESTAMP;
  }

  function latestCompleted(values) {
    return array(values).filter((entry) => entry && typeof entry === "object" && recordStatus(entry) === "completed").slice().sort((left, right) =>
      compare(timestampOf(left), timestampOf(right)) ||
      positiveInteger(left.epoch) - positiveInteger(right.epoch) ||
      positiveInteger(left.revision) - positiveInteger(right.revision) ||
      compare(recordId(left), recordId(right))
    ).at(-1) || null;
  }

  function linkedOrLatest(values, linkedId) {
    const completed = array(values).filter((entry) => recordStatus(entry) === "completed");
    return completed.find((entry) => recordId(entry) === normalizeText(linkedId)) || latestCompleted(completed);
  }

  function normalizeSource(source = {}) {
    const learning = source.learning || linkedOrLatest(source.learnings, source.learningId);
    const retrospective = source.retrospective || linkedOrLatest(source.retrospectives, learning?.sourceRetrospectiveId || source.retrospectiveId);
    const followUp = source.followUp || source.follow_up || linkedOrLatest(source.followUps, retrospective?.sourceFollowUpId || learning?.sourceFollowUpId);
    const project = source.project || null;
    const projectId = normalizeText(source.projectId || project?.project_id || project?.projectId || learning?.projectId || source.result?.projectId) || null;
    const calculationId = normalizeText(source.calculationId || source.calculation?.calculation_id || project?.active_calculation_id || learning?.calculationId || source.runtime?.calculationId) || null;
    return {
      project, projectId, calculation: source.calculation || null, calculationId,
      result: source.result || null, runtime: source.runtime || null,
      followUp: followUp || null, followUps: array(source.followUps),
      retrospective: retrospective || null, retrospectives: array(source.retrospectives),
      learning: learning || null, learnings: array(source.learnings),
    };
  }

  function sourceReference(sourceType, value) {
    if (!value || typeof value !== "object") return null;
    const identityScoped = ["project", "calculation"].includes(sourceType);
    return normalize({
      sourceType,
      sourceId: recordId(value, sourceType),
      identity: recordIdentity(value, sourceType),
      projectId: recordProjectId(value),
      calculationId: recordCalculationId(value),
      revision: identityScoped ? null : positiveInteger(value.revision) || null,
      epoch: identityScoped ? null : positiveInteger(value.epoch) || null,
      status: identityScoped ? null : recordStatus(value),
    });
  }

  function learningSnapshot(learning) {
    if (!learning || typeof learning !== "object") return null;
    const references = (values) => array(values).map((entry) => ({ id: normalizeText(entry?.id) || null, identity: fingerprint(normalizeContent(entry)) })).sort((left, right) => compare(left.id, right.id) || compare(left.identity, right.identity));
    return normalize({
      id: recordId(learning, "learning"), kind: normalizeText(learning.kind), projectId: recordProjectId(learning), calculationId: recordCalculationId(learning),
      identity: recordIdentity(learning, "learning"), status: recordStatus(learning), revision: positiveInteger(learning.revision) || null,
      epoch: positiveInteger(learning.epoch) || null, completedAt: isTimestamp(learning.completedAt) ? learning.completedAt : null,
      lessons: references(learning.lessonsLearned), successfulPatterns: references(learning.successfulPatterns), antiPatterns: references(learning.antiPatterns), recommendations: references(learning.recommendations),
    });
  }

  function sourceRecords(source) {
    const normalized = normalizeSource(source);
    return {
      project: normalized.project,
      calculation: normalized.calculation,
      result: normalized.result,
      runtime: normalized.runtime,
      follow_up: normalized.followUp,
      retrospective: normalized.retrospective,
      learning: normalized.learning,
    };
  }

  function buildSourceIdentities(source) {
    const records = sourceRecords(source);
    return normalize(Object.fromEntries(SOURCE_TYPES.map((type) => [type, recordIdentity(records[type], type)])));
  }

  function buildCriticalReferences(source) {
    const records = sourceRecords(source);
    return SOURCE_TYPES.map((type) => sourceReference(type, records[type])).filter(Boolean).sort((left, right) => compare(left.sourceType, right.sourceType));
  }

  function normalizeTarget(value) {
    const item = value && typeof value === "object" ? value : {};
    return {
      targetType: normalizeText(item.targetType).toLowerCase(),
      targetReference: normalizeText(item.targetReference),
      rationale: normalizeText(item.rationale),
      sourceLearningReferences: stableStrings(item.sourceLearningReferences),
    };
  }

  function normalizeChange(value) {
    const item = value && typeof value === "object" ? value : {};
    const targetType = normalizeText(item.targetType).toLowerCase();
    const targetReference = normalizeText(item.targetReference);
    const operation = normalizeText(item.operation).toLowerCase();
    const before = item.before === null || item.before === undefined ? null : normalizeContent(item.before);
    const after = item.after === null || item.after === undefined ? null : normalizeContent(item.after);
    const rationale = normalizeText(item.rationale);
    const sourceLessonReferences = stableStrings(item.sourceLessonReferences);
    const riskLevel = normalizeText(item.riskLevel || "medium").toLowerCase();
    const reversible = item.reversible === true;
    const changeId = normalizeText(item.changeId) || `change:${fingerprint({ targetType, targetReference, operation, before, after, rationale, sourceLessonReferences, riskLevel, reversible }).slice(8)}`;
    return { changeId, targetType, targetReference, operation, before, after, rationale, sourceLessonReferences, riskLevel, reversible };
  }

  function stableChanges(values) {
    const items = array(values).map(normalizeChange);
    const unique = new Map(items.map((item) => [item.changeId, item]));
    const deduplicated = [...unique.values()];
    if (deduplicated.some((item) => item.operation === "reorder")) return deduplicated;
    return deduplicated.sort((left, right) => compare(left.changeId, right.changeId));
  }

  function normalizeConstraint(value) {
    const item = value && typeof value === "object" ? value : {};
    return { constraintType: normalizeText(item.constraintType).toLowerCase(), rationale: normalizeText(item.rationale), protectedReferences: stableStrings(item.protectedReferences) };
  }

  function normalizePlanEntry(value, idField, prefix) {
    const item = value && typeof value === "object" ? value : {};
    const description = normalizeText(item.description);
    const proposedChangeIds = stableStrings(item.proposedChangeIds);
    const id = normalizeText(item[idField]) || `${prefix}:${fingerprint({ description, proposedChangeIds }).slice(8)}`;
    return { [idField]: id, description, proposedChangeIds };
  }

  function normalizeValidationPlan(value = {}) {
    const item = value && typeof value === "object" ? value : {};
    const entries = (values, idField, prefix) => {
      const unique = new Map(array(values).map((entry) => normalizePlanEntry(entry, idField, prefix)).map((entry) => [entry[idField], entry]));
      return [...unique.values()].sort((left, right) => compare(left[idField], right[idField]));
    };
    return {
      checks: entries(item.checks, "checkId", "check"),
      acceptanceCriteria: entries(item.acceptanceCriteria, "criterionId", "acceptance"),
      rollbackCriteria: entries(item.rollbackCriteria, "criterionId", "rollback"),
    };
  }

  function normalizeExpectedImpact(value = {}) {
    const item = value && typeof value === "object" ? value : {};
    return Object.fromEntries(IMPACT_COMPONENTS.map((component) => {
      const assessment = item[component] && typeof item[component] === "object" ? item[component] : {};
      return [component, { direction: normalizeText(assessment.direction || "unchanged").toLowerCase(), rationale: normalizeText(assessment.rationale) }];
    }));
  }

  function normalizeConfidenceAssessment(value = {}) {
    const item = value && typeof value === "object" ? value : {};
    return {
      level: normalizeText(item.level || "low").toLowerCase(), rationale: normalizeText(item.rationale),
      supportingReferences: stableStrings(item.supportingReferences), uncertaintyReferences: stableStrings(item.uncertaintyReferences),
    };
  }

  function knowledgeReferences(learning) {
    return new Set(["lessonsLearned", "successfulPatterns", "antiPatterns", "recommendations"].flatMap((field) => array(learning?.[field]).map((entry) => normalizeText(entry?.id)).filter(Boolean)));
  }

  function immutableReference(reference) {
    const normalized = normalizeText(reference);
    return IMMUTABLE_REFERENCES.some((value) => normalized === value || normalized.startsWith(`${value}.`) || normalized.startsWith(`${value}[`));
  }

  function constraintConflicts(record) {
    const protectedReferences = new Set(record.preservedConstraints.flatMap((entry) => entry.protectedReferences));
    const preservedTypes = new Set(record.preservedConstraints.map((entry) => entry.constraintType));
    const conflicts = [];
    for (const change of record.proposedChanges) {
      if (immutableReference(change.targetReference)) conflicts.push({ code: "immutable_reference_change", changeId: change.changeId, constraintType: "identity" });
      if (protectedReferences.has(change.targetReference) && ["remove", "replace"].includes(change.operation)) conflicts.push({ code: "protected_reference_change", changeId: change.changeId, constraintType: "protected-reference" });
      if (preservedTypes.has("safety-constraints") && change.targetType === "safety-constraint" && change.operation === "remove") conflicts.push({ code: "safety_constraint_removed", changeId: change.changeId, constraintType: "safety-constraints" });
      if (preservedTypes.has("terminal-historical-records") && /(?:history|historical|completed-record|terminal-record)/i.test(change.targetReference) && ["remove", "replace"].includes(change.operation)) conflicts.push({ code: "terminal_record_change", changeId: change.changeId, constraintType: "terminal-historical-records" });
    }
    return conflicts.sort((left, right) => compare(left.code, right.code) || compare(left.changeId, right.changeId));
  }

  function contentErrors(record, learning = null) {
    const errors = [];
    const invalid = (code, field = null) => errors.push({ code, field });
    if (!record.adaptationTargets.length) invalid("adaptation_targets_required", "adaptationTargets");
    for (const target of record.adaptationTargets) {
      if (!TARGET_TYPES.includes(target.targetType) || !target.targetReference || !target.rationale || !target.sourceLearningReferences.length) invalid("adaptation_target_invalid", target.targetReference || null);
    }
    if (!record.proposedChanges.length) invalid("proposed_changes_required", "proposedChanges");
    for (const change of record.proposedChanges) {
      if (!change.changeId || !TARGET_TYPES.includes(change.targetType) || !change.targetReference || !OPERATIONS.includes(change.operation) || !change.rationale || !change.sourceLessonReferences.length || !RISK_LEVELS.includes(change.riskLevel) || typeof change.reversible !== "boolean") invalid("proposed_change_invalid", change.changeId || null);
      if (change.operation === "add" ? change.before !== null : change.before === null) invalid("before_invalid", change.changeId || null);
      if (change.operation === "remove" ? change.after !== null : change.after === null) invalid("after_invalid", change.changeId || null);
      if (immutableReference(change.targetReference)) invalid("immutable_reference_change", change.changeId || null);
    }
    if (!record.preservedConstraints.length) invalid("preserved_constraints_required", "preservedConstraints");
    for (const constraint of record.preservedConstraints) if (!PRESERVED_CONSTRAINT_TYPES.includes(constraint.constraintType) || !constraint.rationale) invalid("preserved_constraint_invalid", constraint.constraintType || null);
    if (!record.validationPlan.checks.length || !record.validationPlan.acceptanceCriteria.length) invalid("validation_plan_required", "validationPlan");
    const changeIds = new Set(record.proposedChanges.map((entry) => entry.changeId));
    for (const [field, entries, idField] of [["checks", record.validationPlan.checks, "checkId"], ["acceptanceCriteria", record.validationPlan.acceptanceCriteria, "criterionId"], ["rollbackCriteria", record.validationPlan.rollbackCriteria, "criterionId"]]) {
      for (const entry of entries) if (!entry[idField] || !entry.description || !entry.proposedChangeIds.length || entry.proposedChangeIds.some((id) => !changeIds.has(id))) invalid("validation_entry_invalid", `${field}:${entry[idField] || "missing"}`);
    }
    for (const changeId of changeIds) {
      if (!record.validationPlan.checks.some((entry) => entry.proposedChangeIds.includes(changeId)) || !record.validationPlan.acceptanceCriteria.some((entry) => entry.proposedChangeIds.includes(changeId))) invalid("validation_plan_coverage_missing", changeId);
    }
    for (const component of IMPACT_COMPONENTS) {
      const assessment = record.expectedImpact[component];
      if (!assessment || !IMPACT_DIRECTIONS.includes(assessment.direction) || !assessment.rationale) invalid("expected_impact_invalid", component);
    }
    const confidence = record.confidenceAssessment;
    if (!CONFIDENCE_LEVELS.includes(confidence.level) || !confidence.rationale || confidence.level === "high" && !confidence.supportingReferences.length) invalid("confidence_assessment_invalid", "confidenceAssessment");
    const references = knowledgeReferences(learning);
    if (learning) {
      const used = [
        ...record.adaptationTargets.flatMap((entry) => entry.sourceLearningReferences),
        ...record.proposedChanges.flatMap((entry) => entry.sourceLessonReferences),
        ...confidence.supportingReferences,
      ];
      for (const reference of used) if (!references.has(reference)) invalid("learning_reference_missing", reference);
    }
    for (const conflict of constraintConflicts(record)) invalid("preserved_constraint_conflict", conflict.changeId);
    return errors.sort((left, right) => compare(left.code, right.code) || compare(left.field, right.field));
  }

  function issue(code, sourceType, sourceId = null) {
    return { code, severity: "critical", sourceType, sourceId: sourceId || null };
  }

  function calculateIntegrity(source = {}, adaptation = null, options = {}) {
    const normalized = normalizeSource(source);
    const records = sourceRecords(normalized);
    const issues = [];
    for (const type of SOURCE_TYPES) if (!records[type]) issues.push(issue(`missing_${type}`, type));
    for (const type of SOURCE_TYPES) {
      const value = records[type];
      if (!value) continue;
      const id = recordId(value, type);
      const valueProjectId = recordProjectId(value);
      const valueCalculationId = recordCalculationId(value);
      if (type !== "project" && normalized.projectId && valueProjectId !== normalized.projectId) issues.push(issue("project_mismatch", type, id));
      if (!["project", "calculation"].includes(type) && normalized.calculationId && valueCalculationId !== normalized.calculationId) issues.push(issue("calculation_mismatch", type, id));
      if (!recordIdentity(value, type)) issues.push(issue("identity_unconfirmed", type, id));
      if (value.corrupted === true || recordStatus(value) === "corrupted" || value.quarantined === true) issues.push(issue("corrupted_source", type, id));
      if (recordStatus(value) === "stale" || value.stale === true || array(value.staleReasons).length || value.importedDiagnostic?.reason === "import_identity_unproven") issues.push(issue("stale_source", type, id));
    }
    if (normalized.result && recordStatus(normalized.result) !== "ready") issues.push(issue("result_not_ready", "result", recordId(normalized.result)));
    if (normalized.runtime && normalized.result) {
      if (normalizeText(normalized.runtime.sourceResultId) !== recordId(normalized.result, "result")) issues.push(issue("result_runtime_mismatch", "runtime", recordId(normalized.runtime)));
      if (normalizeText(normalized.runtime.sourceResultFingerprint) && normalized.runtime.sourceResultFingerprint !== recordIdentity(normalized.result, "result")) issues.push(issue("source_identity_mismatch", "runtime", recordId(normalized.runtime)));
    }
    if (normalized.followUp && recordStatus(normalized.followUp) !== "completed") issues.push(issue("follow_up_not_completed", "follow_up", recordId(normalized.followUp)));
    const latestFollowUp = latestCompleted(normalized.followUps);
    if (latestFollowUp && normalized.followUp && recordId(latestFollowUp) !== recordId(normalized.followUp)) issues.push(issue("older_follow_up_selected", "follow_up", recordId(normalized.followUp)));
    if (normalized.retrospective && recordStatus(normalized.retrospective) !== "completed") issues.push(issue("retrospective_not_completed", "retrospective", recordId(normalized.retrospective)));
    if (normalized.retrospective) {
      for (const [field, value, type] of [["sourceResultId", normalized.result, "result"], ["sourceRuntimeId", normalized.runtime, "runtime"], ["sourceFollowUpId", normalized.followUp, "follow_up"]]) if (value && normalizeText(normalized.retrospective[field]) !== recordId(value, type)) issues.push(issue("source_identity_mismatch", "retrospective", recordId(normalized.retrospective)));
      if (normalized.retrospective.sourceSnapshot && normalized.retrospective.sourceSnapshotFingerprint !== fingerprint(normalized.retrospective.sourceSnapshot)) issues.push(issue("retrospective_snapshot_invalid", "retrospective", recordId(normalized.retrospective)));
    }
    if (normalized.learning && recordStatus(normalized.learning) !== "completed") issues.push(issue("learning_not_completed", "learning", recordId(normalized.learning)));
    const latestLearning = latestCompleted(normalized.learnings);
    if (latestLearning && normalized.learning && recordId(latestLearning) !== recordId(normalized.learning)) issues.push(issue("older_learning_selected", "learning", recordId(normalized.learning)));
    if (normalized.learning) {
      for (const [field, value, type] of [["sourceResultId", normalized.result, "result"], ["sourceRuntimeId", normalized.runtime, "runtime"], ["sourceFollowUpId", normalized.followUp, "follow_up"], ["sourceRetrospectiveId", normalized.retrospective, "retrospective"]]) if (value && normalizeText(normalized.learning[field]) !== recordId(value, type)) issues.push(issue("source_identity_mismatch", "learning", recordId(normalized.learning)));
      if (normalized.learning.sourceRetrospectiveIdentity && normalized.retrospective && normalized.learning.sourceRetrospectiveIdentity !== recordIdentity(normalized.retrospective, "retrospective")) issues.push(issue("source_identity_mismatch", "learning", recordId(normalized.learning)));
      if (normalized.learning.sourceSnapshot && normalized.learning.sourceSnapshotFingerprint !== fingerprint(normalized.learning.sourceSnapshot)) issues.push(issue("learning_source_snapshot_invalid", "learning", recordId(normalized.learning)));
      const report = globalObject.YarnAIPatternExecutionLearning?.validatePatternExecutionLearning?.(normalized.learning);
      if (report && !report.valid) issues.push(issue("learning_invalid", "learning", recordId(normalized.learning)));
    }
    if (adaptation) {
      const expectedIds = { projectId: normalized.projectId, calculationId: normalized.calculationId, resultId: recordId(normalized.result, "result"), runtimeId: recordId(normalized.runtime, "runtime"), followUpId: recordId(normalized.followUp, "follow_up"), retrospectiveId: recordId(normalized.retrospective, "retrospective"), learningId: recordId(normalized.learning, "learning") };
      for (const [field, value] of Object.entries(expectedIds)) if (normalizeText(adaptation[field]) !== normalizeText(value)) issues.push(issue("source_reference_mismatch", field, adaptation[field] || null));
      const identities = buildSourceIdentities(normalized);
      for (const type of SOURCE_TYPES) if (normalizeText(adaptation.sourceIdentities?.[type]) !== normalizeText(identities[type])) issues.push(issue("source_identity_mismatch", type, recordId(records[type], type)));
      if (canonicalize(adaptation.learningSnapshot || null) !== canonicalize(learningSnapshot(normalized.learning))) issues.push(issue("learning_snapshot_mismatch", "learning", adaptation.learningId));
      const actualReferences = buildCriticalReferences(normalized);
      if (canonicalize(array(adaptation.criticalReferences)) !== canonicalize(actualReferences)) issues.push(issue("broken_critical_reference", "adaptation", adaptation.id));
      if (options.includeContent !== false) for (const error of contentErrors(adaptation, normalized.learning)) issues.push(issue(error.code, "adaptation", error.field));
      if (["stale", "corrupted"].includes(adaptation.status) || adaptation.stale === true || adaptation.quarantined === true || adaptation.importedDiagnostic?.reason === "import_identity_unproven") issues.push(issue("adaptation_untrusted", "adaptation", adaptation.id));
    }
    const unique = new Map(issues.map((entry) => [canonicalize(entry), entry]));
    const sorted = [...unique.values()].sort((left, right) => compare(left.code, right.code) || compare(left.sourceType, right.sourceType) || compare(left.sourceId, right.sourceId));
    return freeze({ valid: sorted.length === 0, criticalIssues: sorted, issues: sorted, criticalChainComplete: !sorted.some((entry) => entry.code.startsWith("missing_")) });
  }

  function identityPayload(record) {
    return {
      projectId: record.projectId, calculationId: record.calculationId, resultId: record.resultId, runtimeId: record.runtimeId, followUpId: record.followUpId,
      retrospectiveId: record.retrospectiveId, learningId: record.learningId, epoch: record.epoch, status: record.status,
      adaptationTargets: record.adaptationTargets, proposedChanges: record.proposedChanges, preservedConstraints: record.preservedConstraints,
      validationPlan: record.validationPlan, expectedImpact: record.expectedImpact, confidenceAssessment: record.confidenceAssessment,
      sourceIdentities: record.sourceIdentities, learningSnapshot: record.learningSnapshot, criticalReferences: record.criticalReferences,
    };
  }

  function finalize(record) {
    record.adaptationTargets = uniqueSorted(record.adaptationTargets, normalizeTarget, (item) => `${item.targetType}\u0000${item.targetReference}`);
    record.proposedChanges = stableChanges(record.proposedChanges);
    record.preservedConstraints = uniqueSorted(record.preservedConstraints, normalizeConstraint, (item) => item.constraintType);
    record.validationPlan = normalizeValidationPlan(record.validationPlan);
    record.expectedImpact = normalizeExpectedImpact(record.expectedImpact);
    record.confidenceAssessment = normalizeConfidenceAssessment(record.confidenceAssessment);
    record.sourceIdentities = normalize(record.sourceIdentities);
    record.learningSnapshot = normalize(record.learningSnapshot);
    record.criticalReferences = array(record.criticalReferences).map(normalizeContent).sort((left, right) => compare(left.sourceType, right.sourceType));
    record.identity = fingerprint(identityPayload(record));
    return freeze(record);
  }

  function createPatternExecutionAdaptation(source = {}, input = {}) {
    const normalized = normalizeSource(source);
    const integrity = calculateIntegrity(normalized);
    if (!normalized.learning || recordStatus(normalized.learning) !== "completed") throw adaptationError("completed_learning_required", "A completed learning record is required before adaptation can be created.");
    if (!integrity.valid) throw adaptationError("critical_integrity", "The learning source chain is incomplete or inconsistent.", { issues: integrity.criticalIssues });
    const epoch = positiveInteger(input.epoch) || 1;
    const timestamp = deterministicTimestamp(input.now, normalized.learning.completedAt, normalized.learning.updatedAt);
    const learningId = recordId(normalized.learning, "learning");
    const learningIdentity = recordIdentity(normalized.learning, "learning");
    const id = normalizeText(input.id) || `adaptation:${fingerprint({ projectId: normalized.projectId, learningId, learningIdentity, epoch }).slice(8)}`;
    const record = {
      id, kind: PROGRESS_KIND, type: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      projectId: normalized.projectId, calculationId: normalized.calculationId, resultId: recordId(normalized.result, "result"), runtimeId: recordId(normalized.runtime, "runtime"),
      followUpId: recordId(normalized.followUp, "follow_up"), retrospectiveId: recordId(normalized.retrospective, "retrospective"), learningId,
      status: "draft", adaptationTargets: clone(array(input.adaptationTargets)), proposedChanges: clone(array(input.proposedChanges)),
      preservedConstraints: clone(array(input.preservedConstraints)), validationPlan: clone(input.validationPlan || {}), expectedImpact: clone(input.expectedImpact || {}), confidenceAssessment: clone(input.confidenceAssessment || {}),
      sourceIdentities: buildSourceIdentities(normalized), learningSnapshot: learningSnapshot(normalized.learning), criticalReferences: buildCriticalReferences(normalized),
      createdAt: timestamp, updatedAt: timestamp, completedAt: null, revision: 1, epoch, identity: null,
      integrity, audit: [{ event: "created", at: timestamp, revision: 1 }], importedDiagnostic: null,
    };
    const next = finalize(record);
    requireRecord(next);
    return next;
  }

  function edit(record, event, value, command, field) {
    requireRecord(record);
    if (record.status === "completed") throw adaptationError("terminal_adaptation", "Completed adaptation is immutable.");
    if (record.status !== "draft") throw adaptationError("draft_required", "Return adaptation to draft before editing.");
    checkConcurrency(record, command);
    const next = clone(record);
    next[field] = clone(value);
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command?.now, record.updatedAt);
    next.audit.push({ event, at: next.updatedAt, revision: next.revision });
    const finished = finalize(next);
    requireRecord(finished);
    return finished;
  }

  function setAdaptationTargets(record, value, command = {}) { return edit(record, "adaptation_targets_changed", value, command, "adaptationTargets"); }
  function setProposedChanges(record, value, command = {}) { return edit(record, "proposed_changes_changed", value, command, "proposedChanges"); }
  function setPreservedConstraints(record, value, command = {}) { return edit(record, "preserved_constraints_changed", value, command, "preservedConstraints"); }
  function setValidationPlan(record, value, command = {}) { return edit(record, "validation_plan_changed", value, command, "validationPlan"); }
  function setExpectedImpact(record, value, command = {}) { return edit(record, "expected_impact_changed", value, command, "expectedImpact"); }
  function setConfidenceAssessment(record, value, command = {}) { return edit(record, "confidence_assessment_changed", value, command, "confidenceAssessment"); }

  function transition(record, nextStatus, source = null, command = {}) {
    requireRecord(record);
    checkConcurrency(record, command);
    if (record.status === "completed") throw adaptationError("terminal_adaptation", "Completed adaptation is immutable.");
    const allowed = { draft: ["reviewing"], reviewing: ["draft", "completed"] };
    if (!array(allowed[record.status]).includes(nextStatus)) throw adaptationError("invalid_transition", `Cannot transition ${record.status} to ${nextStatus}.`);
    const integrity = source ? calculateIntegrity(source, record) : record.integrity;
    if (nextStatus === "completed" && !source) throw adaptationError("source_required", "The current source chain is required for completion.");
    if (nextStatus === "completed" && !integrity.valid) throw adaptationError("critical_integrity", "Critical source-chain or adaptation problems must be resolved before completion.", { issues: integrity.criticalIssues });
    const next = clone(record);
    next.status = nextStatus;
    next.integrity = clone(integrity);
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, record.updatedAt);
    next.completedAt = nextStatus === "completed" ? next.updatedAt : null;
    next.audit.push({ event: `status_${nextStatus}`, at: next.updatedAt, revision: next.revision });
    return finalize(next);
  }

  function startReview(record, source = null, command = {}) { return transition(record, "reviewing", source, command); }
  function returnToDraft(record, source = null, command = {}) { return transition(record, "draft", source, command); }
  function completeAdaptation(record, source, command = {}) { return transition(record, "completed", source, command); }

  function validatePatternExecutionAdaptation(record) {
    const errors = [];
    const invalid = (code, field = null) => errors.push({ code, field });
    try { canonicalize(record); } catch { invalid("corrupted_input"); return finishValidation(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.schemaVersion !== SCHEMA_VERSION || record.version !== VERSION) invalid("kind_invalid");
    for (const field of ["id", "projectId", "calculationId", "resultId", "runtimeId", "followUpId", "retrospectiveId", "learningId", "identity", "createdAt", "updatedAt"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (!STATUSES.includes(record?.status) || !positiveInteger(record?.revision) || !positiveInteger(record?.epoch)) invalid("lifecycle_invalid");
    for (const field of ["adaptationTargets", "proposedChanges", "preservedConstraints", "criticalReferences", "audit"]) if (!Array.isArray(record?.[field])) invalid("collection_invalid", field);
    if (!record?.validationPlan || !record?.expectedImpact || !record?.confidenceAssessment || !record?.sourceIdentities || !record?.learningSnapshot) invalid("structure_missing");
    if (record && canonicalize(record.adaptationTargets) !== canonicalize(uniqueSorted(record.adaptationTargets, normalizeTarget, (item) => `${item.targetType}\u0000${item.targetReference}`))) invalid("collection_not_normalized", "adaptationTargets");
    if (record && canonicalize(record.proposedChanges) !== canonicalize(stableChanges(record.proposedChanges))) invalid("collection_not_normalized", "proposedChanges");
    if (record && canonicalize(record.preservedConstraints) !== canonicalize(uniqueSorted(record.preservedConstraints, normalizeConstraint, (item) => item.constraintType))) invalid("collection_not_normalized", "preservedConstraints");
    if (record && canonicalize(record.validationPlan) !== canonicalize(normalizeValidationPlan(record.validationPlan))) invalid("structure_not_normalized", "validationPlan");
    if (record && canonicalize(record.expectedImpact) !== canonicalize(normalizeExpectedImpact(record.expectedImpact))) invalid("structure_not_normalized", "expectedImpact");
    if (record && canonicalize(record.confidenceAssessment) !== canonicalize(normalizeConfidenceAssessment(record.confidenceAssessment))) invalid("structure_not_normalized", "confidenceAssessment");
    if (record?.status === "completed") for (const error of contentErrors(record)) invalid(error.code, error.field);
    if (record?.status === "completed" && !isTimestamp(record.completedAt)) invalid("completion_timestamp_missing");
    if (!isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("timestamp_invalid");
    if (record?.identity && record.identity !== fingerprint(identityPayload(record))) invalid("identity_mismatch");
    if (record?.learningSnapshot?.id !== record?.learningId || record?.learningSnapshot?.identity !== record?.sourceIdentities?.learning) invalid("learning_snapshot_mismatch");
    if (array(record?.criticalReferences).length !== SOURCE_TYPES.length) invalid("critical_references_invalid");
    return finishValidation(errors);
  }

  function safeNormalizePatternExecutionAdaptation(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : clone(value);
      const report = validatePatternExecutionAdaptation(parsed);
      return report.valid ? freeze({ record: freeze(parsed), corrupted: false, errors: [] }) : freeze({ record: null, corrupted: true, errors: report.errors });
    } catch {
      return freeze({ record: null, corrupted: true, errors: [{ code: "corrupted_input", field: null }] });
    }
  }

  function projectPatternExecutionAdaptation(record, source = {}) {
    const safe = safeNormalizePatternExecutionAdaptation(record);
    if (safe.corrupted) return freeze({ effectiveStatus: "corrupted", stale: false, corrupted: true, integrity: null, reasonCode: "corrupted_input" });
    const integrity = calculateIntegrity(source, record);
    const stale = ["stale", "corrupted"].includes(record.status) || integrity.issues.some((entry) => ["source_reference_mismatch", "source_identity_mismatch", "learning_snapshot_mismatch", "stale_source", "older_learning_selected"].includes(entry.code));
    return freeze({ effectiveStatus: stale ? "stale" : record.status, stale, corrupted: false, integrity, reasonCode: stale ? "source_chain_changed" : integrity.valid ? null : "critical_integrity" });
  }

  function serializePatternExecutionAdaptation(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternExecutionAdaptation(value) { const safe = safeNormalizePatternExecutionAdaptation(value); if (safe.corrupted) throw adaptationError("corrupted_input", "Adaptation data is corrupted.", { errors: safe.errors }); return safe.record; }

  function remapPatternExecutionAdaptation(record, referenceMap) {
    requireRecord(record);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(record), map);
    next.id = `adaptation:${fingerprint({ projectId: next.projectId, learningId: next.learningId, learningIdentity: next.sourceIdentities?.learning, epoch: next.epoch }).slice(8)}`;
    return finalize(next);
  }

  function makeImportedPatternExecutionAdaptationStale(record, options = {}) {
    requireRecord(record);
    const next = clone(record);
    next.importedDiagnostic = { reason: normalizeText(options.reason) || "import_identity_unproven", collision: Boolean(options.collision), preservedStatus: record.status };
    next.status = "stale";
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(options.now, record.updatedAt);
    next.audit.push({ event: "imported_stale", at: next.updatedAt, revision: next.revision });
    return finalize(next);
  }

  function importPatternExecutionAdaptation(existing, serialized, options = {}) {
    const record = deserializePatternExecutionAdaptation(serialized);
    const imported = options.referenceMap ? remapPatternExecutionAdaptation(record, options.referenceMap) : record;
    const sameId = array(existing).find((entry) => entry.id === imported.id);
    const sameIdentity = array(existing).find((entry) => entry.identity === imported.identity);
    if (sameId && canonicalize(sameId) === canonicalize(imported)) return freeze({ status: "duplicate", record: sameId, changed: false });
    if (sameId || sameIdentity) return freeze({ status: "collision", record: null, changed: false });
    return freeze({ status: "imported", record: imported, changed: true });
  }

  async function loadSource(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate.project || aggregate;
    const calculationId = project.active_calculation_id;
    const calculation = array(aggregate.calculations).find((entry) => entry.calculation_id === calculationId) || null;
    if (!calculationId) return { project, projectId, calculation, calculationId: null };
    const [resultRecord, runtimeRecord, followUpRecords, retrospectiveRecords, learningRecords] = await Promise.all([
      repository.getPatternExecutionResult(projectId, calculationId), repository.getPatternExecutionRuntime(projectId, calculationId),
      repository.listPatternExecutionFollowUps(projectId, calculationId), repository.listPatternExecutionRetrospectives(projectId, calculationId), repository.listPatternExecutionLearnings(projectId, calculationId),
    ]);
    const followUps = followUpRecords.map((entry) => entry.state);
    const retrospectives = retrospectiveRecords.map((entry) => entry.state);
    const learnings = learningRecords.map((entry) => entry.state);
    const learning = latestCompleted(learnings);
    const retrospective = linkedOrLatest(retrospectives, learning?.sourceRetrospectiveId);
    const followUp = linkedOrLatest(followUps, retrospective?.sourceFollowUpId || learning?.sourceFollowUpId);
    return { project, projectId, calculation, calculationId, result: resultRecord?.state || null, runtime: runtimeRecord?.state || null, followUps, followUp, retrospectives, retrospective, learnings, learning };
  }

  async function readForProject(repository, projectId, adaptationId = null) {
    let source;
    try { source = await loadSource(repository, projectId); }
    catch (error) { return freeze({ projectId, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "source_load_failed", corrupted: true, stale: false, rawAdaptation: null, availableCommands: [] }); }
    let stored;
    try { stored = await repository.getPatternExecutionAdaptation(projectId, adaptationId, source.calculationId); }
    catch (error) { return freeze({ ...source, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "adaptation_load_failed", corrupted: true, stale: false, rawAdaptation: null, availableCommands: [] }); }
    if (!stored) {
      const integrity = calculateIntegrity(source);
      return freeze({ ...source, rawAdaptation: null, adaptationRecord: null, integrity, effectiveStatus: integrity.valid ? "draft" : "blocked", stale: false, corrupted: false, reasonCode: integrity.valid ? null : "critical_integrity", availableCommands: integrity.valid ? ["create"] : [] });
    }
    const projected = projectPatternExecutionAdaptation(stored.state, source);
    const availableCommands = projected.effectiveStatus === "draft" ? ["save", "review"] : projected.effectiveStatus === "reviewing" ? ["draft", "complete"] : [];
    return freeze({ ...source, rawAdaptation: stored.state, adaptationRecord: stored, ...projected, availableCommands });
  }

  async function createForProject(repository, projectId, input = {}) {
    const source = await loadSource(repository, projectId);
    const existing = await repository.listPatternExecutionAdaptations(projectId, source.calculationId);
    const record = createPatternExecutionAdaptation(source, { ...clone(input), epoch: existing.reduce((maximum, entry) => Math.max(maximum, entry.state?.epoch || 0), 0) + 1 });
    await repository.savePatternExecutionAdaptation(projectId, record, { timestamp: record.updatedAt, operationKind: "PATTERN_EXECUTION_ADAPTATION_CREATED" });
    return readForProject(repository, projectId, record.id);
  }

  function requireRecord(record) { const report = validatePatternExecutionAdaptation(record); if (!report.valid) throw adaptationError("corrupted_input", "Adaptation snapshot is corrupted.", { errors: report.errors }); }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw adaptationError("revision_conflict", "Adaptation revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw adaptationError("identity_conflict", "Adaptation identity changed."); }
  function finishValidation(errors) { const sorted = errors.sort((left, right) => compare(left.code, right.code) || compare(left.field, right.field)); return freeze({ valid: sorted.length === 0, errors: sorted }); }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function uniqueSorted(values, normalizer, key) { const unique = new Map(); array(values).forEach((value) => { const item = normalizer(value); unique.set(key(item), item); }); return [...unique.values()].sort((left, right) => compare(key(left), key(right))); }
  function normalize(value) { if (value === undefined) return null; if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(compare)) next[key] = normalize(value[key]); return next; } return value; }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function adaptationError(code, message, details) { return new PatternExecutionAdaptationError(code, message, details); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, TARGET_TYPES, OPERATIONS, RISK_LEVELS, CONFIDENCE_LEVELS, IMPACT_DIRECTIONS, IMPACT_COMPONENTS, PRESERVED_CONSTRAINT_TYPES, SOURCE_TYPES, DEFAULT_TIMESTAMP,
    PatternExecutionAdaptationError, canonicalize, fingerprint, normalizeText, normalizeSource, latestCompleted, learningSnapshot, buildSourceIdentities, buildCriticalReferences, calculateIntegrity, constraintConflicts,
    createPatternExecutionAdaptation, setAdaptationTargets, setProposedChanges, setPreservedConstraints, setValidationPlan, setExpectedImpact, setConfidenceAssessment,
    startReview, returnToDraft, completeAdaptation, validatePatternExecutionAdaptation, safeNormalizePatternExecutionAdaptation, projectPatternExecutionAdaptation,
    serializePatternExecutionAdaptation, deserializePatternExecutionAdaptation, remapPatternExecutionAdaptation, makeImportedPatternExecutionAdaptationStale, importPatternExecutionAdaptation,
    loadSource, readForProject, createForProject,
  });
  globalObject.YarnAIPatternExecutionAdaptation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
