"use strict";

(function exposeProjectNextSectionPlanningWorkspace(globalObject) {
  function formatCm(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value); }
  function createController(options = {}) {
    const target = options.globalObject || globalObject; const doc = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectNextSectionPlanning; const system = options.system || target.YarnAIProjectSystem;
    const dependencies = {
      stage63Domain: options.stage63Domain || target.YarnAISwatchGauge, stage65Domain: options.stage65Domain || target.YarnAIProjectExecutionPlan,
      stage66Domain: options.stage66Domain || target.YarnAIProjectExecutionStart, stage67Domain: options.stage67Domain || target.YarnAIProjectExecutionFirstStep,
      stage68Domain: options.stage68Domain || target.YarnAIProjectExecutionNextStep, stage69Domain: options.stage69Domain || target.YarnAIProjectExecutionNextStepClarification,
      stage70Domain: options.stage70Domain || target.YarnAIFoundationSectionExecutionPreparation, stage71Domain: options.stage71Domain || target.YarnAIFoundationSectionExecution,
      stage72Domain: options.stage72Domain || target.YarnAIFoundationSectionMeasurement, stage73Domain: options.stage73Domain || target.YarnAIPrimaryFabricPreparation,
      stage74Domain: options.stage74Domain || target.YarnAIPrimaryFabricExecution, stage75Domain: options.stage75Domain || target.YarnAIPrimaryFabricMeasurement,
    };
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository()); const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7());
    const ui = options.ui || {
      root: doc.querySelector("#next-section-planning-root"), loading: doc.querySelector("#next-section-planning-loading"), blocked: doc.querySelector("#next-section-planning-blocked"), blockedMessage: doc.querySelector("#next-section-planning-blocked-message"),
      content: doc.querySelector("#next-section-planning-content"), completedHeight: doc.querySelector("#next-section-completed-height"), garmentLength: doc.querySelector("#next-section-garment-length"), armholeDepth: doc.querySelector("#next-section-armhole-depth"),
      knownMethod: doc.querySelector("#next-section-working-method"), conditionalDerivation: doc.querySelector("#next-section-conditional-derivation"), form: doc.querySelector("#next-section-planning-form"), directionError: doc.querySelector("#next-section-direction-error"),
      save: doc.querySelector("#next-section-planning-save"), completed: doc.querySelector("#next-section-planning-completed"), completedDirection: doc.querySelector("#next-section-completed-direction"), completedNext: doc.querySelector("#next-section-completed-next"), constructionAction: doc.querySelector("#next-section-construction-action"), error: doc.querySelector("#next-section-planning-error"),
    };
    let repository = null; let projectId = ""; let aggregate = null; let assessment = null; let progress = null; let busy = false; let channel = null;
    function sourceOptions() { return { projectId, project: aggregate?.project, progress: aggregate?.progress, ...dependencies, validatedAt: now() }; }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); if (ui.save) ui.save.disabled = value; }
    function showBlocked(problem) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = problem?.message || "Не удалось безопасно проверить проект."; ui.blocked.focus?.(); setBusy(false); }
    function renderKnown(value) {
      ui.completedHeight.textContent = `${formatCm(value.knownInputs.primaryFabricHeightCm)} см`; ui.garmentLength.textContent = `${formatCm(value.knownInputs.garmentLengthCm)} см`; ui.armholeDepth.textContent = `${formatCm(value.knownInputs.armholeDepthCm)} см`;
      ui.knownMethod.textContent = value.knownInputs.workingMethod === "in_round" ? "по кругу" : "поворотными рядами";
      ui.conditionalDerivation.textContent = `Если изделие вяжется снизу вверх и до проймы нет формирования, уровень проймы составит ${formatCm(value.derivations.bottomUpArmholeStartCm)} см, то есть ещё ${formatCm(value.derivations.bottomUpAdditionalHeightCm)} см. Это пока не инструкция.`;
    }
    function renderCompleted(snapshot) {
      ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; renderKnown({ knownInputs: snapshot.knownInputs, derivations: snapshot.derivations }); ui.form.hidden = true; ui.completed.hidden = false;
      ui.completedDirection.textContent = snapshot.clarification.value === "bottom_up" ? "снизу вверх" : "сверху вниз";
      ui.completedNext.textContent = "Направление сохранено. Для новой immutable-версии плана ещё нужно отдельно определить конструкцию и формирование. Выполнение не запускается.";
      if (ui.constructionAction) { const compatible = snapshot.clarification.value === "bottom_up"; ui.constructionAction.hidden = !compatible; if (compatible) ui.constructionAction.href = `/project-construction-strategy-planning?project=${encodeURIComponent(projectId || snapshot.projectIdentity)}`; }
      ui.root.setAttribute("aria-busy", "false"); return snapshot;
    }
    function renderReady(value) { ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.completed.hidden = true; ui.form.hidden = false; renderKnown(value); ui.root.setAttribute("aria-busy", "false"); return value; }
    async function reload() {
      try {
        aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions());
        if (assessment.lifecycle !== "ready") return showBlocked(assessment.diagnostic);
        progress = await repository.getProjectNextSectionPlanning(projectId, assessment.calculationId);
        if (!progress) return renderReady(assessment);
        const state = domain.validateProgressState(progress.state, { projectIdentity: projectId, calculationId: assessment.calculationId }); domain.validateBinding(state.snapshot, assessment); return renderCompleted(state.snapshot);
      } catch (problem) { return showBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message)); }
    }
    async function submit(direction) {
      if (busy) return null; ui.directionError.hidden = true; ui.error.hidden = true;
      if (!domain.DIRECTIONS.includes(direction)) { ui.directionError.textContent = "Выберите направление вязания."; ui.directionError.hidden = false; return null; }
      setBusy(true);
      try {
        aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions()); if (assessment.lifecycle !== "ready") return showBlocked(assessment.diagnostic);
        const at = now(); const id = operationId(); const snapshot = domain.createCompletedSnapshot(assessment, { direction }, { timestamp: at, operationId: id, explicitConfirmation: true });
        const state = domain.createProgressState(snapshot); progress = await repository.ensureProjectNextSectionPlanning(projectId, assessment.calculationId, state, { expectedProjectRevision: aggregate.project.revision, timestamp: at, operationId: id });
        return renderCompleted(domain.validateProgressState(progress.state, { projectIdentity: projectId, calculationId: assessment.calculationId }).snapshot);
      } catch (problem) { if (["REVISION_CONFLICT", "PROGRESS_REVISION_CONFLICT"].includes(problem?.code)) return reload(); ui.error.textContent = problem?.userMessage || "Не удалось сохранить направление."; ui.error.hidden = false; return null; }
      finally { setBusy(false); }
    }
    async function start() {
      if (!domain || !system || Object.values(dependencies).some((value) => !value)) { showBlocked({ message: "Проверка исходной цепочки временно недоступна." }); return null; }
      try {
        projectId = domain.projectIdentityFromLocation(target.location); repository = repositoryFactory(); await repository.initialize();
        ui.form.addEventListener("submit", (event) => { event.preventDefault(); const selected = ui.form.elements.namedItem("direction"); submit(selected?.value || ""); });
        target.addEventListener?.("pageshow", reload); target.addEventListener?.("yarnai-project-changed", reload); target.addEventListener?.("pagehide", close, { once: true });
        if (typeof target.BroadcastChannel === "function") { channel = new target.BroadcastChannel("yarnai-projects-v1"); channel.addEventListener("message", (event) => { if (!event.data?.project_id || event.data.project_id === projectId) reload(); }); }
        await reload(); return { projectId, assessment, progress };
      } catch (problem) { showBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message)); return null; }
    }
    async function close() { channel?.close(); await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, reload, submit, close, renderReady, renderCompleted, getState: () => ({ projectId, aggregate, assessment, progress, busy }) });
  }
  const api = Object.freeze({ formatCm, createController }); globalObject.YarnAIProjectNextSectionPlanningWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
