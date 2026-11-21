"use strict";

(function exposeFoundationSectionMeasurementWorkspace(globalObject) {
  function formatCm(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 12 }).format(value); }
  function createController(options = {}) {
    const target = options.globalObject || globalObject; const doc = options.document || target.document;
    const domain = options.domain || target.YarnAIFoundationSectionMeasurement; const system = options.system || target.YarnAIProjectSystem;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository()); const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7());
    const ui = options.ui || {
      root: doc.querySelector("#foundation-measurement-root"), loading: doc.querySelector("#foundation-measurement-loading"), blocked: doc.querySelector("#foundation-measurement-blocked"), blockedMessage: doc.querySelector("#foundation-measurement-blocked-message"), content: doc.querySelector("#foundation-measurement-content"), attempt: doc.querySelector("#foundation-measurement-attempt"), plan: doc.querySelector("#foundation-measurement-plan"),
      collecting: doc.querySelector("#foundation-measurement-collecting"), form: doc.querySelector("#foundation-measurement-form"), input: doc.querySelector("#foundation-measurement-input"), saveButton: doc.querySelector("#foundation-measurement-save-button"), inputError: doc.querySelector("#foundation-measurement-input-error"),
      completed: doc.querySelector("#foundation-measurement-completed"), completedHeading: doc.querySelector("#foundation-measurement-completed-heading"), completedSummary: doc.querySelector("#foundation-measurement-completed-summary"), completedDetail: doc.querySelector("#foundation-measurement-completed-detail"), completedActions: doc.querySelector("#foundation-measurement-completed-actions"), belowAction: doc.querySelector("#foundation-measurement-below-action"), reachedAction: doc.querySelector("#foundation-measurement-reached-action"), actionError: doc.querySelector("#foundation-measurement-action-error"),
    };
    let repository = null; let projectId = ""; let aggregate = null; let assessment = null; let record = null; let state = null; let busy = false; let channel = null;
    function dependenciesReady() { return domain && system && target.YarnAIFoundationSectionExecution && target.YarnAIFoundationSectionExecutionPreparation && target.YarnAIProjectExecutionPlan && target.YarnAIProjectExecutionStart && target.YarnAIProjectExecutionFirstStep && target.YarnAIProjectExecutionNextStep && target.YarnAIProjectExecutionNextStepClarification; }
    function sourceOptions() { return { projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: target.YarnAISwatchGauge, stage65Domain: target.YarnAIProjectExecutionPlan, stage66Domain: target.YarnAIProjectExecutionStart, stage67Domain: target.YarnAIProjectExecutionFirstStep, stage68Domain: target.YarnAIProjectExecutionNextStep, stage69Domain: target.YarnAIProjectExecutionNextStepClarification, stage70Domain: target.YarnAIFoundationSectionExecutionPreparation, stage71Domain: target.YarnAIFoundationSectionExecution, validatedAt: now() }; }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); [ui.input, ui.saveButton].forEach((node) => { if (node) node.disabled = value; }); }
    function showBlocked(problem) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = problem?.message || "Не удалось безопасно проверить проект."; ui.blocked.focus?.(); }
    function resultText(measurement) { if (measurement.result === "TARGET_REACHED") return `Измеренная высота ${formatCm(measurement.measuredHeightCm)} см соответствует цели.`; const remaining = measurement.targetHeightCm - measurement.measuredHeightCm; return `До цели ещё не хватает ${formatCm(remaining)} см.`; }
    function completedFallback() {
      const candidates = aggregate.progress.filter((entry) => entry?.kind === domain.KIND && entry?.project_id === projectId && entry?.calculation_id === aggregate.project.active_calculation_id && !entry.deleted_at);
      const boundary = domain.resolveAuthoritativeHistory(candidates);
      if (boundary.status !== "valid" && !boundary.terminalReached) return null;
      return boundary.authoritativeState?.lifecycle === "completed" ? { record: boundary.authoritativeRecord, state: boundary.authoritativeState } : null;
    }
    function render(nextState) {
      state = nextState; ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.actionError.hidden = true; ui.attempt.textContent = `Проверка высоты № ${state.epoch}`;
      const plan = state.context; const pattern = plan.ribPattern.kind === "rib_1x1" ? "резинка 1×1" : "резинка 2×2"; const method = plan.workingMethod.value === "in_round" ? "по кругу" : "поворотными рядами"; ui.plan.textContent = `${pattern}, ${method}, ${plan.stitchAllocation.totalCastOn} петель, ${plan.toolConfirmation.label}`;
      ui.collecting.hidden = state.lifecycle === "completed"; ui.completed.hidden = state.lifecycle !== "completed";
      if (state.lifecycle !== "completed") { ui.inputError.hidden = true; ui.input.value = state.lifecycle === "reviewing" ? String(state.measurement.measuredHeightCm).replace(".", ",") : ""; target.setTimeout?.(() => ui.input.focus?.(), 0); }
      if (state.lifecycle === "completed") { const result = state.completedSnapshot; const reached = result.result === "TARGET_REACHED"; ui.completedHeading.textContent = reached ? "Целевая высота подтверждена" : "Текущая высота подтверждена"; ui.completedSummary.textContent = `Физически измерено: ${formatCm(result.measuredHeightCm)} см. Цель: не менее ${formatCm(result.targetHeightCm)} см.`; ui.completedDetail.textContent = reached ? "Измеренная высота соответствует цели этого участка. Результат сохранён для следующего этапа." : `${resultText(result)} Цель участка ещё не достигнута.`; ui.belowAction.hidden = reached; ui.reachedAction.hidden = !reached; ui.belowAction.href = `/project-foundation-section-execution?project=${encodeURIComponent(projectId)}`; if (ui.completedActions?.replaceChildren) { ui.belowAction.hidden = false; ui.reachedAction.hidden = false; ui.completedActions.replaceChildren(reached ? ui.reachedAction : ui.belowAction); } }
      ui.root.setAttribute("aria-busy", "false");
    }
    async function reload() {
      try {
        aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions());
        let history;
        try { history = await repository.listFoundationSectionMeasurements(projectId, aggregate.project.active_calculation_id); }
        catch (error) { const fallback = completedFallback(); if (fallback) { record = fallback.record; render(fallback.state); return; } throw error; }
        record = history.at(-1) || null;
        if (record?.state.lifecycle === "completed") {
          if (record.state.completedSnapshot.result === "TARGET_REACHED") { render(domain.validateProgressState(record.state)); return; }
          if (assessment.lifecycle !== "ready" || assessment.source.executionStateRevision <= record.state.source.executionStateRevision) { render(domain.validateProgressState(record.state)); return; }
          record = await repository.ensureFoundationSectionMeasurement(projectId, assessment.calculationId, assessment, { expectedProjectRevision: aggregate.project.revision, timestamp: now() }); aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions());
        } else if (!record) {
          if (assessment.lifecycle !== "ready") { showBlocked(assessment.diagnostic); return; }
          record = await repository.ensureFoundationSectionMeasurement(projectId, assessment.calculationId, assessment, { expectedProjectRevision: aggregate.project.revision, timestamp: now() }); aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions());
        }
        if (assessment.lifecycle !== "ready") { showBlocked(assessment.diagnostic); return; }
        render(domain.validateProgressState(record.state, { assessment }));
      } catch (error) { showBlocked(domain.diagnostic(error?.code, error?.userMessage)); }
    }
    async function mutate(value) {
      if (busy) return; setBusy(true); ui.actionError.hidden = true; ui.inputError.hidden = true;
      try {
        aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions()); if (assessment.lifecycle !== "ready") { showBlocked(assessment.diagnostic); return; }
        const metadata = { assessment, timestamp: now(), operationId: operationId(), expectedRevision: state.revision, expectedFingerprint: state.fingerprint, explicitConfirmation: true };
        const next = domain.completeMeasurement(state, value, metadata);
        const saved = await repository.updateFoundationSectionMeasurement(projectId, assessment.calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: record.revision, expectedDomainRevision: state.revision, timestamp: metadata.timestamp, operationId: metadata.operationId }); record = saved.progress || saved; render(domain.validateProgressState(record.state, { assessment }));
      } catch (error) {
        if (error?.code === "MEASUREMENT_VALUE_INVALID") { ui.inputError.textContent = error.userMessage; ui.inputError.hidden = false; ui.input.focus?.(); }
        else if (["REVISION_CONFLICT", "PROGRESS_REVISION_CONFLICT"].includes(error?.code)) await reload();
        else { ui.actionError.textContent = error?.userMessage || "Не удалось сохранить измерение."; ui.actionError.hidden = false; }
      } finally { setBusy(false); }
    }
    async function start() {
      if (!dependenciesReady()) { showBlocked({ message: "Проверка физического измерения временно недоступна." }); return null; }
      try { projectId = domain.projectIdentityFromLocation(target.location); } catch (error) { showBlocked({ message: error.userMessage }); return null; }
      repository = repositoryFactory(); await repository.initialize(); ui.form.addEventListener("submit", (event) => { event.preventDefault(); mutate(ui.input.value); });
      target.addEventListener("pageshow", reload); target.addEventListener("yarnai-project-changed", reload); target.addEventListener("pagehide", close, { once: true }); if (typeof target.BroadcastChannel === "function") { channel = new target.BroadcastChannel("yarnai-projects-v1"); channel.addEventListener("message", (event) => { if (!event.data?.project_id || event.data.project_id === projectId) reload(); }); }
      await reload(); return { projectId, assessment, state };
    }
    async function close() { channel?.close(); await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, reload, close, mutate, render, resultText });
  }
  const api = Object.freeze({ createController, formatCm }); globalObject.YarnAIFoundationSectionMeasurementWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
