"use strict";

(function initializePatternExecutionMonitoringAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("monitoring-fatal"), fatalMessage: byId("monitoring-fatal-message"), workflow: byId("monitoring-workflow"),
    title: byId("monitoring-project-title"), context: byId("monitoring-project-context"), lifecycle: byId("monitoring-lifecycle"), revision: byId("monitoring-revision"),
    runtimeStatus: byId("monitoring-runtime-status"), progressText: byId("monitoring-progress-text"), progressBar: byId("monitoring-progress-bar"),
    steps: byId("monitoring-steps"), checkpoints: byId("monitoring-checkpoints"), remaining: byId("monitoring-remaining"), lastChange: byId("monitoring-last-change"),
    activity: byId("monitoring-current-activity"), recoveryPanel: byId("monitoring-recovery-panel"), stalePanel: byId("monitoring-stale-panel"), failurePanel: byId("monitoring-failure-panel"),
    blockersPanel: byId("monitoring-blockers-panel"), blockers: byId("monitoring-blockers"), warningsPanel: byId("monitoring-warnings-panel"), warnings: byId("monitoring-warnings"),
    recommendationLabel: byId("monitoring-recommendation-label"), recommendationReason: byId("monitoring-recommendation-reason"), recommendedAction: byId("monitoring-recommended-action"),
    commandBar: byId("monitoring-command-bar"), commandError: byId("monitoring-command-error"), openRuntime: byId("monitoring-open-runtime"),
    timeline: byId("monitoring-timeline"), diagnostics: byId("monitoring-diagnostics"), identity: byId("monitoring-source-identity"), fingerprint: byId("monitoring-fingerprint"), backRuntime: byId("monitoring-back-runtime"), openIntervention: byId("monitoring-open-intervention"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionMonitoring;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть monitoring."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    hideCommands();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    bindCommands();
    const runtimeRoute = `/pattern-execution-runtime?project=${encodeURIComponent(projectId)}`;
    ui.openRuntime.href = runtimeRoute;
    ui.openRuntime.hidden = false;
    ui.backRuntime.href = runtimeRoute;
    ui.backRuntime.hidden = false;
    inspected = await repository.readPatternExecutionMonitoring(projectId);
    render();
  }

  function bindCommands() {
    for (const button of commandButtons) button.addEventListener("click", () => execute(button.dataset.command));
  }

  function render() {
    hideCommands();
    ui.commandError.textContent = "";
    const snapshot = inspected?.rawMonitoring || null;
    const lifecycle = snapshot?.lifecycle?.state || "waiting";
    ui.title.textContent = inspected?.project?.title || "Мониторинг выполнения";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Контекст проекта недоступен.";
    ui.lifecycle.textContent = lifecycleLabel(lifecycle);
    ui.lifecycle.dataset.status = lifecycle;
    ui.revision.textContent = snapshot ? `Epoch ${snapshot.epoch} · revision ${snapshot.revision}` : "Epoch — · revision —";
    renderProgress(snapshot);
    renderActivity(snapshot?.currentActivity || null);
    renderMessages(snapshot);
    renderRecommendation(snapshot?.recommendedAction || null);
    renderTimeline(snapshot?.timeline || []);
    renderDiagnostics(snapshot);
    ui.recoveryPanel.hidden = !inspected?.interrupted;
    ui.stalePanel.hidden = lifecycle !== "stale";
    ui.failurePanel.hidden = lifecycle !== "failed";
    const allowed = new Set(inspected?.availableCommands || []);
    const canIntervene = Boolean(snapshot && !inspected?.corrupt && inspected?.validation?.valid && ["healthy", "attention_required", "blocked", "completed", "failed", "stale"].includes(lifecycle));
    ui.openIntervention.hidden = !canIntervene;
    if (canIntervene) ui.openIntervention.href = `/pattern-execution-intervention?project=${encodeURIComponent(projectId)}`;
    for (const button of commandButtons) button.hidden = !allowed.has(button.dataset.command);
    ui.commandBar.hidden = commandButtons.every((button) => button.hidden) && ui.openRuntime.hidden;
  }

  function renderProgress(snapshot) {
    const progress = snapshot?.progressSummary;
    const runtime = snapshot?.runtimeSummary;
    ui.runtimeStatus.textContent = runtime?.lifecycle || inspected?.runtime?.status || "—";
    ui.progressText.textContent = progress ? `${progress.completedSteps} из ${progress.totalSteps} шагов · ${progress.completedPercent}%` : "Monitoring snapshot ещё не создан.";
    ui.progressBar.value = progress?.completedPercent || 0;
    ui.progressBar.textContent = `${progress?.completedPercent || 0}%`;
    ui.steps.textContent = progress ? `${progress.completedSteps} / ${progress.totalSteps}` : "0 / 0";
    ui.checkpoints.textContent = progress ? `${progress.completedCheckpoints} / ${progress.totalCheckpoints}` : "0 / 0";
    ui.remaining.textContent = String(progress?.remainingCount || 0);
    ui.lastChange.textContent = runtime?.lastConfirmedChangeAt || "—";
  }

  function renderActivity(activity) {
    const entries = activity ? [
      ["Status", activity.status], ["Action", activity.actionId || "—"], ["Step", activity.stepId || "—"],
      ["Checkpoint", activity.checkpointId || "—"], ["Started", activity.startedAt || "—"],
      ["Paused", activity.pausedAt || "—"], ["Reason", activity.reason || "—"],
      ["Safe to resume", activity.safeToResume ? "Да" : "Нет"], ["Нужно решение", activity.requiresUserDecision ? "Да" : "Нет"],
    ] : [["Status", "none"]];
    ui.activity.replaceChildren(...entries.map(([label, value]) => detailItem(label, value)));
  }

  function renderMessages(snapshot) {
    const blockers = snapshot?.blockers || [];
    const warnings = snapshot?.warnings || [];
    ui.blockers.replaceChildren(...blockers.map((entry) => listItem(`${entry.severity} · ${entry.code} · ${entry.messageKey}`)));
    ui.warnings.replaceChildren(...warnings.map((entry) => listItem(`${entry.severity} · ${entry.code} · ${entry.messageKey}`)));
    ui.blockersPanel.hidden = blockers.length === 0;
    ui.warningsPanel.hidden = warnings.length === 0;
  }

  function renderRecommendation(action) {
    ui.recommendationLabel.textContent = action?.label || "Действие пока недоступно.";
    ui.recommendationReason.textContent = action?.reason || "";
    ui.recommendedAction.hidden = !action?.enabled || !action.targetRoute || !projectId;
    if (!ui.recommendedAction.hidden) {
      ui.recommendedAction.textContent = action.label;
      ui.recommendedAction.href = `${action.targetRoute}?project=${encodeURIComponent(projectId)}`;
      ui.recommendedAction.dataset.requiresConfirmation = String(Boolean(action.requiresConfirmation));
    }
  }

  function renderTimeline(entries) {
    ui.timeline.replaceChildren(...(entries.length ? [...entries].reverse().map((entry) => listItem(`${entry.timestamp} · r${entry.runtimeRevision} · ${entry.eventType} · ${entry.status}`)) : [listItem("Timeline пока пуст.")]));
  }

  function renderDiagnostics(snapshot) {
    const diagnostics = snapshot?.diagnostics || [];
    ui.diagnostics.replaceChildren(...(diagnostics.length ? diagnostics.map((entry) => listItem(`${entry.severity} · ${entry.code}`)) : [listItem("Диагностических событий нет.")]));
    const identity = snapshot?.sourceIdentity;
    const entries = [
      ["Project", identity?.project ? `${identity.project.id} · r${identity.project.revision}` : "—"],
      ["Result", identity?.result ? `${identity.result.id} · r${identity.result.revision}` : "—"],
      ["Runtime", identity?.runtime ? `${identity.runtime.id} · r${identity.runtime.revision} · epoch ${identity.runtime.epoch}` : "—"],
      ["Calculation", identity?.calculationIdentity?.id || "—"], ["Plan", identity?.executionPlanIdentity?.id || "—"], ["Session", identity?.sessionIdentity?.id || "—"],
      ["Progress", identity?.progressIdentity?.id || "—"], ["Completion", identity?.completionIdentity?.id || "—"],
      ["Steps / checkpoints", identity ? `${identity.stepIdentities.length} / ${identity.checkpointIdentities.length}` : "—"],
      ["Source fingerprint", identity?.sourceIdentityFingerprint || "—"],
    ];
    ui.identity.replaceChildren(...entries.map(([label, value]) => detailItem(label, value)));
    ui.fingerprint.textContent = snapshot ? `Monitoring fingerprint: ${snapshot.fingerprint}` : "—";
  }

  async function execute(command) {
    if (busy || !repository || !projectId || !command) return;
    busy = true;
    setDisabled(true);
    ui.commandError.textContent = "";
    try {
      if (command === "create") inspected = await repository.createPatternExecutionMonitoring(projectId);
      else {
        const snapshot = inspected?.rawMonitoring;
        inspected = await repository.executePatternExecutionMonitoringCommand(projectId, command, {
          expectedRevision: snapshot.revision,
          operationId: `${command}:${system.uuidv7()}`,
        });
      }
    } catch (error) {
      ui.commandError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Команда monitoring не выполнена."}`;
      inspected = await repository.readPatternExecutionMonitoring(projectId);
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function renderWithoutProject() {
    hideCommands();
    ui.commandBar.hidden = true;
    ui.openRuntime.hidden = true;
    ui.backRuntime.hidden = true;
    ui.openIntervention.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.context.textContent = "Без project context monitoring работает только как безопасное пустое представление.";
    ui.lifecycle.textContent = "Нет project context";
    ui.lifecycle.dataset.status = "waiting";
    renderProgress(null); renderActivity(null); renderMessages(null); renderRecommendation(null); renderTimeline([]); renderDiagnostics(null);
  }

  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function hideCommands() { for (const button of commandButtons) button.hidden = true; }
  function setDisabled(value) { for (const button of commandButtons) button.disabled = value; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = value; wrapper.append(label, content); return wrapper; }
  function lifecycleLabel(value) { return ({ waiting: "Ожидание", observing: "Наблюдение", healthy: "Стабильно", attention_required: "Требует внимания", blocked: "Заблокировано", completed: "Завершено", failed: "Сбой", stale: "Устарело" })[value] || value; }
})(typeof window !== "undefined" ? window : globalThis);
