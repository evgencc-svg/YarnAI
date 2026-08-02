"use strict";

(function initializePatternEvolutionExecutionAssistant(globalObject) {
  const api = globalObject.YarnAIPatternEvolutionExecution;
  const system = globalObject.YarnAIProjectSystem;
  if (!api || !system) return;

  const byId = (id) => globalObject.document.getElementById(id);
  const params = new URLSearchParams(globalObject.location.search);
  const projectId = params.get("projectId") || params.get("project") || "";
  const requestedPatternId = params.get("patternId") || "";
  const requestedInitiationId = params.get("initiationId") || null;
  const requestedProposalId = params.get("proposalId") || null;
  const requestedReviewId = params.get("reviewId") || null;
  const requestedDecisionId = params.get("decisionId") || null;
  const requestedExecutionId = params.get("executionId") || null;
  const explicitNow = params.get("now") || null;
  const repository = new system.ProjectRepository();
  let source = null; let progress = null; let record = null; let projection = null; let loadFailure = null;

  function text(id, value) { const element = byId(id); if (element) element.textContent = value ?? "—"; }
  function pretty(value) { return JSON.stringify(value ?? null, null, 2); }
  function show(id, visible) { const element = byId(id); if (element) element.hidden = !visible; }
  function list(id, values) { const element = byId(id); if (!element) return; element.replaceChildren(); for (const value of values || []) { const item = globalObject.document.createElement("li"); item.textContent = typeof value === "object" ? `${value.code || value.key || value.id || "item"}${value.message ? `: ${value.message}` : ""}` : String(value); element.append(item); } }
  function canonicalPlan(decision) {
    const migrationRequired = decision?.migrationDependency === true;
    const highRisk = decision?.risk?.level === "high";
    const evidenceKey = "evidence:successor-pattern-revision";
    return {
      operations: [{ key: "create-successor-pattern-revision", operationType: "create_successor_pattern_revision", targetType: "pattern", targetIdentity: decision.patternId, preconditions: [{ key: "authorized-decision", required: true, satisfied: true, evidenceReferences: [decision.id] }], expectedOutput: { kind: "successor_pattern_revision", patternId: decision.patternId }, requiredEvidence: [evidenceKey], rollbackAction: { type: "preserve_predecessor" }, compatibilityImpact: "bounded", migrationImpact: migrationRequired ? "prepared-only" : "none" }],
      preconditions: [{ key: "source-chain-proven", required: true, satisfied: true, evidenceReferences: [decision.digest] }], dependencies: [{ key: "terminal-authorized-decision", required: true, satisfied: true, evidenceReferences: [decision.id] }],
      mandatoryConditions: (decision.conditions || []).map((item) => ({ key: item.code || item.id, description: item.message, required: item.required !== false, satisfied: true, evidenceReferences: item.references })),
      expectedOutputs: [{ key: "successor-pattern-revision", kind: "immutable-successor" }], evidenceRequirements: [{ key: evidenceKey, required: true }],
      rollbackContract: highRisk || migrationRequired ? { required: true, mode: "preserve-predecessor", triggerConditions: [{ key: "verification-failure" }], target: { patternId: decision.patternId }, operations: [{ key: "keep-predecessor-active" }], preservedArtifacts: [decision.patternId, decision.id], evidenceRequirements: [{ key: "evidence:rollback-ready", required: true }], validationSteps: [{ key: "validate-predecessor", required: true, satisfied: true }], maximumIrreversibleBoundary: "before-successor-activation", status: "ready" } : { required: false },
      migrationContract: migrationRequired ? { required: true, migrationType: "data-preparation", sourceSchemaVersion: String(system.DB_VERSION), targetSchemaVersion: String(system.DB_VERSION), affectedDataKinds: ["progress"], preconditions: [{ key: "backup-proven", required: true, satisfied: false }], backupRequired: true, rollbackStrategy: { type: "preserve-original" }, validationSteps: [{ key: "validate-preparation", required: true, satisfied: false }], compatibilityWindow: "one-successor-revision", evidenceRequirements: [{ key: "evidence:migration-prepared", required: true }], executionState: "planned" } : { required: false },
      compatibilityContract: { backwardCompatibility: "preserved", forwardCompatibility: "preserved", dataCompatibility: "preserved", uiCompatibility: "preserved", apiCompatibility: "preserved", importedRecordCompatibility: "preserved", migrationCompatibility: migrationRequired ? "pending" : "preserved", knownIncompatibilities: [], evidenceRequirements: [{ key: "evidence:compatibility", required: true }], validationStatus: "pending" },
      verificationContract: { postconditions: [{ key: "successor-validated", required: true, satisfied: false }], validationSteps: [{ key: "verify-successor", required: true, satisfied: false }], requiredObservationTypes: ["result", "postcondition"], completionRule: "all_required_evidence_and_postconditions" },
      riskControls: highRisk ? [{ key: "stop-on-first-failure", required: true, satisfied: true }] : [], stopConditions: [{ key: "source-becomes-stale", required: true, satisfied: true }], affectedArtifacts: [decision.patternId],
    };
  }
  function navigationContext() {
    const decision = source?.decision || record?.sourceSnapshots?.decision;
    return `${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}${requestedPatternId || decision?.patternId ? `&patternId=${encodeURIComponent(requestedPatternId || decision.patternId)}` : ""}${requestedInitiationId || record?.sourceInitiationId ? `&initiationId=${encodeURIComponent(requestedInitiationId || record.sourceInitiationId)}` : ""}${requestedProposalId || record?.sourceProposalId ? `&proposalId=${encodeURIComponent(requestedProposalId || record.sourceProposalId)}` : ""}${requestedReviewId || record?.sourceReviewId ? `&reviewId=${encodeURIComponent(requestedReviewId || record.sourceReviewId)}` : ""}${requestedDecisionId || record?.sourceDecisionId ? `&decisionId=${encodeURIComponent(requestedDecisionId || record.sourceDecisionId)}` : ""}`;
  }
  function executionApiValid(value) { return api.validatePatternEvolutionExecution(value)?.valid === true; }
  function render() {
    try { projection = record && source ? api.projectPatternEvolutionExecution(record, source) : null; } catch (error) { loadFailure = error; projection = null; }
    const shown = projection?.record || record; const gate = source ? api.calculateSourceGate(source, shown) : null; const decision = source?.decision || shown?.sourceSnapshots?.decision || null;
    const lifecycle = projection?.lifecycle || shown?.lifecycle || "missing"; const status = projection?.status || shown?.status || "pending"; const reasons = projection?.reasons || shown?.reasons || gate?.reasons || [];
    text("execution-context", projectId ? decision ? `Project ${projectId} · decision ${decision.id} · ${decision.lifecycle} / ${decision.outcome}` : `Project ${projectId} · authorized decision required` : "No project context. Open this page from an authorized decision.");
    text("execution-lifecycle", lifecycle); text("execution-status", status); text("execution-status-output", status); text("execution-proof-status", shown?.proofStatus || "unproven"); text("execution-revision", shown ? `Epoch ${shown.epoch} · revision ${shown.revision}` : "Epoch — · revision —"); text("execution-id", shown?.id); text("execution-identity-value", shown?.identity); text("execution-semantic-identity", shown?.semanticIdentity); text("execution-digest", shown?.digest); text("execution-policy", shown?.executionPolicyVersion || api.POLICY_VERSION); text("execution-risk-policy", shown?.riskPolicyVersion || api.RISK_POLICY_VERSION); text("execution-evidence-policy", shown?.evidencePolicyVersion || api.EVIDENCE_POLICY_VERSION);
    text("execution-project-id", shown?.projectId || source?.projectId || projectId); text("execution-pattern-id", shown?.patternId || source?.patternId || requestedPatternId); text("execution-initiation-id", shown?.sourceInitiationId || source?.initiation?.id); text("execution-initiation-proof", shown ? `${shown.sourceInitiationRevision} / ${shown.sourceInitiationDigest}` : "—"); text("execution-proposal-id", shown?.sourceProposalId || source?.proposal?.id); text("execution-proposal-proof", shown ? `${shown.sourceProposalRevision} / ${shown.sourceProposalDigest}` : "—"); text("execution-review-id", shown?.sourceReviewId || source?.review?.id); text("execution-review-proof", shown ? `${shown.sourceReviewRevision} / ${shown.sourceReviewDigest}` : "—"); text("execution-decision-id", shown?.sourceDecisionId || decision?.id); text("execution-decision-proof", shown ? `${shown.sourceDecisionRevision} / ${shown.sourceDecisionDigest}` : decision ? `${decision.revision} / ${decision.digest}` : "—"); text("execution-decision-outcome", decision ? `${decision.lifecycle} / ${decision.outcome}` : "—");
    text("execution-source-gate", gate?.valid ? "valid and proven" : gate?.reasons?.map((item) => item.code).join(", ") || loadFailure?.code || "missing"); text("execution-source-freshness", projection?.stale ? "stale" : gate?.valid ? "current" : "invalid"); text("execution-import-trust", shown?.importedUnproven ? "imported-unproven" : gate?.valid ? "local-proven" : "unproven"); text("execution-collision", String(shown?.collision === true)); text("execution-quarantine", String(shown?.quarantined === true || String(loadFailure?.code || "").includes("QUARANTINE"))); text("execution-source-envelope", pretty(shown?.sourceEnvelope || gate?.envelope)); text("execution-source-snapshots", pretty(shown?.sourceSnapshots));
    text("execution-next-action", projection?.nextAction || shown?.nextAction || (gate?.valid ? "satisfy_preconditions" : "resolve_source_chain")); text("execution-risk", shown?.risk?.level || gate?.risk || "invalid"); list("execution-reason-list", reasons);
    const plan = shown?.executionPlan || {}; text("execution-operations", pretty(plan.operations)); text("execution-preconditions", pretty(plan.preconditions)); text("execution-dependencies", pretty(plan.dependencies)); text("execution-mandatory-conditions", pretty(plan.mandatoryConditions)); text("execution-expected-outputs", pretty(plan.expectedOutputs)); text("execution-evidence-requirements", pretty(plan.evidenceRequirements)); text("execution-risk-controls", pretty(plan.riskControls)); text("execution-stop-conditions", pretty(plan.stopConditions)); text("execution-rollback-contract", pretty(plan.rollbackContract)); text("execution-migration-contract", pretty(plan.migrationContract)); text("execution-compatibility-contract", pretty(plan.compatibilityContract)); text("execution-verification-contract", pretty(plan.verificationContract)); text("execution-observation-list", pretty(shown?.observations)); text("execution-evidence-list", pretty(shown?.evidence)); text("execution-audit-log", pretty(shown?.audit));
    const codes = new Set((gate?.reasons || []).map((item) => item.code)); show("execution-missing-context-state", !projectId); show("execution-missing-decision-state", Boolean(projectId && !decision)); show("execution-invalid-source-state", Boolean(projectId && decision && gate && !gate.valid && !codes.has("non_terminal_decision") && !codes.has("non_authorized_decision"))); show("execution-nonterminal-decision-state", codes.has("non_terminal_decision")); show("execution-nonauthorized-decision-state", codes.has("non_authorized_decision")); show("execution-stale-state", lifecycle === "stale" || status === "stale"); show("execution-imported-unproven-state", shown?.importedUnproven === true || codes.has("imported_unproven")); show("execution-collision-state", shown?.collision === true || codes.has("collision")); show("execution-quarantine-state", shown?.quarantined === true || codes.has("quarantine") || String(loadFailure?.code || "").includes("QUARANTINE")); show("execution-blocked-state", status === "blocked"); show("execution-revision-required-state", status === "require_revision"); show("execution-evidence-required-state", status === "require_evidence"); show("execution-rollback-required-state", status === "require_rollback"); show("execution-failed-state", status === "failed"); show("execution-ready-state", status === "ready"); show("execution-executing-state", lifecycle === "executing"); show("execution-verifying-state", lifecycle === "verifying"); show("execution-completed-state", status === "completed"); show("execution-cancelled-state", status === "cancelled");
    const back = byId("execution-back-decision"); if (back) back.href = `/pattern-evolution-decision${navigationContext()}`;
    const executionEligible = Boolean(shown && gate?.valid && executionApiValid(shown) && api.TERMINAL_LIFECYCLES.includes(shown.lifecycle) && shown.lifecycle !== "stale" && shown.status !== "stale" && shown.proofStatus === "proven" && !shown.importedUnproven && !shown.collision && !shown.quarantined && !projection?.stale);
    const verification = byId("execution-open-verification"); if (verification) { verification.hidden = !executionEligible; verification.href = `/pattern-evolution-execution-verification${navigationContext()}&executionId=${encodeURIComponent(shown?.id || "")}`; }
  }
  async function initialize() {
    await repository.initialize();
    if (!projectId) { render(); return; }
    try {
      source = await api.loadSource(repository, projectId, requestedDecisionId);
      if (!source.decision) { render(); return; }
      progress = requestedExecutionId ? await repository.getPatternEvolutionExecution(projectId, requestedExecutionId, source.calculationId, source.decision.id) : await repository.getLatestPatternEvolutionExecutionForDecision(projectId, source.decision.id, source.calculationId);
      record = progress?.state || null;
      const gate = api.calculateSourceGate(source, record);
      if (!record && gate.authorized) {
        const result = await repository.createPatternEvolutionExecution(projectId, { decisionId: source.decision.id, now: explicitNow || source.decision.updatedAt, executionPlan: canonicalPlan(source.decision) }); progress = result.executionRecord; record = result.rawExecution; text("execution-message", result.duplicate ? "Existing deterministic execution opened." : "Deterministic execution envelope created locally."); source = await api.loadSource(repository, projectId, source.decision.id);
      }
    } catch (error) { loadFailure = error; }
    render();
  }
  initialize().catch((error) => { show("execution-fatal", true); show("execution-workflow", false); text("execution-fatal-message", error?.userMessage || error?.message || "Execution could not be opened."); });
})(typeof window !== "undefined" ? window : globalThis);
