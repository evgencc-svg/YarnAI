"use strict";

(function bootstrapProjectSleevePairValidation(globalObject) {
  async function start() { const workspace = globalObject.YarnAIProjectSleevePairValidationWorkspace; if (!workspace || !globalObject.document?.querySelector("#sleeve-pair-validation-root")) return; try { const controller = workspace.createController(); globalObject.YarnAIProjectSleevePairValidationController = controller; await controller.start(); } catch (error) { const node = globalObject.document.querySelector("#pair-validation-blocked-message"); const panel = globalObject.document.querySelector("#pair-validation-blocked"); const loading = globalObject.document.querySelector("#pair-validation-loading"); if (loading) loading.hidden = true; if (panel) panel.hidden = false; if (node) node.textContent = error?.message || "Не удалось открыть проверку пары рукавов."; } }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
