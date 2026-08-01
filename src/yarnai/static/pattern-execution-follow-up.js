"use strict";

(function exposePatternExecutionFollowUp(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_FOLLOW_UP";
  const STATUSES = Object.freeze([
    "waiting", "ready", "scheduling", "active", "completed", "failed",
    "cancelled", "blocked", "stale",
  ]);
  const TERMINAL_STATUSES = Object.freeze(["completed", "failed", "cancelled"]);
  const FOLLOW_UP_KINDS = Object.freeze([
    "completion", "collect_evidence", "corrective_action", "termination",
  ]);
  const SUPPORTED_OUTCOMES = Object.freeze([
    "accepted", "more_evidence_required", "correction_required", "rejected",
  ]);
  const NON_TERMINAL_DECISION_STATUSES = Object.freeze(["waiting", "ready", "deciding"]);
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

  class PatternExecutionFollowUpError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionFollowUpError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw followUpError("corrupted_input", "Follow-up contains an invalid number.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) throw followUpError("corrupted_input", "Follow-up contains an unsupported value.");
    if (seen.has(value)) throw followUpError("corrupted_input", "Follow-up cannot contain cyclic data.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      result = `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    } else {
      seen.delete(value);
      throw followUpError("corrupted_input", "Follow-up accepts canonical JSON objects only.");
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

  function canonicalizeSemanticSet(values) {
    const unique = new Map();
    for (const value of array(values)) {
      const normalized = normalize(clone(value));
      unique.set(canonicalize(normalized), normalized);
    }
    return [...unique.entries()].sort((left, right) => lexical(left[0], right[0])).map((entry) => entry[1]);
  }

  function recommendPatternExecutionFollowUp(decisionOrSource = {}) {
    const source = normalizeSource(decisionOrSource);
    const assessment = assessSource(source);
    if (assessment.status === "blocked" || assessment.status === "stale" || assessment.status === "waiting") {
      return freeze({
        effectiveStatus: assessment.status,
        reasonCode: assessment.reasonCode,
        outcome: assessment.outcome,
        recommendedKind: null,
        allowedKinds: [],
        requiresExplicitChoice: false,
        writes: false,
      });
    }
    const allowedKinds = allowedKindsForOutcome(assessment.outcome);
    const recommendedKind = allowedKinds.length === 1 ? allowedKinds[0] : null;
    return freeze({
      effectiveStatus: "ready",
      reasonCode: source.decision.decision.reasonCode,
      outcome: assessment.outcome,
      recommendedKind,
      allowedKinds,
      requiresExplicitChoice: assessment.outcome === "rejected",
      writes: false,
    });
  }

  function allowedKindsForOutcome(outcome) {
    return Object.freeze(stableIds(({
      accepted: ["completion"],
      more_evidence_required: ["collect_evidence"],
      correction_required: ["corrective_action"],
      rejected: ["corrective_action", "termination"],
    })[outcome] || []));
  }

  function createPatternExecutionFollowUp(source = {}, command = {}) {
    const normalized = normalizeSource(source);
    const assessment = assessSource(normalized);
    if (assessment.status !== "ready") throw followUpError(assessment.reasonCode || "decision_not_final", "Decision is not ready for follow-up materialization.");
    requireCreationCommand(normalized, command, assessment.outcome);
    const id = text(command.id);
    if (!id) throw followUpError("invalid_reference", "Follow-up requires an explicit identity.");
    const kind = text(command.followUpKind || command.kind);
    const selection = normalizeSelection(command);
    validateSelection(normalized, kind, assessment.outcome, selection);
    const references = sourceReferences(normalized, selection);
    const now = deterministicTimestamp(command.now, normalized.decision.updatedAt, normalized.project?.updated_at);
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      version: VERSION,
      kind: PROGRESS_KIND,
      type: PROGRESS_KIND,
      id,
      projectId: references.projectId,
      calculationId: references.calculationId,
      planId: references.planId,
      sessionId: references.sessionId,
      decisionId: references.decisionId,
      decisionRevision: references.decisionRevision,
      decisionFingerprint: references.decisionFingerprint,
      decisionStatus: references.decisionStatus,
      decisionEpoch: references.decisionEpoch,
      outcome: assessment.outcome,
      followUpKind: kind,
      reasonCode: text(command.reasonCode),
      selectedCriterionIds: selection.selectedCriterionIds,
      selectedEvidenceIds: selection.selectedEvidenceIds,
      selectedActionIds: selection.selectedActionIds,
      targetReferences: selection.targetReferences,
      evidenceRequirements: selection.evidenceRequirements,
      actionTargets: selection.actionTargets,
      verificationReference: references.verificationReference,
      evidenceReferences: references.evidenceReferences,
      actionReferences: references.actionReferences,
      previousFollowUpId: text(command.previousFollowUpId) || null,
      epoch: positiveInteger(command.epoch) || 1,
      revision: 1,
      status: "ready",
      inputFingerprint: null,
      createdAt: now,
      updatedAt: now,
      scheduledAt: null,
      activatedAt: null,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      terminalResult: null,
      failure: null,
      cancellation: null,
      importedDiagnostic: null,
      fingerprint: null,
    };
    snapshot.inputFingerprint = followUpInputFingerprint(normalized, snapshot);
    snapshot.fingerprint = fingerprintPatternExecutionFollowUp(snapshot);
    return freeze(snapshot);
  }

  function updatePatternExecutionFollowUp(snapshot, source = {}, patch = {}, command = {}) {
    requireSnapshot(snapshot);
    requireBoundCommand(snapshot, command);
    assertMutable(snapshot);
    const projection = projectPatternExecutionFollowUp(snapshot, source);
    if (["blocked", "stale"].includes(projection.effectiveStatus)) throw followUpError(projection.reasonCode, "Blocked or stale follow-up cannot be updated.");
    const requested = text(patch.status || patch.lifecycle);
    if (snapshot.status !== "waiting" || requested !== "ready") throw followUpError("invalid_transition", "Only waiting to ready is supported by update.");
    return transition(snapshot, "ready", command, {});
  }

  function schedulePatternExecutionFollowUp(snapshot, source = {}, command = {}) {
    assertExecutable(snapshot, source, command, "ready");
    return transition(snapshot, "scheduling", command, { scheduledAt: deterministicTimestamp(command.now, snapshot.updatedAt) });
  }

  function activatePatternExecutionFollowUp(snapshot, source = {}, command = {}) {
    assertExecutable(snapshot, source, command, "scheduling");
    return transition(snapshot, "active", command, { activatedAt: deterministicTimestamp(command.now, snapshot.updatedAt) });
  }

  function completePatternExecutionFollowUp(snapshot, source = {}, command = {}) {
    assertExecutable(snapshot, source, command, "active");
    if (!Object.prototype.hasOwnProperty.call(command, "terminalResult")) throw followUpError("terminal_result_required", "Completion requires an explicit terminal result.");
    return transition(snapshot, "completed", command, {
      completedAt: deterministicTimestamp(command.now, snapshot.updatedAt),
      terminalResult: normalize(clone(command.terminalResult)), failure: null, cancellation: null,
    });
  }

  function failPatternExecutionFollowUp(snapshot, source = {}, command = {}) {
    assertExecutable(snapshot, source, command, "active");
    if (!text(command.failure?.code || command.failureCode)) throw followUpError("failure_required", "Failure requires an explicit code.");
    return transition(snapshot, "failed", command, {
      failedAt: deterministicTimestamp(command.now, snapshot.updatedAt),
      failure: normalize(clone(command.failure || { code: command.failureCode })), terminalResult: null, cancellation: null,
    });
  }

  function cancelPatternExecutionFollowUp(snapshot, source = {}, command = {}) {
    requireSnapshot(snapshot); requireBoundCommand(snapshot, command); assertMutable(snapshot);
    const projected = projectPatternExecutionFollowUp(snapshot, source);
    if (["blocked", "stale"].includes(projected.effectiveStatus)) throw followUpError(projected.reasonCode, "Blocked or stale follow-up cannot be cancelled.");
    if (!["ready", "scheduling", "active"].includes(snapshot.status)) throw followUpError("invalid_transition", "Current lifecycle cannot be cancelled.");
    if (!text(command.cancellation?.reasonCode || command.cancellationReasonCode)) throw followUpError("cancellation_reason_required", "Cancellation requires an explicit reason.");
    return transition(snapshot, "cancelled", command, {
      cancelledAt: deterministicTimestamp(command.now, snapshot.updatedAt),
      cancellation: normalize(clone(command.cancellation || { reasonCode: command.cancellationReasonCode })), terminalResult: null, failure: null,
    });
  }

  function rebuildPatternExecutionFollowUp(snapshot, source = {}, command = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, command);
    const id = text(command.id);
    if (!id || id === snapshot.id) throw followUpError("invalid_reference", "Rebuild requires a new follow-up ID.");
    const rebuilt = createPatternExecutionFollowUp(source, {
      ...clone(command), id, previousFollowUpId: snapshot.id, epoch: snapshot.epoch + 1,
    });
    return freeze({ changed: true, followUp: rebuilt, previousFollowUp: snapshot });
  }

  function projectPatternExecutionFollowUp(snapshot, source = {}) {
    try { requireSnapshot(snapshot); } catch { return projection("blocked", "corrupted_input", null); }
    const normalized = normalizeSource(source);
    const assessment = assessSource(normalized);
    if (assessment.status === "blocked" || assessment.status === "stale" || assessment.status === "waiting") return projection(assessment.status, assessment.reasonCode, snapshot);
    if (snapshot.importedDiagnostic?.reason) return projection("stale", snapshot.importedDiagnostic.reason, snapshot);
    if (snapshot.outcome !== assessment.outcome) return projection("stale", "stale_decision", snapshot);
    const allowed = allowedKindsForOutcome(assessment.outcome);
    if (!allowed.includes(snapshot.followUpKind)) return projection("blocked", "invalid_follow_up_kind", snapshot);
    try { validateSelection(normalized, snapshot.followUpKind, snapshot.outcome, normalizeSelection(snapshot)); }
    catch (error) { return projection("blocked", error.code || "invalid_reference", snapshot); }
    if (snapshot.inputFingerprint !== followUpInputFingerprint(normalized, snapshot)) return projection("stale", staleReason(snapshot, normalized), snapshot);
    return projection(snapshot.status, snapshot.reasonCode, snapshot);
  }

  function isPatternExecutionFollowUpStale(snapshot, source = {}) {
    return projectPatternExecutionFollowUp(snapshot, source).effectiveStatus === "stale";
  }

  function followUpInputFingerprint(source = {}, configuration = {}) {
    const normalized = normalizeSource(source);
    const selection = normalizeSelection(configuration);
    const references = sourceReferences(normalized, selection);
    return fingerprint({
      projectId: references.projectId, calculationId: references.calculationId,
      planId: references.planId, sessionId: references.sessionId,
      decisionId: references.decisionId, decisionRevision: references.decisionRevision,
      decisionFingerprint: references.decisionFingerprint, decisionStatus: references.decisionStatus,
      decisionEpoch: references.decisionEpoch, outcome: normalized.decision?.decision?.outcome || null,
      followUpKind: text(configuration.followUpKind || configuration.kind),
      reasonCode: text(configuration.reasonCode),
      selectedCriterionIds: selection.selectedCriterionIds,
      selectedEvidenceIds: selection.selectedEvidenceIds,
      selectedActionIds: selection.selectedActionIds,
      targetReferences: selection.targetReferences,
      evidenceRequirements: selection.evidenceRequirements,
      actionTargets: selection.actionTargets,
      verificationReference: references.verificationReference,
      evidenceReferences: references.evidenceReferences,
      actionReferences: references.actionReferences,
    });
  }

  function fingerprintPatternExecutionFollowUp(snapshot) {
    return fingerprint({
      schemaVersion: snapshot.schemaVersion, version: snapshot.version, kind: snapshot.kind, type: snapshot.type,
      id: snapshot.id, projectId: snapshot.projectId, calculationId: snapshot.calculationId,
      planId: snapshot.planId, sessionId: snapshot.sessionId,
      decisionId: snapshot.decisionId, decisionRevision: snapshot.decisionRevision,
      decisionFingerprint: snapshot.decisionFingerprint, decisionStatus: snapshot.decisionStatus,
      decisionEpoch: snapshot.decisionEpoch, outcome: snapshot.outcome,
      followUpKind: snapshot.followUpKind, reasonCode: snapshot.reasonCode,
      selectedCriterionIds: stableIds(snapshot.selectedCriterionIds),
      selectedEvidenceIds: stableIds(snapshot.selectedEvidenceIds),
      selectedActionIds: stableIds(snapshot.selectedActionIds),
      targetReferences: stableReferences(snapshot.targetReferences),
      evidenceRequirements: canonicalizeSemanticSet(snapshot.evidenceRequirements),
      actionTargets: canonicalizeSemanticSet(snapshot.actionTargets),
      verificationReference: normalizeReference(snapshot.verificationReference),
      evidenceReferences: stableReferences(snapshot.evidenceReferences),
      actionReferences: stableReferences(snapshot.actionReferences),
      previousFollowUpId: snapshot.previousFollowUpId, epoch: snapshot.epoch,
      revision: snapshot.revision, status: snapshot.status, inputFingerprint: snapshot.inputFingerprint,
      createdAt: snapshot.createdAt, updatedAt: snapshot.updatedAt, scheduledAt: snapshot.scheduledAt,
      activatedAt: snapshot.activatedAt, completedAt: snapshot.completedAt, failedAt: snapshot.failedAt,
      cancelledAt: snapshot.cancelledAt, terminalResult: normalize(snapshot.terminalResult),
      failure: normalize(snapshot.failure), cancellation: normalize(snapshot.cancellation),
      importedDiagnostic: normalize(snapshot.importedDiagnostic),
    });
  }

  function validatePatternExecutionFollowUp(snapshot) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push({ code, details: normalize(details) });
    try { canonicalize(snapshot); } catch (error) { invalid(error.code || "corrupted_input"); return finish(errors); }
    if (!snapshot || snapshot.kind !== PROGRESS_KIND || snapshot.type !== PROGRESS_KIND || snapshot.schemaVersion !== 1 || snapshot.version !== 1) invalid("follow_up_kind_invalid");
    for (const field of ["id", "projectId", "calculationId", "planId", "sessionId", "decisionId", "decisionFingerprint", "outcome", "followUpKind", "reasonCode", "inputFingerprint", "fingerprint"]) if (!text(snapshot?.[field])) invalid("required_field_missing", { field });
    if (!positiveInteger(snapshot?.decisionRevision) || !positiveInteger(snapshot?.decisionEpoch) || !positiveInteger(snapshot?.epoch) || !positiveInteger(snapshot?.revision)) invalid("revision_invalid");
    if (!STATUSES.includes(snapshot?.status) || !SUPPORTED_OUTCOMES.includes(snapshot?.outcome) || !FOLLOW_UP_KINDS.includes(snapshot?.followUpKind) || !allowedKindsForOutcome(snapshot?.outcome).includes(snapshot?.followUpKind)) invalid("unsupported_outcome");
    for (const field of ["selectedCriterionIds", "selectedEvidenceIds", "selectedActionIds", "targetReferences", "evidenceRequirements", "actionTargets", "evidenceReferences", "actionReferences"]) if (!Array.isArray(snapshot?.[field])) invalid("collections_invalid", { field });
    for (const field of ["selectedCriterionIds", "selectedEvidenceIds", "selectedActionIds"]) if (canonicalize(array(snapshot?.[field])) !== canonicalize(stableIds(snapshot?.[field]))) invalid("collection_not_normalized", { field });
    for (const field of ["targetReferences", "evidenceReferences", "actionReferences"]) if (canonicalize(array(snapshot?.[field])) !== canonicalize(stableReferences(snapshot?.[field]))) invalid("collection_not_normalized", { field });
    for (const field of ["evidenceRequirements", "actionTargets"]) if (canonicalize(array(snapshot?.[field])) !== canonicalize(canonicalizeSemanticSet(snapshot?.[field]))) invalid("collection_not_normalized", { field });
    if (snapshot?.followUpKind === "collect_evidence" && (!snapshot.selectedCriterionIds.length || !snapshot.selectedEvidenceIds.length || !snapshot.evidenceRequirements.length || !snapshot.targetReferences.length)) invalid("evidence_reference_required");
    if (snapshot?.followUpKind === "corrective_action" && (!snapshot.selectedCriterionIds.length || !snapshot.selectedActionIds.length || !snapshot.actionTargets.length || !snapshot.targetReferences.length)) invalid("action_reference_required");
    if (TERMINAL_STATUSES.includes(snapshot?.status)) {
      const field = snapshot.status === "completed" ? "completedAt" : snapshot.status === "failed" ? "failedAt" : "cancelledAt";
      if (!isTimestamp(snapshot?.[field])) invalid("terminal_timestamp_missing", { field });
      if (snapshot.status === "completed" && snapshot.terminalResult === null || snapshot.status === "failed" && snapshot.failure === null || snapshot.status === "cancelled" && snapshot.cancellation === null) invalid("terminal_result_missing");
    }
    for (const field of ["createdAt", "updatedAt"]) if (!isTimestamp(snapshot?.[field])) invalid("timestamp_invalid", { field });
    for (const field of ["scheduledAt", "activatedAt", "completedAt", "failedAt", "cancelledAt"]) if (snapshot?.[field] !== null && !isTimestamp(snapshot[field])) invalid("timestamp_invalid", { field });
    if (text(snapshot?.fingerprint) && snapshot.fingerprint !== fingerprintPatternExecutionFollowUp(snapshot)) invalid("follow_up_fingerprint_mismatch");
    return finish(errors);
  }

  function serializePatternExecutionFollowUp(snapshot) { requireSnapshot(snapshot); return canonicalize(snapshot); }
  function deserializePatternExecutionFollowUp(value) {
    let snapshot;
    try { snapshot = typeof value === "string" ? JSON.parse(value) : clone(value); }
    catch { throw followUpError("corrupted_input", "Follow-up JSON is corrupted."); }
    requireSnapshot(snapshot);
    return freeze(snapshot);
  }

  function remapPatternExecutionFollowUp(snapshot, referenceMap) {
    requireSnapshot(snapshot);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(clone(snapshot), map);
    normalizeSnapshotCollections(next);
    next.inputFingerprint = fingerprint({ remapped: true, identity: immutableIdentity(next) });
    next.fingerprint = fingerprintPatternExecutionFollowUp(next);
    return freeze(next);
  }

  function makeImportedPatternExecutionFollowUpStale(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const next = clone(snapshot);
    next.importedDiagnostic = {
      reason: options.reason || "import_identity_unproven",
      collision: Boolean(options.collision),
      preservedStatus: snapshot.status,
      preservedFingerprint: snapshot.fingerprint,
    };
    next.fingerprint = fingerprintPatternExecutionFollowUp(next);
    return freeze(next);
  }

  async function loadSource(repository, projectId, decisionId = null) {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate.project || aggregate;
    const calculationId = project.active_calculation_id;
    const decisionRecord = calculationId ? await repository.getPatternExecutionDecision(projectId, decisionId, calculationId) : null;
    const decision = decisionRecord?.state || null;
    const actionRecord = calculationId ? await repository.getPatternExecutionAction(projectId, calculationId) : null;
    const evidenceRecords = calculationId ? await repository.listPatternExecutionEvidence(projectId, calculationId) : [];
    const verificationRecords = calculationId ? await repository.listPatternExecutionVerification(projectId, calculationId) : [];
    const verification = verificationRecords.find((entry) => entry.state?.id === decision?.verificationId)?.state || null;
    return { project, projectId, calculationId, decision, decisionRecord, action: actionRecord?.state || null, evidence: evidenceRecords.map((entry) => entry.state), verification };
  }

  async function createForProject(repository, projectId, input = {}) {
    const source = await loadSource(repository, projectId, input.decisionId || null);
    const existing = await repository.listPatternExecutionFollowUps(projectId, source.calculationId);
    const snapshot = createPatternExecutionFollowUp(source, {
      ...clone(input), id: input.id || globalObject.YarnAIProjectSystem?.uuidv7?.(),
      epoch: existing.reduce((maximum, entry) => Math.max(maximum, entry.state?.epoch || 0), 0) + 1,
    });
    await repository.savePatternExecutionFollowUp(projectId, snapshot, { operationKind: "PATTERN_EXECUTION_FOLLOW_UP_CREATED" });
    return readForProject(repository, projectId, snapshot.id);
  }

  async function readForProject(repository, projectId, followUpId = null) {
    let source;
    try { source = await loadSource(repository, projectId); }
    catch (error) { return blockedRead(projectId, error.code || "corrupted_input"); }
    let record;
    try { record = await repository.getPatternExecutionFollowUp(projectId, followUpId, source.calculationId); }
    catch (error) { return { ...source, ...blockedRead(projectId, error.code || "corrupted_input") }; }
    const snapshot = record?.state || null;
    if (!snapshot) {
      const recommendation = recommendPatternExecutionFollowUp(source);
      return { ...source, rawFollowUp: null, followUpRecord: null, ...recommendation, availableCommands: recommendation.effectiveStatus === "ready" ? ["create"] : [] };
    }
    if (snapshot.decisionId !== source.decision?.id) {
      try { source = await loadSource(repository, projectId, snapshot.decisionId); }
      catch { return { ...source, rawFollowUp: snapshot, followUpRecord: record, ...projection("blocked", "invalid_reference", snapshot), availableCommands: [] }; }
    }
    const projected = projectPatternExecutionFollowUp(snapshot, source);
    const availableCommands = projected.effectiveStatus === "stale" && TERMINAL_STATUSES.includes(snapshot.status)
      ? ["rebuild"]
      : projected.effectiveStatus === "stale" || projected.effectiveStatus === "blocked"
        ? projected.effectiveStatus === "stale" ? ["rebuild"] : []
        : commandsForStatus(snapshot.status);
    return { ...source, rawFollowUp: snapshot, followUpRecord: record, ...projected, recommendation: recommendPatternExecutionFollowUp(source), availableCommands };
  }

  async function executeForProject(repository, projectId, followUpId, commandName, command = {}) {
    const inspected = await readForProject(repository, projectId, followUpId);
    const snapshot = inspected.rawFollowUp;
    if (!snapshot) throw followUpError("invalid_reference", "Follow-up was not found.");
    const handlers = {
      schedule: schedulePatternExecutionFollowUp,
      activate: activatePatternExecutionFollowUp,
      complete: completePatternExecutionFollowUp,
      fail: failPatternExecutionFollowUp,
      cancel: cancelPatternExecutionFollowUp,
    };
    const handler = handlers[commandName];
    if (!handler) throw followUpError("invalid_transition", "Unsupported follow-up command.");
    const next = handler(snapshot, inspected, command);
    await repository.savePatternExecutionFollowUp(projectId, next, {
      recordId: inspected.followUpRecord.progress_id,
      expectedRevision: command.expectedRevision,
      expectedFingerprint: command.expectedFingerprint,
      operationKind: `PATTERN_EXECUTION_FOLLOW_UP_${next.status.toUpperCase()}`,
    });
    return readForProject(repository, projectId, next.id);
  }

  async function updateForProject(repository, projectId, followUpId, patch, expectedRevision, expectedFingerprint, options = {}) {
    const inspected = await readForProject(repository, projectId, followUpId);
    if (!inspected.rawFollowUp) throw followUpError("invalid_reference", "Follow-up was not found.");
    const command = { ...clone(options), expectedRevision, expectedFingerprint };
    const next = updatePatternExecutionFollowUp(inspected.rawFollowUp, inspected, patch, command);
    await repository.savePatternExecutionFollowUp(projectId, next, { recordId: inspected.followUpRecord.progress_id, expectedRevision, expectedFingerprint, operationKind: "PATTERN_EXECUTION_FOLLOW_UP_UPDATED" });
    return readForProject(repository, projectId, next.id);
  }

  async function rebuildForProject(repository, projectId, followUpId, input = {}) {
    const inspected = await readForProject(repository, projectId, followUpId);
    if (!inspected.rawFollowUp) throw followUpError("invalid_reference", "Follow-up was not found.");
    const rebuilt = rebuildPatternExecutionFollowUp(inspected.rawFollowUp, inspected, {
      ...clone(input), id: input.id || globalObject.YarnAIProjectSystem?.uuidv7?.(),
    });
    await repository.savePatternExecutionFollowUp(projectId, rebuilt.followUp, { operationKind: "PATTERN_EXECUTION_FOLLOW_UP_REBUILT" });
    return readForProject(repository, projectId, rebuilt.followUp.id);
  }

  function normalizeSource(source) {
    const decision = source?.decision?.kind === "PATTERN_EXECUTION_DECISION" ? source.decision : source?.rawDecision || source?.decision || null;
    return {
      project: source?.project || null,
      projectId: source?.projectId || source?.project?.project_id || decision?.projectId || null,
      calculationId: source?.calculationId || decision?.calculationId || null,
      decision,
      action: source?.action || null,
      evidence: array(source?.evidence),
      verification: source?.verification || null,
    };
  }

  function assessSource(source) {
    const decision = source.decision;
    if (!decision || typeof decision !== "object") return { status: "blocked", reasonCode: "missing_decision", outcome: null };
    const decisionApi = globalObject.YarnAIPatternExecutionDecision;
    const report = decisionApi?.validatePatternExecutionDecision?.(decision);
    if (report && !report.valid) return { status: "blocked", reasonCode: "damaged_decision", outcome: decision?.decision?.outcome || null };
    for (const field of ["id", "projectId", "calculationId", "executionPlanId", "sessionId", "fingerprint", "status"]) if (!text(decision[field])) return { status: "blocked", reasonCode: "damaged_decision", outcome: decision?.decision?.outcome || null };
    if (!positiveInteger(decision.revision) || !positiveInteger(decision.epoch) || !decision.decision) return { status: "blocked", reasonCode: "damaged_decision", outcome: decision?.decision?.outcome || null };
    if (source.projectId && decision.projectId !== source.projectId) return { status: "blocked", reasonCode: "cross_project_reference", outcome: decision.decision.outcome };
    if (source.calculationId && decision.calculationId !== source.calculationId) return { status: "blocked", reasonCode: "invalid_reference", outcome: decision.decision.outcome };
    if (decision.status === "blocked") return { status: "blocked", reasonCode: "blocked_decision", outcome: decision.decision.outcome };
    if (decision.status === "stale") return { status: "stale", reasonCode: "stale_decision", outcome: decision.decision.outcome };
    if (NON_TERMINAL_DECISION_STATUSES.includes(decision.status) || decision.decision.outcome === "pending") return { status: "waiting", reasonCode: "decision_not_final", outcome: decision.decision.outcome };
    const outcome = decision.decision.outcome;
    if (!SUPPORTED_OUTCOMES.includes(outcome) || decision.status !== outcome) return { status: "blocked", reasonCode: "unsupported_outcome", outcome };
    if (!text(decision.decision.reasonCode)) return { status: "blocked", reasonCode: "damaged_decision", outcome };
    const action = source.action;
    const verification = source.verification;
    if (!action || !verification) return { status: "blocked", reasonCode: "missing_reference", outcome };
    if (action.projectId !== decision.projectId || verification.projectId !== decision.projectId) return { status: "blocked", reasonCode: "cross_project_reference", outcome };
    if (action.id !== decision.actionId || verification.id !== decision.verificationId) return { status: "blocked", reasonCode: "invalid_reference", outcome };
    if (verification.revision !== decision.verificationRevision || verification.fingerprint !== decision.verificationFingerprint || action.revision !== decision.actionRevision || action.fingerprint !== decision.actionFingerprint) return { status: "stale", reasonCode: "stale_decision", outcome };
    const evidenceIndex = buildEvidenceIndex(source.evidence);
    for (const reference of array(decision.evidenceReferences)) {
      const found = evidenceIndex.get(reference.id);
      if (!found) return { status: "blocked", reasonCode: "missing_evidence_reference", outcome };
      if (found.projectId && found.projectId !== decision.projectId) return { status: "blocked", reasonCode: "cross_project_reference", outcome };
    }
    return { status: "ready", reasonCode: null, outcome };
  }

  function normalizeSelection(value = {}) {
    return {
      selectedCriterionIds: stableIds(value.selectedCriterionIds),
      selectedEvidenceIds: stableIds(value.selectedEvidenceIds),
      selectedActionIds: stableIds(value.selectedActionIds),
      targetReferences: stableReferences(value.targetReferences),
      evidenceRequirements: canonicalizeSemanticSet(value.evidenceRequirements),
      actionTargets: canonicalizeSemanticSet(value.actionTargets),
    };
  }

  function validateSelection(source, kind, outcome, selection) {
    if (!allowedKindsForOutcome(outcome).includes(kind)) throw followUpError("invalid_follow_up_kind", "Follow-up kind is not valid for the decision outcome.");
    const decisionCriteria = new Set(array(source.decision?.criterionIds));
    const selectedDecisionCriteria = new Set(array(source.decision?.decision?.selectedCriterionIds));
    if (selection.selectedCriterionIds.some((id) => !decisionCriteria.has(id) || selectedDecisionCriteria.size && !selectedDecisionCriteria.has(id))) throw followUpError("invalid_selected_ids", "Selected criterion does not belong to the decision.");
    const evidenceIndex = buildEvidenceIndex(source.evidence);
    if (selection.selectedEvidenceIds.some((id) => !evidenceIndex.has(id))) throw followUpError("missing_evidence_reference", "Selected evidence does not exist.");
    if (selection.selectedEvidenceIds.some((id) => evidenceIndex.get(id)?.projectId && evidenceIndex.get(id).projectId !== source.decision.projectId)) throw followUpError("cross_project_reference", "Selected evidence belongs to another project.");
    const actionIds = new Set(source.action?.id ? [source.action.id] : []);
    if (selection.selectedActionIds.some((id) => !actionIds.has(id))) throw followUpError("missing_action_reference", "Selected action does not exist.");
    const targetIds = new Set(selection.targetReferences.map((entry) => entry.id));
    if (kind === "collect_evidence") {
      if (!selection.selectedCriterionIds.length || !selection.selectedEvidenceIds.length || !selection.evidenceRequirements.length || !selection.targetReferences.length) throw followUpError("evidence_reference_required", "Collect-evidence follow-up requires criteria, evidence, requirements, and target references.");
      if (selection.selectedEvidenceIds.some((id) => !targetIds.has(id))) throw followUpError("invalid_reference", "Evidence target references are incomplete.");
    }
    if (kind === "corrective_action") {
      if (!selection.selectedCriterionIds.length || !selection.selectedActionIds.length || !selection.actionTargets.length || !selection.targetReferences.length) throw followUpError("action_reference_required", "Corrective follow-up requires criteria, action, targets, and target references.");
      if (selection.selectedActionIds.some((id) => !targetIds.has(id))) throw followUpError("invalid_reference", "Action target references are incomplete.");
    }
  }

  function sourceReferences(source, selection) {
    const decision = source.decision || {};
    const evidenceIndex = buildEvidenceIndex(source.evidence);
    return {
      projectId: source.projectId || decision.projectId || null,
      calculationId: source.calculationId || decision.calculationId || null,
      planId: decision.executionPlanId || null,
      sessionId: decision.sessionId || null,
      decisionId: decision.id || null,
      decisionRevision: decision.revision || null,
      decisionFingerprint: decision.fingerprint || null,
      decisionStatus: decision.status || null,
      decisionEpoch: decision.epoch || null,
      verificationReference: normalizeReference(source.verification ? { id: source.verification.id, revision: source.verification.revision, fingerprint: source.verification.fingerprint } : null),
      evidenceReferences: stableReferences(selection.selectedEvidenceIds.map((id) => ({ id, revision: evidenceIndex.get(id)?.revision, fingerprint: evidenceIndex.get(id)?.fingerprint }))),
      actionReferences: stableReferences(selection.selectedActionIds.map((id) => ({ id, revision: source.action?.revision, fingerprint: source.action?.fingerprint }))),
    };
  }

  function requireCreationCommand(source, command, outcome) {
    if (command.confirmation !== true) throw followUpError("explicit_confirmation_required", "Explicit follow-up confirmation is required.");
    const kind = text(command.followUpKind || command.kind);
    if (!kind) throw followUpError("invalid_follow_up_kind", "Follow-up kind must be explicit.");
    if (outcome === "rejected" && !["corrective_action", "termination"].includes(kind)) throw followUpError("explicit_kind_required", "Rejected outcome requires an explicit corrective_action or termination choice.");
    if (!allowedKindsForOutcome(outcome).includes(kind)) throw followUpError("invalid_follow_up_kind", "Follow-up kind does not match the decision outcome.");
    const reasonCode = text(command.reasonCode);
    if (!reasonCode || reasonCode !== source.decision.decision.reasonCode) throw followUpError("reason_code_mismatch", "Reason code must match the fixed decision.");
    const expectedRevision = command.expectedDecisionRevision ?? command.expectedRevision;
    const expectedFingerprint = command.expectedDecisionFingerprint ?? command.expectedFingerprint;
    if (expectedRevision !== source.decision.revision) throw followUpError("decision_revision_conflict", "Decision revision changed.");
    if (expectedFingerprint !== source.decision.fingerprint) throw followUpError("decision_fingerprint_conflict", "Decision fingerprint changed.");
    for (const field of ["selectedCriterionIds", "selectedEvidenceIds", "selectedActionIds", "targetReferences", "evidenceRequirements", "actionTargets"]) if (!Array.isArray(command[field])) throw followUpError("explicit_selection_required", `Command requires explicit ${field}.`);
  }

  function requireBoundCommand(snapshot, command) {
    checkConcurrency(snapshot, command);
    if (command.confirmation !== true) throw followUpError("explicit_confirmation_required", "Explicit follow-up confirmation is required.");
    if (text(command.followUpKind || command.kind) !== snapshot.followUpKind || text(command.reasonCode) !== snapshot.reasonCode) throw followUpError("immutable_identity", "Follow-up kind and reason code must match the snapshot.");
    const selection = normalizeSelection(command);
    const expected = normalizeSelection(snapshot);
    if (canonicalize(selection) !== canonicalize(expected)) throw followUpError("immutable_identity", "Selected IDs and target references must match the snapshot.");
  }

  function assertExecutable(snapshot, source, command, expectedStatus) {
    requireSnapshot(snapshot); requireBoundCommand(snapshot, command); assertMutable(snapshot);
    const projected = projectPatternExecutionFollowUp(snapshot, source);
    if (["blocked", "stale"].includes(projected.effectiveStatus)) throw followUpError(projected.reasonCode, "Blocked or stale follow-up cannot execute.");
    if (snapshot.status !== expectedStatus) throw followUpError("invalid_transition", `Expected ${expectedStatus} follow-up.`);
  }

  function assertMutable(snapshot) {
    if (TERMINAL_STATUSES.includes(snapshot.status)) throw followUpError("terminal_follow_up", "Terminal follow-up is immutable; use rebuild.");
  }

  function transition(snapshot, status, command, patch) {
    const next = clone(snapshot);
    next.status = status;
    Object.assign(next, clone(patch));
    next.revision += 1;
    next.updatedAt = deterministicTimestamp(command.now, snapshot.updatedAt);
    next.fingerprint = fingerprintPatternExecutionFollowUp(next);
    return freeze(next);
  }

  function staleReason(snapshot, source) {
    const decision = source.decision || {};
    if (snapshot.projectId !== source.projectId || snapshot.calculationId !== source.calculationId || snapshot.planId !== decision.executionPlanId || snapshot.sessionId !== decision.sessionId) return "stale_scope";
    if (snapshot.decisionId !== decision.id || snapshot.decisionRevision !== decision.revision || snapshot.decisionFingerprint !== decision.fingerprint || snapshot.decisionStatus !== decision.status || snapshot.decisionEpoch !== decision.epoch || snapshot.outcome !== decision.decision?.outcome) return "stale_decision";
    if (snapshot.verificationReference?.id !== source.verification?.id || snapshot.verificationReference?.revision !== source.verification?.revision || snapshot.verificationReference?.fingerprint !== source.verification?.fingerprint) return "stale_verification";
    return "stale_reference";
  }

  function buildEvidenceIndex(evidence) {
    const index = new Map();
    for (const bundle of array(evidence)) {
      if (bundle?.id) index.set(bundle.id, { ...bundle, projectId: bundle.projectId });
      for (const item of array(bundle?.evidenceItems)) if (item?.id) index.set(item.id, { ...item, projectId: item.projectId || bundle.projectId, revision: item.revision || bundle.revision, fingerprint: item.fingerprint || bundle.fingerprint });
    }
    return index;
  }

  function normalizeReference(value) {
    if (!value || !text(value.id)) return null;
    return { id: text(value.id), revision: positiveInteger(value.revision) || null, fingerprint: text(value.fingerprint) || null };
  }
  function stableReferences(values) {
    const byIdentity = new Map();
    for (const entry of array(values)) {
      const normalized = normalizeReference(entry);
      if (normalized) byIdentity.set(canonicalize(normalized), normalized);
    }
    return [...byIdentity.entries()].sort((left, right) => lexical(left[0], right[0])).map((entry) => entry[1]);
  }
  function stableIds(values) { return [...new Set(array(values).map(text).filter(Boolean))].sort(lexical); }
  function normalizeSnapshotCollections(snapshot) {
    const selection = normalizeSelection(snapshot);
    Object.assign(snapshot, selection);
    snapshot.verificationReference = normalizeReference(snapshot.verificationReference);
    snapshot.evidenceReferences = stableReferences(snapshot.evidenceReferences);
    snapshot.actionReferences = stableReferences(snapshot.actionReferences);
  }
  function immutableIdentity(snapshot) {
    return {
      projectId: snapshot.projectId, calculationId: snapshot.calculationId, planId: snapshot.planId,
      sessionId: snapshot.sessionId, decisionId: snapshot.decisionId, decisionRevision: snapshot.decisionRevision,
      decisionFingerprint: snapshot.decisionFingerprint, decisionStatus: snapshot.decisionStatus,
      decisionEpoch: snapshot.decisionEpoch, outcome: snapshot.outcome, followUpKind: snapshot.followUpKind,
      reasonCode: snapshot.reasonCode, selectedCriterionIds: snapshot.selectedCriterionIds,
      selectedEvidenceIds: snapshot.selectedEvidenceIds, selectedActionIds: snapshot.selectedActionIds,
      targetReferences: snapshot.targetReferences, evidenceRequirements: snapshot.evidenceRequirements,
      actionTargets: snapshot.actionTargets, verificationReference: snapshot.verificationReference,
      evidenceReferences: snapshot.evidenceReferences, actionReferences: snapshot.actionReferences,
    };
  }
  function projection(effectiveStatus, reasonCode, snapshot) { return freeze({ effectiveStatus, reasonCode: reasonCode || null, rawStatus: snapshot?.status || null, stale: effectiveStatus === "stale", blocked: effectiveStatus === "blocked" }); }
  function blockedRead(projectId, reasonCode) { return { projectId, rawFollowUp: null, followUpRecord: null, effectiveStatus: "blocked", reasonCode, stale: false, blocked: true, recommendation: null, availableCommands: [] }; }
  function commandsForStatus(status) { return ({ waiting: ["update", "rebuild"], ready: ["schedule", "cancel", "rebuild"], scheduling: ["activate", "cancel", "rebuild"], active: ["complete", "fail", "cancel", "rebuild"], completed: [], failed: [], cancelled: [] })[status] || []; }
  function finish(errors) { const values = [...errors].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left), canonicalize(right))); return freeze({ valid: values.length === 0, errors: values }); }
  function requireSnapshot(snapshot) { const report = validatePatternExecutionFollowUp(snapshot); if (!report.valid) throw followUpError("corrupted_input", "Follow-up snapshot is corrupted.", { errors: report.errors }); }
  function checkConcurrency(snapshot, command = {}) {
    if (command.expectedRevision !== snapshot.revision) throw followUpError("follow_up_revision_conflict", "Follow-up revision changed.");
    if (command.expectedFingerprint !== snapshot.fingerprint) throw followUpError("follow_up_fingerprint_conflict", "Follow-up fingerprint changed.");
  }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function deterministicTimestamp(...values) { return values.find(isTimestamp) || DEFAULT_TIMESTAMP; }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function normalize(value) { if (value === undefined) return null; if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(lexical)) next[key] = normalize(value[key]); return next; } return value; }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
  function clone(value) { if (value === undefined) return undefined; return globalObject.structuredClone ? globalObject.structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return typeof value === "string" && value.trim() ? value.trim() : ""; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : 0; }
  function lexical(left, right) { return String(left ?? "").localeCompare(String(right ?? "")); }
  function followUpError(code, message, details) { return new PatternExecutionFollowUpError(code, message, details); }

  const api = Object.freeze({
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, TERMINAL_STATUSES, FOLLOW_UP_KINDS,
    SUPPORTED_OUTCOMES, PatternExecutionFollowUpError, canonicalize, fingerprint,
    canonicalizeSemanticSet, allowedKindsForOutcome, recommendPatternExecutionFollowUp,
    createPatternExecutionFollowUp, updatePatternExecutionFollowUp,
    schedulePatternExecutionFollowUp, activatePatternExecutionFollowUp,
    completePatternExecutionFollowUp, failPatternExecutionFollowUp,
    cancelPatternExecutionFollowUp, rebuildPatternExecutionFollowUp,
    projectPatternExecutionFollowUp, isPatternExecutionFollowUpStale,
    followUpInputFingerprint, fingerprintPatternExecutionFollowUp,
    validatePatternExecutionFollowUp, serializePatternExecutionFollowUp,
    deserializePatternExecutionFollowUp, remapPatternExecutionFollowUp,
    makeImportedPatternExecutionFollowUpStale,
    createForProject, readForProject, executeForProject, updateForProject, rebuildForProject,
  });
  globalObject.YarnAIPatternExecutionFollowUp = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
