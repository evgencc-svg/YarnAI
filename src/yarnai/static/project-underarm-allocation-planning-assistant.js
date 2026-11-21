"use strict";

(function bootstrapProjectUnderarmAllocationPlanning(globalObject) {
  async function start() { const workspace = globalObject.YarnAIProjectUnderarmAllocationPlanningWorkspace; if (!workspace || !globalObject.document?.querySelector("#underarm-allocation-root")) return; try { const controller = workspace.createController(); globalObject.YarnAIProjectUnderarmAllocationPlanningController = controller; await controller.start(); } catch (error) { const loading = globalObject.document.querySelector("#underarm-allocation-loading"); const panel = globalObject.document.querySelector("#underarm-allocation-blocked"); const message = globalObject.document.querySelector("#underarm-allocation-blocked-message"); if (loading) loading.hidden = true; if (panel) panel.hidden = false; if (message) message.textContent = error?.message || "Не удалось открыть Stage 83."; } }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
