"use strict";

(function exposePrimaryFabricExecution(globalObject) {
  const KIND = "PRIMARY_FABRIC_EXECUTION";
  const SCHEMA_VERSION = 1;
  const ROUTE_PATH = "/project-primary-fabric-execution";
  const LIFECYCLES = Object.freeze(["ready", "active", "paused"]);
  const TRANSITIONS = Object.freeze({ ready: Object.freeze(["active"]), active: Object.freeze(["paused"]), paused: Object.freeze(["active"]) });
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const STATE_KEYS = Object.freeze(["kind", "schemaVersion", "identity", "projectId", "calculationId", "lifecycle", "revision", "source", "executionPlan", "physicalResult", "operations", "timestamps", "fingerprint"]);
  const SOURCE_KEYS = Object.freeze(["stage65ProgressIdentity", "stage65ProgressRevision", "stage65PlanIdentity", "stage65PlanFingerprint", "stepIdentity", "stepFingerprint", "stage72ProgressIdentity", "stage72ProgressRevision", "stage72StateIdentity", "stage72StateRevision", "stage72StateFingerprint", "stage72SnapshotFingerprint", "stage72SourceFingerprint", "stage73ProgressIdentity", "stage73ProgressRevision", "stage73StateIdentity", "stage73StateRevision", "stage73StateFingerprint", "stage73CompletedSnapshotFingerprint", "stage73SourceFingerprint", "predecessorIdentity"]);
  const PLAN_KEYS = Object.freeze(["step", "stitchCount", "knittingMethod", "tool", "mainPattern", "patternRepeat", "sectionTarget", "direction"]);
  const STEP_KEYS = Object.freeze(["identity", "sequenceNumber", "type", "dependencyIdentity"]);
  const VALUE_KEYS = Object.freeze(["value", "origin"]);
  const TARGET_KEYS = Object.freeze(["kind", "value", "unit", "origin"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "startedAt", "lastPausedAt", "lastResumedAt"]);
  const OPERATION_KEYS = Object.freeze(["operationId", "command", "payloadFingerprint", "resultingRevision", "at"]);

  class PrimaryFabricExecutionError extends Error {
    constructor(code, userMessage, details = {}) { super(userMessage); this.name = "PrimaryFabricExecutionError"; this.code = code; this.userMessage = userMessage; this.details = clone(details); }
  }
  function fail(code, message, details) { throw new PrimaryFabricExecutionError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
  function exactKeys(value, keys, code = "EXECUTION_STATE_CORRUPTED") { if (!record(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "Сохранённое выполнение основного полотна повреждено."); }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("EXECUTION_STATE_CORRUPTED", "Сохранённое значение повреждено."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("EXECUTION_STATE_CORRUPTED", "Сохранённое выполнение содержит неподдерживаемое значение.");
  }
  function fingerprint(value) { const text = canonicalize(value); let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`; }
  function semanticState(value) { const result = clone(value); delete result.fingerprint; return result; }
  function stateFingerprint(value) { return fingerprint(semanticState(value)); }
  function validateUuid(value, code = "PROJECT_MISMATCH") { if (!UUID_V7.test(value || "")) fail(code, "Ссылка на проект недействительна."); return value; }
  function validateTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "Время выполнения повреждено."); return value; }
  function nonEmptyText(value, message) { if (typeof value !== "string" || !value.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) fail("EXECUTION_STATE_CORRUPTED", message); return value; }
  function diagnostic(code, fallback = "Не удалось безопасно открыть выполнение основного полотна.") {
    const messages = {
      PROJECT_MISMATCH: "Откройте выполнение из нужного сохранённого проекта.", CALCULATION_MISMATCH: "Активный расчёт проекта изменился.",
      STAGE73_MISSING: "Сначала завершите подготовку основного полотна.", STAGE73_INCOMPLETE: "Подготовка основного полотна ещё не завершена.", STAGE73_CONFLICT: "Сохранённые подготовки основного полотна конфликтуют.", STAGE73_CORRUPTED: "Подтверждённая подготовка основного полотна повреждена.",
      TARGET_NOT_REACHED: "Основное полотно доступно только после подтверждённой высоты резинки.", SOURCE_STALE: "Исходные данные проекта изменились. Выполнение остановлено для защиты проекта.",
      REVISION_CONFLICT: "Выполнение изменено в другой вкладке. Обновите страницу.", EXECUTION_STATE_CORRUPTED: "Сохранённое выполнение основного полотна повреждено.", STORAGE_UNAVAILABLE: "Проверка проекта временно недоступна.",
    };
    return deepFreeze({ code, message: messages[code] || fallback, recovery: { label: "Вернуться к проектам", path: "/saved-projects" } });
  }
  function activeRecords(progress, kind) { return (Array.isArray(progress) ? progress : []).filter((entry) => entry?.kind === kind && !entry.deleted_at); }
  function unsafe(entry) { return !record(entry) || entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN" || entry.imported_unproven || entry.stale; }
  function assessSource(input = {}) {
    const projectId = input.projectId || input.projectIdentity; let calculationId = null;
    try {
      validateUuid(projectId); const project = input.project;
      if (!record(project) || project.project_id !== projectId || ["DELETED", "QUARANTINED"].includes(project.workspace_status)) fail("PROJECT_MISMATCH", "Проект не совпадает со ссылкой.");
      calculationId = validateUuid(project.active_calculation_id, "CALCULATION_MISMATCH"); const stage73 = input.stage73Domain;
      if (!stage73 || !input.stage63Domain || !input.stage65Domain || !input.stage66Domain || !input.stage67Domain || !input.stage68Domain || !input.stage69Domain || !input.stage70Domain || !input.stage71Domain || !input.stage72Domain) fail("STORAGE_UNAVAILABLE", "Проверка authoritative chain недоступна.");
      const progress = Array.isArray(input.progress) ? input.progress : [];
      const preparationAssessment = stage73.assessSource({ projectId, project, progress, stage63Domain: input.stage63Domain, stage65Domain: input.stage65Domain, stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain, stage68Domain: input.stage68Domain, stage69Domain: input.stage69Domain, stage70Domain: input.stage70Domain, stage71Domain: input.stage71Domain, stage72Domain: input.stage72Domain, validatedAt: input.validatedAt || new Date().toISOString() });
      if (preparationAssessment.lifecycle !== "ready") fail(preparationAssessment.diagnostic?.code || "SOURCE_STALE", preparationAssessment.diagnostic?.message);
      const all = activeRecords(progress, stage73.KIND);
      if (!all.length) fail("STAGE73_MISSING", "Подготовка основного полотна не найдена.");
      if (all.some((entry) => entry.project_id !== projectId)) fail("PROJECT_MISMATCH", "Подготовка относится к другому проекту.");
      if (all.some((entry) => entry.calculation_id !== calculationId)) fail("CALCULATION_MISMATCH", "Подготовка относится к другому расчёту.");
      if (all.length !== 1 || all.some(unsafe)) fail("STAGE73_CONFLICT", "Сохранённые подготовки основного полотна конфликтуют.");
      const preparationRecord = all[0]; let preparation;
      try { preparation = stage73.validateProgressState(preparationRecord.state, { assessment: preparationAssessment }); }
      catch (error) { fail(error?.code === "SOURCE_STALE" ? "SOURCE_STALE" : "STAGE73_CORRUPTED", error?.userMessage || "Подтверждённая подготовка повреждена."); }
      if (preparation.lifecycle !== "completed" || preparation.confirmation?.explicit !== true) fail("STAGE73_INCOMPLETE", "Подготовка основного полотна ещё не завершена.");
      const source = {
        stage65ProgressIdentity: preparation.source.stage65ProgressIdentity, stage65ProgressRevision: preparation.source.stage65ProgressRevision, stage65PlanIdentity: preparation.source.stage65PlanIdentity, stage65PlanFingerprint: preparation.source.stage65PlanFingerprint, stepIdentity: preparation.source.stepIdentity, stepFingerprint: preparation.source.stepFingerprint,
        stage72ProgressIdentity: preparation.source.stage72ProgressIdentity, stage72ProgressRevision: preparation.source.stage72ProgressRevision, stage72StateIdentity: preparation.source.stage72StateIdentity, stage72StateRevision: preparation.source.stage72StateRevision, stage72StateFingerprint: preparation.source.stage72StateFingerprint, stage72SnapshotFingerprint: preparation.source.stage72SnapshotFingerprint, stage72SourceFingerprint: preparation.source.stage72SourceFingerprint,
        stage73ProgressIdentity: preparationRecord.progress_id, stage73ProgressRevision: preparationRecord.revision, stage73StateIdentity: preparation.identity, stage73StateRevision: preparation.revision, stage73StateFingerprint: preparation.fingerprint, stage73CompletedSnapshotFingerprint: preparation.fingerprint, stage73SourceFingerprint: stage73.fingerprint(preparation.source), predecessorIdentity: preparation.predecessorStage72Identity,
      };
      const executionPlan = { step: clone(preparation.preparation.step), stitchCount: preparation.preparation.knownContext.stitchCount, knittingMethod: clone(preparation.preparation.knownContext.workingMethod), tool: preparation.preparation.knownContext.toolLabel, mainPattern: clone(preparation.preparation.mainPattern), patternRepeat: clone(preparation.preparation.patternRepeat), sectionTarget: clone(preparation.preparation.sectionTarget), direction: preparation.preparation.knownContext.direction };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, projectRevision: project.revision, source, executionPlan, diagnostic: null });
    } catch (error) { return deepFreeze({ lifecycle: "blocked", projectId: UUID_V7.test(projectId || "") ? projectId : null, calculationId, diagnostic: diagnostic(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message) }); }
  }
  function requireReady(value) { if (value?.lifecycle !== "ready") fail(value?.diagnostic?.code || "SOURCE_STALE", value?.diagnostic?.message || "Исходные данные проекта изменились."); return value; }
  function deterministicIdentity(assessmentSource) { const assessment = requireReady(assessmentSource); return `${assessment.projectId}:primary-fabric-execution:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: assessment.projectId, calculationId: assessment.calculationId, source: assessment.source })}`; }
  function createInitialState(assessmentSource, metadata = {}) {
    const assessment = requireReady(assessmentSource); const at = validateTimestamp(metadata.createdAt || metadata.timestamp);
    const value = { kind: KIND, schemaVersion: SCHEMA_VERSION, identity: deterministicIdentity(assessment), projectId: assessment.projectId, calculationId: assessment.calculationId, lifecycle: "ready", revision: 1, source: clone(assessment.source), executionPlan: clone(assessment.executionPlan), physicalResult: null, operations: [], timestamps: { createdAt: at, startedAt: null, lastPausedAt: null, lastResumedAt: null }, fingerprint: "" };
    value.fingerprint = stateFingerprint(value); return validateProgressState(value, { assessment });
  }
  function operationReceipt(operationId, command, payload, revision, at) { return { operationId: validateUuid(operationId, "OPERATION_ID_CONFLICT"), command, payloadFingerprint: fingerprint(payload), resultingRevision: revision, at: validateTimestamp(at) }; }
  function transition(stateSource, target, metadata = {}) {
    const assessment = requireReady(metadata.assessment); const state = validateProgressState(stateSource, { assessment }); const command = target === "paused" ? "pause" : state.lifecycle === "paused" ? "resume" : "start"; const payload = { command, target, identity: state.identity };
    validateUuid(metadata.operationId, "OPERATION_ID_CONFLICT"); const replay = state.operations.find((entry) => entry.operationId === metadata.operationId);
    if (replay) { if (replay.command !== command || replay.payloadFingerprint !== fingerprint(payload)) fail("OPERATION_ID_CONFLICT", "Эта операция уже использована для другого действия."); return state; }
    if (metadata.expectedRevision !== state.revision || metadata.expectedFingerprint !== state.fingerprint) fail("REVISION_CONFLICT", "Выполнение изменено в другой вкладке.");
    if (!TRANSITIONS[state.lifecycle]?.includes(target)) fail("INVALID_LIFECYCLE_TRANSITION", "Это действие недоступно в текущем состоянии.");
    const at = validateTimestamp(metadata.timestamp); const next = clone(state); next.lifecycle = target; next.revision += 1; if (command === "start") next.timestamps.startedAt = at; if (command === "pause") next.timestamps.lastPausedAt = at; if (command === "resume") next.timestamps.lastResumedAt = at; next.operations.push(operationReceipt(metadata.operationId, command, payload, next.revision, at)); next.fingerprint = stateFingerprint(next); return validateProgressState(next, { assessment });
  }
  function startExecution(state, metadata) { return transition(state, "active", metadata); }
  function pauseExecution(state, metadata) { return transition(state, "paused", metadata); }
  function resumeExecution(state, metadata) { return transition(state, "active", metadata); }
  function validateSource(value) {
    exactKeys(value, SOURCE_KEYS); ["stage65ProgressIdentity", "stage72ProgressIdentity", "stage73ProgressIdentity"].forEach((key) => validateUuid(value[key], "EXECUTION_STATE_CORRUPTED"));
    ["stage65ProgressRevision", "stage72ProgressRevision", "stage72StateRevision", "stage73ProgressRevision", "stage73StateRevision"].forEach((key) => { if (!Number.isSafeInteger(value[key]) || value[key] < 1) fail("EXECUTION_STATE_CORRUPTED", "Ревизии источников повреждены."); });
    ["stage65PlanIdentity", "stepIdentity", "stage72StateIdentity", "stage73StateIdentity", "predecessorIdentity"].forEach((key) => nonEmptyText(value[key], "Идентификатор источника повреждён."));
    ["stage65PlanFingerprint", "stepFingerprint", "stage72StateFingerprint", "stage72SnapshotFingerprint", "stage72SourceFingerprint", "stage73StateFingerprint", "stage73CompletedSnapshotFingerprint", "stage73SourceFingerprint"].forEach((key) => { if (!FINGERPRINT.test(value[key] || "")) fail("EXECUTION_STATE_CORRUPTED", "Fingerprint источника повреждён."); });
    if (value.predecessorIdentity !== value.stage72StateIdentity || value.stage73CompletedSnapshotFingerprint !== value.stage73StateFingerprint) fail("EXECUTION_STATE_CORRUPTED", "Связь с физическим результатом или завершённой подготовкой повреждена."); return value;
  }
  function validatePlan(value) {
    exactKeys(value, PLAN_KEYS); exactKeys(value.step, STEP_KEYS);
    if (value.step.sequenceNumber !== 3 || value.step.type !== "PRIMARY_FABRIC" || value.stitchCount !== 100) fail("EXECUTION_STATE_CORRUPTED", "Шаг основного полотна повреждён.");
    if (!record(value.knittingMethod) || !["in_round", "flat"].includes(value.knittingMethod.value)) fail("EXECUTION_STATE_CORRUPTED", "Способ вязания повреждён.");
    nonEmptyText(value.tool, "Инструмент повреждён."); for (const key of ["mainPattern", "patternRepeat"]) { exactKeys(value[key], VALUE_KEYS); nonEmptyText(value[key].value, "Параметры узора повреждены."); if (value[key].origin !== "user_provided") fail("EXECUTION_STATE_CORRUPTED", "Provenance узора повреждён."); }
    exactKeys(value.sectionTarget, TARGET_KEYS); if (value.sectionTarget.kind !== "height" || !Number.isFinite(value.sectionTarget.value) || value.sectionTarget.value <= 0 || value.sectionTarget.unit !== "cm" || value.sectionTarget.origin !== "user_provided") fail("EXECUTION_STATE_CORRUPTED", "Цель основного полотна повреждена.");
    if (!["bottom_up", "top_down", "unknown"].includes(value.direction)) fail("EXECUTION_STATE_CORRUPTED", "Направление из плана повреждено."); return value;
  }
  function validateProgressState(source, options = {}) {
    exactKeys(source, STATE_KEYS); const value = clone(source); canonicalize(value); validateUuid(value.projectId); validateUuid(value.calculationId, "CALCULATION_MISMATCH");
    if (value.kind !== KIND || value.schemaVersion !== SCHEMA_VERSION || !LIFECYCLES.includes(value.lifecycle) || !Number.isSafeInteger(value.revision) || value.revision < 1) fail("EXECUTION_STATE_CORRUPTED", "Состояние выполнения повреждено.");
    validateSource(value.source); validatePlan(value.executionPlan); if (value.executionPlan.step.identity !== value.source.stepIdentity) fail("EXECUTION_STATE_CORRUPTED", "Шаг не соответствует источнику.");
    if (value.identity !== `${value.projectId}:primary-fabric-execution:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: value.projectId, calculationId: value.calculationId, source: value.source })}`) fail("EXECUTION_STATE_CORRUPTED", "Идентификатор выполнения повреждён.");
    if (value.physicalResult !== null) fail("PHYSICAL_RESULT_NOT_ALLOWED", "30 см подтверждаются только отдельным физическим измерением.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS); validateTimestamp(value.timestamps.createdAt); ["startedAt", "lastPausedAt", "lastResumedAt"].forEach((key) => { if (value.timestamps[key] !== null) validateTimestamp(value.timestamps[key]); });
    if (!Array.isArray(value.operations) || value.operations.length > 128) fail("EXECUTION_STATE_CORRUPTED", "История выполнения повреждена.");
    if (value.lifecycle === "ready" && (value.timestamps.startedAt !== null || value.operations.length !== 0 || value.revision !== 1)) fail("EXECUTION_STATE_CORRUPTED", "Начальное состояние выполнения повреждено.");
    if (["active", "paused"].includes(value.lifecycle) && value.timestamps.startedAt === null) fail("EXECUTION_STATE_CORRUPTED", "Начало выполнения не зафиксировано.");
    const ids = new Set(); let previousRevision = 1; value.operations.forEach((entry) => { exactKeys(entry, OPERATION_KEYS); validateUuid(entry.operationId, "EXECUTION_STATE_CORRUPTED"); validateTimestamp(entry.at); if (ids.has(entry.operationId) || !["start", "pause", "resume"].includes(entry.command) || !FINGERPRINT.test(entry.payloadFingerprint) || entry.resultingRevision !== previousRevision + 1) fail("EXECUTION_STATE_CORRUPTED", "История выполнения повреждена."); ids.add(entry.operationId); previousRevision = entry.resultingRevision; });
    if (value.revision !== previousRevision || value.fingerprint !== stateFingerprint(value)) fail("EXECUTION_STATE_CORRUPTED", "Целостность выполнения нарушена.");
    if (options.assessment?.lifecycle === "ready" && (value.projectId !== options.assessment.projectId || value.calculationId !== options.assessment.calculationId || canonicalize(value.source) !== canonicalize(options.assessment.source) || canonicalize(value.executionPlan) !== canonicalize(options.assessment.executionPlan))) fail("SOURCE_STALE", "Исходные данные проекта изменились."); return deepFreeze(value);
  }
  function safeDestination(value, projectId) { try { const url = new URL(value, "http://localhost"); return { valid: url.pathname === ROUTE_PATH && projectIdentityFromLocation(url) === projectId }; } catch { return { valid: false }; } }
  function projectIdentityFromLocation(location) { const url = location instanceof URL ? location : new URL(location.href); if (url.pathname !== ROUTE_PATH || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_MISMATCH", "Ссылка на выполнение недействительна."); return validateUuid(url.searchParams.get("project")); }
  const api = Object.freeze({ KIND, PROGRESS_KIND: KIND, SCHEMA_VERSION, ROUTE_PATH, LIFECYCLES, TRANSITIONS, PrimaryFabricExecutionError, canonicalize, fingerprint, validateUuid, validateTimestamp, diagnostic, assessSource, deterministicIdentity, createInitialState, startExecution, pauseExecution, resumeExecution, validateProgressState, safeDestination, projectIdentityFromLocation });
  globalObject.YarnAIPrimaryFabricExecution = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
