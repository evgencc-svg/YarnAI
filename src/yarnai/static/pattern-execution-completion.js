"use strict";

(function exposePatternExecutionCompletion(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const SOURCE_SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_COMPLETION";
  const STATUSES = Object.freeze(["waiting", "verifying", "ready", "blocked", "failed", "stale"]);
  const AUDIT_LIMIT = 32;
  const OPERATION_LIMIT = 96;
  const TERMINAL_ACTION_STATUSES = Object.freeze(["completed", "skipped"]);
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["verifying"]),
    verifying: Object.freeze(["ready", "blocked", "failed"]),
    ready: Object.freeze(["stale"]),
    blocked: Object.freeze(["verifying", "stale"]),
    failed: Object.freeze(["verifying", "stale"]),
    stale: Object.freeze(["verifying"]),
  });

  class PatternExecutionCompletionError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionCompletionError";
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
    if (typeof value === "number" && !Number.isFinite(value)) throw completionError("non_finite_value", "Completion содержит недопустимое числовое значение.");
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
    if (!text(projectId)) throw completionError("project_identity_missing", "Project context не задан.");
    const now = options.now || timestampNow();
    const state = {
      id: options.id || makeId(), projectId, kind: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION, revision: 1, status: "waiting", createdAt: now, updatedAt: now,
      sourceCalculationId: options.calculationId || null, expectedSourceIdentity: null, expectedSourceIdentityFingerprint: null,
      completionSnapshot: null, completionFingerprint: null, verification: emptyVerification(),
      blockers: [], warnings: [], staleReasons: [], failure: null, interruptedOperation: null,
      audit: [], operations: [],
    };
    appendAudit(state, "created", now);
    return finish(state);
  }

  function beginVerification(state, sources, options = {}) {
    requireCompletion(state);
    const mode = normalizeMode(options.mode, state.status);
    const operationId = requireOperationId(options.operationId);
    const existing = array(state.operations).find((entry) => entry.operationId === operationId);
    if (existing) {
      if (existing.type !== mode) throw completionError("operation_id_conflict", "operationId уже использован другой операцией.");
      return copyFrozen(state);
    }
    checkRevision(state, options.expectedRevision);
    if (!TRANSITIONS[state.status].includes("verifying")) throwInvalidTransition(state.status, "verifying");
    if (state.status === "stale" && mode !== "rebuild") throw completionError("rebuild_required", "Stale completion можно проверить только явным rebuild.");
    if (mode === "retry" && !["blocked", "failed"].includes(state.status)) throw completionError("retry_not_allowed", "Retry доступен только для blocked или failed completion.");
    if (mode === "verify" && state.status !== "waiting") throw completionError("verify_not_allowed", "Первичная verification доступна только из waiting.");
    const now = options.now || timestampNow();
    const currentIdentity = sourceIdentity(normalizeSources(sources, state.projectId));
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "verifying";
    next.blockers = [];
    next.warnings = [];
    next.staleReasons = [];
    next.failure = null;
    next.verification = emptyVerification();
    next.interruptedOperation = {
      operationId, mode, startedAt: now, baseRevision: state.revision,
      sourceIdentityFingerprint: currentIdentity.sourceIdentityFingerprint,
    };
    if (mode === "retry") appendAudit(next, "retry_requested", now, { operationId });
    if (mode === "rebuild") appendAudit(next, "rebuild_requested", now, { operationId });
    appendAudit(next, "verification_started", now, { operationId, mode, sourceIdentityFingerprint: currentIdentity.sourceIdentityFingerprint });
    recordOperation(next, operationId, mode, "started");
    return finish(next);
  }

  function completeVerification(state, sources, options = {}) {
    requireCompletion(state);
    if (state.status !== "verifying" || !state.interruptedOperation) throwInvalidTransition(state.status, "ready");
    checkRevision(state, options.expectedRevision);
    const operationId = options.operationId || state.interruptedOperation.operationId;
    if (operationId !== state.interruptedOperation.operationId) throw completionError("operation_id_conflict", "Завершается другая verification operation.");
    const now = options.now || timestampNow();
    const normalized = normalizeSources(sources, state.projectId);
    const currentIdentity = sourceIdentity(normalized);
    if (currentIdentity.sourceIdentityFingerprint !== state.interruptedOperation.sourceIdentityFingerprint) {
      return failedFromVerifying(state, "source_changed_during_verification", "Source identity изменилась во время verification.", options);
    }
    const result = verifySources(normalized);
    const next = mutable(state);
    prepareRevision(next, now);
    next.expectedSourceIdentity = copy(currentIdentity);
    next.expectedSourceIdentityFingerprint = currentIdentity.sourceIdentityFingerprint;
    next.sourceCalculationId = normalized.calculationId || next.sourceCalculationId;
    next.verification = copy(result.verification);
    next.blockers = copy(result.blockers);
    next.warnings = copy(result.warnings);
    next.staleReasons = [];
    next.failure = null;
    next.interruptedOperation = null;
    next.status = result.blockers.length ? "blocked" : "ready";
    if (next.status === "ready") {
      next.completionSnapshot = buildCompletionSnapshot(normalized, result, now);
      next.completionFingerprint = next.completionSnapshot.completionFingerprint;
    } else {
      next.completionSnapshot = null;
      next.completionFingerprint = null;
    }
    appendAudit(next, `verification_${next.status}`, now, { operationId, blockerCodes: next.blockers.map((entry) => entry.code) });
    updateOperation(next, operationId, state.interruptedOperation.mode, next.status);
    return finish(next);
  }

  function verifyCompletion(state, sources, options = {}) {
    requireCompletion(state);
    const mode = normalizeMode(options.mode, state.status);
    const operationId = requireOperationId(options.operationId);
    const existing = array(state.operations).find((entry) => entry.operationId === operationId);
    if (existing) return copyFrozen(state);
    if (mode === "retry") {
      const currentIdentity = sourceIdentity(normalizeSources(sources, state.projectId));
      if (!state.expectedSourceIdentityFingerprint || state.expectedSourceIdentityFingerprint !== currentIdentity.sourceIdentityFingerprint) {
        return markStaleForRetry(state, currentIdentity, { ...options, operationId });
      }
    }
    const started = beginVerification(state, sources, { ...options, mode, operationId });
    try {
      return completeVerification(started, sources, { ...options, expectedRevision: started.revision, operationId });
    } catch (error) {
      if (error instanceof PatternExecutionCompletionError && error.code === "source_changed_during_verification") throw error;
      return failedFromVerifying(started, error.code || "verification_failed", stableErrorMessage(error), { ...options, expectedRevision: started.revision, operationId });
    }
  }

  function retryCompletion(state, sources, options = {}) { return verifyCompletion(state, sources, { ...options, mode: "retry" }); }
  function rebuildCompletion(state, sources, options = {}) { return verifyCompletion(state, sources, { ...options, mode: "rebuild" }); }

  function recoverInterruptedCompletion(state, options = {}) {
    requireCompletion(state);
    if (state.status !== "verifying") return copyFrozen(state);
    checkRevision(state, options.expectedRevision);
    const operation = state.interruptedOperation;
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "failed";
    next.failure = { code: "interrupted_verification", message: "Прерванная verification безопасно остановлена. Доступен явный retry." };
    next.blockers = [blocker("interrupted_verification", next.failure.message)];
    next.staleReasons = [];
    next.interruptedOperation = null;
    next.verification = { ...emptyVerification(), valid: false };
    appendAudit(next, "interrupted_recovery", now, { operationId: operation?.operationId || null });
    if (operation?.operationId) updateOperation(next, operation.operationId, operation.mode, "interrupted");
    return finish(next);
  }

  function failedFromVerifying(state, code, message, options = {}) {
    requireCompletion(state);
    if (state.status !== "verifying") throwInvalidTransition(state.status, "failed");
    checkRevision(state, options.expectedRevision);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "failed";
    next.failure = { code: text(code) || "verification_failed", message: text(message) || "Verification завершилась контролируемой ошибкой." };
    next.blockers = [blocker(next.failure.code, next.failure.message)];
    next.staleReasons = [];
    next.interruptedOperation = null;
    next.verification = { ...emptyVerification(), valid: false };
    appendAudit(next, "verification_failed", now, { operationId: state.interruptedOperation?.operationId || null, code: next.failure.code });
    if (state.interruptedOperation?.operationId) updateOperation(next, state.interruptedOperation.operationId, state.interruptedOperation.mode, "failed");
    return finish(next);
  }

  function detectStaleness(state, sources) {
    requireCompletion(state);
    if (!state.expectedSourceIdentity || ["waiting", "verifying"].includes(state.status)) return { stale: false, reasons: [] };
    let actual;
    try { actual = sourceIdentity(normalizeSources(sources)); }
    catch { return { stale: true, reasons: [staleReason("source_identity_corrupt")] }; }
    const expected = state.expectedSourceIdentity;
    const reasons = [];
    const compare = (path, code) => {
      const before = valueAt(expected, path); const after = valueAt(actual, path);
      if (canonicalize(before ?? null) !== canonicalize(after ?? null)) reasons.push(staleReason(code, { expected: before ?? null, actual: after ?? null }));
    };
    compare("projectId", "project_identity_changed");
    compare("calculation.id", "calculation_identity_changed");
    compare("calculation.fingerprint", "calculation_identity_changed");
    compare("importIdentity", "import_identity_changed");
    compare("plan.id", "plan_identity_changed");
    compare("plan.revision", "plan_revision_changed");
    compare("plan.fingerprint", "plan_fingerprint_changed");
    compare("session.id", "session_identity_changed");
    compare("session.revision", "session_revision_changed");
    compare("session.epoch", "session_epoch_changed");
    compare("session.fingerprint", "session_fingerprint_changed");
    compare("steps", "steps_composition_changed");
    compare("checkpoints", "checkpoints_composition_changed");
    compare("progress.revision", "progress_revision_changed");
    compare("progress.fingerprint", "progress_fingerprint_changed");
    if (state.sourceSchemaVersion !== SOURCE_SCHEMA_VERSION) reasons.push(staleReason("source_schema_version_changed", { expected: state.sourceSchemaVersion, actual: SOURCE_SCHEMA_VERSION }));
    return { stale: reasons.length > 0, reasons: stableReasons(reasons) };
  }

  function markStale(state, reasons, options = {}) {
    requireCompletion(state);
    if (state.status === "stale") return copyFrozen(state);
    checkRevision(state, options.expectedRevision);
    if (!TRANSITIONS[state.status].includes("stale")) throwInvalidTransition(state.status, "stale");
    const normalizedReasons = stableReasons(reasons);
    if (!normalizedReasons.length) return copyFrozen(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "stale";
    next.staleReasons = normalizedReasons;
    next.blockers = normalizedReasons.map((entry) => blocker(entry.code, entry.message, entry.details));
    next.failure = null;
    next.interruptedOperation = null;
    appendAudit(next, "stale_detected", now, { reasonCodes: normalizedReasons.map((entry) => entry.code) });
    return finish(next);
  }

  function markStaleForRetry(state, currentIdentity, options = {}) {
    requireCompletion(state);
    checkRevision(state, options.expectedRevision);
    const now = options.now || timestampNow();
    const reasons = stableReasons([staleReason("retry_source_identity_changed", { expected: state.expectedSourceIdentityFingerprint, actual: currentIdentity.sourceIdentityFingerprint })]);
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
    const plan = input?.plan || planRecord?.state || null;
    const session = input?.session || sessionRecord?.state || null;
    const progress = input?.executionProgress || progressRecord?.state || null;
    const sessionId = session?.id || null;
    const suppliedSteps = input?.stepRecords || ofKind("PATTERN_EXECUTION_STEP");
    const suppliedCheckpoints = input?.checkpointRecords || ofKind("PATTERN_EXECUTION_CHECKPOINT");
    return {
      project, projectId: projectId || project?.project_id || project?.projectId || plan?.projectId || session?.projectId || null,
      calculation, calculationId, planRecord, plan, sessionRecord, session,
      sessionEpoch: integer(input?.sessionEpoch ?? sessionRecord?.epoch),
      stepRecords: stableRecords(suppliedSteps.filter((entry) => !sessionId || entry.state?.sourceSessionId === sessionId)),
      checkpointRecords: stableRecords(suppliedCheckpoints.filter((entry) => !sessionId || entry.state?.sourceSessionId === sessionId)),
      progressRecord, progress,
    };
  }

  function sourceIdentity(sources) {
    const plan = sources.plan; const session = sources.session; const progress = sources.progress;
    const calculation = {
      id: sources.calculationId || null,
      fingerprint: sources.calculation?.fingerprint || sources.calculation?.input_fingerprint || null,
      revision: integer(sources.calculation?.revision),
    };
    const importIdentity = {
      semanticSourceId: plan?.sourceSemanticAnalysisId || session?.sourceSemanticAnalysisId || null,
      revision: integer(plan?.sourceImportRevision ?? session?.sourceImportRevision ?? progress?.sourceImportRevision),
      fingerprint: plan?.sourceConfirmedSnapshotFingerprint || session?.sourceConfirmedSnapshotFingerprint || null,
    };
    const steps = stableRecords(sources.stepRecords).map((entry) => ({
      progressId: entry.progress_id || null, recordEpoch: integer(entry.epoch), id: entry.state?.id || null,
      revision: integer(entry.state?.revision), fingerprint: entry.state?.stepFingerprint || null,
      sessionId: entry.state?.sourceSessionId || null, planId: entry.state?.sourcePlanId || null,
      phaseId: entry.state?.phaseId || null, actionId: entry.state?.actionId || null, status: entry.state?.status || null,
    })).sort(compareIdentity);
    const checkpoints = stableRecords(sources.checkpointRecords).map((entry) => ({
      progressId: entry.progress_id || null, recordEpoch: integer(entry.epoch), id: entry.state?.id || null,
      revision: integer(entry.state?.revision), fingerprint: entry.state?.checkpointFingerprint || null,
      sessionId: entry.state?.sourceSessionId || null, sessionEpoch: checkpointSessionEpoch(entry.state),
      planId: entry.state?.sourcePlanId || null, stepId: entry.state?.sourceStepId || null,
      phaseId: entry.state?.phaseId || null, actionId: entry.state?.actionId || null,
      checkpointId: entry.state?.checkpointId || null, status: entry.state?.status || null,
    })).sort(compareIdentity);
    const base = {
      sourceSchemaVersion: SOURCE_SCHEMA_VERSION, projectId: sources.projectId || null, calculation, importIdentity,
      plan: { id: plan?.id || null, revision: integer(plan?.revision), fingerprint: plan?.planFingerprint || null },
      session: { id: session?.id || null, revision: integer(session?.revision), epoch: integer(sources.sessionEpoch), fingerprint: session?.sessionFingerprint || null },
      steps, checkpoints,
      progress: { id: progress?.id || null, revision: integer(progress?.revision), fingerprint: progress?.progressFingerprint || null, snapshotFingerprint: progress?.immutableSnapshotFingerprint || null },
    };
    return { ...base, stepsFingerprint: fingerprint(steps), checkpointsFingerprint: fingerprint(checkpoints), sourceIdentityFingerprint: fingerprint(base) };
  }

  function verifySources(sources) {
    const blockers = [];
    const warnings = [];
    const add = (code, message, details = {}) => blockers.push(blocker(code, message || blockerMessage(code), details));
    const plan = sources.plan; const session = sources.session; const progress = sources.progress;
    if (!sources.projectId || !sources.calculationId) add("source_identity_corrupt", null, { field: !sources.projectId ? "project" : "calculation" });
    if (!plan) add("stage_22_missing");
    if (!session) add("stage_23_missing");
    if (!progress) add("stage_26_missing");

    const phases = stablePhases(plan?.plan?.phases);
    const planActions = phases.flatMap((phase) => stableActions(phase.actions).map((actionEntry) => ({ ...actionEntry, phaseId: phase.id, phaseTitle: phase.title, phaseOrder: phase.order })));
    const checkpointDefinitions = stableCheckpointDefinitions(plan?.plan?.checkpoints, phases);
    if (plan && (!phases.length || !planActions.length)) add("execution_plan_empty");
    if (plan && (plan.kind !== "PATTERN_EXECUTION_PLAN" || plan.status !== "ready" || !positiveInteger(plan.revision))) add("stage_22_invalid", null, { status: plan.status || null });
    if (session && (session.kind !== "PATTERN_EXECUTION_SESSION" || session.status !== "completed" || !positiveInteger(session.revision))) add("stage_23_invalid", null, { status: session.status || null });
    if (progress && progress.status !== "ready") add("stage_26_not_ready", null, { status: progress.status || null });
    if (progress && array(progress.blockers).length) add("stage_26_has_blockers", null, { blockerCodes: stableStrings(progress.blockers.map((entry) => entry.code)) });
    if (progress?.nextAction) add("stage_26_next_action_pending", null, { type: progress.nextAction.type || null });

    validateFingerprintsAndRevisions(sources, blockers);

    const sessionActions = array(session?.execution?.actions).slice().sort(compareSessionAction);
    const seenActions = new Set();
    for (const actionEntry of sessionActions) {
      if (!text(actionEntry.actionId) || seenActions.has(actionEntry.actionId)) add("duplicate_action", null, { actionId: actionEntry.actionId || null });
      seenActions.add(actionEntry.actionId);
    }
    const planActionIds = new Set();
    for (const actionEntry of planActions) {
      if (!text(actionEntry.id) || planActionIds.has(actionEntry.id)) add("duplicate_action", null, { actionId: actionEntry.id || null });
      planActionIds.add(actionEntry.id);
    }

    const stepsByAction = new Map();
    for (const record of sources.stepRecords) {
      const step = record.state || {};
      if (!planActionIds.has(step.actionId) || step.sourceSessionId !== session?.id || step.sourcePlanId !== plan?.id || step.projectId !== sources.projectId) {
        add("incompatible_action_identity", null, { stepId: step.id || null, actionId: step.actionId || null });
      }
      if (stepsByAction.has(step.actionId)) add("duplicate_action", null, { actionId: step.actionId || null, identity: "step" });
      stepsByAction.set(step.actionId, record);
    }

    for (const definition of planActions) {
      const runtime = sessionActions.find((entry) => entry.actionId === definition.id);
      const required = definition.required !== false;
      const step = stepsByAction.get(definition.id)?.state || null;
      if (!runtime) add("incompatible_action_identity", null, { actionId: definition.id, field: "session" });
      if (required && !step) add("required_step_missing", null, { actionId: definition.id });
      if (required && runtime?.status !== "completed") add("action_not_completed", null, { actionId: definition.id, status: runtime?.status || "missing" });
      if (required && step && step.status !== "completed") add("action_not_completed", null, { actionId: definition.id, stepId: step.id || null, status: step.status || "missing" });
      if (!required && runtime && !TERMINAL_ACTION_STATUSES.includes(runtime.status)) add("action_not_completed", null, { actionId: definition.id, status: runtime.status });
    }

    const checkpointKeySet = new Set();
    const checkpointsByDefinition = new Map();
    for (const record of sources.checkpointRecords) {
      const checkpoint = record.state || {};
      const key = `${checkpoint.sourceSessionId || ""}|${checkpoint.actionId || ""}|${checkpoint.checkpointId || ""}`;
      if (checkpointKeySet.has(key)) add("duplicate_checkpoint", null, { checkpointId: checkpoint.checkpointId || null, actionId: checkpoint.actionId || null });
      checkpointKeySet.add(key);
      if (!planActionIds.has(checkpoint.actionId)) add("checkpoint_unknown_action", null, { checkpointId: checkpoint.checkpointId || null, actionId: checkpoint.actionId || null });
      const definition = checkpointDefinitions.find((entry) => entry.id === checkpoint.checkpointId);
      const linkedStep = stepsByAction.get(checkpoint.actionId)?.state || null;
      if (!definition || checkpoint.projectId !== sources.projectId || checkpoint.sourceSessionId !== session?.id || checkpoint.sourcePlanId !== plan?.id || definition.actionId !== checkpoint.actionId || !linkedStep || checkpoint.sourceStepId !== linkedStep.id) {
        add("incompatible_checkpoint_identity", null, { checkpointId: checkpoint.checkpointId || null, recordId: checkpoint.id || null });
      }
      const explicitEpoch = checkpointSessionEpoch(checkpoint);
      if (explicitEpoch !== null && explicitEpoch !== sources.sessionEpoch) add("checkpoint_old_epoch", null, { checkpointId: checkpoint.checkpointId || null, expectedEpoch: sources.sessionEpoch, actualEpoch: explicitEpoch });
      if (!checkpointsByDefinition.has(checkpoint.checkpointId)) checkpointsByDefinition.set(checkpoint.checkpointId, []);
      checkpointsByDefinition.get(checkpoint.checkpointId).push(record);
    }

    for (const definition of checkpointDefinitions.filter((entry) => entry.required)) {
      const candidates = checkpointsByDefinition.get(definition.id) || [];
      const confirmed = candidates.find((entry) => entry.state?.status === "confirmed");
      if (!confirmed) add("required_checkpoint_missing", null, { checkpointId: definition.id, actionId: definition.actionId });
    }

    if (progress) {
      const counts = progress.counts || {};
      if (!positiveInteger(counts.steps?.total) || counts.steps.total !== planActions.length || counts.steps.completed !== sessionActions.filter((entry) => entry.status === "completed").length) add("progress_not_complete", null, { planActions: planActions.length, progressSteps: counts.steps?.total ?? null, completed: counts.steps?.completed ?? null });
      if (progress.immutableSnapshot?.logicalSteps && progress.immutableSnapshot.logicalSteps.some((entry) => entry.required !== false && entry.status !== "completed")) add("progress_not_complete");
    }

    for (const warningEntry of array(plan?.warnings)) warnings.push(warning(warningEntry.code || "plan_warning", warningEntry.message || "Plan warning", warningEntry.details || {}));
    for (const warningEntry of array(progress?.warnings)) warnings.push(warning(warningEntry.code || "progress_warning", warningEntry.message || "Progress warning", warningEntry.details || {}));

    const stable = stableBlockers(blockers);
    const summaries = deriveSummaries(sources, phases, planActions, checkpointDefinitions, stepsByAction, checkpointsByDefinition);
    return {
      blockers: stable, warnings: stableWarnings(warnings), ...summaries,
      verification: { valid: stable.length === 0, checkedSourceIdentityFingerprint: sourceIdentity(sources).sourceIdentityFingerprint, counts: copy(summaries.counts) },
    };
  }

  function validateFingerprintsAndRevisions(sources, blockers) {
    const add = (code, details) => blockers.push(blocker(code, blockerMessage(code), details));
    const plan = sources.plan; const session = sources.session; const progress = sources.progress;
    const planApi = globalObject.YarnAIPatternExecutionPlan;
    const sessionApi = globalObject.YarnAIPatternExecutionSession;
    const stepApi = globalObject.YarnAIPatternExecutionStep;
    const checkpointApi = globalObject.YarnAIPatternExecutionCheckpoint;
    const progressApi = globalObject.YarnAIPatternExecutionProgress;
    if (plan) {
      if (!validFingerprint(plan.planFingerprint) || planApi?.calculatePlanFingerprint && planApi.calculatePlanFingerprint(plan) !== plan.planFingerprint) add("fingerprint_mismatch", { stage: 22, id: plan.id || null });
    }
    if (session) {
      if (!validFingerprint(session.sessionFingerprint) || sessionApi?.calculateSessionFingerprint && sessionApi.calculateSessionFingerprint(session) !== session.sessionFingerprint) add("fingerprint_mismatch", { stage: 23, id: session.id || null });
      if (plan && (session.sourceExecutionPlanId !== plan.id || session.sourceExecutionPlanRevision !== plan.revision)) add("revision_mismatch", { stage: 23, source: 22 });
      if (plan && session.sourceExecutionPlanFingerprint !== plan.planFingerprint) add("fingerprint_mismatch", { stage: 23, source: 22 });
      if (plan && session.sourceImportRevision !== plan.sourceImportRevision) add("revision_mismatch", { field: "importRevision" });
    }
    for (const record of sources.stepRecords) {
      const step = record.state || {};
      if (!validFingerprint(step.stepFingerprint) || stepApi?.calculateStepFingerprint && stepApi.calculateStepFingerprint(step) !== step.stepFingerprint) add("fingerprint_mismatch", { stage: 24, id: step.id || null });
      if (plan && (step.sourcePlanRevision !== plan.revision || step.sourceImportRevision !== plan.sourceImportRevision)) add("revision_mismatch", { stage: 24, id: step.id || null });
      if (plan && step.sourcePlanFingerprint !== plan.planFingerprint) add("fingerprint_mismatch", { stage: 24, id: step.id || null, source: 22 });
    }
    for (const record of sources.checkpointRecords) {
      const checkpoint = record.state || {}; const chain = checkpoint.identityChain || {};
      if (!validFingerprint(checkpoint.checkpointFingerprint) || checkpointApi?.calculateCheckpointFingerprint && checkpointApi.calculateCheckpointFingerprint(checkpoint) !== checkpoint.checkpointFingerprint) add("fingerprint_mismatch", { stage: 25, id: checkpoint.id || null });
      if (plan && chain.sourcePlanRevision !== plan.revision) add("revision_mismatch", { stage: 25, id: checkpoint.id || null });
      if (plan && chain.sourcePlanFingerprint !== plan.planFingerprint) add("fingerprint_mismatch", { stage: 25, id: checkpoint.id || null, source: 22 });
      const step = sources.stepRecords.find((entry) => entry.state?.id === checkpoint.sourceStepId)?.state;
      if (step && (chain.sourceStepRevision !== step.revision || chain.sourceStepFingerprint !== step.stepFingerprint)) add(chain.sourceStepRevision !== step.revision ? "revision_mismatch" : "fingerprint_mismatch", { stage: 25, source: 24, id: checkpoint.id || null });
    }
    if (progress) {
      if (!validFingerprint(progress.progressFingerprint) || progressApi?.calculateProgressFingerprint && progressApi.calculateProgressFingerprint(progress) !== progress.progressFingerprint) add("fingerprint_mismatch", { stage: 26, id: progress.id || null });
      if (plan && (progress.sourcePlanRevision !== plan.revision || progress.sourcePlanId !== plan.id)) add("revision_mismatch", { stage: 26, source: 22 });
      if (plan && progress.sourcePlanFingerprint !== plan.planFingerprint) add("fingerprint_mismatch", { stage: 26, source: 22 });
      if (session && (progress.sourceSessionRevision !== session.revision || progress.sourceSessionEpoch !== sources.sessionEpoch || progress.sourceSessionId !== session.id)) add("revision_mismatch", { stage: 26, source: 23 });
      if (session && progress.sourceSessionFingerprint !== session.sessionFingerprint) add("fingerprint_mismatch", { stage: 26, source: 23 });
      if (progressApi?.sourceIdentity) {
        const expected = progressApi.sourceIdentity({ ...sources, sessionEpoch: sources.sessionEpoch });
        if (progress.sourceStepsFingerprint !== expected.sourceStepsFingerprint || progress.sourceCheckpointsFingerprint !== expected.sourceCheckpointsFingerprint) add("fingerprint_mismatch", { stage: 26, field: "composition" });
      }
    }
  }

  function deriveSummaries(sources, phases, planActions, checkpointDefinitions, stepsByAction, checkpointsByDefinition) {
    const sessionActions = array(sources.session?.execution?.actions);
    const stepSummaries = planActions.map((definition) => {
      const runtime = sessionActions.find((entry) => entry.actionId === definition.id) || null;
      const step = stepsByAction.get(definition.id)?.state || null;
      return {
        phaseId: definition.phaseId, actionId: definition.id, order: definition.order, title: definition.title || definition.id,
        required: definition.required !== false, actionStatus: runtime?.status || "missing", stepStatus: step?.status || "missing",
        stepId: step?.id || null, stepRevision: integer(step?.revision), stepFingerprint: step?.stepFingerprint || null,
      };
    }).sort(compareStepSummary);
    const phaseSummaries = phases.map((phase) => {
      const actions = stepSummaries.filter((entry) => entry.phaseId === phase.id);
      return { phaseId: phase.id, order: phase.order, title: phase.title || phase.id, actions: actions.length, completedActions: actions.filter((entry) => entry.actionStatus === "completed" && entry.stepStatus === "completed").length };
    }).sort(comparePhase);
    const checkpointSummaries = checkpointDefinitions.map((definition) => {
      const records = checkpointsByDefinition.get(definition.id) || [];
      const record = records.slice().sort((left, right) => numeric(right.state?.revision) - numeric(left.state?.revision) || lexical(text(left.progress_id), text(right.progress_id)))[0] || null;
      const checkpoint = record?.state || null;
      return {
        phaseId: definition.phaseId, actionId: definition.actionId, checkpointId: definition.id, required: definition.required,
        status: checkpoint?.status || "missing", checkpointRecordId: checkpoint?.id || null,
        checkpointRevision: integer(checkpoint?.revision), checkpointFingerprint: checkpoint?.checkpointFingerprint || null,
      };
    }).sort(compareCheckpointSummary);
    const counts = {
      phases: phaseSummaries.length, logicalSteps: stepSummaries.length, actions: sessionActions.length,
      completedActions: sessionActions.filter((entry) => entry.status === "completed").length,
      requiredCheckpoints: checkpointDefinitions.filter((entry) => entry.required).length,
      confirmedCheckpoints: checkpointSummaries.filter((entry) => entry.required && entry.status === "confirmed").length,
    };
    return { counts, phaseSummaries, stepSummaries, checkpointSummaries };
  }

  function buildCompletionSnapshot(sources, result, createdAt = timestampNow()) {
    if (result.blockers.length) throw completionError("completion_blocked", "Completion snapshot нельзя создать при наличии blockers.");
    const identity = sourceIdentity(sources);
    const snapshot = {
      completionId: stableId("execution-completion", { source: identity.sourceIdentityFingerprint, counts: result.counts }),
      schemaVersion: SCHEMA_VERSION, sourceSchemaVersion: SOURCE_SCHEMA_VERSION, createdAt,
      projectIdentity: { projectId: identity.projectId }, calculationIdentity: copy(identity.calculation), importIdentity: copy(identity.importIdentity),
      planIdentity: copy(identity.plan), sessionIdentity: { id: identity.session.id, revision: identity.session.revision, fingerprint: identity.session.fingerprint },
      sessionEpoch: identity.session.epoch, progressIdentity: copy(identity.progress), executionStatus: "completed",
      counts: copy(result.counts), phaseSummaries: copy(result.phaseSummaries), stepSummaries: copy(result.stepSummaries), checkpointSummaries: copy(result.checkpointSummaries),
      warnings: copy(result.warnings), blockers: [],
      sourceRevisions: {
        calculation: identity.calculation.revision, import: identity.importIdentity.revision, plan: identity.plan.revision,
        session: identity.session.revision, steps: identity.steps.map((entry) => ({ id: entry.id, revision: entry.revision })),
        checkpoints: identity.checkpoints.map((entry) => ({ id: entry.id, revision: entry.revision })), progress: identity.progress.revision,
      },
      sourceFingerprints: {
        calculation: identity.calculation.fingerprint, import: identity.importIdentity.fingerprint, plan: identity.plan.fingerprint,
        session: identity.session.fingerprint, steps: identity.steps.map((entry) => ({ id: entry.id, fingerprint: entry.fingerprint })),
        checkpoints: identity.checkpoints.map((entry) => ({ id: entry.id, fingerprint: entry.fingerprint })), progress: identity.progress.fingerprint,
        sourceIdentity: identity.sourceIdentityFingerprint,
      },
      completionFingerprint: null,
    };
    snapshot.completionFingerprint = calculateCompletionFingerprint(snapshot);
    return deepFreeze(snapshot);
  }

  function calculateCompletionFingerprint(snapshot) {
    const payload = copy(snapshot);
    delete payload.completionFingerprint;
    delete payload.completionId;
    delete payload.createdAt;
    return fingerprint(payload);
  }

  function validateCompletionState(state) {
    const errors = [];
    if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || !STATUSES.includes(state.status)) return [diagnostic("completion_structure_invalid")];
    if (!text(state.id) || !text(state.projectId) || !positiveInteger(state.revision) || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) errors.push(diagnostic("completion_metadata_invalid"));
    if (!Array.isArray(state.blockers) || !Array.isArray(state.warnings) || !Array.isArray(state.staleReasons) || !Array.isArray(state.audit) || !Array.isArray(state.operations)) errors.push(diagnostic("completion_structure_invalid"));
    if (state.audit?.length > AUDIT_LIMIT || state.operations?.length > OPERATION_LIMIT) errors.push(diagnostic("completion_log_limit_exceeded"));
    if (state.status === "ready") {
      if (!state.completionSnapshot || state.completionSnapshot.executionStatus !== "completed") errors.push(diagnostic("completion_snapshot_missing"));
      else if (state.completionFingerprint !== state.completionSnapshot.completionFingerprint || calculateCompletionFingerprint(state.completionSnapshot) !== state.completionFingerprint) errors.push(diagnostic("completion_fingerprint_mismatch"));
      if (state.blockers.length) errors.push(diagnostic("ready_with_blockers"));
    }
    if (state.status === "blocked" && !state.blockers.length) errors.push(diagnostic("blocked_without_blockers"));
    if (state.status === "failed" && !state.failure) errors.push(diagnostic("failed_without_reason"));
    if (state.status === "stale" && !state.staleReasons.length) errors.push(diagnostic("stale_without_reason"));
    if (state.status === "verifying" && !state.interruptedOperation) errors.push(diagnostic("verifying_without_operation"));
    return stableDiagnostics(errors);
  }

  function inspectAggregate(aggregate) {
    const sources = normalizeSources(aggregate);
    const record = newestRecord(array(aggregate?.progress).filter((entry) => entry.calculation_id === sources.calculationId && entry.kind === PROGRESS_KIND));
    const state = record?.state || null;
    let persistedErrors = [];
    if (state) {
      try { persistedErrors = validateCompletionState(state); }
      catch { persistedErrors = [diagnostic("completion_structure_invalid")]; }
    }
    const corrupt = persistedErrors.length > 0;
    let staleness = { stale: false, reasons: [] };
    if (state && !corrupt) {
      try { staleness = detectStaleness(state, sources); }
      catch { staleness = { stale: true, reasons: [staleReason("source_identity_corrupt")] }; }
    }
    return {
      project: sources.project, calculation: sources.calculation, completionRecord: record,
      completion: corrupt ? safeCorruptProjection(state) : state, rawCompletion: state, sources, staleness, corrupt, persistedErrors,
      canVerify: Boolean(sources.projectId && (!state || state.status === "waiting")),
      canRetry: Boolean(!corrupt && state && ["blocked", "failed"].includes(state.status) && !staleness.stale),
      canRebuild: Boolean(!corrupt && state && ["blocked", "failed", "stale"].includes(staleness.stale ? "stale" : state.status)),
    };
  }

  async function ensureForProject(repository, projectId, options = {}) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.calculation) throw completionError("calculation_identity_missing", "Активный calculation проекта не найден.");
    if (inspected.completionRecord) return inspected;
    const state = createInitialState(projectId, { calculationId: inspected.calculation.calculation_id, now: options.now });
    await repository.ensurePatternExecutionCompletion(projectId, inspected.calculation.calculation_id, state, { operationKind: "PATTERN_EXECUTION_COMPLETION_CREATED", projectStage: "pattern_execution_completion_waiting" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function verifyForProject(repository, projectId, options = {}) { return persistVerification(repository, projectId, "verify", options); }
  async function retryForProject(repository, projectId, options = {}) { return persistVerification(repository, projectId, "retry", options); }
  async function rebuildForProject(repository, projectId, options = {}) { return persistVerification(repository, projectId, "rebuild", options); }

  async function persistVerification(repository, projectId, mode, options = {}) {
    let inspected = await ensureForProject(repository, projectId, options);
    if (inspected.corrupt) throw completionError("completion_structure_invalid", "Persisted completion повреждён и не будет автоматически исправлен.");
    if (inspected.completion.status === "verifying") return recoverForProject(repository, projectId, options);
    const operationId = options.operationId || `${mode}:${makeId()}`;
    const existing = array(inspected.completion.operations).find((entry) => entry.operationId === operationId);
    if (existing) return inspected;
    if (mode === "verify" && inspected.completion.status !== "waiting") throw completionError("verify_not_allowed", "Verify доступен только из waiting.");
    if (mode === "retry" && !["blocked", "failed"].includes(inspected.completion.status)) throw completionError("retry_not_allowed", "Retry доступен только из blocked или failed.");
    if (mode === "rebuild" && !["blocked", "failed", "stale"].includes(inspected.staleness.stale ? "stale" : inspected.completion.status)) throw completionError("rebuild_not_allowed", "Rebuild недоступен в текущем состоянии.");
    let current = inspected.completion;
    if (inspected.staleness.stale && current.status !== "stale") {
      current = markStale(current, inspected.staleness.reasons, { expectedRevision: current.revision, now: options.now });
      await repository.updatePatternExecutionCompletion(projectId, inspected.calculation.calculation_id, current, { operationKind: "PATTERN_EXECUTION_COMPLETION_STALE", projectStage: "pattern_execution_completion_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (mode === "retry") {
      const actual = sourceIdentity(inspected.sources);
      if (current.expectedSourceIdentityFingerprint !== actual.sourceIdentityFingerprint) {
        const stale = markStaleForRetry(current, actual, { expectedRevision: current.revision, operationId, now: options.now });
        await repository.updatePatternExecutionCompletion(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_EXECUTION_COMPLETION_STALE", projectStage: "pattern_execution_completion_stale" });
        return inspectAggregate(await repository.getProject(projectId));
      }
    }
    const started = beginVerification(current, inspected.sources, { expectedRevision: current.revision, operationId, mode, now: options.now });
    await repository.updatePatternExecutionCompletion(projectId, inspected.calculation.calculation_id, started, { operationKind: `PATTERN_EXECUTION_COMPLETION_${mode.toUpperCase()}_STARTED`, projectStage: "pattern_execution_completion_verifying" });
    inspected = inspectAggregate(await repository.getProject(projectId));
    let completed;
    try { completed = completeVerification(started, inspected.sources, { expectedRevision: started.revision, operationId, now: options.now }); }
    catch (error) { completed = failedFromVerifying(started, error.code || "verification_failed", stableErrorMessage(error), { expectedRevision: started.revision, operationId, now: options.now }); }
    await repository.updatePatternExecutionCompletion(projectId, inspected.calculation.calculation_id, completed, { operationKind: `PATTERN_EXECUTION_COMPLETION_${completed.status.toUpperCase()}`, projectStage: `pattern_execution_completion_${completed.status}` });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function readForProject(repository, projectId, options = {}) {
    let inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.completionRecord || inspected.corrupt) return inspected;
    if (inspected.rawCompletion.status === "verifying") return recoverForProject(repository, projectId, options);
    if (inspected.staleness.stale && inspected.rawCompletion.status !== "stale") {
      const stale = markStale(inspected.rawCompletion, inspected.staleness.reasons, { expectedRevision: inspected.rawCompletion.revision, now: options.now });
      await repository.updatePatternExecutionCompletion(projectId, inspected.calculation.calculation_id, stale, { operationKind: "PATTERN_EXECUTION_COMPLETION_STALE", projectStage: "pattern_execution_completion_stale" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    return inspected;
  }

  async function recoverForProject(repository, projectId, options = {}) {
    const inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.rawCompletion || inspected.rawCompletion.status !== "verifying" || inspected.corrupt) return inspected;
    const recovered = recoverInterruptedCompletion(inspected.rawCompletion, { expectedRevision: options.expectedRevision ?? inspected.rawCompletion.revision, now: options.now });
    await repository.updatePatternExecutionCompletion(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_EXECUTION_COMPLETION_RECOVERED", projectStage: "pattern_execution_completion_failed" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  function finish(state) { return deepFreeze(state); }
  function emptyVerification() { return { valid: false, checkedSourceIdentityFingerprint: null, counts: { phases: 0, logicalSteps: 0, actions: 0, completedActions: 0, requiredCheckpoints: 0, confirmedCheckpoints: 0 } }; }
  function safeCorruptProjection(state) { return deepFreeze({ ...createInitialState(text(state?.projectId) || "corrupt-project", { calculationId: state?.sourceCalculationId || null }), id: text(state?.id) || "corrupt-completion", revision: positiveInteger(state?.revision) || 1, status: "failed", failure: { code: "completion_structure_invalid", message: "Persisted completion повреждён." }, blockers: [blocker("completion_structure_invalid", "Persisted completion повреждён.")] }); }
  function stableErrorMessage(error) { return text(error?.userMessage) || (error instanceof PatternExecutionCompletionError ? text(error.message) : "Verification завершилась контролируемой ошибкой."); }
  function normalizeMode(value, status) { const mode = value || (status === "waiting" ? "verify" : status === "stale" ? "rebuild" : "retry"); if (!["verify", "retry", "rebuild"].includes(mode)) throw completionError("verification_mode_invalid", "Режим verification не поддерживается."); return mode; }
  function blocker(code, message = blockerMessage(code), details = {}) { const semantic = { code, details: copy(details || {}) }; return { id: `completion-blocker:${fingerprint(semantic).slice(8)}`, code, message, details: semantic.details }; }
  function warning(code, message, details = {}) { const semantic = { code, details: copy(details || {}) }; return { id: `completion-warning:${fingerprint(semantic).slice(8)}`, code, message, details: semantic.details }; }
  function staleReason(code, details = {}) { return { code, message: staleMessage(code), details: copy(details || {}) }; }
  function diagnostic(code, details = {}) { return { code, details: copy(details || {}) }; }
  function stableBlockers(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize({ code: entry.code, details: entry.details || {} }), entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(left.id, right.id)); }
  function stableWarnings(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize({ code: entry.code, details: entry.details || {} }), entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(left.id, right.id)); }
  function stableReasons(entries) { const map = new Map(); for (const entry of array(entries)) { const normalized = { code: entry.code || String(entry), message: entry.message || staleMessage(entry.code || String(entry)), details: copy(entry.details || {}) }; map.set(canonicalize({ code: normalized.code, details: normalized.details }), normalized); } return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details))); }
  function stableDiagnostics(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize(entry), entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code)); }
  function stableRecords(records) { return array(records).slice().sort((left, right) => numeric(left.epoch) - numeric(right.epoch) || lexical(text(left.progress_id), text(right.progress_id))); }
  function newestRecord(records) { return stableRecords(records).sort((left, right) => numeric(left.epoch) - numeric(right.epoch) || numeric(left.state?.revision) - numeric(right.state?.revision) || lexical(text(left.progress_id), text(right.progress_id))).at(-1) || null; }
  function stablePhases(phases) { return array(phases).slice().sort(comparePhase); }
  function stableActions(actions) { return array(actions).slice().sort((left, right) => numeric(left.order) - numeric(right.order) || lexical(text(left.id), text(right.id))); }
  function stableCheckpointDefinitions(definitions, phases) { return array(definitions).map((entry) => { const phase = phases.find((candidate) => candidate.id === entry.phaseId); return { ...copy(entry), required: entry.required !== false, actionId: entry.actionId || stableActions(phase?.actions).at(-1)?.id || null }; }).sort((left, right) => numeric(phases.find((phase) => phase.id === left.phaseId)?.order) - numeric(phases.find((phase) => phase.id === right.phaseId)?.order) || lexical(text(left.id), text(right.id))); }
  function comparePhase(left, right) { return numeric(left.order) - numeric(right.order) || lexical(text(left.id || left.phaseId), text(right.id || right.phaseId)); }
  function compareSessionAction(left, right) { return numeric(left.order) - numeric(right.order) || lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.actionId), text(right.actionId)); }
  function compareStepSummary(left, right) { return lexical(text(left.phaseId), text(right.phaseId)) || numeric(left.order) - numeric(right.order) || lexical(text(left.actionId), text(right.actionId)); }
  function compareCheckpointSummary(left, right) { return lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.actionId), text(right.actionId)) || lexical(text(left.checkpointId), text(right.checkpointId)); }
  function compareIdentity(left, right) { return lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.actionId), text(right.actionId)) || lexical(text(left.checkpointId), text(right.checkpointId)) || lexical(text(left.id), text(right.id)) || lexical(text(left.progressId), text(right.progressId)); }
  function checkpointSessionEpoch(state) { return integer(state?.sourceSessionEpoch ?? state?.identityChain?.sourceSessionEpoch); }
  function valueAt(value, path) { return path.split(".").reduce((current, key) => current?.[key], value); }
  function appendAudit(state, event, at, details = {}) { state.audit = [...array(state.audit), { event, at, revision: state.revision, ...copy(details) }].slice(-AUDIT_LIMIT); }
  function recordOperation(state, operationId, type, result) { state.operations = [...array(state.operations), { operationId, type, result, revision: state.revision, at: state.updatedAt }].slice(-OPERATION_LIMIT); }
  function updateOperation(state, operationId, type, result) { const entry = array(state.operations).find((item) => item.operationId === operationId && item.type === type); if (entry) { entry.result = result; entry.revision = state.revision; entry.at = state.updatedAt; } else recordOperation(state, operationId, type, result); }
  function prepareRevision(state, now) { state.revision += 1; state.updatedAt = now; }
  function checkRevision(state, expectedRevision) { if (!positiveInteger(expectedRevision) || expectedRevision !== state.revision) throw completionError("completion_revision_conflict", "Completion изменён в другой операции.", { expectedRevision, actualRevision: state.revision }); }
  function requireCompletion(state) { const errors = validateCompletionState(state); if (errors.length) throw completionError("completion_structure_invalid", "Запись completion повреждена.", { errors }); }
  function requireOperationId(value) { const result = text(value); if (!result) throw completionError("operation_id_required", "Для verification требуется operationId."); return result; }
  function throwInvalidTransition(from, to) { throw completionError("invalid_status_transition", `Переход ${from || "unknown"} → ${to} недопустим.`); }
  function completionError(code, message, details = {}) { return new PatternExecutionCompletionError(code, message, details); }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)); }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function positiveInteger(value) { const number = integer(value); return number !== null && number > 0 ? number : null; }
  function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function copyFrozen(value) { return deepFreeze(copy(value)); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function timestampNow() { return new Date().toISOString(); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function stableStrings(values) { return [...new Set(array(values).filter((entry) => typeof entry === "string" && entry.length))].sort(lexical); }
  function stableId(prefix, value) { return `${prefix}:${fingerprint(value).slice(8)}`; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || stableId("execution-completion-record", { at: timestampNow() }); }
  function blockerMessage(code) { return ({ stage_22_missing: "Stage 22 не найден.", stage_23_missing: "Stage 23 не найден.", stage_26_missing: "Stage 26 не найден.", stage_22_invalid: "Stage 22 не ready, stale или повреждён.", stage_23_invalid: "Stage 23 не относится к завершённой актуальной session.", stage_26_not_ready: "Stage 26 не находится в ready.", stage_26_has_blockers: "Stage 26 содержит blockers.", stage_26_next_action_pending: "Stage 26 требует дальнейшего execution action.", required_step_missing: "Обязательный Stage 24 step отсутствует.", action_not_completed: "Обязательный action или step не завершён.", required_checkpoint_missing: "Обязательный checkpoint отсутствует или не confirmed.", checkpoint_old_epoch: "Checkpoint относится к старому session epoch.", checkpoint_unknown_action: "Checkpoint ссылается на неизвестный action.", duplicate_action: "Обнаружен дублирующийся action identity.", duplicate_checkpoint: "Обнаружен дублирующийся checkpoint identity.", fingerprint_mismatch: "Fingerprint source identity несовместим.", revision_mismatch: "Revision source identity несовместима.", execution_plan_empty: "Execution plan пуст или вырожден.", source_identity_corrupt: "Source identity повреждена.", incompatible_action_identity: "Stage 24 action identity несовместима.", incompatible_checkpoint_identity: "Stage 25 checkpoint identity несовместима.", progress_not_complete: "Stage 26 не отражает завершённый непустой plan." })[code] || "Completion verification не пройдена."; }
  function staleMessage(code) { return ({ project_identity_changed: "Изменилась project identity.", calculation_identity_changed: "Изменилась calculation identity.", import_identity_changed: "Изменилась import identity или revision.", plan_identity_changed: "Изменилась Stage 22 identity.", plan_revision_changed: "Изменилась Stage 22 revision.", plan_fingerprint_changed: "Изменился Stage 22 fingerprint.", session_identity_changed: "Изменилась Stage 23 identity.", session_revision_changed: "Изменилась Stage 23 revision.", session_epoch_changed: "Изменился Stage 23 session epoch.", session_fingerprint_changed: "Изменился Stage 23 fingerprint.", steps_composition_changed: "Изменился состав, revision или fingerprint Stage 24.", checkpoints_composition_changed: "Изменился состав, revision или fingerprint Stage 25.", progress_revision_changed: "Изменилась Stage 26 revision.", progress_fingerprint_changed: "Изменился Stage 26 fingerprint.", source_schema_version_changed: "Изменилась completion source schema version.", retry_source_identity_changed: "Retry не может принять изменившуюся source identity.", source_identity_corrupt: "Актуальная source identity недоказуема.", import_identity_unproven: "После импорта source identity должна быть доказана явным rebuild." })[code] || "Source identity изменилась."; }

  const api = {
    VERSION, SCHEMA_VERSION, SOURCE_SCHEMA_VERSION, PROGRESS_KIND, STATUSES, TRANSITIONS, AUDIT_LIMIT, OPERATION_LIMIT,
    PatternExecutionCompletionError, canonicalize, fingerprint, createInitialState, beginVerification, completeVerification,
    verifyCompletion, retryCompletion, rebuildCompletion, recoverInterruptedCompletion, failedFromVerifying,
    detectStaleness, markStale, normalizeSources, sourceIdentity, verifySources, buildCompletionSnapshot,
    calculateCompletionFingerprint, validateCompletionState, inspectAggregate, ensureForProject, verifyForProject,
    retryForProject, rebuildForProject, readForProject, recoverForProject,
  };
  globalObject.YarnAIPatternExecutionCompletion = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
