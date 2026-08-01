"use strict";

(function exposePatternExecutionEvidence(globalObject) {
  const VERSION = 1;
  const SCHEMA_VERSION = 1;
  const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
  const PROGRESS_KIND = "PATTERN_EXECUTION_EVIDENCE";
  const AUDIT_LIMIT = 64;
  const OPERATION_LIMIT = 96;
  const LIFECYCLE_STATES = Object.freeze([
    "waiting", "collecting", "validating", "ready", "completed",
    "blocked", "failed", "cancelled", "stale",
  ]);
  const TERMINAL_STATES = Object.freeze(["completed", "blocked", "failed", "cancelled", "stale"]);
  const TRANSITIONS = Object.freeze({
    waiting: Object.freeze(["collecting", "cancelled", "stale"]),
    collecting: Object.freeze(["validating", "blocked", "failed", "stale"]),
    validating: Object.freeze(["ready", "blocked", "failed", "stale"]),
    ready: Object.freeze(["completed", "cancelled", "stale"]),
    completed: Object.freeze([]), blocked: Object.freeze([]), failed: Object.freeze([]),
    cancelled: Object.freeze([]), stale: Object.freeze([]),
  });
  const EVIDENCE_TYPES = Object.freeze([
    "ACTION_IDENTITY", "ACTION_ATTEMPT", "ADAPTER_INVOCATION",
    "PRE_STATE_SNAPSHOT", "POST_STATE_SNAPSHOT", "VERIFICATION_RESULT",
    "TARGET_IDENTITY", "SOURCE_CHAIN", "SIDE_EFFECT_BOUNDARY",
    "IDEMPOTENCY_PROOF", "AUDIT_PROOF", "IMPORT_SAFETY",
  ]);
  const EVIDENCE_STATUSES = Object.freeze(["present", "missing", "invalid", "contradictory"]);
  const ASSERTION_TYPES = Object.freeze([
    "ACTION_WAS_VERIFIED", "ACTION_EFFECT_CONFIRMED", "ACTION_TARGET_MATCHED",
    "ACTION_ATTEMPT_MATCHED", "SOURCE_CHAIN_MATCHED", "NO_UNEXPECTED_SIDE_EFFECTS",
    "IDEMPOTENCY_KEY_MATCHED", "AUDIT_SEQUENCE_MATCHED", "IMPORT_IDENTITY_SAFE",
  ]);
  const ASSERTION_STATUSES = Object.freeze(["passed", "failed", "unknown"]);
  const MANDATORY_ASSERTIONS = Object.freeze([...ASSERTION_TYPES]);

  class PatternExecutionEvidenceError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "PatternExecutionEvidenceError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function canonicalize(value, seen = new Set()) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw evidenceError("invalid_number", "Evidence содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (["undefined", "function", "symbol", "bigint"].includes(typeof value)) {
      throw evidenceError("unsupported_evidence_value", "Evidence содержит нестабильное или исполняемое значение.");
    }
    if (seen.has(value)) throw evidenceError("cyclic_evidence_value", "Evidence не может содержать циклические объекты.");
    seen.add(value);
    let result;
    if (Array.isArray(value)) result = `[${value.map((entry) => canonicalize(entry, seen)).join(",")}]`;
    else {
      if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
        seen.delete(value);
        throw evidenceError("unstable_evidence_object", "Evidence может содержать только canonical JSON objects.");
      }
      result = `{${Object.keys(value).sort(lexical).map((key) => `${JSON.stringify(key)}:${canonicalize(value[key], seen)}`).join(",")}}`;
    }
    seen.delete(value);
    return result;
  }

  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }

  function fingerprintEvidenceItem(item) {
    return fingerprint({
      id: item.id, type: item.type, source: item.source,
      sourceIdentity: normalize(item.sourceIdentity), observedValue: normalize(item.observedValue),
      expectedValue: normalize(item.expectedValue), status: item.status, collectedAt: item.collectedAt,
    });
  }

  function fingerprintPatternExecutionEvidence(snapshot) {
    return fingerprint({
      schemaVersion: snapshot.schemaVersion, kind: snapshot.kind, id: snapshot.id,
      projectId: snapshot.projectId, calculationId: snapshot.calculationId,
      executionEpoch: snapshot.executionEpoch, evidenceEpoch: snapshot.evidenceEpoch,
      evidenceAttemptOrdinal: snapshot.evidenceAttemptOrdinal, epoch: snapshot.epoch,
      actionId: snapshot.actionId, actionFingerprint: snapshot.actionFingerprint,
      actionAttemptId: snapshot.actionAttemptId, actionAttemptOrdinal: snapshot.actionAttemptOrdinal,
      interventionId: snapshot.interventionId, interventionFingerprint: snapshot.interventionFingerprint,
      decisionId: snapshot.decisionId, decisionFingerprint: snapshot.decisionFingerprint,
      runtimeId: snapshot.runtimeId, monitoringId: snapshot.monitoringId, resultId: snapshot.resultId,
      sourceIdentities: normalize(snapshot.sourceIdentities), collectedSourceIdentities: normalize(snapshot.collectedSourceIdentities),
      lifecycle: snapshot.lifecycle, collectionStatus: snapshot.collectionStatus,
      validationStatus: snapshot.validationStatus, evidenceItems: stableItems(snapshot.evidenceItems),
      assertions: stableAssertions(snapshot.assertions), unexpectedChanges: stableDiagnostics(snapshot.unexpectedChanges),
      missingEvidence: stableDiagnostics(snapshot.missingEvidence), contradictions: stableDiagnostics(snapshot.contradictions),
      summary: normalize(snapshot.summary), previousEvidence: normalize(snapshot.previousEvidence),
      revision: snapshot.revision, createdAt: snapshot.createdAt, collectedAt: snapshot.collectedAt,
      validatedAt: snapshot.validatedAt, completedAt: snapshot.completedAt,
      importedDiagnostic: normalize(snapshot.importedDiagnostic), audit: stableAudit(snapshot.audit),
    });
  }

  function buildPatternExecutionEvidence(source, options = {}) {
    const normalizedSource = normalizeSource(source, options);
    const action = normalizedSource.action;
    if (!action) throw evidenceError("action_missing", "Stage 32 action отсутствует.");
    const now = options.now || timestampNow();
    const evidenceEpoch = positiveInteger(options.evidenceEpoch) || 1;
    const attemptOrdinal = positiveInteger(options.evidenceAttemptOrdinal) || 1;
    const storageEpoch = positiveInteger(options.epoch) || 1;
    const sourceIdentities = captureSourceIdentities(normalizedSource);
    const identity = {
      projectId: normalizedSource.projectId, calculationId: normalizedSource.calculationId,
      executionEpoch: action.epoch, evidenceEpoch, attemptOrdinal,
      actionId: action.id, actionFingerprint: action.fingerprint,
      actionAttemptId: action.currentAttempt?.attemptId || null,
    };
    const id = text(options.id) || `execution-evidence:${fingerprint(identity).slice(8)}`;
    const intervention = normalizedSource.intervention;
    const decision = intervention?.decision || {};
    const snapshot = {
      schemaVersion: SCHEMA_VERSION, version: VERSION, kind: PROGRESS_KIND, type: PROGRESS_KIND,
      id, projectId: normalizedSource.projectId, calculationId: normalizedSource.calculationId,
      executionEpoch: action.epoch, evidenceEpoch, evidenceAttemptOrdinal: attemptOrdinal, epoch: storageEpoch,
      actionId: action.id, actionFingerprint: action.fingerprint,
      actionAttemptId: action.currentAttempt?.attemptId || null,
      actionAttemptOrdinal: action.currentAttempt?.ordinal || null,
      interventionId: intervention?.id || action.interventionIdentity?.id || null,
      interventionFingerprint: intervention?.fingerprint || action.interventionFingerprint || null,
      decisionId: decision.id || decision.decisionId || action.decisionIdentity?.id || `execution-decision:${(decision.fingerprint || action.decisionIdentity?.fingerprint || "unknown").replace(":", "-")}`,
      decisionFingerprint: decision.fingerprint || action.decisionIdentity?.fingerprint || null,
      runtimeId: normalizedSource.runtime?.id || action.sourceIdentity?.runtime?.id || null,
      monitoringId: normalizedSource.monitoring?.id || action.sourceIdentity?.monitoring?.id || null,
      resultId: normalizedSource.result?.id || action.sourceIdentity?.result?.id || null,
      sourceIdentities, collectedSourceIdentities: null,
      lifecycle: "waiting", collectionStatus: "pending", validationStatus: "pending",
      evidenceItems: [], assertions: [], unexpectedChanges: [], missingEvidence: [], contradictions: [],
      summary: null, previousEvidence: normalize(options.previousEvidence || null),
      fingerprint: null, revision: 1, createdAt: options.createdAt || now, updatedAt: now,
      collectedAt: null, validatedAt: null, completedAt: null,
      audit: [], operations: [], importedDiagnostic: null,
    };
    appendAudit(snapshot, "created", now, { actionId: snapshot.actionId, actionAttemptId: snapshot.actionAttemptId });
    return seal(snapshot);
  }

  function collectPatternExecutionEvidence(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "collect", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    if (TERMINAL_STATES.includes(snapshot.lifecycle)) return commandResult("collect", false, snapshot);
    if (snapshot.lifecycle !== "waiting") throw evidenceError("collect_not_allowed", "Collect доступен только из waiting.");
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1; next.updatedAt = now;
    transition(next, "collecting");
    appendAudit(next, "collection_started", now, { actionId: next.actionId, actionAttemptId: next.actionAttemptId });

    const normalizedSource = normalizeSource(source, { projectId: next.projectId });
    const eligibility = collectEligibility(next, normalizedSource);
    if (eligibility.errors.length) {
      const target = eligibility.stale ? "stale" : "blocked";
      transition(next, target); next.collectionStatus = target; next.validationStatus = target;
      next.missingEvidence = target === "blocked" ? stableDiagnostics(eligibility.errors) : [];
      next.contradictions = []; next.unexpectedChanges = [];
      if (target === "stale") next.sourceIdentities = normalize(next.sourceIdentities);
      appendAudit(next, target === "stale" ? "source_marked_stale" : "collection_blocked", now, { codes: eligibility.errors.map((entry) => entry.code) });
      appendOperation(next, options.operationId, "collect", now);
      return commandResult("collect", true, seal(next));
    }

    const action = normalizedSource.action;
    next.actionFingerprint = action.fingerprint;
    next.collectedSourceIdentities = captureSourceIdentities(normalizedSource);
    next.evidenceItems = buildEvidenceItems(next, normalizedSource, now);
    next.collectedAt = now; next.collectionStatus = "collected"; next.validationStatus = "pending";
    transition(next, "validating");
    appendAudit(next, "collection_completed", now, { itemCount: next.evidenceItems.length });
    appendAudit(next, "validation_pending", now);
    appendOperation(next, options.operationId, "collect", now);
    return commandResult("collect", true, seal(next));
  }

  function validatePatternExecutionEvidence(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "validate", options);
    if (duplicate) return duplicate;
    checkConcurrency(snapshot, options);
    if (TERMINAL_STATES.includes(snapshot.lifecycle)) return commandResult("validate", false, snapshot);
    if (snapshot.lifecycle !== "validating") throw evidenceError("validation_not_allowed", "Validate доступен только после Collect.");
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1; next.updatedAt = now;
    const normalizedSource = normalizeSource(source, { projectId: next.projectId });
    const structural = structuralValidation(next, { ignoreFingerprint: true });
    const sourceErrors = structural.length ? [] : validateCollectedSource(next, normalizedSource);
    const semantic = structural.length ? [] : semanticEvidenceValidation(next, normalizedSource);
    const assertions = buildAssertions(next, normalizedSource, { structural, semantic, sourceErrors });
    next.assertions = assertions;
    next.missingEvidence = stableDiagnostics([
      ...next.evidenceItems.filter((item) => item.status === "missing").map((item) => diagnostic("mandatory_evidence_missing", { itemId: item.id, type: item.type })),
      ...assertions.filter((assertion) => assertion.status === "unknown").map((assertion) => diagnostic("assertion_unknown", { type: assertion.type })),
    ]);
    next.contradictions = stableDiagnostics([
      ...semantic,
      ...next.evidenceItems.filter((item) => item.status === "contradictory" || item.status === "invalid").map((item) => diagnostic("evidence_contradiction", { itemId: item.id, type: item.type, status: item.status })),
      ...assertions.filter((assertion) => assertion.status === "failed").map((assertion) => diagnostic(assertion.code || "assertion_failed", { type: assertion.type })),
    ]);
    next.unexpectedChanges = stableDiagnostics(sideEffectErrors(next));
    next.validatedAt = now;
    let target = "ready";
    if (sourceErrors.length) target = "stale";
    else if (structural.length || next.contradictions.length || next.unexpectedChanges.length) target = "failed";
    else if (next.missingEvidence.length || !allMandatoryAssertionsPassed(assertions)) target = "blocked";
    transition(next, target);
    next.validationStatus = target === "ready" ? "successful" : target;
    appendAudit(next, `validation_${target}`, now, {
      structural: structural.map((entry) => entry.code), semantic: semantic.map((entry) => entry.code),
      source: sourceErrors.map((entry) => entry.code),
    });
    appendOperation(next, options.operationId, "validate", now);
    return commandResult("validate", true, seal(next));
  }

  function completePatternExecutionEvidence(snapshot, source, options = {}) {
    requireSnapshot(snapshot);
    const duplicate = duplicateOperation(snapshot, "complete", options);
    if (duplicate) return duplicate;
    if (snapshot.lifecycle === "completed") return commandResult("complete", false, snapshot);
    checkConcurrency(snapshot, options);
    if (TERMINAL_STATES.includes(snapshot.lifecycle)) return commandResult("complete", false, snapshot);
    if (snapshot.lifecycle !== "ready") throw evidenceError("complete_not_allowed", "Complete доступен только из ready.");
    const normalizedSource = normalizeSource(source, { projectId: snapshot.projectId });
    const sourceErrors = validateCollectedSource(snapshot, normalizedSource);
    const actionErrors = collectEligibility(snapshot, normalizedSource).errors;
    if (sourceErrors.length || actionErrors.length) {
      const next = mutable(snapshot); const now = options.now || timestampNow();
      next.revision += 1; next.updatedAt = now; transition(next, "stale"); next.validationStatus = "stale";
      appendAudit(next, "completion_source_stale", now, { codes: [...sourceErrors, ...actionErrors].map((entry) => entry.code) });
      appendOperation(next, options.operationId, "complete", now);
      return commandResult("complete", true, seal(next));
    }
    if (!allMandatoryAssertionsPassed(snapshot.assertions)) throw evidenceError("assertions_not_passed", "Все обязательные assertions должны быть passed.");
    const now = options.now || timestampNow();
    const next = mutable(snapshot);
    next.revision += 1; next.updatedAt = now; next.completedAt = now;
    next.summary = immutableSummary(next);
    transition(next, "completed"); next.validationStatus = "successful";
    appendAudit(next, "completed", now, { assertionCount: next.assertions.length, evidenceItemCount: next.evidenceItems.length });
    appendOperation(next, options.operationId, "complete", now);
    return commandResult("complete", true, seal(next));
  }

  function retryPatternExecutionEvidence(snapshot, source, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    if (!["blocked", "failed"].includes(snapshot.lifecycle)) throw evidenceError("retry_not_allowed", "Retry доступен только для blocked/failed evidence.");
    const normalizedSource = normalizeSource(source, { projectId: snapshot.projectId });
    const errors = validateRetrySource(snapshot, normalizedSource);
    if (errors.length) throw evidenceError("retry_source_stale", "Source identity изменилась перед retry.", { errors });
    const now = options.now || timestampNow();
    const retried = mutable(buildPatternExecutionEvidence(normalizedSource, {
      ...options, id: options.id || `execution-evidence:${fingerprint({ previous: snapshot.fingerprint, retry: snapshot.evidenceAttemptOrdinal + 1 }).slice(8)}`,
      epoch: snapshot.epoch + 1, evidenceEpoch: snapshot.evidenceEpoch,
      evidenceAttemptOrdinal: snapshot.evidenceAttemptOrdinal + 1,
      previousEvidence: evidenceIdentity(snapshot), now, createdAt: now,
    }));
    appendAudit(retried, "retry_created", now, { previousEvidenceId: snapshot.id, previousFingerprint: snapshot.fingerprint });
    retried.fingerprint = fingerprintPatternExecutionEvidence(retried);
    return commandResult("retry", true, seal(retried), { previousEvidence: snapshot });
  }

  function rebuildPatternExecutionEvidence(snapshot, source, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    const normalizedSource = normalizeSource(source, { projectId: snapshot.projectId });
    if (!normalizedSource.action) throw evidenceError("rebuild_action_missing", "Rebuild требует текущий Stage 32 action.");
    const now = options.now || timestampNow();
    const rebuilt = mutable(buildPatternExecutionEvidence(normalizedSource, {
      ...options, id: options.id || `execution-evidence:${fingerprint({ previous: snapshot.fingerprint, rebuild: snapshot.evidenceEpoch + 1, action: normalizedSource.action.fingerprint }).slice(8)}`,
      epoch: snapshot.epoch + 1, evidenceEpoch: snapshot.evidenceEpoch + 1, evidenceAttemptOrdinal: 1,
      previousEvidence: evidenceIdentity(snapshot), now, createdAt: now,
    }));
    const changedAction = normalizedSource.action.id !== snapshot.actionId || normalizedSource.action.fingerprint !== snapshot.actionFingerprint;
    const eligibility = collectEligibility(rebuilt, normalizedSource);
    if (changedAction || eligibility.stale) {
      transition(rebuilt, "stale"); rebuilt.collectionStatus = "stale"; rebuilt.validationStatus = "stale";
      appendAudit(rebuilt, "rebuild_source_stale", now, { changedAction, codes: eligibility.errors.map((entry) => entry.code) });
    } else appendAudit(rebuilt, "rebuilt", now, { previousEvidenceId: snapshot.id, previousFingerprint: snapshot.fingerprint });
    rebuilt.fingerprint = fingerprintPatternExecutionEvidence(rebuilt);
    return commandResult("rebuild", true, seal(rebuilt), { previousEvidence: snapshot });
  }

  function cancelPatternExecutionEvidence(snapshot, options = {}) {
    requireSnapshot(snapshot); checkConcurrency(snapshot, options);
    if (TERMINAL_STATES.includes(snapshot.lifecycle)) return commandResult("cancel", false, snapshot);
    if (!["waiting", "ready"].includes(snapshot.lifecycle)) throw evidenceError("cancel_not_allowed", "Cancel доступен до collection или после validation.");
    const now = options.now || timestampNow(); const next = mutable(snapshot);
    next.revision += 1; next.updatedAt = now; transition(next, "cancelled");
    appendAudit(next, "cancelled", now); appendOperation(next, options.operationId, "cancel", now);
    return commandResult("cancel", true, seal(next));
  }

  function validatePatternExecutionEvidenceSnapshot(snapshot, source) {
    const structural = structuralValidation(snapshot);
    const semantic = structural.length ? [] : snapshot.evidenceItems?.length ? semanticEvidenceValidation(snapshot, normalizeSource(source || {}, { projectId: snapshot.projectId })) : [];
    const sourceErrors = source === undefined || structural.length || !snapshot.collectedSourceIdentities ? [] : validateCollectedSource(snapshot, normalizeSource(source, { projectId: snapshot.projectId }));
    const errors = stableDiagnostics([...structural, ...semantic, ...sourceErrors]);
    return finish({ valid: errors.length === 0, structural, semantic, source: sourceErrors, errors });
  }

  function structuralValidation(snapshot, options = {}) {
    const errors = [];
    const invalid = (code, details) => errors.push(diagnostic(code, details));
    try { canonicalize(snapshot); } catch (error) { invalid(error.code || "json_safety_invalid"); return stableDiagnostics(errors); }
    if (!snapshot || snapshot.kind !== PROGRESS_KIND || snapshot.type !== PROGRESS_KIND || snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.version !== VERSION) invalid("evidence_kind_invalid");
    for (const field of ["id", "projectId", "calculationId", "actionId", "actionFingerprint", "actionAttemptId", "interventionId", "interventionFingerprint", "decisionFingerprint", "runtimeId", "monitoringId", "resultId"]) if (!text(snapshot?.[field])) invalid("required_field_missing", { field });
    for (const field of ["executionEpoch", "evidenceEpoch", "evidenceAttemptOrdinal", "epoch", "actionAttemptOrdinal", "revision"]) if (!positiveInteger(snapshot?.[field])) invalid("positive_integer_invalid", { field });
    if (!LIFECYCLE_STATES.includes(snapshot?.lifecycle)) invalid("lifecycle_invalid");
    if (!Array.isArray(snapshot?.evidenceItems) || !Array.isArray(snapshot?.assertions) || !Array.isArray(snapshot?.unexpectedChanges) || !Array.isArray(snapshot?.missingEvidence) || !Array.isArray(snapshot?.contradictions) || !Array.isArray(snapshot?.audit) || !Array.isArray(snapshot?.operations)) invalid("evidence_collections_invalid");
    if ((snapshot?.audit?.length || 0) > AUDIT_LIMIT || (snapshot?.operations?.length || 0) > OPERATION_LIMIT) invalid("bounded_collection_invalid");
    if (!isTimestamp(snapshot?.createdAt) || !isTimestamp(snapshot?.updatedAt)) invalid("timestamp_invalid");
    for (const field of ["collectedAt", "validatedAt", "completedAt"]) if (snapshot?.[field] !== null && !isTimestamp(snapshot[field])) invalid("timestamp_invalid", { field });
    const itemIds = new Set();
    for (const item of array(snapshot?.evidenceItems)) {
      if (!text(item.id) || itemIds.has(item.id)) invalid(itemIds.has(item.id) ? "evidence_item_id_duplicate" : "evidence_item_id_invalid", { itemId: item.id });
      itemIds.add(item.id);
      if (!EVIDENCE_TYPES.includes(item.type) || !EVIDENCE_STATUSES.includes(item.status) || !text(item.source) || !isTimestamp(item.collectedAt)) invalid("evidence_item_invalid", { itemId: item.id });
      if (!validFingerprint(item.fingerprint) || item.fingerprint !== fingerprintEvidenceItem(item)) invalid("evidence_item_fingerprint_mismatch", { itemId: item.id });
    }
    for (const assertion of array(snapshot?.assertions)) {
      if (!ASSERTION_TYPES.includes(assertion.type) || !ASSERTION_STATUSES.includes(assertion.status) || !Array.isArray(assertion.evidenceItemIds) || assertion.evidenceItemIds.some((id) => !itemIds.has(id))) invalid("assertion_invalid", { type: assertion.type });
    }
    if (!options.ignoreFingerprint && (!validFingerprint(snapshot?.fingerprint) || snapshot.fingerprint !== fingerprintPatternExecutionEvidence(snapshot))) invalid("evidence_fingerprint_mismatch");
    if (snapshot?.lifecycle === "completed" && (!snapshot.completedAt || snapshot.validationStatus !== "successful" || !snapshot.summary || !allMandatoryAssertionsPassed(snapshot.assertions))) invalid("completed_evidence_invalid");
    return stableDiagnostics(errors);
  }

  function semanticEvidenceValidation(snapshot, source) {
    const errors = [];
    const byType = new Map(array(snapshot.evidenceItems).map((item) => [item.type, item]));
    if (snapshot.evidenceItems.length && EVIDENCE_TYPES.some((type) => !byType.has(type))) errors.push(diagnostic("closed_evidence_catalog_incomplete"));
    if (byType.get("ACTION_ATTEMPT")?.observedValue?.attemptId !== snapshot.actionAttemptId || byType.get("ACTION_ATTEMPT")?.observedValue?.ordinal !== snapshot.actionAttemptOrdinal) errors.push(diagnostic("action_attempt_mismatch"));
    if (byType.get("PRE_STATE_SNAPSHOT")?.observedValue?.phase !== "pre" || byType.get("POST_STATE_SNAPSHOT")?.observedValue?.phase !== "post") errors.push(diagnostic("pre_post_snapshot_order_invalid"));
    if (byType.get("VERIFICATION_RESULT")?.observedValue?.actionFingerprint !== snapshot.actionFingerprint) errors.push(diagnostic("verification_action_fingerprint_mismatch"));
    const action = source?.action;
    if (action && (action.lifecycle !== "completed" || action.verification?.status !== "verified")) errors.push(diagnostic("source_action_not_completed_verified"));
    const expectedKey = action ? actionApi()?.idempotencyKey?.(action, action.currentAttempt?.ordinal) : null;
    if (expectedKey && byType.get("IDEMPOTENCY_PROOF")?.observedValue?.idempotencyKey !== expectedKey) errors.push(diagnostic("idempotency_key_mismatch"));
    const sideEffects = byType.get("SIDE_EFFECT_BOUNDARY")?.observedValue?.unexpectedSideEffects;
    if (Array.isArray(sideEffects) && sideEffects.length) errors.push(diagnostic("unexpected_side_effects_present", { count: sideEffects.length }));
    const auditEvents = byType.get("AUDIT_PROOF")?.observedValue?.events || [];
    if (!auditSequenceMatched(auditEvents)) errors.push(diagnostic("audit_sequence_mismatch"));
    return stableDiagnostics(errors);
  }

  function collectEligibility(snapshot, source) {
    const errors = []; let stale = false;
    const invalid = (code, isStale = false, details = {}) => { errors.push(diagnostic(code, details)); stale = stale || isStale; };
    const action = source.action;
    if (!action) invalid("action_missing");
    else {
      const actionReport = actionApi()?.validatePatternExecutionAction?.(action);
      if (actionReport && !actionReport.valid) invalid("action_fingerprint_invalid", true, { codes: actionReport.errors.map((entry) => entry.code) });
      else if (actionApi()?.fingerprintPatternExecutionAction && actionApi().fingerprintPatternExecutionAction(action) !== action.fingerprint) invalid("action_fingerprint_mismatch", true);
      if (action.id !== snapshot.actionId || action.epoch !== snapshot.executionEpoch || action.fingerprint !== snapshot.actionFingerprint) invalid("action_identity_mismatch", true);
      if (action.lifecycle === "stale" || action.importedDiagnostic || action.executionPlan?.executable === false) invalid("action_import_unsafe", true);
      if (action.lifecycle !== "completed") invalid("action_not_completed");
      if (action.verification?.status !== "verified" || !validFingerprint(action.verification?.fingerprint)) invalid("action_not_verified");
      if (!action.currentAttempt?.attemptId || !positiveInteger(action.currentAttempt?.ordinal)) invalid("action_attempt_missing");
      else if (action.currentAttempt.attemptId !== snapshot.actionAttemptId || action.currentAttempt.ordinal !== snapshot.actionAttemptOrdinal) invalid("action_attempt_identity_mismatch", true);
      if (action.currentAttempt?.status !== "verified") invalid("action_attempt_not_verified");
      if (action.currentAttempt?.runtimeActionExecuted !== true) invalid("adapter_invocation_unproven");
      if (action.currentAttempt?.effectApplied !== (action.result?.changed === true)) invalid("effect_applied_semantics_invalid");
      if (action.result?.changed !== true && action.result?.noOp !== true) invalid("action_effect_unconfirmed");
    }
    const intervention = source.intervention;
    if (!intervention) invalid("intervention_missing");
    else {
      if (intervention.id !== snapshot.interventionId || intervention.fingerprint !== snapshot.interventionFingerprint) invalid("intervention_identity_mismatch", true);
      if (intervention.decision?.fingerprint !== snapshot.decisionFingerprint) invalid("decision_identity_mismatch", true);
      const api = interventionApi();
      if (api?.fingerprintPatternExecutionIntervention && api.fingerprintPatternExecutionIntervention(intervention) !== intervention.fingerprint) invalid("intervention_fingerprint_mismatch", true);
      if (intervention.importedDiagnostic || lifecycleOf(intervention) === "stale") invalid("intervention_import_unsafe", true);
    }
    for (const [name, value, expectedId] of [["runtime", source.runtime, snapshot.runtimeId], ["monitoring", source.monitoring, snapshot.monitoringId], ["result", source.result, snapshot.resultId]]) {
      if (!value) invalid(`${name}_missing`);
      else if (value.id !== expectedId) invalid(`${name}_identity_mismatch`, true);
    }
    const runtimeApi = globalObject.YarnAIPatternExecutionRuntime;
    const runtimeReport = source.runtime && runtimeApi?.validateRuntime?.(source.runtime);
    if (runtimeReport && !runtimeReport.valid) invalid("runtime_fingerprint_invalid", true, { codes: runtimeReport.errors.map((entry) => entry.code) });
    else if (source.runtime && runtimeApi?.calculateRuntimeFingerprint && runtimeApi.calculateRuntimeFingerprint(source.runtime) !== source.runtime.runtimeFingerprint) invalid("runtime_fingerprint_mismatch", true);
    const monitoringApi = globalObject.YarnAIPatternExecutionMonitoring;
    const monitoringReport = source.monitoring && monitoringApi?.validateMonitoring?.(source.monitoring);
    if (monitoringReport && !monitoringReport.valid) invalid("monitoring_fingerprint_invalid", true, { codes: monitoringReport.errors.map((entry) => entry.code) });
    else if (source.monitoring && monitoringApi?.calculateMonitoringFingerprint && monitoringApi.calculateMonitoringFingerprint(source.monitoring) !== source.monitoring.fingerprint) invalid("monitoring_fingerprint_mismatch", true);
    const resultApi = globalObject.YarnAIPatternExecutionResult;
    const resultErrors = source.result && resultApi?.validateResultState?.(source.result);
    if (Array.isArray(resultErrors) && resultErrors.length) invalid("result_fingerprint_invalid", true, { codes: resultErrors.map((entry) => entry.code) });
    for (const entry of verifyRepositoryChain(source)) invalid(entry.code, true, entry.details);
    return { errors: stableDiagnostics(errors), stale };
  }

  function buildEvidenceItems(snapshot, source, at) {
    const action = source.action; const attempt = action.currentAttempt; const verification = action.verification;
    const events = array(action.audit).map((entry) => ({ event: entry.event, at: entry.at, revision: entry.revision, epoch: entry.epoch }));
    const unexpected = array(verification?.evidence?.sideEffectErrors);
    const definitions = [
      ["ACTION_IDENTITY", "PATTERN_EXECUTION_ACTION", { id: action.id, epoch: action.epoch, revision: action.revision, fingerprint: action.fingerprint, lifecycle: action.lifecycle }, { id: snapshot.actionId, epoch: snapshot.executionEpoch, fingerprint: snapshot.actionFingerprint }, equalIdentity(action.id, snapshot.actionId) && action.fingerprint === snapshot.actionFingerprint ? "present" : "contradictory"],
      ["ACTION_ATTEMPT", "PATTERN_EXECUTION_ACTION.currentAttempt", { attemptId: attempt.attemptId, ordinal: attempt.ordinal, status: attempt.status, effectApplied: attempt.effectApplied }, { attemptId: snapshot.actionAttemptId, ordinal: snapshot.actionAttemptOrdinal, status: "verified" }, attempt.attemptId === snapshot.actionAttemptId && attempt.ordinal === snapshot.actionAttemptOrdinal ? "present" : "contradictory"],
      ["ADAPTER_INVOCATION", "PATTERN_EXECUTION_ACTION.currentAttempt", { runtimeActionExecuted: attempt.runtimeActionExecuted, adapterVersion: attempt.adapterVersion, effectFingerprint: attempt.effectFingerprint }, { runtimeActionExecuted: true }, attempt.runtimeActionExecuted === true ? "present" : "missing"],
      ["PRE_STATE_SNAPSHOT", "PATTERN_EXECUTION_ACTION.result", { phase: "pre", state: action.result?.sourceState, preconditionFingerprint: action.result?.preconditionFingerprint, sourceIdentity: action.sourceIdentity }, { phase: "pre" }, action.result?.preconditionFingerprint ? "present" : "missing"],
      ["POST_STATE_SNAPSHOT", "PATTERN_EXECUTION_ACTION.verification", { phase: "post", state: verification.actualState, resultingState: action.result?.resultingState, targetIdentity: verification.targetIdentity }, { phase: "post", resultingState: action.result?.resultingState }, verification.actualState !== undefined && verification.actualState !== null ? "present" : "missing"],
      ["VERIFICATION_RESULT", "PATTERN_EXECUTION_ACTION.verification", { status: verification.status, reasonCode: verification.reasonCode, fingerprint: verification.fingerprint, actionFingerprint: action.fingerprint, verifiedAt: verification.verifiedAt }, { status: "verified", actionFingerprint: snapshot.actionFingerprint }, verification.status === "verified" ? "present" : "contradictory"],
      ["TARGET_IDENTITY", "PATTERN_EXECUTION_ACTION.targetIdentity", normalize(action.targetIdentity), normalize(verification.targetIdentity), canonicalize(normalize(action.targetIdentity)) === canonicalize(normalize(verification.targetIdentity)) ? "present" : "contradictory"],
      ["SOURCE_CHAIN", "PATTERN_EXECUTION_ACTION.sourceIdentity", captureSourceIdentities(source), snapshot.sourceIdentities, "present"],
      ["SIDE_EFFECT_BOUNDARY", "PATTERN_EXECUTION_ACTION.verification.evidence", { affectedIdentity: action.result?.affectedIdentity, unexpectedSideEffects: unexpected }, { targetIdentity: action.targetIdentity, unexpectedSideEffects: [] }, unexpected.length ? "contradictory" : "present"],
      ["IDEMPOTENCY_PROOF", "PATTERN_EXECUTION_ACTION.currentAttempt", { idempotencyKey: attempt.idempotencyKey, ordinal: attempt.ordinal }, { idempotencyKey: actionApi()?.idempotencyKey?.(action, attempt.ordinal) || attempt.idempotencyKey }, attempt.idempotencyKey ? "present" : "missing"],
      ["AUDIT_PROOF", "PATTERN_EXECUTION_ACTION.audit", { events }, { requiredSequence: ["execution_started", "adapter_completed", "verification_started", "verification_verified", "completed"] }, auditSequenceMatched(events) ? "present" : "missing"],
      ["IMPORT_SAFETY", "PATTERN_EXECUTION_ACTION.importedDiagnostic", { importedDiagnostic: action.importedDiagnostic, executable: action.executionPlan?.executable !== false }, { importedDiagnostic: null, executable: true }, !action.importedDiagnostic && action.executionPlan?.executable !== false ? "present" : "invalid"],
    ];
    return definitions.map(([type, itemSource, observedValue, expectedValue, status]) => {
      const item = {
        id: `evidence-item:${fingerprint({ evidenceId: snapshot.id, type }).slice(8)}`,
        type, source: itemSource, sourceIdentity: evidenceSourceIdentity(type, snapshot, source),
        observedValue: normalize(observedValue), expectedValue: normalize(expectedValue), status, fingerprint: null, collectedAt: at,
      };
      item.fingerprint = fingerprintEvidenceItem(item); return item;
    }).sort((left, right) => EVIDENCE_TYPES.indexOf(left.type) - EVIDENCE_TYPES.indexOf(right.type));
  }

  function buildAssertions(snapshot, source, reports) {
    const item = (type) => snapshot.evidenceItems.find((entry) => entry.type === type);
    const itemKnown = (type) => Boolean(item(type) && item(type).status !== "missing");
    const statusFor = (condition, known = true) => known ? condition ? "passed" : "failed" : "unknown";
    const action = source.action;
    const definitions = [
      ["ACTION_WAS_VERIFIED", ["VERIFICATION_RESULT"], statusFor(action?.lifecycle === "completed" && action?.verification?.status === "verified", Boolean(action)), "action_not_verified"],
      ["ACTION_EFFECT_CONFIRMED", ["ACTION_ATTEMPT", "POST_STATE_SNAPSHOT", "VERIFICATION_RESULT"], statusFor(action?.currentAttempt?.effectApplied === (action?.result?.changed === true) && (action?.result?.changed === true || action?.result?.noOp === true), Boolean(action?.result)), "effect_not_confirmed"],
      ["ACTION_TARGET_MATCHED", ["TARGET_IDENTITY"], statusFor(item("TARGET_IDENTITY")?.status === "present", itemKnown("TARGET_IDENTITY")), "target_mismatch"],
      ["ACTION_ATTEMPT_MATCHED", ["ACTION_ATTEMPT"], statusFor(item("ACTION_ATTEMPT")?.status === "present", itemKnown("ACTION_ATTEMPT")), "attempt_mismatch"],
      ["SOURCE_CHAIN_MATCHED", ["SOURCE_CHAIN", "ACTION_IDENTITY"], statusFor(reports.sourceErrors.length === 0, Boolean(snapshot.collectedSourceIdentities)), "source_chain_mismatch"],
      ["NO_UNEXPECTED_SIDE_EFFECTS", ["SIDE_EFFECT_BOUNDARY"], statusFor(item("SIDE_EFFECT_BOUNDARY")?.status === "present", itemKnown("SIDE_EFFECT_BOUNDARY")), "unexpected_side_effects"],
      ["IDEMPOTENCY_KEY_MATCHED", ["IDEMPOTENCY_PROOF"], statusFor(item("IDEMPOTENCY_PROOF")?.status === "present" && !reports.semantic.some((entry) => entry.code === "idempotency_key_mismatch"), itemKnown("IDEMPOTENCY_PROOF")), "idempotency_key_mismatch"],
      ["AUDIT_SEQUENCE_MATCHED", ["AUDIT_PROOF"], statusFor(item("AUDIT_PROOF")?.status === "present", itemKnown("AUDIT_PROOF")), "audit_sequence_mismatch"],
      ["IMPORT_IDENTITY_SAFE", ["IMPORT_SAFETY", "SOURCE_CHAIN"], statusFor(item("IMPORT_SAFETY")?.status === "present" && reports.sourceErrors.length === 0, itemKnown("IMPORT_SAFETY")), "import_identity_unsafe"],
    ];
    return definitions.map(([type, evidenceTypes, status, code]) => ({
      type, status, evidenceItemIds: evidenceTypes.map((evidenceType) => item(evidenceType)?.id).filter(Boolean).sort(lexical),
      expected: status === "unknown" ? "proof_available" : true, observed: status === "passed", code,
      message: status === "passed" ? `${type} passed` : status === "unknown" ? `${type} is unknown` : `${type} failed`,
    })).sort((left, right) => ASSERTION_TYPES.indexOf(left.type) - ASSERTION_TYPES.indexOf(right.type));
  }

  function captureSourceIdentities(source) {
    const action = source.action || {}; const intervention = source.intervention || {};
    const lower = action.sourceIdentity || intervention.sourceIdentity || source.monitoring?.sourceIdentity || {};
    return normalize({
      project: { id: source.projectId },
      calculation: identityFrom(source.calculation, ["fingerprint"]),
      calculationIdentity: lower.calculationIdentity || null,
      plan: identityFrom(source.plan, ["fingerprint", "planFingerprint"]) || lower.executionPlanIdentity || lower.plan || lower.runtimeSourceIdentity?.chain?.plan || null,
      session: identityFrom(source.session, ["fingerprint", "sessionFingerprint"]) || lower.sessionIdentity || lower.session || lower.runtimeSourceIdentity?.chain?.session || null,
      steps: source.steps.length ? source.steps.map((entry) => identityFrom(entry, ["fingerprint", "stepFingerprint"])) : lower.stepIdentities || lower.steps || lower.runtimeSourceIdentity?.chain?.steps || [],
      checkpoints: source.checkpoints.length ? source.checkpoints.map((entry) => identityFrom(entry, ["fingerprint", "checkpointFingerprint"])) : lower.checkpointIdentities || lower.checkpoints || lower.runtimeSourceIdentity?.chain?.checkpoints || [],
      progress: identityFrom(source.executionProgress, ["fingerprint", "progressFingerprint"]) || lower.progressIdentity || lower.progress || lower.runtimeSourceIdentity?.chain?.progress || null,
      completion: identityFrom(source.completion, ["fingerprint", "completionFingerprint"]) || lower.completionIdentity || lower.completion || lower.runtimeSourceIdentity?.chain?.completion || null,
      result: identityFrom(source.result, ["resultFingerprint", "fingerprint"]) || lower.result || null,
      runtime: identityFrom(source.runtime, ["runtimeFingerprint", "fingerprint"]),
      monitoring: identityFrom(source.monitoring, ["fingerprint"]),
      intervention: identityFrom(intervention, ["fingerprint"]),
      decision: { id: intervention.decision?.id || intervention.decision?.decisionId || null, fingerprint: intervention.decision?.fingerprint || action.decisionIdentity?.fingerprint || null },
      action: identityFrom(action, ["fingerprint"]),
      actionAttempt: action.currentAttempt ? { id: action.currentAttempt.attemptId, ordinal: action.currentAttempt.ordinal, effectFingerprint: action.currentAttempt.effectFingerprint, idempotencyKey: action.currentAttempt.idempotencyKey } : null,
      importRevision: lower.importRevision ?? null,
    });
  }

  function validateCollectedSource(snapshot, source) {
    if (!source.action) return [diagnostic("source_action_missing")];
    const current = captureSourceIdentities(source);
    if (canonicalize(current) !== canonicalize(snapshot.collectedSourceIdentities)) return [diagnostic("source_identity_changed", { collected: snapshot.collectedSourceIdentities, current })];
    if (source.action.id !== snapshot.actionId || source.action.fingerprint !== snapshot.actionFingerprint || source.action.lifecycle !== "completed" || source.action.verification?.status !== "verified") return [diagnostic("action_became_stale")];
    return [];
  }

  function validateRetrySource(snapshot, source) {
    const expected = snapshot.collectedSourceIdentities || snapshot.sourceIdentities;
    return canonicalize(captureSourceIdentities(source)) === canonicalize(expected) ? [] : [diagnostic("retry_source_identity_changed")];
  }

  function inspectAggregate(aggregate) {
    const source = normalizeSource(aggregate);
    const records = source.evidenceRecords;
    const record = records.at(-1) || null;
    const rawEvidence = record?.state || null;
    const validation = rawEvidence ? validatePatternExecutionEvidenceSnapshot(rawEvidence) : null;
    const corrupt = Boolean(rawEvidence && validation.structural.length);
    const actionEligible = source.action ? collectEligibility(rawEvidence || evidenceIdentityForEligibility(source), source) : { errors: [diagnostic("action_missing")], stale: false };
    return finish({
      project: source.project, calculationId: source.calculationId, action: source.action,
      intervention: source.intervention, runtime: source.runtime, monitoring: source.monitoring, result: source.result,
      evidenceRecords: records, evidenceRecord: record, rawEvidence, evidence: corrupt ? null : rawEvidence,
      validation, corrupt, sourceChainStatus: rawEvidence?.collectedSourceIdentities ? (validateCollectedSource(rawEvidence, source).length ? "stale" : "matched") : "not_collected",
      availableCommands: rawEvidence ? availableCommands(rawEvidence, source) : actionEligible.errors.length ? [] : ["create"],
      creationErrors: rawEvidence ? [] : actionEligible.errors,
    });
  }

  async function createForProject(repository, projectId, options = {}) {
    const aggregate = await repository.getProject(projectId); const source = normalizeSource(aggregate, { projectId });
    const latest = (await repository.listPatternExecutionEvidence(projectId, source.calculationId)).at(-1);
    if (latest) return inspectAggregate(aggregate);
    const evidence = buildPatternExecutionEvidence(aggregate, options);
    await repository.savePatternExecutionEvidence(projectId, source.calculationId, evidence, { ...options, operationKind: "PATTERN_EXECUTION_EVIDENCE_CREATED" });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function executeForProject(repository, projectId, command, options = {}) {
    const aggregate = await repository.getProject(projectId); const inspected = inspectAggregate(aggregate);
    const current = inspected.rawEvidence;
    if (!current) throw evidenceError("evidence_unavailable", "Evidence snapshot отсутствует.");
    const commands = {
      collect: () => collectPatternExecutionEvidence(current, aggregate, options),
      validate: () => validatePatternExecutionEvidence(current, aggregate, options),
      complete: () => completePatternExecutionEvidence(current, aggregate, options),
      retry: () => retryPatternExecutionEvidence(current, aggregate, options),
      rebuild: () => rebuildPatternExecutionEvidence(current, aggregate, options),
      cancel: () => cancelPatternExecutionEvidence(current, options),
    };
    if (!commands[command]) throw evidenceError("unknown_evidence_command", "Неизвестная команда evidence.");
    const result = commands[command]();
    if (result.changed) await repository.savePatternExecutionEvidence(projectId, inspected.calculationId, result.evidence, {
      ...options, recordId: result.evidence.id === current.id ? inspected.evidenceRecord.progress_id : null,
      expectedRevision: current.revision, expectedFingerprint: current.fingerprint,
      operationKind: `PATTERN_EXECUTION_EVIDENCE_${command.toUpperCase()}`,
    });
    return inspectAggregate(await repository.getProject(projectId));
  }

  async function readForProject(repository, projectId) { return inspectAggregate(await repository.getProject(projectId)); }

  function availableCommands(snapshot, source) {
    if (!snapshot || structuralValidation(snapshot).length) return [];
    if (snapshot.lifecycle === "waiting") return collectEligibility(snapshot, source).errors.length ? ["rebuild"] : ["collect", "cancel", "rebuild"];
    if (snapshot.lifecycle === "validating") return ["validate", "rebuild"];
    if (snapshot.lifecycle === "ready") return ["complete", "cancel", "rebuild"];
    if (["blocked", "failed"].includes(snapshot.lifecycle)) return validateRetrySource(snapshot, source).length ? ["rebuild"] : ["retry", "rebuild"];
    return ["rebuild"];
  }

  function serializePatternExecutionEvidence(snapshot) { requireSnapshot(snapshot); return canonicalize(snapshot); }
  function deserializePatternExecutionEvidence(serialized, options = {}) {
    let parsed;
    try { parsed = typeof serialized === "string" ? JSON.parse(serialized) : copy(serialized); }
    catch { throw evidenceError("invalid_evidence_json", "Evidence JSON повреждён."); }
    requireSnapshot(parsed);
    if (!options.source) {
      if (!options.allowUnprovenIdentity) throw evidenceError("import_identity_unproven", "Imported evidence требует source proof.");
      return makeImportedPatternExecutionEvidenceStale(parsed, { now: options.now, reason: "import_identity_unproven" });
    }
    if (validateCollectedSource(parsed, normalizeSource(options.source, { projectId: parsed.projectId })).length) {
      if (!options.allowUnprovenIdentity) throw evidenceError("import_identity_unproven", "Imported evidence identity не доказана.");
      return makeImportedPatternExecutionEvidenceStale(parsed, { now: options.now, reason: "import_identity_unproven" });
    }
    return finish(parsed);
  }

  function makeImportedPatternExecutionEvidenceStale(snapshot, options = {}) {
    requireSnapshot(snapshot); const now = options.now || timestampNow(); const next = mutable(snapshot);
    const original = evidenceIdentity(next);
    next.revision += 1; next.updatedAt = now; next.lifecycle = "stale"; next.validationStatus = "stale";
    next.importedDiagnostic = { reason: options.reason || "import_identity_unproven", collision: Boolean(options.collision), original };
    appendAudit(next, "import_marked_stale", now, { reason: next.importedDiagnostic.reason, collision: next.importedDiagnostic.collision });
    return seal(next);
  }

  function remapPatternExecutionEvidence(snapshot, referenceMap) {
    requireSnapshot(snapshot); const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(referenceMap || {}));
    const next = remapExact(copy(snapshot), map);
    next.evidenceItems = stableItems(next.evidenceItems).map((item) => {
      const remapped = normalize(item); remapped.fingerprint = fingerprintEvidenceItem(remapped); return remapped;
    });
    const itemIds = new Set(next.evidenceItems.map((item) => item.id));
    next.assertions = stableAssertions(next.assertions).map((assertion) => ({ ...assertion, evidenceItemIds: stableStrings(assertion.evidenceItemIds).filter((id) => itemIds.has(id)) }));
    next.fingerprint = fingerprintPatternExecutionEvidence(next);
    return finish(next);
  }
  function remapSnapshotState(snapshot, referenceMap) { return remapPatternExecutionEvidence(snapshot, referenceMap); }

  function immutableSummary(snapshot) {
    return normalize({
      evidenceId: snapshot.id, projectId: snapshot.projectId, executionEpoch: snapshot.executionEpoch,
      evidenceEpoch: snapshot.evidenceEpoch, evidenceAttemptOrdinal: snapshot.evidenceAttemptOrdinal,
      actionId: snapshot.actionId, actionFingerprint: snapshot.actionFingerprint,
      actionAttemptId: snapshot.actionAttemptId, actionAttemptOrdinal: snapshot.actionAttemptOrdinal,
      evidenceItemCount: snapshot.evidenceItems.length, assertionCount: snapshot.assertions.length,
      passedAssertionCount: snapshot.assertions.filter((entry) => entry.status === "passed").length,
      missingEvidenceCount: snapshot.missingEvidence.length, contradictionCount: snapshot.contradictions.length,
      unexpectedChangeCount: snapshot.unexpectedChanges.length, collectedAt: snapshot.collectedAt, validatedAt: snapshot.validatedAt,
    });
  }

  function normalizeSource(source, options = {}) {
    const aggregate = Array.isArray(source?.progress) ? source : source?.aggregate || source || {};
    const project = aggregate.project || source?.project || null;
    const projectId = text(options.projectId) || text(source?.projectId) || text(project?.project_id) || text(project?.id) || null;
    const calculation = aggregate.calculation || array(aggregate.calculations).find((entry) => entry.calculation_id === project?.active_calculation_id) || null;
    const calculationId = text(source?.calculationId) || text(calculation?.calculation_id) || text(project?.active_calculation_id) || null;
    const records = array(aggregate.progress).filter((entry) => !calculationId || entry.calculation_id === calculationId);
    const newest = (kind) => records.filter((entry) => entry.kind === kind).sort((left, right) => (left.epoch || 0) - (right.epoch || 0) || (left.revision || 0) - (right.revision || 0)).at(-1) || null;
    const state = (kind, explicit) => explicit || newest(kind)?.state || null;
    const states = (kind) => records.filter((entry) => entry.kind === kind).map((entry) => entry.state).filter(Boolean);
    return {
      aggregate, project, projectId, calculation, calculationId, records,
      plan: state("PATTERN_EXECUTION_PLAN", source?.plan), session: state("PATTERN_EXECUTION_SESSION", source?.session),
      steps: source?.steps || states("PATTERN_EXECUTION_STEP"), checkpoints: source?.checkpoints || states("PATTERN_EXECUTION_CHECKPOINT"),
      executionProgress: state("PATTERN_EXECUTION_PROGRESS", source?.executionProgress), completion: state("PATTERN_EXECUTION_COMPLETION", source?.completion),
      result: state("PATTERN_EXECUTION_RESULT", source?.result), runtime: state("PATTERN_EXECUTION_RUNTIME", source?.runtime),
      monitoring: state("PATTERN_EXECUTION_MONITORING", source?.monitoring), intervention: state("PATTERN_EXECUTION_INTERVENTION", source?.intervention),
      action: state("PATTERN_EXECUTION_ACTION", source?.action),
      evidenceRecords: records.filter((entry) => entry.kind === PROGRESS_KIND).sort((left, right) => (left.epoch || 0) - (right.epoch || 0)),
    };
  }

  function verifyRepositoryChain(source) {
    if (!Array.isArray(source.aggregate?.progress)) return [];
    const expected = source.action?.sourceIdentity || source.intervention?.sourceIdentity || {};
    const errors = [];
    const compare = (code, actual, identity) => {
      if (!identity) return;
      if (!actual) { errors.push(diagnostic(`${code}_missing`)); return; }
      const actualId = actual.id || actual.calculation_id;
      const actualFingerprint = actual.fingerprint || actual.planFingerprint || actual.sessionFingerprint || actual.stepFingerprint || actual.checkpointFingerprint || actual.progressFingerprint || actual.completionFingerprint || actual.resultFingerprint;
      if (identity.id && actualId !== identity.id || identity.revision && actual.revision !== identity.revision || identity.epoch && actual.epoch !== identity.epoch || identity.fingerprint && actualFingerprint !== identity.fingerprint) errors.push(diagnostic(`${code}_identity_mismatch`, { expected: identity, actual: identityFrom(actual, ["fingerprint", "planFingerprint", "sessionFingerprint", "stepFingerprint", "checkpointFingerprint", "progressFingerprint", "completionFingerprint", "resultFingerprint"]) }));
    };
    compare("calculation", source.calculation, expected.calculationIdentity);
    compare("plan", source.plan, expected.executionPlanIdentity || expected.plan);
    compare("session", source.session, expected.sessionIdentity || expected.session);
    compare("progress", source.executionProgress, expected.progressIdentity || expected.progress);
    compare("completion", source.completion, expected.completionIdentity || expected.completion);
    compare("result", source.result, expected.result);
    for (const identity of array(expected.stepIdentities || expected.steps)) compare("step", source.steps.find((entry) => entry.id === identity.id), identity);
    for (const identity of array(expected.checkpointIdentities || expected.checkpoints)) compare("checkpoint", source.checkpoints.find((entry) => entry.id === identity.id), identity);
    return stableDiagnostics(errors);
  }

  function identityFrom(value, fingerprintFields) {
    if (!value) return null;
    const result = { id: value.id || value.calculation_id || null };
    for (const field of ["revision", "epoch"]) if (value[field] !== undefined) result[field] = value[field];
    for (const field of fingerprintFields) if (value[field]) { result.fingerprint = value[field]; break; }
    return result;
  }
  function evidenceSourceIdentity(type, snapshot, source) {
    if (["ACTION_IDENTITY", "ACTION_ATTEMPT", "ADAPTER_INVOCATION", "PRE_STATE_SNAPSHOT", "POST_STATE_SNAPSHOT", "VERIFICATION_RESULT", "TARGET_IDENTITY", "IDEMPOTENCY_PROOF", "AUDIT_PROOF", "IMPORT_SAFETY"].includes(type)) return { actionId: snapshot.actionId, actionFingerprint: source.action.fingerprint, attemptId: snapshot.actionAttemptId };
    return { actionId: snapshot.actionId, runtimeId: snapshot.runtimeId, monitoringId: snapshot.monitoringId, interventionId: snapshot.interventionId };
  }
  function sideEffectErrors(snapshot) { return snapshot.evidenceItems.find((entry) => entry.type === "SIDE_EFFECT_BOUNDARY")?.observedValue?.unexpectedSideEffects || []; }
  function auditSequenceMatched(events) {
    const required = ["execution_started", "adapter_completed", "verification_started", "verification_verified", "completed"];
    let cursor = -1;
    for (const name of required) { cursor = events.findIndex((entry, index) => index > cursor && entry.event === name); if (cursor < 0) return false; }
    return true;
  }
  function allMandatoryAssertionsPassed(assertions) { const byType = new Map(array(assertions).map((entry) => [entry.type, entry.status])); return MANDATORY_ASSERTIONS.every((type) => byType.get(type) === "passed"); }
  function evidenceIdentity(snapshot) { return normalize({ id: snapshot.id, fingerprint: snapshot.fingerprint, epoch: snapshot.epoch, evidenceEpoch: snapshot.evidenceEpoch, evidenceAttemptOrdinal: snapshot.evidenceAttemptOrdinal, lifecycle: snapshot.lifecycle }); }
  function evidenceIdentityForEligibility(source) { return { actionId: source.action?.id, actionFingerprint: source.action?.fingerprint, actionAttemptId: source.action?.currentAttempt?.attemptId, actionAttemptOrdinal: source.action?.currentAttempt?.ordinal, executionEpoch: source.action?.epoch, interventionId: source.intervention?.id, interventionFingerprint: source.intervention?.fingerprint, decisionFingerprint: source.intervention?.decision?.fingerprint, runtimeId: source.runtime?.id, monitoringId: source.monitoring?.id, resultId: source.result?.id }; }
  function equalIdentity(left, right) { return Boolean(left && right && left === right); }
  function lifecycleOf(value) { return typeof value?.lifecycle === "string" ? value.lifecycle : value?.lifecycle?.state || null; }
  function actionApi() { return globalObject.YarnAIPatternExecutionAction; }
  function interventionApi() { return globalObject.YarnAIPatternExecutionIntervention; }

  function transition(snapshot, target) { const from = snapshot.lifecycle; if (!TRANSITIONS[from]?.includes(target)) throw evidenceError("invalid_lifecycle_transition", `Переход ${from || "unknown"} -> ${target} недопустим.`); snapshot.lifecycle = target; }
  function checkConcurrency(snapshot, options) {
    if (!positiveInteger(options.expectedRevision) || options.expectedRevision !== snapshot.revision) throw evidenceError("evidence_revision_conflict", "Evidence изменён другой операцией.", { expectedRevision: options.expectedRevision, actualRevision: snapshot.revision });
    if (options.expectedFingerprint !== undefined && options.expectedFingerprint !== snapshot.fingerprint) throw evidenceError("evidence_fingerprint_conflict", "Evidence fingerprint изменён другой операцией.");
    if (options.expectedEpoch !== undefined && options.expectedEpoch !== snapshot.epoch) throw evidenceError("evidence_epoch_conflict", "Evidence epoch изменён другой операцией.");
  }
  function duplicateOperation(snapshot, command, options) {
    const operationId = requireOperationId(options.operationId); const existing = array(snapshot.operations).find((entry) => entry.operationId === operationId);
    if (!existing) return null;
    if (existing.command !== command) throw evidenceError("operation_id_conflict", "operationId уже использован другой командой.");
    return commandResult(command, false, snapshot);
  }
  function appendOperation(snapshot, operationId, command, at) { snapshot.operations = [...array(snapshot.operations), { operationId: requireOperationId(operationId), command, revision: snapshot.revision, epoch: snapshot.epoch, at }].slice(-OPERATION_LIMIT); }
  function appendAudit(snapshot, event, at, details = {}) { const core = { event, revision: snapshot.revision, epoch: snapshot.epoch, evidenceEpoch: snapshot.evidenceEpoch, details: normalize(details) }; snapshot.audit = [...array(snapshot.audit), { id: `evidence-audit:${fingerprint(core).slice(8)}`, ...core, at }].slice(-AUDIT_LIMIT); }
  function seal(snapshot) { snapshot.evidenceItems = stableItems(snapshot.evidenceItems); snapshot.assertions = stableAssertions(snapshot.assertions); snapshot.fingerprint = fingerprintPatternExecutionEvidence(snapshot); const errors = structuralValidation(snapshot); if (errors.length) throw evidenceError("evidence_command_invalid_result", "Команда создала повреждённый evidence snapshot.", { errors }); return finish(snapshot); }
  function requireSnapshot(snapshot) { const errors = structuralValidation(snapshot); if (errors.length) throw evidenceError("corrupted_evidence_snapshot", "Evidence snapshot повреждён.", { errors }); }
  function commandResult(command, changed, evidence, extra = {}) { return finish({ ok: true, command, changed, evidence: copy(evidence), ...copy(extra) }); }
  function stableItems(values) { return array(values).map((item) => normalize(item)).sort((left, right) => EVIDENCE_TYPES.indexOf(left.type) - EVIDENCE_TYPES.indexOf(right.type) || lexical(left.id, right.id)); }
  function stableAssertions(values) { return array(values).map((entry) => ({ ...normalize(entry), evidenceItemIds: stableStrings(entry.evidenceItemIds) })).sort((left, right) => ASSERTION_TYPES.indexOf(left.type) - ASSERTION_TYPES.indexOf(right.type)); }
  function stableAudit(values) { return array(values).map((entry) => ({ id: entry.id, event: entry.event, revision: entry.revision, epoch: entry.epoch, evidenceEpoch: entry.evidenceEpoch, at: entry.at, details: normalize(entry.details) })); }
  function stableDiagnostics(values) { const unique = new Map(); for (const value of array(values)) unique.set(`${value.code}|${canonicalize(value.details || {})}`, normalize(value)); return [...unique.values()].sort((left, right) => lexical(left.code, right.code) || lexical(canonicalize(left.details), canonicalize(right.details))); }
  function stableStrings(values) { return [...new Set(array(values).map(text).filter(Boolean))].sort(lexical); }
  function diagnostic(code, details = {}) { return { code, severity: "error", details: normalize(details) }; }
  function normalize(value) { if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") { const next = {}; for (const key of Object.keys(value).sort(lexical)) next[key] = normalize(value[key]); return next; } return value; }
  function remapExact(value, map) { if (typeof value === "string") return map.get(value) || value; if (Array.isArray(value)) return value.map((entry) => remapExact(entry, map)); if (value && typeof value === "object") for (const key of Object.keys(value)) value[key] = remapExact(value[key], map); return value; }
  function requireOperationId(value) { const result = text(value); if (!result) throw evidenceError("operation_id_required", "Для mutation-команды требуется operationId."); return result; }
  function validFingerprint(value) { return typeof value === "string" && /^fnv1a32:[0-9a-f]{8}$/.test(value); }
  function isTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
  function timestampNow() { return DEFAULT_TIMESTAMP; }
  function positiveInteger(value) { return Number.isInteger(value) && value > 0 ? value : null; }
  function text(value) { return typeof value === "string" && value.trim() ? value.trim() : null; }
  function lexical(left, right) { return String(left ?? "").localeCompare(String(right ?? "")); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function finish(value) { return deepFreeze(copy(value)); }
  function evidenceError(code, message, details = {}) { return new PatternExecutionEvidenceError(code, message, details); }

  const api = {
    VERSION, SCHEMA_VERSION, PROGRESS_KIND, AUDIT_LIMIT, OPERATION_LIMIT,
    LIFECYCLE_STATES, TERMINAL_STATES, TRANSITIONS, EVIDENCE_TYPES, EVIDENCE_STATUSES,
    ASSERTION_TYPES, ASSERTION_STATUSES, MANDATORY_ASSERTIONS, PatternExecutionEvidenceError,
    canonicalize, fingerprint, fingerprintEvidenceItem, fingerprintPatternExecutionEvidence,
    buildPatternExecutionEvidence, collectPatternExecutionEvidence, validatePatternExecutionEvidence,
    completePatternExecutionEvidence, retryPatternExecutionEvidence, rebuildPatternExecutionEvidence,
    cancelPatternExecutionEvidence, validatePatternExecutionEvidenceSnapshot,
    structuralValidation, semanticEvidenceValidation, captureSourceIdentities,
    serializePatternExecutionEvidence, deserializePatternExecutionEvidence,
    makeImportedPatternExecutionEvidenceStale, remapPatternExecutionEvidence, remapSnapshotState,
    inspectAggregate, createForProject, executeForProject, readForProject, availableCommands,
  };
  globalObject.YarnAIPatternExecutionEvidence = Object.freeze(api);
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
