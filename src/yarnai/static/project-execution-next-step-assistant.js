"use strict";

(function initializeProjectExecutionNextStepAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-execution-next-step") return;

  function startController() {
    const workspace = globalObject.YarnAIProjectExecutionNextStepWorkspace;
    if (!workspace?.createController) return;

    const controller = workspace.createController({ globalObject, document });
    globalObject.YarnAIProjectExecutionNextStepController = controller;
    controller.start().catch((error) => {
      globalObject.console?.error?.("Stage 68 initialization failed.", error);
    });
  }

  if (document.readyState === "loading") {
    globalObject.addEventListener("DOMContentLoaded", startController, { once: true });
  } else {
    startController();
  }
})(typeof window !== "undefined" ? window : globalThis);
