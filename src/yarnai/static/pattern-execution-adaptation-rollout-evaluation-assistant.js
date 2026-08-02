"use strict";

(function initializeRolloutEvaluationAssistant(globalObject) {
  const api = globalObject.YarnAIPatternExecutionAdaptationRolloutEvaluation;
  const system = globalObject.YarnAIProjectSystem;
  if (!api || !system) return;

  const byId = (id) => globalObject.document.getElementById(id);
  const params = new URLSearchParams(globalObject.location.search);
  const projectId = params.get("projectId") || params.get("project") || "";
  const requestedRolloutId = params.get("rolloutId") || params.get("adaptationRolloutId") || params.get("rollout") || null;
  const explicitNow = params.get("now") || null;
  const repository = new system.ProjectRepository();
  let source = null;
  let record = null;
  let progress = null;

  function json(id, fallback = []) { const value = byId(id).value.trim(); if (!value) return fallback; try { return JSON.parse(value); } catch { throw new api.PatternExecutionAdaptationRolloutEvaluationError("invalid_json", `${id} contains invalid JSON.`); } }
  function pretty(value) { return JSON.stringify(value ?? null, null, 2); }
  function now() { return explicitNow || record?.updatedAt || source?.rollout?.completedAt || source?.rollout?.updatedAt || api.DEFAULT_TIMESTAMP; }
  function commandOptions() { return { now: now(), expectedRevision: record?.revision, expectedIdentity: record?.identity, evaluationStorageRevision: progress?.revision || 0 }; }
  function setText(id, value) { const element = byId(id); if (element) element.textContent = value ?? "—"; }
  function explainReason(current) {
    if (!current) return "";
    if (current.proofStatus === "imported-unproven") return "Imported evaluation is unproven until an explicit local proof reprojection succeeds.";
    if (current.stale) return "The local source chain changed; this evaluation is stale.";
    if (current.actualImpact?.evidenceConflict) return "Trusted evidence conflicts and prevents a proven verdict.";
    if (current.impactComparison?.scopeCoverageRatio < 1) return "Actual evidence does not yet cover the complete required rollout scope.";
    if (current.regressions?.some((item) => !item.resolved)) return "A regression was detected and influences the derived verdict.";
    if (["required", "failed"].includes(current.rollbackAssessment?.recommendation)) return "Rollback is required before lifecycle completion.";
    if (!current.evidence?.some((item) => item.trusted)) return "More locally verified evidence is required.";
    return "";
  }
  function render() {
    const projection = record && source ? api.projectPatternExecutionAdaptationRolloutEvaluation(record, { ...source, evaluationStorageRevision: progress?.revision || 0 }) : null;
    const shown = record ? { ...record, ...(projection || {}) } : null;
    setText("evaluation-context", source?.rollout ? `Rollout ${source.rollout.id} · ${source.rollout.rolloutVerdict}` : "No completed rollout is available.");
    setText("evaluation-lifecycle", projection?.effectiveLifecycle || record?.lifecycle || "draft"); setText("evaluation-revision", record ? `Epoch ${record.epoch} · revision ${record.revision}` : "Epoch — · revision —");
    setText("evaluation-proof-status", projection?.proofStatus || (source?.sourceProof?.fullChainProven ? "proven" : "unproven"));
    const issues = projection?.sourceProof?.issues || source?.sourceProof?.issues || []; byId("evaluation-proof-issues").innerHTML = issues.map((item) => `<li>${String(item)}</li>`).join("");
    setText("evaluation-reason", explainReason(shown));
    byId("evaluation-scope-output").value = pretty(record?.scope || (source?.rollout ? api.normalizeScope(null, source.rollout, api.normalizeEvaluationWindow(json("evaluation-window-input", {}))) : {}));
    setText("evaluation-expected-impact", pretty(record?.expectedImpact)); setText("evaluation-actual-impact", pretty(projection?.actualImpact || record?.actualImpact)); setText("evaluation-impact-result", pretty(projection?.impactComparison || record?.impactComparison));
    setText("evaluation-stability-value", projection?.stabilityAssessment?.status || record?.stabilityAssessment?.status || "unknown"); setText("evaluation-rollback-value", projection?.rollbackAssessment?.recommendation || record?.rollbackAssessment?.recommendation || "undetermined"); setText("evaluation-follow-up-value", projection?.followUpAssessment?.nextAction || record?.followUpAssessment?.nextAction || "continue_monitoring"); setText("evaluation-verdict-value", projection?.verdict || record?.verdict || "undetermined");
    if (record) { byId("evaluation-strategy").value = record.strategy; byId("evaluation-window-input").value = pretty(record.evaluationWindow); byId("evaluation-observations-input").value = pretty(record.observations); byId("evaluation-metrics-input").value = pretty(record.metrics); byId("evaluation-evidence-input").value = pretty(record.evidence); byId("evaluation-regressions-input").value = pretty(record.regressions); byId("evaluation-side-effects-input").value = pretty(record.sideEffects); }
    const terminal = record && api.TERMINAL_LIFECYCLES.includes(record.lifecycle); byId("evaluation-terminal").hidden = !terminal;
    for (const button of globalObject.document.querySelectorAll("[data-command]")) { const command = button.dataset.command; button.disabled = terminal && command !== "open-latest" || !record && !["create", "open-latest"].includes(command) || record && command === "create"; }
    const back = byId("evaluation-back-rollout"); if (back && projectId) back.href = `/pattern-execution-adaptation-rollout?projectId=${encodeURIComponent(projectId)}${source?.rollout?.adaptationPromotionId ? `&adaptationPromotionId=${encodeURIComponent(source.rollout.adaptationPromotionId)}` : ""}`;
    const closure = byId("evaluation-open-closure"); if (closure && projectId) { closure.href = `/pattern-execution-adaptation-closure?projectId=${encodeURIComponent(projectId)}${record?.id ? `&evaluationId=${encodeURIComponent(record.id)}` : ""}`; closure.setAttribute("aria-disabled", record?.lifecycle !== "completed" && record?.lifecycle !== "aborted" ? "true" : "false"); }
  }
  async function reload(evaluationId = null) { source = await api.loadSource(repository, projectId, requestedRolloutId || record?.rolloutId || null); progress = await repository.getPatternExecutionAdaptationRolloutEvaluation(projectId, evaluationId, source.calculationId, source.rollout?.id); record = progress?.state || null; render(); }
  async function save(next, operationKind) { const stored = await repository.savePatternExecutionAdaptationRolloutEvaluation(projectId, next, { recordId: progress?.progress_id, expectedRevision: record?.revision, expectedIdentity: record?.identity, timestamp: next.updatedAt, operationKind }); progress = stored; record = stored.state; await reload(record.id); setText("evaluation-message", "Evaluation saved locally."); }
  async function run(command) {
    setText("evaluation-error", ""); setText("evaluation-message", "");
    if (command === "open-latest") { await reload(); return; }
    if (command === "create") { const window = json("evaluation-window-input", { start: now(), end: now(), minimumSamples: 1 }); const result = await repository.createPatternExecutionAdaptationRolloutEvaluation(projectId, { rolloutId: requestedRolloutId, strategy: byId("evaluation-strategy").value, evaluationWindow: window, now: explicitNow || source.rollout.completedAt }); progress = result.evaluationRecord; record = result.rawEvaluation; await reload(record.id); return; }
    const options = commandOptions(); let next = record;
    if (command === "save-strategy") next = api.setEvaluationStrategy(record, byId("evaluation-strategy").value, options);
    else if (command === "collect") next = api.startCollecting(record, source, options);
    else if (command === "save-observations") next = api.setObservations(record, json("evaluation-observations-input"), options);
    else if (command === "save-metrics") next = api.setMetrics(record, json("evaluation-metrics-input"), options);
    else if (command === "save-evidence") next = api.setEvidence(record, json("evaluation-evidence-input"), options);
    else if (command === "save-regressions") next = api.setRegressions(record, json("evaluation-regressions-input"), options);
    else if (command === "save-side-effects") next = api.setSideEffects(record, json("evaluation-side-effects-input"), options);
    else if (command === "analyze") next = api.startAnalyzing(record, source, options);
    else if (command === "review") next = api.startReviewing(record, source, options);
    else if (command === "complete") next = api.completeEvaluation(record, source, options);
    else if (command === "abort") next = api.abortEvaluation(record, source, { ...options, reason: byId("evaluation-abort-reason").value });
    await save(next, `PATTERN_EXECUTION_ADAPTATION_ROLLOUT_EVALUATION_${next.lifecycle.toUpperCase()}`);
  }
  async function initialize() {
    byId("evaluation-window-input").value = pretty({ start: explicitNow || api.DEFAULT_TIMESTAMP, end: explicitNow || api.DEFAULT_TIMESTAMP, minimumSamples: 1, sufficient: false });
    for (const id of ["evaluation-observations-input", "evaluation-metrics-input", "evaluation-evidence-input", "evaluation-regressions-input", "evaluation-side-effects-input"]) byId(id).value = "[]";
    if (!projectId) throw new api.PatternExecutionAdaptationRolloutEvaluationError("project_required", "Open this page from a project rollout."); await repository.initialize(); await reload();
    globalObject.document.addEventListener("click", (event) => { const button = event.target.closest("[data-command]"); if (!button) return; run(button.dataset.command).catch((error) => setText("evaluation-error", error?.userMessage || error?.message || "Evaluation command failed.")); });
  }
  initialize().catch((error) => { byId("evaluation-fatal").hidden = false; byId("evaluation-workflow").hidden = true; setText("evaluation-fatal-message", error?.userMessage || error?.message || "Evaluation could not be opened."); });
})(typeof window !== "undefined" ? window : globalThis);
