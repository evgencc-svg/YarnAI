"use strict";

(function exposePatternExecutionAdaptationPromotion(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_ADAPTATION_PROMOTION";
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const LIFECYCLES = Object.freeze(["draft", "evaluating", "deciding", "completed"]);
  const PROMOTION_VERDICTS = Object.freeze(["promote", "promote_with_constraints", "revise", "reject", "defer", "undetermined"]);
  const CONSTRAINT_SEVERITIES = Object.freeze(["info", "warning", "critical"]);
  const CONSTRAINT_STATUSES = Object.freeze(["open", "satisfied", "waived"]);
  const REGRESSION_SEVERITIES = Object.freeze(["minor", "major", "critical"]);
  const REGRESSION_STATUSES = Object.freeze(["open", "resolved", "accepted"]);
  const IMPACT_STATUSES = Object.freeze(["confirmed", "partially_confirmed", "not_confirmed", "unknown"]);
  const PROOF_STATUSES = Object.freeze(["proven", "unproven", "imported-unproven"]);
  const FINAL_VALIDATION_VERDICTS = Object.freeze(["pass", "partial", "failed", "blocked"]);
  const TERMINAL_VALIDATION_STATUSES = Object.freeze(["passed", "failed", "blocked", "skipped"]);

  class PatternExecutionAdaptationPromotionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionAdaptationPromotionError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function promotionError(code, message, details) { return new PatternExecutionAdaptationPromotionError(code, message, details); }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw promotionError("corrupted_input", "Promotion contains an invalid number.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw promotionError("corrupted_input", "Promotion contains an unsupported value.");
    if (seen.has(value)) throw promotionError("corrupted_input", "Promotion cannot contain cyclic data.");
    seen.add(value);
    let output;
    if (Array.isArray(value)) output = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      output = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw promotionError("corrupted_input", "Promotion accepts canonical JSON objects only.");
    }
    seen.delete(value);
    return output;
  }

  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }

  function normalizeObject(value) {
    if (value === undefined) return null;
    if (typeof value === "string") return normalizeText(value);
    if (Array.isArray(value)) return value.map(normalizeObject);
    if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      const next = {};
      for (const key of Object.keys(value).sort(compare)) next[normalizeText(key)] = normalizeObject(value[key]);
      return next;
    }
    return value;
  }

  function stableStrings(values) { return [...new Set(array(values).map(normalizeText).filter(Boolean))].sort(compare); }
  function deterministicUnique(values, normalizer, idField) {
    const sorted = array(values).map(normalizer).sort((left, right) => compare(left[idField], right[idField]) || compare(canonicalize(left), canonicalize(right)));
    const unique = new Map();
    for (const entry of sorted) if (!unique.has(entry[idField])) unique.set(entry[idField], entry);
    return [...unique.values()].sort((left, right) => compare(left[idField], right[idField]));
  }
  function recordId(value) { return normalizeText(value?.id); }
  function recordStatus(value) { return normalizeText(value?.status || value?.lifecycle); }
  function timestampOf(value) { return deterministicTimestamp(value?.completedAt, value?.updatedAt, value?.createdAt); }
  function latestCompleted(values) {
    return array(values).filter((entry) => recordStatus(entry) === "completed").slice().sort((left, right) =>
      compare(timestampOf(left), timestampOf(right)) || positiveInteger(left.epoch) - positiveInteger(right.epoch) || positiveInteger(left.revision) - positiveInteger(right.revision) || compare(recordId(left), recordId(right))
    ).at(-1) || null;
  }

  function normalizeSource(source = {}) {
    const adaptation = source.adaptation || array(source.adaptations).find((entry) => recordId(entry) === normalizeText(source.adaptationId)) || latestCompleted(source.adaptations);
    const validation = source.validation || array(source.validations).find((entry) => recordId(entry) === normalizeText(source.adaptationValidationId)) || latestCompleted(array(source.validations).filter((entry) => !adaptation || entry?.adaptationId === adaptation.id));
    const projectId = normalizeText(source.projectId || source.project?.project_id || source.project?.projectId || adaptation?.projectId || validation?.projectId) || null;
    const calculationId = normalizeText(source.calculationId || source.calculation?.calculation_id || adaptation?.calculationId || validation?.calculationId) || null;
    return { project: source.project || null, projectId, calculation: source.calculation || null, calculationId, adaptation: adaptation || null, adaptations: array(source.adaptations), validation: validation || null, validations: array(source.validations) };
  }

  function adaptationSnapshot(adaptation) {
    if (!adaptation || typeof adaptation !== "object") return null;
    const validationApi = globalObject.YarnAIPatternExecutionAdaptationValidation;
    if (validationApi?.adaptationSnapshot) return normalizeObject(validationApi.adaptationSnapshot(adaptation));
    return normalizeObject({ adaptationId: adaptation.id, identity: adaptation.identity, revision: adaptation.revision, status: adaptation.status, adaptationTargets: array(adaptation.adaptationTargets), proposedChanges: array(adaptation.proposedChanges), preservedConstraints: array(adaptation.preservedConstraints), validationPlan: adaptation.validationPlan || {}, expectedImpact: adaptation.expectedImpact || {}, confidenceAssessment: adaptation.confidenceAssessment || {}, criticalReferences: array(adaptation.criticalReferences) });
  }

  function validationSnapshot(validation) {
    if (!validation || typeof validation !== "object") return null;
    return normalizeObject({
      adaptationValidationId: validation.adaptationValidationId || validation.id, id: validation.id, identity: validation.identity, revision: validation.revision, status: validation.status,
      projectId: validation.projectId, calculationId: validation.calculationId, patternExecutionId: validation.runtimeId, adaptationId: validation.adaptationId,
      adaptationIdentity: validation.adaptationIdentity, adaptationSnapshot: validation.adaptationSnapshot, declaredValidationPlan: validation.declaredValidationPlan,
      executedValidations: validation.executedValidations, validationCoverage: validation.validationCoverage, constraintResults: validation.constraintResults,
      regressionResults: validation.regressionResults, expectedImpactResults: validation.expectedImpactResults, unresolvedItems: validation.unresolvedItems,
      finalVerdict: validation.finalVerdict, verdictReasons: validation.verdictReasons, stale: validation.stale === true, quarantined: validation.quarantined === true,
      importedDiagnostic: validation.importedDiagnostic || null,
    });
  }

  function calculateSourceProof(source = {}, record = null) {
    const normalized = normalizeSource(source);
    const adaptation = normalized.adaptation;
    const validation = normalized.validation;
    const adaptationResolved = Boolean(adaptation && recordId(adaptation));
    const validationResolved = Boolean(validation && recordId(validation));
    const sameProject = Boolean(adaptationResolved && validationResolved && adaptation.projectId === validation.projectId && adaptation.projectId === normalized.projectId && (!record || record.projectId === normalized.projectId));
    const adaptationExecution = normalizeText(adaptation?.runtimeId);
    const validationExecution = normalizeText(validation?.runtimeId);
    const samePatternExecution = Boolean(adaptationExecution && validationExecution && adaptationExecution === validationExecution && (!record || record.patternExecutionId === adaptationExecution));
    const sameCalculation = Boolean(normalizeText(adaptation?.calculationId) && adaptation.calculationId === validation?.calculationId && adaptation.calculationId === normalized.calculationId && (!record || record.calculationId === normalized.calculationId));
    const validationTargetsAdaptation = Boolean(adaptationResolved && validationResolved && validation.adaptationId === adaptation.id && validation.adaptationSnapshot?.adaptationId === adaptation.id && validation.adaptationIdentity === adaptation.identity);
    const validationTerminal = validation?.status === "completed";
    const validationVerdictComputed = FINAL_VALIDATION_VERDICTS.includes(validation?.finalVerdict);
    const validationIdentityConsistent = Boolean(validationResolved && validation.adaptationValidationId === validation.id && validation.identity);
    const snapshotMatches = Boolean(!record || (canonicalize(record.adaptationSnapshot) === canonicalize(adaptationSnapshot(adaptation)) && canonicalize(record.validationSnapshot) === canonicalize(validationSnapshot(validation))));
    const identities = [recordId(adaptation), recordId(validation), normalizeText(record?.id)].filter(Boolean);
    const fingerprints = [normalizeText(adaptation?.identity), normalizeText(validation?.identity), normalizeText(record?.identity)].filter(Boolean);
    const collisionFree = new Set(identities).size === identities.length && new Set(fingerprints).size === fingerprints.length;
    const importedUnproven = adaptation?.importedDiagnostic?.reason === "import_identity_unproven" || validation?.importedDiagnostic?.reason === "import_identity_unproven";
    const sourceTrusted = !adaptation?.stale && !validation?.stale && !validation?.quarantined && !importedUnproven;
    const fullChainProven = [adaptationResolved, validationResolved, sameProject, samePatternExecution, sameCalculation, validationTargetsAdaptation, validationTerminal, validationVerdictComputed, validationIdentityConsistent, snapshotMatches, collisionFree, sourceTrusted].every(Boolean);
    const issues = [];
    for (const [code, passed] of Object.entries({ adaptation_unresolved: adaptationResolved, validation_unresolved: validationResolved, project_mismatch: sameProject, pattern_execution_mismatch: samePatternExecution, calculation_mismatch: sameCalculation, validation_target_mismatch: validationTargetsAdaptation, validation_not_terminal: validationTerminal, validation_verdict_missing: validationVerdictComputed, validation_identity_invalid: validationIdentityConsistent, source_snapshot_changed: snapshotMatches, identity_collision: collisionFree, source_untrusted: sourceTrusted })) if (!passed) issues.push(code);
    return freeze({ adaptationResolved, validationResolved, sameProject, samePatternExecution, sameCalculation, validationTargetsAdaptation, validationTerminal, validationVerdictComputed, validationIdentityConsistent, snapshotMatches, collisionFree, sourceTrusted, fullChainProven, issues: issues.sort(compare) });
  }

  function calculateCoverage(validation = {}) {
    const declared = array(validation.declaredValidationPlan).map((entry) => normalizeObject(entry)).sort((left, right) => compare(left.planItemId, right.planItemId));
    const required = stableStrings(declared.filter((entry) => entry.required === true).map((entry) => entry.planItemId));
    const executions = deterministicUnique(validation.executedValidations, (value) => ({ planItemId: normalizeText(value?.planItemId), status: normalizeText(value?.status).toLowerCase() }), "planItemId");
    const byId = new Map(executions.map((entry) => [entry.planItemId, entry]));
    const satisfied = required.filter((id) => TERMINAL_VALIDATION_STATUSES.includes(byId.get(id)?.status));
    const missing = required.filter((id) => !satisfied.includes(id));
    return freeze({ required, satisfied, missing, ratio: `${satisfied.length}/${required.length}`, basisPoints: required.length ? Math.floor((satisfied.length * 10000) / required.length) : 0, sufficient: required.length > 0 && missing.length === 0 });
  }

  function issueSeverity(issues, values, fallback) {
    const present = new Set(array(issues).map((entry) => normalizeText(entry?.severity).toLowerCase()));
    return values.find((value) => present.has(value)) || fallback;
  }
  function issueReason(issues, fallback = "") { const reasons = stableStrings(array(issues).map((entry) => entry?.reason || entry?.code)); return reasons.join("; ") || fallback; }

  function normalizeConstraint(value) {
    const item = value && typeof value === "object" ? value : {};
    const validationStatus = normalizeText(item.validationStatus).toLowerCase();
    let severity = normalizeText(item.severity).toLowerCase();
    if (!CONSTRAINT_SEVERITIES.includes(severity)) severity = issueSeverity(item.issues, ["critical", "warning", "info"], validationStatus === "failed" ? "critical" : validationStatus === "blocked" ? "warning" : "info");
    let status = normalizeText(item.status).toLowerCase();
    if (!CONSTRAINT_STATUSES.includes(status)) status = validationStatus === "passed" ? "satisfied" : validationStatus === "skipped" ? "waived" : "open";
    const constraintId = normalizeText(item.constraintId) || `constraint:${fingerprint({ sourceReference: item.sourceReference, severity, status }).slice(8)}`;
    const fallback = status === "waived" ? "" : status === "satisfied" ? "Validation confirmed the constraint." : "Constraint remains unresolved.";
    return { constraintId, severity, status, reason: normalizeText(item.reason) || issueReason(item.issues, fallback) };
  }
  function normalizeConstraints(values) { return deterministicUnique(values, normalizeConstraint, "constraintId"); }

  function normalizeRegression(value) {
    const item = value && typeof value === "object" ? value : {};
    const suppliedStatus = normalizeText(item.status).toLowerCase();
    const canonicalStatus = REGRESSION_STATUSES.includes(suppliedStatus) ? suppliedStatus : "";
    const validationStatus = normalizeText(item.validationStatus || item.resultStatus || (canonicalStatus ? "" : suppliedStatus)).toLowerCase();
    let severity = normalizeText(item.severity).toLowerCase();
    if (!REGRESSION_SEVERITIES.includes(severity)) severity = issueSeverity(item.issues, ["critical", "major", "minor"], validationStatus === "failed" ? "major" : "minor");
    let status = normalizeText(item.promotionStatus || canonicalStatus).toLowerCase();
    if (!REGRESSION_STATUSES.includes(status)) status = validationStatus === "passed" ? "resolved" : "open";
    const regressionId = normalizeText(item.regressionId) || `regression:${fingerprint({ area: item.area, severity, status }).slice(8)}`;
    const fallback = status === "accepted" ? "" : status === "resolved" ? "Regression check passed." : "Regression remains unresolved.";
    return { regressionId, severity, status, reason: normalizeText(item.reason) || issueReason(item.issues, fallback) };
  }
  function normalizeRegressions(values) { return deterministicUnique(values, normalizeRegression, "regressionId"); }

  function calculateExpectedImpact(validation = {}) {
    const results = deterministicUnique(validation.expectedImpactResults, (value) => ({ impactId: normalizeText(value?.impactId), status: normalizeText(value?.status).toLowerCase(), evidence: stableStrings(array(value?.evidenceReferences).map((entry) => entry?.evidenceId || entry?.sourceId)), limitations: stableStrings(array(value?.limitations).map((entry) => entry?.reason || entry?.code)) }), "impactId");
    let status = "unknown";
    if (results.some((entry) => entry.status === "failed")) status = "not_confirmed";
    else if (results.length && results.every((entry) => entry.status === "passed" && entry.evidence.length)) status = "confirmed";
    else if (results.some((entry) => entry.status === "partial") || (results.some((entry) => entry.status === "passed") && results.some((entry) => entry.status !== "passed"))) status = "partially_confirmed";
    return freeze({ status, confirmed: status === "confirmed", evidence: stableStrings(results.flatMap((entry) => entry.evidence)), limitations: stableStrings(results.flatMap((entry) => entry.limitations)) });
  }

  function normalizeCondition(value) {
    const item = value && typeof value === "object" ? value : {};
    const reason = normalizeText(item.reason);
    const status = ["open", "satisfied", "waived"].includes(normalizeText(item.status).toLowerCase()) ? normalizeText(item.status).toLowerCase() : "open";
    const required = item.required !== false;
    const conditionId = normalizeText(item.conditionId || item.itemId) || `condition:${fingerprint({ reason, status, required }).slice(8)}`;
    return { conditionId, status, required, reason };
  }
  function normalizeDecisionConditions(values) { return deterministicUnique(values, normalizeCondition, "conditionId"); }
  function conditionsFromValidation(validation) { return normalizeDecisionConditions(array(validation?.unresolvedItems).map((item) => ({ conditionId: item.itemId, status: item.status === "resolved" ? "satisfied" : "open", required: item.severity === "critical", reason: item.reason }))); }

  function verdictReasons(record, verdict) {
    const reasons = [];
    const add = (code, references = []) => reasons.push({ code, references: stableStrings(references) });
    const openConstraints = record.constraints.filter((entry) => entry.status === "open");
    const openRegressions = record.regressions.filter((entry) => entry.status === "open");
    if (verdict === "undetermined") add("lifecycle_not_deciding");
    if (!record.sourceProof.fullChainProven) add(record.proofStatus === "imported-unproven" ? "imported_chain_unproven" : "source_chain_unproven", record.sourceProof.issues);
    if (record.stale) add("source_revision_changed");
    if (!record.coverage.sufficient) add("coverage_insufficient", record.coverage.missing);
    if (openConstraints.length) add("open_constraints", openConstraints.map((entry) => entry.constraintId));
    if (openRegressions.length) add("open_regressions", openRegressions.map((entry) => entry.regressionId));
    if (record.expectedImpact.status !== "confirmed") add(`expected_impact_${record.expectedImpact.status}`);
    if (record.validationVerdict && record.validationVerdict !== "pass") add(`validation_verdict_${record.validationVerdict}`);
    const openConditions = record.decisionConditions.filter((entry) => entry.status === "open");
    if (openConditions.length) add("decision_conditions_open", openConditions.map((entry) => entry.conditionId));
    if (verdict === "promote") add("all_promotion_requirements_proven");
    return reasons.sort((left, right) => compare(left.code, right.code));
  }

  function derivePromotionVerdict(record) {
    if (!record || !["deciding", "completed"].includes(record.lifecycle)) return "undetermined";
    if (record.stale || record.proofStatus !== "proven" || !record.sourceProof?.fullChainProven) return "defer";
    const criticalConstraint = record.constraints.some((entry) => entry.status === "open" && entry.severity === "critical");
    const criticalRegression = record.regressions.some((entry) => entry.status === "open" && entry.severity === "critical");
    if (criticalConstraint || criticalRegression) return "reject";
    if (!record.coverage?.sufficient) return "defer";
    if (!FINAL_VALIDATION_VERDICTS.includes(record.validationVerdict) || record.validationVerdict === "blocked" || record.expectedImpact?.status === "unknown") return "defer";
    const majorRegression = record.regressions.some((entry) => entry.status === "open" && entry.severity === "major");
    if (record.validationVerdict === "failed" || majorRegression || record.expectedImpact.status === "not_confirmed") return "revise";
    const constrained = record.validationVerdict === "partial" || record.expectedImpact.status === "partially_confirmed" || record.constraints.some((entry) => entry.status !== "satisfied") || record.regressions.some((entry) => entry.status !== "resolved") || record.decisionConditions.some((entry) => entry.status === "open");
    return constrained ? "promote_with_constraints" : "promote";
  }

  function identityPayload(record) {
    return { projectId: record.projectId, calculationId: record.calculationId, patternExecutionId: record.patternExecutionId, adaptationId: record.adaptationId, adaptationValidationId: record.adaptationValidationId, adaptationPromotionId: record.adaptationPromotionId, epoch: record.epoch, lifecycle: record.lifecycle, sourceIdentities: record.sourceIdentities, adaptationSnapshot: record.adaptationSnapshot, validationSnapshot: record.validationSnapshot, sourceProof: record.sourceProof, coverage: record.coverage, constraints: record.constraints, regressions: record.regressions, expectedImpact: record.expectedImpact, decisionConditions: record.decisionConditions, validationVerdict: record.validationVerdict, promotionVerdict: record.promotionVerdict, decisionSummary: record.decisionSummary, revisionRequired: record.revisionRequired, rejectionRequired: record.rejectionRequired, deferredReason: record.deferredReason, stale: record.stale, imported: record.imported, proofStatus: record.proofStatus };
  }

  function finalize(record) {
    record.sourceIdentities = normalizeObject(record.sourceIdentities);
    record.adaptationSnapshot = normalizeObject(record.adaptationSnapshot);
    record.validationSnapshot = normalizeObject(record.validationSnapshot);
    record.sourceProof = normalizeObject(record.sourceProof);
    record.coverage = normalizeObject(record.coverage);
    record.constraints = normalizeConstraints(record.constraints);
    record.regressions = normalizeRegressions(record.regressions);
    record.expectedImpact = normalizeObject(record.expectedImpact);
    record.decisionConditions = normalizeDecisionConditions(record.decisionConditions);
    record.promotionVerdict = derivePromotionVerdict(record);
    const reasons = verdictReasons(record, record.promotionVerdict);
    record.decisionSummary = { code: record.promotionVerdict, reasons };
    record.revisionRequired = record.promotionVerdict === "revise";
    record.rejectionRequired = record.promotionVerdict === "reject";
    record.deferredReason = record.promotionVerdict === "defer" ? reasons[0]?.code || "insufficient_evidence" : null;
    record.identity = fingerprint(identityPayload(record));
    return freeze(record);
  }

  function createPatternExecutionAdaptationPromotion(source = {}, input = {}) {
    const normalized = normalizeSource(source);
    if (!normalized.adaptation) throw promotionError("adaptation_required", "A Stage 39 adaptation is required.");
    if (!normalized.validation) throw promotionError("validation_required", "A Stage 40 validation is required.");
    const epoch = positiveInteger(input.epoch) || 1;
    const timestamp = deterministicTimestamp(input.now, normalized.validation.completedAt, normalized.validation.updatedAt, normalized.adaptation.updatedAt);
    const adaptationId = recordId(normalized.adaptation);
    const adaptationValidationId = normalizeText(normalized.validation.adaptationValidationId || normalized.validation.id);
    const patternExecutionId = normalizeText(normalized.validation.runtimeId || normalized.adaptation.runtimeId);
    const id = normalizeText(input.id || input.adaptationPromotionId) || `adaptation-promotion:${fingerprint({ projectId: normalized.projectId, patternExecutionId, adaptationId, adaptationValidationId, epoch }).slice(8)}`;
    const record = {
      id, adaptationPromotionId: id, kind: PROGRESS_KIND, type: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      projectId: normalized.projectId, calculationId: normalized.calculationId, patternExecutionId, adaptationId, adaptationValidationId,
      lifecycle: "draft", sourceIdentities: { adaptation: normalized.adaptation.identity || null, validation: normalized.validation.identity || null },
      adaptationSnapshot: adaptationSnapshot(normalized.adaptation), validationSnapshot: validationSnapshot(normalized.validation), sourceProof: null,
      coverage: calculateCoverage(normalized.validation), constraints: normalizeConstraints(normalized.validation.constraintResults), regressions: normalizeRegressions(normalized.validation.regressionResults),
      expectedImpact: calculateExpectedImpact(normalized.validation), decisionConditions: normalizeDecisionConditions(input.decisionConditions || conditionsFromValidation(normalized.validation)),
      validationVerdict: normalizeText(normalized.validation.finalVerdict).toLowerCase() || null, promotionVerdict: "undetermined", decisionSummary: null,
      revisionRequired: false, rejectionRequired: false, deferredReason: null, stale: false, imported: false, proofStatus: "unproven",
      createdAt: timestamp, updatedAt: timestamp, completedAt: null, revision: 1, epoch, identity: null, audit: [{ event: "created", at: timestamp, revision: 1 }], importedDiagnostic: null,
    };
    record.sourceProof = calculateSourceProof(normalized, record);
    record.proofStatus = record.sourceProof.fullChainProven ? "proven" : "unproven";
    const next = finalize(record);
    requireRecord(next);
    return next;
  }

  function refreshed(record, source) {
    const normalized = normalizeSource(source);
    const next = clone(record);
    next.sourceProof = calculateSourceProof(normalized, record);
    next.stale = !next.sourceProof.snapshotMatches || normalized.adaptation?.revision !== record.adaptationSnapshot?.revision || normalized.validation?.revision !== record.validationSnapshot?.revision;
    next.proofStatus = next.imported && !next.sourceProof.fullChainProven ? "imported-unproven" : next.sourceProof.fullChainProven && !next.stale ? "proven" : "unproven";
    next.coverage = calculateCoverage(normalized.validation || {});
    next.constraints = normalizeConstraints(normalized.validation?.constraintResults);
    next.regressions = normalizeRegressions(normalized.validation?.regressionResults);
    next.expectedImpact = calculateExpectedImpact(normalized.validation || {});
    next.validationVerdict = normalizeText(normalized.validation?.finalVerdict).toLowerCase() || null;
    return next;
  }

  function checkConcurrency(record, command = {}) {
    if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw promotionError("revision_conflict", "Promotion revision changed.");
    if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw promotionError("identity_conflict", "Promotion identity changed.");
  }

  function transition(record, nextLifecycle, source, command = {}) {
    requireRecord(record);
    checkConcurrency(record, command);
    if (record.lifecycle === "completed") throw promotionError("terminal_promotion", "Completed promotion is immutable.");
    if (record.lifecycle === nextLifecycle) return record;
    const allowed = { draft: "evaluating", evaluating: "deciding", deciding: "completed" };
    if (allowed[record.lifecycle] !== nextLifecycle) throw promotionError("invalid_transition", `Cannot transition ${record.lifecycle} to ${nextLifecycle}.`);
    if (!source) throw promotionError("source_required", "The current adaptation and validation are required for a lifecycle transition.");
    const next = refreshed(record, source);
    next.lifecycle = nextLifecycle;
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, record.updatedAt);
    if (nextLifecycle === "completed") {
      const verdict = derivePromotionVerdict(next);
      if (verdict === "undetermined") throw promotionError("completion_undetermined", "Promotion cannot complete without a deterministic verdict.");
      if (["promote", "promote_with_constraints"].includes(verdict) && (!next.sourceProof.fullChainProven || next.stale || next.proofStatus !== "proven")) throw promotionError("promotion_unproven", "Promotion requires a proven, current source chain.");
      next.completedAt = next.updatedAt;
    }
    next.audit.push({ event: `lifecycle_${nextLifecycle}`, at: next.updatedAt, revision: next.revision });
    const finished = finalize(next);
    requireRecord(finished);
    return finished;
  }

  function startEvaluation(record, source, command = {}) { return transition(record, "evaluating", source, command); }
  function startDecision(record, source, command = {}) { return transition(record, "deciding", source, command); }
  function completePromotion(record, source, command = {}) { return transition(record, "completed", source, command); }

  function setDecisionConditions(record, conditions, command = {}) {
    requireRecord(record);
    if (record.lifecycle === "completed") throw promotionError("terminal_promotion", "Completed promotion is immutable.");
    if (record.lifecycle !== "evaluating") throw promotionError("evaluating_required", "Decision conditions can only be changed while evaluating.");
    checkConcurrency(record, command);
    const next = clone(record);
    next.decisionConditions = normalizeDecisionConditions(conditions);
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, record.updatedAt);
    next.audit.push({ event: "decision_conditions_changed", at: next.updatedAt, revision: next.revision });
    const finished = finalize(next);
    requireRecord(finished);
    return finished;
  }

  function validatePatternExecutionAdaptationPromotion(record) {
    const errors = [];
    const invalid = (code, field = null) => errors.push({ code, field });
    try { canonicalize(record); } catch { invalid("corrupted_input"); return finishValidation(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.schemaVersion !== SCHEMA_VERSION || record.version !== VERSION) invalid("kind_invalid");
    for (const field of ["id", "adaptationPromotionId", "projectId", "calculationId", "patternExecutionId", "adaptationId", "adaptationValidationId", "identity", "createdAt", "updatedAt"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (record?.id !== record?.adaptationPromotionId) invalid("promotion_id_mismatch", "adaptationPromotionId");
    if (!LIFECYCLES.includes(record?.lifecycle) || !positiveInteger(record?.revision) || !positiveInteger(record?.epoch)) invalid("lifecycle_invalid");
    if (!PROMOTION_VERDICTS.includes(record?.promotionVerdict) || !PROOF_STATUSES.includes(record?.proofStatus)) invalid("enum_invalid");
    for (const field of ["constraints", "regressions", "decisionConditions", "audit"]) if (!Array.isArray(record?.[field])) invalid("collection_invalid", field);
    for (const field of ["sourceIdentities", "adaptationSnapshot", "validationSnapshot", "sourceProof", "coverage", "expectedImpact", "decisionSummary"]) if (!record?.[field] || typeof record[field] !== "object") invalid("structure_missing", field);
    if (record?.adaptationSnapshot?.adaptationId !== record?.adaptationId || record?.validationSnapshot?.adaptationId !== record?.adaptationId || record?.validationSnapshot?.adaptationValidationId !== record?.adaptationValidationId) invalid("source_snapshot_mismatch");
    if (record?.validationSnapshot?.patternExecutionId !== record?.patternExecutionId) invalid("pattern_execution_mismatch");
    if (record && canonicalize(record.constraints) !== canonicalize(normalizeConstraints(record.constraints))) invalid("collection_not_normalized", "constraints");
    if (record && canonicalize(record.regressions) !== canonicalize(normalizeRegressions(record.regressions))) invalid("collection_not_normalized", "regressions");
    if (record && canonicalize(record.decisionConditions) !== canonicalize(normalizeDecisionConditions(record.decisionConditions))) invalid("collection_not_normalized", "decisionConditions");
    for (const item of array(record?.constraints)) {
      if (!CONSTRAINT_SEVERITIES.includes(item.severity) || !CONSTRAINT_STATUSES.includes(item.status) || !item.constraintId || !item.reason) invalid("constraint_invalid", item.constraintId || null);
      if (item.status === "waived" && !item.reason) invalid("waiver_reason_required", item.constraintId || null);
    }
    for (const item of array(record?.regressions)) {
      if (!REGRESSION_SEVERITIES.includes(item.severity) || !REGRESSION_STATUSES.includes(item.status) || !item.regressionId || !item.reason) invalid("regression_invalid", item.regressionId || null);
      if (item.status === "accepted" && !item.reason) invalid("acceptance_reason_required", item.regressionId || null);
    }
    if (!IMPACT_STATUSES.includes(record?.expectedImpact?.status)) invalid("impact_status_invalid");
    if (record?.identity && record.identity !== fingerprint(identityPayload(record))) invalid("identity_mismatch");
    if (!isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt) || (record?.completedAt !== null && !isTimestamp(record.completedAt))) invalid("timestamp_invalid");
    if (record?.lifecycle === "completed" && (!isTimestamp(record.completedAt) || record.promotionVerdict === "undetermined")) invalid("completion_invalid");
    if (!["deciding", "completed"].includes(record?.lifecycle) && record?.promotionVerdict !== "undetermined") invalid("verdict_before_decision");
    if (["promote", "promote_with_constraints"].includes(record?.promotionVerdict) && (!record.sourceProof?.fullChainProven || record.stale || record.proofStatus !== "proven")) invalid("unproven_promotion");
    if (record?.promotionVerdict === "promote" && record.constraints.some((entry) => entry.status === "open" && entry.severity === "critical")) invalid("critical_constraint_promoted");
    if (record?.promotionVerdict === "promote" && record.regressions.some((entry) => entry.status === "open")) invalid("blocking_regression_promoted");
    if (record?.promotionVerdict === "reject" && !record.rejectionRequired) invalid("rejection_reason_missing");
    if (record?.promotionVerdict === "revise" && !record.revisionRequired) invalid("revision_required_missing");
    if (record?.promotionVerdict === "defer" && !record.deferredReason) invalid("deferred_reason_missing");
    if (record?.promotionVerdict !== derivePromotionVerdict(record)) invalid("verdict_mismatch");
    return finishValidation(errors);
  }

  function finishValidation(errors) { const unique = new Map(errors.map((entry) => [`${entry.code}\u0000${entry.field || ""}`, entry])); const sorted = [...unique.values()].sort((left, right) => compare(left.code, right.code) || compare(left.field, right.field)); return freeze({ valid: sorted.length === 0, errors: sorted }); }
  function requireRecord(record) { const report = validatePatternExecutionAdaptationPromotion(record); if (!report.valid) throw promotionError("corrupted_input", "Adaptation promotion snapshot is corrupted.", { errors: report.errors }); }
  function safeNormalizePatternExecutionAdaptationPromotion(value) { try { const parsed = typeof value === "string" ? JSON.parse(value) : clone(value); const report = validatePatternExecutionAdaptationPromotion(parsed); return report.valid ? freeze({ record: freeze(parsed), corrupted: false, errors: [] }) : freeze({ record: null, corrupted: true, errors: report.errors }); } catch { return freeze({ record: null, corrupted: true, errors: [{ code: "corrupted_input", field: null }] }); } }
  function serializePatternExecutionAdaptationPromotion(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternExecutionAdaptationPromotion(value) { const safe = safeNormalizePatternExecutionAdaptationPromotion(value); if (safe.corrupted) throw promotionError("corrupted_input", "Adaptation promotion data is corrupted.", { errors: safe.errors }); return safe.record; }

  function projectPatternExecutionAdaptationPromotion(record, source = {}) {
    const safe = safeNormalizePatternExecutionAdaptationPromotion(record);
    if (safe.corrupted) return freeze({ effectiveLifecycle: "corrupted", stale: false, corrupted: true, proofStatus: "unproven", sourceProof: null, promotionVerdict: "undetermined", reasonCode: "corrupted_input" });
    const proof = calculateSourceProof(source, record);
    const normalized = normalizeSource(source);
    const stale = !proof.snapshotMatches || !proof.sourceTrusted || normalized.adaptation?.revision !== record.adaptationSnapshot.revision || normalized.validation?.revision !== record.validationSnapshot.revision;
    const proofStatus = record.imported && !proof.fullChainProven ? "imported-unproven" : proof.fullChainProven && !stale ? "proven" : "unproven";
    const projected = { ...record, sourceProof: proof, stale, proofStatus };
    const promotionVerdict = derivePromotionVerdict(projected);
    return freeze({ effectiveLifecycle: stale ? "stale" : record.lifecycle, stale, corrupted: false, proofStatus, sourceProof: proof, promotionVerdict, reasonCode: stale ? "source_chain_changed" : proof.fullChainProven ? null : "source_chain_unproven" });
  }

  function revalidatePatternExecutionAdaptationPromotion(record, source = {}) { return projectPatternExecutionAdaptationPromotion(record, source); }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function remapPatternExecutionAdaptationPromotion(record, referenceMap) {
    requireRecord(record);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(record), map);
    next.id = `adaptation-promotion:${fingerprint({ projectId: next.projectId, patternExecutionId: next.patternExecutionId, adaptationId: next.adaptationId, adaptationValidationId: next.adaptationValidationId, epoch: next.epoch }).slice(8)}`;
    next.adaptationPromotionId = next.id;
    return finalize(next);
  }
  function makeImportedPatternExecutionAdaptationPromotionUnproven(record, options = {}) {
    requireRecord(record);
    const next = clone(record);
    next.imported = true; next.stale = true; next.proofStatus = "imported-unproven";
    next.sourceProof = { ...next.sourceProof, sourceTrusted: false, fullChainProven: false, issues: stableStrings([...(next.sourceProof?.issues || []), "imported_chain_unproven"]) };
    next.importedDiagnostic = { reason: normalizeText(options.reason) || "import_identity_unproven", collision: Boolean(options.collision), preservedLifecycle: record.lifecycle, preservedVerdict: record.promotionVerdict };
    next.revision += 1; next.updatedAt = deterministicTimestamp(options.now, record.updatedAt);
    next.audit.push({ event: "imported_unproven", at: next.updatedAt, revision: next.revision });
    return finalize(next);
  }
  function importPatternExecutionAdaptationPromotion(existing, serialized, options = {}) {
    const record = deserializePatternExecutionAdaptationPromotion(serialized);
    const imported = options.referenceMap ? remapPatternExecutionAdaptationPromotion(record, options.referenceMap) : record;
    const sameId = array(existing).find((entry) => entry.id === imported.id);
    if (sameId && canonicalize(sameId) === canonicalize(imported)) return freeze({ status: "duplicate", record: sameId, changed: false });
    if (sameId || array(existing).some((entry) => entry.identity === imported.identity)) return freeze({ status: "collision", record: null, changed: false });
    return freeze({ status: "imported", record: imported, changed: true });
  }

  async function loadSource(repository, projectId, adaptationId = null, adaptationValidationId = null) {
    const validationApi = globalObject.YarnAIPatternExecutionAdaptationValidation;
    if (!validationApi?.loadSource) throw promotionError("validation_api_missing", "Adaptation validation module is not loaded.");
    const base = await validationApi.loadSource(repository, projectId, adaptationId);
    const validationRecords = await repository.listPatternExecutionAdaptationValidations(projectId, base.calculationId, base.adaptation?.id || adaptationId);
    const validations = validationRecords.map((entry) => entry.state);
    const validation = adaptationValidationId ? validations.find((entry) => entry.id === adaptationValidationId || entry.adaptationValidationId === adaptationValidationId) || null : latestCompleted(validations);
    return { ...base, validations, validation, adaptationValidationId: validation?.id || adaptationValidationId };
  }
  async function readForProject(repository, projectId, adaptationPromotionId = null, adaptationId = null, adaptationValidationId = null) {
    let source;
    try { source = await loadSource(repository, projectId, adaptationId, adaptationValidationId); } catch (error) { return freeze({ projectId, effectiveLifecycle: "corrupted", reasonCode: normalizeText(error?.code) || "source_load_failed", corrupted: true, stale: false, rawPromotion: null, availableCommands: [] }); }
    let stored;
    try { stored = await repository.getPatternExecutionAdaptationPromotion(projectId, adaptationPromotionId, source.calculationId, source.adaptation?.id || adaptationId, source.validation?.id || adaptationValidationId); } catch (error) { return freeze({ ...source, effectiveLifecycle: "corrupted", reasonCode: normalizeText(error?.code) || "promotion_load_failed", corrupted: true, stale: false, rawPromotion: null, availableCommands: [] }); }
    if (!stored) {
      const proof = calculateSourceProof(source);
      return freeze({ ...source, rawPromotion: null, promotionRecord: null, sourceProof: proof, effectiveLifecycle: proof.fullChainProven ? "draft" : "blocked", stale: false, corrupted: false, proofStatus: proof.fullChainProven ? "proven" : "unproven", promotionVerdict: "undetermined", reasonCode: proof.fullChainProven ? null : "source_chain_unproven", availableCommands: source.adaptation && source.validation ? ["create"] : [] });
    }
    const projected = projectPatternExecutionAdaptationPromotion(stored.state, source);
    const commands = projected.effectiveLifecycle === "draft" ? ["evaluate"] : projected.effectiveLifecycle === "evaluating" ? ["save_conditions", "decide"] : projected.effectiveLifecycle === "deciding" ? ["complete"] : [];
    return freeze({ ...source, rawPromotion: stored.state, promotionRecord: stored, ...projected, availableCommands: commands });
  }
  async function createForProject(repository, projectId, input = {}) {
    const source = await loadSource(repository, projectId, input.adaptationId || null, input.adaptationValidationId || null);
    const existing = await repository.listPatternExecutionAdaptationPromotions(projectId, source.calculationId, source.adaptation?.id || null, source.validation?.id || null);
    const record = createPatternExecutionAdaptationPromotion(source, { ...clone(input), epoch: existing.reduce((maximum, entry) => Math.max(maximum, entry.state?.epoch || 0), 0) + 1 });
    await repository.savePatternExecutionAdaptationPromotion(projectId, record, { timestamp: record.updatedAt, operationKind: "PATTERN_EXECUTION_ADAPTATION_PROMOTION_CREATED" });
    return readForProject(repository, projectId, record.id, record.adaptationId, record.adaptationValidationId);
  }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, DEFAULT_TIMESTAMP, LIFECYCLES, PROMOTION_VERDICTS, CONSTRAINT_SEVERITIES, CONSTRAINT_STATUSES, REGRESSION_SEVERITIES, REGRESSION_STATUSES, IMPACT_STATUSES, PROOF_STATUSES,
    PatternExecutionAdaptationPromotionError, canonicalize, fingerprint, normalizeText, normalizeSource, latestCompleted, adaptationSnapshot, validationSnapshot,
    calculateSourceProof, calculateCoverage, normalizeConstraints, normalizeRegressions, calculateExpectedImpact, normalizeDecisionConditions, derivePromotionVerdict,
    createPatternExecutionAdaptationPromotion, setDecisionConditions, startEvaluation, startDecision, completePromotion, validatePatternExecutionAdaptationPromotion,
    safeNormalizePatternExecutionAdaptationPromotion, projectPatternExecutionAdaptationPromotion, revalidatePatternExecutionAdaptationPromotion,
    serializePatternExecutionAdaptationPromotion, deserializePatternExecutionAdaptationPromotion, remapPatternExecutionAdaptationPromotion,
    makeImportedPatternExecutionAdaptationPromotionUnproven, importPatternExecutionAdaptationPromotion, loadSource, readForProject, createForProject,
  });
  globalObject.YarnAIPatternExecutionAdaptationPromotion = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
