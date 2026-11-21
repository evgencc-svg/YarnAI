"use strict";

(function initializeFoundationSectionExecution(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-foundation-section-execution") return;
  const run = () => {
    const workspace = globalObject.YarnAIFoundationSectionExecutionWorkspace;
    if (!workspace) return;
    const controller = workspace.createController();
    controller.start().catch(() => {
      const loading = document.querySelector("#foundation-execution-loading"); const blocked = document.querySelector("#foundation-execution-blocked");
      if (loading) loading.hidden = true; if (blocked) blocked.hidden = false;
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true }); else run();
})(typeof window !== "undefined" ? window : globalThis);
