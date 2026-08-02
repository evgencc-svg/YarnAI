"use strict";

(function initializePatternEvolutionExecutionVerification(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const POLICY_VERSION = "pattern-evolution-execution-verification/v1";
  const EVIDENCE_POLICY_VERSION = "pattern-evolution-execution-verification-evidence/v1";
  const PROGRESS_KIND = "PATTERN_EVOLUTION_EXECUTION_VERIFICATION";
  const SOURCE_KIND = "PATTERN_EVOLUTION_EXECUTION";
  const LIFECYCLES = Object.freeze([
    "draft", "collecting", "evaluating", "reviewing", "completed",
    "revision_required", "evidence_required", "rollback_required", "blocked",
    "failed", "cancelled", "stale",
  ]);
  const TERMINAL_LIFECYCLES = Object.freeze([
    "completed", "revision_required", "evidence_required", "rollback_required",
    "blocked", "failed", "cancelled",
  ]);
  const ACTIVE_LIFECYCLES = Object.freeze(["draft", "collecting", "evaluating", "reviewing"]);
  const VERDICTS = Object.freeze([
    "verified", "verified_with_conditions", "revision_required", "evidence_required",
    "rollback_required", "blocked", "failed", "cancelled",
  ]);
  const STATUSES = Object.freeze([
    "pending", "ready", "in_progress", "completed", "require_revision",
    "require_evidence", "require_rollback", "blocked", "failed", "stale", "cancelled",
  ]);
  const STATUS_PRECEDENCE = Object.freeze([
    "stale", "failed", "require_rollback", "blocked", "require_evidence",
    "require_revision", "cancelled", "completed", "in_progress", "ready", "pending",
  ]);
  const NEXT_ACTIONS = Object.freeze([
    "resolve_source_chain", "revalidate_imported_source", "resolve_collision",
    "collect_verification_evidence", "evaluate_verification", "review_verification",
    "revise_execution", "perform_rollback", "investigate_failure", "verification_complete",
    "no_action_cancelled", "no_action_stale",
  ]);
  const RISK_LEVELS = Object.freeze(["low", "moderate", "high", "critical"]);
  const ALLOWED_EVIDENCE_TYPES = Object.freeze([
    "structured", "validation", "observation", "output", "postcondition",
    "compatibility", "migration", "rollback", "risk_control",
  ]);
  const FORBIDDEN_OPERATION_TYPES = Object.freeze([
    "delete_pattern", "overwrite_historical_record", "delete_source_chain",
    "arbitrary_indexeddb_write", "upgrade_schema", "apply_data_migration",
    "change_db_version", "create_object_store", "destructive_reset", "execute_code",
  ]);
  const TRANSITIONS = Object.freeze({
    draft: Object.freeze(["collecting", "cancelled", "stale"]),
    collecting: Object.freeze(["evaluating", "evidence_required", "blocked", "cancelled", "stale"]),
    evaluating: Object.freeze(["reviewing", "revision_required", "evidence_required", "rollback_required", "blocked", "failed", "cancelled", "stale"]),
    reviewing: Object.freeze(["completed", "revision_required", "evidence_required", "rollback_required", "blocked", "failed", "cancelled", "stale"]),
  });
  const REFERENCE_FIELDS = new Set([
    "id", "verificationId", "projectId", "patternId", "calculationId",
    "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceDecisionId",
    "sourceExecutionId", "predecessorVerificationId", "supersedesVerificationId",
    "evidenceId", "evidenceRefs", "references", "requirementKeys", "operationKey",
  ]);

  class PatternEvolutionExecutionVerificationError extends Error {
    constructor(code, message, details = null) {
      super(message);
      this.name = "PatternEvolutionExecutionVerificationError";
      this.code = code;
      this.userMessage = message;
      this.details = details;
    }
  }

  const verificationError = (code, message, details) => new PatternEvolutionExecutionVerificationError(code, message, details);
  const array = (value) => Array.isArray(value) ? value : [];
  const clone = (value) => value === undefined ? undefined : globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value));
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function lower(value) { return normalizeText(value).toLowerCase(); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value); }
  function injectedTimestamp(...values) { const result = values.find(isTimestamp); if (!result) throw verificationError("timestamp_required", "An injected source timestamp is required."); return result; }
  function canonicalize(value, seen = new Set()) {
    if (value === undefined) return "null";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (seen.has(value)) throw verificationError("cyclic_input", "Cyclic verification data is not supported.");
    seen.add(value); let result;
    if (Array.isArray(value)) result = `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
    else result = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    seen.delete(value); return result;
  }
  function fingerprint(value) { const input = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function normalizeObject(value) {
    if (value === undefined) return null;
    if (typeof value === "string") return normalizeText(value);
    if (Array.isArray(value)) return value.map(normalizeObject);
    if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      const result = {}; for (const key of Object.keys(value).sort(compare)) result[key] = normalizeObject(value[key]); return result;
    }
    return value;
  }
  function stableStrings(values) { return [...new Set(array(values).map((value) => normalizeText(typeof value === "object" ? value?.id || value?.code || value?.key || value?.name : value)).filter(Boolean))].sort(compare); }
  function stableObjects(values, key = "id") {
    const unique = new Map();
    for (const item of array(values)) { const value = normalizeObject(clone(item)); const identity = normalizeText(value?.[key] || value?.id || value?.key || value?.code) || fingerprint(value); if (!unique.has(identity)) unique.set(identity, value); }
    return [...unique.values()].sort((a, b) => compare(a?.[key] || a?.id || a?.key || a?.code || canonicalize(a), b?.[key] || b?.id || b?.key || b?.code || canonicalize(b)));
  }
  function snapshot(value) { return freeze(normalizeObject(clone(value || {}))); }
  function idOf(value, ...fields) { for (const field of ["id", ...fields]) { const id = normalizeText(value?.[field]); if (id) return id; } return ""; }
  function reason(code, category, message, references = []) { return freeze({ code, category, message, references: stableStrings(references) }); }
  function addReason(collection, code, category, message, references = []) { collection.push(reason(code, category, message, references)); }
  function check(id, type, required, applicable, expected, observed, result, evidenceRefs = [], reasonCodes = []) {
    return freeze({ id, type, required: required !== false, applicable: applicable !== false, expected: normalizeObject(expected), observed: normalizeObject(observed), result, evidenceRefs: stableStrings(evidenceRefs), reasonCodes: stableStrings(reasonCodes) });
  }
  function normalizedChecks(values) { return stableObjects(values, "id"); }
  function normalizedSource(source = {}) {
    const execution = source.execution || source.sourceExecution || (source.kind === SOURCE_KIND ? source : null);
    const snapshots = execution?.sourceSnapshots || {};
    return freeze({
      projectId: normalizeText(source.projectId || execution?.projectId), patternId: normalizeText(source.patternId || execution?.patternId), calculationId: normalizeText(source.calculationId || execution?.calculationId),
      execution: execution ? clone(execution) : null,
      decision: clone(Object.prototype.hasOwnProperty.call(source, "decision") ? source.decision : Object.prototype.hasOwnProperty.call(source, "sourceDecision") ? source.sourceDecision : snapshots.decision || null),
      review: clone(Object.prototype.hasOwnProperty.call(source, "review") ? source.review : Object.prototype.hasOwnProperty.call(source, "sourceReview") ? source.sourceReview : snapshots.review || null),
      proposal: clone(Object.prototype.hasOwnProperty.call(source, "proposal") ? source.proposal : Object.prototype.hasOwnProperty.call(source, "sourceProposal") ? source.sourceProposal : snapshots.proposal || null),
      initiation: clone(Object.prototype.hasOwnProperty.call(source, "initiation") ? source.initiation : Object.prototype.hasOwnProperty.call(source, "sourceInitiation") ? source.sourceInitiation : snapshots.initiation || null),
      executions: array(source.executions).map((item) => clone(item?.state || item)),
      decisions: array(source.decisions).map((item) => clone(item?.state || item)),
      quarantinedExecutionIds: stableStrings(array(source.quarantinedExecutionIds)),
    });
  }
  function executionDigest(value) { return globalObject.YarnAIPatternEvolutionExecution?.calculateExecutionDigest?.(value) || normalizeText(value?.digest) || fingerprint(snapshot(value)); }
  function artifactDigest(name, value) {
    const executionApi = globalObject.YarnAIPatternEvolutionExecution;
    if (name === "decision") return executionApi?.decisionDigest?.(value) || normalizeText(value?.digest) || fingerprint(snapshot(value));
    if (name === "review") return executionApi?.reviewDigest?.(value) || normalizeText(value?.digest) || fingerprint(snapshot(value));
    if (name === "proposal") return executionApi?.proposalDigest?.(value) || normalizeText(value?.identity || value?.proposalDigest) || fingerprint(snapshot(value));
    return executionApi?.initiationDigest?.(value) || normalizeText(value?.identity || value?.sourceDigest) || fingerprint(snapshot(value));
  }
  function sourceBindingFrom(source) {
    const execution = source.execution;
    const entry = (name, value, idField) => ({ id: idOf(value, idField), revision: positiveInteger(value?.revision), digest: value ? artifactDigest(name, value) : "" });
    return freeze({
      initiation: entry("initiation", source.initiation, "initiationId"), proposal: entry("proposal", source.proposal, "proposalId"),
      review: entry("review", source.review, "reviewId"), decision: entry("decision", source.decision, "decisionId"),
      execution: { id: idOf(execution, "executionId"), revision: positiveInteger(execution?.revision), digest: execution ? executionDigest(execution) : "" },
    });
  }
  function calculateSourceGate(source = {}, record = null) {
    const normalized = normalizedSource(source); const reasons = []; const execution = normalized.execution; const binding = sourceBindingFrom(normalized);
    if (!execution) addReason(reasons, "missing_source_execution", "source", "A persisted execution is required.");
    if (execution) {
      if (execution.kind !== SOURCE_KIND || execution.type !== SOURCE_KIND || execution.version !== 1 || execution.schemaVersion !== 1) addReason(reasons, "source_execution_header_invalid", "integrity", "The execution kind or version is unsupported.");
      const executionApi = globalObject.YarnAIPatternEvolutionExecution;
      if (!executionApi?.TERMINAL_LIFECYCLES?.includes(execution.lifecycle)) addReason(reasons, "non_terminal_execution", "source", "Only a terminal execution can be verified.");
      const report = executionApi?.validatePatternEvolutionExecution?.(execution);
      if (!report?.valid) addReason(reasons, "source_execution_domain_invalid", "integrity", "The execution failed local domain validation.");
      if (execution.digest !== binding.execution.digest) addReason(reasons, "execution_digest_mismatch", "integrity", "The execution digest is invalid.");
      if (execution.identity !== executionApi?.calculateExecutionIdentity?.(execution)) addReason(reasons, "execution_identity_mismatch", "integrity", "The execution identity is invalid.");
      if (execution.lifecycle === "stale" || execution.status === "stale" || execution.sourceProof?.current === false) addReason(reasons, "stale_source", "stale", "The execution is stale.");
      if (execution.importedUnproven || execution.proofStatus === "imported-unproven") addReason(reasons, "imported_unproven", "trust", "Imported execution truth is not locally proven.");
      if (execution.collision) addReason(reasons, "collision", "trust", "The execution has an identity collision.");
      if (execution.quarantined || normalized.quarantinedExecutionIds.includes(execution.id)) addReason(reasons, "quarantine", "trust", "The execution is quarantined.");
      if (execution.sourceProof?.valid !== true || execution.sourceProof?.authorized !== true || execution.sourceProof?.current !== true || execution.sourceProof?.provenanceProven !== true) addReason(reasons, "execution_provenance_unproven", "trust", "Execution provenance is not current and proven.");
    }
    for (const [name, idField] of [["initiation", "initiationId"], ["proposal", "proposalId"], ["review", "reviewId"], ["decision", "decisionId"]]) {
      const artifact = normalized[name]; if (!artifact) { addReason(reasons, `missing_source_${name}`, "source", `The ${name} source is missing.`); continue; }
      if (execution && canonicalize(execution.sourceSnapshots?.[name]) !== canonicalize(snapshot(artifact))) addReason(reasons, `${name}_snapshot_mismatch`, "stale", `The execution ${name} snapshot differs from the live canonical source.`);
      if (execution && execution[`source${name[0].toUpperCase()}${name.slice(1)}Id`] !== idOf(artifact, idField)) addReason(reasons, `${name}_identity_mismatch`, "integrity", `The ${name} identity does not match the execution binding.`);
      if (execution && execution[`source${name[0].toUpperCase()}${name.slice(1)}Revision`] !== positiveInteger(artifact.revision)) addReason(reasons, `${name}_revision_mismatch`, "stale", `The ${name} revision does not match the execution binding.`);
      if (execution && execution[`source${name[0].toUpperCase()}${name.slice(1)}Digest`] !== artifactDigest(name, artifact)) addReason(reasons, `${name}_digest_mismatch`, "integrity", `The ${name} digest does not match the execution binding.`);
      if (artifact.importedUnproven || artifact.proofStatus === "imported-unproven") addReason(reasons, `${name}_imported_unproven`, "trust", `The ${name} source is imported-unproven.`);
      if (artifact.collision || artifact.quarantined) addReason(reasons, `${name}_untrusted`, "trust", `The ${name} source is collided or quarantined.`);
    }
    const decision = normalized.decision;
    if (decision && (decision.lifecycle !== "authorized" || decision.outcome !== "authorize" || decision.nextAction !== "proceed_to_next_stage")) addReason(reasons, "decision_not_authorized", "authorization", "The source decision is not a terminal authorization.");
    if (execution && decision && execution.sourceDecisionId !== decision.id) addReason(reasons, "execution_decision_mismatch", "authorization", "Execution is not bound to the live authorized decision.");
    if (decision?.sourceSnapshots) {
      for (const name of ["initiation", "proposal", "review"]) if (normalized[name] && canonicalize(decision.sourceSnapshots[name]) !== canonicalize(snapshot(normalized[name]))) addReason(reasons, `decision_${name}_snapshot_mismatch`, "stale", `Decision ${name} snapshot differs from its live source.`);
    }
    if (normalized.projectId && [execution, decision, normalized.review, normalized.proposal, normalized.initiation].filter(Boolean).some((item) => item.projectId !== normalized.projectId)) addReason(reasons, "project_identity_mismatch", "integrity", "Source project identities differ.");
    if (normalized.patternId && [execution, decision, normalized.review, normalized.proposal, normalized.initiation].filter(Boolean).some((item) => item.patternId !== normalized.patternId)) addReason(reasons, "pattern_identity_mismatch", "integrity", "Source pattern identities differ.");
    const risk = lower(execution?.risk?.level); const decisionRisk = lower(decision?.risk?.level);
    if (!RISK_LEVELS.includes(risk) || !RISK_LEVELS.includes(decisionRisk)) addReason(reasons, "invalid_risk", "risk", "Risk is missing or unsupported.");
    if (risk && decisionRisk && risk !== decisionRisk) addReason(reasons, "source_risk_mismatch", "risk", "Execution risk differs from the authorized decision.");
    if (risk === "critical") addReason(reasons, "critical_risk", "risk", "Critical-risk execution cannot be accepted as successful.");
    if (execution) {
      const sameId = normalized.executions.filter((item) => item?.id === execution.id);
      if (sameId.some((item) => canonicalize(item) !== canonicalize(execution))) addReason(reasons, "identity_collision", "trust", "Execution identity collides with different content.");
      const superseded = normalized.executions.some((item) => item?.id !== execution.id && (item?.predecessorExecutionId === execution.id || item?.supersedesExecutionId === execution.id || item?.semanticIdentity === execution.semanticIdentity && positiveInteger(item?.revision) > positiveInteger(execution.revision)));
      if (superseded) addReason(reasons, "superseded_execution", "stale", "A later valid execution supersedes this revision.");
    }
    if (record) {
      if (record.sourceExecutionId !== binding.execution.id || record.sourceExecutionRevision !== binding.execution.revision || record.sourceExecutionDigest !== binding.execution.digest) addReason(reasons, "verification_source_binding_mismatch", "integrity", "Verification binding differs from the source execution.");
    }
    const stable = stableObjects(reasons, "code");
    return freeze({ valid: stable.length === 0, blocked: stable.length > 0, reasons: stable, normalized, binding, risk: risk || "invalid" });
  }

  function normalizeEvidence(values) {
    return stableObjects(array(values).map((item, index) => {
      const source = item || {}; const id = normalizeText(source.id || source.evidenceId) || `evidence:${index + 1}`;
      return { id, type: lower(source.type) || "structured", digest: normalizeText(source.digest || source.evidenceDigest), validationStatus: lower(source.validationStatus || source.status) || "unproven", requirementKeys: stableStrings(source.requirementKeys || source.references), payload: normalizeObject(source.payload || {}), provenance: normalizeObject(source.provenance || {}) };
    }), "id");
  }
  function evidenceState(evidence, execution) {
    if (!ALLOWED_EVIDENCE_TYPES.includes(evidence.type)) return "malformed";
    const expectedDigest = fingerprint(normalizeObject(evidence.payload || {}));
    if (!evidence.digest || evidence.digest !== expectedDigest && evidence.provenance?.digestVerified !== true) return "malformed";
    if (evidence.provenance?.quarantined || evidence.provenance?.malformed) return "malformed";
    if (evidence.provenance?.importedUnproven || evidence.provenance?.proofStatus === "imported-unproven") return "untrusted";
    if (evidence.provenance?.executionId && evidence.provenance.executionId !== execution.id) return "untrusted";
    if (evidence.provenance?.executionRevision && (!positiveInteger(evidence.provenance.executionRevision) || evidence.provenance.executionRevision > execution.revision)) return "untrusted";
    if (["conflicting", "contradictory", "failed", "invalid"].includes(evidence.validationStatus)) return "conflicting";
    if (!["validated", "proven", "passed"].includes(evidence.validationStatus)) return "untrusted";
    return "valid";
  }
  function coverage(checks) {
    const applicable = array(checks).filter((item) => item.applicable && item.required); const passed = applicable.filter((item) => item.result === "passed").length;
    return freeze({ required: applicable.length, passed, missing: applicable.filter((item) => item.result === "missing").length, failed: applicable.filter((item) => ["failed", "conflicting", "malformed", "untrusted"].includes(item.result)).length, ratio: applicable.length ? passed / applicable.length : 1, complete: passed === applicable.length });
  }
  function expectedMatches(expected, observed) {
    if (!expected || typeof expected !== "object" || !Object.keys(expected).length) return observed !== undefined && observed !== null;
    if (!observed || typeof observed !== "object") return false;
    const proofBearing = Object.keys(expected).filter((key) => key in observed || /(?:id|identity|digest|checksum|revision)$/i.test(key));
    return proofBearing.every((key) => expected[key] === undefined || canonicalize(expected[key]) === canonicalize(observed[key]));
  }
  function calculateVerificationContract(source = {}) {
    const gate = calculateSourceGate(source); const execution = gate.normalized.execution; const reasons = [...gate.reasons];
    const empty = { operationChecks: [], preconditionChecks: [], dependencyChecks: [], mandatoryConditionChecks: [], outputChecks: [], evidenceChecks: [], postconditionChecks: [], compatibilityChecks: [], migrationChecks: [], rollbackChecks: [], riskControlChecks: [], stopConditionChecks: [], provenanceChecks: [], integrityChecks: [] };
    if (!execution) return freeze({ gate, ...empty, completeness: coverage([]), consistency: coverage([]), coverage: { evidence: coverage([]), operations: coverage([]), outputs: coverage([]), postconditions: coverage([]), riskControls: coverage([]) }, exceptions: [], unresolvedFindings: stableObjects(reasons, "code"), reasons: stableObjects(reasons, "code"), conditions: [], expectedOutcome: null, actualOutcome: null, verdict: "blocked", status: "blocked", nextAction: "resolve_source_chain" });
    const plan = execution.executionPlan || {}; const evidence = normalizeEvidence(execution.evidence); const observations = array(execution.observations).map((item) => normalizeObject(item));
    const evidenceById = new Map(evidence.map((item) => [item.id, item])); const evidenceStates = new Map(evidence.map((item) => [item.id, evidenceState(item, execution)]));
    const rawEvidenceIds = new Map(); for (const item of array(execution.evidence)) { const id = normalizeText(item?.id || item?.evidenceId); if (!rawEvidenceIds.has(id)) rawEvidenceIds.set(id, []); rawEvidenceIds.get(id).push(item); }
    const evidenceChecks = [];
    for (const item of evidence) {
      const state = evidenceStates.get(item.id); const raw = rawEvidenceIds.get(item.id) || [];
      const conflictingDuplicate = raw.length > 1 && new Set(raw.map((value) => canonicalize(value))).size > 1;
      const result = conflictingDuplicate ? "conflicting" : state === "valid" ? "passed" : state;
      evidenceChecks.push(check(`evidence:${item.id}`, "evidence", true, true, { type: "allowlisted", digest: "valid", trust: "local-proven" }, { type: item.type, digest: item.digest, validationStatus: item.validationStatus, duplicateCount: raw.length }, result, [item.id], result === "passed" ? [] : [`evidence_${result}`]));
      if (result !== "passed") addReason(reasons, `evidence_${result}`, result === "conflicting" ? "rollback" : result === "malformed" ? "integrity" : "evidence", `Evidence ${item.id} is ${result}.`, [item.id]);
    }
    const requirements = stableObjects([
      ...array(plan.evidenceRequirements), ...array(plan.rollbackContract?.evidenceRequirements),
      ...array(plan.compatibilityContract?.evidenceRequirements), ...array(plan.migrationContract?.evidenceRequirements),
    ], "key");
    for (const requirement of requirements) {
      const matched = evidence.filter((item) => item.id === requirement.key || item.requirementKeys.includes(requirement.key)); const valid = matched.filter((item) => evidenceStates.get(item.id) === "valid");
      const result = !requirement.required ? "not_applicable" : valid.length ? "passed" : matched.length ? evidenceStates.get(matched[0].id) : "missing";
      evidenceChecks.push(check(`requirement:${requirement.key}`, "evidence_requirement", requirement.required, true, { requirementKey: requirement.key }, { evidenceIds: matched.map((item) => item.id) }, result, matched.map((item) => item.id), result === "passed" || result === "not_applicable" ? [] : [result === "missing" ? "evidence_missing" : `evidence_${result}`]));
      if (requirement.required && result !== "passed") addReason(reasons, result === "missing" ? "evidence_missing" : `evidence_${result}`, "evidence", `Required evidence ${requirement.key} is not proven.`, [requirement.key]);
    }
    const operationChecks = []; const operationKeys = new Set(array(plan.operations).map((item) => item.key)); const observedSequence = [];
    for (const operation of array(plan.operations)) {
      const matches = observations.filter((item) => item.operationKey === operation.key); if (matches.length) observedSequence.push(operation.key);
      const successful = matches.filter((item) => ["completed", "succeeded", "passed"].includes(lower(item.result)));
      const conflicting = matches.length > 1 && new Set(matches.map((item) => canonicalize(item.payload))).size > 1;
      const forbidden = FORBIDDEN_OPERATION_TYPES.includes(operation.operationType) || operation.classification !== "allowed";
      const result = forbidden ? "failed" : conflicting ? "conflicting" : successful.length ? "passed" : matches.length ? "failed" : "missing";
      const codes = forbidden ? ["forbidden_operation"] : conflicting ? ["conflicting_duplicate_operation"] : result === "missing" ? ["missing_mandatory_operation"] : result === "failed" ? ["operation_failed"] : [];
      operationChecks.push(check(`operation:${operation.key}`, "operation", true, true, { operationType: operation.operationType, order: operation.order, targetIdentity: operation.targetIdentity }, { observations: matches.map((item) => ({ key: item.key, result: item.result, payload: item.payload })) }, result, matches.flatMap((item) => item.evidenceReferences), codes));
      for (const code of codes) addReason(reasons, code, forbidden || conflicting ? "rollback" : result === "missing" ? "revision" : "execution", `Operation ${operation.key} failed verification.`, [operation.key]);
    }
    for (const observation of observations.filter((item) => item.operationKey && !operationKeys.has(item.operationKey))) {
      const operationType = lower(observation.payload?.operationType || observation.operationType); const dangerous = FORBIDDEN_OPERATION_TYPES.includes(operationType) || observation.payload?.destructive === true || observation.payload?.schemaOperation === true || observation.payload?.codeExecution === true;
      const code = dangerous ? "forbidden_observed_operation" : "operation_outside_execution_plan";
      operationChecks.push(check(`unknown-operation:${observation.key}`, "operation", true, true, { operationKey: "authorised and planned" }, observation, "failed", observation.evidenceReferences, [code]));
      addReason(reasons, code, dangerous ? "rollback" : "revision", "An observed operation is outside the authorized execution plan.", [observation.key]);
    }
    if (observedSequence.length === array(plan.executionOrder).length && canonicalize(observedSequence) !== canonicalize(plan.executionOrder)) addReason(reasons, "invalid_operation_order", "revision", "Observed operation order differs from the order-sensitive plan.");
    const requirementChecks = (values, type) => normalizedChecks(array(values).map((item) => {
      const refs = stableStrings(item.evidenceReferences); const proofRefs = refs.filter((id) => id.startsWith("evidence:") || evidenceById.has(id)); const evidencePassed = !proofRefs.length || proofRefs.every((id) => evidenceStates.get(id) === "valid"); const result = !item.required ? "not_applicable" : item.satisfied && evidencePassed ? "passed" : !item.satisfied ? "failed" : "missing";
      if (item.required && result !== "passed") addReason(reasons, `unsatisfied_${type}`, type === "mandatory_condition" ? "revision" : "blocked", `Required ${type.replaceAll("_", " ")} ${item.key} is not proven.`, [item.key]);
      return check(`${type}:${item.key}`, type, item.required, true, { satisfied: true }, { satisfied: item.satisfied }, result, proofRefs, result === "passed" || result === "not_applicable" ? [] : [`unsatisfied_${type}`]);
    }));
    const preconditionChecks = requirementChecks(plan.preconditions, "precondition");
    const dependencyChecks = requirementChecks(plan.dependencies, "dependency");
    const mandatoryConditionChecks = requirementChecks(plan.mandatoryConditions, "mandatory_condition");
    const outputChecks = []; const actualOutputs = array(execution.outputs);
    for (const expected of array(plan.expectedOutputs)) {
      const operationObservations = observations.filter((item) => item.operationKey === expected.key && ["completed", "succeeded", "passed"].includes(lower(item.result)));
      const candidates = [...actualOutputs.filter((item) => item.key === expected.key || item.operationKey === expected.key).map((item) => item.output || item.payload || item), ...operationObservations.map((item) => item.payload)];
      const matching = candidates.find((item) => expectedMatches(expected.output || expected.expectedOutput || {}, item)); const result = matching ? "passed" : candidates.length ? "failed" : "missing";
      outputChecks.push(check(`output:${expected.key}`, "output", true, true, expected.output || expected.expectedOutput || {}, matching || candidates, result, operationObservations.flatMap((item) => item.evidenceReferences), result === "passed" ? [] : [result === "missing" ? "output_missing" : "output_mismatch"]));
      if (result !== "passed") addReason(reasons, result === "missing" ? "output_missing" : "output_mismatch", result === "failed" ? "rollback" : "evidence", `Expected output ${expected.key} is not proven.`, [expected.key]);
    }
    for (const output of actualOutputs.filter((item) => !array(plan.expectedOutputs).some((expected) => expected.key === (item.key || item.operationKey)))) { outputChecks.push(check(`unauthorized-output:${idOf(output, "key", "operationKey") || fingerprint(output)}`, "output", true, true, "authorized output", output, "failed", output.evidenceReferences, ["unauthorized_output"])); addReason(reasons, "unauthorized_output", "rollback", "Execution produced an unauthorized output."); }
    const postconditionChecks = normalizedChecks(array(plan.verificationContract?.postconditions).map((item) => {
      const observationsForItem = observations.filter((observation) => observation.observationType === "postcondition" && (observation.payload?.key === item.key || array(observation.reasonCodes).includes(item.key)));
      const passed = item.satisfied === true || observationsForItem.some((observation) => lower(observation.result) === "passed"); const result = !item.required ? "not_applicable" : passed ? "passed" : observationsForItem.length ? "failed" : "missing";
      if (item.required && result !== "passed") addReason(reasons, "postcondition_unproven", "evidence", `Postcondition ${item.key} is not proven.`, [item.key]);
      return check(`postcondition:${item.key}`, "postcondition", item.required, true, { satisfied: true }, { satisfied: item.satisfied, observations: observationsForItem }, result, [...array(item.evidenceReferences), ...observationsForItem.flatMap((entry) => entry.evidenceReferences)], result === "passed" || result === "not_applicable" ? [] : ["postcondition_unproven"]);
    }));
    const compatibility = plan.compatibilityContract || {}; const compatibilityAxes = ["backwardCompatibility", "forwardCompatibility", "dataCompatibility", "uiCompatibility", "apiCompatibility", "importedRecordCompatibility", "migrationCompatibility"];
    const compatibilityChecks = normalizedChecks(compatibilityAxes.map((axis) => { const observed = lower(compatibility[axis]); const passed = !["unknown", "failed", "incompatible", ""].includes(observed) && lower(compatibility.validationStatus) === "passed"; if (!passed) addReason(reasons, "compatibility_unproven", "rollback", `Compatibility axis ${axis} is not proven.`, [axis]); return check(`compatibility:${axis}`, "compatibility", true, true, "compatible and validated", observed, passed ? "passed" : "failed", [], passed ? [] : ["compatibility_unproven"]); }));
    const migration = plan.migrationContract || {}; const migrationApplicable = migration.required === true;
    const migrationPassed = !migrationApplicable || migration.executionState === "verified" && migration.migrationType !== "schema" && migration.sourceSchemaVersion === migration.targetSchemaVersion;
    const migrationChecks = [check("migration:contract", "migration", migrationApplicable, migrationApplicable, { executionState: "verified", schemaChange: false }, migration, migrationPassed ? "passed" : "failed", array(migration.evidenceRequirements).flatMap((item) => item.evidenceReferences), migrationPassed ? [] : ["migration_unproven"] )];
    if (!migrationPassed) addReason(reasons, "migration_unproven", migration.migrationType === "schema" || migration.sourceSchemaVersion !== migration.targetSchemaVersion ? "rollback" : "evidence", "Applicable migration result is not safely proven.");
    const rollback = plan.rollbackContract || {}; const rollbackApplicable = rollback.required === true || execution.lifecycle === "rollback_required" || array(execution.observations).some((item) => item.observationType === "rollback");
    const rollbackClaimed = ["completed", "rolled_back"].includes(lower(rollback.status)) || array(execution.observations).some((item) => item.observationType === "rollback" && ["completed", "passed"].includes(lower(item.result)));
    const rollbackEvidence = array(rollback.evidenceRequirements).every((item) => !item.required || evidence.some((entry) => (entry.id === item.key || entry.requirementKeys.includes(item.key)) && evidenceStates.get(entry.id) === "valid"));
    const rollbackPassed = !rollbackApplicable || execution.lifecycle !== "rollback_required" && !rollbackClaimed || rollbackClaimed && rollbackEvidence;
    const rollbackChecks = [check("rollback:contract", "rollback", rollbackApplicable, rollbackApplicable, { allowlisted: true, evidence: "proven when applied" }, rollback, rollbackPassed ? "passed" : rollbackEvidence ? "failed" : "missing", array(rollback.evidenceRequirements).map((item) => item.key), rollbackPassed ? [] : ["rollback_unproven"] )];
    if (!rollbackPassed) addReason(reasons, "rollback_unproven", "rollback", "Required or claimed rollback is not completely proven.");
    const riskControlChecks = requirementChecks(plan.riskControls, "risk_control");
    const stopConditionChecks = normalizedChecks(array(plan.stopConditions).map((item) => { const triggered = observations.some((observation) => observation.observationType === "stop_condition" && (observation.payload?.key === item.key || array(observation.reasonCodes).includes(item.key)) && ["triggered", "failed"].includes(lower(observation.result))); const result = triggered ? "failed" : "passed"; if (triggered) addReason(reasons, "ignored_stop_condition", "rollback", `Stop condition ${item.key} was triggered.`, [item.key]); return check(`stop-condition:${item.key}`, "stop_condition", item.required, true, { ignored: false }, { triggered }, result, item.evidenceReferences, triggered ? ["ignored_stop_condition"] : []); }));
    const provenanceChecks = normalizedChecks([
      check("provenance:execution", "provenance", true, true, { valid: true, authorized: true, current: true, provenanceProven: true }, execution.sourceProof, gate.valid ? "passed" : "failed", [], gate.valid ? [] : gate.reasons.map((item) => item.code)),
      check("provenance:decision", "provenance", true, true, { lifecycle: "authorized", outcome: "authorize" }, { lifecycle: gate.normalized.decision?.lifecycle, outcome: gate.normalized.decision?.outcome }, gate.normalized.decision?.lifecycle === "authorized" && gate.normalized.decision?.outcome === "authorize" ? "passed" : "failed"),
    ]);
    const integrityChecks = normalizedChecks([
      check("integrity:execution-digest", "integrity", true, true, bindingDigest(execution), execution.digest, execution.digest === executionDigest(execution) ? "passed" : "failed"),
      ...["initiation", "proposal", "review", "decision"].map((name) => check(`integrity:snapshot:${name}`, "integrity", true, true, snapshot(gate.normalized[name]), execution.sourceSnapshots?.[name], canonicalize(snapshot(gate.normalized[name])) === canonicalize(execution.sourceSnapshots?.[name]) ? "passed" : "failed")),
    ]);
    const allChecks = [...operationChecks, ...preconditionChecks, ...dependencyChecks, ...mandatoryConditionChecks, ...outputChecks, ...evidenceChecks, ...postconditionChecks, ...compatibilityChecks, ...migrationChecks, ...rollbackChecks, ...riskControlChecks, ...stopConditionChecks, ...provenanceChecks, ...integrityChecks];
    const completeness = coverage(allChecks); const consistencyChecks = allChecks.filter((item) => item.result !== "missing"); const consistency = coverage(consistencyChecks);
    const byCategory = { evidence: coverage(evidenceChecks), operations: coverage(operationChecks), outputs: coverage(outputChecks), postconditions: coverage(postconditionChecks), riskControls: coverage(riskControlChecks) };
    const sourceLifecycle = execution.lifecycle; const categories = new Set(reasons.map((item) => item.category)); let verdict;
    if (!gate.valid || categories.has("integrity") || categories.has("trust") || categories.has("authorization") || categories.has("risk")) verdict = "blocked";
    else if (categories.has("rollback")) verdict = "rollback_required";
    else if (categories.has("evidence")) verdict = "evidence_required";
    else if (categories.has("revision")) verdict = "revision_required";
    else if (sourceLifecycle === "failed") verdict = "failed";
    else if (sourceLifecycle === "blocked") verdict = "blocked";
    else if (sourceLifecycle === "cancelled") verdict = "cancelled";
    else if (sourceLifecycle === "rollback_required") verdict = "rollback_required";
    else if (sourceLifecycle === "evidence_required") verdict = "evidence_required";
    else if (sourceLifecycle === "revision_required") verdict = "revision_required";
    else if (sourceLifecycle === "completed" && completeness.complete && consistency.complete) verdict = "verified";
    else verdict = "revision_required";
    const status = statusForVerdict(verdict); const stableReasons = stableObjects(reasons, "code");
    return freeze({
      gate, verificationScope: { projectId: execution.projectId, patternId: execution.patternId, calculationId: execution.calculationId, sourceExecutionId: execution.id, operationKeys: stableStrings(array(plan.operations).map((item) => item.key)), affectedArtifacts: stableStrings(plan.affectedArtifacts) },
      sourceExecution: gate.binding.execution, sourceDecision: gate.binding.decision,
      expectedOutcome: { lifecycle: "completed", operations: array(plan.operations).map((item) => item.key), outputs: array(plan.expectedOutputs).map((item) => item.key), postconditions: array(plan.verificationContract?.postconditions).map((item) => item.key) },
      actualOutcome: { lifecycle: execution.lifecycle, status: execution.status, observationResults: observations.map((item) => ({ key: item.key, operationKey: item.operationKey, result: item.result })), outputCount: actualOutputs.length },
      operationChecks, preconditionChecks, dependencyChecks, mandatoryConditionChecks, outputChecks, evidenceChecks, postconditionChecks, compatibilityChecks, migrationChecks, rollbackChecks, riskControlChecks, stopConditionChecks, provenanceChecks, integrityChecks,
      completeness, consistency, coverage: byCategory, exceptions: stableObjects(execution.exceptions, "id"), unresolvedFindings: stableReasons, reasons: stableReasons, conditions: [], verdict, status, nextAction: nextActionForVerdict(verdict),
    });
  }
  function bindingDigest(execution) { return executionDigest(execution); }
  function statusForVerdict(verdict) { return ({ verified: "completed", verified_with_conditions: "completed", revision_required: "require_revision", evidence_required: "require_evidence", rollback_required: "require_rollback", blocked: "blocked", failed: "failed", cancelled: "cancelled" })[verdict] || "blocked"; }
  function nextActionForVerdict(verdict) { return ({ verified: "verification_complete", verified_with_conditions: "verification_complete", revision_required: "revise_execution", evidence_required: "collect_verification_evidence", rollback_required: "perform_rollback", blocked: "resolve_source_chain", failed: "investigate_failure", cancelled: "no_action_cancelled" })[verdict] || "resolve_source_chain"; }
  function identityPayload(record) { return { projectId: record.projectId, patternId: record.patternId, calculationId: record.calculationId, sourceInitiationId: record.sourceInitiationId, sourceProposalId: record.sourceProposalId, sourceReviewId: record.sourceReviewId, sourceDecisionId: record.sourceDecisionId, sourceExecutionId: record.sourceExecutionId, sourceExecutionRevision: record.sourceExecutionRevision, sourceExecutionDigest: record.sourceExecutionDigest, sourceChainDigest: record.sourceChainDigest, verificationScope: normalizeObject(record.verificationScope), verificationPolicyVersion: record.verificationPolicyVersion, evidencePolicyVersion: record.evidencePolicyVersion, risk: normalizeObject(record.risk), predecessorVerificationId: record.predecessorVerificationId, epoch: record.epoch }; }
  function semanticIdentityPayload(record) { const payload = identityPayload(record); delete payload.predecessorVerificationId; delete payload.epoch; return payload; }
  function calculateVerificationIdentity(record) { return fingerprint(identityPayload(record)); }
  function calculateSemanticIdentity(record) { return fingerprint(semanticIdentityPayload(record)); }
  function digestPayload(record) { const payload = { ...identityPayload(record), id: record.id, sourceSnapshots: normalizeObject(record.sourceSnapshots), sourceBinding: normalizeObject(record.sourceBinding), contract: normalizeObject(record.verificationContract), lifecycle: record.lifecycle, status: record.status, verdict: record.verdict, nextAction: record.nextAction, imported: record.imported, importedUnproven: record.importedUnproven, collision: record.collision, proofStatus: record.proofStatus, provenance: normalizeObject(record.provenance), revision: record.revision }; return payload; }
  function calculateVerificationDigest(record) { return fingerprint(digestPayload(record)); }
  function lifecycleStatus(record) {
    const flags = new Set(["pending"]); if (record.lifecycle === "stale") flags.add("stale"); if (record.lifecycle === "failed") flags.add("failed"); if (record.lifecycle === "rollback_required") flags.add("require_rollback"); if (record.lifecycle === "blocked") flags.add("blocked"); if (record.lifecycle === "evidence_required") flags.add("require_evidence"); if (record.lifecycle === "revision_required") flags.add("require_revision"); if (record.lifecycle === "cancelled") flags.add("cancelled"); if (record.lifecycle === "completed") flags.add("completed"); if (["collecting", "evaluating", "reviewing"].includes(record.lifecycle)) flags.add("in_progress"); if (record.lifecycle === "draft" && record.sourceProof?.valid) flags.add("ready"); return STATUS_PRECEDENCE.find((item) => flags.has(item)) || "blocked";
  }
  function refreshDerived(record) { const next = clone(record); next.status = lifecycleStatus(next); next.verificationStatus = next.status; next.nextAction = TERMINAL_LIFECYCLES.includes(next.lifecycle) ? nextActionForVerdict(next.verdict) : next.lifecycle === "draft" ? "collect_verification_evidence" : next.lifecycle === "collecting" ? "evaluate_verification" : next.lifecycle === "evaluating" ? "review_verification" : "review_verification"; next.digest = calculateVerificationDigest(next); return freeze(next); }
  function createPatternEvolutionExecutionVerification(source = {}, input = {}) {
    const assessment = calculateVerificationContract(source); if (!assessment.gate.normalized.execution) throw verificationError("missing_source", "A Stage 49 execution is required.", { reasons: assessment.reasons }); if (!assessment.gate.valid) throw verificationError("source_gate_failed", "Only a locally proven terminal execution can be verified.", { reasons: assessment.reasons });
    const execution = assessment.gate.normalized.execution; const binding = assessment.gate.binding; const timestamp = injectedTimestamp(input.now, execution.updatedAt); const epoch = positiveInteger(input.epoch) || 1;
    const sourceSnapshots = freeze({ initiation: snapshot(assessment.gate.normalized.initiation), proposal: snapshot(assessment.gate.normalized.proposal), review: snapshot(assessment.gate.normalized.review), decision: snapshot(assessment.gate.normalized.decision), execution: snapshot(execution) });
    const sourceChainDigest = fingerprint({ sourceSnapshots, sourceBinding: binding });
    const record = {
      id: "", verificationId: "", kind: PROGRESS_KIND, type: PROGRESS_KIND, version: VERSION, schemaVersion: SCHEMA_VERSION,
      verificationPolicyVersion: POLICY_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION,
      projectId: execution.projectId, patternId: execution.patternId, calculationId: execution.calculationId,
      sourceInitiationId: binding.initiation.id, sourceProposalId: binding.proposal.id, sourceReviewId: binding.review.id, sourceDecisionId: binding.decision.id,
      sourceExecutionId: binding.execution.id, sourceExecutionRevision: binding.execution.revision, sourceExecutionDigest: binding.execution.digest,
      sourceChainDigest, sourceBinding: binding, sourceSnapshots, sourceProof: { valid: true, current: true, provenanceProven: true, issues: [] },
      verificationScope: assessment.verificationScope, verificationContract: assessment,
      risk: { level: assessment.gate.risk, policyVersion: execution.risk?.policyVersion || execution.riskPolicyVersion },
      verdict: assessment.verdict, lifecycle: "draft", status: "ready", verificationStatus: "ready", nextAction: "collect_verification_evidence",
      reasons: assessment.reasons, reasonCodes: stableStrings(assessment.reasons.map((item) => item.code)), conditions: assessment.conditions,
      imported: false, importedUnproven: false, collision: false, quarantined: false, proofStatus: "proven",
      provenance: { origin: "local", sourceExecutionId: execution.id, policyVersion: POLICY_VERSION }, predecessorVerificationId: normalizeText(input.predecessorVerificationId) || null, supersedesVerificationId: normalizeText(input.supersedesVerificationId) || null,
      originalImport: input.originalImport ? snapshot(input.originalImport) : null, createdAt: timestamp, updatedAt: timestamp, revision: 1, epoch,
      identity: "", semanticIdentity: "", digest: "", audit: [{ event: "created", at: timestamp, revision: 1, sourceExecutionId: execution.id }],
    };
    record.identity = calculateVerificationIdentity(record); record.semanticIdentity = calculateSemanticIdentity(record); record.id = normalizeText(input.id || input.verificationId) || `pattern-evolution-execution-verification:${record.identity.slice(8)}`; record.verificationId = record.id;
    const refreshed = refreshDerived(record); const report = validatePatternEvolutionExecutionVerification(refreshed); if (!report.valid) throw verificationError("verification_invalid", "Computed verification is invalid.", { errors: report.errors }); return refreshed;
  }
  function validationResult(errors) { const unique = new Map(errors.map((item) => [`${item.code}\0${item.field || ""}`, item])); return freeze({ valid: unique.size === 0, errors: [...unique.values()].sort((a, b) => compare(a.code, b.code) || compare(a.field, b.field)) }); }
  function validatePatternEvolutionExecutionVerification(record) {
    const errors = []; const invalid = (code, field = null) => errors.push({ code, field }); try { canonicalize(record); } catch { invalid("corrupted_input"); return validationResult(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.version !== VERSION || record.schemaVersion !== SCHEMA_VERSION || record.verificationPolicyVersion !== POLICY_VERSION || record.evidencePolicyVersion !== EVIDENCE_POLICY_VERSION) invalid("invalid_header");
    for (const field of ["id", "projectId", "patternId", "calculationId", "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceDecisionId", "sourceExecutionId", "sourceExecutionDigest", "sourceChainDigest", "identity", "semanticIdentity", "digest"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (record?.verificationId !== record?.id || !LIFECYCLES.includes(record?.lifecycle) || !STATUSES.includes(record?.status) || record?.verificationStatus !== record?.status || !VERDICTS.includes(record?.verdict) || !NEXT_ACTIONS.includes(record?.nextAction)) invalid("invalid_lifecycle_or_status");
    if (!positiveInteger(record?.revision) || !positiveInteger(record?.epoch) || !isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("invalid_revision");
    if (!record?.sourceSnapshots?.execution || !record?.sourceSnapshots?.decision || !record?.sourceSnapshots?.review || !record?.sourceSnapshots?.proposal || !record?.sourceSnapshots?.initiation || !record?.sourceBinding || !record?.sourceProof || !record?.verificationScope || !record?.verificationContract || !Array.isArray(record?.audit) || !Array.isArray(record?.reasons) || !Array.isArray(record?.reasonCodes)) invalid("invalid_structure");
    if (record?.sourceSnapshots && fingerprint({ sourceSnapshots: record.sourceSnapshots, sourceBinding: record.sourceBinding }) !== record.sourceChainDigest) invalid("source_chain_digest_mismatch");
    if (record?.sourceSnapshots?.execution && (record.sourceSnapshots.execution.id !== record.sourceExecutionId || executionDigest(record.sourceSnapshots.execution) !== record.sourceExecutionDigest)) invalid("source_execution_snapshot_mismatch");
    if (calculateVerificationIdentity(record) !== record?.identity) invalid("identity_mismatch"); if (calculateSemanticIdentity(record) !== record?.semanticIdentity) invalid("semantic_identity_mismatch");
    if (lifecycleStatus(record) !== record?.status) invalid("derived_status_mismatch"); if (calculateVerificationDigest(record) !== record?.digest) invalid("digest_mismatch");
    if (record?.predecessorVerificationId === record?.id || record?.supersedesVerificationId === record?.id) invalid("predecessor_cycle");
    if (record?.lifecycle === "completed" && !["verified", "verified_with_conditions"].includes(record.verdict)) invalid("impossible_completed_state");
    if (TERMINAL_LIFECYCLES.includes(record?.lifecycle) && record.lifecycle !== terminalLifecycleForVerdict(record.verdict)) invalid("terminal_verdict_mismatch");
    if (stableStrings(record?.reasonCodes).length !== array(record?.reasonCodes).length || stableObjects(record?.reasons, "code").length !== array(record?.reasons).length) invalid("duplicate_or_unsorted_derived_values");
    return validationResult(errors);
  }
  function requireRecord(record) { const report = validatePatternEvolutionExecutionVerification(record); if (!report.valid) throw verificationError("corrupted_input", "Pattern evolution execution verification is corrupted.", { errors: report.errors }); }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw verificationError("revision_conflict", "Verification revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw verificationError("identity_conflict", "Verification identity changed."); }
  function terminalLifecycleForVerdict(verdict) { return ({ verified: "completed", verified_with_conditions: "completed", revision_required: "revision_required", evidence_required: "evidence_required", rollback_required: "rollback_required", blocked: "blocked", failed: "failed", cancelled: "cancelled" })[verdict] || "blocked"; }
  function transition(record, nextLifecycle, source = null, command = {}) {
    requireRecord(record); checkConcurrency(record, command); if (TERMINAL_LIFECYCLES.includes(record.lifecycle)) throw verificationError("terminal_immutable", "Terminal verifications are immutable."); if (record.lifecycle === "stale") throw verificationError("stale_immutable", "A stale verification cannot resume."); if (!TRANSITIONS[record.lifecycle]?.includes(nextLifecycle)) throw verificationError("invalid_transition", "Verification lifecycle transition is not allowlisted.");
    const assessment = source ? calculateVerificationContract(source) : record.verificationContract; if (source && !assessment.gate.valid && nextLifecycle !== "stale" && nextLifecycle !== "blocked") throw verificationError("source_gate_failed", "The source chain no longer proves this verification.", { reasons: assessment.reasons });
    if (TERMINAL_LIFECYCLES.includes(nextLifecycle) && nextLifecycle !== terminalLifecycleForVerdict(assessment.verdict)) throw verificationError("caller_verdict_rejected", "Terminal lifecycle is computed from verification facts.", { expected: terminalLifecycleForVerdict(assessment.verdict) });
    if (nextLifecycle === "completed" && record.lifecycle !== "reviewing") throw verificationError("invalid_transition", "Completion requires collection, evaluation, and review.");
    const timestamp = injectedTimestamp(command.now, record.updatedAt); const next = clone(record); next.lifecycle = nextLifecycle; next.verificationContract = assessment; next.verdict = assessment.verdict; next.reasons = assessment.reasons; next.reasonCodes = stableStrings(assessment.reasons.map((item) => item.code)); next.conditions = assessment.conditions; next.revision += 1; next.updatedAt = timestamp; next.audit = [...array(next.audit), { event: nextLifecycle, at: timestamp, revision: next.revision }]; return refreshDerived(next);
  }
  function startCollecting(record, source, command = {}) { return transition(record, "collecting", source, command); }
  function startEvaluating(record, source, command = {}) { return transition(record, "evaluating", source, command); }
  function startReviewing(record, source, command = {}) { return transition(record, "reviewing", source, command); }
  function finalizeVerification(record, source, command = {}) { const assessment = calculateVerificationContract(source); return transition(record, terminalLifecycleForVerdict(assessment.verdict), source, command); }
  function cancelVerification(record, source, command = {}) { const assessment = calculateVerificationContract(source); if (assessment.verdict !== "cancelled") throw verificationError("caller_verdict_rejected", "Cancellation cannot replace the computed verification result."); return transition(record, "cancelled", source, command); }
  function markVerificationStale(record, source, command = {}) { return transition(record, "stale", source, command); }
  function projectPatternEvolutionExecutionVerification(record, source = {}) { requireRecord(record); const gate = calculateSourceGate(source, record); if (gate.valid) return freeze({ record, lifecycle: record.lifecycle, status: record.status, verdict: record.verdict, stale: false, sourceGate: gate, reasons: record.reasons, nextAction: record.nextAction }); const next = clone(record); next.lifecycle = "stale"; next.sourceProof = { ...next.sourceProof, valid: false, current: false, issues: gate.reasons.map((item) => item.code) }; next.verdict = "blocked"; next.reasons = gate.reasons; next.reasonCodes = stableStrings(gate.reasons.map((item) => item.code)); const refreshed = refreshDerived(next); return freeze({ record: refreshed, lifecycle: "stale", status: "stale", verdict: "blocked", stale: true, sourceGate: gate, reasons: refreshed.reasons, nextAction: refreshed.nextAction }); }
  function classifyDuplicate(records, candidate) { const values = array(records).map((item) => item?.state || item); const sameId = values.find((item) => item?.id === candidate?.id); if (sameId && canonicalize(sameId) === canonicalize(candidate)) return freeze({ status: "exact_duplicate", record: sameId }); if (sameId) return freeze({ status: "collision", record: sameId }); const sameIdentity = values.find((item) => item?.identity === candidate?.identity); if (sameIdentity) return freeze({ status: sameIdentity.lifecycle === "completed" ? "duplicate_completed" : "identity_collision", record: sameIdentity }); const semantic = values.find((item) => item?.semanticIdentity === candidate?.semanticIdentity); if (semantic) return freeze({ status: semantic.lifecycle === "completed" ? "duplicate_completed" : "semantic_duplicate", record: semantic }); return freeze({ status: "unique", record: null }); }
  function serializePatternEvolutionExecutionVerification(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternEvolutionExecutionVerification(value) { let parsed; try { parsed = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw verificationError("malformed_record", "Verification payload is malformed."); } requireRecord(parsed); return freeze(parsed); }
  function safeNormalizePatternEvolutionExecutionVerification(value) { try { return freeze({ record: deserializePatternEvolutionExecutionVerification(value), corrupted: false, errors: [] }); } catch (error) { return freeze({ record: null, corrupted: true, errors: error?.details?.errors || [{ code: error?.code || "malformed_record", field: null }] }); } }
  function makeImportedPatternEvolutionExecutionVerificationUnproven(record, options = {}) { requireRecord(record); const timestamp = injectedTimestamp(options.now, record.updatedAt); const next = clone(record); next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.lifecycle = "blocked"; next.verdict = "blocked"; next.status = "blocked"; next.verificationStatus = "blocked"; next.nextAction = "resolve_source_chain"; next.sourceProof = { ...next.sourceProof, valid: false, current: false, provenanceProven: false, issues: stableStrings([...array(next.sourceProof?.issues), "imported_unproven"]) }; next.provenance = { ...next.provenance, origin: "import", importedDigest: record.digest }; next.reasons = stableObjects([...array(next.reasons), reason("imported_unproven", "trust", "Imported verification requires local semantic revalidation.")], "code"); next.reasonCodes = stableStrings(next.reasons.map((item) => item.code)); next.updatedAt = timestamp; next.revision += 1; next.audit = [...array(next.audit), { event: "imported_unproven", at: timestamp, revision: next.revision }]; next.digest = calculateVerificationDigest(next); return freeze(next); }
  function remapKnown(value, map, parentKey = "") { if (typeof value === "string") return REFERENCE_FIELDS.has(parentKey) && map.has(value) ? map.get(value) : value; if (Array.isArray(value)) return value.map((item) => remapKnown(item, map, parentKey)); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value)) { if (!REFERENCE_FIELDS.has(key) && map.has(key)) throw verificationError("forbidden_remap", "Only reference fields may be remapped."); result[key] = remapKnown(value[key], map, key); } return result; } return value; }
  function remapPatternEvolutionExecutionVerification(record, referenceMap) { requireRecord(record); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {})); for (const key of map.keys()) if (["verdict", "risk", "evidence", "verificationContract", "status", "lifecycle"].includes(key)) throw verificationError("forbidden_remap", "Verification facts cannot be remapped."); const remapped = remapKnown(clone(record), map); remapped.originalImport = snapshot({ originalImport: record.originalImport || record }); remapped.sourceSnapshots.execution.evidence = clone(record.sourceSnapshots.execution.evidence); remapped.verificationContract = clone(record.verificationContract); remapped.sourceExecutionDigest = executionDigest(remapped.sourceSnapshots.execution); remapped.sourceBinding.execution.digest = remapped.sourceExecutionDigest; remapped.sourceChainDigest = fingerprint({ sourceSnapshots: remapped.sourceSnapshots, sourceBinding: remapped.sourceBinding }); remapped.imported = true; remapped.importedUnproven = true; remapped.proofStatus = "imported-unproven"; remapped.lifecycle = "blocked"; remapped.verdict = "blocked"; remapped.sourceProof = { ...remapped.sourceProof, valid: false, current: false, provenanceProven: false, issues: ["imported_unproven"] }; remapped.identity = calculateVerificationIdentity(remapped); remapped.semanticIdentity = calculateSemanticIdentity(remapped); remapped.id = map.get(record.id) || `pattern-evolution-execution-verification:${remapped.identity.slice(8)}`; remapped.verificationId = remapped.id; remapped.reasonCodes = stableStrings([...array(remapped.reasonCodes), "imported_unproven"]); remapped.reasons = stableObjects([...array(remapped.reasons), reason("imported_unproven", "trust", "Remapped verification requires local semantic revalidation.")], "code"); remapped.digest = calculateVerificationDigest(remapped); return freeze(remapped); }
  function importPatternEvolutionExecutionVerification(existing, serialized, options = {}) { let parsed; try { parsed = deserializePatternEvolutionExecutionVerification(serialized); } catch (error) { return freeze({ status: "malformed", changed: false, record: null, quarantine: { reasonCode: error?.code || "malformed_record" } }); } const duplicate = classifyDuplicate(existing, parsed); if (["collision", "identity_collision"].includes(duplicate.status)) return freeze({ status: "collision", changed: false, record: null, quarantine: { reasonCode: "PATTERN_EVOLUTION_EXECUTION_VERIFICATION_COLLISION" } }); if (["exact_duplicate", "duplicate_completed"].includes(duplicate.status)) return freeze({ status: duplicate.status, changed: false, record: duplicate.record }); const record = makeImportedPatternEvolutionExecutionVerificationUnproven(parsed, options); return freeze({ status: "imported_unproven", changed: true, record }); }
  function revalidatePatternEvolutionExecutionVerification(record, source, command = {}) { requireRecord(record); const sourceIds = new Set(); let cursor = record; for (let index = 0; index < 1024 && cursor; index += 1) { if (sourceIds.has(cursor.id)) throw verificationError("successor_cycle", "Verification successor chain contains a cycle."); sourceIds.add(cursor.id); cursor = null; } const epoch = positiveInteger(command.epoch) || record.epoch + 1; return createPatternEvolutionExecutionVerification(source, { now: command.now || record.updatedAt, epoch, predecessorVerificationId: record.id, supersedesVerificationId: record.id, originalImport: { originalImport: record.originalImport || record, sourceSnapshots: record.sourceSnapshots } }); }
  async function loadSource(repository, projectId, executionId = null) { const executionRecord = executionId ? await repository.getPatternEvolutionExecution(projectId, executionId) : await repository.getLatestPatternEvolutionExecution(projectId); if (!executionRecord) return freeze({ projectId, execution: null, decision: null, review: null, proposal: null, initiation: null, executions: [] }); const chain = await repository.getPatternEvolutionExecutionSourceChain(projectId, executionRecord.state.id, executionRecord.state.calculationId); const executions = await repository.listPatternEvolutionExecutions(projectId, executionRecord.state.calculationId); return freeze({ projectId, patternId: executionRecord.state.patternId, calculationId: executionRecord.state.calculationId, execution: executionRecord.state, decision: chain.decision?.state || chain.decision, review: chain.review?.state || chain.review, proposal: chain.proposal?.state || chain.proposal, initiation: chain.initiation?.state || chain.initiation, executions: executions.map((item) => item.state), decisions: [] }); }
  async function createForProject(repository, projectId, input = {}) { const source = await loadSource(repository, projectId, input.executionId); const all = await repository.listPatternEvolutionExecutionVerifications(projectId, source.calculationId); const epoch = positiveInteger(input.epoch) || all.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1; const record = createPatternEvolutionExecutionVerification(source, { ...input, epoch }); const existing = await repository.getLatestPatternEvolutionExecutionVerificationForExecution(projectId, record.sourceExecutionId, record.calculationId); if (existing?.state?.semanticIdentity === record.semanticIdentity) return freeze({ verificationRecord: existing, rawVerification: existing.state, source, duplicate: true }); const stored = await repository.savePatternEvolutionExecutionVerification(projectId, record, { timestamp: record.updatedAt }); return freeze({ verificationRecord: stored, rawVerification: stored.state, source, duplicate: false }); }
  async function readForProject(repository, projectId, verificationId = null, executionId = null) { const progress = await repository.getPatternEvolutionExecutionVerification(projectId, verificationId, null, executionId); if (!progress) return freeze({ verificationRecord: null, verification: null, source: null, projection: null }); const source = await loadSource(repository, projectId, progress.state.sourceExecutionId); return freeze({ verificationRecord: progress, verification: progress.state, source, projection: projectPatternEvolutionExecutionVerification(progress.state, source) }); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, POLICY_VERSION, EVIDENCE_POLICY_VERSION, PROGRESS_KIND, SOURCE_KIND,
    LIFECYCLES, ACTIVE_LIFECYCLES, TERMINAL_LIFECYCLES, VERDICTS, STATUSES, STATUS_PRECEDENCE, NEXT_ACTIONS,
    RISK_LEVELS, ALLOWED_EVIDENCE_TYPES, FORBIDDEN_OPERATION_TYPES, TRANSITIONS, REFERENCE_FIELDS,
    PatternEvolutionExecutionVerificationError, canonicalize, fingerprint, normalizeText, normalizeObject, stableStrings, stableObjects, snapshot,
    normalizedSource, sourceBindingFrom, calculateSourceGate, normalizeEvidence, evidenceState, coverage, calculateVerificationContract,
    statusForVerdict, nextActionForVerdict, terminalLifecycleForVerdict, identityPayload, semanticIdentityPayload,
    calculateVerificationIdentity, calculateSemanticIdentity, digestPayload, calculateVerificationDigest,
    createPatternEvolutionExecutionVerification, createVerification: createPatternEvolutionExecutionVerification,
    validatePatternEvolutionExecutionVerification, transition, startCollecting, startEvaluating, startReviewing, finalizeVerification,
    cancelVerification, markVerificationStale, projectPatternEvolutionExecutionVerification, classifyDuplicate,
    serializePatternEvolutionExecutionVerification, deserializePatternEvolutionExecutionVerification, safeNormalizePatternEvolutionExecutionVerification,
    makeImportedPatternEvolutionExecutionVerificationUnproven, remapPatternEvolutionExecutionVerification,
    importPatternEvolutionExecutionVerification, revalidatePatternEvolutionExecutionVerification, loadSource, createForProject, readForProject,
  });
  globalObject.YarnAIPatternEvolutionExecutionVerification = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
