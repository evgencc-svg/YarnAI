"use strict";

(function initializeProjectNecklineOpeningPlanningAssistant(globalObject) {
  function projectInstruction(view) {
    if (!view || view.blocked) return Object.freeze({ status: "blocked", message: view?.diagnostic?.message || "Планирование горловины пока недоступно.", actions: [] });
    if (/^v[12]_execution_ineligible$/.test(view.lifecycle)) return Object.freeze({ status: "legacy-read-only", message: view.diagnostic?.message || "Исторический план доступен только для чтения. Создайте V3 с единым физическим порядком.", actions: ["Создать исполнимый план V3"] });
    if (view.lifecycle === "completed") return Object.freeze({ status: "completed", message: `Неизменяемый план V3 сохранён: ${view.completed?.executionSteps?.length || 0} физических шагов образуют один непрерывный порядок с точным состоянием нити и полотна после каждого шага.`, actions: [] });
    if (view.missingChoices?.length) return Object.freeze({ status: "choices", message: "Уточните форму, размеры и способ открытия. Физическая граница реглана и плотность уже взяты из подтверждённой истории.", actions: ["Сохранить решения"] });
    if (view.review?.requiresCandidateSelection) return Object.freeze({ status: "candidate", message: "Есть несколько точных целочисленных вариантов. Выберите один явно — YarnAI не округляет физическую геометрию молча.", actions: ["Выбрать точную геометрию"] });
    if (view.review?.selected) {
      const first = view.review.selected.executionSteps[0];
      return Object.freeze({ status: "review", message: `Шаг 1 из ${view.review.selected.executionSteps.length}: ${first.instruction} Начало: ${first.from}; конец: ${first.to}; ${first.face === "RS" ? "лицевая" : "изнаночная"} сторона; нить после шага у ${first.yarnAfter.location}. Дальше выполняйте строго по линейному списку без объединения отдельных действий.`, actions: ["Подтвердить неизменяемый план V3"] });
    }
    return Object.freeze({ status: "ready", message: "Создайте план V3, связанный с текущей подтверждённой физической границей реглана.", actions: ["Начать планирование"] });
  }

  async function start() {
    const workspace = globalObject.YarnAIProjectNecklineOpeningPlanningWorkspace;
    if (!workspace || !globalObject.document?.querySelector("#neckline-opening-root")) return;
    try {
      const controller = workspace.createController();
      globalObject.YarnAIProjectNecklineOpeningPlanningController = controller;
      await controller.start();
    } catch (error) {
      const loading = globalObject.document.querySelector("#neckline-opening-loading");
      const blocked = globalObject.document.querySelector("#neckline-opening-blocked");
      const message = globalObject.document.querySelector("#neckline-opening-blocked-message");
      if (loading) loading.hidden = true;
      if (blocked) blocked.hidden = false;
      if (message) message.textContent = error?.message || "Не удалось открыть планирование горловины.";
    }
  }

  const api = Object.freeze({ projectInstruction });
  globalObject.YarnAIProjectNecklineOpeningPlanningAssistant = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : globalThis);
