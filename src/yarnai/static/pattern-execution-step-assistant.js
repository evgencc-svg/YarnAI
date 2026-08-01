"use strict";

(function initializePatternExecutionStepPage(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("execution-step-fatal"), fatalMessage: byId("execution-step-fatal-message"), workflow: byId("execution-step-workflow"),
    title: byId("execution-step-project-title"), message: byId("execution-step-message"), status: byId("execution-step-status"),
    progressLabel: byId("execution-step-progress-label"), component: byId("execution-step-component"), phase: byId("execution-step-phase"),
    action: byId("execution-step-action"), instruction: byId("execution-step-instruction"), expected: byId("execution-step-expected"),
    quantity: byId("execution-step-quantity"), doneWhen: byId("execution-step-done-when"), counter: byId("execution-step-counter"),
    counterValue: byId("execution-step-counter-value"), counterTarget: byId("execution-step-counter-target"),
    measurementForm: byId("execution-step-measurement-form"), measurement: byId("execution-step-measurement"),
    measurementUnit: byId("execution-step-measurement-unit"), measurementResult: byId("execution-step-measurement-result"),
    checkpoints: byId("execution-step-checkpoints"), checkpointList: byId("execution-step-checkpoint-list"),
    prerequisites: byId("execution-step-prerequisites"), prerequisiteList: byId("execution-step-prerequisite-list"),
    warnings: byId("execution-step-warnings"), warningList: byId("execution-step-warning-list"),
    blockers: byId("execution-step-blockers"), blockerList: byId("execution-step-blocker-list"),
    lifecycle: byId("execution-step-lifecycle"), revision: byId("execution-step-revision"), staleReason: byId("execution-step-stale-reason"),
    failure: byId("execution-step-failure"), error: byId("execution-step-error"), back: byId("execution-step-back"),
    start: byId("execution-step-start"), increment: byId("execution-step-increment"), decrement: byId("execution-step-decrement"),
    setValue: byId("execution-step-set-value"), recordMeasurement: byId("execution-step-record-measurement"), check: byId("execution-step-check"),
    pause: byId("execution-step-pause"), resume: byId("execution-step-resume"), complete: byId("execution-step-complete"),
    checkpoint: byId("execution-step-open-checkpoint"), retry: byId("execution-step-retry"), rebuild: byId("execution-step-rebuild"),
  };
  const system = globalObject.YarnAIProjectSystem;
  const api = globalObject.YarnAIPatternExecutionStep;
  let repository = null;
  let projectId = null;
  let inspected = null;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть исполняемый шаг."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    ui.back.href = `/pattern-execution-session?project=${encodeURIComponent(projectId)}`;
    bindActions();
    inspected = await api.ensureForProject(repository, projectId, { operationId: operationId("ensure") });
    if (inspected.executionStep?.completionState?.status === "sync_pending") {
      inspected = await api.recoverForProject(repository, projectId, { operationId: operationId("recovery") });
    }
    render();
  }

  function bindActions() {
    ui.start.addEventListener("click", () => runDomain((step) => api.startStep(step, command("start"))));
    ui.increment.addEventListener("click", () => runDomain((step) => api.incrementProgress(step, command("increment"))));
    ui.decrement.addEventListener("click", () => runDomain((step) => api.decrementProgress(step, command("decrement"))));
    ui.setValue.addEventListener("click", correctValue);
    ui.recordMeasurement.addEventListener("click", recordMeasurement);
    ui.check.addEventListener("click", () => runDomain((step) => api.checkStep(step, { ...command("check"), confirmed: true })));
    ui.pause.addEventListener("click", pause);
    ui.resume.addEventListener("click", () => runDomain((step) => api.resumeStep(step, command("resume"))));
    ui.complete.addEventListener("click", complete);
    ui.retry.addEventListener("click", retryCompletion);
    ui.rebuild.addEventListener("click", rebuild);
  }

  function render() {
    hideButtons();
    resetSections();
    const step = inspected?.executionStep || null;
    ui.title.textContent = inspected?.project?.title || "Текущий шаг";
    if (!step) return renderUnavailable(inspected?.reasonCode);
    const snapshot = step.immutableSnapshot;
    ui.status.textContent = statusLabel(step.status);
    ui.status.dataset.status = step.status;
    ui.progressLabel.textContent = progressLabel(step.progressState);
    ui.component.textContent = snapshot.component?.label || "Компонент не указан";
    ui.phase.textContent = snapshot.phase.title;
    ui.action.textContent = snapshot.action.title;
    ui.instruction.textContent = snapshot.instruction || "Следуйте подтверждённой инструкции текущего action.";
    ui.expected.textContent = formatExpected(snapshot.expectedResult);
    ui.quantity.textContent = formatQuantity(snapshot);
    ui.doneWhen.textContent = doneWhen(step);
    ui.lifecycle.textContent = step.lifecycle.state;
    ui.revision.textContent = String(step.revision);
    ui.staleReason.textContent = step.staleReason || "—";
    ui.failure.textContent = step.failure?.message || "—";
    ui.message.textContent = lifecycleMessage(step);
    renderProgress(step);
    renderList(ui.prerequisites, ui.prerequisiteList, snapshot.prerequisiteSummary, (entry) => `${entry.title}: ${entry.status}`);
    renderList(ui.warnings, ui.warningList, snapshot.warnings, (entry) => entry.message || entry.code);
    renderList(ui.blockers, ui.blockerList, step.blockers, (entry) => entry.message || entry.code);
    renderButtons(step);
  }

  function renderProgress(step) {
    const progress = step.progressState;
    if (["counter", "rows", "stitches"].includes(progress.type)) {
      ui.counter.hidden = false;
      ui.counterValue.textContent = String(progress.current);
      ui.counterTarget.textContent = progress.target === null ? progress.unit || "" : `из ${progress.target}${progress.unit ? ` ${unitLabel(progress.unit)}` : ""}`;
    }
    if (progress.type === "measurement") {
      ui.measurementForm.hidden = false;
      ui.measurement.value = progress.rawValue || "";
      ui.measurementUnit.textContent = progress.unit || "";
      ui.measurementResult.textContent = measurementResultLabel(progress);
    }
    if (progress.type === "checkpoint") renderCheckpoints(step);
  }

  function renderCheckpoints(step) {
    ui.checkpoints.hidden = false;
    const editable = ["active", "checking"].includes(step.status) && !busy;
    const criteria = step.immutableSnapshot.checkpointCriteria.map((source) => {
      const current = step.progressState.criteria.find((entry) => entry.criterionId === source.criterionId);
      const item = document.createElement("li");
      item.className = "criterion";
      const label = document.createElement("span");
      label.textContent = `${source.label} — ${criterionLabel(current?.status)}`;
      item.append(label);
      if (editable) {
        const actions = document.createElement("div");
        actions.className = "criterion-actions";
        actions.append(criterionButton(step, source, "passed", "Пройдено"), criterionButton(step, source, "failed", "Не пройдено"));
        if (source.allowNotApplicable) actions.append(criterionButton(step, source, "not_applicable", "Не применяется"));
        item.append(actions);
      }
      return item;
    });
    ui.checkpointList.replaceChildren(...criteria);
  }

  function criterionButton(step, source, status, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => runDomain((current) => api.setCheckpointCriterion(current, source.criterionId, status, command("checkpoint"))));
    button.disabled = busy || step.status === "completed";
    return button;
  }

  function renderButtons(step) {
    const type = step.progressState.type;
    if (step.status === "ready") ui.start.hidden = false;
    if (["active", "checking"].includes(step.status)) {
      if (["counter", "rows", "stitches"].includes(type)) {
        const canIncrement = step.progressState.target === null || step.progressState.current < step.progressState.target || step.progressState.allowExceedTarget;
        ui.increment.hidden = !canIncrement;
        ui.decrement.hidden = step.progressState.current <= 0;
        ui.setValue.hidden = false;
      }
      if (type === "measurement") ui.recordMeasurement.hidden = false;
      if (["binary", "timed", "informational"].includes(type) && step.status === "active") ui.check.hidden = false;
      if (step.status === "active") ui.pause.hidden = false;
      if (step.status === "checking" && step.completionState.status !== "sync_pending" && completionLooksReady(step)) {
        if (hasProvenCheckpoint(step)) {
          const checkpointId = step.immutableSnapshot.checkpointCriteria[0].checkpointId;
          ui.checkpoint.href = `/pattern-execution-checkpoint?project=${encodeURIComponent(projectId)}&checkpoint=${encodeURIComponent(checkpointId)}`;
          ui.checkpoint.hidden = false;
        } else {
          ui.complete.hidden = false;
        }
      }
      if (step.completionState.status === "sync_pending") ui.retry.hidden = false;
    }
    if (step.status === "paused") ui.resume.hidden = false;
    if (["blocked", "stale", "failed", "completed"].includes(step.status) && inspected?.sourceValidation?.valid) ui.rebuild.hidden = false;
  }

  async function correctValue() {
    const step = inspected.executionStep;
    const value = globalObject.prompt("Введите точное целое значение", String(step.progressState.current));
    if (value === null) return;
    await runDomain((current) => api.setProgress(current, value, { ...command("set_progress"), reason: "user_correction" }));
  }

  async function recordMeasurement() {
    const raw = ui.measurement.value;
    const confirmed = globalObject.confirm("Подтвердить фактическое измерение?");
    if (!confirmed) return;
    await runDomain((step) => api.setMeasurement(step, raw, { ...command("set_measurement"), confirmed: true }));
  }

  async function pause() {
    const reason = globalObject.prompt("Причина паузы (необязательно)", "");
    if (reason === null) return;
    await runDomain((step) => api.pauseStep(step, { ...command("pause"), reason }));
  }

  async function complete() {
    if (!globalObject.confirm("Завершить этот шаг и отметить action выполненным в сессии?")) return;
    const id = operationId("complete");
    await runOperation(() => api.completeForProject(repository, projectId, {
      expectedRevision: inspected.executionStep.revision,
      expectedSessionRevision: inspected.executionSession.revision,
      operationId: id,
      confirmed: true,
      confirmation: "user_confirmed",
    }));
  }

  async function retryCompletion() {
    await runOperation(() => api.recoverForProject(repository, projectId, { operationId: operationId("recovery") }));
  }

  async function rebuild() {
    if (!globalObject.confirm("Перестроить текущий шаг из актуальной сессии? Несовместимый progress будет сброшен.")) return;
    await runOperation(() => api.rebuildForProject(repository, projectId, { ...command("rebuild"), confirmed: true }));
  }

  async function runDomain(operation) {
    await runOperation(async () => {
      const before = inspected.executionStep;
      const next = operation(before);
      if (api.canonicalize(next) !== api.canonicalize(before)) {
        await repository.updatePatternExecutionStep(projectId, inspected.calculation.calculation_id, next, {
          operationKind: `PATTERN_EXECUTION_STEP_${next.status.toUpperCase()}`,
          projectStage: `pattern_execution_step_${next.status}`,
        });
      }
      return api.inspectAggregate(await repository.getProject(projectId));
    });
  }

  async function runOperation(operation) {
    if (busy || !projectId) return;
    busy = true;
    setDisabled(true);
    ui.error.textContent = "";
    try {
      inspected = await operation();
    } catch (error) {
      ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`;
      inspected = api.inspectAggregate(await repository.getProject(projectId));
    } finally {
      busy = false;
      setDisabled(false);
      render();
    }
  }

  function command(type) { return { expectedRevision: inspected.executionStep.revision, operationId: operationId(type) }; }
  function operationId(type) { return `${type}:${system.uuidv7()}`; }
  function renderWithoutProject() {
    hideButtons();
    resetSections();
    ui.title.textContent = "Проект не выбран";
    ui.status.textContent = "Нет контекста проекта";
    ui.status.dataset.status = "waiting";
    ui.message.textContent = "Выберите проект и откройте текущий шаг из активной сессии выполнения.";
    ui.action.textContent = "—";
    ui.instruction.textContent = "Без project context запись не создаётся и действия недоступны.";
    ui.expected.textContent = "—";
    ui.quantity.textContent = "—";
    ui.doneWhen.textContent = "—";
  }
  function renderUnavailable(code) {
    ui.status.textContent = "Недоступно";
    ui.status.dataset.status = "blocked";
    ui.message.textContent = sourceMessage(code);
    ui.action.textContent = "—";
    ui.instruction.textContent = "Вернитесь к сессии и устраните причину блокировки.";
    renderList(ui.blockers, ui.blockerList, inspected?.sourceValidation?.blockers, (entry) => entry.message || entry.code);
  }
  function showFatal(message) { hideButtons(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function resetSections() { ui.fatal.hidden = true; ui.workflow.hidden = false; ui.counter.hidden = true; ui.measurementForm.hidden = true; ui.checkpoints.hidden = true; ui.prerequisites.hidden = true; ui.warnings.hidden = true; ui.blockers.hidden = true; }
  function hideButtons() { for (const button of operationButtons()) button.hidden = true; ui.checkpoint.hidden = true; }
  function setDisabled(value) { for (const button of operationButtons()) button.disabled = value; }
  function operationButtons() { return [ui.start, ui.increment, ui.decrement, ui.setValue, ui.recordMeasurement, ui.check, ui.pause, ui.resume, ui.complete, ui.retry, ui.rebuild]; }
  function hasProvenCheckpoint(step) { return inspected?.sourceValidation?.valid && step.immutableSnapshot.externalCheckpointRequired === true && step.immutableSnapshot.checkpointCriteria.length > 0; }
  function renderList(section, list, entries, formatter) { const values = entries || []; section.hidden = values.length === 0; list.replaceChildren(...values.map((entry) => { const item = document.createElement("li"); item.textContent = formatter(entry); return item; })); }
  function completionLooksReady(step) { const p = step.progressState; if (p.type === "binary") return p.confirmed; if (["counter", "rows"].includes(p.type)) return p.target !== null && p.current === p.target; if (p.type === "stitches") return p.target === null || p.current === p.target; if (p.type === "measurement") return p.userConfirmed && (p.result === "match" || p.result === "unknown" || p.deviationAccepted); if (p.type === "checkpoint") return p.criteria.every((entry) => !entry.required || entry.status === "passed" || entry.status === "not_applicable" && entry.allowNotApplicable); return p.userConfirmed; }
  function statusLabel(status) { return ({ waiting: "Ожидание", ready: "Готов", active: "Выполняется", paused: "На паузе", checking: "Проверка", completed: "Завершён", blocked: "Заблокирован", stale: "Устарел", failed: "Ошибка" })[status] || status; }
  function lifecycleMessage(step) { return ({ ready: "Шаг готов. Начните его явным действием.", active: "Прогресс сохраняется после каждого значимого изменения.", paused: "Прогресс сохранён; продолжение восстановит тот же шаг.", checking: step.completionState.status === "sync_pending" ? "Завершение ожидает синхронизации с сессией." : "Проверьте результат и подтвердите завершение.", completed: "Шаг завершён и подтверждён в сессии.", blocked: "Продолжение запрещено до устранения причины.", stale: "Источник изменился; скрытое продолжение запрещено.", failed: step.failure?.message || "Операция завершилась ошибкой." })[step.status] || ""; }
  function progressLabel(progress) { if (["counter", "rows", "stitches"].includes(progress.type)) return `${progress.current}${progress.target === null ? "" : ` из ${progress.target}`}`; if (progress.type === "measurement") return measurementResultLabel(progress); if (progress.type === "checkpoint") return `${progress.criteria.filter((entry) => entry.status === "passed").length} из ${progress.criteria.length} критериев`; return progress.confirmed || progress.userConfirmed ? "Проверено" : "Ожидает подтверждения"; }
  function formatExpected(value) { if (value === null || value === undefined) return "Выполнено по зафиксированной инструкции"; if (typeof value === "string" || typeof value === "number") return String(value); if (Array.isArray(value)) return value.map(formatExpected).join(", "); if (typeof value === "object" && value.value !== undefined) return `${value.value}${value.unit ? ` ${value.unit}` : ""}`; return "Критерий зафиксирован в snapshot"; }
  function formatQuantity(snapshot) { if (snapshot.repeatCount !== null) return `${snapshot.repeatCount} повторов`; if (snapshot.rowRange) return `ряды ${snapshot.rowRange.from}–${snapshot.rowRange.to}`; if (snapshot.stitchCount !== null) return `${snapshot.stitchCount} петель`; if (snapshot.measurementTarget) return `${snapshot.measurementTarget.value}${snapshot.measurementTarget.unit ? ` ${snapshot.measurementTarget.unit}` : ""}`; if (snapshot.quantity !== null) return `${snapshot.quantity}${snapshot.unit ? ` ${unitLabel(snapshot.unit)}` : ""}`; return snapshot.allowManualConfirmation ? "Одно выполнение с ручным подтверждением" : "Числовая цель не доказана"; }
  function doneWhen(step) { const type = step.progressState.type; if (type === "checkpoint") return "Все обязательные критерии пройдены"; if (type === "measurement") return "Измерение записано, подтверждено и соответствует цели"; if (["counter", "rows", "stitches"].includes(type) && step.progressState.target !== null) return `Достигнуто ${step.progressState.target}${step.progressState.unit ? ` ${unitLabel(step.progressState.unit)}` : ""}, затем подтверждено`; return "Результат проверен и явно подтверждён"; }
  function measurementResultLabel(progress) { return ({ match: "Измерение совпадает", below: "Ниже ожидаемого", above: "Выше ожидаемого", unknown: progress.rawValue === null ? "Измерение не записано" : "Сравнение недоступно" })[progress.result] || "Измерение не записано"; }
  function criterionLabel(status) { return ({ unchecked: "не проверено", passed: "пройдено", failed: "не пройдено", not_applicable: "не применяется" })[status] || "не проверено"; }
  function unitLabel(unit) { return ({ rows: "рядов", stitches: "петель", repeats: "повторов" })[unit] || unit; }
  function sourceMessage(code) { return ({ source_session_missing: "Активная сессия выполнения не найдена.", source_session_not_active: "Сессия ещё не готова к исполнению шага.", source_session_invalid: "Сессия устарела или завершилась ошибкой.", source_identity_mismatch: "Identity цепочки источников не доказуема.", current_action_unproven: "Текущее действие нельзя определить безопасно.", current_action_blocked: "Текущее действие заблокировано.", prerequisite_incomplete: "Сначала завершите prerequisite." })[code] || "Исполняемый шаг сейчас нельзя создать безопасно."; }
})(window);
