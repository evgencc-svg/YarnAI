"use strict";

(function initializeProjectExecutionNextStepClarificationAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-execution-next-step-clarification") return;

  function startController() {
    const workspace = globalObject.YarnAIProjectExecutionNextStepClarificationWorkspace;
    if (!workspace?.createController) return;
    const controller = workspace.createController({ globalObject, document });
    globalObject.YarnAIProjectExecutionNextStepClarificationController = controller;
    controller.start().catch((error) => globalObject.console?.error?.("Next-step clarification initialization failed.", error));
  }

  if (document.readyState === "loading") globalObject.addEventListener("DOMContentLoaded", startController, { once: true });
  else startController();
})(typeof window !== "undefined" ? window : globalThis);
