"use strict";

(function exposePatternExecutionAdaptationValidation(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_ADAPTATION_VALIDATION";
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const STATUSES = Object.freeze(["draft", "running", "reviewing", "completed"]);
  const VALIDATION_STATUSES = Object.freeze(["pending", "running", "passed", "failed", "blocked", "skipped"]);
  const FINAL_VERDICTS = Object.freeze(["pass", "partial", "failed", "blocked"]);
  const VALIDATION_TYPES = Object.freeze(["model", "model-based", "calculation", "calculation-based", "fixture", "fixture-based", "rule", "rule-based", "human-review", "human-reviewed", "unavailable", "unavailable/blocked"]);
  const IMPACT_STATUSES = Object.freeze(["passed", "failed", "blocked", "partial", "not-yet-observable"]);
  const SOURCE_TYPES = Object.freeze(["project", "calculation", "result", "runtime", "follow_up", "retrospective", "learning", "adaptation"]);
  const IMPACT_COMPONENTS = Object.freeze(["correctness", "usability", "safety", "repeatability", "observability"]);
  const METHOD_TYPES = Object.freeze({
    model: ["model", "model-check", "model-simulation", "model-review"],
    calculation: ["calculation", "calculation-check", "recalculation"],
    fixture: ["fixture", "fixture-check", "fixture-based"],
    rule: ["rule", "rule-check", "rule-based"],
    "human-review": ["human-review", "human-reviewed"],
    unavailable: ["unavailable", "external-action"],
    "model-based": ["model", "model-check", "model-simulation", "model-review"],
    "calculation-based": ["calculation", "calculation-check", "recalculation"],
    "fixture-based": ["fixture", "fixture-check", "fixture-based"],
    "rule-based": ["rule", "rule-check", "rule-based"],
    "human-reviewed": ["human-review", "human-reviewed"],
    "unavailable/blocked": ["unavailable", "external-action"],
  });

  class PatternExecutionAdaptationValidationError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionAdaptationValidationError";
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
      if (!Number.isFinite(value)) throw validationError("corrupted_input", "Validation contains an invalid number.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw validationError("corrupted_input", "Validation contains an unsupported value.");
    if (seen.has(value)) throw validationError("corrupted_input", "Validation cannot contain cyclic data.");
    seen.add(value);
    let output;
    if (Array.isArray(value)) output = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      output = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw validationError("corrupted_input", "Validation accepts canonical JSON objects only.");
    }
    seen.delete(value);
    return output;
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

  function array(value) { return Array.isArray(value) ? value : []; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }
  function validationError(code, message, details) { return new PatternExecutionAdaptationValidationError(code, message, details); }
  function stableStrings(values) { return [...new Set(array(values).map(normalizeText).filter(Boolean))].sort(compare); }
  function stableObjects(values, normalizer, key) {
    return array(values).map(normalizer).sort((left, right) => compare(key(left), key(right)) || compare(canonicalize(left), canonicalize(right)));
  }
  function normalizeObject(value) {
    if (value === undefined) return null;
    if (Array.isArray(value)) return value.map(normalizeObject);
    if (value && typeof value === "object") {
      const next = {};
      for (const key of Object.keys(value).sort(compare)) next[key] = normalizeObject(value[key]);
      return next;
    }
    return value;
  }

  function recordId(value, type = "record") {
    if (!value || typeof value !== "object") return null;
    if (type === "project") return [value.project_id, value.projectId, value.id].map(normalizeText).find(Boolean) || null;
    if (type === "calculation") return [value.calculation_id, value.calculationId, value.id].map(normalizeText).find(Boolean) || null;
    return [value.id, value.resultId, value.project_id, value.calculation_id, value[`${type}Id`]].map(normalizeText).find(Boolean) || null;
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

  function recordStatus(value) { return normalizeText(value?.status || value?.workspace_status || value?.lifecycle?.state || value?.lifecycle) || null; }
  function recordProjectId(value) { return normalizeText(value?.projectId || value?.project_id) || null; }
  function recordCalculationId(value) { return normalizeText(value?.calculationId || value?.calculation_id || value?.sourceCalculationId) || null; }
  function timestampOf(value) { return [value?.completedAt, value?.updatedAt, value?.updated_at, value?.createdAt, value?.created_at].find(isTimestamp) || DEFAULT_TIMESTAMP; }

  function latestCompleted(values) {
    return array(values).filter((entry) => recordStatus(entry) === "completed" && !entry.stale && !entry.quarantined && entry.importedDiagnostic?.reason !== "import_identity_unproven").slice().sort((left, right) =>
      compare(timestampOf(left), timestampOf(right)) || positiveInteger(left.epoch) - positiveInteger(right.epoch) || positiveInteger(left.revision) - positiveInteger(right.revision) || compare(recordId(left), recordId(right))
    ).at(-1) || null;
  }

  function linkedOrLatest(values, linkedId) {
    const completed = array(values).filter((entry) => recordStatus(entry) === "completed");
    return completed.find((entry) => recordId(entry) === normalizeText(linkedId)) || latestCompleted(completed);
  }

  function normalizeSource(source = {}) {
    const adaptation = source.adaptation || linkedOrLatest(source.adaptations, source.adaptationId);
    const learning = source.learning || linkedOrLatest(source.learnings, adaptation?.learningId || source.learningId);
    const retrospective = source.retrospective || linkedOrLatest(source.retrospectives, adaptation?.retrospectiveId || learning?.sourceRetrospectiveId || source.retrospectiveId);
    const followUp = source.followUp || source.follow_up || linkedOrLatest(source.followUps, adaptation?.followUpId || retrospective?.sourceFollowUpId || learning?.sourceFollowUpId);
    const project = source.project || null;
    const projectId = normalizeText(source.projectId || project?.project_id || project?.projectId || adaptation?.projectId) || null;
    const calculation = source.calculation || null;
    const calculationId = normalizeText(source.calculationId || calculation?.calculation_id || project?.active_calculation_id || adaptation?.calculationId) || null;
    return {
      project, projectId, calculation, calculationId, result: source.result || null, runtime: source.runtime || null,
      followUp: followUp || null, followUps: array(source.followUps), retrospective: retrospective || null, retrospectives: array(source.retrospectives),
      learning: learning || null, learnings: array(source.learnings), adaptation: adaptation || null, adaptations: array(source.adaptations),
    };
  }

  function sourceRecords(source) {
    const normalized = normalizeSource(source);
    return { project: normalized.project, calculation: normalized.calculation, result: normalized.result, runtime: normalized.runtime, follow_up: normalized.followUp, retrospective: normalized.retrospective, learning: normalized.learning, adaptation: normalized.adaptation };
  }

  function sourceReference(sourceType, value) {
    if (!value || typeof value !== "object") return null;
    const identityScoped = ["project", "calculation"].includes(sourceType);
    return normalizeObject({
      sourceType, sourceId: recordId(value, sourceType), identity: recordIdentity(value, sourceType), projectId: recordProjectId(value), calculationId: recordCalculationId(value),
      revision: identityScoped ? null : positiveInteger(value.revision) || null, epoch: identityScoped ? null : positiveInteger(value.epoch) || null, status: identityScoped ? null : recordStatus(value),
    });
  }

  function buildSourceIdentities(source) {
    const records = sourceRecords(source);
    return normalizeObject(Object.fromEntries(SOURCE_TYPES.map((type) => [type, recordIdentity(records[type], type)])));
  }

  function buildCriticalReferences(source) {
    const records = sourceRecords(source);
    return SOURCE_TYPES.map((type) => sourceReference(type, records[type])).filter(Boolean).sort((left, right) => compare(left.sourceType, right.sourceType));
  }

  function adaptationSnapshot(adaptation) {
    if (!adaptation || typeof adaptation !== "object") return null;
    return normalizeObject({
      adaptationId: recordId(adaptation, "adaptation"), identity: recordIdentity(adaptation, "adaptation"), revision: positiveInteger(adaptation.revision) || null,
      status: recordStatus(adaptation), adaptationTargets: clone(array(adaptation.adaptationTargets)), proposedChanges: clone(array(adaptation.proposedChanges)),
      preservedConstraints: clone(array(adaptation.preservedConstraints)), validationPlan: clone(adaptation.validationPlan || {}), expectedImpact: clone(adaptation.expectedImpact || {}),
      confidenceAssessment: clone(adaptation.confidenceAssessment || {}), criticalReferences: clone(array(adaptation.criticalReferences)),
    });
  }

  function declaredValidationPlan(adaptation) {
    const plan = adaptation?.validationPlan || {};
    const flatten = (values, idField, category, required) => array(values).map((entry) => ({
      planItemId: normalizeText(entry?.[idField]), category, description: normalizeText(entry?.description), proposedChangeIds: stableStrings(entry?.proposedChangeIds),
      required, requiresEvidence: required,
    }));
    return [...flatten(plan.checks, "checkId", "check", true), ...flatten(plan.acceptanceCriteria, "criterionId", "acceptance", true), ...flatten(plan.rollbackCriteria, "criterionId", "rollback", false)]
      .sort((left, right) => compare(left.planItemId, right.planItemId));
  }

  function constraintDefinitions(adaptation) {
    return array(adaptation?.preservedConstraints).map((entry) => {
      const constraintType = normalizeText(entry?.constraintType).toLowerCase();
      const sourceReference = stableStrings(entry?.protectedReferences)[0] || `adaptation.preservedConstraints.${constraintType}`;
      return { constraintId: `constraint:${fingerprint({ constraintType, sourceReference }).slice(8)}`, constraintType, sourceReference, required: true };
    }).sort((left, right) => compare(left.constraintId, right.constraintId));
  }

  function expectedImpactDefinitions(adaptation) {
    const impact = adaptation?.expectedImpact || {};
    return IMPACT_COMPONENTS.filter((component) => impact[component]).map((component) => ({
      impactId: `impact:${component}`, metricOrOutcome: component, expected: normalizeObject(impact[component]), required: true,
    }));
  }

  function normalizeEvidenceReference(value) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const sourceType = normalizeText(item.sourceType || item.type).toLowerCase();
    const sourceId = normalizeText(item.sourceId || item.recordId || item.fixtureId);
    const identity = normalizeText(item.identity || item.fingerprint);
    const location = normalizeText(item.location);
    const assertion = normalizeText(item.assertion || item.finding);
    const evidenceId = normalizeText(item.evidenceId || item.referenceId || item.id) || (sourceType && sourceId ? `evidence:${fingerprint({ sourceType, sourceId, identity, location, assertion }).slice(8)}` : "");
    return { evidenceId, sourceType, sourceId, identity: identity || null, location: location || null, assertion: assertion || null };
  }

  function normalizeEvidenceReferences(values) {
    const entries = stableObjects(values, normalizeEvidenceReference, (item) => item.evidenceId);
    const unique = new Map(entries.map((entry) => [entry.evidenceId, entry]));
    return [...unique.values()];
  }

  function normalizeIssue(value) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return { code: normalizeText(item.code), severity: normalizeText(item.severity || "warning").toLowerCase(), reason: normalizeText(item.reason), reference: normalizeText(item.reference) || null, critical: item.critical === true };
  }

  function normalizeIssues(values) { return stableObjects(values, normalizeIssue, (item) => `${item.code}\u0000${item.reference || ""}`); }

  function normalizeExecutedValidation(value) {
    const item = value && typeof value === "object" ? value : {};
    const planItemId = normalizeText(item.planItemId);
    const validationType = normalizeText(item.validationType).toLowerCase();
    const targetReference = normalizeText(item.targetReference);
    const method = normalizeText(item.method).toLowerCase();
    const validationId = normalizeText(item.validationId) || `validation:${fingerprint({ planItemId, validationType, targetReference, method }).slice(8)}`;
    return {
      validationId, planItemId, validationType, targetReference, method, inputs: normalizeContent(item.inputs ?? null), expectedOutcome: normalizeContent(item.expectedOutcome ?? null),
      actualOutcome: normalizeContent(item.actualOutcome ?? null), evidenceReferences: normalizeEvidenceReferences(item.evidenceReferences), constraintReferences: stableStrings(item.constraintReferences),
      startedAt: isTimestamp(item.startedAt) ? item.startedAt : null, completedAt: isTimestamp(item.completedAt) ? item.completedAt : null,
      status: normalizeText(item.status || "pending").toLowerCase(), issues: normalizeIssues(item.issues),
    };
  }

  function normalizeConstraintResult(value) {
    const item = value && typeof value === "object" ? value : {};
    return { constraintId: normalizeText(item.constraintId), sourceReference: normalizeText(item.sourceReference), validationStatus: normalizeText(item.validationStatus).toLowerCase(), evidenceReferences: normalizeEvidenceReferences(item.evidenceReferences), observedImpact: normalizeContent(item.observedImpact ?? null), issues: normalizeIssues(item.issues) };
  }

  function normalizeRegressionResult(value) {
    const item = value && typeof value === "object" ? value : {};
    const area = normalizeText(item.area);
    const baselineReference = normalizeEvidenceReference(item.baselineReference);
    const candidateReference = normalizeEvidenceReference(item.candidateReference);
    const method = normalizeText(item.method).toLowerCase();
    const regressionId = normalizeText(item.regressionId) || `regression:${fingerprint({ area, baselineReference, candidateReference, method }).slice(8)}`;
    return { regressionId, area, baselineReference, candidateReference, method, expectedInvariant: normalizeContent(item.expectedInvariant ?? null), observedResult: normalizeContent(item.observedResult ?? null), evidenceReferences: normalizeEvidenceReferences(item.evidenceReferences), status: normalizeText(item.status).toLowerCase(), issues: normalizeIssues(item.issues) };
  }

  function normalizeImpactResult(value) {
    const item = value && typeof value === "object" ? value : {};
    return { impactId: normalizeText(item.impactId), metricOrOutcome: normalizeText(item.metricOrOutcome), baseline: normalizeContent(item.baseline ?? null), expected: normalizeContent(item.expected ?? null), observed: normalizeContent(item.observed ?? null), comparisonMethod: normalizeText(item.comparisonMethod), evidenceReferences: normalizeEvidenceReferences(item.evidenceReferences), status: normalizeText(item.status).toLowerCase(), limitations: normalizeIssues(item.limitations) };
  }

  function normalizeUnresolvedItem(value) {
    const item = value && typeof value === "object" ? value : {};
    const reason = normalizeText(item.reason);
    const sourceReference = normalizeText(item.sourceReference);
    const itemId = normalizeText(item.itemId) || `unresolved:${fingerprint({ reason, sourceReference }).slice(8)}`;
    return { itemId, sourceReference, reason, severity: normalizeText(item.severity || "warning").toLowerCase(), status: normalizeText(item.status || "open").toLowerCase() };
  }

  function normalizeEvidenceSummaryItem(value) {
    const item = value && typeof value === "object" ? value : {};
    const finding = normalizeText(item.finding);
    const evidenceReferences = normalizeEvidenceReferences(item.evidenceReferences);
    const evidenceSummaryId = normalizeText(item.evidenceSummaryId) || `evidence-summary:${fingerprint({ finding, evidenceReferences }).slice(8)}`;
    return { evidenceSummaryId, finding, evidenceReferences, limitations: normalizeIssues(item.limitations) };
  }

  function normalizeConfidenceAssessment(value = {}) {
    const item = value && typeof value === "object" ? value : {};
    return { level: normalizeText(item.level || "low").toLowerCase(), rationale: normalizeText(item.rationale), evidenceReferences: normalizeEvidenceReferences(item.evidenceReferences || item.supportingReferences), limitations: normalizeIssues(item.limitations) };
  }

  function calculateValidationCoverage(declaredPlan, executedValidations) {
    const required = array(declaredPlan).filter((entry) => entry.required === true);
    const byPlanItem = new Map();
    for (const item of array(executedValidations)) if (!byPlanItem.has(item.planItemId)) byPlanItem.set(item.planItemId, item);
    const count = (status) => required.filter((entry) => byPlanItem.get(entry.planItemId)?.status === status).length;
    const totalRequired = required.length;
    const executedRequired = required.filter((entry) => byPlanItem.has(entry.planItemId) && !["pending", "running"].includes(byPlanItem.get(entry.planItemId).status)).length;
    const passedRequired = count("passed");
    const failedRequired = count("failed");
    const blockedRequired = count("blocked");
    const skippedRequired = count("skipped");
    return freeze({
      totalRequired, executedRequired, passedRequired, failedRequired, blockedRequired, skippedRequired,
      coverageBasisPoints: totalRequired ? Math.floor((executedRequired * 10000) / totalRequired) : 0,
      passBasisPoints: totalRequired ? Math.floor((passedRequired * 10000) / totalRequired) : 0,
      coverageRatio: `${executedRequired}/${totalRequired}`, passRatio: `${passedRequired}/${totalRequired}`,
      uncoveredPlanItemIds: required.filter((entry) => !byPlanItem.has(entry.planItemId) || ["pending", "running"].includes(byPlanItem.get(entry.planItemId).status)).map((entry) => entry.planItemId).sort(compare),
    });
  }

  function issue(code, sourceType, sourceId = null) { return { code, severity: "critical", sourceType, sourceId }; }

  function calculateIntegrity(source = {}, record = null) {
    const normalized = normalizeSource(source);
    const records = sourceRecords(normalized);
    const issues = [];
    for (const type of SOURCE_TYPES) {
      const value = records[type];
      if (!value) { issues.push(issue("missing_source", type)); continue; }
      const id = recordId(value, type);
      if (!recordIdentity(value, type)) issues.push(issue("identity_unconfirmed", type, id));
      if (value.stale === true || value.quarantined === true || value.importedDiagnostic?.reason === "import_identity_unproven" || ["stale", "corrupted"].includes(recordStatus(value))) issues.push(issue("stale_source", type, id));
      if (!["project", "calculation", "result"].includes(type) && recordStatus(value) !== "completed") issues.push(issue(`${type}_not_completed`, type, id));
      if (recordProjectId(value) && recordProjectId(value) !== normalized.projectId) issues.push(issue("project_mismatch", type, id));
      if (recordCalculationId(value) && recordCalculationId(value) !== normalized.calculationId) issues.push(issue("calculation_mismatch", type, id));
    }
    if (normalized.result && !["ready", "completed"].includes(recordStatus(normalized.result))) issues.push(issue("result_not_terminal", "result", recordId(normalized.result)));
    if (normalized.runtime && normalized.result && normalizeText(normalized.runtime.sourceResultId) !== recordId(normalized.result, "result")) issues.push(issue("result_runtime_mismatch", "runtime", recordId(normalized.runtime)));
    if (normalized.retrospective) for (const [field, value, type] of [["sourceResultId", normalized.result, "result"], ["sourceRuntimeId", normalized.runtime, "runtime"], ["sourceFollowUpId", normalized.followUp, "follow_up"]]) if (value && normalizeText(normalized.retrospective[field]) !== recordId(value, type)) issues.push(issue("source_link_mismatch", "retrospective", recordId(normalized.retrospective)));
    if (normalized.learning) for (const [field, value, type] of [["sourceResultId", normalized.result, "result"], ["sourceRuntimeId", normalized.runtime, "runtime"], ["sourceFollowUpId", normalized.followUp, "follow_up"], ["sourceRetrospectiveId", normalized.retrospective, "retrospective"]]) if (value && normalizeText(normalized.learning[field]) !== recordId(value, type)) issues.push(issue("source_link_mismatch", "learning", recordId(normalized.learning)));
    if (normalized.adaptation) for (const [field, value, type] of [["resultId", normalized.result, "result"], ["runtimeId", normalized.runtime, "runtime"], ["followUpId", normalized.followUp, "follow_up"], ["retrospectiveId", normalized.retrospective, "retrospective"], ["learningId", normalized.learning, "learning"]]) if (value && normalizeText(normalized.adaptation[field]) !== recordId(value, type)) issues.push(issue("source_link_mismatch", "adaptation", recordId(normalized.adaptation)));
    const latestFollowUp = latestCompleted(normalized.followUps);
    const latestLearning = latestCompleted(normalized.learnings);
    const latestAdaptation = latestCompleted(normalized.adaptations);
    if (latestFollowUp && normalized.followUp && recordId(latestFollowUp) !== recordId(normalized.followUp)) issues.push(issue("older_follow_up_selected", "follow_up", recordId(normalized.followUp)));
    if (latestLearning && normalized.learning && recordId(latestLearning) !== recordId(normalized.learning)) issues.push(issue("older_learning_selected", "learning", recordId(normalized.learning)));
    if (latestAdaptation && normalized.adaptation && recordId(latestAdaptation) !== recordId(normalized.adaptation)) issues.push(issue("older_adaptation_selected", "adaptation", recordId(normalized.adaptation)));
    if (normalized.adaptation?.sourceIdentities) {
      const actual = buildSourceIdentities({ ...normalized, adaptation: null });
      for (const type of SOURCE_TYPES.slice(0, -1)) if (normalizeText(normalized.adaptation.sourceIdentities[type]) !== normalizeText(actual[type])) issues.push(issue("adaptation_source_identity_mismatch", type, recordId(records[type], type)));
    }
    const adaptationApi = globalObject.YarnAIPatternExecutionAdaptation;
    if (normalized.adaptation && adaptationApi?.validatePatternExecutionAdaptation) {
      const report = adaptationApi.validatePatternExecutionAdaptation(normalized.adaptation);
      if (!report.valid) issues.push(issue("adaptation_domain_invalid", "adaptation", recordId(normalized.adaptation, "adaptation")));
      if (adaptationApi.calculateIntegrity && !adaptationApi.calculateIntegrity(normalized, normalized.adaptation, { includeContent: false }).valid) issues.push(issue("adaptation_integrity_invalid", "adaptation", recordId(normalized.adaptation, "adaptation")));
    }
    if (record) {
      if (record.adaptationId !== recordId(normalized.adaptation, "adaptation") || record.adaptationIdentity !== recordIdentity(normalized.adaptation, "adaptation")) issues.push(issue("wrong_adaptation", "adaptation", record.adaptationId));
      if (canonicalize(record.adaptationSnapshot) !== canonicalize(adaptationSnapshot(normalized.adaptation))) issues.push(issue("adaptation_snapshot_mismatch", "adaptation", record.adaptationId));
      const identities = buildSourceIdentities(normalized);
      for (const type of SOURCE_TYPES) if (normalizeText(record.sourceIdentities?.[type]) !== normalizeText(identities[type])) issues.push(issue("source_identity_mismatch", type, recordId(records[type], type)));
      if (canonicalize(array(record.criticalReferences)) !== canonicalize(buildCriticalReferences(normalized))) issues.push(issue("broken_critical_reference", "validation", record.id));
      if (record.stale === true || record.quarantined === true || record.importedDiagnostic?.reason === "import_identity_unproven") issues.push(issue("validation_untrusted", "validation", record.id));
    }
    const unique = new Map(issues.map((entry) => [canonicalize(entry), entry]));
    const sorted = [...unique.values()].sort((left, right) => compare(left.code, right.code) || compare(left.sourceType, right.sourceType) || compare(left.sourceId, right.sourceId));
    return freeze({ valid: sorted.length === 0, criticalIssues: sorted, issues: sorted, criticalChainComplete: !sorted.some((entry) => entry.code === "missing_source") });
  }

  function methodMatches(validationType, method) { return array(METHOD_TYPES[validationType]).includes(method); }
  function evidenceValid(reference) { return Boolean(reference?.evidenceId && reference?.sourceType && reference?.sourceId); }

  function contentErrors(record, completion = false) {
    const errors = [];
    const invalid = (code, field = null) => errors.push({ code, field });
    const declaredItems = array(record.declaredValidationPlan);
    const validations = array(record.executedValidations);
    const constraints = array(record.constraintResults);
    const regressions = array(record.regressionResults);
    const impacts = array(record.expectedImpactResults);
    const unresolved = array(record.unresolvedItems);
    const planIds = declaredItems.map((entry) => entry.planItemId);
    if (planIds.some((id) => !id) || new Set(planIds).size !== planIds.length) invalid("declared_plan_duplicate_or_invalid", "declaredValidationPlan");
    if (record.adaptationSnapshot && canonicalize(declaredItems) !== canonicalize(declaredValidationPlan({ validationPlan: record.adaptationSnapshot.validationPlan }))) invalid("declared_plan_mismatch", "declaredValidationPlan");
    const targetReferences = new Set([...array(record.adaptationSnapshot?.adaptationTargets).map((entry) => normalizeText(entry.targetReference)), ...array(record.adaptationSnapshot?.proposedChanges).map((entry) => normalizeText(entry.targetReference))]);
    const executedPlanIds = validations.map((entry) => entry.planItemId);
    if (new Set(executedPlanIds).size !== executedPlanIds.length) invalid("duplicate_plan_item_id", "executedValidations");
    const constraintIds = new Set(constraintDefinitionsFromRecord(record).map((entry) => entry.constraintId));
    for (const item of validations) {
      const planItem = declaredItems.find((entry) => entry.planItemId === item.planItemId);
      if (!planItem) invalid("unknown_plan_item_id", item.planItemId);
      if (!item.validationId || !VALIDATION_TYPES.includes(item.validationType) || !methodMatches(item.validationType, item.method)) invalid("validation_method_invalid", item.validationId || item.planItemId);
      if (!item.targetReference || !targetReferences.has(item.targetReference)) invalid("validation_target_mismatch", item.validationId || item.planItemId);
      if (!VALIDATION_STATUSES.includes(item.status)) invalid("validation_status_invalid", item.validationId || item.planItemId);
      if (item.evidenceReferences.some((entry) => !evidenceValid(entry))) invalid("evidence_reference_invalid", item.validationId || item.planItemId);
      if (item.constraintReferences.some((entry) => !constraintIds.has(entry))) invalid("unknown_constraint_reference", item.validationId || item.planItemId);
      if (["failed", "blocked", "skipped"].includes(item.status) && !item.issues.length) invalid("validation_reason_required", item.validationId || item.planItemId);
      if (["passed", "failed", "blocked", "skipped"].includes(item.status) && (!isTimestamp(item.startedAt) || !isTimestamp(item.completedAt))) invalid("validation_timestamp_invalid", item.validationId || item.planItemId);
      if (completion && planItem?.requiresEvidence && item.status === "passed" && !item.evidenceReferences.length) invalid("required_evidence_missing", item.validationId || item.planItemId);
    }
    const definitions = constraintDefinitionsFromRecord(record);
    const definitionIds = new Set(definitions.map((entry) => entry.constraintId));
    if (new Set(constraints.map((entry) => entry.constraintId)).size !== constraints.length) invalid("duplicate_constraint_id", "constraintResults");
    for (const result of constraints) {
      const definition = definitions.find((entry) => entry.constraintId === result.constraintId);
      if (!definitionIds.has(result.constraintId)) invalid("unknown_constraint_id", result.constraintId);
      if (definition && result.sourceReference !== definition.sourceReference) invalid("constraint_source_mismatch", result.constraintId);
      if (!VALIDATION_STATUSES.includes(result.validationStatus)) invalid("constraint_status_invalid", result.constraintId);
      if (result.evidenceReferences.some((entry) => !evidenceValid(entry))) invalid("evidence_reference_invalid", result.constraintId);
      if (["failed", "blocked", "skipped"].includes(result.validationStatus) && !result.issues.length) invalid("constraint_issue_required", result.constraintId);
    }
    if (new Set(regressions.map((entry) => entry.regressionId)).size !== regressions.length) invalid("duplicate_regression_id", "regressionResults");
    for (const result of regressions) {
      if (!result.regressionId || !result.area || !evidenceValid(result.baselineReference) || !evidenceValid(result.candidateReference) || !result.method || result.expectedInvariant === null || result.observedResult === null || !VALIDATION_STATUSES.includes(result.status)) invalid("regression_result_invalid", result.regressionId || null);
      if (result.evidenceReferences.some((entry) => !evidenceValid(entry))) invalid("evidence_reference_invalid", result.regressionId);
      if (["failed", "blocked", "skipped"].includes(result.status) && !result.issues.length) invalid("regression_issue_required", result.regressionId);
    }
    const impactDefinitions = expectedImpactDefinitionsFromRecord(record);
    const impactIds = new Set(impactDefinitions.map((entry) => entry.impactId));
    if (new Set(impacts.map((entry) => entry.impactId)).size !== impacts.length) invalid("duplicate_impact_id", "expectedImpactResults");
    for (const result of impacts) {
      const definition = impactDefinitions.find((entry) => entry.impactId === result.impactId);
      if (!impactIds.has(result.impactId) || !result.metricOrOutcome || definition?.metricOrOutcome !== result.metricOrOutcome || !result.comparisonMethod || !IMPACT_STATUSES.includes(result.status)) invalid("expected_impact_result_invalid", result.impactId || null);
      if (definition && canonicalize(result.expected) !== canonicalize(definition.expected)) invalid("expected_impact_mismatch", result.impactId);
      if (result.evidenceReferences.some((entry) => !evidenceValid(entry))) invalid("evidence_reference_invalid", result.impactId);
      if (["blocked", "partial", "not-yet-observable"].includes(result.status) && !result.limitations.length) invalid("impact_limitation_required", result.impactId);
    }
    if (completion) {
      const coverage = calculateValidationCoverage(declaredItems, validations);
      if (coverage.executedRequired !== coverage.totalRequired) invalid("required_plan_item_uncovered", coverage.uncoveredPlanItemIds.join(","));
      if (validations.some((entry) => ["pending", "running"].includes(entry.status))) invalid("active_validation_at_completion", "executedValidations");
      for (const definition of definitions) if (!constraints.some((entry) => entry.constraintId === definition.constraintId) || ["pending", "running"].includes(constraints.find((entry) => entry.constraintId === definition.constraintId)?.validationStatus)) invalid("constraint_result_missing", definition.constraintId);
      if (!regressions.length) invalid("regression_validation_required", "regressionResults");
      for (const definition of impactDefinitions) if (!impacts.some((entry) => entry.impactId === definition.impactId)) invalid("expected_impact_result_missing", definition.impactId);
      if (!record.confidenceAssessment?.rationale) invalid("confidence_assessment_required", "confidenceAssessment");
      if (record.finalVerdict === "pass") {
        if (regressions.some((entry) => entry.status !== "passed") || regressions.some((entry) => !entry.evidenceReferences.length)) invalid("regression_pass_unproven", "regressionResults");
        if (impacts.some((entry) => entry.status !== "passed" || !entry.evidenceReferences.length)) invalid("expected_impact_pass_unproven", "expectedImpactResults");
        if (constraints.some((entry) => entry.validationStatus !== "passed" || !entry.evidenceReferences.length)) invalid("constraint_pass_unproven", "constraintResults");
      }
      if (record.finalVerdict === "partial" && !unresolved.length && !impacts.some((entry) => entry.limitations.length) && !regressions.some((entry) => entry.issues.length) && !array(record.confidenceAssessment?.limitations).length && !array(record.evidenceSummary).some((entry) => array(entry.limitations).length)) invalid("partial_limitation_required", "unresolvedItems");
    }
    return errors;
  }

  function constraintDefinitionsFromRecord(record) {
    return array(record.adaptationSnapshot?.preservedConstraints).map((entry) => {
      const constraintType = normalizeText(entry.constraintType).toLowerCase();
      const sourceReference = stableStrings(entry.protectedReferences)[0] || `adaptation.preservedConstraints.${constraintType}`;
      return { constraintId: `constraint:${fingerprint({ constraintType, sourceReference }).slice(8)}`, constraintType, sourceReference, required: true };
    }).sort((left, right) => compare(left.constraintId, right.constraintId));
  }

  function expectedImpactDefinitionsFromRecord(record) {
    const impact = record.adaptationSnapshot?.expectedImpact || {};
    return IMPACT_COMPONENTS.filter((component) => impact[component]).map((component) => ({ impactId: `impact:${component}`, metricOrOutcome: component, expected: impact[component], required: true }));
  }

  function deriveFinalVerdict(record) {
    const failures = [
      ...array(record.executedValidations).filter((entry) => entry.status === "failed"),
      ...array(record.constraintResults).filter((entry) => entry.validationStatus === "failed"),
      ...array(record.regressionResults).filter((entry) => entry.status === "failed"),
      ...array(record.expectedImpactResults).filter((entry) => entry.status === "failed"),
    ];
    const allIssues = [...array(record.executedValidations).flatMap((entry) => array(entry.issues)), ...array(record.constraintResults).flatMap((entry) => array(entry.issues)), ...array(record.regressionResults).flatMap((entry) => array(entry.issues))];
    const criticalIssues = [...allIssues, ...array(record.unresolvedItems).filter((entry) => entry.status !== "resolved")].filter((entry) => entry.critical === true || entry.severity === "critical");
    if (failures.length || criticalIssues.length || allIssues.some((entry) => entry.code === "evidence_contradicts_proposed_change")) return "failed";
    const requiredIds = new Set(array(record.declaredValidationPlan).filter((entry) => entry.required).map((entry) => entry.planItemId));
    if (array(record.executedValidations).some((entry) => requiredIds.has(entry.planItemId) && ["blocked", "skipped"].includes(entry.status)) || array(record.constraintResults).some((entry) => ["blocked", "skipped"].includes(entry.validationStatus)) || array(record.expectedImpactResults).some((entry) => entry.status === "blocked")) return "blocked";
    const optionalIncomplete = array(record.declaredValidationPlan).filter((entry) => !entry.required).some((entry) => !array(record.executedValidations).some((result) => result.planItemId === entry.planItemId && result.status === "passed"));
    const deferredImpact = array(record.expectedImpactResults).some((entry) => ["partial", "not-yet-observable"].includes(entry.status));
    const openItems = array(record.unresolvedItems).some((entry) => entry.status !== "resolved");
    if (optionalIncomplete || deferredImpact || openItems || array(record.regressionResults).some((entry) => ["blocked", "skipped"].includes(entry.status))) return "partial";
    return "pass";
  }

  function verdictReasons(record, verdict) {
    const reasons = [];
    const add = (code, references) => reasons.push({ code, references: stableStrings(references) });
    const statusRefs = (values, field, status) => values.filter((entry) => entry[field] === status).map((entry) => entry.validationId || entry.constraintId || entry.regressionId || entry.impactId);
    if (verdict === "pass") add("all_required_evidence_confirmed", record.executedValidations.map((entry) => entry.validationId));
    for (const status of ["failed", "blocked", "skipped"]) {
      const refs = [...statusRefs(record.executedValidations, "status", status), ...statusRefs(record.constraintResults, "validationStatus", status), ...statusRefs(record.regressionResults, "status", status), ...statusRefs(record.expectedImpactResults, "status", status)];
      if (refs.length) add(`${status}_results_present`, refs);
    }
    if (record.expectedImpactResults.some((entry) => ["partial", "not-yet-observable"].includes(entry.status))) add("expected_impact_not_fully_observable", record.expectedImpactResults.filter((entry) => ["partial", "not-yet-observable"].includes(entry.status)).map((entry) => entry.impactId));
    if (record.unresolvedItems.some((entry) => entry.status !== "resolved")) add("unresolved_items_present", record.unresolvedItems.filter((entry) => entry.status !== "resolved").map((entry) => entry.itemId));
    return reasons.sort((left, right) => compare(left.code, right.code));
  }

  function identityPayload(record) {
    return {
      projectId: record.projectId, calculationId: record.calculationId, resultId: record.resultId, runtimeId: record.runtimeId, followUpId: record.followUpId, retrospectiveId: record.retrospectiveId,
      learningId: record.learningId, adaptationId: record.adaptationId, adaptationValidationId: record.adaptationValidationId, epoch: record.epoch, status: record.status, scope: record.scope,
      sourceIdentities: record.sourceIdentities, adaptationIdentity: record.adaptationIdentity, criticalReferences: record.criticalReferences, adaptationSnapshot: record.adaptationSnapshot,
      declaredValidationPlan: record.declaredValidationPlan, executedValidations: record.executedValidations, validationCoverage: record.validationCoverage, constraintResults: record.constraintResults,
      regressionResults: record.regressionResults, expectedImpactResults: record.expectedImpactResults, unresolvedItems: record.unresolvedItems, evidenceSummary: record.evidenceSummary,
      finalVerdict: record.finalVerdict, verdictReasons: record.verdictReasons, confidenceAssessment: record.confidenceAssessment,
    };
  }

  function finalize(record) {
    record.scope = normalizeObject(record.scope);
    record.sourceIdentities = normalizeObject(record.sourceIdentities);
    record.criticalReferences = array(record.criticalReferences).map(normalizeContent).sort((left, right) => compare(left.sourceType, right.sourceType));
    record.adaptationSnapshot = normalizeObject(record.adaptationSnapshot);
    record.declaredValidationPlan = array(record.declaredValidationPlan).map(normalizeObject).sort((left, right) => compare(left.planItemId, right.planItemId));
    record.executedValidations = array(record.executedValidations).map(normalizeExecutedValidation);
    record.validationCoverage = calculateValidationCoverage(record.declaredValidationPlan, record.executedValidations);
    record.constraintResults = stableObjects(record.constraintResults, normalizeConstraintResult, (item) => item.constraintId);
    record.regressionResults = stableObjects(record.regressionResults, normalizeRegressionResult, (item) => item.regressionId);
    record.expectedImpactResults = stableObjects(record.expectedImpactResults, normalizeImpactResult, (item) => item.impactId);
    record.unresolvedItems = stableObjects(record.unresolvedItems, normalizeUnresolvedItem, (item) => item.itemId);
    record.evidenceSummary = stableObjects(record.evidenceSummary, normalizeEvidenceSummaryItem, (item) => item.evidenceSummaryId);
    record.verdictReasons = array(record.verdictReasons).map((entry) => ({ code: normalizeText(entry?.code), references: stableStrings(entry?.references) })).sort((left, right) => compare(left.code, right.code));
    record.confidenceAssessment = normalizeConfidenceAssessment(record.confidenceAssessment);
    record.identity = fingerprint(identityPayload(record));
    return freeze(record);
  }

  function createPatternExecutionAdaptationValidation(source = {}, input = {}) {
    const normalized = normalizeSource(source);
    const integrity = calculateIntegrity(normalized);
    if (!normalized.adaptation || recordStatus(normalized.adaptation) !== "completed") throw validationError("completed_adaptation_required", "A completed adaptation is required before validation can be created.");
    if (!integrity.valid) throw validationError("critical_integrity", "The completed adaptation source chain is incomplete or inconsistent.", { issues: integrity.criticalIssues });
    const epoch = positiveInteger(input.epoch) || 1;
    const timestamp = deterministicTimestamp(input.now, normalized.adaptation.completedAt, normalized.adaptation.updatedAt);
    const adaptationId = recordId(normalized.adaptation, "adaptation");
    const adaptationIdentity = recordIdentity(normalized.adaptation, "adaptation");
    const id = normalizeText(input.id || input.adaptationValidationId) || `adaptation-validation:${fingerprint({ projectId: normalized.projectId, adaptationId, adaptationIdentity, epoch }).slice(8)}`;
    const record = {
      id, adaptationValidationId: id, kind: PROGRESS_KIND, type: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      projectId: normalized.projectId, calculationId: normalized.calculationId, resultId: recordId(normalized.result, "result"), runtimeId: recordId(normalized.runtime, "runtime"),
      followUpId: recordId(normalized.followUp, "follow_up"), retrospectiveId: recordId(normalized.retrospective, "retrospective"), learningId: recordId(normalized.learning, "learning"), adaptationId,
      status: "draft", scope: { projectId: normalized.projectId, calculationId: normalized.calculationId, adaptationId, targetReferences: stableStrings([...array(normalized.adaptation.adaptationTargets).map((entry) => entry.targetReference), ...array(normalized.adaptation.proposedChanges).map((entry) => entry.targetReference)]) },
      sourceIdentities: buildSourceIdentities(normalized), adaptationIdentity, criticalReferences: buildCriticalReferences(normalized), adaptationSnapshot: adaptationSnapshot(normalized.adaptation),
      declaredValidationPlan: declaredValidationPlan(normalized.adaptation), executedValidations: [], validationCoverage: null, constraintResults: [], regressionResults: [], expectedImpactResults: [],
      unresolvedItems: [], evidenceSummary: [], finalVerdict: null, verdictReasons: [], confidenceAssessment: {},
      createdAt: timestamp, updatedAt: timestamp, startedAt: null, reviewedAt: null, completedAt: null, revision: 1, epoch, identity: null,
      integrity, audit: [{ event: "created", at: timestamp, revision: 1 }], stale: false, quarantined: false, importedDiagnostic: null,
    };
    const next = finalize(record);
    requireRecord(next);
    return next;
  }

  function checkConcurrency(record, command = {}) {
    if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw validationError("revision_conflict", "Validation revision changed.");
    if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw validationError("identity_conflict", "Validation identity changed.");
  }

  function edit(record, field, value, event, command = {}) {
    requireRecord(record);
    if (record.status === "completed") throw validationError("terminal_validation", "Completed validation is immutable.");
    if (record.status !== "running") throw validationError("running_required", "Validation results can only be changed while validation is running.");
    checkConcurrency(record, command);
    if (field === "executedValidations") {
      const nextIds = new Set(array(value).map((entry) => normalizeText(entry?.planItemId)));
      const requiredIds = new Set(record.declaredValidationPlan.filter((entry) => entry.required).map((entry) => entry.planItemId));
      for (const previous of record.executedValidations) if (requiredIds.has(previous.planItemId) && !nextIds.has(previous.planItemId)) throw validationError("required_validation_removal", "A required validation result cannot be removed.", { planItemId: previous.planItemId });
    }
    const next = clone(record);
    next[field] = clone(value);
    next.finalVerdict = null;
    next.verdictReasons = [];
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, record.updatedAt);
    next.audit.push({ event, at: next.updatedAt, revision: next.revision });
    const finished = finalize(next);
    requireRecord(finished);
    return finished;
  }

  function setExecutedValidations(record, values, command = {}) { return edit(record, "executedValidations", values, "executed_validations_changed", command); }
  function upsertExecutedValidation(record, value, command = {}) {
    const normalized = normalizeExecutedValidation(value);
    const values = record.executedValidations.slice();
    const index = values.findIndex((entry) => entry.validationId === normalized.validationId || entry.planItemId === normalized.planItemId);
    if (index < 0) values.push(normalized); else values[index] = normalized;
    return setExecutedValidations(record, values, command);
  }
  function setConstraintResults(record, values, command = {}) { return edit(record, "constraintResults", values, "constraint_results_changed", command); }
  function setRegressionResults(record, values, command = {}) { return edit(record, "regressionResults", values, "regression_results_changed", command); }
  function setExpectedImpactResults(record, values, command = {}) { return edit(record, "expectedImpactResults", values, "expected_impact_results_changed", command); }
  function setUnresolvedItems(record, values, command = {}) { return edit(record, "unresolvedItems", values, "unresolved_items_changed", command); }
  function setEvidenceSummary(record, values, command = {}) { return edit(record, "evidenceSummary", values, "evidence_summary_changed", command); }
  function setConfidenceAssessment(record, value, command = {}) { return edit(record, "confidenceAssessment", value, "confidence_assessment_changed", command); }

  function transition(record, nextStatus, source = null, command = {}) {
    requireRecord(record);
    checkConcurrency(record, command);
    if (record.status === "completed") throw validationError("terminal_validation", "Completed validation is immutable.");
    const allowed = { draft: ["running"], running: ["draft", "reviewing"], reviewing: ["running", "draft", "completed"] };
    if (!array(allowed[record.status]).includes(nextStatus)) throw validationError("invalid_transition", `Cannot transition ${record.status} to ${nextStatus}.`);
    if (record.stale || record.quarantined || record.importedDiagnostic?.reason === "import_identity_unproven") throw validationError("stale_validation", "Stale or imported-unproven validation cannot transition.");
    const currentIntegrity = source ? calculateIntegrity(source, record) : record.integrity;
    if (nextStatus === "reviewing") {
      const coverage = calculateValidationCoverage(record.declaredValidationPlan, record.executedValidations);
      if (coverage.executedRequired !== coverage.totalRequired || record.executedValidations.some((entry) => ["pending", "running"].includes(entry.status))) throw validationError("minimum_validations_incomplete", "All required validations must have terminal results before review.", { coverage });
    }
    if (nextStatus === "completed") {
      if (!source) throw validationError("source_required", "The current full source chain is required for completion.");
      if (!currentIntegrity.valid) throw validationError("critical_integrity", "The source chain or adaptation snapshot is stale or inconsistent.", { issues: currentIntegrity.criticalIssues });
      const proposed = clone(record);
      proposed.finalVerdict = deriveFinalVerdict(record);
      proposed.verdictReasons = verdictReasons(record, proposed.finalVerdict);
      const errors = contentErrors(proposed, true);
      if (errors.length) throw validationError("completion_invalid", "Validation is not complete enough for a final verdict.", { issues: errors });
      if (command.finalVerdict !== undefined && normalizeText(command.finalVerdict).toLowerCase() !== proposed.finalVerdict) throw validationError("verdict_mismatch", "The supplied verdict conflicts with deterministic validation results.", { expected: proposed.finalVerdict });
    }
    const next = clone(record);
    next.status = nextStatus;
    next.integrity = clone(currentIntegrity);
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, record.updatedAt);
    if (nextStatus === "running" && !next.startedAt) next.startedAt = next.updatedAt;
    if (nextStatus === "reviewing") next.reviewedAt = next.updatedAt;
    if (["running", "draft"].includes(nextStatus)) next.reviewedAt = null;
    if (nextStatus === "completed") {
      next.completedAt = next.updatedAt;
      next.finalVerdict = deriveFinalVerdict(next);
      next.verdictReasons = verdictReasons(next, next.finalVerdict);
    }
    next.audit.push({ event: `status_${nextStatus}`, at: next.updatedAt, revision: next.revision });
    const finished = finalize(next);
    requireRecord(finished);
    return finished;
  }

  function startValidation(record, source = null, command = {}) { return transition(record, "running", source, command); }
  function returnToDraft(record, source = null, command = {}) { return transition(record, "draft", source, command); }
  function startReview(record, source = null, command = {}) { return transition(record, "reviewing", source, command); }
  function returnToRunning(record, source = null, command = {}) { return transition(record, "running", source, command); }
  function completeValidation(record, source, command = {}) { return transition(record, "completed", source, command); }

  function validatePatternExecutionAdaptationValidation(record) {
    const errors = [];
    const invalid = (code, field = null) => errors.push({ code, field });
    try { canonicalize(record); } catch { invalid("corrupted_input"); return finishValidation(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.schemaVersion !== SCHEMA_VERSION || record.version !== VERSION) invalid("kind_invalid");
    for (const field of ["id", "adaptationValidationId", "projectId", "calculationId", "resultId", "runtimeId", "followUpId", "retrospectiveId", "learningId", "adaptationId", "adaptationIdentity", "identity", "createdAt", "updatedAt"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (record?.id !== record?.adaptationValidationId) invalid("validation_id_mismatch", "adaptationValidationId");
    if (!STATUSES.includes(record?.status) || !positiveInteger(record?.revision) || !positiveInteger(record?.epoch)) invalid("lifecycle_invalid");
    for (const field of ["criticalReferences", "declaredValidationPlan", "executedValidations", "constraintResults", "regressionResults", "expectedImpactResults", "unresolvedItems", "evidenceSummary", "verdictReasons", "audit"]) if (!Array.isArray(record?.[field])) invalid("collection_invalid", field);
    if (!record?.scope || !record?.sourceIdentities || !record?.adaptationSnapshot || !record?.validationCoverage || !record?.confidenceAssessment || !record?.integrity) invalid("structure_missing");
    if (record && canonicalize(record.adaptationSnapshot) !== canonicalize(normalizeObject(record.adaptationSnapshot))) invalid("adaptation_snapshot_not_normalized");
    if (record?.adaptationSnapshot?.adaptationId !== record?.adaptationId || record?.adaptationSnapshot?.identity !== record?.adaptationIdentity) invalid("adaptation_snapshot_mismatch");
    if (record?.adaptationSnapshot && (record.adaptationSnapshot.status !== "completed" || !positiveInteger(record.adaptationSnapshot.revision) || !Array.isArray(record.adaptationSnapshot.adaptationTargets) || !Array.isArray(record.adaptationSnapshot.proposedChanges) || !Array.isArray(record.adaptationSnapshot.preservedConstraints) || !record.adaptationSnapshot.validationPlan || !record.adaptationSnapshot.expectedImpact || !record.adaptationSnapshot.confidenceAssessment || !Array.isArray(record.adaptationSnapshot.criticalReferences))) invalid("adaptation_snapshot_invalid");
    const expectedScope = record?.adaptationSnapshot ? normalizeObject({ projectId: record.projectId, calculationId: record.calculationId, adaptationId: record.adaptationId, targetReferences: stableStrings([...array(record.adaptationSnapshot.adaptationTargets).map((entry) => entry.targetReference), ...array(record.adaptationSnapshot.proposedChanges).map((entry) => entry.targetReference)]) }) : null;
    if (record?.scope && expectedScope && canonicalize(record.scope) !== canonicalize(expectedScope)) invalid("scope_mismatch");
    for (const type of SOURCE_TYPES) if (!normalizeText(record?.sourceIdentities?.[type])) invalid("source_identity_missing", type);
    if (array(record?.criticalReferences).length !== SOURCE_TYPES.length) invalid("critical_references_invalid");
    const expectedReferenceIds = { project: record?.projectId, calculation: record?.calculationId, result: record?.resultId, runtime: record?.runtimeId, follow_up: record?.followUpId, retrospective: record?.retrospectiveId, learning: record?.learningId, adaptation: record?.adaptationId };
    for (const type of SOURCE_TYPES) {
      const reference = array(record?.criticalReferences).find((entry) => entry?.sourceType === type);
      if (!reference || reference.sourceId !== expectedReferenceIds[type] || reference.identity !== record?.sourceIdentities?.[type]) invalid("critical_reference_mismatch", type);
    }
    if (record && canonicalize(record.validationCoverage) !== canonicalize(calculateValidationCoverage(record.declaredValidationPlan, record.executedValidations))) invalid("coverage_mismatch");
    if (!isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("timestamp_invalid");
    if (record?.startedAt !== null && !isTimestamp(record?.startedAt)) invalid("timestamp_invalid", "startedAt");
    if (record?.reviewedAt !== null && !isTimestamp(record?.reviewedAt)) invalid("timestamp_invalid", "reviewedAt");
    if (record?.completedAt !== null && !isTimestamp(record?.completedAt)) invalid("timestamp_invalid", "completedAt");
    if (record?.status === "completed" && !isTimestamp(record.completedAt)) invalid("completion_timestamp_missing");
    if (record?.status !== "completed" && record?.finalVerdict !== null) invalid("final_verdict_before_completion");
    if (record?.status === "completed" && !FINAL_VERDICTS.includes(record.finalVerdict)) invalid("final_verdict_invalid");
    if (record?.status === "completed" && record.finalVerdict !== deriveFinalVerdict(record)) invalid("verdict_mismatch");
    for (const error of contentErrors(record || {}, record?.status === "completed")) invalid(error.code, error.field);
    if (record?.identity && record.identity !== fingerprint(identityPayload(record))) invalid("identity_mismatch");
    return finishValidation(errors);
  }

  function finishValidation(errors) {
    const unique = new Map(errors.map((entry) => [`${entry.code}\u0000${entry.field || ""}`, entry]));
    const sorted = [...unique.values()].sort((left, right) => compare(left.code, right.code) || compare(left.field, right.field));
    return freeze({ valid: sorted.length === 0, errors: sorted });
  }
  function requireRecord(record) { const report = validatePatternExecutionAdaptationValidation(record); if (!report.valid) throw validationError("corrupted_input", "Adaptation validation snapshot is corrupted.", { errors: report.errors }); }
  function safeNormalizePatternExecutionAdaptationValidation(value) {
    try { const parsed = typeof value === "string" ? JSON.parse(value) : clone(value); const report = validatePatternExecutionAdaptationValidation(parsed); return report.valid ? freeze({ record: freeze(parsed), corrupted: false, errors: [] }) : freeze({ record: null, corrupted: true, errors: report.errors }); }
    catch { return freeze({ record: null, corrupted: true, errors: [{ code: "corrupted_input", field: null }] }); }
  }
  function projectPatternExecutionAdaptationValidation(record, source = {}) {
    const safe = safeNormalizePatternExecutionAdaptationValidation(record);
    if (safe.corrupted) return freeze({ effectiveStatus: "corrupted", stale: false, corrupted: true, integrity: null, reasonCode: "corrupted_input" });
    const integrity = calculateIntegrity(source, record);
    const stale = record.stale === true || record.quarantined === true || record.importedDiagnostic?.reason === "import_identity_unproven" || !integrity.valid;
    return freeze({ effectiveStatus: stale ? "stale" : record.status, stale, corrupted: false, integrity, reasonCode: stale ? "source_chain_changed" : null });
  }
  function serializePatternExecutionAdaptationValidation(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternExecutionAdaptationValidation(value) { const safe = safeNormalizePatternExecutionAdaptationValidation(value); if (safe.corrupted) throw validationError("corrupted_input", "Adaptation validation data is corrupted.", { errors: safe.errors }); return safe.record; }

  function remapExact(value, map) {
    if (typeof value === "string") return map.get(value) || value;
    if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map));
    if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map);
    return value;
  }
  function remapPatternExecutionAdaptationValidation(record, referenceMap) {
    requireRecord(record);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(record), map);
    next.id = `adaptation-validation:${fingerprint({ projectId: next.projectId, adaptationId: next.adaptationId, adaptationIdentity: next.adaptationIdentity, epoch: next.epoch }).slice(8)}`;
    next.adaptationValidationId = next.id;
    return finalize(next);
  }
  function makeImportedPatternExecutionAdaptationValidationStale(record, options = {}) {
    requireRecord(record);
    const next = clone(record);
    next.importedDiagnostic = { reason: normalizeText(options.reason) || "import_identity_unproven", collision: Boolean(options.collision), preservedStatus: record.status };
    next.stale = true;
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(options.now, record.updatedAt);
    next.audit.push({ event: "imported_stale", at: next.updatedAt, revision: next.revision });
    return finalize(next);
  }
  function importPatternExecutionAdaptationValidation(existing, serialized, options = {}) {
    const record = deserializePatternExecutionAdaptationValidation(serialized);
    const imported = options.referenceMap ? remapPatternExecutionAdaptationValidation(record, options.referenceMap) : record;
    const sameId = array(existing).find((entry) => entry.id === imported.id);
    if (sameId && canonicalize(sameId) === canonicalize(imported)) return freeze({ status: "duplicate", record: sameId, changed: false });
    if (sameId || array(existing).some((entry) => entry.identity === imported.identity)) return freeze({ status: "collision", record: null, changed: false });
    return freeze({ status: "imported", record: imported, changed: true });
  }

  async function loadSource(repository, projectId, adaptationId = null) {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate.project || aggregate;
    const calculationId = project.active_calculation_id;
    const calculation = array(aggregate.calculations).find((entry) => entry.calculation_id === calculationId) || null;
    if (!calculationId) return { project, projectId, calculation, calculationId: null };
    const [resultRecord, runtimeRecord, followUpRecords, retrospectiveRecords, learningRecords, adaptationRecords] = await Promise.all([
      repository.getPatternExecutionResult(projectId, calculationId), repository.getPatternExecutionRuntime(projectId, calculationId), repository.listPatternExecutionFollowUps(projectId, calculationId),
      repository.listPatternExecutionRetrospectives(projectId, calculationId), repository.listPatternExecutionLearnings(projectId, calculationId), repository.listPatternExecutionAdaptations(projectId, calculationId),
    ]);
    const followUps = followUpRecords.map((entry) => entry.state), retrospectives = retrospectiveRecords.map((entry) => entry.state), learnings = learningRecords.map((entry) => entry.state), adaptations = adaptationRecords.map((entry) => entry.state);
    const adaptation = adaptationId ? adaptations.find((entry) => entry.id === adaptationId) || null : latestCompleted(adaptations);
    const learning = linkedOrLatest(learnings, adaptation?.learningId);
    const retrospective = linkedOrLatest(retrospectives, adaptation?.retrospectiveId || learning?.sourceRetrospectiveId);
    const followUp = linkedOrLatest(followUps, adaptation?.followUpId || retrospective?.sourceFollowUpId);
    return { project, projectId, calculation, calculationId, result: resultRecord?.state || null, runtime: runtimeRecord?.state || null, followUps, followUp, retrospectives, retrospective, learnings, learning, adaptations, adaptation };
  }
  async function readForProject(repository, projectId, adaptationValidationId = null, adaptationId = null) {
    let source;
    try { source = await loadSource(repository, projectId, adaptationId); } catch (error) { return freeze({ projectId, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "source_load_failed", corrupted: true, stale: false, rawValidation: null, availableCommands: [] }); }
    let stored;
    try { stored = await repository.getPatternExecutionAdaptationValidation(projectId, adaptationValidationId, source.calculationId, source.adaptation?.id || adaptationId); } catch (error) { return freeze({ ...source, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "validation_load_failed", corrupted: true, stale: false, rawValidation: null, availableCommands: [] }); }
    if (!stored) {
      const integrity = calculateIntegrity(source);
      return freeze({ ...source, rawValidation: null, validationRecord: null, integrity, effectiveStatus: integrity.valid ? "draft" : "blocked", stale: false, corrupted: false, reasonCode: integrity.valid ? null : "critical_integrity", availableCommands: integrity.valid ? ["create"] : [] });
    }
    const projected = projectPatternExecutionAdaptationValidation(stored.state, source);
    const availableCommands = projected.effectiveStatus === "draft" ? ["run"] : projected.effectiveStatus === "running" ? ["save", "draft", "review"] : projected.effectiveStatus === "reviewing" ? ["run", "draft", "complete"] : [];
    return freeze({ ...source, rawValidation: stored.state, validationRecord: stored, ...projected, availableCommands });
  }
  async function createForProject(repository, projectId, input = {}) {
    const source = await loadSource(repository, projectId, input.adaptationId || null);
    const existing = await repository.listPatternExecutionAdaptationValidations(projectId, source.calculationId, source.adaptation?.id || null);
    const record = createPatternExecutionAdaptationValidation(source, { ...clone(input), epoch: existing.reduce((maximum, entry) => Math.max(maximum, entry.state?.epoch || 0), 0) + 1 });
    await repository.savePatternExecutionAdaptationValidation(projectId, record, { timestamp: record.updatedAt, operationKind: "PATTERN_EXECUTION_ADAPTATION_VALIDATION_CREATED" });
    return readForProject(repository, projectId, record.id, record.adaptationId);
  }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, DEFAULT_TIMESTAMP, STATUSES, VALIDATION_STATUSES, FINAL_VERDICTS, VALIDATION_TYPES, IMPACT_STATUSES, SOURCE_TYPES, IMPACT_COMPONENTS,
    PatternExecutionAdaptationValidationError, canonicalize, fingerprint, normalizeText, normalizeSource, latestCompleted, adaptationSnapshot, declaredValidationPlan, constraintDefinitions, expectedImpactDefinitions,
    buildSourceIdentities, buildCriticalReferences, calculateIntegrity, calculateValidationCoverage, deriveFinalVerdict,
    createPatternExecutionAdaptationValidation, setExecutedValidations, upsertExecutedValidation, setConstraintResults, setRegressionResults, setExpectedImpactResults, setUnresolvedItems, setEvidenceSummary, setConfidenceAssessment,
    startValidation, returnToDraft, startReview, returnToRunning, completeValidation, validatePatternExecutionAdaptationValidation, safeNormalizePatternExecutionAdaptationValidation,
    projectPatternExecutionAdaptationValidation, serializePatternExecutionAdaptationValidation, deserializePatternExecutionAdaptationValidation, remapPatternExecutionAdaptationValidation,
    makeImportedPatternExecutionAdaptationValidationStale, importPatternExecutionAdaptationValidation, loadSource, readForProject, createForProject,
  });
  globalObject.YarnAIPatternExecutionAdaptationValidation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
