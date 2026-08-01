"use strict";

(function initializePatternExecutionCheckpointPage(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-checkpoint-fatal"), fatalMessage: byId("execution-checkpoint-fatal-message"), workflow: byId("execution-checkpoint-workflow"),
    title: byId("execution-checkpoint-project-title"), message: byId("execution-checkpoint-message"), status: byId("execution-checkpoint-status"), revision: byId("execution-checkpoint-revision"),
    component: byId("execution-checkpoint-component"), phase: byId("execution-checkpoint-phase"), action: byId("execution-checkpoint-action"),
    label: byId("execution-checkpoint-label"), expected: byId("execution-checkpoint-expected"), type: byId("execution-checkpoint-type"), unit: byId("execution-checkpoint-unit"),
    observations: byId("execution-checkpoint-observations"), observationList: byId("execution-checkpoint-observation-list"),
    actionsPanel: byId("execution-checkpoint-actions-panel"),
    start: byId("execution-checkpoint-start"), defer: byId("execution-checkpoint-defer"), resume: byId("execution-checkpoint-resume"), reject: byId("execution-checkpoint-reject"),
    confirm: byId("execution-checkpoint-confirm"), recover: byId("execution-checkpoint-recover"), rebuild: byId("execution-checkpoint-rebuild"), error: byId("execution-checkpoint-error"),
    reasonPanel: byId("execution-checkpoint-reason-panel"), reason: byId("execution-checkpoint-reason"), lifecycle: byId("execution-checkpoint-lifecycle"),
    sourceId: byId("execution-checkpoint-source-id"), decision: byId("execution-checkpoint-decision"), sync: byId("execution-checkpoint-sync"), back: byId("execution-checkpoint-back"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionCheckpoint;
  let repository = null; let projectId = null; let requestedCheckpointId = null; let record = null; let aggregate = null; let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть checkpoint."));

  async function initialize() {
    const parameters = new URLSearchParams(globalObject.location.search);
    projectId = parameters.get("project"); requestedCheckpointId = parameters.get("checkpoint");
    hideActions();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository(); await repository.initialize(); bindActions();
    ui.back.href = `/pattern-execution-step?project=${encodeURIComponent(projectId)}`;
    aggregate = await repository.getProject(projectId);
    record = await findRequestedRecord();
    if (!record && requestedCheckpointId) record = await repository.createPatternExecutionCheckpointForCurrentAction(projectId, requestedCheckpointId, { operationId: operationId("create") });
    if (record?.state.status === "sync_pending") record = await repository.recoverPatternExecutionCheckpoint(projectId, record.progress_id, { expectedRevision: record.state.revision, operationId: operationId("recover") });
    aggregate = await repository.getProject(projectId); render();
  }

  async function findRequestedRecord() {
    const records = await repository.listPatternExecutionCheckpoints(projectId);
    if (requestedCheckpointId) return records.slice().reverse().find((entry) => entry.state?.checkpointId === requestedCheckpointId) || null;
    return records.at(-1) || null;
  }

  function bindActions() {
    ui.start.addEventListener("click", () => mutate((state, options) => api.startReview(state, options), "start"));
    ui.resume.addEventListener("click", () => mutate((state, options) => api.startReview(state, options), "resume"));
    ui.defer.addEventListener("click", defer);
    ui.reject.addEventListener("click", reject);
    ui.confirm.addEventListener("click", confirm);
    ui.recover.addEventListener("click", recover);
    ui.rebuild.addEventListener("click", rebuild);
  }

  function render() {
    hideActions(); ui.actionsPanel.hidden = false; ui.reasonPanel.hidden = true; ui.observations.hidden = true; ui.observationList.replaceChildren(); ui.error.textContent = "";
    ui.title.textContent = aggregate?.project?.title || "Checkpoint";
    if (!record) return renderUnavailable();
    const state = record.state; const snapshot = state.immutableSourceSnapshot;
    ui.status.textContent = statusLabel(state.status); ui.status.dataset.status = state.status; ui.revision.textContent = `Revision ${state.revision}`;
    ui.component.textContent = snapshot.component?.label || "Компонент не указан"; ui.phase.textContent = snapshot.phase.title; ui.action.textContent = snapshot.action.title;
    ui.label.textContent = snapshot.checkpoint.label; ui.expected.textContent = formatValue(snapshot.checkpoint.expectedValue); ui.type.textContent = typeLabel(snapshot.checkpoint.type);
    ui.unit.textContent = snapshot.checkpoint.unit || "Не требуется"; ui.lifecycle.textContent = state.lifecycle.state; ui.sourceId.textContent = state.checkpointId;
    ui.decision.textContent = state.decision.status; ui.sync.textContent = state.synchronization.status; ui.message.textContent = lifecycleMessage(state);
    renderObservations(state); renderReason(state); renderActions(state);
  }

  function renderObservations(state) {
    const specs = state.immutableSourceSnapshot.observationSpecs;
    if (!specs.length) return;
    ui.observations.hidden = false;
    const editable = state.status === "reviewing" && !busy;
    ui.observationList.replaceChildren(...specs.map((spec) => observationControl(state, spec, editable)));
  }

  function observationControl(state, spec, editable) {
    const current = state.observations.find((entry) => entry.observationId === spec.observationId);
    const wrapper = document.createElement("div"); wrapper.className = "observation";
    const label = document.createElement("label"); label.textContent = observationLabel(spec); wrapper.append(label);
    const row = document.createElement("div"); row.className = "input-row";
    if (["row_count", "stitch_count", "measurement", "size_length"].includes(spec.type)) {
      const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = ["row_count", "stitch_count"].includes(spec.type) ? "1" : "any";
      input.disabled = !editable; input.value = current?.value?.value ?? ""; input.setAttribute("aria-label", observationLabel(spec));
      const unit = document.createElement("span"); unit.textContent = spec.unit || "";
      const save = button("Сохранить", () => saveObservation(spec, { value: numberFromInput(input, spec), ...(spec.unit ? { unit: spec.unit } : {}) }), !editable);
      row.append(input, unit, save);
    } else if (spec.type === "choice") {
      const select = document.createElement("select"); select.disabled = !editable; select.setAttribute("aria-label", observationLabel(spec));
      const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Выберите вариант"; select.append(placeholder);
      for (const option of spec.options) { const item = document.createElement("option"); item.value = option.id; item.textContent = option.label; select.append(item); }
      select.value = current?.value?.value || ""; row.append(select, button("Сохранить", () => saveObservation(spec, { value: select.value }), !editable));
    } else if (spec.type === "checkpoint_match") {
      row.append(button("Совпадает", () => saveObservation(spec, { value: "matched" }), !editable), button("Не совпадает", () => saveObservation(spec, { value: "not_matched" }), !editable));
    } else {
      row.append(button("Подтверждаю", () => saveObservation(spec, { value: true }), !editable), button("Не подтверждаю", () => saveObservation(spec, { value: false }), !editable));
    }
    wrapper.append(row);
    const saved = document.createElement("p"); saved.textContent = current?.value === null ? "Наблюдение не заполнено" : `Сохранено: ${formatValue(current.value)}`; wrapper.append(saved);
    return wrapper;
  }

  function renderReason(state) {
    const reason = state.staleReason || state.failure?.message || state.decision.reasonCode || state.blockers?.[0]?.message || null;
    if (!reason) return; ui.reasonPanel.hidden = false; ui.reason.textContent = state.decision.comment ? `${reason}: ${state.decision.comment}` : reason;
  }

  function renderActions(state) {
    if (state.status === "ready") ui.start.hidden = false;
    if (state.status === "reviewing") { ui.defer.hidden = false; ui.reject.hidden = false; ui.confirm.hidden = !confirmationReady(state); }
    if (["deferred", "rejected"].includes(state.status)) ui.resume.hidden = false;
    if (state.status === "sync_pending") ui.recover.hidden = false;
    if (["blocked", "stale", "failed", "confirmed", "rejected"].includes(state.status)) ui.rebuild.hidden = false;
  }

  async function saveObservation(spec, value) { await run(async () => { const options = command("observation"); record = await repository.recordPatternExecutionCheckpointObservation(projectId, record.progress_id, spec.observationId, value, options); return record; }); }
  async function defer() { const reason = globalObject.prompt("Причина переноса (необязательно)", ""); if (reason === null) return; await mutate((state, options) => api.deferCheckpoint(state, { ...options, reason }), "defer"); }
  async function reject() { const reasonCode = globalObject.prompt("Причина: mismatch, incomplete, damaged, needs_rework или other", "mismatch"); if (reasonCode === null) return; const comment = globalObject.prompt("Комментарий (до 500 символов, необязательно)", ""); if (comment === null) return; await mutate((state, options) => api.rejectCheckpoint(state, { ...options, reasonCode, comment }), "reject"); }
  async function confirm() {
    if (!globalObject.confirm("Подтвердить результат и синхронизировать Stage 23? Это действие завершит текущий action.")) return;
    await run(async () => { const options = { ...command("confirm"), confirmed: true }; record = await repository.confirmPatternExecutionCheckpoint(projectId, record.progress_id, options); return record; });
  }
  async function recover() { await run(async () => { record = await repository.recoverPatternExecutionCheckpoint(projectId, record.progress_id, { expectedRevision: record.state.revision, operationId: operationId("recovery") }); return record; }); }
  async function rebuild() { if (!globalObject.confirm("Перестроить checkpoint из актуальной identity? Несовместимые observations будут сброшены.")) return; await run(async () => { record = await repository.rebuildPatternExecutionCheckpoint(projectId, record.progress_id, { ...command("rebuild"), confirmed: true }); return record; }); }

  async function mutate(operation, type) { await run(async () => { const options = command(type); const next = operation(record.state, options); if (api.canonicalize(next) !== api.canonicalize(record.state)) record = await repository.updatePatternExecutionCheckpoint(projectId, record.progress_id, next, options); return record; }); }
  async function run(operation) {
    if (busy || !projectId || !record) return; busy = true; setDisabled(true); ui.error.textContent = "";
    try { await operation(); aggregate = await repository.getProject(projectId); }
    catch (error) { ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`; record = await repository.getPatternExecutionCheckpoint(projectId, record.progress_id); }
    finally { busy = false; setDisabled(false); render(); }
  }

  function renderWithoutProject() { hideActions(); ui.actionsPanel.hidden = true; ui.title.textContent = "Проект не выбран"; ui.status.textContent = "Нет контекста проекта"; ui.status.dataset.status = "waiting"; ui.message.textContent = "Откройте проверку из связанного шага выполнения. Без project context запись не создаётся и mutation actions скрыты."; ui.action.textContent = "—"; ui.label.textContent = "Checkpoint не выбран"; ui.expected.textContent = "—"; ui.type.textContent = "—"; ui.unit.textContent = "—"; }
  function renderUnavailable() { hideActions(); ui.actionsPanel.hidden = true; ui.status.textContent = "Недоступно"; ui.status.dataset.status = "blocked"; ui.message.textContent = requestedCheckpointId ? "Источник checkpoint не доказан или Stage 24 ещё не готов." : "Для текущего action не выбран доказанный checkpoint."; ui.action.textContent = "—"; ui.label.textContent = "Checkpoint отсутствует"; ui.expected.textContent = "—"; ui.type.textContent = "—"; ui.unit.textContent = "—"; }
  function showFatal(message) { hideActions(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function hideActions() { for (const element of actionElements()) element.hidden = true; }
  function setDisabled(value) { for (const element of actionElements()) element.disabled = value; }
  function actionElements() { return [ui.start, ui.defer, ui.resume, ui.reject, ui.confirm, ui.recover, ui.rebuild]; }
  function command(type) { return { expectedRevision: record.state.revision, operationId: operationId(type) }; }
  function operationId(type) { return `${type}:${system.uuidv7()}`; }
  function button(label, handler, disabled) { const element = document.createElement("button"); element.type = "button"; element.textContent = label; element.disabled = disabled; element.addEventListener("click", handler); return element; }
  function numberFromInput(input, spec) { const value = Number(input.value); return !input.value.trim() || !Number.isFinite(value) || (["row_count", "stitch_count"].includes(spec.type) && !Number.isInteger(value)) ? Number.NaN : value; }
  function confirmationReady(state) { const result = api.validateObservations(state); return result.complete && result.matchesExpected && !result.structural.length && !result.semantic.length; }
  function formatValue(value) { if (value === null || value === undefined) return "—"; if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${formatValue(item)}`).join(", "); return String(value); }
  function statusLabel(status) { return ({ waiting: "Ожидание", ready: "Готово", reviewing: "Проверка", deferred: "Отложено", rejected: "Не соответствует", sync_pending: "Синхронизация", confirmed: "Подтверждено", blocked: "Заблокировано", stale: "Устарело", failed: "Ошибка" })[status] || status; }
  function typeLabel(type) { return ({ visual_confirmation: "Визуальное подтверждение", row_count: "Количество рядов", stitch_count: "Количество петель", measurement: "Измерение", size_length: "Размер или длина", checkpoint_match: "Совпадение контрольной точки", required_result: "Обязательный результат", choice: "Выбор из вариантов", informational: "Информационное подтверждение" })[type] || type; }
  function observationLabel(spec) { return `${typeLabel(spec.type)}${spec.required ? " (обязательно)" : ""}`; }
  function lifecycleMessage(state) { return ({ waiting: "Checkpoint создан из доказанного источника и ожидает подготовки.", ready: "Можно начать проверку.", reviewing: "Заполните только предусмотренные observations.", deferred: "Проверка временно отложена; progress шага сохранён.", rejected: "Несоответствие записано. Вернитесь к связанному шагу для контролируемой корректировки.", sync_pending: "Решение сохранено; требуется идемпотентная синхронизация.", confirmed: "Результат подтверждён и согласован с сессией.", blocked: "Проверка заблокирована.", stale: "Identity Stage 18–24 больше не доказуема. Требуется явный rebuild.", failed: "Сохранённая запись повреждена или операция завершилась ошибкой." })[state.status] || "Checkpoint недоступен."; }
})(typeof window !== "undefined" ? window : globalThis);
