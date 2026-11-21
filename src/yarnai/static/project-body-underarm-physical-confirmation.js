"use strict";

(function initializeProjectBodyUnderarmPhysicalConfirmation(globalObject) {
  const DOMAIN_IDENTITY = "PROJECT_BODY_UNDERARM_PHYSICAL_CONFIRMATION";
  const KIND = DOMAIN_IDENTITY;
  const PROGRESS_KIND = KIND;
  const CONTRACT_SCHEMA_ID = "BODY_UNDERARM_PHYSICAL_CONFIRMATION_CONTRACT_V1";
  const CONTRACT_VERSION = 1;
  const RESULT_SCHEMA_ID = "BODY_UNDERARM_PHYSICAL_RESULT_V1";
  const COMPLETION_BOUNDARY = "full_body_tube_at_underarm_before_allocation";
  const OUTPUT_BOUNDARY = "body_underarm_physical_confirmation_completed";
  const HEIGHT_MEASUREMENT_PATH = "lower_body_edge_to_underarm_boundary";
  const MEASUREMENT_POLICY = "body-underarm-measurement-path:v1";
  const COMPARISON_POLICY = "report-planned-versus-actual-without-replacement:v1";
  const LIFECYCLES = Object.freeze(["in_progress", "paused", "reviewing_result", "completed"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const DECIMAL_INPUT = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

  class BodyUnderarmPhysicalConfirmationError extends Error {
    constructor(code, message, details = {}) {
      super(message); this.name = "BodyUnderarmPhysicalConfirmationError"; this.code = code;
      this.userMessage = message; this.details = clone(details);
    }
  }
  function fail(code, message, details) { throw new BodyUnderarmPhysicalConfirmationError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function exactKeys(value, keys, code = "STATE_INVALID") {
    if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || Object.keys(value).some((key) => !keys.includes(key))) fail(code, "Stage 82 содержит отсутствующие или неразрешённые поля.", { expectedKeys: keys, actualKeys: record(value) ? Object.keys(value) : [] });
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("VALUE_INVALID", "Требуется конечное число."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("VALUE_INVALID", "Значение не совместимо с JSON.");
  }
  function utf8Bytes(value) { if (typeof TextEncoder === "function") return new TextEncoder().encode(value); return unescape(encodeURIComponent(value)).split("").map((item) => item.charCodeAt(0)); }
  function fingerprint(value) { let hash = 0x811c9dc5; for (const byte of utf8Bytes(canonicalize(value))) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function requireUuid(value, code = "OPERATION_ID_INVALID") { if (!UUID_V7.test(value || "")) fail(code, "Требуется UUIDv7."); return value; }
  function requireTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "Требуется ISO UTC timestamp с миллисекундами."); return value; }
  function requireFingerprint(value, code = "FINGERPRINT_INVALID") { if (!FINGERPRINT.test(value || "")) fail(code, "Требуется canonical fingerprint."); return value; }
  function positiveInteger(value, code = "ACTUAL_BODY_STITCH_COUNT_INVALID") { if (!Number.isSafeInteger(value) || value < 1 || value > 1000000) fail(code, "Введите фактически посчитанное положительное целое количество петель."); return value; }
  function canonicalDecimal(value, code = "ACTUAL_BODY_HEIGHT_INVALID") {
    const text = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
    if (!DECIMAL_INPUT.test(text) || Number(text) <= 0 || Number(text) > 10000) fail(code, "Введите физически измеренную высоту больше нуля.");
    const normalized = String(Number(Number(text).toFixed(12)));
    if (!DECIMAL_INPUT.test(normalized) || Number(normalized) <= 0) fail(code, "Введите физически измеренную высоту больше нуля.");
    return normalized;
  }
  function semantic(value) { const next = clone(value); delete next.fingerprint; return next; }
  function withFingerprint(value) { const next = clone(value); delete next.fingerprint; next.fingerprint = fingerprint(next); return next; }

  function validateSource(sourceInput) {
    const source = clone(sourceInput);
    exactKeys(source, ["projectId", "calculationId", "body", "entryGate", "fingerprint"], "SOURCE_BINDING_INVALID");
    requireUuid(source.projectId, "PROJECT_ID_INVALID"); requireUuid(source.calculationId, "CALCULATION_ID_INVALID");
    exactKeys(source.body, ["bindings", "bodyExecutionState", "plannedBodyFullTubeStitchCount", "foundationHeightCm", "primaryFabricHeightCm", "orientationUnderarmHeightCm", "orientationInformationalOnly", "fingerprint"], "BODY_SOURCE_INVALID");
    if (!Array.isArray(source.body.bindings) || source.body.bindings.length < 4) fail("BODY_SOURCE_INVALID", "Authoritative body bindings отсутствуют.");
    for (const binding of source.body.bindings) {
      exactKeys(binding, ["kind", "progressId", "repositoryRevision", "stateIdentity", "stateFingerprint"], "BODY_SOURCE_INVALID");
      if (typeof binding.kind !== "string" || !binding.kind || typeof binding.progressId !== "string" || !binding.progressId || !Number.isSafeInteger(binding.repositoryRevision) || binding.repositoryRevision < 1 || typeof binding.stateIdentity !== "string" || !binding.stateIdentity) fail("BODY_SOURCE_INVALID", "Body source binding повреждён.");
      requireFingerprint(binding.stateFingerprint, "BODY_SOURCE_INVALID");
    }
    if (!new Set(source.body.bindings.map((item) => item.kind)).has("PRIMARY_FABRIC_EXECUTION") || !new Set(source.body.bindings.map((item) => item.kind)).has("PRIMARY_FABRIC_MEASUREMENT")) fail("BODY_SOURCE_INVALID", "Body execution/measurement bindings отсутствуют.");
    if (!["ready", "active", "paused"].includes(source.body.bodyExecutionState)) fail("BODY_SOURCE_INVALID", "Состояние физического выполнения корпуса недоступно.");
    positiveInteger(source.body.plannedBodyFullTubeStitchCount, "PLANNED_BODY_COUNT_INVALID");
    [source.body.foundationHeightCm, source.body.primaryFabricHeightCm, source.body.orientationUnderarmHeightCm].forEach((item) => canonicalDecimal(item, "BODY_CONTEXT_INVALID"));
    if (source.body.orientationInformationalOnly !== true) fail("BODY_SOURCE_INVALID", "Ориентир линии подреза не должен становиться физической инструкцией.");
    requireFingerprint(source.body.fingerprint, "BODY_SOURCE_INVALID");
    const bodyComparable = clone(source.body); delete bodyComparable.fingerprint; if (source.body.fingerprint !== fingerprint(bodyComparable)) fail("BODY_SOURCE_INVALID", "Body source fingerprint повреждён.");
    exactKeys(source.entryGate, ["stage81ProgressId", "repositoryRevision", "stateIdentity", "validationEpoch", "stateFingerprint", "decisionFingerprint", "sourceFingerprint", "outcome", "sleeveActualFullTubeStitchCounts", "fingerprint"], "STAGE81_ENTRY_GATE_INVALID");
    if (typeof source.entryGate.stage81ProgressId !== "string" || !source.entryGate.stage81ProgressId || !Number.isSafeInteger(source.entryGate.repositoryRevision) || source.entryGate.repositoryRevision < 1 || typeof source.entryGate.stateIdentity !== "string" || !source.entryGate.stateIdentity || !Number.isSafeInteger(source.entryGate.validationEpoch) || source.entryGate.validationEpoch < 1 || !["matched", "accepted_with_deviation"].includes(source.entryGate.outcome)) fail("STAGE81_ENTRY_GATE_INVALID", "Требуется текущая принятая Stage 81 validation.");
    [source.entryGate.stateFingerprint, source.entryGate.decisionFingerprint, source.entryGate.sourceFingerprint].forEach((item) => requireFingerprint(item, "STAGE81_ENTRY_GATE_INVALID"));
    exactKeys(source.entryGate.sleeveActualFullTubeStitchCounts, ["sleeve_1", "sleeve_2"], "STAGE81_ENTRY_GATE_INVALID"); positiveInteger(source.entryGate.sleeveActualFullTubeStitchCounts.sleeve_1); positiveInteger(source.entryGate.sleeveActualFullTubeStitchCounts.sleeve_2);
    const entryComparable = clone(source.entryGate); delete entryComparable.fingerprint; if (source.entryGate.fingerprint !== fingerprint(entryComparable)) fail("STAGE81_ENTRY_GATE_INVALID", "Stage 81 entry fingerprint повреждён.");
    const comparable = clone(source); delete comparable.fingerprint; if (source.fingerprint !== fingerprint(comparable)) fail("SOURCE_BINDING_INVALID", "Aggregate source fingerprint повреждён.");
    return deepFreeze(source);
  }

  function normalizeDraft(input = {}, measuredAt) {
    const actualBodyFullTubeStitchCount = positiveInteger(input.actualBodyFullTubeStitchCount);
    const actualBodyHeightAtUnderarmCm = canonicalDecimal(input.actualBodyHeightAtUnderarmCm);
    if (input.heightMeasurementPath !== undefined && input.heightMeasurementPath !== HEIGHT_MEASUREMENT_PATH) fail("HEIGHT_MEASUREMENT_PATH_INVALID", "Используйте показанный путь измерения от нижнего края корпуса до линии подреза.");
    if (input.physicalBoundaryExplicit !== true) fail("PHYSICAL_BOUNDARY_CONFIRMATION_REQUIRED", "Подтвердите, что корпус физически довязан до реальной линии подрезов.");
    if (input.underarmStitchesHeldOrRemoved !== false) fail("PREALLOCATION_BOUNDARY_REQUIRED", "Stage 82 фиксирует корпус до снятия петель подреза и до соединения деталей.");
    const deviationNote = input.deviationNote === null || input.deviationNote === undefined ? null : String(input.deviationNote).trim();
    if (deviationNote !== null && (!deviationNote || deviationNote.length > 2000)) fail("DEVIATION_NOTE_INVALID", "Комментарий должен содержать от 1 до 2000 символов.");
    return { actualBodyFullTubeStitchCount, actualBodyHeightAtUnderarmCm, heightMeasurementPath: HEIGHT_MEASUREMENT_PATH, physicalBoundaryExplicit: true, underarmStitchesHeldOrRemoved: false, deviationNote, measuredAt: requireTimestamp(measuredAt) };
  }
  function comparisons(source, draft) {
    return {
      bodyFullTubeStitchCount: { planned: source.body.plannedBodyFullTubeStitchCount, actual: draft.actualBodyFullTubeStitchCount, differs: source.body.plannedBodyFullTubeStitchCount !== draft.actualBodyFullTubeStitchCount },
      orientationUnderarmHeightCm: { planned: source.body.orientationUnderarmHeightCm, actual: draft.actualBodyHeightAtUnderarmCm, differs: canonicalDecimal(source.body.orientationUnderarmHeightCm) !== draft.actualBodyHeightAtUnderarmCm, informationalOnly: true },
    };
  }
  function receiptPayload(command, stateLike, payload) { return { command, attemptIdentity: stateLike.identity, epoch: stateLike.epoch, sourceFingerprint: stateLike.source.fingerprint, payload: clone(payload) }; }
  function priorReceipt(state, operationId, command, payload) {
    const expected = fingerprint(receiptPayload(command, state, payload)); const prior = state.operationReceipts.find((item) => item.operationId === operationId);
    if (!prior) return null; if (prior.command !== command || prior.payloadFingerprint !== expected) fail("OPERATION_ID_CONFLICT", "Operation ID уже использован для другого действия."); return state;
  }
  function appendReceipt(state, command, payload, metadata) {
    state.operationReceipts.push({ operationId: metadata.operationId, command, payloadFingerprint: fingerprint(receiptPayload(command, state, payload)), resultingRevision: state.revision, at: metadata.at });
  }
  function assertFence(state, metadata) {
    if (metadata.expectedRevision !== undefined && metadata.expectedRevision !== state.revision || metadata.expectedFingerprint !== undefined && metadata.expectedFingerprint !== state.fingerprint || metadata.expectedSourceFingerprint !== undefined && metadata.expectedSourceFingerprint !== state.source.fingerprint || metadata.expectedBodySourceFingerprint !== undefined && metadata.expectedBodySourceFingerprint !== state.source.body.fingerprint || metadata.expectedEntryGateFingerprint !== undefined && metadata.expectedEntryGateFingerprint !== state.source.entryGate.fingerprint) fail("REVISION_CONFLICT", "Stage 82 или его authoritative source изменились. Обновите страницу.");
  }
  function startAttempt(input = {}, metadata = {}) {
    requireUuid(input.projectId, "PROJECT_ID_INVALID"); requireUuid(input.calculationId, "CALCULATION_ID_INVALID"); requireUuid(metadata.operationId); requireTimestamp(metadata.at);
    const source = validateSource(input.source); if (source.projectId !== input.projectId || source.calculationId !== input.calculationId) fail("SOURCE_BINDING_INVALID", "Source относится к другому проекту или расчёту.");
    if (!Number.isSafeInteger(input.epoch) || input.epoch < 1) fail("EPOCH_INVALID", "Stage 82 epochs должны быть положительными и непрерывными.");
    const predecessorIdentity = input.predecessorIdentity || null; if (input.epoch === 1 ? predecessorIdentity !== null : typeof predecessorIdentity !== "string" || !predecessorIdentity) fail("HISTORY_CONFLICT", "Stage 82 predecessor lineage повреждена.");
    const supersedesResultIdentity = input.supersedesResultIdentity || null; if (input.epoch > 1 && input.rework === true && (typeof supersedesResultIdentity !== "string" || !supersedesResultIdentity)) fail("REWORK_RESULT_REQUIRED", "Rework должен ссылаться на immutable предыдущий результат.");
    const alreadyAtBoundary = input.alreadyAtBoundary === true; const command = alreadyAtBoundary ? "confirm_already_at_boundary" : "start_or_continue_body_work"; const identity = `${input.projectId}:${input.calculationId}:body-underarm-confirmation:${input.epoch}:${source.body.fingerprint}:${source.entryGate.fingerprint}`;
    const state = { kind: KIND, contractSchemaId: CONTRACT_SCHEMA_ID, contractVersion: CONTRACT_VERSION, projectId: input.projectId, calculationId: input.calculationId, identity, epoch: input.epoch, predecessorIdentity, supersedesResultIdentity, lifecycle: alreadyAtBoundary ? "reviewing_result" : "in_progress", revision: 1, source: clone(source), resultDraft: null, completedResult: null, operationReceipts: [], timestamps: { createdAt: metadata.at, startedAt: alreadyAtBoundary ? null : metadata.at, lastPausedAt: null, lastResumedAt: null, boundaryDeclaredAt: alreadyAtBoundary ? metadata.at : null, updatedAt: metadata.at, completedAt: null }, fingerprint: "" };
    appendReceipt(state, command, { alreadyAtBoundary }, metadata); return withStateFingerprint(state);
  }
  function transition(stateInput, command, target, metadata = {}) {
    const state = validateState(stateInput); requireUuid(metadata.operationId); requireTimestamp(metadata.at); const payload = {};
    const replay = priorReceipt(state, metadata.operationId, command, payload); if (replay) return replay; assertFence(state, metadata);
    const allowed = { pause: ["in_progress"], resume: ["paused"], declare_boundary_reached: ["in_progress"], return_to_work: ["reviewing_result"] };
    if (!allowed[command]?.includes(state.lifecycle)) fail("TRANSITION_INVALID", "Это действие недоступно в текущем состоянии Stage 82.");
    const next = clone(state); next.lifecycle = target; next.revision += 1; next.timestamps.updatedAt = metadata.at;
    if (command === "pause") next.timestamps.lastPausedAt = metadata.at;
    if (command === "resume") next.timestamps.lastResumedAt = metadata.at;
    if (command === "declare_boundary_reached") next.timestamps.boundaryDeclaredAt = metadata.at;
    if (command === "return_to_work") { next.resultDraft = null; next.timestamps.boundaryDeclaredAt = null; }
    appendReceipt(next, command, payload, metadata); return withStateFingerprint(next);
  }
  function pause(state, metadata) { return transition(state, "pause", "paused", metadata); }
  function resume(state, metadata) { return transition(state, "resume", "in_progress", metadata); }
  function declareBoundaryReached(state, metadata) { return transition(state, "declare_boundary_reached", "reviewing_result", metadata); }
  function returnToWork(state, metadata) { return transition(state, "return_to_work", "in_progress", metadata); }
  function editResultDraft(stateInput, input = {}, metadata = {}) {
    const state = validateState(stateInput); requireUuid(metadata.operationId); requireTimestamp(metadata.at); const draft = normalizeDraft(input, metadata.at); const payload = clone(draft);
    const replay = priorReceipt(state, metadata.operationId, "edit_result_draft", payload); if (replay) return replay; assertFence(state, metadata);
    if (state.lifecycle !== "reviewing_result") fail("TRANSITION_INVALID", "Физические значения вводятся только после подтверждения реальной линии подреза.");
    const next = clone(state); next.resultDraft = draft; next.revision += 1; next.timestamps.updatedAt = metadata.at; appendReceipt(next, "edit_result_draft", payload, metadata); return withStateFingerprint(next);
  }
  function completeConfirmation(stateInput, input = {}, metadata = {}) {
    const state = validateState(stateInput); requireUuid(metadata.operationId); requireTimestamp(metadata.at); const payload = { explicitConfirmation: input.explicitConfirmation === true };
    const replay = priorReceipt(state, metadata.operationId, "complete_confirmation", payload); if (replay) return replay; assertFence(state, metadata);
    if (state.lifecycle !== "reviewing_result" || !state.resultDraft) fail("RESULT_DRAFT_REQUIRED", "Сначала измерьте высоту корпуса и вручную посчитайте все живые петли.");
    if (input.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Подтвердите показанный физический результат.");
    const comparison = comparisons(state.source, state.resultDraft); if (Object.values(comparison).some((item) => item.differs) && !state.resultDraft.deviationNote) fail("DEVIATION_NOTE_REQUIRED", "Опишите наблюдаемое отличие от сохранённого ориентира или плана.");
    const next = clone(state); const draft = next.resultDraft;
    const result = { schemaId: RESULT_SCHEMA_ID, contractVersion: CONTRACT_VERSION, identity: `${state.identity}:result:${metadata.operationId}`, attemptIdentity: state.identity, sourceFingerprint: state.source.fingerprint, bodySourceFingerprint: state.source.body.fingerprint, stage81EntryBindingFingerprint: state.source.entryGate.fingerprint, completionBoundary: COMPLETION_BOUNDARY, physicalBoundaryConfirmation: { explicit: true, operationId: metadata.operationId, confirmedAt: metadata.at }, actualBodyFullTubeStitchCount: draft.actualBodyFullTubeStitchCount, actualBodyHeightAtUnderarmCm: draft.actualBodyHeightAtUnderarmCm, heightMeasurementPath: HEIGHT_MEASUREMENT_PATH, underarmStitchesHeldOrRemoved: false, plannedComparisonSnapshot: comparison, deviationNote: draft.deviationNote, timestamps: { measuredAt: draft.measuredAt, completedAt: metadata.at }, fingerprint: "" };
    next.completedResult = withFingerprint(result); next.lifecycle = "completed"; next.revision += 1; next.timestamps.updatedAt = metadata.at; next.timestamps.completedAt = metadata.at; appendReceipt(next, "complete_confirmation", payload, metadata); return withStateFingerprint(next);
  }

  function validateReceipt(receipt, state) {
    exactKeys(receipt, ["operationId", "command", "payloadFingerprint", "resultingRevision", "at"], "RECEIPT_INVALID"); requireUuid(receipt.operationId, "RECEIPT_INVALID"); requireTimestamp(receipt.at); requireFingerprint(receipt.payloadFingerprint, "RECEIPT_INVALID"); if (!Number.isSafeInteger(receipt.resultingRevision) || receipt.resultingRevision < 1 || receipt.resultingRevision > state.revision) fail("RECEIPT_INVALID", "Operation receipt revision повреждена.");
  }
  function validateResult(result, state) {
    exactKeys(result, ["schemaId", "contractVersion", "identity", "attemptIdentity", "sourceFingerprint", "bodySourceFingerprint", "stage81EntryBindingFingerprint", "completionBoundary", "physicalBoundaryConfirmation", "actualBodyFullTubeStitchCount", "actualBodyHeightAtUnderarmCm", "heightMeasurementPath", "underarmStitchesHeldOrRemoved", "plannedComparisonSnapshot", "deviationNote", "timestamps", "fingerprint"], "COMPLETED_RESULT_INVALID");
    if (result.schemaId !== RESULT_SCHEMA_ID || result.contractVersion !== CONTRACT_VERSION || result.attemptIdentity !== state.identity || result.sourceFingerprint !== state.source.fingerprint || result.bodySourceFingerprint !== state.source.body.fingerprint || result.stage81EntryBindingFingerprint !== state.source.entryGate.fingerprint || result.completionBoundary !== COMPLETION_BOUNDARY || result.heightMeasurementPath !== HEIGHT_MEASUREMENT_PATH || result.underarmStitchesHeldOrRemoved !== false || result.physicalBoundaryConfirmation?.explicit !== true) fail("COMPLETED_RESULT_INVALID", "Immutable физический результат Stage 82 повреждён.");
    requireUuid(result.physicalBoundaryConfirmation.operationId, "COMPLETED_RESULT_INVALID"); requireTimestamp(result.physicalBoundaryConfirmation.confirmedAt); positiveInteger(result.actualBodyFullTubeStitchCount); canonicalDecimal(result.actualBodyHeightAtUnderarmCm);
    if (canonicalize(result.plannedComparisonSnapshot) !== canonicalize(comparisons(state.source, { actualBodyFullTubeStitchCount: result.actualBodyFullTubeStitchCount, actualBodyHeightAtUnderarmCm: result.actualBodyHeightAtUnderarmCm }))) fail("COMPLETED_RESULT_INVALID", "Planned/actual comparison повреждён.");
    if (Object.values(result.plannedComparisonSnapshot).some((item) => item.differs) && (typeof result.deviationNote !== "string" || !result.deviationNote.trim())) fail("COMPLETED_RESULT_INVALID", "Комментарий к наблюдаемому отличию отсутствует.");
    exactKeys(result.timestamps, ["measuredAt", "completedAt"], "COMPLETED_RESULT_INVALID"); requireTimestamp(result.timestamps.measuredAt); requireTimestamp(result.timestamps.completedAt); if (result.fingerprint !== fingerprint(semantic(result))) fail("COMPLETED_RESULT_INVALID", "Fingerprint физического результата повреждён.");
  }
  function withStateFingerprint(state) { const next = clone(state); delete next.fingerprint; next.fingerprint = fingerprint(next); return validateState(next); }
  function validateState(stateInput) {
    const value = clone(stateInput);
    exactKeys(value, ["kind", "contractSchemaId", "contractVersion", "projectId", "calculationId", "identity", "epoch", "predecessorIdentity", "supersedesResultIdentity", "lifecycle", "revision", "source", "resultDraft", "completedResult", "operationReceipts", "timestamps", "fingerprint"]);
    if (value.kind !== KIND || value.contractSchemaId !== CONTRACT_SCHEMA_ID || value.contractVersion !== CONTRACT_VERSION || !LIFECYCLES.includes(value.lifecycle) || !Number.isSafeInteger(value.epoch) || value.epoch < 1 || !Number.isSafeInteger(value.revision) || value.revision < 1) fail("STATE_INVALID", "Stage 82 identity/version/lifecycle повреждены.");
    requireUuid(value.projectId, "PROJECT_ID_INVALID"); requireUuid(value.calculationId, "CALCULATION_ID_INVALID"); const source = validateSource(value.source); if (source.projectId !== value.projectId || source.calculationId !== value.calculationId) fail("SOURCE_BINDING_INVALID", "Stage 82 source scope не совпадает.");
    if (value.identity !== `${value.projectId}:${value.calculationId}:body-underarm-confirmation:${value.epoch}:${source.body.fingerprint}:${source.entryGate.fingerprint}`) fail("STATE_INVALID", "Stage 82 identity повреждена.");
    if (value.epoch === 1 ? value.predecessorIdentity !== null || value.supersedesResultIdentity !== null : typeof value.predecessorIdentity !== "string" || !value.predecessorIdentity) fail("HISTORY_CONFLICT", "Stage 82 epoch lineage повреждена.");
    exactKeys(value.timestamps, ["createdAt", "startedAt", "lastPausedAt", "lastResumedAt", "boundaryDeclaredAt", "updatedAt", "completedAt"], "STATE_INVALID"); Object.values(value.timestamps).filter((item) => item !== null).forEach(requireTimestamp);
    if (!Array.isArray(value.operationReceipts) || !value.operationReceipts.length || value.operationReceipts.length > 100) fail("RECEIPT_INVALID", "Stage 82 operation history повреждена."); value.operationReceipts.forEach((item) => validateReceipt(item, value)); if (new Set(value.operationReceipts.map((item) => item.operationId)).size !== value.operationReceipts.length) fail("RECEIPT_INVALID", "Operation IDs должны быть уникальны.");
    if (value.resultDraft !== null) normalizeDraft(value.resultDraft, value.resultDraft.measuredAt);
    if (value.lifecycle === "completed") { if (!value.completedResult || !value.resultDraft || value.timestamps.completedAt === null) fail("COMPLETED_RESULT_INVALID", "Completed Stage 82 result отсутствует."); validateResult(value.completedResult, value); }
    else if (value.completedResult !== null || value.timestamps.completedAt !== null) fail("COMPLETED_RESULT_INVALID", "Live Stage 82 attempt не может содержать completed result.");
    if (value.fingerprint !== fingerprint(semantic(value))) fail("FINGERPRINT_MISMATCH", "Stage 82 state fingerprint повреждён."); return deepFreeze(value);
  }

  function resultView(result) { return result ? { actualBodyFullTubeStitchCount: result.actualBodyFullTubeStitchCount, actualBodyHeightAtUnderarmCm: result.actualBodyHeightAtUnderarmCm, heightMeasurementPathLabel: "От нижнего края корпуса до реальной линии подреза", completionBoundary: result.completionBoundary, underarmStitchesHeldOrRemoved: result.underarmStitchesHeldOrRemoved, physicalBoundaryConfirmed: result.physicalBoundaryConfirmation.explicit, plannedComparison: clone(result.plannedComparisonSnapshot), deviationNote: result.deviationNote } : null; }
  function contextView(source) { const labels = { ready: "Корпус подготовлен к продолжению", active: "Работа над корпусом продолжается", paused: "Работа над корпусом приостановлена" }; return { bodyExecutionState: source.body.bodyExecutionState, bodyExecutionStateLabel: labels[source.body.bodyExecutionState], plannedBodyFullTubeStitchCount: source.body.plannedBodyFullTubeStitchCount, foundationHeightCm: source.body.foundationHeightCm, primaryFabricHeightCm: source.body.primaryFabricHeightCm, orientationUnderarmHeightCm: source.body.orientationUnderarmHeightCm, orientationInformationalOnly: true, sleevePair: { accepted: true, actualUnderarmFullTubeStitchCounts: clone(source.entryGate.sleeveActualFullTubeStitchCounts) } }; }
  function readyView(sourceInput, history = {}) { const source = validateSource(sourceInput); return deepFreeze({ available: true, blocked: false, readiness: "ready", lifecycle: "ready", bodyPhysicalState: "not_confirmed", bodyPhysicalStateLabel: "Физическая линия подрезов корпуса ещё не подтверждена", context: contextView(source), resultDraft: null, completedResult: null, requiredUserAction: "answer_body_at_underarm_boundary", firstQuestion: "Корпус сейчас физически довязан до линии подрезов, при этом петли подрезов ещё не сняты и детали не соединены?", allowedActions: ["confirm_already_at_boundary", "start_or_continue_body_work"], currentConfirmation: { current: false, status: "not_started", historicalCount: history.historicalCount || 0, staleCount: history.staleCount || 0 }, successorReadiness: { status: "blocked", available: false, message: "До соединения нужны отдельные правила распределения петель и проверки баланса деталей." }, joinPreparation: { status: "blocked", available: false }, reworkDestination: null }); }
  function projectView(stateInput, history = {}) {
    const state = validateState(stateInput); const allowed = { in_progress: ["pause", "declare_boundary_reached"], paused: ["resume"], reviewing_result: ["edit_result_draft", "return_to_work", "complete_confirmation"], completed: ["start_body_rework"] }[state.lifecycle];
    const physicalState = state.lifecycle === "completed" ? "confirmed_at_underarm_before_allocation" : state.lifecycle === "reviewing_result" ? "boundary_declared_evidence_required" : "body_work_continuing"; const physicalLabels = { confirmed_at_underarm_before_allocation: "Корпус подтверждён у линии подрезов до снятия петель", boundary_declared_evidence_required: "Нужно измерить корпус и вручную посчитать петли", body_work_continuing: "Работа над корпусом продолжается" };
    return deepFreeze({ available: true, blocked: false, readiness: state.lifecycle === "completed" ? "completed" : "in_stage", lifecycle: state.lifecycle, bodyPhysicalState: physicalState, bodyPhysicalStateLabel: physicalLabels[physicalState], context: contextView(state.source), resultDraft: clone(state.resultDraft), completedResult: resultView(state.completedResult), requiredUserAction: state.lifecycle === "reviewing_result" ? "measure_height_and_count_all_live_body_stitches" : state.lifecycle === "completed" ? null : "continue_body_work", firstQuestion: null, allowedActions: allowed, currentConfirmation: { current: true, status: state.lifecycle, historicalCount: history.historicalCount || 1, staleCount: history.staleCount || 0 }, successorReadiness: { status: "blocked", available: false, message: "До соединения нужны отдельные правила распределения петель и проверки баланса деталей." }, joinPreparation: { status: "blocked", available: false }, reworkDestination: state.lifecycle === "completed" ? { routePath: "/project-body-underarm-physical-confirmation" } : null });
  }

  const api = Object.freeze({ DOMAIN_IDENTITY, KIND, PROGRESS_KIND, CONTRACT_SCHEMA_ID, CONTRACT_VERSION, RESULT_SCHEMA_ID, COMPLETION_BOUNDARY, OUTPUT_BOUNDARY, HEIGHT_MEASUREMENT_PATH, MEASUREMENT_POLICY, COMPARISON_POLICY, LIFECYCLES, BodyUnderarmPhysicalConfirmationError, canonicalize, fingerprint, canonicalDecimal, validateSource, validateState, startAttempt, pause, resume, declareBoundaryReached, editResultDraft, returnToWork, completeConfirmation, readyView, projectView });
  globalObject.YarnAIProjectBodyUnderarmPhysicalConfirmation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
