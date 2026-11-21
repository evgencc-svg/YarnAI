"use strict";
(function initializeProjectNecklineOpeningExecutionAssistant(globalObject) {
  function guidance(view) {
    if (view?.blocked) return Object.freeze({ status: "blocked", message: view.diagnostic?.message || "Физическое выполнение недоступно.", actions: [] });
    if (view?.lifecycle === "ready") return Object.freeze({ status: "ready", message: "Открытие страницы ничего не меняет. Начните выполнение только рядом с изделием: старт создаст сохраняемую физическую границу и заблокирует обычную переработку плана Stage 91.", actions: ["Начать Stage 92"] });
    if (view?.lifecycle === "verifying_entry") return Object.freeze({ status: "entry", message: "Сверьте лицо полотна, текущую границу, активность и место нити, топологию и доступные петли. Подтверждайте только физически наблюдаемые факты, а не внутренние идентификаторы.", actions: ["Проверить исходное состояние"] });
    if (view?.lifecycle === "discrepancy") return Object.freeze({ status: "discrepancy", message: "Выполнение заморожено. План не исправляется автоматически: физически верните полотно к указанной подтверждённой границе и только затем создайте recovery receipt.", actions: ["Восстановить физическую границу"] });
    if (view?.lifecycle === "paused") return Object.freeze({ status: "paused", message: "Последний подтверждённый шаг сохранён. Если текущий шаг был сделан до закрытия страницы, его всё равно нужно подтвердить обычной наблюдаемой проверкой; закрытие браузера не считается прогрессом.", actions: ["Возобновить с текущего шага"] });
    if (view?.lifecycle === "terminal_verification") return Object.freeze({ status: "terminal", message: "Все шаги подтверждены. Ещё раз проверьте конечную сторону, границу, нить, плоскую топологию и петлевой баланс перед неизменяемым завершением.", actions: ["Проверить конечное состояние"] });
    if (view?.lifecycle === "completed") return Object.freeze({ status: "completed", message: "Stage 92 завершён неизменяемым физическим результатом. Следующая граница — отдельное планирование отделки края горловины; здесь оно не создавалось.", actions: [] });
    const step = view?.currentStep; return Object.freeze({ status: "executing", message: step ? `Сейчас выполните только шаг ${step.ordinal}: ${step.instruction} Помощник не меняет порядок: не объединяйте этот шаг со следующим.` : "Продолжайте только по точному потоку Stage 91 V3.", actions: ["Выполнить и физически проверить текущий шаг"] });
  }
  const api = Object.freeze({ guidance }); globalObject.YarnAIProjectNecklineOpeningExecutionAssistant = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
