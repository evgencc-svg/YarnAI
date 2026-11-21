"use strict";

(function initializeProjectExecutionFirstStepAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-execution-first-step") return;
  const workspace = globalObject.YarnAIProjectExecutionFirstStepWorkspace;
  const domain = globalObject.YarnAIProjectExecutionFirstStep;
  if (!workspace || !domain) return;
  const controller = workspace.createController({ globalObject, document });
  globalObject.YarnAIProjectExecutionFirstStepController = controller;
  controller.start().catch((error) => {
    controller.renderBlocked(domain.diagnostic(
      error?.code || "STORAGE_UNAVAILABLE",
      error?.userMessage || error?.message || "Не удалось безопасно открыть первый шаг.",
    ));
  });
})(typeof window !== "undefined" ? window : globalThis);
