"use strict";

(function exposePrimaryFabricPreparation(globalObject) {
  const KIND = "PRIMARY_FABRIC_PREPARATION";
  const SCHEMA_VERSION = 1;
  const ROUTE_PATH = "/project-primary-fabric-preparation";
  const LIFECYCLES = Object.freeze(["completed"]);
  const VIEW_LIFECYCLES = Object.freeze(["ready", "completed", "blocked"]);
  const REQUIRED_INPUTS = Object.freeze(["main_pattern", "pattern_repeat", "section_height"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const DECIMAL = /^(?:0|[1-9]\d*)(?:[.,]\d+)?$/;
  const STATE_KEYS = Object.freeze(["kind", "schemaVersion", "identity", "projectId", "calculationId", "lifecycle", "revision", "predecessorStage72Identity", "source", "preparation", "confirmation", "operationReceipt", "timestamps", "fingerprint"]);
  const SOURCE_KEYS = Object.freeze(["projectRevision", "stage65ProgressIdentity", "stage65ProgressRevision", "stage65PlanIdentity", "stage65PlanFingerprint", "stepIdentity", "stepFingerprint", "stage72ProgressIdentity", "stage72ProgressRevision", "stage72StateIdentity", "stage72StateRevision", "stage72StateFingerprint", "stage72SnapshotFingerprint", "stage72Source", "stage72SourceFingerprint"]);
  const PREPARATION_KEYS = Object.freeze(["step", "mainPattern", "patternRepeat", "sectionTarget", "knownContext"]);
  const STEP_KEYS = Object.freeze(["identity", "sequenceNumber", "type", "dependencyIdentity"]);
  const USER_VALUE_KEYS = Object.freeze(["value", "origin"]);
  const TARGET_KEYS = Object.freeze(["kind", "value", "unit", "origin"]);
  const CONTEXT_KEYS = Object.freeze(["stitchCount", "direction", "workingMethod", "toolLabel"]);
  const CONFIRMATION_KEYS = Object.freeze(["explicit", "confirmedAt"]);
  const RECEIPT_KEYS = Object.freeze(["operationId", "command", "payloadFingerprint", "resultingRevision", "at"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "completedAt"]);

  class PrimaryFabricPreparationError extends Error {
    constructor(code, userMessage, details = {}) { super(userMessage); this.name = "PrimaryFabricPreparationError"; this.code = code; this.userMessage = userMessage; this.details = clone(details); }
  }
  function fail(code, message, details) { throw new PrimaryFabricPreparationError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
  function exactKeys(value, keys, code = "PREPARATION_STATE_CORRUPTED") { if (!record(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "Сохранённая подготовка основного полотна повреждена."); }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("VALUE_INVALID", "Сохранённое значение повреждено."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("PREPARATION_STATE_CORRUPTED", "Сохранённая подготовка содержит неподдерживаемое значение.");
  }
  function fingerprint(value) { const text = canonicalize(value); let hash = 2166136261; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`; }
  function semanticState(value) { const result = clone(value); delete result.fingerprint; return result; }
  function stateFingerprint(value) { return fingerprint(semanticState(value)); }
  function validateUuid(value, code = "PROJECT_MISMATCH") { if (!UUID_V7.test(value || "")) fail(code, "Ссылка на проект недействительна."); return value; }
  function validateTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "Время подготовки повреждено."); return value; }
  function normalizeText(value, label, limit = 10000) {
    const normalized = typeof value === "string" ? value.trim().replace(/\r\n?/g, "\n") : "";
    if (!normalized) fail("PREPARATION_INPUT_REQUIRED", `Укажите ${label}.`);
    if ([...normalized].length > limit || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) fail("PREPARATION_INPUT_INVALID", `${label} содержит неподдерживаемые символы или слишком длинное значение.`);
    return normalized;
  }
  function parseHeight(value) {
    const raw = typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" ? value.trim() : "";
    if (!DECIMAL.test(raw)) fail("SECTION_HEIGHT_INVALID", "Укажите положительную высоту в сантиметрах.");
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) fail("SECTION_HEIGHT_INVALID", "Укажите положительную высоту в сантиметрах.");
    return parsed;
  }
  function diagnostic(code, fallback = "Не удалось безопасно открыть подготовку основного полотна.") {
    const messages = {
      PROJECT_MISMATCH: "Откройте подготовку из нужного сохранённого проекта.", CALCULATION_MISMATCH: "Активный расчёт проекта изменился.",
      STAGE72_MISSING: "Сначала физически измерьте резинку.", TARGET_NOT_REACHED: "Основное полотно доступно только после подтверждённой высоты резинки.",
      MEASUREMENT_HISTORY_CONFLICT: "История измерений повреждена; продолжение заблокировано.", MEASUREMENT_STATE_CORRUPTED: "Подтверждённое измерение повреждено.",
      STAGE65_CONFLICT: "Сохранённый план работы повреждён или конфликтует.", PRIMARY_FABRIC_STEP_INVALID: "Не удалось безопасно определить следующий участок проекта.",
      REQUIRED_INPUTS_UNSUPPORTED: "Не удалось безопасно определить недостающие данные основного полотна.", SOURCE_STALE: "Исходные данные проекта изменились.",
      REVISION_CONFLICT: "Проект изменён в другой вкладке. Обновите страницу.", STORAGE_UNAVAILABLE: "Сохранённые данные временно недоступны.",
    };
    return deepFreeze({ code, message: messages[code] || fallback, recovery: { path: "/saved-projects", label: "Мои проекты" } });
  }
  function blocked(code, message, projectId = null, calculationId = null) { return deepFreeze({ lifecycle: "blocked", projectId, calculationId, diagnostic: diagnostic(code, message) }); }
  function activeRecords(progress, kind) { return (Array.isArray(progress) ? progress : []).filter((entry) => entry?.kind === kind && !entry?.deleted_at); }
  function rejectUnsafeRecord(entry, code) { if (!record(entry) || entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN" || entry.imported_unproven || entry.stale) fail(code, "Сохранённая запись конфликтует или не подтверждена."); }

  function assessSource(input = {}) {
    const projectId = input.projectId || input.projectIdentity;
    let calculationId = null;
    try {
      validateUuid(projectId);
      const project = input.project;
      if (!record(project) || project.project_id !== projectId || ["DELETED", "QUARANTINED"].includes(project.workspace_status)) fail("PROJECT_MISMATCH", "Проект не совпадает со ссылкой.");
      calculationId = validateUuid(project.active_calculation_id, "CALCULATION_MISMATCH");
      const stage65 = input.stage65Domain; const stage72 = input.stage72Domain;
      if (!stage65 || !stage72 || !input.stage63Domain || !input.stage66Domain || !input.stage67Domain || !input.stage68Domain || !input.stage69Domain || !input.stage70Domain || !input.stage71Domain) fail("STORAGE_UNAVAILABLE", "Проверка authoritative chain недоступна.");
      const progress = Array.isArray(input.progress) ? input.progress : [];
      const stage72Assessment = stage72.assessSource({ projectId, project, progress, stage63Domain: input.stage63Domain, stage65Domain: stage65, stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain, stage68Domain: input.stage68Domain, stage69Domain: input.stage69Domain, stage70Domain: input.stage70Domain, stage71Domain: input.stage71Domain, validatedAt: input.validatedAt || new Date().toISOString() });
      if (stage72Assessment.lifecycle !== "ready") fail(stage72Assessment.diagnostic?.code || "SOURCE_STALE", stage72Assessment.diagnostic?.message);

      const measurements = activeRecords(progress, stage72.KIND);
      if (!measurements.length) fail("STAGE72_MISSING", "Физическое измерение не найдено.");
      if (measurements.some((entry) => entry.project_id !== projectId)) fail("PROJECT_MISMATCH", "Измерение относится к другому проекту.");
      if (measurements.some((entry) => entry.calculation_id !== calculationId)) fail("CALCULATION_MISMATCH", "Измерение относится к другому расчёту.");
      measurements.forEach((entry) => rejectUnsafeRecord(entry, "MEASUREMENT_HISTORY_CONFLICT"));
      const boundary = stage72.resolveAuthoritativeHistory(measurements);
      if (boundary.status !== "valid") fail(boundary.diagnostic?.code || "MEASUREMENT_HISTORY_CONFLICT", boundary.diagnostic?.message);
      if (!boundary.terminalReached || boundary.authoritativeState?.completedSnapshot?.result !== "TARGET_REACHED") fail("TARGET_NOT_REACHED", "Целевая высота резинки не подтверждена.");
      const measurementRecord = boundary.authoritativeRecord;
      const measurementState = stage72.validateProgressState(boundary.authoritativeState, { assessment: stage72Assessment });
      if (measurementState.lifecycle !== "completed" || measurementState.completedSnapshot.result !== "TARGET_REACHED") fail("TARGET_NOT_REACHED", "Целевая высота резинки не подтверждена.");

      const plans = activeRecords(progress, stage65.KIND);
      if (plans.some((entry) => entry.project_id !== projectId)) fail("PROJECT_MISMATCH", "План относится к другому проекту.");
      if (plans.some((entry) => entry.calculation_id !== calculationId)) fail("CALCULATION_MISMATCH", "План относится к другому расчёту.");
      if (plans.length !== 1) fail("STAGE65_CONFLICT", "Не найден единственный authoritative plan.");
      rejectUnsafeRecord(plans[0], "STAGE65_CONFLICT");
      let planState;
      try { planState = stage65.validateProgressState(plans[0].state, { projectIdentity: projectId, calculationId }); }
      catch (error) { fail("STAGE65_CONFLICT", error?.userMessage || error?.message); }
      const plan = planState.history?.at(-1);
      if (!plan || plan.lifecycle !== "completed") fail("STAGE65_CONFLICT", "Authoritative plan не завершён.");
      const step = plan.steps?.[2]; const predecessor = plan.steps?.[1];
      if (!step || !predecessor || step.sequenceNumber !== 3 || step.type !== "PRIMARY_FABRIC" || step.status !== "conditional" || step.dependencies?.length !== 1 || step.dependencies[0] !== predecessor.identity || predecessor.type !== "FOUNDATION_SECTION") fail("PRIMARY_FABRIC_STEP_INVALID", "Следующий шаг плана не является подготовкой основного полотна.");
      const required = Array.isArray(step.requiredInputs) ? [...new Set(step.requiredInputs)] : [];
      if (required.length !== REQUIRED_INPUTS.length || REQUIRED_INPUTS.some((name) => !required.includes(name)) || required.some((name) => !REQUIRED_INPUTS.includes(name))) fail("REQUIRED_INPUTS_UNSUPPORTED", "Набор недостающих данных не поддерживается.");
      if (step.expectedOutput?.pattern !== null || step.expectedOutput?.repeat !== null) fail("PRIMARY_FABRIC_STEP_INVALID", "План уже содержит значения, которые этот этап не должен заменять.");
      const context = { stitchCount: measurementState.context.stitchAllocation.totalCastOn, direction: plan.planScope?.boundedInputs?.direction || "unknown", workingMethod: clone(measurementState.context.workingMethod), toolLabel: normalizeText(measurementState.context.toolConfirmation?.label, "инструмент", 500) };
      if (context.stitchCount !== 100 || !["bottom_up", "top_down", "unknown"].includes(context.direction) || !record(context.workingMethod)) fail("PRIMARY_FABRIC_STEP_INVALID", "Практический контекст основного полотна повреждён.");
      const source = {
        projectRevision: project.revision, stage65ProgressIdentity: plans[0].progress_id, stage65ProgressRevision: plans[0].revision,
        stage65PlanIdentity: plan.identity, stage65PlanFingerprint: plan.fingerprint, stepIdentity: step.identity, stepFingerprint: stage65.fingerprint(step),
        stage72ProgressIdentity: measurementRecord.progress_id, stage72ProgressRevision: measurementRecord.revision,
        stage72StateIdentity: measurementState.identity, stage72StateRevision: measurementState.revision, stage72StateFingerprint: measurementState.fingerprint,
        stage72SnapshotFingerprint: measurementState.completedSnapshot.fingerprint, stage72Source: clone(measurementState.source), stage72SourceFingerprint: stage72.fingerprint(measurementState.source),
      };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, projectRevision: project.revision, source, step: { identity: step.identity, sequenceNumber: 3, type: "PRIMARY_FABRIC", dependencyIdentity: predecessor.identity }, requiredInputs: clone(REQUIRED_INPUTS), knownContext: context, diagnostic: null });
    } catch (error) { return blocked(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message, UUID_V7.test(projectId || "") ? projectId : null, calculationId); }
  }

  function requireReady(value) { if (value?.lifecycle !== "ready") fail(value?.diagnostic?.code || "SOURCE_STALE", value?.diagnostic?.message || "Исходные данные проекта изменились."); return value; }
  function deterministicIdentity(assessment) { const ready = requireReady(assessment); return `${ready.projectId}:primary-fabric-preparation:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: ready.projectId, calculationId: ready.calculationId, stage72StateIdentity: ready.source.stage72StateIdentity, stage72SnapshotFingerprint: ready.source.stage72SnapshotFingerprint, stepIdentity: ready.source.stepIdentity })}`; }
  function normalizedInput(input = {}) { return deepFreeze({ mainPattern: normalizeText(input.mainPattern, "узор основного полотна"), patternRepeat: normalizeText(input.patternRepeat, "раппорт узора"), sectionHeightCm: parseHeight(input.sectionHeightCm) }); }
  function createCompletedState(assessmentSource, input = {}, metadata = {}) {
    const assessment = requireReady(assessmentSource); const values = normalizedInput(input); const at = validateTimestamp(metadata.timestamp || metadata.completedAt); const operationId = validateUuid(metadata.operationId, "OPERATION_ID_CONFLICT");
    if (metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Сохраните подготовку явно.");
    const payload = { source: assessment.source, values };
    const state = {
      kind: KIND, schemaVersion: SCHEMA_VERSION, identity: deterministicIdentity(assessment), projectId: assessment.projectId, calculationId: assessment.calculationId,
      lifecycle: "completed", revision: 1, predecessorStage72Identity: assessment.source.stage72StateIdentity, source: clone(assessment.source),
      preparation: { step: clone(assessment.step), mainPattern: { value: values.mainPattern, origin: "user_provided" }, patternRepeat: { value: values.patternRepeat, origin: "user_provided" }, sectionTarget: { kind: "height", value: values.sectionHeightCm, unit: "cm", origin: "user_provided" }, knownContext: clone(assessment.knownContext) },
      confirmation: { explicit: true, confirmedAt: at }, operationReceipt: { operationId, command: "complete", payloadFingerprint: fingerprint(payload), resultingRevision: 1, at }, timestamps: { createdAt: at, completedAt: at }, fingerprint: "",
    };
    state.fingerprint = stateFingerprint(state); return validateProgressState(state, { assessment });
  }
  function validateSource(value) { exactKeys(value, SOURCE_KEYS); validateUuid(value.stage65ProgressIdentity, "PREPARATION_STATE_CORRUPTED"); validateUuid(value.stage72ProgressIdentity, "PREPARATION_STATE_CORRUPTED"); if (!Number.isSafeInteger(value.projectRevision) || value.projectRevision < 0 || !Number.isSafeInteger(value.stage65ProgressRevision) || value.stage65ProgressRevision < 1 || !Number.isSafeInteger(value.stage72ProgressRevision) || value.stage72ProgressRevision < 1 || !Number.isSafeInteger(value.stage72StateRevision) || value.stage72StateRevision < 2) fail("PREPARATION_STATE_CORRUPTED", "Ревизии источников повреждены."); ["stage65PlanIdentity", "stepIdentity", "stage72StateIdentity"].forEach((key) => normalizeText(value[key], "identity", 500)); ["stage65PlanFingerprint", "stepFingerprint", "stage72StateFingerprint", "stage72SnapshotFingerprint", "stage72SourceFingerprint"].forEach((key) => { if (!FINGERPRINT.test(value[key] || "")) fail("PREPARATION_STATE_CORRUPTED", "Fingerprint источника повреждён."); }); if (!record(value.stage72Source) || value.stage72SourceFingerprint !== fingerprint(value.stage72Source)) fail("PREPARATION_STATE_CORRUPTED", "Привязка к физическому результату повреждена."); return value; }
  function validateProgressState(source, options = {}) {
    exactKeys(source, STATE_KEYS); const value = clone(source); canonicalize(value); validateUuid(value.projectId); validateUuid(value.calculationId, "CALCULATION_MISMATCH");
    if (value.kind !== KIND || value.schemaVersion !== SCHEMA_VERSION || value.lifecycle !== "completed" || value.revision !== 1 || value.predecessorStage72Identity !== value.source?.stage72StateIdentity) fail("PREPARATION_STATE_CORRUPTED", "Состояние подготовки повреждено.");
    validateSource(value.source); exactKeys(value.preparation, PREPARATION_KEYS); exactKeys(value.preparation.step, STEP_KEYS); if (value.preparation.step.sequenceNumber !== 3 || value.preparation.step.type !== "PRIMARY_FABRIC" || value.preparation.step.identity !== value.source.stepIdentity) fail("PREPARATION_STATE_CORRUPTED", "Шаг основного полотна повреждён.");
    for (const key of ["mainPattern", "patternRepeat"]) { exactKeys(value.preparation[key], USER_VALUE_KEYS); normalizeText(value.preparation[key].value, key === "mainPattern" ? "узор основного полотна" : "раппорт узора"); if (value.preparation[key].origin !== "user_provided") fail("PREPARATION_STATE_CORRUPTED", "Provenance ответа повреждён."); }
    exactKeys(value.preparation.sectionTarget, TARGET_KEYS); if (value.preparation.sectionTarget.kind !== "height" || value.preparation.sectionTarget.unit !== "cm" || value.preparation.sectionTarget.origin !== "user_provided" || parseHeight(value.preparation.sectionTarget.value) !== value.preparation.sectionTarget.value) fail("PREPARATION_STATE_CORRUPTED", "Цель основного полотна повреждена.");
    exactKeys(value.preparation.knownContext, CONTEXT_KEYS); if (value.preparation.knownContext.stitchCount !== 100 || !["bottom_up", "top_down", "unknown"].includes(value.preparation.knownContext.direction) || !record(value.preparation.knownContext.workingMethod)) fail("PREPARATION_STATE_CORRUPTED", "Контекст основного полотна повреждён."); normalizeText(value.preparation.knownContext.toolLabel, "инструмент", 500);
    exactKeys(value.confirmation, CONFIRMATION_KEYS); if (value.confirmation.explicit !== true) fail("PREPARATION_STATE_CORRUPTED", "Подтверждение подготовки повреждено."); validateTimestamp(value.confirmation.confirmedAt);
    exactKeys(value.operationReceipt, RECEIPT_KEYS); validateUuid(value.operationReceipt.operationId, "PREPARATION_STATE_CORRUPTED"); if (value.operationReceipt.command !== "complete" || !FINGERPRINT.test(value.operationReceipt.payloadFingerprint || "") || value.operationReceipt.resultingRevision !== 1) fail("PREPARATION_STATE_CORRUPTED", "Operation receipt повреждён."); validateTimestamp(value.operationReceipt.at);
    const receiptValues = { mainPattern: value.preparation.mainPattern.value, patternRepeat: value.preparation.patternRepeat.value, sectionHeightCm: value.preparation.sectionTarget.value };
    if (value.operationReceipt.payloadFingerprint !== fingerprint({ source: value.source, values: receiptValues })) fail("PREPARATION_STATE_CORRUPTED", "Operation receipt не соответствует сохранённым ответам.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS); validateTimestamp(value.timestamps.createdAt); validateTimestamp(value.timestamps.completedAt); if (value.timestamps.createdAt !== value.timestamps.completedAt || value.timestamps.completedAt !== value.confirmation.confirmedAt || value.operationReceipt.at !== value.timestamps.completedAt) fail("PREPARATION_STATE_CORRUPTED", "Время подготовки не согласовано.");
    if (value.identity !== `${value.projectId}:primary-fabric-preparation:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: value.projectId, calculationId: value.calculationId, stage72StateIdentity: value.source.stage72StateIdentity, stage72SnapshotFingerprint: value.source.stage72SnapshotFingerprint, stepIdentity: value.source.stepIdentity })}` || value.fingerprint !== stateFingerprint(value)) fail("PREPARATION_STATE_CORRUPTED", "Целостность подготовки нарушена.");
    if (options.assessment?.lifecycle === "ready") validateBinding(value, options.assessment);
    return deepFreeze(value);
  }
  function validateBinding(stateSource, assessmentSource) {
    const assessment = requireReady(assessmentSource); const state = optionsFreeValidation(stateSource);
    const semanticSource = clone(assessment.source); semanticSource.projectRevision = state.source.projectRevision;
    if (state.projectId !== assessment.projectId || state.calculationId !== assessment.calculationId || state.identity !== deterministicIdentity(assessment) || canonicalize(state.source) !== canonicalize(semanticSource) || canonicalize(state.preparation.step) !== canonicalize(assessment.step) || canonicalize(state.preparation.knownContext) !== canonicalize(assessment.knownContext)) fail("SOURCE_STALE", "Подготовка не соответствует текущей authoritative chain.");
    return state;
  }
  function optionsFreeValidation(source) { return validateProgressState(source); }
  function safeDestination(value, projectId) { try { const url = new URL(value, "http://localhost"); return { valid: url.pathname === ROUTE_PATH && projectIdentityFromLocation(url) === projectId }; } catch { return { valid: false }; } }
  function projectIdentityFromLocation(location) { const url = location instanceof URL ? location : new URL(location.href); if (url.pathname !== ROUTE_PATH || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_MISMATCH", "Ссылка на подготовку недействительна."); return validateUuid(url.searchParams.get("project")); }

  const api = Object.freeze({ KIND, PROGRESS_KIND: KIND, SCHEMA_VERSION, ROUTE_PATH, LIFECYCLES, VIEW_LIFECYCLES, REQUIRED_INPUTS, PrimaryFabricPreparationError, canonicalize, fingerprint, validateUuid, validateTimestamp, normalizeText, parseHeight, diagnostic, assessSource, deterministicIdentity, normalizedInput, createCompletedState, validateProgressState, validateBinding, safeDestination, projectIdentityFromLocation });
  globalObject.YarnAIPrimaryFabricPreparation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
