"use strict";

(function initializeProjectBodyUnderarmPhysicalConfirmationWorkspace(globalObject) {
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  function projectIdentityFromLocation(locationLike = globalObject.location) { const params = new URLSearchParams(locationLike?.search || ""); const value = params.get("project"); return params.getAll("project").length === 1 && [...params.keys()].length === 1 && UUID_V7.test(value || "") ? value : null; }
  function text(node, value) { if (node) node.textContent = value ?? "—"; }
  function show(node, visible) { if (node) node.hidden = !visible; }
  function cm(value) { return value === null || value === undefined ? "—" : `${value} см`; }
  function stitches(value) { return value === null || value === undefined ? "—" : `${value} п.`; }
  function positiveInteger(value) { const textValue = String(value || "").trim(); return /^\d+$/.test(textValue) && Number.isSafeInteger(Number(textValue)) && Number(textValue) > 0 ? Number(textValue) : null; }

  function createController(options = {}) {
    const doc = options.document || globalObject.document; const application = options.application || globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmationApplication; const projectId = options.projectId || projectIdentityFromLocation(options.location || globalObject.location); const app = options.app || application?.createController({ projectId });
    if (!doc || !app || !projectId) throw new Error("Stage 82 workspace requires one safe project parameter and application controller.");
    const root = doc.querySelector("#body-underarm-confirmation-root"); const loading = doc.querySelector("#body-underarm-loading"); const blocked = doc.querySelector("#body-underarm-blocked"); const content = doc.querySelector("#body-underarm-content"); const question = doc.querySelector("#body-underarm-question"); const work = doc.querySelector("#body-underarm-work"); const review = doc.querySelector("#body-underarm-review"); const draftPanel = doc.querySelector("#body-underarm-draft"); const completed = doc.querySelector("#body-underarm-completed"); const errorNode = doc.querySelector("#body-underarm-error"); const form = doc.querySelector("#body-underarm-result-form"); let view = null; let busy = false;
    function setBusy(value) { busy = value; root?.setAttribute("aria-busy", value ? "true" : "false"); for (const button of doc.querySelectorAll("button")) button.disabled = value; }
    function context(next) { const value = next.context || {}; text(doc.querySelector("#body-context-planned-count"), stitches(value.plannedBodyFullTubeStitchCount)); text(doc.querySelector("#body-context-foundation-height"), cm(value.foundationHeightCm)); text(doc.querySelector("#body-context-primary-height"), cm(value.primaryFabricHeightCm)); text(doc.querySelector("#body-context-orientation"), `${cm(value.orientationUnderarmHeightCm)} · только ориентир`); text(doc.querySelector("#body-context-sleeve-1"), stitches(value.sleevePair?.actualUnderarmFullTubeStitchCounts?.sleeve_1)); text(doc.querySelector("#body-context-sleeve-2"), stitches(value.sleevePair?.actualUnderarmFullTubeStitchCounts?.sleeve_2)); }
    function render(next) {
      view = next; show(loading, false); show(errorNode, false); show(blocked, Boolean(next?.blocked)); show(content, !next?.blocked); const back = doc.querySelector("#body-underarm-back"); if (back) back.href = `/project-sleeve-pair-validation?project=${encodeURIComponent(projectId)}`;
      if (next?.blocked) { text(doc.querySelector("#body-underarm-blocked-message"), next.diagnostic?.message); blocked?.focus?.(); return next; }
      context(next); show(question, next.lifecycle === "ready"); show(work, ["in_progress", "paused"].includes(next.lifecycle)); show(review, next.lifecycle === "reviewing_result"); show(completed, next.lifecycle === "completed"); show(doc.querySelector("#body-underarm-pause"), next.lifecycle === "in_progress"); show(doc.querySelector("#body-underarm-reached"), next.lifecycle === "in_progress"); show(doc.querySelector("#body-underarm-resume"), next.lifecycle === "paused"); const allocationLink = doc.querySelector("#underarm-allocation-planning-link"); show(allocationLink, next.lifecycle === "completed"); if (allocationLink) allocationLink.href = `/project-underarm-allocation-planning?project=${encodeURIComponent(projectId)}`;
      if (next.resultDraft) { show(draftPanel, true); text(doc.querySelector("#body-result-height"), cm(next.resultDraft.actualBodyHeightAtUnderarmCm)); text(doc.querySelector("#body-result-count"), stitches(next.resultDraft.actualBodyFullTubeStitchCount)); } else show(draftPanel, false);
      if (next.completedResult) { text(doc.querySelector("#body-completed-height"), cm(next.completedResult.actualBodyHeightAtUnderarmCm)); text(doc.querySelector("#body-completed-count"), stitches(next.completedResult.actualBodyFullTubeStitchCount)); }
      return next;
    }
    async function perform(action) { if (busy) return null; setBusy(true); try { return render(await action()); } catch (error) { show(errorNode, true); text(errorNode, error?.userMessage || error?.message || "Не удалось сохранить физическое подтверждение."); return null; } finally { setBusy(false); } }
    async function start() { return perform(() => app.load(projectId)); }
    doc.querySelector("#body-underarm-yes")?.addEventListener("click", () => perform(() => app.confirmAlreadyAtBoundary()));
    doc.querySelector("#body-underarm-no")?.addEventListener("click", () => perform(() => app.startOrContinueBodyWork()));
    doc.querySelector("#body-underarm-pause")?.addEventListener("click", () => perform(() => app.pause()));
    doc.querySelector("#body-underarm-resume")?.addEventListener("click", () => perform(() => app.resume()));
    doc.querySelector("#body-underarm-reached")?.addEventListener("click", () => perform(() => app.declareBoundaryReached()));
    doc.querySelector("#body-underarm-return")?.addEventListener("click", () => perform(() => app.returnToWork()));
    form?.addEventListener("submit", (event) => { event.preventDefault(); const count = positiveInteger(form.elements.actualBodyFullTubeStitchCount?.value); if (count === null) { show(errorNode, true); text(errorNode, "Введите фактически посчитанное положительное целое количество петель."); return; } perform(() => app.editResultDraft({ actualBodyHeightAtUnderarmCm: form.elements.actualBodyHeightAtUnderarmCm?.value, actualBodyFullTubeStitchCount: count, heightMeasurementPath: "lower_body_edge_to_underarm_boundary", physicalBoundaryExplicit: form.elements.physicalBoundaryExplicit?.checked === true, underarmStitchesHeldOrRemoved: form.elements.preallocationExplicit?.checked === true ? false : true, deviationNote: form.elements.deviationNote?.value?.trim() || null })); });
    doc.querySelector("#body-underarm-complete")?.addEventListener("click", () => perform(() => app.completeConfirmation({ explicitConfirmation: doc.querySelector("#body-underarm-final-confirmation")?.checked === true })));
    doc.querySelector("#body-underarm-rework")?.addEventListener("click", () => perform(() => app.startBodyRework({ alreadyAtBoundary: false })));
    return Object.freeze({ start, render, getState: () => ({ projectId, view, busy }), close: () => app.close?.() });
  }
  const api = Object.freeze({ projectIdentityFromLocation, positiveInteger, cm, stitches, createController }); globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmationWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
