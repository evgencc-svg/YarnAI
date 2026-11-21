"use strict";

(function exposePatternTechnologyReviewDecisionUi(globalObject) {
  function createDecisionButton(documentObject, options = {}) {
    if (!documentObject?.createElement || typeof options.onActivate !== "function") {
      throw new TypeError("Decision button requires a document and an activation handler.");
    }
    const button = documentObject.createElement("button");
    button.type = "button";
    button.className = "link-button";
    button.textContent = String(options.label || "");
    button.disabled = Boolean(options.disabled);
    button.dataset.stage21Action = "set-decision";
    button.dataset.targetId = String(options.targetId || "");
    button.dataset.decision = String(options.decision || "");
    button.addEventListener("click", () => options.onActivate({
      targetId: button.dataset.targetId,
      decision: button.dataset.decision,
      button,
    }));
    return button;
  }

  const api = Object.freeze({ createDecisionButton });
  globalObject.YarnAIPatternTechnologyReviewDecisionUi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
