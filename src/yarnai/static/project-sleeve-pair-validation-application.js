"use strict";

(function initializeProjectSleevePairValidationApplication(globalObject) {
  const ROUTE_METADATA = Object.freeze({ kind: "PROJECT_SLEEVE_PAIR_VALIDATION", stage: 81, routePath: "/project-sleeve-pair-validation", presentationAvailable: true });
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function canonicalize(value) { const domain = globalObject.YarnAIProjectSleevePairValidation; return domain ? domain.canonicalize(value) : JSON.stringify(value); }
  function fail(domain, code, message, details = {}) { throw new domain.SleevePairValidationError(code, message, details); }
  function unsafe(record) { return Boolean(record?.deleted_at || record?.conflict_id || record?.quarantined || record?.imported_unproven || record?.importedUnproven || record?.stale || record?.validation_status === "IMPORTED_UNPROVEN" || record?.validation_status === "QUARANTINED"); }

  function reconstructCurrentPair(input = {}) {
    const domain = input.domain || globalObject.YarnAIProjectSleevePairValidation;
    const stage80Domain = input.stage80Domain || globalObject.YarnAIProjectSleevePhysicalExecution;
    const stage80Application = input.stage80Application || globalObject.YarnAIProjectSleevePhysicalExecutionApplication;
    const aggregate = input.aggregate;
    if (!domain || !stage80Domain || !stage80Application || !aggregate?.project) throw new Error("Stage 81 source dependencies are unavailable.");
    let stage79; try { stage79 = stage80Application.reconstructStage79Source({ aggregate, domain: stage80Domain, validatedAt: input.validatedAt }); } catch (error) { fail(domain, error?.code || "STAGE79_SOURCE_STALE", error?.userMessage || error?.message || "Stage 79 source is unavailable."); }
    const projectId = aggregate.project.project_id; const calculationId = aggregate.project.active_calculation_id;
    const records = (aggregate.progress || []).filter((entry) => entry.kind === stage80Domain.KIND && entry.calculation_id === calculationId && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (!calculationId || !records.length) fail(domain, "STAGE80_REQUIRED", "Сначала физически завершите оба рукава.");
    let previous = null;
    for (let index = 0; index < records.length; index += 1) {
      const item = records[index];
      if (unsafe(item) || item.project_id !== projectId || item.calculation_id !== calculationId || item.epoch !== index + 1 || !Number.isSafeInteger(item.revision) || item.revision < 1) fail(domain, "STAGE80_HISTORY_UNSAFE", "История физического выполнения рукавов повреждена или небезопасна.");
      let state; try { state = stage80Domain.validateState(item.state); } catch (error) { fail(domain, error?.code || "STAGE80_HISTORY_UNSAFE", error?.userMessage || error?.message || "Stage 80 state is invalid."); }
      if (state.projectId !== projectId || state.calculationId !== calculationId || state.preparationEpoch !== item.epoch || state.aggregateRevision !== item.revision || previous && state.predecessorPreparationIdentity !== previous.preparation.identity) fail(domain, "STAGE80_HISTORY_UNSAFE", "История Stage 80 не является непрерывной.");
      previous = state;
    }
    const record = records.at(-1); const state = previous;
    if (state.source.fingerprint !== stage79.binding.fingerprint || state.source.stage79CompletedSnapshotFingerprint !== stage79.state.completedSnapshot.fingerprint) fail(domain, "STAGE80_SOURCE_STALE", "Текущая подготовка рукавов больше не связана с актуальным планом Stage 79.");
    let sourceBundle; try { sourceBundle = domain.sourceBinding(record, state, stage80Domain); } catch (error) { throw error; }
    return Object.freeze({ projectId, calculationId, stage79: clone(stage79), record: clone(record), state: clone(state), sourceBundle: clone(sourceBundle) });
  }

  function blockedProjection(error, projectId = null) {
    const reworkPending = ["STAGE80_PAIR_NOT_READY", "STAGE80_REQUIRED"].includes(error?.code);
    return Object.freeze({ available: false, blocked: true, readiness: reworkPending ? "waiting_for_two_completed_sleeves" : "blocked_source_invalid", lifecycle: "blocked", currentSleeves: null, comparisons: [], detectedDifferences: [], tolerancePolicy: null, allowedActions: [], currentValidation: { status: "unavailable", current: false, historicalCount: 0, staleCount: 0 }, pairValidationBoundary: { status: "blocked", completed: false }, joinPreparation: { status: "blocked", available: false }, nextDestination: projectId ? { routePath: "/project-sleeve-physical-execution", componentSlots: [] } : null, diagnostic: Object.freeze({ code: error?.code || "STAGE81_BLOCKED", message: error?.userMessage || error?.message || "Проверка пары рукавов пока недоступна." }) });
  }

  function createController(options = {}) {
    const domain = options.domain || globalObject.YarnAIProjectSleevePairValidation;
    const system = options.system || globalObject.YarnAIProjectSystem;
    const repository = options.repository || (system ? new system.ProjectRepository() : null);
    const now = options.now || (() => new Date().toISOString()); const newOperationId = options.operationId || (() => system.uuidv7());
    const throwErrors = options.throwErrors === true; let projectId = options.projectId || null;
    if (!domain || !repository) throw new Error("Stage 81 domain and repository are required.");

    async function context() {
      const aggregate = await repository.getProject(projectId); const pair = reconstructCurrentPair({ aggregate, domain, validatedAt: now() });
      const history = await repository.getProjectSleevePairValidationHistory(projectId, pair.calculationId);
      const matching = history.filter((entry) => canonicalize(entry.state.source) === canonicalize(pair.sourceBundle.source));
      return { aggregate, pair, history, current: history.at(-1) || null, currentBound: matching.at(-1) || null };
    }
    function summary(ctx, selected) { return { historicalCount: ctx.history.length, staleCount: ctx.history.filter((entry) => canonicalize(entry.state.source) !== canonicalize(ctx.pair.sourceBundle.source)).length, selectedEpoch: selected?.state?.validationEpoch || null }; }
    async function save(next, ctx, meta) {
      const saved = await repository.saveProjectSleevePairValidation(projectId, ctx.pair.calculationId, next, { expectedProjectRevision: ctx.aggregate.project.revision, expectedRepositoryRevision: ctx.currentBound?.revision || (next.validationEpoch === (ctx.current?.state?.validationEpoch || 0) + 1 ? 0 : undefined), expectedSource: ctx.pair.sourceBundle.source, timestamp: meta.at, operationId: meta.operationId });
      return domain.projectView(saved.state, summary({ ...ctx, history: ctx.history.some((entry) => entry.progress_id === saved.progress_id) ? ctx.history : [...ctx.history, saved] }, saved));
    }
    async function load(id = projectId) {
      projectId = id;
      try {
        const ctx = await context();
        if (!ctx.currentBound) return domain.readyView(ctx.pair.sourceBundle, summary(ctx, null));
        return domain.projectView(ctx.currentBound.state, summary(ctx, ctx.currentBound));
      } catch (error) { if (throwErrors) throw error; return blockedProjection(error, projectId); }
    }
    async function startPairReview(supplied = {}) {
      const ctx = await context();
      if (ctx.currentBound) fail(domain, "CURRENT_VALIDATION_EXISTS", "Для текущей пары уже существует проверка. Обновите страницу.");
      const meta = { at: supplied.at || now(), operationId: supplied.operationId || newOperationId() };
      const next = domain.createReview({ projectId: ctx.pair.projectId, calculationId: ctx.pair.calculationId, validationEpoch: (ctx.current?.state?.validationEpoch || 0) + 1, predecessorIdentity: ctx.current?.state?.identity || null, sourceBundle: ctx.pair.sourceBundle }, meta);
      return save(next, ctx, meta);
    }
    async function completePairDecision(input = {}, supplied = {}) {
      const ctx = await context(); const current = ctx.currentBound;
      if (!current) fail(domain, "PAIR_REVIEW_REQUIRED", "Сначала откройте проверку двух готовых рукавов.");
      const meta = { at: supplied.at || now(), operationId: supplied.operationId || newOperationId(), expectedRevision: supplied.expectedRevision ?? current.state.revision, expectedFingerprint: supplied.expectedFingerprint ?? current.state.fingerprint, expectedReviewFingerprint: supplied.expectedReviewFingerprint ?? current.state.review.fingerprint };
      const next = domain.completeDecision(current.state, input, meta); return save(next, ctx, meta);
    }
    return Object.freeze({ load, reconstructAfterReload: load, startPairReview, completePairDecision, close: () => repository.close?.(), getProjectId: () => projectId });
  }

  const api = Object.freeze({ ROUTE_METADATA, reconstructCurrentPair, blockedProjection, createController });
  globalObject.YarnAIProjectSleevePairValidationApplication = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
