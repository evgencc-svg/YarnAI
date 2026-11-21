"use strict";

(function initializeProjectNecklineOpeningExecutionWorkspace(globalObject) {
  function projectIdentityFromLocation(locationLike) { const values = new URLSearchParams(locationLike?.search || "").getAll("project"); return values.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(values[0]) ? values[0] : null; }
  function text(node, value) { if (node) node.textContent = value ?? "—"; }
  function show(node, visible) { if (node) node.hidden = !visible; }
  function describeObservation(value) {
    if (!value) return [];
    const ranges = value.activeRanges?.map((item) => `${item.identity}: ${item.count} п.`).join(", ") || "нет"; const held = value.heldRanges?.map((item) => `${item.identity}: ${item.count} п.`).join(", ") || "нет";
    return [
      `Сторона: ${value.face}; направление: ${value.direction}; текущая граница: ${value.currentBoundary}.`,
      `Нить: ${value.yarn.active ? "активна" : "неактивна"}${value.yarn.sourceIdentity ? ` (${value.yarn.sourceIdentity})` : ""}; находится у ${value.yarn.location}.`,
      `Полотно: ${value.topology.type === "cyclic" ? "по кругу" : "плоское"}; активное начало круга: ${value.topology.activeBorIdentity || "нет"}; края открытия: ${value.topology.openingEdgeIdentities?.join(", ") || "ещё не созданы"}.`,
      `Активные диапазоны: ${ranges}. Отложенные группы: ${held}.`,
      `Петли: активно ${value.stitchLedger.workingActive}, горловина отложено ${value.stitchLedger.necklineHeld}, подрезы ${value.stitchLedger.underarmHeld}, всего живых ${value.stitchLedger.totalLive}, закрыто ${value.stitchLedger.boundOff}, убавлено ${value.stitchLedger.decreased}.`,
    ];
  }
  function renderFacts(doc, containerId, value) { const list = doc.querySelector(`#${containerId}`); list?.replaceChildren(); for (const fact of describeObservation(value)) { const item = doc.createElement("li"); item.textContent = fact; list?.appendChild(item); } }
  function promptForKind(kind) {
    const prompts = {
      yarn_break: "Проверьте, что рабочая нить оборвана, неактивна, а последний контакт остался у указанной границы.",
      yarn_deactivate: "Проверьте, что указанная нить больше не активна.",
      yarn_join: "Проверьте место присоединения новой нити; она пока не должна быть активной.",
      yarn_activate: "Проверьте, что присоединённая нить стала рабочей именно у указанной границы.",
      traverse: "Проверьте достигнутую границу, сторону полотна, направление, положение нити и число активных петель.",
      decrease: "Пересчитайте убавленные и оставшиеся активные петли, затем проверьте границу и положение нити.",
      bind_off: "Пересчитайте ровно закрытые петли, оставшиеся живые петли, новый край открытия и положение нити.",
      hold: "Проверьте число отложенных петель, оставшиеся активные диапазоны и их положение.",
      turn: "Проверьте новую сторону полотна, обратное направление и ту же физическую границу.",
      no_turn: "Проверьте, что поворота не было и сторона полотна не изменилась.",
      stop: "Проверьте конечную границу, сторону, направление и положение рабочей нити.",
    }; return prompts[kind] || "Проверьте каждый показанный физически наблюдаемый факт.";
  }
  function createController(options = {}) {
    const doc = options.document || globalObject.document; const application = options.application || globalObject.YarnAIProjectNecklineOpeningExecutionApplication; const assistant = options.assistant || globalObject.YarnAIProjectNecklineOpeningExecutionAssistant; const projectId = options.projectId || projectIdentityFromLocation(options.location || globalObject.location); const app = options.app || application?.createController({ projectId }); if (!doc || !app || !projectId) throw new Error("Stage 92 workspace requires one safe project parameter and application controller.");
    const root = doc.querySelector("#neckline-execution-root"); const loading = doc.querySelector("#neckline-execution-loading"); const blocked = doc.querySelector("#neckline-execution-blocked"); const content = doc.querySelector("#neckline-execution-content"); const errorNode = doc.querySelector("#neckline-execution-error"); let view = null; let busy = false;
    function setBusy(value) { busy = value; root?.setAttribute("aria-busy", value ? "true" : "false"); for (const button of doc.querySelectorAll("button")) button.disabled = value; }
    function renderDiscrepancy(items) { const list = doc.querySelector("#neckline-execution-discrepancy-list"); list?.replaceChildren(); for (const item of items || []) { const card = doc.createElement("article"); card.className = "discrepancy-card"; const title = doc.createElement("h3"); title.textContent = "Физическое состояние не совпало с планом"; const expected = doc.createElement("p"); expected.textContent = `Ожидалось: ${describeObservation(item.expected).join(" ")}`; const observed = doc.createElement("p"); observed.textContent = `Указано: ${describeObservation(item.observed).join(" ")}`; const reason = doc.createElement("p"); reason.textContent = "Продолжение заблокировано: Stage 92 не применяет допуск и не исправляет план. Физически верните полотно к показанной безопасной границе."; const label = doc.createElement("label"); label.className = "confirmation"; const checkbox = doc.createElement("input"); checkbox.type = "checkbox"; label.append(checkbox, " Я физически восстановила полотно и проверила все наблюдаемые факты."); const button = doc.createElement("button"); button.type = "button"; button.className = "button"; button.textContent = "Подтвердить физическое восстановление"; button.addEventListener("click", () => { if (!checkbox.checked) return; perform(() => app.resolveDiscrepancy({ discrepancyIdentity: item.identity, observedRestoredState: item.recoveryExpected, explicitPhysicalRestoration: true })); }); card.append(title, expected, observed, reason, label, button); list?.appendChild(card); } }
    function render(next) {
      view = next; show(loading, false); show(errorNode, false); show(blocked, Boolean(next?.blocked)); show(content, !next?.blocked); const back = doc.querySelector("#neckline-execution-back"); if (back) back.href = `/project-neckline-opening-planning?project=${encodeURIComponent(projectId)}`; if (next?.blocked) { text(doc.querySelector("#neckline-execution-blocked-message"), next.diagnostic?.message); blocked?.focus?.(); return next; }
      text(doc.querySelector("#neckline-execution-progress"), `${next.progress.completedSteps} из ${next.progress.totalSteps} физических шагов · ${next.progress.completedInstructions} из ${next.progress.totalInstructions} инструкций`);
      show(doc.querySelector("#neckline-execution-start"), next.lifecycle === "ready"); show(doc.querySelector("#neckline-execution-entry"), next.lifecycle === "verifying_entry"); show(doc.querySelector("#neckline-execution-current"), next.lifecycle === "executing"); show(doc.querySelector("#neckline-execution-paused"), next.lifecycle === "paused"); show(doc.querySelector("#neckline-execution-discrepancy"), next.lifecycle === "discrepancy"); show(doc.querySelector("#neckline-execution-terminal"), next.lifecycle === "terminal_verification"); show(doc.querySelector("#neckline-execution-completed"), next.lifecycle === "completed");
      if (next.expectedEntry) renderFacts(doc, "neckline-execution-entry-facts", next.expectedEntry);
      if (next.currentStep) { const step = next.currentStep; text(doc.querySelector("#neckline-execution-instruction-number"), `Инструкция ${next.currentInstruction.ordinal} из ${next.currentInstruction.total} · шаг ${next.currentInstruction.stepOrdinalInInstruction} из ${next.currentInstruction.stepsInInstruction}`); text(doc.querySelector("#neckline-execution-step-number"), `Общий шаг ${step.ordinal} из ${next.progress.totalSteps}`); text(doc.querySelector("#neckline-execution-action"), step.instruction); text(doc.querySelector("#neckline-execution-orientation"), `${step.face} · ${step.direction || "без направления"} · ${step.from} → ${step.to}`); text(doc.querySelector("#neckline-execution-effects"), `${step.yarnEffect}. ${step.fabricEffect}.`); text(doc.querySelector("#neckline-execution-confirm-prompt"), promptForKind(step.kind)); renderFacts(doc, "neckline-execution-step-facts", step.expectedResult); const confirm = doc.querySelector("#neckline-execution-step-confirm"); if (confirm) confirm.checked = false; }
      renderDiscrepancy(next.unresolvedDiscrepancies);
      if (next.lifecycle === "terminal_verification") { const terminal = next.terminalVerification; renderFacts(doc, "neckline-execution-terminal-facts", terminal?.observed || next.terminalExpected); show(doc.querySelector("#neckline-execution-terminal-verify"), !terminal); show(doc.querySelector("#neckline-execution-terminal-complete"), Boolean(terminal)); }
      if (next.completed) { text(doc.querySelector("#neckline-execution-completed-summary"), `Горловина и структурное открытие физически выполнены: подтверждено ${next.completed.physicalStepsCompleted} точных шагов. План Stage 91 не изменялся.`); const successor = doc.querySelector("#neckline-execution-successor"); if (successor) { successor.href = `/project-realized-finishable-edge-evidence?project=${encodeURIComponent(projectId)}`; successor.hidden = !next.successor.available; } }
      text(doc.querySelector("#neckline-execution-assistant"), assistant?.guidance(next)?.message || "Следуйте только текущему точному шагу; помощник не меняет порядок и смысл плана."); return next;
    }
    async function perform(action) { if (busy) return null; setBusy(true); try { return render(await action()); } catch (error) { show(errorNode, true); text(errorNode, error?.userMessage || error?.message || "Не удалось сохранить физическое выполнение."); return null; } finally { setBusy(false); } }
    async function start() { return perform(() => app.load(projectId)); }
    doc.querySelector("#neckline-execution-start-button")?.addEventListener("click", () => perform(() => app.startExecution()));
    doc.querySelector("#neckline-execution-entry-button")?.addEventListener("click", () => { if (doc.querySelector("#neckline-execution-entry-confirm")?.checked !== true) return; return perform(() => app.confirmEntryState({ observed: view.expectedEntry, explicitConfirmation: true })); });
    doc.querySelector("#neckline-execution-step-button")?.addEventListener("click", () => { if (doc.querySelector("#neckline-execution-step-confirm")?.checked !== true) return; const step = view.currentStep; return perform(() => app.confirmStep({ stepId: step.stepId, instructionIdentity: step.instructionIdentity, observed: step.expectedResult, explicitConfirmation: true })); });
    doc.querySelector("#neckline-execution-pause-button")?.addEventListener("click", () => perform(() => app.pauseExecution({ reason: "Пауза пользователя на подтверждённой границе" })));
    doc.querySelector("#neckline-execution-resume-not-done")?.addEventListener("click", () => perform(() => app.resumeExecution({ currentStepAlreadyPerformed: false })));
    doc.querySelector("#neckline-execution-resume-done")?.addEventListener("click", () => perform(() => app.resumeExecution({ currentStepAlreadyPerformed: true })));
    doc.querySelector("#neckline-execution-terminal-verify-button")?.addEventListener("click", () => perform(() => app.verifyTerminalState({ observed: view.terminalExpected, explicitConfirmation: doc.querySelector("#neckline-execution-terminal-confirm")?.checked === true })));
    doc.querySelector("#neckline-execution-complete-button")?.addEventListener("click", () => perform(() => app.completeExecution({ explicitFinalConfirmation: doc.querySelector("#neckline-execution-complete-confirm")?.checked === true })));
    return Object.freeze({ start, render, describeObservation, getState: () => ({ projectId, view, busy }), close: () => app.close?.() });
  }
  const api = Object.freeze({ projectIdentityFromLocation, describeObservation, createController }); globalObject.YarnAIProjectNecklineOpeningExecutionWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
