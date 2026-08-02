"use strict";

(function initializePatternEvolutionDecision(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const POLICY_VERSION = "pattern-evolution-decision/v1";
  const RISK_POLICY_VERSION = "pattern-evolution-decision-risk/v1";
  const PROGRESS_KIND = "PATTERN_EVOLUTION_DECISION";
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const LIFECYCLES = Object.freeze(["draft", "deciding", "ready", "authorized", "revision_required", "evidence_required", "blocked", "declined", "cancelled", "stale"]);
  const TERMINAL_LIFECYCLES = Object.freeze(["authorized", "revision_required", "evidence_required", "blocked", "declined", "cancelled"]);
  const OUTCOMES = Object.freeze(["authorize", "require_revision", "require_evidence", "block", "decline", "stale"]);
  const NEXT_ACTIONS = Object.freeze(["proceed_to_next_stage", "create_new_proposal_revision", "collect_evidence_and_rereview", "resolve_blockers_and_rereview", "create_new_initiation", "no_further_action", "recreate_from_current_sources"]);
  const RISK_LEVELS = Object.freeze(["low", "moderate", "high", "critical"]);
  const TERMINAL_REVIEW_STATES = Object.freeze(["approved", "changes_requested", "rejected", "cancelled", "stale"]);
  const REFERENCE_FIELDS = new Set([
    "id", "decisionId", "projectId", "patternId", "calculationId", "sourceInitiationId", "sourceProposalId", "sourceReviewId",
    "predecessorDecisionId", "supersedesDecisionId", "sourceClosureId", "sourceScopeReference", "sourceHypothesisReference",
    "rollbackReference", "changeId", "evidenceId", "findingId", "conflictId", "migrationId", "conditionId", "criterionId",
    "successCriteriaReferences", "criterionReferences", "dependencies", "affectedChangeIds", "changeIds", "evidenceReferences",
    "findingReferences", "conflictReferences", "scopeReferences", "safeguardReferences", "migrationReferences", "rollbackReferences",
  ]);

  class PatternEvolutionDecisionError extends Error {
    constructor(code, message, details = null) { super(message); this.name = "PatternEvolutionDecisionError"; this.code = code; this.userMessage = message; this.details = details; }
  }

  function decisionError(code, message, details) { return new PatternEvolutionDecisionError(code, message, details); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function lower(value) { return normalizeText(value).toLowerCase(); }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function injectedTimestamp(...values) { const result = values.find(isTimestamp); if (!result) throw decisionError("timestamp_required", "An injected timestamp is required."); return result; }
  function canonicalize(value, seen = new Set()) {
    if (value === undefined) return "null";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (seen.has(value)) throw decisionError("cyclic_input", "Cyclic decision data is not supported.");
    seen.add(value); let result;
    if (Array.isArray(value)) result = `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
    else result = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    seen.delete(value); return result;
  }
  function fingerprint(value) { const input = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function normalizeObject(value) { if (value === undefined) return null; if (typeof value === "string") return normalizeText(value); if (Array.isArray(value)) return value.map(normalizeObject); if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) { const result = {}; for (const key of Object.keys(value).sort(compare)) result[key] = normalizeObject(value[key]); return result; } return value; }
  function stableStrings(values) { return [...new Set(array(values).map((value) => normalizeText(typeof value === "object" ? value?.id || value?.code || value?.key || value?.name : value)).filter(Boolean))].sort(compare); }
  function stableObjects(values, key = "code") { const unique = new Map(); for (const value of array(values)) { const normalized = normalizeObject(clone(value)); const identity = normalizeText(normalized?.[key]) || fingerprint(normalized); if (!unique.has(identity)) unique.set(identity, normalized); } return [...unique.values()].sort((a, b) => compare(a?.[key] || canonicalize(a), b?.[key] || canonicalize(b))); }
  function idOf(value, ...fields) { for (const field of ["id", ...fields]) { const id = normalizeText(value?.[field]); if (id) return id; } return ""; }
  function statusOf(value) { return lower(value?.status || value?.lifecycle || value?.lifecycleState); }
  function sourceSnapshot(value) { return freeze(normalizeObject(clone(value || {}))); }
  function proposalDigest(value) { return normalizeText(value?.identity || value?.proposalDigest) || fingerprint(sourceSnapshot(value)); }
  function initiationDigest(value) { return normalizeText(value?.identity || value?.sourceDigest || value?.initiationDigest) || fingerprint(sourceSnapshot(value)); }
  function reviewDigest(value) { return fingerprint(sourceSnapshot(value)); }
  function reviewPolicyVersion(value) { return normalizeText(value?.policyVersion); }
  function initiationProposalSnapshot(value) { return freeze(normalizeObject(clone(globalObject.YarnAIPatternEvolutionProposal?.sourceSnapshot?.(value) || value || {}))); }

  function normalizeSource(source = {}) {
    const review = source.review || source.sourceReview || (source.kind === "PATTERN_EVOLUTION_PROPOSAL_REVIEW" ? source : null);
    const proposal = source.proposal || source.sourceProposal || (source.kind === "PATTERN_EVOLUTION_PROPOSAL" ? source : null) || review?.sourceProposalSnapshot || null;
    const initiation = source.initiation || source.sourceInitiation || (source.kind === "PATTERN_EVOLUTION_INITIATION" ? source : null) || proposal?.sourceSnapshot || null;
    return freeze({
      projectId: normalizeText(source.projectId || review?.projectId || proposal?.projectId || initiation?.projectId),
      patternId: normalizeText(source.patternId || review?.patternId || proposal?.patternId || initiation?.patternId),
      calculationId: normalizeText(source.calculationId || review?.calculationId || proposal?.calculationId || initiation?.calculationId),
      review: review ? clone(review) : null,
      proposal: proposal ? clone(proposal) : null,
      initiation: initiation ? clone(initiation) : null,
      reviews: array(source.reviews).map((item) => clone(item?.state || item)),
      proposals: array(source.proposals).map((item) => clone(item?.state || item)),
      initiations: array(source.initiations).map((item) => clone(item?.state || item)),
      decisions: array(source.decisions).map((item) => clone(item?.state || item)),
      expectedReviewRevision: source.expectedReviewRevision,
      expectedReviewDigest: normalizeText(source.expectedReviewDigest),
      expectedProposalRevision: source.expectedProposalRevision,
      expectedProposalDigest: normalizeText(source.expectedProposalDigest),
      expectedInitiationRevision: source.expectedInitiationRevision,
      expectedInitiationDigest: normalizeText(source.expectedInitiationDigest),
    });
  }

  function validateReviewContract(review) {
    const status = statusOf(review); const verdict = lower(review?.verdict);
    if (!TERMINAL_REVIEW_STATES.includes(status)) return { valid: false, code: "review_terminal_required" };
    const allowed = { approved: ["approve"], changes_requested: ["changes_requested", "needs_evidence", "blocked"], rejected: ["reject"], cancelled: ["approve", "changes_requested", "needs_evidence", "blocked", "reject", "stale"], stale: ["stale"] };
    if (!allowed[status]?.includes(verdict)) return { valid: false, code: "review_lifecycle_verdict_invalid" };
    if (verdict === "approve") {
      if (array(review.findings).some((item) => item?.blocking === true || ["block", "reject", "stale", "evidence", "change"].includes(lower(item?.severity)))) return { valid: false, code: "review_approve_findings_conflict" };
      if (array(review.blockingFindings).length) return { valid: false, code: "review_approve_blockers_conflict" };
      if (review.readiness?.implementationReady !== true || review.readiness?.overallReady !== true) return { valid: false, code: "review_approve_not_ready" };
      for (const key of ["sourceValid", "compatibilityPassed", "migrationPassed", "rollbackPassed", "evidenceComplete", "conflictFree"]) if (review.readiness?.[key] !== true) return { valid: false, code: `review_approve_${key}_false` };
    }
    const reviewApi = globalObject.YarnAIPatternEvolutionProposalReview;
    if (reviewApi?.validatePatternEvolutionProposalReview && review.importedUnproven !== true) {
      const report = reviewApi.validatePatternEvolutionProposalReview(review);
      if (!report.valid) {
        const assessed = reviewApi.assessReview?.(review); const semanticDerivedMatch = assessed && assessed.verdict === review.verdict && canonicalize(assessed.risk) === canonicalize(review.risk) && canonicalize(assessed.readiness) === canonicalize(review.readiness) && canonicalize(stableObjects(assessed.findings)) === canonicalize(stableObjects(review.findings)) && canonicalize(stableObjects(assessed.blockingFindings)) === canonicalize(stableObjects(review.blockingFindings)) && canonicalize(stableObjects(assessed.revisionRequests)) === canonicalize(stableObjects(review.revisionRequests)) && canonicalize(stableObjects(assessed.evidenceRequests)) === canonicalize(stableObjects(review.evidenceRequests));
        if (!semanticDerivedMatch) return { valid: false, code: "review_domain_invalid", details: report.errors };
      }
    }
    return { valid: true, code: null };
  }

  function reason(code, category, message, references = []) { return freeze({ code, category, message, references: stableStrings(references) }); }
  function condition(code, message, references = [], required = true) { return freeze({ id: `condition:${code}`, code, message, references: stableStrings(references), required }); }
  function addReason(collection, code, category, message, references = []) { collection.push(reason(code, category, message, references)); }

  function calculateSourceGate(source = {}, record = null) {
    const normalized = normalizeSource(source); const { review, proposal, initiation } = normalized; const reasons = [];
    if (!review) return freeze({ valid: false, reviewRequired: true, reasons: [reason("review_required", "block", "A Stage 47 review is required.")], normalized });
    const reviewId = idOf(review, "reviewId"); const proposalId = idOf(proposal, "proposalId"); const initiationId = idOf(initiation, "initiationId");
    const currentReviewDigest = reviewDigest(review); const currentProposalDigest = proposal ? proposalDigest(proposal) : ""; const currentInitiationDigest = initiation ? initiationDigest(initiation) : "";
    if (!proposal) addReason(reasons, "proposal_required", "stale", "The source proposal is unavailable.");
    if (!initiation) addReason(reasons, "initiation_required", "stale", "The source initiation is unavailable.");
    if (!normalized.projectId || review.projectId !== normalized.projectId || proposal && proposal.projectId !== normalized.projectId || initiation && initiation.projectId !== normalized.projectId) addReason(reasons, "source_project_mismatch", "decline", "The source chain belongs to another project.");
    if (!normalized.patternId || review.patternId !== normalized.patternId || proposal && proposal.patternId !== normalized.patternId || initiation && initiation.patternId !== normalized.patternId) addReason(reasons, "source_pattern_mismatch", "decline", "The source chain belongs to another pattern.");
    if (proposal && review.sourceProposalId !== proposalId) addReason(reasons, "source_proposal_id_mismatch", "decline", "The review references another proposal identity.");
    if (proposal && review.sourceProposalRevision !== proposal.revision) addReason(reasons, "source_proposal_revision_stale", "stale", "The proposal revision changed.");
    if (proposal && review.sourceProposalDigest !== currentProposalDigest) addReason(reasons, "source_proposal_digest_stale", "stale", "The proposal digest changed.");
    if (proposal && canonicalize(review.sourceProposalSnapshot) !== canonicalize(sourceSnapshot(proposal))) addReason(reasons, "immutable_proposal_snapshot_mismatch", "stale", "The review proposal snapshot no longer matches the immutable proposal.");
    if (proposal && initiation && proposal.sourceInitiationId !== initiationId) addReason(reasons, "source_initiation_id_mismatch", "decline", "The proposal references another initiation.");
    if (proposal && initiation && proposal.sourceSnapshot && canonicalize(proposal.sourceSnapshot) !== canonicalize(initiationProposalSnapshot(initiation))) addReason(reasons, "immutable_initiation_snapshot_mismatch", "stale", "The proposal initiation snapshot no longer matches the immutable initiation.");
    if (review.sourceInitiationId && initiation && review.sourceInitiationId !== initiationId) addReason(reasons, "review_initiation_binding_mismatch", "decline", "The review initiation binding is inconsistent.");
    if (normalized.expectedReviewRevision !== undefined && normalized.expectedReviewRevision !== review.revision || record && record.sourceReviewRevision !== review.revision) addReason(reasons, "source_review_revision_stale", "stale", "The review revision changed.");
    if (normalized.expectedReviewDigest && normalized.expectedReviewDigest !== currentReviewDigest || record && record.sourceReviewDigest !== currentReviewDigest) addReason(reasons, "source_review_digest_stale", "stale", "The review digest changed.");
    if (normalized.expectedProposalRevision !== undefined && proposal && normalized.expectedProposalRevision !== proposal.revision) addReason(reasons, "source_proposal_revision_stale", "stale", "The proposal revision changed.");
    if (normalized.expectedProposalDigest && proposal && normalized.expectedProposalDigest !== currentProposalDigest) addReason(reasons, "source_proposal_digest_stale", "stale", "The proposal digest changed.");
    if (normalized.expectedInitiationRevision !== undefined && initiation && normalized.expectedInitiationRevision !== initiation.revision) addReason(reasons, "source_initiation_revision_stale", "stale", "The initiation revision changed.");
    if (normalized.expectedInitiationDigest && initiation && normalized.expectedInitiationDigest !== currentInitiationDigest) addReason(reasons, "source_initiation_digest_stale", "stale", "The initiation digest changed.");
    if (record && (record.sourceInitiationRevision !== initiation?.revision || record.sourceInitiationDigest !== currentInitiationDigest)) addReason(reasons, "source_initiation_stale", "stale", "The initiation revision or digest changed.");
    const contract = validateReviewContract(review); if (!contract.valid) addReason(reasons, contract.code, contract.code === "review_terminal_required" ? "block" : "block", "The review lifecycle, verdict, or aggregate dimensions are invalid.");
    if (review.malformed === true || review.quarantined === true) addReason(reasons, "review_quarantined", "block", "The source review is malformed or quarantined.");
    if (review.collision === true) addReason(reasons, "source_review_collision", "block", "The source review has an unresolved identity collision.");
    if (proposal?.collision === true) addReason(reasons, "source_proposal_collision", "block", "The source proposal has an unresolved identity collision.");
    if (initiation?.collision === true) addReason(reasons, "source_initiation_collision", "block", "The source initiation has an unresolved identity collision.");
    if (review.importedUnproven === true || review.proofStatus === "imported-unproven") addReason(reasons, "review_imported_unproven", "stale", "Imported review provenance is not locally proven.");
    if (proposal?.importedUnproven === true || proposal?.proofStatus === "imported-unproven") addReason(reasons, "proposal_imported_unproven", "stale", "Imported proposal provenance is not locally proven.");
    if (initiation?.importedUnproven === true || initiation?.proofStatus === "imported-unproven") addReason(reasons, "initiation_imported_unproven", "stale", "Imported initiation provenance is not locally proven.");
    if (review.proofStatus !== "proven" || review.sourceProof?.fullGate !== true) addReason(reasons, "review_provenance_unproven", "stale", "Review provenance is not proven.");
    if (proposal && (proposal.proofStatus !== "proven" || proposal.sourceProof?.fullChainProven !== true)) addReason(reasons, "proposal_provenance_unproven", "decline", "Proposal provenance is not proven.");
    if (initiation && (initiation.proofStatus !== "proven" || initiation.sourceProof?.fullChainProven !== true)) addReason(reasons, "initiation_provenance_unproven", "decline", "Initiation provenance is not proven.");
    if (review.status === "stale" || review.stale === true) addReason(reasons, "source_review_stale", "stale", "The source review is stale.");
    if (proposal?.stale === true) addReason(reasons, "source_proposal_stale", "stale", "The source proposal is stale.");
    if (initiation?.stale === true) addReason(reasons, "source_initiation_stale", "stale", "The source initiation is stale.");
    const newerReviews = normalized.reviews.filter((item) => idOf(item, "reviewId") !== reviewId && item.sourceProposalId === review.sourceProposalId && (item.revision > review.revision || item.predecessorReviewId === reviewId || item.supersedesReviewId === reviewId));
    if (newerReviews.length) addReason(reasons, "source_review_superseded", "stale", "A successor review exists.", newerReviews.map((item) => idOf(item, "reviewId")));
    const newerProposals = normalized.proposals.filter((item) => idOf(item, "proposalId") !== proposalId && item.sourceInitiationId === proposal?.sourceInitiationId && (item.revision > proposal?.revision || item.predecessorProposalId === proposalId || item.supersedesProposalId === proposalId));
    if (newerProposals.length) addReason(reasons, "source_proposal_superseded", "stale", "A successor proposal exists.", newerProposals.map((item) => idOf(item, "proposalId")));
    const sortedReasons = stableObjects(reasons);
    return freeze({ valid: sortedReasons.length === 0, reviewRequired: false, normalized, reviewId, proposalId, initiationId, reviewDigest: currentReviewDigest, proposalDigest: currentProposalDigest, initiationDigest: currentInitiationDigest, reasons: sortedReasons });
  }

  function categorizeReview(review, reasons) {
    const verdict = lower(review?.verdict); const status = statusOf(review);
    if (status === "cancelled") addReason(reasons, "review_cancelled", "decline", "The source review was cancelled.");
    else if (verdict === "stale") addReason(reasons, "review_verdict_stale", "stale", "The review requires recreation from current sources.");
    else if (verdict === "reject") addReason(reasons, "review_rejected", "decline", "The review rejects the proposal.");
    else if (verdict === "blocked") addReason(reasons, "review_blocked", "block", "The review identified blocking findings.");
    else if (verdict === "needs_evidence") addReason(reasons, "review_needs_evidence", "evidence", "The review requires more evidence.");
    else if (verdict === "changes_requested") addReason(reasons, "review_changes_requested", "revision", "The review requires a new proposal revision.");
    else if (verdict !== "approve") addReason(reasons, "review_verdict_invalid", "block", "The review verdict is unsupported.");
  }

  function evaluateDecision(source = {}, options = {}) {
    const gate = calculateSourceGate(source, options.record || null);
    if (gate.reviewRequired) return freeze({ created: false, code: "review_required", outcome: null, lifecycle: null, reasons: gate.reasons, conditions: [], nextAction: null, sourceGate: gate });
    const review = gate.normalized.review; const proposal = gate.normalized.proposal || {}; const reasons = [...gate.reasons]; categorizeReview(review, reasons);
    const reviewReasons = new Set(stableStrings([...(review.verdictReasons || []), ...array(review.findings).map((item) => item?.code)]));
    const addFinding = (codes, code, category, message) => { if (codes.some((item) => reviewReasons.has(item))) addReason(reasons, code, category, message); };
    addFinding(["hypothesis_substitution", "hidden_scope_expansion", "forbidden_target", "disguised_forbidden_change", "irreversible_critical_change"], "fundamental_proposal_violation", "decline", "The proposal violates the approved hypothesis or a fundamental boundary.");
    addFinding(["source_provenance_broken", "source_proposal_id_mismatch", "source_pattern_mismatch", "source_project_mismatch"], "source_falsification", "decline", "The source chain is falsified or substituted.");
    addFinding(["protected_target", "forbidden_change_class", "migration_required", "migration_reference_missing", "rollback_required", "rollback_coverage_partial", "compatibility_backwardCompatibility_failed", "compatibility_dataCompatibility_failed", "compatibility_workflowCompatibility_failed", "compatibility_uiCompatibility_failed", "compatibility_exportImportCompatibility_failed", "evidence_conflicting", "same_target_incompatible_operation", "mutually_exclusive_changes"], "decision_blocking_finding", "block", "A protected, compatibility, rollback, migration, evidence, or conflict gate blocks authorization.");
    addFinding(["evidence_missing", "evidence_incomplete", "evidence_stale", "evidence_unproven", "change_evidence_missing", "migration_evidence_incomplete"], "decision_evidence_incomplete", "evidence", "Required evidence is missing, stale, or unproven.");
    addFinding(["schema_upgrade_deferred", "migration_declaration_incomplete", "proposal_title_missing", "proposal_summary_missing", "proposal_baseline_missing", "proposal_target_missing", "change_incomplete", "scope_reference_missing", "hypothesis_reference_missing", "success_criterion_reference_missing", "success_criterion_uncovered", "safeguard_coverage_missing"], "decision_revision_required", "revision", "The submitted proposal requires a new reviewed revision.");
    const risk = lower(review?.risk?.level);
    if (!RISK_LEVELS.includes(risk)) addReason(reasons, "decision_risk_invalid", "block", "The computed review risk is invalid.");
    if (risk === "critical") addReason(reasons, "critical_risk_not_authorizable", "block", "Critical risk cannot be authorized by this policy.");
    if (risk === "high" && lower(review?.verdict) === "approve") {
      const rollback = proposal.rollbackStrategy || {}; const migrationRequired = proposal.compatibilityAssessment?.migrationNeeded === true || array(proposal.migrationRequirements).length > 0;
      const highReady = normalizeText(rollback.summary) && array(rollback.steps).length && normalizeText(rollback.verification) && review.readiness?.rollbackPassed === true && review.readiness?.evidenceComplete === true && review.readiness?.compatibilityPassed === true && review.readiness?.conflictFree === true && (!migrationRequired || review.readiness?.migrationPassed === true) && !array(proposal.proposedChanges).some((item) => item?.irreversible === true) && array(proposal.successCriteria || proposal.sourceSnapshot?.successCriteria).length > 0;
      if (!highReady) addReason(reasons, "high_risk_conditions_incomplete", "block", "High risk authorization conditions are incomplete.");
    }
    if (lower(review?.verdict) === "approve" && review.readiness?.implementationReady !== true) addReason(reasons, "implementation_not_ready", "block", "The review does not prove implementation readiness.");
    if (proposal.compatibilityAssessment?.schemaUpgradeRequired === true && lower(review?.verdict) === "approve") addReason(reasons, "schema_upgrade_requires_revision", "revision", "A schema upgrade declaration requires a separately reviewed proposal revision.");
    const categories = new Set(reasons.map((item) => item.category));
    const outcome = categories.has("stale") ? "stale" : categories.has("decline") ? "decline" : categories.has("block") ? "block" : categories.has("evidence") ? "require_evidence" : categories.has("revision") ? "require_revision" : "authorize";
    const affectedChangeIds = stableStrings(array(review.findings).flatMap((item) => item?.affectedChangeIds)); const evidenceReferences = stableStrings(array(review.evidenceRequests).flatMap((item) => item?.evidenceReferences)); const conditions = [];
    if (outcome === "authorize") {
      conditions.push(condition("use_immutable_proposal_revision", "Use only the authorized proposal revision.", [gate.proposalId]));
      conditions.push(condition("use_immutable_review_snapshot", "Use only the decision source review snapshot.", [gate.reviewId]));
      conditions.push(condition("preserve_scope_and_hypothesis", "Do not expand scope or change the approved hypothesis."));
      conditions.push(condition("preserve_safeguards_and_success_criteria", "Preserve safeguards, rollback obligations, and success criteria."));
      conditions.push(condition("no_direct_application", "This decision does not apply the proposal or permit an immediate schema change."));
      conditions.push(condition("create_separate_successor_artifact", "Create a separate artifact before implementation."));
      conditions.push(condition("recheck_stale_before_transition", "Recheck the immutable source chain before the next transition."));
      if (risk === "high") conditions.push(condition("high_risk_controls", "Keep full rollback, evidence, compatibility, migration, and verification controls active."));
    } else if (outcome === "require_revision") {
      conditions.push(condition("new_proposal_revision_required", "Create a new immutable proposal revision.", affectedChangeIds));
      conditions.push(condition("submitted_proposal_immutable", "Do not mutate the submitted proposal."));
      conditions.push(condition("new_review_required", "A new proposal revision requires a new review."));
      for (const item of stableObjects(review.revisionRequests)) conditions.push(condition(`revision:${item.code}`, item.message || item.code, item.affectedChangeIds));
    } else if (outcome === "require_evidence") {
      conditions.push(condition("collect_evidence", "Collect the requested evidence.", evidenceReferences));
      conditions.push(condition("terminal_review_immutable", "Do not append evidence to the terminal review."));
      conditions.push(condition("new_review_revision_required", "Create a new review revision after evidence changes."));
      for (const item of stableObjects(review.evidenceRequests)) conditions.push(condition(`evidence:${item.code}`, item.message || item.code, [...array(item.affectedChangeIds), ...array(item.evidenceReferences)]));
    } else if (outcome === "block") {
      conditions.push(condition("resolve_blockers", "Resolve all blocking findings and obtain a new review.", affectedChangeIds));
      for (const item of stableObjects(review.blockingFindings)) conditions.push(condition(`blocker:${item.code}`, item.message || item.code, item.affectedChangeIds));
    } else if (outcome === "decline") {
      conditions.push(condition("proposal_identity_declined", "The declined proposal identity cannot proceed.", [gate.proposalId]));
      conditions.push(condition("new_initiation_if_permitted", "Use a new initiation if the policy permits another attempt."));
    } else conditions.push(condition("recreate_from_current_sources", "Recreate or locally revalidate from the current proven source chain."));
    const nextAction = outcome === "authorize" ? "proceed_to_next_stage" : outcome === "require_revision" ? "create_new_proposal_revision" : outcome === "require_evidence" ? "collect_evidence_and_rereview" : outcome === "block" ? (reasons.some((item) => ["fundamental_proposal_violation", "source_falsification"].includes(item.code)) ? "create_new_initiation" : "resolve_blockers_and_rereview") : outcome === "decline" ? (statusOf(review) === "cancelled" ? "no_further_action" : "create_new_initiation") : "recreate_from_current_sources";
    return freeze({ created: true, code: null, outcome, reasons: stableObjects(reasons), conditions: stableObjects(conditions), nextAction, risk: freeze({ level: risk || "invalid", policyVersion: RISK_POLICY_VERSION }), affectedChangeIds, evidenceReferences, revisionRequests: stableObjects(review.revisionRequests), evidenceRequests: stableObjects(review.evidenceRequests), blockers: stableObjects(review.blockingFindings), declineReasons: stableObjects(reasons.filter((item) => item.category === "decline")), migrationDependency: Boolean(proposal.compatibilityAssessment?.migrationNeeded || proposal.compatibilityAssessment?.schemaUpgradeRequired || array(proposal.migrationRequirements).length), rollbackObligations: sourceSnapshot(proposal.rollbackStrategy || {}), compatibilityRestrictions: sourceSnapshot(proposal.compatibilityAssessment || {}), sourceGate: gate });
  }

  function identityPayload(record) { return { projectId: record.projectId, patternId: record.patternId, sourceInitiationId: record.sourceInitiationId, sourceInitiationRevision: record.sourceInitiationRevision, sourceInitiationDigest: record.sourceInitiationDigest, sourceProposalId: record.sourceProposalId, sourceProposalRevision: record.sourceProposalRevision, sourceProposalDigest: record.sourceProposalDigest, sourceReviewId: record.sourceReviewId, sourceReviewRevision: record.sourceReviewRevision, sourceReviewDigest: record.sourceReviewDigest, reviewPolicyVersion: record.reviewPolicyVersion, decisionPolicyVersion: record.decisionPolicyVersion }; }
  function calculateDecisionIdentity(record) { return fingerprint(identityPayload(record)); }
  function digestPayload(record) { return { ...identityPayload(record), outcome: record.outcome, reasons: stableObjects(record.reasons), conditions: stableObjects(record.conditions), nextAction: record.nextAction, risk: record.risk, affectedChangeIds: stableStrings(record.affectedChangeIds), evidenceRequests: stableObjects(record.evidenceRequests), revisionRequests: stableObjects(record.revisionRequests), blockers: stableObjects(record.blockers), declineReasons: stableObjects(record.declineReasons), migrationDependency: record.migrationDependency, rollbackObligations: normalizeObject(record.rollbackObligations), compatibilityRestrictions: normalizeObject(record.compatibilityRestrictions), sourceSnapshots: normalizeObject(record.sourceSnapshots) }; }
  function calculateDecisionDigest(record) { return fingerprint(digestPayload(record)); }

  function createPatternEvolutionDecision(source = {}, input = {}) {
    const evaluation = evaluateDecision(source); if (!evaluation.created) throw decisionError("review_required", "A Stage 47 review is required before a decision.");
    if (evaluation.sourceGate.reasons.some((item) => ["review_terminal_required", "review_lifecycle_verdict_invalid", "review_domain_invalid"].includes(item.code))) throw decisionError("review_invalid", "A structurally valid terminal Stage 47 review is required before a decision.", { reasons: evaluation.sourceGate.reasons });
    const timestamp = injectedTimestamp(input.now); const gate = evaluation.sourceGate; const { review, proposal, initiation } = gate.normalized; const epoch = positiveInteger(input.epoch) || 1;
    const seed = { projectId: gate.normalized.projectId, patternId: gate.normalized.patternId, sourceProposalId: gate.proposalId, sourceProposalRevision: proposal.revision, sourceProposalDigest: gate.proposalDigest, sourceReviewId: gate.reviewId, sourceReviewRevision: review.revision, sourceReviewDigest: gate.reviewDigest, decisionPolicyVersion: POLICY_VERSION };
    const generatedIdentity = fingerprint(seed); const id = normalizeText(input.id || input.decisionId) || `pattern-evolution-decision:${generatedIdentity.slice(8)}`;
    const record = {
      id, decisionId: id, kind: PROGRESS_KIND, type: PROGRESS_KIND, version: VERSION, schemaVersion: SCHEMA_VERSION,
      decisionPolicyVersion: POLICY_VERSION, riskPolicyVersion: RISK_POLICY_VERSION, reviewPolicyVersion: reviewPolicyVersion(review),
      projectId: gate.normalized.projectId, patternId: gate.normalized.patternId, calculationId: gate.normalized.calculationId,
      sourceInitiationId: gate.initiationId, sourceInitiationRevision: initiation.revision, sourceInitiationDigest: gate.initiationDigest,
      sourceProposalId: gate.proposalId, sourceProposalRevision: proposal.revision, sourceProposalDigest: gate.proposalDigest,
      sourceReviewId: gate.reviewId, sourceReviewRevision: review.revision, sourceReviewDigest: gate.reviewDigest,
      sourceSnapshots: freeze({ initiation: sourceSnapshot(initiation), proposal: sourceSnapshot(proposal), review: sourceSnapshot(review) }),
      sourceBinding: freeze({ reviewId: gate.reviewId, reviewRevision: review.revision, reviewDigest: gate.reviewDigest, proposalId: gate.proposalId, proposalRevision: proposal.revision, proposalDigest: gate.proposalDigest, initiationId: gate.initiationId, initiationRevision: initiation.revision, initiationDigest: gate.initiationDigest, validatedAt: timestamp }),
      sourceProof: freeze({ valid: gate.valid, provenanceProven: gate.reasons.every((item) => !item.code.includes("unproven")), current: !gate.reasons.some((item) => item.category === "stale"), issues: gate.reasons.map((item) => item.code) }),
      lifecycle: "draft", status: "draft", outcome: evaluation.outcome, reasons: evaluation.reasons, conditions: evaluation.conditions, nextAction: evaluation.nextAction,
      risk: evaluation.risk, affectedChangeIds: evaluation.affectedChangeIds, evidenceRequests: evaluation.evidenceRequests, revisionRequests: evaluation.revisionRequests, blockers: evaluation.blockers, declineReasons: evaluation.declineReasons,
      migrationDependency: evaluation.migrationDependency, rollbackObligations: evaluation.rollbackObligations, compatibilityRestrictions: evaluation.compatibilityRestrictions,
      imported: false, importedUnproven: false, collision: false, proofStatus: "proven", localBinding: null,
      predecessorDecisionId: normalizeText(input.predecessorDecisionId) || null, supersedesDecisionId: normalizeText(input.supersedesDecisionId) || null,
      originalImport: input.originalImport ? sourceSnapshot(input.originalImport) : null, createdAt: timestamp, updatedAt: timestamp, revision: 1, epoch,
      identity: "", digest: "", audit: [{ event: "created", at: timestamp, revision: 1, sourceReviewId: gate.reviewId, outcome: evaluation.outcome }],
    };
    record.identity = calculateDecisionIdentity(record); record.digest = calculateDecisionDigest(record); const frozen = freeze(record); const report = validatePatternEvolutionDecision(frozen); if (!report.valid) throw decisionError("decision_invalid", "Computed pattern evolution decision is invalid.", { errors: report.errors }); return frozen;
  }

  function validationResult(errors) { const unique = new Map(errors.map((item) => [`${item.code}\0${item.field || ""}`, item])); return freeze({ valid: unique.size === 0, errors: [...unique.values()].sort((a, b) => compare(a.code, b.code) || compare(a.field, b.field)) }); }
  function validatePatternEvolutionDecision(record) {
    const errors = []; const invalid = (code, field = null) => errors.push({ code, field }); try { canonicalize(record); } catch { invalid("corrupted_input"); return validationResult(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.version !== VERSION || record.schemaVersion !== SCHEMA_VERSION || record.decisionPolicyVersion !== POLICY_VERSION || record.riskPolicyVersion !== RISK_POLICY_VERSION) invalid("invalid_header");
    for (const field of ["id", "projectId", "patternId", "calculationId", "sourceInitiationId", "sourceProposalId", "sourceReviewId", "sourceInitiationDigest", "sourceProposalDigest", "sourceReviewDigest", "reviewPolicyVersion", "identity", "digest"]) if (!normalizeText(record?.[field])) invalid("required_field_missing", field);
    if (record?.decisionId !== record?.id || !LIFECYCLES.includes(record?.lifecycle) || record?.status !== record?.lifecycle || !OUTCOMES.includes(record?.outcome) || !NEXT_ACTIONS.includes(record?.nextAction)) invalid("invalid_lifecycle_or_outcome");
    if (!positiveInteger(record?.revision) || !positiveInteger(record?.epoch) || !positiveInteger(record?.sourceInitiationRevision) || !positiveInteger(record?.sourceProposalRevision) || !positiveInteger(record?.sourceReviewRevision) || !isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("invalid_revision");
    if (!record?.sourceSnapshots?.initiation || !record?.sourceSnapshots?.proposal || !record?.sourceSnapshots?.review || !Array.isArray(record?.reasons) || !Array.isArray(record?.conditions) || !Array.isArray(record?.audit) || !record?.sourceBinding || !record?.sourceProof) invalid("invalid_structure");
    if (record?.sourceSnapshots?.initiation && (idOf(record.sourceSnapshots.initiation, "initiationId") !== record.sourceInitiationId || record.sourceSnapshots.initiation.revision !== record.sourceInitiationRevision || initiationDigest(record.sourceSnapshots.initiation) !== record.sourceInitiationDigest)) invalid("initiation_snapshot_mismatch");
    if (record?.sourceSnapshots?.proposal && (idOf(record.sourceSnapshots.proposal, "proposalId") !== record.sourceProposalId || record.sourceSnapshots.proposal.revision !== record.sourceProposalRevision || proposalDigest(record.sourceSnapshots.proposal) !== record.sourceProposalDigest)) invalid("proposal_snapshot_mismatch");
    if (record?.sourceSnapshots?.review && (idOf(record.sourceSnapshots.review, "reviewId") !== record.sourceReviewId || record.sourceSnapshots.review.revision !== record.sourceReviewRevision || reviewDigest(record.sourceSnapshots.review) !== record.sourceReviewDigest)) invalid("review_snapshot_mismatch");
    if (record?.identity && calculateDecisionIdentity(record) !== record.identity) invalid("identity_mismatch");
    if (record?.digest && calculateDecisionDigest(record) !== record.digest) invalid("digest_mismatch");
    const expectedAction = { authorize: "proceed_to_next_stage", require_revision: "create_new_proposal_revision", require_evidence: "collect_evidence_and_rereview", stale: "recreate_from_current_sources" }[record?.outcome]; if (expectedAction && record.nextAction !== expectedAction && record.lifecycle !== "cancelled") invalid("invalid_next_action");
    const expectedTerminal = { authorize: "authorized", require_revision: "revision_required", require_evidence: "evidence_required", block: "blocked", decline: "declined", stale: "stale" }[record?.outcome]; if (TERMINAL_LIFECYCLES.includes(record?.lifecycle) && record.lifecycle !== expectedTerminal && !(record.lifecycle === "cancelled")) invalid("invalid_terminal_outcome");
    if (stableObjects(record?.reasons).length !== array(record?.reasons).length || stableObjects(record?.conditions).length !== array(record?.conditions).length) invalid("duplicate_or_unsorted_derived_values");
    if (record?.predecessorDecisionId && record.predecessorDecisionId === record.id || record?.supersedesDecisionId && record.supersedesDecisionId === record.id || record?.predecessorDecisionId && record.predecessorDecisionId === record.supersedesDecisionId && record.predecessorDecisionId === record.id) invalid("predecessor_cycle");
    return validationResult(errors);
  }
  function requireRecord(record) { const report = validatePatternEvolutionDecision(record); if (!report.valid) throw decisionError("corrupted_input", "Pattern evolution decision is corrupted.", { errors: report.errors }); }
  function serializePatternEvolutionDecision(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternEvolutionDecision(value) { let parsed; try { parsed = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw decisionError("corrupted_input", "Decision payload is malformed."); } requireRecord(parsed); return freeze(parsed); }
  function safeNormalizePatternEvolutionDecision(value) { try { return freeze({ record: deserializePatternEvolutionDecision(value), corrupted: false, errors: [] }); } catch (error) { return freeze({ record: null, corrupted: true, errors: error?.details?.errors || [{ code: error?.code || "corrupted_input", field: null }] }); } }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw decisionError("revision_conflict", "Decision revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw decisionError("identity_conflict", "Decision identity changed."); }
  function transition(record, nextLifecycle, source = null, command = {}) {
    requireRecord(record); checkConcurrency(record, command); if (TERMINAL_LIFECYCLES.includes(record.lifecycle)) throw decisionError("terminal_immutable", "Terminal decisions are immutable."); if (record.lifecycle === "stale") throw decisionError("stale_recreate_required", "A stale decision cannot resume."); const timestamp = injectedTimestamp(command.now);
    let current = record; if (source) { const projection = projectPatternEvolutionDecision(record, source); if (projection.stale && nextLifecycle !== "stale") throw decisionError("source_stale", "The source chain changed; create a successor decision."); current = projection.record; }
    const allowed = { draft: ["deciding", "cancelled", "stale"], deciding: ["ready", "revision_required", "evidence_required", "blocked", "declined", "cancelled", "stale"], ready: ["authorized", "revision_required", "evidence_required", "blocked", "declined", "cancelled", "stale"] };
    if (!allowed[current.lifecycle]?.includes(nextLifecycle)) throw decisionError("invalid_transition", "Decision lifecycle transition is invalid.");
    const expected = { authorized: "authorize", revision_required: "require_revision", evidence_required: "require_evidence", blocked: "block", declined: "decline", stale: "stale" }[nextLifecycle]; if (expected && current.outcome !== expected) throw decisionError("outcome_transition_mismatch", "Computed outcome does not permit the requested transition.");
    const next = clone(current); next.lifecycle = nextLifecycle; next.status = nextLifecycle; next.revision += 1; next.updatedAt = timestamp; next.audit = [...array(next.audit), { event: nextLifecycle, at: timestamp, revision: next.revision, outcome: next.outcome }]; next.digest = calculateDecisionDigest(next); return freeze(next);
  }
  function startDecision(record, source, command = {}) { return transition(record, "deciding", source, command); }
  function markDecisionReady(record, source, command = {}) { return transition(record, "ready", source, command); }
  function cancelDecision(record, source, command = {}) { const next = transition(record, "cancelled", source, command); const mutable = clone(next); mutable.nextAction = "no_further_action"; mutable.digest = calculateDecisionDigest(mutable); return freeze(mutable); }
  function finalizeDecision(record, source, command = {}) { const target = { authorize: "authorized", require_revision: "revision_required", require_evidence: "evidence_required", block: "blocked", decline: "declined", stale: "stale" }[record.outcome]; if (record.outcome === "authorize" && record.lifecycle !== "ready") throw decisionError("ready_required", "Authorization requires the ready lifecycle."); return transition(record, target, source, command); }
  function decidePatternEvolution(source = {}, input = {}) { let record = createPatternEvolutionDecision(source, input); record = startDecision(record, source, { now: input.now, expectedRevision: record.revision, expectedIdentity: record.identity }); if (record.outcome === "authorize") record = markDecisionReady(record, source, { now: input.now, expectedRevision: record.revision, expectedIdentity: record.identity }); return finalizeDecision(record, source, { now: input.now, expectedRevision: record.revision, expectedIdentity: record.identity }); }

  function projectPatternEvolutionDecision(record, source = {}) {
    requireRecord(record); const evaluation = evaluateDecision(source, { record }); const next = clone(record); let stale = !evaluation.created || evaluation.outcome === "stale" || evaluation.sourceGate?.reasons?.some((item) => item.category === "stale");
    if (!stale && (evaluation.outcome !== record.outcome || canonicalize(evaluation.reasons) !== canonicalize(record.reasons) || record.decisionPolicyVersion !== POLICY_VERSION)) stale = true;
    if (record.importedUnproven || record.collision) stale = true;
    if (stale && !TERMINAL_LIFECYCLES.includes(record.lifecycle)) { next.lifecycle = "stale"; next.status = "stale"; next.outcome = "stale"; next.nextAction = "recreate_from_current_sources"; next.reasons = stableObjects([...(evaluation.reasons || []), reason(record.importedUnproven ? "decision_imported_unproven" : record.collision ? "decision_collision" : "decision_source_stale", "stale", "The persisted decision cannot authorize the current source chain.")]); next.conditions = [condition("recreate_from_current_sources", "Create a successor from current proven sources.")]; next.digest = calculateDecisionDigest(next); }
    return freeze({ record: freeze(next), effectiveLifecycle: stale ? "stale" : record.lifecycle, lifecycle: stale ? "stale" : record.lifecycle, outcome: stale ? "stale" : record.outcome, nextAction: stale ? "recreate_from_current_sources" : record.nextAction, stale, proofStatus: record.importedUnproven ? "imported-unproven" : stale ? "unproven" : "proven", sourceGate: evaluation.sourceGate, reasons: stale ? next.reasons : record.reasons, conditions: stale ? next.conditions : record.conditions });
  }
  function isDecisionStale(record, source) { return projectPatternEvolutionDecision(record, source).stale; }

  function classifyDuplicate(existing, candidate) {
    const records = array(existing).map((item) => item?.state || item); const sameId = records.find((item) => item.id === candidate.id); if (sameId && canonicalize(sameId) === canonicalize(candidate)) return freeze({ status: "exact_duplicate", record: sameId }); if (sameId) return freeze({ status: "collision", record: sameId, reason: "id_payload_mismatch" });
    const authorized = records.find((item) => item.lifecycle === "authorized" && calculateDecisionIdentity(item) === calculateDecisionIdentity(candidate)); if (authorized) return freeze({ status: "duplicate_authorized", record: authorized });
    const sameIdentity = records.find((item) => item.identity === candidate.identity); if (sameIdentity && sameIdentity.digest === candidate.digest) return freeze({ status: "semantic_duplicate", record: sameIdentity }); if (sameIdentity) return freeze({ status: "collision", record: sameIdentity, reason: "identity_payload_mismatch" }); return freeze({ status: "unique", record: null });
  }

  function makeImportedPatternEvolutionDecisionUnproven(record, options = {}) { requireRecord(record); const next = clone(record); next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.collision = options.collision === true; next.localBinding = { state: "unproven", reason: normalizeText(options.reason || "import_identity_unproven"), importedSourceReviewId: record.sourceReviewId, checkedAt: injectedTimestamp(options.now, record.updatedAt) }; return freeze(next); }
  function remapKnownReferences(value, map, key = "") { if (typeof value === "string") return REFERENCE_FIELDS.has(key) ? (map.get(value) || value) : value; if (Array.isArray(value)) return value.map((item) => typeof item === "string" && REFERENCE_FIELDS.has(key) ? (map.get(item) || item) : remapKnownReferences(item, map, key)); if (value && typeof value === "object") { const result = {}; for (const child of Object.keys(value)) result[child] = remapKnownReferences(value[child], map, child); return result; } return value; }
  function remapPatternEvolutionDecision(record, referenceMap) {
    requireRecord(record); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {})); const next = remapKnownReferences(clone(record), map); next.id = map.get(record.id) || record.id; next.decisionId = next.id; next.sourceSnapshots = remapKnownReferences(clone(record.sourceSnapshots), map); next.sourceInitiationId = map.get(record.sourceInitiationId) || record.sourceInitiationId; next.sourceProposalId = map.get(record.sourceProposalId) || record.sourceProposalId; next.sourceReviewId = map.get(record.sourceReviewId) || record.sourceReviewId; next.projectId = map.get(record.projectId) || record.projectId; next.patternId = map.get(record.patternId) || record.patternId; next.calculationId = map.get(record.calculationId) || record.calculationId; next.sourceInitiationDigest = initiationDigest(next.sourceSnapshots.initiation); next.sourceProposalDigest = proposalDigest(next.sourceSnapshots.proposal); next.sourceReviewDigest = reviewDigest(next.sourceSnapshots.review); next.sourceBinding = { ...next.sourceBinding, initiationId: next.sourceInitiationId, initiationDigest: next.sourceInitiationDigest, proposalId: next.sourceProposalId, proposalDigest: next.sourceProposalDigest, reviewId: next.sourceReviewId, reviewDigest: next.sourceReviewDigest }; next.predecessorDecisionId = record.predecessorDecisionId ? map.get(record.predecessorDecisionId) || record.predecessorDecisionId : null; next.supersedesDecisionId = record.supersedesDecisionId ? map.get(record.supersedesDecisionId) || record.supersedesDecisionId : null; next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.collision = true; next.localBinding = { state: "unproven", reason: "remapped_import", importedSourceReviewId: record.sourceReviewId, checkedAt: record.updatedAt }; next.identity = calculateDecisionIdentity(next); next.digest = calculateDecisionDigest(next); return freeze(next);
  }
  function importPatternEvolutionDecision(existing, serialized, options = {}) {
    let parsed; try { parsed = deserializePatternEvolutionDecision(serialized); } catch (error) { return freeze({ status: "malformed", record: null, changed: false, quarantine: { reasonCode: error.code || "corrupted_input", errors: error?.details?.errors || [] } }); }
    const remapped = options.referenceMap ? remapPatternEvolutionDecision(parsed, options.referenceMap) : parsed; const duplicate = classifyDuplicate(existing, remapped); if (duplicate.status !== "unique") return freeze({ ...duplicate, changed: false });
    if (options.source) { const gate = calculateSourceGate(options.source, remapped); if (gate.reviewRequired) return freeze({ status: "missing_review", record: null, changed: false }); if (gate.reasons.some((item) => item.code === "proposal_required")) return freeze({ status: "missing_proposal", record: null, changed: false }); if (gate.reasons.some((item) => item.code === "initiation_required")) return freeze({ status: "missing_initiation", record: null, changed: false }); }
    return freeze({ status: "imported-unproven", record: makeImportedPatternEvolutionDecisionUnproven(remapped, { now: options.now || remapped.updatedAt, collision: options.collision === true }), changed: true });
  }
  function revalidatePatternEvolutionDecision(record, source = {}, command = {}) {
    requireRecord(record); const gate = calculateSourceGate(source); if (!gate.valid) throw decisionError("source_not_equivalent", "Local source chain is not a proven current equivalent.", { reasons: gate.reasons });
    if (canonicalize(record.sourceSnapshots.initiation) !== canonicalize(sourceSnapshot(gate.normalized.initiation)) || canonicalize(record.sourceSnapshots.proposal) !== canonicalize(sourceSnapshot(gate.normalized.proposal)) || canonicalize(record.sourceSnapshots.review) !== canonicalize(sourceSnapshot(gate.normalized.review))) throw decisionError("source_not_equivalent", "Local source semantics differ from the imported immutable snapshots.");
    const timestamp = injectedTimestamp(command.now); const epoch = positiveInteger(command.epoch) || record.epoch + 1; const successorId = `pattern-evolution-decision:${fingerprint({ predecessorDecisionId: record.id, epoch, sourceReviewDigest: gate.reviewDigest, decisionPolicyVersion: POLICY_VERSION }).slice(8)}`; return createPatternEvolutionDecision(source, { id: successorId, now: timestamp, epoch, predecessorDecisionId: record.id, supersedesDecisionId: record.id, originalImport: { decisionId: record.id, imported: record.imported, importedUnproven: record.importedUnproven, sourceSnapshots: record.sourceSnapshots, metadata: record.originalImport } });
  }

  async function loadSource(repository, projectId, reviewId = null, proposalId = null) {
    const reviewRecord = await repository.getPatternEvolutionProposalReview(projectId, reviewId, null, proposalId); if (!reviewRecord) throw decisionError("review_required", "A Stage 47 review is required."); const review = reviewRecord.state;
    const proposalRecord = await repository.getPatternEvolutionProposal(projectId, review.sourceProposalId, review.calculationId); if (!proposalRecord) throw decisionError("proposal_required", "The source proposal is required."); const proposal = proposalRecord.state;
    const initiationRecord = await repository.getPatternEvolutionInitiation(projectId, proposal.sourceInitiationId, proposal.calculationId); if (!initiationRecord) throw decisionError("initiation_required", "The source initiation is required."); const initiation = initiationRecord.state;
    const reviews = await repository.listPatternEvolutionProposalReviews(projectId, review.calculationId, proposal.id); const proposals = await repository.listPatternEvolutionProposals(projectId, review.calculationId); const initiations = await repository.listPatternEvolutionInitiations(projectId, review.calculationId); const decisions = repository.listPatternEvolutionDecisions ? await repository.listPatternEvolutionDecisions(projectId, review.calculationId) : [];
    return normalizeSource({ projectId, patternId: review.patternId, calculationId: review.calculationId, review, proposal, initiation, reviews, proposals, initiations, decisions });
  }
  async function readForProject(repository, projectId, decisionId = null, reviewId = null, proposalId = null) { let source; try { source = await loadSource(repository, projectId, reviewId, proposalId); } catch (error) { return freeze({ projectId, reviewRequired: error?.code === "review_required", missingReview: error?.code === "review_required", missingProposal: error?.code === "proposal_required", missingInitiation: error?.code === "initiation_required", effectiveLifecycle: "missing", outcome: null, reasonCode: error?.code || "review_required", availableCommands: [] }); } const stored = await repository.getPatternEvolutionDecision(projectId, decisionId, source.calculationId, source.review.id); if (!stored) return freeze({ ...source, decisionRecord: null, rawDecision: null, effectiveLifecycle: "draft", evaluation: evaluateDecision(source), availableCommands: ["create", "open-latest"] }); const projection = projectPatternEvolutionDecision(stored.state, source); const commands = projection.effectiveLifecycle === "draft" ? ["start", "cancel"] : projection.effectiveLifecycle === "deciding" ? (stored.state.outcome === "authorize" ? ["ready", "cancel"] : ["finalize", "cancel"]) : projection.effectiveLifecycle === "ready" ? ["finalize", "cancel"] : []; if (stored.state.importedUnproven || projection.stale) commands.push("revalidate"); commands.push("open-latest"); return freeze({ ...source, decisionRecord: stored, rawDecision: stored.state, ...projection, availableCommands: [...new Set(commands)] }); }
  async function createForProject(repository, projectId, input = {}) { const source = await loadSource(repository, projectId, input.reviewId || input.sourceReviewId || null, input.proposalId || input.sourceProposalId || null); const existing = await repository.listPatternEvolutionDecisions(projectId, source.calculationId); const record = createPatternEvolutionDecision(source, { ...clone(input), epoch: existing.reduce((maximum, item) => Math.max(maximum, item.state?.epoch || 0), 0) + 1 }); const duplicate = classifyDuplicate(existing, record); if (duplicate.status === "duplicate_authorized" || duplicate.status === "semantic_duplicate" || duplicate.status === "exact_duplicate") throw decisionError(duplicate.status, "A decision already exists for this immutable source identity."); if (duplicate.status === "collision") throw decisionError("decision_collision", "Decision identity collision detected."); await repository.savePatternEvolutionDecision(projectId, record, { timestamp: record.updatedAt }); return readForProject(repository, projectId, record.id, record.sourceReviewId, record.sourceProposalId); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, POLICY_VERSION, RISK_POLICY_VERSION, PROGRESS_KIND, DEFAULT_TIMESTAMP, LIFECYCLES, STATUSES: LIFECYCLES, TERMINAL_LIFECYCLES, TERMINAL_STATUSES: TERMINAL_LIFECYCLES, OUTCOMES, NEXT_ACTIONS, RISK_LEVELS, TERMINAL_REVIEW_STATES, REFERENCE_FIELDS,
    PatternEvolutionDecisionError, canonicalize, fingerprint, normalizeText, normalizeObject, stableStrings, sourceSnapshot, proposalDigest, initiationDigest, reviewDigest, normalizeSource, validateReviewContract, calculateSourceGate, evaluateDecision,
    identityPayload, calculateDecisionIdentity, duplicateIdentity: calculateDecisionIdentity, digestPayload, calculateDecisionDigest, createPatternEvolutionDecision, createDecision: createPatternEvolutionDecision, decidePatternEvolution,
    validatePatternEvolutionDecision, serializePatternEvolutionDecision, deserializePatternEvolutionDecision, safeNormalizePatternEvolutionDecision, transition, startDecision, markDecisionReady, finalizeDecision, cancelDecision,
    projectPatternEvolutionDecision, isDecisionStale, classifyDuplicate, makeImportedPatternEvolutionDecisionUnproven, remapPatternEvolutionDecision, importPatternEvolutionDecision, revalidatePatternEvolutionDecision, loadSource, readForProject, createForProject,
  });
  globalObject.YarnAIPatternEvolutionDecision = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
