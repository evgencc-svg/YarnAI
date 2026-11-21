"use strict";

(function initializeProjectShapingPolicyPlanning(globalObject) {
  const FORMAT = "yarnai-project-shaping-policy-planning";
  const VERSION = 2;
  const LEGACY_VERSION = 1;
  const KIND = "PROJECT_SHAPING_POLICY_PLANNING";
  const PROGRESS_KIND = KIND;
  const ROUTE_PATH = "/project-shaping-policy-planning";
  const REQUIRED_CONSTRUCTION_IDENTITY = "construction-strategy:body-sleeves-joined-raglan:v1";
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const SNAPSHOT_KEYS = Object.freeze(["format", "version", "identity", "projectIdentity", "calculationId", "lifecycle", "revision", "source", "boundary", "knownInputs", "availablePolicies", "derivations", "clarification", "remainingMissingInputs", "planOutcome", "timestamps", "audit", "fingerprint"]);
  const SOURCE_KEYS = Object.freeze(["stage65ProgressIdentity", "stage65ProgressRevision", "predecessorPlanIdentity", "predecessorPlanFingerprint", "primaryFabricStepIdentity", "primaryFabricStepFingerprint", "stage75ProgressIdentity", "stage75ProgressRevision", "stage75StateIdentity", "stage75StateFingerprint", "stage75SnapshotFingerprint", "stage76ProgressIdentity", "stage76ProgressRevision", "stage76SnapshotIdentity", "stage76SnapshotRevision", "stage76SnapshotFingerprint", "stage76SourceFingerprint", "confirmedConstructionDirection", "stage77ProgressIdentity", "stage77ProgressRevision", "stage77SnapshotIdentity", "stage77SnapshotRevision", "stage77SnapshotFingerprint", "stage77SourceFingerprint", "confirmedConstructionStrategyIdentity"]);
  const BOUNDARY_KEYS = Object.freeze(["predecessorPlanningKind", "predecessorPlanningIdentity", "predecessorPlanningRevision", "predecessorPlanningFingerprint", "predecessorOutcome"]);
  const KNOWN_KEYS = Object.freeze(["garmentType", "workingMethod", "stitchCount", "primaryFabricHeightCm", "garmentLengthCm", "armholeDepthCm", "constructionDirection", "constructionStrategy", "constructionStrategyIdentity"]);
  const POLICY_KEYS = Object.freeze(["identity", "value", "label", "description", "distribution"]);
  const DERIVATION_KEYS = Object.freeze(["armholeStartCm", "currentHeightCm", "additionalHeightToArmholeCm", "formula", "informationalOnly"]);
  const CLARIFICATION_KEYS = Object.freeze(["input", "policyIdentity", "value", "provenance"]);
  const LEGACY_OUTCOME_KEYS = Object.freeze(["status", "newPlan", "reason", "nextMissingInput", "remainingInputs"]);
  const OUTCOME_KEYS = Object.freeze(["status", "newPlan", "reason", "nextMissingInput", "remainingInputs", "blockingPrerequisites"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "completedAt"]);
  const AUDIT_KEYS = Object.freeze(["event", "operationId", "explicitConfirmation"]);
  const PROGRESS_KEYS = Object.freeze(["kind", "version", "projectId", "calculationId", "lifecycle", "snapshot"]);

  const POLICY_CATALOG = Object.freeze([
    Object.freeze({
      identity: "shaping-policy:raglan-synchronized:v1",
      value: "raglan_synchronized",
      label: "Равномерный реглан",
      description: "Корпус и рукава формируются синхронно у четырёх линий реглана. Точный ритм и числа будут рассчитаны после остальных уточнений.",
      distribution: "body_and_sleeve_sections_decrease_together_on_shaping_rounds",
    }),
    Object.freeze({
      identity: "shaping-policy:raglan-differentiated:v1",
      value: "raglan_differentiated",
      label: "Раздельный ритм корпуса и рукавов",
      description: "Корпус и рукава могут формироваться с разным рассчитанным ритмом у линий реглана. Точные ряды и числа будут определены позже.",
      distribution: "body_and_sleeve_sections_use_independently_calculated_decrease_cadence",
    }),
  ]);
  const INCOMPATIBLE_VALUES = Object.freeze(["no_shaping", "round_yoke_decreases", "set_in_armhole_shaping", "top_down_increases"]);
  const BLOCKING_PREREQUISITES = Object.freeze([
    "sleeve_construction_and_target_geometry",
    "two_completed_measured_sleeves",
    "sleeve_stitch_counts_at_underarm",
    "body_and_sleeve_underarm_stitch_allocation",
    "combined_yoke_section_balance",
  ]);

  class ProjectShapingPolicyPlanningError extends Error {
    constructor(code, userMessage, details = {}) { super(userMessage); this.name = "ProjectShapingPolicyPlanningError"; this.code = code; this.userMessage = userMessage; this.details = clone(details); }
  }
  function fail(code, message, details) { throw new ProjectShapingPolicyPlanningError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function exactKeys(value, keys, code = "SNAPSHOT_NOT_ALLOWLISTED") { if (!record(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(code, "Сохранённая политика формирования повреждена."); }
  function text(value, limit = 500, code = "SNAPSHOT_INVALID") { const result = typeof value === "string" ? value.trim() : ""; if (!result || result.length > limit || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(result)) fail(code, "Сохранённое решение содержит недопустимый текст."); return result; }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("VALUE_INVALID", "Числовое значение повреждено."); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("SNAPSHOT_INVALID", "Сохранённое решение содержит неподдерживаемое значение.");
  }
  function fingerprint(value) { const input = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return `fnv1a32:${hash.toString(16).padStart(8, "0")}`; }
  function semanticSnapshot(value) { const result = clone(value); delete result.fingerprint; return result; }
  function validateUuid(value, code = "PROJECT_ID_INVALID") { if (!UUID_V7.test(value || "")) fail(code, "Ссылка на проект недействительна."); return value; }
  function validateTimestamp(value) { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "Время подтверждения повреждено."); return value; }
  function unsafe(entry) { return !record(entry) || entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN" || entry.imported_unproven || entry.stale; }
  function activeRecords(progress, kind, calculationId) { return (Array.isArray(progress) ? progress : []).filter((entry) => entry?.kind === kind && entry?.calculation_id === calculationId && !entry.deleted_at); }
  function diagnostic(code, fallback = "Не удалось безопасно открыть выбор формирования реглана.") {
    const messages = { PROJECT_ID_INVALID: "Откройте формирование реглана из сохранённого проекта.", PROJECT_NOT_FOUND: "Проект не найден.", PROJECT_MISMATCH: "Сохранённые данные относятся к другому проекту.", CALCULATION_MISSING: "Активный расчёт проекта отсутствует.", STAGE77_REQUIRED: "Сначала подтвердите конструкцию верха.", STAGE77_CONFLICT: "Сохранённые решения о конструкции конфликтуют.", STAGE77_SOURCE_STALE: "Конструкция построена по устаревшей цепочке.", CONSTRUCTION_INCOMPATIBLE: "Этот этап доступен только для подтверждённого реглана снизу вверх.", POLICY_INCOMPATIBLE: "Выбранный способ формирования несовместим с подтверждённым регланом.", REVISION_CONFLICT: "Проект изменён в другой вкладке. Обновите страницу.", STORAGE_UNAVAILABLE: "Не удалось открыть сохранённые данные." };
    return deepFreeze({ code, message: messages[code] || fallback, recovery: { path: "/saved-projects", label: "К проектам" } });
  }
  function blocked(code, message, projectId = null, calculationId = null) { return deepFreeze({ lifecycle: "blocked", projectId, calculationId, source: null, knownInputs: null, availablePolicies: [], derivations: null, firstMissingInput: null, diagnostic: diagnostic(code, message) }); }
  function policyByValue(value) { return POLICY_CATALOG.find((entry) => entry.value === value) || null; }
  function validatePolicy(value) { exactKeys(value, POLICY_KEYS); POLICY_KEYS.forEach((key) => text(value[key], key === "description" ? 600 : 240)); const canonical = policyByValue(value.value); if (!canonical || canonicalize(value) !== canonicalize(canonical)) fail("POLICY_INVALID", "Вариант формирования повреждён."); return clone(canonical); }
  function availablePoliciesFor(context) { return context?.constructionDirection === "bottom_up" && context?.workingMethod === "in_round" && context?.constructionStrategyIdentity === REQUIRED_CONSTRUCTION_IDENTITY ? deepFreeze(POLICY_CATALOG.map(clone)) : deepFreeze([]); }
  function correctedPlanOutcome() {
    return deepFreeze({
      status: "blocked_on_prerequisites",
      newPlan: null,
      reason: "EXECUTION_GEOMETRY_PREREQUISITES_REQUIRED_BEFORE_SAFE_PLAN_EXTENSION",
      nextMissingInput: null,
      remainingInputs: [],
      blockingPrerequisites: clone(BLOCKING_PREREQUISITES),
    });
  }

  function assessSource(input = {}) {
    const projectId = typeof input.projectId === "string" ? input.projectId.trim() : ""; let calculationId = null;
    try {
      validateUuid(projectId); if (!record(input.project)) fail("PROJECT_NOT_FOUND", "Проект не найден."); if (input.project.project_id !== projectId) fail("PROJECT_MISMATCH", "Проект не совпадает со ссылкой."); calculationId = validateUuid(input.project.active_calculation_id, "CALCULATION_MISSING");
      const required = ["stage63Domain", "stage65Domain", "stage66Domain", "stage67Domain", "stage68Domain", "stage69Domain", "stage70Domain", "stage71Domain", "stage72Domain", "stage73Domain", "stage74Domain", "stage75Domain", "stage76Domain", "stage77Domain"];
      if (required.some((name) => !input[name])) fail("SOURCE_DEPENDENCY_MISSING", "Проверка source chain недоступна.");
      const dependencies77 = {}; required.slice(0, -1).forEach((name) => { dependencies77[name] = input[name]; });
      const assessment77 = input.stage77Domain.assessSource({ projectId, project: input.project, progress: input.progress, ...dependencies77, validatedAt: input.validatedAt });
      if (assessment77.lifecycle !== "ready") fail("STAGE77_SOURCE_STALE", assessment77.diagnostic?.message);
      const records77 = activeRecords(input.progress, input.stage77Domain.KIND, calculationId);
      if (!records77.length) fail("STAGE77_REQUIRED", "Подтверждённая конструкция не найдена.");
      if (records77.length !== 1 || records77.some((entry) => entry.project_id !== projectId || unsafe(entry))) fail("STAGE77_CONFLICT", "Сохранённые решения о конструкции конфликтуют.");
      const record77 = records77[0]; if (record77.revision !== 1) fail("STAGE77_CONFLICT", "Immutable Stage 77 имеет неожиданную repository revision."); let state77;
      try { state77 = input.stage77Domain.validateProgressState(record77.state, { projectIdentity: projectId, calculationId }); input.stage77Domain.validateBinding(state77.snapshot, assessment77); } catch (error) { fail("STAGE77_SOURCE_STALE", error?.userMessage || error?.message); }
      const snapshot77 = state77.snapshot;
      if (snapshot77.lifecycle !== "completed" || snapshot77.planOutcome?.status !== "awaiting_more_inputs" || snapshot77.planOutcome?.nextMissingInput !== "shaping_policy" || snapshot77.planOutcome?.newPlan !== null) fail("STAGE77_CONFLICT", "Stage 77 не находится на границе выбора формирования.");
      if (snapshot77.clarification?.strategyIdentity !== REQUIRED_CONSTRUCTION_IDENTITY || snapshot77.clarification?.value !== "body_sleeves_joined_raglan") fail("CONSTRUCTION_INCOMPATIBLE", "Подтверждённая конструкция не является регланом снизу вверх.");
      const knownInputs = { garmentType: snapshot77.knownInputs.garmentType, workingMethod: snapshot77.knownInputs.workingMethod, stitchCount: snapshot77.knownInputs.stitchCount, primaryFabricHeightCm: snapshot77.knownInputs.primaryFabricHeightCm, garmentLengthCm: snapshot77.knownInputs.garmentLengthCm, armholeDepthCm: snapshot77.knownInputs.armholeDepthCm, constructionDirection: snapshot77.knownInputs.constructionDirection, constructionStrategy: snapshot77.clarification.value, constructionStrategyIdentity: snapshot77.clarification.strategyIdentity };
      const availablePolicies = availablePoliciesFor(knownInputs); if (!availablePolicies.length) fail("CONSTRUCTION_INCOMPATIBLE", "Для этой конструкции нет безопасных вариантов формирования.");
      const s = snapshot77.source;
      const source = { ...clone(s), stage77ProgressIdentity: record77.progress_id, stage77ProgressRevision: record77.revision, stage77SnapshotIdentity: snapshot77.identity, stage77SnapshotRevision: snapshot77.revision, stage77SnapshotFingerprint: snapshot77.fingerprint, stage77SourceFingerprint: fingerprint(snapshot77.source), confirmedConstructionStrategyIdentity: snapshot77.clarification.strategyIdentity };
      const derivations = { armholeStartCm: snapshot77.derivations.armholeStartCm, currentHeightCm: snapshot77.derivations.currentHeightCm, additionalHeightToArmholeCm: snapshot77.derivations.additionalHeightToArmholeCm, formula: "garmentLengthCm - armholeDepthCm", informationalOnly: true };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, projectRevision: input.project.revision, source, knownInputs, availablePolicies, derivations, firstMissingInput: "shaping_policy", remainingMissingInputs: [], diagnostic: null });
    } catch (error) { return blocked(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message, UUID_V7.test(projectId) ? projectId : null, calculationId); }
  }

  function deterministicIdentity(assessment) { if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Решение нельзя сохранить без актуальной source chain."); return `${assessment.projectId}:shaping-policy-planning:${fingerprint({ projectId: assessment.projectId, calculationId: assessment.calculationId, source: assessment.source, input: assessment.firstMissingInput })}`; }
  function createCompletedSnapshot(assessment, input = {}, metadata = {}) {
    if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Решение нельзя сохранить без актуальной source chain.");
    const requested = typeof input.policy === "string" ? input.policy.trim() : ""; if (INCOMPATIBLE_VALUES.includes(requested)) fail("POLICY_INCOMPATIBLE", "Этот способ формирования несовместим с подтверждённым регланом."); const selected = policyByValue(requested);
    if (!selected) fail("POLICY_REQUIRED", "Выберите, как распределять формирование реглана."); if (!assessment.availablePolicies.some((entry) => entry.identity === selected.identity)) fail("POLICY_INCOMPATIBLE", "Выбранный способ формирования несовместим с проектом."); if (metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Подтвердите выбранный способ формирования.");
    const at = validateTimestamp(metadata.timestamp || metadata.completedAt); const operationId = validateUuid(metadata.operationId, "OPERATION_ID_INVALID");
    const value = { format: FORMAT, version: VERSION, identity: deterministicIdentity(assessment), projectIdentity: assessment.projectId, calculationId: assessment.calculationId, lifecycle: "completed", revision: 1, source: clone(assessment.source), boundary: { predecessorPlanningKind: "PROJECT_CONSTRUCTION_STRATEGY_PLANNING", predecessorPlanningIdentity: assessment.source.stage77SnapshotIdentity, predecessorPlanningRevision: assessment.source.stage77SnapshotRevision, predecessorPlanningFingerprint: assessment.source.stage77SnapshotFingerprint, predecessorOutcome: "awaiting_more_inputs:shaping_policy" }, knownInputs: clone(assessment.knownInputs), availablePolicies: clone(assessment.availablePolicies), derivations: clone(assessment.derivations), clarification: { input: "shaping_policy", policyIdentity: selected.identity, value: selected.value, provenance: "user_confirmed_after_bottom_up_joined_raglan_selection" }, remainingMissingInputs: [], planOutcome: clone(correctedPlanOutcome()), timestamps: { createdAt: at, completedAt: at }, audit: { event: "SHAPING_POLICY_CONFIRMED", operationId, explicitConfirmation: true }, fingerprint: "" };
    value.fingerprint = fingerprint(semanticSnapshot(value)); return validateSnapshot(value);
  }
  function validateSnapshot(source) {
    const value = clone(source); exactKeys(value, SNAPSHOT_KEYS); if (value.format !== FORMAT || ![LEGACY_VERSION, VERSION].includes(value.version) || value.lifecycle !== "completed" || value.revision !== 1) fail("SNAPSHOT_INVALID", "Snapshot формирования повреждён."); validateUuid(value.projectIdentity); validateUuid(value.calculationId, "CALCULATION_MISSING"); if (value.identity !== `${value.projectIdentity}:shaping-policy-planning:${fingerprint({ projectId: value.projectIdentity, calculationId: value.calculationId, source: value.source, input: "shaping_policy" })}`) fail("SNAPSHOT_INVALID", "Identity формирования повреждён.");
    exactKeys(value.source, SOURCE_KEYS); ["stage65ProgressRevision", "stage75ProgressRevision", "stage76ProgressRevision", "stage76SnapshotRevision", "stage77ProgressRevision", "stage77SnapshotRevision"].forEach((key) => { if (!Number.isSafeInteger(value.source[key]) || value.source[key] < 1) fail("SNAPSHOT_INVALID", "Revision source chain повреждена."); }); ["stage65ProgressIdentity", "stage75ProgressIdentity", "stage76ProgressIdentity", "stage77ProgressIdentity"].forEach((key) => validateUuid(value.source[key], "SNAPSHOT_INVALID")); if (value.source.confirmedConstructionDirection !== "bottom_up" || value.source.confirmedConstructionStrategyIdentity !== REQUIRED_CONSTRUCTION_IDENTITY) fail("SNAPSHOT_INVALID", "Подтверждённая конструкция повреждена.");
    exactKeys(value.boundary, BOUNDARY_KEYS); if (value.boundary.predecessorPlanningKind !== "PROJECT_CONSTRUCTION_STRATEGY_PLANNING" || value.boundary.predecessorPlanningIdentity !== value.source.stage77SnapshotIdentity || value.boundary.predecessorPlanningRevision !== value.source.stage77SnapshotRevision || value.boundary.predecessorPlanningFingerprint !== value.source.stage77SnapshotFingerprint || value.boundary.predecessorOutcome !== "awaiting_more_inputs:shaping_policy") fail("SNAPSHOT_INVALID", "Граница Stage 77 повреждена.");
    exactKeys(value.knownInputs, KNOWN_KEYS); if (value.knownInputs.workingMethod !== "in_round" || value.knownInputs.constructionDirection !== "bottom_up" || value.knownInputs.constructionStrategy !== "body_sleeves_joined_raglan" || value.knownInputs.constructionStrategyIdentity !== REQUIRED_CONSTRUCTION_IDENTITY || !Number.isSafeInteger(value.knownInputs.stitchCount) || value.knownInputs.stitchCount < 1) fail("SNAPSHOT_INVALID", "Контекст реглана повреждён."); ["primaryFabricHeightCm", "garmentLengthCm", "armholeDepthCm"].forEach((key) => { if (!Number.isFinite(value.knownInputs[key]) || value.knownInputs[key] <= 0) fail("SNAPSHOT_INVALID", "Размеры конструкции повреждены."); }); text(value.knownInputs.garmentType, 180);
    if (!Array.isArray(value.availablePolicies) || canonicalize(value.availablePolicies.map(validatePolicy)) !== canonicalize(POLICY_CATALOG)) fail("SNAPSHOT_INVALID", "Варианты формирования повреждены."); exactKeys(value.derivations, DERIVATION_KEYS); if (value.derivations.formula !== "garmentLengthCm - armholeDepthCm" || value.derivations.informationalOnly !== true) fail("SNAPSHOT_INVALID", "Справочный расчёт повреждён."); ["armholeStartCm", "currentHeightCm", "additionalHeightToArmholeCm"].forEach((key) => { if (!Number.isFinite(value.derivations[key]) || value.derivations[key] < 0) fail("SNAPSHOT_INVALID", "Справочный расчёт повреждён."); });
    exactKeys(value.clarification, CLARIFICATION_KEYS); const selected = policyByValue(value.clarification.value); if (value.clarification.input !== "shaping_policy" || !selected || value.clarification.policyIdentity !== selected.identity || value.clarification.provenance !== "user_confirmed_after_bottom_up_joined_raglan_selection") fail("SNAPSHOT_INVALID", "Уточнение формирования повреждено.");
    if (value.version === LEGACY_VERSION) {
      if (canonicalize(value.remainingMissingInputs) !== canonicalize(["joining_strategy", "finishing_strategy"])) fail("SNAPSHOT_INVALID", "Legacy remaining inputs повреждены.");
      exactKeys(value.planOutcome, LEGACY_OUTCOME_KEYS); if (value.planOutcome.status !== "awaiting_more_inputs" || value.planOutcome.newPlan !== null || value.planOutcome.reason !== "JOINING_STRATEGY_REQUIRED_BEFORE_SAFE_PLAN_EXTENSION" || value.planOutcome.nextMissingInput !== "joining_strategy" || canonicalize(value.planOutcome.remainingInputs) !== canonicalize(["joining_strategy", "finishing_strategy"])) fail("SNAPSHOT_INVALID", "Legacy plan outcome повреждён.");
    } else {
      if (canonicalize(value.remainingMissingInputs) !== canonicalize([])) fail("SNAPSHOT_INVALID", "Remaining inputs повреждены.");
      exactKeys(value.planOutcome, OUTCOME_KEYS); if (canonicalize(value.planOutcome) !== canonicalize(correctedPlanOutcome())) fail("SNAPSHOT_INVALID", "Plan outcome повреждён.");
    }
    exactKeys(value.timestamps, TIMESTAMP_KEYS); validateTimestamp(value.timestamps.createdAt); validateTimestamp(value.timestamps.completedAt); if (value.timestamps.createdAt !== value.timestamps.completedAt) fail("SNAPSHOT_INVALID", "Время immutable snapshot повреждено."); exactKeys(value.audit, AUDIT_KEYS); if (value.audit.event !== "SHAPING_POLICY_CONFIRMED" || value.audit.explicitConfirmation !== true) fail("SNAPSHOT_INVALID", "Audit решения повреждён."); validateUuid(value.audit.operationId, "OPERATION_ID_INVALID"); if (value.fingerprint !== fingerprint(semanticSnapshot(value))) fail("FINGERPRINT_MISMATCH", "Fingerprint решения не совпадает с содержимым."); return deepFreeze(value);
  }
  function resolvePlanOutcome(snapshotSource) { validateSnapshot(snapshotSource); return correctedPlanOutcome(); }
  function validateBinding(snapshotSource, assessment) { const snapshot = validateSnapshot(snapshotSource); if (assessment?.lifecycle !== "ready" || snapshot.projectIdentity !== assessment.projectId || snapshot.calculationId !== assessment.calculationId || canonicalize(snapshot.source) !== canonicalize(assessment.source) || canonicalize(snapshot.knownInputs) !== canonicalize(assessment.knownInputs) || canonicalize(snapshot.availablePolicies) !== canonicalize(assessment.availablePolicies) || canonicalize(snapshot.derivations) !== canonicalize(assessment.derivations)) fail("SOURCE_STALE", "Решение построено по другой source chain."); return snapshot; }
  function createProgressState(snapshotSource) { const snapshot = validateSnapshot(snapshotSource); return deepFreeze({ kind: KIND, version: snapshot.version, projectId: snapshot.projectIdentity, calculationId: snapshot.calculationId, lifecycle: snapshot.lifecycle, snapshot: clone(snapshot) }); }
  function validateProgressState(source, options = {}) { exactKeys(source, PROGRESS_KEYS, "PROGRESS_STATE_INVALID"); if (source.kind !== KIND || ![LEGACY_VERSION, VERSION].includes(source.version) || source.lifecycle !== "completed") fail("PROGRESS_STATE_INVALID", "Состояние формирования повреждено."); const snapshot = validateSnapshot(source.snapshot); if (source.version !== snapshot.version) fail("PROGRESS_STATE_INVALID", "Версия состояния не совпадает со snapshot."); if (source.projectId !== snapshot.projectIdentity || source.calculationId !== snapshot.calculationId || options.projectIdentity && source.projectId !== options.projectIdentity || options.calculationId && source.calculationId !== options.calculationId) fail("PROJECT_MISMATCH", "Состояние относится к другому проекту."); return deepFreeze({ ...clone(source), snapshot: clone(snapshot) }); }
  function projectIdentityFromLocation(location) { const url = location instanceof URL ? location : new URL(location.href); if (url.pathname !== ROUTE_PATH || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_ID_INVALID", "Ссылка на формирование реглана недействительна."); return validateUuid(url.searchParams.get("project")); }
  function safeDestination(value, projectId) { try { const url = new URL(value, "http://localhost"); return { valid: url.pathname === ROUTE_PATH && projectIdentityFromLocation(url) === projectId }; } catch { return { valid: false }; } }

  const api = Object.freeze({ FORMAT, VERSION, LEGACY_VERSION, KIND, PROGRESS_KIND, ROUTE_PATH, REQUIRED_CONSTRUCTION_IDENTITY, POLICY_CATALOG, BLOCKING_PREREQUISITES, ProjectShapingPolicyPlanningError, canonicalize, fingerprint, diagnostic, availablePoliciesFor, assessSource, deterministicIdentity, createCompletedSnapshot, validateSnapshot, resolvePlanOutcome, validateBinding, createProgressState, validateProgressState, projectIdentityFromLocation, safeDestination });
  globalObject.YarnAIProjectShapingPolicyPlanning = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
