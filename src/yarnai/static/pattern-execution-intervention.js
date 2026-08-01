"use strict";

(function exposePatternExecutionIntervention(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const SOURCE_SCHEMA_VERSION = 1;
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const PROGRESS_KIND = "PATTERN_EXECUTION_INTERVENTION";
  const LIFECYCLE_STATES = Object.freeze([
    "waiting", "assessing", "ready", "confirmation_required", "confirmed",
    "cancelled", "completed", "blocked", "failed", "stale",
  ]);
  const MONITORING_STATES = Object.freeze([
    "healthy", "attention_required", "blocked", "completed", "failed", "stale",
  ]);
  const ACTION_TYPES = Object.freeze([
    "no_action", "acknowledge", "resume_runtime", "pause_runtime", "retry_runtime",
    "recover_runtime", "review_blocker", "resolve_blocker", "return_to_checkpoint",
    "rebuild_runtime", "stop_runtime", "accept_completion", "inspect_failure",
    "rebuild_monitoring",
  ]);
  const TERMINAL_STATES = Object.freeze(["cancelled", "completed", "failed", "stale"]);
  const AUDIT_LIMIT = 32;
  const OPERATION_LIMIT = 64;
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["assessing"]),
    assessing: Object.freeze(["ready", "confirmation_required", "blocked", "failed", "stale"]),
    ready: Object.freeze(["confirmation_required", "confirmed", "cancelled", "stale", "failed"]),
    confirmation_required: Object.freeze(["ready", "confirmed", "cancelled", "blocked", "stale", "failed"]),
    confirmed: Object.freeze(["completed", "cancelled", "stale", "failed"]),
    cancelled: Object.freeze([]), completed: Object.freeze([]), failed: Object.freeze([]), stale: Object.freeze([]),
    blocked: Object.freeze(["cancelled", "stale", "failed"]),
  });
  const CONFIRMED_CANCELLATION_POLICY = "allowed_until_completed";

  class PatternExecutionInterventionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionInterventionError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    }
    if (typeof value === "number" && !Number.isFinite(value)) throw interventionError("invalid_number", "Intervention содержит недопустимое число.");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
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

  function identityFingerprint(identity) {
    const payload = normalizeIdentity(copy(identity));
    delete payload.sourceIdentityFingerprint;
    return fingerprint(payload);
  }

  function decisionFingerprint(decision) {
    if (!decision) return null;
    return fingerprint({
      intervention: decision.intervention,
      selectedAction: normalizeSelectedAction(decision.selectedAction),
      sourceMonitoringIdentity: decision.sourceMonitoringIdentity,
      targetIdentity: normalizeIdentity(decision.targetIdentity),
      reason: decision.reason,
      expectedEffect: decision.expectedEffect,
      confirmation: decision.confirmation ? {
        confirmedBy: decision.confirmation.confirmedBy,
        method: decision.confirmation.method,
        sourceVerified: decision.confirmation.sourceVerified,
      } : null,
      sourceObservationIds: stableStrings(decision.sourceObservationIds),
      runtimeActionExecuted: false,
      effectApplied: false,
    });
  }

  function fingerprintPatternExecutionIntervention(snapshot) {
    return fingerprint({
      schemaVersion: snapshot.schemaVersion,
      sourceSchemaVersion: snapshot.sourceSchemaVersion,
      projectId: snapshot.projectId,
      type: snapshot.type,
      revision: snapshot.revision,
      epoch: snapshot.epoch,
      lifecycle: snapshot.lifecycle ? {
        state: snapshot.lifecycle.state,
        previousState: snapshot.lifecycle.previousState,
      } : null,
      monitoringStatus: snapshot.monitoringStatus,
      requiresIntervention: snapshot.requiresIntervention,
      assessmentReason: snapshot.assessmentReason,
      sourceIdentity: normalizeIdentity(snapshot.sourceIdentity),
      sourceEvidence: normalizeEvidence(snapshot.sourceEvidence),
      observations: stableObservations(snapshot.observations),
      blockers: stableIssues(snapshot.blockers),
      warnings: stableIssues(snapshot.warnings),
      actions: stableActions(snapshot.actions),
      recommendation: normalizeRecommendation(snapshot.recommendation),
      selectedAction: normalizeSelectedAction(snapshot.selectedAction),
      confirmation: normalizeConfirmation(snapshot.confirmation),
      decision: normalizeDecision(snapshot.decision),
      previousEpoch: snapshot.previousEpoch || null,
      importedDiagnostic: snapshot.importedDiagnostic || null,
    });
  }

  function buildPatternExecutionIntervention(source, options = {}) {
    const normalized = normalizeSource(source, options);
    if (!normalized.projectId) throw interventionError("project_context_missing", "Для intervention требуется явный project context.");
    const now = options.now || timestampNow();
    const epoch = positiveInteger(options.epoch) || 1;
    const revision = positiveInteger(options.revision) || 1;
    const assessment = assessSource(normalized, options);
    const sourceIdentity = buildSourceIdentity(normalized);
    const observations = buildObservations(normalized.monitoring);
    const sourceEvidence = buildSourceEvidence(normalized);
    const actions = buildActions(assessment.monitoringStatus, sourceEvidence, observations, sourceIdentity, assessment.errors);
    const recommendation = assessment.targetLifecycle === "ready" ? buildRecommendation(actions) : null;
    const id = text(options.id) || `intervention:${fingerprint({ projectId: normalized.projectId, monitoring: sourceIdentity.monitoring, epoch }).slice(8)}`;
    const snapshot = {
      id,
      projectId: normalized.projectId,
      type: PROGRESS_KIND,
      kind: PROGRESS_KIND,
      schemaVersion: SCHEMA_VERSION,
      version: VERSION,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      revision,
      epoch,
      lifecycle: { state: assessment.targetLifecycle, previousState: "assessing", assessedAt: now },
      monitoringStatus: assessment.monitoringStatus,
      requiresIntervention: !["healthy", "completed"].includes(assessment.monitoringStatus),
      assessmentReason: assessment.reason,
      sourceIdentity,
      sourceEvidence,
      observations,
      blockers: stableIssues(assessment.blockers),
      warnings: stableIssues(assessment.warnings),
      actions,
      recommendation,
      selectedAction: null,
      confirmation: null,
      decision: null,
      previousEpoch: options.previousEpoch ? copy(options.previousEpoch) : null,
      importedDiagnostic: null,
      createdAt: options.createdAt || now,
      updatedAt: now,
      fingerprint: null,
      audit: [],
      operations: [],
    };
    appendAudit(snapshot, "intervention_assessed", now, { fromLifecycle: "waiting", toLifecycle: assessment.targetLifecycle, monitoringStatus: assessment.monitoringStatus });
    snapshot.fingerprint = fingerprintPatternExecutionIntervention(snapshot);
    const report = validatePatternExecutionIntervention(snapshot);
    if (!report.valid) throw interventionError("intervention_build_invalid", "Не удалось построить непротиворечивый intervention snapshot.", { errors: report.errors });
    return finish(snapshot);
  }

  function readPatternExecutionIntervention(snapshot, source) {
    const validation = validatePatternExecutionIntervention(snapshot);
    const identityErrors = source === undefined || !validation.structural.length ? (source === undefined ? [] : sourceIdentityValidation(snapshot, source)) : [];
    return finish({
      intervention: copy(snapshot),
      validation,
      identityErrors,
      staleDetected: identityErrors.length > 0,
      interrupted: ["assessing", "confirmation_required"].includes(snapshot?.lifecycle?.state),
      recoverRequired: snapshot?.lifecycle?.state === "assessing",
      availableCommands: availableCommands(snapshot, validation.errors, identityErrors),
    });
  }

  function selectPatternExecutionInterventionAction(snapshot, actionId, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "select", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (snapshot.lifecycle.state !== "ready") throw interventionError("selection_not_allowed", "Выбор действия доступен только в ready.");
    const action = findAction(snapshot, actionId);
    if (!action.eligible) throw interventionError("action_not_eligible", "Недоступное действие нельзя выбрать.", { actionId: action.id, blockedReason: action.blockedReason });
    if (options.targetIdentity && canonicalize(normalizeIdentity(options.targetIdentity)) !== canonicalize(normalizeIdentity(action.targetIdentity))) {
      throw interventionError("target_identity_mismatch", "Target identity выбранного действия не совпадает.");
    }
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    next.selectedAction = normalizeSelectedAction(action);
    next.confirmation = null;
    next.decision = null;
    transition(next, action.requiresConfirmation ? "confirmation_required" : "ready", now, true);
    appendAudit(next, "action_selected", now, { actionId: action.id, requiresConfirmation: action.requiresConfirmation });
    appendOperation(next, options.operationId, "select", now);
    seal(next);
    return commandResult("select", true, next);
  }

  function confirmPatternExecutionIntervention(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "confirm", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (!["ready", "confirmation_required"].includes(snapshot.lifecycle.state) || !snapshot.selectedAction) {
      throw interventionError("confirmation_not_allowed", "Сначала выберите доступное action.");
    }
    const selected = findAction(snapshot, options.actionId || snapshot.selectedAction.id);
    if (!selected.eligible || selected.id !== snapshot.selectedAction.id) throw interventionError("selected_action_invalid", "Выбранное action больше недоступно.");
    if (options.actionId && options.actionId !== snapshot.selectedAction.id) throw interventionError("selected_action_mismatch", "Подтверждается другое action.");
    if (options.targetIdentity && canonicalize(normalizeIdentity(options.targetIdentity)) !== canonicalize(normalizeIdentity(selected.targetIdentity))) {
      throw interventionError("target_identity_mismatch", "Target identity подтверждения не совпадает.");
    }
    const identityErrors = sourceIdentityValidation(snapshot, source);
    if (identityErrors.length) throw interventionError("source_identity_stale", "Source identity изменилась; требуется явная проверка или rebuild.", { errors: identityErrors });
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    next.confirmation = {
      confirmedBy: text(options.confirmedBy) || "user",
      method: "explicit",
      confirmedAt: now,
      operationId: requireOperationId(options.operationId),
      sourceVerified: true,
      sourceIdentityFingerprint: next.sourceIdentity.sourceIdentityFingerprint,
    };
    transition(next, "confirmed", now);
    next.decision = buildDecision(next);
    appendAudit(next, "action_confirmed", now, { actionId: selected.id, decisionFingerprint: next.decision.fingerprint });
    appendOperation(next, options.operationId, "confirm", now);
    seal(next);
    return commandResult("confirm", true, next);
  }

  function cancelPatternExecutionIntervention(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "cancel", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (!["ready", "confirmation_required", "confirmed", "blocked"].includes(snapshot.lifecycle.state)) throw interventionError("cancellation_not_allowed", "Intervention нельзя отменить в текущем состоянии.");
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    transition(next, "cancelled", now);
    appendAudit(next, "intervention_cancelled", now, { actionId: next.selectedAction?.id || null, confirmedDecision: Boolean(next.decision) });
    appendOperation(next, options.operationId, "cancel", now);
    seal(next);
    return commandResult("cancel", true, next);
  }

  function completePatternExecutionIntervention(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "complete", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (snapshot.lifecycle.state !== "confirmed" || !snapshot.decision) throw interventionError("completion_not_allowed", "Завершить можно только подтверждённое intervention decision.");
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    transition(next, "completed", now);
    appendAudit(next, "intervention_completed", now, { actionId: next.selectedAction.id, decisionFingerprint: next.decision.fingerprint, runtimeActionExecuted: false });
    appendOperation(next, options.operationId, "complete", now);
    seal(next);
    return commandResult("complete", true, next);
  }

  function checkPatternExecutionInterventionIdentity(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "check_identity", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    const errors = sourceIdentityValidation(snapshot, source);
    if (!errors.length) return commandResult("check_identity", false, copyFrozen(snapshot), validatePatternExecutionIntervention(snapshot));
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    transition(next, "stale", now);
    next.blockers = stableIssues([...next.blockers, issue("source_identity_changed", "Source identity больше не совпадает с выбранным monitoring snapshot.", { errors })]);
    disableExecutableIntent(next, "source_identity_changed");
    appendAudit(next, "identity_marked_stale", now, { codes: errors.map((entry) => entry.code).sort(lexical) });
    appendOperation(next, options.operationId, "check_identity", now);
    seal(next);
    return commandResult("check_identity", true, next);
  }

  function recoverPatternExecutionIntervention(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "recover", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    if (!["assessing", "confirmation_required"].includes(snapshot.lifecycle.state)) throw interventionError("recovery_not_required", "Recover доступен только для прерванного assessing или confirmation_required.");
    const normalized = normalizeSource(source, { projectId: snapshot.projectId });
    const identityErrors = sourceIdentityValidation(snapshot, normalized);
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    if (identityErrors.length) {
      transition(next, "stale", now);
      next.blockers = stableIssues([...next.blockers, issue("recovery_source_identity_changed", "Recover обнаружил изменившуюся source identity.", { errors: identityErrors })]);
      disableExecutableIntent(next, "recovery_source_identity_changed");
    } else {
      const assessment = assessSource(normalized, {});
      if (["blocked", "failed", "stale"].includes(assessment.targetLifecycle)) {
        transition(next, assessment.targetLifecycle, now);
        next.blockers = stableIssues([...next.blockers, ...assessment.blockers]);
        if (assessment.targetLifecycle !== "blocked") disableExecutableIntent(next, `recovery_${assessment.targetLifecycle}`);
      } else if (snapshot.selectedAction) {
        const current = findAction(next, snapshot.selectedAction.id);
        transition(next, current.eligible && current.requiresConfirmation ? "confirmation_required" : current.eligible ? "ready" : "blocked", now);
        if (!current.eligible) next.blockers = stableIssues([...next.blockers, issue("selected_action_no_longer_eligible", "Выбранное action больше не доказано актуальным.", { actionId: current.id })]);
      } else transition(next, "ready", now);
    }
    appendAudit(next, "intervention_recovered", now, { runtimeActionExecuted: false, targetLifecycle: next.lifecycle.state });
    appendOperation(next, options.operationId, "recover", now);
    seal(next);
    return commandResult("recover", true, next);
  }

  function rebuildPatternExecutionIntervention(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "rebuild", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    const now = options.now || timestampNow();
    const rebuilt = mutable(buildPatternExecutionIntervention(source, {
      projectId: snapshot.projectId,
      id: snapshot.id,
      epoch: snapshot.epoch + 1,
      revision: snapshot.revision + 1,
      createdAt: snapshot.createdAt,
      now,
      previousEpoch: { epoch: snapshot.epoch, revision: snapshot.revision, fingerprint: snapshot.fingerprint },
      monitoringId: options.monitoringId,
      monitoringFingerprint: options.monitoringFingerprint,
    }));
    rebuilt.audit = [...array(snapshot.audit), ...array(rebuilt.audit)].slice(-AUDIT_LIMIT);
    rebuilt.operations = [...array(snapshot.operations), operationEntry(options.operationId, "rebuild", rebuilt.revision, rebuilt.epoch, now)].slice(-OPERATION_LIMIT);
    appendAudit(rebuilt, "intervention_rebuilt", now, { previousEpoch: snapshot.epoch, previousFingerprint: snapshot.fingerprint, runtimeActionExecuted: false });
    seal(rebuilt);
    return commandResult("rebuild", true, rebuilt);
  }

  function validatePatternExecutionIntervention(snapshot, source) {
    const structural = structuralValidation(snapshot);
    const semantic = structural.length ? [] : semanticValidation(snapshot);
    const sourceErrors = source === undefined || structural.length ? [] : sourceIdentityValidation(snapshot, source);
    const errors = [...structural, ...semantic, ...sourceErrors];
    return finish({ valid: errors.length === 0, structural, semantic, source: sourceErrors, errors });
  }

  function structuralValidation(snapshot) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, "error", details));
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [diagnostic("intervention_not_object")];
    if (!text(snapshot.id) || !text(snapshot.projectId)) invalid("intervention_identity_missing");
    if (snapshot.type !== PROGRESS_KIND || snapshot.kind !== PROGRESS_KIND) invalid("intervention_type_invalid");
    if (snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.version !== VERSION || snapshot.sourceSchemaVersion !== SOURCE_SCHEMA_VERSION) invalid("intervention_schema_unsupported");
    if (!positiveInteger(snapshot.revision) || !positiveInteger(snapshot.epoch)) invalid("intervention_revision_invalid");
    if (!snapshot.lifecycle || !LIFECYCLE_STATES.includes(snapshot.lifecycle.state) || (snapshot.lifecycle.previousState !== null && !LIFECYCLE_STATES.includes(snapshot.lifecycle.previousState))) invalid("intervention_lifecycle_invalid");
    if (!snapshot.sourceIdentity || snapshot.sourceIdentity.sourceIdentityFingerprint !== identityFingerprint(snapshot.sourceIdentity)) invalid("intervention_source_identity_invalid");
    if (!snapshot.sourceEvidence || typeof snapshot.sourceEvidence !== "object" || Array.isArray(snapshot.sourceEvidence)) invalid("intervention_source_evidence_invalid");
    for (const field of ["observations", "blockers", "warnings", "actions", "audit", "operations"]) if (!Array.isArray(snapshot[field])) invalid(`intervention_${field}_invalid`);
    if (array(snapshot.audit).length > AUDIT_LIMIT) invalid("intervention_audit_limit_exceeded");
    if (array(snapshot.operations).length > OPERATION_LIMIT) invalid("intervention_operation_limit_exceeded");
    if (!isTimestamp(snapshot.createdAt) || !isTimestamp(snapshot.updatedAt)) invalid("intervention_timestamp_invalid");
    if (!validFingerprint(snapshot.fingerprint) || snapshot.fingerprint !== fingerprintPatternExecutionIntervention(snapshot)) invalid("intervention_fingerprint_mismatch");
    if (snapshot.monitoringStatus !== null && !MONITORING_STATES.includes(snapshot.monitoringStatus)) invalid("intervention_monitoring_status_invalid");
    if (canonicalize(snapshot.observations) !== canonicalize(stableObservations(snapshot.observations))) invalid("intervention_observations_not_stable");
    if (canonicalize(snapshot.actions) !== canonicalize(stableActions(snapshot.actions))) invalid("intervention_actions_not_stable");
    const types = array(snapshot.actions).map((entry) => entry.type);
    if (types.length !== ACTION_TYPES.length || canonicalize(types.slice().sort(lexical)) !== canonicalize([...ACTION_TYPES].sort(lexical))) invalid("intervention_action_catalog_incomplete");
    for (const action of array(snapshot.actions)) {
      if (!ACTION_TYPES.includes(action?.type) || action.id !== `intervention-action:${action.type}` || !text(action.label) || !text(action.reason) || !Array.isArray(action.sourceObservationIds) || typeof action.eligible !== "boolean" || typeof action.requiresConfirmation !== "boolean" || !text(action.expectedEffect) || !positiveInteger(action.priority) || !["low", "medium", "high", "critical"].includes(action.impact)) invalid("intervention_action_invalid", { actionId: action?.id || null });
      if (action.eligible && action.blockedReason !== null || !action.eligible && !text(action.blockedReason)) invalid("intervention_action_eligibility_invalid", { actionId: action?.id || null });
    }
    if (snapshot.recommendation && (!findActionOrNull(snapshot, snapshot.recommendation.actionId)?.eligible || !positiveInteger(snapshot.recommendation.priority))) invalid("intervention_recommendation_invalid");
    if (snapshot.selectedAction && (!ACTION_TYPES.includes(snapshot.selectedAction.type) || !text(snapshot.selectedAction.id))) invalid("intervention_selection_invalid");
    if (snapshot.confirmation && (snapshot.confirmation.method !== "explicit" || snapshot.confirmation.sourceVerified !== true || !text(snapshot.confirmation.confirmedBy))) invalid("intervention_confirmation_invalid");
    if (snapshot.decision && (!validFingerprint(snapshot.decision.fingerprint) || snapshot.decision.fingerprint !== decisionFingerprint(snapshot.decision))) invalid("intervention_decision_fingerprint_invalid");
    return stableDiagnostics(errors);
  }

  function semanticValidation(snapshot) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, "error", details));
    const effectiveStatus = snapshot.lifecycle.state === "stale" ? "stale" : snapshot.monitoringStatus;
    const expectedActions = buildActions(effectiveStatus, snapshot.sourceEvidence, snapshot.observations, snapshot.sourceIdentity, snapshot.blockers.filter((entry) => entry.source === "source"));
    if (canonicalize(expectedActions) !== canonicalize(snapshot.actions)) invalid("intervention_action_derivation_mismatch");
    const expectedRecommendation = snapshot.lifecycle.state === "stale" || snapshot.lifecycle.state === "failed" || snapshot.lifecycle.state === "blocked" ? null : buildRecommendation(snapshot.actions);
    if (canonicalize(normalizeRecommendation(expectedRecommendation)) !== canonicalize(normalizeRecommendation(snapshot.recommendation))) invalid("intervention_recommendation_mismatch");
    if (snapshot.selectedAction) {
      const action = findActionOrNull(snapshot, snapshot.selectedAction.id);
      if (!action || !action.eligible || canonicalize(normalizeSelectedAction(action)) !== canonicalize(normalizeSelectedAction(snapshot.selectedAction))) invalid("intervention_selected_action_mismatch");
    }
    if (["confirmation_required", "confirmed", "completed"].includes(snapshot.lifecycle.state) && !snapshot.selectedAction) invalid("intervention_lifecycle_requires_selection");
    if (snapshot.lifecycle.state === "confirmation_required" && !snapshot.selectedAction?.requiresConfirmation) invalid("intervention_confirmation_not_required");
    if (["confirmed", "completed"].includes(snapshot.lifecycle.state) && (!snapshot.confirmation || !snapshot.decision)) invalid("intervention_lifecycle_requires_decision");
    if (snapshot.decision) {
      if (!snapshot.selectedAction || snapshot.decision.selectedAction.id !== snapshot.selectedAction.id) invalid("intervention_decision_selection_mismatch");
      if (snapshot.decision.runtimeActionExecuted !== false || snapshot.decision.effectApplied !== false) invalid("intervention_decision_claims_execution");
      if (canonicalize(normalizeIdentity(snapshot.decision.targetIdentity)) !== canonicalize(normalizeIdentity(snapshot.selectedAction.targetIdentity))) invalid("intervention_decision_target_mismatch");
    }
    if (TERMINAL_STATES.includes(snapshot.lifecycle.state) && snapshot.lifecycle.state === "stale" && (snapshot.selectedAction || snapshot.confirmation || snapshot.decision)) invalid("stale_intervention_has_executable_intent");
    if ((snapshot.monitoringStatus === "stale" || snapshot.lifecycle.state === "stale") && snapshot.actions.some((entry) => entry.eligible)) invalid("stale_monitoring_has_eligible_action");
    return stableDiagnostics(errors);
  }

  function sourceIdentityValidation(snapshot, source) {
    if (!source) return [diagnostic("source_missing", "critical")];
    let normalized;
    try { normalized = source.monitoring !== undefined && source.runtime !== undefined ? normalizeSource(source, { projectId: snapshot.projectId }) : normalizeSource(source, { projectId: snapshot.projectId }); }
    catch (error) { return [diagnostic(error.code || "source_invalid", "critical")]; }
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, "critical", details));
    const expected = snapshot.sourceIdentity;
    const monitoring = normalized.monitoring;
    const runtime = normalized.runtime;
    if (normalized.projectId !== snapshot.projectId || expected.project?.id !== normalized.projectId) invalid("project_identity_mismatch");
    if (!monitoring) invalid("monitoring_missing");
    else {
      if (expected.monitoring?.id !== monitoring.id) invalid("monitoring_id_mismatch");
      if (expected.monitoring?.revision !== monitoring.revision) invalid("monitoring_revision_mismatch", { expected: expected.monitoring?.revision, actual: monitoring.revision });
      if (expected.monitoring?.epoch !== monitoring.epoch) invalid("monitoring_epoch_mismatch");
      if (expected.monitoring?.fingerprint !== monitoring.fingerprint) invalid("monitoring_fingerprint_mismatch");
      if (expected.monitoring?.status !== monitoring.lifecycle?.state) invalid("monitoring_status_mismatch");
      if (canonicalize(normalizeIdentity(expected.monitoringSourceIdentity)) !== canonicalize(normalizeIdentity(monitoring.sourceIdentity))) invalid("monitoring_source_identity_mismatch");
    }
    if (!runtime) invalid("runtime_missing");
    else {
      if (expected.runtime?.id !== runtime.id) invalid("runtime_id_mismatch");
      if (expected.runtime?.revision !== runtime.revision) invalid("runtime_revision_mismatch");
      if (expected.runtime?.epoch !== runtime.epoch) invalid("runtime_epoch_mismatch");
      if (expected.runtime?.fingerprint !== runtime.runtimeFingerprint) invalid("runtime_fingerprint_mismatch");
    }
    return stableDiagnostics(errors);
  }

  function buildActions(status, evidence, observations, sourceIdentity, sourceErrors = []) {
    const observationIds = stableStrings(observations.map((entry) => entry.id));
    const blockerObservationIds = stableStrings(observations.filter((entry) => ["blocker", "warning"].includes(entry.kind)).map((entry) => entry.id));
    const target = buildTargetIdentity(sourceIdentity, evidence);
    const hasRecoverable = observations.some((entry) => entry.recoverable === true);
    const hasBlocker = observations.some((entry) => entry.kind === "blocker");
    const rules = {
      no_action: status === "healthy" || status === "completed",
      acknowledge: ["healthy", "attention_required"].includes(status),
      resume_runtime: status === "attention_required" && evidence.runtimeStatus === "paused" && evidence.safeToResume,
      pause_runtime: ["healthy", "attention_required"].includes(status) && evidence.runtimeStatus === "running" && Boolean(evidence.activeActionId),
      retry_runtime: status === "failed" && evidence.retryProven,
      recover_runtime: ["attention_required", "blocked", "failed"].includes(status) && (evidence.recoveryProven || hasRecoverable),
      review_blocker: ["attention_required", "blocked"].includes(status) && (hasBlocker || blockerObservationIds.length > 0),
      resolve_blocker: status === "blocked" && hasBlocker && hasRecoverable,
      return_to_checkpoint: status === "blocked" && Boolean(evidence.checkpointId),
      rebuild_runtime: ["blocked", "failed"].includes(status) || status === "attention_required" && evidence.runtimeStatus === "stopped",
      stop_runtime: ["running", "paused", "blocked", "recovering", "ready"].includes(evidence.runtimeStatus) && ["attention_required", "blocked"].includes(status),
      accept_completion: status === "completed",
      inspect_failure: status === "failed",
      rebuild_monitoring: status === "failed",
    };
    const metadata = actionMetadata(status, evidence, observationIds, blockerObservationIds);
    return ACTION_TYPES.map((type) => {
      const eligible = Boolean(rules[type]) && sourceErrors.length === 0 && status !== "stale";
      const meta = metadata[type];
      return {
        id: `intervention-action:${type}`,
        type,
        label: meta.label,
        reason: meta.reason,
        sourceObservationIds: meta.observationIds,
        eligible,
        blockedReason: eligible ? null : status === "stale" ? "monitoring_is_stale_rebuild_intervention_required" : sourceErrors.length ? "source_data_incomplete" : `not_proven_for_${status || "missing"}`,
        requiresConfirmation: meta.requiresConfirmation,
        expectedEffect: meta.expectedEffect,
        targetIdentity: copy(target),
        priority: meta.priority,
        impact: meta.impact,
      };
    }).sort((left, right) => lexical(left.type, right.type));
  }

  function actionMetadata(status, evidence, allIds, blockerIds) {
    const reason = (type) => `${status || "unavailable"}:${type}`;
    const create = (type, label, expectedEffect, priority, impact, requiresConfirmation, observationIds = allIds) => ({ label, expectedEffect, priority, impact, requiresConfirmation, observationIds: stableStrings(observationIds), reason: reason(type) });
    return {
      no_action: create("no_action", "Не вмешиваться", "Runtime и monitoring останутся без изменений.", status === "healthy" ? 120 : 50, "low", false),
      acknowledge: create("acknowledge", "Подтвердить ознакомление", "Будет зафиксировано только намерение пользователя.", 45, "low", false),
      resume_runtime: create("resume_runtime", "Продолжить runtime", "Будет принято намерение продолжить подтверждённый paused runtime.", 125, "high", true),
      pause_runtime: create("pause_runtime", "Приостановить runtime", "Будет принято намерение приостановить текущий runtime.", 60, "high", true),
      retry_runtime: create("retry_runtime", "Повторить runtime", "Будет принято намерение повторить доказуемо retryable runtime.", 115, "high", true),
      recover_runtime: create("recover_runtime", "Восстановить runtime", "Будет принято намерение выполнить отдельный runtime recovery.", 105, "high", true),
      review_blocker: create("review_blocker", "Изучить препятствие", "Будет принято намерение изучить связанные наблюдения без изменения runtime.", 110, "low", false, blockerIds),
      resolve_blocker: create("resolve_blocker", "Разрешить препятствие", "Будет принято намерение разрешить подтверждённый recoverable blocker.", 130, "high", true, blockerIds),
      return_to_checkpoint: create("return_to_checkpoint", "Вернуться к checkpoint", "Будет принято намерение вернуться к подтверждённому checkpoint.", 100, "critical", true, blockerIds),
      rebuild_runtime: create("rebuild_runtime", "Пересобрать runtime", "Будет принято намерение явно пересобрать runtime из актуального источника.", 55, "critical", true),
      stop_runtime: create("stop_runtime", "Остановить runtime", "Будет принято намерение остановить runtime.", 35, "critical", true),
      accept_completion: create("accept_completion", "Принять завершение", "Будет принято намерение признать подтверждённое завершение.", 140, "low", false),
      inspect_failure: create("inspect_failure", "Изучить сбой", "Будет принято намерение изучить failure без автоматического retry.", 140, "low", false),
      rebuild_monitoring: create("rebuild_monitoring", "Пересобрать monitoring", "Будет принято намерение отдельно пересобрать monitoring.", 40, "high", true),
    };
  }

  function buildRecommendation(actions) {
    const eligible = array(actions).filter((entry) => entry.eligible).sort((left, right) => right.priority - left.priority || lexical(left.type, right.type));
    if (!eligible.length) return null;
    const action = eligible[0];
    return {
      actionId: action.id,
      reason: action.reason,
      sourceObservationIds: stableStrings(action.sourceObservationIds),
      targetIdentity: copy(action.targetIdentity),
      priority: action.priority,
      requiresConfirmation: action.requiresConfirmation,
    };
  }

  function buildDecision(snapshot) {
    const selected = normalizeSelectedAction(snapshot.selectedAction);
    const decision = {
      intervention: { id: snapshot.id, revision: snapshot.revision, epoch: snapshot.epoch },
      selectedAction: selected,
      sourceMonitoringIdentity: copy(snapshot.sourceIdentity.monitoring),
      targetIdentity: copy(selected.targetIdentity),
      reason: selected.reason,
      expectedEffect: selected.expectedEffect,
      confirmation: {
        confirmedBy: snapshot.confirmation.confirmedBy,
        method: snapshot.confirmation.method,
        confirmedAt: snapshot.confirmation.confirmedAt,
        sourceVerified: true,
      },
      sourceObservationIds: stableStrings(selected.sourceObservationIds),
      runtimeActionExecuted: false,
      effectApplied: false,
      fingerprint: null,
    };
    decision.fingerprint = decisionFingerprint(decision);
    return decision;
  }

  function buildObservations(monitoring) {
    if (!monitoring) return [];
    const values = [];
    const add = (kind, entry) => {
      const core = {
        kind,
        code: text(entry?.code) || `${kind}_unspecified`,
        severity: text(entry?.severity) || (kind === "blocker" ? "error" : kind === "warning" ? "warning" : "info"),
        source: text(entry?.source) || (kind === "diagnostic" ? "validation" : "monitoring"),
        message: text(entry?.messageKey) || text(entry?.message) || text(entry?.code) || `${kind}_unspecified`,
        relatedActionId: entry?.relatedActionId || entry?.actionId || null,
        relatedStepId: entry?.relatedStepId || entry?.stepId || null,
        relatedCheckpointId: entry?.checkpointId || null,
        recoverable: entry?.recoverable === true,
        recommendedCommand: text(entry?.recommendedCommand) || null,
        details: normalizeIdentity(entry?.details || {}),
        sourceMonitoringId: monitoring.id,
        sourceMonitoringFingerprint: monitoring.fingerprint,
      };
      values.push({ id: `intervention-observation:${fingerprint(core).slice(8)}`, ...core });
    };
    array(monitoring.blockers).forEach((entry) => add("blocker", entry));
    array(monitoring.warnings).forEach((entry) => add("warning", entry));
    array(monitoring.diagnostics).forEach((entry) => add("diagnostic", entry));
    if (!values.length) add("status", { code: `monitoring_${monitoring.lifecycle?.state || "unknown"}`, severity: "info", source: "monitoring", message: `monitoring.${monitoring.lifecycle?.state || "unknown"}`, recoverable: false });
    return stableObservations(values);
  }

  function buildSourceIdentity(normalized) {
    const monitoring = normalized.monitoring;
    const source = monitoring?.sourceIdentity || {};
    const identity = {
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      project: copy(source.project || { id: normalized.projectId, revision: normalized.projectRevision || null }),
      calculationIdentity: copy(source.calculationIdentity || null),
      result: copy(source.result || null),
      executionPlanIdentity: copy(source.executionPlanIdentity || null),
      sessionIdentity: copy(source.sessionIdentity || null),
      runtime: copy(source.runtime || (normalized.runtime ? { id: normalized.runtime.id, revision: normalized.runtime.revision, epoch: normalized.runtime.epoch, fingerprint: normalized.runtime.runtimeFingerprint } : null)),
      monitoring: monitoring ? { id: monitoring.id, revision: monitoring.revision, epoch: monitoring.epoch, fingerprint: monitoring.fingerprint, status: monitoring.lifecycle?.state || null } : null,
      monitoringSourceIdentity: copy(source || null),
      runtimeSourceIdentity: copy(source.runtimeSourceIdentity || normalized.runtime?.sourceIdentity || null),
      progressIdentity: copy(source.progressIdentity || null),
      completionIdentity: copy(source.completionIdentity || null),
      stepIdentities: stableIdentities(source.stepIdentities),
      checkpointIdentities: stableIdentities(source.checkpointIdentities),
      importRevision: source.importRevision ?? normalized.importRevision ?? null,
      sourceIdentityFingerprint: null,
    };
    identity.sourceIdentityFingerprint = identityFingerprint(identity);
    return identity;
  }

  function buildSourceEvidence(normalized) {
    const monitoring = normalized.monitoring || {};
    const runtime = normalized.runtime || {};
    const activity = monitoring.currentActivity || {};
    const lastCheckpoint = monitoring.runtimeSummary?.lastConfirmedCheckpoint || null;
    const retryProven = runtime.lastError?.retryable === true || runtime.lastError?.recoverable === true || array(runtime.actions).some((entry) => entry.state === "failed" && (entry.error?.retryable === true || entry.error?.recoverable === true));
    const recoveryProven = runtime.recovery != null || runtime.status === "recovering" || runtime.lastError?.recoverable === true;
    return normalizeEvidence({
      runtimeStatus: text(runtime.status) || text(monitoring.runtimeSummary?.lifecycle) || null,
      runtimeRevision: positiveInteger(runtime.revision) || positiveInteger(monitoring.sourceIdentity?.runtime?.revision),
      runtimeEpoch: positiveInteger(runtime.epoch) || positiveInteger(monitoring.sourceIdentity?.runtime?.epoch),
      activeActionId: activity.actionId || runtime.activeActionId || null,
      stepId: activity.stepId || null,
      checkpointId: activity.checkpointId || lastCheckpoint?.id || null,
      safeToResume: activity.safeToResume === true,
      retryProven,
      recoveryProven,
      progressIdentity: copy(monitoring.sourceIdentity?.progressIdentity || null),
      completionIdentity: copy(monitoring.sourceIdentity?.completionIdentity || null),
    });
  }

  function assessSource(normalized, options) {
    const blockers = [];
    const warnings = [];
    const monitoring = normalized.monitoring;
    const runtime = normalized.runtime;
    if (!monitoring) blockers.push(issue("monitoring_missing", "Отсутствует выбранный monitoring snapshot."));
    if (!runtime) blockers.push(issue("runtime_missing", "Отсутствует runtime, связанный с monitoring snapshot."));
    if (monitoring && options.monitoringId && monitoring.id !== options.monitoringId) blockers.push(issue("monitoring_selection_mismatch", "Выбран другой monitoring snapshot."));
    if (monitoring && options.monitoringFingerprint && monitoring.fingerprint !== options.monitoringFingerprint) blockers.push(issue("monitoring_fingerprint_mismatch", "Fingerprint выбранного monitoring snapshot не совпадает."));
    const monitoringApi = globalObject.YarnAIPatternExecutionMonitoring;
    if (monitoring) {
      const report = monitoringApi?.validateMonitoring ? monitoringApi.validateMonitoring(monitoring) : basicMonitoringValidation(monitoring);
      if (!report.valid) blockers.push(issue("monitoring_invalid", "Monitoring snapshot не прошёл structural/semantic validation.", { errors: report.errors }));
    }
    if (monitoring && runtime) {
      const identity = monitoring.sourceIdentity?.runtime;
      if (!identity || identity.id !== runtime.id || identity.revision !== runtime.revision || identity.epoch !== runtime.epoch || identity.fingerprint !== runtime.runtimeFingerprint) blockers.push(issue("runtime_identity_mismatch", "Stage 29 identity не совпадает с выбранным Stage 30 snapshot."));
    }
    const status = monitoring?.lifecycle?.state || null;
    if (status && !MONITORING_STATES.includes(status)) blockers.push(issue("monitoring_not_assessed", "Stage 30 ещё не содержит итоговое наблюдаемое состояние.", { status }));
    const errors = stableIssues(blockers);
    if (status === "stale") return { monitoringStatus: status, targetLifecycle: "stale", reason: "Monitoring source identity устарела; обычные actions отключены до явного rebuild.", blockers: errors, warnings, errors };
    if (errors.length) {
      const malformed = errors.some((entry) => ["monitoring_invalid", "runtime_identity_mismatch"].includes(entry.code));
      return { monitoringStatus: MONITORING_STATES.includes(status) ? status : null, targetLifecycle: malformed ? "failed" : "blocked", reason: malformed ? "Источник intervention повреждён или противоречив." : "Для assessment не хватает обязательных source data.", blockers: errors, warnings, errors };
    }
    const reasons = {
      healthy: "Вмешательство не требуется: Stage 30 подтверждает здоровое выполнение.",
      attention_required: "Вмешательство может потребоваться: Stage 30 зафиксировал предупреждения или paused/recovery состояние.",
      blocked: "Вмешательство требуется: Stage 30 зафиксировал доказуемый blocker.",
      completed: "Runtime завершён; допустимо только принять completion или не предпринимать действий.",
      failed: "Stage 30 зафиксировал failure; требуется осмотр перед любым retry/recovery.",
    };
    return { monitoringStatus: status, targetLifecycle: "ready", reason: reasons[status], blockers: [], warnings, errors: [] };
  }

  function normalizeSource(source, options = {}) {
    const aggregate = Array.isArray(source?.progress) ? source : null;
    const project = aggregate?.project || source?.project || null;
    const projectId = options.projectId || source?.projectId || project?.project_id || project?.projectId || source?.monitoring?.projectId || source?.runtime?.projectId || source?.state?.projectId || null;
    const calculationId = project?.active_calculation_id || source?.calculationId || null;
    const records = aggregate ? aggregate.progress.filter((entry) => !calculationId || entry.calculation_id === calculationId) : array(source?.records);
    const monitoringRecord = source?.monitoringRecord || newestRecord(records.filter((entry) => entry.kind === "PATTERN_EXECUTION_MONITORING"));
    const monitoring = source?.type === "PATTERN_EXECUTION_MONITORING"
      ? source
      : source?.monitoring || (source?.state?.type === "PATTERN_EXECUTION_MONITORING" ? source.state : monitoringRecord?.state || null);
    const runtimeRecord = source?.runtimeRecord || records.find((entry) => entry.kind === "PATTERN_EXECUTION_RUNTIME" && entry.state?.id === monitoring?.sourceIdentity?.runtime?.id) || newestRecord(records.filter((entry) => entry.kind === "PATTERN_EXECUTION_RUNTIME"));
    const runtime = source?.runtime || runtimeRecord?.state || null;
    const interventionRecord = source?.interventionRecord || newestRecord(records.filter((entry) => entry.kind === PROGRESS_KIND));
    return {
      aggregate, project, projectId, calculationId, records, monitoringRecord, monitoring,
      runtimeRecord, runtime, interventionRecord, projectRevision: positiveInteger(project?.revision) || positiveInteger(source?.projectRevision),
      importRevision: positiveInteger(project?.import_revision) || null,
    };
  }

  function inspectAggregate(aggregate) {
    const normalized = normalizeSource(aggregate);
    const record = normalized.interventionRecord;
    const rawIntervention = record?.state || null;
    const validation = rawIntervention ? validatePatternExecutionIntervention(rawIntervention) : null;
    const corrupt = Boolean(rawIntervention && validation.structural.length);
    const read = rawIntervention && !corrupt ? readPatternExecutionIntervention(rawIntervention, normalized) : null;
    const monitoringApi = globalObject.YarnAIPatternExecutionMonitoring;
    const monitoringValidation = normalized.monitoring ? (monitoringApi?.validateMonitoring ? monitoringApi.validateMonitoring(normalized.monitoring) : basicMonitoringValidation(normalized.monitoring)) : null;
    const canCreate = Boolean(normalized.monitoring && normalized.runtime && monitoringValidation?.valid && MONITORING_STATES.includes(normalized.monitoring.lifecycle?.state));
    return finish({
      project: normalized.project,
      calculationId: normalized.calculationId,
      monitoringRecord: normalized.monitoringRecord,
      monitoring: normalized.monitoring,
      runtimeRecord: normalized.runtimeRecord,
      runtime: normalized.runtime,
      interventionRecord: record,
      rawIntervention,
      intervention: corrupt ? null : rawIntervention,
      validation,
      identityErrors: read?.identityErrors || [],
      staleDetected: read?.staleDetected || false,
      interrupted: read?.interrupted || false,
      corrupt,
      availableCommands: rawIntervention ? availableCommands(rawIntervention, validation?.errors || [], read?.identityErrors || []) : canCreate ? ["create"] : [],
    });
  }

  async function createForProject(repository, projectId, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const normalized = normalizeSource(aggregate, { projectId });
    if (!normalized.calculationId) throw interventionError("missing_calculation", "У проекта нет активного расчёта.");
    const existing = await repository.getPatternExecutionIntervention(projectId, normalized.calculationId);
    if (existing) return inspectAggregate(aggregate);
    const intervention = buildPatternExecutionIntervention(aggregate, { ...options, projectId });
    await repository.ensurePatternExecutionIntervention(projectId, normalized.calculationId, intervention, { operationKind: "PATTERN_EXECUTION_INTERVENTION_CREATED", projectStage: `pattern_execution_intervention_${intervention.lifecycle.state}` });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function executeForProject(repository, projectId, command, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const inspected = inspectAggregate(aggregate);
    if (!inspected.rawIntervention || inspected.corrupt) throw interventionError("intervention_unavailable", "Intervention отсутствует или повреждён.");
    const functions = {
      select: (state) => selectPatternExecutionInterventionAction(state, options.actionId, options),
      confirm: (state) => confirmPatternExecutionIntervention(state, aggregate, options),
      cancel: (state) => cancelPatternExecutionIntervention(state, options),
      complete: (state) => completePatternExecutionIntervention(state, options),
      check_identity: (state) => checkPatternExecutionInterventionIdentity(state, aggregate, options),
      recover: (state) => recoverPatternExecutionIntervention(state, aggregate, options),
      rebuild: (state) => rebuildPatternExecutionIntervention(state, aggregate, options),
    };
    if (!functions[command]) throw interventionError("unknown_intervention_command", "Неизвестная intervention-команда.");
    const result = functions[command](inspected.rawIntervention);
    if (result.changed) await repository.updatePatternExecutionIntervention(projectId, inspected.calculationId, result.intervention, {
      expectedRevision: inspected.rawIntervention.revision,
      operationKind: `PATTERN_EXECUTION_INTERVENTION_${command.toUpperCase()}`,
      projectStage: `pattern_execution_intervention_${result.intervention.lifecycle.state}`,
    });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function readForProject(repository, projectId) { return inspectAggregate(await repository.getProject(projectId)); }

  function availableCommands(snapshot, errors = [], identityErrors = []) {
    if (!snapshot) return [];
    if (errors.length) return [];
    if (TERMINAL_STATES.includes(snapshot.lifecycle.state)) return ["rebuild"];
    if (identityErrors.length) return ["check_identity", "rebuild"];
    const commands = ["rebuild", "check_identity"];
    if (["assessing", "confirmation_required"].includes(snapshot.lifecycle.state)) commands.push("recover");
    if (snapshot.lifecycle.state === "ready") commands.push("select", "cancel");
    if (snapshot.lifecycle.state === "confirmation_required") commands.push("confirm", "cancel");
    if (snapshot.lifecycle.state === "ready" && snapshot.selectedAction) commands.push("confirm");
    if (snapshot.lifecycle.state === "confirmed") commands.push("complete", "cancel");
    if (snapshot.lifecycle.state === "blocked") commands.push("cancel");
    return stableStrings(commands);
  }

  function serializePatternExecutionIntervention(snapshot) {
    requireSnapshot(snapshot);
    return canonicalize(snapshot);
  }

  function deserializePatternExecutionIntervention(serialized, options = {}) {
    let parsed;
    try { parsed = typeof serialized === "string" ? JSON.parse(serialized) : copy(serialized); }
    catch (error) { throw interventionError("intervention_json_invalid", "Intervention JSON повреждён."); }
    requireSnapshot(parsed);
    if (options.source) {
      const errors = sourceIdentityValidation(parsed, options.source);
      if (errors.length) {
        if (!options.allowUnprovenIdentity) throw interventionError("import_identity_unproven", "Imported identity невозможно доказать.", { errors });
        return makeImportedInterventionStale(parsed, { reason: "import_identity_unproven", now: options.now });
      }
    }
    return copyFrozen(parsed);
  }

  function makeImportedInterventionStale(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    const original = { fingerprint: snapshot.fingerprint, lifecycle: snapshot.lifecycle.state, selectedActionId: snapshot.selectedAction?.id || null, decisionFingerprint: snapshot.decision?.fingerprint || null };
    next.revision += 1;
    next.updatedAt = now;
    next.lifecycle = { state: "stale", previousState: snapshot.lifecycle.state, assessedAt: snapshot.lifecycle.assessedAt || now };
    next.monitoringStatus = "stale";
    next.requiresIntervention = true;
    next.assessmentReason = "Imported identity не доказана; executable intent удалён до явного rebuild.";
    next.blockers = stableIssues([...next.blockers, issue(options.reason || "import_identity_unproven", "Imported intervention сохранён в безопасном stale-состоянии.")]);
    next.actions = buildActions("stale", next.sourceEvidence, next.observations, next.sourceIdentity, []);
    next.recommendation = null;
    next.importedDiagnostic = original;
    disableExecutableIntent(next, options.reason || "import_identity_unproven");
    appendAudit(next, "intervention_imported_stale", now, { originalFingerprint: original.fingerprint, collision: Boolean(options.collision) });
    seal(next);
    return finish(next);
  }

  function remapPatternExecutionIntervention(snapshot, referenceMap) {
    requireSnapshot(snapshot);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(copy(snapshot), map);
    if (next.sourceIdentity) next.sourceIdentity.sourceIdentityFingerprint = identityFingerprint(next.sourceIdentity);
    const oldToNewObservation = new Map();
    next.observations = array(next.observations).map((entry, index) => {
      const core = copy(entry); delete core.id;
      const id = `intervention-observation:${fingerprint(core).slice(8)}`;
      oldToNewObservation.set(snapshot.observations[index]?.id, id);
      return { id, ...core };
    });
    next.observations = stableObservations(next.observations);
    next.actions = stableActions(array(next.actions).map((action) => ({ ...action, sourceObservationIds: stableStrings(action.sourceObservationIds.map((id) => oldToNewObservation.get(id) || id)) })));
    next.recommendation = next.recommendation ? { ...next.recommendation, sourceObservationIds: stableStrings(next.recommendation.sourceObservationIds.map((id) => oldToNewObservation.get(id) || id)) } : null;
    next.selectedAction = next.selectedAction ? { ...next.selectedAction, sourceObservationIds: stableStrings(next.selectedAction.sourceObservationIds.map((id) => oldToNewObservation.get(id) || id)) } : null;
    if (next.decision) {
      next.decision.sourceObservationIds = stableStrings(next.decision.sourceObservationIds.map((id) => oldToNewObservation.get(id) || id));
      next.decision.selectedAction.sourceObservationIds = stableStrings(next.decision.selectedAction.sourceObservationIds.map((id) => oldToNewObservation.get(id) || id));
      next.decision.fingerprint = decisionFingerprint(next.decision);
    }
    next.fingerprint = fingerprintPatternExecutionIntervention(next);
    return finish(next);
  }

  function remapSnapshotState(snapshot, referenceMap) { return remapPatternExecutionIntervention(snapshot, referenceMap); }

  function basicMonitoringValidation(monitoring) {
    const errors = [];
    if (!monitoring || monitoring.type !== "PATTERN_EXECUTION_MONITORING" || monitoring.kind !== "PATTERN_EXECUTION_MONITORING" || !text(monitoring.id) || !positiveInteger(monitoring.revision) || !positiveInteger(monitoring.epoch) || !validFingerprint(monitoring.fingerprint) || !monitoring.sourceIdentity || !monitoring.lifecycle || !Array.isArray(monitoring.blockers) || !Array.isArray(monitoring.warnings) || !Array.isArray(monitoring.diagnostics)) errors.push(diagnostic("monitoring_structure_invalid"));
    return { valid: errors.length === 0, structural: errors, semantic: [], errors };
  }

  function normalizeIdentity(value) {
    if (Array.isArray(value)) return value.map(normalizeIdentity).sort((left, right) => lexical(canonicalize(left), canonicalize(right)));
    if (value && typeof value === "object") {
      const next = {};
      for (const key of Object.keys(value).sort(lexical)) next[key] = normalizeIdentity(value[key]);
      return next;
    }
    return value;
  }
  function normalizeEvidence(value) { return normalizeIdentity(value || {}); }
  function stableIdentities(values) { return array(values).map(copy).sort((left, right) => lexical(text(left?.id), text(right?.id)) || lexical(canonicalize(left), canonicalize(right))); }
  function stableStrings(values) { return [...new Set(array(values).map(text).filter(Boolean))].sort(lexical); }
  function stableObservations(values) { const unique = new Map(); for (const value of array(values)) unique.set(value.id || fingerprint(value), copy(value)); return [...unique.values()].sort((left, right) => lexical(left.id, right.id)); }
  function stableActions(values) { return array(values).map((entry) => ({ ...copy(entry), sourceObservationIds: stableStrings(entry.sourceObservationIds), targetIdentity: normalizeIdentity(entry.targetIdentity) })).sort((left, right) => lexical(left.type, right.type)); }
  function stableIssues(values) { const unique = new Map(); for (const value of array(values)) unique.set(`${value.code}|${value.source}|${canonicalize(value.details || {})}`, copy(value)); return [...unique.values()].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details || {}), canonicalize(right.details || {}))); }
  function stableDiagnostics(values) { const unique = new Map(); for (const value of array(values)) unique.set(`${value.code}|${value.severity}|${canonicalize(value.details || {})}`, copy(value)); return [...unique.values()].sort((left, right) => lexical(left.code, right.code) || lexical(left.severity, right.severity) || lexical(canonicalize(left.details || {}), canonicalize(right.details || {}))); }
  function normalizeRecommendation(value) { return value ? { ...copy(value), sourceObservationIds: stableStrings(value.sourceObservationIds), targetIdentity: normalizeIdentity(value.targetIdentity) } : null; }
  function normalizeSelectedAction(value) { return value ? { id: value.id, type: value.type, label: value.label, reason: value.reason, sourceObservationIds: stableStrings(value.sourceObservationIds), requiresConfirmation: value.requiresConfirmation, expectedEffect: value.expectedEffect, targetIdentity: normalizeIdentity(value.targetIdentity), priority: value.priority, impact: value.impact } : null; }
  function normalizeConfirmation(value) { return value ? { confirmedBy: value.confirmedBy, method: value.method, sourceVerified: value.sourceVerified, sourceIdentityFingerprint: value.sourceIdentityFingerprint } : null; }
  function normalizeDecision(value) { if (!value) return null; const next = copy(value); if (next.confirmation) delete next.confirmation.confirmedAt; next.selectedAction = normalizeSelectedAction(next.selectedAction); next.sourceObservationIds = stableStrings(next.sourceObservationIds); next.targetIdentity = normalizeIdentity(next.targetIdentity); return next; }
  function buildTargetIdentity(identity, evidence) { return normalizeIdentity({ projectId: identity?.project?.id || null, resultId: identity?.result?.id || null, runtimeId: identity?.runtime?.id || null, runtimeRevision: identity?.runtime?.revision || null, runtimeEpoch: identity?.runtime?.epoch || null, runtimeFingerprint: identity?.runtime?.fingerprint || null, monitoringId: identity?.monitoring?.id || null, monitoringRevision: identity?.monitoring?.revision || null, monitoringEpoch: identity?.monitoring?.epoch || null, monitoringFingerprint: identity?.monitoring?.fingerprint || null, planId: identity?.executionPlanIdentity?.id || null, sessionId: identity?.sessionIdentity?.id || null, progressId: identity?.progressIdentity?.id || null, completionId: identity?.completionIdentity?.id || null, actionId: evidence?.activeActionId || null, stepId: evidence?.stepId || null, checkpointId: evidence?.checkpointId || null }); }
  function issue(code, message, details = {}) { return { id: `intervention-issue:${fingerprint({ code, message, details }).slice(8)}`, code, source: "source", message, details: normalizeIdentity(details) }; }
  function diagnostic(code, severity = "error", details = {}) { return { code, severity, details: copy(details) }; }
  function findAction(snapshot, actionId) { const action = findActionOrNull(snapshot, actionId); if (!action) throw interventionError("unknown_action", "Неизвестный action.", { actionId }); return action; }
  function findActionOrNull(snapshot, actionId) { return array(snapshot?.actions).find((entry) => entry.id === actionId || entry.type === actionId) || null; }
  function checkConcurrency(snapshot, options) { if (!positiveInteger(options.expectedRevision) || options.expectedRevision !== snapshot.revision) throw interventionError("intervention_revision_conflict", "Intervention изменён другой операцией.", { expectedRevision: options.expectedRevision, actualRevision: snapshot.revision }); if (options.expectedEpoch !== undefined && options.expectedEpoch !== snapshot.epoch) throw interventionError("intervention_epoch_conflict", "Epoch intervention не совпадает.", { expectedEpoch: options.expectedEpoch, actualEpoch: snapshot.epoch }); }
  function protectTerminal(snapshot) { if (TERMINAL_STATES.includes(snapshot.lifecycle.state)) throw interventionError("terminal_intervention_protected", "Terminal intervention изменяется только через явный rebuild."); }
  function transition(snapshot, target, at, allowSameReady = false) { const from = snapshot.lifecycle.state; if (allowSameReady && from === target && target === "ready") { snapshot.lifecycle = { state: target, previousState: from, assessedAt: snapshot.lifecycle.assessedAt || at }; return; } if (!TRANSITIONS[from]?.includes(target)) throw interventionError("invalid_lifecycle_transition", `Переход ${from || "unknown"} → ${target} недопустим.`); snapshot.lifecycle = { state: target, previousState: from, assessedAt: snapshot.lifecycle.assessedAt || at }; }
  function disableExecutableIntent(snapshot) { snapshot.selectedAction = null; snapshot.confirmation = null; snapshot.decision = null; snapshot.recommendation = null; snapshot.actions = buildActions("stale", snapshot.sourceEvidence, snapshot.observations, snapshot.sourceIdentity, []); }
  function appendAudit(snapshot, event, at, details = {}) { const core = { event, revision: snapshot.revision, epoch: snapshot.epoch, details: normalizeIdentity(details) }; snapshot.audit = [...array(snapshot.audit), { id: `intervention-audit:${fingerprint(core).slice(8)}`, ...core, at }].slice(-AUDIT_LIMIT); }
  function appendOperation(snapshot, operationId, command, at) { snapshot.operations = [...array(snapshot.operations), operationEntry(operationId, command, snapshot.revision, snapshot.epoch, at)].slice(-OPERATION_LIMIT); }
  function operationEntry(operationId, command, revision, epoch, at) { return { operationId: requireOperationId(operationId), command, revision, epoch, at }; }
  function duplicateOperation(snapshot, command, options) { const operationId = requireOperationId(options.operationId); const existing = array(snapshot.operations).find((entry) => entry.operationId === operationId); if (!existing) return null; if (existing.command !== command) throw interventionError("operation_id_conflict", "operationId уже использован другой intervention-командой."); return commandResult(command, false, copyFrozen(snapshot), validatePatternExecutionIntervention(snapshot)); }
  function requireOperationId(value) { const result = text(value); if (!result) throw interventionError("operation_id_required", "Для intervention-команды требуется operationId."); return result; }
  function requireSnapshot(snapshot) { const report = validatePatternExecutionIntervention(snapshot); if (!report.valid) throw interventionError("corrupted_intervention_snapshot", "Intervention snapshot повреждён.", { errors: report.errors }); }
  function commandResult(command, changed, intervention, validation) { return finish({ ok: true, command, changed, intervention: copy(intervention), validation: validation || validatePatternExecutionIntervention(intervention) }); }
  function seal(snapshot) { snapshot.fingerprint = fingerprintPatternExecutionIntervention(snapshot); const report = validatePatternExecutionIntervention(snapshot); if (!report.valid) throw interventionError("intervention_command_invalid_result", "Команда создала противоречивый intervention snapshot.", { errors: report.errors }); return finish(snapshot); }
  function newestRecord(records) { return array(records).slice().sort((left, right) => numeric(left.epoch) - numeric(right.epoch) || numeric(left.state?.revision) - numeric(right.state?.revision) || lexical(text(left.progress_id), text(right.progress_id))).at(-1) || null; }
  function remapExact(value, map) { if (typeof value === "string") return map.has(value) ? map.get(value) : value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") { for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); } return value; }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function timestampNow() { return DEFAULT_TIMESTAMP; }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function copyFrozen(value) { return deepFreeze(copy(value)); }
  function finish(value) { return deepFreeze(value); }
  function interventionError(code, message, details = {}) { return new PatternExecutionInterventionError(code, message, details); }

  const api = {
    VERSION, SCHEMA_VERSION, SOURCE_SCHEMA_VERSION, PROGRESS_KIND, LIFECYCLE_STATES,
    MONITORING_STATES, ACTION_TYPES, TERMINAL_STATES, TRANSITIONS, AUDIT_LIMIT,
    OPERATION_LIMIT, CONFIRMED_CANCELLATION_POLICY, PatternExecutionInterventionError,
    canonicalize, fingerprint, identityFingerprint, decisionFingerprint,
    fingerprintPatternExecutionIntervention, buildPatternExecutionIntervention,
    readPatternExecutionIntervention, validatePatternExecutionIntervention,
    structuralValidation, semanticValidation, sourceIdentityValidation,
    selectPatternExecutionInterventionAction, confirmPatternExecutionIntervention,
    cancelPatternExecutionIntervention, completePatternExecutionIntervention,
    checkPatternExecutionInterventionIdentity, recoverPatternExecutionIntervention,
    rebuildPatternExecutionIntervention, serializePatternExecutionIntervention,
    deserializePatternExecutionIntervention, makeImportedInterventionStale,
    remapPatternExecutionIntervention, remapSnapshotState, buildObservations,
    buildActions, buildRecommendation, availableCommands, inspectAggregate,
    createForProject, executeForProject, readForProject,
  };
  globalObject.YarnAIPatternExecutionIntervention = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
