"use strict";

(function exposePatternExecutionStep(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_STEP";
  const AUDIT_LIMIT = 24;
  const OPERATION_LIMIT = 96;
  const STATUSES = Object.freeze([
    "waiting", "ready", "active", "paused", "checking", "completed", "blocked", "stale", "failed",
  ]);
  const PROGRESS_TYPES = Object.freeze([
    "binary", "counter", "rows", "stitches", "measurement", "checkpoint", "timed", "informational",
  ]);
  const CRITERION_STATUSES = Object.freeze(["unchecked", "passed", "failed", "not_applicable"]);
  const AUDIT_EVENTS = Object.freeze([
    "created", "activated", "progress_incremented", "progress_decremented", "progress_corrected",
    "measurement_recorded", "checkpoint_updated", "paused", "resumed", "completion_started", "completed",
    "completion_recovered", "blocked", "stale_detected", "rebuild_started", "rebuilt", "failed",
    "imported", "collision_remapped",
  ]);
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["ready", "blocked", "stale", "failed"]),
    ready: Object.freeze(["active", "blocked", "stale", "failed"]),
    active: Object.freeze(["paused", "checking", "blocked", "stale", "failed"]),
    paused: Object.freeze(["active", "blocked", "stale", "failed"]),
    checking: Object.freeze(["active", "completed", "blocked", "stale", "failed"]),
    completed: Object.freeze([]),
    blocked: Object.freeze(["stale", "failed"]),
    stale: Object.freeze([]),
    failed: Object.freeze(["stale"]),
  });

  class PatternExecutionStepError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionStepError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw stepError("step_structure_invalid", "Шаг содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    }
    throw stepError("step_structure_invalid", "Шаг содержит неподдерживаемое значение.");
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

  function sourceIdentity(session) {
    return {
      sourceSessionId: session?.id ?? null,
      sourceSessionRevision: integer(session?.revision),
      sourceSessionFingerprint: session?.sessionFingerprint ?? null,
      sourceSessionSnapshotFingerprint: session?.planSnapshot?.snapshotFingerprint ?? null,
      sourcePlanId: session?.sourceExecutionPlanId ?? null,
      sourcePlanRevision: integer(session?.sourceExecutionPlanRevision),
      sourcePlanFingerprint: session?.sourceExecutionPlanFingerprint ?? null,
      sourceImportRevision: integer(session?.sourceImportRevision),
    };
  }

  function validateSourceSession(session, projectId, context = {}) {
    const errors = [];
    const add = (code, details = {}) => errors.push(diagnostic(code, details));
    if (!session) add("source_session_missing");
    if (session && session.kind !== "PATTERN_EXECUTION_SESSION") add("source_session_invalid", { field: "kind" });
    if (session && session.projectId !== projectId) add("source_identity_mismatch", { field: "projectId" });
    const allowedSessionStatuses = context.allowCompletedSession ? ["active", "paused", "completed"] : ["active", "paused"];
    if (session && !allowedSessionStatuses.includes(session.status)) add(
      ["stale", "failed"].includes(session.status) ? "source_session_invalid" : "source_session_not_active",
      { status: session.status },
    );
    if (session && (!positiveInteger(session.revision) || !validFingerprint(session.sessionFingerprint))) add("source_session_invalid");
    if (session && (!object(session.planSnapshot) || !validFingerprint(session.planSnapshot?.snapshotFingerprint))) add("source_session_snapshot_invalid");
    if (session && calculateSessionFingerprint(session) !== session.sessionFingerprint) add("source_session_snapshot_invalid", { field: "sessionFingerprint" });

    const sessionApi = getSessionApi();
    const plan = context.executionPlan || null;
    if (!sessionApi) add("source_validator_missing");
    if (sessionApi && session && plan) {
      const validation = sessionApi.validateExecutionSession(session, plan, {
        technologyReview: context.technologyReview || null,
        technologyDraft: context.technologyDraft || null,
        analysisReview: context.analysisReview || null,
        semanticAnalysis: context.semanticAnalysis || null,
        requireCurrentIdentity: context.requireCurrentIdentity !== false,
      });
      for (const item of array(validation.structural)) add("source_session_snapshot_invalid", { sourceCode: item.code });
      for (const item of array(validation.semantic)) add("source_session_snapshot_invalid", { sourceCode: item.code });
      for (const item of array(validation.source)) add("source_identity_mismatch", { sourceCode: item.code });
    } else if (session && context.requireCurrentIdentity !== false) {
      add("source_identity_mismatch", { field: "executionPlan" });
    }

    if (plan) {
      if (plan.kind !== "PATTERN_EXECUTION_PLAN" || plan.projectId !== projectId || plan.status !== "ready") add("source_plan_invalid");
      if (
        plan.id !== session?.sourceExecutionPlanId || plan.revision !== session?.sourceExecutionPlanRevision ||
        plan.planFingerprint !== session?.sourceExecutionPlanFingerprint ||
        plan.sourceImportRevision !== session?.sourceImportRevision
      ) add("source_identity_mismatch", { field: "executionPlanIdentity" });
    }
    if (context.requireCurrentIdentity !== false) {
      for (const [name, value] of [
        ["technologyReview", context.technologyReview], ["technologyDraft", context.technologyDraft],
        ["analysisReview", context.analysisReview], ["semanticAnalysis", context.semanticAnalysis],
      ]) if (!value) add("source_identity_mismatch", { field: name });
    }
    const actionSelection = session ? selectCurrentAction(session) : { valid: false, reasonCode: "current_action_unproven" };
    if (session && !actionSelection.valid && !(context.allowCompletedSession && session.status === "completed")) add(actionSelection.reasonCode, actionSelection.details || {});
    const stable = stableDiagnostics(errors);
    return { valid: stable.length === 0, errors: stable, stale: stable.length > 0, blockers: stable.map(blockerFromDiagnostic), actionSelection };
  }

  function selectCurrentAction(session) {
    const execution = array(session?.execution?.actions).slice().sort((left, right) => numeric(left.order) - numeric(right.order) || lexical(text(left.actionId), text(right.actionId)));
    const snapshotActions = array(session?.planSnapshot?.actions);
    const actionMap = new Map(execution.map((entry) => [entry.actionId, entry]));
    const snapshotMap = new Map(snapshotActions.map((entry) => [entry.actionId, entry]));
    const currentId = session?.currentPosition?.actionId;
    const fixed = actionMap.get(currentId);
    let selected = fixed && !["completed", "skipped"].includes(fixed.status) ? fixed : null;
    if (!selected && !execution.some((entry) => entry.startedAt || ["completed", "skipped", "in_progress"].includes(entry.status))) {
      selected = actionMap.get(session?.planSnapshot?.firstAction?.actionId) || null;
    }
    if (!selected) {
      const completedIndexes = execution.map((entry, index) => [entry, index]).filter(([entry]) => entry.status === "completed");
      const lastIndex = completedIndexes.length ? completedIndexes[completedIndexes.length - 1][1] : -1;
      selected = execution.slice(lastIndex + 1).find((entry) => !["completed", "skipped"].includes(entry.status)) || null;
    }
    if (!selected || !snapshotMap.has(selected.actionId)) return { valid: false, reasonCode: "current_action_unproven" };
    const prerequisites = array(selected.prerequisiteActionIds);
    const incomplete = prerequisites.filter((id) => !["completed", "skipped"].includes(actionMap.get(id)?.status));
    if (incomplete.length) return { valid: false, reasonCode: "prerequisite_incomplete", details: { actionIds: incomplete } };
    const blockerIds = array(selected.blockerIds);
    if (blockerIds.length || selected.status === "blocked") return { valid: false, reasonCode: "current_action_blocked", details: { blockerIds } };
    const actionIndex = execution.findIndex((entry) => entry.actionId === selected.actionId);
    const next = execution.slice(actionIndex + 1).find((entry) => !["completed", "skipped"].includes(entry.status)) || null;
    return {
      valid: true,
      action: copy(selected),
      snapshotAction: copy(snapshotMap.get(selected.actionId)),
      nextAction: next ? copy(next) : null,
      checkpointIds: stableStrings(selected.checkpointIds),
    };
  }

  function createExecutionStep(session, projectId = session?.projectId, options = {}) {
    const now = options.now || timestampNow();
    const source = validateSourceSession(session, projectId, options.context || {});
    if (!source.valid) throwForDiagnostic(source.errors[0]);
    if (options.expectedSessionRevision !== undefined && options.expectedSessionRevision !== session.revision) {
      throw stepError("step_revision_conflict", "Сессия изменилась до создания шага.", { expectedRevision: options.expectedSessionRevision, actualRevision: session.revision });
    }
    const snapshot = buildImmutableSnapshot(session, source.actionSelection);
    const progressState = createProgressState(snapshot);
    const initialBlockers = progressBlockers(progressState, snapshot);
    const status = initialBlockers.length ? "blocked" : "ready";
    const state = {
      id: options.id || makeId(), kind: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      projectId, revision: 1, createdAt: now, updatedAt: now,
      ...sourceIdentity(session),
      componentId: snapshot.component?.componentId ?? null,
      phaseId: snapshot.phase.phaseId,
      actionId: snapshot.action.actionId,
      checkpointId: snapshot.checkpointCriteria[0]?.checkpointId ?? null,
      status,
      lifecycle: { state: status, previousState: "waiting", activatedAt: null, pausedAt: null, checkingAt: null },
      immutableSnapshot: snapshot,
      progressState,
      completionState: { status: "not_started", operationId: null, startedAt: null, completedAt: null, completedBy: null, confirmation: null, finalProgressValues: null, checkpointResult: null, sourceIdentity: null, resultingNextActionReference: null },
      validation: emptyValidation(),
      blockers: initialBlockers,
      staleReason: null,
      failure: null,
      audit: [],
      operations: [],
      stepFingerprint: null,
    };
    appendAudit(state, "created", now, { actionId: state.actionId });
    if (initialBlockers.length) appendAudit(state, "blocked", now, { reasonCode: initialBlockers[0].code });
    sealState(state);
    state.validation = validateExecutionStep(state, session, options.context || {});
    sealState(state);
    return deepFreeze(state);
  }

  function buildImmutableSnapshot(session, selection = selectCurrentAction(session)) {
    if (!selection.valid) throw stepError(selection.reasonCode, errorMessage(selection.reasonCode), selection.details || {});
    const sourceAction = selection.snapshotAction;
    const runtimeAction = selection.action;
    const phase = array(session.planSnapshot.phases).find((entry) => entry.phaseId === runtimeAction.phaseId);
    const component = array(session.planSnapshot.components).find((entry) => entry.componentId === runtimeAction.componentId) || null;
    if (!phase) throw stepError("current_phase_missing", "Фаза текущего действия отсутствует в snapshot сессии.");
    const checkpoints = array(session.planSnapshot.checkpoints).filter((entry) => selection.checkpointIds.includes(entry.checkpointId));
    const prerequisiteSummary = array(runtimeAction.prerequisiteActionIds).map((id) => {
      const item = array(session.execution.actions).find((entry) => entry.actionId === id);
      return { actionId: id, title: item?.title || id, status: item?.status || "missing" };
    });
    const progressSpec = deriveProgressSpec(sourceAction, checkpoints);
    const allowedUserActions = deriveAllowedActions(progressSpec, checkpoints);
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      sourceIdentity: sourceIdentity(session),
      component: component ? { componentId: component.componentId, label: component.label, constructionRole: component.constructionRole || null } : null,
      phase: { phaseId: phase.phaseId, title: phase.title, required: phase.required !== false },
      action: {
        actionId: runtimeAction.actionId, title: runtimeAction.title || sourceAction.title,
        required: runtimeAction.required !== false, progressType: progressSpec.type,
      },
      prerequisiteSummary,
      instruction: text(runtimeAction.instruction || sourceAction.instruction),
      expectedResult: sourceAction.expectedResult ?? checkpointExpectedResult(checkpoints),
      quantity: progressSpec.quantity,
      unit: progressSpec.unit,
      repeatCount: progressSpec.repeatCount,
      rowRange: progressSpec.rowRange,
      stitchCount: progressSpec.stitchCount,
      measurementTarget: copy(progressSpec.measurementTarget),
      measurementRange: copy(progressSpec.measurementRange),
      checkpointCriteria: checkpoints.map((entry) => ({
        criterionId: entry.criterionId || entry.checkpointId,
        checkpointId: entry.checkpointId,
        label: text(entry.label) || checkpointLabel(entry),
        expectedValue: copy(entry.expectedValue),
        unit: entry.unit ?? null,
        required: entry.required !== false,
        allowNotApplicable: entry.allowNotApplicable === true,
        blockingOnFailure: entry.blockingOnFailure !== false,
      })),
      externalCheckpointRequired: checkpoints.length > 0,
      warnings: array(session.planSnapshot.warnings).map((entry) => ({ code: entry.code, message: entry.message })),
      allowedUserActions,
      allowExceedTarget: sourceAction.allowExceedTarget === true,
      allowDeviationConfirmation: sourceAction.allowDeviationConfirmation === true,
      allowManualConfirmation: sourceAction.allowManualConfirmation !== false,
      timedDuration: progressSpec.timedDuration,
      nextActionReference: selection.nextAction ? {
        actionId: selection.nextAction.actionId,
        phaseId: selection.nextAction.phaseId,
        componentId: selection.nextAction.componentId ?? null,
        title: selection.nextAction.title,
      } : null,
      snapshotFingerprint: null,
    };
    const payload = copy(snapshot);
    delete payload.snapshotFingerprint;
    snapshot.snapshotFingerprint = fingerprint(payload);
    return deepFreeze(snapshot);
  }

  function deriveProgressSpec(action, checkpoints) {
    let type = PROGRESS_TYPES.includes(action.progressType) ? action.progressType : null;
    if (type === "checkpoint" && checkpoints.length) type = null;
    const rowRange = normalizeRowRange(action.rowRange);
    const repeatCount = nonNegativeInteger(action.repeatCount ?? action.quantity);
    const stitchCount = nonNegativeInteger(action.stitchCount);
    const measurementTarget = normalizeMeasurementTarget(action.measurementTarget);
    if (!type && rowRange) type = "rows";
    if (!type && action.repeatCount !== undefined) type = "counter";
    if (!type && action.stitchCount !== undefined) type = "stitches";
    if (!type && measurementTarget) type = "measurement";
    // Explicit Stage 22 checkpoints belong to Stage 25. Stage 24 only tracks
    // the local progress of its action and never exposes a duplicate checker.
    if (!type) type = "binary";
    let quantity = nullableNonNegativeInteger(action.quantity);
    let unit = action.unit ?? null;
    if (type === "counter") quantity = repeatCount;
    if (type === "rows" && rowRange) { quantity = rowRange.to - rowRange.from + 1; unit = unit || "rows"; }
    if (type === "stitches") { quantity = stitchCount; unit = unit || "stitches"; }
    if (type === "measurement") unit = measurementTarget?.unit ?? unit;
    return {
      type, quantity, unit, repeatCount, rowRange, stitchCount, measurementTarget,
      measurementRange: normalizeMeasurementRange(action.measurementRange),
      timedDuration: type === "timed" ? copy(action.timedDuration ?? null) : null,
    };
  }

  function createProgressState(snapshot) {
    const type = snapshot.action.progressType;
    const base = { type, valid: true, updatedAt: null };
    if (type === "binary") return { ...base, confirmed: false };
    if (["counter", "rows", "stitches"].includes(type)) {
      const target = type === "counter" ? snapshot.repeatCount : type === "rows" ? snapshot.quantity : snapshot.stitchCount;
      return { ...base, current: 0, target: target ?? null, unit: snapshot.unit, allowExceedTarget: snapshot.allowExceedTarget };
    }
    if (type === "measurement") return {
      ...base, rawValue: null, normalizedValue: null, unit: snapshot.unit,
      target: copy(snapshot.measurementTarget), range: copy(snapshot.measurementRange),
      comparison: null, result: "unknown", userConfirmed: false, deviationAccepted: false,
    };
    if (type === "checkpoint") return {
      ...base,
      criteria: snapshot.checkpointCriteria.map((entry) => ({
        criterionId: entry.criterionId, checkpointId: entry.checkpointId,
        status: "unchecked", required: entry.required, allowNotApplicable: entry.allowNotApplicable,
      })),
    };
    if (type === "timed") return { ...base, duration: copy(snapshot.timedDuration), userConfirmed: false };
    return { ...base, userConfirmed: false };
  }

  function startStep(state, options = {}) {
    return mutate(state, "start", options, ["ready"], "active", "activated", (next, now) => {
      next.lifecycle.activatedAt = next.lifecycle.activatedAt || now;
    });
  }

  function incrementProgress(state, options = {}) {
    return changeCounter(state, 1, "increment", "progress_incremented", options);
  }

  function decrementProgress(state, options = {}) {
    return changeCounter(state, -1, "decrement", "progress_decremented", options);
  }

  function changeCounter(state, delta, operationType, event, options) {
    requireStep(state);
    const duplicate = beginOperation(state, operationType, options);
    if (duplicate) return copy(state);
    if (!["active", "checking"].includes(state.status)) throwInvalidTransition(state.status, "active");
    if (!["counter", "rows", "stitches"].includes(state.progressState.type)) throw stepError("progress_type_invalid", "Для этого шага счётчик недоступен.");
    const before = state.progressState.current;
    const after = before + delta;
    validateCounterValue(after, state.progressState.target, state.progressState.allowExceedTarget);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.progressState.current = after;
    next.progressState.updatedAt = now;
    clearProgressBlockers(next);
    if (next.progressState.target !== null && after === next.progressState.target) transition(next, "checking");
    else if (next.status === "checking") transition(next, "active");
    appendAudit(next, event, now, { before, after });
    recordOperation(next, options.operationId, operationType);
    return finish(next);
  }

  function setProgress(state, value, options = {}) {
    requireStep(state);
    const duplicate = beginOperation(state, "set_progress", options);
    if (duplicate) return copy(state);
    if (!["active", "checking"].includes(state.status)) throwInvalidTransition(state.status, "active");
    const type = state.progressState.type;
    if (!["binary", "counter", "rows", "stitches", "timed", "informational"].includes(type)) throw stepError("progress_type_invalid", "Прямое изменение для этого типа прогресса недоступно.");
    const before = progressValue(state.progressState);
    let after;
    if (type === "binary") after = value === true;
    else if (["timed", "informational"].includes(type)) after = value === true;
    else {
      after = strictInteger(value);
      validateCounterValue(after, state.progressState.target, state.progressState.allowExceedTarget);
    }
    if (canonicalize(before) === canonicalize(after)) return copy(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    if (type === "binary") next.progressState.confirmed = after;
    else if (["timed", "informational"].includes(type)) next.progressState.userConfirmed = after;
    else next.progressState.current = after;
    next.progressState.updatedAt = now;
    clearProgressBlockers(next);
    if (progressTargetReached(next)) transition(next, "checking");
    else if (next.status === "checking") transition(next, "active");
    appendAudit(next, "progress_corrected", now, { before, after, reason: text(options.reason) || null });
    recordOperation(next, options.operationId, "set_progress");
    return finish(next);
  }

  function setMeasurement(state, rawValue, options = {}) {
    requireStep(state);
    const duplicate = beginOperation(state, "set_measurement", options);
    if (duplicate) return copy(state);
    if (!["active", "checking"].includes(state.status) || state.progressState.type !== "measurement") throw stepError("progress_type_invalid", "Измерение сейчас недоступно.");
    const raw = typeof rawValue === "string" ? rawValue.trim() : String(rawValue ?? "").trim();
    if (!raw) throw stepError("measurement_invalid", "Введите измеренное значение.");
    const normalized = Number(raw.replace(",", "."));
    if (!Number.isFinite(normalized) || normalized < 0) throw stepError("measurement_invalid", "Измерение должно быть неотрицательным числом.");
    const comparison = compareMeasurement(normalized, state.progressState.target, state.progressState.range);
    const before = measurementValue(state.progressState);
    const after = { rawValue: raw, normalizedValue: normalized, unit: options.unit || state.progressState.unit, ...comparison, userConfirmed: options.confirmed === true, deviationAccepted: options.acceptDeviation === true };
    if (after.deviationAccepted && !state.immutableSnapshot.allowDeviationConfirmation) throw stepError("measurement_deviation_not_allowed", "Источник не разрешает подтверждать отклонение.");
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    Object.assign(next.progressState, after, { updatedAt: now });
    next.status = "checking";
    next.lifecycle.previousState = state.status;
    next.lifecycle.state = "checking";
    next.lifecycle.checkingAt = now;
    clearProgressBlockers(next);
    if (!["match", "unknown"].includes(after.result) && !after.deviationAccepted) addBlocker(next, "measurement_mismatch", "Измерение не совпадает с ожидаемым; переход заблокирован.", now);
    appendAudit(next, "measurement_recorded", now, { before, after });
    recordOperation(next, options.operationId, "set_measurement");
    return finish(next);
  }

  function setCheckpointCriterion(state, criterionId, status, options = {}) {
    requireStep(state);
    const duplicate = beginOperation(state, "set_checkpoint_criterion", options);
    if (duplicate) return copy(state);
    if (!["active", "checking"].includes(state.status) || state.progressState.type !== "checkpoint") throw stepError("progress_type_invalid", "Checkpoint сейчас недоступен.");
    if (!CRITERION_STATUSES.includes(status)) throw stepError("checkpoint_status_invalid", "Недопустимый результат критерия.");
    const criterion = state.progressState.criteria.find((entry) => entry.criterionId === criterionId);
    if (!criterion) throw stepError("checkpoint_criterion_missing", "Критерий проверки не найден.");
    if (status === "not_applicable" && !criterion.allowNotApplicable) throw stepError("checkpoint_not_applicable_forbidden", "Источник не разрешает исключить этот критерий.");
    if (criterion.status === status) return copy(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    const target = next.progressState.criteria.find((entry) => entry.criterionId === criterionId);
    const before = target.status;
    target.status = status;
    next.progressState.updatedAt = now;
    next.status = "checking";
    next.lifecycle.previousState = state.status;
    next.lifecycle.state = "checking";
    next.lifecycle.checkingAt = now;
    clearProgressBlockers(next);
    const failed = next.progressState.criteria.filter((entry) => entry.status === "failed");
    if (failed.length) addBlocker(next, "checkpoint_failed", "Один или несколько обязательных критериев не пройдены.", now, { criterionIds: failed.map((entry) => entry.criterionId) });
    appendAudit(next, "checkpoint_updated", now, { criterionId, before, after: status });
    recordOperation(next, options.operationId, "set_checkpoint_criterion");
    return finish(next);
  }

  function checkStep(state, options = {}) {
    requireStep(state);
    const duplicate = beginOperation(state, "check", options);
    if (duplicate) return copy(state);
    if (state.status !== "active") throwInvalidTransition(state.status, "checking");
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    transition(next, "checking");
    next.lifecycle.checkingAt = now;
    if (next.progressState.type === "binary" && options.confirmed === true) next.progressState.confirmed = true;
    if (["timed", "informational"].includes(next.progressState.type) && options.confirmed === true) next.progressState.userConfirmed = true;
    next.progressState.updatedAt = now;
    recordOperation(next, options.operationId, "check");
    return finish(next);
  }

  function pauseStep(state, options = {}) {
    return mutate(state, "pause", options, ["active"], "paused", "paused", (next, now) => {
      next.lifecycle.pausedAt = now;
      next.lifecycle.pauseReason = text(options.reason) || null;
    });
  }

  function resumeStep(state, options = {}) {
    return mutate(state, "resume", options, ["paused"], "active", "resumed", (next) => {
      next.lifecycle.pauseReason = null;
    });
  }

  function beginCompletion(state, session, options = {}) {
    requireStep(state);
    const duplicate = beginOperation(state, "complete", options);
    if (duplicate) return copy(state);
    if (options.confirmed !== true) throw stepError("completion_confirmation_required", "Завершение требует явного подтверждения пользователя.");
    if (array(state.immutableSnapshot?.checkpointCriteria).length) {
      throw stepError("external_checkpoint_required", "Результат этого action должен быть подтверждён в отдельном checkpoint Stage 25.");
    }
    if (!["active", "checking"].includes(state.status)) throwInvalidTransition(state.status, "checking");
    const source = validateStepSource(state, session, options.context || {}, { allowSynchronizedSession: false });
    if (!source.valid) throwForDiagnostic(source.errors[0]);
    const blockers = completionBlockers(state);
    if (blockers.length) throw stepError("completion_blocked", "Шаг нельзя завершить, пока не устранены blockers.", { blockers });
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    if (next.status === "active") transition(next, "checking");
    next.lifecycle.checkingAt = next.lifecycle.checkingAt || now;
    next.completionState = {
      ...next.completionState,
      status: "sync_pending", operationId: options.operationId, startedAt: now,
      confirmation: { confirmed: true, text: text(options.confirmation) || "user_confirmed" },
      sourceIdentity: sourceIdentity(session),
    };
    appendAudit(next, "completion_started", now, { operationId: options.operationId, actionId: state.actionId });
    recordOperation(next, options.operationId, "complete", "pending");
    return finish(next);
  }

  function finalizeCompletion(state, session, options = {}) {
    requireStep(state);
    if (state.status === "completed" && state.completionState.operationId === options.operationId) return copy(state);
    if (state.status !== "checking" || state.completionState.status !== "sync_pending" || state.completionState.operationId !== options.operationId) {
      throw stepError("completion_not_pending", "Нет ожидающего завершения с таким operationId.");
    }
    const completedAction = array(session?.execution?.actions).find((entry) => entry.actionId === state.actionId && entry.status === "completed");
    const audit = array(session?.audit).find((entry) => entry.event === "action_completed" && entry.actionId === state.actionId && entry.operationId === options.operationId);
    if (!completedAction || !audit) throw stepError("session_completion_unproven", "Stage 23 ещё не зафиксировал завершение текущего действия.");
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    transition(next, "completed");
    next.blockers = [];
    next.failure = null;
    next.completionState = {
      ...next.completionState,
      status: "completed", completedAt: now, completedBy: "user",
      finalProgressValues: copy(next.progressState),
      checkpointResult: checkpointResult(next),
      sourceIdentity: { original: copy(next.immutableSnapshot.sourceIdentity), resultingSession: sourceIdentity(session) },
      resultingNextActionReference: provenNextReference(next, session),
    };
    appendAudit(next, options.recovered ? "completion_recovered" : "completed", now, { operationId: options.operationId, actionId: state.actionId });
    updateOperation(next, options.operationId, "complete", "completed");
    return finish(next);
  }

  function finalizeCheckpointCompletion(state, session, checkpoint, options = {}) {
    requireStep(state);
    const operationId = requireOperationId(options.operationId);
    if (state.status === "completed" && state.completionState.operationId === operationId) return copy(state);
    checkRevision(state, options.expectedRevision);
    if (!["active", "checking"].includes(state.status)) throwInvalidTransition(state.status, "completed");
    if (!checkpoint || checkpoint.kind !== "PATTERN_EXECUTION_CHECKPOINT" || checkpoint.status !== "sync_pending" || checkpoint.actionId !== state.actionId) {
      throw stepError("external_checkpoint_unproven", "Связанный checkpoint не доказан.");
    }
    if (!array(state.immutableSnapshot.checkpointCriteria).some((entry) => entry.checkpointId === checkpoint.checkpointId)) {
      throw stepError("external_checkpoint_unproven", "Checkpoint отсутствует в immutable snapshot шага.");
    }
    const completedAction = array(session?.execution?.actions).find((entry) => entry.actionId === state.actionId && entry.status === "completed");
    const audit = array(session?.audit).find((entry) => entry.event === "action_completed" && entry.actionId === state.actionId && entry.operationId === operationId);
    if (!completedAction || !audit) throw stepError("session_completion_unproven", "Stage 23 ещё не зафиксировал подтверждение checkpoint.");
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    transition(next, "completed");
    next.blockers = [];
    next.failure = null;
    next.completionState = {
      status: "completed", operationId, startedAt: checkpoint.synchronization?.startedAt || now,
      completedAt: now, completedBy: "checkpoint", confirmation: { confirmed: true, text: "stage25_confirmed" },
      finalProgressValues: copy(next.progressState),
      checkpointResult: { checkpointRecordId: checkpoint.id, checkpointId: checkpoint.checkpointId, decision: "confirmed" },
      sourceIdentity: { original: copy(next.immutableSnapshot.sourceIdentity), resultingSession: sourceIdentity(session) },
      resultingNextActionReference: provenNextReference(next, session),
    };
    appendAudit(next, "completed", now, { operationId, actionId: state.actionId, checkpointRecordId: checkpoint.id });
    recordOperation(next, operationId, "checkpoint_complete", "completed");
    return finish(next);
  }

  function recoverStep(state, session, options = {}) {
    requireStep(state);
    const duplicate = beginOperation(state, "recovery", options);
    if (duplicate) return copy(state);
    if (state.status === "checking" && state.completionState.status === "sync_pending") {
      const pendingId = state.completionState.operationId;
      const action = array(session?.execution?.actions).find((entry) => entry.actionId === state.actionId);
      const acknowledged = array(session?.audit).some((entry) => entry.event === "action_completed" && entry.actionId === state.actionId && entry.operationId === pendingId);
      if (action?.status === "completed" && acknowledged) {
        const recovered = finalizeCompletion(state, session, { operationId: pendingId, now: options.now, recovered: true });
        const next = mutable(recovered);
        recordOperation(next, options.operationId, "recovery", "completed");
        sealState(next);
        return deepFreeze(next);
      }
      const source = validateStepSource(state, session, options.context || {}, { allowSynchronizedSession: false });
      if (!source.valid) return markStale(state, source.errors[0]?.code || "source_identity_mismatch", { ...options, operationType: "recovery" });
      const next = mutable(state);
      const now = options.now || timestampNow();
      prepareRevision(next, now);
      recordOperation(next, options.operationId, "recovery", "sync_pending");
      return finish(next);
    }
    const structural = validateStructural(state);
    const semantic = structural.length ? [] : validateSemantic(state);
    if (structural.length || semantic.length) return markFailed(state, "corrupted_progress_state", { ...options, operationType: "recovery" });
    const source = validateStepSource(state, session, options.context || {}, { allowSynchronizedSession: true });
    if (!source.valid) return markStale(state, source.errors[0]?.code || "source_identity_mismatch", { ...options, operationType: "recovery" });
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    recordOperation(next, options.operationId, "recovery", "restored");
    return finish(next);
  }

  function rebuildStep(state, session, options = {}) {
    requireStep(state);
    const duplicate = beginOperation(state, "rebuild", options);
    if (duplicate) return copy(state);
    if (options.confirmed !== true) throw stepError("rebuild_confirmation_required", "Перестроение требует явного подтверждения.");
    const source = validateSourceSession(session, state.projectId, options.context || {});
    if (!source.valid) throwForDiagnostic(source.errors[0]);
    const now = options.now || timestampNow();
    const snapshot = buildImmutableSnapshot(session, source.actionSelection);
    const compatible = compatibleProgress(state.immutableSnapshot, snapshot, state.progressState);
    const next = mutable(state);
    prepareRevision(next, now);
    appendAudit(next, "rebuild_started", now, { operationId: options.operationId, previousActionId: state.actionId });
    Object.assign(next, sourceIdentity(session));
    next.componentId = snapshot.component?.componentId ?? null;
    next.phaseId = snapshot.phase.phaseId;
    next.actionId = snapshot.action.actionId;
    next.checkpointId = snapshot.checkpointCriteria[0]?.checkpointId ?? null;
    next.immutableSnapshot = snapshot;
    next.progressState = compatible ? copy(state.progressState) : createProgressState(snapshot);
    next.completionState = { status: "not_started", operationId: null, startedAt: null, completedAt: null, completedBy: null, confirmation: null, finalProgressValues: null, checkpointResult: null, sourceIdentity: null, resultingNextActionReference: null };
    next.blockers = progressBlockers(next.progressState, snapshot);
    next.staleReason = null;
    next.failure = null;
    next.status = next.blockers.length ? "blocked" : "ready";
    next.lifecycle = { state: next.status, previousState: state.status, activatedAt: null, pausedAt: null, checkingAt: null };
    appendAudit(next, "rebuilt", now, { operationId: options.operationId, compatibleProgressPreserved: compatible, actionId: next.actionId });
    recordOperation(next, options.operationId, "rebuild");
    return finish(next);
  }

  function detectStepStaleness(state, session, context = {}) {
    requireStep(state);
    const result = validateStepSource(state, session, context, { allowSynchronizedSession: true });
    return { stale: !result.valid, reasonCode: result.errors[0]?.code || null, errors: result.errors, blockers: result.blockers };
  }

  function validateExecutionStep(state, session = null, context = {}) {
    const structural = validateStructural(state);
    const semantic = structural.length ? [] : validateSemantic(state);
    const source = session && !structural.length ? validateStepSource(state, session, context, { allowSynchronizedSession: true }) : { valid: !session, errors: [], blockers: [] };
    const errors = stableDiagnostics([...structural, ...semantic, ...source.errors]);
    const blockers = stableBlockers([...array(state?.blockers), ...array(source.blockers)]);
    return {
      valid: errors.length === 0 && blockers.length === 0,
      errors,
      warnings: array(state?.immutableSnapshot?.warnings).map((entry) => diagnostic(entry.code || "warning", { message: entry.message }, "warning")),
      stale: Boolean(session && !source.valid) || state?.status === "stale",
      blockers,
      structural,
      semantic,
      source: source.errors,
    };
  }

  function validateStructural(state) {
    const errors = [];
    const add = (code, details = {}) => errors.push(diagnostic(code, details));
    if (!object(state) || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION) add("step_structure_invalid", { field: "header" });
    if (!text(state?.id) || !text(state?.projectId) || !positiveInteger(state?.revision) || !STATUSES.includes(state?.status)) add("step_structure_invalid", { field: "identity" });
    if (!isTimestamp(state?.createdAt) || !isTimestamp(state?.updatedAt)) add("step_structure_invalid", { field: "timestamps" });
    for (const key of ["sourceSessionId", "sourceSessionFingerprint", "sourcePlanId", "sourcePlanFingerprint", "phaseId", "actionId"]) if (!text(state?.[key])) add("step_structure_invalid", { field: key });
    for (const key of ["sourceSessionRevision", "sourcePlanRevision", "sourceImportRevision"]) if (!positiveInteger(state?.[key])) add("step_structure_invalid", { field: key });
    if (!object(state?.immutableSnapshot) || !validFingerprint(state?.immutableSnapshot?.snapshotFingerprint)) add("step_structure_invalid", { field: "immutableSnapshot" });
    if (object(state?.immutableSnapshot)) {
      const payload = copy(state.immutableSnapshot); delete payload.snapshotFingerprint;
      if (fingerprint(payload) !== state.immutableSnapshot.snapshotFingerprint) add("immutable_snapshot_changed");
    }
    if (!object(state?.progressState) || !PROGRESS_TYPES.includes(state?.progressState?.type)) add("step_structure_invalid", { field: "progressState" });
    if (!object(state?.completionState) || !object(state?.lifecycle) || state?.lifecycle?.state !== state?.status) add("step_structure_invalid", { field: "lifecycle" });
    if (!Array.isArray(state?.audit) || state.audit.length > AUDIT_LIMIT || !Array.isArray(state?.operations)) add("step_structure_invalid", { field: "audit" });
    for (const event of array(state?.audit)) if (!AUDIT_EVENTS.includes(event?.event) || !isTimestamp(event?.at) || !positiveInteger(event?.revision)) add("step_structure_invalid", { field: "auditEvent" });
    for (const operation of array(state?.operations)) if (!text(operation?.operationId) || !text(operation?.type) || !positiveInteger(operation?.revision)) add("step_structure_invalid", { field: "operation" });
    if (!validFingerprint(state?.stepFingerprint) || calculateStepFingerprint(state) !== state.stepFingerprint) add("step_structure_invalid", { field: "stepFingerprint" });
    return stableDiagnostics(errors);
  }

  function validateSemantic(state) {
    const errors = [];
    const add = (code, details = {}) => errors.push(diagnostic(code, details));
    const progress = state.progressState;
    if (["counter", "rows", "stitches"].includes(progress.type)) {
      if (!Number.isInteger(progress.current) || progress.current < 0) add("progress_value_invalid");
      if (progress.target !== null && (!Number.isInteger(progress.target) || progress.target < 0)) add("progress_target_invalid");
      if (progress.target !== null && progress.current > progress.target && !progress.allowExceedTarget) add("progress_target_exceeded");
    }
    if (progress.type === "measurement") {
      if (progress.rawValue !== null && (!text(progress.rawValue) || !Number.isFinite(progress.normalizedValue) || progress.normalizedValue < 0)) add("measurement_invalid");
      if (!["match", "below", "above", "unknown"].includes(progress.result)) add("measurement_invalid");
      if (progress.deviationAccepted && !state.immutableSnapshot.allowDeviationConfirmation) add("measurement_deviation_not_allowed");
    }
    if (progress.type === "checkpoint") {
      const ids = new Set();
      for (const criterion of array(progress.criteria)) {
        if (!text(criterion.criterionId) || ids.has(criterion.criterionId) || !CRITERION_STATUSES.includes(criterion.status)) add("checkpoint_invalid");
        if (criterion.status === "not_applicable" && !criterion.allowNotApplicable) add("checkpoint_not_applicable_forbidden");
        ids.add(criterion.criterionId);
      }
      if (ids.size !== array(state.immutableSnapshot.checkpointCriteria).length) add("checkpoint_invalid");
    }
    if (state.status === "completed") {
      if (state.completionState.status !== "completed" || !["user", "checkpoint"].includes(state.completionState.completedBy) || !isTimestamp(state.completionState.completedAt)) add("completion_invalid");
      if (completionBlockers(state).length) add("completion_invalid");
    }
    if (state.status === "blocked" && !array(state.blockers).length) add("blocked_without_reason");
    if (state.status === "stale" && !text(state.staleReason)) add("stale_without_reason");
    return stableDiagnostics(errors);
  }

  function validateStepSource(state, session, context, options = {}) {
    const base = validateSourceSession(session, state.projectId, {
      ...context,
      allowCompletedSession: Boolean(options.allowSynchronizedSession && ["sync_pending", "completed"].includes(state.completionState?.status)),
    });
    const errors = [...base.errors];
    if (base.valid) {
      const expected = sourceIdentity(session);
      const originalMatches = ["sourceSessionId", "sourceSessionRevision", "sourceSessionFingerprint", "sourceSessionSnapshotFingerprint", "sourcePlanId", "sourcePlanRevision", "sourcePlanFingerprint", "sourceImportRevision"]
        .every((key) => (state[key] ?? null) === (expected[key] ?? null));
      let synchronizedMatches = false;
      if (options.allowSynchronizedSession && ["sync_pending", "completed"].includes(state.completionState?.status)) {
        const resulting = state.completionState?.sourceIdentity?.resultingSession || null;
        const action = array(session.execution?.actions).find((entry) => entry.actionId === state.actionId);
        const acknowledged = array(session.audit).some((entry) => entry.event === "action_completed" && entry.actionId === state.actionId && entry.operationId === state.completionState.operationId);
        synchronizedMatches = Boolean(resulting && canonicalize(resulting) === canonicalize(expected) && action?.status === "completed" && acknowledged);
      }
      if (!originalMatches && !synchronizedMatches) errors.push(diagnostic("source_session_changed"));
      if (state.sourcePlanId !== session.sourceExecutionPlanId || state.sourcePlanRevision !== session.sourceExecutionPlanRevision || state.sourcePlanFingerprint !== session.sourceExecutionPlanFingerprint || state.sourceImportRevision !== session.sourceImportRevision) errors.push(diagnostic("source_identity_mismatch", { field: "plan" }));
      const selection = selectCurrentAction(session);
      const actionCompletedByThisStep = array(session.execution?.actions).some((entry) => entry.actionId === state.actionId && entry.status === "completed") && array(session.audit).some((entry) => entry.event === "action_completed" && entry.actionId === state.actionId && entry.operationId === state.completionState?.operationId);
      if ((!selection.valid || selection.action?.actionId !== state.actionId) && !actionCompletedByThisStep) errors.push(diagnostic("current_action_changed"));
      const phaseExists = array(session.planSnapshot?.phases).some((entry) => entry.phaseId === state.phaseId);
      const componentExists = state.componentId === null || array(session.planSnapshot?.components).some((entry) => entry.componentId === state.componentId);
      const actionExists = array(session.planSnapshot?.actions).some((entry) => entry.actionId === state.actionId);
      if (!phaseExists || !componentExists || !actionExists) errors.push(diagnostic("source_selection_missing"));
    }
    const stable = stableDiagnostics(errors);
    return { valid: stable.length === 0, errors: stable, blockers: stable.map(blockerFromDiagnostic) };
  }

  function markStale(state, reasonCode, options = {}) {
    requireStep(state);
    const duplicate = options.operationId ? beginOperation(state, options.operationType || "stale_validation", options) : false;
    if (duplicate || state.status === "stale") return copy(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "stale";
    next.lifecycle.previousState = state.status;
    next.lifecycle.state = "stale";
    next.staleReason = reasonCode;
    next.failure = null;
    next.blockers = [{ code: reasonCode, message: errorMessage(reasonCode), details: {} }];
    appendAudit(next, "stale_detected", now, { reasonCode });
    if (options.operationId) recordOperation(next, options.operationId, options.operationType || "stale_validation");
    return finish(next);
  }

  function markFailed(state, reasonCode, options = {}) {
    requireStep(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "failed";
    next.lifecycle.previousState = state.status;
    next.lifecycle.state = "failed";
    next.failure = { code: reasonCode, message: errorMessage(reasonCode) };
    appendAudit(next, "failed", now, { reasonCode });
    if (options.operationId) recordOperation(next, options.operationId, options.operationType || "failure");
    return finish(next);
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project || null;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    if (!project || !calculation) return { state: "missing_project", project, calculation, executionStep: null, executionSession: null };
    const progress = array(aggregate.progress).filter((entry) => entry.calculation_id === calculation.calculation_id && entry.epoch === 1);
    const find = (kind) => progress.find((entry) => entry.kind === kind) || null;
    const context = {
      executionPlan: find("PATTERN_EXECUTION_PLAN")?.state || null,
      technologyReview: find("PATTERN_TECHNOLOGY_REVIEW")?.state || null,
      technologyDraft: find("PATTERN_TECHNOLOGY_DRAFT")?.state || null,
      analysisReview: find("PATTERN_ANALYSIS_REVIEW")?.state || null,
      semanticAnalysis: find("PATTERN_SEMANTIC_ANALYSIS")?.state || null,
      requireCurrentIdentity: true,
    };
    const executionSessionProgress = find("PATTERN_EXECUTION_SESSION");
    const executionStepProgress = find(PROGRESS_KIND);
    const executionSession = executionSessionProgress?.state || null;
    const executionStep = executionStepProgress?.state || null;
    const sourceValidation = validateSourceSession(executionSession, project.project_id, context);
    if (!executionStep) return { state: sourceValidation.valid ? "creatable" : "blocked", reasonCode: sourceValidation.errors[0]?.code || null, project, calculation, executionSession, executionSessionProgress, executionStep: null, executionStepProgress, context, sourceValidation };
    const stale = detectStepStaleness(executionStep, executionSession, context);
    return { state: stale.stale ? "stale" : executionStep.status, reasonCode: stale.reasonCode, project, calculation, executionSession, executionSessionProgress, executionStep, executionStepProgress, context, sourceValidation, stale };
  }

  async function ensureForProject(repository, projectId, options = {}) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.project || !inspected.calculation) return inspected;
    if (!inspected.executionStep && inspected.sourceValidation.valid) {
      const initial = createExecutionStep(inspected.executionSession, projectId, { context: inspected.context, expectedSessionRevision: inspected.executionSession.revision, operationId: options.operationId });
      await repository.ensurePatternExecutionStep(projectId, inspected.calculation.calculation_id, initial, { operationKind: "PATTERN_EXECUTION_STEP_CREATED", projectStage: "pattern_execution_step_ready" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.executionStep && inspected.state === "stale" && inspected.executionStep.status !== "stale") {
      const stale = markStale(inspected.executionStep, inspected.reasonCode || "source_identity_mismatch", { operationId: options.operationId || makeOperationId("stale"), operationType: "stale_validation" });
      await repository.updatePatternExecutionStep(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_EXECUTION_STEP_STALE", projectStage: "pattern_execution_step_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function applyForProject(repository, projectId, operation, options = {}) {
    const inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.executionStep) throw stepError("execution_step_missing", "Исполняемый шаг не создан.");
    const expectedRevision = options.expectedRevision === undefined ? inspected.executionStep.revision : options.expectedRevision;
    const next = operation(inspected.executionStep, inspected.executionSession, { ...options, expectedRevision, context: inspected.context });
    if (canonicalize(next) === canonicalize(inspected.executionStep)) return inspected;
    await repository.updatePatternExecutionStep(projectId, inspected.calculation.calculation_id, next, {
      operationKind: options.operationKind || `PATTERN_EXECUTION_STEP_${next.status.toUpperCase()}`,
      projectStage: `pattern_execution_step_${next.status}`,
    });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function completeForProject(repository, projectId, options = {}) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.executionStep) throw stepError("execution_step_missing", "Исполняемый шаг не создан.");
    const operationId = requireOperationId(options.operationId);
    if (inspected.executionStep.status === "completed" && inspected.executionStep.completionState.operationId === operationId) return inspected;
    if (!(inspected.executionStep.status === "checking" && inspected.executionStep.completionState.status === "sync_pending" && inspected.executionStep.completionState.operationId === operationId)) {
      const pending = beginCompletion(inspected.executionStep, inspected.executionSession, { ...options, operationId, expectedRevision: options.expectedRevision ?? inspected.executionStep.revision, context: inspected.context });
      await repository.updatePatternExecutionStep(projectId, inspected.calculation.calculation_id, pending, { operationKind: "PATTERN_EXECUTION_STEP_COMPLETION_STARTED", projectStage: "pattern_execution_step_checking" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    await repository.syncPatternExecutionStepCompletion(projectId, inspected.calculation.calculation_id, {
      stepState: inspected.executionStep,
      expectedSessionRevision: options.expectedSessionRevision ?? inspected.executionSession.revision,
      operationId,
    });
    inspected = inspectAggregate(await repository.getProject(projectId));
    const completed = finalizeCompletion(inspected.executionStep, inspected.executionSession, { operationId, now: options.now });
    await repository.updatePatternExecutionStep(projectId, inspected.calculation.calculation_id, completed, { operationKind: "PATTERN_EXECUTION_STEP_COMPLETED", projectStage: "pattern_execution_step_completed" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function recoverForProject(repository, projectId, options = {}) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.executionStep) return inspected;
    const operationId = requireOperationId(options.operationId);
    if (inspected.executionStep.status === "checking" && inspected.executionStep.completionState.status === "sync_pending") {
      const pendingId = inspected.executionStep.completionState.operationId;
      const action = array(inspected.executionSession?.execution?.actions).find((entry) => entry.actionId === inspected.executionStep.actionId);
      const acknowledged = array(inspected.executionSession?.audit).some((entry) => entry.event === "action_completed" && entry.actionId === inspected.executionStep.actionId && entry.operationId === pendingId);
      if (!(action?.status === "completed" && acknowledged)) {
        await repository.syncPatternExecutionStepCompletion(projectId, inspected.calculation.calculation_id, {
          stepState: inspected.executionStep, expectedSessionRevision: inspected.executionSession.revision, operationId: pendingId,
        });
        inspected = inspectAggregate(await repository.getProject(projectId));
      }
    }
    const recovered = recoverStep(inspected.executionStep, inspected.executionSession, { ...options, operationId, context: inspected.context });
    if (canonicalize(recovered) !== canonicalize(inspected.executionStep)) {
      await repository.updatePatternExecutionStep(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_EXECUTION_STEP_RECOVERED", projectStage: `pattern_execution_step_${recovered.status}` });
    }
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function rebuildForProject(repository, projectId, options = {}) {
    return applyForProject(repository, projectId, (state, session, settings) => rebuildStep(state, session, settings), { ...options, operationKind: "PATTERN_EXECUTION_STEP_REBUILT" });
  }

  function mutate(state, operationType, options, allowedStatuses, targetStatus, event, apply) {
    requireStep(state);
    const duplicate = beginOperation(state, operationType, options);
    if (duplicate) return copy(state);
    if (!allowedStatuses.includes(state.status)) throwInvalidTransition(state.status, targetStatus);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    transition(next, targetStatus);
    apply(next, now);
    appendAudit(next, event, now, { reason: text(options.reason) || null });
    recordOperation(next, options.operationId, operationType);
    return finish(next);
  }

  function beginOperation(state, type, options) {
    const operationId = requireOperationId(options.operationId);
    const existing = array(state.operations).find((entry) => entry.operationId === operationId);
    if (existing) {
      if (existing.type !== type && !(type === "recovery" && existing.type === "complete")) throw stepError("operation_id_reused", "operationId уже использован другой операцией.");
      return existing;
    }
    checkRevision(state, options.expectedRevision);
    return null;
  }

  function prepareRevision(state, now) {
    state.revision += 1;
    state.updatedAt = now;
    state.lifecycle.previousState = state.status;
  }

  function transition(state, target) {
    if (state.status === target) { state.lifecycle.state = target; return; }
    if (!array(TRANSITIONS[state.status]).includes(target)) throwInvalidTransition(state.status, target);
    state.lifecycle.previousState = state.status;
    state.status = target;
    state.lifecycle.state = target;
  }

  function recordOperation(state, operationId, type, result = "applied") {
    state.operations = [...array(state.operations), { operationId, type, result, revision: state.revision }].slice(-OPERATION_LIMIT);
  }

  function updateOperation(state, operationId, type, result) {
    const operation = array(state.operations).find((entry) => entry.operationId === operationId && entry.type === type);
    if (operation) { operation.result = result; operation.revision = state.revision; }
    else recordOperation(state, operationId, type, result);
  }

  function appendAudit(state, event, at, details = {}) {
    state.audit = [...array(state.audit), { event, at, revision: state.revision, ...copy(details) }].slice(-AUDIT_LIMIT);
  }

  function finish(state) {
    sealState(state);
    state.validation = validateExecutionStep(state);
    sealState(state);
    return deepFreeze(state);
  }

  function sealState(state) {
    state.stepFingerprint = null;
    state.stepFingerprint = calculateStepFingerprint(state);
  }

  function calculateStepFingerprint(state) {
    const payload = copy(state);
    delete payload.stepFingerprint;
    if (payload.validation) {
      payload.validation = { valid: payload.validation.valid, stale: payload.validation.stale };
    }
    return fingerprint(payload);
  }

  function calculateSessionFingerprint(session) {
    const sessionApi = getSessionApi();
    if (sessionApi?.calculateSessionFingerprint) return sessionApi.calculateSessionFingerprint(session);
    const payload = copy(session); delete payload.sessionFingerprint; return fingerprint(payload);
  }

  function completionBlockers(state) {
    const blockers = [...array(state.blockers)];
    if (!progressTargetReached(state)) blockers.push({ code: "required_progress_incomplete", message: "Обязательный прогресс не достигнут." });
    if (state.progressState.type === "measurement") {
      const value = state.progressState;
      if (!value.userConfirmed) blockers.push({ code: "measurement_confirmation_required", message: "Подтвердите измерение." });
      if (!["match", "unknown"].includes(value.result) && !value.deviationAccepted) blockers.push({ code: "measurement_mismatch", message: "Расхождение измерения не разрешено источником." });
    }
    if (state.progressState.type === "checkpoint") {
      for (const criterion of state.progressState.criteria) if (criterion.required && criterion.status !== "passed" && !(criterion.status === "not_applicable" && criterion.allowNotApplicable)) blockers.push({ code: "checkpoint_required", message: "Обязательный критерий не пройден.", criterionId: criterion.criterionId });
    }
    return stableBlockers(blockers);
  }

  function progressTargetReached(state) {
    const progress = state.progressState;
    if (progress.type === "binary") return progress.confirmed === true;
    if (["counter", "rows"].includes(progress.type)) return progress.target !== null && progress.current === progress.target;
    if (progress.type === "stitches") return progress.target === null ? Number.isInteger(progress.current) : progress.current === progress.target;
    if (progress.type === "measurement") return progress.rawValue !== null && progress.userConfirmed && (progress.result === "match" || progress.result === "unknown" || progress.deviationAccepted);
    if (progress.type === "checkpoint") return progress.criteria.every((entry) => !entry.required || entry.status === "passed" || entry.status === "not_applicable" && entry.allowNotApplicable);
    return progress.userConfirmed === true;
  }

  function progressBlockers(progress, snapshot) {
    if (["counter", "rows"].includes(progress.type) && progress.target === null) return [{ code: "progress_target_missing", message: "Источник не содержит обязательную числовую цель.", details: {} }];
    if (progress.type === "measurement" && !progress.target && !progress.range) return [{ code: "measurement_target_missing", message: "Источник не содержит цели измерения.", details: {} }];
    if (progress.type === "checkpoint" && !snapshot.checkpointCriteria.length) return [{ code: "checkpoint_criteria_missing", message: "Источник не содержит критерии checkpoint.", details: {} }];
    if (["timed", "informational"].includes(progress.type) && !snapshot.timedDuration && progress.type === "timed") return [{ code: "timed_target_missing", message: "Источник не содержит длительность.", details: {} }];
    return [];
  }

  function clearProgressBlockers(state) {
    const clearable = new Set(["measurement_mismatch", "checkpoint_failed", "required_progress_incomplete"]);
    state.blockers = array(state.blockers).filter((entry) => !clearable.has(entry.code));
  }

  function addBlocker(state, code, message, now, details = {}) {
    state.blockers = stableBlockers([...array(state.blockers), { code, message, details: copy(details) }]);
    appendAudit(state, "blocked", now, { reasonCode: code, ...copy(details) });
  }

  function validateCounterValue(value, target, allowExceed) {
    if (!Number.isInteger(value) || value < 0) throw stepError("progress_value_invalid", "Значение должно быть целым неотрицательным числом.");
    if (target !== null && value > target && !allowExceed) throw stepError("progress_target_exceeded", "Нельзя превысить цель этого шага.");
  }

  function compareMeasurement(value, target, range) {
    if (range) {
      if (value < range.min) return { comparison: { actual: value, min: range.min, max: range.max }, result: "below" };
      if (value > range.max) return { comparison: { actual: value, min: range.min, max: range.max }, result: "above" };
      return { comparison: { actual: value, min: range.min, max: range.max }, result: "match" };
    }
    const expected = measurementNumber(target);
    if (expected === null) return { comparison: null, result: "unknown" };
    return { comparison: { actual: value, target: expected }, result: value === expected ? "match" : value < expected ? "below" : "above" };
  }

  function compatibleProgress(beforeSnapshot, afterSnapshot, progress) {
    if (!beforeSnapshot || beforeSnapshot.action?.actionId !== afterSnapshot.action.actionId || beforeSnapshot.action?.progressType !== afterSnapshot.action.progressType) return false;
    if (canonicalize({ quantity: beforeSnapshot.quantity, unit: beforeSnapshot.unit, repeatCount: beforeSnapshot.repeatCount, rowRange: beforeSnapshot.rowRange, stitchCount: beforeSnapshot.stitchCount, measurementTarget: beforeSnapshot.measurementTarget, measurementRange: beforeSnapshot.measurementRange, checkpointCriteria: beforeSnapshot.checkpointCriteria }) !== canonicalize({ quantity: afterSnapshot.quantity, unit: afterSnapshot.unit, repeatCount: afterSnapshot.repeatCount, rowRange: afterSnapshot.rowRange, stitchCount: afterSnapshot.stitchCount, measurementTarget: afterSnapshot.measurementTarget, measurementRange: afterSnapshot.measurementRange, checkpointCriteria: afterSnapshot.checkpointCriteria })) return false;
    return validateProgressShape(progress).length === 0;
  }

  function validateProgressShape(progress) {
    if (!object(progress) || !PROGRESS_TYPES.includes(progress.type)) return [diagnostic("progress_structure_invalid")];
    return [];
  }

  function checkpointResult(state) {
    if (state.progressState.type !== "checkpoint") return null;
    return { passed: state.progressState.criteria.every((entry) => !entry.required || entry.status === "passed" || entry.status === "not_applicable" && entry.allowNotApplicable), criteria: copy(state.progressState.criteria) };
  }

  function provenNextReference(state, session) {
    const original = state.immutableSnapshot.nextActionReference;
    if (!original) return null;
    const current = session.currentPosition;
    return current?.actionId === original.actionId && current?.phaseId === original.phaseId ? copy(original) : null;
  }

  function deriveAllowedActions(progressSpec, checkpoints) {
    const actions = ["start", "pause", "resume", "complete", "rebuild"];
    if (["counter", "rows", "stitches"].includes(progressSpec.type)) actions.push("increment", "decrement", "set_progress");
    if (progressSpec.type === "measurement") actions.push("set_measurement");
    if (progressSpec.type === "checkpoint" && !checkpoints.length) actions.push("set_checkpoint_criterion");
    if (["binary", "timed", "informational"].includes(progressSpec.type)) actions.push("check", "set_progress");
    return stableStrings(actions);
  }

  function checkpointExpectedResult(checkpoints) {
    if (!checkpoints.length) return null;
    return checkpoints.map((entry) => ({ value: copy(entry.expectedValue), unit: entry.unit ?? null }));
  }

  function checkpointLabel(entry) {
    const value = scalar(entry.expectedValue);
    return value === null ? "Проверить обязательный критерий" : `Подтвердить ${value}${entry.unit ? ` ${entry.unit}` : ""}`;
  }

  function normalizeRowRange(value) {
    if (!object(value)) return null;
    const from = strictIntegerOrNull(value.from ?? value.start);
    const to = strictIntegerOrNull(value.to ?? value.end);
    return from !== null && to !== null && from >= 0 && to >= from ? { from, to } : null;
  }

  function normalizeMeasurementTarget(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? { value, unit: null } : null;
    if (!object(value)) return null;
    const number = measurementNumber(value);
    return number === null || number < 0 ? null : { value: number, unit: value.unit ?? null };
  }

  function normalizeMeasurementRange(value) {
    if (!object(value)) return null;
    const min = Number(value.min); const max = Number(value.max);
    return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min ? { min, max, unit: value.unit ?? null } : null;
  }

  function measurementNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (object(value) && Number.isFinite(Number(value.value))) return Number(value.value);
    return null;
  }

  function measurementValue(progress) {
    return { rawValue: progress.rawValue, normalizedValue: progress.normalizedValue, unit: progress.unit, comparison: copy(progress.comparison), result: progress.result, userConfirmed: progress.userConfirmed, deviationAccepted: progress.deviationAccepted };
  }

  function progressValue(progress) {
    if (progress.type === "binary") return progress.confirmed;
    if (["timed", "informational"].includes(progress.type)) return progress.userConfirmed;
    return progress.current;
  }

  function emptyValidation() { return { valid: true, errors: [], warnings: [], stale: false, blockers: [], structural: [], semantic: [], source: [] }; }
  function blockerFromDiagnostic(entry) { return { code: entry.code, message: errorMessage(entry.code), details: copy(entry.details || {}) }; }
  function stableBlockers(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize({ code: entry.code, details: entry.details || {}, criterionId: entry.criterionId || null }), copy(entry)); return [...map.values()].sort((a, b) => lexical(a.code, b.code)); }
  function diagnostic(code, details = {}, severity = "error") { return { code, severity, details: copy(details) }; }
  function stableDiagnostics(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize(entry), entry); return [...map.values()].sort((a, b) => lexical(a.code, b.code) || lexical(canonicalize(a.details || {}), canonicalize(b.details || {}))); }
  function stableStrings(values) { return [...new Set(array(values).filter((entry) => typeof entry === "string" && entry.length))].sort(lexical); }
  function scalar(value) { if (["string", "number"].includes(typeof value)) return String(value); if (object(value) && ["string", "number"].includes(typeof value.value)) return String(value.value); return null; }
  function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function timestampNow() { return new Date().toISOString(); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function integer(value) { const number = Number(value); return Number.isInteger(number) ? number : null; }
  function positiveInteger(value) { const number = integer(value); return number !== null && number > 0 ? number : null; }
  function nonNegativeInteger(value) { const number = integer(value); return number !== null && number >= 0 ? number : null; }
  function nullableNonNegativeInteger(value) { return value === null || value === undefined || value === "" ? null : nonNegativeInteger(value); }
  function strictInteger(value) { if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) throw stepError("progress_value_invalid", "Значение должно быть целым числом."); const number = Number(value); if (!Number.isInteger(number)) throw stepError("progress_value_invalid", "Значение должно быть целым числом."); return number; }
  function strictIntegerOrNull(value) { try { return strictInteger(value); } catch (_error) { return null; } }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `execution-step:${fingerprint({ at: timestampNow() }).slice(9)}`; }
  function makeOperationId(prefix) { return `${prefix}:${makeId()}`; }
  function requireOperationId(value) { const result = text(value); if (!result) throw stepError("operation_id_required", "Для операции требуется operationId."); return result; }
  function checkRevision(state, expectedRevision) { if (!positiveInteger(expectedRevision) || expectedRevision !== state.revision) throw stepError("step_revision_conflict", "Шаг был изменён в другой операции.", { expectedRevision, actualRevision: state.revision }); }
  function requireStep(state) { if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || !STATUSES.includes(state.status) || !positiveInteger(state.revision)) throw stepError("step_structure_invalid", "Запись исполняемого шага повреждена."); }
  function throwInvalidTransition(from, to) { throw stepError("invalid_status_transition", `Переход ${from} → ${to} недопустим.`); }
  function throwForDiagnostic(entry) { throw stepError(entry?.code || "source_identity_mismatch", errorMessage(entry?.code), entry?.details || {}); }
  function stepError(code, message, details = {}) { return new PatternExecutionStepError(code, message || errorMessage(code), details); }
  function errorMessage(code) {
    return ({
      source_session_missing: "Сессия выполнения не найдена.", source_session_invalid: "Сессия выполнения недействительна.",
      source_session_not_active: "Сессия ещё не готова к текущему шагу.", source_session_snapshot_invalid: "Snapshot сессии повреждён.",
      source_plan_invalid: "План выполнения недействителен.", source_identity_mismatch: "Identity цепочки источников не доказуема.",
      source_session_changed: "Сессия изменилась после создания шага.", current_action_unproven: "Текущее действие нельзя доказать.",
      current_action_changed: "Текущее действие сессии изменилось.", current_action_blocked: "Текущее действие заблокировано.",
      prerequisite_incomplete: "Prerequisite текущего действия не завершён.", source_selection_missing: "Component, phase или action отсутствуют в source snapshot.",
      corrupted_progress_state: "Сохранённый прогресс повреждён.", imported_identity_unverifiable: "После импорта identity источника не доказуема.",
      step_revision_conflict: "Revision шага изменилась.", operation_id_required: "Для операции требуется operationId.",
    })[code] || "Операция с исполняемым шагом недоступна.";
  }
  function getSessionApi() { return globalObject.YarnAIPatternExecutionSession || null; }

  const api = {
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, AUDIT_LIMIT, STATUSES, PROGRESS_TYPES, CRITERION_STATUSES, AUDIT_EVENTS, TRANSITIONS,
    PatternExecutionStepError, canonicalize, fingerprint, sourceIdentity, validateSourceSession, selectCurrentAction,
    createExecutionStep, buildImmutableSnapshot, createProgressState, startStep, incrementProgress, decrementProgress,
    setProgress, setMeasurement, setCheckpointCriterion, checkStep, pauseStep, resumeStep, beginCompletion,
    finalizeCompletion, finalizeCheckpointCompletion, recoverStep, rebuildStep, detectStepStaleness, validateExecutionStep, validateStructural,
    validateSemantic, markStale, markFailed, calculateStepFingerprint, inspectAggregate, ensureForProject,
    applyForProject, completeForProject, recoverForProject, rebuildForProject,
  };
  globalObject.YarnAIPatternExecutionStep = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
