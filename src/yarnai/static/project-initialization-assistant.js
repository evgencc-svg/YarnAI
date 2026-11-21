"use strict";

(function initializeProjectInitializationAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.hash !== "#project-details") return;

  const system = globalObject.YarnAIProjectSystem;
  const experience = globalObject.YarnAIProjectDetailsExperience;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const closureApi = globalObject.YarnAIProjectDetailsClosure;
  const api = globalObject.YarnAIProjectInitialization;
  const section = document.querySelector("#project-initialization");
  if (!system || !experience || !readinessApi || !closureApi || !api || !section) return;

  const ui = {
    status: document.querySelector("#project-initialization-status"),
    summary: document.querySelector("#project-initialization-summary"),
    garment: document.querySelector("#project-initialization-garment"),
    source: document.querySelector("#project-initialization-source"),
    readiness: document.querySelector("#project-initialization-readiness"),
    assumptionsCount: document.querySelector("#project-initialization-assumptions-count"),
    warningsCount: document.querySelector("#project-initialization-warnings-count"),
    assumptions: document.querySelector("#project-initialization-assumptions"),
    warnings: document.querySelector("#project-initialization-warnings"),
    changesPanel: document.querySelector("#project-initialization-changes-panel"),
    changes: document.querySelector("#project-initialization-changes"),
    review: document.querySelector("#project-initialization-review"),
    back: document.querySelector("#project-initialization-back"),
    initialize: document.querySelector("#project-initialization-confirm"),
    continueButton: document.querySelector("#project-initialization-continue"),
    reason: document.querySelector("#project-initialization-reason"),
    saved: document.querySelector("#project-initialization-save-status"),
    error: document.querySelector("#project-initialization-error"),
    live: document.querySelector("#project-initialization-live"),
  };

  let repository = null;
  let projectId = "";
  let aggregate = null;
  let sourceInput = null;
  let assessment = null;
  let candidate = null;
  let busy = false;

  ui.review.addEventListener("click", reviewInitialization);
  ui.back.addEventListener("click", backToDetails);
  ui.initialize.addEventListener("click", initializeProject);
  ui.continueButton.addEventListener("click", continueProject);
  globalObject.addEventListener("yarnai:project-details-closure-completed", () => refresh({ resetCandidate: true }).catch(renderFatal));
  globalObject.addEventListener("pagehide", () => repository?.close());

  initialize().catch(renderFatal);

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project") || "";
    if (!projectId || !system.isUuidv7(projectId)) throw new api.ProjectInitializationError("PROJECT_ID_MISSING", "Проект не найден. Вернитесь в мастерскую и выберите его заново.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    await refresh({ resetCandidate: true });
  }

  function buildSourceInput(value) {
    const context = experience.contextFromAggregate(value);
    if (!context.project || context.project.project_id !== projectId) throw new api.ProjectInitializationError("PROJECT_ID_MISMATCH", "Открыт другой проект. Подготовка остановлена.");
    const effectiveIntent = experience.applyDetailsToIntent(context.intent, context.details);
    const readiness = readinessApi.evaluateProjectReadiness(effectiveIntent);
    const safety = experience.progressSafety(context.relevantProgress);
    const presentedDestination = experience.readinessPresentation({
      details: context.details,
      garmentType: effectiveIntent.garmentType,
      technology: context.technology,
      readiness,
      safe: safety.safe,
      swatchHref: `/user-workspace-entry?project=${encodeURIComponent(projectId)}#swatch-assistant`,
    }).action;
    const nextDestination = presentedDestination.enabled || !safety.safe
      ? presentedDestination
      : {
        enabled: true,
        href: `/user-workspace-entry?project=${encodeURIComponent(projectId)}#swatch-assistant`,
        label: "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u043e\u0431\u0440\u0430\u0437\u0446\u0443",
        description: "\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433 \u2014 \u043e\u0431\u0440\u0430\u0437\u0435\u0446 \u0438 \u043f\u043b\u043e\u0442\u043d\u043e\u0441\u0442\u044c.",
      };
    return {
      projectIdentity: projectId,
      closureHistory: context.closureHistory,
      initializationHistory: context.project.draft_input?.[api.HISTORY_KEY],
      nextDestination,
      liveInput: {
        projectId,
        garmentType: effectiveIntent.garmentType || "изделие",
        details: context.details,
        technology: context.technology,
        intent: effectiveIntent,
        collaborationState: context.collaborationState,
        safe: safety.safe,
        nextDestination,
      },
    };
  }

  async function refresh(options = {}) {
    aggregate = await repository.getProject(projectId);
    sourceInput = buildSourceInput(aggregate);
    assessment = api.assessInitialization(sourceInput);
    if (options.resetCandidate) candidate = null;
    render();
    return assessment;
  }

  function render() {
    clearError();
    const record = assessment?.existing || candidate;
    const snapshot = record?.snapshot || assessment?.candidateSnapshot;
    const initialized = assessment?.current && assessment?.existing?.lifecycle === "initialized";
    const lifecycle = initialized ? "initialized" : candidate?.lifecycle || null;
    ui.status.dataset.status = initialized ? "initialized" : assessment?.verdict || "blocked";
    ui.status.textContent = statusText(initialized, lifecycle);
    ui.summary.hidden = !snapshot;
    if (snapshot) renderSummary(snapshot);
    renderChanges(assessment?.changes || []);
    ui.review.disabled = busy || initialized || assessment?.sourceVerdict !== "ready" || !assessment?.canCreate || lifecycle === "ready";
    ui.initialize.disabled = busy || lifecycle !== "ready" || assessment?.sourceVerdict !== "ready" || !assessment?.canCreate;
    ui.continueButton.disabled = busy || !initialized || !assessment?.canContinue;
    ui.back.disabled = busy;
    ui.review.textContent = assessment?.verdict === "stale" && assessment?.canCreate
      ? "Создать новую основу"
      : lifecycle === "reviewing" ? "Подтвердить просмотр" : "Проверить основу";
    ui.reason.textContent = actionReason(initialized, lifecycle);
  }

  function statusText(initialized, lifecycle) {
    if (initialized) return `Проект подготовлен ${formatTime(assessment.existing.initialized_at)}. Подтверждённая основа восстановлена без создания дубля.`;
    if (lifecycle === "ready") return "Основа проверена и готова к созданию.";
    if (lifecycle === "reviewing") return "Просмотрите сводку. После подтверждения станет доступна инициализация проекта.";
    if (assessment?.verdict === "stale" && assessment.sourceVerdict === "ready") return "Ранее созданная основа устарела: доступна новая подтверждённая версия сведений.";
    if (assessment?.verdict === "stale") return "Сведения изменились. Сначала повторите итоговую проверку сведений о проекте.";
    if (assessment?.reasons?.[0]?.code === "COMPLETED_CLOSURE_MISSING") return "Сначала завершите итоговую проверку сведений о проекте.";
    if (assessment?.verdict === "blocked") return `Подготовка заблокирована: ${assessment.reasons[0]?.message || "итоговая проверка недоступна"}`;
    return "Подтверждённые сведения готовы к просмотру перед созданием основы проекта.";
  }

  function actionReason(initialized, lifecycle) {
    if (initialized) return assessment.destination.description || "Основа проекта актуальна; можно безопасно продолжить.";
    if (lifecycle === "ready") return "Инициализация сохранит отдельную неизменяемую основу и не изменит сведения проекта.";
    if (lifecycle === "reviewing") return "Проверьте изделие, размер, допущения и предупреждения, затем подтвердите просмотр.";
    if (assessment?.canCreate) return "Сначала явно просмотрите сведения, из которых будет создана рабочая основа проекта.";
    return assessment?.reasons?.[0]?.message || "Инициализация пока недоступна.";
  }

  function renderSummary(snapshot) {
    const size = snapshot.garment.sizeMode === "standard" ? snapshot.garment.standardSize : "собственные мерки";
    ui.garment.textContent = `${snapshot.garment.type}; ${size}; ${humanRecipient(snapshot.garment.recipient)}; ${humanFit(snapshot.garment.fit)}.`;
    ui.source.textContent = `Итоговая проверка завершена ${formatTime(snapshot.source.completedAt)}.`;
    ui.readiness.textContent = snapshot.source.readiness === "conditionally-ready" ? "Готово с подтверждёнными допущениями" : "Готово";
    ui.assumptionsCount.textContent = String(snapshot.assumptions.length);
    ui.warningsCount.textContent = String(snapshot.warnings.length);
    renderList(ui.assumptions, snapshot.assumptions, (item) => item.label || item.message);
    renderList(ui.warnings, snapshot.warnings, (item) => item.message || item.label);
  }

  function renderChanges(changes) {
    ui.changesPanel.hidden = !changes.length;
    renderList(ui.changes, changes, (item) => `${item.label}: было «${display(item.before)}», стало «${display(item.after)}».`);
  }

  function renderList(target, values, label) {
    target.replaceChildren(...values.map((item) => {
      const row = document.createElement("li");
      row.textContent = label(item);
      return row;
    }));
    target.hidden = values.length === 0;
  }

  async function reviewInitialization() {
    if (busy) return;
    setBusy(true);
    try {
      await refresh();
      if (candidate?.lifecycle === "reviewing") {
        if (assessment.sourceVerdict !== "ready" || !assessment.canCreate) throw new api.ProjectInitializationError("SOURCE_CHANGED", "Подтверждённые сведения изменились во время просмотра.");
        candidate = api.markReady(candidate);
      } else {
        if (assessment.sourceVerdict !== "ready" || !assessment.canCreate) throw new api.ProjectInitializationError(assessment.reasons[0]?.code || "INITIALIZATION_BLOCKED", assessment.reasons[0]?.message || "Основа проекта пока недоступна.");
        const now = new Date().toISOString();
        const draft = api.buildInitializationDraft(sourceInput, { identity: system.uuidv7(), createdAt: now, createdBy: "Владелец проекта" });
        candidate = api.startReviewing(draft, { reviewedAt: now });
      }
      render();
      ui.status.focus();
      ui.live.textContent = ui.status.textContent;
    } catch (error) { renderError(error, "Не удалось проверить основу проекта."); }
    finally { setBusy(false); }
  }

  async function initializeProject() {
    if (busy || candidate?.lifecycle !== "ready") return;
    setBusy(true);
    ui.saved.textContent = "Повторно проверяем подтверждённые сведения…";
    try {
      const expectedClosure = candidate.source_closure_identity;
      await refresh();
      if (assessment.sourceVerdict !== "ready" || !assessment.canCreate || assessment.sourceClosure?.closureId !== expectedClosure) throw new api.ProjectInitializationError("SOURCE_CHANGED", "Подтверждённые сведения изменились. Просмотрите основу заново.");
      candidate = api.initializeProject(candidate, { initializedAt: new Date().toISOString() });
      await repository.saveProjectInitialization(projectId, candidate, { baseRevision: aggregate.project.revision });
      candidate = null;
      await refresh({ resetCandidate: true });
      ui.saved.textContent = "Неизменяемая рабочая основа проекта сохранена локально.";
      ui.status.focus();
      ui.live.textContent = "Проект подготовлен. Автоматический переход не выполнялся.";
    } catch (error) { renderError(error, "Не удалось подготовить проект. Новая основа не сохранена."); }
    finally { setBusy(false); }
  }

  async function continueProject() {
    if (busy) return;
    setBusy(true);
    try {
      await refresh({ resetCandidate: true });
      const result = api.validateContinue(sourceInput);
      const destination = new URL(result.destination.href, globalObject.location.origin);
      const href = destination.pathname === "/user-workspace-entry"
        ? `${destination.pathname}${destination.search}`
        : `${destination.pathname}${destination.search}${destination.hash}`;
      globalObject.location.assign(href);
    } catch (error) { renderError(error, "Продолжение заблокировано: повторите проверку проекта."); }
    finally { setBusy(false); }
  }

  function backToDetails() {
    document.querySelector("#project-details-form")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    document.querySelector("#project-details-form input, #project-details-form select")?.focus?.();
  }

  function humanRecipient(value) { return ({ woman: "для женщины", man: "для мужчины", child: "для ребёнка", self: "для себя" })[value] || "получатель подтверждён"; }
  function humanFit(value) { return ({ fitted: "прилегающая посадка", regular: "обычная посадка", relaxed: "свободная посадка", oversized: "оверсайз" })[value] || "посадка подтверждена"; }
  function display(value) {
    if (record(value) && value.value !== undefined) return `${value.value} ${value.unit === "inch" ? "дюйм." : "см"}`;
    if (value === null || value === undefined || value === "") return "не указано";
    return String(value);
  }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function formatTime(value) {
    const parsed = new Date(value || "");
    return Number.isNaN(parsed.getTime()) ? "время не указано" : parsed.toLocaleString("ru-RU");
  }
  function setBusy(value) { busy = value; render(); }
  function clearError() { ui.error.hidden = true; ui.error.textContent = ""; }
  function renderError(error, fallback) {
    const message = error?.userMessage || fallback;
    ui.error.hidden = false;
    ui.error.textContent = message;
    ui.saved.textContent = "Изменения основы не сохранены.";
    ui.live.textContent = message;
  }
  function renderFatal(error) {
    assessment = { verdict: "blocked", sourceVerdict: "blocked", canCreate: false, canContinue: false, reasons: [{ message: error?.userMessage || "Подготовка проекта недоступна." }] };
    render();
    renderError(error, "Не удалось открыть подготовку проекта.");
  }

  globalObject.YarnAIProjectInitializationController = Object.freeze({ refresh: () => refresh({ resetCandidate: true }) });
})(window);
