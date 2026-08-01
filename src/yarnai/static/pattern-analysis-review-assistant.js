"use strict";

(function initializePatternAnalysisReviewPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const reviewApi = globalObject.YarnAIPatternAnalysisReview;
  const get = (selector) => document.querySelector(selector);
  const ui = {
    fatal: get("#pattern-analysis-review-fatal"), fatalMessage: get("#pattern-analysis-review-fatal-message"), workflow: get("#pattern-analysis-review-workflow"),
    title: get("#pattern-analysis-review-project-title"), status: get("#pattern-analysis-review-status"), summary: get("#pattern-analysis-review-summary"), source: get("#pattern-analysis-review-source"), freshness: get("#pattern-analysis-review-freshness"),
    save: get("#pattern-analysis-review-save"), validate: get("#pattern-analysis-review-validate"), rebase: get("#pattern-analysis-review-rebase"), confirm: get("#pattern-analysis-review-confirm"), technology: get("#pattern-analysis-review-technology"), back: get("#pattern-analysis-review-back"), operationError: get("#pattern-analysis-review-operation-error"),
    validation: get("#pattern-analysis-review-validation"), counts: get("#pattern-analysis-review-counts"), errors: get("#pattern-analysis-review-errors"), warnings: get("#pattern-analysis-review-warnings"),
    conflicts: get("#pattern-analysis-review-conflicts"), conflictList: get("#pattern-analysis-review-conflict-list"), categories: get("#pattern-analysis-review-categories"), confirmed: get("#pattern-analysis-review-confirmed"),
  };
  const CATEGORY_LABELS = Object.freeze({ craft: "Тип рукоделия", product: "Изделие", construction: "Конструкция", sizes: "Размеры", gauge: "Плотность", yarn: "Пряжа", tools: "Инструменты", abbreviations: "Сокращения", sections: "Секции", rows: "Ряды", repeats: "Повторы", counts: "Counts" });
  const ISSUE_MESSAGES = Object.freeze({
    REVIEW_STRUCTURE_INVALID: "Структура записи проверки повреждена.", REVIEW_DATA_STRUCTURE_INVALID: "Рабочие данные проверки повреждены.", REVIEW_ORIGINAL_SNAPSHOT_MUTATED: "Исходный snapshot был изменён.", REVIEW_PROJECT_MISMATCH: "Рабочие данные относятся к другому проекту.", REVIEW_ITEM_ID_DUPLICATE: "Обнаружен повторяющийся itemId.", REVIEW_ITEM_PROJECT_MISMATCH: "Элемент относится к другому проекту.", REVIEW_DECISION_INVALID: "У элемента недопустимое решение.", REVIEW_SEVERITY_INVALID: "У элемента недопустимая важность.", REVIEW_UNIT_INVALID: "Единица измерения не поддерживается.", REVIEW_NUMBER_NOT_FINITE: "Числовое значение не является конечным.", REVIEW_NUMBER_NOT_POSITIVE: "Размер, плотность или инструмент должны иметь положительное значение.", REVIEW_REQUIRED_TEXT_EMPTY: "Обязательное текстовое значение пусто.", REVIEW_ACCEPTED_VALUE_CHANGED: "Принятое значение отличается от исходного; выберите «Исправлено».", REVIEW_CORRECTION_UNCHANGED: "Исправленное значение совпадает с исходным.", REVIEW_REQUIRED_VALUE_REJECTED: "Отклонено обязательное для безопасной интерпретации значение.", REVIEW_CONFLICT_ITEM_MISSING: "В конфликте отсутствует один из вариантов.", REVIEW_CONFLICT_SELECTION_INVALID: "Выбранный вариант не входит в конфликт.", REVIEW_CONFLICT_RESOLUTION_MISSING: "Для конфликта не сохранено решение.", REVIEW_CONFLICT_UNRESOLVED: "Конфликт ещё не разрешён.", REVIEW_SOURCE_REVISION_STALE: "Revision исходного анализа изменилась.", REVIEW_SOURCE_FINGERPRINT_STALE: "Fingerprint исходного анализа изменился.", REVIEW_UNRESOLVED_CRITICAL: "Критически важный пункт не решён.", REVIEW_UNRESOLVED_IMPORTANT: "Важный пункт оставлен нерешённым.", REVIEW_UNRESOLVED_INFORMATIONAL: "Информационный пункт оставлен нерешённым.", REVIEW_REBASE_AMBIGUOUS: "Решение не перенесено: точное сопоставление неоднозначно.", REVIEW_BUILD_INTERRUPTED: "Подготовка проверки была прервана.", REVIEW_REBASE_INTERRUPTED: "Обновление проверки было прервано.", REVIEW_CONFIRM_INTERRUPTED: "Подтверждение было прервано и требует повторной проверки.",
  });
  let repository = null; let projectId = null; let inspected = null; let localState = null; let busy = false; let saveTimer = null; let dirty = false;
  const pageSizes = new Map();

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть проверку результата."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderBlocked("Анализ материалов ещё не выполнен.", "Откройте Stage 19 из завершённого семантического анализа.");
    if (!system?.isUuidv7(projectId) || !reviewApi) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository(); await repository.initialize();
    ui.back.href = `/pattern-semantic-analysis?project=${encodeURIComponent(projectId)}`;
    ui.technology.href = `/pattern-technology-draft?project=${encodeURIComponent(projectId)}`;
    ui.save.addEventListener("click", flushSave);
    ui.validate.addEventListener("click", revalidate);
    ui.rebase.addEventListener("click", rebase);
    ui.confirm.addEventListener("click", confirm);
    inspected = await reviewApi.ensureForProject(repository, projectId);
    if (inspected.review?.status === "confirmed" && globalObject.YarnAIPatternTechnologyDraft?.ensureForProject) await globalObject.YarnAIPatternTechnologyDraft.ensureForProject(repository, projectId);
    localState = inspected.review ? structuredClone(inspected.review) : null;
    render();
  }

  function render() {
    resetPanels();
    ui.save.disabled = busy; ui.validate.disabled = busy; ui.rebase.disabled = busy;
    ui.title.textContent = inspected?.project?.title || "Проверка данных";
    if (!inspected) return renderBlocked("Анализ материалов ещё не выполнен.", "Проект не найден.");
    const blocked = {
      missing_project: ["Анализ материалов ещё не выполнен.", "Проект или активный расчёт не найден."],
      extraction_missing: ["Анализ материалов ещё не выполнен.", "Сначала завершите извлечение содержимого."],
      semantic_missing: ["Анализ материалов ещё не выполнен.", "Семантический анализ отсутствует."],
      semantic_waiting: ["Семантический анализ ожидает запуска.", "Запустите Stage 18 перед проверкой."],
      semantic_analyzing: ["Семантический анализ выполняется.", "Дождитесь завершения Stage 18."],
      semantic_failed: ["Семантический анализ завершился с ошибкой.", "Исправьте источник или повторите Stage 18."],
      semantic_invalid: ["Требуется внимание.", "Статус семантического анализа не позволяет начать проверку."],
      semantic_insufficient: ["Требуется внимание.", "Частичный анализ содержит критически недостаточно данных."],
    };
    if (blocked[inspected.state]) return renderBlocked(...blocked[inspected.state]);
    if (inspected.state === "corrupted") return showFatal("Запись повреждена. Вернитесь к семантическому анализу и проверьте источник.");
    if (!localState) return renderBlocked("Подготовка проверки.", "Создаём рабочую копию результатов Stage 18.");
    ui.source.textContent = `semantic analysis ${localState.sourceSemanticAnalysisId}, revision ${localState.sourceSemanticAnalysisRevision}`;
    ui.freshness.textContent = inspected.state === "stale" ? "Исходный анализ изменился" : "Источник актуален";
    if (inspected.state === "stale") {
      ui.status.textContent = "Требуется внимание.";
      ui.summary.textContent = "Исходный анализ изменился. Старые исправления сохранены отдельно и не будут смешаны с новыми данными без явного обновления.";
      ui.rebase.hidden = false; ui.validate.hidden = false; ui.confirm.hidden = true;
    } else if (localState.status === "confirmed") {
      ui.status.textContent = "Результат анализа подтверждён.";
      ui.summary.textContent = `Подтверждена revision ${localState.revision}.`;
      ui.confirmed.hidden = false;
      ui.technology.hidden = false;
    } else {
      const copyByStatus = { waiting: "Подготовка проверки.", reviewing: "Проверка данных.", needs_attention: "Требуется внимание.", ready_to_confirm: "Можно подтвердить.", failed: "Запись повреждена." };
      ui.status.textContent = copyByStatus[localState.status] || "Проверка данных.";
      ui.summary.textContent = `Элементов: ${localState.reviewedData?.items?.length || 0}. Revision проверки: ${localState.revision}.`;
      ui.save.hidden = !dirty; ui.validate.hidden = false; ui.confirm.hidden = !localState.validation?.canConfirm || dirty; ui.confirm.disabled = busy || !localState.validation?.canConfirm || dirty;
      renderReviewData();
    }
    renderValidation(localState.validation);
  }

  function renderBlocked(status, summary) {
    resetPanels(); ui.status.textContent = status; ui.summary.textContent = summary; ui.freshness.textContent = "Проверка недоступна";
  }

  function renderReviewData() {
    const items = localState.reviewedData?.items || [];
    const groups = localState.reviewedData?.conflictGroups || [];
    ui.categories.hidden = false;
    const byCategory = new Map();
    for (const item of items) { if (!byCategory.has(item.category)) byCategory.set(item.category, []); byCategory.get(item.category).push(item); }
    const categoryNodes = [];
    for (const [category, categoryItems] of byCategory) {
      const details = document.createElement("details"); details.className = "card review-category"; details.dataset.category = category;
      const summary = document.createElement("summary"); summary.textContent = `${CATEGORY_LABELS[category] || category} — ${categoryItems.length}`; details.append(summary);
      const body = document.createElement("div"); body.className = "review-category-body";
      const list = document.createElement("div"); list.className = "review-items"; body.append(list); details.append(body);
      details.addEventListener("toggle", () => { if (details.open && !list.childElementCount) renderCategoryPage(category, categoryItems, list); });
      categoryNodes.push(details);
    }
    ui.categories.replaceChildren(...categoryNodes);
    renderConflicts(groups);
  }

  function renderCategoryPage(category, items, container) {
    const limit = pageSizes.get(category) || 40;
    container.replaceChildren(...items.slice(0, limit).map(createItemNode));
    if (limit < items.length) {
      const more = document.createElement("button"); more.type = "button"; more.className = "link-button review-more"; more.textContent = `Показать ещё (${Math.min(40, items.length - limit)})`;
      more.addEventListener("click", () => { pageSizes.set(category, limit + 40); renderCategoryPage(category, items, container); });
      container.append(more);
    }
  }

  function createItemNode(item) {
    const article = document.createElement("article"); article.className = "review-item"; article.dataset.itemId = item.itemId;
    const head = document.createElement("div"); head.className = "review-item-head";
    const heading = document.createElement("h3"); heading.textContent = item.subtype || item.category;
    const badges = document.createElement("div"); badges.className = "review-badges";
    badges.append(badge(item.severity, `review-badge-${item.severity}`));
    if (item.confidence !== null) badges.append(badge(`confidence ${Math.round(item.confidence * 100)}%`));
    head.append(heading, badges); article.append(head);
    const originalLabel = document.createElement("strong"); originalLabel.textContent = "Исходное значение";
    const original = document.createElement("p"); original.className = "review-original"; original.textContent = valueText(item.originalValue); article.append(originalLabel, original);
    if (item.evidence?.length) { const evidenceLabel = document.createElement("strong"); evidenceLabel.textContent = "Evidence"; const evidence = document.createElement("p"); evidence.className = "review-evidence"; evidence.textContent = item.evidence.map((entry) => entry.text).filter(Boolean).join("\n"); article.append(evidenceLabel, evidence); }
    const valueField = field("Проверенное значение"); const input = document.createElement("textarea"); input.rows = 2; input.value = editableText(item.reviewedValue); input.disabled = busy; input.addEventListener("change", () => changeItem(item.itemId, { reviewedValue: parseEditedValue(item.originalValue, input.value), decision: sameValue(item.originalValue, parseEditedValue(item.originalValue, input.value)) ? item.decision : "corrected" })); valueField.append(input); article.append(valueField);
    const decisionField = field("Решение"); const select = document.createElement("select"); for (const [value, label] of [["unresolved", "Не решено"], ["accepted", "Принято"], ["corrected", "Исправлено"], ["rejected", "Отклонено"]]) { const option = document.createElement("option"); option.value = value; option.textContent = label; option.selected = item.decision === value; select.append(option); } select.disabled = busy; select.addEventListener("change", () => changeItem(item.itemId, { decision: select.value })); decisionField.append(select); article.append(decisionField);
    const notesField = field("Примечание"); const notes = document.createElement("textarea"); notes.rows = 2; notes.value = item.notes || ""; notes.disabled = busy; notes.addEventListener("change", () => changeItem(item.itemId, { notes: notes.value })); notesField.append(notes); article.append(notesField);
    return article;
  }

  function renderConflicts(groups) {
    ui.conflictList.replaceChildren(); ui.conflicts.hidden = !groups.length; if (!groups.length) return;
    const nodes = groups.map((group) => {
      const card = document.createElement("article"); card.className = "review-conflict";
      const heading = document.createElement("h3"); heading.textContent = `${CATEGORY_LABELS[group.category] || group.category}: ${group.reasonCode}`; card.append(heading, badge(group.severity, `review-badge-${group.severity}`));
      const options = document.createElement("div"); options.className = "review-conflict-options";
      for (const itemId of group.itemIds) { const item = localState.reviewedData.items.find((candidate) => candidate.itemId === itemId); const label = document.createElement("label"); const radio = document.createElement("input"); radio.type = "radio"; radio.name = group.conflictId; radio.checked = group.selectedItemId === itemId; radio.disabled = busy; radio.addEventListener("change", () => changeConflict(group.conflictId, { mode: "select", itemId })); const span = document.createElement("span"); span.textContent = valueText(item?.originalValue); label.append(radio, span); options.append(label); }
      const customLabel = document.createElement("label"); const custom = document.createElement("input"); custom.type = "text"; custom.value = group.customValue === null ? "" : editableText(group.customValue); custom.placeholder = "Исправленное значение"; custom.disabled = busy; const customButton = document.createElement("button"); customButton.type = "button"; customButton.className = "link-button"; customButton.textContent = "Использовать исправление"; customButton.disabled = busy; customButton.addEventListener("click", () => changeConflict(group.conflictId, { mode: "custom", value: custom.value })); customLabel.append(custom, customButton); options.append(customLabel);
      const reject = document.createElement("button"); reject.type = "button"; reject.className = "link-button"; reject.textContent = "Отклонить все варианты"; reject.disabled = busy; reject.addEventListener("click", () => changeConflict(group.conflictId, { mode: "reject_all" })); options.append(reject); card.append(options); return card;
    });
    ui.conflictList.replaceChildren(...nodes);
  }

  function changeItem(itemId, patch) { try { localState = reviewApi.updateItem(localState, itemId, patch); markDirty(); } catch (error) { ui.operationError.textContent = error.userMessage || "Не удалось изменить значение."; } }
  function changeConflict(conflictId, resolution) { try { localState = reviewApi.resolveConflict(localState, conflictId, resolution); markDirty(); render(); } catch (error) { ui.operationError.textContent = error.userMessage || "Не удалось разрешить конфликт."; } }
  function markDirty() { dirty = true; ui.save.hidden = false; ui.confirm.hidden = true; renderValidation(localState.validation); globalObject.clearTimeout(saveTimer); saveTimer = globalObject.setTimeout(flushSave, 650); }

  async function flushSave() {
    globalObject.clearTimeout(saveTimer); if (!dirty || busy) return; busy = true; setInteractiveDisabled(true); ui.operationError.textContent = "";
    try { inspected = await reviewApi.saveForProject(repository, projectId, localState); localState = structuredClone(inspected.review); dirty = false; }
    catch (error) { ui.operationError.textContent = error?.userMessage || "Не удалось сохранить изменения."; }
    finally { busy = false; render(); }
  }

  async function revalidate() { if (dirty) await flushSave(); await runOperation(async () => { const fresh = reviewApi.inspectAggregate(await repository.getProject(projectId)); const next = reviewApi.revalidateState(fresh.review, fresh.semantic); await repository.updatePatternAnalysisReview(projectId, fresh.calculation.calculation_id, next, { operationKind: "PATTERN_ANALYSIS_REVIEW_REVALIDATED", projectStage: `pattern_analysis_review_${next.status}` }); return reviewApi.inspectAggregate(await repository.getProject(projectId)); }); }
  async function rebase() { await runOperation(() => reviewApi.rebaseForProject(repository, projectId)); }
  async function confirm() { if (dirty) await flushSave(); await runOperation(() => reviewApi.confirmForProject(repository, projectId)); }
  async function runOperation(operation) { if (busy) return; busy = true; setInteractiveDisabled(true); ui.operationError.textContent = ""; try { inspected = await operation(); localState = inspected.review ? structuredClone(inspected.review) : null; dirty = false; } catch (error) { ui.operationError.textContent = error?.userMessage || "Операция проверки не выполнена."; inspected = reviewApi.inspectAggregate(await repository.getProject(projectId)); localState = inspected.review ? structuredClone(inspected.review) : null; } finally { busy = false; render(); } }

  function renderValidation(validation) {
    if (!validation) { ui.validation.hidden = true; return; }
    ui.validation.hidden = false; ui.counts.textContent = `Нерешено: critical ${validation.unresolvedCriticalCount}, important ${validation.unresolvedImportantCount}, informational ${validation.unresolvedInformationalCount}.`;
    ui.errors.replaceChildren(...(validation.errors || []).map(issueNode)); ui.warnings.replaceChildren(...(validation.warnings || []).map(issueNode));
    if (!validation.errors?.length) ui.errors.append(emptyNode("Ошибок нет.")); if (!validation.warnings?.length) ui.warnings.append(emptyNode("Предупреждений нет."));
  }
  function issueNode(issue) { const item = document.createElement("li"); const context = issue.itemId ? ` (${issue.itemId})` : issue.conflictId ? ` (${issue.conflictId})` : ""; item.textContent = `${ISSUE_MESSAGES[issue.code] || issue.code}${context}`; return item; }
  function emptyNode(message) { const item = document.createElement("li"); item.textContent = message; return item; }
  function badge(label, extra = "") { const span = document.createElement("span"); span.className = `review-badge ${extra}`.trim(); span.textContent = label; return span; }
  function field(labelText) { const label = document.createElement("label"); label.className = "review-field"; const span = document.createElement("span"); span.textContent = labelText; label.append(span); return label; }
  function editableText(value) { if (value && typeof value === "object") { const candidate = value.value ?? value.type ?? value.name ?? value.instructionText ?? value.text; return candidate === undefined ? JSON.stringify(value) : String(candidate); } return String(value ?? ""); }
  function valueText(value) { if (typeof value === "string") return value; return JSON.stringify(value, null, 2); }
  function parseEditedValue(original, input) { if (typeof original === "number") { const numeric = Number(input); return Number.isFinite(numeric) ? numeric : input; } if (original && typeof original === "object" && !Array.isArray(original)) { const next = structuredClone(original); const key = ["value", "type", "name", "instructionText", "text"].find((candidate) => Object.hasOwn(next, candidate)); if (key) next[key] = typeof next[key] === "number" && Number.isFinite(Number(input)) ? Number(input) : input; else return input; return next; } return input; }
  function sameValue(left, right) { return reviewApi.canonicalize(left) === reviewApi.canonicalize(right); }
  function setInteractiveDisabled(value) { document.querySelectorAll("button, input, select, textarea").forEach((element) => { element.disabled = value; }); }
  function resetPanels() { ui.fatal.hidden = true; ui.workflow.hidden = false; ui.save.hidden = true; ui.validate.hidden = true; ui.rebase.hidden = true; ui.confirm.hidden = true; ui.technology.hidden = true; ui.validation.hidden = true; ui.conflicts.hidden = true; ui.categories.hidden = true; ui.confirmed.hidden = true; ui.save.disabled = false; ui.validate.disabled = false; ui.rebase.disabled = false; ui.confirm.disabled = false; ui.source.textContent = "—"; ui.freshness.textContent = "—"; }
  function showFatal(message) { resetPanels(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(window);
