"use strict";

(function exposePatternExecutionProgress(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "PATTERN_EXECUTION_PROGRESS";
  const STATUSES = Object.freeze(["waiting", "building", "ready", "blocked", "stale", "failed"]);
  const STEP_COUNT_KEYS = Object.freeze(["waiting", "ready", "active", "paused", "blocked", "completed", "stale", "failed", "skipped"]);
  const CHECKPOINT_COUNT_KEYS = Object.freeze(["pending", "reviewing", "passed", "failed"]);
  const AUDIT_LIMIT = 32;
  const OPERATION_LIMIT = 96;
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["building", "stale", "failed"]),
    building: Object.freeze(["ready", "blocked", "failed"]),
    ready: Object.freeze(["building", "stale", "failed"]),
    blocked: Object.freeze(["building", "stale", "failed"]),
    stale: Object.freeze(["building", "failed"]),
    failed: Object.freeze(["building", "stale"]),
  });

  class PatternExecutionProgressError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionProgressError";
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
    if (typeof value === "number" && !Number.isFinite(value)) throw progressError("non_finite_value", "Progress содержит недопустимое числовое значение.");
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
    if (!text(projectId)) throw progressError("project_identity_missing", "Project context не задан.");
    const now = options.now || timestampNow();
    const state = {
      id: options.id || makeId(), projectId, kind: PROGRESS_KIND, schemaVersion: SCHEMA_VERSION, version: VERSION,
      status: "waiting", createdAt: now, updatedAt: now, revision: 1,
      sourcePlanId: null, sourcePlanRevision: null, sourcePlanFingerprint: null,
      sourceSessionId: null, sourceSessionRevision: null, sourceSessionEpoch: null, sourceSessionFingerprint: null,
      sourceImportRevision: null, sourceCalculationId: options.calculationId || null,
      sourceIdentityFingerprint: null, sourceStepsFingerprint: null, sourceCheckpointsFingerprint: null,
      counts: emptyCounts(), currentStep: null, nextAction: null, blockers: [], staleReasons: [],
      immutableSnapshot: null, immutableSnapshotFingerprint: null, progressFingerprint: null,
      validation: emptyValidation(), interruptedOperation: null, failure: null, audit: [], operations: [],
    };
    appendAudit(state, "created", now);
    return finish(state);
  }

  function beginBuild(state, options = {}) {
    requireProgress(state);
    const mode = normalizeMode(options.mode, state.status);
    const operationId = requireOperationId(options.operationId);
    const duplicate = beginOperation(state, operationId, mode, options.expectedRevision);
    if (duplicate) return copyFrozen(state);
    if (!TRANSITIONS[state.status].includes("building")) throwInvalidTransition(state.status, "building");
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "building";
    next.blockers = [];
    next.staleReasons = [];
    next.failure = null;
    next.validation = emptyValidation();
    next.interruptedOperation = { operationId, mode, startedAt: now, baseRevision: state.revision };
    appendAudit(next, `${mode}_started`, now, { operationId });
    recordOperation(next, operationId, mode, "started");
    return finish(next);
  }

  function completeBuild(state, sources, options = {}) {
    requireProgress(state);
    if (state.status !== "building" || !state.interruptedOperation) throwInvalidTransition(state.status, "ready");
    checkRevision(state, options.expectedRevision);
    const operationId = options.operationId || state.interruptedOperation.operationId;
    if (operationId !== state.interruptedOperation.operationId) throw progressError("operation_id_conflict", "Завершается другая операция построения.");
    const now = options.now || timestampNow();
    const normalized = normalizeSources(sources, state.projectId);
    const aggregation = aggregateSources(normalized);
    const next = mutable(state);
    prepareRevision(next, now);
    applySourceIdentity(next, normalized, aggregation);
    next.counts = copy(aggregation.counts);
    next.currentStep = copy(aggregation.currentStep);
    next.nextAction = copy(aggregation.nextAction);
    next.blockers = copy(aggregation.blockers);
    next.staleReasons = [];
    next.failure = aggregation.failure;
    next.status = aggregation.status;
    next.interruptedOperation = null;
    next.validation = copy(aggregation.validation);
    next.immutableSnapshot = buildImmutableSnapshot(normalized, aggregation);
    next.immutableSnapshotFingerprint = calculateSnapshotFingerprint(next.immutableSnapshot);
    const mode = state.interruptedOperation.mode;
    appendAudit(next, `${mode}_${next.status}`, now, { operationId, sourceIdentityFingerprint: next.sourceIdentityFingerprint });
    updateOperation(next, operationId, mode, next.status);
    return finish(next);
  }

  function buildProgress(state, sources, options = {}) {
    const started = beginBuild(state, { ...options, mode: options.mode || "build" });
    return completeBuild(started, sources, { ...options, expectedRevision: started.revision, operationId: started.interruptedOperation.operationId });
  }

  function rebuildProgress(state, sources, options = {}) {
    return buildProgress(state, sources, { ...options, mode: "rebuild" });
  }

  function retryProgress(state, sources, options = {}) {
    if (state?.status !== "failed") throwInvalidTransition(state?.status, "building");
    return buildProgress(state, sources, { ...options, mode: "retry" });
  }

  function recoverInterruptedProgress(state, options = {}) {
    requireProgress(state);
    if (state.status !== "building") return copyFrozen(state);
    checkRevision(state, options.expectedRevision);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "failed";
    next.failure = { code: "interrupted_build", message: "Незавершённое построение безопасно остановлено. Доступен явный retry." };
    next.blockers = [blocker("interrupted_build", next.failure.message)];
    next.nextAction = action("retry_progress", "Повторить построение progress", true);
    const interrupted = next.interruptedOperation;
    next.interruptedOperation = null;
    next.validation = { ...emptyValidation(), structural: [], semantic: [], source: [diagnostic("interrupted_build")], errors: [diagnostic("interrupted_build")], valid: false };
    appendAudit(next, "interrupted_build_recovered", now, { operationId: interrupted?.operationId || null });
    if (interrupted?.operationId) updateOperation(next, interrupted.operationId, interrupted.mode, "interrupted");
    return finish(next);
  }

  function detectStaleness(state, sources) {
    requireProgress(state);
    if (!state.immutableSnapshot || ["waiting", "building"].includes(state.status)) return { stale: false, reasons: [] };
    let normalized;
    try { normalized = normalizeSources(sources, state.projectId); }
    catch (error) { return { stale: true, reasons: [staleReason(error.code || "source_structure_changed")] }; }
    const identity = sourceIdentity(normalized);
    const reasons = [];
    const compare = (field, actual, code) => { if ((state[field] ?? null) !== (actual ?? null)) reasons.push(staleReason(code, { expected: state[field] ?? null, actual: actual ?? null })); };
    compare("sourcePlanId", identity.sourcePlanId, "source_plan_identity_changed");
    compare("sourcePlanRevision", identity.sourcePlanRevision, "source_plan_revision_changed");
    compare("sourcePlanFingerprint", identity.sourcePlanFingerprint, "source_plan_fingerprint_changed");
    compare("sourceSessionId", identity.sourceSessionId, "source_session_identity_changed");
    compare("sourceSessionRevision", identity.sourceSessionRevision, "source_session_revision_changed");
    compare("sourceSessionEpoch", identity.sourceSessionEpoch, "source_session_epoch_changed");
    compare("sourceSessionFingerprint", identity.sourceSessionFingerprint, "source_session_fingerprint_changed");
    compare("sourceImportRevision", identity.sourceImportRevision, "source_import_identity_changed");
    compare("sourceCalculationId", identity.sourceCalculationId, "source_calculation_identity_changed");
    compare("sourceStepsFingerprint", identity.sourceStepsFingerprint, "source_steps_changed");
    compare("sourceCheckpointsFingerprint", identity.sourceCheckpointsFingerprint, "source_checkpoints_changed");
    compare("sourceIdentityFingerprint", identity.sourceIdentityFingerprint, "source_identity_changed");
    return { stale: reasons.length > 0, reasons: stableReasons(reasons) };
  }

  function markStale(state, sourcesOrReasons, options = {}) {
    requireProgress(state);
    if (state.status === "stale") return copyFrozen(state);
    checkRevision(state, options.expectedRevision);
    const detected = Array.isArray(sourcesOrReasons) ? { stale: sourcesOrReasons.length > 0, reasons: sourcesOrReasons } : detectStaleness(state, sourcesOrReasons);
    if (!detected.stale) return copyFrozen(state);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "stale";
    next.staleReasons = stableReasons(detected.reasons);
    next.blockers = next.staleReasons.map((entry) => blocker(entry.code, staleMessage(entry.code), entry.details));
    next.nextAction = action("rebuild_progress", "Перестроить агрегированный progress", true);
    next.failure = null;
    next.validation = { ...next.validation, valid: false, stale: true, source: next.staleReasons.map((entry) => diagnostic(entry.code, entry.details)), errors: next.staleReasons.map((entry) => diagnostic(entry.code, entry.details)) };
    appendAudit(next, "stale_detected", now, { reasonCodes: next.staleReasons.map((entry) => entry.code) });
    return finish(next);
  }

  function markFailed(state, code, options = {}) {
    requireProgress(state);
    checkRevision(state, options.expectedRevision);
    const now = options.now || timestampNow();
    const next = mutable(state);
    prepareRevision(next, now);
    next.status = "failed";
    next.failure = { code: text(code) || "build_failed", message: options.message || "Построение progress завершилось ошибкой." };
    next.blockers = [blocker(next.failure.code, next.failure.message, options.details)];
    next.nextAction = action("retry_progress", "Повторить построение progress", true);
    next.interruptedOperation = null;
    next.validation = { ...emptyValidation(), structural: [diagnostic(next.failure.code, options.details)], errors: [diagnostic(next.failure.code, options.details)], valid: false };
    appendAudit(next, "failed", now, { code: next.failure.code });
    return finish(next);
  }

  function normalizeSources(input, projectId = input?.project?.project_id || input?.project?.projectId) {
    const aggregate = input?.progress ? input : null;
    const project = aggregate?.project || input?.project || null;
    const calculation = aggregate ? array(aggregate.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null : input?.calculation || null;
    const calculationId = calculation?.calculation_id || input?.calculationId || null;
    const records = aggregate ? array(aggregate.progress).filter((entry) => entry.calculation_id === calculationId) : array(input?.records);
    const recordsOf = (kind) => records.filter((entry) => entry.kind === kind);
    let planRecord = input?.planRecord || null;
    let sessionRecord = input?.sessionRecord || null;
    if (!sessionRecord) sessionRecord = newestRecord(recordsOf("PATTERN_EXECUTION_SESSION"));
    const session = input?.session || sessionRecord?.state || null;
    if (!planRecord) {
      const candidates = recordsOf("PATTERN_EXECUTION_PLAN");
      planRecord = candidates.find((entry) => entry.state?.id === session?.sourceExecutionPlanId) || newestRecord(candidates);
    }
    const plan = input?.plan || planRecord?.state || null;
    const sourceSessionId = session?.id || null;
    const stepRecords = (input?.stepRecords || recordsOf("PATTERN_EXECUTION_STEP")).filter((entry) => !sourceSessionId || entry.state?.sourceSessionId === sourceSessionId);
    const checkpointRecords = (input?.checkpointRecords || recordsOf("PATTERN_EXECUTION_CHECKPOINT")).filter((entry) => !sourceSessionId || entry.state?.sourceSessionId === sourceSessionId);
    const normalized = {
      project, projectId: projectId || project?.project_id || project?.projectId || plan?.projectId || session?.projectId || null,
      calculation, calculationId, planRecord, plan, sessionRecord, session,
      sessionEpoch: integer(input?.sessionEpoch ?? sessionRecord?.epoch), stepRecords: stableRecords(stepRecords), checkpointRecords: stableRecords(checkpointRecords),
    };
    return normalized;
  }

  function aggregateSources(sources) {
    const structural = validateSourceStructural(sources);
    if (structural.length) return failedAggregation(structural);
    const semantic = validateSourceSemantic(sources);
    const identity = validateSourceIdentity(sources);
    const model = deriveModel(sources);
    const errors = stableDiagnostics([...structural, ...semantic, ...identity, ...model.diagnostics]);
    const blockers = stableBlockers([...errors.map((entry) => blocker(entry.code, diagnosticMessage(entry.code), entry.details)), ...model.blockers]);
    const status = errors.length || blockers.length ? "blocked" : "ready";
    const nextAction = chooseNextAction(sources, model, blockers);
    return {
      status, counts: model.counts, currentStep: model.currentStep, nextAction,
      blockers, failure: null,
      validation: { valid: status === "ready", stale: false, structural, semantic: stableDiagnostics([...semantic, ...model.diagnostics]), source: identity, errors },
      logicalSteps: model.logicalSteps, logicalCheckpoints: model.logicalCheckpoints,
    };
  }

  function validateSourceStructural(sources) {
    const errors = [];
    const plan = sources.plan; const session = sources.session;
    if (!sources.projectId) errors.push(diagnostic("project_identity_missing"));
    if (!sources.calculationId) errors.push(diagnostic("calculation_identity_missing"));
    if (!plan) errors.push(diagnostic("source_plan_missing"));
    else if (plan.kind !== "PATTERN_EXECUTION_PLAN" || !positiveInteger(plan.revision) || !object(plan.plan) || !Array.isArray(plan.plan.phases) || !Array.isArray(plan.plan.checkpoints)) errors.push(diagnostic("source_plan_invalid"));
    if (!session) errors.push(diagnostic("source_session_missing"));
    else if (session.kind !== "PATTERN_EXECUTION_SESSION" || !positiveInteger(session.revision) || !Array.isArray(session.execution?.actions) || !object(session.currentPosition)) errors.push(diagnostic("source_session_invalid"));
    const checkRecords = (records, kind, code) => {
      const recordIds = new Set(); const stateIds = new Set();
      for (const record of records) {
        if (!record || record.kind !== kind || !object(record.state) || !positiveInteger(record.epoch) || !text(record.progress_id)) errors.push(diagnostic(code));
        else {
          if (recordIds.has(record.progress_id) || stateIds.has(record.state.id)) errors.push(diagnostic("duplicate_record_identity", { kind, id: record.state.id }));
          recordIds.add(record.progress_id); stateIds.add(record.state.id);
        }
      }
    };
    checkRecords(sources.stepRecords, "PATTERN_EXECUTION_STEP", "source_step_invalid");
    checkRecords(sources.checkpointRecords, "PATTERN_EXECUTION_CHECKPOINT", "source_checkpoint_invalid");
    return stableDiagnostics(errors);
  }

  function validateSourceSemantic(sources) {
    const errors = [];
    if (!sources.plan || !sources.session) return errors;
    const phases = array(sources.plan.plan?.phases);
    const planActions = phases.flatMap((phase) => array(phase.actions).map((entry) => ({ ...entry, phaseId: phase.id })));
    const unique = (values, code) => { const seen = new Set(); for (const value of values) { if (!text(value) || seen.has(value)) errors.push(diagnostic(code, { id: value || null })); seen.add(value); } };
    unique(phases.map((entry) => entry.id), "duplicate_phase_reference");
    unique(planActions.map((entry) => entry.id), "duplicate_action_reference");
    unique(array(sources.plan.plan?.checkpoints).map((entry) => entry.id), "duplicate_checkpoint_reference");
    unique(array(sources.session.execution?.actions).map((entry) => entry.actionId), "duplicate_session_action_reference");
    const planActionIds = new Set(planActions.map((entry) => entry.id));
    const sessionActionIds = new Set(array(sources.session.execution?.actions).map((entry) => entry.actionId));
    if (planActionIds.size !== sessionActionIds.size || [...planActionIds].some((id) => !sessionActionIds.has(id))) errors.push(diagnostic("plan_session_composition_mismatch"));
    const stepLinkKeys = new Set();
    for (const record of sources.stepRecords) {
      const step = record.state;
      const key = `${step.sourceSessionId || ""}|${step.actionId || ""}`;
      if (stepLinkKeys.has(key)) errors.push(diagnostic("duplicate_step_reference", { actionId: step.actionId || null }));
      stepLinkKeys.add(key);
      if (step.projectId !== sources.projectId || step.sourceSessionId !== sources.session.id || step.sourcePlanId !== sources.plan.id || !sessionActionIds.has(step.actionId)) errors.push(diagnostic("incompatible_step_identity", { stepId: step.id || null }));
    }
    const checkpointLinkKeys = new Set();
    const planCheckpointIds = new Set(array(sources.plan.plan?.checkpoints).map((entry) => entry.id));
    for (const record of sources.checkpointRecords) {
      const checkpoint = record.state;
      const key = `${checkpoint.sourceSessionId || ""}|${checkpoint.actionId || ""}|${checkpoint.checkpointId || ""}`;
      if (checkpointLinkKeys.has(key) && checkpoint.status !== "stale") errors.push(diagnostic("duplicate_checkpoint_reference", { checkpointId: checkpoint.checkpointId || null }));
      checkpointLinkKeys.add(key);
      if (checkpoint.projectId !== sources.projectId || checkpoint.sourceSessionId !== sources.session.id || checkpoint.sourcePlanId !== sources.plan.id || !sessionActionIds.has(checkpoint.actionId) || !planCheckpointIds.has(checkpoint.checkpointId)) errors.push(diagnostic("incompatible_checkpoint_identity", { checkpointId: checkpoint.id || null }));
    }
    return stableDiagnostics(errors);
  }

  function validateSourceIdentity(sources) {
    const errors = [];
    const plan = sources.plan; const session = sources.session;
    if (!plan || !session) return errors;
    if (plan.projectId !== sources.projectId || session.projectId !== sources.projectId) errors.push(diagnostic("project_identity_mismatch"));
    if (plan.status !== "ready") errors.push(diagnostic("source_plan_not_ready", { status: plan.status }));
    if (!["waiting", "starting", "active", "paused", "blocked", "completed"].includes(session.status)) errors.push(diagnostic("source_session_not_usable", { status: session.status }));
    if (session.sourceExecutionPlanId !== plan.id || session.sourceExecutionPlanRevision !== plan.revision || session.sourceExecutionPlanFingerprint !== plan.planFingerprint) errors.push(diagnostic("source_revision_mismatch"));
    if (session.sourceImportRevision !== plan.sourceImportRevision) errors.push(diagnostic("source_import_identity_mismatch"));
    const planApi = globalObject.YarnAIPatternExecutionPlan;
    const sessionApi = globalObject.YarnAIPatternExecutionSession;
    if (!validFingerprint(plan.planFingerprint) || planApi?.calculatePlanFingerprint && planApi.calculatePlanFingerprint(plan) !== plan.planFingerprint) errors.push(diagnostic("source_plan_fingerprint_mismatch"));
    if (!validFingerprint(session.sessionFingerprint) || sessionApi?.calculateSessionFingerprint && sessionApi.calculateSessionFingerprint(session) !== session.sessionFingerprint) errors.push(diagnostic("source_session_fingerprint_mismatch"));
    for (const record of sources.stepRecords) {
      const step = record.state; const stepApi = globalObject.YarnAIPatternExecutionStep;
      if (!validFingerprint(step.stepFingerprint) || stepApi?.calculateStepFingerprint && stepApi.calculateStepFingerprint(step) !== step.stepFingerprint) errors.push(diagnostic("source_step_fingerprint_mismatch", { stepId: step.id || null }));
      if (step.sourcePlanRevision !== plan.revision || step.sourcePlanFingerprint !== plan.planFingerprint || step.sourceImportRevision !== plan.sourceImportRevision) errors.push(diagnostic("source_step_revision_mismatch", { stepId: step.id || null }));
    }
    for (const record of sources.checkpointRecords) {
      const checkpoint = record.state; const checkpointApi = globalObject.YarnAIPatternExecutionCheckpoint;
      if (!validFingerprint(checkpoint.checkpointFingerprint) || checkpointApi?.calculateCheckpointFingerprint && checkpointApi.calculateCheckpointFingerprint(checkpoint) !== checkpoint.checkpointFingerprint) errors.push(diagnostic("source_checkpoint_fingerprint_mismatch", { checkpointId: checkpoint.id || null }));
      if (checkpoint.identityChain?.sourcePlanRevision !== plan.revision || checkpoint.identityChain?.sourcePlanFingerprint !== plan.planFingerprint) errors.push(diagnostic("source_checkpoint_revision_mismatch", { checkpointId: checkpoint.id || null }));
    }
    return stableDiagnostics(errors);
  }

  function deriveModel(sources) {
    const session = sources.session || {};
    const plan = sources.plan || {};
    const planPhases = array(plan.plan?.phases).slice().sort(comparePhase);
    const actionDefinitions = new Map(planPhases.flatMap((phase) => array(phase.actions).map((entry) => [entry.id, { ...copy(entry), phaseId: phase.id, phaseTitle: phase.title, phaseOrder: phase.order }])));
    const currentActionId = session.currentPosition?.actionId || null;
    const currentStepRecord = newestRecord(sources.stepRecords.filter((entry) => entry.state?.actionId === currentActionId));
    const logicalSteps = array(session.execution?.actions).slice().sort(compareSessionAction).map((entry, index) => {
      const definition = actionDefinitions.get(entry.actionId) || {};
      const stepRecord = newestRecord(sources.stepRecords.filter((candidate) => candidate.state?.actionId === entry.actionId));
      return {
        actionId: entry.actionId, phaseId: entry.phaseId || definition.phaseId || null, componentId: entry.componentId ?? null,
        title: definition.title || entry.title || entry.actionId, order: index + 1, required: entry.required !== false,
        status: logicalStepStatus(entry, stepRecord?.state, session, currentActionId), sourceStepId: stepRecord?.state?.id || null,
        sourceStepRevision: stepRecord?.state?.revision || null, sourceStepEpoch: stepRecord?.epoch || null,
      };
    });
    const diagnostics = [];
    const logicalCheckpoints = array(plan.plan?.checkpoints).slice().sort(compareCheckpoint).map((definition) => {
      const candidates = sources.checkpointRecords.filter((entry) => entry.state?.checkpointId === definition.id);
      const record = newestRecord(candidates);
      const actionId = record?.state?.actionId || actionForCheckpoint(definition, planPhases);
      const status = logicalCheckpointStatus(record?.state);
      const actionState = logicalSteps.find((entry) => entry.actionId === actionId);
      if (definition.required && actionState?.status === "completed" && status !== "passed") diagnostics.push(diagnostic("required_checkpoint_missing_or_unpassed", { checkpointId: definition.id, actionId }));
      return { checkpointId: definition.id, phaseId: definition.phaseId || null, actionId, required: definition.required !== false, status, sourceCheckpointId: record?.state?.id || null, sourceCheckpointRevision: record?.state?.revision || null, sourceCheckpointEpoch: record?.epoch || null };
    });
    const counts = emptyCounts();
    counts.phases.total = planPhases.length;
    counts.steps.total = logicalSteps.length;
    for (const entry of logicalSteps) counts.steps[entry.status] += 1;
    counts.steps.resolved = counts.steps.completed + counts.steps.skipped;
    counts.steps.progressPercent = counts.steps.total ? Math.floor((counts.steps.resolved * 100) / counts.steps.total) : 0;
    counts.checkpoints.total = logicalCheckpoints.length;
    for (const entry of logicalCheckpoints) counts.checkpoints[entry.status] += 1;
    const currentStep = chooseCurrentStep(logicalSteps, currentActionId);
    const blockers = [];
    if (session.status === "blocked") blockers.push(blocker("session_blocked", "Сессия выполнения заблокирована."));
    if (currentStep?.status === "blocked") blockers.push(blocker("current_step_blocked", "Текущий шаг заблокирован.", { actionId: currentStep.actionId }));
    if (currentStep?.status === "stale") blockers.push(blocker("current_step_stale", "Текущий шаг устарел.", { actionId: currentStep.actionId }));
    if (currentStep?.status === "failed") blockers.push(blocker("current_step_failed", "Текущий шаг завершился ошибкой.", { actionId: currentStep.actionId }));
    const currentCheckpoint = logicalCheckpoints.find((entry) => entry.actionId === currentStep?.actionId && ["failed"].includes(entry.status));
    if (currentCheckpoint) blockers.push(blocker("current_checkpoint_failed", "Текущая обязательная проверка не пройдена.", { checkpointId: currentCheckpoint.checkpointId }));
    return { counts, currentStep, logicalSteps, logicalCheckpoints, blockers: stableBlockers(blockers), diagnostics: stableDiagnostics(diagnostics) };
  }

  function chooseCurrentStep(steps, currentActionId) {
    const explicit = steps.find((entry) => entry.actionId === currentActionId && !["completed", "skipped"].includes(entry.status));
    if (explicit) return copy(explicit);
    const active = steps.find((entry) => ["active", "paused"].includes(entry.status));
    if (active) return copy(active);
    const outstanding = steps.find((entry) => !["completed", "skipped"].includes(entry.status));
    return outstanding ? copy(outstanding) : null;
  }

  function chooseNextAction(sources, model, blockers) {
    if (blockers.length) return action("resolve_blockers", "Устранить блокирующие причины", false, { blockerCodes: blockers.map((entry) => entry.code) });
    const session = sources.session;
    if (!session) return action("create_session", "Создать сессию выполнения", false);
    if (["waiting", "starting"].includes(session.status)) return action("start_session", "Запустить сессию выполнения", true, { sessionId: session.id });
    if (session.status === "paused") return action("resume_session", "Возобновить сессию выполнения", true, { sessionId: session.id });
    if (session.status === "completed" && !model.currentStep) return null;
    const current = model.currentStep;
    if (!current) return null;
    const checkpoint = model.logicalCheckpoints.find((entry) => entry.actionId === current.actionId && entry.sourceCheckpointId && entry.status !== "passed");
    if (checkpoint) {
      const source = sources.checkpointRecords.find((entry) => entry.state?.id === checkpoint.sourceCheckpointId)?.state;
      if (["waiting", "ready"].includes(source?.status)) return action("review_checkpoint", "Проверить текущий checkpoint", true, { checkpointId: checkpoint.checkpointId, checkpointRecordId: checkpoint.sourceCheckpointId });
      if (source?.status === "deferred") return action("resume_checkpoint", "Вернуться к проверке checkpoint", true, { checkpointId: checkpoint.checkpointId, checkpointRecordId: checkpoint.sourceCheckpointId });
      if (["reviewing", "sync_pending"].includes(source?.status)) return action("continue_checkpoint", "Продолжить проверку checkpoint", true, { checkpointId: checkpoint.checkpointId, checkpointRecordId: checkpoint.sourceCheckpointId });
    }
    const record = sources.stepRecords.find((entry) => entry.state?.id === current.sourceStepId);
    if (!record || record.state.actionId !== current.actionId || record.state.status === "completed") return action("create_step", "Создать запись текущего шага", true, { actionId: current.actionId });
    if (["waiting", "ready"].includes(record.state.status)) return action("start_step", "Начать текущий шаг", true, { actionId: current.actionId, stepId: record.state.id });
    if (["active", "checking"].includes(record.state.status)) return action("continue_step", "Продолжить текущий шаг", true, { actionId: current.actionId, stepId: record.state.id });
    if (record.state.status === "paused") return action("resume_step", "Возобновить текущий шаг", true, { actionId: current.actionId, stepId: record.state.id });
    return action("resolve_step", "Восстановить текущий шаг", false, { actionId: current.actionId, stepId: record.state.id });
  }

  function buildImmutableSnapshot(sources, aggregation) {
    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      sourceIdentity: sourceIdentity(sources),
      counts: copy(aggregation.counts), currentStep: copy(aggregation.currentStep), nextAction: copy(aggregation.nextAction),
      blockers: copy(aggregation.blockers), logicalSteps: copy(aggregation.logicalSteps), logicalCheckpoints: copy(aggregation.logicalCheckpoints),
    });
  }

  function validateStructural(state) {
    const errors = [];
    if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || !STATUSES.includes(state.status)) return [diagnostic("progress_structure_invalid")];
    if (!text(state.id) || !text(state.projectId) || !positiveInteger(state.revision) || !isTimestamp(state.createdAt) || !isTimestamp(state.updatedAt)) errors.push(diagnostic("progress_metadata_invalid"));
    if (!object(state.counts) || !object(state.counts.steps) || !object(state.counts.checkpoints) || !object(state.validation) || !Array.isArray(state.blockers) || !Array.isArray(state.staleReasons) || !Array.isArray(state.audit) || !Array.isArray(state.operations)) errors.push(diagnostic("progress_structure_invalid"));
    if (state.audit?.length > AUDIT_LIMIT || state.operations?.length > OPERATION_LIMIT) errors.push(diagnostic("progress_log_limit_exceeded"));
    if (state.immutableSnapshot) {
      if (!validFingerprint(state.immutableSnapshotFingerprint) || calculateSnapshotFingerprint(state.immutableSnapshot) !== state.immutableSnapshotFingerprint) errors.push(diagnostic("immutable_snapshot_changed"));
    } else if (!["waiting", "building", "failed"].includes(state.status)) errors.push(diagnostic("immutable_snapshot_missing"));
    if (!validFingerprint(state.progressFingerprint) || calculateProgressFingerprint(state) !== state.progressFingerprint) errors.push(diagnostic("progress_fingerprint_mismatch"));
    return stableDiagnostics(errors);
  }

  function validateSemantic(state) {
    const errors = [];
    if (!object(state?.counts)) return [diagnostic("progress_counts_invalid")];
    const steps = state.counts.steps || {};
    const stepSum = STEP_COUNT_KEYS.reduce((sum, key) => sum + (nonNegativeInteger(steps[key]) ?? -100000), 0);
    if (stepSum !== steps.total || steps.resolved !== steps.completed + steps.skipped) errors.push(diagnostic("progress_step_counts_invalid"));
    const checkpoints = state.counts.checkpoints || {};
    const checkpointSum = CHECKPOINT_COUNT_KEYS.reduce((sum, key) => sum + (nonNegativeInteger(checkpoints[key]) ?? -100000), 0);
    if (checkpointSum !== checkpoints.total) errors.push(diagnostic("progress_checkpoint_counts_invalid"));
    if (state.status === "ready" && state.blockers.length) errors.push(diagnostic("ready_with_blockers"));
    if (state.status === "ready" && state.validation?.valid !== true) errors.push(diagnostic("ready_without_valid_validation"));
    if (state.status === "blocked" && !state.blockers.length) errors.push(diagnostic("blocked_without_reason"));
    if (state.status === "stale" && !state.staleReasons.length) errors.push(diagnostic("stale_without_reason"));
    if (state.immutableSnapshot && ["ready", "blocked"].includes(state.status)) {
      for (const key of ["counts", "currentStep", "nextAction", "blockers"]) if (canonicalize(state[key]) !== canonicalize(state.immutableSnapshot[key])) errors.push(diagnostic("snapshot_result_mismatch", { field: key }));
    }
    return stableDiagnostics(errors);
  }

  function validateSource(state, sources) {
    if (!state || !sources || !state.immutableSnapshot) return [];
    return detectStaleness(state, sources).reasons.map((entry) => diagnostic(entry.code, entry.details));
  }

  function validateProgress(state, sources = null) {
    const structural = validateStructural(state);
    const semantic = validateSemantic(state);
    const source = sources ? validateSource(state, sources) : [];
    const errors = stableDiagnostics([...structural, ...semantic, ...source]);
    return { valid: errors.length === 0 && state?.status === "ready", stale: source.length > 0 || state?.status === "stale", structural, semantic, source, errors };
  }

  function sourceIdentity(sources) {
    const steps = sourceRecordIdentities(sources.stepRecords, "stepFingerprint");
    const checkpoints = sourceRecordIdentities(sources.checkpointRecords, "checkpointFingerprint");
    const base = {
      projectId: sources.projectId || null, sourceCalculationId: sources.calculationId || null,
      sourcePlanId: sources.plan?.id || null, sourcePlanRevision: integer(sources.plan?.revision), sourcePlanFingerprint: sources.plan?.planFingerprint || null,
      sourceSessionId: sources.session?.id || null, sourceSessionRevision: integer(sources.session?.revision), sourceSessionEpoch: integer(sources.sessionEpoch), sourceSessionFingerprint: sources.session?.sessionFingerprint || null,
      sourceImportRevision: integer(sources.session?.sourceImportRevision ?? sources.plan?.sourceImportRevision),
      steps, checkpoints,
    };
    return {
      ...base,
      sourceStepsFingerprint: fingerprint(steps), sourceCheckpointsFingerprint: fingerprint(checkpoints),
      sourceIdentityFingerprint: fingerprint(base),
    };
  }

  function applySourceIdentity(state, sources, aggregation) {
    const identity = sourceIdentity(sources);
    for (const key of ["sourcePlanId", "sourcePlanRevision", "sourcePlanFingerprint", "sourceSessionId", "sourceSessionRevision", "sourceSessionEpoch", "sourceSessionFingerprint", "sourceImportRevision", "sourceCalculationId", "sourceStepsFingerprint", "sourceCheckpointsFingerprint", "sourceIdentityFingerprint"]) state[key] = identity[key] ?? null;
    if (!aggregation.validation.valid && !state.sourceIdentityFingerprint) state.sourceIdentityFingerprint = identity.sourceIdentityFingerprint;
  }

  function sourceRecordIdentities(records, fingerprintField) {
    return stableRecords(records).map((entry) => ({
      progressId: entry.progress_id || null, epoch: integer(entry.epoch), id: entry.state?.id || null, revision: integer(entry.state?.revision),
      fingerprint: entry.state?.[fingerprintField] || null, sourceSessionId: entry.state?.sourceSessionId || null,
      sourcePlanId: entry.state?.sourcePlanId || null, phaseId: entry.state?.phaseId || null, actionId: entry.state?.actionId || null,
      checkpointId: entry.state?.checkpointId || null, status: entry.state?.status || null,
    }));
  }

  function calculateSnapshotFingerprint(snapshot) { return fingerprint(snapshot); }
  function calculateProgressFingerprint(state) {
    const payload = copy(state); delete payload.progressFingerprint;
    if (payload.validation) payload.validation = { valid: payload.validation.valid, stale: payload.validation.stale };
    return fingerprint(payload);
  }

  function emptyCounts() {
    const steps = { total: 0, waiting: 0, ready: 0, active: 0, paused: 0, blocked: 0, completed: 0, stale: 0, failed: 0, skipped: 0, resolved: 0, progressPercent: 0 };
    return { phases: { total: 0 }, steps, checkpoints: { total: 0, pending: 0, reviewing: 0, passed: 0, failed: 0 } };
  }

  function failedAggregation(structural) {
    const blockers = structural.map((entry) => blocker(entry.code, diagnosticMessage(entry.code), entry.details));
    return { status: "failed", counts: emptyCounts(), currentStep: null, nextAction: action("retry_progress", "Повторить построение progress", true), blockers, failure: { code: structural[0]?.code || "source_structure_invalid", message: "Структурная проверка источников не пройдена." }, validation: { valid: false, stale: false, structural, semantic: [], source: [], errors: structural }, logicalSteps: [], logicalCheckpoints: [] };
  }

  function logicalStepStatus(actionState, step, session, currentActionId) {
    if (step && step.actionId === actionState.actionId) {
      if (step.status === "checking") return "active";
      if (STEP_COUNT_KEYS.includes(step.status)) return step.status;
    }
    if (session.status === "paused" && actionState.actionId === currentActionId) return "paused";
    return ({ pending: "waiting", available: "ready", in_progress: "active", completed: "completed", skipped: "skipped", blocked: "blocked" })[actionState.status] || "failed";
  }

  function logicalCheckpointStatus(state) {
    if (!state || ["waiting", "ready"].includes(state.status)) return "pending";
    if (["reviewing", "deferred", "sync_pending"].includes(state.status)) return "reviewing";
    if (state.status === "confirmed") return "passed";
    return "failed";
  }

  function actionForCheckpoint(checkpoint, phases) {
    const phase = phases.find((entry) => entry.id === checkpoint.phaseId);
    return array(phase?.actions).at(-1)?.id || null;
  }

  function inspectAggregate(aggregate) {
    const sources = normalizeSources(aggregate);
    const record = array(aggregate?.progress).find((entry) => entry.calculation_id === sources.calculationId && entry.kind === PROGRESS_KIND && entry.epoch === 1) || null;
    const staleness = record?.state ? detectStaleness(record.state, sources) : { stale: false, reasons: [] };
    return { project: sources.project, calculation: sources.calculation, progressRecord: record, progress: record?.state || null, sources, staleness, canBuild: Boolean(sources.plan && sources.session && !record), canRebuild: Boolean(record && sources.plan && sources.session && ["ready", "blocked", "stale"].includes(staleness.stale ? "stale" : record.state.status)), canRetry: Boolean(record && sources.plan && sources.session && record.state.status === "failed") };
  }

  async function ensureForProject(repository, projectId, options = {}) {
    const inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.calculation) throw progressError("calculation_identity_missing", "Активный расчёт проекта не найден.");
    if (inspected.progressRecord) return inspected;
    const state = createInitialState(projectId, { now: options.now, calculationId: inspected.calculation.calculation_id });
    await repository.ensurePatternExecutionProgress(projectId, inspected.calculation.calculation_id, state, { operationKind: "PATTERN_EXECUTION_PROGRESS_CREATED", projectStage: "pattern_execution_progress_waiting" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function buildForProject(repository, projectId, options = {}) { return persistBuild(repository, projectId, "build", options); }
  async function rebuildForProject(repository, projectId, options = {}) { return persistBuild(repository, projectId, "rebuild", options); }
  async function retryForProject(repository, projectId, options = {}) { return persistBuild(repository, projectId, "retry", options); }

  async function persistBuild(repository, projectId, mode, options = {}) {
    let inspected = await ensureForProject(repository, projectId, options);
    if (inspected.progress.status === "building") {
      const recovered = recoverInterruptedProgress(inspected.progress, { expectedRevision: inspected.progress.revision, now: options.now });
      await repository.updatePatternExecutionProgress(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_EXECUTION_PROGRESS_RECOVERED", projectStage: "pattern_execution_progress_failed" });
      inspected = inspectAggregate(await repository.getProject(projectId));
    }
    if (mode === "build" && inspected.progress.status !== "waiting") throw progressError("build_not_allowed", "Первичное построение доступно только из waiting.");
    if (mode === "retry" && inspected.progress.status !== "failed") throw progressError("retry_not_allowed", "Retry доступен только после ошибки.");
    if (mode === "rebuild" && !["ready", "blocked", "stale"].includes(inspected.staleness.stale ? "stale" : inspected.progress.status)) throw progressError("rebuild_not_allowed", "Rebuild недоступен в текущем состоянии.");
    let current = inspected.progress;
    if (inspected.staleness.stale && current.status !== "stale") {
      current = markStale(current, inspected.staleness.reasons, { expectedRevision: current.revision, now: options.now });
      await repository.updatePatternExecutionProgress(projectId, inspected.calculation.calculation_id, current, { operationKind: "PATTERN_EXECUTION_PROGRESS_STALE", projectStage: "pattern_execution_progress_stale" });
    }
    const operationId = options.operationId || `${mode}:${makeId()}`;
    const started = beginBuild(current, { expectedRevision: current.revision, operationId, mode, now: options.now });
    await repository.updatePatternExecutionProgress(projectId, inspected.calculation.calculation_id, started, { operationKind: `PATTERN_EXECUTION_PROGRESS_${mode.toUpperCase()}_STARTED`, projectStage: "pattern_execution_progress_building" });
    inspected = inspectAggregate(await repository.getProject(projectId));
    let completed;
    try { completed = completeBuild(started, inspected.sources, { expectedRevision: started.revision, operationId, now: options.now }); }
    catch (error) { completed = markFailed(started, error.code || "build_failed", { expectedRevision: started.revision, message: error.userMessage || error.message, details: error.details, now: options.now }); }
    await repository.updatePatternExecutionProgress(projectId, inspected.calculation.calculation_id, completed, { operationKind: `PATTERN_EXECUTION_PROGRESS_${completed.status.toUpperCase()}`, projectStage: `pattern_execution_progress_${completed.status}` });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function recoverForProject(repository, projectId, options = {}) {
    const inspected = inspectAggregate(await repository.getProject(projectId));
    if (!inspected.progress || inspected.progress.status !== "building") return inspected;
    const recovered = recoverInterruptedProgress(inspected.progress, { expectedRevision: options.expectedRevision ?? inspected.progress.revision, now: options.now });
    await repository.updatePatternExecutionProgress(projectId, inspected.calculation.calculation_id, recovered, { operationKind: "PATTERN_EXECUTION_PROGRESS_RECOVERED", projectStage: "pattern_execution_progress_failed" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  function finish(state) {
    state.progressFingerprint = null;
    state.progressFingerprint = calculateProgressFingerprint(state);
    return deepFreeze(state);
  }

  function beginOperation(state, operationId, type, expectedRevision) {
    const existing = array(state.operations).find((entry) => entry.operationId === operationId);
    if (existing) { if (existing.type !== type) throw progressError("operation_id_conflict", "operationId уже использован другой операцией."); return existing; }
    checkRevision(state, expectedRevision);
    return null;
  }
  function recordOperation(state, operationId, type, result) { state.operations = [...array(state.operations), { operationId, type, result, revision: state.revision, at: state.updatedAt }].slice(-OPERATION_LIMIT); }
  function updateOperation(state, operationId, type, result) { const entry = array(state.operations).find((item) => item.operationId === operationId && item.type === type); if (entry) { entry.result = result; entry.revision = state.revision; entry.at = state.updatedAt; } else recordOperation(state, operationId, type, result); }
  function appendAudit(state, event, at, details = {}) { state.audit = [...array(state.audit), { event, at, revision: state.revision, ...copy(details) }].slice(-AUDIT_LIMIT); }
  function prepareRevision(state, now) { state.revision += 1; state.updatedAt = now; }
  function normalizeMode(value, status) { const mode = value || (status === "waiting" ? "build" : status === "failed" ? "retry" : "rebuild"); if (!['build', 'rebuild', 'retry'].includes(mode)) throw progressError("build_mode_invalid", "Режим построения progress не поддерживается."); return mode; }
  function action(type, label, allowed, target = {}) { return { type, label, allowed: Boolean(allowed), target: copy(target) }; }
  function blocker(code, message, details = {}) { return { id: `progress-blocker:${fingerprint({ code, details }).slice(8)}`, code, message, details: copy(details || {}) }; }
  function staleReason(code, details = {}) { return { code, message: staleMessage(code), details: copy(details || {}) }; }
  function diagnostic(code, details = {}, severity = "error") { return { code, severity, details: copy(details || {}) }; }
  function emptyValidation() { return { valid: false, stale: false, structural: [], semantic: [], source: [], errors: [] }; }
  function stableDiagnostics(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize(entry), entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details))); }
  function stableBlockers(entries) { const map = new Map(); for (const entry of array(entries)) map.set(canonicalize({ code: entry.code, details: entry.details || {} }), entry); return [...map.values()].sort((left, right) => lexical(left.code, right.code) || lexical(left.id, right.id)); }
  function stableReasons(entries) { const map = new Map(); for (const entry of array(entries)) { const normalized = entry?.code ? { code: entry.code, message: entry.message || staleMessage(entry.code), details: copy(entry.details || {}) } : staleReason(String(entry)); map.set(canonicalize({ code: normalized.code, details: normalized.details }), normalized); } return [...map.values()].sort((left, right) => lexical(left.code, right.code)); }
  function stableRecords(records) { return array(records).slice().sort((left, right) => (integer(left.epoch) ?? 0) - (integer(right.epoch) ?? 0) || lexical(text(left.progress_id), text(right.progress_id))); }
  function newestRecord(records) { return stableRecords(records).at(-1) || null; }
  function comparePhase(left, right) { return numeric(left.order) - numeric(right.order) || lexical(text(left.id), text(right.id)); }
  function compareSessionAction(left, right) { return numeric(left.order) - numeric(right.order) || lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.actionId), text(right.actionId)); }
  function compareCheckpoint(left, right) { return lexical(text(left.phaseId), text(right.phaseId)) || lexical(text(left.id), text(right.id)); }
  function diagnosticMessage(code) { return ({ project_identity_missing: "Project identity отсутствует.", calculation_identity_missing: "Активный calculation отсутствует.", source_plan_missing: "Stage 22 не найден.", source_plan_invalid: "Stage 22 повреждён.", source_session_missing: "Stage 23 не найден.", source_session_invalid: "Stage 23 повреждён.", source_plan_not_ready: "Stage 22 не готов.", source_session_not_usable: "Stage 23 недоступен для агрегации.", source_revision_mismatch: "Revision или fingerprint Stage 22/23 не совпадает.", source_import_identity_mismatch: "Import identity Stage 22/23 не совпадает.", source_plan_fingerprint_mismatch: "Fingerprint Stage 22 не прошёл проверку.", source_session_fingerprint_mismatch: "Fingerprint Stage 23 не прошёл проверку.", source_step_fingerprint_mismatch: "Fingerprint Stage 24 не прошёл проверку.", source_checkpoint_fingerprint_mismatch: "Fingerprint Stage 25 не прошёл проверку.", duplicate_step_reference: "Обнаружена дублирующая связь Stage 24.", duplicate_checkpoint_reference: "Обнаружена дублирующая связь Stage 25.", incompatible_step_identity: "Stage 24 связан с несовместимым источником.", incompatible_checkpoint_identity: "Stage 25 связан с несовместимым источником.", plan_session_composition_mismatch: "Состав действий Stage 22 и Stage 23 не совпадает.", required_checkpoint_missing_or_unpassed: "Обязательный checkpoint завершённого шага отсутствует или не пройден." })[code] || "Источник progress повреждён или противоречив."; }
  function staleMessage(code) { return ({ source_plan_identity_changed: "Изменился ID Stage 22.", source_plan_revision_changed: "Изменилась revision Stage 22.", source_plan_fingerprint_changed: "Изменился fingerprint Stage 22.", source_session_identity_changed: "Изменился ID Stage 23.", source_session_revision_changed: "Изменилась revision Stage 23.", source_session_epoch_changed: "Изменился epoch Stage 23.", source_session_fingerprint_changed: "Изменился fingerprint Stage 23.", source_import_identity_changed: "Изменилась import identity.", source_calculation_identity_changed: "Изменился активный calculation.", source_steps_changed: "Изменился состав, revision или fingerprint Stage 24.", source_checkpoints_changed: "Изменился состав, revision или fingerprint Stage 25.", source_identity_changed: "Изменилась агрегированная identity источников.", import_identity_unproven: "После импорта identity источников не может считаться доказанной." })[code] || "Identity источников изменилась."; }
  function checkRevision(state, expectedRevision) { if (!positiveInteger(expectedRevision) || expectedRevision !== state.revision) throw progressError("progress_revision_conflict", "Progress изменён в другой операции.", { expectedRevision, actualRevision: state.revision }); }
  function requireProgress(state) { if (!state || state.kind !== PROGRESS_KIND || state.schemaVersion !== SCHEMA_VERSION || state.version !== VERSION || !STATUSES.includes(state.status) || !positiveInteger(state.revision)) throw progressError("progress_structure_invalid", "Запись Stage 26 повреждена."); }
  function requireOperationId(value) { const result = text(value); if (!result) throw progressError("operation_id_required", "Для построения progress требуется operationId."); return result; }
  function throwInvalidTransition(from, to) { throw progressError("invalid_status_transition", `Переход ${from || "unknown"} → ${to} недопустим.`); }
  function progressError(code, message, details = {}) { return new PatternExecutionProgressError(code, message, details); }
  function validFingerprint(value) { return typeof value === "string" && value.length === 16 && value.startsWith("fnv1a32:") && [...value.slice(8)].every((character) => "0123456789abcdef".includes(character)); }
  function isTimestamp(value) { return typeof value === "string" && value.length === 24 && Number.isFinite(Date.parse(value)); }
  function integer(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isInteger(number) ? number : null; }
  function positiveInteger(value) { const valueNumber = integer(value); return valueNumber !== null && valueNumber > 0 ? valueNumber : null; }
  function nonNegativeInteger(value) { const valueNumber = integer(value); return valueNumber !== null && valueNumber >= 0 ? valueNumber : null; }
  function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : Number.MAX_SAFE_INTEGER; }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function copyFrozen(value) { return deepFreeze(copy(value)); }
  function lexical(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
  function timestampNow() { return new Date().toISOString(); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `execution-progress:${fingerprint({ at: timestampNow() }).slice(9)}`; }

  const api = {
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, STATUSES, STEP_COUNT_KEYS, CHECKPOINT_COUNT_KEYS,
    AUDIT_LIMIT, OPERATION_LIMIT, TRANSITIONS, PatternExecutionProgressError,
    canonicalize, fingerprint, createInitialState, beginBuild, completeBuild, buildProgress,
    rebuildProgress, retryProgress, recoverInterruptedProgress, detectStaleness, markStale, markFailed,
    normalizeSources, aggregateSources, sourceIdentity, buildImmutableSnapshot,
    validateStructural, validateSemantic, validateSource, validateProgress,
    calculateSnapshotFingerprint, calculateProgressFingerprint, inspectAggregate,
    ensureForProject, buildForProject, rebuildForProject, retryForProject, recoverForProject,
  };
  globalObject.YarnAIPatternExecutionProgress = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
