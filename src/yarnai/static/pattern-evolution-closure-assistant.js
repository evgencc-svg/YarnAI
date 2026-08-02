"use strict";

(function initializePatternEvolutionClosureAssistant(globalObject) {
  const api = globalObject.YarnAIPatternEvolutionClosure;
  const acceptanceApi = globalObject.YarnAIPatternEvolutionAcceptance;
  const system = globalObject.YarnAIProjectSystem;
  if (!api || !acceptanceApi || !system) return;

  const byId = (id) => globalObject.document.getElementById(id);
  const params = new URLSearchParams(globalObject.location.search);
  const projectId = params.get("projectId") || params.get("project") || "";
  const requestedAcceptanceId = params.get("acceptanceId") || null;
  const requestedClosureId = params.get("closureId") || null;
  const explicitNow = params.get("now") || null;
  const repository = new system.ProjectRepository();
  let source = null; let progress = null; let record = null; let projection = null; let loadFailure = null;

  function text(id, value) { const element = byId(id); if (element) element.textContent = value ?? "—"; }
  function pretty(value) { return JSON.stringify(value ?? null, null, 2); }
  function show(id, visible) { const element = byId(id); if (element) element.hidden = !visible; }
  function list(id, values) { const element = byId(id); if (!element) return; element.replaceChildren(); for (const value of values || []) { const item = globalObject.document.createElement("li"); item.textContent = typeof value === "object" ? `${value.code || value.id || "finding"}${value.message ? `: ${value.message}` : ""}` : String(value); element.append(item); } }
  function acceptanceContext(shown) { const query = new URLSearchParams(); if (projectId) query.set("projectId", projectId); const fields = [["patternId", shown?.patternId || source?.patternId], ["initiationId", shown?.sourceInitiationId], ["proposalId", shown?.sourceProposalId], ["reviewId", shown?.sourceReviewId], ["decisionId", shown?.sourceDecisionId], ["executionId", shown?.sourceExecutionId], ["verificationId", shown?.sourceVerificationId], ["acceptanceId", shown?.sourceAcceptanceId || source?.acceptance?.id]]; for (const [key, value] of fields) if (value) query.set(key, value); return query.toString() ? `?${query}` : ""; }
  function render() {
    try { projection = record && source ? api.projectPatternEvolutionClosure(record, source) : null; } catch (error) { loadFailure = error; projection = null; }
    const shown = projection?.record || record; const contract = projection?.contract || shown?.closureContract || (source?.acceptance ? api.calculateClosureContract(source) : null); const gate = contract?.gate || (source ? api.calculateLiveChainGate(source, shown) : null);
    const lifecycle = projection?.lifecycle || shown?.lifecycle || "missing"; const status = projection?.status || shown?.status || contract?.status || "blocked"; const outcome = projection?.outcome || shown?.outcome || contract?.outcome || "blocked"; const risk = projection?.risk || shown?.risk || contract?.riskReconciliation || { level: "indeterminate" }; const chainValidity = projection?.chainValidity || shown?.chainValidity || (gate?.valid ? "valid" : "invalid"); const trust = projection?.trust || shown?.trust || gate?.trust || "untrusted"; const reasons = projection?.reasons || shown?.reasons || contract?.reasons || gate?.reasons || [];
    const acceptance = source?.acceptance || shown?.sourceSnapshots?.acceptance || null;
    text("closure-context", projectId ? acceptance ? `Project ${projectId} · acceptance ${acceptance.id} · ${acceptance.lifecycle} / ${acceptance.verdict}` : `Project ${projectId} · terminal acceptance required` : "No project context. Open this page from an eligible terminal acceptance.");
    text("closure-lifecycle", lifecycle); text("closure-status", status); text("closure-status-output", status); text("closure-outcome", outcome); text("closure-outcome-output", outcome); text("closure-risk", risk.level); text("closure-risk-output", risk.level); text("closure-chain-validity", chainValidity); text("closure-chain-output", chainValidity); text("closure-trust", trust);
    text("closure-id", shown?.id); text("closure-identity", shown?.identity); text("closure-semantic-identity", shown?.semanticIdentity); text("closure-digest", shown?.digest); text("closure-revision", shown ? `Epoch ${shown.epoch} · closure revision ${shown.closureRevision} · record revision ${shown.revision}` : "—"); text("closure-policy-summary", `${api.POLICY_VERSION} · outcome, status, risk, chain validity, and trust are computed from the live immutable cycle.`);
    text("closure-project-id", shown?.projectId || source?.projectId || projectId); text("closure-pattern-id", shown?.patternId || source?.patternId); text("closure-cycle-id", shown?.cycleId || source?.cycleId); for (const name of ["initiation", "proposal", "review", "decision", "execution", "verification", "acceptance"]) text(`closure-${name}-id`, shown?.[`source${name[0].toUpperCase()}${name.slice(1)}Id`] || source?.[name]?.id);
    text("closure-source-chain-digest", shown?.sourceChainDigest || gate?.sourceChainDigest); text("closure-source-proof", shown?.proofStatus || gate?.trust || "unproven"); text("closure-stale-projection", String(projection?.stale || contract?.staleProjection || false)); text("closure-source-binding", pretty(shown?.sourceBinding || gate?.binding));
    text("closure-acceptance-reconciliation", pretty(contract?.acceptanceReconciliation)); text("closure-condition-disposition", pretty(contract?.conditionDisposition)); text("closure-criteria", pretty(contract?.closureCriteria)); text("closure-disposition", pretty(contract?.closureDisposition)); text("closure-evidence-completeness", pretty(contract?.evidenceReconciliation?.completeness)); text("closure-evidence-consistency", pretty(contract?.evidenceReconciliation?.consistency)); text("closure-evidence-coverage", pretty(contract?.evidenceReconciliation?.coverage)); text("closure-evidence-provenance", pretty({ provenance: contract?.evidenceReconciliation?.provenance, trust })); text("closure-risk-reconciliation", pretty(contract?.riskReconciliation)); list("closure-reason-list", reasons);
    const codes = new Set((reasons || []).map((item) => item.code)); show("closure-loading", false); show("closure-workflow", true); show("closure-missing-context", !projectId || !acceptance); show("closure-stale", projection?.stale === true || contract?.staleProjection === true); show("closure-imported-unproven", shown?.importedUnproven === true || [...codes].some((code) => code.includes("imported_unproven"))); show("closure-collision", shown?.collision === true || [...codes].some((code) => code.includes("collision") || code === "duplicate_terminal_closure")); show("closure-quarantine", shown?.quarantined === true || [...codes].some((code) => code.includes("quarantined")));
    show("closure-fatal", Boolean(loadFailure)); if (loadFailure) { show("closure-workflow", false); text("closure-fatal-message", loadFailure?.userMessage || loadFailure?.message || "Closure could not be opened."); }
    const back = byId("closure-back-acceptance"); if (back) back.href = `/pattern-evolution-acceptance${acceptanceContext(shown)}`;
  }
  async function advanceToTerminal(current) {
    const order = { draft: "reconciling", reconciling: "finalizing", finalizing: "reviewing" }; let value = current;
    while (order[value.state.lifecycle]) value = await repository.transitionPatternEvolutionClosure(projectId, value.state.id, order[value.state.lifecycle], { timestamp: explicitNow || value.state.updatedAt });
    if (value.state.lifecycle === "reviewing") { source = await api.loadSource(repository, projectId, value.state.sourceAcceptanceId); const computed = api.calculateClosureContract(source, value.state.reconciliationInput, value.state).outcome; value = await repository.transitionPatternEvolutionClosure(projectId, value.state.id, computed, { timestamp: explicitNow || value.state.updatedAt }); }
    return value;
  }
  async function initialize() {
    await repository.initialize();
    if (!projectId) { render(); return; }
    try {
      source = await api.loadSource(repository, projectId, requestedAcceptanceId); if (!source.acceptance) { render(); return; }
      const gate = api.calculateLiveChainGate(source); progress = requestedClosureId ? await repository.getPatternEvolutionClosure(projectId, requestedClosureId, source.calculationId, source.acceptance.id) : await repository.getLatestPatternEvolutionClosureForAcceptance(projectId, source.acceptance.id, source.calculationId);
      record = progress?.state || null;
      if (!record && gate.valid) { const result = await repository.createPatternEvolutionClosure(projectId, { acceptanceId: source.acceptance.id, now: explicitNow || source.acceptance.updatedAt }); progress = result.closureRecord; record = result.rawClosure; }
      if (progress && api.ACTIVE_LIFECYCLES.includes(progress.state.lifecycle)) { progress = await advanceToTerminal(progress); record = progress.state; }
      source = await api.loadSource(repository, projectId, source.acceptance.id);
    } catch (error) { loadFailure = error; }
    render();
  }
  initialize().catch((error) => { show("closure-loading", false); show("closure-fatal", true); show("closure-workflow", false); text("closure-fatal-message", error?.userMessage || error?.message || "Closure could not be opened."); });
})(typeof window !== "undefined" ? window : globalThis);
