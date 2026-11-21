"use strict";

(function exposeFoundationSectionMeasurement(globalObject) {
  const KIND = "FOUNDATION_SECTION_MEASUREMENT";
  const SCHEMA_VERSION = 1;
  const ROUTE_PATH = "/project-foundation-section-measurement";
  const LIFECYCLES = Object.freeze(["collecting", "reviewing", "completed"]);
  const RESULTS = Object.freeze(["BELOW_TARGET", "TARGET_REACHED"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const DECIMAL = /^(?:0|[1-9]\d*)(?:[.,]\d+)?$/;
  const STATE_KEYS = Object.freeze(["kind", "schemaVersion", "identity", "projectId", "calculationId", "epoch", "predecessorIdentity", "lifecycle", "revision", "source", "context", "measurement", "completedSnapshot", "operations", "timestamps", "fingerprint"]);
  const SOURCE_KEYS = Object.freeze(["executionProgressIdentity", "executionProgressRevision", "executionStateIdentity", "executionStateRevision", "executionStateFingerprint", "executionSource", "executionSourceFingerprint", "executionPlanFingerprint", "measurementPolicyFingerprint"]);
  const CONTEXT_KEYS = Object.freeze(["foundationType", "ribPattern", "workingMethod", "stitchAllocation", "toolConfirmation", "instructionSource", "measurementPolicy", "target"]);
  const MEASUREMENT_KEYS = Object.freeze(["measuredHeightCm", "targetHeightCm", "unit", "result", "measuredAt"]);
  const SNAPSHOT_KEYS = Object.freeze(["attemptIdentity", "projectId", "calculationId", "epoch", "measuredHeightCm", "targetHeightCm", "unit", "result", "measuredAt", "confirmedAt", "source", "sourceFingerprint", "fingerprint"]);
  const OPERATION_KEYS = Object.freeze(["operationId", "command", "payloadFingerprint", "resultingRevision", "at"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "reviewedAt", "completedAt"]);

  class FoundationSectionMeasurementError extends Error {
    constructor(code, userMessage, details = {}) { super(userMessage); this.name = "FoundationSectionMeasurementError"; this.code = code; this.userMessage = userMessage; this.details = details; }
  }
  function fail(code, message, details) { throw new FoundationSectionMeasurementError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
  function exactKeys(value, keys, code = "MEASUREMENT_STATE_CORRUPTED") { if (!record(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "Сохранённое измерение повреждено."); }
  function canonicalize(value) { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; }
  function fingerprint(value) { const text = canonicalize(value); let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`; }
  function validateUuid(value, code = "PROJECT_MISMATCH") { if (!UUID_V7.test(value || "")) fail(code, "Ссылка на проект недействительна."); return value; }
  function validateTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "Время измерения повреждено."); return value; }
  function semanticState(value) { const result = clone(value); delete result.fingerprint; return result; }
  function stateFingerprint(value) { return fingerprint(semanticState(value)); }
  function snapshotFingerprint(value) { const result = clone(value); delete result.fingerprint; return fingerprint(result); }
  function targetIsCanonical(value) { return canonicalize(value) === canonicalize({ kind: "height", value: 5, unit: "cm" }); }
  function diagnostic(code, fallback = "Не удалось безопасно открыть измерение высоты.") {
    const messages = {
      PROJECT_MISMATCH: "Откройте измерение из нужного проекта.", CALCULATION_MISMATCH: "Активный расчёт проекта изменился.", SOURCE_STALE: "Исходные данные проекта изменились. Откройте проект заново.",
      STAGE71_MISSING: "Сначала начните выполнять резинку.", STAGE71_NOT_STARTED: "Сначала начните вязать резинку.", STAGE71_MUST_BE_PAUSED: "Перед измерением явно приостановите вязание резинки.", STAGE71_CONFLICT: "Сохранённые данные выполнения конфликтуют.",
      MEASUREMENT_STATE_CORRUPTED: "Сохранённое измерение повреждено.", MEASUREMENT_HISTORY_CONFLICT: "История измерений конфликтует; автоматический выбор невозможен.", TARGET_ALREADY_REACHED: "Целевая высота уже подтверждена физическим измерением.",
      REVISION_CONFLICT: "Измерение изменено в другой вкладке. Обновите страницу.", STORAGE_UNAVAILABLE: "Проверка проекта временно недоступна.",
    };
    return deepFreeze({ code, message: messages[code] || fallback, recovery: { label: "Вернуться к проектам", path: "/saved-projects" } });
  }

  function parseMeasurementInput(input) {
    if (typeof input === "number") {
      if (!Number.isFinite(input) || input <= 0) fail("MEASUREMENT_VALUE_INVALID", "Введите положительную высоту в сантиметрах.");
      return input;
    }
    if (typeof input !== "string") fail("MEASUREMENT_VALUE_INVALID", "Введите высоту числом в сантиметрах.");
    const value = input.trim();
    if (!value || !DECIMAL.test(value)) fail("MEASUREMENT_VALUE_INVALID", "Введите одно положительное число, например 4,9.");
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) fail("MEASUREMENT_VALUE_INVALID", "Высота должна быть больше нуля.");
    return parsed;
  }
  function compareHeight(measuredHeightCm, targetHeightCm = 5) { const measured = parseMeasurementInput(measuredHeightCm); if (!Number.isFinite(targetHeightCm) || targetHeightCm <= 0) fail("TARGET_INVALID", "Целевая высота повреждена."); return measured < targetHeightCm ? "BELOW_TARGET" : "TARGET_REACHED"; }

  function assessSource(input = {}) {
    const projectId = input.projectId || input.projectIdentity;
    try {
      validateUuid(projectId);
      const project = input.project;
      if (!record(project) || project.project_id !== projectId || ["DELETED", "QUARANTINED"].includes(project.workspace_status)) fail("PROJECT_MISMATCH", "Откройте измерение из нужного проекта.");
      const calculationId = project.active_calculation_id; validateUuid(calculationId, "CALCULATION_MISMATCH");
      const stage71 = input.stage71Domain;
      if (!stage71 || !input.stage70Domain || !input.stage63Domain || !input.stage65Domain || !input.stage66Domain || !input.stage67Domain || !input.stage68Domain || !input.stage69Domain) fail("STORAGE_UNAVAILABLE", "Проверка проекта временно недоступна.");
      const progress = Array.isArray(input.progress) ? input.progress : [];
      const upstream = stage71.assessSource({ projectId, project, progress, stage63Domain: input.stage63Domain, stage65Domain: input.stage65Domain, stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain, stage68Domain: input.stage68Domain, stage69Domain: input.stage69Domain, stage70Domain: input.stage70Domain, validatedAt: input.validatedAt || new Date().toISOString() });
      if (upstream.lifecycle !== "ready") fail(upstream.diagnostic?.code || "SOURCE_STALE", upstream.diagnostic?.message || "Исходные данные проекта изменились.");
      const all = progress.filter((entry) => entry?.kind === stage71.KIND && !entry.deleted_at);
      if (all.some((entry) => entry.project_id !== projectId)) fail("PROJECT_MISMATCH", "Выполнение относится к другому проекту.");
      if (all.some((entry) => entry.calculation_id !== calculationId)) fail("CALCULATION_MISMATCH", "Выполнение относится к другому расчёту.");
      if (!all.length) fail("STAGE71_MISSING", "Сначала начните выполнять резинку.");
      if (all.length !== 1 || all.some((entry) => entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN" || entry.imported_unproven)) fail("STAGE71_CONFLICT", "Сохранённые данные выполнения конфликтуют.");
      const executionRecord = all[0];
      let executionState;
      try { executionState = stage71.validateProgressState(executionRecord.state, { assessment: upstream }); }
      catch (error) { fail(error?.code === "SOURCE_STALE" ? "SOURCE_STALE" : "STAGE71_CONFLICT", error?.userMessage || "Сохранённое выполнение повреждено."); }
      if (executionState.lifecycle === "ready" || executionState.timestamps?.startedAt === null) fail("STAGE71_NOT_STARTED", "Сначала начните вязать резинку.");
      if (executionState.lifecycle !== "paused") fail("STAGE71_MUST_BE_PAUSED", "Перед измерением явно приостановите вязание резинки.");
      if (!targetIsCanonical(executionState.executionPlan?.target) || !targetIsCanonical(executionState.executionPlan?.measurementPolicy?.target) || executionState.executionPlan.measurementPolicy.authority !== "physical_measurement") fail("SOURCE_STALE", "Правило измерения повреждено.");
      const source = {
        executionProgressIdentity: executionRecord.progress_id, executionProgressRevision: executionRecord.revision,
        executionStateIdentity: executionState.identity, executionStateRevision: executionState.revision, executionStateFingerprint: executionState.fingerprint,
        executionSource: clone(executionState.source), executionSourceFingerprint: fingerprint(executionState.source), executionPlanFingerprint: fingerprint(executionState.executionPlan), measurementPolicyFingerprint: fingerprint(executionState.executionPlan.measurementPolicy),
      };
      const context = { foundationType: executionState.executionPlan.foundationType, ribPattern: clone(executionState.executionPlan.ribPattern), workingMethod: clone(executionState.executionPlan.workingMethod), stitchAllocation: clone(executionState.executionPlan.stitchAllocation), toolConfirmation: clone(executionState.executionPlan.toolConfirmation), instructionSource: clone(executionState.executionPlan.instructionSource), measurementPolicy: clone(executionState.executionPlan.measurementPolicy), target: clone(executionState.executionPlan.target) };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, projectRevision: project.revision, source, context, executionState });
    } catch (error) {
      const code = error?.code || "STORAGE_UNAVAILABLE";
      return deepFreeze({ lifecycle: "blocked", projectId: UUID_V7.test(projectId || "") ? projectId : null, calculationId: null, diagnostic: diagnostic(code, error?.userMessage) });
    }
  }
  function requireReady(value) { if (value?.lifecycle !== "ready") fail(value?.diagnostic?.code || "SOURCE_STALE", value?.diagnostic?.message || "Исходные данные проекта изменились."); return value; }
  function deterministicIdentity(assessment, epoch) { return `${assessment.projectId}:foundation-section-measurement:${epoch}:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: assessment.projectId, calculationId: assessment.calculationId, epoch, executionStateIdentity: assessment.source.executionStateIdentity, executionStateRevision: assessment.source.executionStateRevision, executionStateFingerprint: assessment.source.executionStateFingerprint })}`; }
  function createInitialState(assessmentSource, metadata = {}) {
    const assessment = requireReady(assessmentSource); const epoch = metadata.epoch;
    if (!Number.isSafeInteger(epoch) || epoch < 1) fail("MEASUREMENT_HISTORY_CONFLICT", "Номер попытки измерения повреждён.");
    const predecessorIdentity = metadata.predecessorIdentity ?? null; if (epoch === 1 ? predecessorIdentity !== null : typeof predecessorIdentity !== "string" || !predecessorIdentity) fail("MEASUREMENT_HISTORY_CONFLICT", "Связь попыток измерения повреждена.");
    const createdAt = validateTimestamp(metadata.createdAt || metadata.timestamp);
    const state = { kind: KIND, schemaVersion: SCHEMA_VERSION, identity: deterministicIdentity(assessment, epoch), projectId: assessment.projectId, calculationId: assessment.calculationId, epoch, predecessorIdentity, lifecycle: "collecting", revision: 1, source: clone(assessment.source), context: clone(assessment.context), measurement: null, completedSnapshot: null, operations: [], timestamps: { createdAt, reviewedAt: null, completedAt: null }, fingerprint: "" };
    state.fingerprint = stateFingerprint(state); return validateProgressState(state, { assessment });
  }
  function operationReceipt(operationId, command, payload, revision, at) { return { operationId: validateUuid(operationId, "OPERATION_ID_CONFLICT"), command, payloadFingerprint: fingerprint(payload), resultingRevision: revision, at: validateTimestamp(at) }; }
  function replayOrConflict(state, metadata, command, payload) { validateUuid(metadata.operationId, "OPERATION_ID_CONFLICT"); const found = state.operations.find((entry) => entry.operationId === metadata.operationId); if (!found) return false; if (found.command !== command || found.payloadFingerprint !== fingerprint(payload)) fail("OPERATION_ID_CONFLICT", "Эта операция уже использована для другого действия."); return true; }
  function assertMutation(state, metadata) { const assessment = requireReady(metadata.assessment); const checked = validateProgressState(state, { assessment }); if (metadata.expectedRevision !== checked.revision || metadata.expectedFingerprint !== checked.fingerprint) fail("REVISION_CONFLICT", "Измерение изменено в другой вкладке."); return checked; }
  function completeMeasurement(stateSource, input, metadata = {}) {
    const state = validateProgressState(stateSource, { assessment: requireReady(metadata.assessment) }); const measuredHeightCm = parseMeasurementInput(input); const measuredAt = validateTimestamp(metadata.timestamp); const measurement = { measuredHeightCm, targetHeightCm: state.context.target.value, unit: "cm", result: compareHeight(measuredHeightCm, state.context.target.value), measuredAt }; const payload = { identity: state.identity, measurement, explicitConfirmation: metadata.explicitConfirmation === true };
    if (replayOrConflict(state, metadata, "complete", payload)) return state; assertMutation(state, metadata); if (!["collecting", "reviewing"].includes(state.lifecycle)) fail("INVALID_LIFECYCLE_TRANSITION", "Это измерение уже сохранено."); if (metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Подтвердите, что это физически измеренное значение.");
    const next = clone(state); next.lifecycle = "completed"; next.revision += 1; next.measurement = measurement; next.timestamps.reviewedAt = measuredAt; next.timestamps.completedAt = measuredAt;
    const snapshot = { attemptIdentity: state.identity, projectId: state.projectId, calculationId: state.calculationId, epoch: state.epoch, measuredHeightCm, targetHeightCm: measurement.targetHeightCm, unit: "cm", result: measurement.result, measuredAt, confirmedAt: measuredAt, source: clone(state.source), sourceFingerprint: fingerprint(state.source), fingerprint: "" }; snapshot.fingerprint = snapshotFingerprint(snapshot); next.completedSnapshot = snapshot;
    next.operations.push(operationReceipt(metadata.operationId, "complete", payload, next.revision, measuredAt)); next.fingerprint = stateFingerprint(next); return validateProgressState(next, { assessment: metadata.assessment });
  }
  function reviewMeasurement(stateSource, input, metadata = {}) {
    const state = validateProgressState(stateSource, { assessment: requireReady(metadata.assessment) }); const measuredHeightCm = parseMeasurementInput(input); const measuredAt = validateTimestamp(metadata.timestamp); const payload = { measuredHeightCm, targetHeightCm: state.context.target.value, unit: "cm", identity: state.identity };
    if (replayOrConflict(state, metadata, "review", payload)) return state; assertMutation(state, metadata); if (state.lifecycle !== "collecting") fail("INVALID_LIFECYCLE_TRANSITION", "Сейчас нельзя проверить новое значение.");
    const next = clone(state); next.lifecycle = "reviewing"; next.revision += 1; next.measurement = { measuredHeightCm, targetHeightCm: state.context.target.value, unit: "cm", result: compareHeight(measuredHeightCm, state.context.target.value), measuredAt }; next.timestamps.reviewedAt = measuredAt; next.operations.push(operationReceipt(metadata.operationId, "review", payload, next.revision, measuredAt)); next.fingerprint = stateFingerprint(next); return validateProgressState(next, { assessment: metadata.assessment });
  }
  function reviseMeasurement(stateSource, metadata = {}) {
    const state = validateProgressState(stateSource, { assessment: requireReady(metadata.assessment) }); const payload = { identity: state.identity, measurementFingerprint: fingerprint(state.measurement) };
    if (replayOrConflict(state, metadata, "revise", payload)) return state; assertMutation(state, metadata); if (state.lifecycle !== "reviewing") fail("INVALID_LIFECYCLE_TRANSITION", "Изменить можно только непотверждённое измерение.");
    const at = validateTimestamp(metadata.timestamp); const next = clone(state); next.lifecycle = "collecting"; next.revision += 1; next.measurement = null; next.timestamps.reviewedAt = null; next.operations.push(operationReceipt(metadata.operationId, "revise", payload, next.revision, at)); next.fingerprint = stateFingerprint(next); return validateProgressState(next, { assessment: metadata.assessment });
  }
  function confirmMeasurement(stateSource, metadata = {}) {
    const state = validateProgressState(stateSource, { assessment: requireReady(metadata.assessment) }); const payload = { identity: state.identity, measurementFingerprint: fingerprint(state.measurement), explicitConfirmation: metadata.explicitConfirmation === true };
    if (replayOrConflict(state, metadata, "confirm", payload)) return state; assertMutation(state, metadata); if (state.lifecycle !== "reviewing" || !state.measurement) fail("INVALID_LIFECYCLE_TRANSITION", "Сначала проверьте введённое измерение."); if (metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Подтвердите, что это физически измеренное значение.");
    const confirmedAt = validateTimestamp(metadata.timestamp); const next = clone(state); next.lifecycle = "completed"; next.revision += 1; next.timestamps.completedAt = confirmedAt;
    const snapshot = { attemptIdentity: state.identity, projectId: state.projectId, calculationId: state.calculationId, epoch: state.epoch, measuredHeightCm: state.measurement.measuredHeightCm, targetHeightCm: state.measurement.targetHeightCm, unit: "cm", result: state.measurement.result, measuredAt: state.measurement.measuredAt, confirmedAt, source: clone(state.source), sourceFingerprint: fingerprint(state.source), fingerprint: "" }; snapshot.fingerprint = snapshotFingerprint(snapshot); next.completedSnapshot = snapshot;
    next.operations.push(operationReceipt(metadata.operationId, "confirm", payload, next.revision, confirmedAt)); next.fingerprint = stateFingerprint(next); return validateProgressState(next, { assessment: metadata.assessment });
  }

  function validateSource(value) { exactKeys(value, SOURCE_KEYS); validateUuid(value.executionProgressIdentity, "MEASUREMENT_STATE_CORRUPTED"); if (!Number.isSafeInteger(value.executionProgressRevision) || value.executionProgressRevision < 1 || typeof value.executionStateIdentity !== "string" || !value.executionStateIdentity || !Number.isSafeInteger(value.executionStateRevision) || value.executionStateRevision < 2 || !FINGERPRINT.test(value.executionStateFingerprint) || !record(value.executionSource) || !FINGERPRINT.test(value.executionSourceFingerprint) || value.executionSourceFingerprint !== fingerprint(value.executionSource) || !FINGERPRINT.test(value.executionPlanFingerprint) || !FINGERPRINT.test(value.measurementPolicyFingerprint)) fail("MEASUREMENT_STATE_CORRUPTED", "Привязка к выполнению повреждена."); return value; }
  function validateContext(value) { exactKeys(value, CONTEXT_KEYS); if (value.foundationType !== "ribbing" || !targetIsCanonical(value.target) || !record(value.measurementPolicy) || !targetIsCanonical(value.measurementPolicy.target) || value.measurementPolicy.authority !== "physical_measurement" || value.measurementPolicy.onNeedles !== true || value.measurementPolicy.tensionState !== "natural_unstretched" || value.measurementPolicy.origin !== "physical_start_of_ribbing_after_cast_on_to_current_top_edge" || value.measurementPolicy.comparison !== "at_least" || value.measurementPolicy.toleranceCm !== null || !record(value.ribPattern) || !record(value.workingMethod) || !record(value.stitchAllocation) || !record(value.toolConfirmation) || !record(value.instructionSource)) fail("MEASUREMENT_STATE_CORRUPTED", "Контекст измерения повреждён."); return value; }
  function validateMeasurement(value) { exactKeys(value, MEASUREMENT_KEYS); if (parseMeasurementInput(value.measuredHeightCm) !== value.measuredHeightCm || value.targetHeightCm !== 5 || value.unit !== "cm" || value.result !== compareHeight(value.measuredHeightCm, value.targetHeightCm)) fail("MEASUREMENT_STATE_CORRUPTED", "Значение измерения повреждено."); validateTimestamp(value.measuredAt); return value; }
  function validateSnapshot(value, state) { exactKeys(value, SNAPSHOT_KEYS); if (value.attemptIdentity !== state.identity || value.projectId !== state.projectId || value.calculationId !== state.calculationId || value.epoch !== state.epoch || canonicalize({ measuredHeightCm: value.measuredHeightCm, targetHeightCm: value.targetHeightCm, unit: value.unit, result: value.result, measuredAt: value.measuredAt }) !== canonicalize(state.measurement) || value.confirmedAt !== state.timestamps.completedAt || canonicalize(value.source) !== canonicalize(state.source) || value.sourceFingerprint !== fingerprint(value.source) || value.fingerprint !== snapshotFingerprint(value)) fail("MEASUREMENT_STATE_CORRUPTED", "Подтверждённый физический результат повреждён."); validateTimestamp(value.confirmedAt); return value; }
  function validateProgressState(source, options = {}) {
    exactKeys(source, STATE_KEYS); const value = clone(source);
    if (value.kind !== KIND || value.schemaVersion !== SCHEMA_VERSION || !LIFECYCLES.includes(value.lifecycle) || !Number.isSafeInteger(value.revision) || value.revision < 1 || !Number.isSafeInteger(value.epoch) || value.epoch < 1) fail("MEASUREMENT_STATE_CORRUPTED", "Состояние измерения повреждено.");
    validateUuid(value.projectId); validateUuid(value.calculationId, "CALCULATION_MISMATCH"); if (value.epoch === 1 ? value.predecessorIdentity !== null : typeof value.predecessorIdentity !== "string" || !value.predecessorIdentity) fail("MEASUREMENT_HISTORY_CONFLICT", "Связь попыток измерения повреждена."); validateSource(value.source); validateContext(value.context); if (value.source.executionPlanFingerprint !== fingerprint({ ...value.context, rowEstimate: null }) || value.source.measurementPolicyFingerprint !== fingerprint(value.context.measurementPolicy)) fail("MEASUREMENT_STATE_CORRUPTED", "Контекст измерения не соответствует выполнению.");
    if (value.identity !== `${value.projectId}:foundation-section-measurement:${value.epoch}:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: value.projectId, calculationId: value.calculationId, epoch: value.epoch, executionStateIdentity: value.source.executionStateIdentity, executionStateRevision: value.source.executionStateRevision, executionStateFingerprint: value.source.executionStateFingerprint })}`) fail("MEASUREMENT_STATE_CORRUPTED", "Идентификатор попытки повреждён.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS); validateTimestamp(value.timestamps.createdAt); ["reviewedAt", "completedAt"].forEach((key) => { if (value.timestamps[key] !== null) validateTimestamp(value.timestamps[key]); });
    if (value.lifecycle === "collecting") { if (value.measurement !== null || value.completedSnapshot !== null || value.timestamps.reviewedAt !== null || value.timestamps.completedAt !== null) fail("MEASUREMENT_STATE_CORRUPTED", "Черновик измерения повреждён."); }
    else { validateMeasurement(value.measurement); if (value.timestamps.reviewedAt !== value.measurement.measuredAt) fail("MEASUREMENT_STATE_CORRUPTED", "Время измерения повреждено."); if (value.lifecycle === "reviewing" && (value.completedSnapshot !== null || value.timestamps.completedAt !== null)) fail("MEASUREMENT_STATE_CORRUPTED", "Неподтверждённое измерение повреждено."); if (value.lifecycle === "completed") validateSnapshot(value.completedSnapshot, value); }
    if (!Array.isArray(value.operations) || value.operations.length > 32) fail("MEASUREMENT_STATE_CORRUPTED", "История операций повреждена."); const ids = new Set(); let previousRevision = 1;
    value.operations.forEach((entry) => { exactKeys(entry, OPERATION_KEYS); validateUuid(entry.operationId, "MEASUREMENT_STATE_CORRUPTED"); validateTimestamp(entry.at); if (ids.has(entry.operationId) || !["complete", "review", "revise", "confirm"].includes(entry.command) || !FINGERPRINT.test(entry.payloadFingerprint) || entry.resultingRevision !== previousRevision + 1) fail("MEASUREMENT_STATE_CORRUPTED", "История операций повреждена."); ids.add(entry.operationId); previousRevision = entry.resultingRevision; });
    if (value.revision !== previousRevision || value.fingerprint !== stateFingerprint(value)) fail("MEASUREMENT_STATE_CORRUPTED", "Целостность измерения нарушена.");
    if (options.assessment?.lifecycle === "ready" && (value.projectId !== options.assessment.projectId || value.calculationId !== options.assessment.calculationId || canonicalize(value.source) !== canonicalize(options.assessment.source) || canonicalize(value.context) !== canonicalize(options.assessment.context))) fail("SOURCE_STALE", "Выполнение резинки изменилось. Откройте измерение заново.");
    return deepFreeze(value);
  }
  function resolveAuthoritativeHistory(records) {
    if (!Array.isArray(records)) return deepFreeze({ status: "blocked", authoritativeRecord: null, authoritativeState: null, terminalReached: false, diagnostic: diagnostic("MEASUREMENT_HISTORY_CONFLICT") });
    const ordered = records.map((entry, sourceIndex) => ({ entry, sourceIndex })).sort((left, right) => {
      const leftEpoch = Number.isSafeInteger(left.entry?.epoch) ? left.entry.epoch : Number.MAX_SAFE_INTEGER;
      const rightEpoch = Number.isSafeInteger(right.entry?.epoch) ? right.entry.epoch : Number.MAX_SAFE_INTEGER;
      return leftEpoch - rightEpoch || left.sourceIndex - right.sourceIndex;
    });
    let authoritativeRecord = null; let authoritativeState = null; let problem = null;
    for (let index = 0; index < ordered.length; index += 1) {
      const entry = ordered[index].entry;
      try {
        if (!record(entry) || entry.deleted_at || entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN" || entry.imported_unproven || entry.epoch !== entry.state?.epoch) fail("MEASUREMENT_HISTORY_CONFLICT", "Сохранённые попытки измерения конфликтуют.");
        if (authoritativeState?.lifecycle === "completed" && authoritativeState.completedSnapshot.result === "TARGET_REACHED") fail("MEASUREMENT_HISTORY_CONFLICT", "После подтверждённой цели новые попытки запрещены.");
        const state = validateProgressState(entry.state);
        if (state.epoch !== index + 1 || state.predecessorIdentity !== (authoritativeState?.identity || null)) fail("MEASUREMENT_HISTORY_CONFLICT", "Связь попыток измерения повреждена.");
        if (authoritativeState && (authoritativeState.lifecycle !== "completed" || authoritativeState.completedSnapshot.result !== "BELOW_TARGET")) fail("MEASUREMENT_HISTORY_CONFLICT", "Новая попытка не может вытеснить незавершённую или успешную.");
        authoritativeRecord = entry; authoritativeState = state;
      } catch (error) {
        problem = diagnostic(error?.code === "MEASUREMENT_STATE_CORRUPTED" ? "MEASUREMENT_STATE_CORRUPTED" : "MEASUREMENT_HISTORY_CONFLICT", error?.userMessage);
        break;
      }
    }
    return deepFreeze({
      status: problem ? "blocked" : "valid",
      authoritativeRecord: authoritativeRecord ? clone(authoritativeRecord) : null,
      authoritativeState: authoritativeState ? clone(authoritativeState) : null,
      terminalReached: authoritativeState?.lifecycle === "completed" && authoritativeState.completedSnapshot.result === "TARGET_REACHED",
      diagnostic: problem,
    });
  }
  function validateHistory(records) {
    const resolved = resolveAuthoritativeHistory(records);
    if (resolved.status !== "valid") fail(resolved.diagnostic?.code || "MEASUREMENT_HISTORY_CONFLICT", resolved.diagnostic?.message || "История измерений повреждена.");
    return deepFreeze([...records].sort((left, right) => left.epoch - right.epoch).map(clone));
  }
  function safeDestination(value, projectId) { try { const url = new URL(value, "http://localhost"); return { valid: url.pathname === ROUTE_PATH && projectIdentityFromLocation(url) === projectId }; } catch { return { valid: false }; } }
  function projectIdentityFromLocation(location) { const url = location instanceof URL ? location : new URL(location.href); if (url.pathname !== ROUTE_PATH || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_MISMATCH", "Ссылка на измерение недействительна."); return validateUuid(url.searchParams.get("project")); }

  const api = Object.freeze({ KIND, PROGRESS_KIND: KIND, SCHEMA_VERSION, ROUTE_PATH, LIFECYCLES, RESULTS, FoundationSectionMeasurementError, canonicalize, fingerprint, validateUuid, validateTimestamp, diagnostic, parseMeasurementInput, compareHeight, assessSource, deterministicIdentity, createInitialState, completeMeasurement, reviewMeasurement, reviseMeasurement, confirmMeasurement, validateProgressState, resolveAuthoritativeHistory, validateHistory, safeDestination, projectIdentityFromLocation });
  globalObject.YarnAIFoundationSectionMeasurement = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
