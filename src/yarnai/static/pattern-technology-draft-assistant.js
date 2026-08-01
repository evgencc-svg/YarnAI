"use strict";

(function initializePatternTechnologyDraftPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const draftApi = globalObject.YarnAIPatternTechnologyDraft;
  const get = (selector) => document.querySelector(selector);
  const ui = {
    fatal: get("#pattern-technology-draft-fatal"), fatalMessage: get("#pattern-technology-draft-fatal-message"), workflow: get("#pattern-technology-draft-workflow"),
    title: get("#pattern-technology-draft-project-title"), status: get("#pattern-technology-draft-status"), summary: get("#pattern-technology-draft-summary"), source: get("#pattern-technology-draft-source"), freshness: get("#pattern-technology-draft-freshness"),
    build: get("#pattern-technology-draft-build"), rebuild: get("#pattern-technology-draft-rebuild"), retry: get("#pattern-technology-draft-retry"), review: get("#pattern-technology-draft-review"), back: get("#pattern-technology-draft-back"), operationError: get("#pattern-technology-draft-operation-error"),
    issues: get("#pattern-technology-draft-issues"), critical: get("#pattern-technology-draft-critical"), warnings: get("#pattern-technology-draft-warnings"), missing: get("#pattern-technology-draft-missing"), conflicts: get("#pattern-technology-draft-conflicts"),
    result: get("#pattern-technology-draft-result"), product: get("#pattern-technology-draft-product"), sizing: get("#pattern-technology-draft-sizing"), materials: get("#pattern-technology-draft-materials"), tools: get("#pattern-technology-draft-tools"), components: get("#pattern-technology-draft-components"), operations: get("#pattern-technology-draft-operations"), stitches: get("#pattern-technology-draft-stitches"), finishing: get("#pattern-technology-draft-finishing"), provenance: get("#pattern-technology-draft-provenance"),
  };
  const ISSUE_MESSAGES = Object.freeze({
    MISSING_CRAFT: "Не подтверждён вид рукоделия.", MISSING_PRODUCT: "Не подтверждён тип изделия.", MISSING_OPERATIONS: "Нет подтверждённых операций.", MISSING_YARN: "Не подтверждена пряжа.", MISSING_TOOLS: "Не подтверждены инструменты.", MISSING_GAUGE: "Не подтверждена плотность.", MISSING_SIZE: "Размер или исходные мерки не подтверждены.", MISSING_SELECTED_SIZE: "Не выбрана одна из нескольких размерных веток.", MISSING_CRITICAL_VALUE: "Неизвестно исходное количество петель.", MISSING_FINISHING: "Отделка не описана.", AMBIGUOUS_REPEAT: "Границы или условие повтора неоднозначны.", STITCH_COUNT_CONFLICT: "Подтверждённое и вычисленное количество петель расходятся.", INVALID_ROW_RANGE: "Диапазон рядов некорректен.", ROW_SEQUENCE_CONFLICT: "Последовательность рядов противоречива.", UNASSIGNED_COMPONENT: "Операция не привязана к подтверждённому компоненту.", UNKNOWN_OPERATION: "Тип операции не удалось определить без предположения.", NO_ABBREVIATIONS: "Отдельный список сокращений не подтверждён.", SOURCE_REVIEW_STALE: "Подтверждение Stage 19 изменилось.", SOURCE_FINGERPRINT_MISMATCH: "Fingerprint подтверждённого источника изменился.", IMMUTABLE_SOURCE_CHANGED: "Локальный snapshot источника изменён.", BUILD_INTERRUPTED: "Предыдущее построение было прервано; сохранённый результат не повреждён.", IMPORT_SOURCE_IDENTITY_UNPROVEN: "После импорта готовность источника нельзя доказать.",
  });
  const OPERATION_LABELS = Object.freeze({ cast_on: "Набор петель", knit: "Лицевые петли", purl: "Изнаночные петли", work_pattern: "Работа узором", repeat: "Повтор", increase: "Прибавление", decrease: "Убавление", bind_off: "Закрытие петель", hold_stitches: "Отложить петли", pick_up_stitches: "Поднять петли", join: "Соединение", seam: "Сшивание", finish: "Отделка", unknown: "Неопределённая операция" });
  let repository = null; let projectId = null; let inspected = null; let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось открыть черновик технологии."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderBlocked("Черновик технологии недоступен.", "Откройте его из подтверждённого Stage 19.");
    if (!system?.isUuidv7(projectId) || !draftApi) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository(); await repository.initialize();
    ui.back.href = `/pattern-analysis-review?project=${encodeURIComponent(projectId)}`;
    ui.review.href = `/pattern-technology-review?project=${encodeURIComponent(projectId)}`;
    ui.build.addEventListener("click", () => runOperation(() => draftApi.buildForProject(repository, projectId)));
    ui.rebuild.addEventListener("click", () => runOperation(() => draftApi.rebuildForProject(repository, projectId)));
    ui.retry.addEventListener("click", () => runOperation(() => draftApi.retryForProject(repository, projectId)));
    inspected = await draftApi.ensureForProject(repository, projectId);
    render();
  }

  function render() {
    resetPanels();
    ui.title.textContent = inspected?.project?.title || "Черновик технологии";
    if (!inspected) return renderBlocked("Черновик технологии недоступен.", "Проект не найден.");
    const blocked = {
      missing_project: ["Черновик технологии недоступен.", "Проект или активный расчёт не найден."],
      review_missing: ["Сначала завершите проверку анализа.", "Запись Stage 19 отсутствует."],
      review_not_confirmed: ["Требуется подтверждение Stage 19.", "Неподтверждённые reviewedData не используются для технологии."],
      source_invalid: ["Источник повреждён.", "Ownership подтверждённого snapshot не прошёл проверку."],
    };
    if (blocked[inspected.state]) return renderBlocked(...blocked[inspected.state]);
    if (inspected.state === "corrupted") return showFatal(`Запись повреждена: ${inspected.reasonCode || "INVALID_DRAFT_SCHEMA"}.`);
    const draft = inspected.draft;
    if (!draft) return renderBlocked("Подготовка записи.", "Создаётся сохраняемая запись черновика.");
    ui.source.textContent = `Stage 19 ${draft.sourceReviewId}, revision ${draft.sourceReviewRevision}`;
    ui.review.hidden = !draft.draftResult || !["ready", "needs_attention"].includes(draft.status) || inspected.state === "stale";
    ui.freshness.textContent = inspected.state === "stale" ? "Источник изменился" : "Источник подтверждён";
    if (inspected.state === "stale") {
      ui.status.textContent = "Черновик требует внимания.";
      ui.status.className = "technology-status-attention";
      ui.summary.textContent = "Подтверждение Stage 19 изменилось. Старый результат не считается готовым и не перестраивается без явного действия.";
      ui.rebuild.hidden = false;
      renderIssues(draft);
      if (draft.draftResult) renderResult(draft.draftResult);
      return;
    }
    if (draft.status === "waiting") {
      ui.status.textContent = draft.lastError?.code === "BUILD_INTERRUPTED" ? "Построение было прервано." : "Подтверждённый анализ готов к преобразованию.";
      ui.summary.textContent = "Построение выполняется локально и детерминированно только из confirmedSnapshot.";
      ui.build.hidden = draft.lastError?.code === "BUILD_INTERRUPTED";
      ui.retry.hidden = draft.lastError?.code !== "BUILD_INTERRUPTED";
    } else if (draft.status === "building") {
      ui.status.textContent = "Строим черновик технологии.";
      ui.summary.textContent = "Повторный конкурентный запуск заблокирован.";
    } else if (draft.status === "needs_attention") {
      ui.status.textContent = "Черновик построен и требует внимания.";
      ui.status.className = "technology-status-attention";
      ui.summary.textContent = summaryText(draft);
      ui.rebuild.hidden = false;
      renderIssues(draft); renderResult(draft.draftResult);
    } else if (draft.status === "ready") {
      ui.status.textContent = "Структурированный черновик готов.";
      ui.status.className = "technology-status-ready";
      ui.summary.textContent = summaryText(draft);
      ui.rebuild.hidden = false;
      renderIssues(draft); renderResult(draft.draftResult);
    } else if (draft.status === "failed") {
      ui.status.textContent = `Построение не выполнено: ${draft.lastError?.code || "FAILED"}.`;
      ui.status.className = "technology-status-failed";
      ui.summary.textContent = "Повтор доступен только при действующем подтверждённом источнике.";
      ui.retry.hidden = false;
    }
  }

  function renderIssues(draft) {
    ui.issues.hidden = false;
    const result = draft.draftResult || {};
    const critical = [
      ...(result.missingInformation || []).filter((entry) => entry.level === "critical"),
      ...(result.conflicts || []).filter((entry) => entry.level === "critical"),
      ...(result.warnings || []).filter((entry) => entry.level === "critical"),
      ...(draft.validation?.errors || []),
    ];
    renderIssueList(ui.critical, critical, "Критических проблем нет.");
    renderIssueList(ui.warnings, [...(result.warnings || []).filter((entry) => entry.level !== "critical"), ...(draft.validation?.warnings || [])], "Предупреждений нет.");
    renderIssueList(ui.missing, result.missingInformation || [], "Недостающие сведения не отмечены.");
    renderIssueList(ui.conflicts, result.conflicts || [], "Противоречий нет.");
  }

  function renderResult(result) {
    if (!result) return;
    ui.result.hidden = false;
    renderEntityList(ui.product, [result.craft, result.product, ...(result.construction || [])].filter(Boolean), entityText);
    renderEntityList(ui.sizing, [...(result.sizes || []), ...(result.gauge || [])], entityText);
    renderEntityList(ui.materials, [...(result.materials || []), ...(result.yarn || [])], entityText);
    renderEntityList(ui.tools, result.tools || [], entityText);
    renderEntityList(ui.components, [...(result.components || []), ...(result.sections || [])], componentText);
    ui.operations.replaceChildren(...(result.operations || []).map(operationNode));
    if (!result.operations?.length) ui.operations.append(emptyNode("Подтверждённых операций нет."));
    renderEntityList(ui.stitches, result.stitchCountChanges || [], stitchText);
    renderEntityList(ui.finishing, [...(result.finishing || []), ...(result.abbreviations || [])], entityText);
    renderEntityList(ui.provenance, result.provenance || [], provenanceText);
  }

  function operationNode(operation) {
    const article = document.createElement("article"); article.className = "technology-operation";
    const heading = document.createElement("h3"); heading.textContent = `${operation.order}. ${OPERATION_LABELS[operation.type] || operation.type}`; article.append(heading);
    const instruction = document.createElement("p"); instruction.textContent = operation.instructionSource || "Текст инструкции не подтверждён."; article.append(instruction);
    const range = rangeText(operation); if (range) { const node = document.createElement("p"); node.textContent = range; article.append(node); }
    if (operation.repeat) { const repeat = document.createElement("p"); repeat.textContent = repeatText(operation.repeat); article.append(repeat); }
    if (operation.stitchCountBefore !== null || operation.stitchCountAfter !== null || operation.countDelta !== null) { const counts = document.createElement("p"); counts.textContent = `Петли: до ${display(operation.stitchCountBefore)}, изменение ${display(operation.countDelta)}, после ${display(operation.stitchCountAfter)}.`; article.append(counts); }
    return article;
  }

  async function runOperation(operation) {
    if (busy) return;
    busy = true; setDisabled(true); ui.operationError.textContent = "";
    if (inspected?.draft) { inspected = { ...inspected, state: "building", draft: { ...inspected.draft, status: "building" } }; render(); }
    try { inspected = await operation(); }
    catch (error) { ui.operationError.textContent = `${error?.code ? `${error.code}: ` : ""}${error?.userMessage || "Операция не выполнена."}`; inspected = await draftApi.ensureForProject(repository, projectId); }
    finally { busy = false; render(); }
  }

  function renderEntityList(container, entities, formatter) {
    const list = document.createElement("ul"); list.className = "technology-entity-list";
    for (const entity of entities) { const item = document.createElement("li"); item.className = "technology-entity"; item.textContent = formatter(entity); list.append(item); }
    container.replaceChildren(entities.length ? list : emptyNode("Нет подтверждённых данных."));
  }
  function renderIssueList(container, issues, emptyText) { container.replaceChildren(...issues.map(issueNode)); if (!issues.length) container.append(emptyNode(emptyText)); }
  function issueNode(issue) { const item = document.createElement("li"); item.textContent = `${ISSUE_MESSAGES[issue.code] || issue.message || issue.code}${issue.entityId ? ` (${issue.entityId})` : ""}`; return item; }
  function emptyNode(message) { const node = document.createElement("p"); node.className = "technology-empty"; node.textContent = message; return node; }
  function entityText(entity) { const label = entity.type || entity.property || entity.materialType || entity.abbreviation || "Значение"; const value = entity.definition ? `${entity.abbreviation} — ${entity.definition}` : humanValue(entity.value ?? entity.normalized ?? entity.name); return `${label}: ${value}`; }
  function componentText(entity) { return entity.name ? `Компонент: ${entity.name}` : `Секция: ${entity.title}${entity.componentId ? " (привязана к компоненту)" : ""}`; }
  function stitchText(entity) { return `${entity.formula}. Подтверждённый итог: ${display(entity.confirmedStitchCountAfter)}; вычисленный итог: ${display(entity.calculatedStitchCountAfter)}.`; }
  function provenanceText(entity) { const correction = entity.correctionProvenance ? "исправлено пользователем" : "принято без изменения"; return `${entity.sourceReviewedItemId}: ${correction}; evidence ${entity.evidenceFingerprint}; значение ${humanValue(entity.confirmedValue)}.`; }
  function humanValue(value) { if (value === null || value === undefined || value === "") return "не указано"; if (Array.isArray(value)) return value.map(humanValue).join(", "); if (typeof value === "object") return Object.keys(value).sort().filter((key) => !["evidence", "confidence"].includes(key)).map((key) => `${key}: ${humanValue(value[key])}`).join("; "); return String(value); }
  function rangeText(operation) { if (operation.roundStart !== null) return operation.roundStart === operation.roundEnd ? `Круг ${operation.roundStart}.` : `Круги ${operation.roundStart}–${operation.roundEnd}.`; if (operation.rowStart !== null) return operation.rowStart === operation.rowEnd ? `Ряд ${operation.rowStart}.` : `Ряды ${operation.rowStart}–${operation.rowEnd}.`; return ""; }
  function repeatText(repeat) { if (repeat.mode === "count") return `Повторить ${repeat.count} раз.`; if (repeat.mode === "until_row") return `Повторять до ряда ${repeat.untilRow}.`; if (repeat.mode === "until_stitch_count") return `Повторять до ${repeat.untilStitchCount} петель.`; if (repeat.mode === "until_length") return `Повторять до ${repeat.untilLength} ${repeat.untilUnit || ""}.`; if (repeat.mode === "reference") return `Повторить ранее определённую операцию ${repeat.operationRef}.`; if (repeat.mode === "row_range") return `Повторять ряды ${repeat.rowStart}–${repeat.rowEnd}.`; return "Границы повтора неоднозначны."; }
  function display(value) { return value === null || value === undefined ? "не доказано" : String(value); }
  function summaryText(draft) { const summary = draft.draftResult?.generationSummary; return `Операций: ${summary?.operationCount || 0}; компонентов: ${summary?.componentCount || 0}; секций: ${summary?.sectionCount || 0}; revision: ${draft.revision}.`; }
  function renderBlocked(status, summary) { resetPanels(); ui.status.textContent = status; ui.summary.textContent = summary; ui.freshness.textContent = "Черновик недоступен"; }
  function resetPanels() { ui.fatal.hidden = true; ui.workflow.hidden = false; ui.build.hidden = true; ui.rebuild.hidden = true; ui.retry.hidden = true; ui.review.hidden = true; ui.issues.hidden = true; ui.result.hidden = true; ui.status.className = ""; setDisabled(busy); }
  function setDisabled(value) { for (const button of [ui.build, ui.rebuild, ui.retry]) button.disabled = value; }
  function showFatal(message) { resetPanels(); ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(window);
