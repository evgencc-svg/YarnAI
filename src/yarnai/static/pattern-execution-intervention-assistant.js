"use strict";

(function initializePatternExecutionInterventionAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("intervention-fatal"), fatalMessage: byId("intervention-fatal-message"), workflow: byId("intervention-workflow"),
    title: byId("intervention-project-title"), context: byId("intervention-project-context"), lifecycle: byId("intervention-lifecycle"), revision: byId("intervention-revision"),
    monitoringStatus: byId("intervention-monitoring-status"), assessmentReason: byId("intervention-assessment-reason"), observations: byId("intervention-observations"),
    blockers: byId("intervention-blockers"), warnings: byId("intervention-warnings"), recommendation: byId("intervention-recommendation"), actions: byId("intervention-actions"), select: byId("intervention-select"),
    confirmationPanel: byId("intervention-confirmation-panel"), confirmationSummary: byId("intervention-confirmation-summary"), confirm: byId("intervention-confirm"),
    decisionPanel: byId("intervention-decision-panel"), decision: byId("intervention-decision"), statePanel: byId("intervention-state-panel"), stateHeading: byId("intervention-state-heading"), stateMessage: byId("intervention-state-message"),
    commandBar: byId("intervention-command-bar"), commandError: byId("intervention-command-error"), identity: byId("intervention-source-identity"), fingerprint: byId("intervention-fingerprint"), backMonitoring: byId("intervention-back-monitoring"), openAction: byId("intervention-open-action"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionIntervention;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let chosenActionId = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть intervention."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    hideCommands();
    bindControls();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionIntervention(projectId);
    if (inspected?.monitoringRecord && inspected?.monitoring && !inspected?.corrupt) {
      ui.backMonitoring.href = `/pattern-execution-monitoring?project=${encodeURIComponent(projectId)}`;
      ui.backMonitoring.hidden = false;
    }
    const existingAction = await repository.getPatternExecutionAction(projectId, inspected?.calculationId);
    const confirmedDecision = inspected?.rawIntervention?.lifecycle?.state === "confirmed" && Boolean(inspected?.rawIntervention?.decision);
    ui.openAction.href = `/pattern-execution-action?project=${encodeURIComponent(projectId)}`;
    ui.openAction.hidden = !confirmedDecision && !existingAction;
    render();
  }

  function bindControls() {
    for (const button of commandButtons) button.addEventListener("click", () => execute(button.dataset.command));
    ui.select.addEventListener("click", () => execute("select", chosenActionId));
    ui.confirm.addEventListener("click", () => execute("confirm"));
  }

  function render() {
    hideCommands();
    ui.commandError.textContent = "";
    const snapshot = inspected?.rawIntervention || null;
    const lifecycle = snapshot?.lifecycle?.state || "waiting";
    ui.title.textContent = inspected?.project?.title || "Решение о вмешательстве";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Контекст проекта недоступен.";
    ui.lifecycle.textContent = lifecycleLabel(lifecycle);
    ui.lifecycle.dataset.status = lifecycle;
    ui.revision.textContent = snapshot ? `Epoch ${snapshot.epoch} · revision ${snapshot.revision}` : "Epoch — · revision —";
    ui.monitoringStatus.textContent = snapshot?.monitoringStatus || inspected?.monitoring?.lifecycle?.state || "—";
    ui.assessmentReason.textContent = snapshot?.assessmentReason || "Intervention snapshot ещё не создан.";
    renderObservations(snapshot);
    renderRecommendation(snapshot);
    renderActions(snapshot);
    renderConfirmation(snapshot);
    renderDecision(snapshot);
    renderState(snapshot);
    renderIdentity(snapshot);
    const allowed = new Set(inspected?.availableCommands || []);
    for (const button of commandButtons) button.hidden = !allowed.has(button.dataset.command);
    ui.commandBar.hidden = commandButtons.every((button) => button.hidden);
  }

  function renderObservations(snapshot) {
    const observations = snapshot?.observations || [];
    ui.observations.replaceChildren(...(observations.length ? observations.map((entry) => listItem(`${entry.kind} · ${entry.code} · ${entry.message}`)) : [listItem("Наблюдения пока недоступны.")]));
    ui.blockers.replaceChildren(...((snapshot?.blockers || []).map((entry) => listItem(`blocker · ${entry.code} · ${entry.message}`))));
    ui.warnings.replaceChildren(...((snapshot?.warnings || []).map((entry) => listItem(`warning · ${entry.code} · ${entry.message}`))));
  }

  function renderRecommendation(snapshot) {
    const recommendation = snapshot?.recommendation;
    const action = recommendation ? snapshot.actions.find((entry) => entry.id === recommendation.actionId) : null;
    ui.recommendation.textContent = action ? `${action.label} · ${recommendation.reason} · priority ${recommendation.priority}${recommendation.requiresConfirmation ? " · требуется подтверждение" : ""}` : "Рекомендация отсутствует.";
  }

  function renderActions(snapshot) {
    const actions = snapshot?.actions || [];
    if (!actions.some((entry) => entry.id === chosenActionId && entry.eligible)) chosenActionId = snapshot?.selectedAction?.id || null;
    const nodes = actions.map((action) => {
      const label = document.createElement("label"); label.className = "action-card"; label.dataset.eligible = String(action.eligible);
      const input = document.createElement("input"); input.type = "radio"; input.name = "intervention-action"; input.value = action.id; input.disabled = !action.eligible || snapshot.lifecycle.state !== "ready"; input.checked = chosenActionId === action.id;
      input.addEventListener("change", () => { chosenActionId = action.id; ui.select.disabled = false; });
      const title = document.createElement("strong"); title.textContent = action.label;
      const effect = document.createElement("span"); effect.textContent = action.expectedEffect;
      const meta = document.createElement("span"); meta.className = "action-meta"; meta.textContent = action.eligible ? `${action.impact} · priority ${action.priority}${action.requiresConfirmation ? " · confirmation required" : ""}` : `Недоступно: ${action.blockedReason}`;
      label.append(input, title, effect, meta); return label;
    });
    ui.actions.replaceChildren(...nodes);
    ui.select.disabled = !chosenActionId || snapshot?.lifecycle?.state !== "ready";
    ui.select.hidden = snapshot?.lifecycle?.state !== "ready";
  }

  function renderConfirmation(snapshot) {
    const selected = snapshot?.selectedAction;
    ui.confirmationPanel.hidden = !selected || !["ready", "confirmation_required"].includes(snapshot.lifecycle.state);
    ui.confirmationSummary.textContent = selected ? `${selected.label}. ${selected.expectedEffect} Target: ${selected.targetIdentity.runtimeId || selected.targetIdentity.monitoringId || "—"}.` : "";
    ui.confirm.disabled = !selected || busy;
  }

  function renderDecision(snapshot) {
    const decision = snapshot?.decision;
    ui.decisionPanel.hidden = !decision;
    ui.decision.replaceChildren(...(decision ? [
      ["Action", decision.selectedAction.label], ["Reason", decision.reason], ["Expected effect", decision.expectedEffect],
      ["Monitoring", `${decision.sourceMonitoringIdentity.id} · r${decision.sourceMonitoringIdentity.revision}`],
      ["Confirmation", `${decision.confirmation.method} · ${decision.confirmation.confirmedBy}`],
      ["Runtime changed", decision.runtimeActionExecuted ? "Да" : "Нет"], ["Fingerprint", decision.fingerprint],
    ].map(([label, value]) => detailItem(label, value)) : []));
  }

  function renderState(snapshot) {
    const state = snapshot?.lifecycle?.state;
    ui.statePanel.hidden = !["stale", "failed", "blocked", "cancelled"].includes(state);
    ui.stateHeading.textContent = ({ stale: "Source identity устарела", failed: "Assessment завершился failure", blocked: "Assessment заблокирован", cancelled: "Intervention отменён" })[state] || "Состояние intervention";
    ui.stateMessage.textContent = state === "stale" ? "Чтение не исправляет это состояние. После актуализации источников используйте явный rebuild." : snapshot?.assessmentReason || "Обычные команды ограничены lifecycle.";
  }

  function renderIdentity(snapshot) {
    const identity = snapshot?.sourceIdentity;
    const entries = [
      ["Project", identity?.project ? `${identity.project.id} · r${identity.project.revision}` : "—"],
      ["Result", identity?.result ? `${identity.result.id} · r${identity.result.revision}` : "—"],
      ["Runtime", identity?.runtime ? `${identity.runtime.id} · r${identity.runtime.revision} · epoch ${identity.runtime.epoch}` : "—"],
      ["Monitoring", identity?.monitoring ? `${identity.monitoring.id} · r${identity.monitoring.revision} · epoch ${identity.monitoring.epoch}` : "—"],
      ["Plan", identity?.executionPlanIdentity?.id || "—"], ["Session", identity?.sessionIdentity?.id || "—"],
      ["Progress / completion", `${identity?.progressIdentity?.id || "—"} / ${identity?.completionIdentity?.id || "—"}`],
      ["Steps / checkpoints", identity ? `${identity.stepIdentities.length} / ${identity.checkpointIdentities.length}` : "—"],
      ["Import revision", identity?.importRevision ?? "—"], ["Source fingerprint", identity?.sourceIdentityFingerprint || "—"],
    ];
    ui.identity.replaceChildren(...entries.map(([label, value]) => detailItem(label, value)));
    ui.fingerprint.textContent = snapshot ? `Intervention fingerprint: ${snapshot.fingerprint}` : "—";
  }

  async function execute(command, actionId = null) {
    if (busy || !repository || !projectId || !command) return;
    busy = true; setDisabled(true); ui.commandError.textContent = "";
    try {
      if (command === "create") inspected = await repository.createPatternExecutionIntervention(projectId);
      else {
        const snapshot = inspected?.rawIntervention;
        const selected = snapshot?.selectedAction;
        inspected = await repository.executePatternExecutionInterventionCommand(projectId, command, {
          expectedRevision: snapshot.revision,
          expectedEpoch: snapshot.epoch,
          operationId: `${command}:${system.uuidv7()}`,
          actionId: actionId || selected?.id,
          targetIdentity: command === "select" ? snapshot.actions.find((entry) => entry.id === actionId)?.targetIdentity : command === "confirm" ? selected?.targetIdentity : undefined,
          confirmedBy: "user",
        });
      }
      chosenActionId = inspected?.rawIntervention?.selectedAction?.id || null;
    } catch (error) {
      ui.commandError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Intervention-команда не выполнена."}`;
      inspected = await repository.readPatternExecutionIntervention(projectId);
    } finally { busy = false; setDisabled(false); render(); }
  }

  function renderWithoutProject() {
    hideCommands(); ui.commandBar.hidden = true; ui.backMonitoring.hidden = true; ui.openAction.hidden = true; ui.select.hidden = true; ui.confirmationPanel.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.context.textContent = "Без project context intervention работает только как безопасное пустое представление.";
    ui.lifecycle.textContent = "Нет project context"; ui.lifecycle.dataset.status = "waiting";
    ui.monitoringStatus.textContent = "—"; ui.assessmentReason.textContent = "Чтение не создаёт и не изменяет snapshots.";
    renderObservations(null); renderRecommendation(null); renderActions(null); renderDecision(null); renderState(null); renderIdentity(null);
  }

  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function hideCommands() { for (const button of commandButtons) button.hidden = true; }
  function setDisabled(value) { for (const button of [...commandButtons, ui.select, ui.confirm]) button.disabled = value; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = value; wrapper.append(label, content); return wrapper; }
  function lifecycleLabel(value) { return ({ waiting: "Ожидание", assessing: "Assessment", ready: "Готово", confirmation_required: "Нужно подтверждение", confirmed: "Подтверждено", cancelled: "Отменено", completed: "Завершено", blocked: "Заблокировано", failed: "Сбой", stale: "Устарело" })[value] || value; }
})(typeof window !== "undefined" ? window : globalThis);
