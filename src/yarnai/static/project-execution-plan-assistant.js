"use strict";

(function startProjectExecutionPlan(globalObject) {
  if (typeof document === "undefined" || globalObject.location.pathname !== "/project-execution-plan") return;
  const workspace = globalObject.YarnAIProjectExecutionPlanWorkspace;
  const blocked = document.querySelector("#blocked-summary");
  if (!workspace) {
    document.querySelector("#loading-state").hidden = true; document.querySelector("#blocked-state").hidden = false;
    blocked.textContent = "Экран плана загружен не полностью. Обновите страницу."; blocked.focus(); return;
  }
  const controller = workspace.createController(); globalObject.YarnAIProjectExecutionPlanController = controller;
  controller.start().then(() => {
    const state = controller.getState();
    if (!state.projectId || !state.progressState?.history?.length) return;
    const destination = globalObject.YarnAIProjectExecutionPlan.safeDestination(
      `/project-execution-start?project=${encodeURIComponent(state.projectId)}`,
      state.projectId,
    );
    if (!destination.valid) return;
    const completed = document.querySelector("#completed-section");
    const oldButton = completed?.querySelector("button[aria-describedby='execution-disabled-reason']");
    if (oldButton) oldButton.hidden = true;
    const reason = document.querySelector("#execution-disabled-reason");
    if (reason) reason.textContent = "Начало будет зафиксировано только после отдельного подтверждения готовности.";
    if (!document.querySelector("#execution-start-link") && completed) {
      const link = document.createElement("a");
      link.id = "execution-start-link";
      link.className = "button";
      link.href = destination.href;
      link.textContent = "Подготовиться к началу";
      completed.insertBefore(link, reason || null);
    }
  }).catch((error) => {
    document.querySelector("#loading-state").hidden = true; document.querySelector("#ready-state").hidden = true; document.querySelector("#blocked-state").hidden = false;
    controller.renderBlocked(error);
  });
})(typeof window !== "undefined" ? window : globalThis);
