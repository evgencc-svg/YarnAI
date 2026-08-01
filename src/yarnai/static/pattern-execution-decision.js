"use strict";

(function exposePatternExecutionDecision(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_DECISION";
  const STATUSES = Object.freeze([
    "waiting", "ready", "deciding", "accepted", "more_evidence_required",
    "correction_required", "rejected", "blocked", "stale",
  ]);
  const OUTCOMES = Object.freeze([
    "pending", "accepted", "more_evidence_required", "correction_required",
    "rejected", "blocked", "stale",
  ]);
  const TERMINAL_STATUSES = Object.freeze(["accepted", "rejected"]);
  const REASON_CODES = Object.freeze([
    "verification_accepted", "insufficient_evidence", "conflicting_evidence",
    "action_correction_required", "verification_rejected", "invalid_reference",
    "cross_project_reference", "stale_verification", "stale_action", "stale_evidence",
    "unsupported_outcome", "terminal_decision", "corrupted_input",
  ]);
  const VERIFICATION_OUTCOMES = Object.freeze({
    verified: Object.freeze(["accepted", "more_evidence_required", "correction_required", "rejected"]),
    needs_evidence: Object.freeze(["more_evidence_required", "correction_required", "rejected"]),
    contradicted: Object.freeze(["more_evidence_required", "correction_required", "rejected"]),
    rejected: Object.freeze(["correction_required", "rejected"]),
  });
  const RECOMMENDATIONS = Object.freeze({
    verified: "accepted", needs_evidence: "more_evidence_required",
    contradicted: "correction_required", rejected: "rejected",
    blocked: "blocked", stale: "stale",
  });
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

  class PatternExecutionDecisionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionDecisionError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw decisionError("corrupted_input", "Decision содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw decisionError("corrupted_input", "Decision содержит неподдерживаемое значение.");
    if (seen.has(value)) throw decisionError("corrupted_input", "Decision не поддерживает циклические данные.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      result = `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw decisionError("corrupted_input", "Decision принимает только canonical JSON objects.");
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

  function allowedOutcomesForVerification(status) {
    return Object.freeze(stableIds(VERIFICATION_OUTCOMES[status] || []));
  }

  function recommendPatternExecutionOutcome(status) {
    return RECOMMENDATIONS[status] || null;
  }

  function buildPatternExecutionDecision(source = {}, options = {}) {
    const normalized = normalizeSource(source);
    const assessment = assessSource(normalized);
    const now = deterministicTimestamp(options.now, normalized.verification?.updatedAt, normalized.action?.updatedAt, normalized.project?.updated_at);
    const id = text(options.id);
    if (!id) throw decisionError("invalid_reference", "Для decision требуется явный identity.");
    const epoch = positiveInteger(options.epoch) || 1;
    const references = sourceReferences(normalized);
    const status = assessment.status;
    const outcome = status === "blocked" || status === "stale" ? status : "pending";
    const reasonCode = status === "blocked" || status === "stale" ? assessment.reasonCode : null;
    const snapshot = {
      schemaVersion: SCHEMA_VERSION, version: VERSION, kind: PROGRESS_KIND, type: PROGRESS_KIND,
      id, projectId: references.projectId, calculationId: references.calculationId,
      executionPlanId: references.executionPlanId, sessionId: references.sessionId,
      actionId: references.actionId, actionRevision: references.actionRevision,
      actionFingerprint: references.actionFingerprint, verificationId: references.verificationId,
      verificationRevision: references.verificationRevision,
      verificationFingerprint: references.verificationFingerprint,
      verificationStatus: references.verificationStatus,
      verificationEpoch: references.verificationEpoch,
      criterionIds: references.criterionIds, evidenceReferences: references.evidenceReferences,
      previousDecisionId: options.previousDecisionId || null,
      status, recommendation: recommendPatternExecutionOutcome(references.verificationStatus),
      allowedOutcomes: allowedOutcomesForVerification(references.verificationStatus),
      decision: normalizeDecision({
        outcome, reasonCode, explanation: "", requiredFollowUp: null,
        selectedCriterionIds: [], selectedEvidenceIds: [],
      }),
      inputFingerprint: decisionInputFingerprint(normalized),
      epoch, revision: 1, createdAt: now, updatedAt: now, decidedAt: null,
      importedDiagnostic: null, fingerprint: null,
    };
    snapshot.fingerprint = fingerprintPatternExecutionDecision(snapshot);
    return freeze(snapshot);
  }

  function updatePatternExecutionDecision(snapshot, patch = {}, source = {}, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    if (TERMINAL_STATUSES.includes(snapshot.status)) throw decisionError("terminal_decision", "Terminal decision изменяется только через rebuild.");
    const forbidden = ["id", "projectId", "calculationId", "executionPlanId", "sessionId", "actionId", "verificationId", "verificationRevision", "verificationFingerprint", "previousDecisionId", "epoch", "outcome", "decision"];
    if (forbidden.some((field) => Object.prototype.hasOwnProperty.call(patch, field))) throw decisionError("invalid_reference", "Supporting identifiers и outcome нельзя менять обычным update.");
    const requested = patch.status || patch.lifecycle;
    if (!requested || !["ready", "deciding"].includes(requested)) throw decisionError("unsupported_outcome", "Update поддерживает только явный переход ready/deciding.");
    const projection = projectPatternExecutionDecision(snapshot, source);
    if (["blocked", "stale"].includes(projection.effectiveStatus)) throw decisionError(projection.reasonCode, "Decision нельзя редактировать при blocked/stale входах.");
    const next = clone(snapshot);
    next.status = requested;
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(options.now, source?.verification?.updatedAt, snapshot.updatedAt);
    next.fingerprint = fingerprintPatternExecutionDecision(next);
    return freeze(next);
  }

  function decidePatternExecution(snapshot, source = {}, command = {}) {
    requireSnapshot(snapshot);
    checkConcurrency(snapshot, command);
    if (TERMINAL_STATUSES.includes(snapshot.status)) throw decisionError("terminal_decision", "Terminal decision уже зафиксирован и не может быть изменён.");
    const projection = projectPatternExecutionDecision(snapshot, source);
    if (projection.effectiveStatus === "blocked") throw decisionError(projection.reasonCode || "corrupted_input", "Целостность входов decision не доказана.");
    if (projection.effectiveStatus === "stale") throw decisionError(projection.reasonCode || "stale_verification", "Verification изменилась; требуется отдельный rebuild decision.");
    const outcome = text(command.outcome);
    const allowed = allowedOutcomesForVerification(projection.verificationStatus);
    if (!OUTCOMES.includes(outcome) || !allowed.includes(outcome)) throw decisionError("unsupported_outcome", "Outcome недопустим для текущей verification.", { outcome, allowedOutcomes: allowed });
    if (outcome === "accepted" && projection.verificationStatus !== "verified") throw decisionError("unsupported_outcome", "Accepted разрешён только для актуальной verified verification.");
    const reasonCode = text(command.reasonCode);
    if (!REASON_CODES.includes(reasonCode)) throw decisionError("unsupported_outcome", "Reason code не поддерживается.", { reasonCode });
    validateReasonForOutcome(outcome, reasonCode);
    const selectedCriterionIds = stableIds(command.selectedCriterionIds);
    const selectedEvidenceIds = stableIds(command.selectedEvidenceIds);
    validateSelections(snapshot, selectedCriterionIds, selectedEvidenceIds);
    const next = clone(snapshot);
    next.status = outcome;
    next.recommendation = recommendPatternExecutionOutcome(projection.verificationStatus);
    next.allowedOutcomes = allowed;
    next.decision = normalizeDecision({
      outcome, reasonCode, explanation: safeExplanation(command.explanation),
      requiredFollowUp: normalizeFollowUp(command.requiredFollowUp),
      selectedCriterionIds, selectedEvidenceIds,
    });
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, source?.verification?.updatedAt, snapshot.updatedAt);
    next.decidedAt = next.updatedAt;
    next.fingerprint = fingerprintPatternExecutionDecision(next);
    return freeze(next);
  }

  function rebuildPatternExecutionDecision(snapshot, source = {}, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    const id = text(options.id);
    if (!id || id === snapshot.id) throw decisionError("invalid_reference", "Rebuild требует новый decision ID.");
    const rebuilt = buildPatternExecutionDecision(source, {
      id, epoch: snapshot.epoch + 1, previousDecisionId: snapshot.id,
      now: deterministicTimestamp(options.now, source?.verification?.updatedAt, snapshot.updatedAt),
    });
    return freeze({ changed: true, decision: rebuilt, previousDecision: snapshot });
  }

  function projectPatternExecutionDecision(snapshot, source = {}) {
    try { requireSnapshot(snapshot); } catch (error) { return projection("blocked", "corrupted_input", null, [], null); }
    const normalized = normalizeSource(source);
    const assessment = assessSource(normalized);
    if (assessment.status === "blocked") return projection("blocked", assessment.reasonCode, normalized.verification?.status || null, [], snapshot);
    if (assessment.status === "stale") return projection("stale", assessment.reasonCode, normalized.verification?.status || null, [], snapshot);
    const currentFingerprint = decisionInputFingerprint(normalized);
    if (snapshot.inputFingerprint !== currentFingerprint) return projection("stale", staleReason(snapshot, normalized), normalized.verification?.status || null, allowedOutcomesForVerification(normalized.verification?.status), snapshot);
    return projection(snapshot.status, snapshot.decision.reasonCode, normalized.verification.status, allowedOutcomesForVerification(normalized.verification.status), snapshot);
  }

  function isPatternExecutionDecisionStale(snapshot, source = {}) {
    return projectPatternExecutionDecision(snapshot, source).effectiveStatus === "stale";
  }

  function decisionInputFingerprint(source = {}) {
    const normalized = normalizeSource(source);
    const references = sourceReferences(normalized);
    return fingerprint({
      projectId: references.projectId, calculationId: references.calculationId,
      executionPlanId: references.executionPlanId, sessionId: references.sessionId,
      actionId: references.actionId, actionRevision: references.actionRevision,
      actionFingerprint: references.actionFingerprint, verificationId: references.verificationId,
      verificationRevision: references.verificationRevision,
      verificationFingerprint: references.verificationFingerprint,
      verificationStatus: references.verificationStatus, verificationEpoch: references.verificationEpoch,
      criterionIds: references.criterionIds, evidenceReferences: references.evidenceReferences,
    });
  }

  function fingerprintPatternExecutionDecision(snapshot) {
    return fingerprint({
      schemaVersion: snapshot.schemaVersion, version: snapshot.version, kind: snapshot.kind, type: snapshot.type,
      id: snapshot.id, projectId: snapshot.projectId, calculationId: snapshot.calculationId,
      executionPlanId: snapshot.executionPlanId, sessionId: snapshot.sessionId,
      actionId: snapshot.actionId, actionRevision: snapshot.actionRevision, actionFingerprint: snapshot.actionFingerprint,
      verificationId: snapshot.verificationId, verificationRevision: snapshot.verificationRevision,
      verificationFingerprint: snapshot.verificationFingerprint, verificationStatus: snapshot.verificationStatus,
      verificationEpoch: snapshot.verificationEpoch, criterionIds: stableIds(snapshot.criterionIds),
      evidenceReferences: stableReferences(snapshot.evidenceReferences), previousDecisionId: snapshot.previousDecisionId,
      status: snapshot.status, recommendation: snapshot.recommendation,
      allowedOutcomes: stableIds(snapshot.allowedOutcomes), decision: normalizeDecision(snapshot.decision),
      inputFingerprint: snapshot.inputFingerprint, epoch: snapshot.epoch, revision: snapshot.revision,
      createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, decidedAt: snapshot.decidedAt,
      importedDiagnostic: normalize(snapshot.importedDiagnostic),
    });
  }

  function validatePatternExecutionDecision(snapshot) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push({ code, details: normalize(details) });
    try { canonicalize(snapshot); } catch (error) { invalid(error.code || "corrupted_input"); return finish(errors); }
    if (!snapshot || snapshot.kind !== PROGRESS_KIND || snapshot.type !== PROGRESS_KIND || snapshot.schemaVersion !== 1 || snapshot.version !== 1) invalid("decision_kind_invalid");
    for (const field of ["id", "projectId", "calculationId", "executionPlanId", "sessionId", "actionId", "verificationId", "verificationFingerprint", "inputFingerprint", "fingerprint"]) if (!text(snapshot?.[field])) invalid("required_field_missing", { field });
    if (!positiveInteger(snapshot?.verificationRevision) || !positiveInteger(snapshot?.verificationEpoch) || !positiveInteger(snapshot?.actionRevision) || !positiveInteger(snapshot?.epoch) || !positiveInteger(snapshot?.revision)) invalid("revision_invalid");
    if (!STATUSES.includes(snapshot?.status) || !OUTCOMES.includes(snapshot?.decision?.outcome)) invalid("unsupported_outcome");
    if (snapshot?.decision?.reasonCode !== null && !REASON_CODES.includes(snapshot.decision.reasonCode)) invalid("reason_code_invalid");
    if (!Array.isArray(snapshot?.criterionIds) || !Array.isArray(snapshot?.evidenceReferences) || !Array.isArray(snapshot?.allowedOutcomes) || !Array.isArray(snapshot?.decision?.selectedCriterionIds) || !Array.isArray(snapshot?.decision?.selectedEvidenceIds)) invalid("collections_invalid");
    if (!isStableUnique(snapshot?.criterionIds) || !isStableUnique(snapshot?.allowedOutcomes) || !isStableUnique(snapshot?.decision?.selectedCriterionIds) || !isStableUnique(snapshot?.decision?.selectedEvidenceIds)) invalid("collection_not_normalized");
    if (snapshot?.decision?.selectedCriterionIds?.some((id) => !snapshot.criterionIds.includes(id))) invalid("invalid_reference", { field: "selectedCriterionIds" });
    const evidenceIds = new Set(array(snapshot?.evidenceReferences).map((entry) => entry.id));
    if (evidenceIds.size !== array(snapshot?.evidenceReferences).length || snapshot?.decision?.selectedEvidenceIds?.some((id) => !evidenceIds.has(id))) invalid("invalid_reference", { field: "selectedEvidenceIds" });
    if (TERMINAL_STATUSES.includes(snapshot?.status) && snapshot.status !== snapshot.decision.outcome) invalid("terminal_decision");
    if (snapshot?.status === "accepted" && snapshot.verificationStatus !== "verified") invalid("unsupported_outcome");
    if (!isTimestamp(snapshot?.createdAt) || !isTimestamp(snapshot?.updatedAt) || snapshot?.decidedAt !== null && !isTimestamp(snapshot.decidedAt)) invalid("timestamp_invalid");
    if (text(snapshot?.fingerprint) && snapshot.fingerprint !== fingerprintPatternExecutionDecision(snapshot)) invalid("decision_fingerprint_mismatch");
    return finish(errors);
  }

  function serializePatternExecutionDecision(snapshot) { requireSnapshot(snapshot); return canonicalize(snapshot); }
  function deserializePatternExecutionDecision(value) {
    let snapshot;
    try { snapshot = typeof value === "string" ? JSON.parse(value) : clone(value); } catch { throw decisionError("corrupted_input", "Decision JSON повреждён."); }
    requireSnapshot(snapshot); return freeze(snapshot);
  }

  function remapPatternExecutionDecision(snapshot, referenceMap) {
    requireSnapshot(snapshot);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(snapshot), map);
    next.criterionIds = stableIds(next.criterionIds);
    next.evidenceReferences = stableReferences(next.evidenceReferences);
    next.allowedOutcomes = stableIds(next.allowedOutcomes);
    next.decision = normalizeDecision(next.decision);
    next.inputFingerprint = fingerprint({ remapped: true, source: {
      projectId: next.projectId, calculationId: next.calculationId, executionPlanId: next.executionPlanId,
      sessionId: next.sessionId, actionId: next.actionId, actionRevision: next.actionRevision,
      actionFingerprint: next.actionFingerprint, verificationId: next.verificationId,
      verificationRevision: next.verificationRevision, verificationFingerprint: next.verificationFingerprint,
      verificationStatus: next.verificationStatus, verificationEpoch: next.verificationEpoch,
      criterionIds: next.criterionIds, evidenceReferences: next.evidenceReferences,
    } });
    next.fingerprint = fingerprintPatternExecutionDecision(next);
    return freeze(next);
  }

  function makeImportedPatternExecutionDecisionStale(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const next = clone(snapshot);
    next.status = "stale";
    next.decision = normalizeDecision({ ...next.decision, outcome: "stale", reasonCode: "stale_verification" });
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(options.now, snapshot.updatedAt);
    next.decidedAt = null;
    next.importedDiagnostic = {
      reason: options.reason || "import_identity_unproven", collision: Boolean(options.collision),
      previousStatus: snapshot.status, previousOutcome: snapshot.decision.outcome,
    };
    next.fingerprint = fingerprintPatternExecutionDecision(next);
    return freeze(next);
  }

  async function loadSource(repository, projectId) {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate.project || aggregate;
    const calculationId = project.active_calculation_id;
    const verificationRecords = calculationId ? await repository.listPatternExecutionVerification(projectId, calculationId) : [];
    const verification = verificationRecords.at(-1)?.state || null;
    const actionRecord = calculationId ? await repository.getPatternExecutionAction(projectId, calculationId) : null;
    const evidenceRecords = calculationId ? await repository.listPatternExecutionEvidence(projectId, calculationId) : [];
    return { project, projectId, calculationId, verification, action: actionRecord?.state || null, evidence: evidenceRecords.map((entry) => entry.state) };
  }

  async function createForProject(repository, projectId, options = {}) {
    const source = await loadSource(repository, projectId);
    const previous = await repository.getPatternExecutionDecision(projectId, null, source.calculationId);
    const snapshot = buildPatternExecutionDecision(source, {
      ...options, id: options.id || globalObject.YarnAIProjectSystem?.uuidv7?.(),
      epoch: (previous?.state?.epoch || 0) + 1,
    });
    await repository.savePatternExecutionDecision(projectId, snapshot, { operationKind: "PATTERN_EXECUTION_DECISION_CREATED" });
    return readForProject(repository, projectId, snapshot.id);
  }

  async function readForProject(repository, projectId, decisionId = null) {
    let source;
    try { source = await loadSource(repository, projectId); }
    catch (error) { return { projectId, rawDecision: null, decisionRecord: null, effectiveStatus: "blocked", reasonCode: error.code || "corrupted_input", allowedOutcomes: [], recommendation: null, availableCommands: [] }; }
    let record;
    try { record = await repository.getPatternExecutionDecision(projectId, decisionId, source.calculationId); }
    catch (error) { return { ...source, rawDecision: null, decisionRecord: null, effectiveStatus: "blocked", reasonCode: error.code || "corrupted_input", allowedOutcomes: [], recommendation: null, availableCommands: [] }; }
    const snapshot = record?.state || null;
    if (!snapshot) {
      const assessment = assessSource(normalizeSource(source));
      return { ...source, rawDecision: null, decisionRecord: null, effectiveStatus: assessment.status, reasonCode: assessment.reasonCode, verificationStatus: source.verification?.status || null, allowedOutcomes: allowedOutcomesForVerification(source.verification?.status), recommendation: recommendPatternExecutionOutcome(source.verification?.status), availableCommands: assessment.status === "ready" ? ["create"] : [] };
    }
    const projected = projectPatternExecutionDecision(snapshot, source);
    const availableCommands = projected.effectiveStatus === "stale" ? ["rebuild"] : projected.effectiveStatus === "blocked" ? [] : TERMINAL_STATUSES.includes(snapshot.status) ? [] : ["decide", "rebuild"];
    return { ...source, rawDecision: snapshot, decisionRecord: record, ...projected, recommendation: recommendPatternExecutionOutcome(projected.verificationStatus), availableCommands };
  }

  async function decideForProject(repository, projectId, decisionId, command) {
    const inspected = await readForProject(repository, projectId, decisionId);
    if (!inspected.rawDecision) throw decisionError("invalid_reference", "Decision не найдена.");
    const next = decidePatternExecution(inspected.rawDecision, inspected, command);
    await repository.savePatternExecutionDecision(projectId, next, { recordId: inspected.decisionRecord.progress_id, expectedRevision: command.expectedRevision, expectedFingerprint: command.expectedFingerprint, operationKind: `PATTERN_EXECUTION_DECISION_${next.status.toUpperCase()}` });
    return readForProject(repository, projectId, next.id);
  }

  async function updateForProject(repository, projectId, decisionId, patch, expectedRevision, expectedFingerprint, options = {}) {
    const inspected = await readForProject(repository, projectId, decisionId);
    if (!inspected.rawDecision) throw decisionError("invalid_reference", "Decision не найдена.");
    const next = updatePatternExecutionDecision(inspected.rawDecision, patch, inspected, { ...options, expectedRevision, expectedFingerprint });
    await repository.savePatternExecutionDecision(projectId, next, { recordId: inspected.decisionRecord.progress_id, expectedRevision, expectedFingerprint, operationKind: "PATTERN_EXECUTION_DECISION_UPDATED" });
    return readForProject(repository, projectId, next.id);
  }

  async function rebuildForProject(repository, projectId, decisionId, input = {}) {
    const inspected = await readForProject(repository, projectId, decisionId);
    if (!inspected.rawDecision) throw decisionError("invalid_reference", "Decision не найдена.");
    const rebuilt = rebuildPatternExecutionDecision(inspected.rawDecision, inspected, {
      ...input, id: input.id || globalObject.YarnAIProjectSystem?.uuidv7?.(),
      expectedRevision: input.expectedRevision, expectedFingerprint: input.expectedFingerprint,
    });
    await repository.savePatternExecutionDecision(projectId, rebuilt.decision, { operationKind: "PATTERN_EXECUTION_DECISION_REBUILT" });
    return readForProject(repository, projectId, rebuilt.decision.id);
  }

  function normalizeSource(source) {
    return {
      project: source?.project || null, projectId: source?.projectId || source?.project?.project_id || source?.verification?.projectId || null,
      calculationId: source?.calculationId || source?.verification?.calculationId || source?.action?.calculationId || null,
      verification: source?.verification || source?.rawVerification || null,
      action: source?.action || null, evidence: array(source?.evidence),
    };
  }

  function assessSource(source) {
    const verification = source.verification;
    if (!verification || typeof verification !== "object") return { status: "blocked", reasonCode: "invalid_reference" };
    if (!text(verification.id) || !positiveInteger(verification.revision) || !text(verification.fingerprint) || !text(verification.status)) return { status: "blocked", reasonCode: "corrupted_input" };
    if (source.projectId && verification.projectId !== source.projectId) return { status: "blocked", reasonCode: "cross_project_reference" };
    if (source.calculationId && verification.calculationId !== source.calculationId) return { status: "blocked", reasonCode: "invalid_reference" };
    if (verification.status === "blocked") return { status: "blocked", reasonCode: "corrupted_input" };
    if (verification.status === "stale") return { status: "stale", reasonCode: "stale_verification" };
    if (!["verified", "needs_evidence", "contradicted", "rejected"].includes(verification.status)) return { status: "waiting", reasonCode: "invalid_reference" };
    const action = source.action;
    if (!action || action.projectId !== verification.projectId || verification.actionId !== action.id) return { status: "blocked", reasonCode: action?.projectId && action.projectId !== verification.projectId ? "cross_project_reference" : "invalid_reference" };
    if (verification.actionRevision !== action.revision || verification.actionFingerprint !== action.fingerprint) return { status: "stale", reasonCode: "stale_action" };
    const bundles = new Map(source.evidence.map((entry) => [entry?.id, entry]));
    for (const id of array(verification.evidenceIds)) {
      const item = bundles.get(id);
      if (!item) return { status: "blocked", reasonCode: "invalid_reference" };
      if (item.projectId && item.projectId !== verification.projectId) return { status: "blocked", reasonCode: "cross_project_reference" };
      if (["stale", "superseded", "cancelled"].includes(item.lifecycle) || ["invalid", "stale", "superseded"].includes(item.validity)) return { status: "blocked", reasonCode: "stale_evidence" };
    }
    return { status: "ready", reasonCode: null };
  }

  function sourceReferences(source) {
    const verification = source.verification || {};
    const action = source.action || {};
    const identity = action.sourceIdentity || {};
    const plan = identity.executionPlanIdentity || identity.plan || identity.runtimeSourceIdentity?.chain?.plan || {};
    const session = identity.sessionIdentity || identity.session || identity.runtimeSourceIdentity?.chain?.session || {};
    const bundleById = new Map(source.evidence.map((entry) => [entry?.id, entry]));
    const evidenceIds = new Set(array(verification.evidenceIds));
    for (const result of array(verification.criterionResults)) for (const id of [...array(result.supportingEvidenceIds), ...array(result.conflictingEvidenceIds)]) evidenceIds.add(id);
    const itemById = new Map();
    for (const bundle of source.evidence) for (const item of array(bundle?.evidenceItems)) itemById.set(item.id, item);
    const evidenceReferences = [...evidenceIds].filter(text).map((id) => {
      const record = bundleById.get(id) || itemById.get(id) || {};
      const bundle = itemById.has(id) ? source.evidence.find((entry) => array(entry?.evidenceItems).some((item) => item.id === id)) || {} : record;
      return { id, revision: record.revision || bundle.revision || null, fingerprint: record.fingerprint || bundle.fingerprint || null };
    });
    return {
      projectId: source.projectId || verification.projectId || action.projectId || null,
      calculationId: source.calculationId || verification.calculationId || action.calculationId || null,
      executionPlanId: plan.id || action.executionPlanId || null, sessionId: session.id || action.sessionId || null,
      actionId: verification.actionId || action.id || null, actionRevision: verification.actionRevision || action.revision || null,
      actionFingerprint: verification.actionFingerprint || action.fingerprint || null,
      verificationId: verification.id || null, verificationRevision: verification.revision || null,
      verificationFingerprint: verification.fingerprint || null, verificationStatus: verification.status || null,
      verificationEpoch: verification.epoch || null,
      criterionIds: stableIds(array(verification.expectedCriteria).map((entry) => entry?.id || entry?.criterionId).concat(array(verification.criterionResults).map((entry) => entry?.criterionId))),
      evidenceReferences: stableReferences(evidenceReferences),
    };
  }

  function staleReason(snapshot, source) {
    const verification = source.verification || {};
    if (snapshot.verificationId !== verification.id || snapshot.verificationRevision !== verification.revision || snapshot.verificationFingerprint !== verification.fingerprint || snapshot.verificationStatus !== verification.status || snapshot.verificationEpoch !== verification.epoch) return "stale_verification";
    if (snapshot.actionRevision !== source.action?.revision || snapshot.actionFingerprint !== source.action?.fingerprint) return "stale_action";
    return "stale_evidence";
  }

  function validateSelections(snapshot, criteria, evidence) {
    const criterionIds = new Set(snapshot.criterionIds);
    if (criteria.some((id) => !criterionIds.has(id))) throw decisionError("invalid_reference", "Выбранный criterion не принадлежит verification.");
    const evidenceIds = new Set(snapshot.evidenceReferences.map((entry) => entry.id));
    if (evidence.some((id) => !evidenceIds.has(id))) throw decisionError("invalid_reference", "Выбранный evidence не принадлежит verification.");
  }

  function validateReasonForOutcome(outcome, reasonCode) {
    const allowed = {
      accepted: ["verification_accepted"],
      more_evidence_required: ["insufficient_evidence", "conflicting_evidence"],
      correction_required: ["action_correction_required", "conflicting_evidence"],
      rejected: ["verification_rejected", "conflicting_evidence"],
    }[outcome] || [];
    if (!allowed.includes(reasonCode)) throw decisionError("unsupported_outcome", "Reason code не соответствует выбранному outcome.");
  }

  function normalizeDecision(value = {}) {
    return {
      outcome: text(value.outcome) || "pending", reasonCode: text(value.reasonCode) || null,
      explanation: safeExplanation(value.explanation), requiredFollowUp: normalizeFollowUp(value.requiredFollowUp),
      selectedCriterionIds: stableIds(value.selectedCriterionIds), selectedEvidenceIds: stableIds(value.selectedEvidenceIds),
    };
  }
  function normalizeFollowUp(value) { if (value === null || value === undefined || value === "") return null; if (typeof value === "string") return value.trim().slice(0, 1000); return normalize(clone(value)); }
  function safeExplanation(value) { return typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 4000) : ""; }
  function stableIds(values) { return [...new Set(array(values).map(text).filter(Boolean))].sort(lexical); }
  function stableReferences(values) { const byId = new Map(); for (const entry of array(values)) if (text(entry?.id)) byId.set(entry.id.trim(), { id: entry.id.trim(), revision: positiveInteger(entry.revision) || null, fingerprint: text(entry.fingerprint) || null }); return [...byId.values()].sort((left, right) => lexical(left.id, right.id)); }
  function isStableUnique(values) { return Array.isArray(values) && canonicalize(values) === canonicalize(stableIds(values)); }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }
  function projection(effectiveStatus, reasonCode, verificationStatus, allowedOutcomes, snapshot) { return { effectiveStatus, reasonCode: reasonCode || null, verificationStatus, allowedOutcomes: [...allowedOutcomes], stale: effectiveStatus === "stale", blocked: effectiveStatus === "blocked", rawStatus: snapshot?.status || null }; }
  function finish(errors) { const values = [...errors].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left), canonicalize(right))); return freeze({ valid: values.length === 0, errors: values }); }
  function requireSnapshot(snapshot) { const report = validatePatternExecutionDecision(snapshot); if (!report.valid) throw decisionError("corrupted_input", "Decision snapshot повреждён.", { errors: report.errors }); }
  function checkConcurrency(snapshot, options = {}) { if (options.expectedRevision !== undefined && options.expectedRevision !== snapshot.revision) throw decisionError("decision_revision_conflict", "Decision изменена другой операцией."); if (options.expectedFingerprint !== undefined && options.expectedFingerprint !== snapshot.fingerprint) throw decisionError("decision_fingerprint_conflict", "Decision fingerprint изменился."); }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function normalize(value) { if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(lexical)) next[key] = normalize(value[key]); return next; } return value; }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return typeof value === "string" && value.trim() ? value.trim() : ""; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function isTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
  function lexical(left, right) { return String(left ?? "").localeCompare(String(right ?? "")); }
  function decisionError(code, message, details) { return new PatternExecutionDecisionError(code, message, details); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, OUTCOMES, TERMINAL_STATUSES, REASON_CODES,
    PatternExecutionDecisionError, canonicalize, fingerprint, allowedOutcomesForVerification,
    recommendPatternExecutionOutcome, buildPatternExecutionDecision, updatePatternExecutionDecision,
    decidePatternExecution, rebuildPatternExecutionDecision, projectPatternExecutionDecision,
    isPatternExecutionDecisionStale, decisionInputFingerprint, fingerprintPatternExecutionDecision,
    validatePatternExecutionDecision, serializePatternExecutionDecision, deserializePatternExecutionDecision,
    remapPatternExecutionDecision, makeImportedPatternExecutionDecisionStale,
    createForProject, readForProject, decideForProject, updateForProject, rebuildForProject,
  });
  globalObject.YarnAIPatternExecutionDecision = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
