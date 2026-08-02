"use strict";

(function initializePatternEvolutionAcceptance(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const POLICY_VERSION = "pattern-evolution-acceptance/v1";
  const EVIDENCE_POLICY_VERSION = "pattern-evolution-acceptance-evidence/v1";
  const RISK_POLICY_VERSION = "pattern-evolution-acceptance-risk/v1";
  const PROGRESS_KIND = "PATTERN_EVOLUTION_ACCEPTANCE";
  const SOURCE_KIND = "PATTERN_EVOLUTION_EXECUTION_VERIFICATION";
  const LIFECYCLES = Object.freeze([
    "draft", "assessing", "deliberating", "reviewing", "accepted",
    "accepted_with_conditions", "revision_required", "evidence_required",
    "rollback_required", "rejected", "blocked", "failed", "cancelled", "stale",
  ]);
  const TERMINAL_LIFECYCLES = Object.freeze([
    "accepted", "accepted_with_conditions", "revision_required", "evidence_required",
    "rollback_required", "rejected", "blocked", "failed", "cancelled",
  ]);
  const ACTIVE_LIFECYCLES = Object.freeze(["draft", "assessing", "deliberating", "reviewing"]);
  const VERDICTS = Object.freeze([
    "accepted", "accepted_with_conditions", "revision_required", "evidence_required",
    "rollback_required", "rejected", "blocked", "failed", "cancelled",
  ]);
  const STATUSES = Object.freeze([
    "pending", "ready", "in_progress", "accepted", "accepted_with_conditions",
    "require_revision", "require_evidence", "require_rollback", "rejected",
    "blocked", "failed", "cancelled", "stale",
  ]);
  const STATUS_PRECEDENCE = Object.freeze([
    "stale", "failed", "require_rollback", "blocked", "require_evidence",
    "require_revision", "rejected", "cancelled", "accepted_with_conditions",
    "accepted", "in_progress", "ready", "pending",
  ]);
  const RISK_LEVELS = Object.freeze(["negligible", "low", "moderate", "high", "critical", "indeterminate"]);
  const CRITERION_TYPES = Object.freeze(["mandatory", "conditional", "advisory"]);
  const CRITERION_RESULTS = Object.freeze(["satisfied", "unsatisfied", "unknown", "conflicting", "not_applicable"]);
  const CONDITION_CATEGORIES = Object.freeze([
    "pre_acceptance", "acceptance", "post_acceptance_obligation", "promotion_prerequisite",
    "blocking", "rollback_triggering",
  ]);
  const EVIDENCE_STATES = Object.freeze(["missing", "malformed", "untrusted", "conflicting", "insufficient", "valid"]);
  const TRANSITIONS = Object.freeze({
    draft: Object.freeze(["assessing", "cancelled", "stale"]),
    assessing: Object.freeze(["deliberating", "evidence_required", "blocked", "failed", "cancelled", "stale"]),
    deliberating: Object.freeze(["reviewing", "revision_required", "evidence_required", "rollback_required", "rejected", "blocked", "failed", "cancelled", "stale"]),
    reviewing: Object.freeze([...TERMINAL_LIFECYCLES, "stale"]),
  });
  const REFERENCE_FIELDS = new Set([
    "id", "acceptanceId", "projectId", "patternId", "calculationId", "sourceInitiationId",
    "sourceProposalId", "sourceReviewId", "sourceDecisionId", "sourceExecutionId",
    "sourceVerificationId", "predecessorAcceptanceId", "supersedesAcceptanceId",
    "evidenceId", "evidenceIds", "evidenceRefs", "criterionId", "criterionIds",
    "conditionId", "conditionIds", "bindingId", "ownerId", "references",
  ]);

  class PatternEvolutionAcceptanceError extends Error {
    constructor(code, message, details = null) {
      super(message);
      this.name = "PatternEvolutionAcceptanceError";
      this.code = code;
      this.userMessage = message;
      this.details = details;
    }
  }

  const acceptanceError = (code, message, details) => new PatternEvolutionAcceptanceError(code, message, details);
  const array = (value) => Array.isArray(value) ? value : [];
  const clone = (value) => value === undefined ? undefined : globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value));
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function lower(value) { return normalizeText(value).toLowerCase(); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value); }
  function injectedTimestamp(...values) { const result = values.find(isTimestamp); if (!result) throw acceptanceError("timestamp_required", "An injected source timestamp is required."); return result; }
  function canonicalize(value, seen = new Set()) {
    if (value === undefined) return "null";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (seen.has(value)) throw acceptanceError("cyclic_input", "Cyclic acceptance data is not supported.");
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
    if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) { const result = {}; for (const key of Object.keys(value).sort(compare)) result[key] = normalizeObject(value[key]); return result; }
    return value;
  }
  function stableStrings(values) { return [...new Set(array(values).map((value) => normalizeText(typeof value === "object" ? value?.id || value?.code || value?.key : value)).filter(Boolean))].sort(compare); }
  function stableObjects(values, key = "id") { const unique = new Map(); for (const item of array(values)) { const value = normalizeObject(clone(item)); const identity = normalizeText(value?.[key] || value?.id || value?.key || value?.code) || fingerprint(value); if (!unique.has(identity)) unique.set(identity, value); } return [...unique.values()].sort((a, b) => compare(a?.[key] || a?.id || a?.code || canonicalize(a), b?.[key] || b?.id || b?.code || canonicalize(b))); }
  function snapshot(value) { return freeze(normalizeObject(clone(value || {}))); }
  function idOf(value, ...fields) { for (const field of ["id", ...fields]) { const id = normalizeText(value?.[field]); if (id) return id; } return ""; }
  function reason(code, category, message, references = []) { return freeze({ code, category, message, references: stableStrings(references) }); }
  function addReason(collection, code, category, message, references = []) { collection.push(reason(code, category, message, references)); }
  function metric(values, accepted = ["satisfied", "not_applicable", "valid", "passed"]) { const entries = array(values); const complete = entries.filter((item) => accepted.includes(item.result || item.state || item.status)).length; return freeze({ required: entries.length, complete, missing: entries.length - complete, ratio: entries.length ? complete / entries.length : 1, satisfied: complete === entries.length }); }

  function normalizedSource(source = {}) {
    const verification = source.verification || source.sourceVerification || (source.kind === SOURCE_KIND ? source : null);
    return freeze({
      projectId: normalizeText(source.projectId || verification?.projectId), patternId: normalizeText(source.patternId || verification?.patternId), calculationId: normalizeText(source.calculationId || verification?.calculationId),
      verification: verification ? clone(verification) : null,
      execution: source.execution ? clone(source.execution?.state || source.execution) : null,
      decision: source.decision ? clone(source.decision?.state || source.decision) : null,
      review: source.review ? clone(source.review?.state || source.review) : null,
      proposal: source.proposal ? clone(source.proposal?.state || source.proposal) : null,
      initiation: source.initiation ? clone(source.initiation?.state || source.initiation) : null,
      verifications: array(source.verifications).map((item) => clone(item?.state || item)),
      acceptances: array(source.acceptances).map((item) => clone(item?.state || item)),
      quarantinedVerificationIds: stableStrings(source.quarantinedVerificationIds),
    });
  }
  function verificationDigest(value) { const api = globalObject.YarnAIPatternEvolutionExecutionVerification; return api?.calculateVerificationDigest?.(value) || normalizeText(value?.digest) || fingerprint(snapshot(value)); }
  function bindingEntry(value, idField, digest) { return freeze({ id: idOf(value, idField), revision: positiveInteger(value?.revision), digest }); }
  function calculateSourceGate(source = {}, record = null) {
    const normalized = normalizedSource(source); const verification = normalized.verification; const reasons = []; const verificationApi = globalObject.YarnAIPatternEvolutionExecutionVerification;
    if (!verification) addReason(reasons, "missing_source_verification", "source", "A live execution verification is required.");
    const artifacts = [["initiation", "PATTERN_EVOLUTION_INITIATION"], ["proposal", "PATTERN_EVOLUTION_PROPOSAL"], ["review", "PATTERN_EVOLUTION_PROPOSAL_REVIEW"], ["decision", "PATTERN_EVOLUTION_DECISION"], ["execution", "PATTERN_EVOLUTION_EXECUTION"]];
    for (const [name, kind] of artifacts) { const item = normalized[name]; if (!item) addReason(reasons, `missing_source_${name}`, "source", `The live ${name} record is required.`); else if (item.kind !== kind || item.type !== kind) addReason(reasons, `${name}_kind_invalid`, "integrity", `The live ${name} kind is invalid.`); }
    let chainGate = null;
    if (verification) {
      if (verification.kind !== SOURCE_KIND || verification.type !== SOURCE_KIND || verification.version !== 1 || verification.schemaVersion !== 1) addReason(reasons, "verification_header_invalid", "integrity", "The source verification header is invalid.");
      const report = verificationApi?.validatePatternEvolutionExecutionVerification?.(verification);
      if (!report?.valid) addReason(reasons, "verification_domain_invalid", "integrity", "The source verification failed local domain validation.");
      if (verification.digest !== verificationDigest(verification)) addReason(reasons, "verification_digest_mismatch", "integrity", "The source verification digest is invalid.");
      if (!verificationApi?.TERMINAL_LIFECYCLES?.includes(verification.lifecycle)) addReason(reasons, "verification_non_terminal", "source", "Only a terminal verification may be assessed.");
      if (!verificationApi?.VERDICTS?.includes(verification.verdict)) addReason(reasons, "verification_verdict_invalid", "integrity", "The source verification verdict is unsupported.");
      if (verification.lifecycle === "stale" || verification.status === "stale") addReason(reasons, "verification_stale", "stale", "The source verification is stale.");
      if (verification.importedUnproven || verification.proofStatus === "imported-unproven") addReason(reasons, "verification_imported_unproven", "trust", "Imported verification truth is not locally proven.");
      if (verification.collision) addReason(reasons, "verification_collision", "trust", "The source verification has an identity collision.");
      if (verification.quarantined || normalized.quarantinedVerificationIds.includes(verification.id)) addReason(reasons, "verification_quarantined", "trust", "The source verification is quarantined.");
      if (verification.sourceProof?.valid !== true || verification.sourceProof?.current !== true || verification.sourceProof?.provenanceProven !== true) addReason(reasons, "verification_provenance_unproven", "trust", "The source verification provenance is not current and proven.");
      if (verification.sourceExecutionId !== normalized.execution?.id || verification.sourceExecutionRevision !== normalized.execution?.revision || verification.sourceExecutionDigest !== (normalized.execution ? globalObject.YarnAIPatternEvolutionExecution?.calculateExecutionDigest?.(normalized.execution) || normalized.execution.digest : "")) addReason(reasons, "verification_execution_binding_mismatch", "integrity", "Verification does not bind the live execution revision.");
      for (const [name] of artifacts) if (normalized[name] && canonicalize(verification.sourceSnapshots?.[name]) !== canonicalize(snapshot(normalized[name]))) addReason(reasons, `${name}_snapshot_mismatch`, "stale", `The verification ${name} snapshot differs from the live record.`);
      if (verificationApi?.calculateSourceGate) { chainGate = verificationApi.calculateSourceGate({ ...normalized, verification: undefined }); if (!chainGate.valid) for (const item of chainGate.reasons) addReason(reasons, `chain_${item.code}`, item.category === "rollback" ? "integrity" : item.category, item.message, item.references); }
      const sameId = normalized.verifications.filter((item) => item?.id === verification.id);
      if (sameId.some((item) => canonicalize(item) !== canonicalize(verification))) addReason(reasons, "verification_identity_collision", "trust", "Verification identity collides with different content.");
      if (normalized.verifications.some((item) => item?.id !== verification.id && (item?.predecessorVerificationId === verification.id || item?.supersedesVerificationId === verification.id || item?.semanticIdentity === verification.semanticIdentity && positiveInteger(item?.revision) > positiveInteger(verification.revision)))) addReason(reasons, "verification_superseded", "stale", "A later verification supersedes this revision.");
      if (normalized.verifications.some((item) => item?.id !== verification.id && positiveInteger(item?.sourceExecutionRevision) > positiveInteger(verification.sourceExecutionRevision) && item?.sourceExecutionId !== verification.sourceExecutionId)) addReason(reasons, "foreign_or_future_verification", "stale", "A foreign or future verification revision cannot prove this source.");
    }
    const allArtifacts = [verification, normalized.execution, normalized.decision, normalized.review, normalized.proposal, normalized.initiation].filter(Boolean);
    if (normalized.projectId && allArtifacts.some((item) => item.projectId !== normalized.projectId)) addReason(reasons, "project_binding_mismatch", "integrity", "Canonical chain project bindings differ.");
    if (normalized.patternId && allArtifacts.some((item) => item.patternId !== normalized.patternId)) addReason(reasons, "pattern_binding_mismatch", "integrity", "Canonical chain pattern bindings differ.");
    if (record && verification && (record.sourceVerificationId !== verification.id || record.sourceVerificationRevision !== verification.revision || record.sourceVerificationDigest !== verificationDigest(verification))) addReason(reasons, "acceptance_source_binding_mismatch", "integrity", "Acceptance source binding differs from the live verification.");
    if (verification && normalized.acceptances.some((item) => item?.sourceVerificationId === verification.id && TERMINAL_LIFECYCLES.includes(item.lifecycle) && (!record || item.id !== record.id))) addReason(reasons, "duplicate_terminal_acceptance", "duplicate", "A terminal acceptance already exists for this verification.");
    const stable = stableObjects(reasons, "code");
    const binding = freeze({
      initiation: bindingEntry(normalized.initiation, "initiationId", normalizeText(normalized.initiation?.identity || normalized.initiation?.sourceDigest)),
      proposal: bindingEntry(normalized.proposal, "proposalId", normalizeText(normalized.proposal?.identity || normalized.proposal?.digest)),
      review: bindingEntry(normalized.review, "reviewId", normalizeText(normalized.review?.digest || normalized.review?.identity)),
      decision: bindingEntry(normalized.decision, "decisionId", normalizeText(normalized.decision?.digest || normalized.decision?.identity)),
      execution: bindingEntry(normalized.execution, "executionId", normalizeText(normalized.execution?.digest)),
      verification: bindingEntry(verification, "verificationId", verification ? verificationDigest(verification) : ""),
    });
    return freeze({ valid: stable.length === 0, eligible: stable.length === 0 && ["verified", "verified_with_conditions"].includes(verification?.verdict), reasons: stable, normalized, binding, chainGate });
  }

  function criterion(id, category, type, result, evidenceRefs = [], reasonCodes = []) { return freeze({ id, category, type: CRITERION_TYPES.includes(type) ? type : "mandatory", result: CRITERION_RESULTS.includes(result) ? result : "unknown", evidenceRefs: stableStrings(evidenceRefs), reasonCodes: stableStrings(reasonCodes) }); }
  function normalizeCriteria(source, gate, input = {}) {
    const verification = gate.normalized.verification; const contract = verification?.verificationContract || {}; const passed = (items) => array(items).every((item) => ["passed", "not_applicable"].includes(item.result));
    const sourceVerdict = verification?.verdict; const base = [
      criterion("source-chain-valid", "source_verification", "mandatory", gate.valid ? "satisfied" : "unsatisfied", [verification?.id]),
      criterion("decision-authorized", "decision_conformance", "mandatory", gate.normalized.decision?.lifecycle === "authorized" && gate.normalized.decision?.outcome === "authorize" ? "satisfied" : "unsatisfied"),
      criterion("execution-conforms", "execution_conformance", "mandatory", passed(contract.operationChecks) && passed(contract.outputChecks) ? "satisfied" : "unsatisfied"),
      criterion("verification-confirms", "verification_conformance", "mandatory", ["verified", "verified_with_conditions"].includes(sourceVerdict) ? "satisfied" : "unsatisfied", [verification?.id]),
      criterion("decision-conditions-satisfied", "conditions", "mandatory", passed(contract.mandatoryConditionChecks) ? "satisfied" : "unsatisfied"),
      criterion("residual-risks-known", "risk", "mandatory", verification?.risk?.level ? "satisfied" : "unknown"),
      criterion("rollback-ready", "rollback", "conditional", passed(contract.rollbackChecks) ? "satisfied" : "unsatisfied"),
      criterion("migration-ready", "migration", "conditional", passed(contract.migrationChecks) ? "satisfied" : "unsatisfied"),
      criterion("compatibility-passed", "compatibility", "mandatory", passed(contract.compatibilityChecks) ? "satisfied" : "unsatisfied"),
      criterion("postconditions-proven", "postconditions", "mandatory", passed(contract.postconditionChecks) ? "satisfied" : "unknown"),
      criterion("evidence-sufficient", "evidence", "mandatory", passed(contract.evidenceChecks) ? "satisfied" : "unknown"),
      criterion("governance-authorized", "governance", "mandatory", gate.normalized.decision?.outcome === "authorize" ? "satisfied" : "unsatisfied"),
      criterion("no-critical-findings", "findings", "mandatory", array(contract.unresolvedFindings).some((item) => ["rollback", "integrity"].includes(item.category)) ? "unsatisfied" : "satisfied"),
      criterion("no-forbidden-operations", "scope", "mandatory", array(contract.reasonCodes || verification?.reasonCodes).some((code) => /forbidden|unauthorized/.test(code)) ? "unsatisfied" : "satisfied"),
      criterion("integrity-proven", "integrity", "mandatory", passed(contract.integrityChecks) ? "satisfied" : "conflicting"),
      criterion("provenance-proven", "provenance", "mandatory", passed(contract.provenanceChecks) ? "satisfied" : "unknown"),
    ];
    const supplied = array(input.acceptanceCriteria).map((item, index) => criterion(normalizeText(item?.id) || `criterion:${index + 1}`, lower(item?.category) || "supplementary", lower(item?.type), lower(item?.result), item?.evidenceRefs, item?.reasonCodes));
    return stableObjects([...base, ...supplied], "id");
  }
  function normalizeConditions(source, input = {}) {
    const verification = source.verification; const values = [...array(verification?.conditions), ...array(input.conditions)];
    if (verification?.verdict === "verified_with_conditions" && values.length === 0) values.push({ id: "condition:verified-with-conditions", category: "post_acceptance_obligation", criticality: "non_critical", ownerId: "governance", bindingId: verification.id, evidenceRequirements: [], state: "open" });
    return stableObjects(values.map((item, index) => ({
      id: normalizeText(item?.id) || `condition:${index + 1}`,
      category: CONDITION_CATEGORIES.includes(lower(item?.category)) ? lower(item.category) : "blocking",
      criticality: ["non_critical", "security_critical", "integrity_critical"].includes(lower(item?.criticality)) ? lower(item.criticality) : "non_critical",
      ownerId: normalizeText(item?.ownerId || item?.owner), bindingId: normalizeText(item?.bindingId || item?.binding || verification?.id),
      evidenceRequirements: stableStrings(item?.evidenceRequirements), state: ["satisfied", "open", "triggered", "unknown", "conflicting"].includes(lower(item?.state || item?.status)) ? lower(item?.state || item?.status) : "unknown",
      explanation: normalizeText(item?.explanation),
    })), "id");
  }
  function normalizeEvidence(source, input, criteria, conditions) {
    const verification = source.verification; const ids = { projectId: source.projectId, patternId: source.patternId, executionId: source.execution?.id, verificationId: verification?.id };
    const supplied = array(input.evidence); const values = supplied.length ? supplied : verification ? [{ id: `evidence:verification:${verification.id}`, payload: { verificationId: verification.id, verificationDigest: verification.digest }, digest: fingerprint({ verificationId: verification.id, verificationDigest: verification.digest }), provenance: { proofStatus: "proven", origin: "local" }, projectId: ids.projectId, patternId: ids.patternId, executionId: ids.executionId, verificationId: ids.verificationId, verificationRevision: verification.revision, criterionIds: criteria.filter((item) => item.type === "mandatory").map((item) => item.id), conditionIds: [] }] : [];
    const criterionIds = new Set(criteria.map((item) => item.id)); const conditionIds = new Set(conditions.map((item) => item.id));
    return stableObjects(values.map((item, index) => {
      const id = normalizeText(item?.id || item?.evidenceId) || `evidence:${index + 1}`; const payload = normalizeObject(item?.payload || {}); const evidenceDigest = normalizeText(item?.digest || item?.evidenceDigest); const refs = { criterionIds: stableStrings(item?.criterionIds), conditionIds: stableStrings(item?.conditionIds) }; let state = "valid";
      if (!normalizeText(item?.id || item?.evidenceId)) state = "missing";
      else if (!evidenceDigest || evidenceDigest !== fingerprint(payload)) state = "malformed";
      else if (item?.provenance?.quarantined || item?.collision) state = "conflicting";
      else if (item?.provenance?.proofStatus !== "proven" || item?.provenance?.origin === "import" || item?.importedUnproven) state = "untrusted";
      else if (item?.projectId !== ids.projectId || item?.patternId !== ids.patternId || item?.executionId !== ids.executionId || item?.verificationId !== ids.verificationId) state = "untrusted";
      else if (!positiveInteger(item?.verificationRevision) || item.verificationRevision > verification.revision) state = "untrusted";
      else if (refs.criterionIds.some((value) => !criterionIds.has(value)) || refs.conditionIds.some((value) => !conditionIds.has(value))) state = "conflicting";
      else if (!refs.criterionIds.length && !refs.conditionIds.length) state = "insufficient";
      return freeze({ id, digest: evidenceDigest, state, projectId: item?.projectId, patternId: item?.patternId, executionId: item?.executionId, verificationId: item?.verificationId, verificationRevision: positiveInteger(item?.verificationRevision), criterionIds: refs.criterionIds, conditionIds: refs.conditionIds, provenance: normalizeObject(item?.provenance || {}) });
    }), "id");
  }
  function calculateRiskAssessment(source, gate, criteria, conditions, evidence, input = {}) {
    const verificationLevel = lower(source.verification?.risk?.level); const signals = normalizeObject(input.riskSignals || {}); const reasonCodes = stableStrings(source.verification?.reasonCodes); const critical = signals.securityCritical === true || signals.integrityCritical === true || reasonCodes.some((code) => /critical_risk|forbidden_observed_operation|unauthorized_output/.test(code)); const indeterminate = !verificationLevel || criteria.some((item) => item.type === "mandatory" && item.result === "unknown" && item.category === "risk"); const high = verificationLevel === "high" || signals.destructiveImpact === true || signals.schemaImpact === true || signals.dataIntegrityRisk === true; let level = critical || verificationLevel === "critical" ? "critical" : indeterminate ? "indeterminate" : high ? "high" : verificationLevel === "moderate" ? "moderate" : verificationLevel === "low" ? "low" : "negligible";
    const rollbackRequired = level === "critical" || signals.rollbackRequired === true || conditions.some((item) => item.category === "rollback_triggering" && item.state === "triggered");
    const accepted = gate.valid && ["negligible", "low", "moderate"].includes(level) && !rollbackRequired && evidence.every((item) => item.state === "valid");
    return freeze({ level, accepted, rollbackRequired, policyVersion: RISK_POLICY_VERSION, sourceLevel: verificationLevel || "unknown", signals, controlsComplete: criteria.filter((item) => item.category === "risk").every((item) => ["satisfied", "not_applicable"].includes(item.result)), authorizationValid: gate.normalized.decision?.outcome === "authorize" });
  }
  function assessment(status, details = {}) { return freeze({ status, ...normalizeObject(details) }); }
  function computeVerdict(gate, verification, criteria, conditions, evidence, risk, input, reasons) {
    const sourceVerdict = verification?.verdict;
    const inherited = ({ revision_required: "revision_required", evidence_required: "evidence_required", rollback_required: "rollback_required", blocked: "blocked", failed: "failed", cancelled: "cancelled" })[sourceVerdict];
    if (inherited) return inherited;
    const codes = new Set(gate.reasons.map((item) => item.code));
    if (!gate.valid && [...codes].some((code) => /domain_invalid|digest_mismatch|binding_mismatch|snapshot_mismatch|kind_invalid|header_invalid/.test(code))) return "failed";
    if (!gate.valid) return "blocked";
    if (risk.rollbackRequired || input.rollbackReadinessAssessment?.required === true && input.rollbackReadinessAssessment?.status !== "ready") return "rollback_required";
    if (input.cancelled === true) return "cancelled";
    if (input.governanceAssessment?.status === "denied" || input.benefitAssessment?.status === "unfavorable" || input.costAssessment?.status === "unacceptable" || input.compatibilityAssessment?.status === "incompatible") return "rejected";
    if (input.authorizationAssessment?.status === "missing" || input.provenanceAssessment?.status === "untrusted") return "blocked";
    if (evidence.some((item) => ["missing", "malformed", "untrusted", "conflicting", "insufficient"].includes(item.state)) || criteria.some((item) => item.type === "mandatory" && item.result === "unknown")) return "evidence_required";
    if (criteria.some((item) => item.type === "mandatory" && ["unsatisfied", "conflicting"].includes(item.result)) || conditions.some((item) => ["pre_acceptance", "acceptance", "blocking"].includes(item.category) && item.state !== "satisfied")) return "revision_required";
    if (risk.level === "high" || !risk.accepted) return "rejected";
    const residual = conditions.filter((item) => item.state !== "satisfied");
    if (sourceVerdict === "verified_with_conditions" || residual.length) {
      const safe = residual.length > 0 && residual.every((item) => ["post_acceptance_obligation", "promotion_prerequisite"].includes(item.category) && item.criticality === "non_critical" && item.ownerId && item.bindingId && !["triggered", "conflicting"].includes(item.state));
      if (safe) return "accepted_with_conditions";
      addReason(reasons, "conditions_not_acceptance_safe", "revision", "Residual conditions are not safe for conditional acceptance.", residual.map((item) => item.id));
      return "revision_required";
    }
    return "accepted";
  }
  function calculateAcceptanceContract(source = {}, input = {}) {
    const gate = calculateSourceGate(source); const normalized = gate.normalized; const reasons = [...gate.reasons]; const criteria = normalizeCriteria(normalized, gate, input); const conditions = normalizeConditions(normalized, input); const evidence = normalizeEvidence(normalized, input, criteria, conditions); const risk = calculateRiskAssessment(normalized, gate, criteria, conditions, evidence, input);
    for (const item of criteria) if (item.type === "mandatory" && item.result !== "satisfied" && item.result !== "not_applicable") addReason(reasons, `criterion_${item.result}`, item.category === "integrity" ? "integrity" : item.result === "unknown" ? "evidence" : "revision", `Mandatory criterion ${item.id} is ${item.result}.`, [item.id]);
    for (const item of evidence) if (item.state !== "valid") addReason(reasons, `evidence_${item.state}`, item.state === "conflicting" ? "integrity" : "evidence", `Acceptance evidence ${item.id} is ${item.state}.`, [item.id]);
    if (risk.level === "critical") addReason(reasons, "critical_residual_risk", "rollback", "Critical residual risk cannot be accepted.");
    if (risk.level === "indeterminate") addReason(reasons, "indeterminate_mandatory_risk", "evidence", "Mandatory risk is indeterminate.");
    const decisionConformance = assessment(criteria.find((item) => item.id === "decision-authorized")?.result, { sourceDecisionId: normalized.decision?.id, authorizedScope: normalized.decision?.affectedChangeIds || [] });
    const executionConformance = assessment(criteria.find((item) => item.id === "execution-conforms")?.result, { sourceExecutionId: normalized.execution?.id, operations: normalized.verification?.verificationContract?.operationChecks || [] });
    const verificationConformance = assessment(criteria.find((item) => item.id === "verification-confirms")?.result, { sourceVerificationId: normalized.verification?.id, sourceVerdict: normalized.verification?.verdict });
    const groups = {
      sourceVerificationAssessment: assessment(gate.valid ? "satisfied" : "unsatisfied", { reasonCodes: gate.reasons.map((item) => item.code) }), decisionConformanceAssessment: decisionConformance, executionConformanceAssessment: executionConformance, verificationConformanceAssessment: verificationConformance,
      acceptanceCriteria: criteria, mandatoryConditions: conditions.filter((item) => ["pre_acceptance", "acceptance", "blocking"].includes(item.category)), residualConditions: conditions.filter((item) => ["post_acceptance_obligation", "promotion_prerequisite"].includes(item.category)), unresolvedFindings: stableObjects(reasons, "code"), riskAcceptance: risk,
      benefitAssessment: assessment(input.benefitAssessment?.status || "favorable", input.benefitAssessment), costAssessment: assessment(input.costAssessment?.status || "acceptable", input.costAssessment), compatibilityAssessment: assessment(input.compatibilityAssessment?.status || (criteria.find((item) => item.id === "compatibility-passed")?.result === "satisfied" ? "compatible" : "unproven"), input.compatibilityAssessment),
      migrationReadinessAssessment: assessment(input.migrationReadinessAssessment?.status || (criteria.find((item) => item.id === "migration-ready")?.result === "satisfied" ? "ready" : "not_ready"), input.migrationReadinessAssessment), rollbackReadinessAssessment: assessment(input.rollbackReadinessAssessment?.status || (criteria.find((item) => item.id === "rollback-ready")?.result === "satisfied" ? "ready" : "not_ready"), input.rollbackReadinessAssessment), operationalReadinessAssessment: assessment(input.operationalReadinessAssessment?.status || "ready", input.operationalReadinessAssessment),
      governanceAssessment: assessment(input.governanceAssessment?.status || (normalized.decision?.outcome === "authorize" ? "authorized" : "denied"), input.governanceAssessment), authorizationAssessment: assessment(input.authorizationAssessment?.status || (normalized.decision?.outcome === "authorize" ? "valid" : "missing"), input.authorizationAssessment), evidenceAssessment: assessment(evidence.every((item) => item.state === "valid") ? "valid" : "insufficient", { evidence }), provenanceAssessment: assessment(input.provenanceAssessment?.status || (gate.valid ? "proven" : "unproven"), input.provenanceAssessment), integrityAssessment: assessment(gate.reasons.some((item) => item.category === "integrity") ? "failed" : "valid", { sourceChainDigest: normalized.verification?.sourceChainDigest }),
      postAcceptanceObligations: conditions.filter((item) => item.category === "post_acceptance_obligation"), stopConditions: conditions.filter((item) => item.category === "blocking"), rejectionReasons: stableObjects(array(input.rejectionReasons), "code"), auditInformation: { policyVersion: POLICY_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION, riskPolicyVersion: RISK_POLICY_VERSION, sourceVerificationId: normalized.verification?.id || null },
    };
    const completeness = { contract: metric(Object.entries(groups).map(([id, value]) => ({ id, result: value === null || value === undefined ? "missing" : "satisfied" }))), sourceChain: metric(Object.values(gate.binding).map((item) => ({ result: item.id && item.revision && item.digest ? "satisfied" : "missing" }))), criteria: metric(criteria), conditions: metric(conditions, ["satisfied", "open"]), evidence: metric(evidence), governance: metric([groups.governanceAssessment]), risk: metric([{ result: risk.level === "indeterminate" ? "missing" : "satisfied" }]), migrationReadiness: metric([groups.migrationReadinessAssessment], ["ready", "not_applicable"]), rollbackReadiness: metric([groups.rollbackReadinessAssessment], ["ready", "not_applicable"]), postAcceptanceObligations: metric(groups.postAcceptanceObligations, ["satisfied", "open"]) };
    const consistency = { internal: assessment(reasons.some((item) => item.category === "integrity") ? "conflicting" : "consistent"), crossStage: assessment(gate.valid ? "consistent" : "conflicting") };
    const coverage = { criteria: metric(criteria), conditions: metric(conditions, ["satisfied", "open"]), evidence: metric(evidence), riskControls: metric(criteria.filter((item) => item.category === "risk")), outputs: metric(normalized.verification?.verificationContract?.outputChecks || [], ["passed", "not_applicable"]), postconditions: metric(normalized.verification?.verificationContract?.postconditionChecks || [], ["passed", "not_applicable"]), rollback: metric(normalized.verification?.verificationContract?.rollbackChecks || [], ["passed", "not_applicable"]), migration: metric(normalized.verification?.verificationContract?.migrationChecks || [], ["passed", "not_applicable"]), authorization: metric([groups.authorizationAssessment], ["valid"]), provenance: metric([groups.provenanceAssessment], ["proven"]) };
    const verdict = computeVerdict(gate, normalized.verification, criteria, conditions, evidence, risk, input, reasons); const stableReasons = stableObjects(reasons, "code");
    return freeze({ gate, ...groups, completeness, consistency, coverage, verdict, status: statusForVerdict(verdict), risk, reasons: stableReasons, reasonCodes: stableStrings(stableReasons.map((item) => item.code)), nextAction: nextActionForVerdict(verdict) });
  }

  function statusForVerdict(verdict) { return ({ accepted: "accepted", accepted_with_conditions: "accepted_with_conditions", revision_required: "require_revision", evidence_required: "require_evidence", rollback_required: "require_rollback", rejected: "rejected", blocked: "blocked", failed: "failed", cancelled: "cancelled" })[verdict] || "blocked"; }
  function nextActionForVerdict(verdict) { return ({ accepted: "acceptance_recorded", accepted_with_conditions: "track_post_acceptance_obligations", revision_required: "create_revised_candidate", evidence_required: "collect_acceptance_evidence", rollback_required: "initiate_separate_rollback_workflow", rejected: "no_canonical_promotion", blocked: "resolve_acceptance_blocker", failed: "investigate_acceptance_failure", cancelled: "no_action_cancelled" })[verdict] || "resolve_acceptance_blocker"; }
  function terminalLifecycleForVerdict(verdict) { return VERDICTS.includes(verdict) ? verdict : "blocked"; }
  function lifecycleStatus(record) { const flags = new Set(["pending"]); if (record.lifecycle === "stale") flags.add("stale"); if (record.lifecycle === "failed") flags.add("failed"); if (record.lifecycle === "rollback_required") flags.add("require_rollback"); if (record.lifecycle === "blocked") flags.add("blocked"); if (record.lifecycle === "evidence_required") flags.add("require_evidence"); if (record.lifecycle === "revision_required") flags.add("require_revision"); if (record.lifecycle === "rejected") flags.add("rejected"); if (record.lifecycle === "cancelled") flags.add("cancelled"); if (record.lifecycle === "accepted_with_conditions") flags.add("accepted_with_conditions"); if (record.lifecycle === "accepted") flags.add("accepted"); if (ACTIVE_LIFECYCLES.slice(1).includes(record.lifecycle)) flags.add("in_progress"); if (record.lifecycle === "draft" && record.sourceProof?.valid) flags.add("ready"); return STATUS_PRECEDENCE.find((item) => flags.has(item)) || "blocked"; }
  function identityPayload(record) { return { projectId: record.projectId, patternId: record.patternId, calculationId: record.calculationId, sourceInitiationId: record.sourceInitiationId, sourceProposalId: record.sourceProposalId, sourceReviewId: record.sourceReviewId, sourceDecisionId: record.sourceDecisionId, sourceExecutionId: record.sourceExecutionId, sourceVerificationId: record.sourceVerificationId, sourceVerificationRevision: record.sourceVerificationRevision, sourceVerificationDigest: record.sourceVerificationDigest, sourceChainDigest: record.sourceChainDigest, policyVersion: record.acceptancePolicyVersion, evidencePolicyVersion: record.evidencePolicyVersion, riskPolicyVersion: record.riskPolicyVersion, assessmentInput: normalizeObject(record.assessmentInput), predecessorAcceptanceId: record.predecessorAcceptanceId, epoch: record.epoch }; }
  function semanticIdentityPayload(record) { const value = identityPayload(record); delete value.predecessorAcceptanceId; delete value.epoch; return value; }
  function calculateAcceptanceIdentity(record) { return fingerprint(identityPayload(record)); }
  function calculateSemanticIdentity(record) { return fingerprint(semanticIdentityPayload(record)); }
  function digestPayload(record) { return { ...identityPayload(record), id: record.id, sourceSnapshots: normalizeObject(record.sourceSnapshots), sourceBinding: normalizeObject(record.sourceBinding), acceptanceContract: normalizeObject(record.acceptanceContract), lifecycle: record.lifecycle, status: record.status, verdict: record.verdict, risk: normalizeObject(record.risk), nextAction: record.nextAction, imported: record.imported, importedUnproven: record.importedUnproven, collision: record.collision, proofStatus: record.proofStatus, provenance: normalizeObject(record.provenance), revision: record.revision }; }
  function calculateAcceptanceDigest(record) { return fingerprint(digestPayload(record)); }
  function refreshDerived(record) { const next = clone(record); next.status = lifecycleStatus(next); next.acceptanceStatus = next.status; next.nextAction = TERMINAL_LIFECYCLES.includes(next.lifecycle) ? nextActionForVerdict(next.verdict) : next.lifecycle === "draft" ? "assess_acceptance" : next.lifecycle === "assessing" ? "deliberate_acceptance" : "review_acceptance"; next.digest = calculateAcceptanceDigest(next); return freeze(next); }
  function sanitizedAssessmentInput(input = {}) { return freeze(normalizeObject({ acceptanceCriteria: array(input.acceptanceCriteria), conditions: array(input.conditions), evidence: array(input.evidence), riskSignals: input.riskSignals || {}, benefitAssessment: input.benefitAssessment || {}, costAssessment: input.costAssessment || {}, compatibilityAssessment: input.compatibilityAssessment || {}, migrationReadinessAssessment: input.migrationReadinessAssessment || {}, rollbackReadinessAssessment: input.rollbackReadinessAssessment || {}, operationalReadinessAssessment: input.operationalReadinessAssessment || {}, governanceAssessment: input.governanceAssessment || {}, authorizationAssessment: input.authorizationAssessment || {}, provenanceAssessment: input.provenanceAssessment || {}, rejectionReasons: array(input.rejectionReasons), cancelled: input.cancelled === true })); }
  function createPatternEvolutionAcceptance(source = {}, input = {}) {
    const assessmentInput = sanitizedAssessmentInput(input); const contract = calculateAcceptanceContract(source, assessmentInput); const verification = contract.gate.normalized.verification;
    if (!verification) throw acceptanceError("missing_source", "A live terminal execution verification is required.", { reasons: contract.reasons });
    if (!contract.gate.valid) throw acceptanceError("source_gate_failed", "Only a current, locally proven canonical verification chain may be assessed.", { reasons: contract.reasons });
    const timestamp = injectedTimestamp(input.now, verification.updatedAt); const epoch = positiveInteger(input.epoch) || 1; const binding = contract.gate.binding; const sourceSnapshots = freeze({ initiation: snapshot(contract.gate.normalized.initiation), proposal: snapshot(contract.gate.normalized.proposal), review: snapshot(contract.gate.normalized.review), decision: snapshot(contract.gate.normalized.decision), execution: snapshot(contract.gate.normalized.execution), verification: snapshot(verification) }); const sourceChainDigest = fingerprint({ sourceSnapshots, sourceBinding: binding });
    const record = { id: "", acceptanceId: "", kind: PROGRESS_KIND, type: PROGRESS_KIND, version: VERSION, schemaVersion: SCHEMA_VERSION, acceptancePolicyVersion: POLICY_VERSION, evidencePolicyVersion: EVIDENCE_POLICY_VERSION, riskPolicyVersion: RISK_POLICY_VERSION, projectId: verification.projectId, patternId: verification.patternId, calculationId: verification.calculationId, sourceInitiationId: binding.initiation.id, sourceProposalId: binding.proposal.id, sourceReviewId: binding.review.id, sourceDecisionId: binding.decision.id, sourceExecutionId: binding.execution.id, sourceVerificationId: binding.verification.id, sourceVerificationRevision: binding.verification.revision, sourceVerificationDigest: binding.verification.digest, sourceChainDigest, sourceBinding: binding, sourceSnapshots, sourceProof: { valid: true, current: true, provenanceProven: true, issues: [] }, assessmentInput, acceptanceContract: contract, risk: contract.risk, verdict: contract.verdict, lifecycle: "draft", status: "ready", acceptanceStatus: "ready", nextAction: "assess_acceptance", reasons: contract.reasons, reasonCodes: contract.reasonCodes, imported: false, importedUnproven: false, collision: false, quarantined: false, proofStatus: "proven", provenance: { origin: "local", sourceVerificationId: verification.id, policyVersion: POLICY_VERSION }, predecessorAcceptanceId: normalizeText(input.predecessorAcceptanceId) || null, supersedesAcceptanceId: normalizeText(input.supersedesAcceptanceId) || null, originalImport: input.originalImport ? snapshot(input.originalImport) : null, createdAt: timestamp, updatedAt: timestamp, revision: 1, epoch, identity: "", semanticIdentity: "", digest: "", audit: [{ event: "created", at: timestamp, revision: 1, sourceVerificationId: verification.id }] };
    record.identity = calculateAcceptanceIdentity(record); record.semanticIdentity = calculateSemanticIdentity(record); record.id = normalizeText(input.id || input.acceptanceId) || `pattern-evolution-acceptance:${record.identity.slice(8)}`; record.acceptanceId = record.id; const refreshed = refreshDerived(record); const report = validatePatternEvolutionAcceptance(refreshed); if (!report.valid) throw acceptanceError("acceptance_invalid", "Computed acceptance record is invalid.", { errors: report.errors }); return refreshed;
  }
  function validationResult(errors) { const unique = new Map(errors.map((item) => [`${item.code}\0${item.field || ""}`, item])); return freeze({ valid: unique.size === 0, errors: [...unique.values()].sort((a, b) => compare(a.code, b.code) || compare(a.field, b.field)) }); }
  function validatePatternEvolutionAcceptance(record) {
    const errors = []; const invalid = (code, field = null) => errors.push({ code, field }); try { canonicalize(record); } catch { invalid("corrupted_input"); return validationResult(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.version !== VERSION || record.schemaVersion !== SCHEMA_VERSION || record.acceptancePolicyVersion !== POLICY_VERSION || record.evidencePolicyVersion !== EVIDENCE_POLICY_VERSION || record.riskPolicyVersion !== RISK_POLICY_VERSION) invalid("invalid_header");
    for (const field of ["id", "projectId", "patternId", "calculationId", "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceDecisionId", "sourceExecutionId", "sourceVerificationId", "sourceVerificationDigest", "sourceChainDigest", "identity", "semanticIdentity", "digest"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (record?.acceptanceId !== record?.id || !LIFECYCLES.includes(record?.lifecycle) || !STATUSES.includes(record?.status) || record?.acceptanceStatus !== record?.status || !VERDICTS.includes(record?.verdict) || !RISK_LEVELS.includes(record?.risk?.level)) invalid("invalid_lifecycle_status_or_risk");
    if (!positiveInteger(record?.revision) || !positiveInteger(record?.epoch) || !isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("invalid_revision");
    if (!record?.sourceSnapshots?.verification || !record?.sourceSnapshots?.execution || !record?.sourceSnapshots?.decision || !record?.sourceSnapshots?.review || !record?.sourceSnapshots?.proposal || !record?.sourceSnapshots?.initiation || !record?.sourceBinding || !record?.sourceProof || !record?.assessmentInput || !record?.acceptanceContract || !Array.isArray(record?.audit) || !Array.isArray(record?.reasons) || !Array.isArray(record?.reasonCodes)) invalid("invalid_structure");
    if (record?.sourceSnapshots && fingerprint({ sourceSnapshots: record.sourceSnapshots, sourceBinding: record.sourceBinding }) !== record.sourceChainDigest) invalid("source_chain_digest_mismatch");
    if (record?.sourceSnapshots?.verification && (record.sourceSnapshots.verification.id !== record.sourceVerificationId || verificationDigest(record.sourceSnapshots.verification) !== record.sourceVerificationDigest)) invalid("source_verification_snapshot_mismatch");
    if (calculateAcceptanceIdentity(record) !== record?.identity) invalid("identity_mismatch"); if (calculateSemanticIdentity(record) !== record?.semanticIdentity) invalid("semantic_identity_mismatch"); if (lifecycleStatus(record) !== record?.status) invalid("derived_status_mismatch"); if (calculateAcceptanceDigest(record) !== record?.digest) invalid("digest_mismatch");
    if (record?.predecessorAcceptanceId === record?.id || record?.supersedesAcceptanceId === record?.id) invalid("predecessor_cycle"); if (TERMINAL_LIFECYCLES.includes(record?.lifecycle) && record.lifecycle !== terminalLifecycleForVerdict(record.verdict)) invalid("terminal_verdict_mismatch"); return validationResult(errors);
  }
  function requireRecord(record) { const report = validatePatternEvolutionAcceptance(record); if (!report.valid) throw acceptanceError("corrupted_input", "Pattern evolution acceptance is corrupted.", { errors: report.errors }); }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw acceptanceError("revision_conflict", "Acceptance revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw acceptanceError("identity_conflict", "Acceptance identity changed."); }
  function transition(record, nextLifecycle, source = null, command = {}) { requireRecord(record); checkConcurrency(record, command); if (TERMINAL_LIFECYCLES.includes(record.lifecycle)) throw acceptanceError("terminal_immutable", "Terminal acceptances are immutable."); if (record.lifecycle === "stale") throw acceptanceError("stale_immutable", "A stale acceptance cannot resume."); if (!TRANSITIONS[record.lifecycle]?.includes(nextLifecycle)) throw acceptanceError("invalid_transition", "Acceptance lifecycle transition is not allowlisted."); const contract = source ? calculateAcceptanceContract(source, record.assessmentInput) : record.acceptanceContract; if (source && !contract.gate.valid && !["stale", "blocked", "failed"].includes(nextLifecycle)) throw acceptanceError("source_gate_failed", "The canonical source chain no longer proves this acceptance.", { reasons: contract.reasons }); if (TERMINAL_LIFECYCLES.includes(nextLifecycle) && nextLifecycle !== terminalLifecycleForVerdict(contract.verdict)) throw acceptanceError("caller_verdict_rejected", "Terminal lifecycle is computed from acceptance facts.", { expected: contract.verdict }); if (TERMINAL_LIFECYCLES.includes(nextLifecycle) && record.lifecycle !== "reviewing") throw acceptanceError("invalid_transition", "A terminal acceptance requires assessment, deliberation, and review."); const timestamp = injectedTimestamp(command.now, record.updatedAt); const next = clone(record); next.lifecycle = nextLifecycle; next.acceptanceContract = contract; next.verdict = contract.verdict; next.risk = contract.risk; next.reasons = contract.reasons; next.reasonCodes = contract.reasonCodes; next.revision += 1; next.updatedAt = timestamp; next.audit = [...array(next.audit), { event: nextLifecycle, at: timestamp, revision: next.revision }]; return refreshDerived(next); }
  function startAssessing(record, source, command = {}) { return transition(record, "assessing", source, command); }
  function startDeliberating(record, source, command = {}) { return transition(record, "deliberating", source, command); }
  function startReviewing(record, source, command = {}) { return transition(record, "reviewing", source, command); }
  function finalizeAcceptance(record, source, command = {}) { const contract = calculateAcceptanceContract(source, record.assessmentInput); return transition(record, terminalLifecycleForVerdict(contract.verdict), source, command); }
  function markAcceptanceStale(record, source, command = {}) { return transition(record, "stale", source, command); }
  function projectPatternEvolutionAcceptance(record, source = {}) { requireRecord(record); const gate = calculateSourceGate(source, record); if (gate.valid && !record.importedUnproven && !record.collision && !record.quarantined) return freeze({ record, lifecycle: record.lifecycle, status: record.status, verdict: record.verdict, risk: record.risk, stale: false, sourceGate: gate, reasons: record.reasons, nextAction: record.nextAction }); const reasons = stableObjects([...gate.reasons, ...(record.importedUnproven ? [reason("acceptance_imported_unproven", "trust", "Imported acceptance requires local revalidation.")] : []), ...(record.collision ? [reason("acceptance_collision", "trust", "Acceptance identity is collided.")] : [])], "code"); return freeze({ record, lifecycle: "stale", status: "stale", verdict: "blocked", risk: record.risk, stale: true, sourceGate: gate, reasons, nextAction: "resolve_acceptance_blocker" }); }
  function classifyDuplicate(records, candidate) { const values = array(records).map((item) => item?.state || item); const sameId = values.find((item) => item?.id === candidate?.id); if (sameId && canonicalize(sameId) === canonicalize(candidate)) return freeze({ status: "exact_duplicate", record: sameId }); if (sameId) return freeze({ status: "collision", record: sameId }); const sameIdentity = values.find((item) => item?.identity === candidate?.identity); if (sameIdentity) return freeze({ status: TERMINAL_LIFECYCLES.includes(sameIdentity.lifecycle) ? "duplicate_terminal" : "identity_collision", record: sameIdentity }); const semantic = values.find((item) => item?.semanticIdentity === candidate?.semanticIdentity); if (semantic) return freeze({ status: TERMINAL_LIFECYCLES.includes(semantic.lifecycle) ? "duplicate_terminal" : "semantic_duplicate", record: semantic }); return freeze({ status: "unique", record: null }); }
  function serializePatternEvolutionAcceptance(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternEvolutionAcceptance(value) { let parsed; try { parsed = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw acceptanceError("malformed_record", "Acceptance payload is malformed."); } requireRecord(parsed); return freeze(parsed); }
  function safeNormalizePatternEvolutionAcceptance(value) { try { return freeze({ record: deserializePatternEvolutionAcceptance(value), corrupted: false, errors: [] }); } catch (error) { return freeze({ record: null, corrupted: true, errors: error?.details?.errors || [{ code: error?.code || "malformed_record", field: null }] }); } }
  function makeImportedPatternEvolutionAcceptanceUnproven(record, options = {}) { requireRecord(record); const next = clone(record); next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.provenance = { ...next.provenance, origin: "import", importedDigest: record.digest }; next.sourceProof = { ...next.sourceProof, valid: false, current: false, provenanceProven: false, issues: stableStrings([...array(next.sourceProof?.issues), "imported_unproven"]) }; next.updatedAt = injectedTimestamp(options.now, record.updatedAt); next.revision += 1; next.audit = [...array(next.audit), { event: "imported_unproven", at: next.updatedAt, revision: next.revision }]; next.digest = calculateAcceptanceDigest(next); return freeze(next); }
  function remapKnown(value, map, parentKey = "") { if (typeof value === "string") return REFERENCE_FIELDS.has(parentKey) && map.has(value) ? map.get(value) : value; if (Array.isArray(value)) return value.map((item) => remapKnown(item, map, parentKey)); if (value && typeof value === "object") { const result = {}; for (const key of Object.keys(value)) result[key] = remapKnown(value[key], map, key); return result; } return value; }
  function remapPatternEvolutionAcceptance(record, referenceMap) { requireRecord(record); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {})); for (const key of map.keys()) if (["verdict", "status", "risk", "acceptanceContract", "acceptanceCriteria", "conditions", "evidence"].includes(key)) throw acceptanceError("forbidden_remap", "Only acceptance references may be remapped."); const protectedFacts = { verdict: record.verdict, status: record.status, risk: clone(record.risk), contract: clone(record.acceptanceContract) }; const next = remapKnown(clone(record), map); next.originalImport = snapshot({ originalImport: record.originalImport || record, originalDigest: record.digest }); next.verdict = protectedFacts.verdict; next.status = protectedFacts.status; next.acceptanceStatus = protectedFacts.status; next.risk = protectedFacts.risk; next.acceptanceContract = protectedFacts.contract; next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.sourceProof = { ...next.sourceProof, valid: false, current: false, provenanceProven: false, issues: ["imported_unproven"] }; next.sourceVerificationDigest = verificationDigest(next.sourceSnapshots.verification); next.sourceBinding.verification.digest = next.sourceVerificationDigest; next.sourceChainDigest = fingerprint({ sourceSnapshots: next.sourceSnapshots, sourceBinding: next.sourceBinding }); next.identity = calculateAcceptanceIdentity(next); next.semanticIdentity = calculateSemanticIdentity(next); next.id = map.get(record.id) || `pattern-evolution-acceptance:${next.identity.slice(8)}`; next.acceptanceId = next.id; next.digest = calculateAcceptanceDigest(next); return freeze(next); }
  function importPatternEvolutionAcceptance(existing, serialized, options = {}) { let parsed; try { parsed = deserializePatternEvolutionAcceptance(serialized); } catch (error) { return freeze({ status: "malformed", changed: false, record: null, quarantine: { reasonCode: error?.code || "malformed_record" } }); } const candidate = options.referenceMap ? remapPatternEvolutionAcceptance(parsed, options.referenceMap) : parsed; const duplicate = classifyDuplicate(existing, candidate); if (["collision", "identity_collision"].includes(duplicate.status)) return freeze({ status: "collision", changed: false, record: null, quarantine: { reasonCode: "PATTERN_EVOLUTION_ACCEPTANCE_COLLISION" } }); if (["exact_duplicate", "duplicate_terminal"].includes(duplicate.status)) return freeze({ ...duplicate, changed: false }); return freeze({ status: "imported_unproven", changed: true, record: makeImportedPatternEvolutionAcceptanceUnproven(candidate, options) }); }
  function revalidatePatternEvolutionAcceptance(record, source, command = {}) { requireRecord(record); const epoch = positiveInteger(command.epoch) || record.epoch + 1; const liveSource = { ...source, acceptances: array(source.acceptances).filter((item) => (item?.state || item)?.id !== record.id) }; return createPatternEvolutionAcceptance(liveSource, { ...clone(record.assessmentInput), now: command.now || record.updatedAt, epoch, predecessorAcceptanceId: record.id, supersedesAcceptanceId: record.id, originalImport: { originalImport: record.originalImport || record, sourceSnapshots: record.sourceSnapshots } }); }
  async function loadSource(repository, projectId, verificationId = null) { const verificationRecord = verificationId ? await repository.getPatternEvolutionExecutionVerification(projectId, verificationId) : await repository.getLatestPatternEvolutionExecutionVerification(projectId); if (!verificationRecord) return freeze({ projectId, verification: null, execution: null, decision: null, review: null, proposal: null, initiation: null, verifications: [], acceptances: [] }); const chain = await repository.getPatternEvolutionExecutionVerificationSourceChain(projectId, verificationRecord.state.id, verificationRecord.state.calculationId); const verifications = await repository.listPatternEvolutionExecutionVerifications(projectId, verificationRecord.state.calculationId); const acceptances = repository.listPatternEvolutionAcceptances ? await repository.listPatternEvolutionAcceptances(projectId, verificationRecord.state.calculationId) : []; return freeze({ projectId, patternId: verificationRecord.state.patternId, calculationId: verificationRecord.state.calculationId, verification: verificationRecord.state, execution: chain.execution?.state || chain.execution, decision: chain.decision?.state || chain.decision, review: chain.review?.state || chain.review, proposal: chain.proposal?.state || chain.proposal, initiation: chain.initiation?.state || chain.initiation, verifications: verifications.map((item) => item.state), acceptances: acceptances.map((item) => item.state) }); }
  async function createForProject(repository, projectId, input = {}) { const source = await loadSource(repository, projectId, input.verificationId); const all = await repository.listPatternEvolutionAcceptances(projectId, source.calculationId); const epoch = positiveInteger(input.epoch) || all.reduce((maximum, entry) => Math.max(maximum, entry.epoch), 0) + 1; const record = createPatternEvolutionAcceptance(source, { ...input, epoch }); const duplicate = classifyDuplicate(all, record); if (["duplicate_terminal", "semantic_duplicate", "exact_duplicate"].includes(duplicate.status)) return freeze({ acceptanceRecord: all.find((entry) => entry.state?.id === duplicate.record?.id) || null, rawAcceptance: duplicate.record, source, duplicate: true }); if (["collision", "identity_collision"].includes(duplicate.status)) throw acceptanceError("acceptance_collision", "Acceptance identity collision detected."); const stored = await repository.savePatternEvolutionAcceptance(projectId, record, { timestamp: record.updatedAt }); return freeze({ acceptanceRecord: stored, rawAcceptance: stored.state, source, duplicate: false }); }
  async function readForProject(repository, projectId, acceptanceId = null, verificationId = null) { const progress = await repository.getPatternEvolutionAcceptance(projectId, acceptanceId, null, verificationId); if (!progress) return freeze({ acceptanceRecord: null, acceptance: null, source: null, projection: null }); const source = await loadSource(repository, projectId, progress.state.sourceVerificationId); return freeze({ acceptanceRecord: progress, acceptance: progress.state, source, projection: projectPatternEvolutionAcceptance(progress.state, source) }); }

  const api = Object.freeze({ VERSION, SCHEMA_VERSION, POLICY_VERSION, EVIDENCE_POLICY_VERSION, RISK_POLICY_VERSION, PROGRESS_KIND, SOURCE_KIND, LIFECYCLES, ACTIVE_LIFECYCLES, TERMINAL_LIFECYCLES, VERDICTS, STATUSES, STATUS_PRECEDENCE, RISK_LEVELS, CRITERION_TYPES, CRITERION_RESULTS, CONDITION_CATEGORIES, EVIDENCE_STATES, TRANSITIONS, REFERENCE_FIELDS, PatternEvolutionAcceptanceError, canonicalize, fingerprint, normalizeText, normalizeObject, stableStrings, stableObjects, snapshot, normalizedSource, verificationDigest, calculateSourceGate, normalizeCriteria, normalizeConditions, normalizeEvidence, calculateRiskAssessment, calculateAcceptanceContract, statusForVerdict, nextActionForVerdict, terminalLifecycleForVerdict, lifecycleStatus, identityPayload, semanticIdentityPayload, calculateAcceptanceIdentity, calculateSemanticIdentity, digestPayload, calculateAcceptanceDigest, createPatternEvolutionAcceptance, createAcceptance: createPatternEvolutionAcceptance, validatePatternEvolutionAcceptance, transition, startAssessing, startDeliberating, startReviewing, finalizeAcceptance, markAcceptanceStale, projectPatternEvolutionAcceptance, classifyDuplicate, serializePatternEvolutionAcceptance, deserializePatternEvolutionAcceptance, safeNormalizePatternEvolutionAcceptance, makeImportedPatternEvolutionAcceptanceUnproven, remapPatternEvolutionAcceptance, importPatternEvolutionAcceptance, revalidatePatternEvolutionAcceptance, loadSource, createForProject, readForProject });
  globalObject.YarnAIPatternEvolutionAcceptance = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
