"use strict";

(function initializePatternExecutionSessionPage(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-session-fatal"), fatalMessage: byId("execution-session-fatal-message"),
    workflow: byId("execution-session-workflow"), title: byId("execution-session-project-title"),
    pageTitle: byId("page-title"), intro: byId("execution-session-intro"), virtualNotice: byId("execution-session-virtual-notice"),
    virtualNoticeTitle: byId("execution-session-virtual-notice-title"), virtualNoticeCopy: byId("execution-session-virtual-notice-copy"),
    sourceDetails: byId("execution-session-source-details"), savedProjects: byId("execution-session-saved-projects"),
    status: byId("execution-session-status"), planStatus: byId("execution-session-plan-status"),
    state: byId("execution-session-state"), planFingerprint: byId("execution-session-plan-fingerprint"),
    fingerprint: byId("execution-session-fingerprint"), physicalIdentity: byId("execution-session-physical-identity"), physicalProgress: byId("execution-session-physical-progress"),
    virtualId: byId("execution-session-virtual-id"), virtualIdentity: byId("execution-session-virtual-identity"), virtualIdentityLabel: byId("execution-session-virtual-identity-label"), historicalVirtualId: byId("execution-session-historical-virtual-id"), historicalVirtualIdentity: byId("execution-session-historical-virtual-identity"), historicalVirtualIdentityLabel: byId("execution-session-historical-virtual-identity-label"), message: byId("execution-session-message"),
    start: byId("execution-session-start"), startAction: byId("execution-session-start-action"),
    completeAction: byId("execution-session-complete-action"), skipAction: byId("execution-session-skip-action"),
    pause: byId("execution-session-pause"), resume: byId("execution-session-resume"), rebuild: byId("execution-session-rebuild"),
    virtualStart: byId("execution-session-virtual-start"), virtualComplete: byId("execution-session-virtual-complete"),
    back: byId("execution-session-back"), navPlan: byId("execution-session-nav-plan"), step: byId("execution-session-step"), error: byId("execution-session-error"),
    progress: byId("execution-session-progress"), phase: byId("execution-session-phase"), component: byId("execution-session-component"),
    action: byId("execution-session-action"), count: byId("execution-session-count"), countLabel: byId("execution-session-count-label"), percent: byId("execution-session-percent"),
    progressMeter: byId("execution-session-progress-meter"), current: byId("execution-session-current"),
    currentTitle: byId("execution-session-current-title"), currentInstruction: byId("execution-session-current-instruction"), currentEyebrow: byId("execution-session-current-eyebrow"), currentDetails: byId("execution-session-current-details"),
    currentStatus: byId("execution-session-current-status"), currentPrerequisites: byId("execution-session-current-prerequisites"),
    currentCheckpoints: byId("execution-session-current-checkpoints"), currentBlockers: byId("execution-session-current-blockers"),
    blockers: byId("execution-session-blockers"), blockerList: byId("execution-session-blocker-list"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const sessionApi = globalObject.YarnAIPatternExecutionSession;
  const formatters = globalObject.YarnAIPatternExecutionUiFormatters;
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;
  let virtualMode = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть Stage 23."));

  async function initialize() {
    const parameters = new URLSearchParams(globalObject.location.search);
    projectId = parameters.get("project");
    virtualMode = parameters.get("mode") === sessionApi?.VIRTUAL_DRY_RUN_MODE;
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !sessionApi || !formatters) return showFatal("Ссылка на проект или модуль отображения повреждены.");
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
    ui.virtualStart.addEventListener("click", () => runOperation(() => sessionApi.startVirtualDryRunForProject(repository, projectId, expected())));
    ui.virtualComplete.addEventListener("click", () => {
      const run = inspected?.executionSession?.virtualDryRun;
      const action = run?.execution?.actions?.[run?.currentPosition?.actionIndex];
      if (!action) return;
      return runOperation(() => sessionApi.completeVirtualStepForProject(repository, projectId, action.stepId, action.actionId, { ...expected(), operationId: system.uuidv7() }));
    });
    inspected = virtualMode ? await sessionApi.ensureVirtualDryRunForProject(repository, projectId) : await sessionApi.ensureForProject(repository, projectId);
    render();
  }

  function render() {
    resetSections();
    const session = inspected?.executionSession || null;
    const plan = inspected?.executionPlan || null;
    const currentVirtual = session?.virtualDryRun || null;
    const historicalVirtual = session?.historicalVirtualDryRuns?.at(-1) || null;
    ui.title.textContent = inspected?.project?.title || "Выполнение проекта";
    ui.planStatus.textContent = planStatusLabel(plan, inspected?.planValidation);
    ui.planFingerprint.textContent = plan?.planFingerprint || "—";
    ui.fingerprint.textContent = session?.sessionFingerprint || "—";
    ui.physicalIdentity.textContent = session ? `${session.id} · версия ${session.revision}` : "—";
    ui.physicalProgress.textContent = physicalProgressLabel(session, plan);
    ui.virtualId.textContent = currentVirtual?.id || "—";
    ui.virtualIdentity.textContent = virtualBindingLabel(currentVirtual);
    ui.virtualIdentityLabel.textContent = currentVirtual ? `Текущая проверка для версии плана ${currentVirtual.sourceExecutionPlanRevision}` : "Текущая проверка для сохранённой версии плана";
    ui.historicalVirtualId.textContent = historicalVirtual?.id || "—";
    ui.historicalVirtualIdentity.textContent = virtualBindingLabel(historicalVirtual);
    ui.historicalVirtualIdentityLabel.textContent = historicalVirtual ? `Историческая проверка для версии плана ${historicalVirtual.sourceExecutionPlanRevision}` : "Историческая проверка для прежней версии плана";
    const visibleStatus = session?.status || "waiting";
    ui.status.textContent = formatters.statusLabel("session", visibleStatus);
    ui.status.dataset.status = visibleStatus;
    ui.state.textContent = sessionStateLabel(visibleStatus, Boolean(session));
    hideButtons();
    ui.step.hidden = true;
    if (virtualMode) return renderVirtual(session, plan);
    if (!session) {
      ui.message.textContent = planMessage(inspected?.reasonCode);
      return;
    }
    if (session.planSnapshot) renderProgress(session);
    else if (session.status === "waiting") renderWaiting(session, plan);
    if (session.status === "waiting" && inspected.planValidation?.isValid) {
      ui.message.textContent = "Реальное вязание ещё не начато. Только кнопка «Начать вязание» ниже запустит физическое выполнение.";
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

  function renderVirtual(session, plan) {
    const run = session?.virtualDryRun || null;
    ui.pageTitle.textContent = "Проверка плана без вязания";
    ui.intro.textContent = "Пройдите интерфейс и порядок шагов без пряжи и спиц. Ни одна отметка здесь не считается физическим выполнением.";
    ui.virtualNotice.hidden = false;
    ui.sourceDetails.hidden = false;
    ui.savedProjects.hidden = false;
    ui.step.hidden = true;
    ui.status.textContent = formatters.statusLabel("virtual", run?.status);
    ui.status.dataset.status = run?.status || "ready";
    ui.state.textContent = "Физическое вязание ещё не начато";
    ui.planStatus.textContent = planStatusLabel(plan, inspected?.planValidation);
    ui.planFingerprint.textContent = plan?.planFingerprint || "—";
    ui.fingerprint.textContent = session?.sessionFingerprint || "—";
    if (!run) {
      ui.message.textContent = "Виртуальная проверка недоступна.";
      return;
    }
    if (run.status === "ready") {
      ui.message.textContent = "План готов. Запуск создаст только виртуальные отметки; физический прогресс останется нулевым.";
      ui.virtualStart.hidden = false;
      renderVirtualProgress(run);
      return;
    }
    if (run.status === "active") {
      ui.message.textContent = "Отмечайте только то, что интерфейс показал шаг в правильном порядке. Ничего вязать не нужно.";
      ui.virtualComplete.hidden = false;
      renderVirtualProgress(run);
      return;
    }
    ui.message.textContent = "Виртуальная проверка всех шагов завершена. Это не означает, что изделие связано или его посадка подтверждена.";
    renderVirtualProgress(run);
  }

  function renderVirtualProgress(run) {
    const action = run.execution.actions[run.currentPosition.actionIndex] || null;
    const completed = run.completedStepIds.length;
    const total = run.execution.actions.length;
    const percent = total ? Math.floor((completed * 100) / total) : 100;
    ui.progress.hidden = false;
    ui.phase.textContent = action ? action.phaseId : "виртуальная проверка завершена";
    ui.component.textContent = "не применяется";
    ui.action.textContent = action?.title || "Все шаги просмотрены";
    ui.countLabel.textContent = action ? "Текущий шаг" : "Проверено шагов";
    ui.count.textContent = action ? `Шаг ${action.order} из ${total}` : `${completed} из ${total}`;
    ui.percent.textContent = `${percent}%`;
    ui.progressMeter.value = percent;
    ui.progressMeter.textContent = `${percent}%`;
    if (!action) return;
    ui.current.hidden = false;
    ui.currentEyebrow.textContent = `Шаг ${action.order} из ${total}`;
    ui.currentTitle.textContent = action.title;
    ui.currentInstruction.textContent = formatters.formatKnittingText(action.instruction);
    ui.currentDetails.hidden = false;
    ui.currentStatus.textContent = formatters.statusLabel("action", action.status);
    ui.currentPrerequisites.textContent = action.prerequisiteActionIds.length ? action.prerequisiteActionIds.join(", ") : "нет";
    ui.currentCheckpoints.textContent = action.checkpointIds.length ? action.checkpointIds.join(", ") : "нет";
    ui.currentBlockers.textContent = action.blockerIds.length ? action.blockerIds.join(", ") : "нет";
  }

  function renderWaiting(session, plan) {
    const steps = Array.isArray(plan?.plan?.steps) ? plan.plan.steps : [];
    const first = steps[0] || null;
    const total = steps.length;
    const virtual = sessionApi.getDisplayVirtualDryRun(session);
    const virtualCompleted = virtual?.status === "completed";
    const virtualCompletedCount = Array.isArray(virtual?.completedStepIds) ? virtual.completedStepIds.length : 0;
    const virtualTotal = Array.isArray(virtual?.execution?.actions) ? virtual.execution.actions.length : total;

    if (virtualCompleted) {
      ui.virtualNotice.hidden = false;
      const historical = !session.virtualDryRun;
      if (historical) {
        ui.virtualNoticeTitle.textContent = `Историческая виртуальная проверка сохранена: ${virtualCompletedCount} из ${virtualTotal}.`;
        ui.virtualNoticeCopy.textContent = `Она относится к прежней версии плана ${virtual.sourceExecutionPlanRevision} и не переносит отметки в текущий план. Это только проверка интерфейса и порядка плана. Реальное вязание остаётся не начато: 0 физических шагов из ${total}.`;
      } else {
        ui.virtualNoticeTitle.textContent = `Виртуальная проверка завершена: ${virtualCompletedCount} из ${virtualTotal}.`;
        ui.virtualNoticeCopy.textContent = `Это только проверка интерфейса и порядка плана. Реальное вязание остаётся не начато: 0 физических шагов из ${total}.`;
      }
    }

    ui.progress.hidden = false;
    ui.phase.textContent = first?.phaseTitle || first?.phase || "Набор и подготовка кокетки";
    ui.component.textContent = first?.componentLabel || first?.component || "Кокетка";
    ui.action.textContent = first?.title || "Набрать петли";
    ui.countLabel.textContent = "Физические шаги";
    ui.count.textContent = `0 из ${total}`;
    ui.percent.textContent = "0%";
    ui.progressMeter.value = 0;
    ui.progressMeter.textContent = "0%";
    if (!first) return;
    ui.current.hidden = false;
    ui.currentEyebrow.textContent = `Первый физический шаг · 1 из ${total}`;
    ui.currentTitle.textContent = first.title || "Набрать петли";
    ui.currentInstruction.textContent = formatters.formatKnittingText(first.instruction || first.description || "Инструкция зафиксирована в готовом плане.");
    ui.currentDetails.hidden = true;
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
    ui.currentInstruction.textContent = formatters.formatKnittingText(summary.currentAction.instruction || "Инструкция уже зафиксирована в сохранённом плане.");
    ui.currentStatus.textContent = formatters.statusLabel("action", summary.currentAction.status);
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
    ui.state.textContent = "Вязание ещё не начато";
    ui.message.textContent = "Выберите проект и откройте Stage 23 из готового плана Stage 22. Можно вернуться к предыдущему этапу.";
  }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function resetSections() { ui.fatal.hidden = true; ui.workflow.hidden = false; ui.progress.hidden = true; ui.current.hidden = true; ui.blockers.hidden = true; ui.virtualNotice.hidden = true; ui.virtualNoticeTitle.textContent = "Виртуальная проверка — физическое вязание не выполняется."; ui.virtualNoticeCopy.textContent = "Отметки проверяют только интерфейс, порядок шагов и сохранение. Они не подтверждают связанные петли, готовое изделие или посадку."; ui.sourceDetails.hidden = false; ui.savedProjects.hidden = true; ui.currentDetails.hidden = false; }
  function hideButtons() { for (const button of operationButtons()) button.hidden = true; }
  function setDisabled(value) { for (const button of operationButtons()) button.disabled = value; }
  function operationButtons() { return [ui.start, ui.startAction, ui.completeAction, ui.skipAction, ui.pause, ui.resume, ui.rebuild, ui.virtualStart, ui.virtualComplete]; }
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
  function sessionStateLabel(status, exists) { return exists ? formatters.statusLabel("session", status) : "Вязание ещё не начато"; }
  function virtualBindingLabel(run) { return run ? `статус: ${formatters.statusLabel("virtual", run.status)} · версия проверки: ${run.revision} · отпечаток проверки: ${run.runFingerprint} · версия плана: ${run.sourceExecutionPlanRevision} · отпечаток плана: ${run.sourceExecutionPlanFingerprint}` : "—"; }
  function physicalProgressLabel(session, plan) {
    if (!session) return "—";
    const completed = Array.isArray(session.completedActionIds) ? session.completedActionIds.length : 0;
    const planSteps = Array.isArray(plan?.plan?.steps) ? plan.plan.steps : [];
    const phaseActions = Array.isArray(plan?.plan?.phases) ? plan.plan.phases.flatMap((phase) => Array.isArray(phase.actions) ? phase.actions : []) : [];
    const total = planSteps.length || phaseActions.length || session.currentPosition?.totalRequiredCount || 0;
    return `${completed} из ${total}`;
  }
})(window);
