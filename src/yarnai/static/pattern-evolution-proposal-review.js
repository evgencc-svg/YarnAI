"use strict";

(function initializePatternEvolutionProposalReview(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const POLICY_VERSION = "pattern-evolution-proposal-review/v1";
  const PROGRESS_KIND = "PATTERN_EVOLUTION_PROPOSAL_REVIEW";
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const STATUSES = Object.freeze(["draft", "reviewing", "ready", "approved", "changes_requested", "rejected", "cancelled", "stale"]);
  const TERMINAL_STATUSES = Object.freeze(["approved", "changes_requested", "rejected", "cancelled"]);
  const VERDICTS = Object.freeze(["approve", "changes_requested", "needs_evidence", "blocked", "reject", "stale"]);
  const RISK_LEVELS = Object.freeze(["low", "moderate", "high", "critical"]);
  const DIMENSION_NAMES = Object.freeze([
    "sourceIntegrity", "initiationAlignment", "proposalCompleteness", "traceabilityReview",
    "scopeReview", "safeguardReview", "successCriteriaReview", "compatibilityReview",
    "migrationReview", "rollbackReview", "evidenceReview", "riskReview",
    "conflictReview", "implementationReadinessReview",
  ]);
  const REFERENCE_FIELDS = new Set([
    "id", "reviewId", "projectId", "patternId", "calculationId", "sourceProposalId",
    "sourceInitiationId", "sourceClosureId", "predecessorReviewId", "supersedesReviewId",
    "sourceScopeReference", "sourceHypothesisReference", "rollbackReference",
    "successCriteriaReferences", "criterionReferences", "dependencies", "affectedChangeIds",
    "changeIds", "evidenceReferences", "scopeReferences", "safeguardReferences",
  ]);

  class PatternEvolutionProposalReviewError extends Error {
    constructor(code, message, details = null) { super(message); this.name = "PatternEvolutionProposalReviewError"; this.code = code; this.userMessage = message; this.details = details; }
  }

  function reviewError(code, message, details) { return new PatternEvolutionProposalReviewError(code, message, details); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function lower(value) { return normalizeText(value).toLowerCase(); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function injectedTimestamp(...values) { const result = values.find(isTimestamp); if (!result) throw reviewError("timestamp_required", "An injected timestamp is required."); return result; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (seen.has(value)) throw reviewError("cyclic_input", "Cyclic review data is not supported.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
    else result = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    seen.delete(value); return result;
  }
  function fingerprint(value) { const input = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function normalizeObject(value) { if (value === undefined) return null; if (typeof value === "string") return normalizeText(value); if (Array.isArray(value)) return value.map(normalizeObject); if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) { const result = {}; for (const key of Object.keys(value).sort(compare)) result[key] = normalizeObject(value[key]); return result; } return value; }
  function stableStrings(values) { return [...new Set(array(values).map((value) => normalizeText(typeof value === "object" ? value?.id || value?.key || value?.name : value)).filter(Boolean))].sort(compare); }
  function idOf(value, ...fields) { for (const field of ["id", ...fields]) { const id = normalizeText(value?.[field]); if (id) return id; } return ""; }
  function statusOf(value) { return lower(value?.status || value?.lifecycle || value?.lifecycleState); }
  function proposalDigest(value) { return normalizeText(value?.identity || value?.proposalDigest) || fingerprint(proposalSnapshot(value)); }
  function normalizedTarget(value) { return lower(value).replace(/[\\/]+/g, ".").replace(/\s*\.\s*/g, ".").replace(/\.+/g, "."); }
  function referencesArea(target, area) { const left = normalizedTarget(target); const right = normalizedTarget(area); return Boolean(left && right && (left === right || left.startsWith(`${right}.`))); }
  function hasText(value) { return Boolean(normalizeText(value)); }
  function hasValue(value) { return typeof value === "boolean" || typeof value === "number" || hasText(value) || Array.isArray(value) && value.length > 0 || value && typeof value === "object" && Object.keys(value).length > 0; }

  function proposalSnapshot(proposal) { return freeze(normalizeObject(clone(proposal || {}))); }
  function semanticProposalSnapshot(value) {
    const copy = clone(value || {});
    for (const field of ["status", "lifecycle", "verdict", "proofStatus", "stale", "imported", "importedUnproven", "collision", "revision", "identity", "updatedAt", "audit", "sourceBinding"]) delete copy[field];
    return normalizeObject(copy);
  }
  function normalizeSource(source = {}) {
    const proposal = source?.proposal || source?.sourceProposal || (source?.kind === "PATTERN_EVOLUTION_PROPOSAL" ? source : null);
    return freeze({
      projectId: normalizeText(source?.projectId || proposal?.projectId),
      patternId: normalizeText(source?.patternId || proposal?.patternId),
      calculationId: normalizeText(source?.calculationId || proposal?.calculationId),
      proposal: proposal ? clone(proposal) : null,
      initiation: source?.initiation ? clone(source.initiation) : null,
      proposals: array(source?.proposals).map(clone),
      reviews: array(source?.reviews).map((item) => clone(item?.state || item)),
    });
  }

  function calculateSourceProof(source = {}, record = null) {
    const normalized = normalizeSource(source); const proposal = normalized.proposal; const snapshot = proposalSnapshot(proposal); const digest = proposal ? proposalDigest(proposal) : ""; const proposalId = idOf(proposal, "proposalId");
    const bound = record?.localBinding?.state === "proven" && record.localBinding.proposalId === proposalId && record.localBinding.snapshotDigest === fingerprint(semanticProposalSnapshot(snapshot));
    const currentSnapshot = !record || canonicalize(record.sourceProposalSnapshot) === canonicalize(snapshot);
    const semanticEquivalent = Boolean(record && canonicalize(semanticProposalSnapshot(record.sourceProposalSnapshot)) === canonicalize(semanticProposalSnapshot(snapshot)));
    const duplicateKey = globalObject.YarnAIPatternEvolutionProposal?.duplicateIdentity?.(proposal);
    const initiationSnapshotMatches = Boolean(proposal && (!normalized.initiation || canonicalize(proposal.sourceSnapshot) === canonicalize(globalObject.YarnAIPatternEvolutionProposal?.sourceSnapshot?.(normalized.initiation) || proposal.sourceSnapshot)));
    const submittedDuplicates = proposal && duplicateKey ? normalized.proposals.filter((item) => item && item.id !== proposal.id && statusOf(item) === "submitted" && globalObject.YarnAIPatternEvolutionProposal?.duplicateIdentity?.(item) === duplicateKey) : [];
    const checks = {
      proposalResolved: Boolean(proposal),
      sameProject: Boolean(proposal && normalized.projectId && proposal.projectId === normalized.projectId && (!record || record.projectId === normalized.projectId)),
      samePattern: Boolean(proposal && normalized.patternId && proposal.patternId === normalized.patternId && (!record || record.patternId === normalized.patternId)),
      proposalIdMatches: Boolean(proposal && (!record || record.sourceProposalId === proposalId)),
      submitted: statusOf(proposal) === "submitted",
      submitVerdict: lower(proposal?.verdict) === "submit",
      current: Boolean(proposal && proposal.stale !== true),
      provenanceVerified: Boolean(proposal && proposal.proofStatus === "proven" && proposal.importedUnproven !== true && proposal.sourceProof?.fullChainProven === true),
      collisionFree: Boolean(proposal && proposal.collision !== true && submittedDuplicates.length === 0),
      initiationLinked: Boolean(proposal && proposal.sourceInitiationId && proposal.sourceSnapshot && (!normalized.initiation || idOf(normalized.initiation, "initiationId") === proposal.sourceInitiationId)),
      revisionCurrent: Boolean(proposal && proposal.sourceProof?.revisionCurrent !== false && (!record || bound || record.sourceProposalRevision === proposal.revision)),
      digestCurrent: Boolean(proposal && proposal.sourceProof?.digestCurrent !== false && (!record || bound || record.sourceProposalDigest === digest)),
      snapshotMatches: Boolean(proposal && proposal.sourceProof?.snapshotMatches !== false && initiationSnapshotMatches && (!record || bound || currentSnapshot)),
      semanticEquivalent: Boolean(proposal && (!record || currentSnapshot || semanticEquivalent)),
      importProven: Boolean(proposal && proposal.proofStatus !== "imported-unproven" && proposal.importedUnproven !== true),
    };
    const required = ["proposalResolved", "sameProject", "samePattern", "proposalIdMatches", "submitted", "submitVerdict", "current", "provenanceVerified", "collisionFree", "initiationLinked", "revisionCurrent", "digestCurrent", "snapshotMatches", "importProven"];
    const issues = required.filter((key) => !checks[key]).sort(compare);
    return freeze({ ...checks, sourceProposalDigest: digest, currentSnapshot: snapshot, duplicateSubmittedCount: submittedDuplicates.length, fullGate: issues.length === 0, issues });
  }

  function finding(code, dimension, severity, message, affectedChangeIds = [], evidenceReferences = []) {
    return { code, dimension, severity, message, affectedChangeIds: stableStrings(affectedChangeIds), evidenceReferences: stableStrings(evidenceReferences), blocking: ["block", "reject", "stale"].includes(severity), revisionNeeded: severity === "change", evidenceNeeded: severity === "evidence" };
  }
  function sortFindings(values) {
    const map = new Map();
    for (const item of values) { const key = `${item.code}\0${item.dimension}\0${item.affectedChangeIds.join("\0")}`; if (!map.has(key)) map.set(key, item); }
    return [...map.values()].sort((a, b) => compare(a.dimension, b.dimension) || compare(a.code, b.code) || compare(a.affectedChangeIds.join("\0"), b.affectedChangeIds.join("\0")));
  }
  function dependencyCycles(changes) {
    const ids = new Set(changes.map((item) => item.id)); const visiting = new Set(); const visited = new Set(); const cycles = new Set();
    function visit(id, path) { if (visiting.has(id)) { const start = path.indexOf(id); cycles.add(path.slice(start).concat(id).join("->")); return; } if (visited.has(id)) return; visiting.add(id); const item = changes.find((candidate) => candidate.id === id); for (const dependency of stableStrings(item?.dependencies).filter((value) => ids.has(value))) visit(dependency, [...path, id]); visiting.delete(id); visited.add(id); }
    for (const item of [...changes].sort((a, b) => compare(a.id, b.id))) visit(item.id, []); return [...cycles].sort(compare);
  }
  function compatibilityValueBad(value) { const text = lower(typeof value === "object" ? value?.state || value?.verdict || canonicalize(value) : value); return ["incompatible", "failed", "unsupported", "breaking"].some((token) => text.includes(token)); }
  function changeOperation(change) { return lower(change.operation || change.action || change.changeType || change.description).split(" ")[0]; }
  function evidenceItems(proposal, changes) {
    const explicit = array(proposal.evidence || proposal.evidenceReferences || proposal.reviewEvidence);
    if (explicit.length) return explicit.map((item, index) => typeof item === "string" ? { id: item, claim: item, affectedChangeIds: changes.map((change) => change.id), status: "proven", fresh: true } : { ...clone(item), id: normalizeText(item?.id || item?.evidenceId) || `evidence:${index + 1}` });
    return changes.filter((change) => hasText(change.rationale) && hasText(change.expectedEffect)).map((change) => ({ id: `embedded:${change.id}`, claim: change.expectedEffect, affectedChangeIds: [change.id], status: "proven", fresh: true }));
  }

  function assessReview(record) {
    const proposal = record.sourceProposalSnapshot || {}; const source = proposal.sourceSnapshot || {}; const changes = array(proposal.proposedChanges).map((item) => clone(item)); const findings = [];
    const add = (...args) => findings.push(finding(...args)); const proof = record.sourceProof || {};
    if (record.status === "stale") add("review_lifecycle_stale", "sourceIntegrity", "stale", "The review lifecycle is stale.");
    if (!proof.proposalResolved) add("proposal_required", "sourceIntegrity", "block", "A source proposal is required.");
    if (!proof.sameProject) add("source_project_mismatch", "sourceIntegrity", "reject", "The proposal belongs to another project.");
    if (!proof.samePattern) add("source_pattern_mismatch", "sourceIntegrity", "reject", "The proposal belongs to another pattern.");
    if (!proof.proposalIdMatches) add("source_proposal_id_mismatch", "sourceIntegrity", "reject", "The proposal identity was substituted.");
    if (!proof.submitted) add("proposal_not_submitted", "sourceIntegrity", "block", "Only a submitted proposal may be reviewed.");
    if (!proof.submitVerdict) add("proposal_verdict_not_submit", "sourceIntegrity", "block", "The source proposal does not have a submit verdict.");
    if (!proof.provenanceVerified || !proof.initiationLinked) add("source_provenance_broken", "sourceIntegrity", "reject", "The proposal provenance chain is not proven.");
    if (!proof.collisionFree) add("source_collision_or_duplicate", "sourceIntegrity", "block", "The source identity is duplicated or colliding.");
    if (!proof.current || !proof.revisionCurrent || !proof.digestCurrent || !proof.snapshotMatches) add("source_snapshot_stale", "sourceIntegrity", "stale", "The current proposal no longer matches the immutable review source.");
    if (!proof.importProven || record.importedUnproven) add("imported_source_unproven", "sourceIntegrity", "stale", "Imported source identity requires local proof.");

    const sourceInitiationId = idOf(source, "initiationId"); const proposalInitiationId = normalizeText(proposal.sourceInitiationId);
    if (!sourceInitiationId || sourceInitiationId !== proposalInitiationId) add("initiation_identity_mismatch", "initiationAlignment", "reject", "The immutable initiation identity does not match the proposal.");
    if (lower(proposal.hypothesisAlignment) === "contradicts" || proposal.expectedValueSupported === false) add("hypothesis_substitution", "initiationAlignment", "reject", "The proposal substitutes the approved hypothesis.");
    const approvedConstraints = stableStrings(source.constraints); const proposalConstraints = stableStrings(proposal.constraints); for (const constraint of approvedConstraints) if (!proposalConstraints.includes(constraint)) add("initiation_constraint_lost", "initiationAlignment", "change", "An approved initiation constraint is not preserved.");

    if (!hasText(proposal.title)) add("proposal_title_missing", "proposalCompleteness", "change", "Proposal title is missing.");
    if (!hasText(proposal.summary)) add("proposal_summary_missing", "proposalCompleteness", "change", "Proposal summary is missing.");
    if (!hasText(proposal.baselineDescription)) add("proposal_baseline_missing", "proposalCompleteness", "change", "Proposal baseline is missing.");
    if (!hasText(proposal.targetDescription)) add("proposal_target_missing", "proposalCompleteness", "change", "Proposal target is missing.");
    if (normalizeText(proposal.baselineDescription) && normalizeText(proposal.baselineDescription) === normalizeText(proposal.targetDescription)) add("baseline_equals_target", "proposalCompleteness", "reject", "The target does not change the baseline.");
    if (changes.length === 0) add("proposed_changes_missing", "proposalCompleteness", "change", "At least one atomic change is required.");

    const ids = changes.map((item) => normalizeText(item.id)); const idSet = new Set(ids.filter(Boolean));
    if (ids.some((id) => !id)) add("change_id_missing", "traceabilityReview", "block", "Every change requires a stable id.");
    if (idSet.size !== ids.filter(Boolean).length) add("duplicate_change_id", "traceabilityReview", "block", "Change ids are duplicated.", ids);
    const targets = changes.map((item) => normalizedTarget(item.target)).filter(Boolean); if (new Set(targets).size !== targets.length) add("duplicate_normalized_target", "traceabilityReview", "block", "Normalized targets are duplicated.", changes.filter((item, index) => targets.indexOf(normalizedTarget(item.target)) !== index).map((item) => item.id));
    const scope = stableStrings([...(source.evolutionScope?.areas || []), ...(source.evolutionScope?.capabilities || []), ...(source.evolutionScope?.parameters || []), ...(source.evolutionScope?.experiments || [])]);
    const criteria = new Set(array(source.successCriteria).map((item) => idOf(item, "criterionId")).filter(Boolean)); const protectedAreas = stableStrings(source.protectedAreas); const forbidden = stableStrings(source.forbiddenChangeClasses).map(lower); const allowed = stableStrings(source.allowedChangeClasses).map(lower);
    for (const change of changes) {
      const id = normalizeText(change.id); const scopeRef = normalizeText(change.sourceScopeReference); const target = normalizeText(change.target); const changeClass = lower(change.changeClass); const criterionRefs = stableStrings(change.successCriteriaReferences); const dependencies = stableStrings(change.dependencies);
      if (!scopeRef || !scope.includes(scopeRef)) add("scope_reference_missing", "traceabilityReview", "change", "A change does not reference approved scope.", [id]);
      if (!hasText(change.sourceHypothesisReference)) add("hypothesis_reference_missing", "traceabilityReview", "change", "A change does not reference the approved hypothesis.", [id]);
      if (!criterionRefs.length || criterionRefs.some((ref) => !criteria.has(ref))) add("success_criterion_reference_missing", "successCriteriaReview", "change", "A change lacks a valid criterion reference.", [id]);
      if (dependencies.includes(id)) add("self_dependency", "traceabilityReview", "block", "A change depends on itself.", [id]);
      for (const dependency of dependencies) if (!idSet.has(dependency)) add("orphan_dependency", "traceabilityReview", "block", "A change depends on an unknown change.", [id, dependency]);
      const protectedTarget = protectedAreas.some((area) => referencesArea(target, area)); const excludedTarget = stableStrings(source.evolutionScope?.exclusions).some((area) => referencesArea(target, area));
      if (!scope.some((area) => referencesArea(target, area)) && !protectedTarget && !excludedTarget) add("hidden_scope_expansion", "scopeReview", "reject", "The target expands beyond approved scope.", [id]);
      if (excludedTarget) add("forbidden_target", "scopeReview", "reject", "An explicitly excluded target cannot be changed.", [id]);
      if (protectedAreas.some((area) => referencesArea(target, area))) add("protected_target", "scopeReview", "block", "A protected target cannot be changed.", [id]);
      if (!allowed.includes(changeClass)) add("unauthorized_change_class", "scopeReview", "block", "The change class is not approved.", [id]);
      if (forbidden.includes(changeClass)) add("forbidden_change_class", "scopeReview", "block", "The change class is forbidden.", [id]);
      const prose = lower(`${change.description || ""} ${change.rationale || ""}`); if (!forbidden.includes(changeClass) && forbidden.some((item) => prose.includes(item)) || /(?:remove|disable|bypass)\s+(?:safety|safeguard|constraint)/.test(prose)) add("disguised_forbidden_change", "scopeReview", "reject", "The declared class disguises a forbidden operation.", [id]);
      if (change.atomic === false || !hasText(change.description) || !hasText(change.rationale) || !hasText(change.expectedEffect)) add("change_incomplete", "proposalCompleteness", "change", "A change is not atomic and complete.", [id]);
    }
    for (const cycle of dependencyCycles(changes)) add("dependency_cycle", "traceabilityReview", "block", `Dependency cycle: ${cycle}.`, cycle.split("->"));
    for (const criterion of criteria) if (!changes.some((item) => stableStrings(item.successCriteriaReferences).includes(criterion))) add("success_criterion_uncovered", "successCriteriaReview", "change", "An approved success criterion is not covered.", [], [criterion]);
    if (approvedConstraints.length && approvedConstraints.some((item) => !proposalConstraints.includes(item))) add("safeguard_coverage_missing", "safeguardReview", "change", "Approved safeguards are not fully carried into the proposal.");
    if (!findings.some((item) => ["protected_target", "forbidden_change_class", "disguised_forbidden_change"].includes(item.code)) && approvedConstraints.every((item) => proposalConstraints.includes(item))) { /* pass */ }

    const compatibility = proposal.compatibilityAssessment || {}; const compatibilityFields = ["backwardCompatibility", "dataCompatibility", "workflowCompatibility", "uiCompatibility", "exportImportCompatibility"];
    for (const field of compatibilityFields) { if (!hasValue(compatibility[field])) add(`compatibility_${field}_missing`, "compatibilityReview", "change", `Compatibility field ${field} is missing.`); else if (compatibilityValueBad(compatibility[field])) add(`compatibility_${field}_failed`, "compatibilityReview", "block", `Compatibility field ${field} reports an incompatibility.`); }
    const breaking = changes.some((item) => ["breaking", "incompatible"].includes(lower(item.compatibilityImpact))) || ["breaking", "high", "critical"].includes(lower(compatibility.breakingChangeRisk));
    const migrationSensitive = changes.filter((item) => lower(item.migrationImpact) !== "none" || ["breaking", "incompatible"].includes(lower(item.compatibilityImpact)));
    const migrationRequired = breaking || compatibility.migrationNeeded === true || migrationSensitive.length > 0; const migrations = array(proposal.migrationRequirements); const changeIds = new Set(ids);
    if (migrationRequired && migrations.length === 0) add("migration_required", "migrationReview", "block", "A required migration declaration is absent.", migrationSensitive.map((item) => item.id));
    if (!migrationRequired && compatibility.migrationNeeded === true) add("migration_declaration_mismatch", "migrationReview", "change", "Migration declaration contradicts the reviewed changes.");
    for (const migration of migrations) {
      const affected = stableStrings(migration.affectedChangeIds); const id = idOf(migration);
      if (!id || !hasText(migration.target) || !hasText(migration.reason) || !hasText(migration.stepsSummary || migration.forwardSteps || migration.steps)) add("migration_declaration_incomplete", "migrationReview", "change", "Migration declaration is incomplete.", affected);
      if (migrationRequired && (!affected.length || !hasText(migration.verification) || !hasText(migration.rollbackReference) || migration.idempotent !== true || !hasText(migration.dataPreservation))) add("migration_evidence_incomplete", "migrationReview", "evidence", "Migration verification, rollback, idempotency, and data preservation are not proven.", affected);
      for (const ref of affected) if (!changeIds.has(ref)) add("migration_reference_missing", "migrationReview", "block", "Migration references an unknown change.", [ref]);
      if (migration.rollbackReference && !changeIds.has(migration.rollbackReference) && !migrations.some((item) => item.id === migration.rollbackReference)) add("migration_rollback_reference_missing", "migrationReview", "block", "Migration rollback reference does not resolve.", [migration.rollbackReference]);
    }
    if (compatibility.schemaUpgradeRequired === true || migrations.some((item) => item.schemaUpgradeRequired === true)) add("schema_upgrade_deferred", "implementationReadinessReview", "change", "Schema upgrade requires a future separately authorized implementation.");

    const rollbackRequired = changes.filter((item) => breaking || ["data", "schema", "workflow", "promoted-behavior", "persisted-state", "export-import"].includes(lower(item.migrationImpact)) || ["high", "critical"].includes(lower(item.riskLevel)) || ["breaking", "compatibility-sensitive", "incompatible"].includes(lower(item.compatibilityImpact)));
    const rollback = proposal.rollbackStrategy || {}; const covered = new Set(stableStrings(rollback.affectedChangeIds));
    if (rollbackRequired.length && (!hasText(rollback.summary) || !array(rollback.steps).length || !hasText(rollback.verification))) add("rollback_required", "rollbackReview", "block", "A complete rollback strategy is required.", rollbackRequired.map((item) => item.id));
    for (const change of rollbackRequired) if (!covered.has(change.id) && !hasText(change.rollbackAction)) add("rollback_coverage_partial", "rollbackReview", "block", "Rollback does not cover a sensitive change.", [change.id]);
    for (const ref of covered) if (!changeIds.has(ref)) add("rollback_reference_missing", "rollbackReview", "block", "Rollback references an unknown change.", [ref]);
    const rollbackOrder = [...new Set(array(rollback.affectedChangeIds).map(normalizeText).filter(Boolean))]; for (const item of changes) for (const dependency of stableStrings(item.dependencies)) if (rollbackOrder.includes(item.id) && rollbackOrder.includes(dependency) && rollbackOrder.indexOf(item.id) > rollbackOrder.indexOf(dependency)) add("rollback_order_conflict", "rollbackReview", "block", "Rollback order conflicts with dependency order.", [item.id, dependency]);
    const irreversible = changes.filter((item) => item.irreversible === true || lower(item.rollbackAction) === "irreversible"); if (irreversible.some((item) => ["high", "critical"].includes(lower(item.riskLevel)) || breaking)) add("irreversible_critical_change", "rollbackReview", "reject", "An irreversible critical change cannot be approved.", irreversible.map((item) => item.id));

    const evidence = evidenceItems(proposal, changes); const evidenceIds = evidence.map((item) => idOf(item, "evidenceId"));
    if (changes.length && evidence.length === 0) add("evidence_missing", "evidenceReview", "evidence", "No evidence supports the proposed changes.", ids);
    if (new Set(evidenceIds).size !== evidenceIds.length) add("duplicate_evidence_reference", "evidenceReview", "change", "Evidence identities are duplicated.", [], evidenceIds);
    for (const item of evidence) {
      const affected = stableStrings(item.affectedChangeIds || item.changeIds); const status = lower(item.status || item.proofStatus || "proven");
      if (!hasText(item.claim || item.description || item.result) || !affected.length || affected.some((id) => !changeIds.has(id))) add("evidence_incomplete", "evidenceReview", "evidence", "Evidence is incomplete or unlinked.", affected, [idOf(item, "evidenceId")]);
      if (["conflicting", "contradicted", "failed"].includes(status)) add("evidence_conflicting", "evidenceReview", "block", "Evidence conflicts with the claimed outcome.", affected, [idOf(item, "evidenceId")]);
      if (item.stale === true || item.fresh === false || status === "stale") add("evidence_stale", "evidenceReview", "evidence", "Evidence is stale.", affected, [idOf(item, "evidenceId")]);
      if (item.importedUnproven === true || ["unproven", "imported-unproven", "unverifiable"].includes(status)) add("evidence_unproven", "evidenceReview", "evidence", "Evidence is not locally proven.", affected, [idOf(item, "evidenceId")]);
    }
    for (const change of changes) if (!evidence.some((item) => stableStrings(item.affectedChangeIds || item.changeIds).includes(change.id))) add("change_evidence_missing", "evidenceReview", "evidence", "A change has no supporting evidence.", [change.id]);

    const byTarget = new Map(); for (const change of changes) { const target = normalizedTarget(change.target); if (!byTarget.has(target)) byTarget.set(target, []); byTarget.get(target).push(change); }
    for (const [target, items] of byTarget) if (target && items.length > 1) { const operations = new Set(items.map(changeOperation)); if (operations.size > 1 || items.some((item) => item.mutuallyExclusive === true)) add("same_target_incompatible_operation", "conflictReview", "block", "The same target has incompatible operations.", items.map((item) => item.id)); }
    if (changes.some((item) => item.mutuallyExclusive === true)) add("mutually_exclusive_changes", "conflictReview", "block", "Mutually exclusive changes were submitted together.", changes.filter((item) => item.mutuallyExclusive === true).map((item) => item.id));
    if (migrationRequired && rollbackRequired.length && migrations.some((item) => item.reversible === false) && hasText(rollback.summary)) add("migration_rollback_conflict", "conflictReview", "block", "Migration and rollback declarations conflict.", rollbackRequired.map((item) => item.id));
    if (breaking && lower(compatibility.breakingChangeRisk) === "low") add("compatibility_change_class_conflict", "conflictReview", "block", "Breaking changes contradict the compatibility declaration.", migrationSensitive.map((item) => item.id));

    const preliminary = sortFindings(findings); let riskScore = 0;
    if (breaking) riskScore += 3; if (migrationRequired) riskScore += 2; if (changes.some((item) => ["data", "schema", "persisted-state"].includes(lower(item.migrationImpact)))) riskScore += 2;
    if (changes.some((item) => ["workflow", "ui", "export-import"].includes(lower(item.migrationImpact)))) riskScore += 1; if (changes.length >= 4) riskScore += 1; if (new Set(targets).size >= 4) riskScore += 1;
    if (dependencyCycles(changes).length || changes.some((item) => stableStrings(item.dependencies).length >= 2)) riskScore += 1; if (preliminary.some((item) => item.dimension === "rollbackReview")) riskScore += 2; if (preliminary.some((item) => item.dimension === "evidenceReview")) riskScore += 2; if (preliminary.some((item) => item.dimension === "conflictReview")) riskScore += 2; if (irreversible.length) riskScore += 4; if (!proof.provenanceVerified || !proof.importProven) riskScore += 3;
    const riskLevel = riskScore >= 7 ? "critical" : riskScore >= 4 ? "high" : riskScore >= 2 ? "moderate" : "low";
    if (riskLevel === "critical" && irreversible.length) findings.push(finding("critical_risk_irreversible", "riskReview", "reject", "Critical irreversible risk requires a new proposal or initiation.", irreversible.map((item) => item.id)));
    else if (riskLevel === "critical" && rollbackRequired.length && (!hasText(rollback.summary) || !hasText(rollback.verification))) findings.push(finding("critical_risk_uncontrolled", "riskReview", "block", "Critical risk is not controlled by rollback.", rollbackRequired.map((item) => item.id)));

    const sorted = sortFindings(findings); const dimensions = {};
    for (const name of DIMENSION_NAMES) {
      const own = sorted.filter((item) => item.dimension === name); const precedence = ["stale", "reject", "block", "evidence", "change"]; const severity = precedence.find((value) => own.some((item) => item.severity === value));
      dimensions[name] = freeze({ state: severity || "pass", reasons: own.map((item) => item.code), evidenceReferences: stableStrings(own.flatMap((item) => item.evidenceReferences)), affectedChangeIds: stableStrings(own.flatMap((item) => item.affectedChangeIds)), blocking: own.some((item) => item.blocking), revisionNeeded: own.some((item) => item.revisionNeeded), evidenceNeeded: own.some((item) => item.evidenceNeeded) });
    }
    const severities = new Set(sorted.map((item) => item.severity)); const verdict = severities.has("stale") ? "stale" : severities.has("reject") ? "reject" : severities.has("block") ? "blocked" : severities.has("evidence") ? "needs_evidence" : severities.has("change") ? "changes_requested" : "approve";
    const reasons = [...new Set(sorted.map((item) => item.code))].sort(compare); const blockingFindings = sorted.filter((item) => item.blocking); const revisionRequests = sorted.filter((item) => item.revisionNeeded); const evidenceRequests = sorted.filter((item) => item.evidenceNeeded);
    const readiness = freeze({ sourceValid: proof.fullGate === true && !record.importedUnproven, traceabilityComplete: dimensions.traceabilityReview.state === "pass", scopeValid: dimensions.scopeReview.state === "pass", safeguardsValid: dimensions.safeguardReview.state === "pass", criteriaComplete: dimensions.successCriteriaReview.state === "pass", compatibilityPassed: dimensions.compatibilityReview.state === "pass", migrationPassed: dimensions.migrationReview.state === "pass", rollbackPassed: dimensions.rollbackReview.state === "pass", evidenceComplete: dimensions.evidenceReview.state === "pass", conflictFree: dimensions.conflictReview.state === "pass", implementationReady: verdict === "approve", overallReady: verdict === "approve" });
    dimensions.riskReview = freeze({ ...dimensions.riskReview, state: riskLevel, score: riskScore }); dimensions.implementationReadinessReview = freeze({ ...dimensions.implementationReadinessReview, state: readiness.implementationReady ? "pass" : dimensions.implementationReadinessReview.state === "pass" ? "not_ready" : dimensions.implementationReadinessReview.state });
    return freeze({ dimensions: freeze(dimensions), findings: freeze(sorted), blockingFindings: freeze(blockingFindings), revisionRequests: freeze(revisionRequests), evidenceRequests: freeze(evidenceRequests), risk: freeze({ level: riskLevel, score: riskScore }), readiness, verdict, reasons });
  }

  function identityPayload(record) { return { sourceProposalId: record.sourceProposalId, sourceProposalRevision: record.sourceProposalRevision, sourceProposalDigest: record.sourceProposalDigest, projectId: record.projectId, patternId: record.patternId, policyVersion: record.policyVersion }; }
  function duplicateIdentity(record) { return fingerprint(identityPayload(record)); }
  function finalize(record) {
    const assessment = assessReview(record); record.dimensions = assessment.dimensions; record.findings = assessment.findings; record.blockingFindings = assessment.blockingFindings; record.revisionRequests = assessment.revisionRequests; record.evidenceRequests = assessment.evidenceRequests; record.risk = assessment.risk; record.readiness = assessment.readiness; record.verdict = assessment.verdict; record.verdictReasons = assessment.reasons; record.identity = duplicateIdentity(record); return freeze(record);
  }
  function createPatternEvolutionProposalReview(source = {}, input = {}) {
    const normalized = normalizeSource(source); const proposal = normalized.proposal; if (!proposal) throw reviewError("proposal_required", "A Stage 46 proposal is required before review."); const timestamp = injectedTimestamp(input.now); const sourceProposalId = idOf(proposal, "proposalId"); const digest = proposalDigest(proposal); const epoch = positiveInteger(input.epoch) || 1; const identity = fingerprint({ sourceProposalId, sourceProposalRevision: proposal.revision, sourceProposalDigest: digest, projectId: normalized.projectId, patternId: normalized.patternId, policyVersion: POLICY_VERSION }); const id = normalizeText(input.id || input.reviewId) || `pattern-evolution-proposal-review:${identity.slice(8)}`;
    const record = { id, reviewId: id, kind: PROGRESS_KIND, type: PROGRESS_KIND, version: VERSION, schemaVersion: SCHEMA_VERSION, policyVersion: POLICY_VERSION, projectId: normalized.projectId, patternId: normalized.patternId, calculationId: normalized.calculationId, sourceProposalId, sourceProposalRevision: proposal.revision, sourceProposalDigest: digest, sourceInitiationId: normalizeText(proposal.sourceInitiationId), status: "draft", lifecycle: "draft", sourceProposalSnapshot: proposalSnapshot(proposal), sourceBinding: { proposalId: sourceProposalId, revision: proposal.revision, digest, snapshotDigest: fingerprint(proposalSnapshot(proposal)), validatedAt: timestamp }, localBinding: null, sourceProof: calculateSourceProof(normalized), proofStatus: "proven", imported: false, importedUnproven: false, collision: false, predecessorReviewId: normalizeText(input.predecessorReviewId) || null, supersedesReviewId: normalizeText(input.supersedesReviewId) || null, dimensions: null, findings: [], blockingFindings: [], revisionRequests: [], evidenceRequests: [], risk: null, readiness: null, verdict: "blocked", verdictReasons: [], createdAt: timestamp, updatedAt: timestamp, revision: 1, epoch, identity: null, audit: [{ event: "created", at: timestamp, revision: 1, sourceProposalId }] };
    const result = finalize(record); const report = validatePatternEvolutionProposalReview(result); if (!report.valid) throw reviewError("review_invalid", "Computed review is invalid.", { errors: report.errors }); return result;
  }

  function validationResult(errors) { const unique = new Map(errors.map((item) => [`${item.code}\0${item.field || ""}`, item])); return freeze({ valid: unique.size === 0, errors: [...unique.values()].sort((a, b) => compare(a.code, b.code) || compare(a.field, b.field)) }); }
  function validatePatternEvolutionProposalReview(record) {
    const errors = []; const invalid = (code, field = null) => errors.push({ code, field }); try { canonicalize(record); } catch { invalid("corrupted_input"); return validationResult(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.version !== VERSION || record.schemaVersion !== SCHEMA_VERSION || record.policyVersion !== POLICY_VERSION) invalid("invalid_header");
    if (!record?.id || record.reviewId !== record.id || !record.projectId || !record.patternId || !record.calculationId || !record.sourceProposalId || !record.sourceInitiationId) invalid("invalid_identity");
    if (!STATUSES.includes(record?.status) || record.lifecycle !== record.status || !VERDICTS.includes(record?.verdict)) invalid("invalid_lifecycle");
    if (!positiveInteger(record?.revision) || !positiveInteger(record?.epoch) || !isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("invalid_revision");
    if (!record?.sourceProposalSnapshot || !record?.sourceProof || !record?.sourceBinding || !record?.identity || !record?.dimensions || !record?.readiness || !record?.risk || !Array.isArray(record?.findings) || !Array.isArray(record?.audit)) invalid("invalid_structure");
    if (record?.sourceProposalSnapshot && record.sourceProposalId !== idOf(record.sourceProposalSnapshot, "proposalId")) invalid("source_snapshot_identity_mismatch");
    if (record?.sourceProposalSnapshot && record.sourceProposalRevision !== record.sourceProposalSnapshot.revision) invalid("source_snapshot_revision_mismatch");
    if (record?.sourceProposalSnapshot && record.sourceProposalDigest !== proposalDigest(record.sourceProposalSnapshot)) invalid("source_snapshot_digest_mismatch");
    if (record?.identity && record.identity !== duplicateIdentity(record)) invalid("identity_mismatch");
    if (record?.dimensions && DIMENSION_NAMES.some((name) => !record.dimensions[name])) invalid("dimension_missing");
    if (record?.risk && !RISK_LEVELS.includes(record.risk.level)) invalid("invalid_risk");
    if (record && TERMINAL_STATUSES.includes(record.status)) { const expected = { approved: "approve", changes_requested: ["changes_requested", "needs_evidence", "blocked"], rejected: "reject" }[record.status]; if (Array.isArray(expected) ? !expected.includes(record.verdict) : expected && record.verdict !== expected) invalid("impossible_verdict_status"); }
    if (!record?.importedUnproven && record?.dimensions) { const assessed = assessReview(record); for (const field of ["dimensions", "findings", "blockingFindings", "revisionRequests", "evidenceRequests", "risk", "readiness", "verdict", "verdictReasons"]) if (canonicalize(record[field]) !== canonicalize(assessed[field === "verdictReasons" ? "reasons" : field])) invalid("derived_value_mismatch", field); }
    return validationResult(errors);
  }
  function requireRecord(record) { const report = validatePatternEvolutionProposalReview(record); if (!report.valid) throw reviewError("corrupted_input", "Pattern evolution proposal review is corrupted.", { errors: report.errors }); }
  function serializePatternEvolutionProposalReview(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternEvolutionProposalReview(value) { let record; try { record = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw reviewError("corrupted_input", "Review payload is malformed."); } requireRecord(record); return freeze(record); }
  function safeNormalizePatternEvolutionProposalReview(value) { try { return freeze({ record: deserializePatternEvolutionProposalReview(value), corrupted: false, errors: [] }); } catch (error) { return freeze({ record: null, corrupted: true, errors: error?.details?.errors || [{ code: error?.code || "corrupted_input", field: null }] }); } }
  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw reviewError("revision_conflict", "Review revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw reviewError("identity_conflict", "Review identity changed."); }
  function transition(record, nextStatus, source = null, command = {}) {
    requireRecord(record); checkConcurrency(record, command); if (TERMINAL_STATUSES.includes(record.status)) throw reviewError("terminal_immutable", "Terminal reviews are immutable."); if (record.status === "stale") throw reviewError("stale_recreate_required", "A stale review cannot resume its lifecycle."); const timestamp = injectedTimestamp(command.now);
    let current = record; if (source) { const projection = projectPatternEvolutionProposalReview(record, source); if (projection.effectiveStatus === "stale" && nextStatus !== "stale") throw reviewError("source_stale", "The source changed; recreate or revalidate the review."); current = projection.record; }
    const allowed = { draft: ["reviewing", "cancelled", "stale"], reviewing: ["ready", "changes_requested", "rejected", "cancelled", "stale"], ready: ["approved", "changes_requested", "rejected", "cancelled", "stale"] }; if (!allowed[current.status]?.includes(nextStatus)) throw reviewError("invalid_transition", "Review lifecycle transition is invalid.");
    if (nextStatus === "approved" && current.verdict !== "approve") throw reviewError("approval_not_supported", "Only an approve verdict can enter approved."); if (nextStatus === "changes_requested" && !["changes_requested", "needs_evidence", "blocked"].includes(current.verdict)) throw reviewError("changes_request_not_supported", "Computed verdict does not request changes."); if (nextStatus === "rejected" && current.verdict !== "reject") throw reviewError("rejection_not_supported", "Only a reject verdict can enter rejected.");
    const next = clone(current); next.status = nextStatus; next.lifecycle = nextStatus; next.revision += 1; next.updatedAt = timestamp; next.audit = [...array(next.audit), { event: nextStatus, at: timestamp, revision: next.revision, verdict: next.verdict }]; return finalize(next);
  }
  function startReview(record, source, command = {}) { return transition(record, "reviewing", source, command); }
  function markReady(record, source, command = {}) { return transition(record, "ready", source, command); }
  function approveReview(record, source, command = {}) { return transition(record, "approved", source, command); }
  function requestChanges(record, source, command = {}) { return transition(record, "changes_requested", source, command); }
  function rejectReview(record, source, command = {}) { return transition(record, "rejected", source, command); }
  function cancelReview(record, source, command = {}) { return transition(record, "cancelled", source, command); }
  function markStale(record, source, command = {}) { return transition(record, "stale", source, command); }
  function finalizeReview(record, source, command = {}) { if (record.verdict === "approve") return approveReview(record, source, command); if (["changes_requested", "needs_evidence", "blocked"].includes(record.verdict)) return requestChanges(record, source, command); if (record.verdict === "reject") return rejectReview(record, source, command); return markStale(record, source, command); }

  function projectPatternEvolutionProposalReview(record, source = {}) {
    requireRecord(record); const proof = calculateSourceProof(source, record); const next = clone(record); next.sourceProof = proof; if (!proof.fullGate || record.importedUnproven) { next.status = "stale"; next.lifecycle = "stale"; } const projected = finalize(next); return freeze({ record: projected, effectiveStatus: projected.status, stale: projected.status === "stale", proofStatus: record.importedUnproven ? "imported-unproven" : proof.fullGate ? "proven" : "unproven", verdict: projected.verdict, readiness: projected.readiness, risk: projected.risk, dimensions: projected.dimensions, findings: projected.findings, verdictReasons: projected.verdictReasons, sourceProof: proof });
  }
  function makeImportedPatternEvolutionProposalReviewUnproven(record, options = {}) {
    requireRecord(record); const next = clone(record); next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.collision = options.collision === true; next.localBinding = { state: "unproven", reason: normalizeText(options.reason || "import_identity_unproven"), importedSourceProposalId: record.sourceProposalId, checkedAt: injectedTimestamp(options.now, record.updatedAt) }; return freeze(next);
  }
  function revalidatePatternEvolutionProposalReview(record, source = {}, command = {}) {
    requireRecord(record); const normalized = normalizeSource(source); if (!normalized.proposal) throw reviewError("proposal_required", "Local proposal is required for revalidation."); const proof = calculateSourceProof(normalized, record); if (!proof.semanticEquivalent || !proof.sameProject || !proof.samePattern || !proof.submitted || !proof.submitVerdict || !proof.provenanceVerified || !proof.collisionFree) throw reviewError("source_not_equivalent", "Local proposal is not a proven semantic equivalent of the imported snapshot.", { issues: proof.issues }); const timestamp = injectedTimestamp(command.now); const epoch = positiveInteger(command.epoch) || record.epoch + 1; const newId = `pattern-evolution-proposal-review:${fingerprint({ predecessor: record.id, localProposalId: idOf(normalized.proposal, "proposalId"), localRevision: normalized.proposal.revision, localDigest: proposalDigest(normalized.proposal), epoch }).slice(8)}`; const next = clone(record); next.id = newId; next.reviewId = newId; next.status = "draft"; next.lifecycle = "draft"; next.revision = 1; next.epoch = epoch; next.predecessorReviewId = record.id; next.supersedesReviewId = record.id; next.imported = false; next.importedUnproven = false; next.proofStatus = "proven"; next.collision = false; next.localBinding = { state: "proven", proposalId: idOf(normalized.proposal, "proposalId"), revision: normalized.proposal.revision, digest: proposalDigest(normalized.proposal), snapshotDigest: fingerprint(semanticProposalSnapshot(proposalSnapshot(normalized.proposal))), validatedAt: timestamp }; next.sourceProof = calculateSourceProof(normalized, next); next.createdAt = timestamp; next.updatedAt = timestamp; next.audit = [{ event: "revalidated", at: timestamp, revision: 1, predecessorReviewId: record.id }]; return finalize(next);
  }

  function remapReference(value, map, key) { if (typeof value === "string") return REFERENCE_FIELDS.has(key) ? (map.get(value) || value) : value; if (Array.isArray(value)) return value.map((item) => typeof item === "string" && REFERENCE_FIELDS.has(key) ? (map.get(item) || item) : remapReference(item, map, key)); if (value && typeof value === "object") { const result = {}; for (const child of Object.keys(value)) result[child] = remapReference(value[child], map, child); return result; } return value; }
  function remapPatternEvolutionProposalReview(record, referenceMap) {
    requireRecord(record); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {})); const ref = (value) => typeof value === "string" ? (map.get(value) || value) : value; const refs = (values) => array(values).map(ref); const next = clone(record);
    next.id = ref(record.id); next.reviewId = next.id; next.projectId = ref(record.projectId); next.patternId = ref(record.patternId); next.calculationId = ref(record.calculationId); next.sourceProposalId = ref(record.sourceProposalId); next.sourceInitiationId = ref(record.sourceInitiationId); next.predecessorReviewId = ref(record.predecessorReviewId); next.supersedesReviewId = ref(record.supersedesReviewId);
    const proposal = clone(record.sourceProposalSnapshot); proposal.id = ref(proposal.id); proposal.proposalId = ref(proposal.proposalId); proposal.identity = ref(proposal.identity); proposal.projectId = ref(proposal.projectId); proposal.patternId = ref(proposal.patternId); proposal.calculationId = ref(proposal.calculationId); proposal.sourceInitiationId = ref(proposal.sourceInitiationId); proposal.sourceInitiationDigest = ref(proposal.sourceInitiationDigest); proposal.sourceClosureId = ref(proposal.sourceClosureId); if (proposal.sourceBinding) { proposal.sourceBinding = { ...clone(proposal.sourceBinding), digest: ref(proposal.sourceBinding.digest) }; }
    if (proposal.sourceSnapshot) {
      const initiation = proposal.sourceSnapshot; initiation.id = ref(initiation.id); initiation.initiationId = ref(initiation.initiationId); initiation.identity = ref(initiation.identity); initiation.sourceDigest = ref(initiation.sourceDigest); initiation.projectId = ref(initiation.projectId); initiation.patternId = ref(initiation.patternId); initiation.calculationId = ref(initiation.calculationId); initiation.sourceClosureId = ref(initiation.sourceClosureId);
      initiation.successCriteria = array(initiation.successCriteria).map((item) => ({ ...clone(item), id: ref(item?.id), criterionId: ref(item?.criterionId) }));
    }
    proposal.proposedChanges = array(proposal.proposedChanges).map((item) => ({ ...clone(item), id: ref(item?.id), sourceScopeReference: ref(item?.sourceScopeReference), sourceHypothesisReference: ref(item?.sourceHypothesisReference), successCriteriaReferences: refs(item?.successCriteriaReferences), dependencies: refs(item?.dependencies) }));
    proposal.migrationRequirements = array(proposal.migrationRequirements).map((item) => ({ ...clone(item), id: ref(item?.id), affectedChangeIds: refs(item?.affectedChangeIds), rollbackReference: ref(item?.rollbackReference) }));
    proposal.rollbackStrategy = { ...clone(proposal.rollbackStrategy || {}), affectedChangeIds: refs(proposal.rollbackStrategy?.affectedChangeIds) };
    for (const field of ["evidence", "reviewEvidence"]) if (Array.isArray(proposal[field])) proposal[field] = proposal[field].map((item) => ({ ...clone(item), id: ref(item?.id), evidenceId: ref(item?.evidenceId), affectedChangeIds: refs(item?.affectedChangeIds), changeIds: refs(item?.changeIds) }));
    next.sourceProposalSnapshot = proposal; next.findings = array(next.findings).map((item) => ({ ...clone(item), affectedChangeIds: refs(item?.affectedChangeIds), evidenceReferences: refs(item?.evidenceReferences) })); next.blockingFindings = array(next.blockingFindings).map((item) => ({ ...clone(item), affectedChangeIds: refs(item?.affectedChangeIds), evidenceReferences: refs(item?.evidenceReferences) })); next.revisionRequests = array(next.revisionRequests).map((item) => ({ ...clone(item), affectedChangeIds: refs(item?.affectedChangeIds), evidenceReferences: refs(item?.evidenceReferences) })); next.evidenceRequests = array(next.evidenceRequests).map((item) => ({ ...clone(item), affectedChangeIds: refs(item?.affectedChangeIds), evidenceReferences: refs(item?.evidenceReferences) }));
    for (const name of DIMENSION_NAMES) if (next.dimensions?.[name]) next.dimensions[name] = { ...clone(next.dimensions[name]), affectedChangeIds: refs(next.dimensions[name].affectedChangeIds), evidenceReferences: refs(next.dimensions[name].evidenceReferences) };
    next.audit = array(next.audit).map((item) => ({ ...clone(item), sourceProposalId: ref(item?.sourceProposalId), predecessorReviewId: ref(item?.predecessorReviewId) })); next.sourceProposalDigest = proposalDigest(next.sourceProposalSnapshot); next.sourceProposalRevision = next.sourceProposalSnapshot.revision; next.sourceBinding = { ...clone(record.sourceBinding), proposalId: next.sourceProposalId, digest: next.sourceProposalDigest, snapshotDigest: fingerprint(next.sourceProposalSnapshot) };
    next.imported = true; next.importedUnproven = true; next.proofStatus = "imported-unproven"; next.collision = true; next.localBinding = { state: "unproven", reason: "remapped_import", importedSourceProposalId: record.sourceProposalId, checkedAt: record.updatedAt }; next.identity = duplicateIdentity(next); return freeze(next);
  }
  function importPatternEvolutionProposalReview(existing, serialized, options = {}) {
    let parsed; try { parsed = deserializePatternEvolutionProposalReview(serialized); } catch (error) { return freeze({ status: "malformed", record: null, changed: false, quarantine: { reasonCode: error.code || "corrupted_input" } }); }
    const remapped = options.referenceMap ? remapPatternEvolutionProposalReview(parsed, options.referenceMap) : parsed; const records = array(existing).map((item) => item?.state || item); const exact = records.find((item) => item.id === remapped.id); if (exact && canonicalize(exact) === canonicalize(remapped)) return freeze({ status: "duplicate", record: exact, changed: false }); if (exact) return freeze({ status: "collision", record: null, changed: false, reason: "semantic_payload_mismatch" }); const semantic = records.find((item) => duplicateIdentity(item) === duplicateIdentity(remapped)); if (semantic) return freeze({ status: semantic.status === "approved" ? "duplicate_approved" : "semantic_duplicate", record: semantic, changed: false }); return freeze({ status: "imported-unproven", record: makeImportedPatternEvolutionProposalReviewUnproven(remapped, { now: options.now || remapped.updatedAt, collision: options.collision === true }), changed: true });
  }

  async function loadSource(repository, projectId, proposalId = null) {
    const proposalRecord = await repository.getPatternEvolutionProposal(projectId, proposalId); if (!proposalRecord) throw reviewError("proposal_required", "A Stage 46 proposal is required."); const proposal = proposalRecord.state; const initiationRecord = await repository.getPatternEvolutionInitiation(projectId, proposal.sourceInitiationId, proposal.calculationId); const proposals = await repository.listPatternEvolutionProposals(projectId, proposal.calculationId); const reviews = repository.listPatternEvolutionProposalReviews ? await repository.listPatternEvolutionProposalReviews(projectId, proposal.calculationId, proposal.id) : []; return normalizeSource({ projectId, patternId: proposal.patternId, calculationId: proposal.calculationId, proposal, initiation: initiationRecord?.state || null, proposals: proposals.map((item) => item.state), reviews });
  }
  async function readForProject(repository, projectId, reviewId = null, proposalId = null) { let source; try { source = await loadSource(repository, projectId, proposalId); } catch (error) { return freeze({ projectId, proposalRequired: true, missingProposal: true, effectiveStatus: "missing", verdict: "blocked", reasonCode: error?.code || "proposal_required", availableCommands: [] }); } const stored = await repository.getPatternEvolutionProposalReview(projectId, reviewId, source.calculationId, source.proposal.id); if (!stored) return freeze({ ...source, reviewRecord: null, rawReview: null, effectiveStatus: "draft", verdict: calculateSourceProof(source).fullGate ? "approve" : "blocked", availableCommands: ["create", "open-latest"] }); const projection = projectPatternEvolutionProposalReview(stored.state, source); const commands = projection.effectiveStatus === "draft" ? ["start", "cancel"] : projection.effectiveStatus === "reviewing" ? ["ready", "finalize", "cancel"] : projection.effectiveStatus === "ready" ? ["finalize", "cancel"] : []; if (stored.state.importedUnproven || projection.stale) commands.push("revalidate"); commands.push("open-latest"); return freeze({ ...source, reviewRecord: stored, rawReview: stored.state, ...projection, availableCommands: [...new Set(commands)] }); }
  async function createForProject(repository, projectId, input = {}) { const source = await loadSource(repository, projectId, input.proposalId || input.sourceProposalId || null); const existing = await repository.listPatternEvolutionProposalReviews(projectId, source.calculationId); const identity = fingerprint({ sourceProposalId: source.proposal.id, sourceProposalRevision: source.proposal.revision, sourceProposalDigest: proposalDigest(source.proposal), projectId, patternId: source.patternId, policyVersion: POLICY_VERSION }); if (existing.some((item) => item.state?.identity === identity)) throw reviewError("duplicate_review_identity", "A review already exists for this immutable proposal revision."); const record = createPatternEvolutionProposalReview(source, { ...clone(input), epoch: existing.reduce((maximum, item) => Math.max(maximum, item.state?.epoch || 0), 0) + 1 }); await repository.savePatternEvolutionProposalReview(projectId, record, { timestamp: record.updatedAt }); return readForProject(repository, projectId, record.id, record.sourceProposalId); }

  const api = Object.freeze({ VERSION, SCHEMA_VERSION, POLICY_VERSION, PROGRESS_KIND, DEFAULT_TIMESTAMP, STATUSES, LIFECYCLES: STATUSES, TERMINAL_STATUSES, TERMINAL_LIFECYCLES: TERMINAL_STATUSES, VERDICTS, RISK_LEVELS, DIMENSION_NAMES, PatternEvolutionProposalReviewError, canonicalize, fingerprint, normalizeText, normalizeObject, proposalSnapshot, semanticProposalSnapshot, normalizeSource, calculateSourceProof, assessReview, duplicateIdentity, createPatternEvolutionProposalReview, createReview: createPatternEvolutionProposalReview, validatePatternEvolutionProposalReview, safeNormalizePatternEvolutionProposalReview, serializePatternEvolutionProposalReview, deserializePatternEvolutionProposalReview, transition, startReview, markReady, approveReview, requestChanges, rejectReview, cancelReview, markStale, finalizeReview, projectPatternEvolutionProposalReview, makeImportedPatternEvolutionProposalReviewUnproven, revalidatePatternEvolutionProposalReview, remapPatternEvolutionProposalReview, importPatternEvolutionProposalReview, loadSource, readForProject, createForProject });
  globalObject.YarnAIPatternEvolutionProposalReview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
