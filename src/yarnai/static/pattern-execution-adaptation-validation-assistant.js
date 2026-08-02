"use strict";

(function initializePatternExecutionAdaptationValidationAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("validation-fatal"), fatalMessage: byId("validation-fatal-message"), workflow: byId("validation-workflow"), title: byId("validation-title"), context: byId("validation-context"),
    status: byId("validation-status"), revision: byId("validation-revision"), chain: byId("validation-source-chain"), stale: byId("validation-stale-warning"), integrity: byId("validation-integrity-errors"), message: byId("validation-message"), error: byId("validation-error"), terminal: byId("validation-terminal"), back: byId("validation-back-adaptation"), forward: byId("validation-forward-promotion"),
    adaptation: byId("selected-adaptation-value"), targets: byId("adaptation-targets-view"), changes: byId("proposed-changes-view"), constraints: byId("preserved-constraints-view"), declaredPlan: byId("declared-validation-plan-view"), coverage: byId("validation-coverage-values"),
    executed: byId("executed-validations-input"), constraintResults: byId("constraint-results-input"), regressions: byId("regression-results-input"), impacts: byId("expected-impact-results-input"), unresolved: byId("unresolved-items-input"), evidence: byId("evidence-summary-input"), confidence: byId("validation-confidence-input"),
    verdict: byId("final-verdict-value"), verdictReasons: byId("verdict-reasons"),
  };
  const api = globalObject.YarnAIPatternExecutionAdaptationValidation;
  const system = globalObject.YarnAIProjectSystem;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  const editors = [ui.executed, ui.constraintResults, ui.regressions, ui.impacts, ui.unresolved, ui.evidence, ui.confidence];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let localRecord = null;
  let renderedIdentity = null;
  let busy = false;

  initialize().catch((error) => showFatal(safeMessage(error, "Adaptation validation could not be opened.")));

  async function initialize() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-command]");
      if (button) runCommand(button.dataset.command);
    });
    const query = new URLSearchParams(globalObject.location.search);
    projectId = query.get("project");
    const adaptationId = query.get("adaptation");
    const validationId = query.get("validation");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("The project context link is invalid.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionAdaptationValidation(projectId, validationId, adaptationId);
    localRecord = inspected.rawValidation || null;
    const linkedAdaptationId = inspected.adaptation?.id || localRecord?.adaptationId || adaptationId;
    ui.back.href = `/pattern-execution-adaptation?project=${encodeURIComponent(projectId)}${linkedAdaptationId ? `&adaptation=${encodeURIComponent(linkedAdaptationId)}` : ""}`;
    const linkedValidationId = localRecord?.id || validationId;
    ui.forward.href = `/pattern-execution-adaptation-promotion?project=${encodeURIComponent(projectId)}${linkedAdaptationId ? `&adaptation=${encodeURIComponent(linkedAdaptationId)}` : ""}${linkedValidationId ? `&validation=${encodeURIComponent(linkedValidationId)}` : ""}`;
    render();
  }

  async function runCommand(command) {
    if (busy) return;
    ui.error.textContent = "";
    ui.message.textContent = "";
    try {
      if (command === "create-draft") {
        setBusy(true);
        inspected = await repository.createPatternExecutionAdaptationValidation(projectId, { adaptationId: inspected.adaptation?.id || null });
        localRecord = inspected.rawValidation;
        renderedIdentity = null;
        ui.message.textContent = "Draft validation created from the completed adaptation snapshot. No adaptation was applied.";
      } else if (command === "start-validation") await persist(api.startValidation(ensureLocal(), inspected, binding()), "Validation is running; record only checks that were actually performed.");
      else if (command === "save-results") {
        let next = ensureLocal();
        next = api.setExecutedValidations(next, parseJson(ui.executed, "executedValidations"), binding(next));
        next = api.setConstraintResults(next, parseJson(ui.constraintResults, "constraintResults"), binding(next));
        next = api.setRegressionResults(next, parseJson(ui.regressions, "regressionResults"), binding(next));
        next = api.setExpectedImpactResults(next, parseJson(ui.impacts, "expectedImpactResults"), binding(next));
        next = api.setUnresolvedItems(next, parseJson(ui.unresolved, "unresolvedItems"), binding(next));
        next = api.setEvidenceSummary(next, parseJson(ui.evidence, "evidenceSummary"), binding(next));
        next = api.setConfidenceAssessment(next, parseJson(ui.confidence, "confidenceAssessment"), binding(next));
        await persist(next, "Structured validation results and evidence references saved.");
      } else if (command === "return-draft") await persist(api.returnToDraft(ensureLocal(), inspected, binding()), "Validation returned to draft.");
      else if (command === "start-review") await persist(api.startReview(ensureLocal(), inspected, binding()), "Validation moved to reviewing after required checks reached terminal states.");
      else if (command === "return-running") await persist(api.returnToRunning(ensureLocal(), inspected, binding()), "Validation returned to running for additional evidence.");
      else if (command === "complete") await persist(api.completeValidation(ensureLocal(), inspected, binding()), "Validation completed with a domain-derived verdict. No source record or adaptation was changed.");
    } catch (error) {
      ui.error.textContent = formatError(error, "The action could not be completed.");
    } finally {
      setBusy(false);
      render();
    }
  }

  async function persist(record, successMessage) {
    setBusy(true);
    if (inspected.validationRecord) await repository.savePatternExecutionAdaptationValidation(projectId, record, { recordId: inspected.validationRecord.progress_id, expectedRevision: inspected.rawValidation.revision, expectedIdentity: inspected.rawValidation.identity, timestamp: record.updatedAt });
    else await repository.savePatternExecutionAdaptationValidation(projectId, record, { timestamp: record.updatedAt });
    inspected = await repository.readPatternExecutionAdaptationValidation(projectId, record.id, record.adaptationId);
    localRecord = inspected.rawValidation;
    renderedIdentity = null;
    ui.message.textContent = successMessage;
  }

  function render() {
    const record = localRecord;
    const status = ["blocked", "stale", "corrupted"].includes(inspected?.effectiveStatus) ? inspected.effectiveStatus : record?.status || "draft";
    ui.title.textContent = inspected?.project?.title ? `Adaptation validation: ${inspected.project.title}` : "Validate a completed adaptation";
    ui.context.textContent = inspected?.adaptation ? `Source: completed adaptation ${inspected.adaptation.id} at revision ${inspected.adaptation.revision}.` : "A proven latest completed adaptation is required before a draft can be created.";
    ui.status.textContent = status; ui.status.dataset.status = status;
    ui.revision.textContent = record ? `Epoch ${record.epoch} · revision ${record.revision}` : "Epoch — · revision —";
    const chain = [["Project", record?.projectId || inspected?.projectId || "missing"], ["Calculation", record?.calculationId || inspected?.calculationId || "missing"], ["Result", record?.resultId || "missing"], ["Runtime", record?.runtimeId || "missing"], ["Follow-up", record?.followUpId || "missing"], ["Retrospective", record?.retrospectiveId || "missing"], ["Learning", record?.learningId || "missing"], ["Adaptation", record?.adaptationId || inspected?.adaptation?.id || "missing"]];
    ui.chain.replaceChildren(...chain.map(([label, value]) => detailItem(label, value)));
    const integrity = inspected?.integrity || record?.integrity;
    ui.integrity.replaceChildren(...(integrity?.issues?.length ? integrity.issues.map((entry) => listItem(`${entry.severity}: ${entry.code}${entry.sourceId ? ` (${entry.sourceId})` : ""}`)) : [listItem("The full source chain, identities, and adaptation snapshot are current.")]));
    ui.stale.hidden = !["stale", "corrupted", "blocked"].includes(status);
    const adaptation = inspected?.adaptation || null;
    ui.adaptation.textContent = adaptation ? `${adaptation.id} · ${adaptation.identity} · ${adaptation.status}` : "No proven completed adaptation is available.";
    ui.targets.textContent = pretty(record?.adaptationSnapshot?.adaptationTargets || adaptation?.adaptationTargets || []);
    ui.changes.textContent = pretty(record?.adaptationSnapshot?.proposedChanges || adaptation?.proposedChanges || []);
    ui.constraints.textContent = pretty(record?.adaptationSnapshot?.preservedConstraints || adaptation?.preservedConstraints || []);
    ui.declaredPlan.textContent = pretty(record?.declaredValidationPlan || adaptation?.validationPlan || []);
    const coverage = record?.validationCoverage || { totalRequired: 0, executedRequired: 0, passedRequired: 0, failedRequired: 0, blockedRequired: 0, skippedRequired: 0, coverageRatio: "0/0", passRatio: "0/0", uncoveredPlanItemIds: [] };
    ui.coverage.replaceChildren(...[["Required", coverage.totalRequired], ["Executed", coverage.executedRequired], ["Passed", coverage.passedRequired], ["Failed", coverage.failedRequired], ["Blocked", coverage.blockedRequired], ["Skipped", coverage.skippedRequired], ["Coverage", coverage.coverageRatio], ["Pass ratio", coverage.passRatio], ["Uncovered", coverage.uncoveredPlanItemIds.join(", ") || "none"]].map(([label, value]) => detailItem(label, value)));
    if (record && renderedIdentity !== record.identity) loadEditors(record);
    const editable = status === "running" && Boolean(record);
    for (const editor of editors) editor.disabled = !editable || busy;
    showCommand("create-draft", !record && inspected?.availableCommands?.includes("create"));
    showCommand("start-validation", status === "draft" && Boolean(record));
    showCommand("save-results", editable);
    showCommand("return-draft", ["running", "reviewing"].includes(status));
    showCommand("start-review", status === "running");
    showCommand("return-running", status === "reviewing");
    showCommand("complete", status === "reviewing" && Boolean(integrity?.valid));
    ui.verdict.textContent = record?.finalVerdict || "Not completed";
    ui.verdictReasons.replaceChildren(...(record?.verdictReasons?.length ? record.verdictReasons.map((entry) => listItem(`${entry.code}: ${entry.references.join(", ") || "no references"}`)) : [listItem("The verdict is derived only at completion.")]));
    ui.terminal.hidden = status !== "completed";
    if (record) ui.forward.href = `/pattern-execution-adaptation-promotion?project=${encodeURIComponent(projectId)}&adaptation=${encodeURIComponent(record.adaptationId)}&validation=${encodeURIComponent(record.id)}`;
    ui.forward.hidden = !(status === "completed" && Boolean(integrity?.valid) && api.FINAL_VERDICTS.includes(record?.finalVerdict));
  }

  function loadEditors(record) {
    ui.executed.value = pretty(record.executedValidations); ui.constraintResults.value = pretty(record.constraintResults); ui.regressions.value = pretty(record.regressionResults);
    ui.impacts.value = pretty(record.expectedImpactResults); ui.unresolved.value = pretty(record.unresolvedItems); ui.evidence.value = pretty(record.evidenceSummary); ui.confidence.value = pretty(record.confidenceAssessment);
    renderedIdentity = record.identity;
  }
  function parseJson(control, field) { try { return JSON.parse(control.value); } catch { throw Object.assign(new Error(`${field} contains invalid JSON.`), { code: "invalid_json", userMessage: `${field} contains invalid JSON.` }); } }
  function ensureLocal() { if (!localRecord) throw Object.assign(new Error("Validation is unavailable."), { code: "missing_validation", userMessage: "Create a draft from a proven completed adaptation first." }); return localRecord; }
  function binding(record = localRecord) { return record ? { expectedRevision: record.revision, expectedIdentity: record.identity } : {}; }
  function pretty(value) { return JSON.stringify(value, null, 2); }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function formatError(error, fallback) { const code = typeof error?.code === "string" ? error.code : ""; const message = typeof error?.userMessage === "string" ? error.userMessage : fallback; const issues = Array.isArray(error?.details?.issues) ? error.details.issues.map((entry) => entry.code || entry.field).filter(Boolean).join(", ") : ""; return `${code ? `${code}: ` : ""}${message}${issues ? ` Blocking reasons: ${issues}.` : ""}`; }
  function safeMessage(error, fallback) { const code = typeof error?.code === "string" ? error.code : ""; const message = typeof error?.userMessage === "string" ? error.userMessage : fallback; return `${code ? `${code}: ` : ""}${message}`; }
  function showCommand(command, visible) { const button = commandButtons.find((entry) => entry.dataset.command === command); if (button) button.hidden = !visible; }
  function setBusy(value) { busy = value; for (const button of commandButtons) button.disabled = value; }
  function renderWithoutProject() { inspected = { effectiveStatus: "blocked", integrity: { valid: false, issues: [{ severity: "critical", code: "missing_project", sourceId: null }] }, availableCommands: [] }; ui.context.textContent = "No project selected. Validation remains unavailable and nothing is stored."; ui.back.hidden = true; render(); }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
