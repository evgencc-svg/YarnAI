"use strict";

(function exposeFoundationPreparationWorkspace(globalObject) {
  function createController(options = {}) {
    const target = options.globalObject || globalObject;
    const doc = options.document || target.document;
    const domain = options.domain || target.YarnAIFoundationSectionExecutionPreparation;
    const system = options.system || target.YarnAIProjectSystem;
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository());
    const now = options.now || (() => new Date().toISOString());
    const operationId = options.operationId || (() => system.uuidv7());
    const ui = options.ui || {
      root: doc.querySelector("#foundation-preparation-root"), loading: doc.querySelector("#foundation-preparation-loading"), blocked: doc.querySelector("#foundation-preparation-blocked"), blockedMessage: doc.querySelector("#foundation-preparation-blocked-message"), rebuild: doc.querySelector("#foundation-preparation-rebuild"), content: doc.querySelector("#foundation-preparation-content"),
      form: doc.querySelector("#foundation-preparation-form"), errors: doc.querySelector("#foundation-preparation-errors"), errorList: doc.querySelector("#foundation-preparation-error-list"), patternError: doc.querySelector("#foundation-pattern-error"), methodError: doc.querySelector("#foundation-method-error"), toolError: doc.querySelector("#foundation-tool-error"), instructionError: doc.querySelector("#foundation-instruction-error"), measurementError: doc.querySelector("#foundation-measurement-error"),
      methodLocked: doc.querySelector("#foundation-method-locked"), methodChoices: doc.querySelector("#foundation-method-choices"), allocation: doc.querySelector("#foundation-allocation"), compatibility: doc.querySelector("#foundation-compatibility"), toolLocked: doc.querySelector("#foundation-tool-locked"), toolField: doc.querySelector("#foundation-tool-field"), tool: doc.querySelector("#foundation-tool"), instruction: doc.querySelector("#foundation-instruction"), instructionAttestation: doc.querySelector("#foundation-instruction-attestation"), measurementAck: doc.querySelector("#foundation-measurement-ack"),
      review: doc.querySelector("#foundation-preparation-review"), reviewSummary: doc.querySelector("#foundation-review-summary"), confirm: doc.querySelector("#foundation-confirm"), edit: doc.querySelector("#foundation-edit"), completed: doc.querySelector("#foundation-preparation-completed"), completedSummary: doc.querySelector("#foundation-completed-summary"),
    };
    let repository = null; let projectId = ""; let aggregate = null; let assessment = null; let record = null; let state = null; let busy = false; let channel = null;

    function dependenciesReady() { return domain && system && target.YarnAIProjectExecutionPlan && target.YarnAIProjectExecutionStart && target.YarnAIProjectExecutionFirstStep && target.YarnAIProjectExecutionNextStep && target.YarnAIProjectExecutionNextStepClarification; }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); ui.confirm && (ui.confirm.disabled = value); }
    function sourceOptions(progressRevision = null) { return { projectId, project: aggregate.project, progress: aggregate.progress, stage63Domain: target.YarnAISwatchGauge, stage65Domain: target.YarnAIProjectExecutionPlan, stage66Domain: target.YarnAIProjectExecutionStart, stage67Domain: target.YarnAIProjectExecutionFirstStep, stage68Domain: target.YarnAIProjectExecutionNextStep, stage69Domain: target.YarnAIProjectExecutionNextStepClarification, preparationProgressRevision: progressRevision, validatedAt: now() }; }
    function assess(progressRevision = null) { return domain.assessSource(sourceOptions(progressRevision)); }
    function showBlocked(problem, canRebuild = false) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = problem?.message || "Не удалось безопасно проверить проект."; if (ui.rebuild) ui.rebuild.hidden = !canRebuild; ui.blocked.focus(); }
    function clearErrors() { [ui.patternError, ui.methodError, ui.toolError, ui.instructionError, ui.measurementError].forEach((node) => { if (node) node.textContent = ""; }); ui.errors.hidden = true; ui.errorList.replaceChildren(); doc.querySelectorAll("[aria-invalid='true']").forEach((node) => node.removeAttribute("aria-invalid")); }
    function addError(control, node, message, errors) { if (node) node.textContent = message; if (control) control.setAttribute("aria-invalid", "true"); errors.push({ control, message }); }
    function checked(name) { return doc.querySelector(`input[name="${name}"]:checked`)?.value || ""; }
    function setChecked(name, value) { doc.querySelectorAll(`input[name="${name}"]`).forEach((input) => { input.checked = input.value === value; }); }
    function currentMethod() { return assessment?.workingMethod?.value || checked("workingMethod"); }
    function updateAllocation() {
      ui.compatibility.textContent = "";
      const pattern = checked("ribPattern"); const method = currentMethod();
      if (!pattern || !method) { ui.allocation.textContent = "Выберите резинку и способ вязания."; return null; }
      const result = domain.allocationFor(domain.ribPattern(pattern), { value: method, origin: "user", explicit: true, confirmedAt: now() });
      const edges = result.edgeCount === 0 ? "кромочных нет" : "2 кромочные (по одной с каждого края)";
      ui.allocation.textContent = `Всего 100 петель; ${edges}; рабочих петель — ${result.workingStitches}; раппорт — ${result.repeatLength}.`;
      if (!result.compatible) ui.compatibility.textContent = `После двух кромочных остаётся ${result.workingStitches} рабочих петель. Для резинки 2×2 нужно количество рабочих петель, кратное четырём.`;
      return result;
    }
    function collectInput() {
      const errors = []; clearErrors();
      const pattern = checked("ribPattern"); const method = currentMethod(); const allocation = updateAllocation();
      if (!pattern) addError(doc.querySelector("input[name='ribPattern']"), ui.patternError, "Выберите резинку 1×1 или 2×2.", errors);
      if (!method) addError(doc.querySelector("input[name='workingMethod']"), ui.methodError, "Выберите вязание рядами или по кругу.", errors);
      if (allocation && !allocation.compatible) addError(doc.querySelector("input[name='ribPattern'][value='rib_2x2']"), ui.patternError, "Этот вариант несовместим с текущим распределением петель.", errors);
      if (!assessment.authoritativeTool && !ui.tool.value.trim()) addError(ui.tool, ui.toolError, "Подтвердите рабочий инструмент.", errors);
      if (!ui.instruction.value.trim() || !ui.instructionAttestation.checked) addError(ui.instruction, ui.instructionError, "Добавьте свою инструкцию и подтвердите её происхождение.", errors);
      if (!ui.measurementAck.checked) addError(ui.measurementAck, ui.measurementError, "Подтвердите, что правило будущего измерения понятно.", errors);
      if (errors.length) {
        ui.errorList.replaceChildren(...errors.map((entry) => { const li = doc.createElement("li"); li.textContent = entry.message; return li; })); ui.errors.hidden = false; ui.errors.focus();
        return null;
      }
      return { ribPattern: pattern, workingMethod: assessment.workingMethod ? undefined : method, tool: assessment.authoritativeTool ? undefined : ui.tool.value, instruction: ui.instruction.value, instructionAttested: ui.instructionAttestation.checked, measurementAcknowledged: ui.measurementAck.checked };
    }
    function appendSummary(container, entries) {
      container.replaceChildren(...entries.flatMap(([term, description]) => { const dt = doc.createElement("dt"); dt.textContent = term; const dd = doc.createElement("dd"); dd.textContent = description; return [dt, dd]; }));
    }
    function summaryEntries(snapshotOrDraft) {
      const parameters = snapshotOrDraft.executionParameters || snapshotOrDraft;
      const pattern = parameters.ribPattern?.kind === "rib_1x1" ? "Резинка 1×1" : "Резинка 2×2";
      const method = parameters.workingMethod?.value === "flat" ? "Поворотными рядами" : "По кругу";
      const allocation = parameters.stitchAllocation;
      return [["Резинка", pattern], ["Способ вязания", method], ["Всего петель", "100"], ["Кромочные", String(allocation.edgeCount)], ["Рабочие петли", String(allocation.workingStitches)], ["Инструмент", parameters.toolConfirmation.label], ["Инструкция", snapshotOrDraft.instructionSource?.text || state?.draft?.instructionSource?.text || ""], ["Измерение", "На спицах, без растяжения, от начала резинки до верхнего края; не меньше 5 см"], ["Ориентир по рядам", "Не задан"]];
    }
    function restoreForm(draft) {
      setChecked("ribPattern", draft.ribPattern?.kind || "");
      if (assessment.workingMethod) { ui.methodLocked.hidden = false; ui.methodLocked.textContent = assessment.workingMethod.value === "flat" ? "Подтверждено в проекте: вязание поворотными рядами." : "Подтверждено в проекте: вязание по кругу."; ui.methodChoices.hidden = true; ui.methodChoices.querySelectorAll("input").forEach((input) => { input.disabled = true; input.checked = false; }); }
      else { ui.methodLocked.hidden = true; ui.methodChoices.hidden = false; ui.methodChoices.querySelectorAll("input").forEach((input) => input.disabled = false); setChecked("workingMethod", draft.workingMethod?.value || ""); }
      if (assessment.authoritativeTool) { ui.toolLocked.hidden = false; ui.toolLocked.textContent = `Подтверждённый инструмент проекта: ${assessment.authoritativeTool.label}`; ui.toolField.hidden = true; ui.tool.disabled = true; ui.tool.value = ""; }
      else { ui.toolLocked.hidden = true; ui.toolField.hidden = false; ui.tool.disabled = false; ui.tool.value = draft.toolConfirmation?.kind === "user_provided" ? draft.toolConfirmation.label : ""; }
      ui.instruction.value = draft.instructionSource?.text || ""; ui.instructionAttestation.checked = draft.instructionSource?.attestation?.explicit === true; ui.measurementAck.checked = draft.measurementAcknowledged === true; updateAllocation();
    }
    function renderState(nextState) {
      state = nextState; ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.form.hidden = true; ui.review.hidden = true; ui.completed.hidden = true; clearErrors();
      if (state.lifecycle === "completed") { appendSummary(ui.completedSummary, summaryEntries(state.completedSnapshot)); ui.completed.hidden = false; ui.completed.focus(); return; }
      restoreForm(state.draft);
      if (state.lifecycle === "reviewing") { appendSummary(ui.reviewSummary, summaryEntries({ ...state.draft, instructionSource: state.draft.instructionSource })); ui.review.hidden = false; ui.review.focus(); }
      else { ui.form.hidden = false; const first = doc.querySelector("input[name='ribPattern']:not(:disabled):not(:checked)") || ui.tool || ui.instruction; first?.focus(); }
    }
    async function reload() {
      aggregate = await repository.getProject(projectId); record = await repository.getCurrentFoundationSectionExecutionPreparation(projectId, aggregate.project.active_calculation_id); assessment = assess(record?.revision ?? null);
      if (assessment.lifecycle !== "ready") { showBlocked(assessment.diagnostic); return; }
      if (!record) { record = await repository.ensureFoundationSectionExecutionPreparation(projectId, assessment.calculationId, assessment, { expectedProjectRevision: aggregate.project.revision, timestamp: now() }); aggregate = await repository.getProject(projectId); assessment = assess(record.revision); }
      try { renderState(domain.validateProgressState(record.state, { assessment })); }
      catch (error) {
        if (error?.code === "SOURCE_STALE" && ["collecting", "reviewing", "blocked"].includes(record.state.lifecycle)) {
          try { const stale = domain.markStale(record.state, { timestamp: now(), operationId: operationId(), sourceFingerprint: assessment.source.stage69.fingerprint }); record = await repository.updateFoundationSectionExecutionPreparation(projectId, assessment.calculationId, stale, { expectedProgressRevision: record.revision, expectedDomainRevision: record.state.revision, timestamp: now() }); showBlocked(domain.diagnostic("SOURCE_STALE"), true); return; } catch { /* render the original safe diagnostic */ }
        }
        showBlocked(domain.diagnostic(error.code, error.userMessage), record.state.lifecycle === "stale");
      }
    }
    async function submitReview(event) {
      event.preventDefault(); if (busy) return; const input = collectInput(); if (!input) return; setBusy(true);
      try {
        let next = domain.editDraft(state, input, { assessment, timestamp: now(), operationId: operationId() });
        record = await repository.updateFoundationSectionExecutionPreparation(projectId, assessment.calculationId, next, { expectedProgressRevision: record.revision, expectedDomainRevision: state.revision, timestamp: now() });
        aggregate = await repository.getProject(projectId); assessment = assess(record.revision); state = domain.validateProgressState(record.state, { assessment });
        next = domain.startReviewing(state, { assessment, timestamp: now(), operationId: operationId() });
        record = await repository.updateFoundationSectionExecutionPreparation(projectId, assessment.calculationId, next, { expectedProgressRevision: record.revision, expectedDomainRevision: state.revision, timestamp: now() });
        renderState(record.state);
      } catch (error) { if (["REVISION_CONFLICT", "PROGRESS_REVISION_CONFLICT"].includes(error?.code)) await reload(); else { ui.errors.hidden = false; ui.errorList.replaceChildren(Object.assign(doc.createElement("li"), { textContent: error?.userMessage || "Не удалось сохранить подготовку." })); ui.errors.focus(); } }
      finally { setBusy(false); }
    }
    async function confirm() {
      if (busy) return; setBusy(true);
      try { aggregate = await repository.getProject(projectId); assessment = assess(record.revision); const next = domain.complete(state, { assessment, timestamp: now(), operationId: operationId(), explicitConfirmation: true }); record = await repository.updateFoundationSectionExecutionPreparation(projectId, assessment.calculationId, next, { expectedProgressRevision: record.revision, expectedDomainRevision: state.revision, timestamp: now() }); renderState(record.state); }
      catch (error) { if (["REVISION_CONFLICT", "PROGRESS_REVISION_CONFLICT"].includes(error?.code)) await reload(); else showBlocked(domain.diagnostic(error?.code, error?.userMessage)); }
      finally { setBusy(false); }
    }
    function edit() { ui.review.hidden = true; ui.form.hidden = false; restoreForm(state.draft); (doc.querySelector("input[name='ribPattern']:checked") || ui.instruction).focus(); }
    async function rebuild() { if (busy || !record || record.state.lifecycle !== "stale") return; setBusy(true); try { record = await repository.rebuildFoundationSectionExecutionPreparation(projectId, assessment.calculationId, { timestamp: now() }); await reload(); } catch (error) { showBlocked(domain.diagnostic(error?.code, error?.userMessage)); } finally { setBusy(false); } }
    async function start() {
      if (!dependenciesReady()) { showBlocked({ message: "Проверка подготовки временно недоступна." }); return null; }
      try { projectId = domain.projectIdentityFromLocation(target.location); } catch (error) { showBlocked({ message: error.userMessage }); return null; }
      repository = repositoryFactory(); await repository.initialize();
      ui.form.addEventListener("submit", submitReview); ui.confirm.addEventListener("click", confirm); ui.edit.addEventListener("click", edit); ui.rebuild?.addEventListener("click", rebuild); doc.querySelectorAll("input[name='ribPattern'], input[name='workingMethod']").forEach((node) => node.addEventListener("change", updateAllocation));
      target.addEventListener("pageshow", reload); target.addEventListener("yarnai-project-changed", reload); target.addEventListener("pagehide", close, { once: true });
      if (typeof target.BroadcastChannel === "function") { channel = new target.BroadcastChannel("yarnai-projects-v1"); channel.addEventListener("message", (event) => { if (!event.data?.project_id || event.data.project_id === projectId) reload(); }); }
      await reload(); return { projectId, assessment, state };
    }
    async function close() { channel?.close(); await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, reload, close, collectInput, updateAllocation, renderState });
  }
  const api = Object.freeze({ createController }); globalObject.YarnAIFoundationSectionExecutionPreparationWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
