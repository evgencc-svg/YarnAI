"use strict";

(function initializePatternExecutionResultAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-result-fatal"), fatalMessage: byId("execution-result-fatal-message"), workflow: byId("execution-result-workflow"),
    title: byId("execution-result-project-title"), message: byId("execution-result-message"), status: byId("execution-result-status"), revision: byId("execution-result-revision"), summary: byId("execution-result-summary"), counts: byId("execution-result-counts"),
    parameters: byId("execution-result-parameters"), steps: byId("execution-result-steps"), actions: byId("execution-result-actions"), checkpoints: byId("execution-result-checkpoints"), deviations: byId("execution-result-deviations"),
    warningsPanel: byId("execution-result-warnings-panel"), warnings: byId("execution-result-warnings"), notesPanel: byId("execution-result-notes-panel"), notes: byId("execution-result-notes"),
    blockersPanel: byId("execution-result-blockers-panel"), blockers: byId("execution-result-blockers"), stalePanel: byId("execution-result-stale-panel"), staleReasons: byId("execution-result-stale-reasons"),
    actionsPanel: byId("execution-result-actions-panel"), generate: byId("execution-result-generate"), retry: byId("execution-result-retry"), rebuild: byId("execution-result-rebuild"), save: byId("execution-result-save"), error: byId("execution-result-error"),
    identity: byId("execution-result-identity"), fingerprint: byId("execution-result-fingerprint"), back: byId("execution-result-back"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionResult;
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть итоговый результат."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    hideActions();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    bindActions();
    ui.back.href = `/pattern-execution-completion?project=${encodeURIComponent(projectId)}`;
    ui.back.hidden = false;
    inspected = await repository.readPatternExecutionResult(projectId);
    render();
  }

  function bindActions() {
    ui.generate.addEventListener("click", () => execute("generate"));
    ui.retry.addEventListener("click", () => execute("retry"));
    ui.rebuild.addEventListener("click", () => execute("rebuild"));
    ui.save.addEventListener("click", saveSnapshot);
  }

  function render() {
    hideActions();
    ui.error.textContent = "";
    const state = inspected.result;
    const effectiveStale = Boolean(state && inspected.staleness.stale);
    const status = effectiveStale ? "stale" : state?.status || "waiting";
    const snapshot = state?.resultSnapshot || null;
    ui.title.textContent = snapshot?.planSummary?.title || inspected.project?.title || "Итог завершённого проекта";
    ui.status.textContent = statusLabel(status);
    ui.status.dataset.status = status;
    ui.revision.textContent = state ? `Revision ${state.revision} · result ${state.resultRevision}` : "Revision —";
    ui.message.textContent = inspected.corrupt
      ? "Сохранённый итог повреждён; автоматическое исправление отключено."
      : !inspected.calculation
        ? "У проекта нет активного сохранённого расчёта. Формирование итога недоступно."
        : statusMessage(status, Boolean(state), Boolean(snapshot));
    renderSummary(snapshot);
    renderParameters(snapshot);
    renderCollections(snapshot);
    renderReasons(state, effectiveStale);
    renderIdentity(state, snapshot);
    ui.generate.hidden = !(inspected.canGenerate && !inspected.corrupt);
    ui.retry.hidden = !(inspected.canRetry && !effectiveStale);
    ui.rebuild.hidden = !(inspected.canRebuild || effectiveStale);
    ui.save.hidden = !(snapshot && status === "ready");
    ui.actionsPanel.hidden = ui.generate.hidden && ui.retry.hidden && ui.rebuild.hidden && ui.save.hidden;
  }

  function renderSummary(snapshot) {
    const counts = snapshot?.executionSummary?.counts || {};
    ui.summary.textContent = snapshot ? summarySentence(snapshot) : "Итоговый snapshot ещё не создан.";
    const values = [
      ["Завершено steps", counts.logicalSteps ?? snapshot?.completedSteps?.length ?? 0],
      ["Выполнено actions", counts.completedActions ?? snapshot?.completedActions?.length ?? 0],
      ["Checkpoints", counts.confirmedCheckpoints ?? snapshot?.confirmedCheckpoints?.length ?? 0],
      ["Result revision", snapshot?.resultRevision ?? 0],
    ];
    ui.counts.replaceChildren(...values.map(([label, value]) => definitionItem(label, value)));
  }

  function summarySentence(snapshot) {
    const date = snapshot.completionReference?.completedAt ? new Date(snapshot.completionReference.completedAt).toLocaleString("ru-RU") : "дата не указана";
    return `Проект завершён по сохранённому плану. Дата завершения: ${date}. Session ${snapshot.sessionId}, epoch ${snapshot.sessionEpoch}.`;
  }

  function definitionItem(labelText, value) {
    const wrapper = document.createElement("div");
    const label = document.createElement("dt");
    const content = document.createElement("dd");
    label.textContent = labelText;
    content.textContent = String(value);
    wrapper.append(label, content);
    return wrapper;
  }

  function renderParameters(snapshot) {
    const planned = new Map((snapshot?.plannedParameters || []).map((entry) => [entry.key, entry]));
    const actual = new Map((snapshot?.actualParameters || []).map((entry) => [entry.key, entry]));
    const keys = [...new Set([...planned.keys(), ...actual.keys()])].sort();
    const rows = keys.length ? keys.map((key) => parameterRow(planned.get(key), actual.get(key))) : [emptyParameterRow()];
    ui.parameters.replaceChildren(...rows);
  }

  function parameterRow(planned, actual) {
    const row = document.createElement("tr");
    const label = document.createElement("th");
    const plannedValue = document.createElement("td");
    const actualValue = document.createElement("td");
    const verification = document.createElement("td");
    label.scope = "row";
    label.textContent = planned?.label || actual?.label || planned?.key || actual?.key || "Параметр";
    plannedValue.textContent = formatValue(planned?.plannedValue, planned?.unit || actual?.unit);
    actualValue.textContent = formatValue(actual?.actualValue, actual?.unit || planned?.unit);
    verification.textContent = actual?.verificationStatus || planned?.verificationStatus || "—";
    row.append(label, plannedValue, actualValue, verification);
    return row;
  }

  function emptyParameterRow() {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Подтверждённые параметры отсутствуют.";
    row.append(cell);
    return row;
  }

  function renderCollections(snapshot) {
    renderList(ui.steps, snapshot?.completedSteps, (entry) => `${entry.title} · ${entry.status}`);
    renderList(ui.actions, snapshot?.completedActions, (entry) => `${entry.title} · ${entry.status}`);
    renderList(ui.checkpoints, snapshot?.confirmedCheckpoints, (entry) => `${entry.label} · ${entry.status}`);
    renderList(ui.deviations, snapshot?.deviations, (entry) => `${parameterLabel(snapshot, entry.parameterKey)}: ${formatValue(entry.plannedValue, entry.unit)} → ${formatValue(entry.actualValue, entry.unit)} · ${entry.severity}`);
    const warnings = snapshot?.warnings || [];
    const notes = snapshot?.notes || [];
    ui.warnings.replaceChildren(...warnings.map((entry) => listItem(`${entry.code}: ${entry.message}`)));
    ui.notes.replaceChildren(...notes.map((entry) => listItem(entry.text)));
    ui.warningsPanel.hidden = warnings.length === 0;
    ui.notesPanel.hidden = notes.length === 0;
  }

  function renderList(target, entries, formatter) {
    const values = Array.isArray(entries) && entries.length ? entries.map((entry) => listItem(formatter(entry))) : [listItem("Нет данных")];
    target.replaceChildren(...values);
  }

  function listItem(value) {
    const item = document.createElement("li");
    item.textContent = value;
    return item;
  }

  function renderReasons(state, effectiveStale) {
    const blockers = state?.blockers || [];
    const staleReasons = effectiveStale ? inspected.staleness.reasons : state?.staleReasons || [];
    ui.blockers.replaceChildren(...blockers.map((entry) => listItem(`${entry.code}: ${entry.message}`)));
    ui.staleReasons.replaceChildren(...staleReasons.map((entry) => listItem(`${entry.code}: ${entry.message}`)));
    ui.blockersPanel.hidden = blockers.length === 0;
    ui.stalePanel.hidden = staleReasons.length === 0;
  }

  function renderIdentity(state, snapshot) {
    const identity = state?.expectedSourceIdentity || snapshot?.sourceIdentity || null;
    const entries = [
      ["Project", identity?.projectId],
      ["Plan", identity?.plan ? `${identity.plan.id} · r${identity.plan.revision} · ${identity.plan.fingerprint}` : null],
      ["Session", identity?.session ? `${identity.session.id} · epoch ${identity.session.epoch} · r${identity.session.revision}` : null],
      ["Steps", identity?.steps?.map((entry) => `${entry.id}:r${entry.revision}`).join(", ")],
      ["Checkpoints", identity?.checkpoints?.map((entry) => `${entry.id}:r${entry.revision}`).join(", ")],
      ["Progress", identity?.progress ? `${identity.progress.id} · r${identity.progress.revision}` : null],
      ["Completion", identity?.completion ? `${identity.completion.id} · r${identity.completion.revision}` : null],
    ];
    ui.identity.replaceChildren(...entries.map(([label, value]) => identityItem(label, value || "—")));
    ui.fingerprint.textContent = snapshot ? `Result fingerprint: ${snapshot.fingerprint} · Source identity: ${identity?.sourceIdentityFingerprint || "—"}` : "—";
  }

  function identityItem(labelText, value) {
    const wrapper = document.createElement("div");
    const label = document.createElement("dt");
    const content = document.createElement("dd");
    label.textContent = labelText;
    content.textContent = value;
    wrapper.append(label, content);
    return wrapper;
  }

  async function execute(mode) {
    if (busy || !repository || !projectId) return;
    busy = true;
    setDisabled(true);
    ui.error.textContent = "";
    try {
      const options = { operationId: `${mode}:${system.uuidv7()}` };
      if (mode === "generate") inspected = await repository.generatePatternExecutionResult(projectId, options);
      if (mode === "retry") inspected = await repository.retryPatternExecutionResult(projectId, options);
      if (mode === "rebuild") inspected = await repository.rebuildPatternExecutionResult(projectId, options);
    } catch (error) {
      ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`;
      inspected = await repository.readPatternExecutionResult(projectId);
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function saveSnapshot() {
    const snapshot = inspected?.result?.resultSnapshot;
    if (!snapshot || inspected?.result?.status !== "ready") return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yarnai-result-${snapshot.projectId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function hideActions() { for (const element of actionElements()) element.hidden = true; }
  function setDisabled(value) { for (const element of actionElements()) element.disabled = value; }
  function actionElements() { return [ui.generate, ui.retry, ui.rebuild, ui.save]; }
  function renderWithoutProject() {
    hideActions();
    ui.actionsPanel.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.status.textContent = "Нет project context";
    ui.status.dataset.status = "waiting";
    ui.revision.textContent = "Revision —";
    ui.message.textContent = "Откройте итог из связанного подтверждения завершённости. Без project context чтение, сохранение и изменения недоступны.";
    renderSummary(null);
    renderParameters(null);
    renderCollections(null);
    renderIdentity(null, null);
  }
  function showFatal(message) { hideActions(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function parameterLabel(snapshot, key) { return [...(snapshot?.plannedParameters || []), ...(snapshot?.actualParameters || [])].find((entry) => entry.key === key)?.label || key; }
  function formatValue(value, unit) { if (value === undefined || value === null) return "—"; const result = typeof value === "object" ? JSON.stringify(value) : String(value); return unit ? `${result} ${unit}` : result; }
  function statusLabel(status) { return ({ waiting: "Ожидание", generating: "Формирование", ready: "Готово", blocked: "Заблокировано", stale: "Устарело", failed: "Ошибка" })[status] || status; }
  function statusMessage(status, exists, hasSnapshot) { return ({ waiting: exists ? "Итог ожидает явной генерации." : "Итог ещё не создан. Доступна явная генерация из сохранённого completion snapshot.", generating: "Незавершённая генерация будет безопасно восстановлена в failed.", ready: "Итог сохранён локально и повторно открывается без скрытого перестроения.", blocked: hasSnapshot ? "Новая генерация заблокирована; прежний валидный snapshot сохранён." : "Completion identity не позволяет сформировать итог. Причины перечислены ниже.", failed: hasSnapshot ? "Операция завершилась ошибкой; прежний валидный snapshot сохранён." : "Генерация завершилась контролируемой ошибкой. Доступен явный retry.", stale: "Source identity изменилась. Сохранённый итог показан как устаревший; автоматический rebuild не выполняется." })[status] || "Итог недоступен."; }
})(typeof window !== "undefined" ? window : globalThis);
