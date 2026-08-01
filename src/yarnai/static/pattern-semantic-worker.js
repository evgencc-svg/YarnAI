"use strict";

importScripts("/static/pattern-semantic-rules.js");

self.onmessage = (event) => {
  try {
    const result = self.YarnAIPatternSemanticRules.analyzeExtraction(event.data?.extraction);
    self.postMessage({ ok: true, result });
  } catch {
    self.postMessage({ ok: false });
  }
};
