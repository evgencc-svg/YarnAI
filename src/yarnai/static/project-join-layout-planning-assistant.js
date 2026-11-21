"use strict";

(function bootstrapProjectJoinLayoutPlanning(globalObject) {
  async function start() { const workspace = globalObject.YarnAIProjectJoinLayoutPlanningWorkspace; if (!workspace || !globalObject.document?.querySelector("#join-layout-root")) return; try { const controller = workspace.createController(); globalObject.YarnAIProjectJoinLayoutPlanningController = controller; await controller.start(); } catch (error) { const loading = globalObject.document.querySelector("#join-layout-loading"); const panel = globalObject.document.querySelector("#join-layout-blocked"); const message = globalObject.document.querySelector("#join-layout-blocked-message"); if (loading) loading.hidden = true; if (panel) panel.hidden = false; if (message) message.textContent = error?.message || "Не удалось открыть Stage 84."; } }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
