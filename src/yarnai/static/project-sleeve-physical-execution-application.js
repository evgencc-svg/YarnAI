"use strict";

(function initializeProjectSleevePhysicalExecutionApplication(globalObject) {
  const ROUTE_METADATA = Object.freeze({ kind: "PROJECT_SLEEVE_PHYSICAL_EXECUTION", stage: 80, routePath: "/project-sleeve-physical-execution", presentationAvailable: true });
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function fail(domain, code, message, details = {}) { throw new domain.SleevePhysicalExecutionError(code, message, details); }
  function unsafe(record) { return Boolean(record?.deleted_at || record?.conflict_id || record?.quarantined || record?.imported_unproven || record?.importedUnproven || record?.stale || record?.validation_status === "IMPORTED_UNPROVEN" || record?.validation_status === "QUARANTINED"); }

  function reconstructStage79Source(input = {}) {
    const domain = input.domain || globalObject.YarnAIProjectSleevePhysicalExecution;
    const stage79Domain = input.stage79Domain || globalObject.YarnAIProjectSleeveTargetGeometryPlanning;
    const stage79Application = input.stage79Application || globalObject.YarnAIProjectSleeveTargetGeometryPlanningApplication;
    const aggregate = input.aggregate;
    if (!domain || !stage79Domain || !stage79Application || !aggregate?.project) throw new Error("Stage 80 source dependencies are unavailable.");
    const projectId = aggregate.project.project_id; const calculationId = aggregate.project.active_calculation_id;
    const records = (aggregate.progress || []).filter((entry) => entry.kind === stage79Domain.KIND && entry.calculation_id === calculationId && !entry.deleted_at).sort((left, right) => left.epoch - right.epoch);
    if (!calculationId || !records.length) fail(domain, "STAGE79_REQUIRED", "Сначала подтвердите сохранённый план рукава.");
    let previous = null;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]; if (unsafe(record) || record.project_id !== projectId || record.epoch !== index + 1 || !Number.isSafeInteger(record.revision) || record.revision < 1) fail(domain, "STAGE79_HISTORY_UNSAFE", "История плана рукава повреждена или небезопасна.");
      let state; try { state = stage79Domain.validateState(record.state); } catch (error) { fail(domain, error?.code || "STAGE79_HISTORY_UNSAFE", error?.userMessage || error?.message || "План рукава не прошёл проверку."); }
      if (state.projectId !== projectId || state.calculationId !== calculationId || state.epoch !== record.epoch || state.revision !== record.revision || previous && state.predecessorIdentity !== previous.identity || index < records.length - 1 && state.lifecycle !== "completed") fail(domain, "STAGE79_HISTORY_UNSAFE", "История плана рукава не является непрерывной.");
      previous = state;
    }
    const record = records.at(-1); const state = previous;
    if (state.lifecycle !== "completed" || !state.completedSnapshot) fail(domain, "STAGE79_REQUIRED", "Сначала завершите и подтвердите план рукава.");
    let liveSources; try { liveSources = stage79Application.reconstructAuthoritativeSources({ aggregate, domain: stage79Domain, dependencies: stage79Application.dependenciesFromGlobal(globalObject), validatedAt: input.validatedAt }); } catch (error) { fail(domain, error?.code || "STAGE79_SOURCE_STALE", error?.userMessage || error?.message || "Источник Stage 79 больше не актуален."); }
    if (state.source.sourceBindingFingerprint !== stage79Domain.fingerprint(liveSources)) fail(domain, "STAGE79_SOURCE_STALE", "Сохранённый план больше не соответствует текущей authoritative chain.");
    const binding = domain.sourceBinding(record, state);
    return Object.freeze({ projectId, calculationId, record: clone(record), state: clone(state), binding: clone(binding) });
  }

  function blockedProjection(error, current = null) {
    return Object.freeze({ available: false, blocked: true, lifecycle: error?.code === "SOURCE_SUPERSEDED" ? "stale_preparation" : "blocked", canStartNewPreparation: error?.code === "SOURCE_SUPERSEDED", preservedHistory: Boolean(current), diagnostic: Object.freeze({ code: error?.code || "STAGE80_BLOCKED", message: error?.userMessage || error?.message || "Физическое выполнение рукавов пока недоступно." }) });
  }

  function createController(options = {}) {
    const domain = options.domain || globalObject.YarnAIProjectSleevePhysicalExecution;
    const system = options.system || globalObject.YarnAIProjectSystem;
    const repository = options.repository || (system ? new system.ProjectRepository() : null);
    const now = options.now || (() => new Date().toISOString()); const newOperationId = options.operationId || (() => system.uuidv7());
    const throwErrors = options.throwErrors === true; let projectId = options.projectId || null;
    if (!domain || !repository) throw new Error("Stage 80 domain and repository are required.");

    function metadata(current, slot, supplied = {}) {
      const attempt = current ? domain.currentAttempt(current.state, slot) : null;
      return {
        at: supplied.at || now(), operationId: supplied.operationId || newOperationId(),
        expectedAggregateRevision: supplied.expectedAggregateRevision ?? current?.state?.aggregateRevision,
        expectedComponentRevision: supplied.expectedComponentRevision ?? attempt?.revision,
        expectedComponentFingerprint: supplied.expectedComponentFingerprint ?? attempt?.fingerprint,
        preparationFingerprint: supplied.preparationFingerprint ?? current?.state?.preparation?.fingerprint,
      };
    }
    async function context() {
      const aggregate = await repository.getProject(projectId); const source = reconstructStage79Source({ aggregate, domain, validatedAt: now() });
      const history = await repository.getProjectSleevePhysicalExecutionHistory(projectId, source.calculationId); const current = history.at(-1) || null;
      const currentSource = source.binding.fingerprint;
      const sourceCurrent = !current || current.state.source.fingerprint === currentSource;
      return { aggregate, source, history, current, sourceCurrent };
    }
    async function save(next, ctx, meta) {
      const record = await repository.saveProjectSleevePhysicalExecution(projectId, ctx.source.calculationId, next, { expectedProjectRevision: ctx.aggregate.project.revision, expectedRepositoryRevision: ctx.current?.revision || 0, timestamp: meta.at, operationId: meta.operationId });
      return domain.projectView(record.state);
    }
    async function load(id = projectId) {
      projectId = id;
      try {
        const ctx = await context();
        if (!ctx.current) {
          const prep = domain.preparationFromStage79(ctx.source.projectId, ctx.source.calculationId, 1, ctx.source.binding, ctx.source.state);
          return Object.freeze({ available: true, blocked: false, lifecycle: "ready", firstAction: "start_sleeve_1_from_saved_plan", primaryActionLabel: "Начать рукав 1 по сохранённому плану", preparation: { planned: clone(prep.planned), context: { direction: prep.construction.direction, workingMethod: prep.construction.workingMethod, cuffPattern: prep.construction.cuffPatternLabel, mainPattern: prep.construction.mainPatternLabel, lengthMeasurementPath: prep.policies.lengthMeasurementPath, cuffMeasurementLocation: prep.policies.cuffMeasurementLocation, upperMeasurementLocation: prep.policies.upperMeasurementLocation, completionBoundary: domain.COMPLETION_BOUNDARY }, tolerancePolicy: null }, components: { sleeve_1: { componentSlot: "sleeve_1", label: "Рукав 1", lifecycle: "ready", actions: ["start_component"] }, sleeve_2: { componentSlot: "sleeve_2", label: "Рукав 2", lifecycle: "ready", actions: ["start_component"] } }, pairValidation: { status: "not_ready", performed: false }, joinPreparation: { status: "blocked", available: false } });
        }
        if (!ctx.sourceCurrent) throw new domain.SleevePhysicalExecutionError("SOURCE_SUPERSEDED", "План Stage 79 изменился. Продолжение по старой подготовке заблокировано; сохранённая физическая история остаётся доступной.");
        return domain.projectView(ctx.current.state);
      } catch (error) { if (throwErrors) throw error; return blockedProjection(error); }
    }
    async function startComponent(slot, supplied = {}) {
      const ctx = await context(); const meta = metadata(ctx.current, slot, supplied); let next;
      if (!ctx.current) next = domain.createAndStart({ projectId: ctx.source.projectId, calculationId: ctx.source.calculationId, preparationEpoch: 1, componentSlot: slot, stage79Record: ctx.source.record, stage79State: ctx.source.state }, meta);
      else { if (!ctx.sourceCurrent) fail(domain, "SOURCE_SUPERSEDED", "Создайте новую preparation epoch для текущего Stage 79 plan."); next = domain.startComponent(ctx.current.state, slot, meta); }
      return save(next, ctx, meta);
    }
    async function startSupersedingPreparation(slot = "sleeve_1", supplied = {}) {
      const ctx = await context(); if (!ctx.current || ctx.sourceCurrent) fail(domain, "SOURCE_NOT_SUPERSEDED", "Новая shared preparation нужна только после изменения Stage 79 plan.");
      const meta = metadata(null, slot, supplied); const next = domain.createAndStart({ projectId: ctx.source.projectId, calculationId: ctx.source.calculationId, preparationEpoch: ctx.current.state.preparationEpoch + 1, predecessorPreparationIdentity: ctx.current.state.preparation.identity, componentSlot: slot, stage79Record: ctx.source.record, stage79State: ctx.source.state }, meta);
      return save(next, ctx, meta);
    }
    async function apply(slot, method, input, supplied = {}) {
      const ctx = await context(); if (!ctx.current) fail(domain, "STAGE80_REQUIRED", "Сначала начните физическое выполнение рукава."); if (!ctx.sourceCurrent) fail(domain, "SOURCE_SUPERSEDED", "Текущая shared preparation устарела.");
      const meta = metadata(ctx.current, slot, supplied); const next = domain[method](ctx.current.state, slot, input, meta); return save(next, ctx, meta);
    }
    async function simple(slot, method, supplied = {}) { const ctx = await context(); if (!ctx.current) fail(domain, "STAGE80_REQUIRED", "Сначала начните физическое выполнение рукава."); if (!ctx.sourceCurrent) fail(domain, "SOURCE_SUPERSEDED", "Текущая shared preparation устарела."); const meta = metadata(ctx.current, slot, supplied); const next = domain[method](ctx.current.state, slot, meta); return save(next, ctx, meta); }
    return Object.freeze({
      load, reconstructAfterReload: load, startComponent, startSupersedingPreparation,
      confirmCuffCount: (slot, value, meta) => apply(slot, "confirmCuffCount", { actualCuffStitchCount: value }, meta),
      recordShapingEvent: (slot, meta) => apply(slot, "recordShapingEvent", {}, meta),
      pauseComponent: (slot, meta) => simple(slot, "pauseComponent", meta), resumeComponent: (slot, meta) => simple(slot, "resumeComponent", meta),
      declareTargetReached: (slot, meta) => simple(slot, "declareTargetReached", meta), openResultReview: (slot, meta) => simple(slot, "openResultReview", meta),
      editResultDraft: (slot, draft, meta) => apply(slot, "editResultDraft", draft, meta), returnToWork: (slot, meta) => simple(slot, "returnToWork", meta),
      completeComponent: (slot, meta) => apply(slot, "completeComponent", { physicalCompletionConfirmation: true }, meta),
      startComponentRework: (slot, meta) => simple(slot, "startComponentRework", meta),
      close: () => repository.close?.(), getProjectId: () => projectId,
    });
  }

  const api = Object.freeze({ ROUTE_METADATA, reconstructStage79Source, blockedProjection, createController });
  globalObject.YarnAIProjectSleevePhysicalExecutionApplication = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
