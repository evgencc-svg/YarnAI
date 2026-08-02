"use strict";

(function initializePatternEvolutionExecution(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const POLICY_VERSION = "pattern-evolution-execution/v1";
  const RISK_POLICY_VERSION = "pattern-evolution-execution-risk/v1";
  const EVIDENCE_POLICY_VERSION = "pattern-evolution-execution-evidence/v1";
  const PROGRESS_KIND = "PATTERN_EVOLUTION_EXECUTION";
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const LIFECYCLES = Object.freeze([
    "draft", "preparing", "ready", "executing", "verifying", "completed",
    "revision_required", "evidence_required", "rollback_required", "blocked",
    "failed", "cancelled", "stale",
  ]);
  const TERMINAL_LIFECYCLES = Object.freeze([
    "completed", "revision_required", "evidence_required", "rollback_required",
    "blocked", "failed", "cancelled",
  ]);
  const ACTIVE_LIFECYCLES = Object.freeze(["draft", "preparing", "ready", "executing", "verifying"]);
  const STATUSES = Object.freeze([
    "pending", "ready", "in_progress", "completed", "require_revision",
    "require_evidence", "require_rollback", "blocked", "failed", "stale", "cancelled",
  ]);
  const STATUS_PRECEDENCE = Object.freeze([
    "stale", "failed", "require_rollback", "blocked", "require_evidence",
    "require_revision", "cancelled", "completed", "in_progress", "ready", "pending",
  ]);
  const NEXT_ACTIONS = Object.freeze([
    "resolve_source_chain", "revalidate_imported_sources", "resolve_collision",
    "satisfy_preconditions", "provide_execution_evidence", "revise_execution_plan",
    "prepare_rollback", "prepare_migration_contract", "resolve_compatibility",
    "start_execution", "continue_execution", "verify_execution", "perform_rollback",
    "execution_complete", "no_action_stale", "no_action_cancelled",
  ]);
  const RISK_LEVELS = Object.freeze(["low", "moderate", "high", "critical", "invalid"]);
  const ALLOWED_OPERATION_TYPES = Object.freeze([
    "create_successor_pattern_revision", "update_pattern_metadata",
    "attach_evolution_evidence", "register_compatibility_contract",
    "register_rollback_contract", "prepare_data_migration",
    "record_validation_result", "record_execution_observation",
  ]);
  const FORBIDDEN_OPERATION_TYPES = Object.freeze([
    "delete_pattern", "overwrite_historical_record", "delete_source_chain",
    "arbitrary_indexeddb_write", "upgrade_schema", "apply_data_migration",
    "change_db_version", "create_object_store", "destructive_reset", "execute_code",
  ]);
  const TRANSITIONS = Object.freeze({
    draft: Object.freeze(["preparing", "cancelled", "stale"]),
    preparing: Object.freeze(["ready", "revision_required", "evidence_required", "rollback_required", "blocked", "failed", "cancelled", "stale"]),
    ready: Object.freeze(["executing", "revision_required", "evidence_required", "rollback_required", "blocked", "failed", "cancelled", "stale"]),
    executing: Object.freeze(["verifying", "evidence_required", "rollback_required", "blocked", "failed", "cancelled", "stale"]),
    verifying: Object.freeze(["completed", "revision_required", "evidence_required", "rollback_required", "blocked", "failed", "cancelled", "stale"]),
  });
  const REFERENCE_FIELDS = new Set([
    "id", "executionId", "projectId", "patternId", "calculationId", "sourceInitiationId",
    "sourceProposalId", "sourceReviewId", "sourceDecisionId", "predecessorExecutionId",
    "supersedesExecutionId", "operationKey", "targetIdentity", "key", "conditionId",
    "dependencyId", "evidenceId", "digest", "references", "evidenceReferences",
    "affectedArtifacts", "dependencies", "preconditions", "requiredEvidence",
  ]);

  class PatternEvolutionExecutionError extends Error {
    constructor(code, message, details = null) {
      super(message); this.name = "PatternEvolutionExecutionError"; this.code = code;
      this.userMessage = message; this.details = details;
    }
  }

  const executionError = (code, message, details) => new PatternEvolutionExecutionError(code, message, details);
  const array = (value) => Array.isArray(value) ? value : [];
  const clone = (value) => value === undefined ? undefined : globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value));
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function lower(value) { return normalizeText(value).toLowerCase(); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value); }
  function injectedTimestamp(...values) { const result = values.find(isTimestamp); if (!result) throw executionError("timestamp_required", "An injected timestamp is required."); return result; }
  function canonicalize(value, seen = new Set()) {
    if (value === undefined) return "null";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (seen.has(value)) throw executionError("cyclic_input", "Cyclic execution data is not supported.");
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
  function stableObjects(values, key = "key") {
    const unique = new Map();
    for (const value of array(values)) { const normalized = normalizeObject(clone(value)); const identity = normalizeText(normalized?.[key] || normalized?.code || normalized?.id) || fingerprint(normalized); if (!unique.has(identity)) unique.set(identity, normalized); }
    return [...unique.values()].sort((a, b) => compare(a?.[key] || a?.code || a?.id || canonicalize(a), b?.[key] || b?.code || b?.id || canonicalize(b)));
  }
  function sourceSnapshot(value) { return freeze(normalizeObject(clone(value || {}))); }
  function idOf(value, ...fields) { for (const field of ["id", ...fields]) { const id = normalizeText(value?.[field]); if (id) return id; } return ""; }
  function reason(code, category, message, references = []) { return freeze({ code, category, message, references: stableStrings(references) }); }
  function addReason(collection, code, category, message, references = []) { collection.push(reason(code, category, message, references)); }
  function evidenceDigest(value) { return normalizeText(value?.digest || value?.evidenceDigest) || fingerprint(normalizeObject(value?.payload ?? value)); }

  function normalizeSource(source = {}) {
    const decision = source.decision || source.sourceDecision || (source.kind === "PATTERN_EVOLUTION_DECISION" ? source : null);
    const decisionSnapshots = decision?.sourceSnapshots || {};
    const review = source.review || source.sourceReview || decisionSnapshots.review || null;
    const proposal = source.proposal || source.sourceProposal || decisionSnapshots.proposal || null;
    const initiation = source.initiation || source.sourceInitiation || decisionSnapshots.initiation || null;
    return freeze({
      projectId: normalizeText(source.projectId || decision?.projectId || review?.projectId || proposal?.projectId || initiation?.projectId),
      patternId: normalizeText(source.patternId || decision?.patternId || review?.patternId || proposal?.patternId || initiation?.patternId),
      calculationId: normalizeText(source.calculationId || decision?.calculationId || review?.calculationId || proposal?.calculationId || initiation?.calculationId),
      initiation: initiation ? clone(initiation) : null, proposal: proposal ? clone(proposal) : null,
      review: review ? clone(review) : null, decision: decision ? clone(decision) : null,
      initiations: array(source.initiations).map((item) => clone(item?.state || item)),
      proposals: array(source.proposals).map((item) => clone(item?.state || item)),
      reviews: array(source.reviews).map((item) => clone(item?.state || item)),
      decisions: array(source.decisions).map((item) => clone(item?.state || item)),
      executions: array(source.executions).map((item) => clone(item?.state || item)),
      expectedInitiationRevision: source.expectedInitiationRevision,
      expectedInitiationDigest: normalizeText(source.expectedInitiationDigest),
      expectedProposalRevision: source.expectedProposalRevision,
      expectedProposalDigest: normalizeText(source.expectedProposalDigest),
      expectedReviewRevision: source.expectedReviewRevision,
      expectedReviewDigest: normalizeText(source.expectedReviewDigest),
      expectedDecisionRevision: source.expectedDecisionRevision,
      expectedDecisionDigest: normalizeText(source.expectedDecisionDigest),
    });
  }

  function initiationDigest(value) { return normalizeText(value?.identity || value?.sourceDigest || value?.initiationDigest) || fingerprint(sourceSnapshot(value)); }
  function proposalDigest(value) { return normalizeText(value?.identity || value?.proposalDigest) || fingerprint(sourceSnapshot(value)); }
  function reviewDigest(value) { return globalObject.YarnAIPatternEvolutionDecision?.reviewDigest?.(value) || fingerprint(sourceSnapshot(value)); }
  function decisionDigest(value) { return globalObject.YarnAIPatternEvolutionDecision?.calculateDecisionDigest?.(value) || normalizeText(value?.digest) || fingerprint(sourceSnapshot(value)); }

  function sourceEnvelopeFrom(normalized) {
    const { initiation, proposal, review, decision } = normalized;
    return freeze({
      projectId: normalized.projectId, patternId: normalized.patternId, calculationId: normalized.calculationId,
      initiation: { id: idOf(initiation, "initiationId"), revision: initiation?.revision || 0, digest: initiation ? initiationDigest(initiation) : "", policyVersion: normalizeText(initiation?.policyVersion) },
      proposal: { id: idOf(proposal, "proposalId"), revision: proposal?.revision || 0, digest: proposal ? proposalDigest(proposal) : "", policyVersion: normalizeText(proposal?.policyVersion) },
      review: { id: idOf(review, "reviewId"), revision: review?.revision || 0, digest: review ? reviewDigest(review) : "", policyVersion: normalizeText(review?.policyVersion) },
      decision: { id: idOf(decision, "decisionId"), revision: decision?.revision || 0, digest: decision ? decisionDigest(decision) : "", policyVersion: normalizeText(decision?.decisionPolicyVersion) },
    });
  }

  function hasSuccessor(records, current, idFields) {
    const currentId = idOf(current, ...idFields); const currentRevision = positiveInteger(current?.revision);
    return array(records).some((candidate) => {
      const id = idOf(candidate, ...idFields);
      return candidate && id !== currentId && (candidate.predecessorDecisionId === currentId || candidate.predecessorReviewId === currentId || candidate.predecessorProposalId === currentId || candidate.predecessorInitiationId === currentId || candidate.supersedesDecisionId === currentId || candidate.supersedesReviewId === currentId || candidate.supersedesProposalId === currentId || candidate.supersedesInitiationId === currentId || positiveInteger(candidate.revision) > currentRevision && candidate.patternId === current?.patternId);
    });
  }

  function calculateSourceGate(source = {}, record = null) {
    const normalized = normalizeSource(source); const { initiation, proposal, review, decision } = normalized; const reasons = [];
    const envelope = sourceEnvelopeFrom(normalized);
    if (!decision) addReason(reasons, "missing_source_decision", "source", "A persisted decision is required.");
    if (!review) addReason(reasons, "missing_source_review", "source", "The decision review is missing.");
    if (!proposal) addReason(reasons, "missing_source_proposal", "source", "The decision proposal is missing.");
    if (!initiation) addReason(reasons, "missing_source_initiation", "source", "The decision initiation is missing.");
    if (decision) {
      if (decision.kind !== "PATTERN_EVOLUTION_DECISION" || decision.type !== "PATTERN_EVOLUTION_DECISION" || decision.version !== 1 || decision.schemaVersion !== 1) addReason(reasons, "source_decision_header_invalid", "source", "The decision kind or version is unsupported.");
      if (!globalObject.YarnAIPatternEvolutionDecision?.TERMINAL_LIFECYCLES?.includes(decision.lifecycle)) addReason(reasons, "non_terminal_decision", "source", "Only a terminal decision can be executed.");
      if (decision.lifecycle !== "authorized" || decision.outcome !== "authorize" || decision.nextAction !== "proceed_to_next_stage") addReason(reasons, "non_authorized_decision", "source", "Only an authorized decision can be executed.");
      const report = globalObject.YarnAIPatternEvolutionDecision?.validatePatternEvolutionDecision?.(decision);
      if (!report?.valid) addReason(reasons, "source_decision_domain_invalid", "source", "The decision failed local domain validation.");
      if (decision.importedUnproven || decision.proofStatus === "imported-unproven") addReason(reasons, "imported_unproven", "trust", "Imported decision truth is not locally proven.");
      if (decision.collision) addReason(reasons, "collision", "trust", "The decision has an identity collision.");
      if (decision.quarantined) addReason(reasons, "quarantine", "trust", "The decision is quarantined.");
      if (decision.lifecycle === "stale" || decision.outcome === "stale" || decision.sourceProof?.current === false) addReason(reasons, "stale_source", "stale", "The decision source is stale.");
    }
    if (normalized.projectId && [decision, review, proposal, initiation].filter(Boolean).some((item) => item.projectId !== normalized.projectId)) addReason(reasons, "project_identity_mismatch", "identity", "Source project identities differ.");
    if (normalized.patternId && [decision, review, proposal, initiation].filter(Boolean).some((item) => item.patternId !== normalized.patternId)) addReason(reasons, "pattern_identity_mismatch", "identity", "Source pattern identities differ.");
    if (decision && review && decision.sourceReviewId !== envelope.review.id) addReason(reasons, "review_identity_mismatch", "identity", "Decision review identity differs from the local review.");
    if (decision && proposal && decision.sourceProposalId !== envelope.proposal.id) addReason(reasons, "proposal_identity_mismatch", "identity", "Decision proposal identity differs from the local proposal.");
    if (decision && initiation && decision.sourceInitiationId !== envelope.initiation.id) addReason(reasons, "initiation_identity_mismatch", "identity", "Decision initiation identity differs from the local initiation.");
    for (const [name, artifact] of [["decision", decision], ["review", review], ["proposal", proposal], ["initiation", initiation]]) {
      if (!artifact) continue; const expected = envelope[name];
      if (record?.[`source${name[0].toUpperCase()}${name.slice(1)}Revision`] && record[`source${name[0].toUpperCase()}${name.slice(1)}Revision`] !== expected.revision) addReason(reasons, `${name}_revision_mismatch`, "stale", `${name} revision changed.`);
      if (record?.[`source${name[0].toUpperCase()}${name.slice(1)}Digest`] && record[`source${name[0].toUpperCase()}${name.slice(1)}Digest`] !== expected.digest) addReason(reasons, `${name}_digest_mismatch`, "stale", `${name} digest changed.`);
      if (normalized[`expected${name[0].toUpperCase()}${name.slice(1)}Revision`] && normalized[`expected${name[0].toUpperCase()}${name.slice(1)}Revision`] !== expected.revision) addReason(reasons, `${name}_revision_mismatch`, "stale", `${name} expected revision differs.`);
      if (normalized[`expected${name[0].toUpperCase()}${name.slice(1)}Digest`] && normalized[`expected${name[0].toUpperCase()}${name.slice(1)}Digest`] !== expected.digest) addReason(reasons, `${name}_digest_mismatch`, "stale", `${name} expected digest differs.`);
    }
    if (decision && review && canonicalize(decision.sourceSnapshots?.review) !== canonicalize(sourceSnapshot(review))) addReason(reasons, "review_snapshot_mismatch", "stale", "Decision review snapshot differs from the exact local review.");
    if (decision && proposal && canonicalize(decision.sourceSnapshots?.proposal) !== canonicalize(sourceSnapshot(proposal))) addReason(reasons, "proposal_snapshot_mismatch", "stale", "Decision proposal snapshot differs from the exact local proposal.");
    if (decision && initiation && canonicalize(decision.sourceSnapshots?.initiation) !== canonicalize(sourceSnapshot(initiation))) addReason(reasons, "initiation_snapshot_mismatch", "stale", "Decision initiation snapshot differs from the exact local initiation.");
    if (decision?.sourceBinding && (decision.sourceBinding.reviewDigest !== envelope.review.digest || decision.sourceBinding.proposalDigest !== envelope.proposal.digest || decision.sourceBinding.initiationDigest !== envelope.initiation.digest)) addReason(reasons, "source_binding_mismatch", "stale", "Decision binding does not match the source chain.");
    if (decision?.decisionPolicyVersion !== globalObject.YarnAIPatternEvolutionDecision?.POLICY_VERSION) addReason(reasons, "policy_mismatch", "policy", "Decision policy version is unsupported.");
    const risk = lower(decision?.risk?.level) || "invalid";
    if (!RISK_LEVELS.includes(risk)) addReason(reasons, "unsupported_risk", "risk", "The decision risk is unsupported.");
    if (["critical", "invalid"].includes(risk)) addReason(reasons, risk === "critical" ? "critical_risk" : "unsupported_risk", "risk", "The decision risk cannot be executed.");
    if (decision?.sourceProof?.provenanceProven !== true || decision?.sourceProof?.valid !== true || decision?.sourceProof?.current !== true) addReason(reasons, "provenance_mismatch", "trust", "Decision source provenance is not current and proven.");
    if (review?.readiness?.implementationReady !== true || review?.readiness?.overallReady !== true) addReason(reasons, "source_readiness_missing", "readiness", "The approved review is not implementation-ready.");
    if (hasSuccessor(normalized.decisions, decision, ["decisionId"])) addReason(reasons, "superseded_source", "stale", "A newer decision supersedes this decision.");
    if (hasSuccessor(normalized.reviews, review, ["reviewId"]) || hasSuccessor(normalized.proposals, proposal, ["proposalId"]) || hasSuccessor(normalized.initiations, initiation, ["initiationId"])) addReason(reasons, "superseded_source", "stale", "A newer source artifact supersedes the bound chain.");
    if (record?.sourceSnapshots) {
      for (const name of ["initiation", "proposal", "review", "decision"]) if (canonicalize(record.sourceSnapshots[name]) !== canonicalize(sourceSnapshot(normalized[name]))) addReason(reasons, `${name}_snapshot_mismatch`, "stale", `Persisted ${name} snapshot was mutated or replaced.`);
      if (canonicalize(record.sourceEnvelope) !== canonicalize(envelope)) addReason(reasons, "source_envelope_mismatch", "stale", "Canonical source envelope differs from current sources.");
    }
    const stable = stableObjects(reasons, "code");
    return freeze({ valid: stable.length === 0, authorized: decision?.lifecycle === "authorized" && decision?.outcome === "authorize" && stable.length === 0, reasons: stable, normalized, envelope, risk });
  }

  function normalizeRequirement(value, prefix, index) {
    const source = typeof value === "string" ? { key: value } : value || {};
    const key = normalizeText(source.key || source.code || source.id) || `${prefix}:${index + 1}`;
    return freeze({ key, required: source.required !== false, satisfied: source.satisfied === true, evidenceReferences: stableStrings(source.evidenceReferences || source.references), description: normalizeText(source.description || source.message || key) });
  }
  function normalizeRequirements(values, prefix) { return stableObjects(array(values).map((item, index) => normalizeRequirement(item, prefix, index)), "key"); }
  function normalizeOperation(value, index) {
    const source = value || {}; const operationType = lower(source.operationType || source.type); const key = normalizeText(source.key || source.operationKey || source.id) || `operation:${String(index + 1).padStart(3, "0")}`;
    const allowed = ALLOWED_OPERATION_TYPES.includes(operationType) && !FORBIDDEN_OPERATION_TYPES.includes(operationType);
    return freeze({
      key, operationKey: key, operationType, targetType: normalizeText(source.targetType) || "pattern",
      targetIdentity: normalizeText(source.targetIdentity || source.targetId), order: positiveInteger(source.order || source.canonicalOrder) || index + 1,
      preconditions: normalizeRequirements(source.preconditions, `${key}:precondition`),
      expectedOutput: normalizeObject(source.expectedOutput || {}), requiredEvidence: stableStrings(source.requiredEvidence || source.evidenceRequirements),
      rollbackAction: normalizeObject(source.rollbackAction || {}), compatibilityImpact: normalizeObject(source.compatibilityImpact || "unknown"),
      migrationImpact: normalizeObject(source.migrationImpact || "none"), classification: allowed ? "allowed" : FORBIDDEN_OPERATION_TYPES.includes(operationType) ? "forbidden" : "unsupported",
    });
  }
  function normalizeRollbackContract(value = {}, required = false) {
    return freeze({ required: required || value.required === true, mode: normalizeText(value.mode), triggerConditions: stableObjects(value.triggerConditions, "key"), target: normalizeObject(value.target || {}), operations: stableObjects(value.operations, "key"), preservedArtifacts: stableStrings(value.preservedArtifacts), evidenceRequirements: normalizeRequirements(value.evidenceRequirements, "rollback-evidence"), validationSteps: normalizeRequirements(value.validationSteps, "rollback-validation"), maximumIrreversibleBoundary: normalizeText(value.maximumIrreversibleBoundary), status: lower(value.status) || "planned" });
  }
  function normalizeMigrationContract(value = {}, required = false) {
    return freeze({ required: required || value.required === true, migrationType: lower(value.migrationType || value.type) || "none", sourceSchemaVersion: normalizeText(value.sourceSchemaVersion), targetSchemaVersion: normalizeText(value.targetSchemaVersion), affectedDataKinds: stableStrings(value.affectedDataKinds), preconditions: normalizeRequirements(value.preconditions, "migration-precondition"), backupRequired: value.backupRequired === true, rollbackStrategy: normalizeObject(value.rollbackStrategy || {}), validationSteps: normalizeRequirements(value.validationSteps, "migration-validation"), compatibilityWindow: normalizeText(value.compatibilityWindow), evidenceRequirements: normalizeRequirements(value.evidenceRequirements, "migration-evidence"), executionState: lower(value.executionState || value.state) || "not_required" });
  }
  function normalizeCompatibilityContract(value = {}) {
    const status = (name) => lower(value[name]) || "unknown";
    return freeze({ backwardCompatibility: status("backwardCompatibility"), forwardCompatibility: status("forwardCompatibility"), dataCompatibility: status("dataCompatibility"), uiCompatibility: status("uiCompatibility"), apiCompatibility: status("apiCompatibility"), importedRecordCompatibility: status("importedRecordCompatibility"), migrationCompatibility: status("migrationCompatibility"), knownIncompatibilities: stableObjects(value.knownIncompatibilities, "key"), evidenceRequirements: normalizeRequirements(value.evidenceRequirements || value.compatibilityEvidence, "compatibility-evidence"), validationStatus: lower(value.validationStatus) || "pending" });
  }
  function normalizeVerificationContract(value = {}) { return freeze({ postconditions: normalizeRequirements(value.postconditions, "postcondition"), validationSteps: normalizeRequirements(value.validationSteps, "verification"), requiredObservationTypes: stableStrings(value.requiredObservationTypes), completionRule: normalizeText(value.completionRule) || "all_required_evidence_and_postconditions" }); }

  function normalizeExecutionPlan(input = {}, decision = null) {
    const plan = input.executionPlan || input.plan || input;
    const proposal = decision?.sourceSnapshots?.proposal || {};
    let operations = array(plan.operations);
    if (!operations.length) operations = [{ key: "create-successor", operationType: "create_successor_pattern_revision", targetType: "pattern", targetIdentity: decision?.patternId, expectedOutput: { kind: "successor_pattern_revision" }, requiredEvidence: ["evidence:successor-created"], rollbackAction: { type: "preserve_predecessor" }, compatibilityImpact: "bounded", migrationImpact: decision?.migrationDependency ? "prepared-only" : "none" }];
    operations = operations.map(normalizeOperation).sort((a, b) => a.order - b.order || compare(a.key, b.key)).map((item, index) => freeze({ ...item, order: index + 1 }));
    const riskLevel = lower(decision?.risk?.level) || "invalid"; const migrationRequired = decision?.migrationDependency === true || operations.some((item) => item.migrationImpact !== "none"); const rollbackRequired = riskLevel === "high" || migrationRequired;
    const mandatory = array(plan.mandatoryConditions).length ? plan.mandatoryConditions : array(decision?.conditions).map((item) => ({ key: item.code || item.id, description: item.message, required: item.required !== false, satisfied: true, evidenceReferences: item.references }));
    const result = {
      operations, preconditions: normalizeRequirements(plan.preconditions, "precondition"), dependencies: normalizeRequirements(plan.dependencies, "dependency"), mandatoryConditions: normalizeRequirements(mandatory, "condition"),
      expectedOutputs: stableObjects(plan.expectedOutputs?.length ? plan.expectedOutputs : operations.map((item) => ({ key: item.key, output: item.expectedOutput })), "key"),
      evidenceRequirements: normalizeRequirements(plan.evidenceRequirements?.length ? plan.evidenceRequirements : operations.flatMap((item) => item.requiredEvidence.map((id) => ({ key: id, required: true }))), "evidence"),
      rollbackContract: normalizeRollbackContract(plan.rollbackContract || input.rollbackContract, rollbackRequired),
      compatibilityContract: normalizeCompatibilityContract(plan.compatibilityContract || input.compatibilityContract),
      migrationContract: normalizeMigrationContract(plan.migrationContract || input.migrationContract, migrationRequired),
      verificationContract: normalizeVerificationContract(plan.verificationContract || input.verificationContract),
      forbiddenOperations: stableStrings([...FORBIDDEN_OPERATION_TYPES, ...array(plan.forbiddenOperations)]), executionOrder: operations.map((item) => item.key),
      affectedArtifacts: stableStrings(plan.affectedArtifacts?.length ? plan.affectedArtifacts : [decision?.patternId]), riskControls: normalizeRequirements(plan.riskControls, "risk-control"), stopConditions: normalizeRequirements(plan.stopConditions, "stop-condition"),
    };
    return freeze(result);
  }

  function validatePlan(plan, riskLevel) {
    const reasons = []; const operationKeys = new Set();
    if (!array(plan?.operations).length) addReason(reasons, "missing_operation", "revision", "At least one structured operation is required.");
    for (const operation of array(plan?.operations)) {
      if (operationKeys.has(operation.key)) addReason(reasons, "duplicate_operation", "revision", "Operation keys must be unique.", [operation.key]); operationKeys.add(operation.key);
      if (!ALLOWED_OPERATION_TYPES.includes(operation.operationType)) addReason(reasons, FORBIDDEN_OPERATION_TYPES.includes(operation.operationType) ? "forbidden_operation" : "unsupported_operation", "block", "The operation type is not allowed.", [operation.key]);
      if (!operation.targetIdentity) addReason(reasons, "missing_operation_target", "revision", "Every operation requires a stable target identity.", [operation.key]);
    }
    if (canonicalize(plan?.executionOrder) !== canonicalize(array(plan?.operations).map((item) => item.key))) addReason(reasons, "execution_order_mismatch", "revision", "Execution order must match canonical operation order.");
    for (const requirement of [...array(plan?.preconditions), ...array(plan?.dependencies), ...array(plan?.mandatoryConditions)]) if (requirement.required && !requirement.satisfied) addReason(reasons, requirement.key.startsWith("dependency") ? "missing_dependency" : requirement.key.startsWith("condition") ? "missing_mandatory_condition" : "missing_precondition", "readiness", "A required execution condition is not satisfied.", [requirement.key]);
    const migration = plan?.migrationContract || {}; const rollback = plan?.rollbackContract || {}; const compatibility = plan?.compatibilityContract || {};
    if (migration.required && (migration.migrationType === "none" || !migration.sourceSchemaVersion || !migration.targetSchemaVersion || !migration.backupRequired || !Object.keys(migration.rollbackStrategy || {}).length || !migration.validationSteps.length || !migration.compatibilityWindow || !migration.evidenceRequirements.length || !["planned", "prepared", "verified"].includes(migration.executionState))) addReason(reasons, "invalid_migration_contract", "block", "The migration contract is incomplete or unsafe.");
    if (migration.required && !migration.migrationType) addReason(reasons, "missing_migration_contract", "block", "A declared migration requires a contract.");
    if (rollback.required && (!rollback.mode || !Object.keys(rollback.target || {}).length || !rollback.operations.length || !rollback.preservedArtifacts.length || !rollback.evidenceRequirements.length || !rollback.validationSteps.length || !rollback.maximumIrreversibleBoundary || !["planned", "ready", "available", "completed"].includes(rollback.status))) addReason(reasons, "invalid_rollback", "block", "The rollback contract is incomplete.");
    if (rollback.required && !rollback.mode) addReason(reasons, "missing_rollback", "block", "Rollback is mandatory for this execution.");
    const compatibilityAxes = ["backwardCompatibility", "forwardCompatibility", "dataCompatibility", "uiCompatibility", "apiCompatibility", "importedRecordCompatibility", "migrationCompatibility"];
    if (compatibilityAxes.some((key) => ["failed", "incompatible", "unknown"].includes(compatibility[key])) || array(compatibility.knownIncompatibilities).some((item) => item.required !== false && item.resolved !== true)) addReason(reasons, "compatibility_failure", "block", "Mandatory compatibility remains unresolved.");
    if (riskLevel === "high" && (!rollback.required || !plan.evidenceRequirements.length || !plan.riskControls.length || !plan.stopConditions.length || !plan.verificationContract.postconditions.length)) addReason(reasons, "high_risk_controls_incomplete", "block", "High-risk execution requires full rollback, evidence, compatibility, stop, and verification controls.");
    return stableObjects(reasons, "code");
  }

  function normalizedEvidence(values) {
    return stableObjects(array(values).map((value, index) => { const source = value || {}; const id = normalizeText(source.id || source.evidenceId) || `evidence:${index + 1}`; return { id, evidenceId: id, digest: evidenceDigest(source), type: lower(source.type) || "structured", validationStatus: lower(source.validationStatus || source.status) || "unproven", requirementKeys: stableStrings(source.requirementKeys || source.references), payload: normalizeObject(source.payload || {}), provenance: normalizeObject(source.provenance || {}) }; }), "id");
  }
  function normalizedObservations(values) {
    return stableObjects(array(values).map((value, index) => { const source = value || {}; const key = normalizeText(source.key || source.observationKey || source.id) || `observation:${index + 1}`; return { key, operationKey: normalizeText(source.operationKey), observationType: lower(source.observationType || source.type) || "result", payload: normalizeObject(source.payload || {}), evidenceReferences: stableStrings(source.evidenceReferences), result: lower(source.result) || "pending", reasonCodes: stableStrings(source.reasonCodes), provenance: normalizeObject(source.provenance || {}) }; }), "key");
  }
  function evidenceAssessment(record) {
    const reasons = []; const evidence = normalizedEvidence(record.evidence); const observations = normalizedObservations(record.observations);
    const validEvidence = new Set(evidence.filter((item) => ["validated", "proven", "passed"].includes(item.validationStatus) && item.digest).map((item) => item.id));
    const contradictory = evidence.some((item) => ["contradictory", "conflicting", "failed", "invalid"].includes(item.validationStatus)) || observations.some((item) => ["contradictory", "conflicting"].includes(item.result));
    if (contradictory) addReason(reasons, "contradictory_evidence", "evidence", "Execution evidence is contradictory.");
    const requirements = [...array(record.executionPlan?.evidenceRequirements), ...array(record.executionPlan?.rollbackContract?.evidenceRequirements), ...array(record.executionPlan?.compatibilityContract?.evidenceRequirements), ...array(record.executionPlan?.migrationContract?.evidenceRequirements)];
    for (const requirement of requirements) if (requirement.required && ![...validEvidence].some((id) => id === requirement.key || evidence.find((item) => item.id === id)?.requirementKeys.includes(requirement.key))) addReason(reasons, "missing_execution_evidence", "evidence", "Required execution evidence is missing.", [requirement.key]);
    const byOperation = new Map(); for (const observation of observations) { if (!record.executionPlan.operations.some((item) => item.key === observation.operationKey)) addReason(reasons, "observation_operation_mismatch", "revision", "Observation references an unknown operation.", [observation.key]); if (!byOperation.has(observation.operationKey)) byOperation.set(observation.operationKey, []); byOperation.get(observation.operationKey).push(observation); if (observation.evidenceReferences.some((id) => !evidence.some((item) => item.id === id))) addReason(reasons, "missing_execution_evidence", "evidence", "Observation evidence reference is missing.", [observation.key]); }
    for (const operation of record.executionPlan.operations) if (![...(byOperation.get(operation.key) || [])].some((item) => ["completed", "succeeded", "passed"].includes(item.result))) addReason(reasons, "operation_not_completed", "progress", "A required operation has no successful observation.", [operation.key]);
    const postconditions = array(record.executionPlan?.verificationContract?.postconditions); for (const item of postconditions) if (item.required && !item.satisfied && !observations.some((observation) => observation.observationType === "postcondition" && observation.result === "passed" && (observation.payload?.key === item.key || observation.reasonCodes.includes(item.key)))) addReason(reasons, "postcondition_failure", "verification", "A required postcondition is not proven.", [item.key]);
    const compatibility = record.executionPlan?.compatibilityContract; if (compatibility?.validationStatus !== "passed") addReason(reasons, "missing_compatibility_evidence", "compatibility", "Compatibility validation has not passed.");
    if (record.executionPlan?.rollbackContract?.required && ["failed", "required"].includes(record.executionPlan.rollbackContract.status)) addReason(reasons, "rollback_required", "rollback", "Rollback is required or failed.");
    if (record.executionPlan?.migrationContract?.required && record.executionPlan.migrationContract.executionState !== "verified") addReason(reasons, "migration_not_verified", "migration", "Migration preparation outcome is not verified.");
    return freeze({ reasons: stableObjects(reasons, "code"), evidence, observations, complete: reasons.length === 0 });
  }

  function calculateExecutionStatus(record, sourceGate = null) {
    const reasons = []; const gate = sourceGate || { valid: record?.sourceProof?.valid === true, reasons: [] };
    reasons.push(...array(gate.reasons)); reasons.push(...validatePlan(record?.executionPlan, record?.risk?.level));
    if (record?.importedUnproven || record?.proofStatus === "imported-unproven") addReason(reasons, "imported_unproven", "trust", "Imported execution truth requires local semantic revalidation.");
    if (record?.collision) addReason(reasons, "collision", "trust", "Execution identity is in collision.");
    if (record?.quarantined) addReason(reasons, "quarantine", "trust", "Execution is quarantined.");
    const evidence = evidenceAssessment(record || { executionPlan: {} }); const lifecycle = record?.lifecycle || "draft";
    const flags = new Set();
    if (lifecycle === "stale" || reasons.some((item) => ["stale", "superseded_source"].includes(item.category) || item.code.includes("_mismatch"))) flags.add("stale");
    if (lifecycle === "failed" || array(record?.observations).some((item) => item.result === "failed")) flags.add("failed");
    if (lifecycle === "rollback_required" || evidence.reasons.some((item) => item.code === "rollback_required")) flags.add("require_rollback");
    if (lifecycle === "blocked" || reasons.some((item) => ["block", "trust", "policy", "risk", "readiness"].includes(item.category))) flags.add("blocked");
    if (lifecycle === "evidence_required" || ["executing", "verifying", "completed"].includes(lifecycle) && evidence.reasons.some((item) => ["missing_execution_evidence", "missing_compatibility_evidence"].includes(item.code))) flags.add("require_evidence");
    if (lifecycle === "revision_required" || reasons.some((item) => item.category === "revision")) flags.add("require_revision");
    if (lifecycle === "cancelled") flags.add("cancelled");
    if (lifecycle === "completed" && gate.valid && evidence.complete && reasons.length === 0) flags.add("completed");
    if (["executing", "verifying"].includes(lifecycle)) flags.add("in_progress");
    if (lifecycle === "ready" && gate.valid && reasons.length === 0) flags.add("ready");
    flags.add("pending");
    const status = STATUS_PRECEDENCE.find((candidate) => flags.has(candidate)) || "blocked";
    return freeze({ status, flags: [...flags].sort((a, b) => STATUS_PRECEDENCE.indexOf(a) - STATUS_PRECEDENCE.indexOf(b)), evidenceAssessment: evidence, reasons: stableObjects([...reasons, ...(lifecycle === "draft" || lifecycle === "preparing" || lifecycle === "ready" ? [] : evidence.reasons)], "code") });
  }
  function nextActionFor(status, reasons, lifecycle) {
    if (status === "stale") return "no_action_stale";
    if (status === "cancelled") return "no_action_cancelled";
    if (status === "failed" || status === "require_rollback") return "perform_rollback";
    if (reasons.some((item) => item.code === "imported_unproven")) return "revalidate_imported_sources";
    if (reasons.some((item) => item.code === "collision")) return "resolve_collision";
    if (reasons.some((item) => item.code.includes("migration"))) return "prepare_migration_contract";
    if (reasons.some((item) => item.code.includes("compatibility"))) return "resolve_compatibility";
    if (status === "blocked") return reasons.some((item) => item.category === "source" || item.category === "identity" || item.category === "trust") ? "resolve_source_chain" : "satisfy_preconditions";
    if (status === "require_evidence") return "provide_execution_evidence";
    if (status === "require_revision") return "revise_execution_plan";
    if (status === "completed") return "execution_complete";
    if (lifecycle === "verifying") return "verify_execution";
    if (status === "in_progress") return "continue_execution";
    if (status === "ready") return "start_execution";
    return "satisfy_preconditions";
  }

  function identityPayload(record) {
    return {
      projectId: record.projectId, patternId: record.patternId,
      sourceInitiationId: record.sourceInitiationId, sourceInitiationRevision: record.sourceInitiationRevision, sourceInitiationDigest: record.sourceInitiationDigest,
      sourceProposalId: record.sourceProposalId, sourceProposalRevision: record.sourceProposalRevision, sourceProposalDigest: record.sourceProposalDigest,
      sourceReviewId: record.sourceReviewId, sourceReviewRevision: record.sourceReviewRevision, sourceReviewDigest: record.sourceReviewDigest,
      sourceDecisionId: record.sourceDecisionId, sourceDecisionRevision: record.sourceDecisionRevision, sourceDecisionDigest: record.sourceDecisionDigest,
      sourceChainDigest: record.sourceChainDigest, executionPlan: normalizeObject(record.executionPlan), risk: normalizeObject(record.risk),
      executionPolicyVersion: record.executionPolicyVersion, riskPolicyVersion: record.riskPolicyVersion,
      evidencePolicyVersion: record.evidencePolicyVersion, predecessorExecutionId: record.predecessorExecutionId, epoch: record.epoch,
    };
  }
  function semanticIdentityPayload(record) { const payload = identityPayload(record); delete payload.predecessorExecutionId; delete payload.epoch; return payload; }
  function calculateExecutionIdentity(record) { return fingerprint(identityPayload(record)); }
  function calculateSemanticIdentity(record) { return fingerprint(semanticIdentityPayload(record)); }
  function digestPayload(record) { return { ...identityPayload(record), id: record.id, lifecycle: record.lifecycle, status: record.status, reasonCodes: stableStrings(record.reasonCodes), nextAction: record.nextAction, observations: normalizedObservations(record.observations), evidence: normalizedEvidence(record.evidence), imported: record.imported, importedUnproven: record.importedUnproven, collision: record.collision, sourceSnapshots: normalizeObject(record.sourceSnapshots), sourceEnvelope: normalizeObject(record.sourceEnvelope), provenance: normalizeObject(record.provenance), revision: record.revision }; }
  function calculateExecutionDigest(record) { return fingerprint(digestPayload(record)); }

  function refreshDerived(record, gate = null) {
    const next = clone(record); const assessment = calculateExecutionStatus(next, gate); next.status = assessment.status; next.executionStatus = assessment.status; next.reasonCodes = stableStrings(assessment.reasons.map((item) => item.code)); next.reasons = assessment.reasons; next.nextAction = nextActionFor(next.status, next.reasons, next.lifecycle); next.digest = calculateExecutionDigest(next); return freeze(next);
  }

  function createPatternEvolutionExecution(source = {}, input = {}) {
    const gate = calculateSourceGate(source); if (!gate.normalized.decision) throw executionError("missing_source", "A Stage 48 decision is required.", { reasons: gate.reasons });
    if (!gate.authorized) throw executionError(gate.reasons.some((item) => item.code === "non_authorized_decision") ? "non_authorized_decision" : "source_gate_failed", "Only a locally proven terminal authorization can create an execution.", { reasons: gate.reasons });
    const timestamp = injectedTimestamp(input.now, gate.normalized.decision.updatedAt); const epoch = positiveInteger(input.epoch) || 1;
    const plan = normalizeExecutionPlan(input.executionPlan || input.plan || input, gate.normalized.decision);
    const snapshots = freeze({ initiation: sourceSnapshot(gate.normalized.initiation), proposal: sourceSnapshot(gate.normalized.proposal), review: sourceSnapshot(gate.normalized.review), decision: sourceSnapshot(gate.normalized.decision) });
    const sourceEnvelope = gate.envelope; const sourceChainDigest = fingerprint({ snapshots, sourceEnvelope });
    const record = {
      id: "", executionId: "", kind: PROGRESS_KIND, type: PROGRESS_KIND, version: VERSION, schemaVersion: SCHEMA_VERSION,
      executionPolicyVersion: POLICY_VERSION, riskPolicyVersion: RISK_POLICY_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION,
      projectId: gate.normalized.projectId, patternId: gate.normalized.patternId, calculationId: gate.normalized.calculationId,
      sourceInitiationId: sourceEnvelope.initiation.id, sourceInitiationRevision: sourceEnvelope.initiation.revision, sourceInitiationDigest: sourceEnvelope.initiation.digest,
      sourceProposalId: sourceEnvelope.proposal.id, sourceProposalRevision: sourceEnvelope.proposal.revision, sourceProposalDigest: sourceEnvelope.proposal.digest,
      sourceReviewId: sourceEnvelope.review.id, sourceReviewRevision: sourceEnvelope.review.revision, sourceReviewDigest: sourceEnvelope.review.digest,
      sourceDecisionId: sourceEnvelope.decision.id, sourceDecisionRevision: sourceEnvelope.decision.revision, sourceDecisionDigest: sourceEnvelope.decision.digest,
      sourceChainDigest, sourceSnapshots: snapshots, sourceEnvelope, sourceProof: { valid: true, authorized: true, current: true, provenanceProven: true, issues: [] },
      executionPlan: plan, risk: { level: gate.risk, policyVersion: RISK_POLICY_VERSION }, observations: normalizedObservations(input.observations), evidence: normalizedEvidence(input.evidence),
      lifecycle: "draft", status: "pending", executionStatus: "pending", reasonCodes: [], reasons: [], nextAction: "satisfy_preconditions",
      imported: false, importedUnproven: false, collision: false, proofStatus: "proven", quarantined: false,
      provenance: { origin: "local", sourceDecisionId: sourceEnvelope.decision.id, policyVersion: POLICY_VERSION },
      predecessorExecutionId: normalizeText(input.predecessorExecutionId) || null, supersedesExecutionId: normalizeText(input.supersedesExecutionId) || null,
      originalImport: input.originalImport ? sourceSnapshot(input.originalImport) : null, createdAt: timestamp, updatedAt: timestamp, revision: 1, epoch,
      identity: "", semanticIdentity: "", digest: "", audit: [{ event: "created", at: timestamp, revision: 1, sourceDecisionId: sourceEnvelope.decision.id }],
    };
    record.identity = calculateExecutionIdentity(record); record.semanticIdentity = calculateSemanticIdentity(record); record.id = normalizeText(input.id || input.executionId) || `pattern-evolution-execution:${record.identity.slice(8)}`; record.executionId = record.id;
    const refreshed = refreshDerived(record, gate); const report = validatePatternEvolutionExecution(refreshed); if (!report.valid) throw executionError("execution_invalid", "Computed execution is invalid.", { errors: report.errors }); return refreshed;
  }

  function validationResult(errors) { const unique = new Map(errors.map((item) => [`${item.code}\0${item.field || ""}`, item])); return freeze({ valid: unique.size === 0, errors: [...unique.values()].sort((a, b) => compare(a.code, b.code) || compare(a.field, b.field)) }); }
  function validatePatternEvolutionExecution(record) {
    const errors = []; const invalid = (code, field = null) => errors.push({ code, field }); try { canonicalize(record); } catch { invalid("corrupted_input"); return validationResult(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.version !== VERSION || record.schemaVersion !== SCHEMA_VERSION || record.executionPolicyVersion !== POLICY_VERSION || record.riskPolicyVersion !== RISK_POLICY_VERSION || record.evidencePolicyVersion !== EVIDENCE_POLICY_VERSION) invalid("invalid_header");
    for (const field of ["id", "projectId", "patternId", "calculationId", "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceDecisionId", "sourceInitiationDigest", "sourceProposalDigest", "sourceReviewDigest", "sourceDecisionDigest", "sourceChainDigest", "identity", "semanticIdentity", "digest"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (record?.executionId !== record?.id || !LIFECYCLES.includes(record?.lifecycle) || !STATUSES.includes(record?.status) || record?.executionStatus !== record?.status || !NEXT_ACTIONS.includes(record?.nextAction)) invalid("invalid_lifecycle_or_status");
    if (!positiveInteger(record?.revision) || !positiveInteger(record?.epoch) || !isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("invalid_revision");
    if (!record?.sourceSnapshots?.initiation || !record?.sourceSnapshots?.proposal || !record?.sourceSnapshots?.review || !record?.sourceSnapshots?.decision || !record?.sourceEnvelope || !record?.sourceProof || !record?.executionPlan || !Array.isArray(record?.observations) || !Array.isArray(record?.evidence) || !Array.isArray(record?.audit) || !Array.isArray(record?.reasonCodes) || !Array.isArray(record?.reasons)) invalid("invalid_structure");
    if (record?.sourceSnapshots) {
      const source = normalizeSource({ projectId: record.projectId, patternId: record.patternId, calculationId: record.calculationId, ...record.sourceSnapshots }); const envelope = sourceEnvelopeFrom(source);
      if (canonicalize(envelope) !== canonicalize(record.sourceEnvelope)) invalid("source_envelope_mismatch");
      if (fingerprint({ snapshots: record.sourceSnapshots, sourceEnvelope: record.sourceEnvelope }) !== record.sourceChainDigest) invalid("source_chain_digest_mismatch");
      if (decisionDigest(record.sourceSnapshots.decision) !== record.sourceDecisionDigest || reviewDigest(record.sourceSnapshots.review) !== record.sourceReviewDigest || proposalDigest(record.sourceSnapshots.proposal) !== record.sourceProposalDigest || initiationDigest(record.sourceSnapshots.initiation) !== record.sourceInitiationDigest) invalid("source_snapshot_mismatch");
      if (record.sourceSnapshots.decision.lifecycle !== "authorized" || record.sourceSnapshots.decision.outcome !== "authorize") invalid("non_authorized_decision");
    }
    const plan = normalizeExecutionPlan({ executionPlan: record?.executionPlan }, record?.sourceSnapshots?.decision); if (canonicalize(plan) !== canonicalize(record?.executionPlan)) invalid("execution_plan_not_canonical");
    if (calculateExecutionIdentity(record) !== record?.identity) invalid("identity_mismatch");
    if (calculateSemanticIdentity(record) !== record?.semanticIdentity) invalid("semantic_identity_mismatch");
    const expected = calculateExecutionStatus(record); if (expected.status !== record?.status || canonicalize(stableStrings(expected.reasons.map((item) => item.code))) !== canonicalize(record?.reasonCodes) || nextActionFor(expected.status, expected.reasons, record?.lifecycle) !== record?.nextAction) invalid("derived_state_mismatch");
    if (calculateExecutionDigest(record) !== record?.digest) invalid("digest_mismatch");
    if (record?.predecessorExecutionId === record?.id || record?.supersedesExecutionId === record?.id) invalid("predecessor_cycle");
    if (TERMINAL_LIFECYCLES.includes(record?.lifecycle) && record.lifecycle === "completed" && record.status !== "completed") invalid("impossible_completed_state");
    if (stableStrings(record?.reasonCodes).length !== array(record?.reasonCodes).length || stableObjects(record?.reasons, "code").length !== array(record?.reasons).length) invalid("duplicate_or_unsorted_derived_values");
    return validationResult(errors);
  }
  function requireRecord(record) { const report = validatePatternEvolutionExecution(record); if (!report.valid) throw executionError("corrupted_input", "Pattern evolution execution is corrupted.", { errors: report.errors }); }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw executionError("revision_conflict", "Execution revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw executionError("identity_conflict", "Execution identity changed."); }

  function transition(record, nextLifecycle, source = null, command = {}) {
    requireRecord(record); checkConcurrency(record, command); if (TERMINAL_LIFECYCLES.includes(record.lifecycle)) throw executionError("terminal_immutable", "Terminal executions are immutable."); if (record.lifecycle === "stale") throw executionError("stale_immutable", "A stale execution cannot resume.");
    if (!TRANSITIONS[record.lifecycle]?.includes(nextLifecycle)) throw executionError("invalid_transition", "Execution lifecycle transition is not allowlisted."); const timestamp = injectedTimestamp(command.now, record.updatedAt);
    const gate = source ? calculateSourceGate(source, record) : null; if (source && !gate.valid && nextLifecycle !== "stale") throw executionError("source_gate_failed", "The source chain no longer proves this execution.", { reasons: gate.reasons });
    const planReasons = validatePlan(record.executionPlan, record.risk.level);
    if (["ready", "executing"].includes(nextLifecycle) && (planReasons.length || !gate?.valid)) throw executionError("execution_not_ready", "Execution readiness is not proven.", { reasons: planReasons.length ? planReasons : gate?.reasons });
    if (nextLifecycle === "verifying" && record.executionPlan.operations.some((operation) => !record.observations.some((observation) => observation.operationKey === operation.key && ["completed", "succeeded", "passed"].includes(observation.result)))) throw executionError("operations_incomplete", "All required operations must have successful observations before verification.");
    if (nextLifecycle === "completed" && !evidenceAssessment(record).complete) throw executionError("completion_unproven", "Completion requires all evidence, postconditions, compatibility, rollback, and migration outcomes.", { reasons: evidenceAssessment(record).reasons });
    const next = clone(record); next.lifecycle = nextLifecycle; next.revision += 1; next.updatedAt = timestamp; next.audit = [...array(next.audit), { event: nextLifecycle, at: timestamp, revision: next.revision }]; return refreshDerived(next, gate);
  }
  function prepareExecution(record, source, command = {}) { return transition(record, "preparing", source, command); }
  function markExecutionReady(record, source, command = {}) { return transition(record, "ready", source, command); }
  function startExecution(record, source, command = {}) { return transition(record, "executing", source, command); }
  function beginVerification(record, source, command = {}) { return transition(record, "verifying", source, command); }
  function completeExecution(record, source, command = {}) { return transition(record, "completed", source, command); }
  function cancelExecution(record, source, command = {}) { return transition(record, "cancelled", source, command); }
  function markExecutionStale(record, source, command = {}) { return transition(record, "stale", source, command); }
  function requireExecutionRevision(record, source, command = {}) { return transition(record, "revision_required", source, command); }
  function requireExecutionEvidence(record, source, command = {}) { return transition(record, "evidence_required", source, command); }
  function requireExecutionRollback(record, source, command = {}) { return transition(record, "rollback_required", source, command); }
  function blockExecution(record, source, command = {}) { return transition(record, "blocked", source, command); }
  function failExecution(record, source, command = {}) { return transition(record, "failed", source, command); }

  function recordExecutionObservation(record, observation, evidence = [], source = null, command = {}) {
    requireRecord(record); checkConcurrency(record, command); if (!ACTIVE_LIFECYCLES.includes(record.lifecycle) || ["draft", "ready"].includes(record.lifecycle)) throw executionError("observation_not_allowed", "Observations may only be recorded while preparing, executing, or verifying.");
    const timestamp = injectedTimestamp(command.now, record.updatedAt); const next = clone(record); next.observations = normalizedObservations([...next.observations, observation]); next.evidence = normalizedEvidence([...next.evidence, ...array(evidence)]); next.revision += 1; next.updatedAt = timestamp; next.audit = [...next.audit, { event: "observation_recorded", at: timestamp, revision: next.revision, observationKey: normalizeText(observation?.key || observation?.observationKey || observation?.id) }]; return refreshDerived(next, source ? calculateSourceGate(source, next) : null);
  }

  function projectPatternEvolutionExecution(record, source = {}) {
    requireRecord(record); const gate = calculateSourceGate(source, record); if (gate.valid) return freeze({ record, lifecycle: record.lifecycle, status: record.status, stale: false, sourceGate: gate, reasons: record.reasons, nextAction: record.nextAction });
    const next = clone(record); next.sourceProof = { ...next.sourceProof, valid: false, current: false, issues: gate.reasons.map((item) => item.code) }; if (!TERMINAL_LIFECYCLES.includes(next.lifecycle)) next.lifecycle = "stale"; const refreshed = refreshDerived(next, gate); return freeze({ record: refreshed, lifecycle: "stale", status: "stale", stale: true, sourceGate: gate, reasons: refreshed.reasons, nextAction: refreshed.nextAction });
  }
  function isExecutionStale(record, source) { return projectPatternEvolutionExecution(record, source).stale; }

  function classifyDuplicate(records, candidate) {
    const values = array(records).map((item) => item?.state || item); const sameId = values.find((item) => item?.id === candidate?.id);
    if (sameId && canonicalize(sameId) === canonicalize(candidate)) return freeze({ status: "exact_duplicate", record: sameId });
    if (sameId) return freeze({ status: "collision", record: sameId });
    const sameIdentity = values.find((item) => item?.identity === candidate?.identity); if (sameIdentity) return freeze({ status: sameIdentity.lifecycle === "completed" ? "duplicate_completed" : "identity_collision", record: sameIdentity });
    const semantic = values.find((item) => item?.semanticIdentity === candidate?.semanticIdentity); if (semantic) return freeze({ status: semantic.lifecycle === "completed" ? "duplicate_completed" : "semantic_duplicate", record: semantic });
    return freeze({ status: "unique", record: null });
  }
  function serializePatternEvolutionExecution(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternEvolutionExecution(value) { let parsed; try { parsed = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw executionError("malformed_record", "Execution payload is malformed."); } requireRecord(parsed); return freeze(parsed); }
  function safeNormalizePatternEvolutionExecution(value) { try { return freeze({ record: deserializePatternEvolutionExecution(value), corrupted: false, errors: [] }); } catch (error) { return freeze({ record: null, corrupted: true, errors: error?.details?.errors || [{ code: error?.code || "malformed_record", field: null }] }); } }

  function makeImportedPatternEvolutionExecutionUnproven(record, options = {}) {
    requireRecord(record); const next = clone(record); next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.sourceProof = { ...next.sourceProof, valid: false, authorized: false, provenanceProven: false, issues: stableStrings([...array(next.sourceProof?.issues), "imported_unproven"]) }; next.provenance = { ...next.provenance, origin: "imported", trust: "unproven", reason: normalizeText(options.reason) || "import_identity_unproven" }; next.collision = options.collision === true || next.collision === true; next.originalImport = next.originalImport || sourceSnapshot({ executionId: record.id, sourceSnapshots: record.sourceSnapshots, lifecycle: record.lifecycle, status: record.status, digest: record.digest, provenance: record.provenance }); if (next.lifecycle === "completed") next.lifecycle = "evidence_required"; next.updatedAt = injectedTimestamp(options.now, record.updatedAt); next.revision += 1; next.audit = [...next.audit, { event: "imported_unproven", at: next.updatedAt, revision: next.revision }]; return refreshDerived(next);
  }

  function remapKnown(value, map, parentKey = "") {
    if (typeof value === "string") return REFERENCE_FIELDS.has(parentKey) ? map.get(value) || value : value;
    if (Array.isArray(value)) return value.map((item) => remapKnown(item, map, parentKey));
    if (!value || typeof value !== "object") return value;
    const result = {}; for (const [key, item] of Object.entries(value)) result[key] = remapKnown(item, map, key); return result;
  }
  function remapPatternEvolutionExecution(record, referenceMap) {
    requireRecord(record); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {})); const forbidden = ["executionPolicyVersion", "riskPolicyVersion", "evidencePolicyVersion", "status", "lifecycle", "risk", "reasonCodes", "nextAction"];
    if (forbidden.some((key) => map.has(key))) throw executionError("forbidden_remap", "Policy, risk, lifecycle, and verdict fields cannot be remapped.");
    const next = clone(record); for (const field of ["projectId", "patternId", "calculationId", "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceDecisionId", "predecessorExecutionId", "supersedesExecutionId"]) if (next[field]) next[field] = map.get(next[field]) || next[field]; next.sourceSnapshots = remapKnown(next.sourceSnapshots, map, "sourceSnapshots"); next.sourceEnvelope = remapKnown(next.sourceEnvelope, map, "sourceEnvelope"); next.executionPlan = remapKnown(next.executionPlan, map, "executionPlan"); next.observations = remapKnown(next.observations, map, "observations"); next.evidence = remapKnown(next.evidence, map, "evidence");
    const normalized = normalizeSource({ projectId: next.projectId, patternId: next.patternId, calculationId: next.calculationId, ...next.sourceSnapshots }); next.sourceEnvelope = sourceEnvelopeFrom(normalized); for (const name of ["Initiation", "Proposal", "Review", "Decision"]) { const lowerName = name.toLowerCase(); next[`source${name}Id`] = next.sourceEnvelope[lowerName].id; next[`source${name}Revision`] = next.sourceEnvelope[lowerName].revision; next[`source${name}Digest`] = next.sourceEnvelope[lowerName].digest; } next.sourceChainDigest = fingerprint({ snapshots: next.sourceSnapshots, sourceEnvelope: next.sourceEnvelope }); next.executionPlan = normalizeExecutionPlan({ executionPlan: next.executionPlan }, next.sourceSnapshots.decision); next.epoch += 1; next.predecessorExecutionId = record.id; next.supersedesExecutionId = record.id; next.identity = calculateExecutionIdentity(next); next.semanticIdentity = calculateSemanticIdentity(next); next.id = map.get(record.id) || `pattern-evolution-execution:${next.identity.slice(8)}`; next.executionId = next.id; next.digest = calculateExecutionDigest(next); return makeImportedPatternEvolutionExecutionUnproven(freeze(next), { now: next.updatedAt, collision: true, reason: "reference_remapped" });
  }

  function importPatternEvolutionExecution(existing, serialized, options = {}) {
    const safe = safeNormalizePatternEvolutionExecution(serialized); if (safe.corrupted) return freeze({ status: "malformed", changed: false, record: null, quarantine: { reasonCode: safe.errors[0]?.code || "malformed_record", errors: safe.errors } });
    const duplicate = classifyDuplicate(existing, safe.record); if (duplicate.status !== "unique") return freeze({ status: duplicate.status, changed: false, record: duplicate.record, collision: duplicate.status.includes("collision") });
    try { const imported = makeImportedPatternEvolutionExecutionUnproven(safe.record, { now: options.now || options.timestamp || safe.record.updatedAt, collision: false, reason: "import_identity_unproven" }); return freeze({ status: "imported_unproven", changed: true, record: imported, collision: false }); }
    catch (error) { return freeze({ status: "malformed", changed: false, record: null, quarantine: { reasonCode: error.code || "malformed_record", errors: error.details?.errors || [] } }); }
  }

  function revalidatePatternEvolutionExecution(record, source, command = {}) {
    requireRecord(record); const gate = calculateSourceGate(source); if (!gate.authorized) throw executionError("source_not_equivalent", "Local sources do not prove an authorized semantic successor.", { reasons: gate.reasons });
    const input = { now: injectedTimestamp(command.now, record.updatedAt), epoch: positiveInteger(command.epoch) || record.epoch + 1, predecessorExecutionId: record.id, supersedesExecutionId: record.id, executionPlan: record.executionPlan, originalImport: { executionId: record.id, imported: record.imported, importedUnproven: record.importedUnproven, sourceSnapshots: record.sourceSnapshots, originalImport: record.originalImport } };
    return createPatternEvolutionExecution(source, input);
  }

  async function loadSource(repository, projectId, decisionId = null) {
    const decisionEntry = await repository.getPatternEvolutionDecision(projectId, decisionId); const decision = decisionEntry?.state || null;
    if (!decision) return freeze({ projectId, patternId: "", calculationId: "", initiation: null, proposal: null, review: null, decision: null, decisions: [], executions: [] });
    const chain = await repository.getPatternEvolutionDecisionSourceChain(projectId, decision.id, decision.calculationId); const decisions = await repository.listPatternEvolutionDecisions(projectId, decision.calculationId, { patternId: decision.patternId }); const executions = repository.listPatternEvolutionExecutions ? await repository.listPatternEvolutionExecutions(projectId, decision.calculationId, { decisionId: decision.id }) : [];
    return freeze({ projectId, patternId: decision.patternId, calculationId: decision.calculationId, initiation: chain.initiation?.state || chain.initiation || null, proposal: chain.proposal?.state || chain.proposal || null, review: chain.review?.state || chain.review || null, decision, decisions: decisions.map((item) => item.state), executions: executions.map((item) => item.state) });
  }
  async function createForProject(repository, projectId, input = {}) { const source = await loadSource(repository, projectId, input.decisionId); const all = await repository.listPatternEvolutionExecutions(projectId, source.calculationId); const epoch = positiveInteger(input.epoch) || all.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1; const record = createPatternEvolutionExecution(source, { ...input, epoch }); const existing = await repository.getLatestPatternEvolutionExecutionForDecision(projectId, record.sourceDecisionId, record.calculationId); if (existing?.state?.semanticIdentity === record.semanticIdentity) return freeze({ executionRecord: existing, rawExecution: existing.state, source, duplicate: true }); const stored = await repository.savePatternEvolutionExecution(projectId, record, { timestamp: record.updatedAt }); return freeze({ executionRecord: stored, rawExecution: stored.state, source, duplicate: false }); }
  async function readForProject(repository, projectId, executionId = null, decisionId = null) { const progress = await repository.getPatternEvolutionExecution(projectId, executionId, null, decisionId); if (!progress) return freeze({ executionRecord: null, execution: null, source: null, projection: null }); const source = await loadSource(repository, projectId, progress.state.sourceDecisionId); return freeze({ executionRecord: progress, execution: progress.state, source, projection: projectPatternEvolutionExecution(progress.state, source) }); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, POLICY_VERSION, RISK_POLICY_VERSION, EVIDENCE_POLICY_VERSION, PROGRESS_KIND, DEFAULT_TIMESTAMP,
    LIFECYCLES, ACTIVE_LIFECYCLES, TERMINAL_LIFECYCLES, STATUSES, STATUS_PRECEDENCE, NEXT_ACTIONS, RISK_LEVELS,
    ALLOWED_OPERATION_TYPES, FORBIDDEN_OPERATION_TYPES, TRANSITIONS, REFERENCE_FIELDS,
    PatternEvolutionExecutionError, canonicalize, fingerprint, normalizeText, normalizeObject, stableStrings, stableObjects, sourceSnapshot,
    initiationDigest, proposalDigest, reviewDigest, decisionDigest, normalizeSource, sourceEnvelopeFrom, calculateSourceGate,
    normalizeExecutionPlan, normalizeRollbackContract, normalizeMigrationContract, normalizeCompatibilityContract, normalizeVerificationContract,
    validatePlan, normalizedEvidence, normalizedObservations, evidenceAssessment, calculateExecutionStatus, nextActionFor,
    identityPayload, semanticIdentityPayload, calculateExecutionIdentity, calculateSemanticIdentity, digestPayload, calculateExecutionDigest,
    createPatternEvolutionExecution, createExecution: createPatternEvolutionExecution, validatePatternEvolutionExecution,
    serializePatternEvolutionExecution, deserializePatternEvolutionExecution, safeNormalizePatternEvolutionExecution,
    transition, prepareExecution, markExecutionReady, startExecution, beginVerification, completeExecution, cancelExecution,
    markExecutionStale, requireExecutionRevision, requireExecutionEvidence, requireExecutionRollback, blockExecution, failExecution,
    recordExecutionObservation, projectPatternEvolutionExecution, isExecutionStale, classifyDuplicate,
    makeImportedPatternEvolutionExecutionUnproven, remapPatternEvolutionExecution, importPatternEvolutionExecution,
    revalidatePatternEvolutionExecution, loadSource, createForProject, readForProject,
  });
  globalObject.YarnAIPatternEvolutionExecution = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
