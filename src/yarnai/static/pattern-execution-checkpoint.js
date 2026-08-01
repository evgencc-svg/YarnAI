"use strict";

(function exposePatternExecutionCheckpoint(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_CHECKPOINT";
  const AUDIT_LIMIT = 32;
  const OPERATION_LIMIT = 96;
  const COMMENT_LIMIT = 500;
  const STATUSES = Object.freeze([
    "waiting", "ready", "reviewing", "deferred", "rejected", "sync_pending",
    "confirmed", "blocked", "stale", "failed",
  ]);
  const CHECKPOINT_TYPES = Object.freeze([
    "visual_confirmation", "row_count", "stitch_count", "measurement", "size_length",
    "checkpoint_match", "required_result", "choice", "informational",
  ]);
  const REJECTION_REASONS = Object.freeze(["mismatch", "incomplete", "damaged", "needs_rework", "other"]);
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["ready", "blocked", "stale", "failed"]),
    ready: Object.freeze(["reviewing", "blocked", "stale", "failed"]),
    reviewing: Object.freeze(["deferred", "rejected", "sync_pending", "blocked", "stale", "failed"]),
    deferred: Object.freeze(["reviewing", "blocked", "stale", "failed"]),
    rejected: Object.freeze(["reviewing", "blocked", "stale", "failed"]),
    sync_pending: Object.freeze(["confirmed", "blocked", "stale", "failed"]),
    confirmed: Object.freeze([]),
    blocked: Object.freeze(["stale", "failed"]),
    stale: Object.freeze([]),
    failed: Object.freeze(["stale"]),
  });
  const AUDIT_EVENTS = Object.freeze([
    "created", "ready", "review_started", "observation_recorded", "deferred", "review_resumed",
    "rejected", "confirmation_requested", "confirmed", "recovery_checked", "blocked", "stale_detected",
    "failed", "rebuild_started", "rebuilt", "imported", "collision_remapped",
  ]);
  const SOURCE_TYPE_MAP = Object.freeze({
    visual_confirmation: "visual_confirmation", visual_check: "visual_confirmation",
    row_count: "row_count", row_count_check: "row_count",
    stitch_count: "stitch_count", stitch_count_check: "stitch_count",
    measurement: "measurement", measurement_check: "measurement", gauge_measurement: "measurement",
    size: "size_length", size_check: "size_length", length: "size_length", length_check: "size_length",
    checkpoint_match: "checkpoint_match", gauge_check: "checkpoint_match",
    required_result: "required_result", component_completion_check: "required_result",
    join_check: "required_result", finishing_check: "required_result",
    choice: "choice", structured_choice: "choice",
    informational: "informational", information_confirmation: "informational",
  });

  class PatternExecutionCheckpointError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionCheckpointError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw checkpointError("checkpoint_structure_invalid", "Checkpoint содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (object(value)) return `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    throw checkpointError("checkpoint_structure_invalid", "Checkpoint содержит неподдерживаемое значение.");
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

  function sourceIdentity(session, plan, step = null) {
    return {
      sourceSessionId: session?.id ?? null,
      sourceSessionRevision: integer(session?.revision),
      sourceSessionFingerprint: session?.sessionFingerprint ?? null,
      sourceSessionSnapshotFingerprint: session?.planSnapshot?.snapshotFingerprint ?? null,
      sourcePlanId: plan?.id ?? session?.sourceExecutionPlanId ?? null,
      sourcePlanRevision: integer(plan?.revision ?? session?.sourceExecutionPlanRevision),
      sourcePlanFingerprint: plan?.planFingerprint ?? session?.sourceExecutionPlanFingerprint ?? null,
      sourceStepId: step?.id ?? null,
      sourceStepRevision: step ? integer(step.revision) : null,
      sourceStepFingerprint: step?.stepFingerprint ?? null,
      sourceTechnologyReviewId: session?.sourceTechnologyReviewId ?? null,
      sourceTechnologyReviewRevision: integer(session?.sourceTechnologyReviewRevision),
      sourceTechnologyReviewFingerprint: session?.sourceTechnologyReviewFingerprint ?? null,
      sourceConfirmedSnapshotFingerprint: session?.sourceConfirmedSnapshotFingerprint ?? null,
      sourceTechnologyDraftId: session?.sourceTechnologyDraftId ?? null,
      sourceTechnologyDraftRevision: integer(session?.sourceTechnologyDraftRevision),
      sourceTechnologyDraftFingerprint: session?.sourceTechnologyDraftFingerprint ?? null,
      sourceAnalysisReviewId: session?.sourceAnalysisReviewId ?? null,
      sourceAnalysisReviewRevision: integer(session?.sourceAnalysisReviewRevision),
      sourceAnalysisReviewFingerprint: session?.sourceAnalysisReviewFingerprint ?? null,
      sourceSemanticAnalysisId: session?.sourceSemanticAnalysisId ?? null,
      sourceSemanticAnalysisRevision: integer(session?.sourceSemanticAnalysisRevision),
      sourceSemanticAnalysisFingerprint: session?.sourceSemanticAnalysisFingerprint ?? null,
      sourceImportRevision: integer(session?.sourceImportRevision),
      sourceAlgorithmVersion: integer(session?.sourceAlgorithmVersion),
      planningAlgorithmVersion: integer(session?.planningAlgorithmVersion),
      planningInputFingerprint: session?.planningInputFingerprint ?? null,
    };
  }

  function selectCheckpointSource(session, checkpointId = null) {
    const actionId = session?.currentPosition?.actionId;
    const action = array(session?.execution?.actions).find((entry) => entry.actionId === actionId) || null;
    if (!action || !["available", "in_progress"].includes(action.status)) return { valid: false, reasonCode: "current_action_unproven" };
    const ids = stableStrings(action.checkpointIds);
    if (!ids.length) return { valid: false, reasonCode: "checkpoint_source_missing" };
    const selectedId = text(checkpointId) || ids[0];
    if (!ids.includes(selectedId)) return { valid: false, reasonCode: "checkpoint_source_mismatch" };
    const checkpoint = array(session.planSnapshot?.checkpoints).find((entry) => entry.checkpointId === selectedId) || null;
    const phase = array(session.planSnapshot?.phases).find((entry) => entry.phaseId === action.phaseId) || null;
    const component = action.componentId === null ? null : array(session.planSnapshot?.components).find((entry) => entry.componentId === action.componentId) || null;
    const snapshotAction = array(session.planSnapshot?.actions).find((entry) => entry.actionId === action.actionId) || null;
    if (!checkpoint || !phase || !snapshotAction || checkpoint.phaseId !== action.phaseId) return { valid: false, reasonCode: "checkpoint_source_mismatch" };
    const type = SOURCE_TYPE_MAP[checkpoint.type] || null;
    if (!type) return { valid: false, reasonCode: "checkpoint_type_unsupported", details: { sourceType: checkpoint.type } };
    try {
      const observationSpecs = buildObservationSpecs(checkpoint, type);
      return { valid: true, checkpoint: copy(checkpoint), action: copy(action), snapshotAction: copy(snapshotAction), phase: copy(phase), component: copy(component), type, observationSpecs };
    } catch (error) {
      return { valid: false, reasonCode: error.code || "checkpoint_source_invalid", details: error.details || {} };
    }
  }

  function validateSourceChain(session, plan, step, context = {}, state = null, options = {}) {
    const errors = [];
    const add = (code, details = {}) => errors.push(diagnostic(code, details, "source"));
    if (!session || session.kind !== "PATTERN_EXECUTION_SESSION" || session.projectId !== (state?.projectId ?? plan?.projectId)) add("source_session_invalid");
    if (!plan || plan.kind !== "PATTERN_EXECUTION_PLAN" || plan.projectId !== (state?.projectId ?? session?.projectId) || plan.status !== "ready") add("source_plan_invalid");
    const sessionApi = getSessionApi();
    const planApi = getPlanApi();
    if (!sessionApi || !planApi) add("source_validator_missing");
    if (sessionApi && session && plan) {
      const result = sessionApi.validateExecutionSession(session, plan, {
        technologyReview: context.technologyReview || null,
        technologyDraft: context.technologyDraft || null,
        analysisReview: context.analysisReview || null,
        semanticAnalysis: context.semanticAnalysis || null,
        requireCurrentIdentity: context.requireCurrentIdentity !== false,
      });
      for (const entry of [...array(result.structural), ...array(result.semantic), ...array(result.source)]) add("source_identity_mismatch", { sourceCode: entry.code });
    }
    if (planApi && plan && planApi.calculatePlanFingerprint(plan) !== plan.planFingerprint) add("source_plan_invalid", { field: "fingerprint" });
    if (step) {
      if (step.kind !== "PATTERN_EXECUTION_STEP" || step.projectId !== session?.projectId || step.actionId !== session?.currentPosition?.actionId) add("source_step_invalid");
      if (!validFingerprint(step.stepFingerprint) || getStepApi()?.calculateStepFingerprint(step) !== step.stepFingerprint) add("source_step_invalid", { field: "fingerprint" });
    }
    if (context.requireCurrentIdentity !== false) {
      const expected = sourceIdentity(session, plan, step);
      for (const [field, value] of [
        ["sourceTechnologyReviewId", context.technologyReview?.id], ["sourceTechnologyDraftId", context.technologyDraft?.id],
        ["sourceAnalysisReviewId", context.analysisReview?.id], ["sourceSemanticAnalysisId", context.semanticAnalysis?.id],
      ]) if (!value || value !== expected[field]) add("source_identity_mismatch", { field });
      if (context.technologyReview?.revision !== expected.sourceTechnologyReviewRevision || context.technologyReview?.confirmedSnapshotFingerprint !== expected.sourceConfirmedSnapshotFingerprint || context.technologyReview?.status !== "confirmed") add("source_identity_mismatch", { stage: 21 });
      if (context.technologyDraft?.revision !== expected.sourceTechnologyDraftRevision || context.technologyDraft?.draftFingerprint !== expected.sourceTechnologyDraftFingerprint || context.technologyDraft?.sourceImportRevision !== expected.sourceImportRevision) add("source_identity_mismatch", { stage: 20 });
      if (context.analysisReview?.revision !== expected.sourceAnalysisReviewRevision || context.analysisReview?.sourceImportRevision !== expected.sourceImportRevision) add("source_identity_mismatch", { stage: 19 });
      if (context.semanticAnalysis?.revision !== expected.sourceSemanticAnalysisRevision || context.semanticAnalysis?.sourceImportRevision !== expected.sourceImportRevision) add("source_identity_mismatch", { stage: 18 });
    }
    if (state && session && plan) {
      const expected = sourceIdentity(session, plan, step);
      const originalFields = [
        "sourceSessionId", "sourceSessionRevision", "sourceSessionFingerprint", "sourceSessionSnapshotFingerprint",
        "sourcePlanId", "sourcePlanRevision", "sourcePlanFingerprint", "sourceStepId", "sourceStepRevision", "sourceStepFingerprint",
        "sourceTechnologyReviewId", "sourceTechnologyReviewRevision", "sourceTechnologyReviewFingerprint", "sourceConfirmedSnapshotFingerprint",
        "sourceTechnologyDraftId", "sourceTechnologyDraftRevision", "sourceTechnologyDraftFingerprint",
        "sourceAnalysisReviewId", "sourceAnalysisReviewRevision", "sourceAnalysisReviewFingerprint",
        "sourceSemanticAnalysisId", "sourceSemanticAnalysisRevision", "sourceSemanticAnalysisFingerprint",
        "sourceImportRevision", "sourceAlgorithmVersion", "planningAlgorithmVersion", "planningInputFingerprint",
      ];
      const synchronized = options.allowSynchronized && sessionAcknowledged(session, state.synchronization?.operationId, state.actionId);
      for (const field of originalFields) {
        if (["sourceSessionRevision", "sourceSessionFingerprint", "sourceStepRevision", "sourceStepFingerprint"].includes(field) && synchronized) continue;
        if ((state.identityChain?.[field] ?? null) !== (expected[field] ?? null)) add("source_identity_mismatch", { field });
      }
      const selected = selectCheckpointSource(session, state.checkpointId);
      if (!synchronized && (!selected.valid || selected.action.actionId !== state.actionId)) add(selected.reasonCode || "checkpoint_source_mismatch");
      if (!synchronized && step && !array(step.immutableSnapshot?.checkpointCriteria).some((entry) => entry.checkpointId === state.checkpointId)) add("source_step_checkpoint_missing");
      if (state.sourceStepId && !step) add("source_step_missing");
    }
    const stable = stableDiagnostics(errors);
    return { valid: stable.length === 0, errors: stable, stale: stable.length > 0 };
  }

  function createCheckpoint(session, plan, step = null, options = {}) {
    const projectId = options.projectId || session?.projectId;
    const checkpointId = options.checkpointId || null;
    const source = selectCheckpointSource(session, checkpointId);
    if (!source.valid) throw checkpointError(source.reasonCode, errorMessage(source.reasonCode), source.details || {});
    if (!step) throw checkpointError("source_step_missing", "Для checkpoint текущего action требуется связанный Stage 24.");
    if (step.status !== "checking" || step.actionId !== source.action.actionId || !array(step.immutableSnapshot?.checkpointCriteria).some((entry) => entry.checkpointId === source.checkpoint.checkpointId)) {
      throw checkpointError("source_step_not_ready", "Stage 24 ещё не доказал локальную готовность action к проверке.");
    }
    const validation = validateSourceChain(session, plan, step, options.context || {});
    if (!validation.valid) throwForDiagnostic(validation.errors[0]);
    const now = options.now || timestampNow();
    const identityChain = sourceIdentity(session, plan, step);
    const immutableSourceSnapshot = buildImmutableSnapshot(source, identityChain);
    const state = {
      id: options.id || makeId(), kind: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      projectId, revision: 1, createdAt: now, updatedAt: now,
      sourceSessionId: identityChain.sourceSessionId, sourcePlanId: identityChain.sourcePlanId, sourceStepId: identityChain.sourceStepId,
      componentId: source.component?.componentId ?? null, phaseId: source.phase.phaseId,
      actionId: source.action.actionId, checkpointId: source.checkpoint.checkpointId,
      identityChain, immutableSourceSnapshot,
      status: "waiting", lifecycle: { state: "waiting", previousState: null, readyAt: null, reviewingAt: null, deferredAt: null },
      observations: source.observationSpecs.map((spec) => ({ observationId: spec.observationId, type: spec.type, value: null, recordedAt: null })),
      decision: { status: "undecided", reasonCode: null, comment: null, decidedAt: null, operationId: null },
      synchronization: { status: "not_started", operationId: null, startedAt: null, sessionAcknowledgedAt: null, stepAcknowledgedAt: null, confirmedAt: null, resultingSessionIdentity: null, resultingStepIdentity: null },
      completionMetadata: null, validation: emptyValidation(), blockers: [], staleReason: null, failure: null,
      audit: [], operations: [], checkpointFingerprint: null,
    };
    appendAudit(state, "created", now, { checkpointId: state.checkpointId, actionId: state.actionId });
    return finish(state);
  }

  function buildImmutableSnapshot(source, identityChain) {
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      sourceIdentity: copy(identityChain),
      checkpoint: {
        checkpointId: source.checkpoint.checkpointId, sourceType: source.checkpoint.type, type: source.type,
        label: text(source.checkpoint.label) || checkpointLabel(source.checkpoint, source.type),
        expectedValue: copy(source.checkpoint.expectedValue), unit: source.checkpoint.unit ?? null,
        required: source.checkpoint.required !== false, blockingOnFailure: source.checkpoint.blockingOnFailure !== false,
        sourceTargetIds: stableStrings(source.checkpoint.sourceTargetIds), options: normalizeOptions(source.checkpoint.options),
      },
      component: source.component ? { componentId: source.component.componentId, label: source.component.label } : null,
      phase: { phaseId: source.phase.phaseId, title: source.phase.title },
      action: { actionId: source.action.actionId, title: source.action.title, instruction: source.action.instruction },
      observationSpecs: copy(source.observationSpecs), snapshotFingerprint: null,
    };
    const payload = copy(snapshot); delete payload.snapshotFingerprint;
    snapshot.snapshotFingerprint = fingerprint(payload);
    return deepFreeze(snapshot);
  }

  function buildObservationSpecs(source, type) {
    const expected = copy(source.expectedValue);
    const unit = source.unit ?? expected?.unit ?? null;
    const base = { observationId: stableId("observation", { checkpointId: source.checkpointId, type }), type, required: source.required !== false, unit };
    if (["row_count", "stitch_count"].includes(type)) {
      const value = numericValue(expected);
      if (!Number.isInteger(value) || value < 0) throw checkpointError("checkpoint_numeric_semantics_unproven", "Числовая семантика checkpoint не доказана.");
      return [{ ...base, expectedValue: value }];
    }
    if (["measurement", "size_length"].includes(type)) {
      const value = numericValue(expected);
      const range = normalizeRange(source.range ?? expected?.range);
      if ((value === null || value < 0) && !range) throw checkpointError("checkpoint_numeric_semantics_unproven", "Цель измерения checkpoint не доказана.");
      if (!text(unit)) throw checkpointError("checkpoint_unit_unproven", "Единица измерения checkpoint не доказана.");
      return [{ ...base, expectedValue: value, range }];
    }
    if (type === "choice") {
      const options = normalizeOptions(source.options);
      if (!options.length) throw checkpointError("checkpoint_options_missing", "Источник не содержит варианты выбора.");
      return [{ ...base, unit: null, options }];
    }
    return [{ ...base, unit: null, expectedValue: expected }];
  }

  function prepareCheckpoint(state, session, plan, step, options = {}) {
    const duplicate = beginMutation(state, "prepare", options, {}); if (duplicate) return copy(state);
    requireStatus(state, ["waiting"], "ready");
    const source = validateSourceChain(session, plan, step, options.context || {}, state);
    if (!source.valid) throwForDiagnostic(source.errors[0]);
    return mutateState(state, "ready", "ready", options, (next, now) => { next.lifecycle.readyAt = now; });
  }

  function startReview(state, options = {}) {
    const duplicate = beginMutation(state, "start", options, {}); if (duplicate) return copy(state);
    requireStatus(state, ["ready", "deferred", "rejected"], "reviewing");
    const event = state.status === "deferred" ? "review_resumed" : "review_started";
    return mutateState(state, "reviewing", event, options, (next, now) => { next.lifecycle.reviewingAt = next.lifecycle.reviewingAt || now; });
  }

  function setObservation(state, observationId, input, options = {}) {
    const payload = { observationId, input };
    const duplicate = beginMutation(state, "set_observation", options, payload); if (duplicate) return copy(state);
    requireStatus(state, ["reviewing"], "reviewing");
    const spec = array(state.immutableSourceSnapshot?.observationSpecs).find((entry) => entry.observationId === observationId);
    if (!spec) throw checkpointError("observation_unknown", "Observation отсутствует в immutable source snapshot.");
    const value = normalizeObservation(spec, input);
    const now = options.now || timestampNow();
    const next = mutable(state); prepareRevision(next, now);
    const observation = next.observations.find((entry) => entry.observationId === observationId);
    observation.value = value; observation.recordedAt = now;
    appendAudit(next, "observation_recorded", now, { operationId: options.operationId, observationId });
    recordOperation(next, options.operationId, "set_observation", payload);
    return finish(next);
  }

  function deferCheckpoint(state, options = {}) {
    const payload = { reason: limitedText(options.reason, COMMENT_LIMIT) };
    const duplicate = beginMutation(state, "defer", options, payload); if (duplicate) return copy(state);
    requireStatus(state, ["reviewing"], "deferred");
    return mutateState(state, "deferred", "deferred", options, (next, now) => { next.lifecycle.deferredAt = now; next.lifecycle.deferReason = payload.reason || null; }, payload);
  }

  function rejectCheckpoint(state, options = {}) {
    const reasonCode = text(options.reasonCode);
    const comment = limitedText(options.comment, COMMENT_LIMIT);
    if (!REJECTION_REASONS.includes(reasonCode) || (reasonCode === "other" && !comment)) throw checkpointError("rejection_reason_invalid", "Укажите допустимую причину несоответствия.");
    const payload = { reasonCode, comment };
    const duplicate = beginMutation(state, "reject", options, payload); if (duplicate) return copy(state);
    requireStatus(state, ["reviewing"], "rejected");
    return mutateState(state, "rejected", "rejected", options, (next, now) => {
      next.decision = { status: "rejected", reasonCode, comment: comment || null, decidedAt: now, operationId: options.operationId };
      next.completionMetadata = null;
    }, payload);
  }

  function beginConfirmation(state, session, plan, step, options = {}) {
    const payload = { decision: "confirmed" };
    const duplicate = beginMutation(state, "confirm", options, payload); if (duplicate) return copy(state);
    requireStatus(state, ["reviewing"], "sync_pending");
    if (options.confirmed !== true) throw checkpointError("confirmation_required", "Финальное подтверждение требует явного согласия пользователя.");
    const source = validateSourceChain(session, plan, step, options.context || {}, state);
    if (!source.valid) throwForDiagnostic(source.errors[0]);
    const observations = validateObservations(state);
    if (observations.structural.length || observations.semantic.length || !observations.complete || !observations.matchesExpected) {
      throw checkpointError("observations_invalid", "Все обязательные observations должны быть заполнены и соответствовать ожидаемому результату.", { validation: observations });
    }
    return mutateState(state, "sync_pending", "confirmation_requested", options, (next, now) => {
      next.decision = { status: "confirmed_pending", reasonCode: null, comment: null, decidedAt: now, operationId: options.operationId };
      next.synchronization = { ...next.synchronization, status: "pending", operationId: options.operationId, startedAt: now };
      next.completionMetadata = { operationId: options.operationId, requestedAt: now };
    }, payload, "pending");
  }

  function finalizeConfirmation(state, session, step, options = {}) {
    requireCheckpoint(state);
    const operationId = requireOperationId(options.operationId);
    if (state.status === "confirmed" && state.synchronization.operationId === operationId) return copy(state);
    if (state.status !== "sync_pending" || state.synchronization.operationId !== operationId) throw checkpointError("synchronization_not_pending", "Нет ожидающей синхронизации с таким operationId.");
    if (!sessionAcknowledged(session, operationId, state.actionId)) throw checkpointError("session_confirmation_unproven", "Stage 23 ещё не подтвердил checkpoint.");
    if (state.sourceStepId && (!step || step.status !== "completed" || step.completionState?.operationId !== operationId)) throw checkpointError("step_confirmation_unproven", "Stage 24 ещё не синхронизирован с checkpoint.");
    const now = options.now || timestampNow();
    const next = mutable(state); prepareRevision(next, now); transition(next, "confirmed");
    next.decision = { status: "confirmed", reasonCode: null, comment: null, decidedAt: next.decision.decidedAt || now, operationId };
    next.synchronization = {
      ...next.synchronization, status: "confirmed", sessionAcknowledgedAt: now,
      stepAcknowledgedAt: step ? now : null, confirmedAt: now,
      resultingSessionIdentity: sessionResultIdentity(session), resultingStepIdentity: step ? stepResultIdentity(step) : null,
    };
    next.completionMetadata = { ...next.completionMetadata, completedAt: now, resultingSessionRevision: session.revision, resultingStepRevision: step?.revision ?? null };
    appendAudit(next, "confirmed", now, { operationId, actionId: state.actionId, checkpointId: state.checkpointId });
    updateOperation(next, operationId, "confirm", "completed");
    return finish(next);
  }

  function recoverCheckpoint(state, session, plan, step, options = {}) {
    const duplicate = beginMutation(state, "recovery", options, { pendingOperationId: state.synchronization?.operationId ?? null });
    if (duplicate || state.status === "confirmed") return copy(state);
    const structural = validateStructural(state);
    const observationValidation = validateObservations(state);
    if (structural.length || observationValidation.structural.length) return markFailed(state, "corrupted_observations", { ...options, operationType: "recovery" });
    const source = validateSourceChain(session, plan, step, options.context || {}, state, { allowSynchronized: true });
    if (!source.valid) return markStale(state, source.errors[0]?.code || "source_identity_mismatch", { ...options, operationType: "recovery" });
    if (state.status === "sync_pending" && sessionAcknowledged(session, state.synchronization.operationId, state.actionId) && (!state.sourceStepId || step?.completionState?.operationId === state.synchronization.operationId)) {
      return finalizeConfirmation(state, session, step, { operationId: state.synchronization.operationId, now: options.now, recovered: true });
    }
    const now = options.now || timestampNow();
    const next = mutable(state); prepareRevision(next, now);
    appendAudit(next, "recovery_checked", now, { operationId: options.operationId, pendingOperationId: state.synchronization?.operationId ?? null });
    recordOperation(next, options.operationId, "recovery", { pendingOperationId: state.synchronization?.operationId ?? null }, state.status === "sync_pending" ? "sync_pending" : "restored");
    return finish(next);
  }

  function detectStaleness(state, session, plan, step, context = {}) {
    const structural = validateStructural(state);
    if (structural.length) return { stale: true, reasonCode: structural[0].code, errors: structural };
    const source = validateSourceChain(session, plan, step, context, state, { allowSynchronized: true });
    return { stale: !source.valid, reasonCode: source.errors[0]?.code || null, errors: source.errors };
  }

  function rebuildCheckpoint(state, session, plan, step, options = {}) {
    const sourceSelection = selectCheckpointSource(session, options.checkpointId || state.checkpointId);
    const payload = { checkpointId: options.checkpointId || state.checkpointId, confirmed: options.confirmed === true };
    const duplicate = beginMutation(state, "rebuild", options, payload); if (duplicate) return copy(state);
    if (options.confirmed !== true) throw checkpointError("rebuild_confirmation_required", "Rebuild требует явного подтверждения.");
    if (!sourceSelection.valid) throw checkpointError(sourceSelection.reasonCode, errorMessage(sourceSelection.reasonCode), sourceSelection.details || {});
    const source = validateSourceChain(session, plan, step, options.context || {});
    if (!source.valid) throwForDiagnostic(source.errors[0]);
    const identityChain = sourceIdentity(session, plan, step);
    const snapshot = buildImmutableSnapshot(sourceSelection, identityChain);
    const compatible = observationsCompatible(state.immutableSourceSnapshot, snapshot);
    const now = options.now || timestampNow();
    const next = mutable(state); prepareRevision(next, now);
    appendAudit(next, "rebuild_started", now, { operationId: options.operationId, previousStatus: state.status });
    next.sourceSessionId = identityChain.sourceSessionId; next.sourcePlanId = identityChain.sourcePlanId; next.sourceStepId = identityChain.sourceStepId;
    next.componentId = sourceSelection.component?.componentId ?? null; next.phaseId = sourceSelection.phase.phaseId;
    next.actionId = sourceSelection.action.actionId; next.checkpointId = sourceSelection.checkpoint.checkpointId;
    next.identityChain = identityChain; next.immutableSourceSnapshot = snapshot;
    next.observations = compatible ? copy(state.observations) : sourceSelection.observationSpecs.map((spec) => ({ observationId: spec.observationId, type: spec.type, value: null, recordedAt: null }));
    next.status = "ready"; next.lifecycle = { state: "ready", previousState: state.status, readyAt: now, reviewingAt: null, deferredAt: null };
    next.decision = { status: "undecided", reasonCode: null, comment: null, decidedAt: null, operationId: null };
    next.synchronization = { status: "not_started", operationId: null, startedAt: null, sessionAcknowledgedAt: null, stepAcknowledgedAt: null, confirmedAt: null, resultingSessionIdentity: null, resultingStepIdentity: null };
    next.completionMetadata = null; next.blockers = []; next.staleReason = null; next.failure = null;
    appendAudit(next, "rebuilt", now, { operationId: options.operationId, observationsPreserved: compatible, reason: compatible ? "fully_compatible_source" : "incompatible_source_reset" });
    recordOperation(next, options.operationId, "rebuild", payload);
    return finish(next);
  }

  function markStale(state, reasonCode, options = {}) { return terminalMutation(state, "stale", "stale_detected", reasonCode, options); }
  function markFailed(state, reasonCode, options = {}) { return terminalMutation(state, "failed", "failed", reasonCode, options); }
  function markBlocked(state, reasonCode, options = {}) { return terminalMutation(state, "blocked", "blocked", reasonCode, options); }

  function terminalMutation(state, target, event, reasonCode, options) {
    const operationType = options.operationType || target;
    const duplicate = beginMutation(state, operationType, options, { reasonCode }); if (duplicate || state.status === target) return copy(state);
    if (state.status === "confirmed") throwInvalidTransition("confirmed", target);
    requireStatus(state, Object.keys(TRANSITIONS).filter((status) => TRANSITIONS[status].includes(target)), target);
    return mutateState(state, target, event, options, (next) => {
      next.staleReason = target === "stale" ? reasonCode : null;
      next.failure = target === "failed" ? { code: reasonCode, message: errorMessage(reasonCode) } : null;
      next.blockers = [{ code: reasonCode, message: errorMessage(reasonCode), details: {} }];
    }, { reasonCode });
  }

  function validateCheckpoint(state, session = null, plan = null, step = null, context = {}) {
    const structural = validateStructural(state);
    const observations = structural.length ? { structural: [], semantic: [], complete: false, matchesExpected: false } : validateObservations(state);
    const source = session && plan && !structural.length ? validateSourceChain(session, plan, step, context, state, { allowSynchronized: true }) : { valid: !session && !plan, errors: [] };
    const errors = stableDiagnostics([...structural, ...observations.structural, ...observations.semantic, ...source.errors]);
    return { valid: errors.length === 0 && (state?.status !== "confirmed" || observations.complete && observations.matchesExpected), errors, structural, semantic: observations.semantic, source: source.errors, complete: observations.complete, matchesExpected: observations.matchesExpected, stale: state?.status === "stale" || !source.valid };
  }

  function validateStructural(state) {
    const errors = []; const add = (code, details = {}) => errors.push(diagnostic(code, details, "structural"));
    if (!object(state) || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION) add("checkpoint_structure_invalid", { field: "header" });
    if (!text(state?.id) || !text(state?.projectId) || !positiveInteger(state?.revision) || !STATUSES.includes(state?.status)) add("checkpoint_structure_invalid", { field: "identity" });
    if (!text(state?.sourceSessionId) || !text(state?.sourcePlanId) || !text(state?.phaseId) || !text(state?.actionId) || !text(state?.checkpointId)) add("checkpoint_structure_invalid", { field: "sourceReferences" });
    if (!isTimestamp(state?.createdAt) || !isTimestamp(state?.updatedAt)) add("checkpoint_structure_invalid", { field: "timestamps" });
    if (!object(state?.identityChain) || !object(state?.immutableSourceSnapshot) || !validFingerprint(state?.immutableSourceSnapshot?.snapshotFingerprint)) add("checkpoint_structure_invalid", { field: "snapshot" });
    if (object(state?.immutableSourceSnapshot)) { const payload = copy(state.immutableSourceSnapshot); delete payload.snapshotFingerprint; if (fingerprint(payload) !== state.immutableSourceSnapshot.snapshotFingerprint) add("immutable_snapshot_changed"); }
    if (!object(state?.lifecycle) || state.lifecycle.state !== state.status || !object(state?.decision) || !object(state?.synchronization)) add("checkpoint_structure_invalid", { field: "lifecycle" });
    if (!Array.isArray(state?.observations) || !Array.isArray(state?.audit) || !Array.isArray(state?.operations) || state.audit.length > AUDIT_LIMIT || state.operations.length > OPERATION_LIMIT) add("checkpoint_structure_invalid", { field: "logs" });
    for (const event of array(state?.audit)) if (!AUDIT_EVENTS.includes(event.event) || !isTimestamp(event.at) || !positiveInteger(event.revision)) add("checkpoint_structure_invalid", { field: "audit" });
    for (const operation of array(state?.operations)) if (!text(operation.operationId) || !text(operation.type) || !validFingerprint(operation.payloadFingerprint) || !positiveInteger(operation.revision)) add("checkpoint_structure_invalid", { field: "operation" });
    if (!validFingerprint(state?.checkpointFingerprint) || calculateCheckpointFingerprint(state) !== state.checkpointFingerprint) add("checkpoint_structure_invalid", { field: "checkpointFingerprint" });
    return stableDiagnostics(errors);
  }

  function validateObservations(state) {
    const structural = []; const semantic = [];
    const specs = array(state?.immutableSourceSnapshot?.observationSpecs);
    const observations = array(state?.observations);
    const ids = new Set(); let complete = true; let matchesExpected = true;
    if (observations.length !== specs.length) structural.push(diagnostic("observation_structure_invalid", { field: "count" }, "structural"));
    for (const spec of specs) {
      const observation = observations.find((entry) => entry.observationId === spec.observationId);
      if (!observation || ids.has(spec.observationId) || observation.type !== spec.type) { structural.push(diagnostic("observation_structure_invalid", { observationId: spec.observationId }, "structural")); continue; }
      ids.add(spec.observationId);
      if (observation.value === null) { if (spec.required) complete = false; continue; }
      try { normalizeObservation(spec, observation.value); } catch (error) { structural.push(diagnostic(error.code || "observation_structure_invalid", { observationId: spec.observationId }, "structural")); continue; }
      if (!observationMatches(spec, observation.value)) { matchesExpected = false; semantic.push(diagnostic("checkpoint_result_mismatch", { observationId: spec.observationId }, "semantic")); }
    }
    return { structural: stableDiagnostics(structural), semantic: stableDiagnostics(semantic), complete, matchesExpected };
  }

  function normalizeObservation(spec, input) {
    if (!object(input)) throw checkpointError("observation_structure_invalid", "Observation должен быть структурированным значением.");
    const allowed = new Set(["value", ...(spec.unit !== null && spec.unit !== undefined ? ["unit"] : [])]);
    if (Object.keys(input).some((key) => !allowed.has(key))) throw checkpointError("observation_unknown_field", "Observation содержит неизвестное поле.");
    if (spec.unit !== null && spec.unit !== undefined && input.unit !== spec.unit) throw checkpointError("observation_unit_mismatch", "Единица observation не совпадает с доказанным источником.");
    const value = input.value;
    if (["row_count", "stitch_count"].includes(spec.type)) {
      if (!Number.isInteger(value) || value < 0) throw checkpointError("observation_number_invalid", "Количество должно быть целым неотрицательным числом.");
    } else if (["measurement", "size_length"].includes(spec.type)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw checkpointError("observation_number_invalid", "Измерение должно быть конечным неотрицательным числом.");
    } else if (["visual_confirmation", "required_result", "informational"].includes(spec.type)) {
      if (typeof value !== "boolean") throw checkpointError("observation_confirmation_invalid", "Подтверждение должно быть логическим значением.");
    } else if (spec.type === "checkpoint_match") {
      if (!["matched", "not_matched"].includes(value)) throw checkpointError("observation_match_invalid", "Укажите совпадение контрольной точки.");
    } else if (spec.type === "choice") {
      if (!text(value) || !array(spec.options).some((entry) => entry.id === value)) throw checkpointError("observation_choice_invalid", "Выберите один из вариантов источника.");
    } else throw checkpointError("checkpoint_type_unsupported", "Тип observation не поддерживается.");
    return deepFreeze({ value, ...(spec.unit !== null && spec.unit !== undefined ? { unit: spec.unit } : {}) });
  }

  function observationMatches(spec, input) {
    const value = input.value;
    if (["row_count", "stitch_count"].includes(spec.type)) return value === spec.expectedValue;
    if (["measurement", "size_length"].includes(spec.type)) return spec.range ? value >= spec.range.min && value <= spec.range.max : value === spec.expectedValue;
    if (["visual_confirmation", "required_result", "informational"].includes(spec.type)) return value === true;
    if (spec.type === "checkpoint_match") return value === "matched";
    if (spec.type === "choice") return true;
    return false;
  }

  function mutateState(state, target, event, options, apply, payload = {}, result = "applied") {
    const now = options.now || timestampNow(); const next = mutable(state); prepareRevision(next, now); transition(next, target); apply(next, now);
    appendAudit(next, event, now, { operationId: options.operationId }); recordOperation(next, options.operationId, options.operationType || operationTypeForEvent(event), payload, result); return finish(next);
  }
  function beginMutation(state, type, options, payload) {
    requireCheckpoint(state); const operationId = requireOperationId(options.operationId); const payloadFingerprint = fingerprint({ type, payload });
    const existing = array(state.operations).find((entry) => entry.operationId === operationId);
    if (existing) { if (existing.type !== type || existing.payloadFingerprint !== payloadFingerprint) throw checkpointError("operation_id_conflict", "operationId уже использован с другим payload."); return existing; }
    checkRevision(state, options.expectedRevision); return null;
  }
  function prepareRevision(state, now) { state.revision += 1; state.updatedAt = now; state.lifecycle.previousState = state.status; }
  function transition(state, target) { if (state.status !== target && !array(TRANSITIONS[state.status]).includes(target)) throwInvalidTransition(state.status, target); state.lifecycle.previousState = state.status; state.status = target; state.lifecycle.state = target; }
  function requireStatus(state, allowed, target) { if (!allowed.includes(state.status)) throwInvalidTransition(state.status, target); }
  function recordOperation(state, operationId, type, payload, result = "applied") { state.operations = [...array(state.operations), { operationId, type, payloadFingerprint: fingerprint({ type, payload }), result, revision: state.revision, at: state.updatedAt }].slice(-OPERATION_LIMIT); }
  function updateOperation(state, operationId, type, result) { const item = array(state.operations).find((entry) => entry.operationId === operationId && entry.type === type); if (!item) throw checkpointError("operation_log_missing", "Operation log подтверждения отсутствует."); item.result = result; item.revision = state.revision; }
  function appendAudit(state, event, at, details = {}) { state.audit = [...array(state.audit), { event, at, revision: state.revision, ...copy(details) }].slice(-AUDIT_LIMIT); }
  function finish(state) { sealState(state); state.validation = validateCheckpoint(state); sealState(state); return deepFreeze(state); }
  function sealState(state) { state.checkpointFingerprint = null; state.checkpointFingerprint = calculateCheckpointFingerprint(state); }
  function calculateCheckpointFingerprint(state) { const payload = copy(state); delete payload.checkpointFingerprint; if (payload.validation) payload.validation = { valid: payload.validation.valid, complete: payload.validation.complete, matchesExpected: payload.validation.matchesExpected, stale: payload.validation.stale }; return fingerprint(payload); }
  function observationsCompatible(before, after) { return canonicalize({ checkpoint: before?.checkpoint, observationSpecs: before?.observationSpecs, component: before?.component?.componentId ?? null, phase: before?.phase?.phaseId, action: before?.action?.actionId }) === canonicalize({ checkpoint: after?.checkpoint, observationSpecs: after?.observationSpecs, component: after?.component?.componentId ?? null, phase: after?.phase?.phaseId, action: after?.action?.actionId }); }
  function sessionAcknowledged(session, operationId, actionId) { return Boolean(text(operationId) && array(session?.execution?.actions).some((entry) => entry.actionId === actionId && entry.status === "completed") && array(session?.audit).some((entry) => entry.event === "action_completed" && entry.actionId === actionId && entry.operationId === operationId)); }
  function sessionResultIdentity(session) { return { id: session?.id ?? null, revision: integer(session?.revision), fingerprint: session?.sessionFingerprint ?? null }; }
  function stepResultIdentity(step) { return { id: step?.id ?? null, revision: integer(step?.revision), fingerprint: step?.stepFingerprint ?? null }; }
  function normalizeOptions(values) { return array(values).map((entry) => object(entry) ? { id: text(entry.id), label: text(entry.label) || text(entry.id) } : { id: text(entry), label: text(entry) }).filter((entry) => entry.id).filter((entry, index, list) => list.findIndex((candidate) => candidate.id === entry.id) === index); }
  function normalizeRange(value) { if (!object(value)) return null; const min = Number(value.min); const max = Number(value.max); return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max >= min ? { min, max } : null; }
  function numericValue(value) { if (typeof value === "number" && Number.isFinite(value)) return value; if (object(value) && typeof value.value === "number" && Number.isFinite(value.value)) return value.value; return null; }
  function checkpointLabel(source, type) { const labels = { visual_confirmation: "Визуально подтвердить результат", row_count: "Проверить количество рядов", stitch_count: "Проверить количество петель", measurement: "Проверить измерение", size_length: "Проверить размер или длину", checkpoint_match: "Сверить контрольную точку", required_result: "Подтвердить обязательный результат", choice: "Выбрать результат", informational: "Подтвердить ознакомление" }; return labels[type] || text(source.checkpointId); }
  function operationTypeForEvent(event) { return ({ ready: "prepare", review_started: "start", review_resumed: "start", deferred: "defer", rejected: "reject", confirmation_requested: "confirm" })[event] || event; }
  function emptyValidation() { return { valid: true, errors: [], structural: [], semantic: [], source: [], complete: false, matchesExpected: false, stale: false }; }
  function diagnostic(code, details = {}, level = "semantic") { return { code, level, details: copy(details) }; }
  function stableDiagnostics(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize(entry), entry); return [...map.values()].sort((a, b) => lexical(a.code, b.code) || lexical(canonicalize(a.details || {}), canonicalize(b.details || {}))); }
  function stableStrings(values) { return [...new Set(array(values).filter((entry) => typeof entry === "string" && entry.length))].sort(lexical); }
  function limitedText(value, limit) { const result = text(value); if ([...result].length > limit) throw checkpointError("comment_too_long", `Комментарий не должен превышать ${limit} символов.`); return result; }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function positiveInteger(value) { const number = integer(value); return number !== null && number > 0 ? number : null; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function timestampNow() { return new Date().toISOString(); }
  function stableId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || stableId("execution-checkpoint", { at: timestampNow() }); }
  function requireOperationId(value) { const result = text(value); if (!result) throw checkpointError("operation_id_required", "Для mutation требуется operationId."); return result; }
  function checkRevision(state, expectedRevision) { if (!positiveInteger(expectedRevision) || expectedRevision !== state.revision) throw checkpointError("checkpoint_revision_conflict", "Checkpoint изменён в другой операции.", { expectedRevision, actualRevision: state.revision }); }
  function requireCheckpoint(state) { if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || !STATUSES.includes(state.status) || !positiveInteger(state.revision)) throw checkpointError("checkpoint_structure_invalid", "Запись Stage 25 повреждена."); }
  function throwInvalidTransition(from, to) { throw checkpointError("invalid_status_transition", `Переход ${from} → ${to} недопустим.`); }
  function throwForDiagnostic(entry) { throw checkpointError(entry?.code || "source_identity_mismatch", errorMessage(entry?.code), entry?.details || {}); }
  function checkpointError(code, message, details = {}) { return new PatternExecutionCheckpointError(code, message || errorMessage(code), details); }
  function errorMessage(code) { return ({ checkpoint_source_missing: "Для текущего action checkpoint не предусмотрен.", checkpoint_source_mismatch: "Checkpoint не связан с текущим action.", checkpoint_type_unsupported: "Тип checkpoint не поддерживается без явной технологии.", source_session_invalid: "Stage 23 отсутствует или повреждён.", source_plan_invalid: "Stage 22 отсутствует, устарел или повреждён.", source_step_missing: "Связанный Stage 24 отсутствует.", source_step_invalid: "Связанный Stage 24 повреждён или изменился.", source_step_checkpoint_missing: "Stage 24 не содержит этот checkpoint.", source_identity_mismatch: "Полная identity Stage 18–24 не доказуема.", imported_identity_unverifiable: "После импорта identity должна быть доказана явным rebuild.", corrupted_observations: "Сохранённые observations повреждены." })[code] || "Операция checkpoint недоступна."; }
  function getSessionApi() { return globalObject.YarnAIPatternExecutionSession || null; }
  function getPlanApi() { return globalObject.YarnAIPatternExecutionPlan || null; }
  function getStepApi() { return globalObject.YarnAIPatternExecutionStep || null; }

  const api = {
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, AUDIT_LIMIT, OPERATION_LIMIT, COMMENT_LIMIT,
    STATUSES, CHECKPOINT_TYPES, REJECTION_REASONS, TRANSITIONS, AUDIT_EVENTS, SOURCE_TYPE_MAP,
    PatternExecutionCheckpointError, canonicalize, fingerprint, sourceIdentity, selectCheckpointSource,
    validateSourceChain, createCheckpoint, createInitialState: createCheckpoint, buildImmutableSnapshot,
    buildObservationSpecs, prepareCheckpoint, startReview, setObservation, deferCheckpoint, rejectCheckpoint,
    beginConfirmation, finalizeConfirmation, recoverCheckpoint, detectStaleness, rebuildCheckpoint,
    markStale, markFailed, markBlocked, validateCheckpoint, validateStructural, validateObservations,
    calculateCheckpointFingerprint, observationsCompatible, sessionAcknowledged,
  };
  globalObject.YarnAIPatternExecutionCheckpoint = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
