"use strict";

(function exposePatternExecutionSession(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_SESSION";
  const VIRTUAL_DRY_RUN_CONTRACT_ID = "PATTERN_EXECUTION_VIRTUAL_DRY_RUN_V1";
  const VIRTUAL_DRY_RUN_MODE = "virtual_dry_run";
  const VIRTUAL_DRY_RUN_STATUSES = Object.freeze(["ready", "active", "completed"]);
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
    "virtual_dry_run_created", "virtual_dry_run_started", "virtual_step_completed", "virtual_dry_run_completed",
    "physical_session_lineage_created",
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
    if (plan?.plan?.contractId === "PATTERN_EXECUTION_PLAN_V2" && (!planApi || plan.planningAlgorithmVersion !== planApi.PLANNING_ALGORITHM_VERSION)) add("execution_plan_stale", { field: "planningAlgorithmVersion", expected: planApi?.PLANNING_ALGORITHM_VERSION ?? null, actual: plan.planningAlgorithmVersion ?? null });
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
        instructionEvidence: context.instructionEvidence || null,
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
      virtualDryRun: null,
      historicalVirtualDryRuns: [],
      supersededPhysicalLineages: [],
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
    if (state.virtualDryRun?.status === "active") throw sessionError("virtual_dry_run_active", "Сначала завершите виртуальную проверку. Физическое выполнение остаётся не начатым.");
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

  function createPhysicalSessionLineage(state, plan, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    const source = validateSourceExecutionPlan(plan, state.projectId, options.context || {});
    if (!source.isValid) throwForDiagnostic(source.diagnostics[0]);
    const alreadyCurrent = validateSessionSource(state, plan, options.context || {}).isValid;
    if (alreadyCurrent && state.status === "waiting" && array(state.supersededPhysicalLineages).length) return copy(state);
    if (options.confirmed !== true) throw sessionError("rebuild_confirmation_required", "Для новой physical lineage нужно явное подтверждение.");
    if (state.status !== "stale") throw sessionError("physical_lineage_source_not_stale", "Новая physical lineage создаётся только из fail-closed stale-сессии.");
    if (
      state.planSnapshot !== null || array(state.execution?.actions).length || array(state.completedActionIds).length ||
      array(state.skippedActionIds).length || integer(state.currentPosition?.completedRequiredCount) !== 0 ||
      integer(state.currentPosition?.progressPercent) !== 0
    ) throw sessionError("physical_progress_migration_forbidden", "Старая сессия содержит физический progress; автоматический перенос запрещён.");
    const virtualHistory = [...array(state.historicalVirtualDryRuns).map(copy)];
    if (state.virtualDryRun) {
      const structural = validateVirtualDryRunStructural(state.virtualDryRun);
      const semantic = structural.length ? [] : validateVirtualDryRunSemantic(state.virtualDryRun);
      if (structural.length || semantic.length || state.virtualDryRun.status !== "completed") throw sessionError("virtual_history_invalid", "Завершённая virtual history не прошла проверку и не может быть перенесена.");
      if (state.virtualDryRun.receipts.some((entry) => entry.physicalCompletion !== false || entry.fitConfirmed !== false)) throw sessionError("virtual_history_physical_boundary_invalid", "Virtual history содержит недопустимую физическую отметку.");
      if (!virtualHistory.some((entry) => entry.id === state.virtualDryRun.id && entry.runFingerprint === state.virtualDryRun.runFingerprint)) virtualHistory.push(copy(state.virtualDryRun));
    }
    const now = options.now || timestampNow();
    const next = mutable(createExecutionSession(plan, state.projectId, {
      context: options.context || {}, expectedPlanRevision: plan.revision, now, id: options.id,
    }));
    next.historicalVirtualDryRuns = virtualHistory;
    next.supersededPhysicalLineages = [
      ...array(state.supersededPhysicalLineages).map(copy),
      supersededLineageEvidence(state, now, options.reasonCode || "source_identity_mismatch"),
    ];
    appendAudit(next, "physical_session_lineage_created", now, {
      previousSessionId: state.id,
      previousSessionRevision: state.revision,
      previousSessionFingerprint: state.sessionFingerprint,
      historicalVirtualRunIds: virtualHistory.map((entry) => entry.id),
    });
    sealState(next);
    return deepFreeze(next);
  }

  function supersededLineageEvidence(state, supersededAt, reasonCode) {
    const evidence = {
      sessionId: state.id,
      sessionRevision: state.revision,
      sessionFingerprint: state.sessionFingerprint,
      status: state.status,
      reasonCode,
      sourceIdentity: Object.fromEntries(Object.keys(sourceIdentityFromPlan({})).map((key) => [key, state[key] ?? null])),
      physicalProgress: {
        planSnapshotPresent: state.planSnapshot !== null,
        executionActionCount: array(state.execution?.actions).length,
        completedActionCount: array(state.completedActionIds).length,
        skippedActionCount: array(state.skippedActionIds).length,
        progressPercent: integer(state.currentPosition?.progressPercent),
      },
      virtualRunIds: [state.virtualDryRun, ...array(state.historicalVirtualDryRuns)].filter(Boolean).map((entry) => entry.id),
      supersededAt,
      evidenceFingerprint: null,
    };
    const payload = copy(evidence);
    delete payload.evidenceFingerprint;
    evidence.evidenceFingerprint = fingerprint(payload);
    return evidence;
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
    for (const key of ["historicalVirtualDryRuns", "supersededPhysicalLineages"]) if (state?.[key] !== undefined && !Array.isArray(state[key])) add("session_snapshot_invalid", { field: key });
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
    if (state?.virtualDryRun !== null && validateVirtualDryRunStructural(state.virtualDryRun).length) add("session_snapshot_invalid", { field: "virtualDryRun" });
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
    if (state.virtualDryRun !== null) diagnostics.push(...validateVirtualDryRunSemantic(state.virtualDryRun).map((entry) => diagnostic(entry.code, { ...entry.details, field: "virtualDryRun" })));
    for (const [index, run] of array(state.historicalVirtualDryRuns).entries()) {
      diagnostics.push(...validateVirtualDryRunStructural(run).map((entry) => diagnostic(entry.code, { ...entry.details, field: `historicalVirtualDryRuns[${index}]` })));
      diagnostics.push(...validateVirtualDryRunSemantic(run).map((entry) => diagnostic(entry.code, { ...entry.details, field: `historicalVirtualDryRuns[${index}]` })));
    }
    const historicalRunIds = array(state.historicalVirtualDryRuns).map((entry) => entry?.id);
    if (new Set(historicalRunIds).size !== historicalRunIds.length || state.virtualDryRun && historicalRunIds.includes(state.virtualDryRun.id)) add("session_snapshot_invalid", { field: "virtualRunLineageUniqueness" });
    for (const [index, evidence] of array(state.supersededPhysicalLineages).entries()) {
      const payload = copy(evidence);
      delete payload.evidenceFingerprint;
      if (!text(evidence?.sessionId) || !positiveInteger(evidence?.sessionRevision) || !validFingerprint(evidence?.sessionFingerprint) || !isTimestamp(evidence?.supersededAt) || !validFingerprint(evidence?.evidenceFingerprint) || fingerprint(payload) !== evidence.evidenceFingerprint) add("session_snapshot_invalid", { field: `supersededPhysicalLineages[${index}]` });
      if (evidence?.physicalProgress?.planSnapshotPresent !== false || integer(evidence?.physicalProgress?.executionActionCount) !== 0 || integer(evidence?.physicalProgress?.completedActionCount) !== 0 || integer(evidence?.physicalProgress?.skippedActionCount) !== 0 || integer(evidence?.physicalProgress?.progressPercent) !== 0) add("physical_progress_migration_forbidden", { field: `supersededPhysicalLineages[${index}]` });
    }
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
          stepId: action.stepId ?? null,
          sourceOperationIdentity: action.sourceOperationIdentity ?? null,
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
      "stepId", "sourceOperationIdentity", "globalOrder", "needles", "repeat", "criterion",
      "inputState", "outputState", "sourceLocator", "sourceEvidenceUnitIdentity",
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
        stepId: source.stepId,
        sourceOperationIdentity: source.sourceOperationIdentity,
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
    if (state.virtualDryRun) {
      const expectedSnapshot = buildPlanSnapshot(plan);
      if (state.virtualDryRun.sourceExecutionPlanId !== plan.id || state.virtualDryRun.sourceExecutionPlanRevision !== plan.revision || state.virtualDryRun.sourceExecutionPlanFingerprint !== plan.planFingerprint || state.virtualDryRun.planSnapshotFingerprint !== expectedSnapshot.snapshotFingerprint) diagnostics.push(diagnostic("source_identity_mismatch", { field: "virtualDryRun" }));
      const expectedOrder = expectedSnapshot.actions.map((entry) => ({ stepId: entry.stepId, actionId: entry.actionId, sourceOperationIdentity: entry.sourceOperationIdentity }));
      const actualOrder = state.virtualDryRun.execution.actions.map((entry) => ({ stepId: entry.stepId, actionId: entry.actionId, sourceOperationIdentity: entry.sourceOperationIdentity }));
      if (canonicalize(actualOrder) !== canonicalize(expectedOrder)) diagnostics.push(diagnostic("source_identity_mismatch", { field: "virtualDryRunOrder" }));
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
      instructionEvidence: find("SOURCE_PATTERN_INSTRUCTION_EVIDENCE")?.state || null,
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
      projectStage: options.projectStage || `pattern_execution_session_${next.status}`,
    });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function startForProject(repository, projectId, options = {}) {
    let inspected = await ensureForProject(repository, projectId);
    if (!inspected.executionSession) throwForDiagnostic(inspected.planValidation?.diagnostics?.[0] || diagnostic(inspected.reasonCode || "execution_plan_missing"));
    return applyForProject(repository, projectId, (state, plan, settings) => startExecutionSession(state, plan, settings), { ...options, operationKind: "PATTERN_EXECUTION_SESSION_STARTED" });
  }

  function createVirtualDryRun(state, plan, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (state.status !== "waiting") throw sessionError("physical_session_already_started", "Физическое выполнение уже начато; виртуальную проверку нельзя смешивать с ним.");
    const source = validateSessionSource(state, plan, options.context || {});
    if (!source.isValid) throwForDiagnostic(source.diagnostics[0]);
    if (state.virtualDryRun) return copy(state);
    const now = options.now || timestampNow();
    const snapshot = buildPlanSnapshot(plan);
    const execution = buildExecution(snapshot);
    const first = execution.actions[0] || null;
    const virtual = {
      id: options.id || makeId(),
      contractId: VIRTUAL_DRY_RUN_CONTRACT_ID,
      mode: VIRTUAL_DRY_RUN_MODE,
      revision: 1,
      status: "ready",
      started: false,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      sourceExecutionPlanId: plan.id,
      sourceExecutionPlanRevision: plan.revision,
      sourceExecutionPlanFingerprint: plan.planFingerprint,
      planSnapshotFingerprint: snapshot.snapshotFingerprint,
      executionGraphFingerprint: plan.plan?.handoff?.executionGraphFingerprint ?? null,
      execution,
      currentPosition: virtualPosition(execution.actions, first),
      completedStepIds: [],
      receipts: [],
      result: null,
      runFingerprint: null,
    };
    sealVirtualDryRun(virtual);
    const next = mutable(state);
    next.revision += 1;
    next.updatedAt = now;
    next.virtualDryRun = virtual;
    appendAudit(next, "virtual_dry_run_created", now, { virtualRunId: virtual.id });
    sealState(next);
    return deepFreeze(next);
  }

  function startVirtualDryRun(state, plan, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (state.status !== "waiting") throw sessionError("physical_session_already_started", "Физическое выполнение уже начато; виртуальную проверку нельзя смешивать с ним.");
    const source = validateSessionSource(state, plan, options.context || {});
    if (!source.isValid) throwForDiagnostic(source.diagnostics[0]);
    if (!state.virtualDryRun) throw sessionError("virtual_dry_run_missing", "Сначала подготовьте виртуальную проверку.");
    if (["active", "completed"].includes(state.virtualDryRun.status)) return copy(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    next.updatedAt = now;
    const run = next.virtualDryRun;
    run.revision += 1;
    run.status = run.execution.actions.length ? "active" : "completed";
    run.started = true;
    run.startedAt = run.startedAt || now;
    run.updatedAt = now;
    if (run.execution.actions[0]) run.execution.actions[0].status = "available";
    run.currentPosition = virtualPosition(run.execution.actions, run.execution.actions[0] || null);
    if (run.status === "completed") completeVirtualResult(run, now);
    sealVirtualDryRun(run);
    appendAudit(next, "virtual_dry_run_started", now, { virtualRunId: run.id });
    sealState(next);
    return deepFreeze(next);
  }

  function completeVirtualStep(state, plan, options = {}) {
    requireSession(state);
    checkRevision(state, options.expectedRevision);
    if (state.status !== "waiting") throw sessionError("physical_session_already_started", "Физическое выполнение уже начато; виртуальную отметку сохранить нельзя.");
    const source = validateSessionSource(state, plan, options.context || {});
    if (!source.isValid) throwForDiagnostic(source.diagnostics[0]);
    const run = state.virtualDryRun;
    if (!run) throw sessionError("virtual_dry_run_not_active", "Виртуальная проверка не запущена.");
    const operationId = text(options.operationId) || makeId();
    const prior = run.receipts.find((entry) => entry.operationId === operationId);
    if (prior) {
      if (prior.stepId !== options.stepId) throw sessionError("operation_id_conflict", "Эта отметка уже использована для другого виртуального шага.");
      return copy(state);
    }
    if (run.status !== "active") throw sessionError("virtual_dry_run_not_active", "Виртуальная проверка не запущена.");
    const current = run.execution.actions[run.currentPosition.actionIndex] || null;
    if (!current || current.stepId !== options.stepId || current.actionId !== options.actionId) throw sessionError("action_not_current", "Можно виртуально отметить только текущий шаг.");
    const now = options.now || timestampNow();
    const next = mutable(state);
    next.revision += 1;
    next.updatedAt = now;
    const virtual = next.virtualDryRun;
    const action = virtual.execution.actions[virtual.currentPosition.actionIndex];
    action.status = "completed";
    action.startedAt = action.startedAt || now;
    action.completedAt = now;
    const receipt = {
      operationId,
      receiptType: "virtual_interface_confirmation",
      runMode: VIRTUAL_DRY_RUN_MODE,
      virtualRunId: virtual.id,
      stepId: action.stepId,
      actionId: action.actionId,
      sourceOperationIdentity: action.sourceOperationIdentity,
      order: action.order,
      confirmedAt: now,
      physicalCompletion: false,
      fitConfirmed: false,
    };
    action.result = { receiptType: receipt.receiptType, operationId, physicalCompletion: false, fitConfirmed: false };
    virtual.completedStepIds.push(action.stepId);
    virtual.receipts.push(receipt);
    virtual.revision += 1;
    virtual.updatedAt = now;
    const nextAction = virtual.execution.actions[action.order] || null;
    if (nextAction) {
      nextAction.status = "available";
      virtual.currentPosition = virtualPosition(virtual.execution.actions, nextAction);
    } else {
      virtual.status = "completed";
      completeVirtualResult(virtual, now);
    }
    sealVirtualDryRun(virtual);
    appendAudit(next, "virtual_step_completed", now, { virtualRunId: virtual.id, stepId: action.stepId, actionId: action.actionId, operationId });
    if (virtual.status === "completed") appendAudit(next, "virtual_dry_run_completed", now, { virtualRunId: virtual.id, completedStepCount: virtual.completedStepIds.length });
    sealState(next);
    return deepFreeze(next);
  }

  function validateVirtualDryRunStructural(run) {
    const diagnostics = [];
    const add = (field) => diagnostics.push(diagnostic("virtual_dry_run_invalid", { field }));
    if (!object(run) || run.contractId !== VIRTUAL_DRY_RUN_CONTRACT_ID || run.mode !== VIRTUAL_DRY_RUN_MODE || !positiveInteger(run.revision) || !VIRTUAL_DRY_RUN_STATUSES.includes(run.status)) add("header");
    if (!text(run?.id) || !isTimestamp(run?.createdAt) || !isTimestamp(run?.updatedAt) || !nullableTimestamp(run?.startedAt) || !nullableTimestamp(run?.completedAt) || !validFingerprint(run?.runFingerprint)) add("identity");
    if (!text(run?.sourceExecutionPlanId) || !positiveInteger(run?.sourceExecutionPlanRevision) || !validFingerprint(run?.sourceExecutionPlanFingerprint) || !validFingerprint(run?.planSnapshotFingerprint)) add("source");
    if (!object(run?.execution) || run.execution.mode !== "sequential" || !Array.isArray(run.execution.actions) || !object(run?.currentPosition) || !Array.isArray(run?.completedStepIds) || !Array.isArray(run?.receipts)) add("progress");
    if (object(run) && validFingerprint(run.runFingerprint) && virtualDryRunFingerprint(run) !== run.runFingerprint) add("runFingerprint");
    return stableDiagnostics(diagnostics);
  }

  function validateVirtualDryRunSemantic(run) {
    const diagnostics = [];
    const add = (field, details = {}) => diagnostics.push(diagnostic("virtual_dry_run_invalid", { field, ...details }));
    const actions = array(run?.execution?.actions);
    const completed = actions.filter((entry) => entry.status === "completed");
    actions.forEach((entry, index) => {
      if (entry.order !== index + 1 || !text(entry.stepId) || !text(entry.actionId) || !text(entry.sourceOperationIdentity)) add("orderedOperationIdentity", { index });
      if (index < completed.length && entry.status !== "completed") add("contiguousCompletion", { index });
      if (index >= completed.length && !["pending", "available"].includes(entry.status)) add("actionStatus", { index });
    });
    if (canonicalize(run.completedStepIds) !== canonicalize(completed.map((entry) => entry.stepId))) add("completedStepIds");
    if (run.receipts.length !== completed.length || run.receipts.some((entry, index) => entry.receiptType !== "virtual_interface_confirmation" || entry.runMode !== VIRTUAL_DRY_RUN_MODE || entry.order !== index + 1 || entry.stepId !== completed[index]?.stepId || entry.sourceOperationIdentity !== completed[index]?.sourceOperationIdentity || entry.physicalCompletion !== false || entry.fitConfirmed !== false)) add("receipts");
    if (run.status === "ready" && (run.started !== false || completed.length || actions.some((entry) => entry.status !== "pending"))) add("ready");
    if (run.status === "active") {
      const current = actions[completed.length] || null;
      if (!run.started || !current || current.status !== "available" || run.currentPosition.actionIndex !== completed.length || run.currentPosition.stepId !== current.stepId) add("currentPosition");
    }
    if (run.status === "completed" && (completed.length !== actions.length || run.result?.resultType !== "virtual_dry_run_completed" || run.result?.physicalProductCompleted !== false || run.result?.fitConfirmed !== false)) add("completed");
    return stableDiagnostics(diagnostics);
  }

  function virtualPosition(actions, action) {
    const complete = actions.filter((entry) => entry.status === "completed").length;
    return { stepId: action?.stepId ?? null, actionId: action?.actionId ?? null, sourceOperationIdentity: action?.sourceOperationIdentity ?? null, actionIndex: action ? actions.indexOf(action) : -1, currentStepNumber: action ? action.order : actions.length, completedStepCount: complete, totalStepCount: actions.length };
  }

  function completeVirtualResult(run, now) {
    run.status = "completed";
    run.completedAt = now;
    run.currentPosition = virtualPosition(run.execution.actions, null);
    run.result = { resultType: "virtual_dry_run_completed", completedStepCount: run.execution.actions.length, physicalProductCompleted: false, fitConfirmed: false, completedAt: now };
  }

  function virtualDryRunFingerprint(run) { const payload = copy(run); delete payload.runFingerprint; return fingerprint(payload); }
  function sealVirtualDryRun(run) { run.runFingerprint = null; run.runFingerprint = virtualDryRunFingerprint(run); }

  function getVirtualDryRunSummary(state) {
    requireSession(state);
    const run = state.virtualDryRun;
    if (!run) return null;
    const action = run.execution.actions[run.currentPosition.actionIndex] || null;
    return copy({ id: run.id, contractId: run.contractId, mode: run.mode, revision: run.revision, status: run.status, started: run.started, currentPosition: run.currentPosition, currentStep: action, completedStepIds: run.completedStepIds, result: run.result, runFingerprint: run.runFingerprint });
  }

  function getDisplayVirtualDryRun(state) {
    requireSession(state);
    if (state.virtualDryRun) return copy(state.virtualDryRun);
    return copy(array(state.historicalVirtualDryRuns).at(-1) || null);
  }

  async function ensureVirtualDryRunForProject(repository, projectId, options = {}) {
    let inspected = await ensureForProject(repository, projectId);
    if (!inspected.executionSession) throwForDiagnostic(inspected.planValidation?.diagnostics?.[0] || diagnostic(inspected.reasonCode || "execution_plan_missing"));
    if (!inspected.executionSession.virtualDryRun) {
      const next = createVirtualDryRun(inspected.executionSession, inspected.executionPlan, { ...options, expectedRevision: inspected.executionSession.revision, context: inspected.context });
      await repository.updatePatternExecutionSession(projectId, inspected.calculation.calculation_id, next, { operationKind: "PATTERN_EXECUTION_VIRTUAL_DRY_RUN_CREATED", projectStage: "pattern_execution_virtual_ready" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function startVirtualDryRunForProject(repository, projectId, options = {}) {
    const inspected = await ensureVirtualDryRunForProject(repository, projectId, options);
    return applyForProject(repository, projectId, (state, plan, settings) => startVirtualDryRun(state, plan, settings), { ...options, operationKind: "PATTERN_EXECUTION_VIRTUAL_DRY_RUN_STARTED", projectStage: "pattern_execution_virtual_active" });
  }

  async function completeVirtualStepForProject(repository, projectId, stepId, actionId, options = {}) {
    return applyForProject(repository, projectId, (state, plan, settings) => completeVirtualStep(state, plan, { ...settings, stepId, actionId }), { ...options, operationKind: "PATTERN_EXECUTION_VIRTUAL_STEP_COMPLETED", projectStage: "pattern_execution_virtual_active" });
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
    const inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.executionSession) throw sessionError("execution_session_missing", "Сессия выполнения не создана.");
    const expectedRevision = options.expectedRevision === undefined ? inspected.executionSession.revision : options.expectedRevision;
    const next = createPhysicalSessionLineage(inspected.executionSession, inspected.executionPlan, {
      ...options, expectedRevision, context: inspected.context, confirmed: options.confirmed === true,
    });
    if (canonicalize(next) === canonicalize(inspected.executionSession)) return inspected;
    await repository.replacePatternExecutionSessionLineage(projectId, inspected.calculation.calculation_id, next, {
      operationKind: "PATTERN_EXECUTION_PHYSICAL_LINEAGE_CREATED",
      projectStage: "pattern_execution_session_waiting",
      expectedPreviousSessionId: inspected.executionSession.id,
      expectedPreviousSessionRevision: inspected.executionSession.revision,
      expectedPreviousSessionFingerprint: inspected.executionSession.sessionFingerprint,
    });
    return inspectAggregate(await repository.getProject(projectId));
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
    VIRTUAL_DRY_RUN_CONTRACT_ID, VIRTUAL_DRY_RUN_MODE, VIRTUAL_DRY_RUN_STATUSES,
    PatternExecutionSessionError, canonicalize, fingerprint, sourceIdentityFromPlan,
    validateSourceExecutionPlan, createExecutionSession, createInitialState: createExecutionSession,
    startExecutionSession, resumeExecutionSession, pauseExecutionSession, startCurrentAction,
    completeCurrentAction, skipCurrentAction, validateExecutionSession, validateStructural,
    validateSemantic, detectExecutionSessionStaleness, recoverInterruptedExecutionSession,
    rebuildExecutionSession, createPhysicalSessionLineage, getExecutionSessionSummary, buildPlanSnapshot, buildExecution,
    calculateSessionFingerprint, markSessionStale, inspectAggregate, ensureForProject, startForProject,
    pauseForProject, resumeForProject, startActionForProject, completeActionForProject,
    skipActionForProject, rebuildForProject, createVirtualDryRun, startVirtualDryRun, completeVirtualStep,
    validateVirtualDryRunStructural, validateVirtualDryRunSemantic, getVirtualDryRunSummary, getDisplayVirtualDryRun,
    ensureVirtualDryRunForProject, startVirtualDryRunForProject, completeVirtualStepForProject,
  };
  globalObject.YarnAIPatternExecutionSession = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
