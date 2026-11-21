"use strict";

(function exposeProjectExecutionStartWorkspace(globalObject) {
  function problem(code, message) {
    const value = new Error(message);
    value.code = code;
    value.userMessage = message;
    return value;
  }
  function waitForPageShow(target) {
    return new Promise((resolve) => target.addEventListener("pageshow", resolve, { once: true }));
  }
  function waitForNativeRestoration(target) {
    const frame = typeof target.requestAnimationFrame === "function"
      ? (resolve) => target.requestAnimationFrame(resolve)
      : (resolve) => target.setTimeout(resolve, 0);
    return new Promise((resolve) => frame(() => frame(resolve)));
  }
  function latestProgress(aggregate, kind, calculationId = null) {
    return (Array.isArray(aggregate?.progress) ? aggregate.progress : [])
      .filter((entry) => entry?.kind === kind && (!calculationId || entry?.calculation_id === calculationId) && !entry?.deleted_at)
      .sort((left, right) => String(left.updated_at || "").localeCompare(String(right.updated_at || "")))
      .at(-1) || null;
  }
  function hrefFor(domain, path, projectId) {
    const checked = domain.safeDestination(`${path}?project=${encodeURIComponent(projectId)}`, projectId);
    return checked.valid ? checked.href : "";
  }
  function buildStage65Verification(options) {
    const result = options.planWorkspace.assessAggregateReadiness({
      aggregate: options.aggregate,
      projectId: options.projectId,
      domain: options.planDomain,
      calculationDomain: options.calculationDomain,
      initialization: options.initialization,
      gauge: options.gauge,
      experience: options.experience,
      readiness: options.readiness,
    });
    if (!result.ready) return { verified: null, sourceProblem: result.problem };
    return { verified: result.verified, sourceProblem: null };
  }
  function assessAggregateReadiness(options = {}) {
    const domain = options.domain;
    const existingRecord = latestProgress(options.aggregate, domain.PROGRESS_KIND);
    const existing = domain.existingStatus(existingRecord, { projectIdentity: options.projectId });
    if (existing?.valid) {
      return Object.freeze({
        ready: false,
        started: true,
        existingRecord,
        existing,
        assessment: null,
        diagnostic: existing.diagnostic,
      });
    }
    if (existing && !existing.valid) {
      return Object.freeze({
        ready: false,
        started: false,
        existingRecord,
        existing,
        assessment: null,
        diagnostic: existing.diagnostic,
      });
    }
    let verification;
    try {
      verification = buildStage65Verification(options);
    } catch (sourceProblem) {
      verification = { verified: null, sourceProblem };
    }
    const calculationId = verification.verified?.calculation?.record?.calculation_id || options.aggregate?.project?.active_calculation_id || null;
    const planRecord = calculationId ? latestProgress(options.aggregate, "PROJECT_EXECUTION_PLAN_PREPARATION", calculationId) : null;
    const assessment = domain.assessReadiness({
      projectIdentity: options.projectId,
      project: options.aggregate?.project,
      progress: options.aggregate?.progress,
      planRecord,
      verified: verification.verified,
      sourceProblem: verification.sourceProblem,
      planDomain: options.planDomain,
    });
    return Object.freeze({
      ready: assessment.ready,
      started: false,
      existingRecord: null,
      existing: null,
      assessment,
      diagnostic: assessment.diagnostic,
    });
  }
  function recoveryHref(domain, diagnostic, projectId) {
    const path = diagnostic?.recovery?.path || "/user-workspace-entry";
    if (path === "/saved-projects") return path;
    return hrefFor(domain, path, projectId) || "/saved-projects";
  }
  function createController(options = {}) {
    const target = options.globalObject || globalObject;
    const documentObject = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectExecutionStart;
    const planDomain = options.planDomain || target.YarnAIProjectExecutionPlan;
    const planWorkspace = options.planWorkspace || target.YarnAIProjectExecutionPlanWorkspace;
    const calculationDomain = options.calculationDomain || target.YarnAIProjectCalculationEntry;
    const initialization = options.initialization || target.YarnAIProjectInitialization;
    const gauge = options.gauge || target.YarnAISwatchGauge;
    const experience = options.experience || target.YarnAIProjectDetailsExperience;
    const readiness = options.readiness || target.YarnAIProjectReadiness;
    const routes = options.routes || target.YarnAIUserWorkspaceEntry;
    const system = options.system || target.YarnAIProjectSystem;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString());
    const ui = options.ui || (documentObject ? {
      loading: documentObject.querySelector("#execution-start-loading"),
      blocked: documentObject.querySelector("#execution-start-blocked"),
      blockedMessage: documentObject.querySelector("#execution-start-blocked-message"),
      blockedCode: documentObject.querySelector("#execution-start-diagnostic-code"),
      recovery: documentObject.querySelector("#execution-start-recovery"),
      ready: documentObject.querySelector("#execution-start-ready"),
      started: documentObject.querySelector("#execution-start-started"),
      title: documentObject.querySelector("#execution-start-project-title"),
      product: documentObject.querySelector("#execution-start-product"),
      size: documentObject.querySelector("#execution-start-size"),
      recipient: documentObject.querySelector("#execution-start-recipient"),
      yarn: documentObject.querySelector("#execution-start-yarn"),
      tools: documentObject.querySelector("#execution-start-tools"),
      technique: documentObject.querySelector("#execution-start-technique"),
      gaugeValue: documentObject.querySelector("#execution-start-gauge"),
      materials: documentObject.querySelector("#execution-start-materials"),
      warningsSection: documentObject.querySelector("#execution-start-warnings-section"),
      warnings: documentObject.querySelector("#execution-start-warnings"),
      assumptions: documentObject.querySelector("#execution-start-assumptions"),
      firstStep: documentObject.querySelector("#execution-start-first-step"),
      acknowledgment: documentObject.querySelector("#execution-start-acknowledgment"),
      start: documentObject.querySelector("#execution-start-button"),
      status: documentObject.querySelector("#execution-start-status"),
      startedAt: documentObject.querySelector("#execution-start-started-at"),
      startedStep: documentObject.querySelector("#execution-start-started-step"),
      nextMessage: documentObject.querySelector("#execution-start-next-message"),
      firstStepLink: documentObject.querySelector("#execution-start-first-step-link"),
      back: documentObject.querySelector("#execution-start-back"),
      startedBack: documentObject.querySelector("#execution-start-started-back"),
      details: documentObject.querySelector("#execution-start-technical-details"),
      detailsBody: documentObject.querySelector("#execution-start-technical-body"),
    } : {});
    let repository = null;
    let projectId = "";
    let aggregate = null;
    let result = null;
    let busy = false;
    let hydrated = false;

    function dependencies() {
      return domain && planDomain && planWorkspace && calculationDomain && initialization && gauge && experience && readiness && routes && system;
    }
    function readinessOptions(value) {
      return { aggregate: value, projectId, domain, planDomain, planWorkspace, calculationDomain, initialization, gauge, experience, readiness };
    }
    function replaceList(element, values, valueOf = (value) => value.message || String(value)) {
      if (!element || !documentObject) return;
      element.replaceChildren(...(values || []).map((value) => {
        const item = documentObject.createElement("li");
        item.textContent = valueOf(value);
        return item;
      }));
    }
    function renderPreparation(preparation, title) {
      ui.title.textContent = title || "Проект вязания";
      ui.product.textContent = preparation.product;
      ui.size.textContent = preparation.size;
      ui.recipient.textContent = preparation.recipient;
      ui.yarn.textContent = preparation.yarn;
      ui.tools.textContent = preparation.tools.join(", ");
      ui.technique.textContent = preparation.technique;
      ui.gaugeValue.textContent = preparation.gaugeSummary.display;
      ui.firstStep.textContent = preparation.firstStep.instruction;
      replaceList(ui.materials, preparation.materials);
      replaceList(ui.warnings, preparation.warnings);
      replaceList(ui.assumptions, preparation.assumptions);
      ui.warningsSection.hidden = preparation.warnings.length === 0 && preparation.assumptions.length === 0;
    }
    function snapshotPreparation(snapshot) {
      return {
        product: snapshot.product,
        size: snapshot.size,
        recipient: snapshot.recipient,
        yarn: snapshot.yarn,
        tools: snapshot.tools,
        technique: snapshot.technique,
        materials: snapshot.materials,
        gaugeSummary: snapshot.gaugeSummary,
        firstStep: snapshot.firstStep,
        warnings: snapshot.warnings,
        assumptions: snapshot.assumptions,
      };
    }
    function renderBlocked(diagnostic) {
      ui.loading.hidden = true;
      ui.ready.hidden = true;
      ui.started.hidden = true;
      ui.blocked.hidden = false;
      ui.blockedMessage.textContent = diagnostic?.message || "Начало выполнения заблокировано.";
      ui.blockedCode.textContent = diagnostic?.code || "STAGE65_SOURCE_INVALID";
      ui.recovery.href = recoveryHref(domain, diagnostic, projectId);
      ui.recovery.textContent = diagnostic?.recovery?.label || "Вернуться к проекту";
      ui.blockedMessage.focus();
      return diagnostic;
    }
    function renderReady() {
      const preparation = result.assessment.preparation;
      renderPreparation(preparation, aggregate.project.title);
      ui.loading.hidden = true;
      ui.blocked.hidden = true;
      ui.started.hidden = true;
      ui.ready.hidden = false;
      const acknowledged = ui.acknowledgment.checked === true;
      ui.start.disabled = busy || !acknowledged;
      ui.status.textContent = acknowledged
        ? "Готовность подтверждена. Можно начать вязание."
        : "Подтвердите, что материалы и инструменты подготовлены.";
      ui.detailsBody.textContent = `Проверены проект, сведения, основа, плотность, активный расчёт и подтверждённый план. Первый шаг получен из сохранённого плана: ${preparation.firstStep.instruction}.`;
      return preparation;
    }
    function renderStarted(existing) {
      const snapshot = existing.snapshot;
      renderPreparation(snapshotPreparation(snapshot), aggregate?.project?.title);
      ui.loading.hidden = true;
      ui.blocked.hidden = true;
      ui.ready.hidden = true;
      ui.started.hidden = false;
      ui.startedAt.textContent = snapshot.startedAt;
      ui.startedStep.textContent = snapshot.firstStep.instruction;
      ui.nextMessage.textContent = "Первый подтверждённый шаг доступен для выполнения.";
      if (ui.firstStepLink) {
        ui.firstStepLink.href = hrefFor(domain, "/project-execution-first-step", projectId) || "/saved-projects";
        ui.firstStepLink.hidden = false;
      }
      ui.status.textContent = "Выполнение уже начато. Повторная запись не создана.";
      ui.started.focus();
      return snapshot;
    }
    async function refresh() {
      aggregate = await repository.getProject(projectId);
      result = assessAggregateReadiness(readinessOptions(aggregate));
      if (result.started) return renderStarted(result.existing);
      if (!result.ready) return renderBlocked(result.diagnostic);
      return renderReady();
    }
    async function startExecution() {
      if (busy || !hydrated) return null;
      if (!ui.acknowledgment.checked) {
        ui.status.textContent = "Подтвердите, что материалы и инструменты подготовлены.";
        ui.acknowledgment.focus();
        return null;
      }
      busy = true;
      ui.start.disabled = true;
      try {
        aggregate = await repository.getProject(projectId);
        result = assessAggregateReadiness(readinessOptions(aggregate));
        if (result.started) return renderStarted(result.existing);
        if (!result.ready) return renderBlocked(result.diagnostic);
        const at = now();
        let snapshot = domain.buildDraft(result.assessment, { createdAt: at, acknowledged: true, acknowledgedAt: at, createdBy: "project_owner" });
        snapshot = domain.markReady(snapshot, { timestamp: at });
        snapshot = domain.start(snapshot, { startedAt: at });
        const state = domain.createProgressState(snapshot, result.assessment.source.calculationId);
        const saved = await repository.ensureProjectExecutionStart(projectId, result.assessment.source.calculationId, state, {
          timestamp: at,
          operationKind: "PROJECT_EXECUTION_START_STARTED",
          projectStage: "project_execution_started",
        });
        const checked = domain.existingStatus(saved, { projectIdentity: projectId });
        if (!checked?.valid) throw problem(checked?.diagnostic?.code || "STAGE65_SOURCE_INVALID", checked?.diagnostic?.message || "Не удалось проверить сохранённое начало.");
        result = { ready: false, started: true, existingRecord: saved, existing: checked, assessment: null, diagnostic: checked.diagnostic };
        return renderStarted(checked);
      } catch (error) {
        const code = error?.code || "STAGE65_SOURCE_INVALID";
        return renderBlocked(domain.diagnostic(code, error?.userMessage || error?.message || "Не удалось безопасно начать выполнение."));
      } finally {
        busy = false;
        if (!result?.started && result?.ready) renderReady();
      }
    }
    function bindEvents() {
      ui.acknowledgment?.addEventListener("change", () => {
        if (!hydrated || busy || !result?.ready) return;
        renderReady();
      });
      ui.start?.addEventListener("click", startExecution);
      target.addEventListener("pagehide", close, { once: true });
    }
    async function startController() {
      if (!documentObject || !dependencies()) throw problem("DEPENDENCY_MISSING", "Экран начала загружен не полностью.");
      await waitForPageShow(target);
      await waitForNativeRestoration(target);
      projectId = routes.projectIdentityFromLocation(target.location, system.isUuidv7);
      if (!projectId || target.location.pathname !== "/project-execution-start") {
        renderBlocked(domain.diagnostic("PROJECT_NOT_FOUND", "Откройте подготовку к началу из сохранённого проекта."));
        return null;
      }
      ui.back.href = hrefFor(domain, "/user-workspace-entry", projectId);
      ui.startedBack.href = "/saved-projects";
      repository = repositoryFactory();
      await repository.initialize();
      await refresh();
      await waitForNativeRestoration(target);
      if (result?.ready) {
        ui.acknowledgment.checked = false;
        renderReady();
      }
      hydrated = true;
      bindEvents();
      return { projectId, aggregate, result };
    }
    async function close() { await repository?.close?.().catch(() => undefined); }
    return Object.freeze({
      start: startController,
      close,
      refresh,
      startExecution,
      renderReady,
      renderBlocked,
      renderStarted,
      getState: () => ({ projectId, aggregate, result, busy, hydrated }),
    });
  }

  const api = Object.freeze({
    waitForPageShow,
    waitForNativeRestoration,
    latestProgress,
    buildStage65Verification,
    assessAggregateReadiness,
    recoveryHref,
    createController,
  });
  globalObject.YarnAIProjectExecutionStartWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
