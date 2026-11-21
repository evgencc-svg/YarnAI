"use strict";

(function initializeProjectDetailsClosureAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.hash !== "#project-details") return;

  const system = globalObject.YarnAIProjectSystem;
  const experience = globalObject.YarnAIProjectDetailsExperience;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const closureApi = globalObject.YarnAIProjectDetailsClosure;
  const section = document.querySelector("#project-details-closure");
  if (!system || !experience || !readinessApi || !closureApi || !section) return;

  const ui = {
    readiness: document.querySelector("#project-details-closure-readiness"),
    review: document.querySelector("#project-details-closure-review"),
    known: document.querySelector("#project-details-closure-known"),
    missingRequired: document.querySelector("#project-details-closure-missing-required"),
    requiredComplete: document.querySelector("#project-details-closure-required-complete"),
    missingRecommended: document.querySelector("#project-details-closure-missing-recommended"),
    recommendedComplete: document.querySelector("#project-details-closure-recommended-complete"),
    errors: document.querySelector("#project-details-closure-errors"),
    errorsEmpty: document.querySelector("#project-details-closure-errors-empty"),
    warnings: document.querySelector("#project-details-closure-warnings"),
    warningsEmpty: document.querySelector("#project-details-closure-warnings-empty"),
    provenance: document.querySelector("#project-details-closure-provenance"),
    collaborationSummary: document.querySelector("#project-details-closure-collaboration-summary"),
    collaborationList: document.querySelector("#project-details-closure-collaboration-list"),
    assumptions: document.querySelector("#project-details-closure-assumptions"),
    assumptionsEmpty: document.querySelector("#project-details-closure-assumptions-empty"),
    previousStatus: document.querySelector("#project-details-closure-previous-status"),
    staleChanges: document.querySelector("#project-details-closure-stale-changes"),
    acknowledgement: document.querySelector("#project-details-closure-acknowledgement"),
    acknowledge: document.querySelector("#project-details-closure-acknowledge"),
    reviewButton: document.querySelector("#project-details-closure-review-button"),
    confirm: document.querySelector("#project-details-closure-confirm"),
    back: document.querySelector("#project-details-closure-back"),
    continueButton: document.querySelector("#project-details-closure-continue"),
    confirmReason: document.querySelector("#project-details-closure-confirm-reason"),
    continueReason: document.querySelector("#project-details-closure-continue-reason"),
    saveStatus: document.querySelector("#project-details-closure-save-status"),
    error: document.querySelector("#project-details-closure-error"),
    live: document.querySelector("#project-details-closure-live"),
  };

  let repository = null;
  let projectId = "";
  let aggregate = null;
  let context = null;
  let reviewSummary = null;
  let busy = false;

  bindEvents();
  initialize().catch(renderFatal);

  function bindEvents() {
    ui.reviewButton.addEventListener("click", () => openReview({ saveFirst: true, announce: true }));
    ui.confirm.addEventListener("click", confirmClosure);
    ui.back.addEventListener("click", focusEditing);
    ui.continueButton.addEventListener("click", continueToNextStep);
    ui.acknowledge.addEventListener("change", updateActions);
    globalObject.addEventListener("yarnai:project-details-closure-open", () => openReview({ saveFirst: false, announce: true }));
    globalObject.addEventListener("pagehide", () => repository?.close());
  }

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project") || "";
    if (!projectId || !system.isUuidv7(projectId)) throw new closureApi.ProjectDetailsClosureError("PROJECT_ID_MISSING", "Проект не найден. Вернись в мастерскую и выбери его заново.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    await refresh();
  }

  function buildInput(value) {
    const nextContext = experience.contextFromAggregate(value);
    if (!nextContext.project || nextContext.project.project_id !== projectId) throw new closureApi.ProjectDetailsClosureError("PROJECT_ID_MISMATCH", "Открыт другой проект. Проверка остановлена.");
    const effectiveIntent = experience.applyDetailsToIntent(nextContext.intent, nextContext.details);
    const readiness = readinessApi.evaluateProjectReadiness(effectiveIntent);
    const safety = experience.progressSafety(nextContext.relevantProgress);
    const destination = experience.readinessPresentation({
      details: nextContext.details,
      garmentType: effectiveIntent.garmentType,
      technology: nextContext.technology,
      readiness,
      safe: safety.safe,
      swatchHref: `/user-workspace-entry?project=${encodeURIComponent(projectId)}#swatch-assistant`,
    }).action;
    return {
      projectId,
      garmentType: effectiveIntent.garmentType || "изделие",
      details: nextContext.details,
      technology: nextContext.technology,
      intent: effectiveIntent,
      collaborationState: nextContext.collaborationState,
      safe: safety.safe,
      nextDestination: destination,
      closureHistory: nextContext.closureHistory,
      project: nextContext.project,
    };
  }

  async function refresh() {
    aggregate = await repository.getProject(projectId);
    context = buildInput(aggregate);
    const latest = closureApi.latestClosure(context.closureHistory);
    reviewSummary = closureApi.buildReviewSummary({ ...context, latestClosure: latest });
    render(reviewSummary);
    return reviewSummary;
  }

  async function openReview(options = {}) {
    if (busy) return;
    setBusy(true);
    clearError();
    try {
      if (options.saveFirst) {
        const saved = await globalObject.YarnAIProjectDetailsExperienceController?.ensureSaved?.();
        if (saved === false) throw new closureApi.ProjectDetailsClosureError("DETAILS_SAVE_FAILED", "Сначала исправь и сохрани параметры проекта.");
      }
      await refresh();
      ui.review.hidden = false;
      if (options.announce) {
        section.scrollIntoView?.({ block: "start", behavior: "smooth" });
        ui.live.textContent = readinessText(reviewSummary);
      }
    } catch (error) {
      renderError(error, "Не удалось повторно проверить данные.");
    } finally {
      setBusy(false);
    }
  }

  function render(summary) {
    ui.review.hidden = false;
    renderReadiness(summary);
    renderKnown(summary.snapshot.known);
    renderList(ui.missingRequired, summary.readiness.missingRequired, (item) => item.label, ui.requiredComplete);
    renderList(ui.missingRecommended, summary.readiness.missingRecommended, (item) => item.label, ui.recommendedComplete);
    renderList(ui.errors, summary.readiness.blockingErrors, issueText, ui.errorsEmpty);
    renderList(ui.warnings, summary.readiness.warnings, issueText, ui.warningsEmpty);
    renderProvenance(summary.snapshot.provenance);
    renderCollaboration(summary.snapshot.collaboration);
    renderList(ui.assumptions, summary.readiness.assumptions, (item) => item.label, ui.assumptionsEmpty);
    renderPrevious(summary.previous);
    ui.acknowledgement.hidden = !summary.acknowledgementRequired || summary.canContinue;
    if (ui.acknowledgement.hidden) ui.acknowledge.checked = false;
    updateActions();
  }

  function renderReadiness(summary) {
    let status = summary.readiness.status;
    if (summary.previous?.current) status = "closed";
    else if (summary.previous?.stale) status = "stale";
    else if (summary.previous && !summary.previous.valid) status = "blocked";
    ui.readiness.dataset.status = status;
    ui.readiness.textContent = readinessText(summary);
  }

  function readinessText(summary) {
    if (summary.previous && !summary.previous.valid) return `Проверка заблокирована: ${summary.previous.error?.message || "предыдущая запись повреждена"}`;
    if (summary.previous?.current) return "Данные подтверждены и совпадают с текущим проектом.";
    if (summary.previous?.stale) return "Предыдущее подтверждение устарело: значимые сведения изменились.";
    if (summary.readiness.status === "ready") return "Готово: обязательные сведения заполнены, блокирующих ошибок нет.";
    if (summary.readiness.status === "conditionally-ready") return "Условно готово: перед подтверждением прочитай и прими допущения.";
    return "Пока нельзя подтвердить данные: исправь перечисленные блокирующие пункты.";
  }

  function renderKnown(items) {
    ui.known.replaceChildren(...items.map((item) => definition(item.label, item.value, item.source)));
  }

  function renderProvenance(items) {
    ui.provenance.replaceChildren(...items.map((item) => definition(item.label, item.sourceLabel, item.collaboration ? `Request ${item.collaboration.requestId}; response ${item.collaboration.responseId}` : "")));
  }

  function definition(termText, valueText, detailText) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = termText;
    value.textContent = valueText;
    if (detailText) {
      const detail = document.createElement("small");
      detail.textContent = detailText;
      value.append(detail);
    }
    row.append(term, value);
    return row;
  }

  function renderList(target, items, textFor, emptyTarget) {
    const values = Array.isArray(items) ? items : [];
    target.replaceChildren(...values.map((item) => {
      const row = document.createElement("li");
      row.textContent = textFor(item);
      return row;
    }));
    target.hidden = values.length === 0;
    if (emptyTarget) emptyTarget.hidden = values.length > 0;
  }

  function issueText(item) {
    return item.label ? `${item.label}: ${item.message || item.code}` : item.message || item.code || "Требуется проверка.";
  }

  function renderCollaboration(value) {
    const items = Array.isArray(value?.applied) ? value.applied : [];
    ui.collaborationSummary.textContent = items.length
      ? `Применённых изменений помощника: ${items.length}. В closure входят только принятые владельцем значения.`
      : "Принятых изменений помощника нет. Черновики и отклонённые предложения не входят в снимок.";
    renderList(ui.collaborationList, items, (item) => `${humanField(item.path)} — ${item.helperLabel}; request ${item.requestId}; response ${item.responseId}.`);
  }

  function renderPrevious(previous) {
    ui.staleChanges.replaceChildren();
    if (!previous) {
      ui.previousStatus.textContent = "Подтверждений пока нет.";
      return;
    }
    if (!previous.valid) {
      ui.previousStatus.textContent = `Запись не прошла проверку целостности: ${previous.error?.message || "неизвестная ошибка"}`;
      return;
    }
    if (previous.current) {
      ui.previousStatus.textContent = `Актуальное подтверждение ${previous.closureId}, создано ${formatTime(previous.completedAt)}.`;
      return;
    }
    ui.previousStatus.textContent = `Подтверждение ${previous.closureId} устарело. Изменённые сведения:`;
    renderList(ui.staleChanges, previous.changes, (item) => `${item.label}: было «${display(item.before)}», стало «${display(item.after)}».`);
  }

  function updateActions() {
    if (!reviewSummary) return;
    const acknowledged = !reviewSummary.acknowledgementRequired || ui.acknowledge.checked;
    ui.reviewButton.disabled = busy;
    ui.confirm.disabled = busy || !reviewSummary.canConfirm || !acknowledged;
    ui.continueButton.disabled = busy || !reviewSummary.canContinue || !reviewSummary.nextDestination.enabled;
    if (reviewSummary.previous && !reviewSummary.previous.valid) ui.confirmReason.textContent = "Повреждённая или недоверенная closure-запись блокирует новое подтверждение.";
    else if (reviewSummary.readiness.status === "blocked") ui.confirmReason.textContent = reviewSummary.readiness.blockingErrors[0]?.message || "Исправь обязательные данные.";
    else if (reviewSummary.previous?.current) ui.confirmReason.textContent = "Текущие данные уже подтверждены.";
    else if (!acknowledged) ui.confirmReason.textContent = "Подтверди, что прочитала допущения.";
    else ui.confirmReason.textContent = "Будет создан новый неизменяемый снимок; параметры проекта не изменятся.";
    ui.continueReason.textContent = reviewSummary.canContinue
      ? reviewSummary.nextDestination.description || "Актуальная closure-запись проверена."
      : reviewSummary.previous?.stale
        ? "Продолжение заблокировано: подтверди изменившиеся сведения заново."
        : "Продолжение станет доступно после актуального подтверждения.";
  }

  async function confirmClosure() {
    if (busy || !reviewSummary) return;
    setBusy(true);
    clearError();
    ui.saveStatus.textContent = "Повторно проверяем и фиксируем снимок…";
    try {
      const acknowledged = ui.acknowledge.checked;
      const saved = await globalObject.YarnAIProjectDetailsExperienceController?.ensureSaved?.();
      if (saved === false) throw new closureApi.ProjectDetailsClosureError("DETAILS_SAVE_FAILED", "Сначала исправь и сохрани параметры проекта.");
      await refresh();
      if (!reviewSummary.canConfirm) throw new closureApi.ProjectDetailsClosureError("CLOSURE_NOT_READY", reviewSummary.previous?.error?.message || reviewSummary.readiness.blockingErrors[0]?.message || "Данные нельзя подтвердить.");
      if (reviewSummary.acknowledgementRequired && !acknowledged) throw new closureApi.ProjectDetailsClosureError("ACKNOWLEDGEMENT_REQUIRED", "Подтверди перечисленные допущения.");

      const now = new Date().toISOString();
      const previous = closureApi.latestClosure(context.closureHistory);
      const draft = closureApi.buildClosureDraft({ snapshot: reviewSummary.snapshot, readiness: reviewSummary.readiness }, {
        closureId: system.uuidv7(),
        createdAt: now,
        createdBy: "Владелец проекта",
        previousClosureId: previous?.closureId || null,
      });
      const reviewing = closureApi.startReviewing(draft, { reviewedAt: now, acknowledged });
      const completed = closureApi.completeClosure(reviewing, { completedAt: now, acknowledged });

      const latestAggregate = await repository.getProject(projectId);
      const latestInput = buildInput(latestAggregate);
      const latestSnapshot = closureApi.buildProjectDetailsSnapshot(latestInput);
      if (!closureApi.compareSnapshots(completed.snapshot, latestSnapshot).current) throw new closureApi.ProjectDetailsClosureError("LIVE_DATA_CHANGED", "Данные изменились во время подтверждения. Проверь их ещё раз.");
      const draftInput = latestAggregate.project.draft_input && typeof latestAggregate.project.draft_input === "object"
        ? structuredClone(latestAggregate.project.draft_input)
        : {};
      draftInput[closureApi.HISTORY_KEY] = closureApi.appendCompletedClosure(draftInput[closureApi.HISTORY_KEY], completed);
      await repository.updateProject(projectId, { draft_input: draftInput });
      ui.acknowledge.checked = false;
      await refresh();
      globalObject.dispatchEvent(new CustomEvent("yarnai:project-details-closure-completed", { detail: { projectId } }));
      ui.saveStatus.textContent = "Данные подтверждены. Неизменяемый снимок сохранён в истории проекта.";
      ui.live.textContent = reviewSummary.nextDestination.enabled
        ? "Данные подтверждены. Кнопка «Продолжить» доступна."
        : `Данные подтверждены. ${reviewSummary.nextDestination.description || "Следующий этап пока недоступен."}`;
    } catch (error) {
      renderError(error, "Не удалось подтвердить данные. Проект не изменён.");
    } finally {
      setBusy(false);
    }
  }

  async function continueToNextStep() {
    if (busy) return;
    setBusy(true);
    clearError();
    try {
      await refresh();
      if (!reviewSummary.canContinue || !reviewSummary.nextDestination.enabled) throw new closureApi.ProjectDetailsClosureError("STALE_OR_BLOCKED", "Продолжение заблокировано: повтори итоговую проверку.");
      globalObject.location.assign(reviewSummary.nextDestination.href);
    } catch (error) {
      renderError(error, "Не удалось безопасно продолжить.");
    } finally {
      setBusy(false);
    }
  }

  function focusEditing() {
    const first = reviewSummary?.readiness?.blockingErrors?.find((item) => item.path)?.path?.split(".").at(-1)
      || reviewSummary?.readiness?.missingRequired?.[0]?.field;
    const form = document.querySelector("#project-details-form");
    const control = first ? form?.elements?.namedItem(first) : null;
    const target = control && typeof control.length === "number" && !control.tagName ? control[0] : control;
    (target || form)?.focus?.();
    (target || form)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }

  function humanField(path) {
    const field = String(path || "").split(".").at(-1);
    return experience.FIELD_CATALOG[field]?.label || "Значение проекта";
  }

  function display(value) {
    if (value === null || value === undefined || value === "") return "не указано";
    if (typeof value === "object") return value.value !== undefined ? `${value.value} ${value.unit === "inch" ? "дюйм." : "см"}` : JSON.stringify(value);
    return String(value);
  }

  function formatTime(value) {
    if (!value) return "время не указано";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "время не указано" : parsed.toLocaleString("ru-RU");
  }

  function setBusy(value) {
    busy = value;
    updateActions();
  }

  function clearError() {
    ui.error.hidden = true;
    ui.error.textContent = "";
  }

  function renderError(error, fallback) {
    const message = error?.userMessage || fallback;
    ui.error.hidden = false;
    ui.error.textContent = message;
    ui.saveStatus.textContent = "Изменения closure не сохранены.";
    ui.live.textContent = message;
    if (reviewSummary) updateActions();
  }

  function renderFatal(error) {
    ui.readiness.dataset.status = "blocked";
    ui.readiness.textContent = "Проверка недоступна.";
    renderError(error, "Не удалось открыть итоговую проверку.");
    ui.confirm.disabled = true;
    ui.continueButton.disabled = true;
  }
})(window);
