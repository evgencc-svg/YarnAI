"use strict";

(function exposePatternExecutionMonitoring(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const SOURCE_SCHEMA_VERSION = 1;
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const PROGRESS_KIND = "PATTERN_EXECUTION_MONITORING";
  const LIFECYCLE_STATES = Object.freeze([
    "waiting", "observing", "healthy", "attention_required", "blocked",
    "completed", "failed", "stale",
  ]);
  const ACTIVITY_STATES = Object.freeze([
    "running", "paused", "recovering", "blocked", "waiting", "completed",
    "failed", "stopped", "stale", "none",
  ]);
  const RECOMMENDED_ACTIONS = Object.freeze([
    "open_runtime", "resume_runtime", "review_paused_action", "resolve_blocker",
    "retry_recovery", "rebuild_runtime", "review_result", "inspect_failure",
    "no_action_required",
  ]);
  const TIMELINE_LIMIT = 32;
  const AUDIT_LIMIT = 24;
  const OPERATION_LIMIT = 64;
  const TERMINAL_LIFECYCLES = Object.freeze(["completed", "failed", "stale"]);
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["observing"]),
    observing: Object.freeze(["healthy", "attention_required", "blocked", "completed", "failed", "stale"]),
    healthy: Object.freeze(["observing"]),
    attention_required: Object.freeze(["observing"]),
    blocked: Object.freeze(["observing"]),
    completed: Object.freeze([]),
    failed: Object.freeze([]),
    stale: Object.freeze([]),
  });

  class PatternExecutionMonitoringError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionMonitoringError";
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
    if (typeof value === "number" && !Number.isFinite(value)) throw monitoringError("invalid_number", "Monitoring snapshot содержит недопустимое число.");
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

  function sourceIdentityFingerprint(identity) {
    const payload = copy(identity);
    delete payload.sourceIdentityFingerprint;
    return fingerprint(payload);
  }

  function recommendedActionFingerprint(action) {
    const payload = copy(action);
    delete payload.fingerprint;
    return fingerprint(payload);
  }

  function timelineEntryFingerprint(entry) {
    return fingerprint({
      eventType: entry.eventType,
      runtimeRevision: entry.runtimeRevision,
      actionId: entry.actionId,
      stepId: entry.stepId,
      checkpointId: entry.checkpointId,
      status: entry.status,
      timestamp: entry.timestamp,
      reason: entry.reason,
    });
  }

  function monitoringFingerprint(snapshot) {
    return fingerprint({
      schemaVersion: snapshot.schemaVersion,
      sourceSchemaVersion: snapshot.sourceSchemaVersion,
      id: snapshot.id,
      projectId: snapshot.projectId,
      type: snapshot.type,
      revision: snapshot.revision,
      epoch: snapshot.epoch,
      lifecycle: snapshot.lifecycle,
      sourceIdentity: snapshot.sourceIdentity,
      runtimeSummary: snapshot.runtimeSummary,
      progressSummary: snapshot.progressSummary,
      currentActivity: snapshot.currentActivity,
      blockers: snapshot.blockers,
      warnings: snapshot.warnings,
      diagnostics: snapshot.diagnostics,
      recommendedAction: snapshot.recommendedAction,
      timeline: snapshot.timeline,
      lastObservationFingerprint: snapshot.lastObservationFingerprint,
    });
  }

  function createMonitoring(source, options = {}) {
    const normalized = normalizeSource(source, options.projectId);
    const candidate = validateRuntimeCandidate(normalized);
    if (!candidate.valid) {
      throw monitoringError("invalid_runtime_snapshot", "Stage 30 требует структурно валидный snapshot Stage 29.", { errors: candidate.structural });
    }
    const now = options.now || timestampNow();
    const targetProjectRevision = positiveInteger(options.projectRevision) || normalized.projectRevision;
    const sourceIdentity = buildSourceIdentity(normalized, targetProjectRevision);
    const projection = projectRuntime(normalized.runtime, normalized.result);
    const snapshot = {
      id: text(options.id) || makeId(normalized, positiveInteger(options.epoch) || 1),
      projectId: normalized.projectId,
      type: PROGRESS_KIND,
      kind: PROGRESS_KIND,
      schemaVersion: SCHEMA_VERSION,
      version: VERSION,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      revision: positiveInteger(options.revision) || 1,
      epoch: positiveInteger(options.epoch) || 1,
      lifecycle: { state: "waiting", previousState: null, observedAt: null },
      sourceIdentity,
      runtimeSummary: projection.runtimeSummary,
      progressSummary: projection.progressSummary,
      currentActivity: projection.currentActivity,
      blockers: projection.blockers,
      warnings: projection.warnings,
      diagnostics: projection.diagnostics,
      recommendedAction: projection.recommendedAction,
      timeline: projection.timeline,
      createdAt: now,
      updatedAt: now,
      lastObservationFingerprint: null,
      fingerprint: null,
      audit: [],
      operations: [],
    };
    appendAudit(snapshot, "monitoring_created", now, {
      runtimeRevision: normalized.runtime.revision,
      fromLifecycle: null,
      toLifecycle: "waiting",
      operationId: options.operationId || null,
      reason: "explicit_create",
    });
    snapshot.fingerprint = monitoringFingerprint(snapshot);
    const report = validateMonitoring(snapshot);
    if (!report.valid) throw monitoringError("monitoring_creation_failed", "Не удалось создать непротиворечивый monitoring snapshot.", { errors: report.errors });
    return commandResult("create", true, finish(snapshot), report);
  }

  function refresh(monitoring, source, options = {}) {
    requireMonitoring(monitoring);
    const duplicate = duplicateOperation(monitoring, "refresh", options);
    if (duplicate) return duplicate;
    checkRevision(monitoring, options.expectedRevision);
    if (TERMINAL_LIFECYCLES.includes(monitoring.lifecycle.state)) {
      throw monitoringError("terminal_monitoring_protected", "Terminal monitoring изменяется только через явный rebuild.");
    }
    if (monitoring.lifecycle.state === "observing") {
      throw monitoringError("monitoring_recovery_required", "Незавершённое наблюдение требует отдельной recovery-команды.");
    }
    const normalized = normalizeSource(source, monitoring.projectId);
    const candidate = validateRuntimeCandidate(normalized);
    const sourceErrors = candidate.valid ? sourceIdentityValidation(monitoring, normalized) : candidate.structural;
    const targetProjectRevision = positiveInteger(options.projectRevision) || normalized.projectRevision;
    const inputFingerprint = observationFingerprint(normalized, targetProjectRevision);
    if (!sourceErrors.length && monitoring.lastObservationFingerprint === inputFingerprint && monitoring.lifecycle.state !== "waiting") {
      return commandResult("refresh", false, copyFrozen(monitoring), validateMonitoring(monitoring, source));
    }
    return observationCommand(monitoring, normalized, "refresh", sourceErrors, inputFingerprint, options);
  }

  function recover(monitoring, source, options = {}) {
    requireMonitoring(monitoring);
    const duplicate = duplicateOperation(monitoring, "recover", options);
    if (duplicate) return duplicate;
    checkRevision(monitoring, options.expectedRevision);
    if (monitoring.lifecycle.state !== "observing") {
      throw monitoringError("monitoring_recovery_not_required", "Recovery доступен только для незавершённого observing snapshot.");
    }
    const normalized = normalizeSource(source, monitoring.projectId);
    const candidate = validateRuntimeCandidate(normalized);
    const sourceErrors = candidate.valid ? sourceIdentityValidation(monitoring, normalized) : candidate.structural;
    const targetProjectRevision = positiveInteger(options.projectRevision) || normalized.projectRevision;
    const inputFingerprint = observationFingerprint(normalized, targetProjectRevision);
    return observationCommand(monitoring, normalized, "recover", sourceErrors, inputFingerprint, options, true);
  }

  function rebuild(monitoring, source, options = {}) {
    requireMonitoring(monitoring);
    const duplicate = duplicateOperation(monitoring, "rebuild", options);
    if (duplicate) return duplicate;
    checkRevision(monitoring, options.expectedRevision);
    const normalized = normalizeSource(source, monitoring.projectId);
    const candidate = validateRuntimeCandidate(normalized);
    if (!candidate.valid) throw monitoringError("invalid_runtime_snapshot", "Rebuild требует структурно валидный snapshot Stage 29.", { errors: candidate.structural });
    requireOperationId(options.operationId);
    const now = options.now || timestampNow();
    const built = createMonitoring(source, {
      id: monitoring.id,
      projectId: monitoring.projectId,
      projectRevision: positiveInteger(options.projectRevision) || normalized.projectRevision,
      epoch: monitoring.epoch + 1,
      revision: monitoring.revision + 1,
      now,
    }).monitoring;
    const next = mutable(built);
    next.createdAt = monitoring.createdAt;
    next.audit = [...array(monitoring.audit), {
      id: `monitoring-audit:${fingerprint({ event: "monitoring_rebuilt", revision: next.revision, epoch: next.epoch, at: now }).slice(8)}`,
      event: "monitoring_rebuilt",
      revision: next.revision,
      epoch: next.epoch,
      at: now,
      runtimeRevision: normalized.runtime.revision,
      fromLifecycle: monitoring.lifecycle.state,
      toLifecycle: "waiting",
      operationId: options.operationId,
      reason: "explicit_rebuild",
    }].slice(-AUDIT_LIMIT);
    next.operations = [...array(monitoring.operations), operationEntry(options.operationId, "rebuild", next.revision, now)].slice(-OPERATION_LIMIT);
    next.fingerprint = monitoringFingerprint(next);
    return commandResult("rebuild", true, finish(next));
  }

  function observationCommand(monitoring, normalized, command, sourceErrors, inputFingerprint, options, recovery = false) {
    requireOperationId(options.operationId);
    const now = options.now || timestampNow();
    const next = mutable(monitoring);
    next.revision += 1;
    next.updatedAt = now;
    const fromLifecycle = next.lifecycle.state;
    if (!recovery) transition(next, "observing", now);
    const targetProjectRevision = positiveInteger(options.projectRevision) || normalized.projectRevision;
    const projection = projectRuntime(normalized.runtime, normalized.result, sourceErrors);
    const targetLifecycle = classifyLifecycle(normalized.runtime, sourceErrors, projection);
    transition(next, targetLifecycle, now);
    next.sourceIdentity = buildSourceIdentity(normalized, targetProjectRevision);
    next.runtimeSummary = projection.runtimeSummary;
    next.progressSummary = projection.progressSummary;
    next.currentActivity = projection.currentActivity;
    next.blockers = projection.blockers;
    next.warnings = projection.warnings;
    next.diagnostics = projection.diagnostics;
    next.recommendedAction = projection.recommendedAction;
    next.timeline = projection.timeline;
    next.recommendedAction.sourceRevision = normalized.runtime?.revision || 0;
    next.recommendedAction.targetIdentity = {
      projectId: normalized.projectId,
      runtimeId: normalized.runtime?.id || null,
      resultId: normalized.result?.id || normalized.runtime?.sourceResultId || null,
    };
    next.recommendedAction.fingerprint = recommendedActionFingerprint(next.recommendedAction);
    next.lastObservationFingerprint = inputFingerprint;
    appendAudit(next, recovery ? "monitoring_recovered" : "monitoring_refreshed", now, {
      runtimeRevision: normalized.runtime?.revision || 0,
      fromLifecycle,
      toLifecycle: targetLifecycle,
      operationId: options.operationId,
      reason: sourceErrors.length ? sourceErrors.map((entry) => entry.code).join(",") : "validated_runtime_observed",
    });
    next.operations = [...array(next.operations), operationEntry(options.operationId, command, next.revision, now)].slice(-OPERATION_LIMIT);
    next.fingerprint = monitoringFingerprint(next);
    const report = validateMonitoring(next);
    if (!report.valid) throw monitoringError("monitoring_command_invalid_result", "Команда monitoring создала противоречивый snapshot.", { command, errors: report.errors });
    return commandResult(command, true, finish(next), report);
  }

  function projectRuntime(runtime, result, externalDiagnostics = []) {
    const safeRuntime = runtime && typeof runtime === "object" ? runtime : {};
    const actions = array(safeRuntime.actions).slice().sort((left, right) => numeric(left.ordinal) - numeric(right.ordinal) || lexical(text(left.id), text(right.id)));
    const actionUnits = actions.map((action) => ({ action, stepIds: actionStepIds(action) }));
    const totalSteps = actionUnits.reduce((sum, entry) => sum + entry.stepIds.length, 0);
    const countSteps = (states) => actionUnits.filter((entry) => states.includes(entry.action.state)).reduce((sum, entry) => sum + entry.stepIds.length, 0);
    const completedSteps = countSteps(["completed", "skipped"]);
    const activeSteps = countSteps(["running"]);
    const pausedSteps = countSteps(["paused"]);
    const blockedSteps = countSteps(["blocked"]);
    const failedSteps = countSteps(["failed"]);
    const remainingSteps = countSteps(["pending", "ready"]);
    const checkpointOwners = new Map();
    for (const entry of actionUnits) {
      for (const checkpointId of stableStrings(entry.action?.sourceReference?.checkpointIds)) checkpointOwners.set(checkpointId, entry.action);
    }
    for (const identity of array(safeRuntime.sourceIdentity?.chain?.checkpoints)) {
      if (identity?.id && !checkpointOwners.has(identity.id)) checkpointOwners.set(identity.id, actions.find((action) => action.sourceReference?.sourceActionId === identity.actionId) || null);
    }
    const completedCheckpointIds = [...checkpointOwners.entries()]
      .filter(([, action]) => action && ["completed", "skipped"].includes(action.state))
      .map(([id]) => id)
      .sort(lexical);
    const currentAction = actions.find((action) => action.id === safeRuntime.activeActionId)
      || actions.find((action) => ["running", "paused", "blocked"].includes(action.state))
      || actions[Math.min(Number.isInteger(safeRuntime.cursor) ? safeRuntime.cursor : 0, Math.max(actions.length - 1, 0))]
      || null;
    const completedActions = actions.filter((action) => ["completed", "skipped"].includes(action.state));
    const lastCompletedAction = completedActions.slice().sort((left, right) => lexical(text(left.completedAt), text(right.completedAt)) || numeric(left.ordinal) - numeric(right.ordinal)).at(-1) || null;
    const latestCheckpointId = completedCheckpointIds.at(-1) || null;
    const runtimeStatus = text(safeRuntime.status) || "waiting";
    const currentActivity = buildCurrentActivity(runtimeStatus, currentAction, safeRuntime);
    const blockers = buildBlockers(safeRuntime, currentAction, externalDiagnostics);
    const warnings = buildWarnings(safeRuntime, currentAction, result, externalDiagnostics);
    const diagnostics = buildDiagnostics(safeRuntime, {
      totalSteps, completedSteps, activeSteps, pausedSteps, blockedSteps, failedSteps, remainingSteps,
    }, externalDiagnostics);
    const completedPercent = totalSteps === 0 ? 0 : Math.round((completedSteps * 100) / totalSteps);
    const progressSummary = {
      totalSteps,
      completedSteps,
      currentStepIndex: totalSteps === 0 ? 0 : completedSteps >= totalSteps ? totalSteps : Math.min(totalSteps, completedSteps + 1),
      completedPercent: clamp(completedPercent, 0, 100),
      totalCheckpoints: checkpointOwners.size,
      completedCheckpoints: completedCheckpointIds.length,
      blockedCount: blockers.length,
      warningCount: warnings.length,
      failedCount: failedSteps,
      remainingCount: remainingSteps + activeSteps + pausedSteps + blockedSteps + failedSteps,
    };
    const runtimeSummary = {
      lifecycle: runtimeStatus,
      epoch: positiveInteger(safeRuntime.epoch) || 1,
      totalSteps,
      completedSteps,
      activeSteps,
      pausedSteps,
      blockedSteps,
      failedSteps,
      remainingSteps,
      totalCheckpoints: checkpointOwners.size,
      completedCheckpoints: completedCheckpointIds.length,
      lastConfirmedCheckpoint: latestCheckpointId ? { id: latestCheckpointId, runtimeRevision: safeRuntime.revision, actionId: checkpointOwners.get(latestCheckpointId)?.id || null } : null,
      activeAction: currentAction && ["running", "paused", "blocked"].includes(currentAction.state) ? actionReference(currentAction) : null,
      lastCompletedAction: lastCompletedAction ? actionReference(lastCompletedAction) : null,
      lastConfirmedChangeAt: text(safeRuntime.updatedAt) || null,
      hasUnfinishedRunningAction: Boolean(actions.some((action) => action.state === "running")),
      hasRecovery: runtimeStatus === "recovering" || Boolean(safeRuntime.recovery),
      hasStaleUpstream: runtimeStatus === "stale" || externalDiagnostics.some((entry) => isSourceDiagnostic(entry.code)),
      terminalStatus: ["completed", "failed", "stopped", "stale"].includes(runtimeStatus) ? runtimeStatus : null,
    };
    const lifecycle = classifyLifecycle(safeRuntime, externalDiagnostics, { blockers, warnings, diagnostics, runtimeSummary, currentActivity });
    const recommendedAction = buildRecommendedAction(lifecycle, runtimeStatus, currentActivity, safeRuntime, result);
    const timeline = projectTimeline(safeRuntime);
    return { runtimeSummary, progressSummary, currentActivity, blockers, warnings, diagnostics, recommendedAction, timeline };
  }

  function actionStepIds(action) {
    const values = stableStrings(action?.sourceReference?.stepIds);
    return values.length ? values : [text(action?.id) ? `action-step:${action.id}` : "action-step:unknown"];
  }

  function actionReference(action) {
    return {
      id: action.id,
      title: text(action.title) || action.id,
      status: action.state,
      ordinal: Number.isInteger(action.ordinal) ? action.ordinal : null,
      stepIds: actionStepIds(action),
      checkpointIds: stableStrings(action?.sourceReference?.checkpointIds),
      completedAt: action.completedAt || null,
    };
  }

  function buildCurrentActivity(runtimeStatus, action, runtime = {}) {
    let status = "none";
    if (runtimeStatus === "recovering") status = "recovering";
    else if (runtimeStatus === "completed") status = "completed";
    else if (runtimeStatus === "failed") status = "failed";
    else if (runtimeStatus === "stopped") status = "stopped";
    else if (runtimeStatus === "stale") status = "stale";
    else if (action && ["running", "paused", "blocked"].includes(action.state)) status = action.state;
    else if (["waiting", "ready"].includes(runtimeStatus)) status = "waiting";
    const stepIds = action ? actionStepIds(action) : [];
    const checkpointIds = stableStrings(action?.sourceReference?.checkpointIds);
    const reason = action?.blockedReason?.code || action?.error?.code || (runtimeStatus === "recovering" ? "runtime_recovery_in_progress" : runtimeStatus);
    return {
      actionId: action?.id || null,
      stepId: stepIds[0] || null,
      checkpointId: checkpointIds[0] || null,
      startedAt: action?.startedAt || null,
      pausedAt: status === "paused" ? action?.pausedAt || runtime.pausedAt || null : null,
      status,
      reason,
      safeToResume: status === "paused" && !action?.error && !action?.blockedReason,
      requiresUserDecision: ["running", "paused", "recovering", "blocked", "failed", "stopped", "stale"].includes(status),
    };
  }

  function buildBlockers(runtime, currentAction, externalDiagnostics) {
    const values = [];
    for (const action of array(runtime.actions)) {
      if (action.state !== "blocked" && !action.blockedReason) continue;
      values.push({
        code: text(action.blockedReason?.code) || "runtime_action_blocked",
        severity: "error",
        source: "runtime_action",
        messageKey: text(action.blockedReason?.message) || "runtime.action.blocked",
        relatedStepId: actionStepIds(action)[0] || null,
        relatedActionId: action.id,
        recoverable: true,
        recommendedCommand: "resolve_blocker",
      });
    }
    if (runtime.status === "stale") for (const reason of array(runtime.staleReasons)) values.push({
      code: text(reason?.code) || "runtime_stale",
      severity: "critical",
      source: "runtime",
      messageKey: text(reason?.message) || "runtime.source.stale",
      relatedStepId: null,
      relatedActionId: currentAction?.id || null,
      recoverable: false,
      recommendedCommand: "rebuild_runtime",
    });
    for (const diagnostic of externalDiagnostics.filter((entry) => isSourceDiagnostic(entry.code))) values.push({
      code: diagnostic.code,
      severity: "critical",
      source: "source_identity",
      messageKey: `monitoring.${diagnostic.code}`,
      relatedStepId: null,
      relatedActionId: currentAction?.id || null,
      recoverable: false,
      recommendedCommand: "rebuild_runtime",
    });
    return stableMessages(values);
  }

  function buildWarnings(runtime, currentAction, result, externalDiagnostics) {
    const values = [];
    if (array(runtime.actions).some((action) => action.state === "running")) values.push({
      code: "unfinished_running_action",
      severity: "warning",
      source: "runtime",
      messageKey: "monitoring.running_action.requires_runtime_review",
      relatedStepId: currentAction ? actionStepIds(currentAction)[0] : null,
      relatedActionId: currentAction?.id || null,
      recoverable: true,
      recommendedCommand: "open_runtime",
    });
    if (runtime.status === "paused") values.push({ code: "runtime_paused", severity: "warning", source: "runtime", messageKey: "monitoring.runtime.paused", relatedStepId: currentAction ? actionStepIds(currentAction)[0] : null, relatedActionId: currentAction?.id || null, recoverable: true, recommendedCommand: "review_paused_action" });
    if (runtime.status === "recovering" || runtime.recovery) values.push({ code: "runtime_recovering", severity: "warning", source: "runtime", messageKey: "monitoring.runtime.recovering", relatedStepId: currentAction ? actionStepIds(currentAction)[0] : null, relatedActionId: currentAction?.id || null, recoverable: true, recommendedCommand: "retry_recovery" });
    if (runtime.status === "stopped") values.push({ code: "runtime_stopped", severity: "warning", source: "runtime", messageKey: "monitoring.runtime.stopped", relatedStepId: currentAction ? actionStepIds(currentAction)[0] : null, relatedActionId: currentAction?.id || null, recoverable: false, recommendedCommand: "rebuild_runtime" });
    for (const warning of array(result?.warnings)) values.push({ code: text(warning?.code) || "result_warning", severity: "warning", source: "result", messageKey: text(warning?.message) || "monitoring.result.warning", relatedStepId: warning?.stepId || null, relatedActionId: warning?.actionId || null, recoverable: true, recommendedCommand: "review_result" });
    for (const diagnostic of externalDiagnostics.filter((entry) => !isSourceDiagnostic(entry.code))) values.push({ code: diagnostic.code, severity: diagnostic.severity === "critical" ? "error" : "warning", source: "validation", messageKey: `monitoring.${diagnostic.code}`, relatedStepId: null, relatedActionId: currentAction?.id || null, recoverable: false, recommendedCommand: "inspect_failure" });
    return stableMessages(values);
  }

  function buildDiagnostics(runtime, counts, externalDiagnostics) {
    const values = externalDiagnostics.map((entry) => diagnostic(entry.code || "runtime_validation_error", entry.severity || "error", entry.details || {}));
    const sum = counts.completedSteps + counts.activeSteps + counts.pausedSteps + counts.blockedSteps + counts.failedSteps + counts.remainingSteps;
    if (sum !== counts.totalSteps) values.push(diagnostic("progress_partition_mismatch", "error", { expected: counts.totalSteps, actual: sum }));
    if (runtime.status === "running" && !array(runtime.actions).some((action) => action.state === "running") && runtime.activeActionId) values.push(diagnostic("runtime_active_action_inconsistent", "error", { activeActionId: runtime.activeActionId }));
    if (runtime.status === "completed" && counts.completedSteps !== counts.totalSteps) values.push(diagnostic("completed_runtime_progress_incomplete", "error", { completedSteps: counts.completedSteps, totalSteps: counts.totalSteps }));
    if (runtime.status === "failed" && !runtime.lastError) values.push(diagnostic("failed_runtime_reason_missing", "error"));
    return stableDiagnostics(values);
  }

  function classifyLifecycle(runtime, sourceErrors, projection) {
    if (array(sourceErrors).some((entry) => isSourceDiagnostic(entry.code)) || runtime?.status === "stale") return "stale";
    if (!runtime || typeof runtime !== "object" || array(sourceErrors).some((entry) => !isSourceDiagnostic(entry.code))) return "failed";
    if (runtime.status === "failed") return "failed";
    if (runtime.status === "completed") return "completed";
    if (runtime.status === "blocked" || projection?.blockers?.some((entry) => entry.source === "runtime_action")) return "blocked";
    if (["paused", "recovering", "stopped"].includes(runtime.status) || projection?.warnings?.length || projection?.diagnostics?.length) return "attention_required";
    return "healthy";
  }

  function buildRecommendedAction(lifecycle, runtimeStatus, activity, runtime, result) {
    let type = "open_runtime";
    if (lifecycle === "stale") type = "rebuild_runtime";
    else if (lifecycle === "failed") type = "inspect_failure";
    else if (lifecycle === "blocked") type = "resolve_blocker";
    else if (runtimeStatus === "recovering") type = "retry_recovery";
    else if (activity.status === "paused" && activity.actionId) type = "review_paused_action";
    else if (runtimeStatus === "paused") type = "resume_runtime";
    else if (lifecycle === "completed") type = "review_result";
    else if (runtimeStatus === "stopped") type = "rebuild_runtime";
    else if (!runtime?.id) type = "no_action_required";
    const labels = {
      open_runtime: "Открыть runtime",
      resume_runtime: "Продолжить runtime",
      review_paused_action: "Проверить приостановленное действие",
      resolve_blocker: "Разобрать блокировку",
      retry_recovery: "Продолжить recovery",
      rebuild_runtime: "Пересобрать runtime",
      review_result: "Открыть результат",
      inspect_failure: "Изучить сбой",
      no_action_required: "Действия не требуются",
    };
    const targetRoute = type === "review_result" ? "/pattern-execution-result" : type === "no_action_required" ? null : "/pattern-execution-runtime";
    const action = {
      type,
      label: labels[type],
      reason: `${lifecycle}:${runtimeStatus || "missing"}:${activity.status}`,
      targetRoute,
      enabled: type !== "no_action_required" && Boolean(runtime?.projectId || result?.projectId),
      requiresConfirmation: ["resume_runtime", "resolve_blocker", "retry_recovery", "rebuild_runtime"].includes(type),
      sourceRevision: positiveInteger(runtime?.revision) || 0,
      targetIdentity: { projectId: runtime?.projectId || result?.projectId || null, runtimeId: runtime?.id || null, resultId: result?.id || runtime?.sourceResultId || null },
      fingerprint: null,
    };
    action.fingerprint = recommendedActionFingerprint(action);
    return action;
  }

  function projectTimeline(runtime) {
    const actionById = new Map(array(runtime.actions).map((action) => [action.id, action]));
    const entries = array(runtime.audit).map((entry) => {
      const action = actionById.get(entry.actionId) || null;
      const projected = {
        id: null,
        sequence: 0,
        eventType: text(entry.event) || "runtime_event",
        runtimeRevision: positiveInteger(entry.revision) || positiveInteger(runtime.revision) || 1,
        actionId: entry.actionId || null,
        stepId: action ? actionStepIds(action)[0] : entry.stepId || null,
        checkpointId: action ? stableStrings(action.sourceReference?.checkpointIds)[0] || null : entry.checkpointId || null,
        status: text(entry.targetStatus) || action?.state || text(runtime.status) || "waiting",
        timestamp: text(entry.at) || text(runtime.updatedAt) || text(runtime.createdAt),
        reason: text(entry.code) || array(entry.reasonCodes).join(",") || null,
      };
      projected.id = `monitoring-timeline:${timelineEntryFingerprint(projected).slice(8)}`;
      return projected;
    }).sort((left, right) => lexical(left.timestamp, right.timestamp) || numeric(left.runtimeRevision) - numeric(right.runtimeRevision) || lexical(left.id, right.id));
    const unique = new Map();
    for (const entry of entries) unique.set(entry.id, entry);
    return [...unique.values()].slice(-TIMELINE_LIMIT).map((entry, index) => ({ ...entry, sequence: index + 1 }));
  }

  function buildSourceIdentity(normalized, projectRevision = normalized.projectRevision) {
    const runtime = normalized.runtime;
    const chain = copy(runtime?.sourceIdentity?.chain || {});
    const identity = {
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION,
      project: { id: normalized.projectId, revision: positiveInteger(projectRevision) || 1 },
      result: { id: runtime.sourceResultId, revision: runtime.sourceResultRevision, fingerprint: runtime.sourceResultFingerprint },
      runtime: { id: runtime.id, revision: runtime.revision, epoch: runtime.epoch, fingerprint: runtime.runtimeFingerprint },
      calculationIdentity: copy(chain.calculation || null),
      executionPlanIdentity: copy(chain.plan || null),
      sessionIdentity: copy(chain.session || null),
      runtimeSourceIdentity: copy(runtime.sourceIdentity || null),
      progressIdentity: copy(chain.progress || null),
      completionIdentity: copy(chain.completion || null),
      stepIdentities: array(chain.steps).map(copy).sort(identitySort),
      checkpointIdentities: array(chain.checkpoints).map(copy).sort(identitySort),
      importRevision: normalized.importRevision,
      sourceIdentityFingerprint: null,
    };
    identity.sourceIdentityFingerprint = sourceIdentityFingerprint(identity);
    return identity;
  }

  function observationFingerprint(normalized, projectRevision = normalized.projectRevision) {
    return fingerprint({
      projectId: normalized.projectId,
      projectRevision,
      runtimeId: normalized.runtime?.id,
      runtimeRevision: normalized.runtime?.revision,
      runtimeEpoch: normalized.runtime?.epoch,
      runtimeFingerprint: normalized.runtime?.runtimeFingerprint,
      runtimeStatus: normalized.runtime?.status,
      actions: array(normalized.runtime?.actions).map((action) => ({ id: action.id, state: action.state, attempt: action.attempt, startedAt: action.startedAt, completedAt: action.completedAt, failedAt: action.failedAt, blockedReason: action.blockedReason, error: action.error })),
    });
  }

  function validateMonitoring(monitoring, source) {
    const structural = structuralValidation(monitoring);
    const semantic = structural.length ? [] : semanticValidation(monitoring);
    const sourceErrors = source === undefined || structural.length ? [] : sourceIdentityValidation(monitoring, normalizeSource(source, monitoring.projectId));
    const errors = [...structural, ...semantic, ...sourceErrors];
    return deepFreeze({ valid: errors.length === 0, structural, semantic, source: sourceErrors, errors, availableCommands: availableCommands(monitoring, errors) });
  }

  function structuralValidation(monitoring) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, "error", details));
    if (!monitoring || typeof monitoring !== "object" || Array.isArray(monitoring)) return [diagnostic("monitoring_not_object")];
    if (!text(monitoring.id) || !text(monitoring.projectId)) invalid("monitoring_identity_missing");
    if (monitoring.type !== PROGRESS_KIND || monitoring.kind !== PROGRESS_KIND) invalid("monitoring_type_invalid");
    if (monitoring.schemaVersion !== SCHEMA_VERSION || monitoring.version !== VERSION || monitoring.sourceSchemaVersion !== SOURCE_SCHEMA_VERSION) invalid("monitoring_schema_unsupported");
    if (!positiveInteger(monitoring.revision) || !positiveInteger(monitoring.epoch)) invalid("monitoring_revision_invalid");
    if (!monitoring.lifecycle || !LIFECYCLE_STATES.includes(monitoring.lifecycle.state) || (monitoring.lifecycle.previousState !== null && !LIFECYCLE_STATES.includes(monitoring.lifecycle.previousState)) || (monitoring.lifecycle.observedAt !== null && !isTimestamp(monitoring.lifecycle.observedAt))) invalid("monitoring_lifecycle_invalid");
    if (!monitoring.sourceIdentity || monitoring.sourceIdentity.sourceIdentityFingerprint !== sourceIdentityFingerprint(monitoring.sourceIdentity)) invalid("monitoring_source_identity_invalid");
    for (const field of ["runtimeSummary", "progressSummary", "currentActivity", "recommendedAction"]) if (!monitoring[field] || typeof monitoring[field] !== "object" || Array.isArray(monitoring[field])) invalid(`monitoring_${field}_invalid`);
    for (const field of ["blockers", "warnings", "diagnostics", "timeline", "audit", "operations"]) if (!Array.isArray(monitoring[field])) invalid(`monitoring_${field}_invalid`);
    if (array(monitoring.timeline).length > TIMELINE_LIMIT) invalid("monitoring_timeline_limit_exceeded");
    if (array(monitoring.audit).length > AUDIT_LIMIT) invalid("monitoring_audit_limit_exceeded");
    if (array(monitoring.operations).length > OPERATION_LIMIT) invalid("monitoring_operation_limit_exceeded");
    if (!isTimestamp(monitoring.createdAt) || !isTimestamp(monitoring.updatedAt)) invalid("monitoring_timestamp_invalid");
    if (monitoring.lastObservationFingerprint !== null && !validFingerprint(monitoring.lastObservationFingerprint)) invalid("monitoring_observation_fingerprint_invalid");
    if (!validFingerprint(monitoring.fingerprint) || monitoring.fingerprint !== monitoringFingerprint(monitoring)) invalid("monitoring_fingerprint_mismatch");
    if (monitoring.currentActivity && !ACTIVITY_STATES.includes(monitoring.currentActivity.status)) invalid("monitoring_activity_invalid");
    if (monitoring.recommendedAction && (!RECOMMENDED_ACTIONS.includes(monitoring.recommendedAction.type) || monitoring.recommendedAction.fingerprint !== recommendedActionFingerprint(monitoring.recommendedAction))) invalid("monitoring_recommendation_invalid");
    for (const entry of [...array(monitoring.blockers), ...array(monitoring.warnings)]) {
      if (!text(entry?.code) || !["warning", "error", "critical"].includes(entry?.severity) || !text(entry?.source) || !text(entry?.messageKey) || typeof entry?.recoverable !== "boolean" || !text(entry?.recommendedCommand)) invalid("monitoring_message_invalid", { code: entry?.code || null });
    }
    for (const entry of array(monitoring.timeline)) {
      if (!text(entry?.id) || !positiveInteger(entry?.sequence) || !text(entry?.eventType) || !positiveInteger(entry?.runtimeRevision) || !text(entry?.status) || !isTimestamp(entry?.timestamp) || entry.id !== `monitoring-timeline:${timelineEntryFingerprint(entry).slice(8)}`) invalid("monitoring_timeline_entry_invalid", { id: entry?.id || null });
    }
    return stableDiagnostics(errors);
  }

  function semanticValidation(monitoring) {
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, "error", details));
    const progress = monitoring.progressSummary;
    const runtime = monitoring.runtimeSummary;
    const numericFields = ["totalSteps", "completedSteps", "currentStepIndex", "completedPercent", "totalCheckpoints", "completedCheckpoints", "blockedCount", "warningCount", "failedCount", "remainingCount"];
    for (const field of numericFields) if (!Number.isInteger(progress[field]) || progress[field] < 0) invalid("monitoring_progress_range_invalid", { field, value: progress[field] });
    if (progress.completedSteps > progress.totalSteps || progress.currentStepIndex > progress.totalSteps || progress.completedPercent > 100 || progress.completedCheckpoints > progress.totalCheckpoints) invalid("monitoring_progress_range_invalid");
    const expectedPercent = progress.totalSteps === 0 ? 0 : Math.round((progress.completedSteps * 100) / progress.totalSteps);
    if (progress.completedPercent !== expectedPercent) invalid("monitoring_progress_percent_invalid", { expectedPercent, actual: progress.completedPercent });
    if (progress.totalSteps !== runtime.totalSteps || progress.completedSteps !== runtime.completedSteps || progress.totalCheckpoints !== runtime.totalCheckpoints || progress.completedCheckpoints !== runtime.completedCheckpoints) invalid("monitoring_progress_runtime_mismatch");
    if (progress.blockedCount !== monitoring.blockers.length || progress.warningCount !== monitoring.warnings.length || progress.failedCount !== runtime.failedSteps) invalid("monitoring_projection_count_mismatch");
    if (runtime.completedSteps + runtime.activeSteps + runtime.pausedSteps + runtime.blockedSteps + runtime.failedSteps + runtime.remainingSteps !== runtime.totalSteps) invalid("monitoring_runtime_partition_invalid");
    if (canonicalize(monitoring.blockers) !== canonicalize(stableMessages(monitoring.blockers)) || canonicalize(monitoring.warnings) !== canonicalize(stableMessages(monitoring.warnings))) invalid("monitoring_messages_not_stable");
    if (canonicalize(monitoring.diagnostics) !== canonicalize(stableDiagnostics(monitoring.diagnostics))) invalid("monitoring_diagnostics_not_stable");
    const timelineIds = new Set();
    array(monitoring.timeline).forEach((entry, index) => {
      if (entry.sequence !== index + 1 || timelineIds.has(entry.id)) invalid("monitoring_timeline_order_invalid", { id: entry.id });
      timelineIds.add(entry.id);
    });
    if (monitoring.recommendedAction.sourceRevision !== monitoring.sourceIdentity.runtime.revision) invalid("monitoring_recommendation_revision_mismatch");
    if (monitoring.lifecycle.state === "completed" && runtime.lifecycle !== "completed") invalid("monitoring_completed_without_runtime_completion");
    if (monitoring.lifecycle.state === "failed" && runtime.lifecycle !== "failed" && !monitoring.diagnostics.length) invalid("monitoring_failed_without_reason");
    if (monitoring.lifecycle.state === "blocked" && !monitoring.blockers.length) invalid("monitoring_blocked_without_blocker");
    if (monitoring.lifecycle.state === "stale" && !runtime.hasStaleUpstream && !monitoring.blockers.some((entry) => entry.source === "source_identity")) invalid("monitoring_stale_without_identity_reason");
    return stableDiagnostics(errors);
  }

  function sourceIdentityValidation(monitoring, source) {
    const normalized = source?.runtime !== undefined ? source : normalizeSource(source, monitoring.projectId);
    const errors = [];
    const invalid = (code, details = {}) => errors.push(diagnostic(code, "critical", details));
    const candidate = validateRuntimeCandidate(normalized);
    if (!candidate.valid) return stableDiagnostics(candidate.structural);
    const expected = monitoring.sourceIdentity;
    const runtime = normalized.runtime;
    if (normalized.projectId !== monitoring.projectId || expected.project.id !== normalized.projectId) invalid("project_identity_mismatch");
    if (expected.project.revision !== normalized.projectRevision) invalid("project_revision_mismatch", { expected: expected.project.revision, actual: normalized.projectRevision });
    if (expected.result.id !== runtime.sourceResultId || expected.result.revision !== runtime.sourceResultRevision || expected.result.fingerprint !== runtime.sourceResultFingerprint) invalid("result_identity_mismatch");
    if (expected.runtime.id !== runtime.id) invalid("runtime_id_mismatch");
    if (expected.runtime.revision !== runtime.revision) invalid("runtime_revision_mismatch", { expected: expected.runtime.revision, actual: runtime.revision });
    if (expected.runtime.epoch !== runtime.epoch) invalid("runtime_epoch_mismatch");
    if (expected.runtime.fingerprint !== runtime.runtimeFingerprint) invalid("runtime_fingerprint_mismatch");
    const actualSource = buildSourceIdentity(normalized, normalized.projectRevision);
    if (canonicalize(expected.runtimeSourceIdentity) !== canonicalize(actualSource.runtimeSourceIdentity)) invalid("runtime_source_identity_mismatch");
    const runtimeApi = globalObject.YarnAIPatternExecutionRuntime;
    if (runtimeApi?.validateRuntime && normalized.aggregate) {
      const report = runtimeApi.validateRuntime(runtime, normalized.aggregate);
      for (const error of array(report.source)) invalid(error.code || "runtime_source_identity_mismatch", error.details || {});
    } else if (!normalized.aggregate) invalid("source_identity_unproven");
    return stableDiagnostics(errors);
  }

  function validateRuntimeCandidate(normalized) {
    const errors = [];
    if (!normalized.projectId) errors.push(diagnostic("project_context_missing", "critical"));
    if (!normalized.runtime) errors.push(diagnostic("runtime_missing", "critical"));
    if (normalized.runtime && (normalized.runtime.type !== "PATTERN_EXECUTION_RUNTIME" || normalized.runtime.kind !== "PATTERN_EXECUTION_RUNTIME")) errors.push(diagnostic("runtime_type_invalid", "critical"));
    const runtimeApi = globalObject.YarnAIPatternExecutionRuntime;
    if (normalized.runtime && runtimeApi?.validateRuntime) {
      const report = runtimeApi.validateRuntime(normalized.runtime);
      for (const error of array(report.structural)) errors.push(diagnostic(error.code || "runtime_structural_invalid", "critical", error.details || {}));
      for (const error of array(report.semantic)) errors.push(diagnostic(error.code || "runtime_semantic_invalid", "error", error.details || {}));
    } else if (normalized.runtime && (!positiveInteger(normalized.runtime.revision) || !positiveInteger(normalized.runtime.epoch) || !validFingerprint(normalized.runtime.runtimeFingerprint) || !Array.isArray(normalized.runtime.actions))) errors.push(diagnostic("runtime_structure_unproven", "critical"));
    return { valid: errors.length === 0, structural: stableDiagnostics(errors) };
  }

  function normalizeSource(source, projectId) {
    const aggregate = Array.isArray(source?.progress) ? source : null;
    const project = aggregate?.project || source?.project || null;
    const effectiveProjectId = projectId || project?.project_id || project?.projectId || source?.projectId || source?.runtime?.projectId || source?.state?.projectId || null;
    const calculationId = aggregate?.project?.active_calculation_id || source?.calculationId || source?.calculation?.calculation_id || null;
    const records = aggregate ? aggregate.progress.filter((entry) => !calculationId || entry.calculation_id === calculationId) : array(source?.records);
    const runtimeRecord = source?.runtimeRecord || newestRecord(records.filter((entry) => entry.kind === "PATTERN_EXECUTION_RUNTIME"));
    const runtime = source?.type === "PATTERN_EXECUTION_RUNTIME" ? source : source?.runtime || source?.state || runtimeRecord?.state || null;
    const resultRecord = records.find((entry) => entry.kind === "PATTERN_EXECUTION_RESULT" && entry.state?.id === runtime?.sourceResultId) || newestRecord(records.filter((entry) => entry.kind === "PATTERN_EXECUTION_RESULT"));
    const result = source?.result || resultRecord?.state || null;
    const projectRevision = positiveInteger(source?.projectRevision) || positiveInteger(project?.revision) || 1;
    const importRevision = positiveInteger(project?.import_revision) || (project?.imported_from_project_id ? projectRevision : null);
    return { aggregate, project, projectId: effectiveProjectId, projectRevision, importRevision, calculationId, records, runtimeRecord, runtime, resultRecord, result };
  }

  function inspectAggregate(aggregate) {
    const normalized = normalizeSource(aggregate);
    const records = array(aggregate?.progress).filter((entry) => entry.kind === PROGRESS_KIND && (!normalized.calculationId || entry.calculation_id === normalized.calculationId));
    const monitoringRecord = newestRecord(records);
    const rawMonitoring = monitoringRecord?.state || null;
    const validation = rawMonitoring ? validateMonitoring(rawMonitoring, aggregate) : null;
    const corrupt = Boolean(rawMonitoring && structuralValidation(rawMonitoring).length);
    const interrupted = Boolean(rawMonitoring?.lifecycle?.state === "observing");
    return deepFreeze({
      project: normalized.project,
      calculationId: normalized.calculationId,
      runtimeRecord: normalized.runtimeRecord,
      runtime: normalized.runtime,
      result: normalized.result,
      monitoringRecord,
      rawMonitoring,
      monitoring: corrupt ? null : rawMonitoring,
      validation,
      corrupt,
      interrupted,
      availableCommands: availableCommands(rawMonitoring, validation?.errors || [], { hasRuntime: Boolean(normalized.runtime), interrupted }),
    });
  }

  async function createForProject(repository, projectId, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const normalized = normalizeSource(aggregate, projectId);
    if (!normalized.calculationId) throw monitoringError("missing_calculation", "У проекта нет активного расчёта.");
    const existing = await repository.getPatternExecutionMonitoring(projectId, normalized.calculationId);
    if (existing) return inspectAggregate(aggregate);
    const monitoring = createMonitoring(aggregate, { ...options, projectId, projectRevision: normalized.projectRevision + 1 }).monitoring;
    await repository.ensurePatternExecutionMonitoring(projectId, normalized.calculationId, monitoring, { operationKind: "PATTERN_EXECUTION_MONITORING_CREATED", projectStage: "pattern_execution_monitoring_waiting" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function executeForProject(repository, projectId, command, options = {}) {
    const aggregate = await repository.getProject(projectId);
    const inspected = inspectAggregate(aggregate);
    if (!inspected.rawMonitoring || inspected.corrupt) throw monitoringError("monitoring_unavailable", "Monitoring отсутствует или повреждён.");
    const normalized = normalizeSource(aggregate, projectId);
    const commandOptions = { ...options, projectRevision: normalized.projectRevision + 1 };
    const functions = {
      refresh: (state) => refresh(state, aggregate, commandOptions),
      recover: (state) => recover(state, aggregate, commandOptions),
      rebuild: (state) => rebuild(state, aggregate, commandOptions),
    };
    if (!functions[command]) throw monitoringError("unknown_monitoring_command", "Команда monitoring не поддерживается.");
    const result = functions[command](inspected.rawMonitoring);
    if (result.changed) {
      await repository.updatePatternExecutionMonitoring(projectId, normalized.calculationId, result.monitoring, {
        expectedRevision: inspected.rawMonitoring.revision,
        operationKind: `PATTERN_EXECUTION_MONITORING_${command.toUpperCase()}`,
        projectStage: `pattern_execution_monitoring_${result.monitoring.lifecycle.state}`,
      });
    }
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function readForProject(repository, projectId) {
    return inspectAggregate(await repository.getProject(projectId));
  }

  function availableCommands(monitoring, errors = [], context = {}) {
    if (!monitoring) return context.hasRuntime ? ["create"] : [];
    if (errors.some((entry) => !isSourceDiagnostic(entry.code))) return [];
    if (monitoring.lifecycle.state === "observing" || context.interrupted) return ["recover", "rebuild"];
    if (TERMINAL_LIFECYCLES.includes(monitoring.lifecycle.state)) return ["rebuild"];
    return ["refresh", "rebuild"];
  }

  function remapSnapshotState(snapshot) {
    const next = mutable(snapshot);
    next.sourceIdentity.sourceIdentityFingerprint = sourceIdentityFingerprint(next.sourceIdentity);
    next.timeline = array(next.timeline).map((entry, index) => {
      const projected = { ...entry, sequence: index + 1, id: null };
      projected.id = `monitoring-timeline:${timelineEntryFingerprint(projected).slice(8)}`;
      return projected;
    });
    if (next.recommendedAction) next.recommendedAction.fingerprint = recommendedActionFingerprint(next.recommendedAction);
    next.fingerprint = monitoringFingerprint(next);
    return finish(next);
  }

  function transition(snapshot, target, at) {
    const from = snapshot.lifecycle.state;
    if (!TRANSITIONS[from]?.includes(target)) throw monitoringError("invalid_lifecycle_transition", `Переход ${from || "unknown"} → ${target} недопустим.`);
    snapshot.lifecycle = { state: target, previousState: from, observedAt: target === "observing" ? at : snapshot.lifecycle.observedAt || at };
  }

  function requireMonitoring(monitoring) {
    const report = validateMonitoring(monitoring);
    if (!report.valid) throw monitoringError("corrupted_monitoring_snapshot", "Monitoring snapshot повреждён.", { errors: report.errors });
  }

  function checkRevision(monitoring, expectedRevision) {
    if (!positiveInteger(expectedRevision) || expectedRevision !== monitoring.revision) throw monitoringError("monitoring_revision_conflict", "Monitoring изменён другой операцией.", { expectedRevision, actualRevision: monitoring.revision });
  }

  function duplicateOperation(monitoring, command, options) {
    const operationId = requireOperationId(options.operationId);
    const existing = array(monitoring.operations).find((entry) => entry.operationId === operationId);
    if (!existing) return null;
    if (existing.command !== command) throw monitoringError("operation_id_conflict", "operationId уже использован другой monitoring-командой.");
    return commandResult(command, false, copyFrozen(monitoring), validateMonitoring(monitoring));
  }

  function appendAudit(snapshot, event, at, details = {}) {
    const base = { event, revision: snapshot.revision, epoch: snapshot.epoch, at, ...copy(details) };
    snapshot.audit = [...array(snapshot.audit), { id: `monitoring-audit:${fingerprint(base).slice(8)}`, ...base }].slice(-AUDIT_LIMIT);
  }

  function operationEntry(operationId, command, revision, at) { return { operationId: requireOperationId(operationId), command, revision, at }; }
  function requireOperationId(value) { const result = text(value); if (!result) throw monitoringError("operation_id_required", "Для monitoring-команды требуется operationId."); return result; }
  function commandResult(command, changed, monitoring, validation = undefined) { return deepFreeze({ ok: true, command, changed, monitoring, validation: validation || validateMonitoring(monitoring) }); }
  function diagnostic(code, severity = "error", details = {}) { return { code, severity, details: copy(details) }; }
  function stableDiagnostics(values) { const unique = new Map(); for (const value of array(values)) unique.set(`${value.code}|${value.severity}|${canonicalize(value.details || {})}`, value); return [...unique.values()].sort((left, right) => lexical(left.code, right.code) || lexical(left.severity, right.severity) || lexical(canonicalize(left.details || {}), canonicalize(right.details || {}))); }
  function stableMessages(values) { const unique = new Map(); for (const value of array(values)) unique.set(`${value.code}|${value.source}|${value.relatedStepId || ""}|${value.relatedActionId || ""}`, value); const rank = { critical: 0, error: 1, warning: 2 }; return [...unique.values()].sort((left, right) => numeric(rank[left.severity]) - numeric(rank[right.severity]) || lexical(left.code, right.code) || lexical(left.source, right.source) || lexical(left.relatedActionId || "", right.relatedActionId || "")); }
  function stableStrings(values) { return [...new Set(array(values).map(text).filter(Boolean))].sort(lexical); }
  function identitySort(left, right) { return lexical(text(left?.id), text(right?.id)) || numeric(left?.revision) - numeric(right?.revision); }
  function isSourceDiagnostic(code) { return ["project_identity_mismatch", "project_revision_mismatch", "result_identity_mismatch", "runtime_id_mismatch", "runtime_revision_mismatch", "runtime_epoch_mismatch", "runtime_fingerprint_mismatch", "runtime_source_identity_mismatch", "source_identity_unproven", "source_chain_identity_mismatch", "source_result_revision_mismatch", "source_result_fingerprint_mismatch", "import_identity_unproven"].includes(text(code)) || text(code).includes("source_"); }
  function newestRecord(records) { return array(records).slice().sort((left, right) => numeric(left.epoch) - numeric(right.epoch) || numeric(left.state?.revision) - numeric(right.state?.revision) || lexical(text(left.progress_id), text(right.progress_id))).at(-1) || null; }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function timestampNow() { return DEFAULT_TIMESTAMP; }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function copyFrozen(value) { return deepFreeze(copy(value)); }
  function finish(value) { return deepFreeze(value); }
  function makeId(source, epoch) { return `monitoring:${fingerprint({ projectId: source.projectId, runtimeId: source.runtime?.id, runtimeFingerprint: source.runtime?.runtimeFingerprint, epoch }).slice(8)}`; }
  function monitoringError(code, message, details = {}) { return new PatternExecutionMonitoringError(code, message, details); }

  const api = {
    VERSION, SCHEMA_VERSION, SOURCE_SCHEMA_VERSION, PROGRESS_KIND,
    LIFECYCLE_STATES, ACTIVITY_STATES, RECOMMENDED_ACTIONS,
    TIMELINE_LIMIT, AUDIT_LIMIT, OPERATION_LIMIT, TERMINAL_LIFECYCLES, TRANSITIONS,
    PatternExecutionMonitoringError,
    canonicalize, fingerprint, sourceIdentityFingerprint, recommendedActionFingerprint,
    timelineEntryFingerprint, calculateMonitoringFingerprint: monitoringFingerprint,
    createMonitoring, refresh, recover, rebuild, validateMonitoring,
    structuralValidation, semanticValidation, sourceIdentityValidation,
    projectRuntime, projectTimeline, buildSourceIdentity, observationFingerprint,
    availableCommands, inspectAggregate, createForProject, executeForProject, readForProject,
    remapSnapshotState,
  };
  globalObject.YarnAIPatternExecutionMonitoring = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
