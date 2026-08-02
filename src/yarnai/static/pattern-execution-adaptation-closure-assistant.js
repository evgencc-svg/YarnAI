"use strict";

(function initializeAdaptationClosureAssistant(globalObject) {
  const api = globalObject.YarnAIPatternExecutionAdaptationClosure;
  const system = globalObject.YarnAIProjectSystem;
  if (!api || !system) return;

  const byId = (id) => globalObject.document.getElementById(id);
  const params = new URLSearchParams(globalObject.location.search);
  const projectId = params.get("projectId") || params.get("project") || "";
  const requestedEvaluationId = params.get("evaluationId") || params.get("adaptationRolloutEvaluationId") || params.get("evaluation") || null;
  const explicitNow = params.get("now") || null;
  const repository = new system.ProjectRepository();
  let source = null;
  let record = null;
  let progress = null;

  function json(id, fallback) { const value = byId(id).value.trim(); if (!value) return fallback; try { return JSON.parse(value); } catch { throw new api.PatternExecutionAdaptationClosureError("invalid_json", `${id} contains invalid JSON.`); } }
  function pretty(value) { return JSON.stringify(value ?? null, null, 2); }
  function now() { return explicitNow || record?.updatedAt || source?.evaluation?.completedAt || source?.evaluation?.updatedAt || api.DEFAULT_TIMESTAMP; }
  function options() { return { now: now(), expectedRevision: record?.revision, expectedIdentity: record?.identity, closureStorageRevision: progress?.revision || 0 }; }
  function setText(id, value) { const element = byId(id); if (element) element.textContent = value ?? "—"; }
  function explain(current) {
    if (current?.proofStatus === "imported-unproven") return "Imported closure claims are unproven until explicit local proof reprojection succeeds.";
    const reasons = current?.blockingReasons || [];
    const messages = {
      evaluation_not_terminal: "The rollout evaluation is not terminal.", evaluation_stale: "The rollout evaluation is stale.", evaluation_imported_unproven: "The imported evaluation has not been proven locally.",
      insufficient_trusted_evidence: "The complete source chain or trusted evidence is insufficient.", incomplete_closure_scope: "Closure scope does not cover the evaluated scope.", unresolved_major_risk: "A major residual risk is unresolved or lacks owner and mitigation.",
      missing_owner: "A required owner is missing.", blocking_obligation: "An open blocking obligation prevents closure.", monitoring_commitment_required: "Monitored acceptance requires an active monitoring commitment.", rollback_not_verified: "Rollback restoration is not verified.",
      follow_up_not_registered: "The evaluation's required follow-up has not been registered.", source_collision: "A source identity collision prevents closure.", digest_mismatch: "The immutable closure digest does not match its snapshot.",
    };
    return reasons.map((reason) => messages[reason] || reason).join(" ");
  }
  function render() {
    const projection = record && source ? api.projectPatternExecutionAdaptationClosure(record, { ...source, closureStorageRevision: progress?.revision || 0 }) : null;
    const shown = record ? { ...record, ...(projection || {}) } : null;
    setText("closure-context", source?.evaluation ? `Evaluation ${source.evaluation.id} · ${source.evaluation.verdict}` : "No terminal rollout evaluation is available.");
    setText("closure-lifecycle", projection?.effectiveLifecycle || record?.lifecycle || "draft"); setText("closure-revision", record ? `Epoch ${record.epoch} · revision ${record.revision}` : "Epoch — · revision —");
    setText("closure-proof-status", projection?.proofStatus || (source?.sourceProof?.fullChainProven ? "proven" : "unproven")); const proofIssues = projection?.sourceProof?.issues || source?.sourceProof?.issues || []; byId("closure-proof-issues").innerHTML = proofIssues.map((item) => `<li>${String(item)}</li>`).join("");
    setText("closure-evaluation-verdict", source?.evaluation?.verdict || record?.evaluationSnapshot?.verdict || "undetermined"); setText("closure-type", projection?.closureType || record?.closureType); setText("closure-decision", projection?.decision || record?.decision || "pending"); setText("closure-verdict", projection?.verdict || record?.verdict || "undetermined");
    setText("closure-accepted-outcome", pretty(projection?.acceptedOutcome || record?.acceptedOutcome)); setText("closure-rejected-outcome", pretty(record?.rejectedOutcome)); setText("closure-rollback-resolution", record?.rollbackResolution || "not_applicable"); setText("closure-follow-up-resolution", record?.followUpResolution || "none"); setText("closure-digest", record?.closureDigest);
    const reasons = projection?.blockingReasons || record?.blockingReasons || []; byId("closure-blocking-list").innerHTML = reasons.map((item) => `<li>${String(item)}</li>`).join(""); setText("closure-reason", explain({ ...record, ...projection }));
    if (record) { byId("closure-scope-input").value = pretty(record.closureScope); byId("closure-permanent-input").value = pretty(record.permanentChanges); byId("closure-reverted-input").value = pretty(record.revertedChanges); byId("closure-retained-constraints-input").value = pretty(record.retainedConstraints); byId("closure-resolved-constraints-input").value = pretty(record.resolvedConstraints); byId("closure-risks-input").value = pretty(record.residualRisks); byId("closure-issues-input").value = pretty(record.residualIssues); byId("closure-obligations-input").value = pretty(record.obligations); byId("closure-monitoring-input").value = pretty(record.monitoringCommitments); byId("closure-ownership-input").value = pretty(record.ownership); byId("closure-superseding-adaptation").value = record.supersedingAdaptationId || ""; }
    else if (source?.evaluation) byId("closure-scope-input").value = pretty(api.normalizeClosureScope(null, source.rollout, source.evaluation));
    const terminal = record && api.TERMINAL_LIFECYCLES.includes(record.lifecycle); byId("closure-terminal").hidden = !terminal;
    for (const button of globalObject.document.querySelectorAll("[data-command]")) { const command = button.dataset.command; button.disabled = terminal && command !== "open-latest" || !record && !["create", "open-latest"].includes(command) || record && command === "create"; }
    const back = byId("closure-back-evaluation"); if (back && projectId) back.href = `/pattern-execution-adaptation-rollout-evaluation?projectId=${encodeURIComponent(projectId)}${record?.rolloutId || source?.evaluation?.rolloutId ? `&rolloutId=${encodeURIComponent(record?.rolloutId || source.evaluation.rolloutId)}` : ""}`;
    const evolution = byId("closure-open-evolution"); if (evolution && projectId) { evolution.href = `/pattern-evolution-initiation?projectId=${encodeURIComponent(projectId)}${record?.id ? `&closureId=${encodeURIComponent(record.id)}` : ""}`; evolution.hidden = !record || record.lifecycle !== "closed"; }
  }
  async function reload(closureId = null) { source = await api.loadSource(repository, projectId, requestedEvaluationId || record?.evaluationId || null); progress = await repository.getPatternExecutionAdaptationClosure(projectId, closureId, source.calculationId, source.evaluation?.id); record = progress?.state || null; render(); }
  async function save(next, operationKind) { const stored = await repository.savePatternExecutionAdaptationClosure(projectId, next, { recordId: progress?.progress_id, expectedRevision: record?.revision, expectedIdentity: record?.identity, timestamp: next.updatedAt, operationKind }); progress = stored; record = stored.state; await reload(record.id); setText("closure-message", "Closure saved locally."); }
  async function run(command) {
    setText("closure-error", ""); setText("closure-message", "");
    if (command === "open-latest") { await reload(); return; }
    if (command === "create") { const result = await repository.createPatternExecutionAdaptationClosure(projectId, { evaluationId: requestedEvaluationId, now: explicitNow || source.evaluation.completedAt }); progress = result.closureRecord; record = result.rawClosure; await reload(record.id); return; }
    const commandOptions = options(); let next = record;
    if (command === "save-scope") next = api.setClosureScope(record, json("closure-scope-input", {}), commandOptions);
    else if (command === "save-changes") { next = api.setPermanentChanges(record, json("closure-permanent-input", []), commandOptions); next = api.setRevertedChanges(next, json("closure-reverted-input", []), { ...commandOptions, expectedRevision: next.revision, expectedIdentity: next.identity }); }
    else if (command === "save-constraints") next = api.setConstraintDisposition(record, json("closure-retained-constraints-input", []), json("closure-resolved-constraints-input", []), commandOptions);
    else if (command === "save-risks") { next = api.setResidualRisks(record, json("closure-risks-input", []), commandOptions); next = api.setResidualIssues(next, json("closure-issues-input", []), { ...commandOptions, expectedRevision: next.revision, expectedIdentity: next.identity }); }
    else if (command === "save-obligations") next = api.setObligations(record, json("closure-obligations-input", []), commandOptions);
    else if (command === "save-monitoring") next = api.setMonitoringCommitments(record, json("closure-monitoring-input", []), commandOptions);
    else if (command === "save-ownership") next = api.setOwnership(record, json("closure-ownership-input", {}), commandOptions);
    else if (command === "prepare") next = api.startPreparing(record, source, commandOptions);
    else if (command === "decide") next = api.startDeciding(record, source, commandOptions);
    else if (command === "finalize") next = api.startFinalizing(record, source, commandOptions);
    else if (command === "close") next = api.closeClosure(record, source, commandOptions);
    else if (command === "reject") next = api.rejectClosure(record, source, { ...commandOptions, reason: byId("closure-terminal-reason").value });
    else if (command === "abort") next = api.abortClosure(record, source, { ...commandOptions, reason: byId("closure-terminal-reason").value });
    else if (command === "supersede") next = api.supersedeClosure(record, source, { ...commandOptions, reason: byId("closure-terminal-reason").value, supersedingAdaptationId: byId("closure-superseding-adaptation").value });
    await save(next, `PATTERN_EXECUTION_ADAPTATION_CLOSURE_${next.lifecycle.toUpperCase()}`);
  }
  async function initialize() {
    for (const id of ["closure-permanent-input", "closure-reverted-input", "closure-retained-constraints-input", "closure-resolved-constraints-input", "closure-risks-input", "closure-issues-input", "closure-obligations-input", "closure-monitoring-input"]) byId(id).value = "[]"; byId("closure-ownership-input").value = "{}";
    if (!projectId) throw new api.PatternExecutionAdaptationClosureError("project_required", "Open this page from a rollout evaluation."); await repository.initialize(); await reload();
    globalObject.document.addEventListener("click", (event) => { const button = event.target.closest("[data-command]"); if (!button) return; run(button.dataset.command).catch((error) => setText("closure-error", error?.userMessage || error?.message || "Closure command failed.")); });
  }
  initialize().catch((error) => { byId("closure-fatal").hidden = false; byId("closure-workflow").hidden = true; setText("closure-fatal-message", error?.userMessage || error?.message || "Closure could not be opened."); });
})(typeof window !== "undefined" ? window : globalThis);
