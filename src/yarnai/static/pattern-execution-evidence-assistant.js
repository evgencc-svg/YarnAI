"use strict";

(function initializePatternExecutionEvidenceAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-evidence-fatal"), fatalMessage: byId("execution-evidence-fatal-message"), workflow: byId("execution-evidence-workflow"),
    title: byId("execution-evidence-title"), context: byId("execution-evidence-context"), lifecycle: byId("execution-evidence-lifecycle"), revision: byId("execution-evidence-revision"),
    identity: byId("execution-evidence-identity"), chainStatus: byId("execution-evidence-chain-status"), chain: byId("execution-evidence-chain"),
    items: byId("execution-evidence-items"), assertions: byId("execution-evidence-assertions"), missing: byId("execution-evidence-missing"),
    contradictions: byId("execution-evidence-contradictions"), unexpected: byId("execution-evidence-unexpected"), summary: byId("execution-evidence-summary"),
    commandBar: byId("execution-evidence-command-bar"), commandError: byId("execution-evidence-command-error"), audit: byId("execution-evidence-audit"),
    fingerprint: byId("execution-evidence-fingerprint"), backAction: byId("execution-evidence-back-action"), openVerification: byId("execution-evidence-open-verification"), exportButton: byId("execution-evidence-export"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionEvidence;
  const commandButtons = [...document.querySelectorAll("#execution-evidence-command-bar [data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть evidence bundle."));

  async function initialize() {
    hideCommands();
    bindControls();
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionEvidence(projectId);
    ui.backAction.href = `/pattern-execution-action?project=${encodeURIComponent(projectId)}`;
    ui.backAction.hidden = !inspected?.action;
    ui.openVerification.href = `/pattern-execution-verification?project=${encodeURIComponent(projectId)}`;
    render();
  }

  function bindControls() {
    for (const button of commandButtons) button.addEventListener("click", () => runCommand(button.dataset.command));
    ui.exportButton.addEventListener("click", exportEvidence);
  }

  function render() {
    hideCommands();
    ui.commandError.textContent = "";
    const snapshot = inspected?.rawEvidence || null;
    const lifecycle = snapshot?.lifecycle || "waiting";
    ui.title.textContent = inspected?.project?.title || "Доказательства выполнения";
    ui.context.textContent = inspected?.project ? `Проект: ${inspected.project.title || inspected.project.project_id}` : "Контекст проекта недоступен.";
    ui.lifecycle.textContent = lifecycleLabel(lifecycle);
    ui.lifecycle.dataset.status = lifecycle;
    ui.revision.textContent = snapshot ? `Evidence epoch ${snapshot.evidenceEpoch} · attempt ${snapshot.evidenceAttemptOrdinal} · revision ${snapshot.revision}` : "Evidence epoch — · revision —";
    renderIdentity(snapshot);
    renderChain(snapshot);
    renderItems(snapshot);
    renderAssertions(snapshot);
    renderDiagnostics(ui.missing, snapshot?.missingEvidence, "Обязательные evidence не отсутствуют.");
    renderDiagnostics(ui.contradictions, snapshot?.contradictions, "Противоречия не обнаружены.");
    renderDiagnostics(ui.unexpected, snapshot?.unexpectedChanges, "Неожиданные изменения не обнаружены.");
    renderSummary(snapshot);
    renderAudit(snapshot);
    const allowed = new Set(inspected?.availableCommands || []);
    const verifiedAction = inspected?.action?.lifecycle === "completed" && inspected?.action?.verification?.status === "verified" && inspected?.action?.currentAttempt?.status === "verified";
    for (const button of commandButtons) button.hidden = !verifiedAction || !allowed.has(button.dataset.command);
    ui.exportButton.hidden = !snapshot;
    ui.commandBar.hidden = commandButtons.every((button) => button.hidden) && ui.exportButton.hidden;
    ui.openVerification.hidden = !snapshot;
  }

  function renderIdentity(snapshot) {
    const action = inspected?.action;
    ui.identity.replaceChildren(...[
      ["Action", snapshot?.actionId || action?.id || "—"],
      ["Action fingerprint", snapshot?.actionFingerprint || action?.fingerprint || "—"],
      ["Action attempt", snapshot ? `${snapshot.actionAttemptId} · #${snapshot.actionAttemptOrdinal}` : action?.currentAttempt ? `${action.currentAttempt.attemptId} · #${action.currentAttempt.ordinal}` : "—"],
      ["Execution epoch", printable(snapshot?.executionEpoch || action?.epoch)],
      ["Collection status", snapshot?.collectionStatus || "not_created"],
      ["Validation status", snapshot?.validationStatus || "not_created"],
    ].map(([label, value]) => detailItem(label, value)));
  }

  function renderChain(snapshot) {
    ui.chainStatus.textContent = ({ matched: "Source chain совпадает", stale: "Source chain изменилась", not_collected: "Source chain ещё не зафиксирована" })[inspected?.sourceChainStatus] || "Source chain недоступна";
    const identities = snapshot?.collectedSourceIdentities || snapshot?.sourceIdentities || {};
    const values = ["calculation", "plan", "session", "progress", "completion", "result", "runtime", "monitoring", "intervention", "decision", "action"];
    ui.chain.replaceChildren(...values.map((name) => detailItem(name, printable(identities[name]))));
  }

  function renderItems(snapshot) {
    const items = snapshot?.evidenceItems || [];
    ui.items.replaceChildren(...(items.length ? items.map((item) => listItem(`${item.type} · ${item.status} · ${item.id}`)) : [listItem("Evidence items ещё не собраны.")]));
  }

  function renderAssertions(snapshot) {
    const assertions = snapshot?.assertions || [];
    ui.assertions.replaceChildren(...(assertions.length ? assertions.map((assertion) => listItem(`${assertion.type} · ${assertion.status} · ${assertion.code}`)) : [listItem("Assertions появятся после явного Validate.")]));
  }

  function renderDiagnostics(container, values, emptyText) {
    const entries = values || [];
    container.replaceChildren(...(entries.length ? entries.map((entry) => listItem(`${entry.code}: ${printable(entry.details)}`)) : [listItem(emptyText)]));
  }

  function renderSummary(snapshot) {
    const summary = snapshot?.summary || {};
    const entries = Object.entries(summary);
    ui.summary.replaceChildren(...(entries.length ? entries.map(([key, value]) => detailItem(key, printable(value))) : [detailItem("Status", "Summary фиксируется только при Complete.")]));
  }

  function renderAudit(snapshot) {
    const entries = snapshot?.audit || [];
    ui.audit.replaceChildren(...(entries.length ? entries.map((entry) => listItem(`${entry.event} · epoch ${entry.epoch} · revision ${entry.revision}`)) : [listItem("Audit пока пуст.")]));
    ui.fingerprint.textContent = snapshot ? `Evidence fingerprint: ${snapshot.fingerprint}` : "—";
  }

  async function runCommand(commandName) {
    if (busy || !repository || !projectId || !commandName) return;
    busy = true; setDisabled(true); ui.commandError.textContent = "";
    try {
      if (commandName === "create") inspected = await repository.createPatternExecutionEvidence(projectId);
      else {
        const snapshot = inspected?.rawEvidence;
        inspected = await repository.executePatternExecutionEvidenceCommand(projectId, commandName, {
          expectedRevision: snapshot.revision, expectedEpoch: snapshot.epoch,
          expectedFingerprint: snapshot.fingerprint, operationId: `${commandName}:${system.uuidv7()}`,
        });
      }
    } catch (error) {
      ui.commandError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Команда evidence не выполнена."}`;
      inspected = await repository.readPatternExecutionEvidence(projectId);
    } finally {
      busy = false; setDisabled(false); render();
    }
  }

  function exportEvidence() {
    const snapshot = inspected?.rawEvidence;
    if (!snapshot || !api?.serializePatternExecutionEvidence) return;
    const blob = new Blob([`${api.serializePatternExecutionEvidence(snapshot)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${snapshot.id}.json`; link.click();
    URL.revokeObjectURL(url);
  }

  function renderWithoutProject() {
    hideCommands(); ui.exportButton.hidden = true; ui.commandBar.hidden = true; ui.backAction.hidden = true; ui.openVerification.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.context.textContent = "Без project context страница остаётся безопасным read-only представлением.";
    ui.lifecycle.textContent = "Нет project context"; ui.lifecycle.dataset.status = "waiting";
    renderIdentity(null); renderChain(null); renderItems(null); renderAssertions(null);
    renderDiagnostics(ui.missing, [], "Evidence не загружен."); renderDiagnostics(ui.contradictions, [], "Evidence не загружен.");
    renderDiagnostics(ui.unexpected, [], "Evidence не загружен."); renderSummary(null); renderAudit(null);
  }

  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function hideCommands() { for (const button of commandButtons) button.hidden = true; }
  function setDisabled(value) { for (const button of commandButtons) button.disabled = value; }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = value; wrapper.append(label, content); return wrapper; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function printable(value) { if (value === null || value === undefined) return "—"; return typeof value === "object" ? JSON.stringify(value) : String(value); }
  function lifecycleLabel(value) { return ({ waiting: "Ожидание", collecting: "Сбор", validating: "Проверка", ready: "Готово к завершению", completed: "Завершено", blocked: "Заблокировано", failed: "Противоречие", cancelled: "Отменено", stale: "Source устарел" })[value] || value; }
})(typeof window !== "undefined" ? window : globalThis);
