"use strict";

(function initializePatternTechnologyReviewPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const reviewApi = globalObject.YarnAIPatternTechnologyReview;
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("pattern-technology-review-fatal"), fatalMessage: byId("pattern-technology-review-fatal-message"),
    workflow: byId("pattern-technology-review-workflow"), title: byId("pattern-technology-review-project-title"),
    status: byId("pattern-technology-review-status"), source: byId("pattern-technology-review-source"),
    sourceRevision: byId("pattern-technology-review-source-revision"), progress: byId("pattern-technology-review-progress"),
    criticalCount: byId("pattern-technology-review-critical-count"), start: byId("pattern-technology-review-start"),
    validate: byId("pattern-technology-review-validate"), confirm: byId("pattern-technology-review-confirm"),
    reopen: byId("pattern-technology-review-reopen"), newReview: byId("pattern-technology-review-new"),
    back: byId("pattern-technology-review-back"), navBack: byId("pattern-technology-review-nav-back"), navPlan: byId("pattern-technology-review-nav-plan"),
    error: byId("pattern-technology-review-operation-error"), summary: byId("pattern-technology-review-summary"),
    summaryValues: byId("pattern-technology-review-summary-values"), items: byId("pattern-technology-review-items"),
    validation: byId("pattern-technology-review-validation"), validationCritical: byId("pattern-technology-review-validation-critical"),
    validationNonCritical: byId("pattern-technology-review-validation-noncritical"), validationInformational: byId("pattern-technology-review-validation-informational"),
    confirmed: byId("pattern-technology-review-confirmed"), confirmedSummary: byId("pattern-technology-review-confirmed-summary"),
    provenance: byId("pattern-technology-review-provenance"), dialog: byId("pattern-technology-review-correction-dialog"),
    correctionForm: byId("pattern-technology-review-correction-form"), correctionTitle: byId("pattern-technology-review-correction-title"),
    correctionOriginal: byId("pattern-technology-review-correction-original"), correctionType: byId("pattern-technology-review-correction-type"),
    correctionValue: byId("pattern-technology-review-correction-value"), correctionUnit: byId("pattern-technology-review-correction-unit"),
    correctionError: byId("pattern-technology-review-correction-error"), correctionCancel: byId("pattern-technology-review-correction-cancel"),
  };
  const containers = {
    overview: byId("pattern-technology-review-overview"), materials: byId("pattern-technology-review-materials"),
    components: byId("pattern-technology-review-components"), sections: byId("pattern-technology-review-sections"),
    operations: byId("pattern-technology-review-operations"), rows: byId("pattern-technology-review-rows"),
    repeats: byId("pattern-technology-review-repeats"), stitches: byId("pattern-technology-review-stitches"),
    finishing: byId("pattern-technology-review-finishing"), abbreviations: byId("pattern-technology-review-abbreviations"),
    assumptions: byId("pattern-technology-review-assumptions"), missing: byId("pattern-technology-review-missing"),
    conflicts: byId("pattern-technology-review-conflicts"), warnings: byId("pattern-technology-review-warnings"),
  };
  const categoryGroup = Object.freeze({
    craft: "overview", product: "overview", construction: "overview", sizes: "overview", gauge: "materials",
    materials: "materials", yarn: "materials", tools: "materials", components: "components", sections: "sections",
    operations: "operations", rowInstructions: "rows", repeats: "repeats", stitchCountChanges: "stitches",
    finishing: "finishing", abbreviations: "abbreviations", assumptions: "assumptions",
    missing_information: "missing", conflict: "conflicts", warning: "warnings",
  });
  const correctionLabels = Object.freeze({
    product_name: "Название изделия", component_name: "Название компонента", section_name: "Название секции",
    size: "Размер", unit: "Единица измерения", stitch_count: "Количество петель", row_count: "Количество рядов",
    gauge: "Плотность", tool_number: "Номер инструмента", yarn_weight: "Толщина пряжи", yarn_category: "Категория пряжи",
    repeat_count: "Количество повторов", abbreviation_definition: "Расшифровка сокращения",
    component_assignment: "Назначение компонента", section_order: "Порядок секции", range: "Диапазон", user_comment: "Комментарий",
  });
  let repository = null; let projectId = null; let inspected = null; let busy = false; let correctionTargetId = null;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть проверку технологии."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderBlocked("Откройте проверку из валидного Stage 20.");
    if (!system?.isUuidv7(projectId) || !reviewApi) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository(); await repository.initialize();
    const backUrl = `/pattern-technology-draft?project=${encodeURIComponent(projectId)}`;
    ui.back.href = backUrl; ui.navBack.href = backUrl;
    ui.navPlan.href = `/pattern-execution-plan?project=${encodeURIComponent(projectId)}`;
    ui.start.addEventListener("click", () => runOperation(() => reviewApi.startForProject(repository, projectId)));
    ui.validate.addEventListener("click", () => runOperation(() => reviewApi.validateForProject(repository, projectId)));
    ui.confirm.addEventListener("click", () => runOperation(() => reviewApi.confirmForProject(repository, projectId)));
    ui.reopen.addEventListener("click", () => runOperation(() => reviewApi.reopenForProject(repository, projectId)));
    ui.newReview.addEventListener("click", () => runOperation(() => reviewApi.newReviewForProject(repository, projectId)));
    ui.correctionForm.addEventListener("submit", saveCorrection);
    ui.correctionCancel.addEventListener("click", () => ui.dialog.close());
    inspected = await reviewApi.ensureForProject(repository, projectId);
    render();
  }

  function render() {
    reset();
    ui.title.textContent = inspected?.project?.title || "Проверка технологии";
    if (!inspected || ["missing_project", "draft_missing"].includes(inspected.state)) return renderBlocked("Валидный черновик Stage 20 не найден.");
    if (["source_invalid", "draft_stale"].includes(inspected.state) && !inspected.review) return renderBlocked(`Stage 20 недоступен: ${inspected.reasonCode || "SOURCE_DRAFT_STATUS_INVALID"}.`);
    if (inspected.state === "corrupted") return showFatal(`Запись Stage 21 повреждена: ${inspected.reasonCode}.`);
    const state = inspected.review;
    if (!state) return renderBlocked("Подготовка review не завершена.");
    const liveValidation = reviewApi.validateReviewState(state, inspected.draft);
    const validation = state.status === "stale" ? liveValidation : state.validation;
    const validConfirmed = state.status === "confirmed" && state.confirmedSnapshot && !liveValidation.critical.length;
    ui.source.textContent = `${state.sourceDraftId}${state.sourceDraftProgressId ? ` / ${state.sourceDraftProgressId}` : ""}`;
    ui.sourceRevision.textContent = String(state.sourceDraftRevision);
    const completed = state.decisions.filter((entry) => entry.decision !== "pending").length;
    ui.progress.textContent = `${completed} из ${state.decisions.length}`;
    ui.criticalCount.textContent = String(validation.critical?.length || 0);
    ui.status.textContent = statusLabel(validConfirmed ? "confirmed" : state.status);
    ui.status.dataset.status = validConfirmed ? "confirmed" : state.status;
    ui.start.hidden = state.status !== "waiting";
    ui.validate.hidden = ["waiting", "confirmed", "stale", "failed"].includes(state.status);
    ui.confirm.hidden = ["waiting", "confirmed", "stale", "failed"].includes(state.status);
    ui.confirm.disabled = busy || Boolean(validation.critical?.length);
    ui.reopen.hidden = !validConfirmed;
    ui.newReview.hidden = state.status !== "stale";
    setDisabled(busy);
    renderSummary(state.immutableSourceSnapshot.structuredDraft);
    renderTargets(state, validation);
    renderProvenance(state.immutableSourceSnapshot.provenance);
    renderValidation(validation);
    if (validConfirmed) {
      ui.confirmed.hidden = false;
      ui.confirmedSummary.textContent = `Snapshot ${state.confirmedSnapshotFingerprint}; подтверждён ${state.confirmedAt}; review revision ${state.confirmedSnapshot.reviewRevision}.`;
    }
  }

  function renderSummary(draft) {
    ui.summary.hidden = false;
    const entries = [
      ["Изделие", draft.product?.value ?? draft.product?.type], ["Конструкция", draft.construction],
      ["Размеры", draft.sizes], ["Материалы", draft.materials], ["Пряжа", draft.yarn],
      ["Инструменты", draft.tools], ["Плотность", draft.gauge],
    ];
    const nodes = entries.map(([label, value]) => {
      const wrapper = document.createElement("div"); const term = document.createElement("dt"); const description = document.createElement("dd");
      term.textContent = label; description.textContent = humanValue(value); wrapper.append(term, description); return wrapper;
    });
    ui.summaryValues.replaceChildren(...nodes);
  }

  function renderTargets(state, validation) {
    ui.items.hidden = false;
    for (const container of Object.values(containers)) container.replaceChildren();
    for (const target of state.reviewState.targets) {
      const group = categoryGroup[target.category] || "warnings";
      containers[group].append(reviewItemNode(state, target, validation));
    }
    for (const [group, container] of Object.entries(containers)) if (!container.childElementCount) container.append(emptyNode(emptyText(group)));
  }

  function reviewItemNode(state, target, validation) {
    const decision = state.decisions.find((entry) => entry.targetId === target.id);
    const corrections = state.corrections.filter((entry) => entry.targetId === target.id);
    const note = state.userNotes.find((entry) => entry.targetId === target.id);
    const article = document.createElement("article"); article.className = "review-item"; article.dataset.decision = decision.decision; article.dataset.blocking = String(Boolean(target.blocking));
    const heading = document.createElement("h3"); heading.textContent = `${target.code || target.category}: ${target.id}`; article.append(heading);
    const original = document.createElement("p"); original.className = "review-value"; original.textContent = `Исходное значение: ${humanValue(target.originalValue)}`; article.append(original);
    const provenance = document.createElement("p"); provenance.className = "review-provenance"; provenance.textContent = `Provenance: ${target.provenanceRefs?.length ? target.provenanceRefs.join(", ") : "структурный элемент Stage 20"}`; article.append(provenance);
    const current = document.createElement("p"); current.className = "review-decision"; current.textContent = `Решение: ${decision.decision}`; article.append(current);
    for (const correction of corrections) {
      const corrected = document.createElement("p"); corrected.className = "review-value"; corrected.textContent = `Исправлено (${correctionLabels[correction.type] || correction.type}): ${humanValue(correction.correctedValue)}${correction.unit ? ` ${correction.unit}` : ""}. Original: ${humanValue(correction.originalValue)}.`; article.append(corrected);
      const remove = actionButton("Удалить исправление", () => runOperation(() => reviewApi.removeCorrectionForProject(repository, projectId, correction.correctionId))); article.append(remove);
    }
    const targetErrors = [...(validation.critical || []), ...(validation.nonCritical || [])].filter((entry) => entry.targetId === target.id);
    for (const validationIssue of targetErrors) { const error = document.createElement("p"); error.className = "form-error"; error.textContent = `Validation: ${validationIssue.code}`; article.append(error); }
    if (target.category === "conflict" && target.conflictValues?.length) article.append(conflictSelect(target, decision));
    const actions = document.createElement("div"); actions.className = "review-item-actions";
    actions.append(
      actionButton("Принять", () => decide(target, "accepted", article)),
      actionButton("Исправить", () => openCorrection(target)),
      actionButton("Отклонить", () => decide(target, "rejected", article)),
      actionButton("Оставить нерешённым", () => decide(target, "unresolved", article)),
    );
    article.append(actions);
    if (target.targetKind === "finding") {
      const label = document.createElement("label"); label.textContent = "Комментарий к проблеме"; label.htmlFor = `note-${safeId(target.id)}`;
      const textarea = document.createElement("textarea"); textarea.id = label.htmlFor; textarea.className = "review-note"; textarea.maxLength = 500; textarea.value = note?.text || decision.comment || "";
      const save = actionButton("Сохранить комментарий", () => saveNote(target.id, textarea.value));
      article.append(label, textarea, save);
    }
    return article;
  }

  function conflictSelect(target, decision) {
    const select = document.createElement("select"); select.className = "review-conflict-select"; select.setAttribute("aria-label", `Выбор значения для ${target.id}`);
    target.conflictValues.forEach((value, index) => { const option = document.createElement("option"); option.value = JSON.stringify(value); option.textContent = `Вариант ${index + 1}: ${humanValue(value)}`; if (decision.selectedValue !== null && JSON.stringify(decision.selectedValue) === option.value) option.selected = true; select.append(option); });
    return select;
  }

  function decide(target, decision, article) {
    const select = article.querySelector(".review-conflict-select");
    let selectedValue;
    if (select && decision === "accepted") { try { selectedValue = JSON.parse(select.value); } catch { selectedValue = select.value; } }
    return runOperation(() => reviewApi.decideForProject(repository, projectId, target.id, decision, { selectedValue }));
  }

  function openCorrection(target) {
    correctionTargetId = target.id; ui.correctionTitle.textContent = `Исправить: ${target.id}`; ui.correctionOriginal.textContent = `Исходное значение: ${humanValue(target.originalValue)}`;
    ui.correctionType.replaceChildren(...target.allowedCorrections.map((type) => { const option = document.createElement("option"); option.value = type; option.textContent = correctionLabels[type] || type; return option; }));
    ui.correctionValue.value = ""; ui.correctionUnit.value = target.unit || ""; ui.correctionError.textContent = ""; ui.dialog.showModal(); ui.correctionValue.focus();
  }

  async function saveCorrection(event) {
    event.preventDefault();
    const type = ui.correctionType.value; const raw = ui.correctionValue.value.trim();
    try {
      const value = parseCorrection(type, raw);
      ui.dialog.close();
      await runOperation(() => reviewApi.correctForProject(repository, projectId, { targetId: correctionTargetId, type, correctedValue: value, unit: ui.correctionUnit.value.trim() || null }));
    } catch (error) { ui.correctionError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Проверьте исправленное значение."}`; }
  }

  function parseCorrection(type, raw) {
    if (["stitch_count", "row_count", "repeat_count", "section_order", "tool_number", "yarn_weight"].includes(type)) return Number(raw);
    if (type === "range") { const parts = raw.split(/\s*[-–:]\s*/).map(Number); return { start: parts[0], end: parts[1] }; }
    if (type === "gauge") { const parts = raw.split(/\s*\/\s*/).map(Number); return { value: parts[0], per: parts[1] }; }
    if (type === "component_assignment") return { componentId: raw };
    return raw;
  }

  async function saveNote(targetId, note) {
    if (!note.trim()) return;
    await runOperation(async () => {
      const current = await reviewApi.ensureForProject(repository, projectId);
      const next = reviewApi.addUserNote(current.review, targetId, note);
      await repository.updatePatternTechnologyReview(projectId, current.calculation.calculation_id, next, { operationKind: "PATTERN_TECHNOLOGY_REVIEW_NOTE_CHANGED", projectStage: `pattern_technology_review_${next.status}` });
      return reviewApi.inspectAggregate(await repository.getProject(projectId));
    });
  }

  function renderProvenance(entries) {
    ui.provenance.replaceChildren(...entries.map((entry) => { const node = document.createElement("p"); node.textContent = `${entry.id}: Stage 19 item ${entry.sourceReviewedItemId}; source ${entry.sourceSemanticAnalysisId}; evidence ${entry.evidenceFingerprint}.`; return node; }));
    if (!entries.length) ui.provenance.append(emptyNode("Provenance отсутствует."));
  }

  function renderValidation(validation) {
    ui.validation.hidden = false;
    renderIssueList(ui.validationCritical, validation.critical || [], "Критических проблем нет.");
    renderIssueList(ui.validationNonCritical, validation.nonCritical || [], "Некритических замечаний нет.");
    renderIssueList(ui.validationInformational, validation.informational || [], "Информационных сообщений нет.");
  }

  function renderIssueList(container, issues, empty) {
    const nodes = issues.map((entry) => { const node = document.createElement("li"); node.textContent = `${entry.code}${entry.targetId ? ` — ${entry.targetId}` : ""}`; return node; });
    if (!nodes.length) { const node = document.createElement("li"); node.textContent = empty; nodes.push(node); }
    container.replaceChildren(...nodes);
  }

  async function runOperation(operation) {
    if (busy) return;
    busy = true; ui.error.textContent = ""; setDisabled(true);
    try { inspected = await operation(); }
    catch (error) { ui.error.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`; inspected = await reviewApi.ensureForProject(repository, projectId); }
    finally { busy = false; render(); }
  }

  function actionButton(label, handler) { const button = document.createElement("button"); button.type = "button"; button.className = "link-button"; button.textContent = label; button.disabled = busy; button.addEventListener("click", handler); return button; }
  function setDisabled(value) { for (const button of [ui.start, ui.validate, ui.confirm, ui.reopen, ui.newReview]) button.disabled = value || button === ui.confirm && button.disabled; }
  function reset() { ui.fatal.hidden = true; ui.workflow.hidden = false; ui.summary.hidden = true; ui.items.hidden = true; ui.validation.hidden = true; ui.confirmed.hidden = true; ui.start.hidden = true; ui.validate.hidden = true; ui.confirm.hidden = true; ui.reopen.hidden = true; ui.newReview.hidden = true; }
  function renderBlocked(message) { reset(); ui.status.textContent = "Недоступно"; ui.status.dataset.status = "failed"; ui.source.textContent = message; ui.sourceRevision.textContent = "—"; ui.progress.textContent = "—"; ui.criticalCount.textContent = "—"; }
  function showFatal(message) { reset(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function statusLabel(status) { return ({ waiting: "Ожидает начала", reviewing: "Проверяется", needs_attention: "Требует внимания", confirmed: "Подтверждено", stale: "Источник устарел", failed: "Ошибка" })[status] || status; }
  function emptyNode(message) { const node = document.createElement("p"); node.textContent = message; return node; }
  function emptyText(group) { return ({ components: "Компоненты отсутствуют.", sections: "Секции отсутствуют.", operations: "Операции отсутствуют.", rows: "Ряды отсутствуют.", repeats: "Повторы отсутствуют.", stitches: "Изменения петель отсутствуют.", finishing: "Сборка и отделка отсутствуют.", abbreviations: "Сокращения отсутствуют.", assumptions: "Допущения отсутствуют.", missing: "Отсутствующие сведения не отмечены.", conflicts: "Конфликты не отмечены.", warnings: "Предупреждения отсутствуют." })[group] || "Нет элементов."; }
  function humanValue(value) { if (value === null || value === undefined || value === "") return "не указано"; if (Array.isArray(value)) return value.length ? value.map(humanValue).join(", ") : "нет"; if (typeof value === "object") return Object.keys(value).sort().filter((key) => !["evidence", "confidence", "provenanceRefs"].includes(key)).map((key) => `${key}: ${humanValue(value[key])}`).join("; "); return String(value); }
  function safeId(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "-"); }
})(window);
