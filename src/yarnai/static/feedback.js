"use strict";

(function initializeFeedbackPage() {
  const testerMode = window.YarnAITesterMode;
  const form = document.querySelector("#feedback-form");
  const reportPreview = document.querySelector("#report-preview");
  const copyButton = document.querySelector("#copy-report-button");
  const downloadButton = document.querySelector("#download-report-button");
  const copyStatus = document.querySelector("#copy-status");
  const manualPanel = document.querySelector("#manual-copy-panel");
  const manualText = document.querySelector("#manual-copy-text");
  const fingerprint = new URLSearchParams(window.location.search).get(
    "calculation",
  ) ?? "";

  refreshReport();
  form.addEventListener("input", refreshReport);
  form.addEventListener("change", refreshReport);

  copyButton.addEventListener("click", async () => {
    if (!form.reportValidity()) {
      return;
    }
    const report = refreshReport();
    const result = await testerMode.copyReport(
      report,
      navigator.clipboard,
      showManualCopy,
    );
    if (result === "copied") {
      manualPanel.hidden = true;
      copyStatus.textContent = "Отчёт скопирован.";
    } else {
      copyStatus.textContent =
        "Автоматическое копирование недоступно. Выдели текст ниже и скопируй вручную.";
    }
  });

  downloadButton.addEventListener("click", () => {
    if (!form.reportValidity()) {
      return;
    }
    const filename = testerMode.downloadReport(refreshReport());
    copyStatus.textContent = filename
      ? `Файл ${filename} подготовлен.`
      : "Скачивание недоступно в этом браузере. Используй копирование отчёта.";
  });

  function refreshReport() {
    const diagnostics = testerMode.createDiagnosticSnapshot({
      fingerprint,
    });
    const report = testerMode.buildFeedbackReport({
      answers: {
        attempted: form.elements.attempted.value,
        happened: form.elements.happened.value,
        expected: form.elements.expected.value,
        comment: form.elements.comment.value,
      },
      includeAnswers: form.elements["include-answers"].checked,
      diagnostics,
    });
    reportPreview.textContent = report;
    if (!manualPanel.hidden) {
      manualText.value = report;
    }
    return report;
  }

  function showManualCopy(text) {
    manualText.value = text;
    manualPanel.hidden = false;
    manualText.focus();
    manualText.select();
  }
})();
