"use strict";

(function initializePatternExecutionRuntimeAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("runtime-fatal"), fatalMessage: byId("runtime-fatal-message"), workflow: byId("runtime-workflow"),
    title: byId("runtime-project-title"), message: byId("runtime-message"), status: byId("runtime-status"), revision: byId("runtime-revision"),
    progressText: byId("runtime-progress-text"), progressBar: byId("runtime-progress-bar"), cursor: byId("runtime-cursor"),
    activeAction: byId("runtime-active-action"), completedCount: byId("runtime-completed-count"), totalCount: byId("runtime-total-count"),
    recoveryPanel: byId("runtime-recovery-panel"), recoveryMessage: byId("runtime-recovery-message"),
    stalePanel: byId("runtime-stale-panel"), staleReasons: byId("runtime-stale-reasons"),
    errorsPanel: byId("runtime-errors-panel"), errors: byId("runtime-errors"), actions: byId("runtime-actions"),
    commandBar: byId("runtime-command-bar"), commandError: byId("runtime-command-error"), audit: byId("runtime-audit"),
    identity: byId("runtime-source-identity"), fingerprint: byId("runtime-fingerprint"), back: byId("runtime-back"), monitoring: byId("runtime-monitoring"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionRuntime;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть runtime исполнения."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    hideCommands();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    bindCommands();
    ui.back.href = `/pattern-execution-result?project=${encodeURIComponent(projectId)}`;
    ui.back.hidden = false;
    ui.monitoring.href = `/pattern-execution-monitoring?project=${encodeURIComponent(projectId)}`;
    ui.monitoring.hidden = false;
    inspected = await repository.readPatternExecutionRuntime(projectId);
    render();
  }

  function bindCommands() {
    for (const button of commandButtons) button.addEventListener("click", () => execute(button.dataset.command));
  }

  function render() {
    hideCommands();
    ui.commandError.textContent = "";
    const runtime = inspected?.rawRuntime || null;
    const effectiveStale = Boolean(runtime && inspected.staleness?.stale);
    const status = effectiveStale ? "stale" : runtime?.status || "waiting";
    ui.title.textContent = inspected?.project?.title || "Runtime исполнения";
    ui.status.textContent = statusLabel(status);
    ui.status.dataset.status = status;
    ui.revision.textContent = runtime ? `Epoch ${runtime.epoch} · revision ${runtime.revision}` : "Epoch — · revision —";
    ui.message.textContent = inspected?.corrupt
      ? "Сохранённый runtime повреждён. Автоматическое исправление и исполнение отключены."
      : runtime
        ? statusMessage(status)
        : inspected?.result
          ? "Stage 28 доступен. Runtime создаётся только явной командой."
          : "В проекте нет доступного подтверждённого результата Stage 28.";
    renderProgress(runtime);
    renderActions(runtime);
    renderRecovery(runtime, status);
    renderErrors(runtime, effectiveStale);
    renderAudit(runtime);
    renderIdentity(runtime);
    const allowed = new Set(inspected?.availableCommands || []);
    for (const button of commandButtons) button.hidden = !allowed.has(button.dataset.command);
    ui.commandBar.hidden = commandButtons.every((button) => button.hidden);
  }

  function renderProgress(runtime) {
    const total = runtime?.actions?.length || 0;
    const resolved = (runtime?.completedActionIds?.length || 0) + (runtime?.skippedActionIds?.length || 0);
    const percent = total ? Math.round(resolved * 100 / total) : 0;
    ui.progressText.textContent = runtime ? `${resolved} из ${total} actions разрешены · ${percent}%` : "Runtime ещё не создан.";
    ui.progressBar.value = percent;
    ui.progressBar.textContent = `${percent}%`;
    ui.cursor.textContent = runtime ? `${runtime.cursor} / ${total}` : "—";
    const active = runtime?.actions?.find((action) => action.id === runtime.activeActionId);
    ui.activeAction.textContent = active ? `${active.ordinal}. ${active.title}` : "—";
    ui.completedCount.textContent = String(resolved);
    ui.totalCount.textContent = String(total);
  }

  function renderActions(runtime) {
    const actions = runtime?.actions || [];
    if (!actions.length) {
      ui.actions.replaceChildren(listItem("Runtime actions отсутствуют."));
      return;
    }
    ui.actions.replaceChildren(...actions.map((action) => actionCard(action, runtime)));
  }

  function actionCard(action, runtime) {
    const item = document.createElement("li");
    item.className = "action-card";
    item.dataset.state = action.state;
    const title = document.createElement("h3");
    title.textContent = `${action.ordinal}. ${action.title}`;
    const meta = document.createElement("p");
    meta.className = "action-meta";
    meta.append(metaPart(`State: ${action.state}`), metaPart(`Attempt: ${action.attempt}`), metaPart(`ID: ${action.id}`));
    const prerequisiteTitle = document.createElement("p");
    prerequisiteTitle.textContent = "Prerequisites:";
    const prerequisites = document.createElement("ul");
    prerequisites.className = "prerequisites";
    const values = action.prerequisiteIds.length
      ? action.prerequisiteIds.map((id) => {
        const prerequisite = runtime.actions.find((entry) => entry.id === id);
        return listItem(`${prerequisite?.title || id} · ${prerequisite?.state || "unknown"}`);
      })
      : [listItem("Нет")];
    prerequisites.replaceChildren(...values);
    item.append(title, meta, prerequisiteTitle, prerequisites);
    if (action.blockedReason || action.error || action.outputSnapshot) {
      const details = document.createElement("p");
      details.textContent = action.blockedReason
        ? `Blocker: ${action.blockedReason.code} — ${action.blockedReason.message}`
        : action.error
          ? `Error: ${action.error.code} — ${action.error.message}`
          : `Output snapshot: ${JSON.stringify(action.outputSnapshot)}`;
      item.append(details);
    }
    return item;
  }

  function renderRecovery(runtime, status) {
    ui.recoveryPanel.hidden = !runtime || !["running", "paused", "blocked", "recovering"].includes(status);
    ui.recoveryMessage.textContent = status === "recovering"
      ? "Recovery зафиксирован. Повторная явная команда завершит процедуру в paused, ready, blocked или failed."
      : status === "running"
        ? "После reload runtime не продолжится автоматически. Явный recovery сохранит незавершённый action как paused."
        : "Runtime находится в безопасном незавершённом состоянии.";
  }

  function renderErrors(runtime, effectiveStale) {
    const entries = [];
    for (const error of inspected?.validation?.structural || []) entries.push(`${error.code}: structural validation`);
    for (const error of inspected?.validation?.semantic || []) entries.push(`${error.code}: semantic validation`);
    for (const error of inspected?.validation?.source || []) entries.push(`${error.code}: source identity validation`);
    if (runtime?.lastError) entries.push(`${runtime.lastError.code}: ${runtime.lastError.message}`);
    for (const action of runtime?.actions || []) {
      if (action.blockedReason) entries.push(`${action.title}: ${action.blockedReason.code} — ${action.blockedReason.message}`);
      if (action.error) entries.push(`${action.title}: ${action.error.code} — ${action.error.message}`);
    }
    const stale = effectiveStale ? inspected.staleness.reasons : runtime?.staleReasons || [];
    ui.staleReasons.replaceChildren(...stale.map((reason) => listItem(`${reason.code}: ${reason.message || "Source identity изменилась."}`)));
    ui.stalePanel.hidden = stale.length === 0;
    ui.errors.replaceChildren(...entries.map(listItem));
    ui.errorsPanel.hidden = entries.length === 0;
  }

  function renderAudit(runtime) {
    const entries = [...(runtime?.audit || [])].reverse();
    ui.audit.replaceChildren(...(entries.length ? entries.map((entry) => listItem(`${entry.at} · r${entry.revision} · ${entry.event}`)) : [listItem("Audit пока пуст.")]));
  }

  function renderIdentity(runtime) {
    const source = runtime?.sourceIdentity;
    const chain = source?.chain;
    const entries = [
      ["Stage 28 result", runtime ? `${runtime.sourceResultId} · r${runtime.sourceResultRevision}` : null],
      ["Result fingerprint", runtime?.sourceResultFingerprint],
      ["Execution", runtime?.sourceExecutionId],
      ["Plan", runtime?.sourcePlanId],
      ["Completion", chain?.completion ? `${chain.completion.id} · r${chain.completion.revision}` : null],
      ["Progress", chain?.progress ? `${chain.progress.id} · r${chain.progress.revision}` : null],
      ["Steps / checkpoints", chain ? `${chain.steps?.length || 0} / ${chain.checkpoints?.length || 0}` : null],
      ["Source identity", source?.sourceIdentityFingerprint],
    ];
    ui.identity.replaceChildren(...entries.map(([label, value]) => identityItem(label, value || "—")));
    ui.fingerprint.textContent = runtime ? `Runtime fingerprint: ${runtime.runtimeFingerprint}` : "—";
  }

  async function execute(command) {
    if (busy || !repository || !projectId || !command) return;
    busy = true;
    setDisabled(true);
    ui.commandError.textContent = "";
    try {
      if (command === "create") inspected = await repository.createPatternExecutionRuntime(projectId);
      else {
        const runtime = inspected?.rawRuntime;
        const commandOptions = { expectedRevision: runtime.revision, operationId: `${command}:${system.uuidv7()}` };
        if (command === "block_current_action") commandOptions.reason = { code: "user_blocked", message: "Действие заблокировано явной командой пользователя." };
        if (command === "fail_current_action") commandOptions.error = { code: "action_execution_failed", message: "Сбой action зафиксирован явной командой пользователя." };
        if (command === "fail") commandOptions.error = { code: "runtime_failed_by_user", message: "Runtime завершён со сбоем явной командой пользователя." };
        inspected = await repository.executePatternExecutionRuntimeCommand(projectId, command, commandOptions);
      }
    } catch (error) {
      ui.commandError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Команда runtime не выполнена."}`;
      inspected = await repository.readPatternExecutionRuntime(projectId);
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function renderWithoutProject() {
    hideCommands();
    ui.commandBar.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.status.textContent = "Нет project context";
    ui.status.dataset.status = "waiting";
    ui.revision.textContent = "Epoch — · revision —";
    ui.message.textContent = "Без project context чтение, создание и изменение runtime недоступны.";
    renderProgress(null); renderActions(null); renderRecovery(null, "waiting"); renderErrors(null, false); renderAudit(null); renderIdentity(null);
  }

  function showFatal(message) { hideCommands(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function hideCommands() { for (const button of commandButtons) button.hidden = true; }
  function setDisabled(value) { for (const button of commandButtons) button.disabled = value; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function metaPart(value) { const part = document.createElement("span"); part.textContent = value; return part; }
  function identityItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = value; wrapper.append(label, content); return wrapper; }
  function statusLabel(status) { return ({ waiting: "Ожидание", ready: "Готов", running: "Выполняется", paused: "Пауза", blocked: "Заблокирован", recovering: "Recovery", completed: "Завершён", failed: "Сбой", stopped: "Остановлен", stale: "Устарел" })[status] || status; }
  function statusMessage(status) { return ({ waiting: "Runtime ожидает явной identity validation.", ready: "Runtime проверен и ожидает явного запуска.", running: "Runtime исполняется только отдельными командами; фонового auto-run нет.", paused: "Runtime безопасно приостановлен.", blocked: "Текущее действие заблокировано и требует явного unblock.", recovering: "Recovery начат и требует явного завершения.", completed: "Все обязательные actions завершены.", failed: "Runtime завершён контролируемым сбоем. Повтор возможен только через rebuild.", stopped: "Runtime остановлен. Повтор возможен только через rebuild.", stale: "Upstream identity изменилась или не доказана. Требуется явный rebuild." })[status] || "Runtime недоступен."; }
})(typeof window !== "undefined" ? window : globalThis);
