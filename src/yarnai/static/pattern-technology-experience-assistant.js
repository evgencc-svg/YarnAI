"use strict";

(function initializePatternTechnologyExperiencePage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const draftApi = globalObject.YarnAIPatternTechnologyDraft;
  const reviewApi = globalObject.YarnAIPatternTechnologyReview;
  const experience = globalObject.YarnAIPatternTechnologyExperience;
  const readinessApi = globalObject.YarnAIProjectReadiness;
  const byId = (id) => document.getElementById(id);
  const ui = {
    live: byId("technology-live"), projectName: byId("technology-project-name"), analysisLink: byId("technology-analysis-link"),
    missing: byId("technology-missing-project"), error: byId("technology-error"), errorTitle: byId("technology-error-title"), errorMessage: byId("technology-error-message"), errorAnalysis: byId("technology-error-analysis"), retry: byId("technology-retry"),
    workflow: byId("technology-workflow"), loading: byId("technology-loading"), content: byId("technology-content"),
    summaryTitle: byId("technology-summary-title"), summaryText: byId("technology-summary-text"), summaryStatus: byId("technology-summary-status"), statusList: byId("technology-status-list"),
    sourceEvidence: byId("technology-source-evidence-list"), sourceEvidenceEmpty: byId("technology-source-evidence-empty"), adaptationProfile: byId("technology-adaptation-profile-list"), adaptationProfileEmpty: byId("technology-adaptation-profile-empty"), binding: byId("technology-upstream-binding"), planStatus: byId("technology-plan-status"), planStatusTitle: byId("technology-plan-status-title"), planStatusMessage: byId("technology-plan-status-message"), planStatusCounts: byId("technology-plan-status-counts"), executableInputLink: byId("technology-executable-input-link"),
    construction: byId("technology-construction-list"), constructionEmpty: byId("technology-construction-empty"), parts: byId("technology-parts-list"), partsEmpty: byId("technology-parts-empty"),
    sequence: byId("technology-sequence-list"), sequenceEmpty: byId("technology-sequence-empty"), assembly: byId("technology-assembly-list"), assemblyEmpty: byId("technology-assembly-empty"),
    conflictsCard: byId("technology-conflicts-card"), conflicts: byId("technology-conflicts-list"), alternativesCard: byId("technology-alternatives-card"), alternatives: byId("technology-alternatives-list"),
    questionCard: byId("technology-question-card"), questionForm: byId("technology-question-form"), questionTitle: byId("technology-question-title"), questionOptions: byId("technology-question-options"), questionSave: byId("technology-question-save"), questionError: byId("technology-question-error"),
    correctionCard: byId("technology-correction-card"), correctionForm: byId("technology-correction-form"), correctionField: byId("technology-correction-field"), correctionValue: byId("technology-correction-value"), correctionWarning: byId("technology-correction-warning"), correctionError: byId("technology-correction-error"), correctionSave: byId("technology-correction-save"), correctionCancel: byId("technology-correction-cancel"),
    sources: byId("technology-source-list"), nextDescription: byId("technology-next-description"), continueButton: byId("technology-continue"), confirmCopy: byId("technology-confirm-copy"), readinessReasons: byId("technology-readiness-reasons"), operationError: byId("technology-operation-error"),
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
    if (!projectId || !system?.isUuidv7(projectId) || !experience || !draftApi || !reviewApi) {
      render(experience?.buildViewModel({}) || null); return;
    }
    repository = new system.ProjectRepository();
    await repository.initialize();
    await loadContext();
    renderCurrent();
    if (canPrepareDraft()) await prepareDraft();
  }

  function bindEvents() {
    ui.questionForm.addEventListener("submit", saveAnswer);
    ui.correctionForm.addEventListener("submit", saveCorrection);
    ui.correctionCancel.addEventListener("click", cancelCorrection);
    ui.continueButton.addEventListener("click", confirmAndContinue);
    ui.retry.addEventListener("click", prepareDraft);
    document.querySelectorAll("[data-correction-trigger]").forEach((button) => button.addEventListener("click", () => openCorrection(button.dataset.correctionTrigger, button)));
    globalObject.addEventListener("pagehide", () => repository?.close());
  }

  async function loadContext() {
    const aggregate = await repository.getProject(projectId);
    const project = aggregate?.project || null;
    const calculation = (aggregate?.calculations || []).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    const progress = (aggregate?.progress || []).filter((entry) => entry.calculation_id === calculation?.calculation_id && entry.epoch === 1);
    const one = (kind) => { const matches = progress.filter((entry) => entry.kind === kind); return matches.length === 1 ? matches[0] : null; };
    const draftInspection = draftApi.inspectAggregate(aggregate);
    const reviewInspection = reviewApi.inspectAggregate(aggregate);
    const draftProgress = one("PATTERN_TECHNOLOGY_DRAFT");
    const reviewProgress = one("PATTERN_TECHNOLOGY_REVIEW");
    const semanticProgress = one("PATTERN_SEMANTIC_ANALYSIS");
    const importProgress = one("PATTERN_IMPORT");
    const intent = calculation?.request?.project_intent || calculation?.request?.projectIntent || project?.draft_input?.project_intent || null;
    const projectReadiness = intent && readinessApi?.evaluateProjectReadiness ? readinessApi.evaluateProjectReadiness(intent) : null;
    const downstreamKinds = new Set(["PATTERN_EXECUTION_PLAN", "PATTERN_EXECUTION_SESSION", "CALCULATED_PROJECT", "FIRST_KNITTING_STEP"]);
    const projectionStale = draftInspection.state === "stale" && draftInspection.reasonCode === "SOURCE_PROJECTION_STALE";
    const downstreamReviewUsable = !["stale", "corrupted", "source_invalid"].includes(reviewInspection.state);
    context = {
      aggregate, project, calculation, intent, projectReadiness,
      draft: projectionStale ? null : draftInspection.draft || draftProgress?.state || null,
      review: downstreamReviewUsable ? reviewInspection.review || reviewProgress?.state || null : null,
      draftProgress, reviewProgress: downstreamReviewUsable ? reviewProgress : null, draftInspection,
      inspectionState: projectionStale ? "ready" : unsafeInspectionState(draftInspection),
      inspectionReason: draftInspection.reasonCode || null,
      saved: project?.draft_input?.pattern_technology_experience || null,
      semantic: semanticProgress?.state || null, importState: importProgress?.state || null,
      materials: importProgress?.state?.materials || [],
      draftRecordCount: progress.filter((entry) => entry.kind === "PATTERN_TECHNOLOGY_DRAFT").length,
      canBuild: Boolean(draftInspection.review && (projectionStale || ["waiting", "failed"].includes(draftInspection.draft?.status))),
      hasDownstream: progress.some((entry) => downstreamKinds.has(entry.kind)),
    };
  }

  function unsafeInspectionState(draftInspection) {
    return ["stale", "corrupted", "source_invalid"].includes(draftInspection?.state) ? draftInspection.state : "ready";
  }

  function canPrepareDraft() {
    return Boolean(context?.calculation && (!context.draft || ["waiting", "failed"].includes(context.draft.status)) && context.inspectionState !== "stale");
  }

  async function prepareDraft() {
    if (busy || !repository) return;
    await runBusy(async () => {
      showLoading();
      let inspected = await draftApi.ensureForProject(repository, projectId);
      if (inspected.state === "stale" && inspected.reasonCode === "SOURCE_PROJECTION_STALE") inspected = await draftApi.rebuildForProject(repository, projectId);
      else if (inspected.draft?.status === "waiting") inspected = await draftApi.buildForProject(repository, projectId);
      else if (inspected.draft?.status === "failed") inspected = await draftApi.retryForProject(repository, projectId);
      await loadContext(); renderCurrent();
    }, "Не удалось подготовить способ вязания.");
  }

  function renderCurrent() {
    viewModel = experience.buildViewModel(context || {});
    render(viewModel);
  }

  function render(model) {
    const state = model?.state || "error";
    ui.missing.hidden = state !== "missing_project";
    ui.error.hidden = state !== "error";
    ui.workflow.hidden = ["missing_project", "error"].includes(state);
    if (!model) return;
    ui.projectName.textContent = model.project?.title || "Проект";
    ui.analysisLink.href = model.links?.analysis || "/pattern-analysis";
    ui.errorAnalysis.href = model.links?.analysis || "/pattern-analysis";
    if (ui.executableInputLink) ui.executableInputLink.href = `/pattern-technology-review?project=${encodeURIComponent(projectId)}`;
    if (state === "missing_project") return;
    if (state === "error") {
      ui.error.dataset.reason = model.error?.reason || "unknown";
      ui.errorTitle.textContent = model.heading;
      ui.errorMessage.textContent = model.lead;
      ui.retry.hidden = !canPrepareDraft();
      return;
    }
    ui.loading.hidden = state !== "loading";
    ui.content.hidden = state !== "ready";
    if (state === "loading") return;
    renderSummary(model); renderHandoff(model.handoff); renderBinding(model.binding); renderPlanStatus(model.technologyPlan); renderConstruction(model.construction); renderParts(model.parts); renderSequence(model.sequence); renderAssembly(model.assembly);
    renderConflicts(model.conflicts); renderAlternatives(model.alternatives); renderQuestion(model.nextQuestion); renderCorrectionFields(model.correctionFields);
    renderSources(model.sources); renderNext(model); renderReadiness(model); setInteractive(busy);
  }

  function renderSummary(model) {
    ui.summaryText.textContent = model.summary.text;
    ui.summaryStatus.textContent = model.summary.statusLabel;
    ui.summaryStatus.dataset.status = model.summary.status;
    ui.statusList.replaceChildren(...model.statuses.map((status) => {
      const item = document.createElement("li"); item.dataset.status = status.key; item.textContent = status.label; return item;
    }));
  }

  function renderHandoff(handoff) {
    renderDefinitionRows(ui.sourceEvidence, ui.sourceEvidenceEmpty, handoff?.source || []);
    renderDefinitionRows(ui.adaptationProfile, ui.adaptationProfileEmpty, handoff?.adaptation || []);
  }

  function renderBinding(binding) {
    if (!ui.binding) return;
    const fields = [
      binding?.stage20Revision && `Stage 20 revision ${binding.stage20Revision}`,
      binding?.inputContractVersion && `contract ${binding.inputContractVersion}`,
      binding?.sourceReviewId && `Stage 19 review ${binding.sourceReviewId}`,
      binding?.sourceReviewRevision && `revision ${binding.sourceReviewRevision}`,
      binding?.resultIdentity && `result ${binding.resultIdentity}`,
      binding?.sourceProjectionFingerprint && `projection ${binding.sourceProjectionFingerprint}`,
      binding?.draftRecordCount && `draft records ${binding.draftRecordCount}`,
    ].filter(Boolean);
    ui.binding.textContent = fields.join(" · ");
    ui.binding.hidden = fields.length === 0;
  }

  function renderPlanStatus(plan) {
    if (!plan || !ui.planStatus) return;
    ui.planStatus.hidden = false;
    ui.planStatusTitle.textContent = plan.built ? "Структурные разделы плана заполнены" : "Технологический план ещё не построен";
    ui.planStatusMessage.textContent = plan.message;
    const labels = { components: "Компоненты", operations: "Операции", rows: "Ряды", finishing: "Отделка" };
    ui.planStatusCounts.replaceChildren(...Object.entries(plan.counts || {}).flatMap(([key, value]) => {
      const term = document.createElement("dt"); term.textContent = labels[key] || key;
      const description = document.createElement("dd"); description.textContent = String(value);
      return [term, description];
    }));
  }

  function renderDefinitionRows(container, empty, rows) {
    container.replaceChildren(...rows.flatMap((row) => {
      const term = document.createElement("dt"); term.textContent = row.label;
      const description = document.createElement("dd"); description.textContent = row.value;
      return [term, description];
    }));
    empty.hidden = rows.length > 0;
  }

  function renderConstruction(items) {
    ui.construction.replaceChildren(...items.map((item) => {
      const row = document.createElement("div"); const term = document.createElement("dt"); const detail = document.createElement("dd");
      term.textContent = item.label; detail.textContent = item.value; detail.append(statusNode(item)); row.append(term, detail); return row;
    }));
    ui.constructionEmpty.hidden = items.length > 0;
  }

  function renderParts(items) {
    ui.parts.replaceChildren(...items.map((item) => {
      const row = document.createElement("li"); const title = document.createElement("strong"); const meta = document.createElement("span");
      title.textContent = item.displayName; meta.className = "technology-part-meta";
      meta.textContent = [item.direction, item.mode, item.relation, item.statusLabel].filter(Boolean).join(" · "); row.append(title, meta); return row;
    }));
    ui.partsEmpty.hidden = items.length > 0;
  }

  function renderSequence(items) {
    ui.sequence.replaceChildren(...items.map((item) => {
      const row = document.createElement("li"); const body = document.createElement("div"); const title = document.createElement("strong"); const status = statusNode(item);
      title.textContent = item.label; body.append(title); if (item.part) { const part = document.createElement("span"); part.className = "technology-part-meta"; part.textContent = item.part; body.append(part); } body.append(status); row.append(body); return row;
    }));
    ui.sequenceEmpty.hidden = items.length > 0;
  }

  function renderAssembly(items) {
    ui.assembly.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.label; row.append(statusNode(item)); return row; }));
    ui.assemblyEmpty.hidden = items.length > 0;
  }

  function statusNode(item) { const status = document.createElement("span"); status.className = "technology-item-status"; status.textContent = item.statusLabel; return status; }

  function renderConflicts(items) {
    ui.conflictsCard.hidden = items.length === 0;
    ui.conflicts.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.options.length ? `${item.message} ${item.options.join(" / ")}` : item.message; return row; }));
  }

  function renderAlternatives(items) {
    ui.alternativesCard.hidden = items.length === 0;
    ui.alternatives.replaceChildren(...items.map((item) => {
      const article = document.createElement("article"); article.className = "technology-alternative"; const title = document.createElement("h3"); title.textContent = item.label; article.append(title);
      const notes = [item.change, item.benefit && `Плюс: ${item.benefit}`, item.limitation && `Ограничение: ${item.limitation}`, item.recalculation && "Потребуется новый расчёт"].filter(Boolean);
      notes.forEach((note) => { const paragraph = document.createElement("p"); paragraph.textContent = note; article.append(paragraph); }); return article;
    }));
  }

  function renderQuestion(question) {
    ui.questionCard.hidden = !question;
    ui.questionError.textContent = "";
    if (!question) return;
    ui.questionTitle.textContent = question.text;
    const options = question.options.length ? question.options : ["Подтвердить", "Нужно изменить"];
    ui.questionOptions.replaceChildren(...options.map((value, index) => {
      const label = document.createElement("label"); label.className = "technology-option"; const input = document.createElement("input"); const text = document.createElement("span");
      input.type = "radio"; input.name = "technology-question-answer"; input.value = value; input.required = true; input.checked = index === 0 && options.length === 1; text.textContent = value; label.append(input, text); return label;
    }));
  }

  function renderCorrectionFields(fields) {
    const selected = ui.correctionField.value;
    ui.correctionField.replaceChildren(...fields.map((item) => { const option = document.createElement("option"); option.value = item.field; option.textContent = item.label; return option; }));
    if (fields.some((item) => item.field === selected)) ui.correctionField.value = selected;
    document.querySelectorAll("[data-correction-trigger]").forEach((button) => { button.hidden = !fields.some((item) => item.field === button.dataset.correctionTrigger); });
  }

  function renderSources(items) { ui.sources.replaceChildren(...items.map((item) => { const row = document.createElement("li"); row.textContent = item.label; return row; })); }

  function renderNext(model) { ui.nextDescription.textContent = model.nextStep.description; }

  function renderReadiness(model) {
    ui.continueButton.disabled = !model.continueAction.enabled || busy;
    ui.continueButton.textContent = model.continueAction.label;
    ui.confirmCopy.textContent = model.continueAction.enabled ? "Технологический план можно подтвердить и перейти к следующему практическому шагу." : "Проверь обязательный вопрос и несовместимые варианты перед подтверждением.";
    ui.readinessReasons.replaceChildren(...model.readiness.reasons.map((reason) => { const row = document.createElement("li"); row.textContent = reason; return row; }));
  }

  async function saveAnswer(event) {
    event.preventDefault();
    if (busy || !viewModel.nextQuestion) return;
    const selected = ui.questionForm.elements.namedItem("technology-question-answer")?.value || "";
    if (!selected) { ui.questionError.textContent = "Выбери один вариант."; return; }
    if (selected === "Нужно изменить") { openCorrection(fieldForQuestion(viewModel.nextQuestion), ui.questionSave); return; }
    await runBusy(async () => {
      const question = viewModel.nextQuestion;
      const target = context.review?.reviewState?.targets?.find((item) => item.id === question.targetId);
      if (target && reviewApi?.decideForProject) {
        const selectedValue = (target.conflictValues || []).length ? selected : undefined;
        await reviewApi.decideForProject(repository, projectId, target.id, "accepted", { selectedValue });
      }
      await saveExperience(experience.recordAnswer(context.saved, question, selected));
      await loadContext(); renderCurrent();
      ui.live.textContent = "Решение сохранено. Показан следующий вопрос.";
      (ui.questionCard.hidden ? ui.summaryTitle : ui.questionTitle).focus?.();
    }, "Не удалось сохранить решение.");
  }

  function openCorrection(field, trigger) {
    correctionReturnFocus = trigger || document.activeElement;
    if (field && [...ui.correctionField.options].some((option) => option.value === field)) ui.correctionField.value = field;
    ui.correctionValue.value = correctionValue(ui.correctionField.value);
    ui.correctionWarning.hidden = !viewModel.warning;
    if (viewModel.warning) ui.correctionWarning.textContent = viewModel.warning;
    ui.correctionError.textContent = ""; ui.correctionCard.hidden = false; ui.correctionField.focus();
    ui.correctionCard.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function cancelCorrection() { ui.correctionCard.hidden = true; ui.correctionError.textContent = ""; correctionReturnFocus?.focus?.(); }

  async function saveCorrection(event) {
    event.preventDefault();
    const field = ui.correctionField.value; const value = ui.correctionValue.value.trim();
    if (!value) { ui.correctionError.textContent = "Напиши, как будет верно."; return; }
    await runBusy(async () => {
      const target = correctionTarget(field);
      if (target && context.review?.status === "confirmed" && reviewApi.reopenForProject) await reviewApi.reopenForProject(repository, projectId);
      if (target && reviewApi?.correctForProject) await reviewApi.correctForProject(repository, projectId, { targetId: target.id, type: correctionType(target, field), correctedValue: correctionPayload(target, field, value) });
      await saveExperience(experience.recordCorrection(context.saved, field, value));
      await loadContext(); renderCurrent(); cancelCorrection();
      ui.live.textContent = "Исправление сохранено как решение пользователя."; ui.summaryTitle.focus?.();
    }, "Не удалось сохранить исправление.");
  }

  function correctionTarget(field) {
    const targets = context.review?.reviewState?.targets || [];
    const categories = { construction: ["construction", "product"], direction: ["construction"], knittingMode: ["construction"], parts: ["components", "sections"], sequence: ["operations", "rowInstructions"], assembly: ["finishing", "operations"], preference: ["product", "construction"] }[field] || [];
    return targets.find((target) => categories.includes(target.category) && (target.allowedCorrections || []).includes("user_comment")) || null;
  }

  function correctionType(target, field) {
    const preferred = { parts: "component_name", sequence: "user_comment", assembly: "user_comment" }[field];
    return preferred && target.allowedCorrections.includes(preferred) ? preferred : "user_comment";
  }

  function correctionPayload(target, field, value) { return correctionType(target, field) === "component_name" ? value.split(/[,;\n]/)[0].trim() : value; }
  function fieldForQuestion(question) { return ({ components: "parts", sections: "parts", operations: "sequence", finishing: "assembly", construction: "construction" })[question.field] || "preference"; }
  function correctionValue(field) { return context.saved?.corrections?.find((item) => item.field === field)?.value || ""; }

  async function saveExperience(saved) {
    const draftInput = context.project?.draft_input && typeof context.project.draft_input === "object" ? context.project.draft_input : {};
    await repository.updateProject(projectId, { draft_input: { ...draftInput, pattern_technology_experience: saved } });
  }

  async function confirmAndContinue() {
    if (busy || !viewModel.continueAction.enabled) return;
    await runBusy(async () => {
      let inspected = await reviewApi.ensureForProject(repository, projectId);
      if (inspected.review?.status !== "confirmed") {
        if (!inspected.review?.validation?.canConfirm) inspected = await reviewApi.validateForProject(repository, projectId);
        if (!inspected.review?.validation?.canConfirm) throw new Error("Сначала заверши обязательные решения.");
        inspected = await reviewApi.confirmForProject(repository, projectId);
      }
      if (inspected.review?.status !== "confirmed") throw new Error("Не удалось подтвердить способ вязания.");
      globalObject.location.assign(viewModel.continueAction.href);
    }, "Не удалось подтвердить способ вязания.");
  }

  async function runBusy(operation, fallback) {
    if (busy) return;
    busy = true; setInteractive(true); ui.operationError.textContent = "";
    try { await operation(); }
    catch (error) { ui.operationError.textContent = error?.userMessage || error?.message || fallback; if (context) { await loadContext().catch(() => {}); renderCurrent(); } }
    finally { busy = false; setInteractive(false); if (viewModel?.continueAction) ui.continueButton.disabled = !viewModel.continueAction.enabled; }
  }

  function setInteractive(disabled) {
    [ui.questionSave, ui.correctionSave, ui.correctionCancel, ui.retry]
      .forEach((control) => { control.disabled = disabled; });
    ui.continueButton.disabled = disabled || !viewModel?.continueAction?.enabled;
  }
  function showLoading() { ui.missing.hidden = true; ui.error.hidden = true; ui.workflow.hidden = false; ui.loading.hidden = false; ui.content.hidden = true; }
  function reducedMotion() { return globalObject.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true; }
  function renderStorageError(error) { const model = experience?.buildViewModel({ project: context?.project || { project_id: projectId }, storageError: true }) || null; render(model); if (model) ui.errorMessage.textContent = error?.userMessage || model.lead; }
})(window);
