"use strict";

(function initializePatternExecutionActionAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-action-fatal"), fatalMessage: byId("execution-action-fatal-message"), workflow: byId("execution-action-workflow"),
    title: byId("execution-action-project-title"), context: byId("execution-action-project-context"), lifecycle: byId("execution-action-lifecycle"), revision: byId("execution-action-revision"),
    decision: byId("execution-action-decision"), target: byId("execution-action-target"), attempt: byId("execution-action-attempt"), result: byId("execution-action-result"),
    verification: byId("execution-action-verification"), evidence: byId("execution-action-evidence"), problemPanel: byId("execution-action-problem-panel"),
    problemHeading: byId("execution-action-problem-heading"), problemMessage: byId("execution-action-problem-message"), commandBar: byId("execution-action-command-bar"),
    commandError: byId("execution-action-command-error"), audit: byId("execution-action-audit"), fingerprint: byId("execution-action-fingerprint"), backIntervention: byId("execution-action-back-intervention"), openEvidence: byId("execution-action-open-evidence"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionAction;
  const commandButtons = [...document.querySelectorAll("#execution-action-command-bar [data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть execution action."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    hideCommands();
    bindControls();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionAction(projectId);
    ui.backIntervention.href = `/pattern-execution-intervention?project=${encodeURIComponent(projectId)}`;
    ui.backIntervention.hidden = !inspected?.intervention;
    ui.openEvidence.href = `/pattern-execution-evidence?project=${encodeURIComponent(projectId)}`;
    render();
  }

  function bindControls() {
    for (const button of commandButtons) button.addEventListener("click", () => runCommand(button.dataset.command));
  }

  function render() {
    hideCommands();
    ui.commandError.textContent = "";
    const snapshot = inspected?.rawAction || null;
    const lifecycle = snapshot?.lifecycle || "waiting";
    ui.title.textContent = inspected?.project?.title || "Исполнение подтверждённого действия";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Контекст проекта недоступен.";
    ui.lifecycle.textContent = lifecycleLabel(lifecycle);
    ui.lifecycle.dataset.status = lifecycle;
    ui.revision.textContent = snapshot ? `Epoch ${snapshot.epoch} · revision ${snapshot.revision}` : "Epoch — · revision —";
    renderDecision(snapshot);
    renderTarget(snapshot);
    renderAttempt(snapshot);
    renderResult(snapshot);
    renderVerification(snapshot);
    renderProblem(snapshot);
    renderAudit(snapshot);
    const allowed = new Set(inspected?.availableCommands || []);
    for (const button of commandButtons) button.hidden = !allowed.has(button.dataset.command);
    ui.commandBar.hidden = commandButtons.every((button) => button.hidden);
    ui.openEvidence.hidden = !(snapshot?.lifecycle === "completed" && snapshot?.verification?.status === "verified" && snapshot?.currentAttempt?.status === "verified");
  }

  function renderDecision(snapshot) {
    const selected = snapshot?.selectedAction;
    const intervention = inspected?.intervention;
    ui.decision.replaceChildren(...[
      ["Action", selected?.type || "—"], ["Почему допустимо", selected?.reason || "Подтверждённое decision отсутствует"],
      ["Stage 31 confirmation", intervention?.confirmation ? `${intervention.confirmation.method} · ${intervention.confirmation.confirmedBy}` : "—"],
      ["Decision fingerprint", snapshot?.decisionIdentity?.fingerprint || "—"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderTarget(snapshot) {
    const target = snapshot?.targetIdentity;
    ui.target.replaceChildren(...[
      ["Target", target ? target.runtimeId || target.monitoringId || target.checkpointId || target.projectId || "—" : "—"],
      ["Expected effect", snapshot?.executionPlan?.expectedEffect || "—"],
      ["Execution mode", snapshot?.executionPlan?.executionMode || "—"],
      ["Executable", snapshot?.executionPlan?.executable === true ? "Да" : "Нет"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderAttempt(snapshot) {
    const attempt = snapshot?.currentAttempt;
    ui.attempt.replaceChildren(...[
      ["Attempt", attempt ? `${attempt.attemptId} · #${attempt.ordinal}` : "—"],
      ["Status", attempt?.status || "—"], ["Adapter invoked", yesNo(attempt?.runtimeActionExecuted)],
      ["Real change proven", yesNo(attempt?.effectApplied)], ["Idempotency key", attempt?.idempotencyKey || "—"],
      ["History", String(snapshot?.attemptHistory?.length || 0)],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderResult(snapshot) {
    const result = snapshot?.result;
    ui.result.replaceChildren(...[
      ["Action type", result?.actionType || "—"], ["Source state", printable(result?.sourceState)],
      ["Requested state", printable(result?.requestedTargetState)], ["Resulting state", printable(result?.resultingState)],
      ["Changed", yesNo(result?.changed)], ["Verified no-op", yesNo(result?.noOp)],
      ["Effect summary", result?.effectSummary || "—"], ["Blocked reason", result?.blockedReason?.code || "—"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderVerification(snapshot) {
    const verification = snapshot?.verification;
    ui.verification.replaceChildren(...[
      ["Status", verification?.status || "pending"], ["Reason", verification?.reasonCode || "—"],
      ["Expected", printable(verification?.expectedState)], ["Actual", printable(verification?.actualState)],
      ["Fingerprint", verification?.fingerprint || "—"],
    ].map(([label, value]) => detailItem(label, value)));
    const entries = Object.entries(verification?.evidence || snapshot?.currentAttempt?.evidence || {});
    ui.evidence.replaceChildren(...(entries.length ? entries.map(([key, value]) => listItem(`${key}: ${printable(value)}`)) : [listItem("Evidence появится после явного исполнения или verification.")]));
  }

  function renderProblem(snapshot) {
    const state = snapshot?.lifecycle;
    const problem = snapshot?.blockedReason || snapshot?.failure;
    ui.problemPanel.hidden = !["blocked", "failed", "cancelled", "stale"].includes(state);
    ui.problemHeading.textContent = ({ blocked: "Действие заблокировано", failed: "Verification или adapter завершились ошибкой", cancelled: "Действие отменено", stale: "Source identity устарела" })[state] || "Состояние действия";
    ui.problemMessage.textContent = problem ? `${problem.code}: ${problem.message}` : state === "cancelled" ? "Эффект не применялся." : "Обычные команды ограничены lifecycle.";
  }

  function renderAudit(snapshot) {
    const entries = snapshot?.audit || [];
    ui.audit.replaceChildren(...(entries.length ? entries.map((entry) => listItem(`${entry.event} · epoch ${entry.epoch} · revision ${entry.revision}`)) : [listItem("Audit пока пуст.")]));
    ui.fingerprint.textContent = snapshot ? `Action fingerprint: ${snapshot.fingerprint}` : "—";
  }

  async function runCommand(commandName) {
    if (busy || !repository || !projectId || !commandName) return;
    busy = true;
    setDisabled(true);
    ui.commandError.textContent = "";
    try {
      if (commandName === "create") inspected = await repository.createPatternExecutionAction(projectId);
      else {
        const snapshot = inspected?.rawAction;
        inspected = await repository.executePatternExecutionActionCommand(projectId, commandName, {
          expectedRevision: snapshot.revision,
          expectedEpoch: snapshot.epoch,
          expectedFingerprint: snapshot.fingerprint,
          operationId: `${commandName}:${system.uuidv7()}`,
        });
      }
    } catch (error) {
      ui.commandError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Команда не выполнена."}`;
      inspected = await repository.readPatternExecutionAction(projectId);
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function renderWithoutProject() {
    hideCommands();
    ui.commandBar.hidden = true;
    ui.backIntervention.hidden = true;
    ui.openEvidence.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.context.textContent = "Без project context страница остаётся безопасным read-only представлением.";
    ui.lifecycle.textContent = "Нет project context";
    ui.lifecycle.dataset.status = "waiting";
    renderDecision(null); renderTarget(null); renderAttempt(null); renderResult(null); renderVerification(null); renderProblem(null); renderAudit(null);
  }

  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function hideCommands() { for (const button of commandButtons) button.hidden = true; }
  function setDisabled(value) { for (const button of commandButtons) button.disabled = value; }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = value; wrapper.append(label, content); return wrapper; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function yesNo(value) { return value === true ? "Да" : value === false ? "Нет" : "—"; }
  function printable(value) { if (value === null || value === undefined) return "—"; return typeof value === "object" ? JSON.stringify(value) : String(value); }
  function lifecycleLabel(value) { return ({ waiting: "Ожидание", validating: "Проверка", ready: "Готово к исполнению", executing: "Adapter исполняется", verifying: "Ожидает verification", completed: "Verified и завершено", blocked: "Заблокировано", failed: "Ошибка", cancelled: "Отменено", stale: "Устарело" })[value] || value; }
})(typeof window !== "undefined" ? window : globalThis);
