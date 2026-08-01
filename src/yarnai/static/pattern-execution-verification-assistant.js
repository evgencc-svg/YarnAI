"use strict";

(function initializePatternExecutionVerificationAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-verification-fatal"), fatalMessage: byId("execution-verification-fatal-message"), workflow: byId("execution-verification-workflow"),
    title: byId("execution-verification-title"), context: byId("execution-verification-context"), status: byId("execution-verification-status"), revision: byId("execution-verification-revision"),
    summary: byId("execution-verification-summary"), blocked: byId("execution-verification-blocked"), action: byId("execution-verification-action"), evidence: byId("execution-verification-evidence"),
    criteria: byId("execution-verification-criteria"), contradictions: byId("execution-verification-contradictions"), commandBar: byId("execution-verification-command-bar"),
    commandError: byId("execution-verification-command-error"), backEvidence: byId("execution-verification-back-evidence"), addEvidence: byId("execution-verification-add-evidence"), fixAction: byId("execution-verification-fix-action"), openDecision: byId("execution-verification-open-decision"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionVerification;
  const buttons = [...document.querySelectorAll("#execution-verification-command-bar [data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть execution verification."));

  async function initialize() {
    hideCommands(); bindControls();
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository(); await repository.initialize();
    inspected = await repository.readPatternExecutionVerification(projectId);
    const query = `?project=${encodeURIComponent(projectId)}`;
    ui.backEvidence.href = `/pattern-execution-evidence${query}`;
    ui.addEvidence.href = `/pattern-execution-evidence${query}`;
    ui.fixAction.href = `/pattern-execution-action${query}`;
    ui.openDecision.href = `/pattern-execution-decision${query}`;
    render();
  }

  function bindControls() { for (const button of buttons) button.addEventListener("click", () => runCommand(button.dataset.command)); }

  function render() {
    hideCommands(); ui.commandError.textContent = "";
    const snapshot = inspected?.rawVerification || null;
    const status = inspected?.effectiveStatus || snapshot?.status || "waiting";
    ui.title.textContent = inspected?.project?.title ? `Проверка выполнения: ${inspected.project.title}` : "Проверка выполнения действия";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Контекст проекта недоступен.";
    ui.status.textContent = statusLabel(status); ui.status.dataset.status = status;
    ui.revision.textContent = snapshot ? `Epoch ${snapshot.epoch} · revision ${snapshot.revision}` : "Epoch — · revision —";
    renderSummary(snapshot, status); renderAction(); renderEvidence(); renderCriteria(snapshot); renderContradictions(snapshot);
    ui.blocked.hidden = status !== "blocked";
    ui.blocked.textContent = status === "blocked" ? `Безопасное blocked-состояние: ${inspected?.blockedReason || (inspected?.brokenReferences ? "ссылки на action/evidence несовместимы" : "исходные данные повреждены")}.` : "";
    const allowed = new Set(inspected?.availableCommands || []);
    for (const button of buttons) button.hidden = !allowed.has(button.dataset.command);
    ui.commandBar.hidden = buttons.every((button) => button.hidden);
    ui.addEvidence.hidden = status !== "needs_evidence";
    ui.fixAction.hidden = !["rejected", "contradicted", "blocked"].includes(status);
    ui.openDecision.hidden = !["verified", "needs_evidence", "contradicted", "rejected", "blocked", "stale"].includes(status);
  }

  function renderSummary(snapshot, status) {
    const summary = snapshot?.summary || {};
    ui.summary.replaceChildren(...[
      ["Status", status], ["Обязательных подтверждено", `${summary.requiredConfirmed ?? 0} / ${summary.requiredTotal ?? snapshot?.expectedCriteria?.filter((entry) => entry.required).length ?? 0}`],
      ["Contradictions", String(summary.contradictionCount ?? snapshot?.contradictions?.length ?? 0)], ["Проверено", snapshot?.verifiedAt || "—"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderAction() {
    const action = inspected?.action || null;
    const description = action?.selectedAction?.reason || action?.selectedAction?.type || action?.executionPlan?.command || "—";
    ui.action.replaceChildren(...[
      ["Название / описание", description], ["Action ID", action?.id || "—"], ["Статус", action?.lifecycle || "waiting"],
      ["Revision", action?.revision ? String(action.revision) : "—"], ["Версия входа", action?.fingerprint || "—"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderEvidence() {
    const rows = [];
    for (const bundle of inspected?.evidence || []) {
      const items = Array.isArray(bundle.evidenceItems) && bundle.evidenceItems.length ? bundle.evidenceItems : [bundle];
      for (const item of items) {
        const suitability = evidenceSuitability(bundle, item);
        rows.push(tableRow([
          item.type || bundle.type || "—", item.source || bundle.kind || "—", item.collectedAt || bundle.updatedAt || bundle.createdAt || "—",
          item.criterionId || item.type || "—", suitability,
        ]));
      }
    }
    if (!rows.length) rows.push(emptyRow(5, "Evidence ещё не собраны. Основной recovery-путь ведёт на Stage 33."));
    ui.evidence.replaceChildren(...rows);
  }

  function renderCriteria(snapshot) {
    const results = new Map((snapshot?.criterionResults || []).map((entry) => [entry.criterionId, entry]));
    const criteria = snapshot?.expectedCriteria || inspected?.expectedCriteria || [];
    const rows = criteria.map((entry) => {
      const result = results.get(entry.id || entry.criterionId) || { outcome: "insufficient", supportingEvidenceIds: [], explanation: "Проверка ещё не выполнена." };
      const row = tableRow([entry.label || entry.id, entry.required === false ? "Нет" : "Да", result.outcome, result.supportingEvidenceIds.join(", ") || "—", result.explanation]);
      row.children[2].dataset.outcome = result.outcome;
      return row;
    });
    if (!rows.length) rows.push(emptyRow(5, "Ожидаемые критерии недоступны."));
    ui.criteria.replaceChildren(...rows);
  }

  function renderContradictions(snapshot) {
    const values = snapshot?.contradictions || [];
    ui.contradictions.replaceChildren(...(values.length ? values.map((entry) => listItem(`${entry.code} · ${entry.criterionId || "общий"} · ${(entry.evidenceIds || []).join(", ") || "без evidence id"}`)) : [listItem("Противоречия не обнаружены.")]));
  }

  async function runCommand(command) {
    if (busy || !repository || !projectId || !command) return;
    busy = true; setDisabled(true); ui.commandError.textContent = "";
    try {
      if (command === "create") inspected = await repository.createPatternExecutionVerification(projectId);
      else inspected = await repository.executePatternExecutionVerificationCommand(projectId, command);
    } catch (error) {
      ui.commandError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Команда verification не выполнена."}`;
      inspected = await repository.readPatternExecutionVerification(projectId);
    } finally { busy = false; setDisabled(false); render(); }
  }

  function renderWithoutProject() {
    ui.context.textContent = "Проект не выбран. Страница остаётся безопасным read-only представлением.";
    inspected = { effectiveStatus: "waiting", evidence: [], expectedCriteria: [], availableCommands: [] };
    ui.backEvidence.hidden = true; render();
  }
  function evidenceSuitability(bundle, item) { if (bundle.lifecycle === "stale" || ["invalid", "stale", "superseded"].includes(item.validity)) return "непригодно"; if (["contradictory", "invalid", "missing"].includes(item.status)) return item.status; return "пригодно"; }
  function statusLabel(value) { return ({ waiting: "Ожидание", ready: "Готово", verifying: "Проверяем", needs_evidence: "Нужны evidence", contradicted: "Противоречие", verified: "Подтверждено", rejected: "Отклонено", blocked: "Заблокировано", stale: "Устарело" })[value] || value; }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function tableRow(values) { const row = document.createElement("tr"); for (const value of values) { const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell); } return row; }
  function emptyRow(span, value) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = span; cell.textContent = value; row.append(cell); return row; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function hideCommands() { for (const button of buttons) button.hidden = true; }
  function setDisabled(value) { for (const button of buttons) button.disabled = value; }
  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
