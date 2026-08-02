"use strict";

(function initializePatternExecutionFollowUpAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-follow-up-fatal"), fatalMessage: byId("execution-follow-up-fatal-message"), workflow: byId("execution-follow-up-workflow"),
    title: byId("execution-follow-up-title"), context: byId("execution-follow-up-context"), status: byId("execution-follow-up-status"), revision: byId("execution-follow-up-revision"),
    summary: byId("execution-follow-up-summary"), problem: byId("execution-follow-up-problem"), outcome: byId("execution-follow-up-outcome"), decisionId: byId("execution-follow-up-decision-id"),
    recommendation: byId("execution-follow-up-recommendation"), route: byId("execution-follow-up-route"), criteria: byId("execution-follow-up-criteria"), evidence: byId("execution-follow-up-evidence"), actions: byId("execution-follow-up-actions"),
    kind: byId("execution-follow-up-kind"), reason: byId("execution-follow-up-reason"), confirmation: byId("execution-follow-up-confirm"), commandError: byId("execution-follow-up-command-error"),
    backDecision: byId("execution-follow-up-back-decision"), evidenceRoute: byId("execution-follow-up-evidence-route"), actionRoute: byId("execution-follow-up-action-route"), retrospectiveRoute: byId("execution-follow-up-retrospective-route"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionFollowUp;
  const buttons = [...document.querySelectorAll("#execution-follow-up-command-bar [data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(safeMessage(error, "Не удалось открыть follow-up.")));

  async function initialize() {
    hideCommands(); bindControls();
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionFollowUp(projectId);
    const query = `?project=${encodeURIComponent(projectId)}`;
    ui.backDecision.href = `/pattern-execution-decision${query}`;
    ui.evidenceRoute.href = `/pattern-execution-evidence${query}`;
    ui.actionRoute.href = `/pattern-execution-action${query}`;
    ui.retrospectiveRoute.href = `/pattern-execution-retrospective${query}`;
    render();
  }

  function bindControls() {
    for (const button of buttons) button.addEventListener("click", () => runCommand(button.dataset.command));
  }

  function render() {
    hideCommands(); ui.commandError.textContent = "";
    const snapshot = inspected?.rawFollowUp || null;
    const decision = inspected?.decision || null;
    const recommendation = inspected?.recommendation?.recommendedKind || inspected?.recommendedKind || null;
    const allowedKinds = inspected?.recommendation?.allowedKinds || inspected?.allowedKinds || [];
    const status = inspected?.effectiveStatus || snapshot?.status || "waiting";
    const outcome = snapshot?.outcome || decision?.decision?.outcome || inspected?.outcome || "pending";
    ui.title.textContent = inspected?.project?.title ? `Follow-up: ${inspected.project.title}` : "Дальнейшее действие после решения";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Контекст проекта недоступен.";
    ui.status.textContent = statusLabel(status); ui.status.dataset.status = status;
    ui.revision.textContent = snapshot ? `Epoch ${snapshot.epoch} · revision ${snapshot.revision}` : "Epoch — · revision —";
    ui.outcome.textContent = outcome;
    ui.decisionId.textContent = decision?.id || snapshot?.decisionId || "Decision отсутствует";
    ui.recommendation.textContent = recommendation || (allowedKinds.length > 1 ? "требуется явный выбор" : "—");
    ui.reason.value = snapshot?.reasonCode || decision?.decision?.reasonCode || inspected?.reasonCode || "";
    renderKinds(snapshot, allowedKinds, recommendation);
    renderSummary(snapshot, status);
    renderRoute(snapshot);
    ui.problem.hidden = !["blocked", "stale"].includes(status);
    ui.problem.textContent = status === "blocked"
      ? `Blocked: ${inspected?.reasonCode || "corrupted_input"}. Follow-up не будет записан без доказуемых references.`
      : status === "stale" ? `Stale: ${inspected?.reasonCode || "stale_decision"}. Terminal snapshot сохранён; доступен rebuild с новым ID.` : "";
    const commands = new Set(inspected?.availableCommands || []);
    for (const command of ["create", "schedule", "activate", "complete", "fail", "cancel", "rebuild"]) setCommandVisible(command, commands.has(command));
    const terminal = snapshot && ["completed", "failed", "cancelled"].includes(snapshot.status);
    ui.kind.disabled = Boolean(snapshot) || terminal || ["blocked", "stale", "waiting"].includes(status);
    ui.reason.disabled = true;
    ui.confirmation.disabled = status === "blocked" || status === "waiting" || terminal && status !== "stale";
    const routeKind = snapshot?.followUpKind || ui.kind.value || recommendation;
    ui.evidenceRoute.hidden = !(status !== "stale" && status !== "blocked" && routeKind === "collect_evidence");
    ui.actionRoute.hidden = !(status !== "stale" && status !== "blocked" && routeKind === "corrective_action");
    ui.retrospectiveRoute.hidden = !(snapshot && status === "completed" && snapshot.status === "completed" && snapshot.projectId === projectId && Boolean(snapshot.inputFingerprint) && Boolean(snapshot.fingerprint));
  }

  function renderKinds(snapshot, allowedKinds, recommended) {
    const current = snapshot?.followUpKind || ui.kind.value;
    const values = snapshot ? [snapshot.followUpKind] : allowedKinds;
    ui.kind.replaceChildren(...values.map((value) => option(value, value)));
    if (current && values.includes(current)) ui.kind.value = current;
    else if (recommended && values.includes(recommended)) ui.kind.value = recommended;
  }

  function renderSummary(snapshot, status) {
    ui.summary.replaceChildren(...[
      ["Lifecycle", status], ["Kind", snapshot?.followUpKind || ui.kind.value || "—"],
      ["Reason code", snapshot?.reasonCode || ui.reason.value || "—"],
      ["Fingerprint", snapshot?.fingerprint || "—"], ["Decision fingerprint", snapshot?.decisionFingerprint || inspected?.decision?.fingerprint || "—"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderRoute(snapshot) {
    ui.route.replaceChildren(...[
      ["Decision ID", snapshot?.decisionId || inspected?.decision?.id || "—"],
      ["Plan ID", snapshot?.planId || inspected?.decision?.executionPlanId || "—"],
      ["Session ID", snapshot?.sessionId || inspected?.decision?.sessionId || "—"],
      ["Previous follow-up", snapshot?.previousFollowUpId || "—"],
      ["Terminal result", snapshot?.terminalResult ? JSON.stringify(snapshot.terminalResult) : "—"],
    ].map(([label, value]) => detailItem(label, value)));
    const preview = snapshot ? selectionFromSnapshot(snapshot) : selectionFor(ui.kind.value, inspected);
    ui.criteria.textContent = preview.selectedCriterionIds.join(", ") || "—";
    ui.evidence.textContent = preview.selectedEvidenceIds.join(", ") || "—";
    ui.actions.textContent = preview.selectedActionIds.join(", ") || "—";
  }

  async function runCommand(commandName) {
    if (busy || !repository || !projectId || !commandName) return;
    busy = true; setDisabled(true); ui.commandError.textContent = "";
    try {
      if (!ui.confirmation.checked) throw new api.PatternExecutionFollowUpError("explicit_confirmation_required", "Подтвердите маршрут явно.");
      const snapshot = inspected?.rawFollowUp || null;
      if (commandName === "create") {
        const decision = inspected?.decision;
        const selection = selectionFor(ui.kind.value, inspected);
        inspected = await repository.createPatternExecutionFollowUp(projectId, {
          decisionId: decision?.id, followUpKind: ui.kind.value, reasonCode: ui.reason.value,
          confirmation: true, ...selection,
          expectedDecisionRevision: decision?.revision, expectedDecisionFingerprint: decision?.fingerprint,
        });
      } else {
        const binding = commandForSnapshot(snapshot);
        if (commandName === "schedule") inspected = await repository.schedulePatternExecutionFollowUp(projectId, snapshot.id, binding);
        else if (commandName === "activate") inspected = await repository.activatePatternExecutionFollowUp(projectId, snapshot.id, binding);
        else if (commandName === "complete") inspected = await repository.completePatternExecutionFollowUp(projectId, snapshot.id, { ...binding, terminalResult: { route: snapshot.followUpKind, outcome: snapshot.outcome } });
        else if (commandName === "fail") inspected = await repository.failPatternExecutionFollowUp(projectId, snapshot.id, { ...binding, failure: { code: "follow_up_failed" } });
        else if (commandName === "cancel") inspected = await repository.cancelPatternExecutionFollowUp(projectId, snapshot.id, { ...binding, cancellation: { reasonCode: "user_cancelled" } });
        else if (commandName === "rebuild") inspected = await repository.rebuildPatternExecutionFollowUp(projectId, snapshot.id, { ...binding, expectedDecisionRevision: inspected?.decision?.revision, expectedDecisionFingerprint: inspected?.decision?.fingerprint });
      }
    } catch (error) {
      ui.commandError.textContent = safeMessage(error, "Команда follow-up не выполнена.");
      try { inspected = await repository.readPatternExecutionFollowUp(projectId, inspected?.rawFollowUp?.id || null); } catch { /* keep the last safe projection */ }
    } finally {
      busy = false; setDisabled(false); ui.confirmation.checked = false; render();
    }
  }

  function selectionFor(kind, value) {
    const decision = value?.decision || {};
    const selectedCriterionIds = stable(decision.decision?.selectedCriterionIds || []);
    const selectedEvidenceIds = stable(decision.decision?.selectedEvidenceIds || []);
    const actionId = value?.action?.id;
    if (kind === "collect_evidence") return {
      selectedCriterionIds, selectedEvidenceIds, selectedActionIds: [],
      targetReferences: selectedEvidenceIds.map((id) => decision.evidenceReferences?.find((entry) => entry.id === id) || { id }),
      evidenceRequirements: selectedCriterionIds.map((criterionId) => ({ criterionId, requirement: "collect_additional_evidence" })), actionTargets: [],
    };
    if (kind === "corrective_action") return {
      selectedCriterionIds, selectedEvidenceIds, selectedActionIds: actionId ? [actionId] : [],
      targetReferences: actionId ? [{ id: actionId, revision: value.action.revision, fingerprint: value.action.fingerprint }] : [],
      evidenceRequirements: [], actionTargets: selectedCriterionIds.map((criterionId) => ({ criterionId, actionId, target: "correct_decided_action" })),
    };
    return { selectedCriterionIds, selectedEvidenceIds, selectedActionIds: [], targetReferences: [], evidenceRequirements: [], actionTargets: [] };
  }

  function selectionFromSnapshot(snapshot) {
    return {
      selectedCriterionIds: snapshot.selectedCriterionIds, selectedEvidenceIds: snapshot.selectedEvidenceIds,
      selectedActionIds: snapshot.selectedActionIds, targetReferences: snapshot.targetReferences,
      evidenceRequirements: snapshot.evidenceRequirements, actionTargets: snapshot.actionTargets,
    };
  }

  function commandForSnapshot(snapshot) {
    return {
      followUpKind: snapshot.followUpKind, reasonCode: snapshot.reasonCode, confirmation: true,
      ...selectionFromSnapshot(snapshot), expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint,
    };
  }

  function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function stable(values) { return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))].sort(); }
  function safeMessage(error, fallback) { const code = typeof error?.code === "string" ? error.code : ""; const message = typeof error?.userMessage === "string" ? error.userMessage : fallback; return `${code ? `${code}: ` : ""}${message}`; }
  function statusLabel(value) { return ({ waiting: "Ожидание", ready: "Готово", scheduling: "Планирование", active: "Активно", completed: "Завершено", failed: "Ошибка", cancelled: "Отменено", blocked: "Заблокировано", stale: "Устарело" })[value] || value; }
  function setCommandVisible(command, visible) { const button = buttons.find((item) => item.dataset.command === command); if (button) button.hidden = !visible; }
  function hideCommands() { for (const button of buttons) button.hidden = true; }
  function setDisabled(value) { for (const button of buttons) button.disabled = value; }
  function renderWithoutProject() { inspected = { effectiveStatus: "waiting", allowedKinds: [], availableCommands: [] }; ui.context.textContent = "Проект не выбран. Страница остаётся безопасным read-only представлением."; ui.backDecision.hidden = true; render(); }
  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
