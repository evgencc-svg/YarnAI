"use strict";

(function exposePatternEvolutionInitiation(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EVOLUTION_INITIATION";
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const STATUSES = Object.freeze(["draft", "assessing", "ready", "approved", "rejected", "cancelled", "stale"]);
  const TERMINAL_STATUSES = Object.freeze(["approved", "rejected", "cancelled"]);
  const VERDICTS = Object.freeze(["approve", "reject", "needs_evidence", "blocked", "stale"]);
  const PROOF_STATUSES = Object.freeze(["proven", "unproven", "imported-unproven"]);
  const CRITICAL_SEVERITIES = new Set(["critical"]);
  const CRITERION_OPERATORS = new Set([">", ">=", "<", "<=", "==", "!=", "equals", "contains"]);
  const SOURCE_FIELDS = Object.freeze([
    "sourceClosureId", "sourceRolloutEvaluationId", "sourceRolloutId", "sourcePromotionId",
    "sourceValidationId", "sourceAdaptationId", "sourceLearningId", "sourceRetrospectiveId",
  ]);

  class PatternEvolutionInitiationError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternEvolutionInitiationError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function initiationError(code, message, details) { return new PatternEvolutionInitiationError(code, message, details); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function compare(left, right) { const a = String(left ?? ""); const b = String(right ?? ""); return a < b ? -1 : a > b ? 1 : 0; }
  function normalizeText(value) { return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : ""; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) throw initiationError("corrupted_input", "Initiation contains an invalid number."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw initiationError("corrupted_input", "Initiation contains unsupported data.");
    if (seen.has(value)) throw initiationError("corrupted_input", "Initiation cannot contain cyclic data.");
    seen.add(value); let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) result = `{${Object.keys(value).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    else { seen.delete(value); throw initiationError("corrupted_input", "Initiation accepts canonical JSON objects only."); }
    seen.delete(value); return result;
  }

  function fingerprint(value) { const input = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function normalizeObject(value) { if (value === undefined) return null; if (typeof value === "string") return normalizeText(value); if (Array.isArray(value)) return value.map(normalizeObject); if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) { const result = {}; for (const key of Object.keys(value).sort(compare)) result[normalizeText(key)] = normalizeObject(value[key]); return result; } return value; }
  function stableStrings(values) { return [...new Set(array(values).map((item) => normalizeText(typeof item === "object" ? item?.id || item?.name || item?.area || item?.changeClass : item)).filter(Boolean))].sort(compare); }
  function idOf(value, ...fields) { for (const field of ["id", ...fields]) { const id = normalizeText(value?.[field]); if (id) return id; } return ""; }
  function statusOf(value) { return normalizeText(value?.status || value?.lifecycle || value?.lifecycleState).toLowerCase(); }
  function hasContent(value) { if (typeof value === "string") return Boolean(normalizeText(value)); if (Array.isArray(value)) return value.length > 0; if (value && typeof value === "object") return Object.keys(value).length > 0; return value !== null && value !== undefined; }
  function sameScope(left, right) { return canonicalize(normalizeEvolutionScope(left)) === canonicalize(normalizeEvolutionScope(right)); }

  function normalizeSource(source = {}) {
    const closure = source.closure || array(source.closures).find((item) => idOf(item, "closureId", "adaptationClosureId") === normalizeText(source.closureId || source.sourceClosureId)) || null;
    const evaluation = source.evaluation || source.rolloutEvaluation || null;
    const rollout = source.rollout || null; const promotion = source.promotion || null; const validation = source.validation || null;
    const adaptation = source.adaptation || null; const learning = source.learning || null; const retrospective = source.retrospective || null;
    const project = source.project || null; const calculation = source.calculation || null;
    const projectId = normalizeText(source.projectId || project?.project_id || project?.projectId || closure?.projectId);
    const calculationId = normalizeText(source.calculationId || calculation?.calculation_id || calculation?.calculationId || closure?.calculationId);
    const patternId = normalizeText(source.patternId || closure?.patternId || evaluation?.patternId || rollout?.patternId || promotion?.patternId || validation?.patternId || adaptation?.patternId || learning?.patternId || retrospective?.patternId || project?.pattern_id || project?.patternId || projectId);
    return { ...source, project, calculation, projectId, calculationId, patternId, closure, evaluation, rollout, promotion, validation, adaptation, learning, retrospective, initiatives: array(source.initiatives) };
  }

  function sourceIds(source = {}) {
    const s = normalizeSource(source);
    return freeze({
      sourceClosureId: idOf(s.closure, "closureId", "adaptationClosureId"),
      sourceRolloutEvaluationId: idOf(s.evaluation, "evaluationId", "adaptationRolloutEvaluationId") || normalizeText(s.closure?.evaluationId || s.closure?.adaptationRolloutEvaluationId),
      sourceRolloutId: idOf(s.rollout, "rolloutId", "adaptationRolloutId") || normalizeText(s.closure?.rolloutId || s.closure?.adaptationRolloutId),
      sourcePromotionId: idOf(s.promotion, "promotionId", "adaptationPromotionId") || normalizeText(s.closure?.promotionId || s.closure?.adaptationPromotionId),
      sourceValidationId: idOf(s.validation, "validationId", "adaptationValidationId") || normalizeText(s.closure?.validationId || s.closure?.adaptationValidationId),
      sourceAdaptationId: idOf(s.adaptation, "adaptationId") || normalizeText(s.closure?.adaptationId),
      sourceLearningId: idOf(s.learning, "learningId") || normalizeText(s.adaptation?.learningId),
      sourceRetrospectiveId: idOf(s.retrospective, "retrospectiveId") || normalizeText(s.learning?.sourceRetrospectiveId || s.adaptation?.retrospectiveId),
    });
  }

  function sourceSnapshot(value, type) {
    if (!value) return null;
    const fields = {
      retrospective: ["id", "retrospectiveId", "projectId", "patternId", "status", "lifecycle", "identity", "revision", "stale", "proofStatus"],
      learning: ["id", "learningId", "projectId", "patternId", "sourceRetrospectiveId", "status", "identity", "revision", "stale", "proofStatus"],
      adaptation: ["id", "adaptationId", "projectId", "patternId", "retrospectiveId", "learningId", "status", "identity", "revision", "stale", "proofStatus"],
      validation: ["id", "validationId", "adaptationValidationId", "projectId", "patternId", "adaptationId", "status", "lifecycle", "verdict", "identity", "revision", "stale", "proofStatus"],
      promotion: ["id", "promotionId", "adaptationPromotionId", "projectId", "patternId", "adaptationId", "validationId", "adaptationValidationId", "status", "lifecycle", "promotionVerdict", "verdict", "identity", "revision", "stale", "proofStatus"],
      rollout: ["id", "rolloutId", "adaptationRolloutId", "projectId", "patternId", "adaptationId", "promotionId", "adaptationPromotionId", "status", "lifecycle", "rolloutVerdict", "verdict", "identity", "revision", "stale", "proofStatus"],
      evaluation: ["id", "evaluationId", "adaptationRolloutEvaluationId", "projectId", "patternId", "rolloutId", "adaptationRolloutId", "status", "lifecycle", "verdict", "identity", "revision", "stale", "proofStatus"],
      closure: ["id", "closureId", "adaptationClosureId", "projectId", "patternId", "evaluationId", "adaptationRolloutEvaluationId", "status", "lifecycle", "decision", "verdict", "closureType", "identity", "revision", "stale", "proofStatus", "blockingReasons"],
    }[type] || [];
    const snapshot = {}; for (const field of fields) if (value[field] !== undefined) snapshot[field] = clone(value[field]);
    return normalizeObject(snapshot);
  }

  function sourceSnapshots(source = {}) { const s = normalizeSource(source); return freeze({ retrospective: sourceSnapshot(s.retrospective, "retrospective"), learning: sourceSnapshot(s.learning, "learning"), adaptation: sourceSnapshot(s.adaptation, "adaptation"), validation: sourceSnapshot(s.validation, "validation"), promotion: sourceSnapshot(s.promotion, "promotion"), rollout: sourceSnapshot(s.rollout, "rollout"), rolloutEvaluation: sourceSnapshot(s.evaluation, "evaluation"), closure: sourceSnapshot(s.closure, "closure") }); }
  function referenceMatches(value, fieldNames, expected) { const present = fieldNames.map((field) => normalizeText(value?.[field])).filter(Boolean); return present.length === 0 || present.includes(expected); }
  function terminalClosure(closure) { return ["closed", "completed"].includes(statusOf(closure)); }
  function positiveClosure(closure) { return ["closed", "closed_exceeded", "closed_with_constraints", "closed_with_monitoring", "rollback_closed"].includes(normalizeText(closure?.verdict).toLowerCase()) && ["accept", "accept_with_constraints", "accept_with_monitoring", "close_after_rollback"].includes(normalizeText(closure?.decision).toLowerCase()); }
  function sourceImportedUnproven(item) { return item?.proofStatus === "imported-unproven" && item?.importedDiagnostic?.reason !== "locally_reprojected"; }

  function calculateEvidenceProof(source = {}, record = null) {
    const s = normalizeSource(source); const ids = sourceIds(s); const items = [s.retrospective, s.learning, s.adaptation, s.validation, s.promotion, s.rollout, s.evaluation, s.closure];
    const recordsResolved = items.every(Boolean);
    const projectIds = items.map((item) => normalizeText(item?.projectId)).filter(Boolean); const sameProject = Boolean(s.projectId && projectIds.every((id) => id === s.projectId) && (!record || record.projectId === s.projectId));
    const patternIds = items.map((item) => normalizeText(item?.patternId)).filter(Boolean); const samePattern = Boolean(s.patternId && patternIds.every((id) => id === s.patternId) && (!record || record.patternId === s.patternId));
    const sameCalculation = Boolean(!record || !record.calculationId || record.calculationId === s.calculationId);
    const linksValid = Boolean(recordsResolved &&
      referenceMatches(s.learning, ["sourceRetrospectiveId", "retrospectiveId"], ids.sourceRetrospectiveId) &&
      referenceMatches(s.adaptation, ["retrospectiveId"], ids.sourceRetrospectiveId) && referenceMatches(s.adaptation, ["learningId"], ids.sourceLearningId) &&
      referenceMatches(s.validation, ["adaptationId"], ids.sourceAdaptationId) && referenceMatches(s.promotion, ["adaptationId"], ids.sourceAdaptationId) && referenceMatches(s.promotion, ["validationId", "adaptationValidationId"], ids.sourceValidationId) &&
      referenceMatches(s.rollout, ["adaptationId"], ids.sourceAdaptationId) && referenceMatches(s.rollout, ["promotionId", "adaptationPromotionId"], ids.sourcePromotionId) &&
      referenceMatches(s.evaluation, ["rolloutId", "adaptationRolloutId"], ids.sourceRolloutId) && referenceMatches(s.closure, ["evaluationId", "adaptationRolloutEvaluationId"], ids.sourceRolloutEvaluationId));
    const identitiesMatch = Boolean(!record || SOURCE_FIELDS.every((field) => record[field] === ids[field]));
    const closureTerminal = Boolean(s.closure && terminalClosure(s.closure));
    const closureOutcomeSufficient = Boolean(s.closure && positiveClosure(s.closure));
    const closureUnblocked = Boolean(s.closure && array(s.closure.blockingReasons).length === 0);
    const sourcesCurrent = items.filter(Boolean).every((item) => item.stale !== true && !["stale", "superseded"].includes(statusOf(item)));
    const provenanceVerified = items.every((item) => item && !item.quarantined && !sourceImportedUnproven(item));
    const snapshots = sourceSnapshots(s); const snapshotsMatch = Boolean(!record || canonicalize(record.sourceSnapshots) === canonicalize(snapshots));
    const idsPresent = SOURCE_FIELDS.every((field) => Boolean(ids[field])); const collisionFree = new Set(Object.values(ids)).size === Object.values(ids).length;
    const sourceDigest = fingerprint({ projectId: s.projectId, patternId: s.patternId, ids, snapshots });
    const sourceDigestValid = Boolean(!record || !record.sourceDigest || record.sourceDigest === sourceDigest);
    const checks = { recordsResolved, idsPresent, sameProject, samePattern, sameCalculation, linksValid, identitiesMatch, closureTerminal, closureOutcomeSufficient, closureUnblocked, sourcesCurrent, provenanceVerified, snapshotsMatch, collisionFree, sourceDigestValid };
    const issues = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).sort(compare);
    const evidenceComplete = recordsResolved && idsPresent && linksValid && closureTerminal && closureOutcomeSufficient && closureUnblocked;
    const fullChainProven = evidenceComplete && sameProject && samePattern && sameCalculation && identitiesMatch && sourcesCurrent && provenanceVerified && snapshotsMatch && collisionFree && sourceDigestValid;
    return freeze({ ...checks, evidenceComplete, fullChainProven, ids, snapshots, sourceDigest, issues });
  }

  function normalizeEvolutionScope(value) { const input = typeof value === "string" ? { areas: [value] } : value || {}; return freeze({ areas: stableStrings(input.areas || input.targets || input.patternAreas), capabilities: stableStrings(input.capabilities), parameters: stableStrings(input.parameters), experiments: stableStrings(input.experiments), exclusions: stableStrings(input.exclusions) }); }
  function normalizeCriterion(value) { const item = typeof value === "string" ? { description: value } : value || {}; const metric = normalizeText(item.metric || item.measure || item.metricId); const operator = normalizeText(item.operator); const target = item.target ?? item.threshold ?? null; const description = normalizeText(item.description || item.summary); const measurementMethod = normalizeText(item.measurementMethod || item.method); const id = normalizeText(item.id || item.criterionId) || `success-criterion:${fingerprint({ metric, operator, target, description, measurementMethod }).slice(8)}`; return { id, metric, operator, target: normalizeObject(target), description, measurementMethod, window: normalizeObject(item.window ?? null) }; }
  function normalizeSuccessCriteria(values) { const result = new Map(); for (const raw of array(values)) { const item = normalizeCriterion(raw); const prior = result.get(item.id); if (prior && canonicalize(prior) !== canonicalize(item)) throw initiationError("criterion_identity_conflict", "Success criteria contain conflicting identities.", { id: item.id }); if (!prior) result.set(item.id, item); } return freeze([...result.values()].sort((a, b) => compare(a.id, b.id))); }
  function criterionMeasurable(item) { return Boolean(item.metric && CRITERION_OPERATORS.has(item.operator) && item.target !== null && item.target !== undefined && (typeof item.target !== "string" || normalizeText(item.target)) && (item.measurementMethod || item.metric)); }
  function normalizeRisk(value) { const item = typeof value === "string" ? { description: value } : value || {}; const description = normalizeText(item.description || item.risk || item.summary); const severity = normalizeText(item.severity || "moderate").toLowerCase(); const mitigation = normalizeText(item.mitigation || item.mitigationPlan); const owner = normalizeText(item.owner || item.ownerId) || null; const id = normalizeText(item.id || item.riskId) || `evolution-risk:${fingerprint({ description, severity }).slice(8)}`; return { id, description, severity, mitigation: mitigation || null, owner }; }
  function normalizeRiskAssessment(value) { const input = Array.isArray(value) ? { risks: value } : value || {}; const risks = new Map(); for (const raw of array(input.risks)) { const item = normalizeRisk(raw); const prior = risks.get(item.id); if (prior && canonicalize(prior) !== canonicalize(item)) throw initiationError("risk_identity_conflict", "Risk assessment contains conflicting identities.", { id: item.id }); if (!prior) risks.set(item.id, item); } return freeze({ summary: normalizeText(input.summary) || null, overall: normalizeText(input.overall || input.level) || null, risks: [...risks.values()].sort((a, b) => compare(a.id, b.id)) }); }
  function normalizeQuestions(values) { return freeze(array(values).map((item) => typeof item === "string" ? { question: normalizeText(item), blocking: true } : { id: normalizeText(item?.id) || null, question: normalizeText(item?.question || item?.text), blocking: item?.blocking !== false }).filter((item) => item.question).sort((a, b) => compare(a.id || a.question, b.id || b.question))); }
  function normalizeEvidenceSummary(source, value) { const proof = calculateEvidenceProof(source); return freeze(normalizeObject({ ...(value && typeof value === "object" ? value : {}), chain: ["retrospective", "learning", "adaptation", "validation", "promotion", "rollout", "rollout_evaluation", "closure"], sourceIds: proof.ids, sourceDigest: proof.sourceDigest, proofIssues: proof.issues, closureVerdict: source.closure?.verdict || null, rolloutEvaluationVerdict: source.evaluation?.verdict || null })); }

  function duplicateApproved(record, existing) { return array(existing).some((item) => { const candidate = item?.state || item; return candidate && candidate.id !== record.id && candidate.status === "approved" && candidate.sourceClosureId === record.sourceClosureId && sameScope(candidate.evolutionScope, record.evolutionScope); }); }
  function calculateReadiness(record, context = {}) {
    const proof = record.sourceProof || {}; const scope = normalizeEvolutionScope(record.evolutionScope); const criteria = normalizeSuccessCriteria(record.successCriteria); const risks = normalizeRiskAssessment(record.riskAssessment);
    const allowed = stableStrings(record.allowedChangeClasses); const protectedAreas = stableStrings(record.protectedAreas); const forbidden = stableStrings(record.forbiddenChangeClasses);
    const criticalUncontrolled = risks.risks.some((risk) => CRITICAL_SEVERITIES.has(risk.severity) && !risk.mitigation);
    const conflictAreas = allowed.filter((item) => protectedAreas.includes(item)); const conflictClasses = allowed.filter((item) => forbidden.includes(item));
    const evidenceComplete = proof.evidenceComplete === true; const provenanceVerified = proof.fullChainProven === true && record.proofStatus === "proven" && record.importedUnproven !== true;
    const scopeDefined = scope.areas.length > 0; const safeguardsDefined = protectedAreas.length > 0 && allowed.length > 0 && forbidden.length > 0 && conflictAreas.length === 0 && conflictClasses.length === 0;
    const criteriaDefined = criteria.length > 0 && criteria.every(criterionMeasurable) && new Set(criteria.map((item) => item.id)).size === criteria.length;
    const risksControlled = !criticalUncontrolled; const noBlockingQuestions = !normalizeQuestions(record.unresolvedQuestions).some((item) => item.blocking);
    const duplicateFree = !duplicateApproved(record, context.existingInitiatives || []);
    const hypothesisDefined = Boolean(normalizeText(record.hypothesis)); const expectedValueDefined = hasContent(record.expectedValue);
    const overallReady = [evidenceComplete, provenanceVerified, scopeDefined, safeguardsDefined, criteriaDefined, risksControlled, noBlockingQuestions, duplicateFree, hypothesisDefined, expectedValueDefined].every(Boolean);
    return freeze({ evidenceComplete, provenanceVerified, scopeDefined, safeguardsDefined, criteriaDefined, risksControlled, noBlockingQuestions, duplicateFree, hypothesisDefined, expectedValueDefined, overallReady, criticalUncontrolled, conflictAreas, conflictClasses });
  }

  function verdictReasons(record, readiness) {
    const reasons = [];
    if (record.stale || record.proofStatus === "imported-unproven" || !record.sourceProof?.sourcesCurrent) reasons.push(record.proofStatus === "imported-unproven" ? "imported_unproven" : "source_stale");
    if (!record.sourceProof?.recordsResolved) reasons.push("evidence_chain_incomplete"); if (!record.sourceProof?.linksValid) reasons.push("evidence_links_invalid");
    if (!record.sourceProof?.sameProject) reasons.push("project_mismatch"); if (!record.sourceProof?.samePattern) reasons.push("pattern_mismatch"); if (!record.sourceProof?.provenanceVerified) reasons.push("provenance_unverified");
    if (!record.sourceProof?.closureTerminal) reasons.push("closure_not_terminal"); if (record.sourceProof?.closureTerminal && !record.sourceProof?.closureOutcomeSufficient) reasons.push("closure_outcome_insufficient"); if (!record.sourceProof?.closureUnblocked) reasons.push("closure_blocked");
    if (!readiness.hypothesisDefined) reasons.push("hypothesis_required"); if (!readiness.scopeDefined) reasons.push("evolution_scope_required"); if (!readiness.safeguardsDefined) reasons.push("safeguards_invalid"); if (!readiness.criteriaDefined) reasons.push("success_criteria_invalid"); if (!readiness.expectedValueDefined) reasons.push("expected_value_required");
    if (!readiness.risksControlled) reasons.push("critical_risk_unmitigated"); if (!readiness.noBlockingQuestions) reasons.push("blocking_questions_unresolved"); if (!readiness.duplicateFree) reasons.push("duplicate_approved_initiative");
    return stableStrings(reasons);
  }
  function deriveVerdict(record, readiness = null) {
    const ready = readiness || calculateReadiness(record);
    if (record.stale || record.proofStatus === "imported-unproven" || !record.sourceProof?.sourcesCurrent) return "stale";
    if (ready.criticalUncontrolled || ready.conflictAreas.length || ready.conflictClasses.length || !ready.noBlockingQuestions || !ready.duplicateFree) return "blocked";
    if (record.sourceProof?.closureTerminal && (!record.sourceProof.closureOutcomeSufficient || !record.sourceProof.closureUnblocked)) return "reject";
    if (ready.overallReady) return "approve";
    return "needs_evidence";
  }

  function identityPayload(record) { const copy = clone(record); for (const key of ["identity", "updatedAt", "audit", "readiness", "verdict", "verdictReasons"]) delete copy[key]; return copy; }
  function finalize(record, context = {}) {
    record.hypothesis = normalizeText(record.hypothesis); record.rationale = normalizeText(record.rationale); record.evolutionScope = normalizeEvolutionScope(record.evolutionScope);
    record.protectedAreas = stableStrings(record.protectedAreas); record.allowedChangeClasses = stableStrings(record.allowedChangeClasses); record.forbiddenChangeClasses = stableStrings(record.forbiddenChangeClasses);
    record.expectedValue = normalizeObject(record.expectedValue); record.successCriteria = normalizeSuccessCriteria(record.successCriteria); record.riskAssessment = normalizeRiskAssessment(record.riskAssessment);
    record.constraints = normalizeObject(record.constraints || []); record.assumptions = normalizeObject(record.assumptions || []); record.unresolvedQuestions = normalizeQuestions(record.unresolvedQuestions);
    record.readiness = calculateReadiness(record, context); record.verdict = deriveVerdict(record, record.readiness); record.verdictReasons = verdictReasons(record, record.readiness); record.identity = fingerprint(identityPayload(record)); return freeze(record);
  }

  function createPatternEvolutionInitiation(source = {}, input = {}) {
    const s = normalizeSource(source); if (!s.closure) throw initiationError("closure_required", "A completed adaptation closure is required."); const proof = calculateEvidenceProof(s); const ids = proof.ids; const epoch = positiveInteger(input.epoch) || 1;
    const timestamp = deterministicTimestamp(input.now, s.closure?.closedAt, s.closure?.updatedAt); if (!isTimestamp(timestamp)) throw initiationError("timestamp_required", "An injected timestamp is required.");
    const id = normalizeText(input.id || input.initiationId) || `pattern-evolution-initiation:${fingerprint({ projectId: s.projectId, patternId: s.patternId, sourceClosureId: ids.sourceClosureId, epoch }).slice(8)}`;
    const record = {
      id, initiationId: id, kind: PROGRESS_KIND, type: PROGRESS_KIND, version: VERSION, schemaVersion: SCHEMA_VERSION,
      projectId: s.projectId, patternId: s.patternId, calculationId: s.calculationId || null, ...ids,
      status: "draft", lifecycle: "draft", hypothesis: input.hypothesis || "", rationale: input.rationale || "", evidenceSummary: normalizeEvidenceSummary(s, input.evidenceSummary),
      evolutionScope: input.evolutionScope || {}, protectedAreas: input.protectedAreas || [], allowedChangeClasses: input.allowedChangeClasses || [], forbiddenChangeClasses: input.forbiddenChangeClasses || [],
      expectedValue: input.expectedValue ?? null, successCriteria: input.successCriteria || [], riskAssessment: input.riskAssessment || {}, constraints: input.constraints || [], assumptions: input.assumptions || [], unresolvedQuestions: input.unresolvedQuestions || [],
      readiness: null, verdict: "needs_evidence", verdictReasons: [], sourceProof: proof, sourceSnapshots: proof.snapshots, sourceDigest: proof.sourceDigest,
      proofStatus: proof.fullChainProven ? "proven" : "unproven", stale: !proof.sourcesCurrent, imported: false, importedUnproven: false, collision: false, importedClaim: null, importedDiagnostic: null,
      provenance: normalizeObject(input.provenance || { source: "local", projectId: s.projectId, patternId: s.patternId }), createdAt: timestamp, updatedAt: timestamp, revision: 1, epoch, identity: null,
      audit: [{ event: "created", at: timestamp, revision: 1 }],
    };
    const result = finalize(record, { existingInitiatives: input.existingInitiatives || s.initiatives }); requireRecord(result); return result;
  }

  function finishValidation(errors) { const unique = new Map(errors.map((item) => [`${item.code}\0${item.field || ""}`, item])); const values = [...unique.values()].sort((a, b) => compare(a.code, b.code) || compare(a.field, b.field)); return freeze({ valid: values.length === 0, errors: values }); }
  function validatePatternEvolutionInitiation(record) {
    const errors = []; const invalid = (code, field = null) => errors.push({ code, field }); try { canonicalize(record); } catch { invalid("corrupted_input"); return finishValidation(errors); }
    if (!record || record.kind !== PROGRESS_KIND || record.type !== PROGRESS_KIND || record.version !== VERSION || record.schemaVersion !== SCHEMA_VERSION) invalid("kind_invalid");
    for (const field of ["id", "initiationId", "projectId", "patternId", ...SOURCE_FIELDS, "status", "hypothesis", "rationale", "evidenceSummary", "evolutionScope", "protectedAreas", "allowedChangeClasses", "forbiddenChangeClasses", "expectedValue", "successCriteria", "riskAssessment", "constraints", "assumptions", "unresolvedQuestions", "readiness", "verdict", "verdictReasons", "createdAt", "updatedAt", "identity", "audit", "sourceProof", "sourceSnapshots", "sourceDigest", "provenance"]) if (record?.[field] === undefined || (field !== "expectedValue" && record?.[field] === null) || (["id", "initiationId", "projectId", "patternId", ...SOURCE_FIELDS, "status", "createdAt", "updatedAt", "identity", "sourceDigest"].includes(field) && !normalizeText(record[field]))) invalid("required_field_missing", field);
    if (record?.id !== record?.initiationId || record?.status !== record?.lifecycle) invalid("identity_mismatch"); if (!STATUSES.includes(record?.status) || !VERDICTS.includes(record?.verdict) || !PROOF_STATUSES.includes(record?.proofStatus)) invalid("enum_invalid");
    if (!positiveInteger(record?.revision) || !positiveInteger(record?.epoch) || !isTimestamp(record?.createdAt) || !isTimestamp(record?.updatedAt)) invalid("revision_or_timestamp_invalid");
    if (record?.identity && fingerprint(identityPayload(record)) !== record.identity) invalid("identity_invalid");
    return finishValidation(errors);
  }
  function requireRecord(record) { const report = validatePatternEvolutionInitiation(record); if (!report.valid) throw initiationError("corrupted_input", "Pattern evolution initiation is corrupted.", { errors: report.errors }); }
  function safeNormalizePatternEvolutionInitiation(value) { try { const record = typeof value === "string" ? JSON.parse(value) : clone(value); const report = validatePatternEvolutionInitiation(record); return report.valid ? freeze({ record: freeze(record), corrupted: false, errors: [] }) : freeze({ record: null, corrupted: true, errors: report.errors }); } catch { return freeze({ record: null, corrupted: true, errors: [{ code: "corrupted_input", field: null }] }); } }
  function serializePatternEvolutionInitiation(record) { requireRecord(record); return canonicalize(record); }
  function deserializePatternEvolutionInitiation(value) { const safe = safeNormalizePatternEvolutionInitiation(value); if (safe.corrupted) throw initiationError("corrupted_input", "Pattern evolution initiation is corrupted.", { errors: safe.errors }); return safe.record; }

  function checkConcurrency(record, command = {}) { if (command.expectedRevision !== undefined && command.expectedRevision !== record.revision) throw initiationError("revision_conflict", "Initiation revision changed."); if (command.expectedIdentity !== undefined && command.expectedIdentity !== record.identity) throw initiationError("identity_conflict", "Initiation identity changed."); }
  function updatePatternEvolutionInitiation(record, patch = {}, command = {}) {
    requireRecord(record); if (TERMINAL_STATUSES.includes(record.status)) throw initiationError("terminal_immutable", "Terminal initiation is immutable."); checkConcurrency(record, command);
    const forbidden = ["id", "initiationId", "kind", "type", "version", "schemaVersion", "projectId", "patternId", "calculationId", ...SOURCE_FIELDS, "sourceSnapshots", "sourceDigest", "createdAt", "epoch", "status", "lifecycle", "proofStatus", "stale", "imported", "importedUnproven", "collision", "identity", "revision", "audit", "readiness", "verdict", "verdictReasons"];
    if (forbidden.some((field) => Object.prototype.hasOwnProperty.call(patch, field))) throw initiationError("immutable_field", "Source, identity and derived fields are immutable.");
    const next = clone(record); for (const field of ["hypothesis", "rationale", "evidenceSummary", "evolutionScope", "protectedAreas", "allowedChangeClasses", "forbiddenChangeClasses", "expectedValue", "successCriteria", "riskAssessment", "constraints", "assumptions", "unresolvedQuestions"]) if (Object.prototype.hasOwnProperty.call(patch, field)) next[field] = clone(patch[field]);
    next.revision += 1; next.updatedAt = deterministicTimestamp(command.now, record.updatedAt); next.audit.push({ event: "updated", at: next.updatedAt, revision: next.revision }); return finalize(next, { existingInitiatives: command.existingInitiatives });
  }

  function transition(record, nextStatus, source = null, command = {}) {
    requireRecord(record); checkConcurrency(record, command); if (record.status === nextStatus) return record; if (TERMINAL_STATUSES.includes(record.status)) throw initiationError("terminal_immutable", "Terminal initiation is immutable.");
    const allowed = { draft: ["assessing", "cancelled", "stale"], assessing: ["ready", "rejected", "cancelled", "stale"], ready: ["approved", "rejected", "cancelled", "stale"], stale: [] };
    if (!allowed[record.status]?.includes(nextStatus)) throw initiationError("invalid_transition", `Cannot transition ${record.status} to ${nextStatus}.`);
    let next = clone(record);
    if (source) { const proof = calculateEvidenceProof(source, record); next.sourceProof = proof; next.stale = !proof.sourcesCurrent || !proof.snapshotsMatch || !proof.identitiesMatch; next.proofStatus = proof.fullChainProven ? "proven" : (record.proofStatus === "imported-unproven" ? "imported-unproven" : "unproven"); }
    let projected = finalize(next, { existingInitiatives: command.existingInitiatives });
    if (nextStatus === "stale" && projected.sourceProof.fullChainProven && !projected.stale && projected.proofStatus !== "imported-unproven") throw initiationError("stale_not_proven", "Stale requires a lost or unproven source chain.");
    if (nextStatus === "ready" && projected.verdict !== "approve") throw initiationError("readiness_blocked", "Ready requires an approve verdict.", { reasons: projected.verdictReasons });
    if (nextStatus === "approved" && (projected.verdict !== "approve" || !projected.readiness.overallReady)) throw initiationError("approval_blocked", "Approval requirements are not satisfied.", { reasons: projected.verdictReasons });
    if (nextStatus === "rejected" && projected.verdict !== "reject") throw initiationError("rejection_not_supported", "Rejection requires proven insufficient evidence.");
    next = clone(projected); next.status = nextStatus; next.lifecycle = nextStatus; if (nextStatus === "stale") { next.stale = true; next.proofStatus = next.proofStatus === "imported-unproven" ? "imported-unproven" : "unproven"; }
    next.revision += 1; next.updatedAt = deterministicTimestamp(command.now, record.updatedAt); next.audit.push({ event: `status_${nextStatus}`, at: next.updatedAt, revision: next.revision }); return finalize(next, { existingInitiatives: command.existingInitiatives });
  }
  function startAssessing(record, source, command = {}) { return transition(record, "assessing", source, command); }
  function markReady(record, source, command = {}) { return transition(record, "ready", source, command); }
  function approveInitiation(record, source, command = {}) { return transition(record, "approved", source, command); }
  function rejectInitiation(record, source, command = {}) { return transition(record, "rejected", source, command); }
  function cancelInitiation(record, source, command = {}) { return transition(record, "cancelled", source, command); }
  function markStale(record, source, command = {}) { return transition(record, "stale", source, command); }

  function projectPatternEvolutionInitiation(record, source = {}, context = {}) {
    const safe = safeNormalizePatternEvolutionInitiation(record); if (safe.corrupted) return freeze({ corrupted: true, stale: false, proofStatus: "unproven", effectiveStatus: "corrupted", verdict: "needs_evidence", verdictReasons: ["corrupted_input"] });
    const proof = calculateEvidenceProof(source, record); const imported = record.proofStatus === "imported-unproven" && record.importedDiagnostic?.reason !== "locally_revalidated"; const stale = imported || !proof.sourcesCurrent || !proof.snapshotsMatch || !proof.identitiesMatch || record.stale === true;
    const next = clone(record); next.sourceProof = proof; next.stale = stale; next.proofStatus = stale ? (imported ? "imported-unproven" : "unproven") : "proven"; const projected = finalize(next, context);
    return freeze({ corrupted: false, stale, proofStatus: projected.proofStatus, sourceProof: proof, readiness: projected.readiness, verdict: projected.verdict, verdictReasons: projected.verdictReasons, effectiveStatus: stale ? "stale" : projected.status, reasonCode: imported ? "imported_unproven" : stale ? "source_chain_changed" : null });
  }

  function revalidatePatternEvolutionInitiation(record, source = {}, command = {}) {
    requireRecord(record); const proof = calculateEvidenceProof(source); const idsMatch = SOURCE_FIELDS.every((field) => record[field] === proof.ids[field]); if (!proof.fullChainProven || !idsMatch) throw initiationError("source_chain_unproven", "Local evidence-chain revalidation failed.", { issues: stableStrings([...(proof.issues || []), !idsMatch && "identitiesMatch"].filter(Boolean)) });
    const next = clone(record); next.sourceProof = proof; next.sourceSnapshots = proof.snapshots; next.sourceDigest = proof.sourceDigest; next.proofStatus = "proven"; next.stale = false; next.importedUnproven = false; next.collision = false;
    if (next.status === "stale") { next.status = "draft"; next.lifecycle = "draft"; } next.importedDiagnostic = next.imported ? { reason: "locally_revalidated", collision: false, importedClaim: next.importedClaim } : null;
    next.revision += 1; next.updatedAt = deterministicTimestamp(command.now, record.updatedAt); next.audit.push({ event: "evidence_revalidated", at: next.updatedAt, revision: next.revision }); return finalize(next, { existingInitiatives: command.existingInitiatives });
  }
  function makeImportedPatternEvolutionInitiationUnproven(record, options = {}) {
    requireRecord(record); const next = clone(record); next.importedClaim = next.importedClaim || normalizeObject({ status: record.status, verdict: record.verdict, readiness: record.readiness }); next.imported = true; next.importedUnproven = true; next.stale = true; next.proofStatus = "imported-unproven"; next.collision = options.collision === true; next.status = "stale"; next.lifecycle = "stale";
    next.sourceProof = { ...next.sourceProof, fullChainProven: false, provenanceVerified: false, issues: stableStrings([...(next.sourceProof?.issues || []), "imported_unproven"]) }; next.importedDiagnostic = { reason: normalizeText(options.reason) || "import_identity_unproven", collision: next.collision, preservedClaim: next.importedClaim };
    next.provenance = normalizeObject({ ...next.provenance, imported: true, importSource: options.importSource || null }); next.revision += 1; next.updatedAt = deterministicTimestamp(options.now, record.updatedAt); next.audit.push({ event: "imported_unproven", at: next.updatedAt, revision: next.revision }); return finalize(next);
  }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((item) => remapExact(item, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function remapPatternEvolutionInitiation(record, referenceMap) {
    requireRecord(record); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {})); const oldId = record.id; const next = remapExact(clone(record), map);
    next.id = map.get(oldId) || `pattern-evolution-initiation:${fingerprint({ projectId: next.projectId, patternId: next.patternId, sourceClosureId: next.sourceClosureId, epoch: next.epoch }).slice(8)}`; next.initiationId = next.id; next.identity = fingerprint(identityPayload(next)); return makeImportedPatternEvolutionInitiationUnproven(next, { collision: true, now: next.updatedAt, reason: "reference_remapped" });
  }
  function importPatternEvolutionInitiation(existing, serialized, options = {}) { const parsed = deserializePatternEvolutionInitiation(serialized); const remapped = options.referenceMap ? remapPatternEvolutionInitiation(parsed, options.referenceMap) : parsed; const same = array(existing).map((item) => item?.state || item).find((item) => item.id === remapped.id); if (same && canonicalize(same) === canonicalize(remapped)) return freeze({ status: "duplicate", record: same, changed: false }); if (same || array(existing).map((item) => item?.state || item).some((item) => item.identity === remapped.identity)) return freeze({ status: "collision", record: null, changed: false, reason: same ? "content_conflict" : "identity_conflict" }); return freeze({ status: "imported", record: makeImportedPatternEvolutionInitiationUnproven(remapped, options), changed: true }); }

  async function loadSource(repository, projectId, closureId = null) {
    const closureApi = globalObject.YarnAIPatternExecutionAdaptationClosure; if (!closureApi?.loadSource) throw initiationError("closure_api_missing", "Adaptation closure module is not loaded.");
    const closures = (await repository.listPatternExecutionAdaptationClosures(projectId, { lifecycle: "closed" })).map((entry) => entry.state); const closure = closureId ? closures.find((item) => idOf(item, "closureId") === closureId) || null : closures.at(-1) || null; if (!closure) throw initiationError("closure_required", "No completed adaptation closure is available.");
    const base = await closureApi.loadSource(repository, projectId, closure.evaluationId); const aggregate = await repository.getProject(projectId); const initiatives = await repository.listPatternEvolutionInitiations(projectId, { patternId: normalizeText(closure.patternId || base.patternId || projectId) });
    return normalizeSource({ ...base, project: aggregate.project, closure, closures, initiatives: initiatives.map((entry) => entry.state), projectId, patternId: normalizeText(closure.patternId || base.patternId || aggregate.project?.pattern_id || projectId) });
  }
  async function readForProject(repository, projectId, initiationId = null, closureId = null) { let source; try { source = await loadSource(repository, projectId, closureId); } catch (error) { return freeze({ projectId, corrupted: true, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "source_load_failed", availableCommands: [] }); } let stored; try { stored = await repository.getPatternEvolutionInitiation(projectId, initiationId, source.calculationId, source.closure.id); } catch (error) { return freeze({ ...source, corrupted: true, effectiveStatus: "corrupted", reasonCode: normalizeText(error?.code) || "initiation_load_failed", availableCommands: [] }); } if (!stored) { const proof = calculateEvidenceProof(source); const stale = !proof.sourcesCurrent; return freeze({ ...source, rawInitiation: null, initiationRecord: null, sourceProof: proof, readiness: null, verdict: stale ? "stale" : "needs_evidence", verdictReasons: proof.issues, proofStatus: proof.fullChainProven ? "proven" : "unproven", effectiveStatus: stale ? "stale" : "draft", stale, corrupted: false, availableCommands: proof.recordsResolved ? ["create"] : [] }); } const projection = projectPatternEvolutionInitiation(stored.state, { ...source, initiationStorageRevision: stored.revision }, { existingInitiatives: source.initiatives }); const commands = projection.effectiveStatus === "draft" ? ["edit", "assess", "cancel"] : projection.effectiveStatus === "assessing" ? ["edit", "ready", "reject", "cancel"] : projection.effectiveStatus === "ready" ? ["approve", "reject", "cancel"] : []; return freeze({ ...source, rawInitiation: stored.state, initiationRecord: stored, ...projection, availableCommands: commands }); }
  async function createForProject(repository, projectId, input = {}) { const source = await loadSource(repository, projectId, input.closureId || input.sourceClosureId || null); const existing = await repository.listPatternEvolutionInitiations(projectId, source.calculationId); const record = createPatternEvolutionInitiation(source, { ...clone(input), existingInitiatives: existing.map((entry) => entry.state), epoch: existing.reduce((maximum, entry) => Math.max(maximum, entry.state?.epoch || 0), 0) + 1 }); await repository.savePatternEvolutionInitiation(projectId, record, { timestamp: record.updatedAt }); return readForProject(repository, projectId, record.id, record.sourceClosureId); }

  const api = Object.freeze({ VERSION, SCHEMA_VERSION, PROGRESS_KIND, DEFAULT_TIMESTAMP, STATUSES, LIFECYCLES: STATUSES, TERMINAL_STATUSES, TERMINAL_LIFECYCLES: TERMINAL_STATUSES, VERDICTS, PROOF_STATUSES, SOURCE_FIELDS, PatternEvolutionInitiationError, canonicalize, fingerprint, normalizeText, normalizeObject, normalizeSource, sourceIds, sourceSnapshot, sourceSnapshots, calculateEvidenceProof, calculateSourceProof: calculateEvidenceProof, normalizeEvolutionScope, normalizeCriterion, normalizeSuccessCriteria, criterionMeasurable, normalizeRisk, normalizeRiskAssessment, normalizeQuestions, calculateReadiness, deriveVerdict, verdictReasons, createPatternEvolutionInitiation, createInitiation: createPatternEvolutionInitiation, validatePatternEvolutionInitiation, safeNormalizePatternEvolutionInitiation, serializePatternEvolutionInitiation, deserializePatternEvolutionInitiation, updatePatternEvolutionInitiation, updateInitiation: updatePatternEvolutionInitiation, transition, startAssessing, markReady, approveInitiation, rejectInitiation, cancelInitiation, markStale, projectPatternEvolutionInitiation, revalidatePatternEvolutionInitiation, reprojectPatternEvolutionInitiation: revalidatePatternEvolutionInitiation, makeImportedPatternEvolutionInitiationUnproven, remapPatternEvolutionInitiation, importPatternEvolutionInitiation, duplicateApproved, loadSource, readForProject, createForProject });
  globalObject.YarnAIPatternEvolutionInitiation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
