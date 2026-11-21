"use strict";

(function initializeProjectBodyUnderarmPhysicalConfirmationApplication(globalObject) {
  const ROUTE_METADATA = Object.freeze({ kind: "PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION", stage: 82, routePath: "/project-body-underarm-physical-confirmation", presentationAvailable: true });
  const BODY_PROGRESS_KINDS = Object.freeze(["FOUNDATION_SECTION_EXECUTION_PREPARATION", "PRIMARY_FABRIC_PREPARATION", "PRIMARY_FABRIC_EXECUTION", "PRIMARY_FABRIC_MEASUREMENT", "PROJECT_NEXT_SECTION_PLANNING"]);
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function unsafe(value) { return !record(value) || Boolean(value.deleted_at || value.conflict_id || value.quarantined || value.imported_unproven || value.importedUnproven || value.stale || value.validation_status === "IMPORTED_UNPROVEN" || value.validation_status === "QUARANTINED"); }
  function fail(domain, code, message, details = {}) { throw new domain.BodyUnderarmPhysicalConfirmationError(code, message, details); }
  function dependenciesFromGlobal(target = globalObject) {
    return {
      planningDomain: target.YarnAIProjectSleeveTargetGeometryPlanning,
      planningApplication: target.YarnAIProjectSleeveTargetGeometryPlanningApplication,
      executionDomain: target.YarnAIProjectSleevePhysicalExecution,
      executionApplication: target.YarnAIProjectSleevePhysicalExecutionApplication,
      pairDomain: target.YarnAIProjectSleevePairValidation,
      pairApplication: target.YarnAIProjectSleevePairValidationApplication,
      stage70Domain: target.YarnAIFoundationSectionExecutionPreparation,
      stage73Domain: target.YarnAIPrimaryFabricPreparation,
      stage74Domain: target.YarnAIPrimaryFabricExecution,
      stage75Domain: target.YarnAIPrimaryFabricMeasurement,
      stage76Domain: target.YarnAIProjectNextSectionPlanning,
    };
  }
  function requiredRecord(aggregate, domain, kind) {
    const calculationId = aggregate.project.active_calculation_id; const matches = (aggregate.progress || []).filter((item) => item.kind === kind && item.calculation_id === calculationId && !item.deleted_at);
    if (matches.length !== 1) fail(domain, matches.length ? `${kind}_CONFLICT` : `${kind}_REQUIRED`, `Требуется ровно одна authoritative запись ${kind}.`);
    if (unsafe(matches[0]) || matches[0].project_id !== aggregate.project.project_id || !Number.isSafeInteger(matches[0].revision) || matches[0].revision < 1) fail(domain, `${kind}_UNSAFE`, `Authoritative запись ${kind} небезопасна.`);
    return matches[0];
  }
  function validateBodyState(recordValue, validator, projectId, calculationId, domain) {
    if (!validator?.validateProgressState) fail(domain, "BODY_SOURCE_VALIDATOR_MISSING", "Валидатор body source недоступен.");
    try { return validator.validateProgressState(recordValue.state, { projectIdentity: projectId, calculationId }); }
    catch (error) { fail(domain, error?.code || "BODY_SOURCE_INVALID", error?.userMessage || error?.message || "Body source повреждён."); }
  }
  function binding(domain, recordValue, state) {
    return { kind: recordValue.kind, progressId: recordValue.progress_id, repositoryRevision: recordValue.revision, stateIdentity: state.identity || state.snapshot?.identity || state.completedSnapshot?.identity || recordValue.progress_id, stateFingerprint: domain.fingerprint(state) };
  }
  function reconstructAuthoritativeContext(input = {}) {
    const domain = input.domain || globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmation; const dependencies = input.dependencies || dependenciesFromGlobal(); const aggregate = input.aggregate;
    if (!domain || !aggregate?.project) throw new Error("Stage 82 source dependencies are unavailable.");
    const projectId = aggregate.project.project_id; const calculationId = aggregate.project.active_calculation_id;
    if (!calculationId || !(aggregate.calculations || []).some((item) => item.project_id === projectId && item.calculation_id === calculationId)) fail(domain, "CALCULATION_REQUIRED", "Активный расчёт проекта недоступен.");
    if (Object.values(dependencies).some((item) => !item)) fail(domain, "SOURCE_DEPENDENCY_MISSING", "Не удалось проверить authoritative chain Stage 79–81.");

    let stage79Sources; let pair;
    try { stage79Sources = dependencies.planningApplication.reconstructAuthoritativeSources({ aggregate, domain: dependencies.planningDomain, validatedAt: input.validatedAt }); }
    catch (error) { fail(domain, error?.code || "STAGE79_SOURCE_STALE", error?.userMessage || error?.message || "Stage 79 source chain устарела."); }
    try { pair = dependencies.pairApplication.reconstructCurrentPair({ aggregate, domain: dependencies.pairDomain, stage80Domain: dependencies.executionDomain, stage80Application: dependencies.executionApplication, validatedAt: input.validatedAt }); }
    catch (error) { fail(domain, error?.code || "STAGE80_SOURCE_STALE", error?.userMessage || error?.message || "Текущая пара рукавов недоступна."); }

    const stage81Records = (aggregate.progress || []).filter((item) => item.kind === dependencies.pairDomain.KIND && item.calculation_id === calculationId && !item.deleted_at).sort((left, right) => left.epoch - right.epoch);
    let previous = null; const checked81 = [];
    for (let index = 0; index < stage81Records.length; index += 1) {
      const item = stage81Records[index]; if (unsafe(item) || item.project_id !== projectId || item.epoch !== index + 1 || !Number.isSafeInteger(item.revision) || item.revision < 1) fail(domain, "STAGE81_HISTORY_UNSAFE", "История Stage 81 небезопасна.");
      let state; try { state = dependencies.pairDomain.validateState(item.state); } catch (error) { fail(domain, error?.code || "STAGE81_HISTORY_UNSAFE", error?.userMessage || error?.message || "Stage 81 state повреждён."); }
      if (state.projectId !== projectId || state.calculationId !== calculationId || state.validationEpoch !== item.epoch || state.revision !== item.revision || state.predecessorIdentity !== (previous?.identity || null)) fail(domain, "STAGE81_HISTORY_UNSAFE", "Stage 81 epoch lineage повреждена.");
      previous = state; checked81.push({ record: item, state });
    }
    const current81 = checked81.filter((item) => dependencies.pairDomain.canonicalize(item.state.source) === dependencies.pairDomain.canonicalize(pair.sourceBundle.source)).at(-1);
    if (!current81 || current81 !== checked81.at(-1) || current81.state.lifecycle !== "completed" || !["matched", "accepted_with_deviation"].includes(current81.state.decision?.outcome) || current81.state.decision?.outputBoundary !== dependencies.pairDomain.OUTPUT_BOUNDARY) fail(domain, "STAGE81_CURRENT_ACCEPTED_REQUIRED", "Сначала завершите актуальную проверку пары рукавов без pending rework.");

    const bodyRecords = Object.fromEntries(BODY_PROGRESS_KINDS.map((kind) => [kind, requiredRecord(aggregate, domain, kind)]));
    const state70 = validateBodyState(bodyRecords.FOUNDATION_SECTION_EXECUTION_PREPARATION, dependencies.stage70Domain, projectId, calculationId, domain);
    const state73 = validateBodyState(bodyRecords.PRIMARY_FABRIC_PREPARATION, dependencies.stage73Domain, projectId, calculationId, domain);
    const state74 = validateBodyState(bodyRecords.PRIMARY_FABRIC_EXECUTION, dependencies.stage74Domain, projectId, calculationId, domain);
    const state75 = validateBodyState(bodyRecords.PRIMARY_FABRIC_MEASUREMENT, dependencies.stage75Domain, projectId, calculationId, domain);
    const state76 = validateBodyState(bodyRecords.PROJECT_NEXT_SECTION_PLANNING, dependencies.stage76Domain, projectId, calculationId, domain);
    if (state70.lifecycle !== "completed" || state73.lifecycle !== "completed" || !["ready", "active", "paused"].includes(state74.lifecycle) || state74.physicalResult !== null || state75.lifecycle !== "completed" || state75.completedSnapshot?.result !== "TARGET_REACHED" || state76.lifecycle !== "completed") fail(domain, "BODY_PREDECESSOR_INVALID", "Body predecessor chain не находится в допустимом текущем состоянии.");
    const plannedCount = state74.executionPlan?.stitchCount; const foundationHeight = state70.completedSnapshot?.confirmedContext?.target?.value; const primaryHeight = state75.completedSnapshot?.measuredHeightCm; const orientation = state76.snapshot?.derivations?.bottomUpArmholeStartCm;
    if (!Number.isSafeInteger(plannedCount) || plannedCount < 1 || !Number.isFinite(Number(foundationHeight)) || !Number.isFinite(Number(primaryHeight)) || !Number.isFinite(Number(orientation))) fail(domain, "BODY_CONTEXT_INVALID", "Presentation-safe body context неполон.");
    const records79 = (aggregate.progress || []).filter((item) => item.kind === dependencies.planningDomain.KIND && item.calculation_id === calculationId && !item.deleted_at).sort((left, right) => left.epoch - right.epoch); const record79 = records79.at(-1);
    if (!record79 || unsafe(record79)) fail(domain, "STAGE79_REQUIRED", "Текущий Stage 79 отсутствует.");
    const bindings = [
      binding(domain, bodyRecords.FOUNDATION_SECTION_EXECUTION_PREPARATION, state70), binding(domain, bodyRecords.PRIMARY_FABRIC_PREPARATION, state73), binding(domain, bodyRecords.PRIMARY_FABRIC_EXECUTION, state74), binding(domain, bodyRecords.PRIMARY_FABRIC_MEASUREMENT, state75), binding(domain, bodyRecords.PROJECT_NEXT_SECTION_PLANNING, state76),
      binding(domain, record79, dependencies.planningDomain.validateState(record79.state)), binding(domain, pair.record, pair.state), binding(domain, current81.record, current81.state),
    ];
    const bodyBase = { bindings, bodyExecutionState: state74.lifecycle, plannedBodyFullTubeStitchCount: plannedCount, foundationHeightCm: domain.canonicalDecimal(foundationHeight), primaryFabricHeightCm: domain.canonicalDecimal(primaryHeight), orientationUnderarmHeightCm: domain.canonicalDecimal(orientation), orientationInformationalOnly: true };
    const body = { ...bodyBase, fingerprint: domain.fingerprint(bodyBase) };
    const entryBase = { stage81ProgressId: current81.record.progress_id, repositoryRevision: current81.record.revision, stateIdentity: current81.state.identity, validationEpoch: current81.state.validationEpoch, stateFingerprint: current81.state.fingerprint, decisionFingerprint: current81.state.decision.fingerprint, sourceFingerprint: current81.state.source.fingerprint, outcome: current81.state.decision.outcome, sleeveActualFullTubeStitchCounts: { sleeve_1: pair.sourceBundle.results.sleeve_1.actualUnderarmFullTubeStitchCount, sleeve_2: pair.sourceBundle.results.sleeve_2.actualUnderarmFullTubeStitchCount } };
    const entryGate = { ...entryBase, fingerprint: domain.fingerprint(entryBase) }; const sourceBase = { projectId, calculationId, body, entryGate }; const source = domain.validateSource({ ...sourceBase, fingerprint: domain.fingerprint(sourceBase) });
    return Object.freeze({ projectId, calculationId, source: clone(source), stage79Sources: clone(stage79Sources), pair: clone(pair), current81: clone(current81), bodyStates: { stage70: clone(state70), stage73: clone(state73), stage74: clone(state74), stage75: clone(state75), stage76: clone(state76) } });
  }

  function blockedProjection(error, projectId = null) {
    return Object.freeze({ available: false, blocked: true, readiness: /STALE|SOURCE|HISTORY/.test(error?.code || "") ? "blocked_source_stale" : "blocked_prerequisite", lifecycle: "blocked", bodyPhysicalState: "unavailable", context: null, resultDraft: null, completedResult: null, requiredUserAction: null, allowedActions: [], currentConfirmation: { current: false, status: "unavailable", historicalCount: 0, staleCount: 0 }, successorReadiness: { status: "blocked", available: false }, joinPreparation: { status: "blocked", available: false }, reworkDestination: projectId ? { routePath: "/project-sleeve-pair-validation" } : null, diagnostic: Object.freeze({ code: error?.code || "STAGE82_BLOCKED", message: error?.userMessage || error?.message || "Физическое подтверждение корпуса пока недоступно." }) });
  }

  function createController(options = {}) {
    const domain = options.domain || globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmation; const system = options.system || globalObject.YarnAIProjectSystem; const repository = options.repository || (system ? new system.ProjectRepository() : null); const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7()); const throwErrors = options.throwErrors === true; let projectId = options.projectId || null;
    if (!domain || !repository) throw new Error("Stage 82 domain and repository are required.");
    async function context() {
      const aggregate = await repository.getProject(projectId); const authoritative = reconstructAuthoritativeContext({ aggregate, domain, validatedAt: now() }); const history = await repository.getProjectBodyUnderarmPhysicalConfirmationHistory(projectId, authoritative.calculationId); const latest = history.at(-1) || null; const currentBound = latest && domain.canonicalize(latest.state.source) === domain.canonicalize(authoritative.source) ? latest : null;
      return { aggregate, authoritative, history, latest, currentBound };
    }
    function summary(ctx, selected) { return { historicalCount: ctx.history.length, staleCount: ctx.history.filter((item) => domain.canonicalize(item.state.source) !== domain.canonicalize(ctx.authoritative.source) || item !== selected && item.state.lifecycle === "completed").length }; }
    function metadata(current, supplied = {}) { return { at: supplied.at || now(), operationId: supplied.operationId || operationId(), expectedRevision: supplied.expectedRevision ?? current?.state?.revision, expectedFingerprint: supplied.expectedFingerprint ?? current?.state?.fingerprint, expectedSourceFingerprint: supplied.expectedSourceFingerprint ?? current?.state?.source?.fingerprint, expectedBodySourceFingerprint: supplied.expectedBodySourceFingerprint ?? current?.state?.source?.body?.fingerprint, expectedEntryGateFingerprint: supplied.expectedEntryGateFingerprint ?? current?.state?.source?.entryGate?.fingerprint }; }
    async function save(next, ctx, meta) {
      const saved = await repository.saveProjectBodyUnderarmPhysicalConfirmation(projectId, ctx.authoritative.calculationId, next, { expectedProjectRevision: ctx.aggregate.project.revision, expectedRepositoryRevision: ctx.currentBound?.revision ?? (next.epoch === (ctx.latest?.state?.epoch || 0) + 1 ? 0 : undefined), expectedDomainRevision: ctx.currentBound?.state?.revision, expectedSource: ctx.authoritative.source, timestamp: meta.at, operationId: meta.operationId });
      const history = ctx.history.some((item) => item.progress_id === saved.progress_id) ? ctx.history.map((item) => item.progress_id === saved.progress_id ? saved : item) : [...ctx.history, saved]; return domain.projectView(saved.state, { historicalCount: history.length, staleCount: history.filter((item) => item.progress_id !== saved.progress_id).length });
    }
    async function load(id = projectId) { projectId = id; try { const ctx = await context(); if (!ctx.currentBound) return domain.readyView(ctx.authoritative.source, summary(ctx, null)); return domain.projectView(ctx.currentBound.state, summary(ctx, ctx.currentBound)); } catch (error) { if (throwErrors) throw error; return blockedProjection(error, projectId); } }
    async function start(alreadyAtBoundary, supplied = {}) {
      const ctx = await context(); if (ctx.currentBound) fail(domain, "CURRENT_ATTEMPT_EXISTS", "Для текущих источников уже существует Stage 82 attempt."); const meta = metadata(null, supplied); const epoch = (ctx.latest?.state?.epoch || 0) + 1;
      const next = domain.startAttempt({ projectId: ctx.authoritative.projectId, calculationId: ctx.authoritative.calculationId, source: ctx.authoritative.source, epoch, predecessorIdentity: ctx.latest?.state?.identity || null, supersedesResultIdentity: null, alreadyAtBoundary }, meta); return save(next, ctx, meta);
    }
    async function apply(method, input, supplied = {}) { const ctx = await context(); if (!ctx.currentBound) fail(domain, "CURRENT_ATTEMPT_REQUIRED", "Текущий Stage 82 attempt отсутствует."); const meta = metadata(ctx.currentBound, supplied); const next = input === undefined ? domain[method](ctx.currentBound.state, meta) : domain[method](ctx.currentBound.state, input, meta); return save(next, ctx, meta); }
    async function startBodyRework(input = {}, supplied = {}) {
      const ctx = await context(); const current = ctx.currentBound || ctx.latest; if (!current || current.state.lifecycle !== "completed") fail(domain, "COMPLETED_RESULT_REQUIRED", "Rework требует immutable completed Stage 82 result."); if (ctx.currentBound !== current) fail(domain, "CURRENT_RESULT_STALE", "Сначала восстановите актуальную predecessor chain.");
      const meta = metadata(null, supplied); const next = domain.startAttempt({ projectId: ctx.authoritative.projectId, calculationId: ctx.authoritative.calculationId, source: ctx.authoritative.source, epoch: current.state.epoch + 1, predecessorIdentity: current.state.identity, supersedesResultIdentity: current.state.completedResult.identity, rework: true, alreadyAtBoundary: input.alreadyAtBoundary === true }, meta); return save(next, { ...ctx, currentBound: null }, meta);
    }
    return Object.freeze({ load, reconstructAfterReload: load, confirmAlreadyAtBoundary: (meta) => start(true, meta), startOrContinueBodyWork: (meta) => start(false, meta), pause: (meta) => apply("pause", undefined, meta), resume: (meta) => apply("resume", undefined, meta), declareBoundaryReached: (meta) => apply("declareBoundaryReached", undefined, meta), editResultDraft: (input, meta) => apply("editResultDraft", input, meta), returnToWork: (meta) => apply("returnToWork", undefined, meta), completeConfirmation: (input, meta) => apply("completeConfirmation", input, meta), startBodyRework, close: () => repository.close?.(), getProjectId: () => projectId });
  }
  const api = Object.freeze({ ROUTE_METADATA, BODY_PROGRESS_KINDS, dependenciesFromGlobal, reconstructAuthoritativeContext, blockedProjection, createController });
  globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmationApplication = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
