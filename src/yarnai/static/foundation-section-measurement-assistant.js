"use strict";

(function initializeFoundationSectionMeasurement(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-foundation-section-measurement") return;
  const run = () => { const workspace = globalObject.YarnAIFoundationSectionMeasurementWorkspace; if (!workspace) return; workspace.createController().start().catch(() => { const loading = document.querySelector("#foundation-measurement-loading"); const blocked = document.querySelector("#foundation-measurement-blocked"); if (loading) loading.hidden = true; if (blocked) blocked.hidden = false; }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true }); else run();
})(typeof window !== "undefined" ? window : globalThis);

