"use strict";

(function initializePatternExecutionDecisionAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-decision-fatal"), fatalMessage: byId("execution-decision-fatal-message"), workflow: byId("execution-decision-workflow"),
    title: byId("execution-decision-title"), context: byId("execution-decision-context"), status: byId("execution-decision-status"), revision: byId("execution-decision-revision"),
    summary: byId("execution-decision-summary"), problem: byId("execution-decision-problem"), verificationStatus: byId("execution-decision-verification-status"),
    verificationId: byId("execution-decision-verification-id"), recommendation: byId("execution-decision-recommendation"), current: byId("execution-decision-current"),
    allowed: byId("execution-decision-allowed"), outcome: byId("execution-decision-outcome"), reason: byId("execution-decision-reason"),
    explanation: byId("execution-decision-explanation"), followUp: byId("execution-decision-follow-up"), criteria: byId("execution-decision-criteria"), evidence: byId("execution-decision-evidence"),
    confirmation: byId("execution-decision-confirm"), commandBar: byId("execution-decision-command-bar"), commandError: byId("execution-decision-command-error"),
    backVerification: byId("execution-decision-back-verification"), moreEvidence: byId("execution-decision-more-evidence"), correctAction: byId("execution-decision-correct-action"), openFollowUp: byId("execution-decision-open-follow-up"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionDecision;
  const buttons = [...document.querySelectorAll("#execution-decision-command-bar [data-command]")];
  const REASONS = Object.freeze({
    accepted: ["verification_accepted"],
    more_evidence_required: ["insufficient_evidence", "conflicting_evidence"],
    correction_required: ["action_correction_required", "conflicting_evidence"],
    rejected: ["verification_rejected", "conflicting_evidence"],
  });
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть execution decision."));

  async function initialize() {
    hideCommands(); bindControls();
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionDecision(projectId);
    const query = `?project=${encodeURIComponent(projectId)}`;
    ui.backVerification.href = `/pattern-execution-verification${query}`;
    ui.moreEvidence.href = `/pattern-execution-evidence${query}`;
    ui.correctAction.href = `/pattern-execution-action${query}`;
    ui.openFollowUp.href = `/pattern-execution-follow-up${query}`;
    render();
  }

  function bindControls() {
    for (const button of buttons) button.addEventListener("click", () => runCommand(button.dataset.command));
    ui.outcome.addEventListener("change", renderReasons);
  }

  function render() {
    hideCommands(); ui.commandError.textContent = "";
    const snapshot = inspected?.rawDecision || null;
    const status = inspected?.effectiveStatus || snapshot?.status || "waiting";
    const verificationStatus = inspected?.verificationStatus || inspected?.verification?.status || snapshot?.verificationStatus || "missing";
    const allowed = inspected?.allowedOutcomes || snapshot?.allowedOutcomes || [];
    ui.title.textContent = inspected?.project?.title ? `Решение: ${inspected.project.title}` : "Решение по verification";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Контекст проекта недоступен.";
    ui.status.textContent = statusLabel(status); ui.status.dataset.status = status;
    ui.revision.textContent = snapshot ? `Epoch ${snapshot.epoch} · revision ${snapshot.revision}` : "Epoch — · revision —";
    ui.verificationStatus.textContent = verificationStatus;
    ui.verificationId.textContent = inspected?.verification?.id || snapshot?.verificationId || "Verification отсутствует";
    ui.recommendation.textContent = inspected?.recommendation || snapshot?.recommendation || "—";
    ui.allowed.textContent = `Allowed outcomes: ${allowed.join(", ") || "—"}`;
    renderSummary(snapshot, status); renderCurrent(snapshot); renderOutcomeOptions(allowed); renderSelections(snapshot);
    ui.problem.hidden = !["blocked", "stale"].includes(status);
    ui.problem.textContent = status === "blocked" ? `Blocked: ${inspected?.reasonCode || "corrupted_input"}. Решение не будет принято без доказанной целостности входов.` : status === "stale" ? `Stale: ${inspected?.reasonCode || "stale_verification"}. Сначала пересоберите verification на Stage 34 или явно rebuild decision.` : "";
    const commands = new Set(inspected?.availableCommands || []);
    setCommandVisible("create", commands.has("create"));
    setCommandVisible("begin", commands.has("decide") && snapshot?.status === "ready");
    setCommandVisible("decide", commands.has("decide") && ["ready", "deciding", "more_evidence_required", "correction_required"].includes(snapshot?.status));
    setCommandVisible("rebuild", commands.has("rebuild"));
    const locked = !snapshot || ["accepted", "rejected", "blocked", "stale"].includes(status);
    for (const control of [ui.outcome, ui.reason, ui.explanation, ui.followUp, ui.confirmation]) control.disabled = locked;
    for (const checkbox of document.querySelectorAll("#execution-decision-criteria input, #execution-decision-evidence input")) checkbox.disabled = locked;
    ui.moreEvidence.hidden = status !== "more_evidence_required";
    ui.correctAction.hidden = !["correction_required", "rejected", "blocked"].includes(status);
    ui.openFollowUp.hidden = !["accepted", "more_evidence_required", "correction_required", "rejected"].includes(snapshot?.decision?.outcome);
  }

  function renderSummary(snapshot, status) {
    ui.summary.replaceChildren(...[
      ["Lifecycle", status], ["Outcome", snapshot?.decision?.outcome || "pending"],
      ["Reason code", snapshot?.decision?.reasonCode || inspected?.reasonCode || "—"],
      ["Fingerprint", snapshot?.fingerprint || "—"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderCurrent(snapshot) {
    ui.current.replaceChildren(...[
      ["Outcome", snapshot?.decision?.outcome || "pending"], ["Reason code", snapshot?.decision?.reasonCode || "—"],
      ["Explanation", snapshot?.decision?.explanation || "—"], ["Required follow-up", followUpText(snapshot?.decision?.requiredFollowUp)],
      ["Selected criteria", snapshot?.decision?.selectedCriterionIds?.join(", ") || "—"],
      ["Selected evidence", snapshot?.decision?.selectedEvidenceIds?.join(", ") || "—"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderOutcomeOptions(allowed) {
    const selected = ui.outcome.value;
    ui.outcome.replaceChildren(...allowed.map((value) => option(value, value)));
    if (allowed.includes(selected)) ui.outcome.value = selected;
    renderReasons();
  }

  function renderReasons() {
    const selected = ui.reason.value;
    const reasons = REASONS[ui.outcome.value] || [];
    ui.reason.replaceChildren(...reasons.map((value) => option(value, value)));
    if (reasons.includes(selected)) ui.reason.value = selected;
  }

  function renderSelections(snapshot) {
    const selectedCriteria = new Set(snapshot?.decision?.selectedCriterionIds || []);
    const selectedEvidence = new Set(snapshot?.decision?.selectedEvidenceIds || []);
    ui.criteria.replaceChildren(...(snapshot?.criterionIds || []).map((id) => choice("criterion", id, selectedCriteria.has(id))));
    ui.evidence.replaceChildren(...(snapshot?.evidenceReferences || []).map((entry) => choice("evidence", entry.id, selectedEvidence.has(entry.id))));
    if (!snapshot?.criterionIds?.length) ui.criteria.append(emptyText("Критерии недоступны."));
    if (!snapshot?.evidenceReferences?.length) ui.evidence.append(emptyText("Evidence недоступны."));
  }

  async function runCommand(commandName) {
    if (busy || !repository || !projectId || !commandName) return;
    busy = true; setDisabled(true); ui.commandError.textContent = "";
    try {
      const snapshot = inspected?.rawDecision;
      if (commandName === "create") inspected = await repository.createPatternExecutionDecision(projectId);
      else if (commandName === "begin") inspected = await repository.updatePatternExecutionDecision(projectId, snapshot.id, { status: "deciding" }, snapshot.revision, snapshot.fingerprint);
      else if (commandName === "rebuild") inspected = await repository.rebuildPatternExecutionDecision(projectId, snapshot.id, { expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint });
      else if (commandName === "decide") {
        if (!ui.confirmation.checked) throw new api.PatternExecutionDecisionError("explicit_confirmation_required", "Подтвердите выбранный outcome явно.");
        inspected = await repository.decidePatternExecution(projectId, snapshot.id, {
          outcome: ui.outcome.value, reasonCode: ui.reason.value, explanation: ui.explanation.value,
          requiredFollowUp: ui.followUp.value || null,
          selectedCriterionIds: selectedValues("criterion"), selectedEvidenceIds: selectedValues("evidence"),
          expectedRevision: snapshot.revision, expectedFingerprint: snapshot.fingerprint,
        });
      }
    } catch (error) {
      ui.commandError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Команда decision не выполнена."}`;
      inspected = await repository.readPatternExecutionDecision(projectId, inspected?.rawDecision?.id || null);
    } finally { busy = false; setDisabled(false); ui.confirmation.checked = false; render(); }
  }

  function selectedValues(group) { return [...document.querySelectorAll(`input[data-selection="${group}"]:checked`)].map((item) => item.value); }
  function choice(group, value, checked) { const label = document.createElement("label"); label.className = "choice"; const input = document.createElement("input"); input.type = "checkbox"; input.dataset.selection = group; input.value = value; input.checked = checked; const text = document.createElement("span"); text.textContent = value; label.append(input, text); return label; }
  function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; }
  function emptyText(value) { const item = document.createElement("p"); item.className = "muted"; item.textContent = value; return item; }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function followUpText(value) { if (!value) return "—"; return typeof value === "string" ? value : JSON.stringify(value); }
  function statusLabel(value) { return ({ waiting: "Ожидание", ready: "Готово", deciding: "Рассмотрение", accepted: "Принято", more_evidence_required: "Нужно больше evidence", correction_required: "Нужно исправление", rejected: "Отклонено", blocked: "Заблокировано", stale: "Устарело" })[value] || value; }
  function setCommandVisible(command, visible) { const button = buttons.find((item) => item.dataset.command === command); if (button) button.hidden = !visible; }
  function hideCommands() { for (const button of buttons) button.hidden = true; }
  function setDisabled(value) { for (const button of buttons) button.disabled = value; }
  function renderWithoutProject() { inspected = { effectiveStatus: "waiting", allowedOutcomes: [], availableCommands: [] }; ui.context.textContent = "Проект не выбран. Страница остаётся безопасным read-only представлением."; ui.backVerification.hidden = true; render(); }
  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
