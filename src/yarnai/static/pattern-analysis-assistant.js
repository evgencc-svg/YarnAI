"use strict";

(function initializePatternAnalysisPage(globalObject) {
  const projectSystem = globalObject.YarnAIProjectSystem;
  const patternAnalysis = globalObject.YarnAIPatternAnalysis;
  const status = document.querySelector("#pattern-analysis-status");
  const details = document.querySelector("#pattern-analysis-details");
  const title = document.querySelector("#pattern-analysis-project-title");
  const extractionLink = document.querySelector("#pattern-content-extraction-link");

  initialize().catch(() => {
    status.textContent = "Анализ материалов ещё не выполнялся.";
    details.textContent = "Состояние проекта не было изменено.";
  });

  async function initialize() {
    const projectId = new URLSearchParams(globalObject.location.search).get(
      "project",
    );
    if (
      !projectId ||
      !projectSystem ||
      !patternAnalysis ||
      !projectSystem.isUuidv7(projectId)
    ) {
      return;
    }
    const repository = new projectSystem.ProjectRepository();
    try {
      await repository.initialize();
      const result = patternAnalysis.inspectAggregate(
        await repository.getProject(projectId),
      );
      title.textContent = result.project?.title || "Состояние анализа";
      extractionLink.href = `/pattern-content-extraction?project=${encodeURIComponent(projectId)}`;
      render(result);
    } finally {
      await repository.close();
    }
  }

  function render(result) {
    if (!result.analysis) {
      status.textContent = "Анализ материалов ещё не выполнялся.";
      details.textContent = "";
      return;
    }
    status.textContent = statusText(result.analysis.status);
    details.textContent = `Материалов в подтверждённом импорте: ${result.analysis.filesCount}.`;
  }

  function statusText(value) {
    return {
      waiting: "Ожидает запуска.",
      queued: "Поставлен в очередь.",
      analyzing: "Анализ выполняется.",
      completed: "Анализ завершён.",
      failed: "Анализ завершился с ошибкой.",
    }[value] || "Анализ материалов ещё не выполнялся.";
  }
})(window);
