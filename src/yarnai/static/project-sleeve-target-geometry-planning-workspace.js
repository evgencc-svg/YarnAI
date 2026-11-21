"use strict";

(function exposeProjectSleeveTargetGeometryPlanningWorkspace(globalObject) {
  const INPUTS = Object.freeze({
    cuffTargetCircumferenceCm: Object.freeze({ label: "Какой должна быть готовая окружность рукава у края манжеты, в сантиметрах?", help: "Измерьте свободную готовую окружность по внешнему краю манжеты.", method: "collectCuffCircumference" }),
    upperSleeveTargetCircumferenceCm: Object.freeze({ label: "Какой должна быть готовая окружность верхней части рукава, в сантиметрах?", help: "Укажите окружность готовой трубки рукава у подреза.", method: "collectUpperCircumference" }),
    cuffToUnderarmLengthCm: Object.freeze({ label: "Какой должна быть длина от края манжеты до подреза, в сантиметрах?", help: "Измерьте длину вдоль линии под рукой — от внешнего края манжеты до границы подреза.", method: "collectCuffToUnderarmLength" }),
  });
  const DIAGNOSTICS = Object.freeze({
    CROSS_ZONE_GAUGE_REUSE_FORBIDDEN: "Подтверждённая плотность относится к одному узору. Сначала выберите единый узор для манжеты и основной части.",
    GAUGE_PATTERN_MISMATCH: "Эта плотность не подходит для выбранного узора. Выберите единый узор или подтвердите подходящую плотность.",
    GAUGE_NOT_APPLICABLE: "Эта плотность не подходит для текущего участка рукава.",
    GAUGE_STALE: "Исходные данные плотности изменились. Подтвердите её заново.",
    TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS: "Для выбранных размеров, плотности и узора нет допустимого точного варианта. Завершить план нельзя — вернитесь к проекту и проверьте исходные данные.",
    SOURCE_STALE: "Исходные данные проекта изменились. Этот план нужно начать заново после проверки проекта.",
  });

  function normalizePositiveDecimal(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0) return null;
    return text.startsWith(".") ? `0${text}` : text;
  }
  function formatNumber(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(Number(value)); }
  function formatCm(value) { return value === null || value === undefined ? "—" : `${formatNumber(value)} см`; }
  function projectIdentityFromLocation(location) { return new URLSearchParams(location?.search || "").get("project") || ""; }

  function createController(options = {}) {
    const target = options.globalObject || globalObject; const doc = options.document || target.document;
    const application = options.application || target.YarnAIProjectSleeveTargetGeometryPlanningApplication;
    const applicationControllerFactory = options.applicationControllerFactory || ((settings) => application.createController(settings));
    const ui = options.ui || {
      root: doc.querySelector("#sleeve-geometry-root"), loading: doc.querySelector("#sleeve-geometry-loading"), blocked: doc.querySelector("#sleeve-geometry-blocked"), blockedMessage: doc.querySelector("#sleeve-geometry-blocked-message"), content: doc.querySelector("#sleeve-geometry-content"),
      inputForm: doc.querySelector("#sleeve-geometry-input-form"), inputLabel: doc.querySelector("#sleeve-geometry-input-label"), inputHelp: doc.querySelector("#sleeve-geometry-input-help"), input: doc.querySelector("#sleeve-geometry-input"), inputError: doc.querySelector("#sleeve-geometry-input-error"), inputSave: doc.querySelector("#sleeve-geometry-input-save"),
      gauge: doc.querySelector("#sleeve-geometry-gauge"), gaugeTitle: doc.querySelector("#sleeve-geometry-gauge-title"), gaugeMessage: doc.querySelector("#sleeve-geometry-gauge-message"), cuffPattern: doc.querySelector("#sleeve-geometry-cuff-pattern"), mainPattern: doc.querySelector("#sleeve-geometry-main-pattern"), bindGauge: doc.querySelector("#sleeve-geometry-bind-gauge"), patternResolution: doc.querySelector("#sleeve-geometry-pattern-resolution"), alignCuff: doc.querySelector("#sleeve-geometry-align-cuff"), alignMain: doc.querySelector("#sleeve-geometry-align-main"), openReview: doc.querySelector("#sleeve-geometry-open-review"),
      review: doc.querySelector("#sleeve-geometry-review"), reviewCuffCm: doc.querySelector("#sleeve-review-cuff-cm"), reviewUpperCm: doc.querySelector("#sleeve-review-upper-cm"), reviewLengthCm: doc.querySelector("#sleeve-review-length-cm"), reviewCuffStitches: doc.querySelector("#sleeve-review-cuff-stitches"), reviewUpperStitches: doc.querySelector("#sleeve-review-upper-stitches"), reviewIncreases: doc.querySelector("#sleeve-review-increases"), scheduleSummary: doc.querySelector("#sleeve-review-schedule-summary"), schedule: doc.querySelector("#sleeve-review-schedule"), reviewCuffContext: doc.querySelector("#sleeve-review-cuff-context"), reviewMainContext: doc.querySelector("#sleeve-review-main-context"), reviewStop: doc.querySelector("#sleeve-review-stop"), tie: doc.querySelector("#sleeve-review-tie"), tieOptions: doc.querySelector("#sleeve-review-tie-options"), endpointMessage: doc.querySelector("#sleeve-review-endpoint-message"), complete: doc.querySelector("#sleeve-review-complete"),
      completed: doc.querySelector("#sleeve-geometry-completed"), nextStage: doc.querySelector("#sleeve-geometry-start-execution"), error: doc.querySelector("#sleeve-geometry-error"),
    };
    let app = null; let projectId = ""; let view = null; let busy = false; let channel = null;

    function allButtons() { return [ui.inputSave, ui.bindGauge, ui.alignCuff, ui.alignMain, ui.openReview, ui.complete].filter(Boolean); }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); allButtons().forEach((button) => { button.disabled = value; }); }
    function resetPanels() { [ui.inputForm, ui.gauge, ui.review, ui.completed].forEach((node) => { if (node) node.hidden = true; }); if (ui.error) ui.error.hidden = true; }
    function humanDiagnostic(value) { return DIAGNOSTICS[value?.diagnostic?.code] || value?.diagnostic?.message || "Не удалось безопасно восстановить этот этап."; }
    function showBlocked(value) { resetPanels(); ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = humanDiagnostic(value); ui.blocked.focus?.(); setBusy(false); return value; }
    function showContent() { ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.root.setAttribute("aria-busy", "false"); }

    function renderInput(value) {
      const model = INPUTS[value.nextMissingInput]; if (!model) return showBlocked({ diagnostic: { message: "Не удалось определить следующий размер рукава." } });
      ui.inputForm.hidden = false; ui.inputLabel.textContent = model.label; ui.inputHelp.textContent = model.help; ui.input.value = ""; ui.inputError.hidden = true; ui.input.focus?.();
    }
    function contextText(context) { return `${context.pattern}; плотность ${formatNumber(context.stitchesPerCm)} п./см и ${formatNumber(context.rowsPerCm)} р./см`; }
    function renderSchedule(value) {
      const events = value.review?.scheduleSummary?.events || []; ui.scheduleSummary.textContent = value.review?.scheduleSummary ? `${value.review.scheduleSummary.shapingRows} кругов основной части; ${events.length} равномерно распределённых прибавок.` : "Расписание появится после выбора точного варианта.";
      if (ui.schedule?.replaceChildren && doc?.createElement) ui.schedule.replaceChildren(...events.map((event) => { const item = doc.createElement("li"); item.textContent = `Круг ${event.mainRound}: +2 петли, всего ${event.resultingStitchCount}`; return item; }));
    }
    function renderTie(value) {
      const keys = value.endpointState?.tiedCandidates || []; ui.tie.hidden = keys.length === 0;
      if (!ui.tieOptions?.replaceChildren || !doc?.createElement) return;
      ui.tieOptions.replaceChildren(...keys.map((key) => { const candidate = value.endpointState.candidatePairs.find((entry) => entry.key === key); const button = doc.createElement("button"); button.type = "button"; button.className = "choice"; const title = doc.createElement("strong"); title.textContent = `${candidate.cuffStitches} петель у манжеты → ${candidate.upperStitches} петель сверху`; const note = doc.createElement("small"); note.textContent = `Получится примерно ${formatCm(candidate.plannedCuffCm)} и ${formatCm(candidate.plannedUpperCm)}.`; button.append(title, note); button.addEventListener("click", () => confirmTie(key)); return button; }));
    }
    function renderReview(value, completed = false) {
      const review = value.review; if (!review) return showBlocked({ diagnostic: { message: "Сохранённый расчёт не содержит проверяемого плана." } });
      ui.review.hidden = false; ui.reviewCuffCm.textContent = formatCm(review.targets.cuffCircumferenceCm); ui.reviewUpperCm.textContent = formatCm(review.targets.upperSleeveCircumferenceCm); ui.reviewLengthCm.textContent = formatCm(review.targets.cuffToUnderarmLengthCm); ui.reviewCuffStitches.textContent = review.castOnTarget ?? "после выбора варианта"; ui.reviewUpperStitches.textContent = review.upperTarget ?? "после выбора варианта"; ui.reviewIncreases.textContent = review.increaseEventCount ?? "после выбора варианта";
      ui.reviewCuffContext.textContent = contextText(review.appliedContexts.cuff); ui.reviewMainContext.textContent = contextText(review.appliedContexts.main); renderSchedule(value); renderTie(value);
      ui.endpointMessage.hidden = true; ui.complete.hidden = completed || value.endpointState?.status !== "selected";
      if (value.endpointState?.status === "no_valid_candidate" || value.endpointState?.status === "unresolved") { ui.endpointMessage.textContent = value.endpointState.status === "no_valid_candidate" ? DIAGNOSTICS.TARGET_IMPOSSIBLE_UNDER_CURRENT_CONSTRAINTS : "Точный вариант ещё не выбран. Завершить план пока нельзя."; ui.endpointMessage.hidden = false; }
      ui.reviewStop.textContent = review.stopCondition ? `Остановитесь при длине ${formatCm(review.stopCondition.targetLengthCm)} и ${review.stopCondition.plannedFullTubeStitches} петлях. Петли подреза здесь не распределяются; фактический результат будет подтверждаться позже.` : "Условие остановки появится после выбора точного варианта.";
      if (completed) { ui.tie.hidden = true; ui.completed.hidden = false; if (ui.nextStage) ui.nextStage.href = `/project-sleeve-physical-execution?project=${encodeURIComponent(projectId)}`; ui.completed.focus?.(); }
    }
    function renderGauge(value) {
      ui.gauge.hidden = false; ui.cuffPattern.textContent = value.inheritedPolicy.cuffCandidate; ui.mainPattern.textContent = value.inheritedPolicy.mainPattern; ui.patternResolution.hidden = true; ui.bindGauge.hidden = true; ui.openReview.hidden = true;
      const cuff = value.gaugeStatus.cuff; const main = value.gaugeStatus.main; const zone = cuff.status !== "valid" ? "cuff" : main.status !== "valid" ? "main" : null;
      if (!zone) { ui.gaugeTitle.textContent = "Всё готово к расчёту"; ui.gaugeMessage.textContent = "Плотность отдельно подтверждена для манжеты и основной части."; ui.openReview.hidden = false; return; }
      const status = value.gaugeStatus[zone].status; const label = zone === "cuff" ? "манжеты" : "основной части рукава"; ui.gaugeTitle.textContent = `Подтвердите плотность для ${label}`;
      if (status === "incompatible") { ui.gaugeMessage.textContent = DIAGNOSTICS[value.diagnostic?.code] || DIAGNOSTICS.GAUGE_PATTERN_MISMATCH; ui.patternResolution.hidden = false; return; }
      ui.gaugeMessage.textContent = status === "stale" ? DIAGNOSTICS.GAUGE_STALE : `Подтвердите, что сохранённый образец связан тем же материалом и инструментом и подходит для ${label}.`;
      ui.bindGauge.dataset.zone = zone; ui.bindGauge.hidden = false;
    }
    function render(next) {
      view = next; resetPanels(); if (!next || next.available === false || next.lifecycle === "blocked" && !next.inheritedPolicy) return showBlocked(next || {}); showContent();
      if (next.lifecycle === "completed") { renderReview(next, true); return next; }
      if (next.nextMissingInput) renderInput(next);
      else if (next.lifecycle === "reviewing" || ["selected", "tie", "no_valid_candidate"].includes(next.endpointState?.status)) renderReview(next);
      else renderGauge(next);
      return next;
    }
    async function perform(action) { if (busy) return null; setBusy(true); try { return render(await action()); } catch (problem) { ui.error.textContent = problem?.userMessage || problem?.message || "Не удалось выполнить действие."; ui.error.hidden = false; return null; } finally { setBusy(false); } }
    async function reload() { if (!app || !projectId) return showBlocked({ diagnostic: { message: "Откройте план из конкретного проекта." } }); return perform(() => app.reconstructAfterReload(projectId)); }
    async function submitMeasurement(rawValue = ui.input.value) {
      if (busy || !view?.nextMissingInput || !INPUTS[view.nextMissingInput]) return null; const value = normalizePositiveDecimal(rawValue);
      if (value === null) { ui.inputError.textContent = "Введите положительное число в сантиметрах, например 20 или 20,5."; ui.inputError.hidden = false; return null; }
      const method = INPUTS[view.nextMissingInput].method; return perform(() => app[method](value));
    }
    async function bindGauge() { const zone = ui.bindGauge.dataset.zone; if (busy || !["cuff", "main"].includes(zone) || !["missing", "stale"].includes(view?.gaugeStatus?.[zone]?.status)) return null; return perform(() => app[zone === "cuff" ? "bindCuffGauge" : "bindMainGauge"]({ explicitConfirmation: true })); }
    async function alignCuff() { if (busy || !Object.values(view?.gaugeStatus || {}).some((entry) => entry.status === "incompatible")) return null; return perform(() => app.alignCuffPatternWithMain()); }
    async function alignMain() { if (busy || !Object.values(view?.gaugeStatus || {}).some((entry) => entry.status === "incompatible")) return null; return perform(() => app.alignMainPatternWithCuff()); }
    async function openReview() { if (busy || view?.nextMissingInput || view?.lifecycle === "completed" || Object.values(view?.gaugeStatus || {}).some((entry) => entry.status !== "valid")) return null; return perform(() => app.enterReview()); }
    async function confirmTie(key) { if (busy || view?.endpointState?.status !== "tie" || !view.endpointState.tiedCandidates.includes(key)) return null; return perform(() => app.confirmStructuredEndpointTie(key)); }
    async function complete() { if (busy || view?.lifecycle !== "reviewing" || view?.endpointState?.status !== "selected" || !view?.review?.reviewFingerprint) return null; return perform(() => app.confirmReview(view.review.reviewFingerprint)); }
    async function start() {
      if (!application) return showBlocked({ diagnostic: { message: "Проверка плана временно недоступна." } }); projectId = projectIdentityFromLocation(target.location); if (!projectId) return showBlocked({ diagnostic: { message: "Откройте план из конкретного проекта." } });
      app = applicationControllerFactory({ projectId }); ui.inputForm.addEventListener("submit", (event) => { event.preventDefault(); submitMeasurement(); }); ui.bindGauge.addEventListener("click", bindGauge); ui.alignCuff.addEventListener("click", alignCuff); ui.alignMain.addEventListener("click", alignMain); ui.openReview.addEventListener("click", openReview); ui.complete.addEventListener("click", complete);
      target.addEventListener?.("pageshow", reload); target.addEventListener?.("yarnai-project-changed", reload); target.addEventListener?.("pagehide", close, { once: true }); if (typeof target.BroadcastChannel === "function") { channel = new target.BroadcastChannel("yarnai-projects-v1"); channel.addEventListener("message", (event) => { if (!event.data?.project_id || event.data.project_id === projectId) reload(); }); }
      return perform(() => app.loadOrStart(projectId));
    }
    async function close() { channel?.close(); await app?.close?.(); }
    return Object.freeze({ start, reload, close, render, submitMeasurement, bindGauge, alignCuff, alignMain, openReview, confirmTie, complete, getState: () => ({ projectId, view, busy }) });
  }

  const api = Object.freeze({ INPUTS, DIAGNOSTICS, normalizePositiveDecimal, formatCm, projectIdentityFromLocation, createController });
  globalObject.YarnAIProjectSleeveTargetGeometryPlanningWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
