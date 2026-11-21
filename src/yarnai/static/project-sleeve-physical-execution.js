"use strict";

(function initializeProjectSleevePhysicalExecution(globalObject) {
  const DOMAIN_IDENTITY = "PROJECT_SLEEVE_PHYSICAL_EXECUTION";
  const KIND = DOMAIN_IDENTITY;
  const PROGRESS_KIND = KIND;
  const CONTRACT_SCHEMA_ID = "SLEEVE_PAIR_PHYSICAL_EXECUTION_CONTRACT_V1";
  const CONTRACT_VERSION = 1;
  const RESULT_SCHEMA_ID = "SLEEVE_PHYSICAL_RESULT_V1";
  const COMPLETION_BOUNDARY = "full_sleeve_tube_at_underarm_before_allocation";
  const COMPONENT_SLOTS = Object.freeze(["sleeve_1", "sleeve_2"]);
  const LIFECYCLES = Object.freeze(["ready", "in_progress", "paused", "target_reached", "reviewing_result", "completed"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

  class SleevePhysicalExecutionError extends Error {
    constructor(code, message, details = {}) {
      super(message); this.name = "SleevePhysicalExecutionError"; this.code = code;
      this.userMessage = message; this.details = clone(details);
    }
  }
  function fail(code, message, details) { throw new SleevePhysicalExecutionError(code, message, details); }
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
  function exactKeys(value, keys, code = "STATE_INVALID") { if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !keys.includes(key))) fail(code, "Stage 80 data contains missing or unallowlisted fields.", { expectedKeys: keys, actualKeys: record(value) ? Object.keys(value) : [] }); }
  function requireUuid(value, code = "OPERATION_ID_INVALID") { if (!UUID_V7.test(value || "")) fail(code, "A UUIDv7 identity is required."); return value; }
  function requireTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "An ISO UTC timestamp with milliseconds is required."); return value; }
  function requireFingerprint(value, code = "FINGERPRINT_INVALID") { if (!FINGERPRINT.test(value || "")) fail(code, "A canonical fingerprint is required."); return value; }
  function positiveInteger(value, code = "COUNT_INVALID") { const number = Number(value); if (!Number.isSafeInteger(number) || number < 1 || number > 1000000) fail(code, "A positive manually confirmed integer is required."); return number; }
  function nonNegativeInteger(value, code = "COUNT_INVALID") { const number = Number(value); if (!Number.isSafeInteger(number) || number < 0 || number > 1000000) fail(code, "A non-negative manually confirmed integer is required."); return number; }
  function positiveDecimal(value, code = "MEASUREMENT_INVALID") { const text = String(value); if (!DECIMAL.test(text) || Number(text) <= 0 || Number(text) > 10000) fail(code, "A positive canonical decimal measurement is required."); return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text; }
  function stateSemantic(value) { const result = clone(value); delete result.fingerprint; return result; }
  function attemptSemantic(value) { const result = clone(value); delete result.fingerprint; return result; }
  function resultSemantic(value) { const result = clone(value); delete result.fingerprint; return result; }
  function withAttemptFingerprint(attempt) { const next = clone(attempt); delete next.fingerprint; next.fingerprint = fingerprint(next); return next; }
  function withStateFingerprint(state) { const next = clone(state); delete next.fingerprint; next.fingerprint = fingerprint(next); return validateState(next); }
  function requireSlot(slot) { if (!COMPONENT_SLOTS.includes(slot)) fail("COMPONENT_SLOT_INVALID", "The component slot must be sleeve_1 or sleeve_2."); return slot; }

  function sourceBinding(stage79Record, stage79State) {
    const snapshot = stage79State?.completedSnapshot;
    if (!stage79Record || !stage79State || stage79State.kind !== "PROJECT_SLEEVE_TARGET_GEOMETRY_PLANNING" || stage79State.lifecycle !== "completed" || !snapshot || snapshot.lifecycle !== "completed") fail("STAGE79_REQUIRED", "A completed authoritative Stage 79 plan is required.");
    const value = {
      stage79ProgressId: stage79Record.progress_id,
      stage79RepositoryRevision: stage79Record.revision,
      stage79StateIdentity: stage79State.identity,
      stage79Epoch: stage79State.epoch,
      stage79StateRevision: stage79State.revision,
      stage79StateFingerprint: stage79State.fingerprint,
      stage79CompletedSnapshotFingerprint: snapshot.fingerprint,
      authoritativeChainFingerprint: snapshot.sourceBindings?.sourceBindingFingerprint,
    };
    if (!value.stage79ProgressId || !Number.isSafeInteger(value.stage79RepositoryRevision) || value.stage79RepositoryRevision < 1 || !value.stage79StateIdentity || !Number.isSafeInteger(value.stage79Epoch) || value.stage79Epoch < 1 || !Number.isSafeInteger(value.stage79StateRevision) || value.stage79StateRevision < 1) fail("STAGE79_BINDING_INVALID", "The Stage 79 repository binding is incomplete.");
    [value.stage79StateFingerprint, value.stage79CompletedSnapshotFingerprint, value.authoritativeChainFingerprint].forEach((item) => requireFingerprint(item, "STAGE79_BINDING_INVALID"));
    value.fingerprint = fingerprint(value);
    return deepFreeze(value);
  }

  function preparationFromStage79(projectId, calculationId, preparationEpoch, binding, stage79State, predecessorPreparationIdentity = null) {
    requireUuid(projectId, "PROJECT_ID_INVALID"); requireUuid(calculationId, "CALCULATION_ID_INVALID");
    const snapshot = stage79State.completedSnapshot; const geometry = snapshot.derivedGeometry; const targets = snapshot.confirmedTargets;
    if (!geometry || !targets || snapshot.projectId !== projectId || snapshot.calculationId !== calculationId) fail("STAGE79_BINDING_INVALID", "The completed Stage 79 plan belongs to another scope.");
    const identity = `${projectId}:${calculationId}:sleeve-execution-preparation:${preparationEpoch}:${binding.stage79CompletedSnapshotFingerprint}`;
    const preparation = {
      schemaId: CONTRACT_SCHEMA_ID, contractVersion: CONTRACT_VERSION, identity, preparationEpoch,
      predecessorPreparationIdentity, sourceFingerprint: binding.fingerprint,
      planned: {
        cuffTargetCircumferenceCm: String(targets.cuffTargetCircumferenceCm.value),
        upperSleeveTargetCircumferenceCm: String(targets.upperSleeveTargetCircumferenceCm.value),
        cuffToUnderarmLengthCm: String(targets.cuffToUnderarmLengthCm.value),
        cuffStitchCount: geometry.cuffTargetStitches,
        underarmFullTubeStitchCount: geometry.upperSleeveTargetStitches,
        increaseEventCount: geometry.increaseEventCount,
        increaseDeltaPerEvent: geometry.deltaPerEvent ?? snapshot.construction?.increasePolicy?.deltaPerEvent,
        schedule: clone(geometry.increaseDistribution?.events || []),
        stopCondition: clone(geometry.stopCondition),
      },
      construction: {
        direction: snapshot.construction?.direction?.value,
        componentDirection: snapshot.construction?.componentDirection?.value,
        topologyIdentity: snapshot.construction?.topologyIdentity,
        workingMethod: snapshot.construction?.workingMethod?.value,
        cuffPatternIdentity: snapshot.construction?.cuff?.pattern?.identity,
        cuffPatternLabel: snapshot.construction?.cuff?.pattern?.display_value,
        mainPatternIdentity: snapshot.construction?.mainPattern?.identity,
        mainPatternLabel: snapshot.construction?.mainPattern?.display_value,
        cuffGaugeFingerprint: snapshot.gaugeBindings?.cuff?.applicability?.evidenceFingerprint,
        mainGaugeFingerprint: snapshot.gaugeBindings?.main?.applicability?.evidenceFingerprint,
        toolIdentity: stage79State.source?.chain?.tool_identity,
      },
      policies: {
        instructionRenderingPolicy: "sleeve-physical-instructions:v1",
        actualResultSchema: RESULT_SCHEMA_ID,
        lengthMeasurementPath: targets.lengthMeasurementPath,
        cuffMeasurementLocation: targets.cuffTargetLocation,
        upperMeasurementLocation: targets.upperTargetLocation,
        completionBoundary: COMPLETION_BOUNDARY,
        tolerancePolicy: null,
      },
      componentSlots: clone(COMPONENT_SLOTS), fingerprint: "",
    };
    if (!Number.isSafeInteger(preparation.planned.cuffStitchCount) || !Number.isSafeInteger(preparation.planned.underarmFullTubeStitchCount) || !Number.isSafeInteger(preparation.planned.increaseEventCount) || preparation.planned.cuffStitchCount < 1 || preparation.planned.underarmFullTubeStitchCount < 1 || preparation.planned.increaseEventCount < 0 || preparation.planned.stopCondition?.holdOrRemoveUnderarmStitches !== false || preparation.planned.stopCondition?.physicalConfirmationRequiredLater !== true) fail("STAGE79_PLAN_INVALID", "The Stage 79 plan is not safe for physical execution.");
    preparation.fingerprint = fingerprint(resultSemantic(preparation));
    return deepFreeze(preparation);
  }

  function componentIdentity(projectId, calculationId, slot) { return `${projectId}:${calculationId}:sleeve:${requireSlot(slot)}`; }
  function newAttempt(projectId, calculationId, slot, componentEpoch, preparation, at, predecessor = null) {
    const identity = `${componentIdentity(projectId, calculationId, slot)}:attempt:${componentEpoch}:${preparation.fingerprint}`;
    return withAttemptFingerprint({
      attemptIdentity: identity, componentEpoch, predecessorAttemptIdentity: predecessor?.attemptIdentity || null,
      supersedesAttemptIdentity: predecessor?.completedResultSnapshot ? predecessor.attemptIdentity : null,
      preparationIdentity: preparation.identity, preparationFingerprint: preparation.fingerprint,
      lifecycle: "ready", revision: 0,
      executionProgress: { cuffCountConfirmation: null, shapingEventReceipts: [], targetReachedReceipt: null },
      resultDraft: null, completedResultSnapshot: null, operationReceipts: [],
      timestamps: { createdAt: at, startedAt: null, targetReachedAt: null, reviewOpenedAt: null, completedAt: null }, fingerprint: "",
    });
  }

  function receiptPayload(command, slot, attempt, payload) { return { command, componentSlot: slot, componentIdentity: attempt.attemptIdentity.split(":attempt:")[0], componentAttemptIdentity: attempt.attemptIdentity, componentEpoch: attempt.componentEpoch, preparationIdentity: attempt.preparationIdentity, preparationFingerprint: attempt.preparationFingerprint, payload: clone(payload) }; }
  function existingReceipt(state, operationId, command, slot, attempt, payload) {
    const expectedFingerprint = fingerprint(receiptPayload(command, slot, attempt, payload));
    for (const history of Object.values(state.components)) for (const item of history.attempts) for (const receipt of item.operationReceipts) {
      if (receipt.operationId !== operationId) continue;
      if (receipt.command !== command || receipt.payloadFingerprint !== expectedFingerprint) fail("OPERATION_ID_CONFLICT", "The operation id was already used with different semantics.");
      return state;
    }
    return null;
  }
  function applyComponent(stateInput, slotInput, command, payload, metadata, mutate) {
    const state = validateState(stateInput); const slot = requireSlot(slotInput); const history = state.components[slot]; const attempt = history.attempts.at(-1);
    const operationId = requireUuid(metadata.operationId); const at = requireTimestamp(metadata.at);
    const replay = existingReceipt(state, operationId, command, slot, attempt, payload); if (replay) return replay;
    if (metadata.expectedAggregateRevision !== undefined && metadata.expectedAggregateRevision !== state.aggregateRevision) fail("AGGREGATE_REVISION_CONFLICT", "Stage 80 changed concurrently.");
    if (metadata.expectedComponentRevision !== undefined && metadata.expectedComponentRevision !== attempt.revision) fail("COMPONENT_REVISION_CONFLICT", "This sleeve changed concurrently.");
    if (metadata.expectedComponentFingerprint !== undefined && metadata.expectedComponentFingerprint !== attempt.fingerprint) fail("COMPONENT_REVISION_CONFLICT", "This sleeve fingerprint is stale.");
    if (metadata.preparationFingerprint !== undefined && metadata.preparationFingerprint !== state.preparation.fingerprint) fail("PREPARATION_STALE", "The operation targets another shared preparation.");
    const next = clone(state); const nextAttempt = next.components[slot].attempts.at(-1); mutate(nextAttempt, next);
    next.aggregateRevision = state.aggregateRevision + 1; nextAttempt.revision = attempt.revision + 1;
    const payloadFingerprint = fingerprint(receiptPayload(command, slot, attempt, payload));
    nextAttempt.operationReceipts.push({ operationId, command, payloadFingerprint, resultingAggregateRevision: next.aggregateRevision, resultingComponentRevision: nextAttempt.revision, at });
    nextAttempt.fingerprint = fingerprint(attemptSemantic(nextAttempt)); next.timestamps.updatedAt = at;
    return withStateFingerprint(next);
  }

  function createAndStart(input = {}, metadata = {}) {
    const slot = requireSlot(input.componentSlot); const binding = sourceBinding(input.stage79Record, input.stage79State);
    const epoch = input.preparationEpoch || 1; if (!Number.isSafeInteger(epoch) || epoch < 1) fail("PREPARATION_EPOCH_INVALID", "Preparation epochs must be contiguous positive integers.");
    const at = requireTimestamp(metadata.at); requireUuid(metadata.operationId);
    const preparation = preparationFromStage79(input.projectId, input.calculationId, epoch, binding, input.stage79State, input.predecessorPreparationIdentity || null);
    const components = {};
    for (const componentSlot of COMPONENT_SLOTS) components[componentSlot] = { componentType: "sleeve", componentSlot, componentIdentity: componentIdentity(input.projectId, input.calculationId, componentSlot), handedness: null, attempts: [newAttempt(input.projectId, input.calculationId, componentSlot, 1, preparation, at)] };
    const base = withStateFingerprint({
      kind: KIND, contractSchemaId: CONTRACT_SCHEMA_ID, contractVersion: CONTRACT_VERSION,
      projectId: input.projectId, calculationId: input.calculationId,
      identity: `${input.projectId}:${input.calculationId}:sleeve-physical-execution:${epoch}:${preparation.fingerprint}`,
      preparationEpoch: epoch, predecessorPreparationIdentity: input.predecessorPreparationIdentity || null,
      aggregateRevision: 0, source: clone(binding), preparation: clone(preparation), components,
      timestamps: { createdAt: at, updatedAt: at }, fingerprint: "",
    });
    return startComponent(base, slot, metadata);
  }

  function startComponent(state, slot, metadata = {}) {
    return applyComponent(state, slot, "start_component", {}, metadata, (attempt) => {
      if (attempt.lifecycle !== "ready") fail("TRANSITION_INVALID", "Only a ready sleeve can be started.");
      attempt.lifecycle = "in_progress"; attempt.timestamps.startedAt = metadata.at;
    });
  }
  function confirmCuffCount(state, slot, input = {}, metadata = {}) {
    const count = positiveInteger(input.actualCuffStitchCount, "ACTUAL_CUFF_COUNT_INVALID");
    return applyComponent(state, slot, "confirm_cuff_count", { actualCuffStitchCount: count }, metadata, (attempt) => {
      if (attempt.lifecycle !== "in_progress") fail("TRANSITION_INVALID", "The cuff count can be confirmed only while knitting.");
      if (attempt.executionProgress.cuffCountConfirmation) fail("CUFF_COUNT_ALREADY_CONFIRMED", "Return to correction instead of overwriting the confirmed cuff count.");
      attempt.executionProgress.cuffCountConfirmation = { actualCuffStitchCount: count, explicit: true, operationId: metadata.operationId, confirmedAt: metadata.at };
    });
  }
  function recordShapingEvent(state, slot, input = {}, metadata = {}) {
    return applyComponent(state, slot, "record_shaping_event", { delta: 2 }, metadata, (attempt, aggregate) => {
      if (attempt.lifecycle !== "in_progress") fail("TRANSITION_INVALID", "A shaping event can be recorded only while knitting.");
      if (!attempt.executionProgress.cuffCountConfirmation) fail("CUFF_COUNT_REQUIRED", "Confirm the physical cuff count first.");
      if (attempt.executionProgress.shapingEventReceipts.length >= aggregate.preparation.planned.increaseEventCount) fail("SHAPING_CURSOR_INVALID", "The saved plan contains no further shaping event.");
      attempt.executionProgress.shapingEventReceipts.push({ sequence: attempt.executionProgress.shapingEventReceipts.length + 1, delta: 2, explicit: true, operationId: metadata.operationId, recordedAt: metadata.at });
    });
  }
  function pauseComponent(state, slot, metadata = {}) { return applyComponent(state, slot, "pause_component", {}, metadata, (attempt) => { if (attempt.lifecycle !== "in_progress") fail("TRANSITION_INVALID", "Only an in-progress sleeve can be paused."); attempt.lifecycle = "paused"; }); }
  function resumeComponent(state, slot, metadata = {}) { return applyComponent(state, slot, "resume_component", {}, metadata, (attempt) => { if (attempt.lifecycle !== "paused") fail("TRANSITION_INVALID", "Only a paused sleeve can be resumed."); attempt.lifecycle = "in_progress"; }); }
  function declareTargetReached(state, slot, metadata = {}) {
    return applyComponent(state, slot, "declare_target_reached", { explicit: true }, metadata, (attempt) => {
      if (attempt.lifecycle !== "in_progress") fail("TRANSITION_INVALID", "The target can be declared only while knitting.");
      if (!attempt.executionProgress.cuffCountConfirmation) fail("CUFF_COUNT_REQUIRED", "Confirm the physical cuff count first.");
      attempt.lifecycle = "target_reached"; attempt.executionProgress.targetReachedReceipt = { explicit: true, operationId: metadata.operationId, declaredAt: metadata.at }; attempt.timestamps.targetReachedAt = metadata.at;
    });
  }
  function openResultReview(state, slot, metadata = {}) {
    return applyComponent(state, slot, "open_result_review", {}, metadata, (attempt) => {
      if (attempt.lifecycle !== "target_reached") fail("TRANSITION_INVALID", "Declare the physical target reached before reviewing actuals.");
      attempt.lifecycle = "reviewing_result"; attempt.resultDraft = { actualCuffStitchCount: attempt.executionProgress.cuffCountConfirmation.actualCuffStitchCount, actualUnderarmFullTubeStitchCount: null, actualCuffToUnderarmLengthCm: null, actualCuffCircumferenceCm: null, actualUpperSleeveCircumferenceCm: null, actualIncreaseEventCount: null, completionBoundary: null, deviationNote: null, observedRoundCount: null }; attempt.timestamps.reviewOpenedAt = metadata.at;
    });
  }
  function normalizeDraft(input, existing) {
    const draft = { ...clone(existing) };
    const allowed = ["actualCuffStitchCount", "actualUnderarmFullTubeStitchCount", "actualCuffToUnderarmLengthCm", "actualCuffCircumferenceCm", "actualUpperSleeveCircumferenceCm", "actualIncreaseEventCount", "completionBoundary", "deviationNote", "observedRoundCount"];
    if (!record(input) || Object.keys(input).some((key) => !allowed.includes(key))) fail("RESULT_DRAFT_INVALID", "The result draft contains an unsupported field.");
    if (Object.prototype.hasOwnProperty.call(input, "actualCuffStitchCount")) draft.actualCuffStitchCount = positiveInteger(input.actualCuffStitchCount, "ACTUAL_CUFF_COUNT_INVALID");
    if (Object.prototype.hasOwnProperty.call(input, "actualUnderarmFullTubeStitchCount")) draft.actualUnderarmFullTubeStitchCount = positiveInteger(input.actualUnderarmFullTubeStitchCount, "ACTUAL_UNDERARM_COUNT_INVALID");
    for (const key of ["actualCuffToUnderarmLengthCm", "actualCuffCircumferenceCm", "actualUpperSleeveCircumferenceCm"]) if (Object.prototype.hasOwnProperty.call(input, key)) draft[key] = positiveDecimal(input[key]);
    if (Object.prototype.hasOwnProperty.call(input, "actualIncreaseEventCount")) draft.actualIncreaseEventCount = nonNegativeInteger(input.actualIncreaseEventCount, "ACTUAL_INCREASE_COUNT_INVALID");
    if (Object.prototype.hasOwnProperty.call(input, "completionBoundary")) { if (input.completionBoundary !== COMPLETION_BOUNDARY) fail("COMPLETION_BOUNDARY_INVALID", "The actual underarm count must be confirmed before allocation."); draft.completionBoundary = input.completionBoundary; }
    if (Object.prototype.hasOwnProperty.call(input, "deviationNote")) { const note = input.deviationNote === null ? null : String(input.deviationNote).trim(); if (note && note.length > 2000) fail("DEVIATION_NOTE_INVALID", "The deviation note is too long."); draft.deviationNote = note || null; }
    if (Object.prototype.hasOwnProperty.call(input, "observedRoundCount")) draft.observedRoundCount = input.observedRoundCount === null ? null : positiveInteger(input.observedRoundCount, "OBSERVED_ROUND_COUNT_INVALID");
    return draft;
  }
  function editResultDraft(state, slot, input = {}, metadata = {}) {
    return applyComponent(state, slot, "edit_result_draft", input, metadata, (attempt) => {
      if (attempt.lifecycle !== "reviewing_result" || !attempt.resultDraft) fail("TRANSITION_INVALID", "Open result review before entering actual measurements.");
      const next = normalizeDraft(input, attempt.resultDraft);
      if (next.actualCuffStitchCount !== attempt.executionProgress.cuffCountConfirmation.actualCuffStitchCount) fail("CUFF_COUNT_CONFIRMATION_MISMATCH", "The result cannot overwrite the explicitly counted cuff stitches.");
      attempt.resultDraft = next;
    });
  }
  function returnToWork(state, slot, metadata = {}) {
    return applyComponent(state, slot, "return_to_work", {}, metadata, (attempt) => {
      if (!["target_reached", "reviewing_result"].includes(attempt.lifecycle)) fail("TRANSITION_INVALID", "Only target review can return to physical work.");
      attempt.lifecycle = "in_progress"; attempt.resultDraft = null; attempt.executionProgress.targetReachedReceipt = null; attempt.timestamps.targetReachedAt = null; attempt.timestamps.reviewOpenedAt = null;
    });
  }
  function draftComplete(draft) { return Boolean(draft) && Number.isSafeInteger(draft.actualCuffStitchCount) && Number.isSafeInteger(draft.actualUnderarmFullTubeStitchCount) && [draft.actualCuffToUnderarmLengthCm, draft.actualCuffCircumferenceCm, draft.actualUpperSleeveCircumferenceCm].every((value) => typeof value === "string") && Number.isSafeInteger(draft.actualIncreaseEventCount) && draft.completionBoundary === COMPLETION_BOUNDARY; }
  function comparison(preparation, draft) {
    const planned = preparation.planned;
    const pairs = {
      cuffStitchCount: [planned.cuffStitchCount, draft.actualCuffStitchCount], underarmFullTubeStitchCount: [planned.underarmFullTubeStitchCount, draft.actualUnderarmFullTubeStitchCount],
      cuffToUnderarmLengthCm: [planned.cuffToUnderarmLengthCm, draft.actualCuffToUnderarmLengthCm], cuffCircumferenceCm: [planned.cuffTargetCircumferenceCm, draft.actualCuffCircumferenceCm],
      upperSleeveCircumferenceCm: [planned.upperSleeveTargetCircumferenceCm, draft.actualUpperSleeveCircumferenceCm], increaseEventCount: [planned.increaseEventCount, draft.actualIncreaseEventCount],
    };
    return Object.fromEntries(Object.entries(pairs).map(([key, values]) => [key, { planned: values[0], actual: values[1], differs: Number(values[0]) !== Number(values[1]) }]));
  }
  function completeComponent(state, slot, input = {}, metadata = {}) {
    return applyComponent(state, slot, "complete_component", { physicalCompletionConfirmation: input.physicalCompletionConfirmation === true }, metadata, (attempt, aggregate) => {
      if (attempt.lifecycle !== "reviewing_result" || !draftComplete(attempt.resultDraft)) fail("ACTUAL_RESULT_INCOMPLETE", "All required physical counts and measurements must be explicitly entered.");
      if (input.physicalCompletionConfirmation !== true) fail("PHYSICAL_COMPLETION_CONFIRMATION_REQUIRED", "Explicit physical completion confirmation is required.");
      const comparisons = comparison(aggregate.preparation, attempt.resultDraft); if (Object.values(comparisons).some((item) => item.differs) && !attempt.resultDraft.deviationNote) fail("DEVIATION_NOTE_REQUIRED", "Describe the observed difference before accepting this physical result.");
      const draft = attempt.resultDraft; const snapshot = {
        schemaId: RESULT_SCHEMA_ID, contractVersion: CONTRACT_VERSION,
        identity: `${attempt.attemptIdentity}:result:${metadata.operationId}`, componentIdentity: aggregate.components[slot].componentIdentity, componentSlot: slot,
        attemptIdentity: attempt.attemptIdentity, componentEpoch: attempt.componentEpoch,
        preparationIdentity: aggregate.preparation.identity, preparationFingerprint: aggregate.preparation.fingerprint,
        stage79CompletedSnapshotFingerprint: aggregate.source.stage79CompletedSnapshotFingerprint,
        plannedComparisonSnapshot: comparisons,
        actualCuffStitchCount: draft.actualCuffStitchCount, actualUnderarmFullTubeStitchCount: draft.actualUnderarmFullTubeStitchCount,
        actualCuffToUnderarmLengthCm: draft.actualCuffToUnderarmLengthCm, actualCuffCircumferenceCm: draft.actualCuffCircumferenceCm,
        actualUpperSleeveCircumferenceCm: draft.actualUpperSleeveCircumferenceCm, actualIncreaseEventCount: draft.actualIncreaseEventCount,
        completionBoundary: COMPLETION_BOUNDARY, underarmStitchesHeldOrRemoved: false,
        targetReachedConfirmation: clone(attempt.executionProgress.targetReachedReceipt),
        physicalCompletionConfirmation: { explicit: true, operationId: metadata.operationId, confirmedAt: metadata.at },
        deviationNote: draft.deviationNote, observedRoundCount: draft.observedRoundCount,
        timestamps: { startedAt: attempt.timestamps.startedAt, targetReachedAt: attempt.timestamps.targetReachedAt, measuredAt: attempt.timestamps.reviewOpenedAt, completedAt: metadata.at },
        sourceFingerprint: fingerprint({ preparation: aggregate.preparation.fingerprint, stage79: aggregate.source.stage79CompletedSnapshotFingerprint }), fingerprint: "",
      };
      snapshot.fingerprint = fingerprint(resultSemantic(snapshot)); attempt.completedResultSnapshot = snapshot; attempt.lifecycle = "completed"; attempt.timestamps.completedAt = metadata.at;
    });
  }
  function startComponentRework(stateInput, slotInput, metadata = {}) {
    const state = validateState(stateInput); const slot = requireSlot(slotInput); const current = state.components[slot].attempts.at(-1);
    const operationId = requireUuid(metadata.operationId); requireTimestamp(metadata.at);
    if (current.lifecycle !== "completed") {
      const replayPayload = { supersedesAttemptIdentity: current.supersedesAttemptIdentity };
      const replay = existingReceipt(state, operationId, "start_component_rework", slot, current, replayPayload); if (replay) return replay;
      fail("REWORK_NOT_AVAILABLE", "Only a completed sleeve can begin a new physical attempt.");
    }
    const synthetic = newAttempt(state.projectId, state.calculationId, slot, current.componentEpoch + 1, state.preparation, metadata.at, current);
    const payload = { supersedesAttemptIdentity: current.attemptIdentity };
    const replay = existingReceipt(state, operationId, "start_component_rework", slot, synthetic, payload); if (replay) return replay;
    if (metadata.expectedAggregateRevision !== undefined && metadata.expectedAggregateRevision !== state.aggregateRevision) fail("AGGREGATE_REVISION_CONFLICT", "Stage 80 changed concurrently.");
    if (metadata.expectedComponentRevision !== undefined && metadata.expectedComponentRevision !== current.revision) fail("COMPONENT_REVISION_CONFLICT", "This sleeve changed concurrently.");
    const next = clone(state); const attempt = newAttempt(state.projectId, state.calculationId, slot, current.componentEpoch + 1, state.preparation, metadata.at, current);
    attempt.lifecycle = "in_progress"; attempt.revision = 1; attempt.timestamps.startedAt = metadata.at; next.aggregateRevision += 1;
    attempt.operationReceipts.push({ operationId, command: "start_component_rework", payloadFingerprint: fingerprint(receiptPayload("start_component_rework", slot, attempt, payload)), resultingAggregateRevision: next.aggregateRevision, resultingComponentRevision: 1, at: metadata.at });
    attempt.fingerprint = fingerprint(attemptSemantic(attempt)); next.components[slot].attempts.push(attempt); next.timestamps.updatedAt = metadata.at;
    return withStateFingerprint(next);
  }

  function validateReceipt(receipt) { exactKeys(receipt, ["operationId", "command", "payloadFingerprint", "resultingAggregateRevision", "resultingComponentRevision", "at"]); requireUuid(receipt.operationId); requireFingerprint(receipt.payloadFingerprint); requireTimestamp(receipt.at); if (!Number.isSafeInteger(receipt.resultingAggregateRevision) || receipt.resultingAggregateRevision < 1 || !Number.isSafeInteger(receipt.resultingComponentRevision) || receipt.resultingComponentRevision < 1) fail("RECEIPT_INVALID", "Operation receipt revisions are invalid."); }
  function validateResult(result, aggregate, slot, attempt) {
    exactKeys(result, ["schemaId", "contractVersion", "identity", "componentIdentity", "componentSlot", "attemptIdentity", "componentEpoch", "preparationIdentity", "preparationFingerprint", "stage79CompletedSnapshotFingerprint", "plannedComparisonSnapshot", "actualCuffStitchCount", "actualUnderarmFullTubeStitchCount", "actualCuffToUnderarmLengthCm", "actualCuffCircumferenceCm", "actualUpperSleeveCircumferenceCm", "actualIncreaseEventCount", "completionBoundary", "underarmStitchesHeldOrRemoved", "targetReachedConfirmation", "physicalCompletionConfirmation", "deviationNote", "observedRoundCount", "timestamps", "sourceFingerprint", "fingerprint"], "COMPLETED_RESULT_INVALID");
    if (!record(result) || result.schemaId !== RESULT_SCHEMA_ID || result.contractVersion !== CONTRACT_VERSION || result.componentSlot !== slot || result.componentIdentity !== aggregate.components[slot].componentIdentity || result.attemptIdentity !== attempt.attemptIdentity || result.componentEpoch !== attempt.componentEpoch || result.preparationIdentity !== aggregate.preparation.identity || result.preparationFingerprint !== aggregate.preparation.fingerprint || result.stage79CompletedSnapshotFingerprint !== aggregate.source.stage79CompletedSnapshotFingerprint || result.completionBoundary !== COMPLETION_BOUNDARY || result.underarmStitchesHeldOrRemoved !== false || result.physicalCompletionConfirmation?.explicit !== true || result.targetReachedConfirmation?.explicit !== true || result.fingerprint !== fingerprint(resultSemantic(result))) fail("COMPLETED_RESULT_INVALID", "The immutable physical result is invalid.");
    positiveInteger(result.actualCuffStitchCount); positiveInteger(result.actualUnderarmFullTubeStitchCount); positiveDecimal(result.actualCuffToUnderarmLengthCm); positiveDecimal(result.actualCuffCircumferenceCm); positiveDecimal(result.actualUpperSleeveCircumferenceCm); nonNegativeInteger(result.actualIncreaseEventCount); requireFingerprint(result.sourceFingerprint);
  }
  function validateState(input) {
    const value = clone(input); exactKeys(value, ["kind", "contractSchemaId", "contractVersion", "projectId", "calculationId", "identity", "preparationEpoch", "predecessorPreparationIdentity", "aggregateRevision", "source", "preparation", "components", "timestamps", "fingerprint"]);
    if (value.kind !== KIND || value.contractSchemaId !== CONTRACT_SCHEMA_ID || value.contractVersion !== CONTRACT_VERSION) fail("STATE_INVALID", "Stage 80 contract identity is invalid.");
    requireUuid(value.projectId, "PROJECT_ID_INVALID"); requireUuid(value.calculationId, "CALCULATION_ID_INVALID"); if (!value.identity || !Number.isSafeInteger(value.preparationEpoch) || value.preparationEpoch < 1 || !Number.isSafeInteger(value.aggregateRevision) || value.aggregateRevision < 0) fail("STATE_INVALID", "Stage 80 identity or revision is invalid.");
    exactKeys(value.source, ["stage79ProgressId", "stage79RepositoryRevision", "stage79StateIdentity", "stage79Epoch", "stage79StateRevision", "stage79StateFingerprint", "stage79CompletedSnapshotFingerprint", "authoritativeChainFingerprint", "fingerprint"], "SOURCE_BINDING_INVALID");
    if (value.source.fingerprint !== fingerprint(Object.fromEntries(Object.entries(value.source).filter(([key]) => key !== "fingerprint")))) fail("SOURCE_BINDING_INVALID", "The Stage 79 source binding is invalid.");
    exactKeys(value.preparation, ["schemaId", "contractVersion", "identity", "preparationEpoch", "predecessorPreparationIdentity", "sourceFingerprint", "planned", "construction", "policies", "componentSlots", "fingerprint"], "PREPARATION_INVALID");
    exactKeys(value.preparation.planned, ["cuffTargetCircumferenceCm", "upperSleeveTargetCircumferenceCm", "cuffToUnderarmLengthCm", "cuffStitchCount", "underarmFullTubeStitchCount", "increaseEventCount", "increaseDeltaPerEvent", "schedule", "stopCondition"], "PREPARATION_INVALID");
    exactKeys(value.preparation.construction, ["direction", "componentDirection", "topologyIdentity", "workingMethod", "cuffPatternIdentity", "cuffPatternLabel", "mainPatternIdentity", "mainPatternLabel", "cuffGaugeFingerprint", "mainGaugeFingerprint", "toolIdentity"], "PREPARATION_INVALID");
    exactKeys(value.preparation.policies, ["instructionRenderingPolicy", "actualResultSchema", "lengthMeasurementPath", "cuffMeasurementLocation", "upperMeasurementLocation", "completionBoundary", "tolerancePolicy"], "PREPARATION_INVALID");
    if (value.preparation.fingerprint !== fingerprint(resultSemantic(value.preparation)) || value.preparation.sourceFingerprint !== value.source.fingerprint || value.preparation.preparationEpoch !== value.preparationEpoch || value.preparation.policies.tolerancePolicy !== null || canonicalize(value.preparation.componentSlots) !== canonicalize(COMPONENT_SLOTS)) fail("PREPARATION_INVALID", "The shared execution preparation is invalid.");
    if (!record(value.components) || canonicalize(Object.keys(value.components).sort()) !== canonicalize([...COMPONENT_SLOTS].sort())) fail("COMPONENT_SET_INVALID", "Stage 80 requires exactly sleeve_1 and sleeve_2.");
    const operationIds = new Set();
    for (const slot of COMPONENT_SLOTS) {
      const history = value.components[slot]; exactKeys(history, ["componentType", "componentSlot", "componentIdentity", "handedness", "attempts"], "COMPONENT_HISTORY_INVALID"); if (history.componentType !== "sleeve" || history.componentSlot !== slot || history.componentIdentity !== componentIdentity(value.projectId, value.calculationId, slot) || history.handedness !== null || !Array.isArray(history.attempts) || history.attempts.length < 1) fail("COMPONENT_HISTORY_INVALID", "A sleeve history is invalid.");
      for (let index = 0; index < history.attempts.length; index += 1) {
        const attempt = history.attempts[index]; exactKeys(attempt, ["attemptIdentity", "componentEpoch", "predecessorAttemptIdentity", "supersedesAttemptIdentity", "preparationIdentity", "preparationFingerprint", "lifecycle", "revision", "executionProgress", "resultDraft", "completedResultSnapshot", "operationReceipts", "timestamps", "fingerprint"], "COMPONENT_HISTORY_INVALID"); if (attempt.componentEpoch !== index + 1 || attempt.preparationIdentity !== value.preparation.identity || attempt.preparationFingerprint !== value.preparation.fingerprint || !LIFECYCLES.includes(attempt.lifecycle) || !Number.isSafeInteger(attempt.revision) || attempt.revision < 0 || attempt.fingerprint !== fingerprint(attemptSemantic(attempt))) fail("COMPONENT_HISTORY_INVALID", "A sleeve attempt is invalid.");
        if (index === 0 && (attempt.predecessorAttemptIdentity !== null || attempt.supersedesAttemptIdentity !== null) || index > 0 && (attempt.predecessorAttemptIdentity !== history.attempts[index - 1].attemptIdentity || attempt.supersedesAttemptIdentity !== history.attempts[index - 1].attemptIdentity || history.attempts[index - 1].lifecycle !== "completed")) fail("COMPONENT_HISTORY_INVALID", "Sleeve attempt lineage is invalid.");
        exactKeys(attempt.executionProgress, ["cuffCountConfirmation", "shapingEventReceipts", "targetReachedReceipt"], "COMPONENT_HISTORY_INVALID"); exactKeys(attempt.timestamps, ["createdAt", "startedAt", "targetReachedAt", "reviewOpenedAt", "completedAt"], "COMPONENT_HISTORY_INVALID");
        if (!Array.isArray(attempt.executionProgress.shapingEventReceipts) || !Array.isArray(attempt.operationReceipts)) fail("COMPONENT_HISTORY_INVALID", "Sleeve execution evidence is invalid.");
        if (attempt.resultDraft !== null) exactKeys(attempt.resultDraft, ["actualCuffStitchCount", "actualUnderarmFullTubeStitchCount", "actualCuffToUnderarmLengthCm", "actualCuffCircumferenceCm", "actualUpperSleeveCircumferenceCm", "actualIncreaseEventCount", "completionBoundary", "deviationNote", "observedRoundCount"], "RESULT_DRAFT_INVALID");
        for (const receipt of attempt.operationReceipts) { validateReceipt(receipt); if (operationIds.has(receipt.operationId)) fail("OPERATION_ID_CONFLICT", "Operation ids must be unique across both sleeves."); operationIds.add(receipt.operationId); }
        if (attempt.lifecycle === "completed") validateResult(attempt.completedResultSnapshot, value, slot, attempt); else if (attempt.completedResultSnapshot !== null) fail("COMPLETED_RESULT_INVALID", "A non-completed attempt cannot contain a completed result.");
      }
    }
    exactKeys(value.timestamps, ["createdAt", "updatedAt"]); requireTimestamp(value.timestamps.createdAt); requireTimestamp(value.timestamps.updatedAt); if (value.fingerprint !== fingerprint(stateSemantic(value))) fail("FINGERPRINT_MISMATCH", "Stage 80 fingerprint does not match its content.");
    return deepFreeze(value);
  }

  function currentAttempt(state, slot) { return validateState(state).components[requireSlot(slot)].attempts.at(-1); }
  function resultView(result) { return result ? { actualCuffStitchCount: result.actualCuffStitchCount, actualUnderarmFullTubeStitchCount: result.actualUnderarmFullTubeStitchCount, actualCuffToUnderarmLengthCm: result.actualCuffToUnderarmLengthCm, actualCuffCircumferenceCm: result.actualCuffCircumferenceCm, actualUpperSleeveCircumferenceCm: result.actualUpperSleeveCircumferenceCm, actualIncreaseEventCount: result.actualIncreaseEventCount, completionBoundary: result.completionBoundary, underarmStitchesHeldOrRemoved: false, deviationNote: result.deviationNote, observedRoundCount: result.observedRoundCount, plannedComparison: clone(result.plannedComparisonSnapshot) } : null; }
  function allowedActions(attempt) {
    if (attempt.lifecycle === "ready") return ["start_component"];
    if (attempt.lifecycle === "in_progress") return [...(!attempt.executionProgress.cuffCountConfirmation ? ["confirm_cuff_count"] : ["record_shaping_event", "declare_target_reached"]), "pause_component"];
    if (attempt.lifecycle === "paused") return ["resume_component"];
    if (attempt.lifecycle === "target_reached") return ["open_result_review", "return_to_work"];
    if (attempt.lifecycle === "reviewing_result") return ["edit_result_draft", ...(draftComplete(attempt.resultDraft) ? ["complete_component"] : []), "return_to_work"];
    return ["start_component_rework"];
  }
  function projectView(stateInput) {
    try {
      const state = validateState(stateInput); const components = {};
      for (const slot of COMPONENT_SLOTS) { const history = state.components[slot]; const attempt = history.attempts.at(-1); components[slot] = { componentSlot: slot, label: slot === "sleeve_1" ? "Рукав 1" : "Рукав 2", lifecycle: attempt.lifecycle, attemptNumber: attempt.componentEpoch, completedAttemptCount: history.attempts.filter((item) => item.lifecycle === "completed").length, actions: allowedActions(attempt), progress: { cuffCountConfirmed: Boolean(attempt.executionProgress.cuffCountConfirmation), actualCuffStitchCount: attempt.executionProgress.cuffCountConfirmation?.actualCuffStitchCount ?? null, shapingEventsRecorded: attempt.executionProgress.shapingEventReceipts.length, plannedIncreaseEventCount: state.preparation.planned.increaseEventCount, targetReachedConfirmed: Boolean(attempt.executionProgress.targetReachedReceipt) }, resultDraft: clone(attempt.resultDraft), completedResult: resultView(attempt.completedResultSnapshot) }; }
      const bothCompleted = COMPONENT_SLOTS.every((slot) => components[slot].lifecycle === "completed");
      return deepFreeze({ available: true, blocked: false, lifecycle: bothCompleted ? "awaiting_pair_validation" : "physical_execution", preparation: { planned: clone(state.preparation.planned), context: { direction: state.preparation.construction.direction, workingMethod: state.preparation.construction.workingMethod, cuffPattern: state.preparation.construction.cuffPatternLabel, mainPattern: state.preparation.construction.mainPatternLabel, lengthMeasurementPath: state.preparation.policies.lengthMeasurementPath, cuffMeasurementLocation: state.preparation.policies.cuffMeasurementLocation, upperMeasurementLocation: state.preparation.policies.upperMeasurementLocation, completionBoundary: COMPLETION_BOUNDARY }, tolerancePolicy: null }, components, pairValidation: { status: bothCompleted ? "awaiting_pair_validation" : "not_ready", performed: false }, joinPreparation: { status: "blocked", available: false } });
    } catch (error) { return deepFreeze({ available: false, blocked: true, lifecycle: "blocked", diagnostic: { code: error?.code || "STATE_INVALID", message: error?.userMessage || error?.message || "Stage 80 is unavailable." } }); }
  }

  const api = Object.freeze({ DOMAIN_IDENTITY, KIND, PROGRESS_KIND, CONTRACT_SCHEMA_ID, CONTRACT_VERSION, RESULT_SCHEMA_ID, COMPLETION_BOUNDARY, COMPONENT_SLOTS, LIFECYCLES, SleevePhysicalExecutionError, canonicalize, fingerprint, sourceBinding, preparationFromStage79, validateState, currentAttempt, createAndStart, startComponent, confirmCuffCount, recordShapingEvent, pauseComponent, resumeComponent, declareTargetReached, openResultReview, editResultDraft, returnToWork, completeComponent, startComponentRework, projectView });
  globalObject.YarnAIProjectSleevePhysicalExecution = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
