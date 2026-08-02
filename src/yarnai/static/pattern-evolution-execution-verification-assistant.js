"use strict";

(function initializePatternEvolutionExecutionVerificationAssistant(globalObject) {
  const api = globalObject.YarnAIPatternEvolutionExecutionVerification;
  const executionApi = globalObject.YarnAIPatternEvolutionExecution;
  const system = globalObject.YarnAIProjectSystem;
  if (!api || !executionApi || !system) return;

  const byId = (id) => globalObject.document.getElementById(id);
  const params = new URLSearchParams(globalObject.location.search);
  const projectId = params.get("projectId") || params.get("project") || "";
  const requestedExecutionId = params.get("executionId") || null;
  const requestedVerificationId = params.get("verificationId") || null;
  const explicitNow = params.get("now") || null;
  const repository = new system.ProjectRepository();
  let source = null; let progress = null; let record = null; let projection = null; let loadFailure = null; let verificationRecords = [];

  function text(id, value) { const element = byId(id); if (element) element.textContent = value ?? "—"; }
  function pretty(value) { return JSON.stringify(value ?? null, null, 2); }
  function show(id, visible) { const element = byId(id); if (element) element.hidden = !visible; }
  function list(id, values) { const element = byId(id); if (!element) return; element.replaceChildren(); for (const value of values || []) { const item = globalObject.document.createElement("li"); item.textContent = typeof value === "object" ? `${value.code || value.id || "finding"}${value.message ? `: ${value.message}` : ""}` : String(value); element.append(item); } }
  function navigationContext(shown) { const query = new URLSearchParams(); if (projectId) query.set("projectId", projectId); if (shown?.patternId || source?.patternId) query.set("patternId", shown?.patternId || source.patternId); if (shown?.sourceInitiationId) query.set("initiationId", shown.sourceInitiationId); if (shown?.sourceProposalId) query.set("proposalId", shown.sourceProposalId); if (shown?.sourceReviewId) query.set("reviewId", shown.sourceReviewId); if (shown?.sourceDecisionId) query.set("decisionId", shown.sourceDecisionId); if (shown?.sourceExecutionId || source?.execution?.id) query.set("executionId", shown?.sourceExecutionId || source.execution.id); return query.toString() ? `?${query}` : ""; }
  function renderChecks(contract) { for (const [id, field] of [["verification-operation-checks", "operationChecks"], ["verification-precondition-checks", "preconditionChecks"], ["verification-dependency-checks", "dependencyChecks"], ["verification-mandatory-condition-checks", "mandatoryConditionChecks"], ["verification-output-checks", "outputChecks"], ["verification-evidence-checks", "evidenceChecks"], ["verification-postcondition-checks", "postconditionChecks"], ["verification-compatibility-checks", "compatibilityChecks"], ["verification-migration-checks", "migrationChecks"], ["verification-rollback-checks", "rollbackChecks"], ["verification-risk-control-checks", "riskControlChecks"], ["verification-stop-condition-checks", "stopConditionChecks"], ["verification-provenance-checks", "provenanceChecks"], ["verification-integrity-checks", "integrityChecks"]]) text(id, pretty(contract?.[field])); }
  function verificationSuperseded(shown, records) {
    if (!shown || shown.superseded === true || shown.supersededBy || shown.supersededByVerificationId) return Boolean(shown);
    return (records || []).some((entry) => {
      const candidate = entry?.state || entry;
      if (!candidate || candidate.id === shown.id) return false;
      if (candidate.predecessorVerificationId === shown.id || candidate.supersedesVerificationId === shown.id) return true;
      if (!shown.semanticIdentity || candidate.semanticIdentity !== shown.semanticIdentity) return false;
      return Number(candidate.epoch || 0) > Number(shown.epoch || 0) || (Number(candidate.epoch || 0) === Number(shown.epoch || 0) && Number(candidate.revision || 0) > Number(shown.revision || 0));
    });
  }
  function acceptanceEligible(shown, gate, currentProjection, records) {
    const report = shown ? api.validatePatternEvolutionExecutionVerification(shown) : null;
    return Boolean(shown && report?.valid && gate?.valid && api.TERMINAL_LIFECYCLES.includes(shown.lifecycle) && ["verified", "verified_with_conditions"].includes(shown.verdict) && shown.proofStatus === "proven" && !shown.importedUnproven && !shown.collision && !shown.quarantined && !currentProjection?.stale && !verificationSuperseded(shown, records));
  }
  function render() {
    try { projection = record && source ? api.projectPatternEvolutionExecutionVerification(record, source) : null; } catch (error) { loadFailure = error; projection = null; }
    const shown = projection?.record || record; const gate = source ? api.calculateSourceGate(source, shown) : null; const contract = shown?.verificationContract || (source?.execution ? api.calculateVerificationContract(source) : null); const execution = source?.execution || shown?.sourceSnapshots?.execution || null;
    const lifecycle = projection?.lifecycle || shown?.lifecycle || "missing"; const status = projection?.status || shown?.status || contract?.status || "blocked"; const verdict = projection?.verdict || shown?.verdict || contract?.verdict || "blocked"; const reasons = projection?.reasons || shown?.reasons || contract?.reasons || gate?.reasons || [];
    text("verification-context", projectId ? execution ? `Project ${projectId} · execution ${execution.id} · ${execution.lifecycle} / ${execution.status}` : `Project ${projectId} · terminal execution required` : "No project context. Open this page from a terminal execution.");
    text("verification-lifecycle", lifecycle); text("verification-status", status); text("verification-status-output", status); text("verification-verdict", verdict); text("verification-verdict-output", verdict); text("verification-proof-status", shown?.proofStatus || "unproven"); text("verification-id", shown?.id); text("verification-identity-value", shown?.identity); text("verification-semantic-identity", shown?.semanticIdentity); text("verification-digest", shown?.digest); text("verification-revision", shown ? `Epoch ${shown.epoch} · revision ${shown.revision}` : "—"); text("verification-risk", shown?.risk?.level || contract?.gate?.risk || "invalid");
    text("verification-policy", `${api.POLICY_VERSION} · verdict and status are computed from source integrity, structured checks, required/applicable coverage, and fail-closed precedence.`);
    text("verification-project-id", shown?.projectId || source?.projectId || projectId); text("verification-pattern-id", shown?.patternId || source?.patternId); text("verification-initiation-id", shown?.sourceInitiationId || source?.initiation?.id); text("verification-proposal-id", shown?.sourceProposalId || source?.proposal?.id); text("verification-review-id", shown?.sourceReviewId || source?.review?.id); text("verification-decision-id", shown?.sourceDecisionId || source?.decision?.id); text("verification-execution-id", shown?.sourceExecutionId || execution?.id); text("verification-execution-outcome", execution ? `${execution.lifecycle} / ${execution.status}` : "—");
    text("verification-source-gate", gate?.valid ? "valid, current, terminal, and locally proven" : gate?.reasons?.map((item) => item.code).join(", ") || loadFailure?.code || "missing"); text("verification-chain-integrity", gate?.valid ? "all snapshots match their canonical live artifacts" : "unproven"); text("verification-source-execution-digest", shown?.sourceExecutionDigest || execution?.digest); text("verification-source-chain-digest", shown?.sourceChainDigest); text("verification-source-binding", pretty(shown?.sourceBinding || gate?.binding));
    text("verification-next-action", projection?.nextAction || shown?.nextAction || contract?.nextAction || "resolve_source_chain"); text("verification-scope", pretty(shown?.verificationScope || contract?.verificationScope)); text("verification-expected-outcome", pretty(contract?.expectedOutcome)); text("verification-actual-outcome", pretty(contract?.actualOutcome)); text("verification-completeness", pretty(contract?.completeness)); text("verification-consistency", pretty(contract?.consistency)); text("verification-coverage-values", pretty(contract?.coverage)); renderChecks(contract); list("verification-reason-list", reasons); text("verification-unresolved-findings", pretty(contract?.unresolvedFindings));
    const codes = new Set((gate?.reasons || []).map((item) => item.code)); show("verification-missing-context-state", !projectId || !execution); show("verification-invalid-source-state", Boolean(projectId && execution && gate && !gate.valid)); show("verification-imported-unproven-state", shown?.importedUnproven === true || codes.has("imported_unproven")); show("verification-stale-state", lifecycle === "stale" || status === "stale"); show("verification-blocked-state", status === "blocked"); show("verification-evidence-required-state", status === "require_evidence"); show("verification-revision-required-state", status === "require_revision"); show("verification-rollback-required-state", status === "require_rollback"); show("verification-failed-state", status === "failed"); show("verification-cancelled-state", status === "cancelled"); show("verification-completed-state", status === "completed");
    const back = byId("verification-back-execution"); if (back) back.href = `/pattern-evolution-execution${navigationContext(shown)}`;
    const forward = byId("verification-open-acceptance"); if (forward) { forward.hidden = !acceptanceEligible(shown, gate, projection, verificationRecords); if (!forward.hidden) { const query = new URLSearchParams(navigationContext(shown).replace(/^\?/, "")); query.set("verificationId", shown.id); forward.href = `/pattern-evolution-acceptance?${query}`; } }
  }
  async function initialize() {
    await repository.initialize();
    if (!projectId) { render(); return; }
    try {
      source = await api.loadSource(repository, projectId, requestedExecutionId);
      if (!source.execution) { render(); return; }
      const gate = api.calculateSourceGate(source);
      verificationRecords = await repository.listPatternEvolutionExecutionVerifications(projectId, source.calculationId);
      progress = requestedVerificationId ? await repository.getPatternEvolutionExecutionVerification(projectId, requestedVerificationId, source.calculationId, source.execution.id) : await repository.getLatestPatternEvolutionExecutionVerificationForExecution(projectId, source.execution.id, source.calculationId);
      record = progress?.state || null;
      if (!record && gate.valid) { const result = await repository.createPatternEvolutionExecutionVerification(projectId, { executionId: source.execution.id, now: explicitNow || source.execution.updatedAt }); progress = result.verificationRecord; record = result.rawVerification; source = await api.loadSource(repository, projectId, source.execution.id); verificationRecords = await repository.listPatternEvolutionExecutionVerifications(projectId, source.calculationId); }
    } catch (error) { loadFailure = error; }
    render();
  }
  initialize().catch((error) => { show("verification-fatal", true); show("verification-workflow", false); text("verification-fatal-message", error?.userMessage || error?.message || "Verification could not be opened."); });
})(typeof window !== "undefined" ? window : globalThis);
