"use strict";

(function bootstrapProjectRaglanInterfacePlanning(globalObject) {
  async function start() { const workspace = globalObject.YarnAIProjectRaglanInterfacePlanningWorkspace; if (!workspace || !globalObject.document?.querySelector("#raglan-interface-root")) return; try { const controller = workspace.createController(); globalObject.YarnAIProjectRaglanInterfacePlanningController = controller; await controller.start(); } catch (error) { const loading = globalObject.document.querySelector("#raglan-interface-loading"); const panel = globalObject.document.querySelector("#raglan-interface-blocked"); const message = globalObject.document.querySelector("#raglan-interface-blocked-message"); if (loading) loading.hidden = true; if (panel) panel.hidden = false; if (message) message.textContent = error?.message || "Не удалось открыть Stage 86."; } }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
