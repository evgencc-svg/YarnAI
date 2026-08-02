"use strict";

(function initializePatternExecutionAdaptationAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("adaptation-fatal"), fatalMessage: byId("adaptation-fatal-message"), workflow: byId("adaptation-workflow"), title: byId("adaptation-title"), context: byId("adaptation-context"),
    status: byId("adaptation-status"), revision: byId("adaptation-revision"), chain: byId("adaptation-source-chain"), integrity: byId("adaptation-integrity-errors"), message: byId("adaptation-message"), error: byId("adaptation-error"),
    learning: byId("adaptation-learning-value"), learningReferences: byId("adaptation-learning-references"), terminal: byId("adaptation-terminal"), back: byId("adaptation-back-learning"), forward: byId("adaptation-validation-route"),
    targets: byId("adaptation-targets-input"), changes: byId("proposed-changes-input"), constraints: byId("preserved-constraints-input"), plan: byId("validation-plan-input"), impact: byId("expected-impact-input"), confidence: byId("confidence-assessment-input"),
  };
  const api = globalObject.YarnAIPatternExecutionAdaptation;
  const system = globalObject.YarnAIProjectSystem;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  const editors = [ui.targets, ui.changes, ui.constraints, ui.plan, ui.impact, ui.confidence];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let localRecord = null;
  let renderedIdentity = null;
  let busy = false;

  initialize().catch((error) => showFatal(safeMessage(error, "Adaptation could not be opened.")));

  async function initialize() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (button) runCommand(button.dataset.command);
    });
    projectId = new URLSearchParams(globalObject.location.search).get("project");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("The project context link is invalid.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionAdaptation(projectId);
    localRecord = inspected.rawAdaptation || null;
    ui.back.href = `/pattern-execution-learning?project=${encodeURIComponent(projectId)}`;
    ui.forward.href = `/pattern-execution-adaptation-validation?project=${encodeURIComponent(projectId)}`;
    render();
  }

  async function runCommand(command) {
    if (busy) return;
    ui.error.textContent = "";
    ui.message.textContent = "";
    try {
      if (command === "create-draft") {
        setBusy(true);
        inspected = await repository.createPatternExecutionAdaptation(projectId);
        localRecord = inspected.rawAdaptation;
        renderedIdentity = null;
        ui.message.textContent = "Draft adaptation created. No source record was changed.";
      } else if (command === "save-sections") {
        let next = ensureLocal();
        const commandBinding = binding(next);
        next = api.setAdaptationTargets(next, parseJson(ui.targets, "adaptationTargets"), commandBinding);
        next = api.setProposedChanges(next, parseJson(ui.changes, "proposedChanges"), binding(next));
        next = api.setPreservedConstraints(next, parseJson(ui.constraints, "preservedConstraints"), binding(next));
        next = api.setValidationPlan(next, parseJson(ui.plan, "validationPlan"), binding(next));
        next = api.setExpectedImpact(next, parseJson(ui.impact, "expectedImpact"), binding(next));
        next = api.setConfidenceAssessment(next, parseJson(ui.confidence, "confidenceAssessment"), binding(next));
        await persist(next, "Structured adaptation sections saved.");
      } else if (command === "start-review") await persist(api.startReview(ensureLocal(), inspected, binding()), "Adaptation moved to review.");
      else if (command === "return-draft") await persist(api.returnToDraft(ensureLocal(), inspected, binding()), "Adaptation returned to draft for editing.");
      else if (command === "complete") await persist(api.completeAdaptation(ensureLocal(), inspected, binding()), "Adaptation completed as an immutable proposal. No source record was changed.");
    } catch (error) {
      ui.error.textContent = safeMessage(error, "The action could not be completed.");
    } finally {
      setBusy(false);
      render();
    }
  }

  async function persist(record, successMessage) {
    setBusy(true);
    if (inspected.adaptationRecord) await repository.savePatternExecutionAdaptation(projectId, record, { recordId: inspected.adaptationRecord.progress_id, expectedRevision: inspected.rawAdaptation.revision, expectedIdentity: inspected.rawAdaptation.identity, timestamp: record.updatedAt });
    else await repository.savePatternExecutionAdaptation(projectId, record, { timestamp: record.updatedAt });
    inspected = await repository.readPatternExecutionAdaptation(projectId, record.id);
    localRecord = inspected.rawAdaptation;
    renderedIdentity = null;
    ui.message.textContent = successMessage;
  }

  function render() {
    const record = localRecord;
    const status = ["blocked", "stale", "corrupted"].includes(inspected?.effectiveStatus) ? inspected.effectiveStatus : record?.status || "draft";
    ui.title.textContent = inspected?.project?.title ? `Execution adaptation: ${inspected.project.title}` : "Execution adaptation proposal";
    ui.context.textContent = inspected?.learning ? `Source: latest completed learning ${inspected.learning.id}.` : "A proven latest completed learning is required before a draft can be created.";
    ui.status.textContent = status; ui.status.dataset.status = status;
    ui.revision.textContent = record ? `Epoch ${record.epoch} · revision ${record.revision}` : "Epoch — · revision —";
    const chain = [["Project", record?.projectId || inspected?.projectId || "missing"], ["Calculation", record?.calculationId || inspected?.calculationId || "missing"], ["Result", record?.resultId || "missing"], ["Runtime", record?.runtimeId || "missing"], ["Follow-up", record?.followUpId || "missing"], ["Retrospective", record?.retrospectiveId || "missing"], ["Learning", record?.learningId || inspected?.learning?.id || "missing"]];
    ui.chain.replaceChildren(...chain.map(([label, value]) => detailItem(label, value)));
    const integrity = inspected?.integrity || record?.integrity;
    ui.integrity.replaceChildren(...(integrity?.issues?.length ? integrity.issues.map((entry) => listItem(`${entry.severity}: ${entry.code}${entry.sourceId ? ` (${entry.sourceId})` : ""}`)) : [listItem("The critical source chain and adaptation proposal are valid.")]));
    ui.learning.textContent = inspected?.learning ? `${inspected.learning.id} · ${inspected.learning.identity} · ${inspected.learning.status}` : "No proven learning is available.";
    const knowledge = inspected?.learning ? [
      ...inspected.learning.lessonsLearned.map((entry) => `lesson: ${entry.id}`),
      ...inspected.learning.successfulPatterns.map((entry) => `successful pattern: ${entry.id}`),
      ...inspected.learning.antiPatterns.map((entry) => `anti-pattern: ${entry.id}`),
      ...inspected.learning.recommendations.map((entry) => `recommendation: ${entry.id}`),
    ] : [];
    ui.learningReferences.replaceChildren(...knowledge.map(listItem));
    if (record && renderedIdentity !== record.identity) loadEditors(record);
    const editable = status === "draft" && Boolean(record);
    for (const editor of editors) editor.disabled = !editable || busy;
    showCommand("create-draft", !record && inspected?.availableCommands?.includes("create"));
    showCommand("save-sections", editable);
    showCommand("start-review", editable);
    showCommand("return-draft", status === "reviewing");
    showCommand("complete", status === "reviewing" && Boolean(integrity?.valid));
    ui.terminal.hidden = status !== "completed";
    ui.forward.hidden = !(status === "completed" && Boolean(integrity?.valid));
  }

  function loadEditors(record) {
    ui.targets.value = pretty(record.adaptationTargets);
    ui.changes.value = pretty(record.proposedChanges);
    ui.constraints.value = pretty(record.preservedConstraints);
    ui.plan.value = pretty(record.validationPlan);
    ui.impact.value = pretty(record.expectedImpact);
    ui.confidence.value = pretty(record.confidenceAssessment);
    renderedIdentity = record.identity;
  }

  function parseJson(control, field) {
    try { return JSON.parse(control.value); }
    catch { throw Object.assign(new Error(`${field} contains invalid JSON.`), { code: "invalid_json", userMessage: `${field} contains invalid JSON.` }); }
  }

  function ensureLocal() { if (!localRecord) throw Object.assign(new Error("Adaptation is unavailable."), { code: "missing_adaptation", userMessage: "Create a draft from a proven completed learning first." }); return localRecord; }
  function binding(record = localRecord) { return record ? { expectedRevision: record.revision, expectedIdentity: record.identity } : {}; }
  function pretty(value) { return JSON.stringify(value, null, 2); }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function safeMessage(error, fallback) { const code = typeof error?.code === "string" ? error.code : ""; const message = typeof error?.userMessage === "string" ? error.userMessage : fallback; return `${code ? `${code}: ` : ""}${message}`; }
  function showCommand(command, visible) { const button = commandButtons.find((entry) => entry.dataset.command === command); if (button) button.hidden = !visible; }
  function setBusy(value) { busy = value; for (const button of commandButtons) button.disabled = value; }
  function renderWithoutProject() { inspected = { effectiveStatus: "blocked", integrity: { valid: false, issues: [{ severity: "critical", code: "missing_project", sourceId: null }] }, availableCommands: [] }; ui.context.textContent = "No project selected. Adaptation remains unavailable and nothing is stored."; ui.back.hidden = true; render(); }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
