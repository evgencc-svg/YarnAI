"use strict";

(function initializeProjectSleevePhysicalExecutionWorkspace(globalObject) {
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  function projectIdentityFromLocation(locationLike = globalObject.location) { const value = new URLSearchParams(locationLike?.search || "").get("project"); return UUID_V7.test(value || "") ? value : null; }
  function text(node, value) { if (node) node.textContent = value ?? "—"; }
  function formatCm(value) { return value === null || value === undefined ? "—" : `${value} см`; }
  function show(node, visible) { if (node) node.hidden = !visible; }
  function numberValue(form, name) { const value = form.elements[name]?.value?.trim(); return value === "" ? undefined : value; }

  function createController(options = {}) {
    const doc = options.document || globalObject.document; const application = options.application || globalObject.YarnAIProjectSleevePhysicalExecutionApplication;
    const projectId = options.projectId || projectIdentityFromLocation(options.location || globalObject.location); const app = options.app || application?.createController({ projectId });
    if (!doc || !app || !projectId) throw new Error("Stage 80 workspace requires a valid project and application controller.");
    const root = doc.querySelector("#sleeve-execution-root"); const loading = doc.querySelector("#sleeve-execution-loading"); const blocked = doc.querySelector("#sleeve-execution-blocked"); const blockedMessage = doc.querySelector("#sleeve-execution-blocked-message"); const newPreparation = doc.querySelector("#sleeve-execution-new-preparation"); const content = doc.querySelector("#sleeve-execution-content"); const errorNode = doc.querySelector("#sleeve-execution-error"); const pair = doc.querySelector("#sleeve-pair-status"); const pairLink = doc.querySelector("#sleeve-pair-validation-link");
    let view = null; let busy = false;
    function setBusy(value) { busy = value; root?.setAttribute("aria-busy", value ? "true" : "false"); for (const button of doc.querySelectorAll("button")) button.disabled = value; }
    function renderPlan(preparation) {
      const planned = preparation?.planned || {}; text(doc.querySelector("#planned-cuff-stitches"), planned.cuffStitchCount); text(doc.querySelector("#planned-upper-stitches"), planned.underarmFullTubeStitchCount); text(doc.querySelector("#planned-length"), formatCm(planned.cuffToUnderarmLengthCm)); text(doc.querySelector("#planned-increases"), planned.increaseEventCount); text(doc.querySelector("#planned-patterns"), `${preparation?.context?.cuffPattern || "—"} → ${preparation?.context?.mainPattern || "—"}`);
    }
    function draftIntoForm(form, draft) {
      if (!form || form.dataset.dirty === "true") return; const value = draft || {};
      for (const name of ["actualCuffStitchCount", "actualUnderarmFullTubeStitchCount", "actualCuffToUnderarmLengthCm", "actualCuffCircumferenceCm", "actualUpperSleeveCircumferenceCm", "actualIncreaseEventCount", "observedRoundCount", "deviationNote"]) if (form.elements[name]) form.elements[name].value = value[name] ?? "";
      if (form.elements.completionBoundary) form.elements.completionBoundary.checked = value.completionBoundary === "full_sleeve_tube_at_underarm_before_allocation";
    }
    function renderComponent(slot, component) {
      const card = doc.querySelector(`[data-sleeve-card="${slot}"]`); if (!card || !component) return; card.dataset.lifecycle = component.lifecycle;
      text(card.querySelector("[data-role=status]"), ({ ready: "Готов к началу", in_progress: "В работе", paused: "Пауза", target_reached: "Целевая граница достигнута", reviewing_result: "Проверка фактического результата", completed: "Рукав завершён" })[component.lifecycle] || component.lifecycle);
      const actions = new Set(component.actions || []); for (const node of card.querySelectorAll("[data-action]")) show(node, actions.has(node.dataset.action));
      const cuffForm = card.querySelector("[data-role=cuff-form]"); show(cuffForm, actions.has("confirm_cuff_count"));
      const resultForm = card.querySelector("[data-role=result-form]"); show(resultForm, actions.has("edit_result_draft")); draftIntoForm(resultForm, component.resultDraft);
      text(card.querySelector("[data-role=progress]"), component.progress ? `Манжета: ${component.progress.actualCuffStitchCount ?? "не посчитана"} · прибавок отмечено: ${component.progress.shapingEventsRecorded}/${component.progress.plannedIncreaseEventCount}` : "Физическое выполнение ещё не начато.");
      const result = component.completedResult; const resultBox = card.querySelector("[data-role=result]"); show(resultBox, Boolean(result)); if (result) text(resultBox, `Фактически: ${result.actualCuffStitchCount} п. у манжеты, ${result.actualUnderarmFullTubeStitchCount} п. перед распределением подреза, длина ${formatCm(result.actualCuffToUnderarmLengthCm)}, окружности ${formatCm(result.actualCuffCircumferenceCm)} / ${formatCm(result.actualUpperSleeveCircumferenceCm)}, прибавок ${result.actualIncreaseEventCount}.`);
    }
    function render(next) {
      view = next; show(loading, false); show(blocked, Boolean(next?.blocked)); show(content, !next?.blocked); show(errorNode, false); show(newPreparation, Boolean(next?.canStartNewPreparation)); if (next?.blocked) { text(blockedMessage, next.diagnostic?.message); blocked?.focus?.(); return next; }
      renderPlan(next.preparation); renderComponent("sleeve_1", next.components?.sleeve_1); renderComponent("sleeve_2", next.components?.sleeve_2);
      const pairReady = next.lifecycle === "awaiting_pair_validation"; text(pair, pairReady ? "Оба фактических результата сохранены. Теперь проверьте именно эту текущую пару; соединение деталей остаётся заблокировано." : "Результаты рукавов сохраняются независимо. Проверка пары и соединение деталей на этом этапе не выполняются."); show(pairLink, pairReady); if (pairLink) pairLink.href = `/project-sleeve-pair-validation?project=${projectId}`; return next;
    }
    async function perform(work) { if (busy) return null; setBusy(true); try { return render(await work()); } catch (error) { show(errorNode, true); text(errorNode, error?.userMessage || error?.message || "Не удалось сохранить действие."); return null; } finally { setBusy(false); } }
    async function start() { return perform(() => app.load(projectId)); }
    async function act(slot, action, node) {
      if (action === "start_component") return perform(() => app.startComponent(slot));
      if (action === "record_shaping_event") return perform(() => app.recordShapingEvent(slot));
      if (action === "pause_component") return perform(() => app.pauseComponent(slot));
      if (action === "resume_component") return perform(() => app.resumeComponent(slot));
      if (action === "declare_target_reached") return perform(() => app.declareTargetReached(slot));
      if (action === "open_result_review") return perform(() => app.openResultReview(slot));
      if (action === "return_to_work") return perform(() => app.returnToWork(slot));
      if (action === "complete_component") return perform(() => app.completeComponent(slot));
      if (action === "start_component_rework") return perform(() => app.startComponentRework(slot));
      return null;
    }
    for (const card of doc.querySelectorAll("[data-sleeve-card]")) {
      const slot = card.dataset.sleeveCard;
      card.addEventListener("click", (event) => { const button = event.target.closest?.("[data-action]"); if (button && card.contains(button)) act(slot, button.dataset.action, button); });
      const cuffForm = card.querySelector("[data-role=cuff-form]"); cuffForm?.addEventListener("submit", (event) => { event.preventDefault(); const value = numberValue(cuffForm, "actualCuffStitchCount"); if (value !== undefined) perform(() => app.confirmCuffCount(slot, value)); });
      const resultForm = card.querySelector("[data-role=result-form]"); resultForm?.addEventListener("input", () => { resultForm.dataset.dirty = "true"; }); resultForm?.addEventListener("submit", (event) => {
        event.preventDefault(); const boundary = resultForm.elements.completionBoundary?.checked ? "full_sleeve_tube_at_underarm_before_allocation" : undefined;
        const draft = { actualCuffStitchCount: numberValue(resultForm, "actualCuffStitchCount"), actualUnderarmFullTubeStitchCount: numberValue(resultForm, "actualUnderarmFullTubeStitchCount"), actualCuffToUnderarmLengthCm: numberValue(resultForm, "actualCuffToUnderarmLengthCm"), actualCuffCircumferenceCm: numberValue(resultForm, "actualCuffCircumferenceCm"), actualUpperSleeveCircumferenceCm: numberValue(resultForm, "actualUpperSleeveCircumferenceCm"), actualIncreaseEventCount: numberValue(resultForm, "actualIncreaseEventCount"), completionBoundary: boundary, observedRoundCount: numberValue(resultForm, "observedRoundCount") ?? null, deviationNote: resultForm.elements.deviationNote?.value || null };
        if (Object.values(draft).some((value) => value === undefined)) { show(errorNode, true); text(errorNode, "Заполните все обязательные фактические поля и подтвердите границу перед распределением подреза."); return; }
        resultForm.dataset.dirty = "false"; perform(() => app.editResultDraft(slot, draft));
      });
    }
    newPreparation?.addEventListener("click", () => perform(() => app.startSupersedingPreparation("sleeve_1")));
    return Object.freeze({ start, render, getState: () => ({ projectId, view, busy }), close: () => app.close?.() });
  }

  const api = Object.freeze({ projectIdentityFromLocation, formatCm, createController });
  globalObject.YarnAIProjectSleevePhysicalExecutionWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
