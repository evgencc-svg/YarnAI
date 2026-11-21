"use strict";
(function initializeFoundationPreparation(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-foundation-section-preparation") return;
  function start() {
    const workspace = globalObject.YarnAIFoundationSectionExecutionPreparationWorkspace;
    if (!workspace?.createController) return;
    const controller = workspace.createController({ globalObject, document });
    globalObject.YarnAIFoundationSectionExecutionPreparationController = controller;
    controller.start().catch((error) => globalObject.console?.error?.("Foundation preparation initialization failed.", error));
  }
  if (document.readyState === "loading") globalObject.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})(typeof window !== "undefined" ? window : globalThis);
