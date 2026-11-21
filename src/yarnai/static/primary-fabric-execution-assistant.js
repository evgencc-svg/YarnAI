"use strict";

(function initializePrimaryFabricExecution(globalObject) {
  if (typeof document === "undefined") return;
  const run = () => {
    const workspace = globalObject.YarnAIPrimaryFabricExecutionWorkspace;
    if (!workspace?.createController) return;
    const controller = workspace.createController({ globalObject, document });
    globalObject.YarnAIPrimaryFabricExecutionController = controller;
    controller.start().catch(() => {
      const loading = document.querySelector("#primary-fabric-execution-loading");
      const content = document.querySelector("#primary-fabric-execution-content");
      const blocked = document.querySelector("#primary-fabric-execution-blocked");
      if (loading) loading.hidden = true;
      if (content) content.hidden = true;
      if (blocked) blocked.hidden = false;
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true }); else run();
})(typeof window !== "undefined" ? window : globalThis);
