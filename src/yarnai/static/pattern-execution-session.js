"use strict";

(function exposePatternExecutionSession(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_SESSION";
  const STATUSES = Object.freeze([
    "waiting", "starting", "active", "paused", "blocked", "completed", "stale", "failed",
  ]);
  const ACTION_STATUSES = Object.freeze([
    "pending", "available", "in_progress", "completed", "skipped", "blocked",
  ]);
  const AUDIT_EVENTS = Object.freeze([
    "session_created", "session_start_requested", "session_started", "session_start_failed",
    "session_paused", "session_resumed", "action_started", "action_completed", "action_skipped",
    "action_blocked", "checkpoint_reached", "checkpoint_confirmed", "session_completed", "session_became_stale",
    "interrupted_session_recovered", "session_rebuilt", "import_marked_stale",
  ]);
  const AUDIT_LIMIT = 24;
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["starting", "stale", "failed"]),
    starting: Object.freeze(["waiting", "active", "paused", "blocked", "completed", "stale", "failed"]),
    active: Object.freeze(["paused", "blocked", "completed", "stale", "failed"]),
    paused: Object.freeze(["active", "blocked", "stale", "failed"]),
    blocked: Object.freeze(["stale", "failed"]),
    completed: Object.freeze([]),
    stale: Object.freeze([]),
    failed: Object.freeze(["starting", "stale"]),
  });

  class PatternExecutionSessionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionSessionError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw sessionError("session_snapshot_invalid", "Сессия содержит недопустимое числовое значение.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    }
    throw sessionError("session_snapshot_invalid", "Сессия содержит неподдерживаемое значение.");
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

  function sourceIdentityFromPlan(plan) {
    return {
      sourceExecutionPlanId: plan?.id ?? null,
      sourceExecutionPlanRevision: integer(plan?.revision),
      sourceExecutionPlanFingerprint: plan?.planFingerprint ?? null,
      sourceTechnologyReviewId: plan?.sourceTechnologyReviewId ?? null,
      sourceTechnologyReviewRevision: integer(plan?.sourceTechnologyReviewRevision),
      sourceTechnologyReviewFingerprint: plan?.sourceTechnologyReviewFingerprint ?? null,
      sourceConfirmedSnapshotFingerprint: plan?.sourceConfirmedSnapshotFingerprint ?? null,
      sourceTechnologyDraftId: plan?.sourceTechnologyDraftId ?? null,
      sourceTechnologyDraftRevision: integer(plan?.sourceTechnologyDraftRevision),
      sourceTechnologyDraftFingerprint: plan?.sourceTechnologyDraftFingerprint ?? null,
      sourceAnalysisReviewId: plan?.sourceAnalysisReviewId ?? null,
      sourceAnalysisReviewRevision: integer(plan?.sourceAnalysisReviewRevision),
      sourceAnalysisReviewFingerprint: plan?.sourceAnalysisReviewFingerprint ?? null,
      sourceSemanticAnalysisId: plan?.sourceSemanticAnalysisId ?? null,
      sourceSemanticAnalysisRevision: integer(plan?.sourceSemanticAnalysisRevision),
      sourceSemanticAnalysisFingerprint: plan?.sourceSemanticAnalysisFingerprint ?? null,
      sourceImportRevision: integer(plan?.sourceImportRevision),
      sourceAlgorithmVersion: integer(plan?.sourceAlgorithmVersion),
      planningAlgorithmVersion: integer(plan?.planningAlgorithmVersion),
      planningInputFingerprint: plan?.planningInputFingerprint ?? null,
    };
  }

  function validateSourceExecutionPlan(plan, projectId, context = {}) {
    const diagnostics = [];
    const add = (code, details = {}) => diagnostics.push(diagnostic(code, details));
    if (!plan) add("execution_plan_missing");
    if (plan && plan.kind !== "PATTERN_EXECUTION_PLAN") add("execution_plan_invalid", { field: "kind" });
    if (plan && (plan.schemaVersion !== 1 || plan.version !== 1)) add("execution_plan_invalid", { field: "schemaVersion" });
    if (plan && plan.projectId !== projectId) add("source_identity_mismatch", { field: "projectId" });
    if (plan && plan.status !== "ready") add(plan.status === "stale" ? "execution_plan_stale" : "execution_plan_not_ready", { status: plan.status });
    if (plan && (!positiveInteger(plan.revision) || !validFingerprint(plan.planFingerprint) || !object(plan.plan))) add("execution_plan_invalid");
    const planApi = getPlanApi();
    if (plan?.plan && planApi) {
      if (planApi.calculatePlanFingerprint(plan) !== plan.planFingerprint) add("execution_plan_invalid", { field: "planFingerprint" });
      if (array(planApi.validateStructural(plan)).length) add("execution_plan_invalid", { level: "structural" });
      if (array(planApi.validateSemantic(plan)).length) add("execution_plan_invalid", { level: "semantic" });
    } else if (plan?.plan) {
      add("execution_plan_invalid", { field: "validator" });
    }
    const identity = sourceIdentityFromPlan(plan);
    for (const key of [
      "sourceExecutionPlanId", "sourceTechnologyReviewId", "sourceTechnologyDraftId",
      "sourceAnalysisReviewId", "sourceSemanticAnalysisId",
    ]) if (!text(identity[key])) add("source_identity_mismatch", { field: key });
    for (const key of [
      "sourceExecutionPlanRevision", "sourceTechnologyReviewRevision", "sourceTechnologyDraftRevision",
      "sourceAnalysisReviewRevision", "sourceSemanticAnalysisRevision", "sourceImportRevision",
      "sourceAlgorithmVersion", "planningAlgorithmVersion",
    ]) if (!positiveInteger(identity[key])) add("source_identity_mismatch", { field: key });
    for (const key of [
      "sourceExecutionPlanFingerprint", "sourceTechnologyReviewFingerprint", "sourceConfirmedSnapshotFingerprint",
      "sourceTechnologyDraftFingerprint", "sourceAnalysisReviewFingerprint", "sourceSemanticAnalysisFingerprint",
      "planningInputFingerprint",
    ]) if (!validFingerprint(identity[key])) add("source_identity_mismatch", { field: key });
    if (plan && plan.plan?.planFingerprint !== plan.planFingerprint) add("execution_plan_invalid", { field: "nestedPlanFingerprint" });
    const review = context.technologyReview || null;
    const draft = context.technologyDraft || null;
    const analysis = context.analysisReview || null;
    const semantic = context.semanticAnalysis || null;
    if (review && (
      review.kind !== "PATTERN_TECHNOLOGY_REVIEW" || review.projectId !== projectId ||
      review.id !== identity.sourceTechnologyReviewId || review.revision !== identity.sourceTechnologyReviewRevision ||
      technologyReviewFingerprint(review) !== identity.sourceTechnologyReviewFingerprint ||
      review.confirmedSnapshotFingerprint !== identity.sourceConfirmedSnapshotFingerprint || review.status !== "confirmed"
    )) add("source_identity_mismatch", { stage: 21 });
    if (draft && (
      draft.kind !== "PATTERN_TECHNOLOGY_DRAFT" || draft.projectId !== projectId || draft.sourceProjectId !== projectId ||
      draft.id !== identity.sourceTechnologyDraftId || draft.revision !== identity.sourceTechnologyDraftRevision ||
      draft.draftFingerprint !== identity.sourceTechnologyDraftFingerprint || draft.sourceImportRevision !== identity.sourceImportRevision
    )) add("source_identity_mismatch", { stage: 20 });
    if (analysis && (
      analysis.kind !== "PATTERN_ANALYSIS_REVIEW" || analysis.projectId !== projectId ||
      analysis.id !== identity.sourceAnalysisReviewId || analysis.revision !== identity.sourceAnalysisReviewRevision ||
      analysis.sourceImportRevision !== identity.sourceImportRevision
    )) add("source_identity_mismatch", { stage: 19 });
    if (semantic && (
      semantic.kind !== "PATTERN_SEMANTIC_ANALYSIS" || semantic.projectId !== projectId ||
      semantic.id !== identity.sourceSemanticAnalysisId || semantic.revision !== identity.sourceSemanticAnalysisRevision ||
      semantic.sourceImportRevision !== identity.sourceImportRevision
    )) add("source_identity_mismatch", { stage: 18 });
    if (context.requireCurrentIdentity && (!review || !draft || !analysis || !semantic)) add("source_identity_mismatch", { field: "currentSourceChain" });
    if (plan && planApi && review) {
      const sourceDiagnostics = planApi.validateSourceIdentity(plan, review, {
        technologyDraft: draft,
        analysisReview: analysis,
        semanticAnalysis: semantic,
        requireCurrentIdentity: Boolean(context.requireCurrentIdentity),
      });
      if (array(sourceDiagnostics).length) add("source_identity_mismatch", { field: "stage22SourceValidation" });
    }
    const stable = stableDiagnostics(diagnostics);
    return { isValid: stable.length === 0, diagnostics: stable, identity };
  }

  function createExecutionSession(plan, projectId = plan?.projectId, options = {}) {
    const now = options.now || timestampNow();
    const validation = validateSourceExecutionPlan(plan, projectId, options.context || {});
    if (!validation.isValid) throwForDiagnostic(validation.diagnostics[0]);
    if (options.expectedPlanRevision !== undefined && options.expectedPlanRevision !== plan.revision) {
      throw sessionError("session_revision_conflict", "План изменился до создания сессии.");
    }
    const state = {
      id: options.id || makeId(),
      schemaVersion: SCHEMA_VERSION,
      version: VERSION,
      projectId,
      kind: PROGRESS_KIND,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      status: "waiting",
      ...validation.identity,
      sessionFingerprint: null,
      planSnapshot: null,
      execution: { mode: "sequential", actions: [] },
      currentPosition: emptyPosition(),
      completedActionIds: [],
      skippedActionIds: [],
      checkpoints: [],
      blockers: [],
      interruption: null,
      failure: null,
      audit: [],
    };
    appendAudit(state, "session_created", now);
    sealState(state);
    return deepFreeze(state);
  }

  function startExecutionSession(state, plan, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (["active", "paused", "blocked", "completed", "stale"].includes(state.status)) return copy(state);
    if (state.status === "starting") return recoverInterruptedExecutionSession(state, plan, options);
    if (!TRANSITIONS[state.status].includes("starting")) throwInvalidTransition(state.status, "starting");
    const source = validateSessionSource(state, plan, options.context || {});
    if (!source.isValid) return markSessionStale(state, source.reasonCode, options.now);
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    transition(next, "starting");
    next.updatedAt = now;
    next.failure = null;
    next.interruption = { type: "start", status: "in_progress", startedAt: now, baseRevision: state.revision };
    appendAudit(next, "session_start_requested", now);
    try {
      next.planSnapshot = buildPlanSnapshot(plan);
      next.execution = buildExecution(next.planSnapshot);
      next.completedActionIds = [];
      next.skippedActionIds = [];
      next.checkpoints = next.planSnapshot.checkpoints.map((entry) => ({
        checkpointId: entry.checkpointId, status: "pending", reachedAt: null, actionId: null,
      }));
      next.blockers = [];
      selectInitialPosition(next, now);
      next.interruption = null;
      appendAudit(next, "session_started", now);
      if (next.status === "blocked") appendAudit(next, "action_blocked", now, { actionId: next.currentPosition.actionId, reasonCode: next.blockers[0]?.code || "no_available_action" });
      if (next.status === "completed") appendAudit(next, "session_completed", now);
      sealState(next);
      return deepFreeze(next);
    } catch (error) {
      if (error instanceof PatternExecutionSessionError) throw error;
      transition(next, "failed");
      next.failure = { code: "session_start_failed", message: "Не удалось детерминированно подготовить сессию." };
      next.interruption = null;
      appendAudit(next, "session_start_failed", now, { reasonCode: next.failure.code });
      sealState(next);
      return deepFreeze(next);
    }
  }

  function startCurrentAction(state, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (state.status === "completed") throw sessionError("session_already_completed", "Сессия уже завершена.");
    if (state.status !== "active") throwInvalidTransition(state.status, "active");
    const action = currentAction(state, options.actionId);
    if (action.status === "in_progress") return copy(state);
    if (action.status !== "available") throw sessionError("action_not_current", "Текущее действие нельзя начать.");
    assertPrerequisitesComplete(state, action);
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    const nextAction = findAction(next, action.actionId);
    nextAction.status = "in_progress";
    nextAction.startedAt = nextAction.startedAt || now;
    next.updatedAt = now;
    appendAudit(next, "action_started", now, { actionId: nextAction.actionId });
    sealState(next);
    return deepFreeze(next);
  }

  function completeCurrentAction(state, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    const requestedId = options.actionId || state.currentPosition?.actionId;
    const existing = findAction(state, requestedId);
    if (existing?.status === "completed") return copy(state);
    if (state.status === "completed") throw sessionError("session_already_completed", "Сессия уже завершена.");
    if (state.status !== "active") throwInvalidTransition(state.status, "active");
    const action = currentAction(state, requestedId);
    if (!["available", "in_progress"].includes(action.status)) throw sessionError("action_not_current", "Можно завершить только текущее действие.");
    assertPrerequisitesComplete(state, action);
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    const nextAction = findAction(next, action.actionId);
    nextAction.status = "completed";
    nextAction.startedAt = nextAction.startedAt || now;
    nextAction.completedAt = now;
    nextAction.result = options.result === undefined ? null : copy(options.result);
    next.completedActionIds = stableIds([...next.completedActionIds, nextAction.actionId]);
    const confirmedByCheckpoint = options.result?.source === "PATTERN_EXECUTION_CHECKPOINT";
    for (const checkpointId of nextAction.checkpointIds) {
      const checkpoint = next.checkpoints.find((entry) => entry.checkpointId === checkpointId);
      if (checkpoint && !["reached", "confirmed"].includes(checkpoint.status)) {
        checkpoint.status = confirmedByCheckpoint ? "confirmed" : "reached";
        checkpoint.reachedAt = now;
        checkpoint.actionId = nextAction.actionId;
        appendAudit(next, "checkpoint_reached", now, { actionId: nextAction.actionId, checkpointId });
        if (confirmedByCheckpoint) appendAudit(next, "checkpoint_confirmed", now, { actionId: nextAction.actionId, checkpointId, checkpointRecordId: options.result.checkpointRecordId, operationId: text(options.operationId) || null });
      }
    }
    next.updatedAt = now;
    appendAudit(next, "action_completed", now, { actionId: nextAction.actionId, operationId: text(options.operationId) || null });
    selectNextPosition(next, now);
    if (next.status === "blocked") appendAudit(next, "action_blocked", now, { actionId: next.currentPosition.actionId, reasonCode: next.blockers[0]?.code || "no_available_action" });
    if (next.status === "completed") appendAudit(next, "session_completed", now);
    sealState(next);
    return deepFreeze(next);
  }

  function skipCurrentAction(state, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (state.status !== "active") throwInvalidTransition(state.status, "active");
    const action = currentAction(state, options.actionId);
    if (action.required) throw sessionError("required_action_cannot_be_skipped", "Обязательное действие нельзя пропустить.");
    if (!["available", "in_progress"].includes(action.status)) throw sessionError("action_not_current", "Можно пропустить только текущее действие.");
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    const nextAction = findAction(next, action.actionId);
    nextAction.status = "skipped";
    nextAction.skippedAt = now;
    next.skippedActionIds = stableIds([...next.skippedActionIds, nextAction.actionId]);
    next.updatedAt = now;
    appendAudit(next, "action_skipped", now, { actionId: nextAction.actionId });
    selectNextPosition(next, now);
    if (next.status === "completed") appendAudit(next, "session_completed", now);
    sealState(next);
    return deepFreeze(next);
  }

  function pauseExecutionSession(state, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (state.status === "paused") return copy(state);
    if (state.status !== "active") throwInvalidTransition(state.status, "paused");
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    transition(next, "paused");
    next.updatedAt = now;
    next.interruption = { type: options.type || "user_pause", status: "paused", pausedAt: now, actionId: next.currentPosition.actionId };
    appendAudit(next, "session_paused", now, { actionId: next.currentPosition.actionId });
    sealState(next);
    return deepFreeze(next);
  }

  function resumeExecutionSession(state, plan, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (state.status === "active") return copy(state);
    if (state.status === "completed") throw sessionError("session_already_completed", "Сессия уже завершена.");
    if (state.status === "stale") throwInvalidTransition("stale", "active");
    if (state.status !== "paused") throwInvalidTransition(state.status, "active");
    const source = validateSessionSource(state, plan, options.context || {});
    if (!source.isValid) return markSessionStale(state, source.reasonCode, options.now);
    const validation = validateExecutionSession(state, plan, options.context || {});
    if (validation.structural.length || validation.semantic.length) return markSessionStale(state, "session_snapshot_invalid", options.now);
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    next.updatedAt = now;
    next.interruption = null;
    const action = findAction(next, next.currentPosition.actionId);
    if (action?.blockerIds.length) {
      transition(next, "blocked");
      next.blockers = blockersForAction(next, action);
    } else {
      transition(next, "active");
      next.blockers = [];
    }
    appendAudit(next, "session_resumed", now, { actionId: next.currentPosition.actionId });
    sealState(next);
    return deepFreeze(next);
  }

  function recoverInterruptedExecutionSession(state, plan = null, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (!["starting", "active"].includes(state.status)) return copy(state);
    const now = options.now || timestampNow();
    if (state.status === "active") return pauseExecutionSession(state, { expectedRevision: state.revision, now, type: "reload" });
    const next = mutable(state);
    next.revision += 1;
    next.updatedAt = now;
    const complete = snapshotComplete(next) && validateStructural(next).length === 0 && validateSemantic(next).length === 0;
    if (complete) {
      transition(next, "paused");
      next.interruption = { type: "interrupted_start", status: "recovered", pausedAt: now, actionId: next.currentPosition.actionId };
    } else if (!next.planSnapshot && !array(next.execution?.actions).length) {
      transition(next, "waiting");
      next.planSnapshot = null;
      next.execution = { mode: "sequential", actions: [] };
      next.currentPosition = emptyPosition();
      next.completedActionIds = [];
      next.skippedActionIds = [];
      next.checkpoints = [];
      next.blockers = [];
      next.interruption = { type: "interrupted_start", status: "rolled_back", interruptedAt: now, reasonCode: "interrupted_start_incomplete" };
      next.failure = null;
    } else {
      transition(next, "failed");
      next.interruption = { type: "interrupted_start", status: "incomplete", interruptedAt: now, reasonCode: "interrupted_start_incomplete" };
      next.failure = { code: "interrupted_start_incomplete", message: "Подготовка сессии была прервана и сохранила неполные данные." };
    }
    appendAudit(next, "interrupted_session_recovered", now, { actionId: next.currentPosition.actionId, reasonCode: next.interruption?.reasonCode || null });
    sealState(next);
    return deepFreeze(next);
  }

  function rebuildExecutionSession(state, plan, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (options.confirmed !== true) throw sessionError("rebuild_confirmation_required", "Для перестроения нужно явно подтвердить сброс прогресса.");
    const source = validateSourceExecutionPlan(plan, state.projectId, options.context || {});
    if (!source.isValid) throwForDiagnostic(source.diagnostics[0]);
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    next.updatedAt = now;
    Object.assign(next, source.identity);
    next.planSnapshot = buildPlanSnapshot(plan);
    next.execution = buildExecution(next.planSnapshot);
    next.completedActionIds = [];
    next.skippedActionIds = [];
    next.checkpoints = next.planSnapshot.checkpoints.map((entry) => ({ checkpointId: entry.checkpointId, status: "pending", reachedAt: null, actionId: null }));
    next.blockers = [];
    next.failure = null;
    next.interruption = null;
    next.status = "starting";
    selectInitialPosition(next, now);
    appendAudit(next, "session_rebuilt", now);
    if (next.status === "completed") appendAudit(next, "session_completed", now);
    sealState(next);
    return deepFreeze(next);
  }

  function detectExecutionSessionStaleness(state, plan, context = {}) {
    requireSession(state);
    const validation = validateSessionSource(state, plan, context);
    return { isStale: !validation.isValid, reasonCode: validation.reasonCode, diagnostics: validation.diagnostics };
  }

  function validateExecutionSession(state, plan = null, context = {}) {
    const structural = validateStructural(state);
    const semantic = structural.length ? [] : validateSemantic(state);
    const sourceResult = plan ? validateSessionSource(state, plan, context) : { isValid: true, diagnostics: [], reasonCode: null };
    return {
      isValid: structural.length === 0 && semantic.length === 0 && sourceResult.isValid,
      structural,
      semantic,
      source: sourceResult.diagnostics,
      reasonCode: structural[0]?.code || semantic[0]?.code || sourceResult.reasonCode || null,
    };
  }

  function validateStructural(state) {
    const diagnostics = [];
    const add = (code, details = {}) => diagnostics.push(diagnostic(code, details));
    if (!object(state) || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION) add("session_snapshot_invalid", { field: "header" });
    if (!text(state?.id) || !text(state?.projectId) || !positiveInteger(state?.revision) || !STATUSES.includes(state?.status)) add("session_snapshot_invalid", { field: "identity" });
    if (!isTimestamp(state?.createdAt) || !isTimestamp(state?.updatedAt)) add("session_snapshot_invalid", { field: "timestamps" });
    if (!validFingerprint(state?.sessionFingerprint)) add("session_snapshot_invalid", { field: "sessionFingerprint" });
    for (const key of ["completedActionIds", "skippedActionIds", "checkpoints", "blockers", "audit"]) if (!Array.isArray(state?.[key])) add("session_snapshot_invalid", { field: key });
    if (!object(state?.execution) || state.execution.mode !== "sequential" || !Array.isArray(state.execution.actions)) add("session_snapshot_invalid", { field: "execution" });
    if (!object(state?.currentPosition)) add("session_snapshot_invalid", { field: "currentPosition" });
    if (array(state?.audit).length > AUDIT_LIMIT) add("session_snapshot_invalid", { field: "auditLimit" });
    for (const audit of array(state?.audit)) {
      if (!AUDIT_EVENTS.includes(audit?.event) || !isTimestamp(audit?.at) || !positiveInteger(audit?.revision)) add("session_snapshot_invalid", { field: "audit" });
    }
    if (state?.planSnapshot !== null) {
      if (!object(state.planSnapshot) || state.planSnapshot.schemaVersion !== SCHEMA_VERSION || !validFingerprint(state.planSnapshot.snapshotFingerprint)) add("session_snapshot_invalid", { field: "planSnapshot" });
      for (const key of ["components", "phases", "prerequisites", "blockers", "checkpoints"]) if (!Array.isArray(state.planSnapshot?.[key])) add("session_snapshot_invalid", { field: `planSnapshot.${key}` });
      if (object(state.planSnapshot)) {
        const payload = copy(state.planSnapshot);
        delete payload.snapshotFingerprint;
        if (fingerprint(payload) !== state.planSnapshot.snapshotFingerprint) add("session_snapshot_invalid", { field: "snapshotFingerprint" });
      }
    }
    const actionIds = new Set();
    for (const action of array(state?.execution?.actions)) {
      if (!text(action?.actionId) || actionIds.has(action.actionId) || !text(action.phaseId) || !positiveInteger(action.order) ||
        !text(action.title) || typeof action.instruction !== "string" || !Array.isArray(action.prerequisiteActionIds) ||
        !Array.isArray(action.checkpointIds) || !Array.isArray(action.blockerIds) || typeof action.required !== "boolean" ||
        !ACTION_STATUSES.includes(action.status) || !nullableTimestamp(action.startedAt) || !nullableTimestamp(action.completedAt) ||
        !nullableTimestamp(action.skippedAt)) add("session_snapshot_invalid", { field: "action", actionId: action?.actionId ?? null });
      actionIds.add(action?.actionId);
    }
    for (const collection of [array(state?.planSnapshot?.phases), array(state?.planSnapshot?.components), array(state?.planSnapshot?.checkpoints)]) {
      const ids = new Set();
      for (const entry of collection) {
        const id = entry.phaseId || entry.componentId || entry.checkpointId;
        if (!text(id) || ids.has(id)) add("session_snapshot_invalid", { field: "duplicateId", id });
        ids.add(id);
      }
    }
    if (object(state) && validFingerprint(state.sessionFingerprint) && calculateSessionFingerprint(state) !== state.sessionFingerprint) add("session_snapshot_invalid", { field: "sessionFingerprint" });
    return stableDiagnostics(diagnostics);
  }

  function validateSemantic(state) {
    const diagnostics = [];
    const add = (code, details = {}) => diagnostics.push(diagnostic(code, details));
    const actions = array(state.execution?.actions);
    const actionMap = new Map(actions.map((entry) => [entry.actionId, entry]));
    const completed = stableIds(actions.filter((entry) => entry.status === "completed").map((entry) => entry.actionId));
    const skipped = stableIds(actions.filter((entry) => entry.status === "skipped").map((entry) => entry.actionId));
    if (canonicalize(completed) !== canonicalize(stableIds(state.completedActionIds))) add("session_snapshot_invalid", { field: "completedActionIds" });
    if (canonicalize(skipped) !== canonicalize(stableIds(state.skippedActionIds))) add("session_snapshot_invalid", { field: "skippedActionIds" });
    const inProgress = actions.filter((entry) => entry.status === "in_progress");
    const available = actions.filter((entry) => entry.status === "available");
    if (inProgress.length > 1 || available.length > 1 || inProgress.length + available.length > 1) add("session_snapshot_invalid", { field: "singleCurrentAction" });
    for (const action of actions) {
      if (action.prerequisiteActionIds.includes(action.actionId)) add("action_prerequisite_incomplete", { actionId: action.actionId, selfDependency: true });
      for (const id of action.prerequisiteActionIds) if (!actionMap.has(id)) add("action_not_found", { actionId: id });
      if (action.required && action.status === "skipped") add("required_action_cannot_be_skipped", { actionId: action.actionId });
      if (["completed", "skipped"].includes(action.status) && action.prerequisiteActionIds.some((id) => !["completed", "skipped"].includes(actionMap.get(id)?.status))) add("action_prerequisite_incomplete", { actionId: action.actionId });
    }
    if (hasDependencyCycle(actions)) add("action_dependency_cycle");
    const current = state.currentPosition;
    actions.forEach((entry, index) => { if (entry.order !== index + 1) add("session_snapshot_invalid", { field: "actionOrder", actionId: entry.actionId }); });
    const requiredTotal = actions.filter((entry) => entry.required).length;
    const requiredDone = actions.filter((entry) => entry.required && entry.status === "completed").length;
    const percent = state.planSnapshot ? progressPercent(requiredDone, requiredTotal) : 0;
    if (current.totalRequiredCount !== requiredTotal || current.completedRequiredCount !== requiredDone || current.progressPercent !== percent) add("session_snapshot_invalid", { field: "progress" });
    if (current.actionId !== null && !actionMap.has(current.actionId)) add("action_not_found", { actionId: current.actionId });
    const positionedAction = actionMap.get(current.actionId);
    if (positionedAction && (current.phaseId !== positionedAction.phaseId || current.componentId !== positionedAction.componentId || current.actionIndex !== actions.findIndex((entry) => entry.actionId === current.actionId))) add("session_snapshot_invalid", { field: "currentPosition" });
    if (["active", "paused", "blocked"].includes(state.status) && current.actionId === null) add("no_available_action");
    if (state.status === "active") {
      const action = actionMap.get(current.actionId);
      if (!action || !["available", "in_progress"].includes(action.status)) add("action_not_current");
    }
    if (state.status === "blocked" && !array(state.blockers).length) add("no_available_action");
    if (state.status === "completed" && requiredDone !== requiredTotal) add("session_snapshot_invalid", { field: "completedStatus" });
    return stableDiagnostics(diagnostics);
  }

  function buildPlanSnapshot(plan) {
    const components = array(plan.plan.components).slice().sort(compareOrder).map((entry, index) => ({
      componentId: entry.id,
      order: index + 1,
      label: text(entry.label) || entry.id,
      constructionRole: text(entry.constructionRole),
      parentComponentId: entry.parentComponentId ?? null,
      dependencyComponentIds: stableIds(entry.dependencies),
      required: entry.required !== false,
    }));
    const phases = array(plan.plan.phases).slice().sort(compareOrder).map((entry) => ({
      phaseId: entry.id,
      order: numericOrder(entry.order),
      title: text(entry.title) || entry.id,
      componentIds: stableIds(entry.componentIds),
      dependsOnPhaseIds: stableIds(entry.dependsOnPhaseIds),
      canRunInParallelWith: stableIds(entry.canRunInParallelWith),
      actionIds: array(entry.actions).slice().sort(compareOrder).map((action) => action.id),
      checkpointIds: stableIds(entry.checkpoints),
      required: entry.required !== false,
    }));
    const actions = [];
    for (const phase of phases) {
      const source = plan.plan.phases.find((entry) => entry.id === phase.phaseId);
      for (const action of array(source?.actions).slice().sort(compareOrder)) {
        actions.push({
          actionId: action.id,
          phaseId: phase.phaseId,
          componentId: phase.componentIds[0] || null,
          sourceOrder: numericOrder(action.order),
          title: text(action.title) || action.id,
          instruction: text(action.description),
          required: action.required !== false && phase.required,
          ...executionActionMetadata(action),
        });
      }
    }
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      sourceIdentity: sourceIdentityFromPlan(plan),
      planFingerprint: plan.planFingerprint,
      components,
      phases,
      actions,
      prerequisites: array(plan.plan.prerequisites).map((entry) => ({
        prerequisiteId: entry.id, type: entry.type, label: entry.label, status: entry.status,
      })),
      blockers: array(plan.blockers).map((entry) => ({
        blockerId: entry.id, code: entry.code, message: entry.message,
        relatedPhaseIds: stableIds(entry.relatedPhaseIds), relatedComponentIds: stableIds(entry.relatedComponentIds),
      })),
      checkpoints: array(plan.plan.checkpoints).map((entry) => ({
        checkpointId: entry.id, type: entry.type, phaseId: entry.phaseId,
        componentIds: stableIds(entry.componentIds), expectedValue: copy(entry.expectedValue), unit: entry.unit ?? null,
        required: entry.required !== false, blockingOnFailure: entry.blockingOnFailure !== false,
        ...(entry.label !== undefined ? { label: text(entry.label) } : {}),
        ...(entry.criterionId !== undefined ? { criterionId: entry.criterionId } : {}),
        ...(entry.allowNotApplicable !== undefined ? { allowNotApplicable: entry.allowNotApplicable === true } : {}),
        ...(entry.options !== undefined ? { options: copy(entry.options) } : {}),
        ...(entry.range !== undefined ? { range: copy(entry.range) } : {}),
      })).sort((left, right) => phaseOrder(phases, left.phaseId) - phaseOrder(phases, right.phaseId) || lexical(left.checkpointId, right.checkpointId)),
      firstAction: {
        phaseId: plan.plan.firstAction?.phaseId ?? null,
        actionId: plan.plan.firstAction?.actionId ?? null,
        ready: Boolean(plan.plan.firstAction?.ready),
        blockedBy: stableIds(plan.plan.firstAction?.blockedBy),
      },
      snapshotFingerprint: null,
    };
    const payload = copy(snapshot);
    delete payload.snapshotFingerprint;
    snapshot.snapshotFingerprint = fingerprint(payload);
    return deepFreeze(snapshot);
  }

  function executionActionMetadata(action) {
    const result = {};
    for (const key of [
      "progressType", "expectedResult", "quantity", "unit", "repeatCount", "rowRange", "stitchCount",
      "measurementTarget", "measurementRange", "allowExceedTarget", "allowDeviationConfirmation",
      "allowManualConfirmation", "timedDuration", "informational",
    ]) if (action[key] !== undefined) result[key] = copy(action[key]);
    return result;
  }

  function buildExecution(snapshot) {
    const phaseActions = new Map();
    for (const action of snapshot.actions) {
      if (!phaseActions.has(action.phaseId)) phaseActions.set(action.phaseId, []);
      phaseActions.get(action.phaseId).push(action.actionId);
    }
    const result = [];
    for (const source of snapshot.actions) {
      const phase = snapshot.phases.find((entry) => entry.phaseId === source.phaseId);
      const samePhase = phaseActions.get(source.phaseId) || [];
      const position = samePhase.indexOf(source.actionId);
      const dependentActions = array(phase?.dependsOnPhaseIds).flatMap((phaseId) => phaseActions.get(phaseId) || []);
      const prerequisites = [...dependentActions, ...samePhase.slice(0, position)];
      const isLast = position === samePhase.length - 1;
      const checkpointIds = isLast ? stableIds([
        ...array(phase?.checkpointIds),
        ...snapshot.checkpoints.filter((entry) => entry.phaseId === source.phaseId).map((entry) => entry.checkpointId),
      ]) : [];
      const blockerIds = snapshot.blockers.filter((entry) => !entry.relatedPhaseIds.length || entry.relatedPhaseIds.includes(source.phaseId)).map((entry) => entry.blockerId);
      result.push({
        actionId: source.actionId,
        phaseId: source.phaseId,
        componentId: source.componentId,
        order: result.length + 1,
        title: source.title,
        instruction: source.instruction,
        prerequisiteActionIds: stableIds(prerequisites),
        checkpointIds,
        required: source.required,
        status: "pending",
        startedAt: null,
        completedAt: null,
        skippedAt: null,
        result: null,
        blockerIds: stableIds(blockerIds),
      });
    }
    return { mode: "sequential", actions: result };
  }

  function selectInitialPosition(state, now) {
    const required = state.execution.actions.filter((entry) => entry.required);
    if (!required.length) {
      transition(state, "completed");
      state.currentPosition = positionFor(state, null);
      return;
    }
    const preferredId = state.planSnapshot.firstAction.actionId;
    const preferred = findAction(state, preferredId);
    const candidate = preferred && preferred.required ? preferred : firstOutstanding(state);
    selectCandidate(state, candidate, now);
  }

  function selectNextPosition(state, now) {
    if (state.execution.actions.filter((entry) => entry.required).every((entry) => entry.status === "completed")) {
      transition(state, "completed");
      state.blockers = [];
      state.currentPosition = positionFor(state, null);
      return;
    }
    selectCandidate(state, firstOutstanding(state), now);
  }

  function selectCandidate(state, candidate, now) {
    for (const action of state.execution.actions) if (["available", "blocked"].includes(action.status)) action.status = "pending";
    if (!candidate) {
      transition(state, "blocked");
      state.blockers = [{ blockerId: "session:no_available_action", code: "no_available_action", message: "Нет доступного действия для продолжения." }];
      state.currentPosition = positionFor(state, state.execution.actions.find((entry) => entry.required && entry.status !== "completed") || null);
      return;
    }
    const prerequisitesReady = candidate.prerequisiteActionIds.every((id) => ["completed", "skipped"].includes(findAction(state, id)?.status));
    if (!prerequisitesReady || candidate.blockerIds.length) {
      candidate.status = "blocked";
      transition(state, "blocked");
      state.blockers = candidate.blockerIds.length ? blockersForAction(state, candidate) : [{ blockerId: "session:prerequisite", code: "action_prerequisite_incomplete", message: "Сначала завершите prerequisite действия." }];
      state.currentPosition = positionFor(state, candidate);
      return;
    }
    candidate.status = "available";
    transition(state, "active");
    state.blockers = [];
    state.currentPosition = positionFor(state, candidate);
    state.updatedAt = now;
  }

  function validateSessionSource(state, plan, context) {
    const source = validateSourceExecutionPlan(plan, state.projectId, context);
    if (!source.isValid) return { isValid: false, reasonCode: source.diagnostics[0].code, diagnostics: source.diagnostics };
    const diagnostics = [];
    const expected = sourceIdentityFromPlan(plan);
    for (const [key, value] of Object.entries(expected)) if ((state[key] ?? null) !== (value ?? null)) diagnostics.push(diagnostic(key === "sourceImportRevision" ? "source_identity_mismatch" : "source_identity_mismatch", { field: key }));
    if (state.planSnapshot) {
      const payload = copy(state.planSnapshot);
      delete payload.snapshotFingerprint;
      if (fingerprint(payload) !== state.planSnapshot.snapshotFingerprint) diagnostics.push(diagnostic("session_snapshot_invalid"));
      if (state.planSnapshot.planFingerprint !== plan.planFingerprint || canonicalize(state.planSnapshot.sourceIdentity) !== canonicalize(expected)) diagnostics.push(diagnostic("source_identity_mismatch", { field: "planSnapshot" }));
      const expectedSnapshot = buildPlanSnapshot(plan);
      if (canonicalize(state.planSnapshot) !== canonicalize(expectedSnapshot)) diagnostics.push(diagnostic("source_identity_mismatch", { field: "planSnapshotContent" }));
    }
    if (calculateSessionFingerprint(state) !== state.sessionFingerprint) diagnostics.push(diagnostic("session_snapshot_invalid", { field: "sessionFingerprint" }));
    const stable = stableDiagnostics(diagnostics);
    return { isValid: stable.length === 0, reasonCode: stable[0]?.code || null, diagnostics: stable };
  }

  function markSessionStale(state, reasonCode = "source_identity_mismatch", nowValue = null) {
    requireSession(state);
    if (state.status === "stale") return copy(state);
    const now = nowValue || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    next.status = "stale";
    next.updatedAt = now;
    next.interruption = null;
    next.failure = { code: reasonCode, message: errorMessage(reasonCode) };
    next.blockers = [{ blockerId: `session:${reasonCode}`, code: reasonCode, message: errorMessage(reasonCode) }];
    appendAudit(next, reasonCode === "imported_identity_unverifiable" ? "import_marked_stale" : "session_became_stale", now, { actionId: next.currentPosition.actionId, reasonCode });
    sealState(next);
    return deepFreeze(next);
  }

  function getExecutionSessionSummary(state) {
    requireSession(state);
    const action = findAction(state, state.currentPosition.actionId);
    const phase = state.planSnapshot?.phases.find((entry) => entry.phaseId === state.currentPosition.phaseId) || null;
    const component = state.planSnapshot?.components.find((entry) => entry.componentId === state.currentPosition.componentId) || null;
    return copy({
      status: state.status,
      currentPosition: state.currentPosition,
      currentAction: action,
      currentPhase: phase,
      currentComponent: component,
      blockers: state.blockers,
      checkpoints: action ? state.planSnapshot?.checkpoints.filter((entry) => action.checkpointIds.includes(entry.checkpointId)) || [] : [],
    });
  }

  function inspectAggregate(aggregate) {
    const project = aggregate?.project || null;
    const calculation = array(aggregate?.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    if (!project || !calculation) return { state: "missing_project", project, calculation, executionPlan: null, executionSession: null };
    const progress = array(aggregate.progress).filter((entry) => entry.calculation_id === calculation.calculation_id && entry.epoch === 1);
    const find = (kind) => progress.find((entry) => entry.kind === kind) || null;
    const executionPlanProgress = find("PATTERN_EXECUTION_PLAN");
    const executionSessionProgress = find(PROGRESS_KIND);
    const context = {
      technologyReview: find("PATTERN_TECHNOLOGY_REVIEW")?.state || null,
      technologyDraft: find("PATTERN_TECHNOLOGY_DRAFT")?.state || null,
      analysisReview: find("PATTERN_ANALYSIS_REVIEW")?.state || null,
      semanticAnalysis: find("PATTERN_SEMANTIC_ANALYSIS")?.state || null,
      requireCurrentIdentity: true,
    };
    const executionPlan = executionPlanProgress?.state || null;
    const executionSession = executionSessionProgress?.state || null;
    const planValidation = validateSourceExecutionPlan(executionPlan, project.project_id, context);
    if (!executionPlan) return { state: executionSession ? "stale" : "plan_missing", reasonCode: "execution_plan_missing", project, calculation, executionPlan, executionSession, executionSessionProgress, context, planValidation };
    if (!planValidation.isValid) return { state: executionSession ? "stale" : "plan_invalid", reasonCode: planValidation.diagnostics[0].code, project, calculation, executionPlan, executionPlanProgress, executionSession, executionSessionProgress, context, planValidation };
    if (!executionSession) return { state: "creatable", project, calculation, executionPlan, executionPlanProgress, executionSession: null, context, planValidation };
    const stale = detectExecutionSessionStaleness(executionSession, executionPlan, context);
    return { state: stale.isStale ? "stale" : executionSession.status, reasonCode: stale.reasonCode, project, calculation, executionPlan, executionPlanProgress, executionSession, executionSessionProgress, context, planValidation };
  }

  async function ensureForProject(repository, projectId) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.project || !inspected.calculation) return inspected;
    if (!inspected.executionSession && inspected.planValidation?.isValid) {
      const initial = createExecutionSession(inspected.executionPlan, projectId, { context: inspected.context, expectedPlanRevision: inspected.executionPlan.revision });
      await repository.ensurePatternExecutionSession(projectId, inspected.calculation.calculation_id, initial, { operationKind: "PATTERN_EXECUTION_SESSION_CREATED", projectStage: "pattern_execution_session_waiting" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.executionSession && inspected.state === "stale" && inspected.executionSession.status !== "stale") {
      const stale = markSessionStale(inspected.executionSession, inspected.reasonCode || "source_identity_mismatch");
      await repository.updatePatternExecutionSession(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_EXECUTION_SESSION_STALE", projectStage: "pattern_execution_session_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (inspected.executionSession && ["starting", "active"].includes(inspected.executionSession.status)) {
      const recovered = recoverInterruptedExecutionSession(inspected.executionSession, inspected.executionPlan);
      await repository.updatePatternExecutionSession(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_EXECUTION_SESSION_RECOVERED", projectStage: `pattern_execution_session_${recovered.status}` });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function applyForProject(repository, projectId, operation, options = {}) {
    const inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.executionSession) throw sessionError("execution_session_missing", "Сессия выполнения не создана.");
    const expectedRevision = options.expectedRevision === undefined ? inspected.executionSession.revision : options.expectedRevision;
    const next = operation(inspected.executionSession, inspected.executionPlan, { ...options, expectedRevision, context: inspected.context });
    if (canonicalize(next) === canonicalize(inspected.executionSession)) return inspected;
    await repository.updatePatternExecutionSession(projectId, inspected.calculation.calculation_id, next, {
      operationKind: options.operationKind || `PATTERN_EXECUTION_SESSION_${next.status.toUpperCase()}`,
      projectStage: `pattern_execution_session_${next.status}`,
    });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function startForProject(repository, projectId, options = {}) {
    let inspected = await ensureForProject(repository, projectId);
    if (!inspected.executionSession) throwForDiagnostic(inspected.planValidation?.diagnostics?.[0] || diagnostic(inspected.reasonCode || "execution_plan_missing"));
    return applyForProject(repository, projectId, (state, plan, settings) => startExecutionSession(state, plan, settings), { ...options, operationKind: "PATTERN_EXECUTION_SESSION_STARTED" });
  }

  async function pauseForProject(repository, projectId, options = {}) {
    return applyForProject(repository, projectId, (state, _plan, settings) => pauseExecutionSession(state, settings), { ...options, operationKind: "PATTERN_EXECUTION_SESSION_PAUSED" });
  }

  async function resumeForProject(repository, projectId, options = {}) {
    return applyForProject(repository, projectId, (state, plan, settings) => resumeExecutionSession(state, plan, settings), { ...options, operationKind: "PATTERN_EXECUTION_SESSION_RESUMED" });
  }

  async function startActionForProject(repository, projectId, actionId, options = {}) {
    return applyForProject(repository, projectId, (state, _plan, settings) => startCurrentAction(state, { ...settings, actionId }), { ...options, operationKind: "PATTERN_EXECUTION_ACTION_STARTED" });
  }

  async function completeActionForProject(repository, projectId, actionId, options = {}) {
    return applyForProject(repository, projectId, (state, _plan, settings) => completeCurrentAction(state, { ...settings, actionId, result: options.result }), { ...options, operationKind: "PATTERN_EXECUTION_ACTION_COMPLETED" });
  }

  async function skipActionForProject(repository, projectId, actionId, options = {}) {
    return applyForProject(repository, projectId, (state, _plan, settings) => skipCurrentAction(state, { ...settings, actionId }), { ...options, operationKind: "PATTERN_EXECUTION_ACTION_SKIPPED" });
  }

  async function rebuildForProject(repository, projectId, options = {}) {
    return applyForProject(repository, projectId, (state, plan, settings) => rebuildExecutionSession(state, plan, { ...settings, confirmed: options.confirmed === true }), { ...options, operationKind: "PATTERN_EXECUTION_SESSION_REBUILT" });
  }

  function calculateSessionFingerprint(state) {
    const payload = copy(state);
    delete payload.sessionFingerprint;
    return fingerprint(payload);
  }

  function sealState(state) {
    state.sessionFingerprint = null;
    state.sessionFingerprint = calculateSessionFingerprint(state);
  }

  function transition(state, target) {
    if (state.status === target) return;
    if (!array(TRANSITIONS[state.status]).includes(target)) throwInvalidTransition(state.status, target);
    state.status = target;
  }

  function positionFor(state, action) {
    const required = state.execution.actions.filter((entry) => entry.required);
    const complete = required.filter((entry) => entry.status === "completed").length;
    return {
      phaseId: action?.phaseId ?? null,
      componentId: action?.componentId ?? null,
      actionId: action?.actionId ?? null,
      actionIndex: action ? state.execution.actions.findIndex((entry) => entry.actionId === action.actionId) : -1,
      completedRequiredCount: complete,
      totalRequiredCount: required.length,
      progressPercent: progressPercent(complete, required.length),
    };
  }

  function emptyPosition() {
    return { phaseId: null, componentId: null, actionId: null, actionIndex: -1, completedRequiredCount: 0, totalRequiredCount: 0, progressPercent: 0 };
  }

  function progressPercent(complete, total) { return total === 0 ? 100 : Math.floor((complete * 100) / total); }
  function firstOutstanding(state) { return state.execution.actions.find((entry) => !["completed", "skipped"].includes(entry.status)) || null; }
  function findAction(state, actionId) { return actionId ? array(state?.execution?.actions).find((entry) => entry.actionId === actionId) || null : null; }
  function currentAction(state, requestedId) {
    const currentId = state.currentPosition?.actionId;
    if (!requestedId || requestedId !== currentId) throw sessionError("action_not_current", "Можно изменить только текущее действие.");
    const action = findAction(state, requestedId);
    if (!action) throw sessionError("action_not_found", "Действие не найдено.");
    return action;
  }
  function assertPrerequisitesComplete(state, action) {
    if (action.prerequisiteActionIds.some((id) => !["completed", "skipped"].includes(findAction(state, id)?.status))) throw sessionError("action_prerequisite_incomplete", "Prerequisite действия ещё не завершены.");
  }
  function blockersForAction(state, action) {
    const map = new Map(array(state.planSnapshot?.blockers).map((entry) => [entry.blockerId, entry]));
    return action.blockerIds.map((id) => copy(map.get(id) || { blockerId: id, code: "no_available_action", message: "Действие заблокировано." }));
  }
  function snapshotComplete(state) { return object(state.planSnapshot) && array(state.execution?.actions).length === array(state.planSnapshot?.actions).length && object(state.currentPosition); }
  function hasDependencyCycle(actions) {
    const map = new Map(actions.map((entry) => [entry.actionId, entry]));
    const colors = new Map();
    const visit = (id) => {
      if (colors.get(id) === 1) return true;
      if (colors.get(id) === 2) return false;
      colors.set(id, 1);
      for (const dependency of array(map.get(id)?.prerequisiteActionIds)) if (map.has(dependency) && visit(dependency)) return true;
      colors.set(id, 2);
      return false;
    };
    return actions.some((entry) => visit(entry.actionId));
  }
  function appendAudit(state, event, at, details = {}) {
    state.audit = [...array(state.audit), { event, at, revision: state.revision, ...copy(details) }].slice(-AUDIT_LIMIT);
  }
  function checkRevision(state, expectedRevision) {
    const expected = expectedRevision === undefined ? state.revision : expectedRevision;
    if (expected !== state.revision) throw sessionError("session_revision_conflict", "Сессия была изменена в другой операции.", { expectedRevision: expected, actualRevision: state.revision });
  }
  function requireSession(state) {
    if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || !STATUSES.includes(state.status) || !positiveInteger(state.revision)) throw sessionError("session_snapshot_invalid", "Запись Stage 23 повреждена.");
  }
  function throwInvalidTransition(from, to) { throw sessionError("invalid_status_transition", `Переход ${from} → ${to} недопустим.`); }
  function throwForDiagnostic(entry) { throw sessionError(entry?.code || "execution_plan_invalid", errorMessage(entry?.code), entry?.details || {}); }
  function sessionError(code, message, details = {}) { return new PatternExecutionSessionError(code, message || errorMessage(code), details); }
  function errorMessage(code) {
    return ({
      execution_plan_missing: "План выполнения Stage 22 не найден.",
      execution_plan_not_ready: "План Stage 22 ещё не готов к выполнению.",
      execution_plan_invalid: "План Stage 22 не прошёл проверку.",
      execution_plan_stale: "План Stage 22 устарел.",
      source_identity_mismatch: "Identity Stage 18–22 не доказуема.",
      session_revision_conflict: "Revision сессии изменилась.",
      session_snapshot_invalid: "Snapshot сессии повреждён.",
      imported_identity_unverifiable: "После импорта identity источника не может считаться доказанной.",
    })[code] || "Операция выполнения недоступна.";
  }
  function technologyReviewFingerprint(review) {
    const planApi = getPlanApi();
    return planApi?.technologyReviewFingerprint ? planApi.technologyReviewFingerprint(review) : null;
  }
  function getPlanApi() { return globalObject.YarnAIPatternExecutionPlan || null; }
  function diagnostic(code, details = {}) { return { code, severity: "critical", details: copy(details) }; }
  function stableDiagnostics(entries) {
    const map = new Map();
    for (const entry of entries) map.set(canonicalize(entry), entry);
    return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details)));
  }
  function compareOrder(left, right) { return numericOrder(left.order) - numericOrder(right.order) || lexical(text(left.id), text(right.id)); }
  function phaseOrder(phases, id) { return phases.find((entry) => entry.phaseId === id)?.order ?? Number.MAX_SAFE_INTEGER; }
  function numericOrder(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function stableIds(values) { return [...new Set(array(values).filter((entry) => typeof entry === "string" && entry.length))].sort(lexical); }
  function validFingerprint(value) { return typeof value === "string" && value.length === 16 && value.startsWith("fnv1a32:") && [...value.slice(8)].every((character) => "0123456789abcdef".includes(character)); }
  function isTimestamp(value) { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)); }
  function nullableTimestamp(value) { return value === null || isTimestamp(value); }
  function positiveInteger(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : null; }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function timestampNow() { return new Date().toISOString(); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `execution-session:${fingerprint({ at: timestampNow() }).slice(9)}`; }

  const api = {
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, ACTION_STATUSES, AUDIT_EVENTS, AUDIT_LIMIT, TRANSITIONS,
    PatternExecutionSessionError, canonicalize, fingerprint, sourceIdentityFromPlan,
    validateSourceExecutionPlan, createExecutionSession, createInitialState: createExecutionSession,
    startExecutionSession, resumeExecutionSession, pauseExecutionSession, startCurrentAction,
    completeCurrentAction, skipCurrentAction, validateExecutionSession, validateStructural,
    validateSemantic, detectExecutionSessionStaleness, recoverInterruptedExecutionSession,
    rebuildExecutionSession, getExecutionSessionSummary, buildPlanSnapshot, buildExecution,
    calculateSessionFingerprint, markSessionStale, inspectAggregate, ensureForProject, startForProject,
    pauseForProject, resumeForProject, startActionForProject, completeActionForProject,
    skipActionForProject, rebuildForProject,
  };
  globalObject.YarnAIPatternExecutionSession = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
