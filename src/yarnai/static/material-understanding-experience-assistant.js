"use strict";

(function initializeMaterialUnderstandingPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const experience = globalObject.YarnAIMaterialUnderstandingExperience;
  const extractionApi = globalObject.YarnAIPatternContentExtraction;
  const semanticApi = globalObject.YarnAIPatternSemanticAnalysis;
  const reviewApi = globalObject.YarnAIPatternAnalysisReview;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const get = (selector) => document.querySelector(selector);
  const ui = {
    live: get("#understanding-live"), missingProject: get("#understanding-missing-project"),
    error: get("#understanding-error"), errorTitle: get("#understanding-error-title"),
    errorMessage: get("#understanding-error-message"), errorMaterials: get("#understanding-error-materials"), retry: get("#understanding-retry"),
    workflow: get("#understanding-workflow"), projectTitle: get("#understanding-project-title"),
    title: get("#understanding-title"), lead: get("#understanding-lead"),
    loading: get("#understanding-loading"), loadingCopy: get("#understanding-loading-copy"), content: get("#understanding-content"),
    materialsTop: get("#understanding-materials-top"), materialsBottom: get("#understanding-materials-bottom"),
    summaryTitle: get("#understanding-summary-title"), summaryDescription: get("#understanding-summary-description"), summaryTrust: get("#understanding-summary-trust"),
    confirmed: get("#understanding-confirmed"), confirmedEmpty: get("#understanding-confirmed-empty"),
    assumed: get("#understanding-assumed"), assumedEmpty: get("#understanding-assumed-empty"),
    missing: get("#understanding-missing"), missingEmpty: get("#understanding-missing-empty"),
    conflictsCard: get("#understanding-conflicts-card"), conflicts: get("#understanding-conflicts"),
    questionCard: get("#understanding-question-card"), questionForm: get("#understanding-question-form"), questionText: get("#understanding-question-text"), questionControl: get("#understanding-question-control"), questionSave: get("#understanding-question-save"), questionError: get("#understanding-question-error"),
    sources: get("#understanding-sources"), sourcesEmpty: get("#understanding-sources-empty"),
    correctionOpen: get("#understanding-correction-open"), correctionForm: get("#understanding-correction-form"), correctionField: get("#understanding-correction-field"), correctionValue: get("#understanding-correction-value"), correctionSave: get("#understanding-correction-save"), correctionCancel: get("#understanding-correction-cancel"), correctionError: get("#understanding-correction-error"),
    continueButton: get("#understanding-continue"), continueCopy: get("#understanding-continue-copy"), operationError: get("#understanding-operation-error"),
  };
  let repository = null;
  let projectId = "";
  let context = null;
  let viewModel = experience?.buildViewModel();
  let busy = false;
  let correctionReturnFocus = null;

  initialize().catch((error) => renderStorageError(error));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project") || "";
    bindEvents();
    if (!projectId || !system?.isUuidv7(projectId) || !experience) {
      render(experience?.buildViewModel({}) || null);
      return;
    }
    repository = new system.ProjectRepository();
    await repository.initialize();
    await loadContext();
    if (context.analysisState === "analyzer_stale" && semanticApi?.ensureForProject) {
      await semanticApi.ensureForProject(repository, projectId);
      await loadContext();
    }
    if (await reconcileSavedUnderstanding()) await loadContext();
    renderCurrent();
    if (needsFirstAnalysis()) await runFirstAnalysis();
  }

  function bindEvents() {
    ui.questionForm.addEventListener("submit", saveAnswer);
    ui.correctionOpen.addEventListener("click", openCorrection);
    ui.correctionCancel.addEventListener("click", cancelCorrection);
    ui.correctionForm.addEventListener("submit", saveCorrection);
    ui.continueButton.addEventListener("click", confirmAndContinue);
    ui.retry.addEventListener("click", retryAnalysis);
    globalObject.addEventListener("pagehide", () => repository?.close());
  }

  async function loadContext() {
    const aggregate = await repository.getProject(projectId);
    const calculation = (aggregate.calculations || []).find((entry) => entry.calculation_id === aggregate.project.active_calculation_id) || null;
    const progressFor = (kind) => (aggregate.progress || []).filter((entry) => entry.calculation_id === calculation?.calculation_id && entry.epoch === 1 && entry.kind === kind);
    const one = (kind) => { const matches = progressFor(kind); return matches.length === 1 ? matches[0] : null; };
    const semanticProgress = one("PATTERN_SEMANTIC_ANALYSIS");
    const reviewProgress = one("PATTERN_ANALYSIS_REVIEW");
    const importProgress = one("PATTERN_IMPORT");
    const semanticInspection = semanticApi?.inspectAggregate(aggregate) || { state: semanticProgress?.state?.status || "missing", analysis: semanticProgress?.state || null };
    const intake = aggregate.project?.draft_input?.material_intake || {};
    const intent = calculation?.request?.project_intent || calculation?.request?.projectIntent || aggregate.project?.draft_input?.project_intent || null;
    const readiness = intent && readinessApi?.evaluateProjectReadiness ? readinessApi.evaluateProjectReadiness(intent) : null;
    context = {
      aggregate, project: aggregate.project, calculation, intent, readiness,
      semantic: semanticInspection.analysis, review: reviewProgress?.state || null,
      importState: importProgress?.state || null, purposes: intake.purposes || {},
      saved: aggregate.project?.draft_input?.material_understanding || null,
      semanticProgress, analysisState: semanticInspection.state,
    };
  }

  function needsFirstAnalysis() {
    if (!context?.importState || context.importState.status !== "completed") return false;
    if (context.semantic) return false;
    const base = (context.aggregate.progress || []).find((entry) => entry.kind === "PATTERN_ANALYSIS" && entry.calculation_id === context.calculation?.calculation_id && entry.epoch === 1);
    return Boolean(base?.state && ["waiting", "queued", "analyzing"].includes(base.state.status));
  }

  async function runFirstAnalysis() {
    if (busy || !extractionApi || !semanticApi) return;
    busy = true;
    showLoading("Читаем содержимое сохранённых материалов…");
    try {
      let extraction = extractionApi.inspectAggregate(context.aggregate);
      if (!extraction.extraction || extraction.extraction.status === "waiting") extraction = await extractionApi.runForProject(repository, projectId);
      if (!["completed", "partial"].includes(extraction.extraction?.status)) {
        await loadContext(); renderCurrent(); return;
      }
      showLoading("Собираем понятное описание без догадок сверх материалов…");
      let semantic = semanticApi.inspectAggregate(await repository.getProject(projectId));
      if (!semantic.analysis) semantic = await semanticApi.ensureForProject(repository, projectId);
      if (semantic.analysis?.status === "waiting") semantic = await semanticApi.runForProject(repository, projectId);
      if (semantic.analysis?.status === "completed") await ensureCurrentReview();
      await loadContext(); renderCurrent();
    } catch (error) {
      await loadContext().catch(() => {});
      renderCurrent(error?.userMessage || "Не удалось разобрать материалы.");
    } finally {
      busy = false;
      setInteractive(false);
      if (viewModel) ui.continueButton.disabled = !viewModel.continueAction.enabled;
    }
  }

  async function retryAnalysis() {
    if (busy || !context?.semantic || !semanticApi?.retryForProject) return;
    await runBusy(async () => {
      showLoading("Повторно проверяем сохранённые материалы…");
      const result = await semanticApi.retryForProject(repository, projectId);
      if (result.analysis?.status === "completed") await ensureCurrentReview();
      await loadContext(); renderCurrent();
    }, "Повторный разбор не выполнен.");
  }

  async function ensureCurrentReview() {
    if (!reviewApi?.ensureForProject) return;
    let inspected = await reviewApi.ensureForProject(repository, projectId);
    if (inspected.state === "stale" && reviewApi.rebaseForProject) inspected = await reviewApi.rebaseForProject(repository, projectId);
    return inspected;
  }

  function renderCurrent(operationMessage = "") {
    viewModel = experience.buildViewModel(context || {});
    render(viewModel);
    if (operationMessage) ui.operationError.textContent = operationMessage;
  }

  function render(model) {
    ui.missingProject.hidden = model?.state !== "missing_project";
    ui.error.hidden = model?.state !== "error";
    ui.workflow.hidden = !model || ["missing_project", "error"].includes(model.state);
    if (!model || model.state === "missing_project") return;
    ui.projectTitle.textContent = model.project?.title || "Проект";
    ui.title.textContent = model.heading;
    ui.lead.textContent = model.lead;
    setLinks(model.links.materials);
    if (model.state === "error") {
      ui.errorTitle.textContent = model.error?.title || model.heading;
      ui.errorMessage.textContent = model.error?.message || model.lead;
      ui.errorMaterials.href = model.links.materials;
      ui.retry.hidden = !canRetry();
      return;
    }
    ui.loading.hidden = model.state !== "loading";
    ui.content.hidden = model.state !== "ready";
    if (model.state === "loading") return;
    renderSummary(model);
    renderFacts(ui.confirmed, ui.confirmedEmpty, model.confirmed, false);
    renderFacts(ui.assumed, ui.assumedEmpty, model.assumed, true);
    renderMissing(model.missing);
    renderConflicts(model.conflicts);
    renderQuestion(model.nextQuestion);
    renderSources(model.sources);
    renderCorrectionFields(model.correctionFields);
    ui.continueButton.disabled = !model.continueAction.enabled || busy;
    ui.continueButton.textContent = model.continueAction.label;
    ui.continueCopy.textContent = model.continueAction.enabled ? "Понимание достаточно для следующего шага." : "Ответь на обязательный вопрос или устрани противоречие, чтобы продолжить.";
  }

  function renderSummary(model) {
    ui.summaryTitle.textContent = model.summary.title;
    ui.summaryDescription.textContent = model.summary.description;
    ui.summaryDescription.hidden = !model.summary.description;
    ui.summaryTrust.textContent = model.summary.trustLabel;
    ui.summaryTrust.dataset.trust = model.summary.trust;
  }

  function renderFacts(list, empty, items, assumed) {
    list.replaceChildren(...items.map((item) => {
      const row = document.createElement("li");
      const label = document.createElement("span"); label.className = "fact-label"; label.textContent = item.label;
      const value = document.createElement("span"); value.textContent = assumed ? assumptionText(item.value) : item.value;
      row.append(label, value); return row;
    }));
    empty.hidden = items.length > 0;
  }

  function assumptionText(value) { return /^похоже|^возможно/i.test(value) ? value : `Похоже, ${lowerFirst(value)}`; }

  function renderMissing(items) {
    ui.missing.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.label; return row; }));
    ui.missingEmpty.hidden = items.length > 0;
  }

  function renderConflicts(items) {
    ui.conflictsCard.hidden = items.length === 0;
    ui.conflicts.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.message; return row; }));
  }

  function renderQuestion(question) {
    ui.questionCard.hidden = !question;
    ui.questionError.textContent = "";
    ui.questionControl.replaceChildren();
    if (!question) return;
    ui.questionText.textContent = question.text;
    if (question.options.length) {
      const wrapper = document.createElement("div"); wrapper.className = "radio-list";
      const options = [...question.options];
      if (!options.includes("Не уверена")) options.push("Не уверена");
      options.forEach((value, index) => {
        const label = document.createElement("label"); label.className = "radio-option";
        const input = document.createElement("input"); input.type = "radio"; input.name = "answer"; input.value = value; input.required = question.required; if (index === 0) input.id = "understanding-answer-first";
        const copyNode = document.createElement("span"); copyNode.textContent = value;
        label.append(input, copyNode); wrapper.append(label);
      });
      ui.questionControl.append(wrapper);
    } else {
      const control = question.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
      if (control instanceof HTMLInputElement) control.type = question.type === "number" ? "number" : "text";
      control.id = "understanding-answer"; control.name = "answer"; control.required = question.required; control.maxLength = 500;
      ui.questionControl.append(control);
    }
  }

  function renderSources(items) {
    ui.sources.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.label; return row; }));
    ui.sourcesEmpty.hidden = items.length > 0;
  }

  function renderCorrectionFields(items) {
    const selected = ui.correctionField.value;
    ui.correctionField.replaceChildren(...items.map((item) => { const option = document.createElement("option"); option.value = item.field; option.textContent = item.label; return option; }));
    if (items.some((item) => item.field === selected)) ui.correctionField.value = selected;
  }

  async function saveAnswer(event) {
    event.preventDefault();
    if (busy || !viewModel.nextQuestion) return;
    const answer = new FormData(ui.questionForm).get("answer")?.toString().trim() || "";
    if (!experience.validAnswer(viewModel.nextQuestion, answer)) { ui.questionError.textContent = "Добавь однозначный допустимый ответ перед сохранением."; return; }
    await runBusy(async () => {
      const reviewItem = findReviewItem(viewModel.nextQuestion.field);
      if (reviewItem && context.review?.status !== "confirmed" && reviewApi?.updateItem && reviewApi?.saveForProject) {
        const edited = reviewApi.updateItem(context.review, reviewItem.itemId, {
          reviewedValue: experience.reviewValueForAnswer(viewModel.nextQuestion.field, answer),
          decision: "corrected",
        });
        await reviewApi.saveForProject(repository, projectId, edited);
      } else {
        const saved = experience.recordAnswer(context.saved, viewModel.nextQuestion, answer);
        await saveUnderstanding(saved);
      }
      await loadContext(); renderCurrent();
      ui.live.textContent = "Ответ сохранён. Понимание проекта обновлено.";
      (ui.questionCard.hidden ? ui.summaryTitle : ui.questionText).focus?.();
    }, "Не удалось сохранить ответ.");
  }

  function openCorrection() {
    correctionReturnFocus = document.activeElement;
    ui.correctionForm.hidden = false;
    ui.correctionError.textContent = "";
    ui.correctionValue.value = "";
    ui.correctionField.focus();
  }

  function cancelCorrection() {
    ui.correctionForm.hidden = true;
    ui.correctionError.textContent = "";
    correctionReturnFocus?.focus?.();
  }

  async function saveCorrection(event) {
    event.preventDefault();
    const field = ui.correctionField.value;
    const value = ui.correctionValue.value.trim();
    if (!value) { ui.correctionError.textContent = "Напиши, как будет верно."; return; }
    await runBusy(async () => {
      const reviewItem = findReviewItem(field);
      if (reviewItem && context.review?.status !== "confirmed" && reviewApi?.updateItem && reviewApi?.saveForProject) {
        const edited = reviewApi.updateItem(context.review, reviewItem.itemId, { reviewedValue: value, decision: "corrected" });
        await reviewApi.saveForProject(repository, projectId, edited);
      } else {
        const saved = experience.recordCorrection(context.saved, field, value);
        await saveUnderstanding(saved);
      }
      await loadContext(); renderCurrent(); cancelCorrection();
      ui.live.textContent = "Исправление сохранено как ответ пользователя.";
      ui.summaryTitle.focus?.();
    }, "Не удалось сохранить исправление.");
  }

  function findReviewItem(field) {
    return experience.reviewItemForField(context.review, field);
  }

  async function reconcileSavedUnderstanding() {
    if (!context.review || context.review.status === "confirmed" || !reviewApi?.updateItem || !reviewApi?.saveForProject) return false;
    const saved = experience.normalizeSaved(context.saved);
    const latestByField = new Map([...saved.answers, ...saved.corrections].map((entry) => [entry.field, entry]));
    let next = context.review;
    let changed = false;
    for (const entry of latestByField.values()) {
      const item = experience.reviewItemForField(next, entry.field);
      if (!item) continue;
      const reviewedValue = experience.reviewValueForAnswer(entry.field, entry.value);
      if (item.decision === "corrected" && JSON.stringify(item.reviewedValue) === JSON.stringify(reviewedValue)) continue;
      next = reviewApi.updateItem(next, item.itemId, { reviewedValue, decision: "corrected" });
      changed = true;
    }
    if (changed) await reviewApi.saveForProject(repository, projectId, next);
    return changed;
  }

  async function saveUnderstanding(saved) {
    const draft = context.project?.draft_input && typeof context.project.draft_input === "object" ? context.project.draft_input : {};
    await repository.updateProject(projectId, { draft_input: { ...draft, material_understanding: saved } });
  }

  async function confirmAndContinue() {
    if (busy || !viewModel.continueAction.enabled) return;
    await runBusy(async () => {
      if (!context.review && context.semantic?.status === "completed" && reviewApi.ensureForProject) {
        await reviewApi.ensureForProject(repository, projectId);
        await loadContext();
      }
      globalObject.location.assign(viewModel.continueAction.href);
    }, "Не удалось открыть проверку проекта.");
  }

  async function runBusy(operation, fallback) {
    if (busy) return;
    busy = true; setInteractive(true); ui.operationError.textContent = "";
    try { await operation(); }
    catch (error) { ui.operationError.textContent = error?.userMessage || error?.message || fallback; }
    finally { busy = false; setInteractive(false); if (viewModel) ui.continueButton.disabled = !viewModel.continueAction.enabled; }
  }

  function setInteractive(disabled) { [ui.questionSave, ui.correctionSave, ui.correctionCancel, ui.continueButton, ui.retry].forEach((control) => { control.disabled = disabled; }); }
  function setLinks(href) { ui.materialsTop.href = href; ui.materialsBottom.href = href; ui.errorMaterials.href = href; }
  function showLoading(copy) { ui.workflow.hidden = false; ui.error.hidden = true; ui.missingProject.hidden = true; ui.loading.hidden = false; ui.content.hidden = true; ui.title.textContent = "Разбираем материалы"; ui.lead.textContent = "Результат появится сразу после реальной проверки сохранённых источников."; ui.loadingCopy.textContent = copy; }
  function canRetry() { return ["failed", "partial"].includes(context?.semantic?.status) && Boolean(semanticApi?.retryForProject); }
  function renderStorageError(error) { const model = experience?.buildViewModel({ project: context?.project || { project_id: projectId }, storageError: true }) || null; render(model); if (model) ui.errorMessage.textContent = error?.userMessage || model.lead; }
  function lowerFirst(value) { const text = String(value || ""); return text ? text[0].toLowerCase() + text.slice(1) : text; }
})(window);
