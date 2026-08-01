"use strict";

(function initializePatternExecutionSessionPage(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-session-fatal"), fatalMessage: byId("execution-session-fatal-message"),
    workflow: byId("execution-session-workflow"), title: byId("execution-session-project-title"),
    status: byId("execution-session-status"), planStatus: byId("execution-session-plan-status"),
    state: byId("execution-session-state"), planFingerprint: byId("execution-session-plan-fingerprint"),
    fingerprint: byId("execution-session-fingerprint"), message: byId("execution-session-message"),
    start: byId("execution-session-start"), startAction: byId("execution-session-start-action"),
    completeAction: byId("execution-session-complete-action"), skipAction: byId("execution-session-skip-action"),
    pause: byId("execution-session-pause"), resume: byId("execution-session-resume"), rebuild: byId("execution-session-rebuild"),
    back: byId("execution-session-back"), navPlan: byId("execution-session-nav-plan"), step: byId("execution-session-step"), error: byId("execution-session-error"),
    progress: byId("execution-session-progress"), phase: byId("execution-session-phase"), component: byId("execution-session-component"),
    action: byId("execution-session-action"), count: byId("execution-session-count"), percent: byId("execution-session-percent"),
    progressMeter: byId("execution-session-progress-meter"), current: byId("execution-session-current"),
    currentTitle: byId("execution-session-current-title"), currentInstruction: byId("execution-session-current-instruction"),
    currentStatus: byId("execution-session-current-status"), currentPrerequisites: byId("execution-session-current-prerequisites"),
    currentCheckpoints: byId("execution-session-current-checkpoints"), currentBlockers: byId("execution-session-current-blockers"),
    blockers: byId("execution-session-blockers"), blockerList: byId("execution-session-blocker-list"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const sessionApi = globalObject.YarnAIPatternExecutionSession;
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть Stage 23."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !sessionApi) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    const planUrl = `/pattern-execution-plan?project=${encodeURIComponent(projectId)}`;
    ui.back.href = planUrl;
    ui.navPlan.href = planUrl;
    ui.step.href = `/pattern-execution-step?project=${encodeURIComponent(projectId)}`;
    ui.start.addEventListener("click", () => runOperation(() => sessionApi.startForProject(repository, projectId, expected())));
    ui.startAction.addEventListener("click", () => runOperation(() => sessionApi.startActionForProject(repository, projectId, currentActionId(), expected())));
    ui.completeAction.addEventListener("click", () => runOperation(() => sessionApi.completeActionForProject(repository, projectId, currentActionId(), expected())));
    ui.skipAction.addEventListener("click", () => runOperation(() => sessionApi.skipActionForProject(repository, projectId, currentActionId(), expected())));
    ui.pause.addEventListener("click", () => runOperation(() => sessionApi.pauseForProject(repository, projectId, expected())));
    ui.resume.addEventListener("click", () => runOperation(() => sessionApi.resumeForProject(repository, projectId, expected())));
    ui.rebuild.addEventListener("click", rebuildConfirmed);
    inspected = await sessionApi.ensureForProject(repository, projectId);
    render();
  }

  function render() {
    resetSections();
    const session = inspected?.executionSession || null;
    const plan = inspected?.executionPlan || null;
    ui.title.textContent = inspected?.project?.title || "Выполнение проекта";
    ui.planStatus.textContent = planStatusLabel(plan, inspected?.planValidation);
    ui.planFingerprint.textContent = plan?.planFingerprint || "—";
    ui.fingerprint.textContent = session?.sessionFingerprint || "—";
    const visibleStatus = session?.status || "waiting";
    ui.status.textContent = sessionStatusLabel(visibleStatus);
    ui.status.dataset.status = visibleStatus;
    ui.state.textContent = sessionStateLabel(visibleStatus, Boolean(session));
    hideButtons();
    ui.step.hidden = true;
    if (!session) {
      ui.message.textContent = planMessage(inspected?.reasonCode);
      return;
    }
    if (session.planSnapshot) renderProgress(session);
    if (session.status === "waiting" && inspected.planValidation?.isValid) {
      ui.message.textContent = "Готовый план проверен. Выполнение начнётся только после явного подтверждения.";
      ui.start.hidden = false;
    } else if (session.status === "starting") {
      ui.message.textContent = "Подготовка snapshot была прервана; состояние будет безопасно восстановлено при reload.";
    } else if (session.status === "active") {
      ui.message.textContent = "Сессия активна. Работайте только с текущим действием.";
      const action = currentAction(session);
      if (action?.status === "available") ui.startAction.hidden = false;
      if (action?.status === "in_progress") ui.completeAction.hidden = false;
      if (action && !action.required) ui.skipAction.hidden = false;
      ui.pause.hidden = false;
    } else if (session.status === "paused") {
      ui.message.textContent = "Прогресс сохранён. Продолжение требует явного действия.";
      ui.resume.hidden = false;
      if (inspected.planValidation?.isValid) ui.rebuild.hidden = false;
    } else if (session.status === "blocked") {
      ui.message.textContent = "Продолжение невозможно из-за blocker или незавершённого prerequisite.";
      if (inspected.planValidation?.isValid) ui.rebuild.hidden = false;
    } else if (session.status === "completed") {
      ui.message.textContent = "Все обязательные действия snapshot-плана завершены.";
      if (inspected.planValidation?.isValid) ui.rebuild.hidden = false;
    } else if (session.status === "stale") {
      ui.message.textContent = "Identity Stage 22 больше не доказуема. Старый прогресс сохранён, но продолжение запрещено.";
      if (inspected.planValidation?.isValid) ui.rebuild.hidden = false;
    } else if (session.status === "failed") {
      ui.message.textContent = session.failure?.message || "Сессия завершилась детерминированной ошибкой.";
      if (inspected.planValidation?.isValid) ui.rebuild.hidden = false;
    }
    renderBlockers(session.blockers);
    const action = currentAction(session);
    const prerequisitesReady = action?.prerequisiteActionIds.every((id) => ["completed", "skipped"].includes(session.execution.actions.find((entry) => entry.actionId === id)?.status));
    if (
      inspected.planValidation?.isValid && ["active", "paused"].includes(session.status) &&
      action && ["available", "in_progress"].includes(action.status) && prerequisitesReady &&
      !action.blockerIds.length && !session.blockers.length
    ) ui.step.hidden = false;
  }

  function renderProgress(session) {
    const summary = sessionApi.getExecutionSessionSummary(session);
    const position = session.currentPosition;
    ui.progress.hidden = false;
    ui.phase.textContent = summary.currentPhase?.title || "—";
    ui.component.textContent = summary.currentComponent?.label || "не применяется";
    ui.action.textContent = summary.currentAction?.title || "—";
    ui.count.textContent = `${position.completedRequiredCount} из ${position.totalRequiredCount}`;
    ui.percent.textContent = `${position.progressPercent}%`;
    ui.progressMeter.value = position.progressPercent;
    ui.progressMeter.textContent = `${position.progressPercent}%`;
    if (!summary.currentAction) return;
    ui.current.hidden = false;
    ui.currentTitle.textContent = summary.currentAction.title;
    ui.currentInstruction.textContent = summary.currentAction.instruction || "Инструкция уже зафиксирована в плане Stage 22.";
    ui.currentStatus.textContent = actionStatusLabel(summary.currentAction.status);
    ui.currentPrerequisites.textContent = summary.currentAction.prerequisiteActionIds.length ? summary.currentAction.prerequisiteActionIds.join(", ") : "нет";
    ui.currentCheckpoints.textContent = summary.currentAction.checkpointIds.length ? summary.currentAction.checkpointIds.join(", ") : "нет";
    ui.currentBlockers.textContent = summary.currentAction.blockerIds.length ? summary.currentAction.blockerIds.join(", ") : "нет";
  }

  function renderBlockers(blockers) {
    ui.blockers.hidden = !blockers?.length;
    const nodes = (blockers || []).map((entry) => {
      const item = document.createElement("li");
      item.textContent = `${entry.code}: ${entry.message}`;
      return item;
    });
    ui.blockerList.replaceChildren(...nodes);
  }

  async function rebuildConfirmed() {
    if (!globalObject.confirm("Перестроить сессию и сбросить текущий execution progress? План Stage 22 не изменится.")) return;
    await runOperation(() => sessionApi.rebuildForProject(repository, projectId, { ...expected(), confirmed: true }));
  }

  async function runOperation(operation) {
    if (busy || !projectId) return;
    busy = true;
    setDisabled(true);
    ui.error.textContent = "";
    try {
      inspected = await operation();
    } catch (error) {
      ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`;
      inspected = sessionApi.inspectAggregate(await repository.getProject(projectId));
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function expected() { return { expectedRevision: inspected?.executionSession?.revision }; }
  function currentActionId() { return inspected?.executionSession?.currentPosition?.actionId || null; }
  function currentAction(session) { return session.execution.actions.find((entry) => entry.actionId === session.currentPosition.actionId) || null; }
  function renderWithoutProject() {
    resetSections();
    hideButtons();
    ui.step.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.status.textContent = "Нет контекста проекта";
    ui.status.dataset.status = "waiting";
    ui.planStatus.textContent = "план отсутствует";
    ui.state.textContent = "выполнение ещё не начато";
    ui.message.textContent = "Выберите проект и откройте Stage 23 из готового плана Stage 22. Можно вернуться к предыдущему этапу.";
  }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function resetSections() { ui.fatal.hidden = true; ui.workflow.hidden = false; ui.progress.hidden = true; ui.current.hidden = true; ui.blockers.hidden = true; }
  function hideButtons() { for (const button of operationButtons()) button.hidden = true; }
  function setDisabled(value) { for (const button of operationButtons()) button.disabled = value; }
  function operationButtons() { return [ui.start, ui.startAction, ui.completeAction, ui.skipAction, ui.pause, ui.resume, ui.rebuild]; }
  function planStatusLabel(plan, validation) {
    if (!plan) return "план отсутствует";
    if (plan.status === "blocked") return "план заблокирован";
    if (plan.status === "stale" || validation && !validation.isValid) return "план устарел";
    if (plan.status === "ready") return "план готов";
    return "план не готов";
  }
  function planMessage(code) {
    return ({
      execution_plan_missing: "План Stage 22 отсутствует. Вернитесь к предыдущему этапу.",
      execution_plan_not_ready: "План Stage 22 не готов или заблокирован.",
      execution_plan_stale: "План Stage 22 устарел и не может открыть выполнение.",
      execution_plan_invalid: "План Stage 22 повреждён или не прошёл validation.",
      source_identity_mismatch: "Identity Stage 18–22 не доказуема.",
    })[code] || "Сессия станет доступна после готового и актуального Stage 22.";
  }
  function sessionStatusLabel(status) { return ({ waiting: "Не начато", starting: "Подготовка", active: "Выполняется", paused: "Приостановлено", blocked: "Заблокировано", completed: "Завершено", stale: "Устарело", failed: "Ошибка" })[status] || status; }
  function sessionStateLabel(status, exists) { return exists ? ({ waiting: "выполнение ещё не начато", starting: "подготовка", active: "выполняется", paused: "приостановлено", blocked: "заблокировано", completed: "завершено", stale: "устарело", failed: "ошибка" })[status] || status : "выполнение ещё не начато"; }
  function actionStatusLabel(status) { return ({ pending: "ожидает", available: "доступно", in_progress: "выполняется", completed: "выполнено", skipped: "пропущено", blocked: "заблокировано" })[status] || status; }
})(window);
