"use strict";

(function initializePrimaryFabricMeasurement(globalObject) {
  if (typeof document === "undefined") return;
  const run = () => { const workspace = globalObject.YarnAIPrimaryFabricMeasurementWorkspace; if (!workspace) return; const controller = workspace.createController({ globalObject, document }); globalObject.YarnAIPrimaryFabricMeasurementController = controller; controller.start().catch(() => undefined); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true }); else run();
})(typeof window !== "undefined" ? window : globalThis);
