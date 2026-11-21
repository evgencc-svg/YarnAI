"use strict";

(function exposeProjectExecutionNextStepWorkspace(globalObject) {
  const STEP_TITLES = Object.freeze({ FOUNDATION_SECTION: "Начальный участок" });

  function userFacingStepTitle(step) { return STEP_TITLES[step?.type] || "Следующий шаг"; }
  function formatUserTimestamp(value, options = {}) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "";
    const formatOptions = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    if (options.timeZone) formatOptions.timeZone = options.timeZone;
    return new Intl.DateTimeFormat(options.locale || "ru-RU", formatOptions).format(date);
  }
  function problem(code, message) { const value = new Error(message); value.code = code; value.userMessage = message; return value; }
  function waitForPageShow(target) { return new Promise((resolve) => target.addEventListener("pageshow", resolve, { once: true })); }
  function waitForNativeRestoration(target) {
    const frame = typeof target.requestAnimationFrame === "function" ? (resolve) => target.requestAnimationFrame(resolve) : (resolve) => target.setTimeout(resolve, 0);
    return new Promise((resolve) => frame(() => frame(resolve)));
  }
  function assessAggregateReadiness(options = {}) {
    const domain = options.domain;
    const assessment = domain.assessSource({
      projectIdentity: options.projectId,
      project: options.aggregate?.project,
      progress: options.aggregate?.progress,
      stage65Record: options.stage65Record,
      stage66Record: options.stage66Record,
      stage67Record: options.stage67Record,
      stage65Domain: options.stage65Domain,
      stage66Domain: options.stage66Domain,
      stage67Domain: options.stage67Domain,
    });
    if (assessment.lifecycle === "blocked") return Object.freeze({ ready: false, canEnsure: false, assessment, record: null, snapshot: null, diagnostic: assessment.diagnostic });
    const record = options.record || domain.latestRecord(options.aggregate?.progress, domain.KIND, assessment.calculationId);
    if (!record) return Object.freeze({ ready: true, canEnsure: true, assessment, record: null, snapshot: null, diagnostic: null });
    try {
      if (record.project_id !== options.projectId || record.calculation_id !== assessment.calculationId) throw problem("SOURCE_PROJECT_MISMATCH", "Подготовка относится к другому проекту.");
      const state = domain.validateProgressState(record.state, { projectIdentity: options.projectId, calculationId: assessment.calculationId });
      const snapshot = domain.validateBinding(state.snapshot, assessment);
      return Object.freeze({ ready: true, canEnsure: false, assessment, record, snapshot, diagnostic: null });
    } catch (error) {
      return Object.freeze({ ready: false, canEnsure: false, assessment, record, snapshot: null, diagnostic: domain.diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message) });
    }
  }
  function createController(options = {}) {
    const target = options.globalObject || globalObject;
    const documentObject = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectExecutionNextStep;
    const stage65Domain = options.stage65Domain || target.YarnAIProjectExecutionPlan;
    const stage66Domain = options.stage66Domain || target.YarnAIProjectExecutionStart;
    const stage67Domain = options.stage67Domain || target.YarnAIProjectExecutionFirstStep;
    const routes = options.routes || target.YarnAIUserWorkspaceEntry;
    const system = options.system || target.YarnAIProjectSystem;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString());
    const operationId = options.operationId || (() => system.uuidv7());
    const formatTimestamp = options.formatTimestamp || ((value) => formatUserTimestamp(value, { locale: options.locale, timeZone: options.timeZone }));
    const ui = options.ui || (documentObject ? {
      root: documentObject.querySelector("#execution-next-step-root"), loading: documentObject.querySelector("#execution-next-step-loading"),
      blocked: documentObject.querySelector("#execution-next-step-blocked"), blockedMessage: documentObject.querySelector("#execution-next-step-blocked-message"),
      blockedCode: documentObject.querySelector("#execution-next-step-diagnostic-code"), retry: documentObject.querySelector("#execution-next-step-retry"),
      content: documentObject.querySelector("#execution-next-step-content"), heading: documentObject.querySelector("#execution-next-step-heading"),
      project: documentObject.querySelector("#execution-next-step-project"), completedCount: documentObject.querySelector("#execution-next-step-completed-count"),
      completedAt: documentObject.querySelector("#execution-next-step-completed-at"), preparedAt: documentObject.querySelector("#execution-next-step-prepared-at"),
      prepared: documentObject.querySelector("#execution-next-step-prepared"), unavailable: documentObject.querySelector("#execution-next-step-unavailable"),
      nextTitle: documentObject.querySelector("#execution-next-step-title"), instruction: documentObject.querySelector("#execution-next-step-instruction"),
      goal: documentObject.querySelector("#execution-next-step-goal"), yarn: documentObject.querySelector("#execution-next-step-yarn"),
      tools: documentObject.querySelector("#execution-next-step-tools"), gauge: documentObject.querySelector("#execution-next-step-gauge"),
      technique: documentObject.querySelector("#execution-next-step-technique"), warningsSection: documentObject.querySelector("#execution-next-step-warnings-section"),
      warnings: documentObject.querySelector("#execution-next-step-warnings"), assumptionsSection: documentObject.querySelector("#execution-next-step-assumptions-section"),
      assumptions: documentObject.querySelector("#execution-next-step-assumptions"), unavailableMessage: documentObject.querySelector("#execution-next-step-unavailable-message"),
      clarify: documentObject.querySelector("#execution-next-step-clarify"), status: documentObject.querySelector("#execution-next-step-status"),
    } : {});
    let repository = null;
    let projectId = "";
    let aggregate = null;
    let state = null;
    let busy = false;
    let hydrated = false;

    function dependencies() { return domain && stage65Domain && stage66Domain && stage67Domain && routes && system; }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); if (ui.retry) ui.retry.disabled = value; }
    function replaceList(element, values) {
      if (!element || !documentObject) return;
      element.replaceChildren(...values.map((value) => { const item = documentObject.createElement("li"); item.textContent = value.message; return item; }));
    }
    function renderBlocked(diagnostic) {
      ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false;
      ui.blockedMessage.textContent = diagnostic?.message || "Не удалось открыть следующий шаг.";
      ui.blockedCode.textContent = diagnostic?.code || "STORAGE_UNAVAILABLE";
      if (ui.retry) ui.retry.hidden = diagnostic?.code !== "STORAGE_UNAVAILABLE";
      ui.blocked.focus(); setBusy(false); return diagnostic;
    }
    function goalText(goal) { return goal.unit === "rows" ? `${goal.value} рядов` : `${goal.value} см`; }
    function unavailableText(code) {
      return {
        NO_NEXT_PLAN_STEP: "В подтверждённом плане после набора петель пока нет следующего шага.",
        NEXT_STEP_CONDITIONAL: "Следующий шаг требует уточнений, которых ещё нет в подтверждённом плане.",
        NEXT_STEP_INCOMPLETE: "Для следующего шага не задан измеримый критерий завершения.",
        NEXT_STEP_UNSUPPORTED: "Следующий шаг сохранён, но пока не поддерживается этим экраном.",
      }[code] || "Следующий шаг ещё не подготовлен.";
    }
    function renderSnapshot(nextSnapshot) {
      const snapshot = domain.validateSnapshot(nextSnapshot);
      ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false;
      ui.heading.textContent = snapshot.lifecycle === "prepared" ? "Следующий шаг готов" : "Нужно подготовить следующий шаг";
      ui.project.textContent = snapshot.context.product;
      ui.completedCount.textContent = `${snapshot.completedStep.observedResult.value} петель подтверждено`;
      ui.completedAt.textContent = formatTimestamp(snapshot.completedStep.completedAt);
      ui.preparedAt.textContent = formatTimestamp(snapshot.timestamps.preparedAt);
      ui.prepared.hidden = snapshot.lifecycle !== "prepared";
      ui.unavailable.hidden = snapshot.lifecycle !== "unavailable";
      if (snapshot.lifecycle === "prepared") {
        ui.nextTitle.textContent = userFacingStepTitle(snapshot.nextStep);
        ui.instruction.textContent = snapshot.nextStep.instruction;
        ui.goal.textContent = goalText(snapshot.nextStep.measurableGoal);
        ui.yarn.textContent = snapshot.context.yarn; ui.tools.textContent = snapshot.context.tools.join(", ");
        ui.gauge.textContent = snapshot.context.gauge.display; ui.technique.textContent = snapshot.context.technique;
        const warnings = [...snapshot.context.warnings, ...snapshot.nextStep.warnings];
        const assumptions = [...snapshot.context.assumptions, ...snapshot.nextStep.assumptions];
        replaceList(ui.warnings, warnings); replaceList(ui.assumptions, assumptions);
        ui.warningsSection.hidden = warnings.length === 0; ui.assumptionsSection.hidden = assumptions.length === 0;
      } else {
        ui.unavailableMessage.textContent = `${unavailableText(snapshot.reasonCode)} Набранные петли сохранены — повторять набор не нужно.`;
        if (ui.clarify) {
          const href = `/project-execution-next-step-clarification?project=${encodeURIComponent(snapshot.projectIdentity)}`;
          ui.clarify.hidden = snapshot.reasonCode !== "NEXT_STEP_CONDITIONAL" || !domain.safeDestination(href, snapshot.projectIdentity).valid;
          if (!ui.clarify.hidden) ui.clarify.href = href;
        }
      }
      ui.status.textContent = snapshot.lifecycle === "prepared" ? "Подготовка сохранена. Выполнение следующего шага ещё не начато." : "Подготовка сохранена без выдуманных параметров.";
      setBusy(false); state = { ...state, snapshot }; return snapshot;
    }
    async function refresh(options = {}) {
      aggregate = await repository.getProject(projectId);
      state = assessAggregateReadiness({ aggregate, projectId, domain, stage65Domain, stage66Domain, stage67Domain });
      if (!state.ready) return renderBlocked(state.diagnostic);
      if (state.canEnsure) {
        if (options.ensure === false) return renderBlocked(domain.diagnostic("STORAGE_UNAVAILABLE", "Подготовка следующего шага не найдена."));
        const createdAt = now();
        const snapshot = domain.createSnapshot(state.assessment, { createdAt, operationId: operationId() });
        await repository.ensureProjectExecutionNextStep(projectId, snapshot.calculationId, domain.createProgressState(snapshot), { timestamp: createdAt, operationId: snapshot.audit.operationId, operationKind: "PROJECT_EXECUTION_NEXT_STEP_PREPARED", projectStage: `project_execution_next_step_${snapshot.lifecycle}` });
        aggregate = await repository.getProject(projectId);
        state = assessAggregateReadiness({ aggregate, projectId, domain, stage65Domain, stage66Domain, stage67Domain });
      }
      if (!state.ready || !state.snapshot) return renderBlocked(state.diagnostic || domain.diagnostic("STORAGE_UNAVAILABLE", "Подготовка следующего шага не восстановлена."));
      return renderSnapshot(state.snapshot);
    }
    async function handlePageShow() {
      if (!hydrated || busy) return;
      setBusy(true);
      await waitForNativeRestoration(target);
      await refresh({ ensure: false }).catch((error) => renderBlocked(domain.diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message)));
    }
    async function start() {
      if (!documentObject || !dependencies()) throw problem("DEPENDENCY_MISSING", "Экран следующего шага загружен не полностью.");
      await waitForPageShow(target); await waitForNativeRestoration(target);
      const rawProject = new URLSearchParams(target.location.search || "").get("project");
      if (rawProject === null) return renderBlocked(domain.diagnostic("PROJECT_ID_REQUIRED"));
      projectId = routes.projectIdentityFromLocation(target.location, system.isUuidv7);
      if (!projectId || target.location.pathname !== "/project-execution-next-step") return renderBlocked(domain.diagnostic("PROJECT_ID_INVALID"));
      repository = repositoryFactory(); setBusy(true);
      try { await repository.initialize(); await refresh({ ensure: true }); }
      catch (error) { renderBlocked(domain.diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message)); }
      await waitForNativeRestoration(target); hydrated = true;
      ui.retry?.addEventListener("click", () => target.location.reload?.());
      target.addEventListener("pageshow", handlePageShow); target.addEventListener("pagehide", close, { once: true });
      return { projectId, aggregate, state };
    }
    async function close() { await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, close, refresh, renderSnapshot, renderBlocked, getState: () => ({ projectId, aggregate, state, busy, hydrated }) });
  }

  const api = Object.freeze({ userFacingStepTitle, formatUserTimestamp, waitForPageShow, waitForNativeRestoration, assessAggregateReadiness, createController });
  globalObject.YarnAIProjectExecutionNextStepWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
