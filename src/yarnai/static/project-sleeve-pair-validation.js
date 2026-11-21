"use strict";

(function initializeProjectSleevePairValidation(globalObject) {
  const DOMAIN_IDENTITY = "PROJECT_SLEEVE_PAIR_VALIDATION";
  const KIND = DOMAIN_IDENTITY;
  const PROGRESS_KIND = KIND;
  const CONTRACT_SCHEMA_ID = "SLEEVE_PAIR_VALIDATION_CONTRACT_V1";
  const CONTRACT_VERSION = 1;
  const OUTPUT_BOUNDARY = "pair_validation_completed";
  const REWORK_BOUNDARY = "pair_rework_required";
  const COMPONENT_SLOTS = Object.freeze(["sleeve_1", "sleeve_2"]);
  const LIFECYCLES = Object.freeze(["reviewing", "completed"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  const RESULT_FIELDS = Object.freeze([
    { field: "actualCuffToUnderarmLengthCm", label: "Длина от манжеты до подреза", unit: "cm", valueType: "decimal" },
    { field: "actualCuffCircumferenceCm", label: "Окружность манжеты", unit: "cm", valueType: "decimal" },
    { field: "actualUpperSleeveCircumferenceCm", label: "Окружность рукава у подреза", unit: "cm", valueType: "decimal" },
    { field: "actualCuffStitchCount", label: "Петли манжеты", unit: "stitches", valueType: "integer" },
    { field: "actualUnderarmFullTubeStitchCount", label: "Петли полного рукава у подреза", unit: "stitches", valueType: "integer" },
    { field: "actualIncreaseEventCount", label: "Выполненные прибавки", unit: "events", valueType: "integer" },
    { field: "observedRoundCount", label: "Наблюдённые ряды", unit: "rounds", valueType: "optional_integer", optional: true },
  ]);
  const STRUCTURAL_CHECKS = Object.freeze([
    "active_scope_matches", "stage79_history_current", "stage80_history_current",
    "latest_preparation_selected", "two_distinct_slots", "current_attempts_completed",
    "result_lineage_valid", "completion_boundaries_valid", "physical_confirmations_valid",
  ]);

  class SleevePairValidationError extends Error {
    constructor(code, message, details = {}) {
      super(message); this.name = "SleevePairValidationError"; this.code = code;
      this.userMessage = message; this.details = clone(details);
    }
  }
  function fail(code, message, details) { throw new SleevePairValidationError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("VALUE_INVALID", "A finite value is required."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("VALUE_INVALID", "The value is not JSON-compatible.");
  }
  function utf8Bytes(value) { if (typeof TextEncoder === "function") return new TextEncoder().encode(value); return unescape(encodeURIComponent(value)).split("").map((item) => item.charCodeAt(0)); }
  function fingerprint(value) { let hash = 0x811c9dc5; for (const byte of utf8Bytes(canonicalize(value))) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function exactKeys(value, keys, code = "STATE_INVALID") { if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !keys.includes(key))) fail(code, "Stage 81 data contains missing or unallowlisted fields.", { expectedKeys: keys, actualKeys: record(value) ? Object.keys(value) : [] }); }
  function requireUuid(value, code = "OPERATION_ID_INVALID") { if (!UUID_V7.test(value || "")) fail(code, "A UUIDv7 identity is required."); return value; }
  function requireTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "An ISO UTC timestamp with milliseconds is required."); return value; }
  function requireFingerprint(value, code = "FINGERPRINT_INVALID") { if (!FINGERPRINT.test(value || "")) fail(code, "A canonical fingerprint is required."); return value; }
  function positiveInteger(value, code = "COUNT_INVALID") { if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) fail(code, "A positive integer is required."); return value; }
  function nonNegativeInteger(value, code = "COUNT_INVALID") { if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) fail(code, "A non-negative integer is required."); return value; }
  function positiveDecimal(value, code = "MEASUREMENT_INVALID") { if (typeof value !== "string" || !DECIMAL.test(value) || Number(value) <= 0 || Number(value) > 10000 || (value.includes(".") && (value.endsWith("0") || value.endsWith(".")))) fail(code, "A positive canonical decimal is required."); return value; }
  function semantic(value) { const next = clone(value); delete next.fingerprint; return next; }
  function withFingerprint(value) { const next = clone(value); delete next.fingerprint; next.fingerprint = fingerprint(next); return next; }
  function requireSlot(slot) { if (!COMPONENT_SLOTS.includes(slot)) fail("COMPONENT_SLOT_INVALID", "The component must be sleeve_1 or sleeve_2."); return slot; }

  function validateStage80Result(result, source, slot) {
    exactKeys(result, ["schemaId", "contractVersion", "identity", "componentIdentity", "componentSlot", "attemptIdentity", "componentEpoch", "preparationIdentity", "preparationFingerprint", "stage79CompletedSnapshotFingerprint", "plannedComparisonSnapshot", "actualCuffStitchCount", "actualUnderarmFullTubeStitchCount", "actualCuffToUnderarmLengthCm", "actualCuffCircumferenceCm", "actualUpperSleeveCircumferenceCm", "actualIncreaseEventCount", "completionBoundary", "underarmStitchesHeldOrRemoved", "targetReachedConfirmation", "physicalCompletionConfirmation", "deviationNote", "observedRoundCount", "timestamps", "sourceFingerprint", "fingerprint"], "RESULT_SNAPSHOT_INVALID");
    const binding = source[slot];
    if (result.schemaId !== "SLEEVE_PHYSICAL_RESULT_V1" || result.contractVersion !== 1 || result.componentSlot !== slot || result.componentIdentity !== binding.componentIdentity || result.attemptIdentity !== binding.attemptIdentity || result.componentEpoch !== binding.componentEpoch || result.identity !== binding.resultIdentity || result.fingerprint !== binding.resultFingerprint || result.sourceFingerprint !== binding.resultSourceFingerprint || result.preparationIdentity !== source.stage80PreparationIdentity || result.preparationFingerprint !== source.stage80PreparationFingerprint || result.stage79CompletedSnapshotFingerprint !== source.stage79CompletedSnapshotFingerprint || result.completionBoundary !== "full_sleeve_tube_at_underarm_before_allocation" || result.underarmStitchesHeldOrRemoved !== false || result.targetReachedConfirmation?.explicit !== true || result.physicalCompletionConfirmation?.explicit !== true || result.fingerprint !== fingerprint(semantic(result))) fail("RESULT_SNAPSHOT_INVALID", "The immutable Stage 80 sleeve result is invalid.");
    positiveInteger(result.actualCuffStitchCount); positiveInteger(result.actualUnderarmFullTubeStitchCount);
    positiveDecimal(result.actualCuffToUnderarmLengthCm); positiveDecimal(result.actualCuffCircumferenceCm); positiveDecimal(result.actualUpperSleeveCircumferenceCm); nonNegativeInteger(result.actualIncreaseEventCount);
    if (result.observedRoundCount !== null) positiveInteger(result.observedRoundCount, "OBSERVED_ROUND_COUNT_INVALID");
    if (result.deviationNote !== null && (typeof result.deviationNote !== "string" || !result.deviationNote.trim() || result.deviationNote.length > 2000)) fail("RESULT_SNAPSHOT_INVALID", "The result deviation note is invalid.");
    exactKeys(result.plannedComparisonSnapshot, ["cuffStitchCount", "underarmFullTubeStitchCount", "cuffToUnderarmLengthCm", "cuffCircumferenceCm", "upperSleeveCircumferenceCm", "increaseEventCount"], "RESULT_SNAPSHOT_INVALID");
    for (const comparison of Object.values(result.plannedComparisonSnapshot)) exactKeys(comparison, ["planned", "actual", "differs"], "RESULT_SNAPSHOT_INVALID");
    exactKeys(result.targetReachedConfirmation, ["explicit", "operationId", "declaredAt"], "RESULT_SNAPSHOT_INVALID"); exactKeys(result.physicalCompletionConfirmation, ["explicit", "operationId", "confirmedAt"], "RESULT_SNAPSHOT_INVALID"); exactKeys(result.timestamps, ["startedAt", "targetReachedAt", "measuredAt", "completedAt"], "RESULT_SNAPSHOT_INVALID");
    requireFingerprint(result.sourceFingerprint); requireUuid(result.targetReachedConfirmation.operationId); requireTimestamp(result.targetReachedConfirmation.declaredAt); requireUuid(result.physicalCompletionConfirmation.operationId); requireTimestamp(result.physicalCompletionConfirmation.confirmedAt);
  }

  function sourceBinding(stage80Record, stage80State, stage80Domain = globalObject.YarnAIProjectSleevePhysicalExecution) {
    if (!stage80Domain || !stage80Record) fail("STAGE80_REQUIRED", "Two completed Stage 80 sleeve results are required.");
    let state; try { state = stage80Domain.validateState(stage80State); } catch (error) { fail(error?.code || "STAGE80_SOURCE_INVALID", error?.userMessage || error?.message || "Stage 80 source is invalid."); }
    if (stage80Record.kind !== stage80Domain.KIND || stage80Record.project_id !== state.projectId || stage80Record.calculation_id !== state.calculationId || stage80Record.epoch !== state.preparationEpoch || !Number.isSafeInteger(stage80Record.revision) || stage80Record.revision < 1) fail("STAGE80_SOURCE_INVALID", "Stage 80 repository binding is invalid.");
    const source = {
      stage80ProgressId: stage80Record.progress_id, stage80RepositoryRevision: stage80Record.revision,
      stage80StateIdentity: state.identity, stage80PreparationEpoch: state.preparationEpoch,
      stage80AggregateRevision: state.aggregateRevision, stage80StateFingerprint: state.fingerprint,
      stage80PreparationIdentity: state.preparation.identity, stage80PreparationFingerprint: state.preparation.fingerprint,
      stage79CompletedSnapshotFingerprint: state.source.stage79CompletedSnapshotFingerprint,
      sleeve_1: null, sleeve_2: null, fingerprint: "",
    };
    const results = {};
    for (const slot of COMPONENT_SLOTS) {
      const history = state.components[slot]; const attempt = history?.attempts?.at(-1); const result = attempt?.completedResultSnapshot;
      if (!attempt || attempt.lifecycle !== "completed" || !result) fail("STAGE80_PAIR_NOT_READY", "Оба текущих рукава должны быть физически завершены.", { componentSlot: slot });
      source[slot] = { componentIdentity: history.componentIdentity, attemptIdentity: attempt.attemptIdentity, componentEpoch: attempt.componentEpoch, resultIdentity: result.identity, resultFingerprint: result.fingerprint, resultSourceFingerprint: result.sourceFingerprint };
      results[slot] = clone(result);
    }
    source.fingerprint = fingerprint(semantic(source));
    for (const slot of COMPONENT_SLOTS) validateStage80Result(results[slot], source, slot);
    return deepFreeze({ source, results });
  }

  function comparisonRows(results) {
    return RESULT_FIELDS.map((definition) => {
      const left = results.sleeve_1[definition.field]; const right = results.sleeve_2[definition.field];
      let observationStatus = "observed_both"; let outcome;
      if (definition.optional && left === null && right === null) { observationStatus = "not_observed_both"; outcome = "not_compared"; }
      else if (definition.optional && (left === null || right === null)) { observationStatus = "observed_one_only"; outcome = "different"; }
      else outcome = canonicalize(left) === canonicalize(right) ? "equal" : "different";
      return { field: definition.field, comparisonPolicy: "exact_v1", sleeve1Value: left, sleeve2Value: right, observationStatus, outcome };
    });
  }
  function buildReview(sourceInput, resultsInput, identity) {
    const source = clone(sourceInput); const results = clone(resultsInput); const comparisons = comparisonRows(results);
    const detectedDifferences = comparisons.filter((row) => row.outcome === "different").map((row) => {
      const definition = RESULT_FIELDS.find((item) => item.field === row.field);
      return { field: row.field, label: definition.label, unit: definition.unit, valueType: definition.valueType, sleeve1Value: row.sleeve1Value, sleeve2Value: row.sleeve2Value, reason: row.observationStatus === "observed_one_only" ? "observation_presence_differs" : "exact_values_differ", sleeve1ResultFingerprint: source.sleeve_1.resultFingerprint, sleeve2ResultFingerprint: source.sleeve_2.resultFingerprint };
    });
    return withFingerprint({ identity, sourceFingerprint: source.fingerprint, tolerancePolicy: null, structuralChecks: STRUCTURAL_CHECKS.map((check) => ({ check, outcome: "passed" })), results, comparisons, detectedDifferences, comparisonOutcome: detectedDifferences.length ? "differences_detected" : "exact_match", orderingPolicy: "stage81-comparison-fields:v1", fingerprint: "" });
  }
  function receiptPayload(command, stateLike, payload) { return { command, validationIdentity: stateLike.identity, validationEpoch: stateLike.validationEpoch, sourceFingerprint: stateLike.source.fingerprint, reviewFingerprint: stateLike.review.fingerprint, payload: clone(payload) }; }
  function existingReceipt(state, operationId, command, payload) {
    const expected = fingerprint(receiptPayload(command, state, payload)); const prior = state.operationReceipts.find((item) => item.operationId === operationId);
    if (!prior) return null; if (prior.command !== command || prior.payloadFingerprint !== expected) fail("OPERATION_ID_CONFLICT", "The operation id was already used with different semantics."); return state;
  }

  function createReview(input = {}, metadata = {}) {
    requireUuid(input.projectId, "PROJECT_ID_INVALID"); requireUuid(input.calculationId, "CALCULATION_ID_INVALID"); requireUuid(metadata.operationId); requireTimestamp(metadata.at);
    if (!Number.isSafeInteger(input.validationEpoch) || input.validationEpoch < 1) fail("VALIDATION_EPOCH_INVALID", "Validation epochs must be positive and contiguous.");
    if (!record(input.sourceBundle) || input.sourceBundle.source?.fingerprint !== fingerprint(semantic(input.sourceBundle.source))) fail("SOURCE_BINDING_INVALID", "The Stage 80 source bundle is invalid.");
    const identity = `${input.projectId}:${input.calculationId}:sleeve-pair-validation:${input.validationEpoch}:${input.sourceBundle.source.fingerprint}`;
    const review = buildReview(input.sourceBundle.source, input.sourceBundle.results, `${identity}:review`);
    const base = { kind: KIND, contractSchemaId: CONTRACT_SCHEMA_ID, contractVersion: CONTRACT_VERSION, projectId: input.projectId, calculationId: input.calculationId, identity, validationEpoch: input.validationEpoch, predecessorIdentity: input.predecessorIdentity || null, lifecycle: "reviewing", revision: 1, source: clone(input.sourceBundle.source), review, decision: null, operationReceipts: [], timestamps: { createdAt: metadata.at, updatedAt: metadata.at, completedAt: null }, fingerprint: "" };
    const payload = { explicitUserAction: true }; const payloadFingerprint = fingerprint(receiptPayload("start_pair_review", base, payload));
    base.operationReceipts.push({ operationId: metadata.operationId, command: "start_pair_review", payloadFingerprint, resultingRevision: 1, at: metadata.at });
    return withStateFingerprint(base);
  }

  function normalizeDecision(input = {}, comparisonOutcome) {
    const decision = input.decision; const explicitConfirmation = input.explicitConfirmation === true;
    if (!explicitConfirmation) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Explicit pair confirmation is required.");
    if (!['accept_pair', 'rework'].includes(decision)) fail("DECISION_INVALID", "Choose explicit pair acceptance or rework.");
    const acceptanceNote = input.acceptanceNote === null || input.acceptanceNote === undefined ? null : String(input.acceptanceNote).trim();
    if (acceptanceNote && acceptanceNote.length > 2000) fail("ACCEPTANCE_NOTE_INVALID", "The acceptance note is too long.");
    const reworkComponents = Array.isArray(input.reworkComponents) ? [...new Set(input.reworkComponents.map(requireSlot))].sort((a, b) => COMPONENT_SLOTS.indexOf(a) - COMPONENT_SLOTS.indexOf(b)) : [];
    if (decision === "accept_pair") {
      if (reworkComponents.length) fail("DECISION_INVALID", "Accepted pair cannot select rework components.");
      if (comparisonOutcome === "differences_detected" && !acceptanceNote) fail("ACCEPTANCE_NOTE_REQUIRED", "Опишите, почему видимые различия приняты.");
      return { decision, acceptanceNote: comparisonOutcome === "exact_match" ? null : acceptanceNote, reworkComponents: [], explicitConfirmation: true };
    }
    if (comparisonOutcome !== "differences_detected") fail("REWORK_DECISION_INVALID", "Rework selection is available after a detected pair difference.");
    if (!reworkComponents.length) fail("REWORK_COMPONENT_REQUIRED", "Select at least one sleeve for rework.");
    return { decision, acceptanceNote: null, reworkComponents, explicitConfirmation: true };
  }
  function completeDecision(stateInput, input = {}, metadata = {}) {
    const state = validateState(stateInput); requireUuid(metadata.operationId); requireTimestamp(metadata.at);
    const normalized = normalizeDecision(input, state.review.comparisonOutcome); const replay = existingReceipt(state, metadata.operationId, "complete_pair_decision", normalized); if (replay) return replay;
    if (state.lifecycle !== "reviewing" || state.decision !== null) fail("TRANSITION_INVALID", "Only a current reviewing validation can be completed.");
    if (metadata.expectedRevision !== undefined && metadata.expectedRevision !== state.revision) fail("REVISION_CONFLICT", "Stage 81 changed concurrently.");
    if (metadata.expectedFingerprint !== undefined && metadata.expectedFingerprint !== state.fingerprint) fail("REVISION_CONFLICT", "Stage 81 fingerprint is stale.");
    if (metadata.expectedReviewFingerprint !== undefined && metadata.expectedReviewFingerprint !== state.review.fingerprint) fail("REVIEW_STALE", "The pair comparison changed; reload before deciding.");
    const next = clone(state); const outcome = normalized.decision === "rework" ? "rework_required" : state.review.comparisonOutcome === "exact_match" ? "matched" : "accepted_with_deviation";
    next.decision = withFingerprint({ identity: `${state.identity}:decision:${metadata.operationId}`, reviewFingerprint: state.review.fingerprint, decision: normalized.decision, outcome, acceptanceNote: normalized.acceptanceNote, reworkComponents: normalized.reworkComponents, explicitConfirmation: true, operationId: metadata.operationId, decidedAt: metadata.at, outputBoundary: outcome === "rework_required" ? REWORK_BOUNDARY : OUTPUT_BOUNDARY, fingerprint: "" });
    next.lifecycle = "completed"; next.revision = state.revision + 1; next.timestamps.updatedAt = metadata.at; next.timestamps.completedAt = metadata.at;
    next.operationReceipts.push({ operationId: metadata.operationId, command: "complete_pair_decision", payloadFingerprint: fingerprint(receiptPayload("complete_pair_decision", state, normalized)), resultingRevision: next.revision, at: metadata.at });
    return withStateFingerprint(next);
  }

  function validateSource(source) {
    exactKeys(source, ["stage80ProgressId", "stage80RepositoryRevision", "stage80StateIdentity", "stage80PreparationEpoch", "stage80AggregateRevision", "stage80StateFingerprint", "stage80PreparationIdentity", "stage80PreparationFingerprint", "stage79CompletedSnapshotFingerprint", "sleeve_1", "sleeve_2", "fingerprint"], "SOURCE_BINDING_INVALID");
    if (!source.stage80ProgressId || !source.stage80StateIdentity || !source.stage80PreparationIdentity || !Number.isSafeInteger(source.stage80RepositoryRevision) || source.stage80RepositoryRevision < 1 || !Number.isSafeInteger(source.stage80PreparationEpoch) || source.stage80PreparationEpoch < 1 || !Number.isSafeInteger(source.stage80AggregateRevision) || source.stage80AggregateRevision < 1) fail("SOURCE_BINDING_INVALID", "The Stage 80 source binding is incomplete.");
    [source.stage80StateFingerprint, source.stage80PreparationFingerprint, source.stage79CompletedSnapshotFingerprint].forEach((item) => requireFingerprint(item, "SOURCE_BINDING_INVALID"));
    for (const slot of COMPONENT_SLOTS) { exactKeys(source[slot], ["componentIdentity", "attemptIdentity", "componentEpoch", "resultIdentity", "resultFingerprint", "resultSourceFingerprint"], "SOURCE_BINDING_INVALID"); if (![source[slot].componentIdentity, source[slot].attemptIdentity, source[slot].resultIdentity].every((item) => typeof item === "string" && item.length > 0) || !Number.isSafeInteger(source[slot].componentEpoch) || source[slot].componentEpoch < 1) fail("SOURCE_BINDING_INVALID", "A component source binding is invalid."); requireFingerprint(source[slot].resultFingerprint); requireFingerprint(source[slot].resultSourceFingerprint); }
    if (source.sleeve_1.componentIdentity === source.sleeve_2.componentIdentity || source.fingerprint !== fingerprint(semantic(source))) fail("SOURCE_BINDING_INVALID", "The pair source fingerprint or component identities are invalid.");
  }
  function validateReview(review, source) {
    exactKeys(review, ["identity", "sourceFingerprint", "tolerancePolicy", "structuralChecks", "results", "comparisons", "detectedDifferences", "comparisonOutcome", "orderingPolicy", "fingerprint"], "REVIEW_INVALID");
    if (review.sourceFingerprint !== source.fingerprint || review.tolerancePolicy !== null || review.orderingPolicy !== "stage81-comparison-fields:v1" || !["exact_match", "differences_detected"].includes(review.comparisonOutcome)) fail("REVIEW_INVALID", "The immutable pair review metadata is invalid.");
    if (!Array.isArray(review.structuralChecks) || canonicalize(review.structuralChecks) !== canonicalize(STRUCTURAL_CHECKS.map((check) => ({ check, outcome: "passed" })))) fail("REVIEW_INVALID", "Structural checks are incomplete.");
    exactKeys(review.results, COMPONENT_SLOTS, "REVIEW_INVALID"); for (const slot of COMPONENT_SLOTS) validateStage80Result(review.results[slot], source, slot);
    const expected = buildReview(source, review.results, review.identity); if (canonicalize(review) !== canonicalize(expected)) fail("REVIEW_INVALID", "The deterministic comparison snapshot is invalid.");
  }
  function validateDecision(decision, state) {
    exactKeys(decision, ["identity", "reviewFingerprint", "decision", "outcome", "acceptanceNote", "reworkComponents", "explicitConfirmation", "operationId", "decidedAt", "outputBoundary", "fingerprint"], "DECISION_INVALID");
    if (decision.reviewFingerprint !== state.review.fingerprint || decision.explicitConfirmation !== true || decision.fingerprint !== fingerprint(semantic(decision))) fail("DECISION_INVALID", "The immutable decision binding is invalid.");
    requireUuid(decision.operationId); requireTimestamp(decision.decidedAt);
    const normalized = normalizeDecision(decision, state.review.comparisonOutcome); const expectedOutcome = normalized.decision === "rework" ? "rework_required" : state.review.comparisonOutcome === "exact_match" ? "matched" : "accepted_with_deviation";
    if (decision.outcome !== expectedOutcome || decision.outputBoundary !== (expectedOutcome === "rework_required" ? REWORK_BOUNDARY : OUTPUT_BOUNDARY)) fail("DECISION_INVALID", "The Stage 81 output boundary is invalid.");
  }
  function validateReceipt(receipt) { exactKeys(receipt, ["operationId", "command", "payloadFingerprint", "resultingRevision", "at"], "RECEIPT_INVALID"); requireUuid(receipt.operationId); requireFingerprint(receipt.payloadFingerprint); requireTimestamp(receipt.at); if (!["start_pair_review", "complete_pair_decision"].includes(receipt.command) || !Number.isSafeInteger(receipt.resultingRevision) || receipt.resultingRevision < 1) fail("RECEIPT_INVALID", "A Stage 81 operation receipt is invalid."); }
  function withStateFingerprint(state) { const next = withFingerprint(state); return validateState(next); }
  function validateState(input) {
    const value = clone(input); exactKeys(value, ["kind", "contractSchemaId", "contractVersion", "projectId", "calculationId", "identity", "validationEpoch", "predecessorIdentity", "lifecycle", "revision", "source", "review", "decision", "operationReceipts", "timestamps", "fingerprint"]);
    if (value.kind !== KIND || value.contractSchemaId !== CONTRACT_SCHEMA_ID || value.contractVersion !== CONTRACT_VERSION || !LIFECYCLES.includes(value.lifecycle)) fail("STATE_INVALID", "Stage 81 contract identity or lifecycle is invalid.");
    requireUuid(value.projectId, "PROJECT_ID_INVALID"); requireUuid(value.calculationId, "CALCULATION_ID_INVALID"); if (!value.identity || !Number.isSafeInteger(value.validationEpoch) || value.validationEpoch < 1 || !Number.isSafeInteger(value.revision) || value.revision < 1) fail("STATE_INVALID", "Stage 81 identity, epoch, or revision is invalid.");
    validateSource(value.source); validateReview(value.review, value.source);
    if (!Array.isArray(value.operationReceipts) || value.operationReceipts.length < 1 || value.operationReceipts.length > 1000) fail("RECEIPT_INVALID", "Stage 81 operation receipt history is invalid.");
    const operations = new Set(); for (const receipt of value.operationReceipts) { validateReceipt(receipt); if (operations.has(receipt.operationId)) fail("OPERATION_ID_CONFLICT", "Stage 81 operation ids must be unique."); operations.add(receipt.operationId); }
    exactKeys(value.timestamps, ["createdAt", "updatedAt", "completedAt"]); requireTimestamp(value.timestamps.createdAt); requireTimestamp(value.timestamps.updatedAt);
    if (value.lifecycle === "reviewing") { if (value.revision !== 1 || value.decision !== null || value.timestamps.completedAt !== null || value.operationReceipts.length !== 1) fail("STATE_INVALID", "A reviewing Stage 81 record is invalid."); }
    else { if (value.revision !== 2 || !value.decision || value.timestamps.completedAt !== value.decision.decidedAt || value.operationReceipts.length !== 2) fail("STATE_INVALID", "A completed Stage 81 record is invalid."); validateDecision(value.decision, value); }
    if (value.fingerprint !== fingerprint(semantic(value))) fail("FINGERPRINT_MISMATCH", "Stage 81 fingerprint does not match its content.");
    return deepFreeze(value);
  }

  function resultSummary(result) { return { actualCuffToUnderarmLengthCm: result.actualCuffToUnderarmLengthCm, actualCuffCircumferenceCm: result.actualCuffCircumferenceCm, actualUpperSleeveCircumferenceCm: result.actualUpperSleeveCircumferenceCm, actualCuffStitchCount: result.actualCuffStitchCount, actualUnderarmFullTubeStitchCount: result.actualUnderarmFullTubeStitchCount, actualIncreaseEventCount: result.actualIncreaseEventCount, observedRoundCount: result.observedRoundCount, completionBoundary: result.completionBoundary, targetReachedConfirmed: result.targetReachedConfirmation.explicit === true, physicalCompletionConfirmed: result.physicalCompletionConfirmation.explicit === true, deviationNote: result.deviationNote, plannedComparison: clone(result.plannedComparisonSnapshot) }; }
  function readyView(sourceBundle, historySummary = {}) {
    return deepFreeze({ available: true, blocked: false, readiness: "ready", lifecycle: "ready", firstAction: "start_pair_review", primaryActionLabel: "Проверить два готовых рукава", currentSleeves: { sleeve_1: resultSummary(sourceBundle.results.sleeve_1), sleeve_2: resultSummary(sourceBundle.results.sleeve_2) }, comparisons: [], detectedDifferences: [], comparisonOutcome: null, tolerancePolicy: null, allowedActions: ["start_pair_review"], currentValidation: { status: "not_started", current: false, historicalCount: historySummary.historicalCount || 0, staleCount: historySummary.staleCount || 0 }, pairValidationBoundary: { status: "pending", completed: false }, joinPreparation: { status: "blocked", available: false }, nextDestination: null });
  }
  function projectView(stateInput, historySummary = {}) {
    const state = validateState(stateInput); const accepted = state.decision && ["matched", "accepted_with_deviation"].includes(state.decision.outcome); const rework = state.decision?.outcome === "rework_required";
    return deepFreeze({ available: true, blocked: false, readiness: "ready", lifecycle: state.lifecycle, currentSleeves: { sleeve_1: resultSummary(state.review.results.sleeve_1), sleeve_2: resultSummary(state.review.results.sleeve_2) }, comparisons: state.review.comparisons.map((row) => ({ ...clone(row), label: RESULT_FIELDS.find((item) => item.field === row.field).label, unit: RESULT_FIELDS.find((item) => item.field === row.field).unit })), detectedDifferences: state.review.detectedDifferences.map(({ sleeve1ResultFingerprint, sleeve2ResultFingerprint, ...item }) => item), comparisonOutcome: state.review.comparisonOutcome, tolerancePolicy: null, allowedActions: state.lifecycle === "reviewing" ? (state.review.comparisonOutcome === "exact_match" ? ["accept_pair"] : ["accept_pair", "rework"]) : [], currentValidation: { status: state.lifecycle === "reviewing" ? "reviewing" : accepted ? "accepted" : "rework_required", current: true, outcome: state.decision?.outcome || null, acceptanceNote: state.decision?.acceptanceNote || null, reworkComponents: clone(state.decision?.reworkComponents || []), historicalCount: historySummary.historicalCount || 0, staleCount: historySummary.staleCount || 0 }, pairValidationBoundary: { status: accepted ? OUTPUT_BOUNDARY : rework ? REWORK_BOUNDARY : "pending", completed: Boolean(accepted) }, joinPreparation: { status: "blocked", available: false }, nextDestination: rework ? { routePath: "/project-sleeve-physical-execution", componentSlots: clone(state.decision.reworkComponents) } : null });
  }

  const api = Object.freeze({ DOMAIN_IDENTITY, KIND, PROGRESS_KIND, CONTRACT_SCHEMA_ID, CONTRACT_VERSION, OUTPUT_BOUNDARY, REWORK_BOUNDARY, COMPONENT_SLOTS, LIFECYCLES, RESULT_FIELDS, SleevePairValidationError, canonicalize, fingerprint, sourceBinding, comparisonRows, createReview, completeDecision, validateState, readyView, projectView });
  globalObject.YarnAIProjectSleevePairValidation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
