"use strict";

(function exposePatternExecutionRuntime(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const SOURCE_SCHEMA_VERSION = 1;
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const PROGRESS_KIND = "PATTERN_EXECUTION_RUNTIME";
  const RUNTIME_STATUSES = Object.freeze([
    "waiting", "ready", "running", "paused", "blocked", "recovering",
    "completed", "failed", "stopped", "stale",
  ]);
  const ACTION_STATUSES = Object.freeze([
    "pending", "ready", "running", "paused", "completed", "blocked", "failed", "skipped",
  ]);
  const TERMINAL_STATUSES = Object.freeze(["completed", "failed", "stopped", "stale"]);
  const AUDIT_LIMIT = 64;
  const OPERATION_LIMIT = 128;
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["ready", "recovering", "failed", "stopped", "stale"]),
    ready: Object.freeze(["running", "recovering", "failed", "stopped", "stale"]),
    running: Object.freeze(["paused", "blocked", "recovering", "completed", "failed", "stopped", "stale"]),
    paused: Object.freeze(["running", "recovering", "failed", "stopped", "stale"]),
    blocked: Object.freeze(["running", "recovering", "failed", "stopped", "stale"]),
    recovering: Object.freeze(["paused", "ready", "blocked", "failed"]),
    completed: Object.freeze([]), failed: Object.freeze([]), stopped: Object.freeze([]), stale: Object.freeze([]),
  });

  class PatternExecutionRuntimeError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionRuntimeError";
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
    if (typeof value === "number" && !Number.isFinite(value)) throw runtimeError("invalid_number", "Runtime содержит недопустимое число.");
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

  function actionFingerprint(action) {
    return fingerprint({
      id: action.id, ordinal: action.ordinal, sourceReference: action.sourceReference,
      title: action.title, payload: action.payload, prerequisiteIds: action.prerequisiteIds,
      required: action.required, allowSkip: action.allowSkip,
    });
  }

  function runtimeFingerprint(runtime) {
    return fingerprint({
      schemaVersion: runtime.schemaVersion, sourceSchemaVersion: runtime.sourceSchemaVersion,
      projectId: runtime.projectId, type: runtime.type, epoch: runtime.epoch,
      sourceResultId: runtime.sourceResultId, sourceResultRevision: runtime.sourceResultRevision,
      sourceResultFingerprint: runtime.sourceResultFingerprint,
      sourceExecutionId: runtime.sourceExecutionId, sourcePlanId: runtime.sourcePlanId,
      sourceIdentity: runtime.sourceIdentity,
      actions: array(runtime.actions).map((action) => ({
        id: action.id, ordinal: action.ordinal, sourceReference: action.sourceReference,
        title: action.title, payload: action.payload, prerequisiteIds: action.prerequisiteIds,
        required: action.required, allowSkip: action.allowSkip, fingerprint: action.fingerprint,
      })),
    });
  }

  function createRuntime(source, options = {}) {
    const normalized = normalizeSource(source, options.projectId);
    const sourceCheck = validateSourceCandidate(normalized);
    if (!sourceCheck.valid) throw runtimeError("invalid_source_result", "Stage 29 требует валидный ready snapshot Stage 28.", { errors: sourceCheck.errors });
    const result = normalized.result;
    const now = options.now || timestampNow();
    const epoch = positiveInteger(options.epoch) || 1;
    const actions = deriveActions(result).map((action) => deepFreeze(action));
    const sourceIdentity = buildSourceIdentity(result);
    const runtime = {
      id: text(options.id) || makeId(normalized, epoch), projectId: normalized.projectId, type: PROGRESS_KIND, kind: PROGRESS_KIND,
      schemaVersion: SCHEMA_VERSION, version: VERSION, sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      epoch, revision: positiveInteger(options.revision) || 1, status: "waiting",
      sourceResultId: result.id, sourceResultRevision: result.revision, sourceResultFingerprint: result.resultFingerprint,
      sourceExecutionId: result.resultSnapshot.sessionId || sourceIdentity.chain?.session?.id || null,
      sourcePlanId: result.resultSnapshot.planSummary?.planId || sourceIdentity.chain?.plan?.id || null,
      sourceIdentity, actions, cursor: 0, activeActionId: null,
      completedActionIds: [], failedActionIds: [], skippedActionIds: [], blockedActionIds: [],
      createdAt: now, startedAt: null, pausedAt: null, completedAt: null, failedAt: null, stoppedAt: null,
      updatedAt: now, lastError: null, staleReasons: [], recovery: null, audit: [], operations: [], runtimeFingerprint: null,
    };
    if (runtime.actions.length) runtime.actions[0] = withActionState(runtime.actions[0], "ready");
    appendAudit(runtime, "runtime_created", now, { epoch, sourceResultId: runtime.sourceResultId });
    runtime.runtimeFingerprint = runtimeFingerprint(runtime);
    const structural = validateRuntime(runtime, source);
    if (!structural.valid) throw runtimeError("runtime_creation_failed", "Не удалось создать непротиворечивый runtime.", { errors: structural.errors });
    return commandResult("create", true, finish(runtime));
  }

  function validate(runtime, source, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "validate", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    const report = validateRuntime(runtime, source);
    if (runtime.status === "ready" && report.valid) return commandResult("validate", false, copyFrozen(runtime), report);
    if (runtime.status !== "waiting") throwInvalidTransition(runtime.status, "ready");
    if (!report.valid) throw runtimeError("runtime_validation_failed", "Runtime или source identity не прошли проверку.", { errors: report.errors });
    return mutateCommand(runtime, "validate", options, (next, now) => {
      transition(next, "ready");
      appendAudit(next, "runtime_ready", now, { sourceIdentityFingerprint: next.sourceIdentity.sourceIdentityFingerprint });
    }, report);
  }

  function start(runtime, options = {}) {
    if (runtime?.status === "running") return idempotent(runtime, "start", options);
    return lifecycleCommand(runtime, "start", "running", ["ready"], options, (next, now) => {
      if (!next.startedAt) next.startedAt = now;
      appendAudit(next, "runtime_started", now);
    });
  }

  function pause(runtime, options = {}) {
    if (runtime?.status === "paused") return idempotent(runtime, "pause", options);
    return lifecycleCommand(runtime, "pause", "paused", ["running"], options, (next, now) => {
      const active = activeAction(next);
      if (active?.state === "running") replaceAction(next, withActionState(active, "paused"));
      next.pausedAt = now;
      appendAudit(next, "runtime_paused", now, { actionId: next.activeActionId });
    });
  }

  function resume(runtime, options = {}) {
    if (runtime?.status === "running") return idempotent(runtime, "resume", options);
    return lifecycleCommand(runtime, "resume", "running", ["paused"], options, (next, now) => {
      const active = activeAction(next);
      if (active?.state === "paused") replaceAction(next, withActionState(active, "running"));
      next.pausedAt = null;
      appendAudit(next, "runtime_resumed", now, { actionId: next.activeActionId });
    });
  }

  function beginCurrentAction(runtime, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "begin_current_action", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    if (runtime.status !== "running" || runtime.activeActionId) throw runtimeError("action_begin_not_allowed", "Текущее действие нельзя начать в этом состоянии.");
    const action = runtime.actions[runtime.cursor];
    if (!action || action.state !== "ready" || !prerequisitesComplete(runtime, action)) throw runtimeError("action_not_ready", "Prerequisites текущего действия не завершены.");
    return mutateCommand(runtime, "begin_current_action", options, (next, now) => {
      const current = next.actions[next.cursor];
      replaceAction(next, { ...copy(current), state: "running", attempt: current.attempt + 1, startedAt: now, completedAt: null, failedAt: null, blockedReason: null, error: null });
      next.activeActionId = current.id;
      appendAudit(next, "action_started", now, { actionId: current.id, attempt: current.attempt + 1 });
    });
  }

  function completeCurrentAction(runtime, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "complete_current_action", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    const current = activeAction(runtime);
    if (runtime.status !== "running" || !current || current.state !== "running") throw runtimeError("action_complete_not_allowed", "Нет выполняемого действия для завершения.");
    return mutateCommand(runtime, "complete_current_action", options, (next, now) => {
      const action = activeAction(next);
      const output = options.output === undefined
        ? { status: "completed", payloadFingerprint: fingerprint(action.payload) }
        : copy(options.output);
      replaceAction(next, { ...copy(action), state: "completed", completedAt: now, failedAt: null, error: null, blockedReason: null, outputSnapshot: output });
      next.activeActionId = null;
      advanceCursor(next);
      appendAudit(next, "action_completed", now, { actionId: action.id, outputFingerprint: fingerprint(output) });
      if (next.cursor === next.actions.length) {
        transition(next, "completed");
        next.completedAt = now;
        appendAudit(next, "runtime_completed", now);
      }
    });
  }

  function failCurrentAction(runtime, error, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "fail_current_action", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    const current = activeAction(runtime);
    if (runtime.status !== "running" || !current || current.state !== "running") throw runtimeError("action_fail_not_allowed", "Нет выполняемого действия для фиксации сбоя.");
    const normalized = normalizeError(error);
    return mutateCommand(runtime, "fail_current_action", options, (next, now) => {
      const action = activeAction(next);
      replaceAction(next, { ...copy(action), state: "failed", failedAt: now, error: normalized });
      next.activeActionId = null;
      transition(next, "failed");
      next.failedAt = now;
      next.lastError = normalized;
      appendAudit(next, "action_failed", now, { actionId: action.id, code: normalized.code });
      appendAudit(next, "runtime_failed", now, { code: normalized.code });
    });
  }

  function blockCurrentAction(runtime, reason, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "block_current_action", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    const current = activeAction(runtime);
    if (runtime.status !== "running" || !current || current.state !== "running") throw runtimeError("action_block_not_allowed", "Нет выполняемого действия для блокировки.");
    const blockedReason = normalizeReason(reason);
    return mutateCommand(runtime, "block_current_action", options, (next, now) => {
      const action = activeAction(next);
      replaceAction(next, { ...copy(action), state: "blocked", blockedReason });
      transition(next, "blocked");
      appendAudit(next, "action_blocked", now, { actionId: action.id, code: blockedReason.code });
    });
  }

  function unblockCurrentAction(runtime, options = {}) {
    if (runtime?.status === "running" && !runtime?.activeActionId) return idempotent(runtime, "unblock_current_action", options);
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "unblock_current_action", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    const current = activeAction(runtime);
    if (runtime.status !== "blocked" || !current || current.state !== "blocked") throw runtimeError("action_unblock_not_allowed", "Нет заблокированного текущего действия.");
    return mutateCommand(runtime, "unblock_current_action", options, (next, now) => {
      const action = activeAction(next);
      replaceAction(next, { ...copy(action), state: "ready", blockedReason: null });
      next.activeActionId = null;
      transition(next, "running");
      appendAudit(next, "action_unblocked", now, { actionId: action.id });
    });
  }

  function skipCurrentAction(runtime, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "skip_current_action", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    if (runtime.status !== "running" || runtime.activeActionId) throw runtimeError("action_skip_not_allowed", "Skip доступен только для ready действия без активного исполнения.");
    const current = runtime.actions[runtime.cursor];
    if (!current || current.state !== "ready" || !current.allowSkip) throw runtimeError("action_skip_rule_denied", "Источник не разрешает пропуск этого действия.");
    return mutateCommand(runtime, "skip_current_action", options, (next, now) => {
      const action = next.actions[next.cursor];
      replaceAction(next, { ...copy(action), state: "skipped", completedAt: now, outputSnapshot: { status: "skipped", rule: "source_optional" } });
      advanceCursor(next);
      appendAudit(next, "action_skipped", now, { actionId: action.id, rule: "source_optional" });
      if (next.cursor === next.actions.length) {
        transition(next, "completed"); next.completedAt = now; appendAudit(next, "runtime_completed", now);
      }
    });
  }

  function fail(runtime, error, options = {}) {
    if (runtime?.status === "failed") return idempotent(runtime, "fail", options);
    requireRuntime(runtime);
    const normalized = normalizeError(error);
    return lifecycleCommand(runtime, "fail", "failed", nonterminalStatuses(), options, (next, now) => {
      const action = activeAction(next);
      if (action?.state === "running") replaceAction(next, { ...copy(action), state: "failed", failedAt: now, error: normalized });
      next.activeActionId = null; next.failedAt = now; next.lastError = normalized;
      appendAudit(next, "runtime_failed", now, { code: normalized.code });
    });
  }

  function stop(runtime, options = {}) {
    if (runtime?.status === "stopped") return idempotent(runtime, "stop", options);
    return lifecycleCommand(runtime, "stop", "stopped", nonterminalStatuses(), options, (next, now) => {
      const action = activeAction(next);
      if (action && ["running", "paused", "blocked"].includes(action.state)) replaceAction(next, { ...copy(action), state: "paused" });
      next.activeActionId = null; next.stoppedAt = now;
      appendAudit(next, "runtime_stopped", now);
    });
  }

  function markStale(runtime, reasons, options = {}) {
    if (runtime?.status === "stale") return idempotent(runtime, "mark_stale", options);
    const normalized = stableReasons(reasons);
    if (!normalized.length) throw runtimeError("stale_reason_required", "Для stale требуется явная причина.");
    return lifecycleCommand(runtime, "mark_stale", "stale", nonterminalStatuses(), options, (next, now) => {
      const action = activeAction(next);
      if (action && ["running", "paused", "blocked"].includes(action.state)) replaceAction(next, { ...copy(action), state: "paused" });
      next.activeActionId = null; next.staleReasons = normalized;
      appendAudit(next, "runtime_stale", now, { reasonCodes: normalized.map((entry) => entry.code) });
    });
  }

  function recover(runtime, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "recover", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    if (TERMINAL_STATUSES.includes(runtime.status)) throw runtimeError("terminal_runtime_protected", "Терминальный runtime можно запустить только через rebuild.");
    if (runtime.status !== "recovering") {
      return mutateCommand(runtime, "recover", options, (next, now) => {
        const from = next.status;
        transition(next, "recovering");
        next.recovery = { fromStatus: from, requestedAt: now, activeActionId: next.activeActionId };
        appendAudit(next, "recovery_started", now, { fromStatus: from, activeActionId: next.activeActionId });
      });
    }
    return mutateCommand(runtime, "recover", options, (next, now) => {
      const action = activeAction(next);
      let target = "ready";
      if (action?.state === "running") {
        replaceAction(next, withActionState(action, "paused"));
        target = "paused";
      } else if (action?.state === "paused") target = "paused";
      else if (action?.state === "blocked") target = "blocked";
      else if (action?.state === "failed" || next.failedActionIds.length) target = "failed";
      else next.activeActionId = null;
      transition(next, target);
      if (target === "failed") {
        next.activeActionId = null;
        next.failedAt = next.failedAt || now;
        next.lastError = next.lastError || { code: "recovery_failed", message: "Recovery обнаружил failed action." };
      }
      next.pausedAt = target === "paused" ? now : next.pausedAt;
      appendAudit(next, "recovery_completed", now, { targetStatus: target, activeActionId: next.activeActionId });
      next.recovery = null;
    });
  }

  function rebuild(runtime, source, options = {}) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, "rebuild", options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    if (!TERMINAL_STATUSES.includes(runtime.status)) throw runtimeError("rebuild_not_allowed", "Rebuild доступен только из терминального состояния.");
    const built = createRuntime(source, {
      projectId: runtime.projectId, id: runtime.id, epoch: runtime.epoch + 1,
      revision: runtime.revision + 1, now: options.now || timestampNow(),
    }).runtime;
    const next = mutable(built);
    next.createdAt = runtime.createdAt;
    next.audit = [...array(runtime.audit), { event: "runtime_rebuilt", at: next.updatedAt, revision: next.revision, fromEpoch: runtime.epoch, epoch: next.epoch }].slice(-AUDIT_LIMIT);
    next.operations = [...array(runtime.operations), operationEntry(options.operationId, "rebuild", next.revision, next.updatedAt)].slice(-OPERATION_LIMIT);
    next.runtimeFingerprint = runtimeFingerprint(next);
    return commandResult("rebuild", true, finish(next));
  }

  function validateRuntime(runtime, source) {
    const structural = structuralValidation(runtime);
    const semantic = structural.length ? [] : semanticValidation(runtime);
    const sourceErrors = source === undefined || structural.length ? [] : sourceIdentityValidation(runtime, source);
    const errors = [...structural, ...semantic, ...sourceErrors];
    return deepFreeze({
      valid: errors.length === 0, structural, semantic, source: sourceErrors, errors,
      availableCommands: availableCommands(runtime, errors),
    });
  }

  function structuralValidation(runtime) {
    const errors = []; const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) return [diagnostic("runtime_not_object")];
    if (!text(runtime.id)) invalid("missing_id");
    if (!text(runtime.projectId)) invalid("missing_project_id");
    if (runtime.type !== PROGRESS_KIND || runtime.kind !== PROGRESS_KIND) invalid("invalid_runtime_type");
    if (runtime.schemaVersion !== SCHEMA_VERSION || runtime.version !== VERSION || runtime.sourceSchemaVersion !== SOURCE_SCHEMA_VERSION) invalid("unsupported_schema");
    if (!positiveInteger(runtime.epoch) || !positiveInteger(runtime.revision)) invalid("invalid_revision");
    if (!RUNTIME_STATUSES.includes(runtime.status)) invalid("invalid_runtime_status");
    for (const field of ["sourceResultId", "sourceResultFingerprint", "sourceExecutionId", "sourcePlanId", "runtimeFingerprint"]) if (!text(runtime[field])) invalid(`missing_${field}`);
    if (!positiveInteger(runtime.sourceResultRevision)) invalid("invalid_source_result_revision");
    if (!runtime.sourceIdentity || typeof runtime.sourceIdentity !== "object") invalid("missing_source_identity");
    else {
      const sourceIdentityPayload = copy(runtime.sourceIdentity);
      delete sourceIdentityPayload.sourceIdentityFingerprint;
      if (runtime.sourceIdentity.sourceIdentityFingerprint !== fingerprint(sourceIdentityPayload)) invalid("source_identity_fingerprint_mismatch");
    }
    if (!Array.isArray(runtime.actions) || runtime.actions.length === 0) invalid("runtime_actions_empty");
    if (!Number.isInteger(runtime.cursor) || runtime.cursor < 0 || runtime.cursor > array(runtime.actions).length) invalid("invalid_cursor");
    for (const field of ["completedActionIds", "failedActionIds", "skippedActionIds", "blockedActionIds", "audit", "operations", "staleReasons"]) if (!Array.isArray(runtime[field])) invalid(`invalid_${field}`);
    if (array(runtime.audit).length > AUDIT_LIMIT) invalid("audit_limit_exceeded");
    if (array(runtime.operations).length > OPERATION_LIMIT) invalid("operation_limit_exceeded");
    for (const field of ["createdAt", "updatedAt"]) if (!isTimestamp(runtime[field])) invalid(`invalid_${field}`);
    for (const field of ["startedAt", "pausedAt", "completedAt", "failedAt", "stoppedAt"]) if (runtime[field] !== null && !isTimestamp(runtime[field])) invalid(`invalid_${field}`);
    const ids = new Set();
    array(runtime.actions).forEach((action, index) => {
      if (!text(action?.id) || ids.has(action.id)) invalid("duplicate_action_id", { actionId: action?.id || null });
      ids.add(action?.id);
      if (action?.ordinal !== index + 1 || !ACTION_STATUSES.includes(action?.state)) invalid("invalid_action_shape", { actionId: action?.id || null });
      if (!text(action?.title) || !Array.isArray(action?.prerequisiteIds) || !Number.isInteger(action?.attempt) || action.attempt < 0) invalid("invalid_action_shape", { actionId: action?.id || null });
      if (!action?.sourceReference || !Object.hasOwn(action, "payload") || typeof action.required !== "boolean" || typeof action.allowSkip !== "boolean") invalid("invalid_action_shape", { actionId: action?.id || null });
      for (const field of ["startedAt", "completedAt", "failedAt"]) if (action?.[field] !== null && !isTimestamp(action?.[field])) invalid("invalid_action_timestamp", { actionId: action?.id || null, field });
      if (action?.fingerprint !== actionFingerprint(action)) invalid("action_fingerprint_mismatch", { actionId: action?.id || null });
    });
    if (runtime.runtimeFingerprint !== runtimeFingerprint(runtime)) invalid("runtime_fingerprint_mismatch");
    return stableDiagnostics(errors);
  }

  function semanticValidation(runtime) {
    const errors = []; const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    const ids = new Set(runtime.actions.map((action) => action.id));
    const visiting = new Set(); const visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) { invalid("prerequisite_cycle", { actionId: id }); return; }
      if (visited.has(id)) return;
      visiting.add(id);
      const action = runtime.actions.find((entry) => entry.id === id);
      for (const prerequisite of action?.prerequisiteIds || []) {
        if (!ids.has(prerequisite)) invalid("unknown_prerequisite", { actionId: id, prerequisiteId: prerequisite });
        else visit(prerequisite);
      }
      visiting.delete(id); visited.add(id);
    };
    runtime.actions.forEach((action) => visit(action.id));
    const projection = stateProjection(runtime.actions);
    for (const [field, actual] of Object.entries(projection)) if (!sameStringSet(runtime[field], actual)) invalid("state_projection_mismatch", { field });
    const unresolved = runtime.actions.findIndex((action) => !["completed", "skipped"].includes(action.state));
    const expectedCursor = unresolved < 0 ? runtime.actions.length : unresolved;
    if (runtime.cursor !== expectedCursor) invalid("cursor_state_mismatch", { expectedCursor, actualCursor: runtime.cursor });
    const active = activeAction(runtime);
    if (runtime.activeActionId && !active) invalid("active_action_missing");
    if (active && !["running", "paused", "blocked"].includes(active.state)) invalid("active_action_state_mismatch");
    if (active?.state === "completed") invalid("completed_action_active");
    runtime.actions.forEach((action) => {
      if (action.state === "ready" && !prerequisitesComplete(runtime, action)) invalid("ready_before_prerequisites", { actionId: action.id });
      if (action.state === "skipped" && !action.allowSkip) invalid("unauthorized_skip", { actionId: action.id });
    });
    if (TERMINAL_STATUSES.includes(runtime.status) && runtime.actions.some((action) => action.state === "running")) invalid("terminal_has_running_action");
    if (runtime.status === "completed" && runtime.actions.some((action) => action.required && action.state !== "completed")) invalid("completed_runtime_has_incomplete_required_action");
    if (runtime.status === "completed" && (runtime.cursor !== runtime.actions.length || runtime.activeActionId)) invalid("completed_runtime_cursor_invalid");
    if (runtime.status === "running" && active && active.state !== "running") invalid("running_runtime_active_state_invalid");
    if (runtime.status === "paused" && active && active.state !== "paused") invalid("paused_runtime_active_state_invalid");
    if (runtime.status === "blocked" && active?.state !== "blocked") invalid("blocked_runtime_active_state_invalid");
    if (runtime.status === "failed" && !runtime.lastError) invalid("failed_runtime_missing_error");
    if (runtime.status === "stale" && !runtime.staleReasons.length) invalid("stale_runtime_missing_reason");
    return stableDiagnostics(errors);
  }

  function sourceIdentityValidation(runtime, source) {
    const normalized = normalizeSource(source, runtime.projectId);
    const candidate = validateSourceCandidate(normalized);
    if (!candidate.valid) return candidate.errors;
    const result = normalized.result; const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    if (normalized.projectId !== runtime.projectId) invalid("project_identity_mismatch");
    if (result.id !== runtime.sourceResultId) invalid("source_result_id_mismatch");
    if (result.revision !== runtime.sourceResultRevision) invalid("source_result_revision_mismatch");
    if (result.resultFingerprint !== runtime.sourceResultFingerprint) invalid("source_result_fingerprint_mismatch");
    const actualIdentity = buildSourceIdentity(result);
    if (canonicalize(actualIdentity) !== canonicalize(runtime.sourceIdentity)) invalid("source_chain_identity_mismatch");
    const resultApi = globalObject.YarnAIPatternExecutionResult;
    if (resultApi?.detectStaleness && normalized.aggregate) {
      const staleness = resultApi.detectStaleness(result, normalized.aggregate);
      if (staleness.stale) for (const reason of staleness.reasons) invalid(reason.code || "source_chain_stale", reason.details || {});
    } else if (normalized.aggregate) {
      verifyChainRecords(actualIdentity.chain, normalized.aggregate, invalid);
    } else invalid("source_identity_unproven");
    return stableDiagnostics(errors);
  }

  function validateSourceCandidate(normalized) {
    const errors = []; const invalid = (code, details = {}) => errors.push(diagnostic(code, details));
    const result = normalized.result;
    if (!normalized.projectId || !result) invalid("stage_28_missing");
    if (result && (result.kind !== "PATTERN_EXECUTION_RESULT" || result.status !== "ready")) invalid("stage_28_not_ready", { status: result?.status || null });
    if (result && (!result.resultSnapshot || result.resultSnapshot.projectId !== normalized.projectId)) invalid("stage_28_snapshot_missing");
    if (result && (!text(result.id) || !positiveInteger(result.revision) || !text(result.resultFingerprint) || result.resultSnapshot?.fingerprint !== result.resultFingerprint)) invalid("stage_28_identity_invalid");
    const resultApi = globalObject.YarnAIPatternExecutionResult;
    if (result && resultApi?.validateResultState) for (const error of resultApi.validateResultState(result)) invalid(error.code || "stage_28_invalid", error.details || {});
    return { valid: errors.length === 0, errors: stableDiagnostics(errors) };
  }

  function inspectAggregate(aggregate) {
    const normalized = normalizeSource(aggregate);
    const resultInspection = globalObject.YarnAIPatternExecutionResult?.inspectAggregate?.(aggregate) || null;
    const records = array(aggregate?.progress).filter((entry) => entry.kind === PROGRESS_KIND && (!normalized.calculationId || entry.calculation_id === normalized.calculationId));
    const runtimeRecord = newestRecord(records);
    const rawRuntime = runtimeRecord?.state || null;
    let validation = rawRuntime ? validateRuntime(rawRuntime, aggregate) : null;
    const corrupt = Boolean(rawRuntime && validation.structural.length + validation.semantic.length);
    const staleness = rawRuntime && !corrupt
      ? { stale: validation.source.length > 0, reasons: validation.source }
      : { stale: false, reasons: [] };
    return deepFreeze({
      project: aggregate?.project || null, calculation: normalized.calculation || null,
      resultRecord: normalized.resultRecord, result: normalized.result,
      runtimeRecord, rawRuntime, runtime: corrupt ? null : rawRuntime,
      validation, corrupt, staleness,
      availableCommands: rawRuntime && !corrupt
        ? staleness.stale
          ? TERMINAL_STATUSES.includes(rawRuntime.status) ? ["rebuild"] : ["mark_stale", "stop"]
          : availableCommands(rawRuntime)
        : !rawRuntime && normalized.result?.status === "ready" && (!resultInspection || !resultInspection.corrupt && !resultInspection.staleness?.stale)
          ? ["create"]
          : [],
    });
  }

  async function createForProject(repository, projectId, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const normalized = normalizeSource(aggregate, projectId);
    if (!normalized.calculationId) throw runtimeError("missing_calculation", "У проекта нет активного расчёта.");
    const existing = await repository.getPatternExecutionRuntime(projectId, normalized.calculationId);
    if (existing) return inspectAggregate(aggregate);
    const runtime = createRuntime(aggregate, options).runtime;
    await repository.ensurePatternExecutionRuntime(projectId, normalized.calculationId, runtime, { operationKind: "PATTERN_EXECUTION_RUNTIME_CREATED", projectStage: "pattern_execution_runtime_waiting" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function executeForProject(repository, projectId, command, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const inspected = inspectAggregate(aggregate);
    if (!inspected.rawRuntime || inspected.corrupt) throw runtimeError("runtime_unavailable", "Runtime отсутствует или повреждён.");
    const functions = {
      validate: (state) => validate(state, aggregate, options), start: (state) => start(state, options), pause: (state) => pause(state, options), resume: (state) => resume(state, options),
      begin_current_action: (state) => beginCurrentAction(state, options), complete_current_action: (state) => completeCurrentAction(state, options),
      fail_current_action: (state) => failCurrentAction(state, options.error, options), block_current_action: (state) => blockCurrentAction(state, options.reason, options),
      unblock_current_action: (state) => unblockCurrentAction(state, options), skip_current_action: (state) => skipCurrentAction(state, options),
      stop: (state) => stop(state, options), fail: (state) => fail(state, options.error, options), recover: (state) => recover(state, options),
      mark_stale: (state) => markStale(state, options.reasons || inspected.staleness.reasons, options), rebuild: (state) => rebuild(state, aggregate, options),
    };
    if (!functions[command]) throw runtimeError("unknown_runtime_command", "Команда runtime не поддерживается.");
    const result = functions[command](inspected.rawRuntime);
    if (result.changed) {
      await repository.updatePatternExecutionRuntime(projectId, inspected.calculation.calculation_id, result.runtime, {
        expectedRevision: inspected.rawRuntime.revision,
        operationKind: `PATTERN_EXECUTION_RUNTIME_${command.toUpperCase()}`,
        projectStage: `pattern_execution_runtime_${result.runtime.status}`,
      });
    }
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function readForProject(repository, projectId) { return inspectAggregate(await repository.getProject(projectId)); }

  function normalizeSource(source, projectId) {
    const aggregate = Array.isArray(source?.progress) ? source : null;
    const project = aggregate?.project || source?.project || null;
    const effectiveProjectId = projectId || project?.project_id || project?.projectId || source?.projectId || source?.result?.projectId || source?.projectId || null;
    const calculation = aggregate ? array(aggregate.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null : source?.calculation || null;
    const calculationId = calculation?.calculation_id || source?.calculationId || project?.active_calculation_id || null;
    const records = aggregate ? aggregate.progress.filter((entry) => !calculationId || entry.calculation_id === calculationId) : array(source?.records);
    const resultRecord = source?.resultRecord || newestRecord(records.filter((entry) => entry.kind === "PATTERN_EXECUTION_RESULT"));
    const result = source?.kind === "PATTERN_EXECUTION_RESULT" ? source : source?.result || resultRecord?.state || null;
    return { aggregate, project, projectId: effectiveProjectId || result?.projectId || null, calculation, calculationId, records, resultRecord, result };
  }

  function buildSourceIdentity(result) {
    const chain = copy(result.expectedSourceIdentity || result.resultSnapshot?.sourceIdentity || null);
    const base = {
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      result: { id: result.id, revision: result.revision, fingerprint: result.resultFingerprint, resultRevision: result.resultRevision, status: result.status },
      chain,
    };
    return { ...base, sourceIdentityFingerprint: fingerprint(base) };
  }

  function deriveActions(result) {
    const snapshot = result.resultSnapshot;
    const completedActions = array(snapshot.completedActions).slice().sort((left, right) => numeric(left.order) - numeric(right.order) || lexical(text(left.actionId), text(right.actionId)));
    let previous = null;
    return completedActions.map((sourceAction, index) => {
      const sourceActionId = text(sourceAction.actionId) || `source-action-${index + 1}`;
      const sourceSteps = array(snapshot.completedSteps).filter((entry) => entry.actionId === sourceActionId).map((entry) => entry.stepId).filter(Boolean).sort(lexical);
      const sourceCheckpoints = array(snapshot.confirmedCheckpoints).filter((entry) => entry.actionId === sourceActionId).map((entry) => entry.checkpointRecordId || entry.checkpointId).filter(Boolean).sort(lexical);
      const id = `runtime-action:${fingerprint({ sourceActionId, ordinal: index + 1 }).slice(8)}`;
      const action = {
        id, ordinal: index + 1,
        sourceReference: { resultId: result.id, resultRevision: result.revision, sourceActionId, phaseId: sourceAction.phaseId || null, stepIds: sourceSteps, checkpointIds: sourceCheckpoints },
        title: text(sourceAction.title) || `Действие ${index + 1}`,
        payload: { sourceAction: copy(sourceAction), resultReference: { id: result.id, fingerprint: result.resultFingerprint } },
        prerequisiteIds: previous ? [previous] : [], required: sourceAction.required !== false, allowSkip: sourceAction.required === false,
        state: "pending", attempt: 0, startedAt: null, completedAt: null, failedAt: null,
        blockedReason: null, error: null, outputSnapshot: null, fingerprint: null,
      };
      action.fingerprint = actionFingerprint(action); previous = id; return action;
    });
  }

  function verifyChainRecords(chain, aggregate, invalid) {
    if (!chain) { invalid("source_identity_unproven"); return; }
    const records = array(aggregate.progress); const calculations = array(aggregate.calculations);
    const check = (kind, identity, fingerprintField) => {
      if (!identity?.id) { invalid("source_identity_unproven", { kind }); return; }
      const state = records.find((entry) => entry.kind === kind && entry.state?.id === identity.id)?.state;
      if (!state || state.revision !== identity.revision || state[fingerprintField] !== identity.fingerprint) invalid("source_chain_identity_mismatch", { kind, id: identity.id });
    };
    const calculation = calculations.find((entry) => entry.calculation_id === chain.calculation?.id);
    if (!calculation || (chain.calculation?.revision !== null && calculation.revision !== chain.calculation.revision)) invalid("source_chain_identity_mismatch", { kind: "calculation" });
    check("PATTERN_EXECUTION_PLAN", chain.plan, "planFingerprint");
    check("PATTERN_EXECUTION_SESSION", chain.session, "sessionFingerprint");
    check("PATTERN_EXECUTION_PROGRESS", chain.progress, "progressFingerprint");
    check("PATTERN_EXECUTION_COMPLETION", chain.completion, "completionFingerprint");
    for (const identity of array(chain.steps)) check("PATTERN_EXECUTION_STEP", identity, "stepFingerprint");
    for (const identity of array(chain.checkpoints)) check("PATTERN_EXECUTION_CHECKPOINT", identity, "checkpointFingerprint");
  }

  function availableCommands(runtime, errors = []) {
    if (!runtime || errors.some((entry) => !String(entry.code).includes("source") && !String(entry.code).includes("stage_28"))) return [];
    if (TERMINAL_STATUSES.includes(runtime.status)) return ["rebuild"];
    const commands = [];
    if (runtime.status === "waiting") commands.push("validate");
    if (runtime.status === "ready") commands.push("start");
    if (runtime.status === "running") {
      if (runtime.activeActionId) commands.push("complete_current_action", "block_current_action", "fail_current_action");
      else if (runtime.cursor < runtime.actions.length) {
        commands.push("begin_current_action");
        if (runtime.actions[runtime.cursor]?.allowSkip) commands.push("skip_current_action");
      }
      commands.push("pause");
    }
    if (runtime.status === "paused") commands.push("resume");
    if (runtime.status === "blocked") commands.push("unblock_current_action");
    commands.push("recover", "fail", "stop", "mark_stale");
    return [...new Set(commands)];
  }

  function lifecycleCommand(runtime, command, target, allowed, options, callback) {
    requireRuntime(runtime);
    const duplicate = duplicateOperation(runtime, command, options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    if (!allowed.includes(runtime.status)) throwInvalidTransition(runtime.status, target);
    return mutateCommand(runtime, command, options, (next, now) => { transition(next, target); callback(next, now); });
  }

  function mutateCommand(runtime, command, options, callback, validation = undefined) {
    requireOperationId(options.operationId);
    const next = mutable(runtime); const now = options.now || timestampNow();
    next.revision += 1; next.updatedAt = now;
    callback(next, now);
    refreshProjections(next);
    next.operations = [...array(next.operations), operationEntry(options.operationId, command, next.revision, now)].slice(-OPERATION_LIMIT);
    next.runtimeFingerprint = runtimeFingerprint(next);
    const report = validateRuntime(next);
    if (!report.valid) throw runtimeError("runtime_command_invalid_result", "Команда создала противоречивое состояние.", { command, errors: report.errors });
    return commandResult(command, true, finish(next), validation || report);
  }

  function transition(runtime, target) {
    if (!TRANSITIONS[runtime.status]?.includes(target)) throwInvalidTransition(runtime.status, target);
    runtime.status = target;
  }

  function advanceCursor(runtime) {
    while (runtime.cursor < runtime.actions.length && ["completed", "skipped"].includes(runtime.actions[runtime.cursor].state)) runtime.cursor += 1;
    if (runtime.cursor < runtime.actions.length) {
      const action = runtime.actions[runtime.cursor];
      if (action.state === "pending" && prerequisitesComplete(runtime, action)) replaceAction(runtime, withActionState(action, "ready"));
    }
    refreshProjections(runtime);
  }

  function refreshProjections(runtime) { Object.assign(runtime, stateProjection(runtime.actions)); }
  function stateProjection(actions) {
    const by = (state) => actions.filter((entry) => entry.state === state).map((entry) => entry.id);
    return { completedActionIds: by("completed"), failedActionIds: by("failed"), skippedActionIds: by("skipped"), blockedActionIds: by("blocked") };
  }
  function prerequisitesComplete(runtime, action) { return action.prerequisiteIds.every((id) => { const prerequisite = runtime.actions.find((entry) => entry.id === id); return prerequisite && ["completed", "skipped"].includes(prerequisite.state); }); }
  function replaceAction(runtime, action) { runtime.actions = runtime.actions.map((entry) => entry.id === action.id ? action : entry); }
  function activeAction(runtime) { return runtime.activeActionId ? runtime.actions.find((entry) => entry.id === runtime.activeActionId) || null : null; }
  function withActionState(action, state) { return { ...copy(action), state }; }

  function requireRuntime(runtime) {
    const report = validateRuntime(runtime);
    if (!report.valid) throw runtimeError("corrupted_runtime_snapshot", "Runtime snapshot повреждён.", { errors: report.errors });
  }
  function checkRevision(runtime, expectedRevision) { if (!positiveInteger(expectedRevision) || expectedRevision !== runtime.revision) throw runtimeError("runtime_revision_conflict", "Runtime изменён другой операцией.", { expectedRevision, actualRevision: runtime.revision }); }
  function duplicateOperation(runtime, command, options) {
    const operationId = requireOperationId(options.operationId);
    const existing = array(runtime.operations).find((entry) => entry.operationId === operationId);
    if (!existing) return null;
    if (existing.command !== command) throw runtimeError("operation_id_conflict", "operationId уже использован другой командой.");
    return commandResult(command, false, copyFrozen(runtime), validateRuntime(runtime));
  }
  function idempotent(runtime, command, options) {
    requireRuntime(runtime); const duplicate = duplicateOperation(runtime, command, options);
    if (duplicate) return duplicate;
    checkRevision(runtime, options.expectedRevision);
    return commandResult(command, false, copyFrozen(runtime), validateRuntime(runtime));
  }
  function commandResult(command, changed, runtime, validation = undefined) { return deepFreeze({ ok: true, command, changed, runtime, validation: validation || validateRuntime(runtime) }); }
  function operationEntry(operationId, command, revision, at) { return { operationId: requireOperationId(operationId), command, revision, at }; }
  function requireOperationId(value) { const result = text(value); if (!result) throw runtimeError("operation_id_required", "Для команды требуется operationId."); return result; }
  function throwInvalidTransition(from, to) { throw runtimeError("invalid_status_transition", `Переход ${from || "unknown"} → ${to} недопустим.`); }
  function nonterminalStatuses() { return RUNTIME_STATUSES.filter((status) => !TERMINAL_STATUSES.includes(status)); }

  function appendAudit(runtime, event, at, details = {}) { runtime.audit = [...array(runtime.audit), { event, at, revision: runtime.revision, ...copy(details) }].slice(-AUDIT_LIMIT); }
  function normalizeError(value) { return { code: text(value?.code) || "runtime_failed", message: text(value?.message) || text(value) || "Runtime завершён контролируемой ошибкой.", details: copy(value?.details || {}) }; }
  function normalizeReason(value) { return { code: text(value?.code) || "action_blocked", message: text(value?.message) || text(value) || "Действие заблокировано.", details: copy(value?.details || {}) }; }
  function stableReasons(values) { return uniqueSemantic(array(values).map((value) => normalizeReason(value))).sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details))); }
  function diagnostic(code, details = {}) { return { code, severity: "error", details: copy(details) }; }
  function stableDiagnostics(values) { return uniqueSemantic(values).sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details))); }
  function uniqueSemantic(values) { const result = new Map(); for (const value of values) result.set(canonicalize(value), value); return [...result.values()]; }
  function sameStringSet(left, right) { return canonicalize(array(left).slice().sort(lexical)) === canonicalize(array(right).slice().sort(lexical)); }
  function newestRecord(records) { return array(records).slice().sort((left, right) => numeric(left.epoch) - numeric(right.epoch) || numeric(left.state?.revision) - numeric(right.state?.revision) || lexical(text(left.progress_id), text(right.progress_id))).at(-1) || null; }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function integer(value) { const number = Number(value); return Number.isInteger(number) ? number : null; }
  function positiveInteger(value) { const number = integer(value); return number !== null && number > 0 ? number : null; }
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
  function makeId(source, epoch) { return `runtime:${fingerprint({ projectId: source.projectId, resultId: source.result?.id, resultFingerprint: source.result?.resultFingerprint, epoch }).slice(8)}`; }
  function runtimeError(code, message, details = {}) { return new PatternExecutionRuntimeError(code, message, details); }

  const api = {
    VERSION, SCHEMA_VERSION, SOURCE_SCHEMA_VERSION, PROGRESS_KIND, RUNTIME_STATUSES, ACTION_STATUSES, TERMINAL_STATUSES,
    AUDIT_LIMIT, OPERATION_LIMIT, TRANSITIONS, PatternExecutionRuntimeError,
    canonicalize, fingerprint, actionFingerprint, calculateRuntimeFingerprint: runtimeFingerprint,
    createRuntime, validateRuntime, validate, start, pause, resume, beginCurrentAction, completeCurrentAction,
    failCurrentAction, blockCurrentAction, unblockCurrentAction, skipCurrentAction, fail, stop, recover, markStale, rebuild,
    sourceIdentityValidation, availableCommands, inspectAggregate, createForProject, executeForProject, readForProject,
  };
  globalObject.YarnAIPatternExecutionRuntime = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
