"use strict";

(function initializePrimaryFabricPreparationAssistant(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-primary-fabric-preparation") return;
  function startController() { const workspace = globalObject.YarnAIPrimaryFabricPreparationWorkspace; if (!workspace?.createController) return; const controller = workspace.createController({ globalObject, document }); globalObject.YarnAIPrimaryFabricPreparationController = controller; controller.start().catch((error) => globalObject.console?.error?.("Primary-fabric preparation initialization failed.", error)); }
  if (document.readyState === "loading") globalObject.addEventListener("DOMContentLoaded", startController, { once: true }); else startController();
})(typeof window !== "undefined" ? window : globalThis);
