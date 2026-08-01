"use strict";

(function initializePatternExecutionProgressAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-progress-fatal"), fatalMessage: byId("execution-progress-fatal-message"), workflow: byId("execution-progress-workflow"),
    title: byId("execution-progress-project-title"), message: byId("execution-progress-message"), status: byId("execution-progress-status"), revision: byId("execution-progress-revision"),
    percent: byId("execution-progress-percent"), phases: byId("execution-progress-phases"), stepsTotal: byId("execution-progress-steps-total"), meter: byId("execution-progress-meter"),
    stepCounts: byId("execution-progress-step-counts"), checkpointCounts: byId("execution-progress-checkpoint-counts"),
    currentTitle: byId("execution-progress-current-title"), currentContext: byId("execution-progress-current-context"), nextAction: byId("execution-progress-next-action"),
    blockersPanel: byId("execution-progress-blockers-panel"), blockers: byId("execution-progress-blockers"), stalePanel: byId("execution-progress-stale-panel"), staleReasons: byId("execution-progress-stale-reasons"),
    actionsPanel: byId("execution-progress-actions-panel"), build: byId("execution-progress-build"), rebuild: byId("execution-progress-rebuild"), retry: byId("execution-progress-retry"), error: byId("execution-progress-error"),
    planIdentity: byId("execution-progress-plan-identity"), sessionIdentity: byId("execution-progress-session-identity"), sessionEpoch: byId("execution-progress-session-epoch"), snapshotFingerprint: byId("execution-progress-snapshot-fingerprint"), back: byId("execution-progress-back"), completion: byId("execution-progress-completion"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionProgress;
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть агрегированный progress."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    hideActions();
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на project context повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    bindActions();
    ui.back.href = `/pattern-execution-checkpoint?project=${encodeURIComponent(projectId)}`;
    ui.back.hidden = false;
    ui.completion.href = `/pattern-execution-completion?project=${encodeURIComponent(projectId)}`;
    ui.completion.hidden = false;
    inspected = api.inspectAggregate(await repository.getProject(projectId));
    if (inspected.progress?.status === "building") {
      inspected = await repository.recoverPatternExecutionProgress(projectId, { expectedRevision: inspected.progress.revision });
    }
    render();
  }

  function bindActions() {
    ui.build.addEventListener("click", () => execute("build"));
    ui.rebuild.addEventListener("click", () => execute("rebuild"));
    ui.retry.addEventListener("click", () => execute("retry"));
  }

  function render() {
    hideActions();
    ui.error.textContent = "";
    ui.title.textContent = inspected.project?.title || "Текущее выполнение";
    const state = inspected.progress;
    const effectiveStale = Boolean(state && inspected.staleness.stale);
    const effectiveStatus = effectiveStale ? "stale" : state?.status || "waiting";
    ui.status.textContent = statusLabel(effectiveStatus);
    ui.status.dataset.status = effectiveStatus;
    ui.revision.textContent = state ? `Revision ${state.revision}` : "Revision —";
    ui.message.textContent = state ? statusMessage(effectiveStatus) : sourceReady() ? "Источники готовы к явному построению progress." : "Для построения нужны совместимые Stage 22 и Stage 23.";
    renderCounts(state?.counts || emptyCounts());
    renderCurrent(state?.currentStep || null);
    const next = effectiveStale ? { label: "Перестроить агрегированный progress" } : state?.nextAction;
    ui.nextAction.textContent = next?.label || "Допустимых действий нет";
    renderReasons(state, effectiveStale);
    renderIdentity(state);
    const canBuild = sourceReady() && (!state || state.status === "waiting");
    ui.build.hidden = !canBuild;
    ui.rebuild.hidden = !(sourceReady() && state && (effectiveStale || ["ready", "blocked", "stale"].includes(state.status)));
    ui.retry.hidden = !(sourceReady() && state?.status === "failed");
    ui.actionsPanel.hidden = ui.build.hidden && ui.rebuild.hidden && ui.retry.hidden;
  }

  function renderCounts(counts) {
    const percent = counts.steps?.progressPercent || 0;
    ui.percent.textContent = `${percent}%`;
    ui.phases.textContent = String(counts.phases?.total || 0);
    ui.stepsTotal.textContent = String(counts.steps?.total || 0);
    ui.meter.value = percent;
    const stepLabels = [
      ["waiting", "Ожидают"], ["ready", "Готовы"], ["active", "Активны"], ["paused", "Приостановлены"],
      ["blocked", "Заблокированы"], ["completed", "Завершены"], ["stale", "Устарели"], ["failed", "С ошибкой"], ["skipped", "Пропущены"],
    ];
    const checkpointLabels = [["pending", "Ожидают проверки"], ["reviewing", "Проверяются"], ["passed", "Пройдены"], ["failed", "Не пройдены"]];
    ui.stepCounts.replaceChildren(...stepLabels.map(([key, label]) => countItem(label, counts.steps?.[key] || 0)));
    ui.checkpointCounts.replaceChildren(...checkpointLabels.map(([key, label]) => countItem(label, counts.checkpoints?.[key] || 0)));
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

  function renderCurrent(current) {
    ui.currentTitle.textContent = current?.title || "Нет текущего шага";
    ui.currentContext.textContent = current ? `${current.phaseId || "Фаза не указана"} · ${statusLabel(current.status)} · ${current.actionId}` : "—";
  }

  function renderReasons(state, effectiveStale) {
    const blockers = state?.blockers || [];
    const staleReasons = effectiveStale ? inspected.staleness.reasons : state?.staleReasons || [];
    ui.blockers.replaceChildren(...blockers.map((entry) => reasonItem(entry.message || entry.code)));
    ui.staleReasons.replaceChildren(...staleReasons.map((entry) => reasonItem(entry.message || entry.code)));
    ui.blockersPanel.hidden = blockers.length === 0;
    ui.stalePanel.hidden = staleReasons.length === 0;
  }

  function reasonItem(value) {
    const item = document.createElement("li");
    item.textContent = String(value || "Неизвестная причина");
    return item;
  }

  function renderIdentity(state) {
    ui.planIdentity.textContent = state?.sourcePlanId ? `${state.sourcePlanId} · r${state.sourcePlanRevision} · ${state.sourcePlanFingerprint}` : "—";
    ui.sessionIdentity.textContent = state?.sourceSessionId ? `${state.sourceSessionId} · r${state.sourceSessionRevision} · ${state.sourceSessionFingerprint}` : "—";
    ui.sessionEpoch.textContent = state?.sourceSessionEpoch === null || state?.sourceSessionEpoch === undefined ? "—" : String(state.sourceSessionEpoch);
    ui.snapshotFingerprint.textContent = state?.immutableSnapshotFingerprint || "—";
  }

  async function execute(mode) {
    if (busy || !repository || !projectId) return;
    busy = true;
    setDisabled(true);
    ui.error.textContent = "";
    try {
      const options = { operationId: `${mode}:${system.uuidv7()}` };
      if (mode === "build") inspected = await repository.buildPatternExecutionProgress(projectId, options);
      if (mode === "rebuild") inspected = await repository.rebuildPatternExecutionProgress(projectId, options);
      if (mode === "retry") inspected = await repository.retryPatternExecutionProgress(projectId, options);
    } catch (error) {
      ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`;
      inspected = api.inspectAggregate(await repository.getProject(projectId));
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function sourceReady() { return Boolean(inspected?.sources?.plan && inspected?.sources?.session); }
  function hideActions() { for (const element of actionElements()) element.hidden = true; }
  function setDisabled(value) { for (const element of actionElements()) element.disabled = value; }
  function actionElements() { return [ui.build, ui.rebuild, ui.retry]; }
  function renderWithoutProject() {
    hideActions();
    ui.actionsPanel.hidden = true;
    ui.title.textContent = "Проект не выбран";
    ui.status.textContent = "Нет project context";
    ui.status.dataset.status = "waiting";
    ui.message.textContent = "Откройте progress из связанного checkpoint. Без project context чтение и mutation недоступны.";
    renderCounts(emptyCounts());
    renderCurrent(null);
    ui.nextAction.textContent = "—";
  }
  function showFatal(message) { hideActions(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function emptyCounts() { return { phases: { total: 0 }, steps: { total: 0, progressPercent: 0 }, checkpoints: { total: 0 } }; }
  function statusLabel(status) { return ({ waiting: "Ожидание", building: "Построение", ready: "Готово", blocked: "Заблокировано", stale: "Устарело", failed: "Ошибка", active: "Активен", paused: "Приостановлен", completed: "Завершён", skipped: "Пропущен" })[status] || status; }
  function statusMessage(status) { return ({ waiting: "Progress ожидает явного построения.", building: "Построение не завершено; после reload оно безопасно переводится в retry.", ready: "Агрегированное состояние проверено по сохранённым Stage 22–25.", blocked: "Источники структурно читаемы, но содержат блокирующие противоречия.", stale: "Источник изменился после snapshot. Требуется явный rebuild.", failed: "Построение завершилось контролируемой ошибкой. Доступен retry." })[status] || "Progress недоступен."; }
})(typeof window !== "undefined" ? window : globalThis);
