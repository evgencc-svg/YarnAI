"use strict";

(function bootstrapProjectBodySleevesJoinExecution(globalObject) {
  async function start() { const workspace = globalObject.YarnAIProjectBodySleevesJoinExecutionWorkspace; if (!workspace || !globalObject.document?.querySelector("#body-sleeves-join-root")) return; try { const controller = workspace.createController(); globalObject.YarnAIProjectBodySleevesJoinExecutionController = controller; await controller.start(); } catch (error) { const loading = globalObject.document.querySelector("#body-sleeves-join-loading"); const panel = globalObject.document.querySelector("#body-sleeves-join-blocked"); const message = globalObject.document.querySelector("#body-sleeves-join-blocked-message"); if (loading) loading.hidden = true; if (panel) panel.hidden = false; if (message) message.textContent = error?.message || "Не удалось открыть Stage 87."; } }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
