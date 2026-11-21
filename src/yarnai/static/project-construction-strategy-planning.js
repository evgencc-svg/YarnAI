"use strict";

(function initializeProjectConstructionStrategyPlanning(globalObject) {
  const FORMAT = "yarnai-project-construction-strategy-planning";
  const VERSION = 1;
  const KIND = "PROJECT_CONSTRUCTION_STRATEGY_PLANNING";
  const PROGRESS_KIND = KIND;
  const ROUTE_PATH = "/project-construction-strategy-planning";
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const STRATEGY_KEYS = Object.freeze(["identity", "value", "label", "description", "topology"]);
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "calculationId", "lifecycle", "revision",
    "source", "boundary", "knownInputs", "availableStrategies", "derivations", "clarification",
    "remainingMissingInputs", "planOutcome", "timestamps", "audit", "fingerprint",
  ]);
  const SOURCE_KEYS = Object.freeze([
    "stage65ProgressIdentity", "stage65ProgressRevision", "predecessorPlanIdentity", "predecessorPlanFingerprint",
    "primaryFabricStepIdentity", "primaryFabricStepFingerprint", "stage75ProgressIdentity", "stage75ProgressRevision",
    "stage75StateIdentity", "stage75StateFingerprint", "stage75SnapshotFingerprint", "stage76ProgressIdentity",
    "stage76ProgressRevision", "stage76SnapshotIdentity", "stage76SnapshotRevision", "stage76SnapshotFingerprint",
    "stage76SourceFingerprint", "confirmedConstructionDirection",
  ]);
  const BOUNDARY_KEYS = Object.freeze(["predecessorPlanningKind", "predecessorPlanningIdentity", "predecessorPlanningRevision", "predecessorPlanningFingerprint", "predecessorOutcome"]);
  const KNOWN_KEYS = Object.freeze(["garmentType", "workingMethod", "stitchCount", "primaryFabricHeightCm", "garmentLengthCm", "armholeDepthCm", "constructionDirection"]);
  const DERIVATION_KEYS = Object.freeze(["armholeStartCm", "currentHeightCm", "additionalHeightToArmholeCm", "formula", "condition", "informationalOnly"]);
  const CLARIFICATION_KEYS = Object.freeze(["input", "strategyIdentity", "value", "provenance"]);
  const OUTCOME_KEYS = Object.freeze(["status", "newPlan", "reason", "nextMissingInput"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "completedAt"]);
  const AUDIT_KEYS = Object.freeze(["event", "operationId", "explicitConfirmation"]);
  const PROGRESS_KEYS = Object.freeze(["kind", "version", "projectId", "calculationId", "lifecycle", "snapshot"]);

  const STRATEGY_CATALOG = Object.freeze([
    Object.freeze({
      identity: "construction-strategy:body-split-set-in-sleeves:v1",
      value: "body_split_set_in_sleeves",
      label: "Корпус разделяется, рукава втачиваются",
      description: "Вязать корпус по кругу до пройм, затем перед и спинку отдельно; рукава связать отдельно и втачать.",
      topology: "single_body_to_armholes_then_front_back_with_separate_set_in_sleeves",
    }),
    Object.freeze({
      identity: "construction-strategy:body-split-drop-shoulder:v1",
      value: "body_split_drop_shoulder",
      label: "Корпус разделяется, плечо спущенное",
      description: "Вязать корпус по кругу, затем перед и спинку отдельно до плеч; рукава присоединить к прямой пройме.",
      topology: "single_body_then_front_back_with_drop_shoulders",
    }),
    Object.freeze({
      identity: "construction-strategy:body-sleeves-joined-raglan:v1",
      value: "body_sleeves_joined_raglan",
      label: "Корпус и рукава соединяются в реглан",
      description: "Связать корпус и рукава снизу вверх отдельно, соединить у пройм и формировать верх регланными убавками.",
      topology: "body_and_sleeves_joined_at_underarm_for_raglan_yoke",
    }),
    Object.freeze({
      identity: "construction-strategy:body-sleeves-joined-round-yoke:v1",
      value: "body_sleeves_joined_round_yoke",
      label: "Корпус и рукава соединяются в круглую кокетку",
      description: "Связать корпус и рукава снизу вверх отдельно, соединить у пройм и формировать круглую кокетку.",
      topology: "body_and_sleeves_joined_at_underarm_for_round_yoke",
    }),
  ]);
  const CONTEXT_INCOMPATIBLE_STRATEGIES = Object.freeze(["separate_flat_panels", "top_down_seamless_yoke"]);

  class ProjectConstructionStrategyPlanningError extends Error {
    constructor(code, userMessage, details = {}) { super(userMessage); this.name = "ProjectConstructionStrategyPlanningError"; this.code = code; this.userMessage = userMessage; this.details = clone(details); }
  }

  function fail(code, message, details) { throw new ProjectConstructionStrategyPlanningError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
  function exactKeys(value, keys, code = "SNAPSHOT_NOT_ALLOWLISTED") { if (!record(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(code, "Сохранённое решение о конструкции повреждено."); }
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
  function diagnostic(code, fallback = "Не удалось безопасно открыть выбор конструкции.") {
    const messages = {
      PROJECT_ID_INVALID: "Откройте выбор конструкции из сохранённого проекта.", PROJECT_NOT_FOUND: "Проект не найден.", PROJECT_MISMATCH: "Сохранённые данные относятся к другому проекту.", CALCULATION_MISSING: "Активный расчёт проекта отсутствует.",
      STAGE76_REQUIRED: "Сначала подтвердите направление вязания.", STAGE76_CONFLICT: "Сохранённое уточнение направления конфликтует.", STAGE76_SOURCE_STALE: "Уточнение направления построено по устаревшей цепочке.", DIRECTION_INCOMPATIBLE: "Этот этап доступен только для подтверждённого вязания снизу вверх.",
      WORKING_METHOD_INCOMPATIBLE: "Текущая версия выбора конструкции предназначена для корпуса, уже связанного по кругу.", STRATEGY_INCOMPATIBLE: "Выбранная конструкция несовместима с подтверждённым способом работы.", REVISION_CONFLICT: "Проект изменён в другой вкладке. Обновите страницу.", STORAGE_UNAVAILABLE: "Не удалось открыть сохранённые данные.",
    };
    return deepFreeze({ code, message: messages[code] || fallback, recovery: { path: "/saved-projects", label: "К проектам" } });
  }
  function blocked(code, message, projectId = null, calculationId = null) { return deepFreeze({ lifecycle: "blocked", projectId, calculationId, source: null, knownInputs: null, availableStrategies: [], derivations: null, firstMissingInput: null, diagnostic: diagnostic(code, message) }); }
  function strategyByValue(value) { return STRATEGY_CATALOG.find((entry) => entry.value === value) || null; }
  function validateStrategy(value) { exactKeys(value, STRATEGY_KEYS); STRATEGY_KEYS.forEach((key) => text(value[key], key === "description" ? 600 : 240)); const canonical = strategyByValue(value.value); if (!canonical || canonicalize(value) !== canonicalize(canonical)) fail("STRATEGY_INVALID", "Вариант конструкции повреждён."); return clone(canonical); }
  function availableStrategiesFor(context) {
    if (context?.constructionDirection !== "bottom_up" || context?.workingMethod !== "in_round") return deepFreeze([]);
    return deepFreeze(STRATEGY_CATALOG.map(clone));
  }

  function assessSource(input = {}) {
    const projectId = typeof input.projectId === "string" ? input.projectId.trim() : ""; let calculationId = null;
    try {
      validateUuid(projectId); if (!record(input.project)) fail("PROJECT_NOT_FOUND", "Проект не найден."); if (input.project.project_id !== projectId) fail("PROJECT_MISMATCH", "Проект не совпадает со ссылкой."); calculationId = validateUuid(input.project.active_calculation_id, "CALCULATION_MISSING");
      const required = ["stage63Domain", "stage65Domain", "stage66Domain", "stage67Domain", "stage68Domain", "stage69Domain", "stage70Domain", "stage71Domain", "stage72Domain", "stage73Domain", "stage74Domain", "stage75Domain", "stage76Domain"];
      if (required.some((name) => !input[name])) fail("SOURCE_DEPENDENCY_MISSING", "Проверка source chain недоступна.");
      const assessment76 = input.stage76Domain.assessSource({ projectId, project: input.project, progress: input.progress, stage63Domain: input.stage63Domain, stage65Domain: input.stage65Domain, stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain, stage68Domain: input.stage68Domain, stage69Domain: input.stage69Domain, stage70Domain: input.stage70Domain, stage71Domain: input.stage71Domain, stage72Domain: input.stage72Domain, stage73Domain: input.stage73Domain, stage74Domain: input.stage74Domain, stage75Domain: input.stage75Domain, validatedAt: input.validatedAt });
      if (assessment76.lifecycle !== "ready") fail("STAGE76_SOURCE_STALE", assessment76.diagnostic?.message);
      const records76 = activeRecords(input.progress, input.stage76Domain.KIND, calculationId);
      if (!records76.length) fail("STAGE76_REQUIRED", "Подтверждённое направление не найдено.");
      if (records76.length !== 1 || records76.some((entry) => entry.project_id !== projectId || unsafe(entry))) fail("STAGE76_CONFLICT", "Сохранённые уточнения направления конфликтуют.");
      const record76 = records76[0]; if (record76.revision !== 1) fail("STAGE76_CONFLICT", "Immutable Stage 76 имеет неожиданную repository revision."); let state76;
      try { state76 = input.stage76Domain.validateProgressState(record76.state, { projectIdentity: projectId, calculationId }); input.stage76Domain.validateBinding(state76.snapshot, assessment76); }
      catch (error) { fail("STAGE76_SOURCE_STALE", error?.userMessage || error?.message); }
      const snapshot76 = state76.snapshot;
      if (snapshot76.lifecycle !== "completed" || snapshot76.planOutcome?.status !== "awaiting_more_inputs" || snapshot76.planOutcome?.nextMissingInput !== "construction_strategy" || snapshot76.planOutcome?.newPlan !== null) fail("STAGE76_CONFLICT", "Stage 76 не находится на границе выбора конструкции.");
      const constructionDirection = snapshot76.clarification?.value;
      if (constructionDirection !== "bottom_up") fail("DIRECTION_INCOMPATIBLE", "Подтверждённое направление несовместимо с этим этапом.");
      const knownInputs = {
        garmentType: snapshot76.knownInputs.garmentType, workingMethod: snapshot76.knownInputs.workingMethod, stitchCount: snapshot76.knownInputs.stitchCount,
        primaryFabricHeightCm: snapshot76.knownInputs.primaryFabricHeightCm, garmentLengthCm: snapshot76.knownInputs.garmentLengthCm,
        armholeDepthCm: snapshot76.knownInputs.armholeDepthCm, constructionDirection,
      };
      if (knownInputs.workingMethod !== "in_round") fail("WORKING_METHOD_INCOMPATIBLE", "Корпус не подтверждён как связанный по кругу.");
      const availableStrategies = availableStrategiesFor(knownInputs); if (!availableStrategies.length) fail("STRATEGY_INCOMPATIBLE", "Для текущей цепочки нет безопасных вариантов.");
      const s = snapshot76.source;
      const source = {
        stage65ProgressIdentity: s.stage65ProgressIdentity, stage65ProgressRevision: s.stage65ProgressRevision, predecessorPlanIdentity: s.predecessorPlanIdentity, predecessorPlanFingerprint: s.predecessorPlanFingerprint,
        primaryFabricStepIdentity: s.completedStepIdentity, primaryFabricStepFingerprint: s.completedStepFingerprint, stage75ProgressIdentity: s.stage75ProgressIdentity, stage75ProgressRevision: s.stage75ProgressRevision,
        stage75StateIdentity: s.stage75StateIdentity, stage75StateFingerprint: s.stage75StateFingerprint, stage75SnapshotFingerprint: s.stage75SnapshotFingerprint,
        stage76ProgressIdentity: record76.progress_id, stage76ProgressRevision: record76.revision, stage76SnapshotIdentity: snapshot76.identity, stage76SnapshotRevision: snapshot76.revision,
        stage76SnapshotFingerprint: snapshot76.fingerprint, stage76SourceFingerprint: fingerprint(snapshot76.source), confirmedConstructionDirection: constructionDirection,
      };
      const derivations = {
        armholeStartCm: snapshot76.derivations.bottomUpArmholeStartCm, currentHeightCm: knownInputs.primaryFabricHeightCm,
        additionalHeightToArmholeCm: snapshot76.derivations.bottomUpAdditionalHeightCm, formula: "garmentLengthCm - armholeDepthCm",
        condition: "only_if_selected_strategy_and_future_shaping_policy_require_no_earlier_shaping", informationalOnly: true,
      };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, projectRevision: input.project.revision, source, knownInputs, availableStrategies, derivations, firstMissingInput: "construction_strategy", remainingMissingInputs: ["shaping_policy", "joining_strategy", "finishing_strategy"], diagnostic: null });
    } catch (error) { return blocked(error?.code || "STORAGE_UNAVAILABLE", error?.userMessage || error?.message, UUID_V7.test(projectId) ? projectId : null, calculationId); }
  }

  function deterministicIdentity(assessment) { if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Решение нельзя сохранить без актуальной source chain."); return `${assessment.projectId}:construction-strategy-planning:${fingerprint({ projectId: assessment.projectId, calculationId: assessment.calculationId, source: assessment.source, input: assessment.firstMissingInput })}`; }
  function createCompletedSnapshot(assessment, input = {}, metadata = {}) {
    if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Решение нельзя сохранить без актуальной source chain.");
    const requested = typeof input.strategy === "string" ? input.strategy.trim() : ""; if (CONTEXT_INCOMPATIBLE_STRATEGIES.includes(requested)) fail("STRATEGY_INCOMPATIBLE", "Выбранная конструкция несовместима с уже связанным по кругу корпусом снизу вверх."); const selected = strategyByValue(requested);
    if (!selected) fail("STRATEGY_REQUIRED", "Выберите, как формируется верх свитера.");
    if (!assessment.availableStrategies.some((entry) => entry.identity === selected.identity && entry.value === selected.value)) fail("STRATEGY_INCOMPATIBLE", "Выбранная конструкция несовместима с подтверждённым проектом.");
    if (metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Подтвердите выбранную конструкцию.");
    const at = validateTimestamp(metadata.timestamp || metadata.completedAt); const operationId = validateUuid(metadata.operationId, "OPERATION_ID_INVALID");
    const value = {
      format: FORMAT, version: VERSION, identity: deterministicIdentity(assessment), projectIdentity: assessment.projectId, calculationId: assessment.calculationId, lifecycle: "completed", revision: 1,
      source: clone(assessment.source), boundary: { predecessorPlanningKind: "PROJECT_NEXT_SECTION_PLANNING", predecessorPlanningIdentity: assessment.source.stage76SnapshotIdentity, predecessorPlanningRevision: assessment.source.stage76SnapshotRevision, predecessorPlanningFingerprint: assessment.source.stage76SnapshotFingerprint, predecessorOutcome: "awaiting_more_inputs:construction_strategy" },
      knownInputs: clone(assessment.knownInputs), availableStrategies: clone(assessment.availableStrategies), derivations: clone(assessment.derivations),
      clarification: { input: "construction_strategy", strategyIdentity: selected.identity, value: selected.value, provenance: "user_confirmed_after_bottom_up_primary_fabric_target" },
      remainingMissingInputs: clone(assessment.remainingMissingInputs), planOutcome: { status: "awaiting_more_inputs", newPlan: null, reason: "SHAPING_POLICY_REQUIRED_BEFORE_SAFE_PLAN_EXTENSION", nextMissingInput: "shaping_policy" },
      timestamps: { createdAt: at, completedAt: at }, audit: { event: "CONSTRUCTION_STRATEGY_CONFIRMED", operationId, explicitConfirmation: true }, fingerprint: "",
    };
    value.fingerprint = fingerprint(semanticSnapshot(value)); return validateSnapshot(value);
  }

  function validateSnapshot(source) {
    exactKeys(source, SNAPSHOT_KEYS); canonicalize(source); const value = clone(source);
    if (value.format !== FORMAT || value.version !== VERSION || value.lifecycle !== "completed" || value.revision !== 1) fail("SNAPSHOT_INVALID", "Lifecycle решения повреждён.");
    validateUuid(value.projectIdentity); validateUuid(value.calculationId, "CALCULATION_MISMATCH"); text(value.identity); exactKeys(value.source, SOURCE_KEYS);
    ["stage65ProgressIdentity", "stage75ProgressIdentity", "stage76ProgressIdentity"].forEach((key) => validateUuid(value.source[key], "SNAPSHOT_INVALID"));
    ["stage65ProgressRevision", "stage75ProgressRevision", "stage76ProgressRevision", "stage76SnapshotRevision"].forEach((key) => { if (!Number.isSafeInteger(value.source[key]) || value.source[key] < 1) fail("SNAPSHOT_INVALID", "Revision source chain повреждена."); });
    ["predecessorPlanIdentity", "primaryFabricStepIdentity", "stage75StateIdentity", "stage76SnapshotIdentity"].forEach((key) => text(value.source[key]));
    ["predecessorPlanFingerprint", "primaryFabricStepFingerprint", "stage75StateFingerprint", "stage75SnapshotFingerprint", "stage76SnapshotFingerprint", "stage76SourceFingerprint"].forEach((key) => { if (!FINGERPRINT.test(value.source[key] || "")) fail("SNAPSHOT_INVALID", "Fingerprint source chain повреждён."); });
    if (value.source.confirmedConstructionDirection !== "bottom_up") fail("SNAPSHOT_INVALID", "Направление конструкции повреждено.");
    exactKeys(value.boundary, BOUNDARY_KEYS); if (value.boundary.predecessorPlanningKind !== "PROJECT_NEXT_SECTION_PLANNING" || value.boundary.predecessorPlanningIdentity !== value.source.stage76SnapshotIdentity || value.boundary.predecessorPlanningRevision !== value.source.stage76SnapshotRevision || value.boundary.predecessorPlanningFingerprint !== value.source.stage76SnapshotFingerprint || value.boundary.predecessorOutcome !== "awaiting_more_inputs:construction_strategy") fail("SNAPSHOT_INVALID", "Граница Stage 76 повреждена.");
    exactKeys(value.knownInputs, KNOWN_KEYS); if (value.knownInputs.constructionDirection !== "bottom_up" || value.knownInputs.workingMethod !== "in_round" || !Number.isSafeInteger(value.knownInputs.stitchCount) || value.knownInputs.stitchCount < 1) fail("SNAPSHOT_INVALID", "Контекст конструкции повреждён.");
    ["primaryFabricHeightCm", "garmentLengthCm", "armholeDepthCm"].forEach((key) => { if (!Number.isFinite(value.knownInputs[key]) || value.knownInputs[key] <= 0) fail("SNAPSHOT_INVALID", "Размеры конструкции повреждены."); }); text(value.knownInputs.garmentType, 180);
    if (!Array.isArray(value.availableStrategies) || value.availableStrategies.length < 1) fail("SNAPSHOT_INVALID", "Варианты конструкции отсутствуют."); const validatedStrategies = value.availableStrategies.map(validateStrategy); if (canonicalize(validatedStrategies) !== canonicalize(availableStrategiesFor(value.knownInputs))) fail("SNAPSHOT_INVALID", "Варианты конструкции не соответствуют контексту.");
    exactKeys(value.derivations, DERIVATION_KEYS); if (value.derivations.formula !== "garmentLengthCm - armholeDepthCm" || value.derivations.condition !== "only_if_selected_strategy_and_future_shaping_policy_require_no_earlier_shaping" || value.derivations.informationalOnly !== true) fail("SNAPSHOT_INVALID", "Информационный расчёт повреждён.");
    ["armholeStartCm", "currentHeightCm", "additionalHeightToArmholeCm"].forEach((key) => { if (!Number.isFinite(value.derivations[key]) || value.derivations[key] < 0) fail("SNAPSHOT_INVALID", "Информационный расчёт повреждён."); });
    exactKeys(value.clarification, CLARIFICATION_KEYS); const selected = strategyByValue(value.clarification.value); if (value.clarification.input !== "construction_strategy" || !selected || value.clarification.strategyIdentity !== selected.identity || value.clarification.provenance !== "user_confirmed_after_bottom_up_primary_fabric_target" || !validatedStrategies.some((entry) => entry.identity === selected.identity)) fail("SNAPSHOT_INVALID", "Уточнение конструкции повреждено.");
    if (!Array.isArray(value.remainingMissingInputs) || canonicalize(value.remainingMissingInputs) !== canonicalize(["shaping_policy", "joining_strategy", "finishing_strategy"])) fail("SNAPSHOT_INVALID", "Remaining inputs повреждены.");
    exactKeys(value.planOutcome, OUTCOME_KEYS); if (value.planOutcome.status !== "awaiting_more_inputs" || value.planOutcome.newPlan !== null || value.planOutcome.reason !== "SHAPING_POLICY_REQUIRED_BEFORE_SAFE_PLAN_EXTENSION" || value.planOutcome.nextMissingInput !== "shaping_policy") fail("SNAPSHOT_INVALID", "Plan outcome повреждён.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS); validateTimestamp(value.timestamps.createdAt); validateTimestamp(value.timestamps.completedAt); if (value.timestamps.createdAt !== value.timestamps.completedAt) fail("SNAPSHOT_INVALID", "Время immutable snapshot повреждено.");
    exactKeys(value.audit, AUDIT_KEYS); if (value.audit.event !== "CONSTRUCTION_STRATEGY_CONFIRMED" || value.audit.explicitConfirmation !== true) fail("SNAPSHOT_INVALID", "Audit решения повреждён."); validateUuid(value.audit.operationId, "OPERATION_ID_INVALID");
    if (value.fingerprint !== fingerprint(semanticSnapshot(value))) fail("FINGERPRINT_MISMATCH", "Fingerprint решения не совпадает с содержимым."); return deepFreeze(value);
  }
  function validateBinding(snapshotSource, assessment) { const snapshot = validateSnapshot(snapshotSource); if (assessment?.lifecycle !== "ready") fail("SOURCE_STALE", "Source chain больше не актуален."); if (snapshot.projectIdentity !== assessment.projectId || snapshot.calculationId !== assessment.calculationId || canonicalize(snapshot.source) !== canonicalize(assessment.source) || canonicalize(snapshot.knownInputs) !== canonicalize(assessment.knownInputs) || canonicalize(snapshot.availableStrategies) !== canonicalize(assessment.availableStrategies) || canonicalize(snapshot.derivations) !== canonicalize(assessment.derivations)) fail("SOURCE_STALE", "Решение построено по другой source chain."); return snapshot; }
  function createProgressState(snapshotSource) { const snapshot = validateSnapshot(snapshotSource); return deepFreeze({ kind: KIND, version: VERSION, projectId: snapshot.projectIdentity, calculationId: snapshot.calculationId, lifecycle: snapshot.lifecycle, snapshot: clone(snapshot) }); }
  function validateProgressState(source, options = {}) { exactKeys(source, PROGRESS_KEYS, "PROGRESS_STATE_INVALID"); if (source.kind !== KIND || source.version !== VERSION || source.lifecycle !== "completed") fail("PROGRESS_STATE_INVALID", "Состояние выбора конструкции повреждено."); const snapshot = validateSnapshot(source.snapshot); if (source.projectId !== snapshot.projectIdentity || source.calculationId !== snapshot.calculationId || options.projectIdentity && source.projectId !== options.projectIdentity || options.calculationId && source.calculationId !== options.calculationId) fail("PROJECT_MISMATCH", "Состояние относится к другому проекту."); return deepFreeze({ ...clone(source), snapshot: clone(snapshot) }); }
  function projectIdentityFromLocation(location) { const url = location instanceof URL ? location : new URL(location.href); if (url.pathname !== ROUTE_PATH || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_ID_INVALID", "Ссылка на выбор конструкции недействительна."); return validateUuid(url.searchParams.get("project")); }
  function safeDestination(value, projectId) { try { const url = new URL(value, "http://localhost"); return { valid: url.pathname === ROUTE_PATH && projectIdentityFromLocation(url) === projectId }; } catch { return { valid: false }; } }

  const api = Object.freeze({ FORMAT, VERSION, KIND, PROGRESS_KIND, ROUTE_PATH, STRATEGY_CATALOG, ProjectConstructionStrategyPlanningError, canonicalize, fingerprint, diagnostic, availableStrategiesFor, assessSource, deterministicIdentity, createCompletedSnapshot, validateSnapshot, validateBinding, createProgressState, validateProgressState, projectIdentityFromLocation, safeDestination });
  globalObject.YarnAIProjectConstructionStrategyPlanning = api; if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
