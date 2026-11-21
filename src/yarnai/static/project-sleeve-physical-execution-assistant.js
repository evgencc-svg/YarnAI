"use strict";

(function bootstrapProjectSleevePhysicalExecution(globalObject) {
  async function start() { const workspace = globalObject.YarnAIProjectSleevePhysicalExecutionWorkspace; if (!workspace || !globalObject.document?.querySelector("#sleeve-execution-root")) return; try { const controller = workspace.createController(); globalObject.YarnAIProjectSleevePhysicalExecutionController = controller; await controller.start(); } catch (error) { const node = globalObject.document.querySelector("#sleeve-execution-blocked-message"); const panel = globalObject.document.querySelector("#sleeve-execution-blocked"); const loading = globalObject.document.querySelector("#sleeve-execution-loading"); if (loading) loading.hidden = true; if (panel) panel.hidden = false; if (node) node.textContent = error?.message || "Не удалось открыть физическое выполнение рукавов."; } }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
