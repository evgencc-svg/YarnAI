"use strict";

(function initializeProjectNextSectionPlanning(globalObject) {
  const FORMAT = "yarnai-project-next-section-planning";
  const VERSION = 1;
  const KIND = "PROJECT_NEXT_SECTION_PLANNING";
  const PROGRESS_KIND = KIND;
  const ROUTE_PATH = "/project-next-section-planning";
  const LIFECYCLES = Object.freeze(["completed"]);
  const DIRECTIONS = Object.freeze(["bottom_up", "top_down"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "calculationId", "lifecycle", "revision",
    "source", "boundary", "knownInputs", "derivations", "clarification", "remainingMissingInputs",
    "planOutcome", "timestamps", "audit", "fingerprint",
  ]);
  const SOURCE_KEYS = Object.freeze([
    "stage65ProgressIdentity", "stage65ProgressRevision", "predecessorPlanIdentity", "predecessorPlanFingerprint",
    "completedStepIdentity", "completedStepFingerprint", "stage70ProgressIdentity", "stage70ProgressRevision",
    "stage70StateIdentity", "stage70StateFingerprint", "stage75ProgressIdentity", "stage75ProgressRevision",
    "stage75StateIdentity", "stage75StateFingerprint", "stage75SnapshotFingerprint", "stage75SourceFingerprint",
  ]);
  const BOUNDARY_KEYS = Object.freeze(["reason", "predecessorPlanExhausted", "authoritativeResult", "successor"]);
  const KNOWN_KEYS = Object.freeze([
    "garmentType", "garmentLengthCm", "armholeDepthCm", "necklineDepthCm", "sleeveLengthCm",
    "workingWidthCm", "stitchCount", "stitchesPer10Cm", "rowsPer10Cm", "workingMethod",
    "foundationType", "foundationHeightCm", "mainPattern", "patternRepeat", "primaryFabricHeightCm",
  ]);
  const DERIVATION_KEYS = Object.freeze(["bottomUpArmholeStartCm", "bottomUpAdditionalHeightCm", "condition"]);
  const CLARIFICATION_KEYS = Object.freeze(["input", "value", "provenance"]);
  const PLAN_OUTCOME_KEYS = Object.freeze(["status", "newPlan", "reason", "nextMissingInput"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "completedAt"]);
  const AUDIT_KEYS = Object.freeze(["event", "operationId", "explicitConfirmation"]);
  const PROGRESS_KEYS = Object.freeze(["kind", "version", "projectId", "calculationId", "lifecycle", "snapshot"]);

  class ProjectNextSectionPlanningError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "ProjectNextSectionPlanningError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function fail(code, message, details) { throw new ProjectNextSectionPlanningError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function exactKeys(value, keys, code = "SNAPSHOT_NOT_ALLOWLISTED") {
    if (!record(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(code, "Сохранённое планирование повреждено.");
  }
  function text(value, limit = 420, code = "SNAPSHOT_INVALID") {
    const result = typeof value === "string" ? value.trim() : "";
    if (!result || result.length > limit || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(result)) fail(code, "Сохранённое планирование содержит недопустимый текст.");
    return result;
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("VALUE_INVALID", "Числовое значение повреждено."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("SNAPSHOT_INVALID", "Сохранённое планирование содержит неподдерживаемое значение.");
  }
  function fingerprint(value) { const input = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function semanticSnapshot(value) { const result = clone(value); delete result.fingerprint; return result; }
  function validateTimestamp(value) { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "Время подтверждения повреждено."); return value; }
  function validateUuid(value, code = "PROJECT_ID_INVALID") { if (!UUID_V7.test(value || "")) fail(code, "Ссылка на проект недействительна."); return value; }
  function unsafe(entry) { return !record(entry) || entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN" || entry.imported_unproven || entry.stale; }
  function activeRecords(progress, kind, calculationId) { return (Array.isArray(progress) ? progress : []).filter((entry) => entry?.kind === kind && entry?.calculation_id === calculationId && !entry.deleted_at); }
  function numberAt(value, path) { let current = value; for (const key of path) current = current?.[key]; return Number.isFinite(current) ? current : null; }
  function diagnostic(code, fallback = "Не удалось безопасно открыть планирование следующего участка.") {
    const messages = {
      PROJECT_ID_INVALID: "Откройте планирование из сохранённого проекта.", PROJECT_NOT_FOUND: "Проект не найден.", PROJECT_MISMATCH: "Сохранённые данные относятся к другому проекту.",
      CALCULATION_MISSING: "Активный расчёт проекта отсутствует.", SOURCE_DEPENDENCY_MISSING: "Проверка исходной цепочки временно недоступна.",
      STAGE75_REQUIRED: "Сначала подтвердите целевую высоту основного полотна.", STAGE75_BELOW_TARGET: "Основное полотно ещё не достигло целевой высоты.",
      STAGE75_CONFLICT: "История измерений основного полотна конфликтует.", STAGE75_SOURCE_STALE: "Физический результат построен по устаревшей цепочке.",
      PREDECESSOR_PLAN_INVALID: "Предыдущий immutable-план повреждён.", PREDECESSOR_PLAN_NOT_EXHAUSTED: "В текущем плане ещё есть подтверждённый следующий шаг.",
      PROJECT_CONTEXT_MISSING: "В проекте не хватает подтверждённых мерок для следующего планирования.", SOURCE_CONFLICT: "Исходные данные конструкции конфликтуют.",
      REVISION_CONFLICT: "Проект изменён в другой вкладке. Обновите страницу.", STORAGE_UNAVAILABLE: "Не удалось открыть сохранённые данные.",
    };
    return deepFreeze({ code, message: messages[code] || fallback, recovery: { path: "/saved-projects", label: "К проектам" } });
  }
  function blocked(code, message, projectId = null, calculationId = null) { return deepFreeze({ lifecycle: "blocked", projectId, calculationId, source: null, knownInputs: null, derivations: null, firstMissingInput: null, diagnostic: diagnostic(code, message) }); }

  function stage75Assessment(input, projectId) {
    return input.stage75Domain.assessSource({
      projectId, project: input.project, progress: input.progress, stage63Domain: input.stage63Domain,
      stage65Domain: input.stage65Domain, stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain,
      stage68Domain: input.stage68Domain, stage69Domain: input.stage69Domain, stage70Domain: input.stage70Domain,
      stage71Domain: input.stage71Domain, stage72Domain: input.stage72Domain, stage73Domain: input.stage73Domain,
      stage74Domain: input.stage74Domain, validatedAt: input.validatedAt || new Date().toISOString(),
    });
  }

  function assessSource(input = {}) {
    const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
    let calculationId = null;
    try {
      validateUuid(projectId);
      if (!record(input.project)) fail("PROJECT_NOT_FOUND", "Проект не найден.");
      if (input.project.project_id !== projectId) fail("PROJECT_MISMATCH", "Проект не совпадает со ссылкой.");
      calculationId = validateUuid(input.project.active_calculation_id, "CALCULATION_MISSING");
      const required = ["stage63Domain", "stage65Domain", "stage66Domain", "stage67Domain", "stage68Domain", "stage69Domain", "stage70Domain", "stage71Domain", "stage72Domain", "stage73Domain", "stage74Domain", "stage75Domain"];
      if (required.some((name) => !input[name])) fail("SOURCE_DEPENDENCY_MISSING", "Проверка source chain недоступна.");

      const measurements = activeRecords(input.progress, input.stage75Domain.KIND, calculationId);
      if (!measurements.length) fail("STAGE75_REQUIRED", "Подтверждённое измерение не найдено.");
      if (measurements.some((entry) => entry.project_id !== projectId || unsafe(entry))) fail("STAGE75_CONFLICT", "Сохранённые измерения конфликтуют.");
      const history = input.stage75Domain.resolveAuthoritativeHistory(measurements);
      if (history.status !== "valid" || !history.authoritativeRecord || !history.authoritativeState) fail("STAGE75_CONFLICT", history.diagnostic?.message);
      const measurementRecord = history.authoritativeRecord;
      const measurement = history.authoritativeState;
      if (measurement.lifecycle !== "completed") fail("STAGE75_REQUIRED", "Измерение ещё не завершено.");
      if (measurement.completedSnapshot?.result === "BELOW_TARGET") fail("STAGE75_BELOW_TARGET", "Целевая высота ещё не достигнута.");
      if (!history.terminalReached || measurement.completedSnapshot?.result !== "TARGET_REACHED") fail("STAGE75_CONFLICT", "Неизвестный результат измерения.");

      const currentAssessment = stage75Assessment(input, projectId);
      if (currentAssessment.lifecycle !== "ready") fail("STAGE75_SOURCE_STALE", currentAssessment.diagnostic?.message);
      try { input.stage75Domain.validateProgressState(measurement, { assessment: currentAssessment }); }
      catch (error) { fail("STAGE75_SOURCE_STALE", error?.userMessage || error?.message); }

      const planRecords = activeRecords(input.progress, input.stage65Domain.KIND, calculationId);
      if (planRecords.length !== 1 || planRecords.some((entry) => entry.project_id !== projectId || unsafe(entry))) fail("PREDECESSOR_PLAN_INVALID", "Предыдущий план конфликтует.");
      const planRecord = planRecords[0];
      let planState;
      try { planState = input.stage65Domain.validateProgressState(planRecord.state, { projectIdentity: projectId, calculationId }); }
      catch (error) { fail("PREDECESSOR_PLAN_INVALID", error?.userMessage || error?.message); }
      const plan = planState.history.at(-1);
      const completedStep = plan?.steps?.at(-1);
      if (!plan || plan.lifecycle !== "completed" || plan.identity !== measurement.source.stage65PlanIdentity || plan.fingerprint !== measurement.source.stage65PlanFingerprint || plan.identity !== measurement.source.stage65PlanSnapshot.identity || plan.fingerprint !== measurement.source.stage65PlanSnapshot.fingerprint) fail("PREDECESSOR_PLAN_INVALID", "Stage 65 binding не совпадает.");
      if (!completedStep || completedStep.type !== "PRIMARY_FABRIC" || completedStep.identity !== measurement.source.stepIdentity || measurement.context.successor?.status !== "absent" || measurement.context.successor?.step !== null) fail("PREDECESSOR_PLAN_NOT_EXHAUSTED", "Текущий план не исчерпан.");
      if (plan.steps.length !== 3 || plan.steps.map((step) => step.type).join("|") !== "CAST_ON|FOUNDATION_SECTION|PRIMARY_FABRIC") fail("PREDECESSOR_PLAN_INVALID", "Неожиданная структура predecessor plan.");

      const preparations = activeRecords(input.progress, input.stage70Domain.KIND, calculationId);
      if (preparations.length !== 1 || preparations.some((entry) => entry.project_id !== projectId || unsafe(entry))) fail("SOURCE_CONFLICT", "Подготовка начального участка конфликтует.");
      const stage70Record = preparations[0];
      const stage70State = input.stage70Domain.validateProgressState(stage70Record.state, { allowSourceInvalid: true });
      if (stage70State.lifecycle !== "completed" || !stage70State.completedSnapshot) fail("SOURCE_CONFLICT", "Способ работы не подтверждён.");
      const workingMethod = stage70State.completedSnapshot.executionParameters?.workingMethod?.value;
      if (!['flat', 'in_round'].includes(workingMethod)) fail("SOURCE_CONFLICT", "Способ работы повреждён.");

      const sizing = plan.sizingContext;
      const garmentLengthCm = numberAt(sizing, ["garment", "garmentLength", "value"]);
      const armholeDepthCm = numberAt(sizing, ["body", "armholeDepth", "value"]);
      const necklineDepthCm = numberAt(sizing, ["garment", "necklineDepth", "value"]);
      const sleeveLengthCm = numberAt(sizing, ["garment", "sleeveLength", "value"]);
      if (![garmentLengthCm, armholeDepthCm, necklineDepthCm, sleeveLengthCm].every((value) => value !== null && value > 0) || garmentLengthCm <= armholeDepthCm) fail("PROJECT_CONTEXT_MISSING", "Нужные мерки не найдены.");
      const primaryHeight = measurement.completedSnapshot.targetHeightCm;
      const armholeStart = garmentLengthCm - armholeDepthCm;
      const knownInputs = {
        garmentType: text(plan.garmentContext?.type, 180, "PROJECT_CONTEXT_MISSING"), garmentLengthCm, armholeDepthCm, necklineDepthCm, sleeveLengthCm,
        workingWidthCm: plan.calculationContext?.workingWidthCm, stitchCount: measurement.source.stage74ExecutionPlan.stitchCount,
        stitchesPer10Cm: plan.gaugeContext?.stitchesPer10Cm, rowsPer10Cm: plan.gaugeContext?.rowsPer10Cm, workingMethod,
        foundationType: stage70State.completedSnapshot.confirmedContext?.foundationType, foundationHeightCm: stage70State.completedSnapshot.confirmedContext?.target?.value,
        mainPattern: measurement.source.stage74ExecutionPlan.mainPattern.value, patternRepeat: measurement.source.stage74ExecutionPlan.patternRepeat.value,
        primaryFabricHeightCm: primaryHeight,
      };
      if (![knownInputs.workingWidthCm, knownInputs.stitchCount, knownInputs.stitchesPer10Cm, knownInputs.rowsPer10Cm, knownInputs.foundationHeightCm, knownInputs.primaryFabricHeightCm].every((value) => Number.isFinite(value) && value > 0) || !knownInputs.foundationType || !knownInputs.mainPattern || !knownInputs.patternRepeat) fail("PROJECT_CONTEXT_MISSING", "Подтверждённый practical context неполон.");
      const source = {
        stage65ProgressIdentity: planRecord.progress_id, stage65ProgressRevision: planRecord.revision, predecessorPlanIdentity: plan.identity, predecessorPlanFingerprint: plan.fingerprint,
        completedStepIdentity: completedStep.identity, completedStepFingerprint: fingerprint(completedStep), stage70ProgressIdentity: stage70Record.progress_id, stage70ProgressRevision: stage70Record.revision,
        stage70StateIdentity: stage70State.identity, stage70StateFingerprint: stage70State.fingerprint, stage75ProgressIdentity: measurementRecord.progress_id,
        stage75ProgressRevision: measurementRecord.revision, stage75StateIdentity: measurement.identity, stage75StateFingerprint: measurement.fingerprint,
        stage75SnapshotFingerprint: measurement.completedSnapshot.fingerprint, stage75SourceFingerprint: fingerprint(measurement.source),
      };
      const derivations = { bottomUpArmholeStartCm: armholeStart, bottomUpAdditionalHeightCm: Math.max(0, armholeStart - primaryHeight), condition: "only_if_direction_bottom_up_and_no_intermediate_shaping" };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, projectRevision: input.project.revision, source, knownInputs, derivations, firstMissingInput: "construction_direction", remainingMissingInputs: ["construction_strategy", "shaping_policy", "joining_strategy", "finishing_strategy"], diagnostic: null });
    } catch (error) { return blocked(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message, UUID_V7.test(projectId) ? projectId : null, calculationId); }
  }

  function deterministicIdentity(assessment) { if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Планирование нельзя сохранить без актуального source chain."); return `${assessment.projectId}:next-section-planning:${fingerprint({ projectId: assessment.projectId, calculationId: assessment.calculationId, source: assessment.source, input: assessment.firstMissingInput })}`; }
  function createCompletedSnapshot(assessment, input = {}, metadata = {}) {
    if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Планирование нельзя сохранить без актуального source chain.");
    const direction = typeof input.direction === "string" ? input.direction.trim() : "";
    if (!DIRECTIONS.includes(direction)) fail("DIRECTION_REQUIRED", "Выберите направление вязания изделия.");
    if (metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Подтвердите выбранное направление.");
    const at = validateTimestamp(metadata.timestamp || metadata.completedAt); const operationId = validateUuid(metadata.operationId, "OPERATION_ID_INVALID");
    const value = {
      format: FORMAT, version: VERSION, identity: deterministicIdentity(assessment), projectIdentity: assessment.projectId, calculationId: assessment.calculationId,
      lifecycle: "completed", revision: 1, source: clone(assessment.source), boundary: { reason: "IMMUTABLE_PLAN_EXHAUSTED", predecessorPlanExhausted: true, authoritativeResult: "TARGET_REACHED", successor: null },
      knownInputs: clone(assessment.knownInputs), derivations: clone(assessment.derivations), clarification: { input: "construction_direction", value: direction, provenance: "user_confirmed_at_plan_extension_boundary" },
      remainingMissingInputs: clone(assessment.remainingMissingInputs), planOutcome: { status: "awaiting_more_inputs", newPlan: null, reason: "DIRECTION_ONLY_INSUFFICIENT_FOR_SAFE_SUCCESSOR", nextMissingInput: "construction_strategy" },
      timestamps: { createdAt: at, completedAt: at }, audit: { event: "NEXT_SECTION_DIRECTION_CONFIRMED", operationId, explicitConfirmation: true }, fingerprint: "",
    };
    value.fingerprint = fingerprint(semanticSnapshot(value)); return validateSnapshot(value);
  }

  function validateSnapshot(source) {
    exactKeys(source, SNAPSHOT_KEYS); canonicalize(source); const value = clone(source);
    if (value.format !== FORMAT || value.version !== VERSION || value.lifecycle !== "completed" || value.revision !== 1) fail("SNAPSHOT_INVALID", "Lifecycle планирования повреждён.");
    validateUuid(value.projectIdentity); validateUuid(value.calculationId, "CALCULATION_MISMATCH"); text(value.identity, 500); exactKeys(value.source, SOURCE_KEYS);
    ["stage65ProgressIdentity", "stage70ProgressIdentity", "stage75ProgressIdentity"].forEach((key) => validateUuid(value.source[key], "SNAPSHOT_INVALID"));
    ["stage65ProgressRevision", "stage70ProgressRevision", "stage75ProgressRevision"].forEach((key) => { if (!Number.isSafeInteger(value.source[key]) || value.source[key] < 1) fail("SNAPSHOT_INVALID", "Revision source chain повреждена."); });
    ["predecessorPlanIdentity", "completedStepIdentity", "stage70StateIdentity", "stage75StateIdentity"].forEach((key) => text(value.source[key], 500));
    ["predecessorPlanFingerprint", "completedStepFingerprint", "stage70StateFingerprint", "stage75StateFingerprint", "stage75SnapshotFingerprint", "stage75SourceFingerprint"].forEach((key) => { if (!FINGERPRINT.test(value.source[key] || "")) fail("SNAPSHOT_INVALID", "Fingerprint source chain повреждён."); });
    exactKeys(value.boundary, BOUNDARY_KEYS); if (canonicalize(value.boundary) !== canonicalize({ reason: "IMMUTABLE_PLAN_EXHAUSTED", predecessorPlanExhausted: true, authoritativeResult: "TARGET_REACHED", successor: null })) fail("SNAPSHOT_INVALID", "Граница predecessor plan повреждена.");
    exactKeys(value.knownInputs, KNOWN_KEYS); exactKeys(value.derivations, DERIVATION_KEYS); exactKeys(value.clarification, CLARIFICATION_KEYS);
    if (value.clarification.input !== "construction_direction" || !DIRECTIONS.includes(value.clarification.value) || value.clarification.provenance !== "user_confirmed_at_plan_extension_boundary") fail("SNAPSHOT_INVALID", "Уточнение направления повреждено.");
    if (!Array.isArray(value.remainingMissingInputs) || canonicalize(value.remainingMissingInputs) !== canonicalize(["construction_strategy", "shaping_policy", "joining_strategy", "finishing_strategy"])) fail("SNAPSHOT_INVALID", "Remaining inputs повреждены.");
    exactKeys(value.planOutcome, PLAN_OUTCOME_KEYS); if (value.planOutcome.status !== "awaiting_more_inputs" || value.planOutcome.newPlan !== null || value.planOutcome.reason !== "DIRECTION_ONLY_INSUFFICIENT_FOR_SAFE_SUCCESSOR" || value.planOutcome.nextMissingInput !== "construction_strategy") fail("SNAPSHOT_INVALID", "Plan outcome повреждён.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS); validateTimestamp(value.timestamps.createdAt); validateTimestamp(value.timestamps.completedAt); if (value.timestamps.createdAt !== value.timestamps.completedAt) fail("SNAPSHOT_INVALID", "Время immutable snapshot повреждено.");
    exactKeys(value.audit, AUDIT_KEYS); if (value.audit.event !== "NEXT_SECTION_DIRECTION_CONFIRMED" || value.audit.explicitConfirmation !== true) fail("SNAPSHOT_INVALID", "Audit планирования повреждён."); validateUuid(value.audit.operationId, "OPERATION_ID_INVALID");
    if (value.fingerprint !== fingerprint(semanticSnapshot(value))) fail("FINGERPRINT_MISMATCH", "Fingerprint планирования не совпадает с содержимым.");
    return deepFreeze(value);
  }
  function validateBinding(snapshotSource, assessment) {
    const snapshot = validateSnapshot(snapshotSource); if (assessment?.lifecycle !== "ready") fail("SOURCE_STALE", "Source chain больше не актуален.");
    if (snapshot.projectIdentity !== assessment.projectId || snapshot.calculationId !== assessment.calculationId || canonicalize(snapshot.source) !== canonicalize(assessment.source) || canonicalize(snapshot.knownInputs) !== canonicalize(assessment.knownInputs) || canonicalize(snapshot.derivations) !== canonicalize(assessment.derivations)) fail("SOURCE_STALE", "Планирование построено по другой source chain.");
    return snapshot;
  }
  function createProgressState(snapshotSource) { const snapshot = validateSnapshot(snapshotSource); return deepFreeze({ kind: KIND, version: VERSION, projectId: snapshot.projectIdentity, calculationId: snapshot.calculationId, lifecycle: snapshot.lifecycle, snapshot: clone(snapshot) }); }
  function validateProgressState(source, options = {}) { exactKeys(source, PROGRESS_KEYS, "PROGRESS_STATE_INVALID"); if (source.kind !== KIND || source.version !== VERSION || source.lifecycle !== "completed") fail("PROGRESS_STATE_INVALID", "Состояние планирования повреждено."); const snapshot = validateSnapshot(source.snapshot); if (source.projectId !== snapshot.projectIdentity || source.calculationId !== snapshot.calculationId || options.projectIdentity && source.projectId !== options.projectIdentity || options.calculationId && source.calculationId !== options.calculationId) fail("PROJECT_MISMATCH", "Состояние относится к другому проекту."); return deepFreeze({ ...clone(source), snapshot: clone(snapshot) }); }
  function projectIdentityFromLocation(location) { const url = location instanceof URL ? location : new URL(location.href); if (url.pathname !== ROUTE_PATH || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_ID_INVALID", "Ссылка на планирование недействительна."); return validateUuid(url.searchParams.get("project")); }
  function safeDestination(value, projectId) { try { const url = new URL(value, "http://localhost"); return { valid: url.pathname === ROUTE_PATH && projectIdentityFromLocation(url) === projectId }; } catch { return { valid: false }; } }

  const api = Object.freeze({ FORMAT, VERSION, KIND, PROGRESS_KIND, ROUTE_PATH, LIFECYCLES, DIRECTIONS, ProjectNextSectionPlanningError, canonicalize, fingerprint, diagnostic, assessSource, deterministicIdentity, createCompletedSnapshot, validateSnapshot, validateBinding, createProgressState, validateProgressState, projectIdentityFromLocation, safeDestination });
  globalObject.YarnAIProjectNextSectionPlanning = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
