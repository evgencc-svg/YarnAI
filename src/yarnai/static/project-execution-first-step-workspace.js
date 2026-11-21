"use strict";

(function exposeProjectExecutionFirstStepWorkspace(globalObject) {
  const USER_FACING_STEP_TITLES = Object.freeze({
    CAST_ON: "Набор петель",
  });

  function userFacingStepTitle(step) {
    return USER_FACING_STEP_TITLES[step?.type] || "Первый шаг";
  }

  function formatUserTimestamp(value, options = {}) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const formatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    };
    if (options.timeZone) formatOptions.timeZone = options.timeZone;
    return new Intl.DateTimeFormat(options.locale || "ru-RU", formatOptions).format(date);
  }

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
  function assessAggregateReadiness(options = {}) {
    const domain = options.domain;
    const source = domain.assessSource({
      projectIdentity: options.projectId,
      project: options.aggregate?.project,
      progress: options.aggregate?.progress,
      stage66Record: options.stage66Record,
      stage66Domain: options.stage66Domain,
    });
    if (!source.ready) return Object.freeze({ ready: false, canEnsure: false, source, record: null, state: null, snapshot: null, diagnostic: source.diagnostic });
    const record = options.record || domain.stage67RecordFrom(options.aggregate?.progress, source.source.calculationId);
    if (!record) return Object.freeze({ ready: true, canEnsure: true, source, record: null, state: null, snapshot: null, diagnostic: null });
    try {
      if (record.project_id !== options.projectId || record.calculation_id !== source.source.calculationId) throw problem("SOURCE_PROJECT_MISMATCH", "Первый шаг относится к другому проекту.");
      const state = domain.validateProgressState(record.state, { projectIdentity: options.projectId, calculationId: source.source.calculationId });
      const snapshot = domain.validateBinding(state.snapshot, source);
      return Object.freeze({ ready: true, canEnsure: false, source, record, state, snapshot, diagnostic: null });
    } catch (error) {
      const code = error?.code || "STAGE66_SOURCE_INVALID";
      return Object.freeze({ ready: false, canEnsure: false, source, record, state: null, snapshot: null, diagnostic: domain.diagnostic(code, error?.userMessage || error?.message || "Первый шаг повреждён.") });
    }
  }
  function recoveryHref(domain, diagnostic, projectId) {
    const path = diagnostic?.recovery?.path || "/saved-projects";
    if (path === "/saved-projects") return "/saved-projects";
    const checked = domain.safeDestination(`${path}?project=${encodeURIComponent(projectId)}`, projectId);
    return checked.valid ? checked.href : "/saved-projects";
  }
  function createController(options = {}) {
    const target = options.globalObject || globalObject;
    const documentObject = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectExecutionFirstStep;
    const stage66Domain = options.stage66Domain || target.YarnAIProjectExecutionStart;
    const routes = options.routes || target.YarnAIUserWorkspaceEntry;
    const system = options.system || target.YarnAIProjectSystem;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString());
    const operationId = options.operationId || (() => system.uuidv7());
    const formatTimestamp = options.formatTimestamp || ((value) => formatUserTimestamp(value, {
      locale: options.locale,
      timeZone: options.timeZone,
    }));
    const ui = options.ui || (documentObject ? {
      root: documentObject.querySelector("#execution-first-step-root"),
      loading: documentObject.querySelector("#execution-first-step-loading"),
      blocked: documentObject.querySelector("#execution-first-step-blocked"),
      blockedMessage: documentObject.querySelector("#execution-first-step-blocked-message"),
      blockedCode: documentObject.querySelector("#execution-first-step-diagnostic-code"),
      recovery: documentObject.querySelector("#execution-first-step-recovery"),
      retry: documentObject.querySelector("#execution-first-step-retry"),
      content: documentObject.querySelector("#execution-first-step-content"),
      title: documentObject.querySelector("#execution-first-step-project-title"),
      lifecycle: documentObject.querySelector("#execution-first-step-lifecycle"),
      instruction: documentObject.querySelector("#execution-first-step-instruction"),
      target: documentObject.querySelector("#execution-first-step-target"),
      yarn: documentObject.querySelector("#execution-first-step-yarn"),
      tools: documentObject.querySelector("#execution-first-step-tools"),
      gauge: documentObject.querySelector("#execution-first-step-gauge"),
      technique: documentObject.querySelector("#execution-first-step-technique"),
      warningsSection: documentObject.querySelector("#execution-first-step-warnings-section"),
      warnings: documentObject.querySelector("#execution-first-step-warnings"),
      assumptionsSection: documentObject.querySelector("#execution-first-step-assumptions-section"),
      assumptions: documentObject.querySelector("#execution-first-step-assumptions"),
      ready: documentObject.querySelector("#execution-first-step-ready"),
      active: documentObject.querySelector("#execution-first-step-active"),
      paused: documentObject.querySelector("#execution-first-step-paused"),
      checking: documentObject.querySelector("#execution-first-step-checking"),
      completed: documentObject.querySelector("#execution-first-step-completed"),
      activate: documentObject.querySelector("#execution-first-step-activate"),
      pause: documentObject.querySelector("#execution-first-step-pause"),
      check: documentObject.querySelector("#execution-first-step-check"),
      resume: documentObject.querySelector("#execution-first-step-resume"),
      pausedAt: documentObject.querySelector("#execution-first-step-paused-at"),
      count: documentObject.querySelector("#execution-first-step-count"),
      confirmation: documentObject.querySelector("#execution-first-step-confirmation"),
      complete: documentObject.querySelector("#execution-first-step-complete"),
      cancelCheck: documentObject.querySelector("#execution-first-step-cancel-check"),
      checkFeedback: documentObject.querySelector("#execution-first-step-check-feedback"),
      completedCount: documentObject.querySelector("#execution-first-step-completed-count"),
      completedAt: documentObject.querySelector("#execution-first-step-completed-at"),
      nextStep: documentObject.querySelector("#execution-first-step-next-step"),
      status: documentObject.querySelector("#execution-first-step-status"),
    } : {});
    let repository = null;
    let projectId = "";
    let aggregate = null;
    let assessment = null;
    let snapshot = null;
    let busy = false;
    let hydrated = false;
    let eventsBound = false;

    function dependencies() { return domain && stage66Domain && routes && system; }
    function setBusy(value) {
      busy = value;
      ui.root?.setAttribute("aria-busy", String(value));
      [ui.activate, ui.pause, ui.check, ui.resume, ui.complete, ui.cancelCheck].forEach((button) => { if (button) button.disabled = value; });
    }
    function replaceList(element, values) {
      if (!element || !documentObject) return;
      element.replaceChildren(...values.map((value) => {
        const item = documentObject.createElement("li");
        item.textContent = value.message;
        return item;
      }));
    }
    function renderBlocked(diagnostic) {
      ui.loading.hidden = true;
      ui.content.hidden = true;
      ui.blocked.hidden = false;
      ui.blockedMessage.textContent = diagnostic?.message || "Первый шаг недоступен.";
      ui.blockedCode.textContent = diagnostic?.code || "STAGE66_SOURCE_INVALID";
      ui.recovery.href = recoveryHref(domain, diagnostic, projectId);
      ui.recovery.textContent = diagnostic?.recovery?.label || "Мои проекты";
      if (ui.retry) ui.retry.hidden = diagnostic?.code !== "STORAGE_UNAVAILABLE";
      ui.blockedMessage.focus();
      return diagnostic;
    }
    function renderContext() {
      const context = snapshot.context;
      ui.title.textContent = userFacingStepTitle(snapshot.step);
      ui.instruction.textContent = snapshot.step.instruction;
      ui.target.textContent = `${snapshot.step.targetStitchCount} петель`;
      ui.yarn.textContent = context.yarn;
      ui.tools.textContent = context.tools.join(", ");
      ui.gauge.textContent = context.gaugeSummary.display;
      ui.technique.textContent = context.technique;
      replaceList(ui.warnings, context.warnings);
      replaceList(ui.assumptions, context.assumptions);
      ui.warningsSection.hidden = context.warnings.length === 0;
      ui.assumptionsSection.hidden = context.assumptions.length === 0;
    }
    function renderSnapshot(nextSnapshot, options = {}) {
      const draft = options.preserveDraft && ui.checking && !ui.checking.hidden
        ? { value: ui.count.value, checked: ui.confirmation.checked }
        : null;
      snapshot = domain.validateSnapshot(nextSnapshot);
      renderContext();
      ui.loading.hidden = true;
      ui.blocked.hidden = true;
      ui.content.hidden = false;
      ui.lifecycle.textContent = snapshot.lifecycle;
      ["ready", "active", "paused", "checking", "completed"].forEach((name) => { ui[name].hidden = snapshot.lifecycle !== name; });
      if (snapshot.lifecycle === "paused") ui.pausedAt.textContent = formatTimestamp(snapshot.timestamps.lastPausedAt);
      if (snapshot.lifecycle === "checking") {
        const stored = snapshot.check.observedStitchCount;
        ui.count.value = draft ? draft.value : stored === null ? "" : String(stored);
        ui.confirmation.checked = draft ? draft.checked : snapshot.check.explicitConfirmation;
        ui.checkFeedback.textContent = snapshot.check.result === "mismatch"
          ? domain.mismatchMessage(stored, snapshot.step.targetStitchCount) : "";
      }
      if (snapshot.lifecycle === "completed") {
        ui.completedCount.textContent = `${snapshot.check.observedStitchCount} петель`;
        ui.completedAt.textContent = formatTimestamp(snapshot.timestamps.completedAt);
        if (ui.nextStep) {
          const checked = domain.safeDestination(snapshot.nextAction.destination, snapshot.projectIdentity);
          ui.nextStep.hidden = !checked.valid;
          if (checked.valid) ui.nextStep.href = checked.href;
        }
      }
      ui.status.textContent = {
        ready: "Первый шаг готов к началу.",
        active: "Шаг выполняется.",
        paused: "Выполнение приостановлено.",
        checking: "Пересчитайте петли и явно подтвердите результат.",
        completed: "Первый шаг завершён и сохранён.",
      }[snapshot.lifecycle];
      setBusy(false);
      return snapshot;
    }
    async function ensureRecord() {
      const createdAt = now();
      const created = domain.createSnapshot(assessment.source, { createdAt, operationId: operationId() });
      const state = domain.createProgressState(created);
      return repository.ensureProjectExecutionFirstStep(projectId, created.calculationId, state, {
        timestamp: createdAt,
        operationKind: "FIRST_STEP_CREATED",
        projectStage: "project_execution_first_step_ready",
      });
    }
    async function refresh(options = {}) {
      aggregate = await repository.getProject(projectId);
      assessment = assessAggregateReadiness({ aggregate, projectId, domain, stage66Domain });
      if (!assessment.ready) return renderBlocked(assessment.diagnostic);
      if (assessment.canEnsure) {
        if (options.ensure === false) return renderBlocked(domain.diagnostic("STAGE66_SOURCE_INVALID", "Запись первого шага не найдена."));
        await ensureRecord();
        aggregate = await repository.getProject(projectId);
        assessment = assessAggregateReadiness({ aggregate, projectId, domain, stage66Domain });
        if (!assessment.ready || !assessment.snapshot) return renderBlocked(assessment.diagnostic || domain.diagnostic("STAGE66_SOURCE_INVALID", "Первый шаг не удалось восстановить."));
      }
      return renderSnapshot(assessment.snapshot, { preserveDraft: options.preserveDraft });
    }
    function command() {
      return { expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint, operationId: operationId(), timestamp: now() };
    }
    async function persist(nextSnapshot, operation) {
      const state = domain.createProgressState(nextSnapshot);
      const saved = await repository.updateProjectExecutionFirstStep(projectId, snapshot.calculationId, state, {
        expectedRevision: snapshot.revision,
        expectedFingerprint: snapshot.fingerprint,
        operationId: operation.operationId,
        timestamp: operation.timestamp,
        projectStage: nextSnapshot.lifecycle === "completed" ? "project_execution_first_step_completed" : `project_execution_first_step_${nextSnapshot.lifecycle}`,
      });
      const checked = domain.validateProgressState(saved.progress.state, { projectIdentity: projectId, calculationId: snapshot.calculationId });
      return renderSnapshot(checked.snapshot);
    }
    async function perform(action) {
      if (!hydrated || busy || !snapshot) return null;
      setBusy(true);
      ui.checkFeedback.textContent = "";
      const operation = command();
      try {
        let next;
        if (action === "activate") next = domain.activateFirstStep(snapshot, operation);
        else if (action === "pause") next = domain.pauseFirstStep(snapshot, operation);
        else if (action === "resume") next = domain.resumeFirstStep(snapshot, operation);
        else if (action === "checking") next = domain.startCheckingFirstStep(snapshot, operation);
        else if (action === "cancel-check") next = domain.returnToActiveFromChecking(snapshot, operation);
        else if (action === "complete") {
          const raw = ui.count.value.trim();
          const observedStitchCount = raw === "" ? null : Number(raw);
          const result = domain.completeFirstStep(snapshot, { observedStitchCount, explicitConfirmation: ui.confirmation.checked === true }, operation);
          await persist(result.snapshot, operation);
          if (result.diagnostic) ui.checkFeedback.textContent = result.diagnostic.message;
          return result.snapshot;
        } else throw problem("LIFECYCLE_TRANSITION_INVALID", "Неизвестное действие первого шага.");
        return await persist(next, operation);
      } catch (error) {
        const code = error?.code || "STORAGE_UNAVAILABLE";
        if (code === "COUNT_INVALID") {
          ui.checkFeedback.textContent = error.userMessage || error.message;
          ui.count.focus();
        } else if (code === "CONFIRMATION_REQUIRED") {
          ui.checkFeedback.textContent = error.userMessage || error.message;
          ui.confirmation.focus();
        } else if (code === "REVISION_CONFLICT" || code === "SOURCE_FINGERPRINT_MISMATCH" || code === "LIFECYCLE_TRANSITION_INVALID") {
          await refresh({ ensure: false, preserveDraft: true }).catch(() => undefined);
          ui.status.textContent = `${error.userMessage || error.message} Код: ${code}`;
        } else {
          return renderBlocked(domain.diagnostic(code, error?.userMessage || error?.message || "Не удалось сохранить первый шаг."));
        }
        return null;
      } finally {
        if (!ui.content.hidden) setBusy(false);
      }
    }
    async function handlePageShow() {
      if (!hydrated || busy) return;
      await waitForNativeRestoration(target);
      await refresh({ ensure: false, preserveDraft: true }).catch((error) => renderBlocked(domain.diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message || "Не удалось восстановить первый шаг.")));
    }
    function bindEvents() {
      if (eventsBound) return;
      eventsBound = true;
      ui.activate.addEventListener("click", () => perform("activate"));
      ui.pause.addEventListener("click", () => perform("pause"));
      ui.check.addEventListener("click", () => perform("checking"));
      ui.resume.addEventListener("click", () => perform("resume"));
      ui.complete.addEventListener("click", () => perform("complete"));
      ui.cancelCheck.addEventListener("click", () => perform("cancel-check"));
      ui.retry?.addEventListener("click", () => target.location.reload?.());
      target.addEventListener("pageshow", handlePageShow);
      target.addEventListener("pagehide", close, { once: true });
    }
    async function startController() {
      if (!documentObject || !dependencies()) throw problem("DEPENDENCY_MISSING", "Экран первого шага загружен не полностью.");
      await waitForPageShow(target);
      await waitForNativeRestoration(target);
      projectId = routes.projectIdentityFromLocation(target.location, system.isUuidv7);
      if (!projectId || target.location.pathname !== "/project-execution-first-step") {
        renderBlocked(domain.diagnostic("PROJECT_NOT_FOUND", "Откройте первый шаг из начатого проекта."));
        return null;
      }
      bindEvents();
      repository = repositoryFactory();
      try {
        await repository.initialize();
        await refresh({ ensure: true });
      } catch (error) {
        const code = error?.code === "PROJECT_NOT_FOUND" ? "PROJECT_NOT_FOUND" : error?.code || "STORAGE_UNAVAILABLE";
        renderBlocked(domain.diagnostic(code, error?.userMessage || error?.message || "Не удалось открыть первый шаг."));
        return null;
      }
      await waitForNativeRestoration(target);
      hydrated = true;
      bindEvents();
      return { projectId, aggregate, assessment, snapshot };
    }
    async function close() { await repository?.close?.().catch(() => undefined); }
    return Object.freeze({
      start: startController,
      close,
      refresh,
      perform,
      renderSnapshot,
      renderBlocked,
      getState: () => ({ projectId, aggregate, assessment, snapshot, busy, hydrated }),
    });
  }

  const api = Object.freeze({ userFacingStepTitle, formatUserTimestamp, waitForPageShow, waitForNativeRestoration, assessAggregateReadiness, recoveryHref, createController });
  globalObject.YarnAIProjectExecutionFirstStepWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
