"use strict";

(function startProjectCalculationEntry(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-calculation-entry") return;
  const workspace = globalObject.YarnAIProjectCalculationEntryWorkspace;
  const blocked = document.querySelector("#blocked-summary");
  if (!workspace) {
    if (blocked) {
      blocked.textContent = "Экран расчёта загружен не полностью. Обновите страницу.";
      document.querySelector("#loading-state").hidden = true;
      document.querySelector("#blocked-state").hidden = false;
    }
    return;
  }
  const controller = workspace.createController();
  globalObject.YarnAIProjectCalculationEntryController = controller;
  controller.start().catch((error) => {
    document.querySelector("#loading-state").hidden = true;
    document.querySelector("#ready-state").hidden = true;
    document.querySelector("#blocked-state").hidden = false;
    blocked.textContent = error.userMessage || "Не удалось открыть начальный расчёт.";
    blocked.focus();
  });
})(typeof window !== "undefined" ? window : globalThis);
