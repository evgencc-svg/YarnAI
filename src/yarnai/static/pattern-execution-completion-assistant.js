"use strict";

(function initializePatternExecutionCompletionAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-completion-fatal"), fatalMessage: byId("execution-completion-fatal-message"), workflow: byId("execution-completion-workflow"),
    title: byId("execution-completion-project-title"), message: byId("execution-completion-message"), status: byId("execution-completion-status"), revision: byId("execution-completion-revision"), verdict: byId("execution-completion-verdict"),
    session: byId("execution-completion-session"), epoch: byId("execution-completion-epoch"), plan: byId("execution-completion-plan"), progress: byId("execution-completion-progress"), counts: byId("execution-completion-counts"),
    blockersPanel: byId("execution-completion-blockers-panel"), blockers: byId("execution-completion-blockers"), warningsPanel: byId("execution-completion-warnings-panel"), warnings: byId("execution-completion-warnings"), stalePanel: byId("execution-completion-stale-panel"), staleReasons: byId("execution-completion-stale-reasons"),
    phases: byId("execution-completion-phases"), steps: byId("execution-completion-steps"), checkpoints: byId("execution-completion-checkpoints"),
    actionsPanel: byId("execution-completion-actions-panel"), verify: byId("execution-completion-verify"), retry: byId("execution-completion-retry"), rebuild: byId("execution-completion-rebuild"), error: byId("execution-completion-error"),
    fingerprint: byId("execution-completion-fingerprint"), sourceFingerprint: byId("execution-completion-source-fingerprint"), audit: byId("execution-completion-audit"), back: byId("execution-completion-back"), result: byId("execution-completion-result"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionCompletion;
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть completion."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    hideActions();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    bindActions();
    ui.back.href = `/pattern-execution-progress?project=${encodeURIComponent(projectId)}`;
    ui.back.hidden = false;
    ui.result.href = `/pattern-execution-result?project=${encodeURIComponent(projectId)}`;
    ui.result.hidden = false;
    inspected = await repository.readPatternExecutionCompletion(projectId);
    render();
  }

  function bindActions() {
    ui.verify.addEventListener("click", () => execute("verify"));
    ui.retry.addEventListener("click", () => execute("retry"));
    ui.rebuild.addEventListener("click", () => execute("rebuild"));
  }

  function render() {
    hideActions();
    ui.error.textContent = "";
    ui.title.textContent = inspected.project?.title || "Подтверждение завершения";
    const state = inspected.completion;
    const effectiveStale = Boolean(state && inspected.staleness.stale);
    const effectiveStatus = effectiveStale ? "stale" : state?.status || "waiting";
    ui.status.textContent = statusLabel(effectiveStatus);
    ui.status.dataset.status = effectiveStatus;
    ui.revision.textContent = state ? `Revision ${state.revision}` : "Revision —";
    ui.verdict.textContent = effectiveStatus === "ready" ? "Завершение исполнения доказано" : "Завершение исполнения не доказано";
    ui.message.textContent = inspected.corrupt ? "Persisted completion повреждён; автоматическое исправление отключено." : statusMessage(effectiveStatus, Boolean(state));
    renderIdentity(state);
    renderSnapshot(state?.completionSnapshot || null, state?.verification || null);
    renderReasons(state, effectiveStale);
    renderAudit(state);
    ui.verify.hidden = !(inspected.canVerify && !inspected.corrupt);
    ui.retry.hidden = !(inspected.canRetry && !effectiveStale);
    ui.rebuild.hidden = !(inspected.canRebuild || effectiveStale);
    ui.actionsPanel.hidden = ui.verify.hidden && ui.retry.hidden && ui.rebuild.hidden;
  }

  function renderIdentity(state) {
    const identity = state?.expectedSourceIdentity;
    ui.session.textContent = identity?.session?.id ? `${identity.session.id} · r${identity.session.revision} · ${identity.session.fingerprint}` : "—";
    ui.epoch.textContent = identity?.session?.epoch === null || identity?.session?.epoch === undefined ? "—" : String(identity.session.epoch);
    ui.plan.textContent = identity?.plan?.id ? `${identity.plan.id} · r${identity.plan.revision} · ${identity.plan.fingerprint}` : "—";
    ui.progress.textContent = identity?.progress?.id ? `${identity.progress.id} · r${identity.progress.revision} · ${identity.progress.fingerprint}` : "—";
    ui.fingerprint.textContent = state?.completionFingerprint || "—";
    ui.sourceFingerprint.textContent = state?.expectedSourceIdentityFingerprint || "—";
  }

  function renderSnapshot(snapshot, verification) {
    const counts = snapshot?.counts || verification?.counts || emptyCounts();
    const labels = [
      ["phases", "Phases"], ["logicalSteps", "Logical steps"], ["actions", "Actions"],
      ["completedActions", "Completed actions"], ["requiredCheckpoints", "Required checkpoints"], ["confirmedCheckpoints", "Confirmed checkpoints"],
    ];
    ui.counts.replaceChildren(...labels.map(([key, label]) => countItem(label, counts[key] || 0)));
    ui.phases.replaceChildren(...summaryItems(snapshot?.phaseSummaries, (entry) => `${entry.title} · ${entry.completedActions}/${entry.actions}`));
    ui.steps.replaceChildren(...summaryItems(snapshot?.stepSummaries, (entry) => `${entry.title} · action ${entry.actionStatus} · step ${entry.stepStatus}`));
    ui.checkpoints.replaceChildren(...summaryItems(snapshot?.checkpointSummaries, (entry) => `${entry.checkpointId} · ${entry.status}`));
  }

  function countItem(labelText, value) {
    const wrapper = document.createElement("div");
    const label = document.createElement("dt");
    const result = document.createElement("dd");
    label.textContent = labelText;
    result.textContent = String(value);
    wrapper.append(label, result);
    return wrapper;
  }

  function summaryItems(entries, format) {
    const values = Array.isArray(entries) && entries.length ? entries : [{ empty: true }];
    return values.map((entry) => {
      const item = document.createElement("li");
      item.textContent = entry.empty ? "Нет данных" : format(entry);
      return item;
    });
  }

  function renderReasons(state, effectiveStale) {
    const blockers = state?.blockers || [];
    const warnings = state?.warnings || [];
    const staleReasons = effectiveStale ? inspected.staleness.reasons : state?.staleReasons || [];
    ui.blockers.replaceChildren(...blockers.map(reasonItem));
    ui.warnings.replaceChildren(...warnings.map(reasonItem));
    ui.staleReasons.replaceChildren(...staleReasons.map(reasonItem));
    ui.blockersPanel.hidden = blockers.length === 0;
    ui.warningsPanel.hidden = warnings.length === 0;
    ui.stalePanel.hidden = staleReasons.length === 0;
  }

  function reasonItem(entry) {
    const item = document.createElement("li");
    item.textContent = `${entry?.code ? `${entry.code}: ` : ""}${entry?.message || "Неизвестная причина"}`;
    return item;
  }

  function renderAudit(state) {
    const entries = state?.audit || [];
    ui.audit.textContent = entries.length ? entries.slice(-8).map((entry) => `${entry.event} · r${entry.revision}`).join("\n") : "—";
  }

  async function execute(mode) {
    if (busy || !repository || !projectId) return;
    busy = true;
    setDisabled(true);
    ui.error.textContent = "";
    try {
      const options = { operationId: `${mode}:${system.uuidv7()}` };
      if (mode === "verify") inspected = await repository.verifyPatternExecutionCompletion(projectId, options);
      if (mode === "retry") inspected = await repository.retryPatternExecutionCompletion(projectId, options);
      if (mode === "rebuild") inspected = await repository.rebuildPatternExecutionCompletion(projectId, options);
    } catch (error) {
      ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`;
      inspected = await repository.readPatternExecutionCompletion(projectId);
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function hideActions() { for (const element of actionElements()) element.hidden = true; }
  function setDisabled(value) { for (const element of actionElements()) element.disabled = value; }
  function actionElements() { return [ui.verify, ui.retry, ui.rebuild]; }
  function renderWithoutProject() {
    hideActions();
    ui.actionsPanel.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.status.textContent = "Нет project context";
    ui.status.dataset.status = "waiting";
    ui.verdict.textContent = "Завершение исполнения не доказано";
    ui.message.textContent = "Откройте completion из связанного progress. Без project context чтение и mutations недоступны.";
    renderSnapshot(null, null);
    renderIdentity(null);
    renderAudit(null);
  }
  function showFatal(message) { hideActions(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function emptyCounts() { return { phases: 0, logicalSteps: 0, actions: 0, completedActions: 0, requiredCheckpoints: 0, confirmedCheckpoints: 0 }; }
  function statusLabel(status) { return ({ waiting: "Ожидание", verifying: "Verification", ready: "Готово", blocked: "Заблокировано", failed: "Ошибка", stale: "Устарело" })[status] || status; }
  function statusMessage(status, exists) { return ({ waiting: exists ? "Completion ожидает явной verification." : "Completion ещё не создан. Доступна явная verification сохранённых данных.", verifying: "Verification была прервана и будет безопасно переведена в failed без скрытого продолжения.", ready: "Immutable completion snapshot доказывает завершение исполнения.", blocked: "Обязательные условия завершения не доказаны. Исправьте sources и выберите retry либо rebuild по правилам identity.", failed: "Verification завершилась контролируемой ошибкой. Доступен явный retry.", stale: "Source identity изменилась. Автоматический rebuild не выполняется." })[status] || "Completion недоступен."; }
})(typeof window !== "undefined" ? window : globalThis);
