"use strict";

(function exposePrimaryFabricPreparationWorkspace(globalObject) {
  const DIRECTION_LABELS = Object.freeze({ bottom_up: "снизу вверх", top_down: "сверху вниз", unknown: "не зафиксировано в плане" });
  const METHOD_LABELS = Object.freeze({ in_round: "по кругу", flat: "поворотными рядами", unknown: "не зафиксирован" });
  function waitForPageShow(target) { return new Promise((resolve) => target.addEventListener("pageshow", resolve, { once: true })); }
  function waitForNativeRestoration(target) { const frame = typeof target.requestAnimationFrame === "function" ? (resolve) => target.requestAnimationFrame(resolve) : (resolve) => target.setTimeout(resolve, 0); return new Promise((resolve) => frame(() => frame(resolve))); }
  function error(code, message) { const value = new Error(message); value.code = code; value.userMessage = message; return value; }
  function formatNumber(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 20 }).format(value); }
  function methodValue(value) { return typeof value === "string" ? value : value?.value || value?.kind || "unknown"; }
  function preparationSummary(state, domain) { const value = domain.validateProgressState(state); return `Основной узор: ${value.preparation.mainPattern.value}. Раппорт: ${value.preparation.patternRepeat.value}. Целевая высота участка: ${formatNumber(value.preparation.sectionTarget.value)} см.`; }
  function assessAggregateReadiness(options = {}) {
    const domain = options.domain;
    const assessment = domain.assessSource({
      projectId: options.projectId, project: options.aggregate?.project, progress: options.aggregate?.progress,
      stage63Domain: options.stage63Domain, stage65Domain: options.stage65Domain, stage66Domain: options.stage66Domain,
      stage67Domain: options.stage67Domain, stage68Domain: options.stage68Domain, stage69Domain: options.stage69Domain,
      stage70Domain: options.stage70Domain, stage71Domain: options.stage71Domain, stage72Domain: options.stage72Domain,
    });
    const records = (Array.isArray(options.aggregate?.progress) ? options.aggregate.progress : []).filter((entry) => entry?.kind === domain.KIND && !entry.deleted_at);
    if (assessment.lifecycle !== "ready") return Object.freeze({ lifecycle: "blocked", assessment, record: null, state: null, diagnostic: assessment.diagnostic });
    if (records.some((entry) => entry.project_id !== options.projectId || entry.calculation_id !== assessment.calculationId) || records.length > 1 || records.some((entry) => entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN" || entry.imported_unproven)) return Object.freeze({ lifecycle: "blocked", assessment, record: null, state: null, diagnostic: domain.diagnostic("REVISION_CONFLICT", "Сохранённые подготовки конфликтуют.") });
    if (!records.length) return Object.freeze({ lifecycle: "ready", assessment, record: null, state: null, diagnostic: null });
    try { const state = domain.validateProgressState(records[0].state, { assessment }); return Object.freeze({ lifecycle: "completed", assessment, record: records[0], state, diagnostic: null }); }
    catch (problem) { return Object.freeze({ lifecycle: "blocked", assessment, record: records[0], state: null, diagnostic: domain.diagnostic(problem?.code || "SOURCE_STALE", problem?.userMessage || problem?.message) }); }
  }
  function createController(options = {}) {
    const target = options.globalObject || globalObject; const documentObject = options.document || target.document;
    const domain = options.domain || target.YarnAIPrimaryFabricPreparation; const system = options.system || target.YarnAIProjectSystem;
    const dependencies = {
      stage63Domain: options.stage63Domain || target.YarnAISwatchGauge, stage65Domain: options.stage65Domain || target.YarnAIProjectExecutionPlan,
      stage66Domain: options.stage66Domain || target.YarnAIProjectExecutionStart, stage67Domain: options.stage67Domain || target.YarnAIProjectExecutionFirstStep,
      stage68Domain: options.stage68Domain || target.YarnAIProjectExecutionNextStep, stage69Domain: options.stage69Domain || target.YarnAIProjectExecutionNextStepClarification,
      stage70Domain: options.stage70Domain || target.YarnAIFoundationSectionExecutionPreparation, stage71Domain: options.stage71Domain || target.YarnAIFoundationSectionExecution,
      stage72Domain: options.stage72Domain || target.YarnAIFoundationSectionMeasurement,
    };
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository()); const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7());
    const ui = options.ui || (documentObject ? {
      root: documentObject.querySelector("#primary-fabric-preparation-root"), loading: documentObject.querySelector("#primary-fabric-preparation-loading"), blocked: documentObject.querySelector("#primary-fabric-preparation-blocked"), blockedMessage: documentObject.querySelector("#primary-fabric-preparation-blocked-message"),
      content: documentObject.querySelector("#primary-fabric-preparation-content"), stitches: documentObject.querySelector("#primary-fabric-preparation-stitches"), method: documentObject.querySelector("#primary-fabric-preparation-method"), tool: documentObject.querySelector("#primary-fabric-preparation-tool"), direction: documentObject.querySelector("#primary-fabric-preparation-direction"),
      form: documentObject.querySelector("#primary-fabric-preparation-form"), pattern: documentObject.querySelector("#primary-fabric-preparation-pattern"), repeat: documentObject.querySelector("#primary-fabric-preparation-repeat"), height: documentObject.querySelector("#primary-fabric-preparation-height"), patternError: documentObject.querySelector("#primary-fabric-preparation-pattern-error"), repeatError: documentObject.querySelector("#primary-fabric-preparation-repeat-error"), heightError: documentObject.querySelector("#primary-fabric-preparation-height-error"), summary: documentObject.querySelector("#primary-fabric-preparation-summary"), save: documentObject.querySelector("#primary-fabric-preparation-save"), formError: documentObject.querySelector("#primary-fabric-preparation-form-error"),
      completed: documentObject.querySelector("#primary-fabric-preparation-completed"), completedSummary: documentObject.querySelector("#primary-fabric-preparation-completed-summary"), execute: documentObject.querySelector("#primary-fabric-preparation-execute"),
    } : {});
    let repository = null; let projectId = ""; let aggregate = null; let readiness = null; let busy = false; let hydrated = false; let submitOperationId = "";
    function readyDependencies() { return domain && system && Object.values(dependencies).every(Boolean); }
    function input() { return { mainPattern: ui.pattern?.value || "", patternRepeat: ui.repeat?.value || "", sectionHeightCm: ui.height?.value || "" }; }
    function resolvedInput() { try { return domain.normalizedInput(input()); } catch { return null; } }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); if (ui.save) ui.save.disabled = value || !resolvedInput(); }
    function renderValidation() {
      let values = null; try { values = domain.normalizedInput(input()); } catch {}
      if (ui.patternError) ui.patternError.textContent = ui.pattern?.value?.trim() ? "" : "Укажите узор основного полотна.";
      if (ui.repeatError) ui.repeatError.textContent = ui.repeat?.value?.trim() ? "" : "Опишите раппорт так, как вы будете его выполнять.";
      if (ui.heightError) { try { domain.parseHeight(ui.height?.value || ""); ui.heightError.textContent = ""; } catch { ui.heightError.textContent = ui.height?.value ? "Укажите положительную высоту в сантиметрах." : ""; } }
      if (ui.summary) ui.summary.textContent = values ? `Связать основной узор «${values.mainPattern}» с раппортом «${values.patternRepeat}» до целевой высоты ${formatNumber(values.sectionHeightCm)} см.` : "Заполните только недостающие данные — точная сводка появится здесь.";
      if (ui.save) ui.save.disabled = busy || !values; return values;
    }
    function renderBlocked(diagnostic) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = diagnostic?.message || "Подготовка недоступна."; ui.blocked.focus?.(); setBusy(false); return diagnostic; }
    function renderKnownContext(context) { if (ui.stitches) ui.stitches.textContent = `${context.stitchCount} петель`; if (ui.method) ui.method.textContent = METHOD_LABELS[methodValue(context.workingMethod)] || methodValue(context.workingMethod); if (ui.tool) ui.tool.textContent = context.toolLabel; if (ui.direction) ui.direction.textContent = DIRECTION_LABELS[context.direction] || context.direction; }
    function renderReady(next) { renderKnownContext(next.assessment.knownContext); ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.form.hidden = false; ui.completed.hidden = true; ui.formError.textContent = ""; renderValidation(); setBusy(false); ui.pattern?.focus?.(); return next; }
    function renderCompleted(stateSource) { const state = domain.validateProgressState(stateSource); renderKnownContext(state.preparation.knownContext); ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.form.hidden = true; ui.completed.hidden = false; ui.completedSummary.textContent = preparationSummary(state, domain); if (ui.execute) ui.execute.href = `/project-primary-fabric-execution?project=${encodeURIComponent(state.projectId)}`; ui.completed.focus?.(); setBusy(false); return state; }
    async function refresh() { aggregate = await repository.getProject(projectId); readiness = assessAggregateReadiness({ aggregate, projectId, domain, ...dependencies }); if (readiness.lifecycle === "blocked") return renderBlocked(readiness.diagnostic); if (readiness.lifecycle === "completed") return renderCompleted(readiness.state); return renderReady(readiness); }
    async function submit(event) {
      event?.preventDefault?.(); if (busy || readiness?.lifecycle !== "ready") return; const values = renderValidation(); if (!values) return; setBusy(true); ui.formError.textContent = ""; const timestamp = now(); submitOperationId ||= operationId();
      try { const state = domain.createCompletedState(readiness.assessment, values, { timestamp, operationId: submitOperationId, explicitConfirmation: true }); await repository.ensurePrimaryFabricPreparation(projectId, state.calculationId, state, { timestamp, operationId: submitOperationId, expectedProjectRevision: aggregate.project.revision }); await refresh(); }
      catch (problem) { ui.formError.textContent = problem?.userMessage || problem?.message || "Не удалось сохранить подготовку."; ui.formError.focus?.(); setBusy(false); }
    }
    async function handlePageShow() { if (!hydrated || busy) return; setBusy(true); await waitForNativeRestoration(target); await refresh().catch((problem) => renderBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message))); }
    async function start() {
      if (!documentObject || !readyDependencies()) throw error("DEPENDENCY_MISSING", "Экран подготовки загружен не полностью."); await waitForPageShow(target); await waitForNativeRestoration(target);
      projectId = domain.projectIdentityFromLocation(target.location); repository = repositoryFactory(); setBusy(true);
      try { await repository.initialize(); await refresh(); } catch (problem) { renderBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message)); }
      ui.form?.addEventListener("submit", submit); for (const field of [ui.pattern, ui.repeat, ui.height]) field?.addEventListener("input", renderValidation);
      await waitForNativeRestoration(target); hydrated = true; target.addEventListener("pageshow", handlePageShow); target.addEventListener("pagehide", close, { once: true }); return { projectId, aggregate, readiness };
    }
    async function close() { await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, close, refresh, submit, renderReady, renderCompleted, renderBlocked, renderValidation, getState: () => ({ projectId, aggregate, readiness, busy, hydrated }) });
  }
  const api = Object.freeze({ DIRECTION_LABELS, METHOD_LABELS, formatNumber, preparationSummary, assessAggregateReadiness, createController });
  globalObject.YarnAIPrimaryFabricPreparationWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
