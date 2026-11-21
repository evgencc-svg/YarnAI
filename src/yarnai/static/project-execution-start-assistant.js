"use strict";

(function initializeProjectExecutionStartAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-execution-start") return;
  const workspace = globalObject.YarnAIProjectExecutionStartWorkspace;
  if (!workspace) return;
  const controller = workspace.createController({ globalObject, document });
  globalObject.YarnAIProjectExecutionStartController = controller;
  controller.start().catch((error) => {
    controller.renderBlocked(globalObject.YarnAIProjectExecutionStart.diagnostic(
      error?.code || "STAGE65_SOURCE_INVALID",
      error?.userMessage || error?.message || "Не удалось безопасно открыть начало выполнения.",
    ));
  });
})(typeof window !== "undefined" ? window : globalThis);
