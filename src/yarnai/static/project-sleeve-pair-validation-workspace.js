"use strict";

(function initializeProjectSleevePairValidationWorkspace(globalObject) {
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FIELDS = Object.freeze([
    ["actualCuffToUnderarmLengthCm", "Длина до подреза", "cm"], ["actualCuffCircumferenceCm", "Окружность манжеты", "cm"], ["actualUpperSleeveCircumferenceCm", "Окружность у подреза", "cm"], ["actualCuffStitchCount", "Петли манжеты", "stitches"], ["actualUnderarmFullTubeStitchCount", "Петли у подреза", "stitches"], ["actualIncreaseEventCount", "Прибавки", "events"], ["observedRoundCount", "Наблюдённые ряды", "rounds"],
  ]);
  function projectIdentityFromLocation(locationLike = globalObject.location) { const value = new URLSearchParams(locationLike?.search || "").get("project"); return UUID_V7.test(value || "") ? value : null; }
  function text(node, value) { if (node) node.textContent = value ?? "—"; }
  function show(node, visible) { if (node) node.hidden = !visible; }
  function format(value, unit) { if (value === null || value === undefined) return "Не наблюдалось"; if (unit === "cm") return `${value} см`; if (unit === "stitches") return `${value} п.`; if (unit === "events") return `${value}`; if (unit === "rounds") return `${value} р.`; return String(value); }
  function createFact(doc, label, value) { const wrapper = doc.createElement("div"); const term = doc.createElement("dt"); const detail = doc.createElement("dd"); text(term, label); text(detail, value); wrapper.append(term, detail); return wrapper; }

  function createController(options = {}) {
    const doc = options.document || globalObject.document; const application = options.application || globalObject.YarnAIProjectSleevePairValidationApplication;
    const projectId = options.projectId || projectIdentityFromLocation(options.location || globalObject.location); const app = options.app || application?.createController({ projectId });
    if (!doc || !app || !projectId) throw new Error("Stage 81 workspace requires a valid project and application controller.");
    const root = doc.querySelector("#sleeve-pair-validation-root"); const loading = doc.querySelector("#pair-validation-loading"); const blocked = doc.querySelector("#pair-validation-blocked"); const blockedMessage = doc.querySelector("#pair-validation-blocked-message"); const back = doc.querySelector("#pair-validation-back-to-stage80"); const content = doc.querySelector("#pair-validation-content"); const startPanel = doc.querySelector("#pair-validation-start-panel"); const reviewPanel = doc.querySelector("#pair-validation-review"); const decisionPanel = doc.querySelector("#pair-validation-decision"); const completedPanel = doc.querySelector("#pair-validation-completed"); const errorNode = doc.querySelector("#pair-validation-error"); const acceptForm = doc.querySelector("#pair-accept-form"); const reworkForm = doc.querySelector("#pair-rework-form");
    let view = null; let busy = false;
    function setBusy(value) { busy = value; root?.setAttribute("aria-busy", value ? "true" : "false"); for (const button of doc.querySelectorAll("button")) button.disabled = value; }
    function renderSleeve(slot, result) { const list = doc.querySelector(`#pair-${slot.replaceAll("_", "-")}`); if (!list) return; list.replaceChildren(); for (const [field, label, unit] of FIELDS) list.append(createFact(doc, label, format(result?.[field], unit))); list.append(createFact(doc, "Граница завершения", result?.completionBoundary === "full_sleeve_tube_at_underarm_before_allocation" ? "Полный рукав до распределения" : "Не подтверждена")); }
    function renderComparisons(next) {
      const body = doc.querySelector("#pair-comparison-rows"); body?.replaceChildren();
      for (const row of next.comparisons || []) { const tr = doc.createElement("tr"); tr.className = row.outcome === "different" ? "different" : "equal"; const values = [row.label, format(row.sleeve1Value, row.unit), format(row.sleeve2Value, row.unit), row.outcome === "equal" ? "Совпадает" : row.outcome === "not_compared" ? "Не наблюдалось у обоих" : "Отличается"]; for (const value of values) { const td = doc.createElement("td"); text(td, value); tr.append(td); } body?.append(tr); }
      const differences = next.detectedDifferences?.length || 0; text(doc.querySelector("#pair-validation-summary"), next.comparisonOutcome === "exact_match" ? "Все сохранённые фактические значения совпадают точно." : `Обнаружено различий: ${differences}. Ни одно из них не скрыто и не принято автоматически.`);
    }
    function renderCompleted(next) {
      const validation = next.currentValidation || {}; const rework = validation.status === "rework_required";
      text(doc.querySelector("#pair-validation-completed-title"), rework ? "Решение о перевязывании зафиксировано" : validation.outcome === "matched" ? "Пара подтверждена" : "Пара принята с видимыми различиями");
      text(doc.querySelector("#pair-validation-completed-message"), rework ? `Выбрано: ${(validation.reworkComponents || []).map((slot) => slot === "sleeve_1" ? "рукав 1" : "рукав 2").join(", ")}. Физический результат изменяется только через Stage 80.` : "Эта проверка относится только к двум показанным текущим результатам. Соединение деталей по-прежнему заблокировано другими prerequisite.");
      const link = doc.querySelector("#pair-validation-rework-link"); show(link, rework); if (link && rework) link.href = `${next.nextDestination.routePath}?project=${projectId}&rework=${encodeURIComponent(next.nextDestination.componentSlots.join(","))}`;
      const bodyLink = doc.querySelector("#body-underarm-confirmation-link"); show(bodyLink, !rework && next.pairValidationBoundary?.completed === true); if (bodyLink) bodyLink.href = `/project-body-underarm-physical-confirmation?project=${encodeURIComponent(projectId)}`;
    }
    function render(next) {
      view = next; show(loading, false); show(errorNode, false); show(blocked, Boolean(next?.blocked)); show(content, !next?.blocked);
      if (back) back.href = `/project-sleeve-physical-execution?project=${projectId}`;
      if (next?.blocked) { text(blockedMessage, next.diagnostic?.message); blocked?.focus?.(); return next; }
      renderSleeve("sleeve_1", next.currentSleeves?.sleeve_1); renderSleeve("sleeve_2", next.currentSleeves?.sleeve_2);
      const reviewing = next.lifecycle === "reviewing"; const completed = next.lifecycle === "completed";
      show(startPanel, next.lifecycle === "ready"); show(reviewPanel, reviewing || completed); show(decisionPanel, reviewing); show(completedPanel, completed);
      if (reviewing || completed) renderComparisons(next);
      const differs = next.comparisonOutcome === "differences_detected"; show(doc.querySelector("#pair-accept-note-label"), differs); if (doc.querySelector("#pair-accept-note")) doc.querySelector("#pair-accept-note").required = differs; text(doc.querySelector("#pair-accept-button"), differs ? "Принять видимые различия" : "Подтвердить точную пару"); show(reworkForm, reviewing && differs);
      if (completed) renderCompleted(next);
      text(doc.querySelector("#pair-validation-boundary-status"), next.pairValidationBoundary?.completed ? "Проверка текущей пары завершена. Это закрывает только prerequisite pair validation." : next.pairValidationBoundary?.status === "pair_rework_required" ? "Текущая пара требует физического перевязывания через Stage 80." : "Проверка текущей пары ещё не завершена. Соединение деталей недоступно.");
      return next;
    }
    async function perform(work) { if (busy) return null; setBusy(true); try { return render(await work()); } catch (error) { show(errorNode, true); text(errorNode, error?.userMessage || error?.message || "Не удалось сохранить решение."); return null; } finally { setBusy(false); } }
    async function start() { return perform(() => app.load(projectId)); }
    doc.querySelector("#pair-validation-start")?.addEventListener("click", () => perform(() => app.startPairReview()));
    acceptForm?.addEventListener("submit", (event) => { event.preventDefault(); const confirmation = acceptForm.elements.explicitConfirmation?.checked === true; const note = acceptForm.elements.acceptanceNote?.value?.trim() || null; perform(() => app.completePairDecision({ decision: "accept_pair", acceptanceNote: note, reworkComponents: [], explicitConfirmation: confirmation })); });
    reworkForm?.addEventListener("submit", (event) => { event.preventDefault(); const slots = ["sleeve_1", "sleeve_2"].filter((slot) => reworkForm.elements[slot]?.checked); const confirmation = reworkForm.elements.explicitConfirmation?.checked === true; perform(() => app.completePairDecision({ decision: "rework", acceptanceNote: null, reworkComponents: slots, explicitConfirmation: confirmation })); });
    return Object.freeze({ start, render, getState: () => ({ projectId, view, busy }), close: () => app.close?.() });
  }

  const api = Object.freeze({ projectIdentityFromLocation, format, createController });
  globalObject.YarnAIProjectSleevePairValidationWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
