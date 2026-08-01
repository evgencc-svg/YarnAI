"use strict";

(function initializePatternSemanticAnalysisPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem; const semantic = globalObject.YarnAIPatternSemanticAnalysis; const get = (selector) => document.querySelector(selector);
  const ui = {
    fatal: get("#pattern-semantic-analysis-error"), fatalMessage: get("#pattern-semantic-analysis-error-message"), workflow: get("#pattern-semantic-analysis-workflow"), title: get("#pattern-semantic-analysis-project-title"), status: get("#pattern-semantic-analysis-status"), summary: get("#pattern-semantic-analysis-summary"),
    start: get("#pattern-semantic-analysis-start"), retry: get("#pattern-semantic-analysis-retry"), review: get("#pattern-analysis-review-link"), back: get("#pattern-semantic-analysis-back"), errorDetail: get("#pattern-semantic-analysis-error-detail"), results: get("#pattern-semantic-analysis-results"), fields: get("#pattern-semantic-analysis-fields"), partial: get("#pattern-semantic-analysis-partial"), diagnostics: get("#pattern-semantic-analysis-diagnostics"), diagnosticList: get("#pattern-semantic-analysis-diagnostic-list"),
  };
  let repository; let projectId; let inspected = { project: null, analysis: null }; let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось подготовить семантический анализ."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) { render(); return; }
    if (!system?.isUuidv7(projectId) || !semantic) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository(); await repository.initialize();
    const aggregate = await repository.getProject(projectId); inspected = semantic.inspectAggregate(aggregate);
    if (!inspected.analysis && ["completed", "partial"].includes(inspected.extraction?.status)) inspected = await semantic.ensureForProject(repository, projectId);
    else if (inspected.analysis?.status === "analyzing") inspected = await semantic.ensureForProject(repository, projectId);
    ui.start.addEventListener("click", run); ui.retry.addEventListener("click", retry); ui.back.href = `/pattern-content-extraction?project=${encodeURIComponent(projectId)}`; ui.review.href = `/pattern-analysis-review?project=${encodeURIComponent(projectId)}`; render();
  }

  async function run() { return execute(() => semantic.runForProject(repository, projectId)); }
  async function retry() { return execute(() => semantic.retryForProject(repository, projectId)); }
  async function execute(operation) {
    if (busy) return; busy = true; setButtons(true); ui.status.textContent = "Анализируем структуру материалов…"; ui.errorDetail.textContent = "";
    try { inspected = await operation(); }
    catch (error) { ui.errorDetail.textContent = error?.userMessage || "Семантический анализ завершился контролируемой ошибкой."; inspected = semantic.inspectAggregate(await repository.getProject(projectId)); }
    finally { busy = false; setButtons(false); render(); }
  }

  function render() {
    ui.fatal.hidden = true; ui.workflow.hidden = false; ui.start.hidden = true; ui.retry.hidden = true; ui.review.hidden = true; ui.results.hidden = true; ui.partial.hidden = true; ui.diagnostics.hidden = true; ui.errorDetail.textContent = ""; ui.fields.replaceChildren(); ui.diagnosticList.replaceChildren();
    ui.title.textContent = inspected.project?.title || "Структурный анализ"; const state = inspected.analysis;
    if (!state) { ui.status.textContent = "Семантический анализ ещё не создан."; ui.summary.textContent = inspected.extraction ? "Завершите извлечение содержимого, чтобы создать анализ." : "Откройте этап из завершённого извлечения содержимого."; return; }
    if (state.status === "waiting") { ui.status.textContent = "Материалы готовы к структурному анализу."; ui.summary.textContent = `Источник: extraction revision ${state.sourceExtractionRevision}.`; ui.start.hidden = false; return; }
    if (state.status === "analyzing") { ui.status.textContent = "Анализируем структуру материалов…"; ui.summary.textContent = "Повторный параллельный запуск заблокирован."; return; }
    if (state.status === "failed") { ui.status.textContent = "Не удалось выполнить анализ"; ui.summary.textContent = "Источник не прошёл проверку или анализ завершился контролируемой ошибкой."; ui.retry.hidden = false; ui.errorDetail.textContent = state.errors[0]?.message || inspected.diagnostic?.message || "Повторите анализ после проверки extraction."; renderDiagnostics(state); return; }
    ui.status.textContent = state.status === "completed" ? "Семантический анализ завершён." : "Анализ завершён частично"; ui.summary.textContent = `Распознано групп: ${state.result.analysisSummary.recognizedFields}. Confidence: ${formatConfidence(state.result.analysisSummary.confidence)}.`; ui.results.hidden = false; ui.partial.hidden = state.status !== "partial"; ui.retry.hidden = state.status !== "partial"; ui.review.hidden = state.status !== "completed"; renderFields(state.result); renderDiagnostics(state);
  }

  function renderFields(result) {
    const rows = [
      ["Язык", `${result.language.primary} (${formatConfidence(result.language.confidence)})`], ["Тип документа", result.documentType.value], ["Способ вязания", result.craft.value], ["Тип изделия", result.garment.type],
      ["Конструкция", `${result.construction.method}; по кругу: ${result.construction.workedInRound}; без швов: ${result.construction.seamless}`], ["Размеры", `${result.sizing.labels.join(", ") || "не найдены"}; измерений: ${result.sizing.measurements.length}`],
      ["Плотность", `петли: ${result.gauge.stitches.length}; ряды: ${result.gauge.rows.length}`], ["Пряжа", `названия: ${result.yarn.names.length}; количества: ${result.yarn.amounts.length}; составы: ${result.yarn.fiberContent.length}`],
      ["Инструменты", `спицы: ${result.tools.needleSizes.length}; крючки: ${result.tools.hookSizes.length}; прочие: ${result.tools.other.length}`], ["Секции", String(result.sections.length)], ["Инструкции по рядам", String(result.rowInstructions.length)], ["Повторы", String(result.repeatInstructions.length)], ["Confidence", formatConfidence(result.analysisSummary.confidence)],
    ];
    ui.fields.replaceChildren(...rows.map(([label, value]) => { const row = document.createElement("div"); const term = document.createElement("dt"); const description = document.createElement("dd"); term.textContent = label; description.textContent = value; row.append(term, description); return row; }));
  }

  function renderDiagnostics(state) {
    const diagnostics = [...state.result.diagnostics]; if (!diagnostics.length) return; ui.diagnostics.hidden = false;
    ui.diagnosticList.replaceChildren(...diagnostics.map((entry) => { const item = document.createElement("li"); item.textContent = `${entry.severity}: ${entry.code} — ${entry.message}`; return item; }));
  }

  function setButtons(disabled) { [ui.start, ui.retry].forEach((button) => { button.disabled = disabled; }); }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
  function formatConfidence(value) { return `${Math.round((Number(value) || 0) * 100)}%`; }
})(window);
