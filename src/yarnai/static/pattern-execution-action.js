"use strict";

(function exposePatternExecutionAction(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const PROGRESS_KIND = "PATTERN_EXECUTION_ACTION";
  const ADAPTER_VERSION = "pattern-execution-action-adapter/v1";
  const AUDIT_LIMIT = 64;
  const OPERATION_LIMIT = 96;
  const LIFECYCLE_STATES = Object.freeze([
    "waiting", "validating", "ready", "executing", "verifying",
    "completed", "blocked", "failed", "cancelled", "stale",
  ]);
  const TERMINAL_STATES = Object.freeze([
    "completed", "blocked", "failed", "cancelled", "stale",
  ]);
  const ACTION_TYPES = Object.freeze([
    "no_action", "acknowledge", "resume_runtime", "pause_runtime",
    "retry_runtime", "recover_runtime", "review_blocker", "resolve_blocker",
    "return_to_checkpoint", "rebuild_runtime", "stop_runtime",
    "accept_completion", "inspect_failure", "rebuild_monitoring",
  ]);
  const EXECUTION_MODES = Object.freeze([
    "no_op", "acknowledgement", "runtime_transition", "recovery_request",
    "blocker_review", "blocker_resolution", "checkpoint_return",
    "runtime_rebuild", "runtime_stop", "completion_acceptance",
    "failure_inspection", "monitoring_rebuild",
  ]);
  const VERIFICATION_STATUSES = Object.freeze([
    "pending", "verified", "rejected", "inconclusive",
  ]);
  const ATTEMPT_STATUSES = Object.freeze([
    "pending", "executing", "executed", "verified", "blocked", "failed",
    "cancelled", "stale",
  ]);
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["validating"]),
    validating: Object.freeze(["ready", "blocked", "failed", "stale"]),
    ready: Object.freeze(["executing", "cancelled", "stale"]),
    executing: Object.freeze(["verifying", "blocked", "failed", "stale"]),
    verifying: Object.freeze(["completed", "blocked", "failed", "stale"]),
    completed: Object.freeze([]), blocked: Object.freeze([]),
    failed: Object.freeze([]), cancelled: Object.freeze([]), stale: Object.freeze([]),
  });
  const ACTION_DEFINITIONS = Object.freeze({
    no_action: Object.freeze({ mode: "no_op", target: "none" }),
    acknowledge: Object.freeze({ mode: "acknowledgement", target: "intervention" }),
    resume_runtime: Object.freeze({ mode: "runtime_transition", target: "runtime" }),
    pause_runtime: Object.freeze({ mode: "runtime_transition", target: "runtime" }),
    retry_runtime: Object.freeze({ mode: "runtime_rebuild", target: "runtime" }),
    recover_runtime: Object.freeze({ mode: "recovery_request", target: "runtime" }),
    review_blocker: Object.freeze({ mode: "blocker_review", target: "runtime" }),
    resolve_blocker: Object.freeze({ mode: "blocker_resolution", target: "runtime" }),
    return_to_checkpoint: Object.freeze({ mode: "checkpoint_return", target: "runtime" }),
    rebuild_runtime: Object.freeze({ mode: "runtime_rebuild", target: "runtime" }),
    stop_runtime: Object.freeze({ mode: "runtime_stop", target: "runtime" }),
    accept_completion: Object.freeze({ mode: "completion_acceptance", target: "runtime" }),
    inspect_failure: Object.freeze({ mode: "failure_inspection", target: "runtime" }),
    rebuild_monitoring: Object.freeze({ mode: "monitoring_rebuild", target: "monitoring" }),
  });

  class PatternExecutionActionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionActionError";
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
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw actionError("invalid_number", "Action snapshot содержит недопустимое число.");
    }
    if (["function", "symbol", "undefined"].includes(typeof value)) {
      throw actionError("unsupported_fingerprint_value", "Action snapshot содержит нестабильное значение.");
    }
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

  function fingerprintPatternExecutionAction(snapshot) {
    return fingerprint({
      schemaVersion: snapshot.schemaVersion,
      kind: snapshot.kind,
      id: snapshot.id,
      projectId: snapshot.projectId,
      epoch: snapshot.epoch,
      revision: snapshot.revision,
      lifecycle: snapshot.lifecycle,
      createdAt: snapshot.createdAt,
      interventionIdentity: normalizeIdentity(snapshot.interventionIdentity),
      interventionFingerprint: snapshot.interventionFingerprint,
      decisionIdentity: normalizeIdentity(snapshot.decisionIdentity),
      selectedAction: normalizeSelectedAction(snapshot.selectedAction),
      targetIdentity: normalizeIdentity(snapshot.targetIdentity),
      sourceIdentity: normalizeIdentity(snapshot.sourceIdentity),
      executionPlan: normalizeIdentity(snapshot.executionPlan),
      currentAttempt: normalizeAttempt(snapshot.currentAttempt),
      attemptHistory: stableAttempts(snapshot.attemptHistory),
      verification: normalizeVerification(snapshot.verification),
      result: normalizeResult(snapshot.result),
      blockedReason: normalizeReason(snapshot.blockedReason),
      failure: normalizeReason(snapshot.failure),
      previousEpoch: normalizeIdentity(snapshot.previousEpoch),
      importedDiagnostic: normalizeIdentity(snapshot.importedDiagnostic),
      audit: stableAuditForFingerprint(snapshot.audit),
    });
  }

  function buildPatternExecutionAction(source, options = {}) {
    const normalized = normalizeSource(source, options);
    const eligibility = validateCreationSource(normalized);
    if (eligibility.length) {
      throw actionError(eligibility[0].code, "Confirmed Stage 31 decision не может создать execution action.", { errors: eligibility });
    }
    const now = options.now || timestampNow();
    const intervention = normalized.intervention;
    const decision = intervention.decision;
    const selected = normalizeSelectedAction(decision.selectedAction);
    const epoch = positiveInteger(options.epoch) || 1;
    const id = text(options.id) || `execution-action:${fingerprint({ projectId: normalized.projectId, intervention: intervention.fingerprint, decision: decision.fingerprint, action: selected.type, epoch }).slice(8)}`;
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      version: VERSION,
      kind: PROGRESS_KIND,
      type: PROGRESS_KIND,
      id,
      projectId: normalized.projectId,
      epoch,
      revision: positiveInteger(options.revision) || 1,
      lifecycle: "waiting",
      createdAt: options.createdAt || now,
      updatedAt: now,
      interventionIdentity: {
        id: intervention.id, revision: intervention.revision, epoch: intervention.epoch,
        lifecycle: lifecycleOf(intervention),
      },
      interventionFingerprint: intervention.fingerprint,
      decisionIdentity: {
        fingerprint: decision.fingerprint,
        interventionId: decision.intervention?.id || intervention.id,
        interventionRevision: decision.intervention?.revision || intervention.revision,
        interventionEpoch: decision.intervention?.epoch || intervention.epoch,
      },
      selectedAction: selected,
      targetIdentity: normalizeIdentity(decision.targetIdentity),
      sourceIdentity: normalizeIdentity(intervention.sourceIdentity),
      executionPlan: buildExecutionPlan(selected, normalized),
      currentAttempt: null,
      attemptHistory: [],
      verification: emptyVerification(),
      result: null,
      blockedReason: null,
      failure: null,
      audit: [],
      operations: [],
      previousEpoch: normalizeIdentity(options.previousEpoch || null),
      importedDiagnostic: null,
      fingerprint: null,
    };
    appendAudit(snapshot, "created", now, { actionType: selected.type, interventionFingerprint: intervention.fingerprint });
    seal(snapshot);
    return finish(snapshot);
  }

  function validatePatternExecutionAction(snapshot, source) {
    const structural = structuralValidation(snapshot);
    const semantic = structural.length ? [] : semanticValidation(snapshot);
    const sourceErrors = source === undefined || structural.length ? [] : sourceIdentityValidation(snapshot, source);
    const errors = [...structural, ...semantic, ...sourceErrors];
    return finish({ valid: errors.length === 0, structural, semantic, source: sourceErrors, errors: stableDiagnostics(errors) });
  }

  function preparePatternExecutionAction(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "validate", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (snapshot.lifecycle !== "waiting") throw actionError("validation_not_allowed", "Prepare доступен только для waiting action.");
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    transition(next, "validating");
    appendAudit(next, "validation_started", now);
    const errors = sourceIdentityValidation(next, source);
    if (errors.length) {
      const stale = errors.some((entry) => /fingerprint|revision|epoch|identity|project/.test(entry.code));
      transition(next, stale ? "stale" : "blocked");
      next.blockedReason = reason(stale ? "source_identity_stale" : "source_validation_blocked", { errors });
      if (stale) disableExecutableIntent(next, "source_identity_stale");
      appendAudit(next, stale ? "marked_stale" : "validation_blocked", now, { codes: errors.map((entry) => entry.code) });
    } else {
      transition(next, "ready");
      next.currentAttempt = buildAttempt(next, 1);
      appendAudit(next, "validation_passed", now, { attemptId: next.currentAttempt.attemptId });
    }
    appendOperation(next, options.operationId, "validate", now);
    seal(next);
    return commandResult("validate", true, next);
  }

  function executePatternExecutionAction(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "execute", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (snapshot.lifecycle !== "ready" || !snapshot.currentAttempt) throw actionError("execution_not_allowed", "Execute доступен только для ready action.");
    const sourceErrors = sourceIdentityValidation(snapshot, source);
    if (sourceErrors.length) return markConflict(snapshot, sourceErrors, options, "execute");
    const normalized = normalizeSource(source, { projectId: snapshot.projectId });
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    transition(next, "executing");
    next.currentAttempt.status = "executing";
    next.currentAttempt.startedAt = now;
    appendAudit(next, "execution_started", now, { attemptId: next.currentAttempt.attemptId, idempotencyKey: next.currentAttempt.idempotencyKey });
    let adapter;
    try {
      adapter = executeClosedAdapter(next.selectedAction.type, normalized, next, options);
    } catch (error) {
      transition(next, error.code === "source_identity_stale" ? "stale" : error.code?.startsWith("precondition_") ? "blocked" : "failed");
      next.currentAttempt.status = next.lifecycle;
      next.currentAttempt.finishedAt = now;
      next.currentAttempt.runtimeActionExecuted = true;
      next.currentAttempt.effectApplied = false;
      next.currentAttempt.error = normalizeReason({ code: error.code || "adapter_failed", message: error.message, details: error.details || {} });
      next.result = baseResult(
        next.selectedAction.type,
        next.executionPlan.sourceState,
        next.executionPlan.sourceState,
        false,
        next.currentAttempt.error,
        next,
        { adapterRejected: true, errorCode: error.code || "adapter_failed" },
      );
      next.failure = next.lifecycle === "failed" ? copy(next.currentAttempt.error) : null;
      next.blockedReason = next.lifecycle !== "failed" ? copy(next.currentAttempt.error) : null;
      appendAudit(next, "adapter_failed", now, { code: error.code || "adapter_failed" });
      appendOperation(next, options.operationId, "execute", now);
      seal(next);
      return commandResult("execute", true, next, { effects: {} });
    }
    next.result = normalizeResult(adapter.result);
    next.currentAttempt.status = "executed";
    next.currentAttempt.finishedAt = now;
    next.currentAttempt.preconditionFingerprint = adapter.result.preconditionFingerprint;
    next.currentAttempt.effectFingerprint = adapter.result.effectFingerprint;
    next.currentAttempt.runtimeActionExecuted = true;
    next.currentAttempt.effectApplied = false;
    next.currentAttempt.evidence = normalizeEvidence(adapter.result.evidence);
    next.currentAttempt.error = null;
    transition(next, "verifying");
    next.verification = emptyVerification();
    appendAudit(next, "adapter_completed", now, {
      actionType: next.selectedAction.type, changed: adapter.result.changed,
      noOp: adapter.result.noOp, effectFingerprint: adapter.result.effectFingerprint,
    });
    appendOperation(next, options.operationId, "execute", now);
    seal(next);
    return commandResult("execute", true, next, { effects: copy(adapter.effects) });
  }

  function verifyPatternExecutionAction(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "verify", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (snapshot.lifecycle !== "verifying" || !snapshot.result || snapshot.currentAttempt?.status !== "executed") {
      throw actionError("verification_not_allowed", "Verify доступен только после adapter execution.");
    }
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    appendAudit(next, "verification_started", now, { attemptId: next.currentAttempt.attemptId });
    const identityErrors = verificationSourceValidation(next, source);
    const actual = actualTargetState(next.selectedAction.type, normalizeSource(source, { projectId: next.projectId }));
    const expected = next.result.resultingState;
    const noSideEffects = verifySideEffects(next, source);
    let status = "verified";
    let code = "effect_verified";
    if (identityErrors.length) { status = "inconclusive"; code = "verification_identity_changed"; }
    else if (!noSideEffects.valid) { status = "rejected"; code = "unexpected_side_effect"; }
    else if (!effectMatches(next.result, actual)) { status = "rejected"; code = "effect_not_observed"; }
    const evidence = normalizeEvidence({
      expectedState: expected, actualState: actual,
      identityErrors, sideEffectErrors: noSideEffects.errors,
      targetIdentity: next.targetIdentity,
    });
    next.verification = {
      status,
      verifiedAt: status === "verified" ? now : null,
      expectedState: expected,
      actualState: actual,
      targetIdentity: normalizeIdentity(next.targetIdentity),
      evidence,
      reasonCode: code,
      fingerprint: null,
    };
    next.verification.fingerprint = verificationFingerprint(next.verification);
    if (status === "verified") {
      transition(next, "completed");
      next.currentAttempt.status = "verified";
      next.currentAttempt.effectApplied = next.result.changed === true;
      next.attemptHistory = stableAttempts([...next.attemptHistory, copy(next.currentAttempt)]);
      appendAudit(next, "verification_verified", now, { verificationFingerprint: next.verification.fingerprint });
      appendAudit(next, "completed", now, { changed: next.result.changed, noOp: next.result.noOp });
    } else {
      transition(next, status === "rejected" ? "failed" : "blocked");
      next.currentAttempt.status = next.lifecycle;
      if (next.result.changed) next.currentAttempt.effectApplied = false;
      const problem = reason(code, { expected, actual, identityErrors, sideEffectErrors: noSideEffects.errors });
      if (next.lifecycle === "failed") next.failure = problem;
      else next.blockedReason = problem;
      next.attemptHistory = stableAttempts([...next.attemptHistory, copy(next.currentAttempt)]);
      appendAudit(next, "verification_rejected", now, { status, code });
    }
    appendOperation(next, options.operationId, "verify", now);
    seal(next);
    return commandResult("verify", true, next);
  }

  function recoverPatternExecutionAction(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "recover", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    if (!["validating", "executing", "verifying"].includes(snapshot.lifecycle)) {
      throw actionError("recovery_not_required", "Recover доступен только для незавершённой операции.");
    }
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    const errors = sourceIdentityValidation(next, source, { allowAppliedTarget: true });
    if (errors.length) {
      transition(next, "stale");
      next.blockedReason = reason("recovery_source_stale", { errors });
      appendAudit(next, "marked_stale", now, { codes: errors.map((entry) => entry.code) });
    } else if (next.result && next.currentAttempt?.runtimeActionExecuted) {
      const actual = actualTargetState(next.selectedAction.type, normalizeSource(source, { projectId: next.projectId }));
      transition(next, "verifying");
      next.verification = { ...emptyVerification(), actualState: actual };
      appendAudit(next, "recovered", now, { resumedAt: "verifying", repeatedEffect: false });
    } else {
      transition(next, "blocked");
      next.blockedReason = reason("recovery_effect_state_unproven", { repeatedEffect: false });
      appendAudit(next, "recovered", now, { resumedAt: "blocked", repeatedEffect: false });
    }
    appendOperation(next, options.operationId, "recover", now);
    seal(next);
    return commandResult("recover", true, next);
  }

  function retryPatternExecutionAction(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "retry", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    if (!["failed", "blocked"].includes(snapshot.lifecycle)) throw actionError("retry_not_allowed", "Retry доступен только из retryable failed/blocked.");
    const retryable = options.retryable === true || snapshot.failure?.details?.retryable === true || snapshot.blockedReason?.details?.retryable === true || [
      "effect_not_observed", "verification_identity_changed", "recovery_effect_state_unproven",
    ].includes(snapshot.failure?.code || snapshot.blockedReason?.code);
    if (!retryable) throw actionError("retry_reason_not_retryable", "Причина не разрешает retry.");
    const errors = sourceIdentityValidation(snapshot, source, { allowAppliedTarget: true });
    if (errors.length) throw actionError("retry_source_stale", "Source identity изменилась перед retry.", { errors });
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    const previous = copy(next.currentAttempt);
    if (previous && !next.attemptHistory.some((entry) => entry.attemptId === previous.attemptId)) next.attemptHistory.push(previous);
    next.revision += 1;
    next.updatedAt = now;
    next.lifecycle = "ready";
    const ordinal = Math.max(0, ...next.attemptHistory.map((entry) => entry.ordinal || 0)) + 1;
    next.currentAttempt = buildAttempt(next, ordinal);
    next.result = null;
    next.verification = emptyVerification();
    next.blockedReason = null;
    next.failure = null;
    appendAudit(next, "retry_created", now, { attemptId: next.currentAttempt.attemptId, ordinal });
    appendOperation(next, options.operationId, "retry", now);
    seal(next);
    return commandResult("retry", true, next);
  }

  function cancelPatternExecutionAction(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "cancel", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    protectTerminal(snapshot);
    if (snapshot.lifecycle !== "ready") throw actionError("cancellation_not_allowed", "Cancel разрешён только для подготовленного action до execution.");
    if (snapshot.currentAttempt?.effectApplied === true || snapshot.result?.changed === true) throw actionError("effect_already_applied", "Применённый эффект нельзя маскировать отменой.");
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1;
    next.updatedAt = now;
    transition(next, "cancelled");
    if (next.currentAttempt) { next.currentAttempt.status = "cancelled"; next.currentAttempt.finishedAt = now; }
    appendAudit(next, "cancelled", now);
    appendOperation(next, options.operationId, "cancel", now);
    seal(next);
    return commandResult("cancel", true, next);
  }

  function rebuildPatternExecutionAction(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "rebuild", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    const now = options.now || timestampNow();
    const rebuilt = mutable(buildPatternExecutionAction(source, {
      projectId: snapshot.projectId,
      id: snapshot.id,
      epoch: snapshot.epoch + 1,
      revision: snapshot.revision + 1,
      createdAt: snapshot.createdAt,
      now,
      previousEpoch: { epoch: snapshot.epoch, revision: snapshot.revision, fingerprint: snapshot.fingerprint },
    }));
    rebuilt.audit = [...array(snapshot.audit), ...rebuilt.audit].slice(-AUDIT_LIMIT);
    appendAudit(rebuilt, "rebuilt", now, { previousFingerprint: snapshot.fingerprint, previousEpoch: snapshot.epoch });
    appendOperation(rebuilt, options.operationId, "rebuild", now);
    seal(rebuilt);
    return commandResult("rebuild", true, rebuilt);
  }

  function executeClosedAdapter(type, source, snapshot, options) {
    const adapters = {
      no_action: adaptNoAction,
      acknowledge: adaptAcknowledge,
      resume_runtime: adaptResumeRuntime,
      pause_runtime: adaptPauseRuntime,
      retry_runtime: adaptRetryRuntime,
      recover_runtime: adaptRecoverRuntime,
      review_blocker: adaptReviewBlocker,
      resolve_blocker: adaptResolveBlocker,
      return_to_checkpoint: adaptReturnToCheckpoint,
      rebuild_runtime: adaptRebuildRuntime,
      stop_runtime: adaptStopRuntime,
      accept_completion: adaptAcceptCompletion,
      inspect_failure: adaptInspectFailure,
      rebuild_monitoring: adaptRebuildMonitoring,
    };
    const adapter = adapters[type];
    if (!adapter || !ACTION_TYPES.includes(type)) throw actionError("adapter_not_allowed", "Action отсутствует в закрытом каталоге.");
    return adapter(source, snapshot, options);
  }

  function baseResult(type, sourceState, resultingState, changed, blockedReason, snapshot, evidence = {}, warnings = []) {
    const definition = ACTION_DEFINITIONS[type];
    const affectedIdentity = definition.target === "monitoring"
      ? snapshot.sourceIdentity.monitoring : definition.target === "runtime"
        ? snapshot.sourceIdentity.runtime : definition.target === "intervention"
          ? snapshot.interventionIdentity : snapshot.targetIdentity;
    const core = {
      actionType: type,
      executionMode: definition.mode,
      sourceState,
      requestedTargetState: requestedState(type, sourceState),
      resultingState,
      changed: Boolean(changed),
      noOp: !changed && !blockedReason,
      blockedReason: blockedReason || null,
      effectSummary: blockedReason ? `${type}:blocked` : changed ? `${type}:${sourceState}->${resultingState}` : `${type}:verified_no_change`,
      affectedIdentity: normalizeIdentity(affectedIdentity),
      preconditionFingerprint: fingerprint({ sourceState, affectedIdentity, targetIdentity: snapshot.targetIdentity }),
      effectFingerprint: null,
      evidence: normalizeEvidence(evidence),
      warnings: stableStrings(warnings),
    };
    core.effectFingerprint = fingerprint({ actionType: type, resultingState, changed: core.changed, noOp: core.noOp, affectedIdentity: core.affectedIdentity, evidence: core.evidence });
    return core;
  }

  function adaptNoAction(source, snapshot) {
    return { result: baseResult("no_action", runtimeState(source.runtime), runtimeState(source.runtime), false, null, snapshot, { verifiedNoOp: true }), effects: {} };
  }
  function adaptAcknowledge(source, snapshot) {
    return { result: baseResult("acknowledge", runtimeState(source.runtime), runtimeState(source.runtime), false, null, snapshot, { acknowledgementRecorded: true }), effects: {} };
  }
  function adaptReviewBlocker(source, snapshot) {
    const blockers = array(source.monitoring?.blockers);
    if (!blockers.length) throw actionError("precondition_blocker_missing", "Нет blocker для review.");
    return { result: baseResult("review_blocker", runtimeState(source.runtime), runtimeState(source.runtime), false, null, snapshot, { inspectedBlockerCodes: stableStrings(blockers.map((entry) => entry.code)), inspectionComplete: true }), effects: {} };
  }
  function adaptInspectFailure(source, snapshot) {
    if (runtimeState(source.runtime) !== "failed" && source.monitoring?.lifecycle?.state !== "failed") throw actionError("precondition_failure_missing", "Failure не доказан.");
    return { result: baseResult("inspect_failure", runtimeState(source.runtime), runtimeState(source.runtime), false, null, snapshot, { error: normalizeEvidence(source.runtime?.lastError || {}), inspectionComplete: true }), effects: {} };
  }
  function adaptAcceptCompletion(source, snapshot) {
    if (runtimeState(source.runtime) !== "completed") throw actionError("precondition_completion_unproven", "Completed runtime не доказан.");
    return { result: baseResult("accept_completion", "completed", "completed", false, null, snapshot, { completionAccepted: true, completionIdentity: snapshot.sourceIdentity.completionIdentity || null }), effects: {} };
  }
  function adaptResumeRuntime(source, snapshot, options) { return runtimeCommandAdapter("resume_runtime", "resume", ["paused"], source, snapshot, options); }
  function adaptPauseRuntime(source, snapshot, options) {
    if (runtimeState(source.runtime) === "paused") return { result: baseResult("pause_runtime", "paused", "paused", false, null, snapshot, { stableNoOp: true }), effects: {} };
    return runtimeCommandAdapter("pause_runtime", "pause", ["running"], source, snapshot, options);
  }
  function adaptStopRuntime(source, snapshot, options) {
    if (runtimeState(source.runtime) === "stopped") return { result: baseResult("stop_runtime", "stopped", "stopped", false, null, snapshot, { stableNoOp: true }), effects: {} };
    return runtimeCommandAdapter("stop_runtime", "stop", ["waiting", "ready", "running", "paused", "blocked", "recovering"], source, snapshot, options);
  }
  function adaptRecoverRuntime(source, snapshot, options) { return runtimeCommandAdapter("recover_runtime", "recover", ["waiting", "ready", "running", "paused", "blocked", "recovering"], source, snapshot, options); }
  function adaptResolveBlocker(source, snapshot, options) {
    if (options.blockerResolutionEvidence?.resolved !== true || !text(options.blockerResolutionEvidence?.proof)) throw actionError("precondition_blocker_resolution_unproven", "Blocker resolution требует явного доказательства.");
    return runtimeCommandAdapter("resolve_blocker", "unblockCurrentAction", ["blocked"], source, snapshot, options, { blockerResolutionEvidence: options.blockerResolutionEvidence });
  }
  function adaptReturnToCheckpoint(source, snapshot, options) {
    const checkpointId = snapshot.targetIdentity?.checkpointId;
    const checkpoint = array(snapshot.sourceIdentity.checkpointIdentities).find((entry) => entry.id === checkpointId);
    if (!checkpointId || !checkpoint) throw actionError("precondition_checkpoint_missing", "Checkpoint target не доказан.");
    if (checkpoint.projectId && checkpoint.projectId !== snapshot.projectId) throw actionError("precondition_checkpoint_project_mismatch", "Checkpoint принадлежит другому проекту.");
    if (checkpoint.epoch && checkpoint.epoch !== source.runtime?.epoch) throw actionError("precondition_checkpoint_epoch_mismatch", "Checkpoint принадлежит другому runtime epoch.");
    if (options.checkpointEvidence?.confirmed !== true) throw actionError("precondition_checkpoint_confirmation_missing", "Checkpoint return требует подтверждённого target evidence.");
    return runtimeCommandAdapter("return_to_checkpoint", "recover", ["blocked", "paused", "running", "ready"], source, snapshot, options, { checkpointIdentity: checkpoint });
  }
  function adaptRetryRuntime(source, snapshot, options) {
    if (runtimeState(source.runtime) !== "failed") throw actionError("precondition_retry_runtime_not_failed", "Retry требует failed runtime.");
    if (source.runtime?.lastError?.retryable !== true && source.runtime?.lastError?.recoverable !== true && options.retryEvidence?.retryable !== true) throw actionError("precondition_retry_unproven", "Retryability не доказана.");
    return runtimeRebuildAdapter("retry_runtime", source, snapshot, options, { previousRuntimeFingerprint: source.runtime.runtimeFingerprint, retry: true });
  }
  function adaptRebuildRuntime(source, snapshot, options) { return runtimeRebuildAdapter("rebuild_runtime", source, snapshot, options, { previousRuntimeFingerprint: source.runtime?.runtimeFingerprint }); }
  function adaptRebuildMonitoring(source, snapshot, options) {
    const api = globalObject.YarnAIPatternExecutionMonitoring;
    if (!api?.rebuild) throw actionError("monitoring_adapter_unavailable", "Public Stage 30 rebuild adapter недоступен.");
    const before = source.monitoring;
    const response = api.rebuild(before, source.aggregate || source, {
      expectedRevision: before.revision,
      operationId: snapshot.currentAttempt.idempotencyKey,
      now: options.now,
    });
    const after = response.monitoring;
    const changed = after.fingerprint !== before.fingerprint || after.epoch !== before.epoch;
    return { result: baseResult("rebuild_monitoring", before.lifecycle?.state || null, after.lifecycle?.state || null, changed, null, snapshot, { previousMonitoringFingerprint: before.fingerprint, monitoringFingerprint: after.fingerprint, previousEpoch: before.epoch, epoch: after.epoch }), effects: { monitoring: copy(after) } };
  }

  function runtimeCommandAdapter(type, command, allowedStates, source, snapshot, options, extraEvidence = {}) {
    const runtime = source.runtime;
    const state = runtimeState(runtime);
    if (!runtime) throw actionError("precondition_runtime_missing", "Runtime отсутствует.");
    if (!allowedStates.includes(state)) throw actionError("precondition_runtime_state_invalid", `Action ${type} недопустим для ${state}.`, { state, allowedStates });
    const api = globalObject.YarnAIPatternExecutionRuntime;
    const fn = api?.[command];
    if (typeof fn !== "function") throw actionError("runtime_adapter_unavailable", "Public Stage 29 adapter недоступен.", { command });
    const response = fn(runtime, {
      expectedRevision: runtime.revision,
      operationId: snapshot.currentAttempt.idempotencyKey,
      now: options.now,
    });
    const after = response.runtime;
    const changed = response.changed === true && (after.revision !== runtime.revision || after.status !== state);
    const result = baseResult(type, state, runtimeState(after), changed, null, snapshot, {
      ...extraEvidence,
      runtimeId: after.id, previousRuntimeFingerprint: runtime.runtimeFingerprint,
      runtimeFingerprint: after.runtimeFingerprint, previousRevision: runtime.revision,
      revision: after.revision, operationId: snapshot.currentAttempt.idempotencyKey,
    });
    return { result, effects: changed ? { runtime: copy(after) } : {} };
  }

  function runtimeRebuildAdapter(type, source, snapshot, options, evidence) {
    const runtime = source.runtime;
    if (!runtime) throw actionError("precondition_runtime_missing", "Runtime отсутствует.");
    const api = globalObject.YarnAIPatternExecutionRuntime;
    if (!api?.rebuild) throw actionError("runtime_adapter_unavailable", "Public Stage 29 rebuild adapter недоступен.");
    let rebuildSource = runtime;
    if (!["completed", "failed", "stopped", "stale"].includes(runtime.status)) {
      if (!api.stop) throw actionError("runtime_adapter_unavailable", "Public Stage 29 stop adapter для безопасного rebuild недоступен.");
      rebuildSource = api.stop(runtime, {
        expectedRevision: runtime.revision,
        operationId: `${snapshot.currentAttempt.idempotencyKey}:stop`,
        now: options.now,
      }).runtime;
    }
    const response = api.rebuild(rebuildSource, source.aggregate || source, {
      expectedRevision: rebuildSource.revision,
      operationId: snapshot.currentAttempt.idempotencyKey,
      now: options.now,
    });
    const after = response.runtime;
    if (after.epoch <= runtime.epoch || after.runtimeFingerprint === runtime.runtimeFingerprint) throw actionError("runtime_rebuild_not_proven", "Runtime rebuild не создал новый epoch.");
    return { result: baseResult(type, runtime.status, after.status, true, null, snapshot, { ...evidence, runtimeFingerprint: after.runtimeFingerprint, previousEpoch: runtime.epoch, epoch: after.epoch, safeStopAppliedBeforeRebuild: rebuildSource !== runtime }), effects: { runtime: copy(after) } };
  }

  function structuralValidation(snapshot) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [diagnostic("action_not_object")];
    if (!text(snapshot.id) || !text(snapshot.projectId)) invalid("action_identity_missing");
    if (snapshot.kind !== PROGRESS_KIND || snapshot.type !== PROGRESS_KIND) invalid("action_kind_invalid");
    if (snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.version !== VERSION) invalid("action_schema_unsupported");
    if (!positiveInteger(snapshot.epoch) || !positiveInteger(snapshot.revision)) invalid("action_revision_invalid");
    if (!LIFECYCLE_STATES.includes(snapshot.lifecycle)) invalid("action_lifecycle_invalid");
    if (!ACTION_TYPES.includes(snapshot.selectedAction?.type)) invalid("action_type_invalid");
    if (!EXECUTION_MODES.includes(snapshot.executionPlan?.executionMode)) invalid("execution_mode_invalid");
    if (!snapshot.interventionIdentity || !validFingerprint(snapshot.interventionFingerprint)) invalid("intervention_identity_invalid");
    if (!snapshot.decisionIdentity || !validFingerprint(snapshot.decisionIdentity.fingerprint)) invalid("decision_identity_invalid");
    if (!snapshot.targetIdentity || !snapshot.sourceIdentity) invalid("source_or_target_identity_missing");
    if (!Array.isArray(snapshot.attemptHistory) || !Array.isArray(snapshot.audit) || !Array.isArray(snapshot.operations)) invalid("action_collections_invalid");
    if (snapshot.audit?.length > AUDIT_LIMIT) invalid("action_audit_limit_exceeded");
    if (snapshot.operations?.length > OPERATION_LIMIT) invalid("action_operation_limit_exceeded");
    if (!isTimestamp(snapshot.createdAt) || !isTimestamp(snapshot.updatedAt)) invalid("action_timestamp_invalid");
    if (snapshot.currentAttempt && attemptValidation(snapshot.currentAttempt).length) invalid("current_attempt_invalid");
    for (const attempt of array(snapshot.attemptHistory)) if (attemptValidation(attempt).length) invalid("attempt_history_invalid", { attemptId: attempt?.attemptId });
    if (!snapshot.verification || !VERIFICATION_STATUSES.includes(snapshot.verification.status)) invalid("verification_invalid");
    if (snapshot.verification?.fingerprint && snapshot.verification.fingerprint !== verificationFingerprint(snapshot.verification)) invalid("verification_fingerprint_mismatch");
    if (snapshot.result && resultValidation(snapshot.result).length) invalid("execution_result_invalid");
    if (!validFingerprint(snapshot.fingerprint) || snapshot.fingerprint !== fingerprintPatternExecutionAction(snapshot)) invalid("action_fingerprint_mismatch");
    return stableDiagnostics(errors);
  }

  function semanticValidation(snapshot) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    if (snapshot.selectedAction.type !== snapshot.executionPlan.actionType) invalid("execution_plan_action_mismatch");
    if (snapshot.executionPlan.executionMode !== ACTION_DEFINITIONS[snapshot.selectedAction.type]?.mode) invalid("execution_plan_mode_mismatch");
    if (canonicalize(normalizeIdentity(snapshot.selectedAction.targetIdentity)) !== canonicalize(normalizeIdentity(snapshot.targetIdentity))) invalid("selected_target_mismatch");
    if (["ready", "executing", "verifying", "completed"].includes(snapshot.lifecycle) && !snapshot.currentAttempt) invalid("lifecycle_attempt_missing");
    const ordinals = stableAttempts(snapshot.attemptHistory).map((entry) => entry.ordinal);
    if (new Set(ordinals).size !== ordinals.length) invalid("attempt_ordinal_duplicate");
    if (snapshot.currentAttempt && snapshot.attemptHistory.some((entry) => entry.attemptId === snapshot.currentAttempt.attemptId) && !TERMINAL_STATES.includes(snapshot.lifecycle)) invalid("current_attempt_already_historical");
    if (snapshot.result) {
      if (snapshot.result.actionType !== snapshot.selectedAction.type) invalid("result_action_mismatch");
      if (snapshot.result.changed !== snapshot.currentAttempt?.effectApplied && snapshot.lifecycle === "completed") invalid("changed_effect_applied_mismatch");
      if (!snapshot.result.blockedReason && snapshot.result.changed === snapshot.result.noOp) invalid("changed_noop_inconsistent");
    }
    if (snapshot.lifecycle === "completed" && (snapshot.verification.status !== "verified" || snapshot.currentAttempt?.status !== "verified")) invalid("completed_without_verification");
    if (snapshot.lifecycle === "cancelled" && (snapshot.currentAttempt?.effectApplied === true || snapshot.result?.changed === true)) invalid("cancelled_with_applied_effect");
    if (snapshot.lifecycle === "waiting" && (snapshot.currentAttempt || snapshot.result || snapshot.verification.status !== "pending")) invalid("waiting_has_execution_state");
    if (snapshot.lifecycle === "stale" && snapshot.executionPlan?.executable === true) invalid("stale_action_executable");
    return stableDiagnostics(errors);
  }

  function sourceIdentityValidation(snapshot, source, options = {}) {
    const normalized = normalizeSource(source, { projectId: snapshot.projectId });
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    const intervention = normalized.intervention;
    const runtime = normalized.runtime;
    const monitoring = normalized.monitoring;
    if (!normalized.projectId || normalized.projectId !== snapshot.projectId) invalid("project_identity_mismatch");
    if (!intervention) invalid("intervention_missing");
    else {
      if (intervention.id !== snapshot.interventionIdentity.id) invalid("intervention_id_mismatch");
      if (intervention.fingerprint !== snapshot.interventionFingerprint) invalid("intervention_fingerprint_mismatch");
      if (lifecycleOf(intervention) !== "confirmed") invalid("intervention_not_confirmed");
      if (!intervention.decision) invalid("decision_missing");
      else {
        if (intervention.decision.fingerprint !== snapshot.decisionIdentity.fingerprint) invalid("decision_fingerprint_mismatch");
        if (intervention.decision.selectedAction?.type !== snapshot.selectedAction.type) invalid("decision_action_mismatch");
        if (intervention.decision.runtimeActionExecuted !== false || intervention.decision.effectApplied !== false) invalid("decision_claims_execution");
        if (canonicalize(normalizeIdentity(intervention.decision.targetIdentity)) !== canonicalize(normalizeIdentity(snapshot.targetIdentity))) invalid("decision_target_mismatch");
      }
    }
    if (!runtime) invalid("runtime_missing");
    else {
      const expected = snapshot.sourceIdentity.runtime;
      if (expected?.id !== runtime.id) invalid("runtime_id_mismatch");
      if (!options.allowAppliedTarget && expected?.revision !== runtime.revision) invalid("runtime_revision_mismatch");
      if (!options.allowAppliedTarget && expected?.epoch !== runtime.epoch) invalid("runtime_epoch_mismatch");
      if (!options.allowAppliedTarget && expected?.fingerprint !== runtime.runtimeFingerprint) invalid("runtime_fingerprint_mismatch");
    }
    if (!monitoring) invalid("monitoring_missing");
    else {
      const expected = snapshot.sourceIdentity.monitoring;
      if (expected?.id !== monitoring.id) invalid("monitoring_id_mismatch");
      if (!options.allowAppliedTarget && expected?.revision !== monitoring.revision) invalid("monitoring_revision_mismatch");
      if (!options.allowAppliedTarget && expected?.epoch !== monitoring.epoch) invalid("monitoring_epoch_mismatch");
      if (!options.allowAppliedTarget && expected?.fingerprint !== monitoring.fingerprint) invalid("monitoring_fingerprint_mismatch");
    }
    validateNestedIdentities(snapshot, normalized, invalid);
    return stableDiagnostics(errors);
  }

  function verificationSourceValidation(snapshot, source) {
    const normalized = normalizeSource(source, { projectId: snapshot.projectId });
    const errors = sourceIdentityValidation(snapshot, source, { allowAppliedTarget: true }).filter((entry) => ![
      "intervention_revision_mismatch", "runtime_revision_mismatch", "runtime_epoch_mismatch",
      "runtime_fingerprint_mismatch", "monitoring_revision_mismatch", "monitoring_epoch_mismatch",
      "monitoring_fingerprint_mismatch",
    ].includes(entry.code));
    if (snapshot.result?.affectedIdentity?.id && ![normalized.runtime?.id, normalized.monitoring?.id, snapshot.interventionIdentity.id].includes(snapshot.result.affectedIdentity.id)) errors.push(diagnostic("affected_identity_mismatch"));
    return stableDiagnostics(errors);
  }

  function validateCreationSource(source) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    const intervention = source.intervention;
    if (!source.projectId) invalid("project_context_missing");
    if (!intervention) return [diagnostic("intervention_missing")];
    const interventionApi = globalObject.YarnAIPatternExecutionIntervention;
    const report = interventionApi?.validatePatternExecutionIntervention?.(intervention, source.aggregate || source);
    if (report && !report.valid) invalid("intervention_invalid", { errors: report.errors });
    if (lifecycleOf(intervention) !== "confirmed") invalid("intervention_not_confirmed");
    if (!intervention.decision || !intervention.selectedAction || !intervention.confirmation) invalid("confirmed_decision_missing");
    if (intervention.decision?.runtimeActionExecuted !== false || intervention.decision?.effectApplied !== false) invalid("decision_already_executed");
    if (!ACTION_TYPES.includes(intervention.decision?.selectedAction?.type)) invalid("decision_action_not_allowed");
    const selected = array(intervention.actions).find((entry) => entry.type === intervention.decision?.selectedAction?.type);
    if (!selected?.eligible) invalid("selected_action_not_eligible");
    if (intervention.importedDiagnostic || !intervention.decision?.fingerprint) invalid("import_identity_unproven");
    if (intervention.fingerprint && interventionApi?.fingerprintPatternExecutionIntervention && intervention.fingerprint !== interventionApi.fingerprintPatternExecutionIntervention(intervention)) invalid("intervention_fingerprint_mismatch");
    if (!source.runtime) invalid("runtime_missing");
    if (!source.monitoring) invalid("monitoring_missing");
    if (source.runtime && intervention.sourceIdentity?.runtime && (source.runtime.id !== intervention.sourceIdentity.runtime.id || source.runtime.revision !== intervention.sourceIdentity.runtime.revision || source.runtime.epoch !== intervention.sourceIdentity.runtime.epoch || source.runtime.runtimeFingerprint !== intervention.sourceIdentity.runtime.fingerprint)) invalid("runtime_identity_mismatch");
    if (source.monitoring && intervention.sourceIdentity?.monitoring && (source.monitoring.id !== intervention.sourceIdentity.monitoring.id || source.monitoring.revision !== intervention.sourceIdentity.monitoring.revision || source.monitoring.epoch !== intervention.sourceIdentity.monitoring.epoch || source.monitoring.fingerprint !== intervention.sourceIdentity.monitoring.fingerprint)) invalid("monitoring_identity_mismatch");
    return stableDiagnostics(errors);
  }

  function validateNestedIdentities(snapshot, source, invalid) {
    const expected = snapshot.sourceIdentity;
    const actual = source.intervention?.sourceIdentity || {};
    const pairs = [
      ["calculation", expected.calculationIdentity, actual.calculationIdentity],
      ["result", expected.result, actual.result],
      ["plan", expected.executionPlanIdentity, actual.executionPlanIdentity],
      ["session", expected.sessionIdentity, actual.sessionIdentity],
      ["progress", expected.progressIdentity, actual.progressIdentity],
      ["completion", expected.completionIdentity, actual.completionIdentity],
    ];
    for (const [name, left, right] of pairs) if (canonicalize(normalizeIdentity(left)) !== canonicalize(normalizeIdentity(right))) invalid(`${name}_identity_mismatch`);
    for (const [name, left, right] of [["step", expected.stepIdentities, actual.stepIdentities], ["checkpoint", expected.checkpointIdentities, actual.checkpointIdentities]]) {
      if (canonicalize(normalizeIdentity(left || [])) !== canonicalize(normalizeIdentity(right || []))) invalid(`${name}_identity_mismatch`);
    }
    if ((expected.importRevision ?? null) !== (actual.importRevision ?? null)) invalid("import_identity_mismatch");
  }

  function makeImportedPatternExecutionActionStale(snapshot, options = {}) {
    requireSnapshot(snapshot);
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    const original = { fingerprint: snapshot.fingerprint, lifecycle: snapshot.lifecycle, selectedAction: snapshot.selectedAction?.type, effectApplied: snapshot.currentAttempt?.effectApplied === true };
    next.revision += 1;
    next.updatedAt = now;
    next.lifecycle = "stale";
    next.executionPlan = { actionType: next.selectedAction.type, executionMode: ACTION_DEFINITIONS[next.selectedAction.type].mode, targetKind: ACTION_DEFINITIONS[next.selectedAction.type].target, expectedEffect: next.selectedAction.expectedEffect, executable: false };
    if (next.currentAttempt) {
      next.currentAttempt.status = "stale";
      next.currentAttempt.runtimeActionExecuted = Boolean(next.currentAttempt.runtimeActionExecuted);
      next.currentAttempt.effectApplied = false;
    }
    next.blockedReason = reason(options.reason || "import_identity_unproven", { executableIntentRemoved: true });
    next.failure = null;
    next.importedDiagnostic = original;
    appendAudit(next, "marked_stale", now, { import: true, collision: Boolean(options.collision), originalFingerprint: original.fingerprint });
    seal(next);
    return finish(next);
  }

  function serializePatternExecutionAction(snapshot) { requireSnapshot(snapshot); return canonicalize(snapshot); }
  function deserializePatternExecutionAction(serialized, options = {}) {
    let parsed;
    try { parsed = typeof serialized === "string" ? JSON.parse(serialized) : copy(serialized); }
    catch (error) { throw actionError("action_json_invalid", "Action JSON повреждён."); }
    requireSnapshot(parsed);
    if (options.source) {
      const errors = sourceIdentityValidation(parsed, options.source, { allowAppliedTarget: parsed.lifecycle === "completed" });
      if (errors.length) {
        if (!options.allowUnprovenIdentity) throw actionError("import_identity_unproven", "Imported action identity невозможно доказать.", { errors });
        return makeImportedPatternExecutionActionStale(parsed, { reason: "import_identity_unproven", now: options.now });
      }
    } else if (parsed.executionPlan?.executable === true && parsed.lifecycle !== "completed") {
      if (!options.allowUnprovenIdentity) throw actionError("import_identity_unproven", "Executable imported action требует source proof.");
      return makeImportedPatternExecutionActionStale(parsed, { reason: "import_identity_unproven", now: options.now });
    }
    return finish(parsed);
  }

  function remapPatternExecutionAction(snapshot, referenceMap) {
    requireSnapshot(snapshot);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(copy(snapshot), map);
    for (const attempt of [...array(next.attemptHistory), next.currentAttempt].filter(Boolean)) {
      attempt.attemptId = map.get(attempt.attemptId) || attempt.attemptId;
      attempt.preconditionFingerprint = attempt.preconditionFingerprint ? fingerprint({ remapped: true, actionId: next.id, ordinal: attempt.ordinal, sourceIdentity: next.sourceIdentity, targetIdentity: next.targetIdentity }) : null;
      attempt.idempotencyKey = idempotencyKey(next, attempt.ordinal);
    }
    if (next.result) {
      next.result.preconditionFingerprint = fingerprint({ sourceState: next.result.sourceState, affectedIdentity: next.result.affectedIdentity, targetIdentity: next.targetIdentity });
      next.result.effectFingerprint = fingerprint({ actionType: next.result.actionType, resultingState: next.result.resultingState, changed: next.result.changed, noOp: next.result.noOp, affectedIdentity: next.result.affectedIdentity, evidence: next.result.evidence });
      if (next.currentAttempt) next.currentAttempt.effectFingerprint = next.result.effectFingerprint;
    }
    if (next.verification?.fingerprint) next.verification.fingerprint = verificationFingerprint(next.verification);
    next.fingerprint = fingerprintPatternExecutionAction(next);
    return finish(next);
  }
  function remapSnapshotState(snapshot, referenceMap) { return remapPatternExecutionAction(snapshot, referenceMap); }

  function inspectAggregate(aggregate) {
    const source = normalizeSource(aggregate);
    const record = source.actionRecord;
    const rawAction = record?.state || null;
    const validation = rawAction ? validatePatternExecutionAction(rawAction) : null;
    const corrupt = Boolean(rawAction && validation.structural.length);
    const identityErrors = rawAction && !corrupt ? sourceIdentityValidation(rawAction, aggregate, { allowAppliedTarget: ["verifying", "completed"].includes(rawAction.lifecycle) }) : [];
    const canCreate = !rawAction && validateCreationSource(source).length === 0;
    return finish({
      project: source.project, calculationId: source.calculationId,
      intervention: source.intervention, runtime: source.runtime, monitoring: source.monitoring,
      actionRecord: record, rawAction, action: corrupt ? null : rawAction,
      validation, identityErrors, corrupt,
      availableCommands: rawAction ? availableCommands(rawAction, validation?.errors || [], identityErrors) : canCreate ? ["create"] : [],
      creationErrors: rawAction ? [] : validateCreationSource(source),
    });
  }

  async function createForProject(repository, projectId, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const source = normalizeSource(aggregate, { projectId });
    if (!source.calculationId) throw actionError("missing_calculation", "У проекта нет активного расчёта.");
    const existing = await repository.getPatternExecutionAction(projectId, source.calculationId);
    if (existing) return inspectAggregate(aggregate);
    const action = buildPatternExecutionAction(aggregate, { ...options, projectId });
    await repository.ensurePatternExecutionAction(projectId, source.calculationId, action, { operationKind: "PATTERN_EXECUTION_ACTION_CREATED", projectStage: "pattern_execution_action_waiting" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function executeForProject(repository, projectId, command, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const inspected = inspectAggregate(aggregate);
    if (!inspected.rawAction || inspected.corrupt) throw actionError("action_unavailable", "Execution action отсутствует или повреждён.");
    const commands = {
      validate: (state) => preparePatternExecutionAction(state, aggregate, options),
      execute: (state) => executePatternExecutionAction(state, aggregate, options),
      verify: (state) => verifyPatternExecutionAction(state, aggregate, options),
      recover: (state) => recoverPatternExecutionAction(state, aggregate, options),
      retry: (state) => retryPatternExecutionAction(state, aggregate, options),
      cancel: (state) => cancelPatternExecutionAction(state, options),
      rebuild: (state) => rebuildPatternExecutionAction(state, aggregate, options),
    };
    if (!commands[command]) throw actionError("unknown_action_command", "Неизвестная Stage 32 команда.");
    const result = commands[command](inspected.rawAction);
    if (result.effects?.runtime) await repository.updatePatternExecutionRuntime(projectId, inspected.calculationId, result.effects.runtime, { expectedRevision: inspected.runtime.revision, operationKind: "PATTERN_EXECUTION_ACTION_RUNTIME_EFFECT", projectStage: `pattern_execution_runtime_${result.effects.runtime.status}` });
    if (result.effects?.monitoring) await repository.updatePatternExecutionMonitoring(projectId, inspected.calculationId, result.effects.monitoring, { expectedRevision: inspected.monitoring.revision, operationKind: "PATTERN_EXECUTION_ACTION_MONITORING_EFFECT", projectStage: `pattern_execution_monitoring_${result.effects.monitoring.lifecycle.state}` });
    if (result.changed) await repository.updatePatternExecutionAction(projectId, inspected.calculationId, result.action, { expectedRevision: inspected.rawAction.revision, expectedFingerprint: inspected.rawAction.fingerprint, operationKind: `PATTERN_EXECUTION_ACTION_${command.toUpperCase()}`, projectStage: `pattern_execution_action_${result.action.lifecycle}` });
    return inspectAggregate(await repository.getProject(projectId));
  }
  async function readForProject(repository, projectId) { return inspectAggregate(await repository.getProject(projectId)); }

  function availableCommands(snapshot, errors = [], identityErrors = []) {
    if (!snapshot || errors.length) return [];
    if (snapshot.lifecycle === "completed") return ["rebuild"];
    if (["blocked", "failed"].includes(snapshot.lifecycle)) return ["retry", "rebuild"];
    if (snapshot.lifecycle === "cancelled" || snapshot.lifecycle === "stale") return ["rebuild"];
    if (identityErrors.length && !["executing", "verifying"].includes(snapshot.lifecycle)) return ["rebuild"];
    const commands = ["rebuild"];
    if (snapshot.lifecycle === "waiting") commands.push("validate");
    if (snapshot.lifecycle === "ready") commands.push("execute", "cancel");
    if (["validating", "executing", "verifying"].includes(snapshot.lifecycle)) commands.push("recover");
    if (snapshot.lifecycle === "verifying") commands.push("verify");
    return stableStrings(commands);
  }

  function normalizeSource(source, options = {}) {
    const aggregate = Array.isArray(source?.progress) ? source : source?.aggregate || source || {};
    const project = aggregate.project || source?.project || null;
    const projectId = text(options.projectId) || text(source?.projectId) || text(project?.project_id) || text(project?.id) || null;
    const calculationId = text(source?.calculationId) || text(aggregate.calculation?.calculation_id) || text(aggregate.calculation?.id) || null;
    const records = array(aggregate.progress);
    const newest = (kind) => records.filter((entry) => entry.kind === kind).sort((left, right) => (right.epoch || 0) - (left.epoch || 0) || (right.revision || 0) - (left.revision || 0))[0] || null;
    const runtimeRecord = source?.runtimeRecord || newest("PATTERN_EXECUTION_RUNTIME");
    const monitoringRecord = source?.monitoringRecord || newest("PATTERN_EXECUTION_MONITORING");
    const interventionRecord = source?.interventionRecord || newest("PATTERN_EXECUTION_INTERVENTION");
    const actionRecord = source?.actionRecord || newest(PROGRESS_KIND);
    return {
      aggregate, project, projectId, calculationId, records,
      runtimeRecord, runtime: source?.runtime || runtimeRecord?.state || null,
      monitoringRecord, monitoring: source?.monitoring || monitoringRecord?.state || null,
      interventionRecord, intervention: source?.intervention || interventionRecord?.state || null,
      actionRecord,
    };
  }

  function buildExecutionPlan(selected, source) {
    const definition = ACTION_DEFINITIONS[selected.type];
    return {
      actionType: selected.type,
      executionMode: definition.mode,
      targetKind: definition.target,
      sourceState: definition.target === "monitoring" ? source.monitoring?.lifecycle?.state || null : runtimeState(source.runtime),
      requestedTargetState: requestedState(selected.type, runtimeState(source.runtime)),
      expectedEffect: selected.expectedEffect,
      executable: true,
      adapterVersion: ADAPTER_VERSION,
    };
  }
  function buildAttempt(snapshot, ordinal) {
    const attemptId = `execution-attempt:${fingerprint({ actionId: snapshot.id, epoch: snapshot.epoch, ordinal }).slice(8)}`;
    return {
      attemptId, ordinal, startedAt: null, finishedAt: null, status: "pending",
      preconditionFingerprint: fingerprint({ sourceIdentity: snapshot.sourceIdentity, targetIdentity: snapshot.targetIdentity, ordinal }),
      effectFingerprint: null, adapterVersion: ADAPTER_VERSION,
      idempotencyKey: idempotencyKey(snapshot, ordinal), effectApplied: false,
      runtimeActionExecuted: false, evidence: {}, error: null,
    };
  }
  function idempotencyKey(snapshot, ordinal) {
    return `action-idempotency:${fingerprint({ projectId: snapshot.projectId, interventionFingerprint: snapshot.interventionFingerprint, decisionFingerprint: snapshot.decisionIdentity.fingerprint, actionType: snapshot.selectedAction.type, targetIdentity: snapshot.targetIdentity, epoch: snapshot.epoch, ordinal }).slice(8)}`;
  }
  function emptyVerification() { return { status: "pending", verifiedAt: null, expectedState: null, actualState: null, targetIdentity: null, evidence: {}, reasonCode: null, fingerprint: null }; }
  function verificationFingerprint(value) { const normalized = normalizeVerification(value); delete normalized.fingerprint; return fingerprint(normalized); }

  function effectMatches(result, actual) {
    if (result.noOp) return actual === result.sourceState;
    if (["retry_runtime", "rebuild_runtime", "rebuild_monitoring"].includes(result.actionType)) return result.evidence?.epoch === actual?.epoch && result.evidence?.runtimeFingerprint ? result.evidence.runtimeFingerprint === actual?.fingerprint : result.evidence?.monitoringFingerprint === actual?.fingerprint;
    if (result.actionType === "resolve_blocker") return actual === "running";
    if (result.actionType === "return_to_checkpoint") return actual === "recovering";
    return actual === result.resultingState;
  }
  function actualTargetState(type, source) {
    if (type === "rebuild_monitoring") return { state: source.monitoring?.lifecycle?.state || null, epoch: source.monitoring?.epoch || null, fingerprint: source.monitoring?.fingerprint || null };
    if (["retry_runtime", "rebuild_runtime"].includes(type)) return { state: source.runtime?.status || null, epoch: source.runtime?.epoch || null, fingerprint: source.runtime?.runtimeFingerprint || null };
    return runtimeState(source.runtime);
  }
  function verifySideEffects(snapshot, source) {
    const normalized = normalizeSource(source, { projectId: snapshot.projectId });
    const errors = [];
    const type = snapshot.selectedAction.type;
    const expectedRuntime = snapshot.sourceIdentity.runtime;
    const expectedMonitoring = snapshot.sourceIdentity.monitoring;
    const runtimeChanged = normalized.runtime?.id !== expectedRuntime?.id || normalized.runtime?.revision !== expectedRuntime?.revision || normalized.runtime?.epoch !== expectedRuntime?.epoch || normalized.runtime?.runtimeFingerprint !== expectedRuntime?.fingerprint;
    const monitoringChanged = normalized.monitoring?.id !== expectedMonitoring?.id || normalized.monitoring?.revision !== expectedMonitoring?.revision || normalized.monitoring?.epoch !== expectedMonitoring?.epoch || normalized.monitoring?.fingerprint !== expectedMonitoring?.fingerprint;
    const noRuntimeMutation = ["no_action", "acknowledge", "review_blocker", "accept_completion", "inspect_failure"].includes(type);
    if (type !== "rebuild_monitoring" && monitoringChanged) errors.push(diagnostic("monitoring_changed_unexpectedly"));
    if ((type === "rebuild_monitoring" || noRuntimeMutation) && runtimeChanged) errors.push(diagnostic("runtime_changed_unexpectedly"));
    return { valid: errors.length === 0, errors };
  }

  function requestedState(type, sourceState) {
    return ({ resume_runtime: "running", pause_runtime: "paused", retry_runtime: "new_epoch", recover_runtime: "recovering", resolve_blocker: "running", return_to_checkpoint: "recovering", rebuild_runtime: "new_epoch", stop_runtime: "stopped", rebuild_monitoring: "new_epoch" })[type] || sourceState;
  }
  function runtimeState(runtime) { return runtime?.status || null; }
  function attemptValidation(attempt) {
    const errors = [];
    if (!text(attempt?.attemptId) || !positiveInteger(attempt?.ordinal)) errors.push(diagnostic("attempt_identity_invalid"));
    if (!ATTEMPT_STATUSES.includes(attempt?.status)) errors.push(diagnostic("attempt_status_invalid"));
    if (attempt?.startedAt !== null && !isTimestamp(attempt.startedAt)) errors.push(diagnostic("attempt_started_at_invalid"));
    if (attempt?.finishedAt !== null && !isTimestamp(attempt.finishedAt)) errors.push(diagnostic("attempt_finished_at_invalid"));
    if (!validFingerprint(attempt?.preconditionFingerprint) || !text(attempt?.adapterVersion) || !text(attempt?.idempotencyKey)) errors.push(diagnostic("attempt_execution_identity_invalid"));
    if (typeof attempt?.effectApplied !== "boolean" || typeof attempt?.runtimeActionExecuted !== "boolean") errors.push(diagnostic("attempt_effect_flags_invalid"));
    if (attempt.effectApplied && !attempt.runtimeActionExecuted) errors.push(diagnostic("effect_without_adapter_execution"));
    return errors;
  }
  function resultValidation(result) {
    const errors = [];
    if (!ACTION_TYPES.includes(result?.actionType) || !EXECUTION_MODES.includes(result?.executionMode)) errors.push(diagnostic("result_catalog_invalid"));
    if (typeof result?.changed !== "boolean" || typeof result?.noOp !== "boolean" || (!result?.blockedReason && result.changed === result.noOp) || (result.changed && result.noOp)) errors.push(diagnostic("result_change_flags_invalid"));
    if (!validFingerprint(result?.preconditionFingerprint) || !validFingerprint(result?.effectFingerprint)) errors.push(diagnostic("result_fingerprint_invalid"));
    if (!Array.isArray(result?.warnings) || !result?.evidence || !result?.affectedIdentity) errors.push(diagnostic("result_evidence_invalid"));
    return errors;
  }

  function markConflict(snapshot, errors, options, command) {
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1; next.updatedAt = now;
    const stale = errors.some((entry) => /fingerprint|revision|epoch|identity|project/.test(entry.code));
    transition(next, stale ? "stale" : "blocked");
    next.blockedReason = reason(stale ? "source_identity_stale" : "source_validation_blocked", { errors });
    if (next.currentAttempt) { next.currentAttempt.status = next.lifecycle; next.currentAttempt.finishedAt = now; }
    if (stale) disableExecutableIntent(next);
    appendAudit(next, stale ? "marked_stale" : "validation_blocked", now, { codes: errors.map((entry) => entry.code) });
    appendOperation(next, options.operationId, command, now);
    seal(next);
    return commandResult(command, true, next, { effects: {} });
  }
  function transition(snapshot, target) {
    const from = snapshot.lifecycle;
    if (!TRANSITIONS[from]?.includes(target)) throw actionError("invalid_lifecycle_transition", `Переход ${from || "unknown"} -> ${target} недопустим.`);
    snapshot.lifecycle = target;
  }
  function protectTerminal(snapshot) { if (TERMINAL_STATES.includes(snapshot.lifecycle)) throw actionError("terminal_action_protected", "Terminal action изменяется только через retry/rebuild."); }
  function checkConcurrency(snapshot, options) {
    if (!positiveInteger(options.expectedRevision) || options.expectedRevision !== snapshot.revision) throw actionError("action_revision_conflict", "Action snapshot изменён другой операцией.", { expectedRevision: options.expectedRevision, actualRevision: snapshot.revision });
    if (options.expectedFingerprint !== undefined && options.expectedFingerprint !== snapshot.fingerprint) throw actionError("action_fingerprint_conflict", "Action fingerprint изменён другой операцией.");
    if (options.expectedEpoch !== undefined && options.expectedEpoch !== snapshot.epoch) throw actionError("action_epoch_conflict", "Action epoch изменён другой операцией.");
  }
  function duplicateOperation(snapshot, command, options) {
    const operationId = requireOperationId(options.operationId);
    const existing = array(snapshot.operations).find((entry) => entry.operationId === operationId);
    if (!existing) {
      if (command === "execute" && text(options.idempotencyKey) && options.idempotencyKey === snapshot.currentAttempt?.idempotencyKey && snapshot.currentAttempt.runtimeActionExecuted) {
        return commandResult(command, false, copyFrozen(snapshot), { effects: {} });
      }
      return null;
    }
    if (existing.command !== command) throw actionError("operation_id_conflict", "operationId уже использован другой командой.");
    return commandResult(command, false, copyFrozen(snapshot), { effects: {} });
  }
  function appendOperation(snapshot, operationId, command, at) { snapshot.operations = [...array(snapshot.operations), { operationId: requireOperationId(operationId), command, revision: snapshot.revision, epoch: snapshot.epoch, at }].slice(-OPERATION_LIMIT); }
  function appendAudit(snapshot, event, at, details = {}) {
    const core = { event, revision: snapshot.revision, epoch: snapshot.epoch, details: normalizeIdentity(details) };
    snapshot.audit = [...array(snapshot.audit), { id: `action-audit:${fingerprint(core).slice(8)}`, ...core, at }].slice(-AUDIT_LIMIT);
  }
  function seal(snapshot) {
    snapshot.fingerprint = fingerprintPatternExecutionAction(snapshot);
    const report = validatePatternExecutionAction(snapshot);
    if (!report.valid) throw actionError("action_command_invalid_result", "Команда создала противоречивый action snapshot.", { errors: report.errors });
    return finish(snapshot);
  }
  function requireSnapshot(snapshot) { const report = validatePatternExecutionAction(snapshot); if (!report.valid) throw actionError("corrupted_action_snapshot", "Action snapshot повреждён.", { errors: report.errors }); }
  function commandResult(command, changed, action, extra = {}) { return finish({ ok: true, command, changed, action: copy(action), ...copy(extra) }); }
  function disableExecutableIntent(snapshot) { if (snapshot.executionPlan) snapshot.executionPlan.executable = false; }

  function normalizeSelectedAction(value) { return value ? { id: value.id, type: value.type, label: value.label, reason: value.reason, sourceObservationIds: stableStrings(value.sourceObservationIds), requiresConfirmation: Boolean(value.requiresConfirmation), expectedEffect: value.expectedEffect, targetIdentity: normalizeIdentity(value.targetIdentity), priority: value.priority, impact: value.impact } : null; }
  function normalizeAttempt(value) { return value ? { ...copy(value), evidence: normalizeEvidence(value.evidence), error: normalizeReason(value.error) } : null; }
  function normalizeVerification(value) { return value ? { ...copy(value), targetIdentity: normalizeIdentity(value.targetIdentity), evidence: normalizeEvidence(value.evidence) } : null; }
  function normalizeResult(value) { return value ? { ...copy(value), affectedIdentity: normalizeIdentity(value.affectedIdentity), evidence: normalizeEvidence(value.evidence), warnings: stableStrings(value.warnings), blockedReason: normalizeReason(value.blockedReason) } : null; }
  function normalizeReason(value) { return value ? { code: text(value.code) || "unspecified", message: text(value.message) || text(value.code) || "unspecified", details: normalizeIdentity(value.details || {}) } : null; }
  function normalizeEvidence(value) { return normalizeIdentity(value || {}); }
  function normalizeIdentity(value) {
    if (Array.isArray(value)) return value.map(normalizeIdentity).sort((left, right) => lexical(canonicalize(left), canonicalize(right)));
    if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(lexical)) next[key] = normalizeIdentity(value[key]); return next; }
    return value;
  }
  function stableAttempts(values) { return array(values).map(normalizeAttempt).sort((left, right) => (left.ordinal || 0) - (right.ordinal || 0) || lexical(left.attemptId, right.attemptId)); }
  function stableAuditForFingerprint(values) { return array(values).map((entry) => ({ id: entry.id, event: entry.event, revision: entry.revision, epoch: entry.epoch, at: entry.at, details: normalizeIdentity(entry.details) })); }
  function stableDiagnostics(values) { const unique = new Map(); for (const value of array(values)) unique.set(`${value.code}|${canonicalize(value.details || {})}`, copy(value)); return [...unique.values()].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details))); }
  function stableStrings(values) { return [...new Set(array(values).map(text).filter(Boolean))].sort(lexical); }
  function diagnostic(code, details = {}) { return { code, severity: "error", details: normalizeIdentity(details) }; }
  function reason(code, details = {}) { return { code, message: code, details: normalizeIdentity(details) }; }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") { for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); } return value; }
  function lifecycleOf(intervention) { return typeof intervention?.lifecycle === "string" ? intervention.lifecycle : intervention?.lifecycle?.state || null; }
  function requireOperationId(value) { const result = text(value); if (!result) throw actionError("operation_id_required", "Для mutation-команды требуется operationId."); return result; }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
  function timestampNow() { return DEFAULT_TIMESTAMP; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : null; }
  function text(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
  function lexical(left, right) { return String(left ?? "").localeCompare(String(right ?? "")); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function finish(value) { return deepFreeze(copy(value)); }
  function copyFrozen(value) { return finish(value); }
  function actionError(code, message, details = {}) { return new PatternExecutionActionError(code, message, details); }

  const api = {
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, ADAPTER_VERSION, AUDIT_LIMIT,
    ACTION_TYPES, EXECUTION_MODES, LIFECYCLE_STATES, TERMINAL_STATES,
    VERIFICATION_STATUSES, TRANSITIONS, ACTION_DEFINITIONS,
    PatternExecutionActionError, canonicalize, fingerprint,
    fingerprintPatternExecutionAction, buildPatternExecutionAction,
    validatePatternExecutionAction, preparePatternExecutionAction,
    executePatternExecutionAction, verifyPatternExecutionAction,
    recoverPatternExecutionAction, retryPatternExecutionAction,
    cancelPatternExecutionAction, rebuildPatternExecutionAction,
    executeClosedAdapter, serializePatternExecutionAction,
    deserializePatternExecutionAction, makeImportedPatternExecutionActionStale,
    remapPatternExecutionAction, remapSnapshotState, inspectAggregate,
    createForProject, executeForProject, readForProject, availableCommands,
    idempotencyKey,
  };
  globalObject.YarnAIPatternExecutionAction = Object.freeze(api);
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
