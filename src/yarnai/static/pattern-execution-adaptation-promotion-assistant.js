"use strict";

(function initializePatternExecutionAdaptationPromotionAssistant(globalObject) {
  const byId = (id) => document.getElementById(id);
  const ui = {
    fatal: byId("promotion-fatal"), fatalMessage: byId("promotion-fatal-message"), workflow: byId("promotion-workflow"), title: byId("promotion-title"), context: byId("promotion-context"),
    lifecycle: byId("promotion-lifecycle"), revision: byId("promotion-revision"), chain: byId("promotion-source-chain"), proofWarning: byId("promotion-proof-warning"), proofErrors: byId("promotion-proof-errors"), message: byId("promotion-message"), error: byId("promotion-error"),
    coverage: byId("promotion-coverage-values"), constraints: byId("promotion-constraints-values"), regressions: byId("promotion-regressions-values"), impact: byId("promotion-impact-values"), conditions: byId("promotion-conditions-input"),
    verdict: byId("promotion-verdict-value"), verdictReasons: byId("promotion-verdict-reasons"), returnRequired: byId("promotion-return-required"), blockers: byId("promotion-completion-blockers"), terminal: byId("promotion-terminal"), back: byId("promotion-back-validation"), forward: byId("promotion-forward-rollout"),
  };
  const api = globalObject.YarnAIPatternExecutionAdaptationPromotion;
  const system = globalObject.YarnAIProjectSystem;
  const commandButtons = [...document.querySelectorAll("[data-command]")];
  let repository = null;
  let projectId = null;
  let inspected = null;
  let localRecord = null;
  let renderedIdentity = null;
  let busy = false;

  initialize().catch((error) => showFatal(formatError(error, "Adaptation promotion could not be opened.")));

  async function initialize() {
    document.addEventListener("click", (event) => { const button = event.target.closest("[data-command]"); if (button) runCommand(button.dataset.command); });
    const query = new URLSearchParams(globalObject.location.search);
    projectId = query.get("project");
    const adaptationId = query.get("adaptation");
    const validationId = query.get("validation");
    if (!projectId) return renderWithoutProject();
    if (!system?.isUuidv7(projectId) || !api) return showFatal("The project context link is invalid.");
    repository = new system.ProjectRepository();
    await repository.initialize();
    inspected = await repository.readPatternExecutionAdaptationPromotion(projectId, null, adaptationId, validationId);
    localRecord = inspected.rawPromotion || null;
    updateBackLink(adaptationId, validationId);
    render();
  }

  function updateBackLink(adaptationId = null, validationId = null) {
    const linkedAdaptationId = localRecord?.adaptationId || inspected?.adaptation?.id || adaptationId;
    const linkedValidationId = localRecord?.adaptationValidationId || inspected?.validation?.id || validationId;
    const params = new URLSearchParams({ project: projectId });
    if (linkedAdaptationId) params.set("adaptation", linkedAdaptationId);
    if (linkedValidationId) params.set("validation", linkedValidationId);
    ui.back.href = `/pattern-execution-adaptation-validation?${params.toString()}`;
  }

  async function runCommand(command) {
    if (busy) return;
    ui.error.textContent = "";
    ui.message.textContent = "";
    try {
      if (command === "create-draft") {
        setBusy(true);
        inspected = await repository.createPatternExecutionAdaptationPromotion(projectId, { adaptationId: inspected.adaptation?.id || null, adaptationValidationId: inspected.validation?.id || null });
        localRecord = inspected.rawPromotion; renderedIdentity = null; updateBackLink();
        ui.message.textContent = "Draft promotion created from immutable source snapshots.";
      } else if (command === "start-evaluation") await persist(api.startEvaluation(ensureLocal(), inspected, binding()), "Promotion moved to deterministic evaluation.");
      else if (command === "save-conditions") await persist(api.setDecisionConditions(ensureLocal(), parseJson(ui.conditions), binding()), "Decision conditions saved; the verdict remains domain-derived.");
      else if (command === "start-decision") await persist(api.startDecision(ensureLocal(), inspected, binding()), "Promotion verdict calculated from validation evidence.");
      else if (command === "complete") await persist(api.completePromotion(ensureLocal(), inspected, binding()), "Promotion completed as an immutable decision.");
    } catch (error) {
      ui.error.textContent = formatError(error, "The action could not be completed.");
    } finally {
      setBusy(false);
      render();
    }
  }

  async function persist(record, message) {
    setBusy(true);
    await repository.savePatternExecutionAdaptationPromotion(projectId, record, { recordId: inspected.promotionRecord?.progress_id, expectedRevision: inspected.rawPromotion?.revision, expectedIdentity: inspected.rawPromotion?.identity, timestamp: record.updatedAt });
    inspected = await repository.readPatternExecutionAdaptationPromotion(projectId, record.id, record.adaptationId, record.adaptationValidationId);
    localRecord = inspected.rawPromotion; renderedIdentity = null; updateBackLink(); ui.message.textContent = message;
  }

  function render() {
    const record = localRecord;
    const lifecycle = ["blocked", "stale", "corrupted"].includes(inspected?.effectiveLifecycle) ? inspected.effectiveLifecycle : record?.lifecycle || "draft";
    ui.title.textContent = inspected?.project?.title ? `Adaptation promotion: ${inspected.project.title}` : "Decide adaptation promotion";
    ui.context.textContent = inspected?.adaptation && inspected?.validation ? `Source: adaptation ${inspected.adaptation.id} and completed validation ${inspected.validation.id}.` : "A linked adaptation and completed validation are required. No source record will be changed.";
    ui.lifecycle.textContent = lifecycle; ui.lifecycle.dataset.status = lifecycle;
    ui.revision.textContent = record ? `Epoch ${record.epoch} · revision ${record.revision}` : "Epoch — · revision —";
    const proof = inspected?.sourceProof || record?.sourceProof || { issues: ["source_chain_unavailable"], fullChainProven: false };
    const chain = [["Project", record?.projectId || inspected?.projectId || "missing"], ["Pattern execution", record?.patternExecutionId || inspected?.adaptation?.runtimeId || "missing"], ["Adaptation", record?.adaptationId || inspected?.adaptation?.id || "missing"], ["Validation", record?.adaptationValidationId || inspected?.validation?.id || "missing"], ["Promotion", record?.id || "not created"], ["Proof status", inspected?.proofStatus || record?.proofStatus || "unproven"]];
    ui.chain.replaceChildren(...chain.map(([label, value]) => detailItem(label, value)));
    ui.proofErrors.replaceChildren(...(proof.issues?.length ? proof.issues.map(listItem) : [listItem("The full project → execution → adaptation → validation → promotion chain is proven.")]));
    ui.proofWarning.hidden = Boolean(proof.fullChainProven && !inspected?.stale && (inspected?.proofStatus || record?.proofStatus) === "proven");
    const coverage = record?.coverage || api.calculateCoverage(inspected?.validation || {});
    ui.coverage.replaceChildren(...[["Required", coverage.required.length], ["Satisfied", coverage.satisfied.length], ["Missing", coverage.missing.join(", ") || "none"], ["Ratio", coverage.ratio], ["Sufficient", coverage.sufficient ? "yes" : "no"]].map(([label, value]) => detailItem(label, value)));
    const constraints = record?.constraints || api.normalizeConstraints(inspected?.validation?.constraintResults);
    ui.constraints.replaceChildren(...(constraints.length ? constraints.map((item) => listItem(`${item.severity} · ${item.status} · ${item.constraintId}: ${item.reason}`)) : [listItem("No constraints were reported.")]));
    const regressions = record?.regressions || api.normalizeRegressions(inspected?.validation?.regressionResults);
    ui.regressions.replaceChildren(...(regressions.length ? regressions.map((item) => listItem(`${item.severity} · ${item.status} · ${item.regressionId}: ${item.reason}`)) : [listItem("No regression result is available.")]));
    const impact = record?.expectedImpact || api.calculateExpectedImpact(inspected?.validation || {});
    ui.impact.replaceChildren(...[["Status", impact.status], ["Confirmed", impact.confirmed ? "yes" : "no"], ["Evidence", impact.evidence.join(", ") || "none"], ["Limitations", impact.limitations?.join(", ") || "none"]].map(([label, value]) => detailItem(label, value)));
    if (record && renderedIdentity !== record.identity) { ui.conditions.value = JSON.stringify(record.decisionConditions, null, 2); renderedIdentity = record.identity; }
    ui.conditions.disabled = lifecycle !== "evaluating" || busy;
    showCommand("create-draft", !record && inspected?.availableCommands?.includes("create"));
    showCommand("start-evaluation", lifecycle === "draft" && Boolean(record));
    showCommand("save-conditions", lifecycle === "evaluating");
    showCommand("start-decision", lifecycle === "evaluating");
    showCommand("complete", lifecycle === "deciding");
    const verdict = inspected?.promotionVerdict || record?.promotionVerdict || "undetermined";
    ui.verdict.textContent = verdict;
    const reasons = record?.decisionSummary?.reasons || [];
    ui.verdictReasons.replaceChildren(...(reasons.length ? reasons.map((item) => listItem(`${item.code}${item.references.length ? `: ${item.references.join(", ")}` : ""}`)) : [listItem("The final verdict is calculated at the deciding lifecycle.")]));
    ui.returnRequired.hidden = !record?.revisionRequired;
    const blockers = [];
    if (!proof.fullChainProven) blockers.push("source chain is not fully proven");
    if (!coverage.sufficient) blockers.push(`coverage missing: ${coverage.missing.join(", ") || "required plan items"}`);
    if (inspected?.stale || record?.stale) blockers.push("source revision changed");
    if ((inspected?.proofStatus || record?.proofStatus) === "imported-unproven") blockers.push("imported identity chain is unproven");
    ui.blockers.textContent = blockers.length ? `Completion evidence warnings: ${blockers.join("; ")}.` : "No source-proof or coverage blockers detected.";
    ui.terminal.hidden = lifecycle !== "completed";
    const rolloutAllowed = lifecycle === "completed" && proof.fullChainProven && !inspected?.stale && (inspected?.proofStatus || record?.proofStatus) === "proven" && ["promote", "promote_with_constraints"].includes(verdict);
    const rolloutParams = new URLSearchParams({ project: projectId });
    if (record?.adaptationId) rolloutParams.set("adaptation", record.adaptationId);
    if (record?.adaptationValidationId) rolloutParams.set("validation", record.adaptationValidationId);
    if (record?.adaptationPromotionId) rolloutParams.set("promotion", record.adaptationPromotionId);
    ui.forward.href = `/pattern-execution-adaptation-rollout?${rolloutParams.toString()}`;
    ui.forward.hidden = !rolloutAllowed;
  }

  function ensureLocal() { if (!localRecord) throw Object.assign(new Error("Promotion is unavailable."), { code: "missing_promotion", userMessage: "Create a draft from a linked adaptation and completed validation first." }); return localRecord; }
  function binding(record = localRecord) { return record ? { expectedRevision: record.revision, expectedIdentity: record.identity } : {}; }
  function parseJson(control) { try { return JSON.parse(control.value); } catch { throw Object.assign(new Error("Decision conditions contain invalid JSON."), { code: "invalid_json", userMessage: "Decision conditions contain invalid JSON." }); } }
  function detailItem(labelText, value) { const wrapper = document.createElement("div"); const label = document.createElement("dt"); const content = document.createElement("dd"); label.textContent = labelText; content.textContent = String(value); wrapper.append(label, content); return wrapper; }
  function listItem(value) { const item = document.createElement("li"); item.textContent = value; return item; }
  function formatError(error, fallback) { const code = typeof error?.code === "string" ? error.code : ""; const message = typeof error?.userMessage === "string" ? error.userMessage : fallback; const issues = Array.isArray(error?.details?.issues) ? error.details.issues.map((item) => item.code || item).filter(Boolean).join(", ") : ""; return `${code ? `${code}: ` : ""}${message}${issues ? ` Blocking reasons: ${issues}.` : ""}`; }
  function showCommand(command, visible) { const button = commandButtons.find((entry) => entry.dataset.command === command); if (button) button.hidden = !visible; }
  function setBusy(value) { busy = value; for (const button of commandButtons) button.disabled = value; }
  function renderWithoutProject() { inspected = { effectiveLifecycle: "blocked", sourceProof: { fullChainProven: false, issues: ["missing_project"] }, proofStatus: "unproven", availableCommands: [] }; ui.context.textContent = "No project selected. Promotion remains unavailable and nothing is stored."; ui.back.hidden = true; render(); }
  function showFatal(message) { ui.workflow.hidden = true; ui.fatal.hidden = false; ui.fatalMessage.textContent = message; }
})(typeof window !== "undefined" ? window : globalThis);
