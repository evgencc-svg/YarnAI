"use strict";

(function exposeFoundationSectionExecutionWorkspace(globalObject) {
  function createController(options = {}) {
    const target = options.globalObject || globalObject; const doc = options.document || target.document;
    const domain = options.domain || target.YarnAIFoundationSectionExecution; const system = options.system || target.YarnAIProjectSystem;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7());
    const ui = options.ui || {
      root: doc.querySelector("#foundation-execution-root"), loading: doc.querySelector("#foundation-execution-loading"), blocked: doc.querySelector("#foundation-execution-blocked"), blockedMessage: doc.querySelector("#foundation-execution-blocked-message"), content: doc.querySelector("#foundation-execution-content"), status: doc.querySelector("#foundation-execution-status"), summary: doc.querySelector("#foundation-execution-summary"), guidance: doc.querySelector("#foundation-execution-guidance"), actions: doc.querySelector("#foundation-execution-actions"), start: doc.querySelector("#foundation-execution-start"), pause: doc.querySelector("#foundation-execution-pause"), resume: doc.querySelector("#foundation-execution-resume"), measure: doc.querySelector("#foundation-execution-measure"), error: doc.querySelector("#foundation-execution-action-error"),
    };
    let repository = null; let projectId = ""; let aggregate = null; let assessment = null; let record = null; let state = null; let busy = false; let channel = null;
    function dependenciesReady() { return domain && system && target.YarnAIFoundationSectionExecutionPreparation && target.YarnAIProjectExecutionPlan && target.YarnAIProjectExecutionStart && target.YarnAIProjectExecutionFirstStep && target.YarnAIProjectExecutionNextStep && target.YarnAIProjectExecutionNextStepClarification; }
    function sourceOptions() { return { projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: target.YarnAISwatchGauge, stage65Domain: target.YarnAIProjectExecutionPlan, stage66Domain: target.YarnAIProjectExecutionStart, stage67Domain: target.YarnAIProjectExecutionFirstStep, stage68Domain: target.YarnAIProjectExecutionNextStep, stage69Domain: target.YarnAIProjectExecutionNextStepClarification, stage70Domain: target.YarnAIFoundationSectionExecutionPreparation, validatedAt: now() }; }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); [ui.start, ui.pause, ui.resume].forEach((node) => { if (node) node.disabled = value; }); }
    function showBlocked(problem) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = problem?.message || "Не удалось безопасно проверить проект."; ui.blocked.focus(); }
    function appendSummary(plan) {
      const pattern = plan.ribPattern.kind === "rib_1x1" ? "Резинка 1×1" : "Резинка 2×2";
      const method = plan.workingMethod.value === "in_round" ? "По кругу" : "Поворотными рядами";
      const entries = [["Что вязать", pattern], ["Способ вязания", method], ["Всего петель", String(plan.stitchAllocation.totalCastOn)], ["Кромочные петли", String(plan.stitchAllocation.edgeCount)], ["Рабочие петли", String(plan.stitchAllocation.workingStitches)], ["Инструмент", plan.toolConfirmation.label], ["Инструкция", plan.instructionSource.text], ["Ориентир по рядам", "Не задан"]];
      ui.summary.replaceChildren(...entries.flatMap(([term, description]) => { const dt = doc.createElement("dt"); dt.textContent = term; const dd = doc.createElement("dd"); dd.textContent = description; return [dt, dd]; }));
    }
    function render(nextState, options = {}) {
      state = nextState; ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.error.hidden = true;
      appendSummary(state.executionPlan); ui.status.dataset.state = state.lifecycle;
      const ready = state.lifecycle === "ready"; const active = state.lifecycle === "active"; const paused = state.lifecycle === "paused";
      const targetReached = options.targetReached === true; const measurementInProgress = options.measurementInProgress === true; const measurementAvailable = options.measurementAvailable !== false;
      ui.status.textContent = targetReached ? "Целевая высота подтверждена" : ready ? "Готово к началу" : active ? "Резинка в работе" : "Выполнение приостановлено";
      ui.guidance.textContent = targetReached ? "Физическое измерение подтвердило цель этого участка. Обычное продолжение резинки больше не является основной работой." : measurementInProgress ? "Проверка высоты уже открыта. Вернитесь к ней, чтобы подтвердить измеренный физический результат." : ready ? "Когда вы физически начнёте вязать резинку, зафиксируйте начало." : active ? "Продолжайте вязать по плану. Достижение высоты здесь не подтверждается; чтобы измерить её, сначала явно приостановите работу." : !measurementAvailable ? "Последнее измерение было ниже цели. Явно продолжите вязание, прежде чем создавать следующую проверку высоты." : "Пауза сохранена. Можно продолжить вязание или перейти к отдельному физическому измерению.";
      ui.start.hidden = targetReached || !ready; ui.pause.hidden = targetReached || !active; ui.resume.hidden = targetReached || measurementInProgress || !paused;
      if (ui.measure) { ui.measure.hidden = !targetReached && !measurementInProgress && !(paused && measurementAvailable); ui.measure.textContent = targetReached ? "Открыть подтверждённое измерение" : measurementInProgress ? "Вернуться к измерению" : "Измерить высоту"; ui.measure.href = `/project-foundation-section-measurement?project=${encodeURIComponent(projectId)}`; }
      if (ui.actions?.replaceChildren) { const actions = []; if (!ui.start.hidden) actions.push(ui.start); if (!ui.pause.hidden) actions.push(ui.pause); if (!ui.resume.hidden) actions.push(ui.resume); if (ui.measure && !ui.measure.hidden) actions.push(ui.measure); actions.forEach((action) => { action.hidden = false; }); ui.actions.replaceChildren(...actions); }
      ui.root.setAttribute("aria-busy", "false");
    }
    async function reload() {
      try {
        aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions());
        if (assessment.lifecycle !== "ready") { showBlocked(assessment.diagnostic); return; }
        record = await repository.getFoundationSectionExecution(projectId, assessment.calculationId);
        if (!record) { record = await repository.ensureFoundationSectionExecution(projectId, assessment.calculationId, assessment, { expectedProjectRevision: aggregate.project.revision, timestamp: now() }); aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions()); }
        const checked = domain.validateProgressState(record.state, { assessment });
        let targetReached = false; let latestMeasurement = null;
        if (target.YarnAIFoundationSectionMeasurement) {
          const measurementDomain = target.YarnAIFoundationSectionMeasurement; const candidates = aggregate.progress.filter((entry) => entry?.kind === measurementDomain.KIND && entry?.project_id === projectId && entry?.calculation_id === assessment.calculationId && !entry.deleted_at);
          const boundary = measurementDomain.resolveAuthoritativeHistory(candidates); latestMeasurement = boundary.authoritativeState; targetReached = boundary.terminalReached;
          if (boundary.status !== "valid" && !targetReached) { showBlocked(boundary.diagnostic); return; }
        }
        const measurementInProgress = ["collecting", "reviewing"].includes(latestMeasurement?.lifecycle); const measurementAvailable = checked.lifecycle === "paused" && (!latestMeasurement || (latestMeasurement.completedSnapshot?.result === "BELOW_TARGET" && checked.revision > latestMeasurement.source.executionStateRevision));
        render(checked, { targetReached, measurementInProgress, measurementAvailable });
      } catch (error) { showBlocked(domain.diagnostic(error?.code, error?.userMessage)); }
    }
    async function mutate(command) {
      if (busy) return; setBusy(true); ui.error.hidden = true;
      try {
        aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions());
        if (assessment.lifecycle !== "ready") { showBlocked(assessment.diagnostic); return; }
        const metadata = { assessment, timestamp: now(), operationId: operationId(), expectedRevision: state.revision, expectedFingerprint: state.fingerprint };
        const next = command === "start" ? domain.startExecution(state, metadata) : command === "pause" ? domain.pauseExecution(state, metadata) : domain.resumeExecution(state, metadata);
        const saved = await repository.updateFoundationSectionExecution(projectId, assessment.calculationId, next, { expectedProjectRevision: aggregate.project.revision, expectedProgressRevision: record.revision, expectedDomainRevision: state.revision, timestamp: metadata.timestamp, operationId: metadata.operationId });
        record = saved.progress || saved; render(domain.validateProgressState(record.state, { assessment }));
      } catch (error) {
        if (["REVISION_CONFLICT", "PROGRESS_REVISION_CONFLICT"].includes(error?.code)) await reload();
        else { ui.error.textContent = error?.userMessage || "Не удалось сохранить действие."; ui.error.hidden = false; }
      } finally { setBusy(false); }
    }
    async function start() {
      if (!dependenciesReady()) { showBlocked({ message: "Проверка выполнения временно недоступна." }); return null; }
      try { projectId = domain.projectIdentityFromLocation(target.location); } catch (error) { showBlocked({ message: error.userMessage }); return null; }
      repository = repositoryFactory(); await repository.initialize(); ui.start.addEventListener("click", () => mutate("start")); ui.pause.addEventListener("click", () => mutate("pause")); ui.resume.addEventListener("click", () => mutate("resume"));
      target.addEventListener("pageshow", reload); target.addEventListener("yarnai-project-changed", reload); target.addEventListener("pagehide", close, { once: true });
      if (typeof target.BroadcastChannel === "function") { channel = new target.BroadcastChannel("yarnai-projects-v1"); channel.addEventListener("message", (event) => { if (!event.data?.project_id || event.data.project_id === projectId) reload(); }); }
      await reload(); return { projectId, assessment, state };
    }
    async function close() { channel?.close(); await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, reload, close, mutate, render });
  }
  const api = Object.freeze({ createController }); globalObject.YarnAIFoundationSectionExecutionWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
