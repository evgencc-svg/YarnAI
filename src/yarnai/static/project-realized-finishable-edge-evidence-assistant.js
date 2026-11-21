"use strict";

(function initializeProjectRealizedFinishableEdgeEvidenceAssistant(globalObject) {
  function guidance(view) {
    if (view?.blocked) return { tone: "blocked", message: "Сначала восстановите текущую подтверждённую границу Stage 92. Исторические или неполные результаты нельзя превращать в физические кромки автоматически." };
    if (view?.lifecycle === "ready" || view?.lifecycle === "collecting_edge_evidence") return { tone: "action", message: "Инвентаризируйте только реально видимые дискретные единицы: петли, закрытые петли, концы рядов и переходы убавок. Не подставляйте сантиметры или плотность основного полотна." };
    if (view?.lifecycle === "reviewing_edge_evidence") return { tone: "review", message: "Сверьте физический порядок, маркеры углов, владельца каждого source unit и зоны neckline/polo. Совпадение приблизительно не принимается." };
    if (view?.lifecycle === "completed") return { tone: "complete", message: "Физическая topology доказана и неизменяема. Finishing gauge всё ещё отсутствует и должен быть подтверждён отдельным versioned evidence в будущем Stage 93." };
    return { tone: "neutral", message: "Эта boundary только доказывает физические кромки; она не поднимает петли и не планирует отделку." };
  }
  const api = Object.freeze({ guidance }); globalObject.YarnAIProjectRealizedFinishableEdgeEvidenceAssistant = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
