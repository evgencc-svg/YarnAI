"use strict";

(function exposeProjectConstructionStrategyPlanningWorkspace(globalObject) {
  function formatCm(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value); }
  function createController(options = {}) {
    const target = options.globalObject || globalObject; const doc = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectConstructionStrategyPlanning; const system = options.system || target.YarnAIProjectSystem;
    const dependencies = {
      stage63Domain: options.stage63Domain || target.YarnAISwatchGauge, stage65Domain: options.stage65Domain || target.YarnAIProjectExecutionPlan,
      stage66Domain: options.stage66Domain || target.YarnAIProjectExecutionStart, stage67Domain: options.stage67Domain || target.YarnAIProjectExecutionFirstStep,
      stage68Domain: options.stage68Domain || target.YarnAIProjectExecutionNextStep, stage69Domain: options.stage69Domain || target.YarnAIProjectExecutionNextStepClarification,
      stage70Domain: options.stage70Domain || target.YarnAIFoundationSectionExecutionPreparation, stage71Domain: options.stage71Domain || target.YarnAIFoundationSectionExecution,
      stage72Domain: options.stage72Domain || target.YarnAIFoundationSectionMeasurement, stage73Domain: options.stage73Domain || target.YarnAIPrimaryFabricPreparation,
      stage74Domain: options.stage74Domain || target.YarnAIPrimaryFabricExecution, stage75Domain: options.stage75Domain || target.YarnAIPrimaryFabricMeasurement,
      stage76Domain: options.stage76Domain || target.YarnAIProjectNextSectionPlanning,
    };
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository()); const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7());
    const ui = options.ui || {
      root: doc.querySelector("#construction-strategy-root"), loading: doc.querySelector("#construction-strategy-loading"), blocked: doc.querySelector("#construction-strategy-blocked"), blockedMessage: doc.querySelector("#construction-strategy-blocked-message"), content: doc.querySelector("#construction-strategy-content"),
      completedHeight: doc.querySelector("#construction-strategy-completed-height"), stitchCount: doc.querySelector("#construction-strategy-stitch-count"), direction: doc.querySelector("#construction-strategy-direction"), method: doc.querySelector("#construction-strategy-method"), derivation: doc.querySelector("#construction-strategy-derivation"),
      form: doc.querySelector("#construction-strategy-form"), strategyList: doc.querySelector("#construction-strategy-options"), strategyError: doc.querySelector("#construction-strategy-choice-error"), save: doc.querySelector("#construction-strategy-save"), completed: doc.querySelector("#construction-strategy-completed"), completedChoice: doc.querySelector("#construction-strategy-completed-choice"), completedNext: doc.querySelector("#construction-strategy-completed-next"), shapingAction: doc.querySelector("#construction-strategy-shaping-action"), error: doc.querySelector("#construction-strategy-error"),
    };
    let repository = null; let projectId = ""; let aggregate = null; let assessment = null; let progress = null; let busy = false; let channel = null;
    function sourceOptions() { return { projectId, project: aggregate?.project, progress: aggregate?.progress, ...dependencies, validatedAt: now() }; }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); if (ui.save) ui.save.disabled = value; }
    function showBlocked(problem) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = problem?.message || "Не удалось безопасно проверить проект."; ui.blocked.focus?.(); setBusy(false); }
    function renderKnown(value) {
      ui.completedHeight.textContent = `${formatCm(value.knownInputs.primaryFabricHeightCm)} см`; ui.stitchCount.textContent = String(value.knownInputs.stitchCount); ui.direction.textContent = "снизу вверх"; ui.method.textContent = "по кругу";
      ui.derivation.textContent = `Ориентировочный уровень начала пройм — ${formatCm(value.derivations.armholeStartCm)} см от нижнего края; сейчас связано ${formatCm(value.derivations.currentHeightCm)} см. Расчёт справочный: решение о формировании будет подтверждено отдельно.`;
    }
    function renderOptions(strategies) {
      if (!ui.strategyList?.replaceChildren || !doc?.createElement) return; const nodes = strategies.map((strategy) => { const label = doc.createElement("label"); label.className = "choice"; const input = doc.createElement("input"); input.type = "radio"; input.name = "strategy"; input.value = strategy.value; const copy = doc.createElement("span"); const title = doc.createElement("strong"); title.textContent = strategy.label; const description = doc.createElement("small"); description.textContent = strategy.description; copy.append(title, description); label.append(input, copy); return label; }); ui.strategyList.replaceChildren(...nodes);
    }
    function renderReady(value) { ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.completed.hidden = true; ui.form.hidden = false; renderKnown(value); renderOptions(value.availableStrategies); ui.root.setAttribute("aria-busy", "false"); return value; }
    function renderCompleted(snapshot) { ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; renderKnown({ knownInputs: snapshot.knownInputs, derivations: snapshot.derivations }); ui.form.hidden = true; ui.completed.hidden = false; const selected = snapshot.availableStrategies.find((entry) => entry.identity === snapshot.clarification.strategyIdentity); ui.completedChoice.textContent = selected?.label || snapshot.clarification.value; ui.completedNext.textContent = "Стратегия сохранена неизменяемым снимком. Следующим отдельным уточнением должна быть политика формирования; новый план и выполнение пока не создаются."; if (ui.shapingAction) { const compatible = snapshot.clarification.strategyIdentity === "construction-strategy:body-sleeves-joined-raglan:v1"; ui.shapingAction.hidden = !compatible; if (compatible) ui.shapingAction.href = `/project-shaping-policy-planning?project=${encodeURIComponent(projectId || snapshot.projectIdentity)}`; } ui.root.setAttribute("aria-busy", "false"); return snapshot; }
    async function reload() {
      try { aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions()); if (assessment.lifecycle !== "ready") return showBlocked(assessment.diagnostic); progress = await repository.getProjectConstructionStrategyPlanning(projectId, assessment.calculationId); if (!progress) return renderReady(assessment); const state = domain.validateProgressState(progress.state, { projectIdentity: projectId, calculationId: assessment.calculationId }); domain.validateBinding(state.snapshot, assessment); return renderCompleted(state.snapshot); }
      catch (problem) { return showBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message)); }
    }
    async function submit(strategy) {
      if (busy) return null; ui.strategyError.hidden = true; ui.error.hidden = true; if (!assessment?.availableStrategies?.some((entry) => entry.value === strategy)) { ui.strategyError.textContent = "Выберите, как формируется верх свитера."; ui.strategyError.hidden = false; return null; }
      setBusy(true); try { aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions()); if (assessment.lifecycle !== "ready") return showBlocked(assessment.diagnostic); const at = now(); const id = operationId(); const snapshot = domain.createCompletedSnapshot(assessment, { strategy }, { timestamp: at, operationId: id, explicitConfirmation: true }); progress = await repository.ensureProjectConstructionStrategyPlanning(projectId, assessment.calculationId, domain.createProgressState(snapshot), { expectedProjectRevision: aggregate.project.revision, timestamp: at, operationId: id }); return renderCompleted(domain.validateProgressState(progress.state, { projectIdentity: projectId, calculationId: assessment.calculationId }).snapshot); }
      catch (problem) { if (["REVISION_CONFLICT", "PROGRESS_REVISION_CONFLICT"].includes(problem?.code)) return reload(); ui.error.textContent = problem?.userMessage || "Не удалось сохранить стратегию конструкции."; ui.error.hidden = false; return null; } finally { setBusy(false); }
    }
    async function start() {
      if (!domain || !system || Object.values(dependencies).some((value) => !value)) { showBlocked({ message: "Проверка исходной цепочки временно недоступна." }); return null; }
      try { projectId = domain.projectIdentityFromLocation(target.location); repository = repositoryFactory(); await repository.initialize(); ui.form.addEventListener("submit", (event) => { event.preventDefault(); submit(ui.form.elements.namedItem("strategy")?.value || ""); }); target.addEventListener?.("pageshow", reload); target.addEventListener?.("yarnai-project-changed", reload); target.addEventListener?.("pagehide", close, { once: true }); if (typeof target.BroadcastChannel === "function") { channel = new target.BroadcastChannel("yarnai-projects-v1"); channel.addEventListener("message", (event) => { if (!event.data?.project_id || event.data.project_id === projectId) reload(); }); } await reload(); return { projectId, assessment, progress }; }
      catch (problem) { showBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message)); return null; }
    }
    async function close() { channel?.close(); await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, reload, submit, close, renderReady, renderCompleted, getState: () => ({ projectId, aggregate, assessment, progress, busy }) });
  }
  const api = Object.freeze({ formatCm, createController }); globalObject.YarnAIProjectConstructionStrategyPlanningWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
