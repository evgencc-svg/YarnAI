"use strict";

(function bootstrapProjectBodyUnderarmPhysicalConfirmation(globalObject) {
  async function start() { const workspace = globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmationWorkspace; if (!workspace || !globalObject.document?.querySelector("#body-underarm-confirmation-root")) return; try { const controller = workspace.createController(); globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmationController = controller; await controller.start(); } catch (error) { const loading = globalObject.document.querySelector("#body-underarm-loading"); const panel = globalObject.document.querySelector("#body-underarm-blocked"); const message = globalObject.document.querySelector("#body-underarm-blocked-message"); if (loading) loading.hidden = true; if (panel) panel.hidden = false; if (message) message.textContent = error?.message || "Не удалось открыть Stage 82."; } }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start(); }
})(typeof window !== "undefined" ? window : globalThis);
