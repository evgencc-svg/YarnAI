"use strict";

(function startProjectNextSectionPlanning(globalObject) {
  function boot() { globalObject.YarnAIProjectNextSectionPlanningWorkspace?.createController()?.start(); }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot(); }
})(typeof window !== "undefined" ? window : globalThis);
