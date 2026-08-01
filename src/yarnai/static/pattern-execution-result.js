"use strict";

(function exposePatternExecutionResult(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const SOURCE_SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_RESULT";
  const STATUSES = Object.freeze(["waiting", "generating", "ready", "blocked", "stale", "failed"]);
  const AUDIT_LIMIT = 32;
  const OPERATION_LIMIT = 96;
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["generating"]),
    generating: Object.freeze(["ready", "blocked", "failed"]),
    ready: Object.freeze(["stale"]),
    blocked: Object.freeze(["generating"]),
    failed: Object.freeze(["generating"]),
    stale: Object.freeze(["generating"]),
  });

  class PatternExecutionResultError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionResultError";
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
      throw resultError("invalid_result_snapshot", "Результат содержит недопустимое числовое значение.");
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

  function createInitialState(projectId, options = {}) {
    if (!text(projectId)) throw resultError("missing_project", "Контекст проекта не задан.");
    const now = options.now || timestampNow();
    const state = {
      id: options.id || makeId(), projectId, kind: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION, revision: 1, resultRevision: 0, status: "waiting",
      createdAt: now, updatedAt: now, sourceCalculationId: options.calculationId || null,
      expectedSourceIdentity: null, expectedSourceIdentityFingerprint: null,
      resultSnapshot: null, resultFingerprint: null,
      blockers: [], warnings: [], staleReasons: [], failure: null, interruptedOperation: null,
      audit: [], operations: [],
    };
    appendAudit(state, "created", now);
    return finish(state);
  }

  function beginGeneration(state, sources, options = {}) {
    requireResult(state);
    const mode = normalizeMode(options.mode, state.status);
    const operationId = requireOperationId(options.operationId);
    const duplicate = array(state.operations).find((entry) => entry.operationId === operationId);
    if (duplicate) {
      if (duplicate.type !== mode) throw resultError("operation_id_conflict", "operationId уже использован другой операцией.");
      return copyFrozen(state);
    }
    checkRevision(state, options.expectedRevision);
    if (!TRANSITIONS[state.status].includes("generating")) throwInvalidTransition(state.status, "generating");
    if (state.status === "stale" && mode !== "rebuild") throw resultError("rebuild_required", "Устаревший результат можно обновить только явным rebuild.");
    if (mode === "generate" && state.status !== "waiting") throw resultError("generate_not_allowed", "Первичная генерация доступна только из waiting.");
    if (mode === "retry" && !["blocked", "failed"].includes(state.status)) throw resultError("retry_not_allowed", "Retry доступен только из blocked или failed.");
    if (mode === "rebuild" && !["blocked", "failed", "stale"].includes(state.status)) throw resultError("rebuild_not_allowed", "Rebuild недоступен в текущем состоянии.");
    const now = options.now || timestampNow();
    const identity = sourceIdentity(normalizeSources(sources, state.projectId));
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "generating";
    next.blockers = [];
    next.warnings = [];
    next.staleReasons = [];
    next.failure = null;
    next.interruptedOperation = {
      operationId, mode, startedAt: now, baseRevision: state.revision,
      sourceIdentityFingerprint: identity.sourceIdentityFingerprint,
    };
    if (mode === "retry") appendAudit(next, "retry_requested", now, { operationId });
    if (mode === "rebuild") appendAudit(next, "rebuild_requested", now, { operationId });
    appendAudit(next, "generation_started", now, { operationId, mode, sourceIdentityFingerprint: identity.sourceIdentityFingerprint });
    recordOperation(next, operationId, mode, "started");
    return finish(next);
  }

  function completeGeneration(state, sources, options = {}) {
    requireResult(state);
    if (state.status !== "generating" || !state.interruptedOperation) throwInvalidTransition(state.status, "ready");
    checkRevision(state, options.expectedRevision);
    const operationId = options.operationId || state.interruptedOperation.operationId;
    if (operationId !== state.interruptedOperation.operationId) throw resultError("operation_id_conflict", "Завершается другая generation operation.");
    const now = options.now || timestampNow();
    const normalized = normalizeSources(sources, state.projectId);
    const identity = sourceIdentity(normalized);
    if (identity.sourceIdentityFingerprint !== state.interruptedOperation.sourceIdentityFingerprint) {
      return failedFromGenerating(state, "source_identity_changed_during_generation", "Source identity изменилась во время генерации.", options);
    }
    const verified = verifySources(normalized);
    const next = mutable(state);
    prepareRevision(next, now);
    next.expectedSourceIdentity = copy(identity);
    next.expectedSourceIdentityFingerprint = identity.sourceIdentityFingerprint;
    next.sourceCalculationId = normalized.calculationId || next.sourceCalculationId;
    next.blockers = copy(verified.blockers);
    next.warnings = copy(verified.warnings);
    next.staleReasons = [];
    next.failure = null;
    next.interruptedOperation = null;
    next.status = verified.blockers.length ? "blocked" : "ready";
    if (next.status === "ready") {
      const resultRevision = state.resultRevision + 1;
      next.resultSnapshot = buildResultSnapshot(normalized, verified, resultRevision, now);
      next.resultFingerprint = next.resultSnapshot.fingerprint;
      next.resultRevision = resultRevision;
    }
    appendAudit(next, `generation_${next.status}`, now, { operationId, blockerCodes: next.blockers.map((entry) => entry.code) });
    updateOperation(next, operationId, state.interruptedOperation.mode, next.status);
    return finish(next);
  }

  function generateResult(state, sources, options = {}) {
    requireResult(state);
    const mode = normalizeMode(options.mode, state.status);
    const operationId = requireOperationId(options.operationId);
    const duplicate = array(state.operations).find((entry) => entry.operationId === operationId);
    if (duplicate) return copyFrozen(state);
    const normalized = normalizeSources(sources, state.projectId);
    if (mode === "retry") {
      const identity = sourceIdentity(normalized);
      if (!state.expectedSourceIdentityFingerprint || state.expectedSourceIdentityFingerprint !== identity.sourceIdentityFingerprint) {
        return markStaleForRetry(state, identity, { ...options, operationId });
      }
    }
    const started = beginGeneration(state, normalized, { ...options, mode, operationId });
    try {
      return completeGeneration(started, normalized, { ...options, expectedRevision: started.revision, operationId });
    } catch (error) {
      return failedFromGenerating(started, error?.code || "generation_failed", stableErrorMessage(error), { ...options, expectedRevision: started.revision, operationId });
    }
  }

  function retryResult(state, sources, options = {}) { return generateResult(state, sources, { ...options, mode: "retry" }); }
  function rebuildResult(state, sources, options = {}) { return generateResult(state, sources, { ...options, mode: "rebuild" }); }

  function recoverInterruptedGeneration(state, options = {}) {
    requireResult(state);
    if (state.status !== "generating") return copyFrozen(state);
    checkRevision(state, options.expectedRevision);
    const now = options.now || timestampNow();
    const operation = state.interruptedOperation;
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "failed";
    next.failure = { code: "interrupted_generation", message: "Прерванная генерация безопасно остановлена. Доступен явный retry." };
    next.blockers = [blocker("interrupted_generation", next.failure.message)];
    next.staleReasons = [];
    next.interruptedOperation = null;
    appendAudit(next, "interrupted_recovery", now, { operationId: operation?.operationId || null });
    if (operation?.operationId) updateOperation(next, operation.operationId, operation.mode, "interrupted");
    return finish(next);
  }

  function failedFromGenerating(state, code, message, options = {}) {
    requireResult(state);
    if (state.status !== "generating") throwInvalidTransition(state.status, "failed");
    checkRevision(state, options.expectedRevision);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "failed";
    next.failure = { code: text(code) || "generation_failed", message: text(message) || "Генерация завершилась контролируемой ошибкой." };
    next.blockers = [blocker(next.failure.code, next.failure.message)];
    next.staleReasons = [];
    next.interruptedOperation = null;
    appendAudit(next, "generation_failed", now, { operationId: state.interruptedOperation?.operationId || null, code: next.failure.code });
    if (state.interruptedOperation?.operationId) updateOperation(next, state.interruptedOperation.operationId, state.interruptedOperation.mode, "failed");
    return finish(next);
  }

  function detectStaleness(state, sources) {
    requireResult(state);
    if (!state.expectedSourceIdentity || ["waiting", "generating"].includes(state.status)) return { stale: false, reasons: [] };
    let actual;
    try { actual = sourceIdentity(normalizeSources(sources)); }
    catch { return { stale: true, reasons: [staleReason("corrupted_source_identity")] }; }
    const expected = state.expectedSourceIdentity;
    const reasons = [];
    const compare = (path, code) => {
      const before = valueAt(expected, path); const after = valueAt(actual, path);
      if (canonicalize(before ?? null) !== canonicalize(after ?? null)) reasons.push(staleReason(code, { expected: before ?? null, actual: after ?? null }));
    };
    compare("projectId", "project_identity_changed");
    compare("calculation", "calculation_identity_changed");
    compare("plan", "plan_identity_changed");
    compare("session", "session_identity_changed");
    compare("steps", "step_identity_changed");
    compare("checkpoints", "checkpoint_identity_changed");
    compare("progress", "progress_identity_changed");
    compare("completion", "completion_identity_changed");
    if (state.sourceSchemaVersion !== SOURCE_SCHEMA_VERSION) reasons.push(staleReason("source_schema_version_changed"));
    return { stale: reasons.length > 0, reasons: stableReasons(reasons) };
  }

  function markStale(state, reasons, options = {}) {
    requireResult(state);
    if (state.status === "stale") return copyFrozen(state);
    checkRevision(state, options.expectedRevision);
    if (state.status !== "ready") throwInvalidTransition(state.status, "stale");
    const normalized = stableReasons(reasons);
    if (!normalized.length) return copyFrozen(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "stale";
    next.staleReasons = normalized;
    next.blockers = normalized.map((entry) => blocker(entry.code, entry.message, entry.details));
    next.failure = null;
    next.interruptedOperation = null;
    appendAudit(next, "stale_detected", now, { reasonCodes: normalized.map((entry) => entry.code) });
    return finish(next);
  }

  function markStaleForRetry(state, identity, options = {}) {
    requireResult(state);
    checkRevision(state, options.expectedRevision);
    if (!["blocked", "failed"].includes(state.status)) throw resultError("retry_not_allowed", "Retry доступен только из blocked или failed.");
    const now = options.now || timestampNow();
    const reasons = [staleReason("retry_source_identity_changed", { expected: state.expectedSourceIdentityFingerprint, actual: identity.sourceIdentityFingerprint })];
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "stale";
    next.staleReasons = reasons;
    next.blockers = reasons.map((entry) => blocker(entry.code, entry.message, entry.details));
    next.failure = null;
    next.interruptedOperation = null;
    appendAudit(next, "retry_requested", now, { operationId: options.operationId });
    appendAudit(next, "stale_detected", now, { reasonCodes: reasons.map((entry) => entry.code) });
    recordOperation(next, options.operationId, "retry", "stale");
    return finish(next);
  }

  function normalizeSources(input, projectId = input?.project?.project_id || input?.project?.projectId) {
    const aggregate = Array.isArray(input?.progress) ? input : null;
    const project = aggregate?.project || input?.project || null;
    const calculation = aggregate ? array(aggregate.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null : input?.calculation || null;
    const calculationId = calculation?.calculation_id || input?.calculationId || null;
    const records = aggregate ? array(aggregate.progress).filter((entry) => entry.calculation_id === calculationId) : array(input?.records);
    const ofKind = (kind) => records.filter((entry) => entry.kind === kind);
    const planRecord = input?.planRecord || newestRecord(ofKind("PATTERN_EXECUTION_PLAN"));
    const sessionRecord = input?.sessionRecord || newestRecord(ofKind("PATTERN_EXECUTION_SESSION"));
    const progressRecord = input?.progressRecord || newestRecord(ofKind("PATTERN_EXECUTION_PROGRESS"));
    const completionRecord = input?.completionRecord || newestRecord(ofKind("PATTERN_EXECUTION_COMPLETION"));
    const plan = Object.hasOwn(input || {}, "plan") ? input.plan : planRecord?.state || null;
    const session = Object.hasOwn(input || {}, "session") ? input.session : sessionRecord?.state || null;
    const executionProgress = Object.hasOwn(input || {}, "executionProgress") ? input.executionProgress : Object.hasOwn(input || {}, "progressState") ? input.progressState : Object.hasOwn(input || {}, "progress") && !aggregate ? input.progress : progressRecord?.state || null;
    const completion = Object.hasOwn(input || {}, "completion") ? input.completion : completionRecord?.state || null;
    const sessionId = session?.id || completion?.completionSnapshot?.sessionIdentity?.id || null;
    const steps = input?.stepRecords || ofKind("PATTERN_EXECUTION_STEP");
    const checkpoints = input?.checkpointRecords || ofKind("PATTERN_EXECUTION_CHECKPOINT");
    return {
      project, projectId: projectId || project?.project_id || project?.projectId || plan?.projectId || session?.projectId || completion?.projectId || null,
      calculation, calculationId, planRecord, plan, sessionRecord, session,
      sessionEpoch: integer(input?.sessionEpoch ?? sessionRecord?.epoch ?? completion?.completionSnapshot?.sessionEpoch),
      stepRecords: stableRecords(aggregate ? steps.filter((entry) => !sessionId || entry.state?.sourceSessionId === sessionId) : steps),
      checkpointRecords: stableRecords(aggregate ? checkpoints.filter((entry) => !sessionId || entry.state?.sourceSessionId === sessionId) : checkpoints),
      progressRecord, progress: executionProgress, completionRecord, completion,
    };
  }

  function sourceIdentity(sources) {
    const plan = sources.plan; const session = sources.session; const progress = sources.progress; const completion = sources.completion;
    const steps = stableRecords(sources.stepRecords).map((entry) => ({
      progressId: entry.progress_id || null, id: entry.state?.id || null, revision: integer(entry.state?.revision),
      fingerprint: entry.state?.stepFingerprint || null, actionId: entry.state?.actionId || null,
      sessionId: entry.state?.sourceSessionId || null, planId: entry.state?.sourcePlanId || null,
    })).sort(compareIdentity);
    const checkpoints = stableRecords(sources.checkpointRecords).map((entry) => ({
      progressId: entry.progress_id || null, id: entry.state?.id || null, revision: integer(entry.state?.revision),
      fingerprint: entry.state?.checkpointFingerprint || null, checkpointId: entry.state?.checkpointId || null,
      actionId: entry.state?.actionId || null, stepId: entry.state?.sourceStepId || null,
      sessionId: entry.state?.sourceSessionId || null, sessionEpoch: checkpointSessionEpoch(entry.state),
    })).sort(compareIdentity);
    const base = {
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION, projectId: sources.projectId || null,
      calculation: { id: sources.calculationId || null, revision: integer(sources.calculation?.revision), fingerprint: sources.calculation?.fingerprint || sources.calculation?.input_fingerprint || null },
      plan: { id: plan?.id || null, revision: integer(plan?.revision), fingerprint: plan?.planFingerprint || null },
      session: { id: session?.id || null, revision: integer(session?.revision), epoch: integer(sources.sessionEpoch), fingerprint: session?.sessionFingerprint || null },
      steps, checkpoints,
      progress: { id: progress?.id || null, revision: integer(progress?.revision), fingerprint: progress?.progressFingerprint || null },
      completion: {
        id: completion?.id || null, revision: integer(completion?.revision), fingerprint: completion?.completionFingerprint || null,
        sourceIdentityFingerprint: completion?.expectedSourceIdentityFingerprint || null, status: completion?.status || null,
        blockersFingerprint: fingerprint(array(completion?.blockers).map((entry) => ({ code: entry?.code || null, details: entry?.details || {} })).sort((left, right) => lexical(text(left.code), text(right.code)))),
        nextActionFingerprint: fingerprint(completion?.nextAction ?? completion?.completionSnapshot?.nextAction ?? null),
        snapshotPresent: Boolean(completion?.completionSnapshot && Object.keys(completion.completionSnapshot).length),
      },
    };
    return { ...base, sourceIdentityFingerprint: fingerprint(base) };
  }

  function verifySources(sources) {
    const blockers = [];
    const add = (code, details = {}) => blockers.push(blocker(code, blockerMessage(code), details));
    const { plan, session, progress, completion } = sources;
    if (!sources.project || !sources.projectId || !sources.calculationId) add("missing_project");
    if (!plan) add("missing_execution_plan");
    if (!session) add("missing_execution_session");
    if (!progress) add("missing_execution_progress");
    if (!completion) add("missing_execution_completion");
    const snapshot = completion?.completionSnapshot || null;
    if (completion && completion.status !== "ready") add("completion_not_ready", { status: completion.status || null });
    if (completion && array(completion.blockers).length) add("completion_has_blockers", { blockerCodes: stableStrings(completion.blockers.map((entry) => entry.code)) });
    if (completion && (completion.nextAction || snapshot?.nextAction)) add("completion_has_next_action");
    if (completion && (!snapshot || !Object.keys(snapshot).length)) add("empty_completion_snapshot");

    const phases = stablePhases(plan?.plan?.phases);
    const planActions = phases.flatMap((phase) => stableActions(phase.actions).map((action) => ({ ...copy(action), phaseId: phase.id, phaseTitle: phase.title, phaseOrder: phase.order })));
    const planActionIds = new Set();
    for (const action of planActions) {
      if (!text(action.id) || planActionIds.has(action.id)) add("duplicate_action_reference", { actionId: action.id || null });
      planActionIds.add(action.id);
    }
    const planCheckpoints = stableCheckpoints(plan?.plan?.checkpoints);
    const planCheckpointIds = new Set();
    for (const checkpoint of planCheckpoints) {
      if (!text(checkpoint.id) || planCheckpointIds.has(checkpoint.id)) add("duplicate_checkpoint_reference", { checkpointId: checkpoint.id || null });
      planCheckpointIds.add(checkpoint.id);
      if (checkpoint.actionId && !planActionIds.has(checkpoint.actionId)) add("unknown_action_reference", { actionId: checkpoint.actionId, checkpointId: checkpoint.id });
    }

    const completionSteps = array(snapshot?.stepSummaries).slice().sort(compareStepSummary);
    const completionCheckpoints = array(snapshot?.checkpointSummaries).slice().sort(compareCheckpointSummary);
    if (snapshot && completionSteps.length && !sources.stepRecords.length) add("missing_execution_step");
    if (snapshot && completionCheckpoints.length && !sources.checkpointRecords.length) add("missing_execution_checkpoint");

    const stepIds = new Set(); const stepActions = new Set();
    for (const record of sources.stepRecords) {
      const step = record.state || {};
      if (!text(step.id) || stepIds.has(step.id) || stepActions.has(step.actionId)) add("duplicate_step_reference", { stepId: step.id || null, actionId: step.actionId || null });
      stepIds.add(step.id); stepActions.add(step.actionId);
      if (!planActionIds.has(step.actionId)) add("unknown_action_reference", { stepId: step.id || null, actionId: step.actionId || null });
      if (!completionSteps.some((entry) => entry.stepId === step.id && entry.actionId === step.actionId)) add("unknown_step_reference", { stepId: step.id || null });
    }
    const summaryStepIds = new Set();
    for (const summary of completionSteps) {
      if (!text(summary.stepId) || summaryStepIds.has(summary.stepId)) add("duplicate_step_reference", { stepId: summary.stepId || null });
      summaryStepIds.add(summary.stepId);
      if (!planActionIds.has(summary.actionId)) add("unknown_action_reference", { actionId: summary.actionId || null, stepId: summary.stepId || null });
      if (!stepIds.has(summary.stepId)) add("unknown_step_reference", { stepId: summary.stepId || null });
    }

    const checkpointRecordIds = new Set(); const checkpointKeys = new Set();
    for (const record of sources.checkpointRecords) {
      const checkpoint = record.state || {};
      const key = `${checkpoint.actionId || ""}|${checkpoint.checkpointId || ""}`;
      if (!text(checkpoint.id) || checkpointRecordIds.has(checkpoint.id) || checkpointKeys.has(key)) add("duplicate_checkpoint_reference", { checkpointId: checkpoint.checkpointId || null, recordId: checkpoint.id || null });
      checkpointRecordIds.add(checkpoint.id); checkpointKeys.add(key);
      if (!planCheckpointIds.has(checkpoint.checkpointId)) add("unknown_checkpoint_reference", { checkpointId: checkpoint.checkpointId || null });
      if (!planActionIds.has(checkpoint.actionId)) add("unknown_action_reference", { checkpointId: checkpoint.checkpointId || null, actionId: checkpoint.actionId || null });
      if (!stepIds.has(checkpoint.sourceStepId)) add("unknown_step_reference", { stepId: checkpoint.sourceStepId || null, checkpointId: checkpoint.checkpointId || null });
      if (!completionCheckpoints.some((entry) => entry.checkpointRecordId === checkpoint.id && entry.checkpointId === checkpoint.checkpointId)) add("unknown_checkpoint_reference", { checkpointId: checkpoint.checkpointId || null, recordId: checkpoint.id || null });
    }
    const summaryCheckpointIds = new Set();
    for (const summary of completionCheckpoints) {
      const key = `${summary.actionId || ""}|${summary.checkpointId || ""}`;
      if (!text(summary.checkpointRecordId) || summaryCheckpointIds.has(key)) add("duplicate_checkpoint_reference", { checkpointId: summary.checkpointId || null });
      summaryCheckpointIds.add(key);
      if (!planCheckpointIds.has(summary.checkpointId)) add("unknown_checkpoint_reference", { checkpointId: summary.checkpointId || null });
      if (!checkpointRecordIds.has(summary.checkpointRecordId)) add("unknown_checkpoint_reference", { checkpointId: summary.checkpointId || null, recordId: summary.checkpointRecordId || null });
    }

    validateIdentity(sources, blockers);
    const stable = stableBlockers(blockers);
    if (stable.length) {
      return {
        blockers: stable, warnings: transferableWarnings(snapshot?.warnings), planSummary: null, executionSummary: null,
        completedSteps: [], completedActions: [], confirmedCheckpoints: [], plannedParameters: [], actualParameters: [], deviations: [], notes: [],
      };
    }
    const content = deriveResultContent(sources, phases, planActions, planCheckpoints);
    return { blockers: stable, warnings: content.warnings, ...content };
  }

  function validateIdentity(sources, blockers) {
    const add = (code, details = {}) => blockers.push(blocker(code, blockerMessage(code), details));
    const { plan, session, progress, completion } = sources; const snapshot = completion?.completionSnapshot;
    const projectIds = [plan?.projectId, session?.projectId, progress?.projectId, completion?.projectId, snapshot?.projectIdentity?.projectId,
      ...sources.stepRecords.map((entry) => entry.state?.projectId), ...sources.checkpointRecords.map((entry) => entry.state?.projectId)].filter(Boolean);
    if (projectIds.some((id) => id !== sources.projectId)) add("project_identity_mismatch");
    const sessionIds = [progress?.sourceSessionId, snapshot?.sessionIdentity?.id, completion?.expectedSourceIdentity?.session?.id,
      ...sources.stepRecords.map((entry) => entry.state?.sourceSessionId), ...sources.checkpointRecords.map((entry) => entry.state?.sourceSessionId)].filter(Boolean);
    if (session && sessionIds.some((id) => id !== session.id)) add("session_identity_mismatch");
    const epochs = [progress?.sourceSessionEpoch, snapshot?.sessionEpoch, completion?.expectedSourceIdentity?.session?.epoch,
      ...sources.checkpointRecords.map((entry) => checkpointSessionEpoch(entry.state))].filter((value) => value !== null && value !== undefined);
    if (epochs.some((epoch) => integer(epoch) !== sources.sessionEpoch)) add("stale_session_epoch", { expected: sources.sessionEpoch, actual: stableNumbers(epochs) });
    if (snapshot && (!snapshot.sourceRevisions || !snapshot.sourceFingerprints || !completion.expectedSourceIdentity)) add("corrupted_source_identity");

    const revision = (actual, expected, stage, id = null) => { if (actual !== null && expected !== null && actual !== expected) add("source_revision_mismatch", { stage, id, expected, actual }); };
    const seal = (actual, expected, stage, id = null) => { if (actual && expected && actual !== expected) add("source_fingerprint_mismatch", { stage, id, expected, actual }); };
    revision(integer(plan?.revision), integer(snapshot?.planIdentity?.revision ?? snapshot?.sourceRevisions?.plan), "plan", plan?.id || null);
    seal(plan?.planFingerprint, snapshot?.planIdentity?.fingerprint ?? snapshot?.sourceFingerprints?.plan, "plan", plan?.id || null);
    revision(integer(session?.revision), integer(snapshot?.sessionIdentity?.revision ?? snapshot?.sourceRevisions?.session), "session", session?.id || null);
    seal(session?.sessionFingerprint, snapshot?.sessionIdentity?.fingerprint ?? snapshot?.sourceFingerprints?.session, "session", session?.id || null);
    revision(integer(progress?.revision), integer(snapshot?.progressIdentity?.revision ?? snapshot?.sourceRevisions?.progress), "progress", progress?.id || null);
    seal(progress?.progressFingerprint, snapshot?.progressIdentity?.fingerprint ?? snapshot?.sourceFingerprints?.progress, "progress", progress?.id || null);
    const stepRevisions = new Map(array(snapshot?.sourceRevisions?.steps).map((entry) => [entry.id, integer(entry.revision)]));
    const stepFingerprints = new Map(array(snapshot?.sourceFingerprints?.steps).map((entry) => [entry.id, entry.fingerprint]));
    for (const record of sources.stepRecords) { const step = record.state || {}; revision(integer(step.revision), stepRevisions.get(step.id) ?? null, "step", step.id || null); seal(step.stepFingerprint, stepFingerprints.get(step.id) || null, "step", step.id || null); }
    const checkpointRevisions = new Map(array(snapshot?.sourceRevisions?.checkpoints).map((entry) => [entry.id, integer(entry.revision)]));
    const checkpointFingerprints = new Map(array(snapshot?.sourceFingerprints?.checkpoints).map((entry) => [entry.id, entry.fingerprint]));
    for (const record of sources.checkpointRecords) { const checkpoint = record.state || {}; revision(integer(checkpoint.revision), checkpointRevisions.get(checkpoint.id) ?? null, "checkpoint", checkpoint.id || null); seal(checkpoint.checkpointFingerprint, checkpointFingerprints.get(checkpoint.id) || null, "checkpoint", checkpoint.id || null); }

    const planApi = globalObject.YarnAIPatternExecutionPlan; const sessionApi = globalObject.YarnAIPatternExecutionSession;
    const stepApi = globalObject.YarnAIPatternExecutionStep; const checkpointApi = globalObject.YarnAIPatternExecutionCheckpoint;
    const progressApi = globalObject.YarnAIPatternExecutionProgress; const completionApi = globalObject.YarnAIPatternExecutionCompletion;
    if (plan && (!validFingerprint(plan.planFingerprint) || planApi?.calculatePlanFingerprint && planApi.calculatePlanFingerprint(plan) !== plan.planFingerprint)) add("source_fingerprint_mismatch", { stage: "plan", id: plan.id || null });
    if (session && (!validFingerprint(session.sessionFingerprint) || sessionApi?.calculateSessionFingerprint && sessionApi.calculateSessionFingerprint(session) !== session.sessionFingerprint)) add("source_fingerprint_mismatch", { stage: "session", id: session.id || null });
    for (const record of sources.stepRecords) { const state = record.state; if (!validFingerprint(state?.stepFingerprint) || stepApi?.calculateStepFingerprint && stepApi.calculateStepFingerprint(state) !== state.stepFingerprint) add("source_fingerprint_mismatch", { stage: "step", id: state?.id || null }); }
    for (const record of sources.checkpointRecords) { const state = record.state; if (!validFingerprint(state?.checkpointFingerprint) || checkpointApi?.calculateCheckpointFingerprint && checkpointApi.calculateCheckpointFingerprint(state) !== state.checkpointFingerprint) add("source_fingerprint_mismatch", { stage: "checkpoint", id: state?.id || null }); }
    if (progress && (!validFingerprint(progress.progressFingerprint) || progressApi?.calculateProgressFingerprint && progressApi.calculateProgressFingerprint(progress) !== progress.progressFingerprint)) add("source_fingerprint_mismatch", { stage: "progress", id: progress.id || null });
    if (completion && (!validFingerprint(completion.completionFingerprint) || completionApi?.calculateCompletionFingerprint && snapshot && completionApi.calculateCompletionFingerprint(snapshot) !== completion.completionFingerprint)) add("source_fingerprint_mismatch", { stage: "completion", id: completion.id || null });
    if (snapshot?.completionFingerprint && snapshot.completionFingerprint !== completion?.completionFingerprint) add("source_fingerprint_mismatch", { stage: "completion", field: "snapshot" });
    if (snapshot?.sourceFingerprints?.sourceIdentity && completion?.expectedSourceIdentityFingerprint && snapshot.sourceFingerprints.sourceIdentity !== completion.expectedSourceIdentityFingerprint) add("corrupted_source_identity");
  }

  function deriveResultContent(sources, phases, planActions, planCheckpoints) {
    const completionSnapshot = sources.completion.completionSnapshot;
    const completedSteps = array(completionSnapshot.stepSummaries).filter((entry) => entry.stepStatus === "completed").map((entry) => {
      const step = sources.stepRecords.find((record) => record.state?.id === entry.stepId)?.state;
      return { stepId: entry.stepId, actionId: entry.actionId, phaseId: entry.phaseId, title: entry.title || step?.immutableSnapshot?.action?.title || entry.actionId, status: "completed", revision: integer(step?.revision), fingerprint: step?.stepFingerprint || null };
    }).sort(compareStepSummary);
    const completedActions = array(sources.session?.execution?.actions).filter((entry) => entry.status === "completed").map((entry) => ({
      actionId: entry.actionId, phaseId: entry.phaseId, order: integer(entry.order), title: entry.title || planActions.find((action) => action.id === entry.actionId)?.title || entry.actionId, status: "completed",
    })).sort(compareActionSummary);
    const confirmedCheckpoints = array(completionSnapshot.checkpointSummaries).filter((entry) => entry.status === "confirmed").map((entry) => {
      const checkpoint = sources.checkpointRecords.find((record) => record.state?.id === entry.checkpointRecordId)?.state;
      return { checkpointId: entry.checkpointId, checkpointRecordId: entry.checkpointRecordId, actionId: entry.actionId, phaseId: entry.phaseId, label: checkpoint?.immutableSourceSnapshot?.checkpoint?.label || entry.checkpointId, status: "confirmed", observations: stableObservations(checkpoint?.observations), revision: integer(checkpoint?.revision), fingerprint: checkpoint?.checkpointFingerprint || null };
    }).sort(compareCheckpointSummary);
    const parameterContent = deriveParameters(sources, planActions, planCheckpoints);
    const warnings = transferableWarnings(completionSnapshot.warnings);
    const notes = deriveNotes(sources);
    return {
      planSummary: {
        planId: sources.plan.id, title: sources.project?.title || sources.plan?.plan?.summary?.title || "Завершённый проект",
        summary: copy(sources.plan?.plan?.summary || {}), phases: phases.map((phase) => ({ phaseId: phase.id, order: phase.order, title: phase.title || phase.id, actions: array(phase.actions).length })),
      },
      executionSummary: { executionStatus: completionSnapshot.executionStatus, counts: copy(completionSnapshot.counts || {}), completedAt: sources.completion.updatedAt, completionRevision: sources.completion.revision },
      completedSteps, completedActions, confirmedCheckpoints, ...parameterContent, warnings, notes,
    };
  }

  function deriveParameters(sources, planActions, planCheckpoints) {
    const planned = [];
    const pushPlanned = (entry) => { if (entry && !planned.some((item) => item.key === entry.key)) planned.push(entry); };
    for (const [group, entries] of [["measurement", sources.plan?.plan?.measurements], ["gauge", sources.plan?.plan?.gauge]]) {
      array(entries).forEach((entry, index) => {
        const value = parameterValue(entry.value ?? entry.expectedValue ?? entry.target);
        const base = { key: `plan:${group}:${text(entry.id) || fingerprint({ group, index, entry }).slice(8)}`, label: text(entry.label || entry.name || entry.type || entry.property) || (group === "gauge" ? "Плотность" : "Параметр изделия"), unit: entry.unit ?? entry.value?.unit ?? null, sourceStage: "PATTERN_EXECUTION_PLAN", sourceReference: { planId: sources.plan.id, recordId: entry.id || null }, verificationStatus: "planned" };
        if (value !== undefined) base.plannedValue = value;
        pushPlanned(base);
      });
    }
    for (const action of planActions) {
      const type = actionParameterType(action);
      if (!type) continue;
      const value = plannedActionValue(action, type);
      if (value === undefined) continue;
      pushPlanned({ key: `action:${action.id}:${type}`, label: action.title || action.id, unit: actionUnit(action, type), plannedValue: value, sourceStage: "PATTERN_EXECUTION_PLAN", sourceReference: { planId: sources.plan.id, phaseId: action.phaseId, actionId: action.id }, verificationStatus: "planned" });
    }
    for (const checkpoint of planCheckpoints) {
      const type = checkpoint.type || checkpoint.sourceType || "checkpoint";
      const value = parameterValue(checkpoint.expectedValue);
      if (value === undefined) continue;
      pushPlanned({ key: `checkpoint:${checkpoint.id}:${type}`, label: checkpoint.label || checkpoint.id, unit: checkpoint.unit ?? checkpoint.expectedValue?.unit ?? null, plannedValue: value, sourceStage: "PATTERN_EXECUTION_PLAN", sourceReference: { planId: sources.plan.id, checkpointId: checkpoint.id, actionId: checkpoint.actionId || null }, verificationStatus: "planned" });
    }

    const actual = [];
    for (const record of sources.stepRecords) {
      const step = record.state; if (step?.status !== "completed") continue;
      const progress = step.completionState?.finalProgressValues || step.progressState || {};
      const type = progress.type;
      let value;
      if (type === "measurement" && progress.userConfirmed === true && progress.normalizedValue !== null && progress.normalizedValue !== undefined) value = progress.normalizedValue;
      if (["counter", "rows", "stitches"].includes(type) && Number.isFinite(progress.current)) value = progress.current;
      if (value === undefined) continue;
      const key = `action:${step.actionId}:${type}`;
      const plannedEntry = planned.find((entry) => entry.key === key);
      actual.push({ key, label: plannedEntry?.label || step.immutableSnapshot?.action?.title || step.actionId, unit: progress.unit ?? plannedEntry?.unit ?? null, ...(plannedEntry && Object.hasOwn(plannedEntry, "plannedValue") ? { plannedValue: copy(plannedEntry.plannedValue) } : {}), actualValue: value, sourceStage: "PATTERN_EXECUTION_STEP", sourceReference: { stepId: step.id, actionId: step.actionId, revision: step.revision, fingerprint: step.stepFingerprint }, verificationStatus: "confirmed" });
    }
    for (const record of sources.checkpointRecords) {
      const checkpoint = record.state; if (checkpoint?.status !== "confirmed") continue;
      for (const observation of array(checkpoint.observations)) {
        if (observation.value === null || observation.value === undefined) continue;
        const spec = array(checkpoint.immutableSourceSnapshot?.observationSpecs).find((entry) => entry.observationId === observation.observationId) || {};
        const type = spec.type || observation.type || "checkpoint";
        const key = `checkpoint:${checkpoint.checkpointId}:${type}`;
        const plannedEntry = planned.find((entry) => entry.key === key);
        const value = parameterValue(observation.value);
        if (value === undefined) continue;
        actual.push({ key, label: plannedEntry?.label || checkpoint.immutableSourceSnapshot?.checkpoint?.label || checkpoint.checkpointId, unit: observation.value?.unit ?? spec.unit ?? plannedEntry?.unit ?? null, ...(plannedEntry && Object.hasOwn(plannedEntry, "plannedValue") ? { plannedValue: copy(plannedEntry.plannedValue) } : {}), actualValue: value, sourceStage: "PATTERN_EXECUTION_CHECKPOINT", sourceReference: { checkpointRecordId: checkpoint.id, checkpointId: checkpoint.checkpointId, observationId: observation.observationId, revision: checkpoint.revision, fingerprint: checkpoint.checkpointFingerprint }, verificationStatus: "confirmed" });
      }
    }
    const stableActual = uniqueByKey(actual).sort(compareParameter);
    const actualByKey = new Map(stableActual.map((entry) => [entry.key, entry]));
    const stablePlanned = uniqueByKey(planned).map((entry) => {
      const match = actualByKey.get(entry.key);
      return match ? { ...entry, actualValue: copy(match.actualValue), verificationStatus: "confirmed" } : entry;
    }).sort(compareParameter);
    return { plannedParameters: stablePlanned, actualParameters: stableActual, deviations: deriveDeviations(stablePlanned, stableActual) };
  }

  function deriveDeviations(planned, actual) {
    const actualByKey = new Map(actual.map((entry) => [entry.key, entry]));
    const deviations = [];
    for (const expected of planned) {
      const observed = actualByKey.get(expected.key);
      if (!observed || !Object.hasOwn(expected, "plannedValue") || !Object.hasOwn(observed, "actualValue") || !comparable(expected.plannedValue, observed.actualValue) || canonicalize(expected.plannedValue) === canonicalize(observed.actualValue)) continue;
      const deviation = { code: "parameter_value_changed", parameterKey: expected.key, plannedValue: copy(expected.plannedValue), actualValue: copy(observed.actualValue), unit: observed.unit ?? expected.unit ?? null, severity: "informational", sourceReferences: [copy(expected.sourceReference), copy(observed.sourceReference)] };
      if (typeof expected.plannedValue === "number" && typeof observed.actualValue === "number") {
        deviation.absoluteDifference = normalizedNumber(observed.actualValue - expected.plannedValue);
        if (expected.plannedValue !== 0) deviation.relativeDifference = normalizedNumber((observed.actualValue - expected.plannedValue) / Math.abs(expected.plannedValue));
      }
      deviations.push(deviation);
    }
    return deviations.sort((left, right) => lexical(left.parameterKey, right.parameterKey));
  }

  function buildResultSnapshot(sources, content, resultRevision, generatedAt = timestampNow()) {
    if (content.blockers.length) throw resultError("invalid_result_snapshot", "Нельзя создать итоговый snapshot при наличии blockers.");
    const identity = sourceIdentity(sources);
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      resultId: stableId("execution-result", { projectId: sources.projectId, sessionId: identity.session.id, sourceIdentity: identity.sourceIdentityFingerprint }),
      projectId: sources.projectId, sessionId: identity.session.id, sessionEpoch: identity.session.epoch,
      resultRevision, sourceIdentity: copy(identity),
      planSummary: copy(content.planSummary), executionSummary: copy(content.executionSummary),
      completedSteps: copy(content.completedSteps), completedActions: copy(content.completedActions), confirmedCheckpoints: copy(content.confirmedCheckpoints),
      actualParameters: copy(content.actualParameters), plannedParameters: copy(content.plannedParameters), deviations: copy(content.deviations),
      warnings: copy(content.warnings), notes: copy(content.notes),
      completionReference: { completionId: sources.completion.id, completionRevision: sources.completion.revision, completionFingerprint: sources.completion.completionFingerprint, completionSnapshotId: sources.completion.completionSnapshot.completionId, completedAt: sources.completion.updatedAt },
      generatedAt, fingerprint: null,
    };
    snapshot.fingerprint = calculateResultFingerprint(snapshot);
    return deepFreeze(snapshot);
  }

  function calculateResultFingerprint(snapshot) {
    const payload = copy(snapshot);
    delete payload.fingerprint;
    delete payload.generatedAt;
    delete payload.resultRevision;
    return fingerprint(payload);
  }

  function validateResultSnapshot(snapshot) {
    const errors = [];
    const arrays = ["completedSteps", "completedActions", "confirmedCheckpoints", "actualParameters", "plannedParameters", "deviations", "warnings", "notes"];
    if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION || !text(snapshot.resultId) || !text(snapshot.projectId) || !text(snapshot.sessionId) || !positiveInteger(snapshot.resultRevision) || !snapshot.sourceIdentity || !snapshot.planSummary || !snapshot.executionSummary || !snapshot.completionReference || arrays.some((key) => !Array.isArray(snapshot[key])) || !isTimestamp(snapshot.generatedAt) || !validFingerprint(snapshot.fingerprint)) return [diagnostic("invalid_result_snapshot")];
    if (calculateResultFingerprint(snapshot) !== snapshot.fingerprint) errors.push(diagnostic("invalid_result_snapshot", { field: "fingerprint" }));
    for (const key of ["completedSteps", "completedActions", "confirmedCheckpoints", "actualParameters", "plannedParameters"]) {
      const values = snapshot[key].map((entry) => entry.stepId || entry.actionId || entry.checkpointRecordId || entry.key);
      if (new Set(values).size !== values.length) errors.push(diagnostic("invalid_result_snapshot", { field: key }));
    }
    return stableDiagnostics(errors);
  }

  function validateResultState(state) {
    const errors = [];
    if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || state.sourceSchemaVersion !== SOURCE_SCHEMA_VERSION || !STATUSES.includes(state.status)) return [diagnostic("invalid_result_snapshot")];
    if (!text(state.id) || !text(state.projectId) || !positiveInteger(state.revision) || !Number.isInteger(state.resultRevision) || state.resultRevision < 0 || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) errors.push(diagnostic("invalid_result_snapshot", { field: "metadata" }));
    if (!Array.isArray(state.blockers) || !Array.isArray(state.warnings) || !Array.isArray(state.staleReasons) || !Array.isArray(state.audit) || !Array.isArray(state.operations) || state.audit.length > AUDIT_LIMIT || state.operations.length > OPERATION_LIMIT) errors.push(diagnostic("invalid_result_snapshot", { field: "state" }));
    if (state.resultSnapshot) {
      errors.push(...validateResultSnapshot(state.resultSnapshot));
      if (state.resultFingerprint !== state.resultSnapshot.fingerprint || state.resultRevision !== state.resultSnapshot.resultRevision) errors.push(diagnostic("invalid_result_snapshot", { field: "result_reference" }));
    } else if (state.resultFingerprint !== null || state.resultRevision !== 0) errors.push(diagnostic("invalid_result_snapshot", { field: "empty_result" }));
    if (state.status === "ready" && (!state.resultSnapshot || state.blockers.length)) errors.push(diagnostic("invalid_result_snapshot", { field: "ready" }));
    if (state.status === "blocked" && !state.blockers.length) errors.push(diagnostic("invalid_result_snapshot", { field: "blocked" }));
    if (state.status === "failed" && !state.failure) errors.push(diagnostic("invalid_result_snapshot", { field: "failed" }));
    if (state.status === "stale" && !state.staleReasons.length) errors.push(diagnostic("invalid_result_snapshot", { field: "stale" }));
    if (state.status === "generating" && !state.interruptedOperation) errors.push(diagnostic("invalid_result_snapshot", { field: "generating" }));
    return stableDiagnostics(errors);
  }

  function inspectAggregate(aggregate) {
    const sources = normalizeSources(aggregate);
    const record = newestRecord(array(aggregate?.progress).filter((entry) => entry.calculation_id === sources.calculationId && entry.kind === PROGRESS_KIND));
    const raw = record?.state || null;
    let errors = [];
    if (raw) { try { errors = validateResultState(raw); } catch { errors = [diagnostic("invalid_result_snapshot")]; } }
    const corrupt = errors.length > 0;
    let staleness = { stale: false, reasons: [] };
    if (raw && !corrupt) { try { staleness = detectStaleness(raw, sources); } catch { staleness = { stale: true, reasons: [staleReason("corrupted_source_identity")] }; } }
    return {
      project: sources.project, calculation: sources.calculation, resultRecord: record,
      result: corrupt ? safeCorruptProjection(raw) : raw, rawResult: raw, sources, staleness, corrupt, persistedErrors: errors,
      canGenerate: Boolean(sources.projectId && sources.calculationId && (!raw || raw.status === "waiting")),
      canRetry: Boolean(!corrupt && raw && ["blocked", "failed"].includes(raw.status) && !staleness.stale),
      canRebuild: Boolean(!corrupt && raw && ["blocked", "failed", "stale"].includes(staleness.stale ? "stale" : raw.status)),
    };
  }

  async function ensureForProject(repository, projectId, options = {}) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.calculation) throw resultError("missing_project", "Активный calculation проекта не найден.");
    if (inspected.resultRecord) return inspected;
    const state = createInitialState(projectId, { calculationId: inspected.calculation.calculation_id, now: options.now });
    await repository.ensurePatternExecutionResult(projectId, inspected.calculation.calculation_id, state, { operationKind: "PATTERN_EXECUTION_RESULT_CREATED", projectStage: "pattern_execution_result_waiting" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function generateForProject(repository, projectId, options = {}) { return persistGeneration(repository, projectId, "generate", options); }
  async function retryForProject(repository, projectId, options = {}) { return persistGeneration(repository, projectId, "retry", options); }
  async function rebuildForProject(repository, projectId, options = {}) { return persistGeneration(repository, projectId, "rebuild", options); }

  async function persistGeneration(repository, projectId, mode, options = {}) {
    let inspected = await ensureForProject(repository, projectId, options);
    if (inspected.corrupt) throw resultError("invalid_result_snapshot", "Сохранённый результат повреждён и не будет автоматически исправлен.");
    if (inspected.result.status === "generating") return recoverForProject(repository, projectId, options);
    const operationId = options.operationId || `${mode}:${makeId()}`;
    if (array(inspected.result.operations).some((entry) => entry.operationId === operationId)) return inspected;
    if (inspected.staleness.stale && inspected.result.status === "ready") {
      const stale = markStale(inspected.result, inspected.staleness.reasons, { expectedRevision: inspected.result.revision, now: options.now });
      await repository.updatePatternExecutionResult(projectId, inspected.calculation.calculation_id, stale, { expectedRevision: inspected.result.revision, operationKind: "PATTERN_EXECUTION_RESULT_STALE", projectStage: "pattern_execution_result_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (mode === "retry") {
      const actual = sourceIdentity(inspected.sources);
      if (inspected.result.expectedSourceIdentityFingerprint !== actual.sourceIdentityFingerprint) {
        const stale = markStaleForRetry(inspected.result, actual, { expectedRevision: inspected.result.revision, operationId, now: options.now });
        await repository.updatePatternExecutionResult(projectId, inspected.calculation.calculation_id, stale, { expectedRevision: inspected.result.revision, operationKind: "PATTERN_EXECUTION_RESULT_STALE", projectStage: "pattern_execution_result_stale" });
        return inspectAggregate(await repository.getProject(projectId));
      }
    }
    const started = beginGeneration(inspected.result, inspected.sources, { expectedRevision: inspected.result.revision, operationId, mode, now: options.now });
    await repository.updatePatternExecutionResult(projectId, inspected.calculation.calculation_id, started, { expectedRevision: inspected.result.revision, operationKind: `PATTERN_EXECUTION_RESULT_${mode.toUpperCase()}_STARTED`, projectStage: "pattern_execution_result_generating" });
    inspected = inspectAggregate(await repository.getProject(projectId));
    let completed;
    try { completed = completeGeneration(started, inspected.sources, { expectedRevision: started.revision, operationId, now: options.now }); }
    catch (error) { completed = failedFromGenerating(started, error?.code || "generation_failed", stableErrorMessage(error), { expectedRevision: started.revision, operationId, now: options.now }); }
    await repository.updatePatternExecutionResult(projectId, inspected.calculation.calculation_id, completed, { expectedRevision: started.revision, operationKind: `PATTERN_EXECUTION_RESULT_${completed.status.toUpperCase()}`, projectStage: `pattern_execution_result_${completed.status}` });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function readForProject(repository, projectId, options = {}) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.resultRecord || inspected.corrupt) return inspected;
    if (inspected.rawResult.status === "generating") return recoverForProject(repository, projectId, options);
    if (inspected.rawResult.status === "ready" && inspected.staleness.stale) {
      const stale = markStale(inspected.rawResult, inspected.staleness.reasons, { expectedRevision: inspected.rawResult.revision, now: options.now });
      await repository.updatePatternExecutionResult(projectId, inspected.calculation.calculation_id, stale, { expectedRevision: inspected.rawResult.revision, operationKind: "PATTERN_EXECUTION_RESULT_STALE", projectStage: "pattern_execution_result_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function recoverForProject(repository, projectId, options = {}) {
    const inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.rawResult || inspected.rawResult.status !== "generating" || inspected.corrupt) return inspected;
    const recovered = recoverInterruptedGeneration(inspected.rawResult, { expectedRevision: options.expectedRevision ?? inspected.rawResult.revision, now: options.now });
    await repository.updatePatternExecutionResult(projectId, inspected.calculation.calculation_id, recovered, { expectedRevision: inspected.rawResult.revision, operationKind: "PATTERN_EXECUTION_RESULT_RECOVERED", projectStage: "pattern_execution_result_failed" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  function transferableWarnings(entries) {
    return uniqueSemantic(array(entries).filter((entry) => entry && !/debug|stack|operation/i.test(`${entry.code || ""} ${entry.message || ""}`)).map((entry) => ({ code: text(entry.code) || "source_warning", message: text(entry.message) || "Существенное замечание источника.", details: copy(entry.details || {}) }))).sort((left, right) => lexical(left.code, right.code) || lexical(left.message, right.message));
  }
  function deriveNotes(sources) {
    const notes = [];
    for (const record of [...sources.stepRecords, ...sources.checkpointRecords]) {
      const state = record.state || {};
      for (const note of array(state.notes || state.userNotes)) if (text(note?.text ?? note)) notes.push({ text: text(note?.text ?? note), sourceStage: state.kind, sourceReference: { id: state.id } });
      const comment = state.status === "confirmed" ? text(state.decision?.comment) : "";
      if (comment) notes.push({ text: comment, sourceStage: state.kind, sourceReference: { id: state.id } });
    }
    return uniqueSemantic(notes.filter((entry) => entry.text)).sort((left, right) => lexical(left.text, right.text) || lexical(left.sourceReference.id, right.sourceReference.id));
  }
  function actionParameterType(action) { if (action.measurementTarget !== undefined) return "measurement"; if (action.stitchCount !== undefined) return "stitches"; if (action.rowRange !== undefined) return "rows"; if (action.repeatCount !== undefined) return "counter"; if (["counter", "rows", "stitches", "measurement"].includes(action.progressType) && action.quantity !== undefined) return action.progressType; return null; }
  function plannedActionValue(action, type) { if (type === "measurement") return parameterValue(action.measurementTarget); if (type === "stitches") return parameterValue(action.stitchCount); if (type === "rows") { const range = action.rowRange; return Number.isInteger(range?.from) && Number.isInteger(range?.to) ? range.to - range.from + 1 : parameterValue(action.quantity); } if (type === "counter") return parameterValue(action.repeatCount ?? action.quantity); return undefined; }
  function actionUnit(action, type) { return action.unit ?? action.measurementTarget?.unit ?? ({ rows: "rows", stitches: "stitches", counter: null })[type] ?? null; }
  function parameterValue(value) { if (["string", "number", "boolean"].includes(typeof value)) return value; if (value && typeof value === "object" && ["string", "number", "boolean"].includes(typeof value.value)) return value.value; return undefined; }
  function comparable(left, right) { return typeof left === typeof right && ["string", "number", "boolean"].includes(typeof left) && (typeof left !== "number" || Number.isFinite(left) && Number.isFinite(right)); }
  function normalizedNumber(value) { return Number(value.toFixed(12)); }
  function uniqueByKey(entries) { const map = new Map(); for (const entry of entries) if (!map.has(entry.key)) map.set(entry.key, entry); return [...map.values()]; }
  function uniqueSemantic(entries) { const map = new Map(); for (const entry of entries) map.set(canonicalize(entry), entry); return [...map.values()]; }
  function stableObservations(entries) { return array(entries).map((entry) => ({ observationId: entry.observationId, type: entry.type, value: copy(entry.value) })).sort((left, right) => lexical(text(left.observationId), text(right.observationId))); }
  function stableRecords(records) { return array(records).slice().sort((left, right) => numeric(left.epoch) - numeric(right.epoch) || lexical(text(left.progress_id), text(right.progress_id))); }
  function newestRecord(records) { return stableRecords(records).sort((left, right) => numeric(left.epoch) - numeric(right.epoch) || numeric(left.state?.revision) - numeric(right.state?.revision) || lexical(text(left.progress_id), text(right.progress_id))).at(-1) || null; }
  function stablePhases(entries) { return array(entries).slice().sort((left, right) => numeric(left.order) - numeric(right.order) || lexical(text(left.id), text(right.id))); }
  function stableActions(entries) { return array(entries).slice().sort((left, right) => numeric(left.order) - numeric(right.order) || lexical(text(left.id), text(right.id))); }
  function stableCheckpoints(entries) { return array(entries).slice().sort((left, right) => lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.actionId), text(right.actionId)) || lexical(text(left.id), text(right.id))); }
  function stableStrings(values) { return [...new Set(array(values).filter((entry) => typeof entry === "string" && entry.length))].sort(lexical); }
  function stableNumbers(values) { return [...new Set(array(values).map(integer).filter((entry) => entry !== null))].sort((a, b) => a - b); }
  function compareIdentity(left, right) { return lexical(text(left.actionId), text(right.actionId)) || lexical(text(left.checkpointId), text(right.checkpointId)) || lexical(text(left.id), text(right.id)) || lexical(text(left.progressId), text(right.progressId)); }
  function compareStepSummary(left, right) { return lexical(text(left.phaseId), text(right.phaseId)) || numeric(left.order) - numeric(right.order) || lexical(text(left.actionId), text(right.actionId)); }
  function compareCheckpointSummary(left, right) { return lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.actionId), text(right.actionId)) || lexical(text(left.checkpointId), text(right.checkpointId)); }
  function compareActionSummary(left, right) { return numeric(left.order) - numeric(right.order) || lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.actionId), text(right.actionId)); }
  function compareParameter(left, right) { return lexical(text(left.key), text(right.key)); }
  function checkpointSessionEpoch(state) { return integer(state?.sourceSessionEpoch ?? state?.identityChain?.sourceSessionEpoch); }
  function valueAt(value, path) { return path.split(".").reduce((current, key) => current?.[key], value); }
  function finish(state) { return deepFreeze(state); }
  function copyFrozen(value) { return deepFreeze(copy(value)); }
  function safeCorruptProjection(state) { return deepFreeze({ ...createInitialState(text(state?.projectId) || "corrupt-project", { calculationId: state?.sourceCalculationId || null }), id: text(state?.id) || "corrupt-result", revision: positiveInteger(state?.revision) || 1, status: "failed", failure: { code: "invalid_result_snapshot", message: "Сохранённый результат повреждён." }, blockers: [blocker("invalid_result_snapshot", "Сохранённый результат повреждён.")] }); }
  function normalizeMode(value, status) { const mode = value || (status === "waiting" ? "generate" : status === "stale" ? "rebuild" : "retry"); if (!["generate", "retry", "rebuild"].includes(mode)) throw resultError("generation_mode_invalid", "Режим генерации не поддерживается."); return mode; }
  function blocker(code, message = blockerMessage(code), details = {}) { const semantic = { code, details: copy(details || {}) }; return { id: `result-blocker:${fingerprint(semantic).slice(8)}`, code, message, details: semantic.details }; }
  function staleReason(code, details = {}) { return { code, message: staleMessage(code), details: copy(details || {}) }; }
  function diagnostic(code, details = {}) { return { code, details: copy(details || {}) }; }
  function stableBlockers(entries) { return uniqueSemantic(array(entries).map((entry) => ({ ...entry, details: copy(entry.details || {}) }))).sort((left, right) => lexical(left.code, right.code) || lexical(left.id, right.id)); }
  function stableReasons(entries) { return uniqueSemantic(array(entries).map((entry) => ({ code: entry.code || String(entry), message: entry.message || staleMessage(entry.code || String(entry)), details: copy(entry.details || {}) }))).sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details))); }
  function stableDiagnostics(entries) { return uniqueSemantic(array(entries)).sort((left, right) => lexical(left.code, right.code)); }
  function appendAudit(state, event, at, details = {}) { state.audit = [...array(state.audit), { event, at, revision: state.revision, ...copy(details) }].slice(-AUDIT_LIMIT); }
  function recordOperation(state, operationId, type, result) { state.operations = [...array(state.operations), { operationId, type, result, revision: state.revision, at: state.updatedAt }].slice(-OPERATION_LIMIT); }
  function updateOperation(state, operationId, type, result) { const entry = array(state.operations).find((item) => item.operationId === operationId && item.type === type); if (entry) { entry.result = result; entry.revision = state.revision; entry.at = state.updatedAt; } else recordOperation(state, operationId, type, result); }
  function prepareRevision(state, now) { state.revision += 1; state.updatedAt = now; }
  function checkRevision(state, expectedRevision) { if (!positiveInteger(expectedRevision) || expectedRevision !== state.revision) throw resultError("result_revision_conflict", "Результат изменён в другой операции.", { expectedRevision, actualRevision: state.revision }); }
  function requireResult(state) { const errors = validateResultState(state); if (errors.length) throw resultError("invalid_result_snapshot", "Запись результата повреждена.", { errors }); }
  function requireOperationId(value) { const result = text(value); if (!result) throw resultError("operation_id_required", "Для generation требуется operationId."); return result; }
  function throwInvalidTransition(from, to) { throw resultError("invalid_status_transition", `Переход ${from || "unknown"} → ${to} недопустим.`); }
  function stableErrorMessage(error) { return text(error?.userMessage) || text(error?.message) || "Генерация завершилась контролируемой ошибкой."; }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function positiveInteger(value) { const number = integer(value); return number !== null && number > 0 ? number : null; }
  function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function timestampNow() { return new Date().toISOString(); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function stableId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || stableId("execution-result-record", { at: timestampNow() }); }
  function resultError(code, message, details = {}) { return new PatternExecutionResultError(code, message, details); }
  function blockerMessage(code) { return ({
    missing_project: "Проект или активный calculation не найден.", missing_execution_plan: "План выполнения не найден.", missing_execution_session: "Сессия выполнения не найдена.", missing_execution_step: "Связанные завершённые steps не найдены.", missing_execution_checkpoint: "Связанные checkpoints не найдены.", missing_execution_progress: "Агрегированный progress не найден.", missing_execution_completion: "Подтверждение завершённости не найдено.", completion_not_ready: "Подтверждение завершённости ещё не готово.", completion_has_blockers: "Подтверждение завершённости содержит blockers.", completion_has_next_action: "Подтверждение завершённости всё ещё содержит следующее действие.", empty_completion_snapshot: "Completion snapshot пуст.", stale_session_epoch: "Completion относится к другой session epoch.", project_identity_mismatch: "Project identity не согласована во всей цепочке.", session_identity_mismatch: "Session identity не согласована во всей цепочке.", source_revision_mismatch: "Revision источника не совпадает с completion snapshot.", source_fingerprint_mismatch: "Fingerprint источника не совпадает с completion snapshot.", corrupted_source_identity: "Source identity повреждена или недоказуема.", unknown_step_reference: "Обнаружена неизвестная ссылка на step.", unknown_action_reference: "Обнаружена неизвестная ссылка на action.", unknown_checkpoint_reference: "Обнаружена неизвестная ссылка на checkpoint.", duplicate_step_reference: "Обнаружена дублирующаяся ссылка на step.", duplicate_action_reference: "Обнаружена дублирующаяся ссылка на action.", duplicate_checkpoint_reference: "Обнаружена дублирующаяся ссылка на checkpoint.", interrupted_generation: "Предыдущая генерация была прервана.", invalid_result_snapshot: "Итоговый snapshot повреждён.",
  })[code] || "Итоговый результат нельзя построить из текущей completion identity."; }
  function staleMessage(code) { return ({ project_identity_changed: "Изменилась project identity.", calculation_identity_changed: "Изменилась calculation identity.", plan_identity_changed: "Изменилась identity плана.", session_identity_changed: "Изменилась identity сессии или epoch.", step_identity_changed: "Изменилась identity завершённых steps.", checkpoint_identity_changed: "Изменилась identity подтверждённых checkpoints.", progress_identity_changed: "Изменилась identity progress.", completion_identity_changed: "Изменилась identity completion.", source_schema_version_changed: "Изменилась source schema.", retry_source_identity_changed: "Retry не может принять изменившуюся source identity.", corrupted_source_identity: "Текущая source identity недоказуема.", import_identity_unproven: "После импорта identity должна быть подтверждена явным rebuild." })[code] || "Source identity изменилась."; }

  const api = {
    VERSION, SCHEMA_VERSION, SOURCE_SCHEMA_VERSION, PROGRESS_KIND, STATUSES, TRANSITIONS, AUDIT_LIMIT, OPERATION_LIMIT,
    PatternExecutionResultError, canonicalize, fingerprint, createInitialState, beginGeneration, completeGeneration,
    generateResult, retryResult, rebuildResult, recoverInterruptedGeneration, failedFromGenerating,
    detectStaleness, markStale, normalizeSources, sourceIdentity, verifySources, deriveParameters, deriveDeviations,
    buildResultSnapshot, calculateResultFingerprint, validateResultSnapshot, validateResultState, inspectAggregate,
    ensureForProject, generateForProject, retryForProject, rebuildForProject, readForProject, recoverForProject,
  };
  globalObject.YarnAIPatternExecutionResult = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
