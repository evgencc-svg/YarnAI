"use strict";

(function exposeProjectShapingPolicyPlanningWorkspace(globalObject) {
  function formatCm(value) { return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value); }
  function createController(options = {}) {
    const target = options.globalObject || globalObject; const doc = options.document || target.document;
    const domain = options.domain || target.YarnAIProjectShapingPolicyPlanning; const system = options.system || target.YarnAIProjectSystem;
    const dependencies = {
      stage63Domain: options.stage63Domain || target.YarnAISwatchGauge, stage65Domain: options.stage65Domain || target.YarnAIProjectExecutionPlan,
      stage66Domain: options.stage66Domain || target.YarnAIProjectExecutionStart, stage67Domain: options.stage67Domain || target.YarnAIProjectExecutionFirstStep,
      stage68Domain: options.stage68Domain || target.YarnAIProjectExecutionNextStep, stage69Domain: options.stage69Domain || target.YarnAIProjectExecutionNextStepClarification,
      stage70Domain: options.stage70Domain || target.YarnAIFoundationSectionExecutionPreparation, stage71Domain: options.stage71Domain || target.YarnAIFoundationSectionExecution,
      stage72Domain: options.stage72Domain || target.YarnAIFoundationSectionMeasurement, stage73Domain: options.stage73Domain || target.YarnAIPrimaryFabricPreparation,
      stage74Domain: options.stage74Domain || target.YarnAIPrimaryFabricExecution, stage75Domain: options.stage75Domain || target.YarnAIPrimaryFabricMeasurement,
      stage76Domain: options.stage76Domain || target.YarnAIProjectNextSectionPlanning, stage77Domain: options.stage77Domain || target.YarnAIProjectConstructionStrategyPlanning,
    };
    const repositoryFactory = options.repositoryFactory || (() => new system.ProjectRepository()); const now = options.now || (() => new Date().toISOString()); const operationId = options.operationId || (() => system.uuidv7());
    const ui = options.ui || {
      root: doc.querySelector("#shaping-policy-root"), loading: doc.querySelector("#shaping-policy-loading"), blocked: doc.querySelector("#shaping-policy-blocked"), blockedMessage: doc.querySelector("#shaping-policy-blocked-message"), content: doc.querySelector("#shaping-policy-content"),
      direction: doc.querySelector("#shaping-policy-direction"), method: doc.querySelector("#shaping-policy-method"), stitchCount: doc.querySelector("#shaping-policy-stitch-count"), completedHeight: doc.querySelector("#shaping-policy-completed-height"), construction: doc.querySelector("#shaping-policy-construction"), derivation: doc.querySelector("#shaping-policy-derivation"),
      form: doc.querySelector("#shaping-policy-form"), policyList: doc.querySelector("#shaping-policy-options"), policyError: doc.querySelector("#shaping-policy-choice-error"), save: doc.querySelector("#shaping-policy-save"), completed: doc.querySelector("#shaping-policy-completed"), completedChoice: doc.querySelector("#shaping-policy-completed-choice"), completedNext: doc.querySelector("#shaping-policy-completed-next"), sleeveAction: doc.querySelector("#shaping-policy-sleeve-action"), error: doc.querySelector("#shaping-policy-error"),
    };
    let repository = null; let projectId = ""; let aggregate = null; let assessment = null; let progress = null; let busy = false; let channel = null;
    function sourceOptions() { return { projectId, project: aggregate?.project, progress: aggregate?.progress, ...dependencies, validatedAt: now() }; }
    function setBusy(value) { busy = value; ui.root?.setAttribute("aria-busy", String(value)); if (ui.save) ui.save.disabled = value; }
    function showBlocked(problem) { ui.loading.hidden = true; ui.content.hidden = true; ui.blocked.hidden = false; ui.blockedMessage.textContent = problem?.message || "Не удалось безопасно проверить проект."; ui.blocked.focus?.(); setBusy(false); }
    function renderKnown(value) {
      ui.direction.textContent = "снизу вверх"; ui.method.textContent = "по кругу"; ui.stitchCount.textContent = String(value.knownInputs.stitchCount); ui.completedHeight.textContent = `${formatCm(value.knownInputs.primaryFabricHeightCm)} см`; ui.construction.textContent = "реглан: корпус и рукава соединяются";
      ui.derivation.textContent = `Ориентир начала пройм — ${formatCm(value.derivations.armholeStartCm)} см от нижнего края; сейчас связано ${formatCm(value.derivations.currentHeightCm)} см. Это только справочная информация, а не инструкция и не граница выполнения.`;
    }
    function renderOptions(policies) {
      if (!ui.policyList?.replaceChildren || !doc?.createElement) return; const nodes = policies.map((policy) => { const label = doc.createElement("label"); label.className = "choice"; const input = doc.createElement("input"); input.type = "radio"; input.name = "policy"; input.value = policy.value; const copy = doc.createElement("span"); const title = doc.createElement("strong"); title.textContent = policy.label; const description = doc.createElement("small"); description.textContent = policy.description; copy.append(title, description); label.append(input, copy); return label; }); ui.policyList.replaceChildren(...nodes);
    }
    function renderReady(value) { ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; ui.completed.hidden = true; ui.form.hidden = false; renderKnown(value); renderOptions(value.availablePolicies); ui.root.setAttribute("aria-busy", "false"); return value; }
    function renderCompleted(snapshot) { ui.loading.hidden = true; ui.blocked.hidden = true; ui.content.hidden = false; renderKnown(snapshot); ui.form.hidden = true; ui.completed.hidden = false; const selected = snapshot.availablePolicies.find((entry) => entry.identity === snapshot.clarification.policyIdentity); ui.completedChoice.textContent = selected?.label || snapshot.clarification.value; domain.resolvePlanOutcome(snapshot); ui.completedNext.textContent = "Способ формирования сохранён неизменяемым решением. Следующий отдельный шаг — подготовить готовые размеры и расчёт прибавок рукава. Физическое вязание, подрезы и соединение деталей пока не начинаются."; if (ui.sleeveAction) ui.sleeveAction.href = `/project-sleeve-geometry-planning?project=${encodeURIComponent(projectId || snapshot.projectIdentity)}`; ui.root.setAttribute("aria-busy", "false"); ui.completed.focus?.(); return snapshot; }
    async function reload() {
      try { aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions()); if (assessment.lifecycle !== "ready") return showBlocked(assessment.diagnostic); progress = await repository.getProjectShapingPolicyPlanning(projectId, assessment.calculationId); if (!progress) return renderReady(assessment); const state = domain.validateProgressState(progress.state, { projectIdentity: projectId, calculationId: assessment.calculationId }); domain.validateBinding(state.snapshot, assessment); return renderCompleted(state.snapshot); }
      catch (problem) { return showBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message)); }
    }
    async function submit(policy) {
      if (busy) return null; ui.policyError.hidden = true; ui.error.hidden = true; if (!assessment?.availablePolicies?.some((entry) => entry.value === policy)) { ui.policyError.textContent = "Выберите, как распределять формирование реглана."; ui.policyError.hidden = false; return null; }
      setBusy(true); try { aggregate = await repository.getProject(projectId); assessment = domain.assessSource(sourceOptions()); if (assessment.lifecycle !== "ready") return showBlocked(assessment.diagnostic); const at = now(); const id = operationId(); const snapshot = domain.createCompletedSnapshot(assessment, { policy }, { timestamp: at, operationId: id, explicitConfirmation: true }); progress = await repository.ensureProjectShapingPolicyPlanning(projectId, assessment.calculationId, domain.createProgressState(snapshot), { expectedProjectRevision: aggregate.project.revision, timestamp: at, operationId: id }); return renderCompleted(domain.validateProgressState(progress.state, { projectIdentity: projectId, calculationId: assessment.calculationId }).snapshot); }
      catch (problem) { if (["REVISION_CONFLICT", "PROGRESS_REVISION_CONFLICT"].includes(problem?.code)) return reload(); ui.error.textContent = problem?.userMessage || "Не удалось сохранить способ формирования."; ui.error.hidden = false; return null; } finally { setBusy(false); }
    }
    async function start() {
      if (!domain || !system || Object.values(dependencies).some((value) => !value)) { showBlocked({ message: "Проверка исходной цепочки временно недоступна." }); return null; }
      try { projectId = domain.projectIdentityFromLocation(target.location); repository = repositoryFactory(); await repository.initialize(); ui.form.addEventListener("submit", (event) => { event.preventDefault(); submit(ui.form.elements.namedItem("policy")?.value || ""); }); target.addEventListener?.("pageshow", reload); target.addEventListener?.("yarnai-project-changed", reload); target.addEventListener?.("pagehide", close, { once: true }); if (typeof target.BroadcastChannel === "function") { channel = new target.BroadcastChannel("yarnai-projects-v1"); channel.addEventListener("message", (event) => { if (!event.data?.project_id || event.data.project_id === projectId) reload(); }); } await reload(); return { projectId, assessment, progress }; }
      catch (problem) { showBlocked(domain.diagnostic(problem?.code || "STORAGE_UNAVAILABLE", problem?.userMessage || problem?.message)); return null; }
    }
    async function close() { channel?.close(); await repository?.close?.().catch(() => undefined); }
    return Object.freeze({ start, reload, submit, close, renderReady, renderCompleted, getState: () => ({ projectId, aggregate, assessment, progress, busy }) });
  }
  const api = Object.freeze({ formatCm, createController }); globalObject.YarnAIProjectShapingPolicyPlanningWorkspace = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
