"use strict";

(function initializePatternEvolutionClosure(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const POLICY_VERSION = "pattern-evolution-closure/v1";
  const EVIDENCE_POLICY_VERSION = "pattern-evolution-closure-evidence/v1";
  const RISK_POLICY_VERSION = "pattern-evolution-closure-risk/v1";
  const PROGRESS_KIND = "PATTERN_EVOLUTION_CLOSURE";
  const PERSISTENCE_KIND = "pattern_evolution_closure";
  const SOURCE_KIND = "PATTERN_EVOLUTION_ACCEPTANCE";
  const ACTIVE_LIFECYCLES = Object.freeze(["draft", "reconciling", "finalizing", "reviewing"]);
  const OUTCOMES = Object.freeze([
    "closed_accepted", "closed_accepted_with_conditions", "closed_without_adoption",
    "revision_cycle_required", "evidence_cycle_required", "rollback_process_required",
    "rejected", "blocked", "failed", "cancelled",
  ]);
  const TERMINAL_LIFECYCLES = OUTCOMES;
  const LIFECYCLES = Object.freeze([...ACTIVE_LIFECYCLES, ...OUTCOMES]);
  const STATUSES = Object.freeze([
    "stale", "failed", "rollback_required", "blocked", "evidence_required",
    "revision_required", "rejected", "cancelled", "closed_with_conditions",
    "closed", "in_progress", "ready", "pending",
  ]);
  const STATUS_PRECEDENCE = STATUSES;
  const RISK_LEVELS = Object.freeze(["none", "low", "moderate", "high", "critical", "indeterminate"]);
  const CRITERION_TYPES = Object.freeze(["mandatory", "conditional", "advisory"]);
  const CRITERION_STATES = Object.freeze(["satisfied", "unsatisfied", "not_applicable", "unknown", "conflicting", "untrusted", "stale"]);
  const CONDITION_STATES = Object.freeze(["resolved", "carried_forward", "waived_by_policy", "invalid", "conflicting", "unverifiable", "expired", "blocking"]);
  const EVIDENCE_STATES = Object.freeze(["missing", "malformed", "untrusted", "conflicting", "insufficient", "valid", "expired", "foreign_revision", "future_revision", "incompatible"]);
  const TRANSITIONS = Object.freeze({
    draft: Object.freeze(["reconciling"]),
    reconciling: Object.freeze(["finalizing"]),
    finalizing: Object.freeze(["reviewing"]),
    reviewing: OUTCOMES,
  });
  const REFERENCE_FIELDS = new Set([
    "projectId", "patternId", "calculationId", "evolutionId", "cycleId", "id", "closureId",
    "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceDecisionId",
    "sourceExecutionId", "sourceVerificationId", "sourceAcceptanceId",
    "acceptanceId", "verificationId", "executionId", "decisionId", "reviewId", "proposalId",
    "initiationId", "predecessorClosureId", "supersedesClosureId", "bindingId", "ownerId",
    "criterionIds", "conditionIds", "evidenceRefs", "references",
  ]);

  class PatternEvolutionClosureError extends Error {
    constructor(code, message, details = {}) { super(message); this.name = "PatternEvolutionClosureError"; this.code = code; this.details = details; }
  }

  const closureError = (code, message, details) => new PatternEvolutionClosureError(code, message, details);
  const array = (value) => Array.isArray(value) ? value : [];
  const clone = (value) => value === undefined ? undefined : globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value));
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function lower(value) { return normalizeText(value).toLowerCase(); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value); }
  function injectedTimestamp(...values) { const result = values.find(isTimestamp); if (!result) throw closureError("timestamp_required", "An injected source timestamp is required."); return result; }
  function canonicalize(value, seen = new Set()) {
    if (value === null) return "null";
    if (["string", "boolean"].includes(typeof value)) return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) throw closureError("non_finite_number", "Non-finite numbers are forbidden."); return Object.is(value, -0) ? "0" : JSON.stringify(value); }
    if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
    if (value && typeof value === "object") { if (seen.has(value)) throw closureError("cyclic_value", "Cyclic values are forbidden."); seen.add(value); const result = `{${Object.keys(value).sort(compare).filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`; seen.delete(value); return result; }
    throw closureError("unsupported_value", "Unsupported values are forbidden.");
  }
  function fingerprint(value) { const input = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function normalizeObject(value) { if (Array.isArray(value)) return value.map(normalizeObject); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value).sort(compare)) if (value[key] !== undefined) result[key] = normalizeObject(value[key]); return result; } return value; }
  function stableStrings(values) { return [...new Set(array(values).map((value) => normalizeText(typeof value === "object" ? value?.id || value?.code || value?.key : value)).filter(Boolean))].sort(compare); }
  function stableObjects(values, key = "id") { const unique = new Map(); for (const item of array(values)) { const value = normalizeObject(clone(item)); const identity = normalizeText(value?.[key] || value?.id || value?.code) || fingerprint(value); if (!unique.has(identity)) unique.set(identity, value); } return [...unique.values()].sort((a, b) => compare(a?.[key] || a?.id || a?.code || canonicalize(a), b?.[key] || b?.id || b?.code || canonicalize(b))); }
  function snapshot(value) { return freeze(normalizeObject(clone(value || {}))); }
  function stateOf(value) { return value?.state || value || null; }
  function idOf(value, ...fields) { const item = stateOf(value); for (const field of ["id", ...fields]) { const id = normalizeText(item?.[field]); if (id) return id; } return ""; }
  function digestOf(value) { const item = stateOf(value); return normalizeText(item?.digest || item?.sourceDigest || item?.identity); }
  function reason(code, category, message, references = []) { return freeze({ code, category, message, references: stableStrings(references) }); }
  function addReason(collection, code, category, message, references = []) { collection.push(reason(code, category, message, references)); }
  function metric(values, accepted) { const entries = array(values); const complete = entries.filter((item) => accepted.includes(item.state || item.result || item.status)).length; return freeze({ required: entries.length, complete, missing: entries.length - complete, ratio: entries.length ? complete / entries.length : 1, satisfied: complete === entries.length }); }

  const CHAIN = Object.freeze([
    Object.freeze({ name: "initiation", kind: "PATTERN_EVOLUTION_INITIATION", idField: "initiationId" }),
    Object.freeze({ name: "proposal", kind: "PATTERN_EVOLUTION_PROPOSAL", idField: "proposalId" }),
    Object.freeze({ name: "review", kind: "PATTERN_EVOLUTION_PROPOSAL_REVIEW", idField: "reviewId" }),
    Object.freeze({ name: "decision", kind: "PATTERN_EVOLUTION_DECISION", idField: "decisionId" }),
    Object.freeze({ name: "execution", kind: "PATTERN_EVOLUTION_EXECUTION", idField: "executionId" }),
    Object.freeze({ name: "verification", kind: "PATTERN_EVOLUTION_EXECUTION_VERIFICATION", idField: "verificationId" }),
    Object.freeze({ name: "acceptance", kind: SOURCE_KIND, idField: "acceptanceId" }),
  ]);
  const VALIDATORS = Object.freeze({
    initiation: "validatePatternEvolutionInitiation",
    proposal: "validatePatternEvolutionProposal",
    review: "validatePatternEvolutionProposalReview",
    decision: "validatePatternEvolutionDecision",
    execution: "validatePatternEvolutionExecution",
    verification: "validatePatternEvolutionExecutionVerification",
    acceptance: "validatePatternEvolutionAcceptance",
  });
  const APIS = Object.freeze({
    initiation: "YarnAIPatternEvolutionInitiation", proposal: "YarnAIPatternEvolutionProposal",
    review: "YarnAIPatternEvolutionProposalReview", decision: "YarnAIPatternEvolutionDecision",
    execution: "YarnAIPatternEvolutionExecution", verification: "YarnAIPatternEvolutionExecutionVerification",
    acceptance: "YarnAIPatternEvolutionAcceptance",
  });

  function normalizedSource(source = {}) {
    const acceptance = stateOf(source.acceptance || source.sourceAcceptance || (source.kind === SOURCE_KIND ? source : null));
    const result = {
      projectId: normalizeText(source.projectId || acceptance?.projectId), patternId: normalizeText(source.patternId || acceptance?.patternId),
      calculationId: normalizeText(source.calculationId || acceptance?.calculationId), evolutionId: normalizeText(source.evolutionId || acceptance?.evolutionId || acceptance?.sourceInitiationId),
      cycleId: normalizeText(source.cycleId || acceptance?.cycleId || acceptance?.sourceInitiationId),
      closures: array(source.closures).map(stateOf), quarantinedIds: stableStrings(source.quarantinedIds),
    };
    for (const { name } of CHAIN) result[name] = stateOf(source[name] || (name === "acceptance" ? acceptance : null));
    return freeze(result);
  }

  function bindingEntry(value, idField) { const item = stateOf(value); return freeze({ id: idOf(item, idField), revision: positiveInteger(item?.revision), semanticRevision: positiveInteger(item?.semanticRevision || item?.sourceVerificationRevision || item?.revision), digest: digestOf(item) }); }
  function terminalAcceptance(acceptance) {
    const api = globalObject.YarnAIPatternEvolutionAcceptance;
    return Boolean(acceptance && (api?.TERMINAL_LIFECYCLES?.includes(acceptance.lifecycle) || ["accepted", "accepted_with_conditions", "revision_required", "evidence_required", "rollback_required", "rejected", "blocked", "failed", "cancelled", "closed_without_adoption"].includes(acceptance.lifecycle)));
  }
  function terminalClosure(record) { return Boolean(record && OUTCOMES.includes(record.lifecycle)); }
  function calculateLiveChainGate(source = {}, record = null) {
    const normalized = normalizedSource(source); const reasons = [];
    for (const descriptor of CHAIN) {
      const item = normalized[descriptor.name];
      if (!item) { addReason(reasons, `missing_live_${descriptor.name}`, "missing", `The live ${descriptor.name} record is required.`); continue; }
      if (item.kind !== descriptor.kind || item.type !== descriptor.kind) addReason(reasons, `${descriptor.name}_kind_invalid`, "integrity", `The live ${descriptor.name} kind is invalid.`, [idOf(item, descriptor.idField)]);
      if (!idOf(item, descriptor.idField)) addReason(reasons, `${descriptor.name}_identity_missing`, "identity", `The live ${descriptor.name} identity is missing.`);
      if (!positiveInteger(item.revision)) addReason(reasons, `${descriptor.name}_revision_invalid`, "revision", `The live ${descriptor.name} revision is invalid.`);
      if (!digestOf(item)) addReason(reasons, `${descriptor.name}_digest_missing`, "integrity", `The live ${descriptor.name} digest is missing.`);
      const api = globalObject[APIS[descriptor.name]]; const validator = api?.[VALIDATORS[descriptor.name]];
      if (validator) { try { if (!validator(item)?.valid) addReason(reasons, `${descriptor.name}_domain_invalid`, "failure", `The live ${descriptor.name} failed domain validation.`); } catch { addReason(reasons, `${descriptor.name}_domain_failure`, "failure", `The live ${descriptor.name} could not be validated.`); } }
      if (item.importedUnproven || item.proofStatus === "imported-unproven" || item.provenance?.origin === "import" && item.proofStatus !== "proven") addReason(reasons, `${descriptor.name}_imported_unproven`, "trust", `The live ${descriptor.name} is imported and locally unproven.`);
      if (item.quarantined || normalized.quarantinedIds.includes(idOf(item, descriptor.idField))) addReason(reasons, `${descriptor.name}_quarantined`, "trust", `The live ${descriptor.name} is quarantined.`);
      if (item.collision || item.identityCollision) addReason(reasons, `${descriptor.name}_identity_collision`, "collision", `The live ${descriptor.name} has an identity collision.`);
      if (item.stale || item.lifecycle === "stale" || item.status === "stale") addReason(reasons, `${descriptor.name}_stale`, "stale", `The live ${descriptor.name} is stale.`);
      if (item.superseded || item.supersededById) addReason(reasons, `${descriptor.name}_superseded`, "stale", `The live ${descriptor.name} is superseded.`);
    }
    const present = CHAIN.map(({ name }) => normalized[name]).filter(Boolean);
    if (!normalized.projectId || present.some((item) => item.projectId !== normalized.projectId)) addReason(reasons, "cross_project_binding", "identity", "The live chain does not bind one project.");
    if (!normalized.patternId || present.some((item) => item.patternId !== normalized.patternId)) addReason(reasons, "cross_pattern_binding", "identity", "The live chain does not bind one pattern.");
    if (!normalized.calculationId || present.some((item) => item.calculationId !== normalized.calculationId)) addReason(reasons, "cross_cycle_binding", "identity", "The live chain does not bind one calculation cycle.");
    const acceptance = normalized.acceptance;
    if (acceptance && !terminalAcceptance(acceptance)) addReason(reasons, "acceptance_non_terminal", "terminality", "Only terminal acceptance can be closed.");
    if (acceptance?.sourceProof && (acceptance.sourceProof.valid !== true || acceptance.sourceProof.current !== true || acceptance.sourceProof.provenanceProven !== true)) addReason(reasons, "acceptance_provenance_unproven", "trust", "Acceptance provenance is not locally current and proven.");
    if (acceptance) {
      const sourceFields = { initiation: "sourceInitiationId", proposal: "sourceProposalId", review: "sourceReviewId", decision: "sourceDecisionId", execution: "sourceExecutionId", verification: "sourceVerificationId" };
      for (const [name, field] of Object.entries(sourceFields)) {
        const live = normalized[name]; if (live && acceptance[field] !== idOf(live, `${name}Id`)) addReason(reasons, `${name}_predecessor_reference_broken`, "revision", `Acceptance does not reference the live ${name}.`);
        if (live && acceptance.sourceSnapshots?.[name] && canonicalize(acceptance.sourceSnapshots[name]) !== canonicalize(snapshot(live))) addReason(reasons, `${name}_digest_changed`, "stale", `The live ${name} differs from the accepted snapshot.`);
      }
      if (normalized.verification && acceptance.sourceVerificationRevision !== normalized.verification.revision) addReason(reasons, acceptance.sourceVerificationRevision < normalized.verification.revision ? "future_verification_revision" : "foreign_verification_revision", "revision", "Acceptance verification revision does not match the live revision.");
      const acceptanceApi = globalObject.YarnAIPatternEvolutionAcceptance;
      if (acceptanceApi?.calculateAcceptanceDigest && acceptance.digest !== acceptanceApi.calculateAcceptanceDigest(acceptance)) addReason(reasons, "acceptance_digest_broken", "failure", "Acceptance digest is invalid.");
      if (acceptanceApi?.calculateSourceGate) { try { const gate = acceptanceApi.calculateSourceGate({ ...normalized, acceptances: [acceptance] }, acceptance); for (const item of gate.reasons || []) addReason(reasons, `acceptance_${item.code}`, item.category || "integrity", item.message, item.references); } catch { addReason(reasons, "acceptance_gate_failure", "failure", "Acceptance reconciliation failed."); } }
    }
    const binding = {}; for (const descriptor of CHAIN) binding[descriptor.name] = bindingEntry(normalized[descriptor.name], descriptor.idField);
    const sourceSnapshots = {}; for (const { name } of CHAIN) sourceSnapshots[name] = snapshot(normalized[name]);
    const sourceChainDigest = fingerprint({ sourceSnapshots, binding });
    if (record && (record.sourceAcceptanceId !== idOf(acceptance, "acceptanceId") || record.sourceAcceptanceRevision !== positiveInteger(acceptance?.revision) || record.sourceAcceptanceDigest !== digestOf(acceptance))) addReason(reasons, "closure_acceptance_binding_changed", "stale", "Closure no longer binds the live acceptance revision.");
    if (record && record.sourceChainDigest !== sourceChainDigest) addReason(reasons, "closure_source_chain_changed", "stale", "Closure source-chain digest differs from the live chain.");
    const competing = normalized.closures.filter((item) => item && item.id !== record?.id && item.sourceAcceptanceId === idOf(acceptance, "acceptanceId") && terminalClosure(item));
    for (const candidate of competing) {
      const correctlySuperseded = record && (record.predecessorClosureId === candidate.id || record.supersedesClosureId === candidate.id);
      const correctSuccessor = record && (candidate.predecessorClosureId === record.id || candidate.supersedesClosureId === record.id);
      if (!correctlySuperseded && !correctSuccessor) addReason(reasons, "duplicate_terminal_closure", "duplicate", "Competing terminal closures lack immutable successor lineage.", [candidate.id]);
    }
    const stable = stableObjects(reasons, "code");
    return freeze({ valid: stable.length === 0, chainValid: stable.length === 0, reasons: stable, normalized, binding: freeze(binding), sourceSnapshots: freeze(sourceSnapshots), sourceChainDigest, acceptanceTerminal: terminalAcceptance(acceptance), trust: stable.some((item) => ["trust", "collision"].includes(item.category)) ? "untrusted" : "proven" });
  }

  function criterion(id, category, type, state, evidenceRefs = [], reasonCodes = []) { return freeze({ id, category, type: CRITERION_TYPES.includes(type) ? type : "mandatory", state: CRITERION_STATES.includes(state) ? state : "unknown", evidenceRefs: stableStrings(evidenceRefs), reasonCodes: stableStrings(reasonCodes) }); }
  function calculateCriteria(gate, acceptance) {
    const codes = new Set(gate.reasons.map((item) => item.code)); const categoryState = (category) => gate.reasons.some((item) => item.category === category) ? (category === "trust" ? "untrusted" : category === "stale" ? "stale" : "unsatisfied") : "satisfied";
    const criteria = [
      criterion("live-chain-complete", "chain", "mandatory", gate.reasons.some((item) => item.category === "missing") ? "unknown" : "satisfied"),
      criterion("live-chain-integrity", "integrity", "mandatory", categoryState("integrity")),
      criterion("acceptance-terminal", "acceptance", "mandatory", gate.acceptanceTerminal ? "satisfied" : "unsatisfied", [acceptance?.id]),
      criterion("identity-bound", "identity", "mandatory", categoryState("identity")),
      criterion("revision-compatible", "revision", "mandatory", categoryState("revision")),
      criterion("provenance-trusted", "trust", "mandatory", gate.trust === "proven" ? "satisfied" : "untrusted"),
      criterion("not-stale", "freshness", "mandatory", gate.reasons.some((item) => item.category === "stale") ? "stale" : "satisfied"),
      criterion("collision-free", "collision", "mandatory", categoryState("collision")),
      criterion("terminal-unique", "duplicate", "mandatory", codes.has("duplicate_terminal_closure") ? "conflicting" : "satisfied"),
      criterion("acceptance-authorized", "authorization", "mandatory", ["authorized", "satisfied", "passed"].includes(lower(acceptance?.acceptanceContract?.authorizationAssessment?.status)) ? "satisfied" : "unknown"),
      criterion("governance-complete", "governance", "mandatory", ["authorized", "satisfied", "passed"].includes(lower(acceptance?.acceptanceContract?.governanceAssessment?.status)) ? "satisfied" : "unknown"),
      criterion("administrative-only", "scope", "mandatory", "satisfied"),
    ];
    return freeze(criteria);
  }
  function calculateConditionDisposition(acceptance, input = {}) {
    const contract = acceptance?.acceptanceContract || {}; const conditions = [...array(contract.mandatoryConditions), ...array(contract.residualConditions), ...array(contract.postAcceptanceObligations)]; const supplied = new Map(array(input.conditionEvidence).map((item) => [normalizeText(item?.conditionId || item?.id), item]));
    return freeze(stableObjects(conditions.map((item, index) => {
      const id = normalizeText(item?.id) || `condition:${index + 1}`; const evidence = supplied.get(id); let state = "unverifiable";
      if (["satisfied", "resolved", "complete"].includes(lower(item?.state || item?.status))) state = "resolved";
      else if (item?.expired === true || lower(item?.state) === "expired") state = "expired";
      else if (item?.conflicting === true || lower(item?.state) === "conflicting") state = "conflicting";
      else if (["security_critical", "integrity_critical"].includes(lower(item?.criticality)) || ["pre_acceptance", "blocking", "rollback_triggering"].includes(lower(item?.category))) state = "blocking";
      else if (evidence?.waived === true && evidence?.governance?.status === "authorized" && evidence?.authorization?.status === "authorized" && evidence?.provenance?.origin === "local" && evidence?.provenance?.proofStatus === "proven") state = "waived_by_policy";
      else if (lower(item?.category) === "post_acceptance_obligation" && normalizeText(item?.ownerId || item?.owner) && normalizeText(item?.bindingId || acceptance?.id)) state = "carried_forward";
      else if (["invalid", "malformed"].includes(lower(item?.state))) state = "invalid";
      return { id, category: lower(item?.category) || "unknown", criticality: lower(item?.criticality) || "unknown", state, ownerId: normalizeText(item?.ownerId || item?.owner), bindingId: normalizeText(item?.bindingId || acceptance?.id), evidenceRefs: stableStrings(item?.evidenceRequirements || evidence?.evidenceRefs) };
    }), "id"));
  }
  function calculateEvidenceReconciliation(gate, acceptance, input = {}) {
    const contractEvidence = array(acceptance?.acceptanceContract?.evidenceAssessment?.evidence); const values = contractEvidence.length ? contractEvidence : array(input.evidence); const requiredRevision = positiveInteger(acceptance?.revision);
    const evidence = stableObjects(values.map((item, index) => {
      const id = normalizeText(item?.id || item?.evidenceId) || `evidence:${index + 1}`; let state = EVIDENCE_STATES.includes(lower(item?.state)) ? lower(item.state) : "valid";
      if (!normalizeText(item?.id || item?.evidenceId)) state = "missing";
      else if (item?.malformed || lower(item?.state) === "malformed") state = "malformed";
      else if (item?.expired || lower(item?.state) === "expired") state = "expired";
      else if (item?.collision || item?.conflicting || lower(item?.state) === "conflicting") state = "conflicting";
      else if (item?.importedUnproven || item?.provenance?.origin === "import" || item?.provenance?.proofStatus && item.provenance.proofStatus !== "proven" || lower(item?.state) === "untrusted") state = "untrusted";
      else if (item?.projectId && item.projectId !== gate.normalized.projectId || item?.patternId && item.patternId !== gate.normalized.patternId) state = "incompatible";
      else if (positiveInteger(item?.acceptanceRevision) && item.acceptanceRevision > requiredRevision) state = "future_revision";
      else if (positiveInteger(item?.acceptanceRevision) && item.acceptanceRevision < requiredRevision) state = "foreign_revision";
      else if (lower(item?.state) === "insufficient" || !array(item?.criterionIds).length && !array(item?.conditionIds).length && contractEvidence.length === 0) state = "insufficient";
      return { id, state, digest: normalizeText(item?.digest || item?.evidenceDigest), criterionIds: stableStrings(item?.criterionIds), conditionIds: stableStrings(item?.conditionIds), provenance: normalizeObject(item?.provenance || {}), acceptanceRevision: positiveInteger(item?.acceptanceRevision || requiredRevision) };
    }), "id");
    if (!evidence.length) evidence.push(freeze({ id: "evidence:missing", state: "missing", digest: "", criterionIds: [], conditionIds: [], provenance: {}, acceptanceRevision: requiredRevision }));
    const accepted = ["valid"]; const completeness = metric(evidence, accepted); const consistency = freeze({ status: evidence.some((item) => ["conflicting", "malformed"].includes(item.state)) ? "conflicting" : evidence.every((item) => item.state === "valid") ? "consistent" : "incomplete" }); const coverage = freeze({ status: evidence.every((item) => item.state === "valid" && (item.criterionIds.length || item.conditionIds.length || contractEvidence.length)) ? "complete" : "insufficient", coveredCriteria: stableStrings(evidence.flatMap((item) => item.criterionIds)), coveredConditions: stableStrings(evidence.flatMap((item) => item.conditionIds)) });
    return freeze({ evidence: freeze(evidence), completeness, consistency, coverage, freshness: metric(evidence, ["valid"]), provenance: metric(evidence, ["valid"]), compatibility: metric(evidence, ["valid"]), identityBinding: metric(evidence, ["valid"]), revisionBinding: metric(evidence, ["valid"]) });
  }
  function calculateRiskReconciliation(gate, acceptance, evidence, conditions, input = {}) {
    const signals = normalizeObject(input.riskSignals || {}); const sourceLevel = lower(acceptance?.risk?.level); const codes = new Set(gate.reasons.map((item) => item.code));
    const rollbackRequired = acceptance?.verdict === "rollback_required" || signals.rollbackRequired === true || conditions.some((item) => item.category === "rollback_triggering" && item.state !== "resolved");
    const critical = sourceLevel === "critical" || signals.destructiveChange === true || signals.irreversibleChange === true || signals.securityImpact === true || signals.dataLossPossible === true || codes.has("duplicate_terminal_closure");
    const indeterminate = !sourceLevel || sourceLevel === "indeterminate" || signals.indeterminate === true || gate.reasons.some((item) => item.category === "collision");
    const high = sourceLevel === "high" || signals.schemaImpact === true || signals.migrationImpact === true || signals.authorizationGap === true || signals.governanceGap === true;
    const level = critical ? "critical" : indeterminate ? "indeterminate" : high ? "high" : sourceLevel === "moderate" ? "moderate" : sourceLevel === "low" || sourceLevel === "negligible" ? "low" : "none";
    return freeze({ level, sourceLevel: sourceLevel || "unknown", rollbackRequired, signals, accepted: ["none", "low", "moderate"].includes(level) && !rollbackRequired && evidence.evidence.every((item) => item.state === "valid") });
  }
  function nonAdoptionProven(acceptance, input = {}) { const evidence = input.nonAdoptionEvidence; return acceptance?.verdict === "closed_without_adoption" || Boolean(evidence?.status === "proven" && evidence?.adopted === false && evidence?.bindingId === acceptance?.id && evidence?.governance?.status === "authorized" && evidence?.authorization?.status === "authorized" && evidence?.provenance?.origin === "local" && evidence?.provenance?.proofStatus === "proven"); }
  function computeOutcome(gate, acceptance, criteria, conditions, evidence, risk, input = {}) {
    const categories = new Set(gate.reasons.map((item) => item.category)); const codes = new Set(gate.reasons.map((item) => item.code)); const verdict = lower(acceptance?.verdict || acceptance?.lifecycle);
    if (categories.has("failure")) return "failed";
    if (risk.rollbackRequired || verdict === "rollback_required") return "rollback_process_required";
    if (["critical", "indeterminate"].includes(risk.level)) return "blocked";
    if (evidence.evidence.some((item) => ["missing", "malformed", "untrusted", "conflicting", "insufficient", "expired"].includes(item.state))) return "evidence_cycle_required";
    if (evidence.evidence.some((item) => ["foreign_revision", "future_revision", "incompatible"].includes(item.state)) || categories.has("revision") || codes.has("cross_cycle_binding")) return "revision_cycle_required";
    if (verdict === "revision_required") return "revision_cycle_required";
    if (verdict === "evidence_required") return "evidence_cycle_required";
    if (verdict === "rejected") return "rejected";
    if (verdict === "cancelled") return "cancelled";
    if (verdict === "failed") return "failed";
    if (verdict === "blocked" || !gate.valid || criteria.some((item) => item.type === "mandatory" && !["satisfied", "not_applicable"].includes(item.state))) return "blocked";
    if (conditions.some((item) => ["blocking", "invalid", "conflicting"].includes(item.state))) return "blocked";
    if (conditions.some((item) => item.state === "unverifiable")) return "evidence_cycle_required";
    if (nonAdoptionProven(acceptance, input)) return "closed_without_adoption";
    if (verdict === "accepted_with_conditions" || conditions.some((item) => ["carried_forward", "waived_by_policy"].includes(item.state))) return "closed_accepted_with_conditions";
    if (verdict === "accepted") return "closed_accepted";
    return "blocked";
  }
  function statusForOutcome(outcome) { return ({ closed_accepted: "closed", closed_accepted_with_conditions: "closed_with_conditions", closed_without_adoption: "closed", revision_cycle_required: "revision_required", evidence_cycle_required: "evidence_required", rollback_process_required: "rollback_required", rejected: "rejected", blocked: "blocked", failed: "failed", cancelled: "cancelled" })[outcome] || "blocked"; }
  function lifecycleStatus(record) { if (terminalClosure(record)) return statusForOutcome(record.outcome); if (record.lifecycle === "draft") return record.sourceProof?.valid ? "ready" : "pending"; return ACTIVE_LIFECYCLES.slice(1).includes(record.lifecycle) ? "in_progress" : "pending"; }
  function calculateClosureContract(source = {}, input = {}, record = null) {
    const gate = calculateLiveChainGate(source, record); const acceptance = gate.normalized.acceptance; const criteria = calculateCriteria(gate, acceptance); const conditions = calculateConditionDisposition(acceptance, input); const evidence = calculateEvidenceReconciliation(gate, acceptance, input); const risk = calculateRiskReconciliation(gate, acceptance, evidence, conditions, input); const outcome = computeOutcome(gate, acceptance, criteria, conditions, evidence, risk, input); const reasons = stableObjects([...gate.reasons, ...criteria.filter((item) => !["satisfied", "not_applicable"].includes(item.state)).map((item) => reason(`criterion_${item.id}`, "criterion", `Closure criterion ${item.id} is ${item.state}.`, item.evidenceRefs)), ...conditions.filter((item) => !["resolved", "carried_forward", "waived_by_policy"].includes(item.state)).map((item) => reason(`condition_${item.id}`, "condition", `Condition ${item.id} is ${item.state}.`, item.evidenceRefs)), ...evidence.evidence.filter((item) => item.state !== "valid").map((item) => reason(`evidence_${item.id}`, "evidence", `Evidence ${item.id} is ${item.state}.`))], "code");
    const disposition = freeze({ closes: "one immutable pattern-evolution acceptance cycle revision", doesNotPerform: Object.freeze(["canonical-pattern-change", "rollout", "promotion", "deployment", "code-execution", "schema-change", "migration", "rollback"]), successorCycleAllowed: true, revisionCycleRequired: outcome === "revision_cycle_required", evidenceCycleRequired: outcome === "evidence_cycle_required", rollbackProcessRequired: outcome === "rollback_process_required", carriedForwardConditions: conditions.filter((item) => item.state === "carried_forward"), unresolvedObligations: conditions.filter((item) => !["resolved", "waived_by_policy"].includes(item.state)), administrativelyFinal: OUTCOMES.includes(outcome), adoptedHistoricalFact: nonAdoptionProven(acceptance, input) ? false : ["accepted", "accepted_with_conditions"].includes(acceptance?.verdict) ? "accepted-not-applied" : false, operationsPerformed: [] });
    const reconciliation = freeze({ terminality: gate.acceptanceTerminal ? "satisfied" : "unsatisfied", verdictCompatibility: OUTCOMES.includes(outcome) ? "satisfied" : "unknown", conditions: metric(conditions, ["resolved", "carried_forward", "waived_by_policy"]), evidence: evidence.completeness, authorization: acceptance?.acceptanceContract?.authorizationAssessment?.status || "unknown", governance: acceptance?.acceptanceContract?.governanceAssessment?.status || "unknown", readiness: acceptance?.acceptanceContract?.operationalReadinessAssessment?.status || "unknown", risk: risk.level, provenance: gate.trust, trust: gate.trust, freshness: gate.reasons.some((item) => item.category === "stale") ? "stale" : "current", superseding: gate.reasons.some((item) => item.code.includes("superseded")) ? "superseded" : "current", compatibility: gate.reasons.some((item) => ["revision", "identity"].includes(item.category)) ? "incompatible" : "compatible" });
    return freeze({ policyVersion: POLICY_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION, riskPolicyVersion: RISK_POLICY_VERSION, gate, cycleIdentity: { projectId: gate.normalized.projectId, patternId: gate.normalized.patternId, evolutionId: gate.normalized.evolutionId, cycleId: gate.normalized.cycleId, acceptanceId: acceptance?.id || "", verificationId: gate.normalized.verification?.id || "", executionId: gate.normalized.execution?.id || "", decisionId: gate.normalized.decision?.id || "", revision: positiveInteger(acceptance?.revision), semanticRevision: positiveInteger(acceptance?.sourceVerificationRevision || acceptance?.revision), closureRevision: positiveInteger(record?.closureRevision || 1), predecessorClosureId: record?.predecessorClosureId || null, supersedesClosureId: record?.supersedesClosureId || null, sourceChainDigest: gate.sourceChainDigest, closureDigest: record?.digest || "" }, acceptanceReconciliation: reconciliation, closureCriteria: criteria, mandatoryCriteria: criteria.filter((item) => item.type === "mandatory"), conditionalCriteria: criteria.filter((item) => item.type === "conditional"), advisoryCriteria: criteria.filter((item) => item.type === "advisory"), conditionDisposition: conditions, evidenceReconciliation: evidence, riskReconciliation: risk, closureDisposition: disposition, outcome, status: statusForOutcome(outcome), chainValid: gate.chainValid, trust: gate.trust, staleProjection: gate.reasons.some((item) => item.category === "stale"), reasons, reasonCodes: reasons.map((item) => item.code) });
  }

  function sanitizedInput(input = {}) { return freeze(normalizeObject({ conditionEvidence: array(input.conditionEvidence), evidence: array(input.evidence), riskSignals: input.riskSignals || {}, nonAdoptionEvidence: input.nonAdoptionEvidence || null })); }
  function identityPayload(record) { return { projectId: record.projectId, patternId: record.patternId, calculationId: record.calculationId, evolutionId: record.evolutionId, cycleId: record.cycleId, sourceInitiationId: record.sourceInitiationId, sourceProposalId: record.sourceProposalId, sourceReviewId: record.sourceReviewId, sourceDecisionId: record.sourceDecisionId, sourceExecutionId: record.sourceExecutionId, sourceVerificationId: record.sourceVerificationId, sourceAcceptanceId: record.sourceAcceptanceId, sourceAcceptanceRevision: record.sourceAcceptanceRevision, sourceAcceptanceDigest: record.sourceAcceptanceDigest, sourceChainDigest: record.sourceChainDigest, policyVersion: record.closurePolicyVersion, evidencePolicyVersion: record.evidencePolicyVersion, riskPolicyVersion: record.riskPolicyVersion, reconciliationInput: normalizeObject(record.reconciliationInput), predecessorClosureId: record.predecessorClosureId, supersedesClosureId: record.supersedesClosureId, epoch: record.epoch, closureRevision: record.closureRevision }; }
  function semanticIdentityPayload(record) { const value = identityPayload(record); delete value.predecessorClosureId; delete value.supersedesClosureId; delete value.epoch; delete value.closureRevision; return value; }
  function calculateClosureIdentity(record) { return fingerprint(identityPayload(record)); }
  function calculateSemanticIdentity(record) { return fingerprint(semanticIdentityPayload(record)); }
  function digestPayload(record) { const contract = clone(record.closureContract); if (contract?.cycleIdentity) contract.cycleIdentity.closureDigest = ""; return { ...identityPayload(record), id: record.id, persistenceKind: record.persistenceKind, sourceSnapshots: normalizeObject(record.sourceSnapshots), sourceBinding: normalizeObject(record.sourceBinding), closureContract: normalizeObject(contract), lifecycle: record.lifecycle, status: record.status, outcome: record.outcome, risk: normalizeObject(record.risk), chainValidity: record.chainValidity, trust: record.trust, imported: record.imported, importedUnproven: record.importedUnproven, collision: record.collision, quarantined: record.quarantined, proofStatus: record.proofStatus, provenance: normalizeObject(record.provenance), revision: record.revision }; }
  function calculateClosureDigest(record) { return fingerprint(digestPayload(record)); }
  function refreshDerived(record) { const next = clone(record); next.status = lifecycleStatus(next); next.closureStatus = next.status; next.digest = calculateClosureDigest(next); next.closureDigest = next.digest; if (next.closureContract?.cycleIdentity) next.closureContract.cycleIdentity.closureDigest = next.digest; return freeze(next); }
  function createPatternEvolutionClosure(source = {}, input = {}) {
    const reconciliationInput = sanitizedInput(input); const contract = calculateClosureContract(source, reconciliationInput); const acceptance = contract.gate.normalized.acceptance;
    if (!acceptance) throw closureError("missing_source_acceptance", "A live terminal acceptance is required.", { reasons: contract.reasons });
    const timestamp = injectedTimestamp(input.now, acceptance.updatedAt); const epoch = positiveInteger(input.epoch) || 1; const binding = contract.gate.binding;
    const record = { id: "", closureId: "", kind: PROGRESS_KIND, type: PROGRESS_KIND, persistenceKind: PERSISTENCE_KIND, version: VERSION, schemaVersion: SCHEMA_VERSION, closurePolicyVersion: POLICY_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION, riskPolicyVersion: RISK_POLICY_VERSION, projectId: acceptance.projectId, patternId: acceptance.patternId, calculationId: acceptance.calculationId, evolutionId: contract.gate.normalized.evolutionId, cycleId: contract.gate.normalized.cycleId, sourceInitiationId: binding.initiation.id, sourceProposalId: binding.proposal.id, sourceReviewId: binding.review.id, sourceDecisionId: binding.decision.id, sourceExecutionId: binding.execution.id, sourceVerificationId: binding.verification.id, sourceAcceptanceId: binding.acceptance.id, sourceAcceptanceRevision: binding.acceptance.revision, sourceAcceptanceDigest: binding.acceptance.digest, sourceChainDigest: contract.gate.sourceChainDigest, sourceBinding: binding, sourceSnapshots: contract.gate.sourceSnapshots, sourceProof: { valid: contract.gate.valid, current: !contract.staleProjection, provenanceProven: contract.gate.trust === "proven", issues: contract.reasonCodes }, reconciliationInput, closureContract: contract, risk: contract.riskReconciliation, outcome: contract.outcome, lifecycle: "draft", status: contract.gate.valid ? "ready" : "pending", closureStatus: contract.gate.valid ? "ready" : "pending", chainValidity: contract.chainValid ? "valid" : "invalid", trust: contract.trust, reasons: contract.reasons, reasonCodes: contract.reasonCodes, imported: false, importedUnproven: false, collision: false, quarantined: false, proofStatus: contract.gate.valid ? "proven" : "unproven", provenance: { origin: "local", sourceAcceptanceId: acceptance.id, policyVersion: POLICY_VERSION }, predecessorClosureId: normalizeText(input.predecessorClosureId) || null, supersedesClosureId: normalizeText(input.supersedesClosureId) || null, closureRevision: positiveInteger(input.closureRevision) || 1, originalImport: input.originalImport ? snapshot(input.originalImport) : null, createdAt: timestamp, updatedAt: timestamp, revision: 1, epoch, identity: "", semanticIdentity: "", digest: "", closureDigest: "", audit: [{ event: "created", at: timestamp, revision: 1, sourceAcceptanceId: acceptance.id }] };
    record.identity = calculateClosureIdentity(record); record.semanticIdentity = calculateSemanticIdentity(record); record.id = normalizeText(input.id || input.closureId) || `pattern-evolution-closure:${record.identity.slice(8)}`; record.closureId = record.id; const refreshed = refreshDerived(record); const report = validatePatternEvolutionClosure(refreshed); if (!report.valid) throw closureError("closure_invalid", "Computed closure record is invalid.", { errors: report.errors }); return refreshed;
  }
  function validationResult(errors) { const unique = new Map(errors.map((item) => [`${item.code}\0${item.field || ""}`, item])); return freeze({ valid: unique.size === 0, errors: [...unique.values()].sort((a, b) => compare(a.code, b.code) || compare(a.field, b.field)) }); }
  function validatePatternEvolutionClosure(record) {
    const errors = []; const invalid = (code, field = null) => errors.push({ code, field }); try { canonicalize(record); } catch { invalid("corrupted_input"); return validationResult(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.persistenceKind !== PERSISTENCE_KIND || record.version !== VERSION || record.schemaVersion !== SCHEMA_VERSION || record.closurePolicyVersion !== POLICY_VERSION || record.evidencePolicyVersion !== EVIDENCE_POLICY_VERSION || record.riskPolicyVersion !== RISK_POLICY_VERSION) invalid("invalid_header");
    for (const field of ["id", "projectId", "patternId", "calculationId", "evolutionId", "cycleId", "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceDecisionId", "sourceExecutionId", "sourceVerificationId", "sourceAcceptanceId", "sourceAcceptanceDigest", "sourceChainDigest", "identity", "semanticIdentity", "digest", "closureDigest"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (record?.closureId !== record?.id || !LIFECYCLES.includes(record?.lifecycle) || !STATUSES.includes(record?.status) || record?.closureStatus !== record?.status || !OUTCOMES.includes(record?.outcome) || !RISK_LEVELS.includes(record?.risk?.level) || !["valid", "invalid"].includes(record?.chainValidity) || !["proven", "untrusted"].includes(record?.trust)) invalid("invalid_lifecycle_status_or_risk");
    if (!positiveInteger(record?.revision) || !positiveInteger(record?.epoch) || !positiveInteger(record?.closureRevision) || !positiveInteger(record?.sourceAcceptanceRevision) || !isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("invalid_revision");
    if (!record?.sourceSnapshots || !record?.sourceBinding || !record?.sourceProof || !record?.reconciliationInput || !record?.closureContract || !Array.isArray(record?.audit) || !Array.isArray(record?.reasons) || !Array.isArray(record?.reasonCodes)) invalid("invalid_structure");
    if (record?.sourceSnapshots && fingerprint({ sourceSnapshots: record.sourceSnapshots, binding: record.sourceBinding }) !== record.sourceChainDigest) invalid("source_chain_digest_mismatch");
    if (record?.sourceSnapshots?.acceptance && (record.sourceSnapshots.acceptance.id !== record.sourceAcceptanceId || digestOf(record.sourceSnapshots.acceptance) !== record.sourceAcceptanceDigest)) invalid("source_acceptance_snapshot_mismatch");
    if (calculateClosureIdentity(record) !== record?.identity) invalid("identity_mismatch"); if (calculateSemanticIdentity(record) !== record?.semanticIdentity) invalid("semantic_identity_mismatch"); if (lifecycleStatus(record) !== record?.status) invalid("derived_status_mismatch"); if (calculateClosureDigest(record) !== record?.digest || record?.closureDigest !== record?.digest || record?.closureContract?.cycleIdentity?.closureDigest !== record?.digest) invalid("digest_mismatch");
    if (record?.predecessorClosureId === record?.id || record?.supersedesClosureId === record?.id) invalid("predecessor_cycle"); if (terminalClosure(record) && record.lifecycle !== record.outcome) invalid("terminal_outcome_mismatch"); return validationResult(errors);
  }
  function requireRecord(record) { const report = validatePatternEvolutionClosure(record); if (!report.valid) throw closureError("corrupted_input", "Pattern evolution closure is corrupted.", { errors: report.errors }); }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw closureError("revision_conflict", "Closure revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw closureError("identity_conflict", "Closure identity changed."); }
  function transition(record, nextLifecycle, source, command = {}) {
    requireRecord(record); checkConcurrency(record, command); if (terminalClosure(record)) throw closureError("terminal_immutable", "Terminal closures are immutable."); if (!TRANSITIONS[record.lifecycle]?.includes(nextLifecycle)) throw closureError("invalid_transition", "Closure lifecycle transition is not allowlisted."); const contract = calculateClosureContract(source, record.reconciliationInput, record); if (OUTCOMES.includes(nextLifecycle) && record.lifecycle !== "reviewing") throw closureError("invalid_transition", "Terminal closure requires reconciliation, finalization, and review."); if (OUTCOMES.includes(nextLifecycle) && nextLifecycle !== contract.outcome) throw closureError("caller_outcome_rejected", "Terminal closure outcome is computed from live facts.", { expected: contract.outcome }); const timestamp = injectedTimestamp(command.now, record.updatedAt); const next = clone(record); next.lifecycle = nextLifecycle; next.closureContract = contract; next.outcome = contract.outcome; next.risk = contract.riskReconciliation; next.chainValidity = contract.chainValid ? "valid" : "invalid"; next.trust = contract.trust; next.sourceProof = { valid: contract.gate.valid, current: !contract.staleProjection, provenanceProven: contract.trust === "proven", issues: contract.reasonCodes }; next.reasons = contract.reasons; next.reasonCodes = contract.reasonCodes; next.revision += 1; next.updatedAt = timestamp; next.audit = [...array(next.audit), { event: nextLifecycle, at: timestamp, revision: next.revision }]; return refreshDerived(next);
  }
  function startReconciling(record, source, command = {}) { return transition(record, "reconciling", source, command); }
  function startFinalizing(record, source, command = {}) { return transition(record, "finalizing", source, command); }
  function startReviewing(record, source, command = {}) { return transition(record, "reviewing", source, command); }
  function finalizeClosure(record, source, command = {}) { const contract = calculateClosureContract(source, record.reconciliationInput, record); return transition(record, contract.outcome, source, command); }
  function projectPatternEvolutionClosure(record, source = {}) { requireRecord(record); const contract = calculateClosureContract(source, record.reconciliationInput, record); const stale = record.closureContract.staleProjection || contract.staleProjection || contract.gate.reasons.some((item) => ["stale", "missing"].includes(item.category)); if (!stale && contract.gate.valid && !record.importedUnproven && !record.collision && !record.quarantined) return freeze({ record, lifecycle: record.lifecycle, status: record.status, outcome: record.outcome, risk: record.risk, chainValidity: record.chainValidity, trust: record.trust, stale: false, contract, reasons: record.reasons }); const reasons = stableObjects([...contract.reasons, ...(record.importedUnproven ? [reason("closure_imported_unproven", "trust", "Imported closure requires local revalidation.")] : []), ...(record.collision ? [reason("closure_collision", "collision", "Closure identity is collided.")] : []), ...(record.quarantined ? [reason("closure_quarantined", "trust", "Closure is quarantined.")] : [])], "code"); return freeze({ record, lifecycle: record.lifecycle, status: "stale", outcome: record.outcome, risk: ["critical", "indeterminate"].includes(record.risk.level) ? record.risk : { ...record.risk, level: "indeterminate", accepted: false }, chainValidity: "invalid", trust: "untrusted", stale: true, contract, reasons }); }
  function classifyDuplicate(records, candidate) { const values = array(records).map(stateOf); const sameId = values.find((item) => item?.id === candidate?.id); if (sameId && canonicalize(sameId) === canonicalize(candidate)) return freeze({ status: "exact_duplicate", record: sameId }); if (sameId) return freeze({ status: "collision", record: sameId }); const sameIdentity = values.find((item) => item?.identity === candidate?.identity); if (sameIdentity) return freeze({ status: "identity_collision", record: sameIdentity }); const semantic = values.find((item) => item?.semanticIdentity === candidate?.semanticIdentity); if (semantic) { const successor = candidate?.predecessorClosureId === semantic.id && candidate?.supersedesClosureId === semantic.id && candidate.closureRevision > semantic.closureRevision; return freeze({ status: successor ? "successor" : terminalClosure(semantic) && terminalClosure(candidate) ? "duplicate_terminal" : "semantic_duplicate", record: semantic }); } return freeze({ status: "unique", record: null }); }
  function serializePatternEvolutionClosure(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternEvolutionClosure(value) { let parsed; try { parsed = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw closureError("malformed_record", "Closure payload is malformed."); } requireRecord(parsed); return freeze(parsed); }
  function safeNormalizePatternEvolutionClosure(value) { try { return freeze({ record: deserializePatternEvolutionClosure(value), corrupted: false, errors: [] }); } catch (error) { return freeze({ record: null, corrupted: true, errors: error?.details?.errors || [{ code: error?.code || "malformed_record", field: null }] }); } }
  function makeImportedPatternEvolutionClosureUnproven(record, options = {}) { requireRecord(record); const next = clone(record); next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.trust = "untrusted"; next.provenance = { ...next.provenance, origin: "import", importedDigest: record.digest }; next.sourceProof = { ...next.sourceProof, valid: false, current: false, provenanceProven: false, issues: stableStrings([...array(next.sourceProof?.issues), "imported_unproven"]) }; next.updatedAt = injectedTimestamp(options.now, record.updatedAt); next.revision += 1; next.audit = [...array(next.audit), { event: "imported_unproven", at: next.updatedAt, revision: next.revision }]; return refreshDerived(next); }
  function remapKnown(value, map, parentKey = "") { if (typeof value === "string") return REFERENCE_FIELDS.has(parentKey) && map.has(value) ? map.get(value) : value; if (Array.isArray(value)) return value.map((item) => remapKnown(item, map, parentKey)); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value)) result[key] = remapKnown(value[key], map, key); return result; } return value; }
  function remapPatternEvolutionClosure(record, referenceMap) { requireRecord(record); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {})); for (const key of map.keys()) if (["outcome", "status", "risk", "closureContract", "closureCriteria", "lifecycle", "trust", "digest"].includes(key)) throw closureError("forbidden_remap", "Only closure references may be remapped."); const protectedFacts = { outcome: record.outcome, status: record.status, lifecycle: record.lifecycle, risk: clone(record.risk), contract: clone(record.closureContract), chainValidity: record.chainValidity }; const next = remapKnown(clone(record), map); next.outcome = protectedFacts.outcome; next.status = protectedFacts.status; next.closureStatus = protectedFacts.status; next.lifecycle = protectedFacts.lifecycle; next.risk = protectedFacts.risk; next.closureContract = protectedFacts.contract; next.chainValidity = protectedFacts.chainValidity; next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.trust = "untrusted"; next.sourceProof = { ...next.sourceProof, valid: false, current: false, provenanceProven: false, issues: ["imported_unproven"] }; next.originalImport = snapshot({ originalImport: record.originalImport || record, originalDigest: record.digest }); next.sourceAcceptanceDigest = digestOf(next.sourceSnapshots.acceptance); next.sourceBinding.acceptance.digest = next.sourceAcceptanceDigest; next.sourceChainDigest = fingerprint({ sourceSnapshots: next.sourceSnapshots, binding: next.sourceBinding }); next.identity = calculateClosureIdentity(next); next.semanticIdentity = calculateSemanticIdentity(next); next.id = map.get(record.id) || `pattern-evolution-closure:${next.identity.slice(8)}`; next.closureId = next.id; return refreshDerived(next); }
  function importPatternEvolutionClosure(existing, serialized, options = {}) { let parsed; try { parsed = deserializePatternEvolutionClosure(serialized); } catch (error) { return freeze({ status: "malformed", changed: false, record: null, quarantine: { reasonCode: error?.code || "malformed_record" } }); } const candidate = options.referenceMap ? remapPatternEvolutionClosure(parsed, options.referenceMap) : parsed; const duplicate = classifyDuplicate(existing, candidate); if (["collision", "identity_collision"].includes(duplicate.status)) return freeze({ status: "collision", changed: false, record: null, quarantine: { reasonCode: "PATTERN_EVOLUTION_CLOSURE_COLLISION" } }); if (["exact_duplicate", "duplicate_terminal"].includes(duplicate.status)) return freeze({ ...duplicate, changed: false }); return freeze({ status: "imported_unproven", changed: true, record: makeImportedPatternEvolutionClosureUnproven(candidate, options) }); }
  function revalidatePatternEvolutionClosure(record, source, command = {}) { requireRecord(record); const liveSource = { ...source, closures: array(source.closures).filter((item) => stateOf(item)?.id !== record.id) }; return createPatternEvolutionClosure(liveSource, { ...clone(record.reconciliationInput), now: command.now || record.updatedAt, epoch: positiveInteger(command.epoch) || record.epoch + 1, closureRevision: record.closureRevision + 1, predecessorClosureId: record.id, supersedesClosureId: record.id, originalImport: { originalImport: record.originalImport || record, sourceSnapshots: record.sourceSnapshots } }); }
  async function loadSource(repository, projectId, acceptanceId = null) { const acceptanceRecord = acceptanceId ? await repository.getPatternEvolutionAcceptance(projectId, acceptanceId) : await repository.getLatestPatternEvolutionAcceptance(projectId); if (!acceptanceRecord) return freeze({ projectId, acceptance: null, verification: null, execution: null, decision: null, review: null, proposal: null, initiation: null, closures: [] }); const chain = await repository.getPatternEvolutionAcceptanceSourceChain(projectId, acceptanceRecord.state.id, acceptanceRecord.state.calculationId); const closures = repository.listPatternEvolutionClosures ? await repository.listPatternEvolutionClosures(projectId, acceptanceRecord.state.calculationId) : []; return freeze({ projectId, patternId: acceptanceRecord.state.patternId, calculationId: acceptanceRecord.state.calculationId, evolutionId: acceptanceRecord.state.sourceInitiationId, cycleId: acceptanceRecord.state.sourceInitiationId, acceptance: acceptanceRecord.state, verification: stateOf(chain.verification), execution: stateOf(chain.execution), decision: stateOf(chain.decision), review: stateOf(chain.review), proposal: stateOf(chain.proposal), initiation: stateOf(chain.initiation), closures: closures.map((item) => item.state) }); }
  async function createForProject(repository, projectId, input = {}) { const source = await loadSource(repository, projectId, input.acceptanceId); const all = await repository.listPatternEvolutionClosures(projectId, source.calculationId); const record = createPatternEvolutionClosure(source, { ...input, epoch: positiveInteger(input.epoch) || all.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1 }); const duplicate = classifyDuplicate(all, record); if (["exact_duplicate", "duplicate_terminal", "semantic_duplicate"].includes(duplicate.status)) return freeze({ closureRecord: all.find((entry) => entry.state?.id === duplicate.record?.id) || null, rawClosure: duplicate.record, source, duplicate: true }); if (["collision", "identity_collision"].includes(duplicate.status)) throw closureError("closure_collision", "Closure identity collision detected."); const stored = await repository.savePatternEvolutionClosure(projectId, record, { timestamp: record.updatedAt }); return freeze({ closureRecord: stored, rawClosure: stored.state, source, duplicate: false }); }
  async function readForProject(repository, projectId, closureId = null, acceptanceId = null) { const progress = await repository.getPatternEvolutionClosure(projectId, closureId, null, acceptanceId); if (!progress) return freeze({ closureRecord: null, closure: null, source: null, projection: null }); const source = await loadSource(repository, projectId, progress.state.sourceAcceptanceId); return freeze({ closureRecord: progress, closure: progress.state, source, projection: projectPatternEvolutionClosure(progress.state, source) }); }

  const api = Object.freeze({ VERSION, SCHEMA_VERSION, POLICY_VERSION, EVIDENCE_POLICY_VERSION, RISK_POLICY_VERSION, PROGRESS_KIND, PERSISTENCE_KIND, SOURCE_KIND, ACTIVE_LIFECYCLES, OUTCOMES, TERMINAL_LIFECYCLES, LIFECYCLES, STATUSES, STATUS_PRECEDENCE, RISK_LEVELS, CRITERION_TYPES, CRITERION_STATES, CONDITION_STATES, EVIDENCE_STATES, TRANSITIONS, REFERENCE_FIELDS, CHAIN, PatternEvolutionClosureError, canonicalize, fingerprint, normalizeText, normalizeObject, stableStrings, stableObjects, snapshot, normalizedSource, calculateLiveChainGate, calculateCriteria, calculateConditionDisposition, calculateEvidenceReconciliation, calculateRiskReconciliation, calculateClosureContract, computeOutcome, statusForOutcome, lifecycleStatus, identityPayload, semanticIdentityPayload, calculateClosureIdentity, calculateSemanticIdentity, digestPayload, calculateClosureDigest, createPatternEvolutionClosure, createClosure: createPatternEvolutionClosure, validatePatternEvolutionClosure, transition, startReconciling, startFinalizing, startReviewing, finalizeClosure, projectPatternEvolutionClosure, classifyDuplicate, serializePatternEvolutionClosure, deserializePatternEvolutionClosure, safeNormalizePatternEvolutionClosure, makeImportedPatternEvolutionClosureUnproven, remapPatternEvolutionClosure, importPatternEvolutionClosure, revalidatePatternEvolutionClosure, loadSource, createForProject, readForProject });
  globalObject.YarnAIPatternEvolutionClosure = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
