"use strict";

(function initializeExtractionPage(globalObject) {
  const system = globalObject.YarnAIProjectSystem;
  const extractionApi = globalObject.YarnAIPatternContentExtraction;
  const get = (selector) => document.querySelector(selector);
  const ui = {
    error: get("#pattern-content-extraction-error"), errorMessage: get("#pattern-content-extraction-error-message"), workflow: get("#pattern-content-extraction-workflow"),
    title: get("#pattern-content-extraction-project-title"), status: get("#pattern-content-extraction-status"), summary: get("#pattern-content-extraction-summary"), diagnostic: get("#pattern-content-extraction-diagnostic"),
    start: get("#pattern-content-extraction-start"), retry: get("#pattern-content-extraction-retry"), view: get("#pattern-content-extraction-view"), semantic: get("#pattern-semantic-analysis-link"), results: get("#pattern-content-extraction-results"),
    files: get("#pattern-content-extraction-files"), textPanel: get("#pattern-content-extraction-text"), combined: get("#pattern-content-extraction-combined"), fileTexts: get("#pattern-content-extraction-file-texts"),
  };
  let repository;
  let projectId;
  let result;
  let busy = false;

  initialize().catch((error) => showFatal(error?.userMessage || "Не удалось подготовить извлечение содержимого."));

  async function initialize() {
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) {
      result = { project: null, extraction: null };
      render();
      return;
    }
    if (!system?.isUuidv7(projectId) || !extractionApi) return showFatal("Ссылка на проект повреждена.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    result = await extractionApi.ensureForProject(repository, projectId);
    ui.semantic.href = `/pattern-semantic-analysis?project=${encodeURIComponent(projectId)}`;
    ui.start.addEventListener("click", run);
    ui.retry.addEventListener("click", run);
    ui.view.addEventListener("click", () => {
      ui.textPanel.hidden = !ui.textPanel.hidden;
      ui.view.textContent = ui.textPanel.hidden ? "Просмотреть извлечённый текст" : "Скрыть извлечённый текст";
    });
    render();
  }

  async function run() {
    if (busy) return;
    busy = true; setButtons(true); ui.status.textContent = "Читаем содержимое материалов…"; ui.diagnostic.textContent = "";
    try { result = await extractionApi.runForProject(repository, projectId); }
    catch (error) { ui.diagnostic.textContent = error?.userMessage || "Извлечение завершилось с ошибкой."; result = extractionApi.inspectAggregate(await repository.getProject(projectId)); }
    finally { busy = false; setButtons(false); render(); }
  }

  function render() {
    ui.error.hidden = true; ui.workflow.hidden = false; ui.title.textContent = result.project?.title || "Извлечение материалов";
    ui.start.hidden = true; ui.retry.hidden = true; ui.view.hidden = true; ui.semantic.hidden = true; ui.results.hidden = true; ui.textPanel.hidden = true; ui.diagnostic.textContent = "";
    const state = result.extraction;
    if (!state) { ui.status.textContent = "Извлечение содержимого ещё не подготовлено."; ui.summary.textContent = ""; return; }
    if (state.status === "waiting") { ui.status.textContent = "Материалы готовы к чтению."; ui.summary.textContent = `Файлов в подтверждённом импорте: ${state.filesCount}.`; ui.start.hidden = false; return; }
    if (state.status === "extracting") { ui.status.textContent = "Читаем содержимое материалов…"; ui.summary.textContent = "Повторный параллельный запуск заблокирован."; return; }
    const length = state.result.combinedText.length;
    ui.status.textContent = state.status === "completed" ? "Содержимое файлов извлечено." : state.status === "partial" ? "Часть материалов удалось прочитать." : "Содержимое материалов извлечь не удалось.";
    ui.summary.textContent = `Обработано: ${state.processedFilesCount} из ${state.filesCount}. Текст дали: ${state.successfulFilesCount}. Длина объединённого текста: ${length}.`;
    ui.retry.hidden = state.status === "completed"; ui.view.hidden = length === 0 && state.result.files.every((file) => !file.text); ui.semantic.hidden = !["completed", "partial"].includes(state.status); ui.results.hidden = false; ui.diagnostic.textContent = state.error?.message || "";
    renderFiles(state.result.files); renderText(state.result);
  }

  function renderFiles(files) {
    ui.files.replaceChildren(...files.map((file) => {
      const item = document.createElement("li"); item.className = "extraction-file";
      const header = document.createElement("div"); header.className = "extraction-file-header";
      const name = document.createElement("span"); name.className = "extraction-file-name"; name.textContent = `${file.order}. ${file.name}`;
      const status = document.createElement("span"); status.textContent = statusLabel(file.extractionStatus);
      const meta = document.createElement("div"); meta.className = "extraction-file-meta"; meta.textContent = `${file.mediaType} · ${formatSize(file.size)} · ${file.textLength} символов`;
      header.append(name, status); item.append(header, meta);
      const messages = [...file.warnings, ...(file.error ? [file.error] : [])];
      if (messages.length) { const list = document.createElement("ul"); list.className = "extraction-warning-list"; list.replaceChildren(...messages.map((entry) => { const row = document.createElement("li"); row.textContent = entry.message; return row; })); item.append(list); }
      return item;
    }));
  }

  function renderText(resultValue) {
    ui.combined.textContent = resultValue.combinedText;
    ui.fileTexts.replaceChildren(...resultValue.files.filter((file) => file.text || file.pages?.length).map((file) => {
      const wrapper = document.createElement("div"); wrapper.className = "extraction-file-text";
      const details = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = file.name; details.append(summary);
      if (file.pages) for (const page of file.pages) { const heading = document.createElement("h4"); heading.textContent = `Страница ${page.pageNumber}`; const pre = document.createElement("pre"); pre.textContent = page.text; details.append(heading, pre); }
      else { const pre = document.createElement("pre"); pre.textContent = file.text; details.append(pre); }
      wrapper.append(details); return wrapper;
    }));
  }

  function setButtons(disabled) { [ui.start, ui.retry, ui.view].forEach((button) => { button.disabled = disabled; }); }
  function showFatal(message) { ui.workflow.hidden = true; ui.error.hidden = false; ui.errorMessage.textContent = message; }
  function statusLabel(value) { return { extracted: "Текст извлечён", metadata_only: "Только метаданные", no_text_layer: "Нет текстового слоя", unsupported: "Не поддерживается", failed: "Ошибка", truncated: "Ограничено лимитом" }[value] || value; }
  function formatSize(bytes) { return bytes < 1024 ? `${bytes} Б` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`; }
})(window);
