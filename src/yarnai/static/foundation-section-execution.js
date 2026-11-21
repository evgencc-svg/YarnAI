"use strict";

(function exposeFoundationSectionExecution(globalObject) {
  const KIND = "FOUNDATION_SECTION_EXECUTION";
  const SCHEMA_VERSION = 1;
  const ROUTE_PATH = "/project-foundation-section-execution";
  const LIFECYCLES = Object.freeze(["ready", "active", "paused"]);
  const TRANSITIONS = Object.freeze({ ready: Object.freeze(["active"]), active: Object.freeze(["paused"]), paused: Object.freeze(["active"]) });
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const STATE_KEYS = Object.freeze(["kind", "schemaVersion", "identity", "projectId", "calculationId", "lifecycle", "revision", "source", "executionPlan", "physicalResult", "operations", "timestamps", "fingerprint"]);
  const SOURCE_KEYS = Object.freeze(["stage70ProgressIdentity", "stage70Epoch", "stage70ProgressRevision", "stage70StateIdentity", "stage70StateRevision", "stage70StateFingerprint", "completedSnapshotFingerprint", "sourceRevisions"]);
  const PLAN_KEYS = Object.freeze(["foundationType", "ribPattern", "workingMethod", "stitchAllocation", "toolConfirmation", "instructionSource", "measurementPolicy", "target", "rowEstimate"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "startedAt", "lastPausedAt", "lastResumedAt"]);
  const OPERATION_KEYS = Object.freeze(["operationId", "command", "payloadFingerprint", "resultingRevision", "at"]);

  class FoundationSectionExecutionError extends Error {
    constructor(code, userMessage, details = {}) { super(userMessage); this.name = "FoundationSectionExecutionError"; this.code = code; this.userMessage = userMessage; this.details = details; }
  }
  function fail(code, message, details) { throw new FoundationSectionExecutionError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(deepFreeze); return value; }
  function exactKeys(value, keys, code = "EXECUTION_STATE_CORRUPTED") {
    if (!record(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "Сохранённое выполнение резинки повреждено.");
  }
  function canonicalize(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  function fingerprint(value) {
    const text = canonicalize(value); let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  function validateUuid(value, code = "PROJECT_MISMATCH") { if (!UUID_V7.test(value || "")) fail(code, "Ссылка на проект недействительна."); return value; }
  function validateTimestamp(value) { if (!TIMESTAMP.test(value || "") || new Date(value).toISOString() !== value) fail("TIMESTAMP_INVALID", "Время выполнения повреждено."); return value; }
  function semanticState(state) { const value = clone(state); delete value.fingerprint; return value; }
  function stateFingerprint(state) { return fingerprint(semanticState(state)); }
  function semanticSourceRevisions(source) { return clone(source?.observedStorageRevisions || {}); }
  function diagnostic(code, fallback = "Не удалось безопасно открыть выполнение резинки.") {
    const messages = {
      PROJECT_MISMATCH: "Откройте выполнение из нужного проекта.", CALCULATION_MISMATCH: "Активный расчёт проекта изменился.",
      STAGE70_MISSING: "Сначала завершите подготовку резинки.", STAGE70_NOT_COMPLETED: "Подготовка резинки ещё не завершена.",
      STAGE70_CONFLICT: "Сохранённые версии подготовки конфликтуют.", STAGE70_SNAPSHOT_INVALID: "Подтверждённая подготовка повреждена.",
      SOURCE_STALE: "Исходные данные проекта изменились. Выполнение остановлено для защиты проекта.",
      REVISION_CONFLICT: "Выполнение изменено в другой вкладке. Обновите страницу.",
      EXECUTION_STATE_CORRUPTED: "Сохранённое выполнение резинки повреждено.", STORAGE_UNAVAILABLE: "Проверка проекта временно недоступна.",
    };
    return deepFreeze({ code, message: messages[code] || fallback, recovery: { label: "Вернуться к проектам", path: "/saved-projects" } });
  }

  function preparationRecords(progress, kind) { return (Array.isArray(progress) ? progress : []).filter((entry) => entry?.kind === kind && !entry.deleted_at); }
  function assessSource(input = {}) {
    const projectId = input.projectId || input.projectIdentity;
    try {
      validateUuid(projectId);
      const project = input.project;
      if (!record(project) || project.project_id !== projectId || ["DELETED", "QUARANTINED"].includes(project.workspace_status)) fail("PROJECT_MISMATCH", "Откройте выполнение из нужного проекта.");
      const calculationId = project.active_calculation_id; validateUuid(calculationId, "CALCULATION_MISMATCH");
      const stage70 = input.stage70Domain;
      if (!stage70 || !input.stage63Domain || !input.stage65Domain || !input.stage66Domain || !input.stage67Domain || !input.stage68Domain || !input.stage69Domain) fail("STORAGE_UNAVAILABLE", "Проверка проекта временно недоступна.");
      const progress = Array.isArray(input.progress) ? input.progress : [];
      const all = preparationRecords(progress, stage70.KIND);
      if (all.some((entry) => entry.project_id !== projectId)) fail("PROJECT_MISMATCH", "Подготовка относится к другому проекту.");
      if (all.some((entry) => entry.calculation_id !== calculationId)) fail("CALCULATION_MISMATCH", "Подготовка относится к другому расчёту.");
      if (!all.length) fail("STAGE70_MISSING", "Сначала завершите подготовку резинки.");
      if (all.some((entry) => entry.conflict_id || entry.quarantined || entry.validation_status === "IMPORTED_UNPROVEN")) fail("STAGE70_CONFLICT", "Сохранённые версии подготовки конфликтуют.");
      const ordered = [...all].sort((left, right) => left.epoch - right.epoch);
      const epochs = new Set();
      ordered.forEach((entry) => {
        if (!Number.isSafeInteger(entry.epoch) || epochs.has(entry.epoch) || entry.epoch !== entry.state?.epoch) fail("STAGE70_CONFLICT", "Сохранённые версии подготовки конфликтуют.");
        try { stage70.validateProgressState(entry.state, { allowSourceInvalid: true }); } catch { fail("STAGE70_CONFLICT", "Сохранённые версии подготовки повреждены."); }
        epochs.add(entry.epoch);
      });
      for (let index = 1; index < ordered.length; index += 1) if (ordered[index - 1].state?.lifecycle !== "stale" || ordered[index].state?.predecessorIdentity !== ordered[index - 1].state?.identity) fail("STAGE70_CONFLICT", "Связь версий подготовки повреждена.");
      const current = ordered.at(-1);
      const upstream = stage70.assessSource({
        projectId, project, progress, stage63Domain: input.stage63Domain, stage65Domain: input.stage65Domain,
        stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain, stage68Domain: input.stage68Domain,
        stage69Domain: input.stage69Domain, preparationProgressRevision: current.revision, validatedAt: input.validatedAt || new Date().toISOString(),
      });
      if (upstream.lifecycle !== "ready") fail(upstream.diagnostic?.code || "SOURCE_STALE", upstream.diagnostic?.message || "Исходные данные проекта изменились.");
      let state;
      try { state = stage70.validateProgressState(current.state, { assessment: upstream }); }
      catch (error) { fail(error?.code === "SOURCE_STALE" ? "SOURCE_STALE" : "STAGE70_SNAPSHOT_INVALID", error?.userMessage || "Подтверждённая подготовка повреждена."); }
      if (state.lifecycle !== "completed" || !record(state.completedSnapshot)) fail("STAGE70_NOT_COMPLETED", "Подготовка резинки ещё не завершена.");
      const snapshot = state.completedSnapshot;
      if (snapshot.explicitConfirmation?.explicit !== true || snapshot.explicitConfirmation?.measurementAcknowledged !== true || snapshot.lifecycle !== "completed" || snapshot.rowEstimate !== null) fail("STAGE70_SNAPSHOT_INVALID", "Подтверждённая подготовка повреждена.");
      if (snapshot.confirmedContext?.foundationType !== "ribbing" || canonicalize(snapshot.confirmedContext?.target) !== canonicalize({ kind: "height", value: 5, unit: "cm" })) fail("STAGE70_SNAPSHOT_INVALID", "Цель подготовленного участка повреждена.");
      const params = snapshot.executionParameters;
      const source = {
        stage70ProgressIdentity: current.progress_id, stage70Epoch: current.epoch, stage70ProgressRevision: current.revision,
        stage70StateIdentity: state.identity, stage70StateRevision: state.revision, stage70StateFingerprint: state.fingerprint,
        completedSnapshotFingerprint: snapshot.fingerprint, sourceRevisions: semanticSourceRevisions(snapshot.source),
      };
      const executionPlan = {
        foundationType: "ribbing", ribPattern: clone(params.ribPattern), workingMethod: clone(params.workingMethod),
        stitchAllocation: clone(params.stitchAllocation), toolConfirmation: clone(params.toolConfirmation), instructionSource: clone(snapshot.instructionSource),
        measurementPolicy: clone(snapshot.measurementPolicy), target: clone(snapshot.confirmedContext.target), rowEstimate: null,
      };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, projectRevision: project.revision, source, executionPlan });
    } catch (error) {
      const code = error?.code || "STORAGE_UNAVAILABLE";
      return deepFreeze({ lifecycle: "blocked", projectId: UUID_V7.test(projectId || "") ? projectId : null, calculationId: null, diagnostic: diagnostic(code, error?.userMessage) });
    }
  }
  function requireReady(assessment) { if (assessment?.lifecycle !== "ready") fail(assessment?.diagnostic?.code || "SOURCE_STALE", assessment?.diagnostic?.message || "Исходные данные проекта изменились."); return assessment; }
  function deterministicIdentity(assessment) { return `${assessment.projectId}:foundation-section-execution:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: assessment.projectId, calculationId: assessment.calculationId, source: assessment.source })}`; }
  function createInitialState(assessmentSource, metadata = {}) {
    const assessment = requireReady(assessmentSource); const at = validateTimestamp(metadata.createdAt || metadata.timestamp);
    const value = { kind: KIND, schemaVersion: SCHEMA_VERSION, identity: deterministicIdentity(assessment), projectId: assessment.projectId, calculationId: assessment.calculationId, lifecycle: "ready", revision: 1, source: clone(assessment.source), executionPlan: clone(assessment.executionPlan), physicalResult: null, operations: [], timestamps: { createdAt: at, startedAt: null, lastPausedAt: null, lastResumedAt: null }, fingerprint: "" };
    value.fingerprint = stateFingerprint(value); return validateProgressState(value, { assessment });
  }
  function operationReceipt(operationId, command, payload, revision, at) { return { operationId: validateUuid(operationId, "OPERATION_ID_CONFLICT"), command, payloadFingerprint: fingerprint(payload), resultingRevision: revision, at: validateTimestamp(at) }; }
  function replayOrConflict(state, operationId, command, payload) {
    validateUuid(operationId, "OPERATION_ID_CONFLICT"); const found = state.operations.find((entry) => entry.operationId === operationId);
    if (!found) return false;
    if (found.command !== command || found.payloadFingerprint !== fingerprint(payload)) fail("OPERATION_ID_CONFLICT", "Эта операция уже использована для другого действия.");
    return true;
  }
  function transition(stateSource, target, metadata = {}) {
    const assessment = requireReady(metadata.assessment); const state = validateProgressState(stateSource, { assessment });
    const command = target === "paused" ? "pause" : state.lifecycle === "paused" ? "resume" : "start";
    const payload = { command, target, identity: state.identity };
    if (replayOrConflict(state, metadata.operationId, command, payload)) return state;
    if (metadata.expectedRevision !== state.revision || metadata.expectedFingerprint !== state.fingerprint) fail("REVISION_CONFLICT", "Выполнение изменено в другой вкладке.");
    if (!TRANSITIONS[state.lifecycle]?.includes(target)) fail("INVALID_LIFECYCLE_TRANSITION", "Это действие недоступно в текущем состоянии.");
    const at = validateTimestamp(metadata.timestamp); const next = clone(state); next.lifecycle = target; next.revision += 1;
    if (command === "start") next.timestamps.startedAt = at;
    if (command === "pause") next.timestamps.lastPausedAt = at;
    if (command === "resume") next.timestamps.lastResumedAt = at;
    next.operations.push(operationReceipt(metadata.operationId, command, payload, next.revision, at)); next.fingerprint = stateFingerprint(next);
    return validateProgressState(next, { assessment });
  }
  function startExecution(state, metadata) { return transition(state, "active", metadata); }
  function pauseExecution(state, metadata) { return transition(state, "paused", metadata); }
  function resumeExecution(state, metadata) { return transition(state, "active", metadata); }

  function validateSource(source) {
    exactKeys(source, SOURCE_KEYS); validateUuid(source.stage70ProgressIdentity, "EXECUTION_STATE_CORRUPTED");
    if (!Number.isSafeInteger(source.stage70Epoch) || source.stage70Epoch < 1 || !Number.isSafeInteger(source.stage70ProgressRevision) || source.stage70ProgressRevision < 1 || !Number.isSafeInteger(source.stage70StateRevision) || source.stage70StateRevision < 1) fail("EXECUTION_STATE_CORRUPTED", "Привязка к подготовке повреждена.");
    if (typeof source.stage70StateIdentity !== "string" || !source.stage70StateIdentity || !FINGERPRINT.test(source.stage70StateFingerprint) || !FINGERPRINT.test(source.completedSnapshotFingerprint) || !record(source.sourceRevisions)) fail("EXECUTION_STATE_CORRUPTED", "Привязка к подготовке повреждена.");
    exactKeys(source.sourceRevisions, ["project", "stage65Progress", "stage66Progress", "stage67Progress", "stage68Progress", "stage69Progress", "preparationProgress"]);
    Object.entries(source.sourceRevisions).forEach(([key, value]) => { if (!(Number.isSafeInteger(value) && value >= 0) && !(key === "preparationProgress" && value === null)) fail("EXECUTION_STATE_CORRUPTED", "Ревизии источников повреждены."); });
    return source;
  }
  function validatePlan(plan) {
    exactKeys(plan, PLAN_KEYS); if (plan.foundationType !== "ribbing" || plan.rowEstimate !== null || canonicalize(plan.target) !== canonicalize({ kind: "height", value: 5, unit: "cm" })) fail("EXECUTION_STATE_CORRUPTED", "План выполнения повреждён.");
    exactKeys(plan.ribPattern, ["kind", "repeatLength"]); if (![["rib_1x1", 2], ["rib_2x2", 4]].some(([kind, repeat]) => plan.ribPattern.kind === kind && plan.ribPattern.repeatLength === repeat) || !record(plan.workingMethod) || !["flat", "in_round"].includes(plan.workingMethod.value)) fail("EXECUTION_STATE_CORRUPTED", "План выполнения повреждён.");
    if (plan.workingMethod.origin === "user") { exactKeys(plan.workingMethod, ["value", "origin", "explicit", "confirmedAt"]); if (plan.workingMethod.explicit !== true) fail("EXECUTION_STATE_CORRUPTED", "Способ вязания повреждён."); validateTimestamp(plan.workingMethod.confirmedAt); }
    else if (plan.workingMethod.origin === "stage65") { exactKeys(plan.workingMethod, ["value", "origin", "source"]); exactKeys(plan.workingMethod.source, ["planIdentity", "planFingerprint", "field"]); if (!FINGERPRINT.test(plan.workingMethod.source.planFingerprint)) fail("EXECUTION_STATE_CORRUPTED", "Способ вязания повреждён."); }
    else fail("EXECUTION_STATE_CORRUPTED", "Способ вязания повреждён.");
    exactKeys(plan.stitchAllocation, ["totalCastOn", "edgeCount", "workingStitches", "repeatLength", "repeatCount"]);
    if (!record(plan.stitchAllocation) || plan.stitchAllocation.totalCastOn !== 100 || plan.stitchAllocation.edgeCount + plan.stitchAllocation.workingStitches !== 100 || plan.stitchAllocation.repeatLength !== plan.ribPattern.repeatLength || plan.stitchAllocation.repeatCount !== plan.stitchAllocation.workingStitches / plan.stitchAllocation.repeatLength || !Number.isSafeInteger(plan.stitchAllocation.repeatCount)) fail("EXECUTION_STATE_CORRUPTED", "Распределение петель повреждено.");
    if (!record(plan.toolConfirmation) || typeof plan.toolConfirmation.label !== "string" || !plan.toolConfirmation.label.trim()) fail("EXECUTION_STATE_CORRUPTED", "Инструмент повреждён.");
    if (plan.toolConfirmation.kind === "user_provided") { exactKeys(plan.toolConfirmation, ["kind", "label", "explicit", "policyVersion", "confirmedAt"]); if (plan.toolConfirmation.explicit !== true) fail("EXECUTION_STATE_CORRUPTED", "Инструмент повреждён."); validateTimestamp(plan.toolConfirmation.confirmedAt); }
    else if (plan.toolConfirmation.kind === "source_bound") { exactKeys(plan.toolConfirmation, ["kind", "source", "label", "authoritative", "policyVersion"]); exactKeys(plan.toolConfirmation.source, ["kind", "identity", "fingerprint"]); if (plan.toolConfirmation.authoritative !== true || !FINGERPRINT.test(plan.toolConfirmation.source.fingerprint)) fail("EXECUTION_STATE_CORRUPTED", "Инструмент повреждён."); }
    else fail("EXECUTION_STATE_CORRUPTED", "Инструмент повреждён.");
    exactKeys(plan.instructionSource, ["kind", "text", "support", "policyVersion", "attestation", "contentFingerprint"]); exactKeys(plan.instructionSource.support, ["ribPatternKind", "repeatLength", "workingMethod", "edgeKind", "edgeCount", "edgePolicyVersion"]); exactKeys(plan.instructionSource.attestation, ["explicit", "authority", "yarnAiTechnicalVerification", "confirmedAt"]);
    if (plan.instructionSource.kind !== "user_provided" || typeof plan.instructionSource.text !== "string" || !plan.instructionSource.text.trim() || plan.instructionSource.attestation.explicit !== true || plan.instructionSource.attestation.authority !== "user" || plan.instructionSource.attestation.yarnAiTechnicalVerification !== false || !FINGERPRINT.test(plan.instructionSource.contentFingerprint)) fail("EXECUTION_STATE_CORRUPTED", "Инструкция повреждена."); validateTimestamp(plan.instructionSource.attestation.confirmedAt);
    exactKeys(plan.measurementPolicy, ["authority", "target", "origin", "onNeedles", "tensionState", "comparison", "toleranceCm", "policyVersion", "acknowledgementRequired", "physicalCompletionAuthority"]);
    if (plan.measurementPolicy.authority !== "physical_measurement" || canonicalize(plan.measurementPolicy.target) !== canonicalize({ kind: "height", value: 5, unit: "cm" }) || plan.measurementPolicy.origin !== "physical_start_of_ribbing_after_cast_on_to_current_top_edge" || plan.measurementPolicy.comparison !== "at_least" || plan.measurementPolicy.onNeedles !== true || plan.measurementPolicy.tensionState !== "natural_unstretched" || plan.measurementPolicy.toleranceCm !== null || plan.measurementPolicy.acknowledgementRequired !== true || plan.measurementPolicy.physicalCompletionAuthority !== "explicit_user_measurement_acknowledgement") fail("EXECUTION_STATE_CORRUPTED", "Правило измерения повреждено.");
    return plan;
  }
  function validateProgressState(source, options = {}) {
    exactKeys(source, STATE_KEYS); const value = clone(source);
    if (value.kind !== KIND || value.schemaVersion !== SCHEMA_VERSION || !LIFECYCLES.includes(value.lifecycle) || !Number.isSafeInteger(value.revision) || value.revision < 1) fail("EXECUTION_STATE_CORRUPTED", "Состояние выполнения повреждено.");
    validateUuid(value.projectId); validateUuid(value.calculationId, "CALCULATION_MISMATCH"); validateSource(value.source); validatePlan(value.executionPlan);
    if (value.identity !== `${value.projectId}:foundation-section-execution:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: value.projectId, calculationId: value.calculationId, source: value.source })}`) fail("EXECUTION_STATE_CORRUPTED", "Идентификатор выполнения повреждён.");
    if (value.physicalResult !== null) fail("PHYSICAL_RESULT_NOT_ALLOWED", "Достижение физической высоты подтверждается только отдельным измерением.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS); validateTimestamp(value.timestamps.createdAt); ["startedAt", "lastPausedAt", "lastResumedAt"].forEach((key) => { if (value.timestamps[key] !== null) validateTimestamp(value.timestamps[key]); });
    if (value.lifecycle === "ready" && (value.timestamps.startedAt !== null || value.operations.length !== 0 || value.revision !== 1)) fail("EXECUTION_STATE_CORRUPTED", "Начальное состояние выполнения повреждено.");
    if (["active", "paused"].includes(value.lifecycle) && value.timestamps.startedAt === null) fail("EXECUTION_STATE_CORRUPTED", "Начало выполнения не зафиксировано.");
    if (!Array.isArray(value.operations) || value.operations.length > 128) fail("EXECUTION_STATE_CORRUPTED", "История выполнения повреждена.");
    const ids = new Set(); let previousRevision = 1;
    value.operations.forEach((entry) => { exactKeys(entry, OPERATION_KEYS); validateUuid(entry.operationId, "EXECUTION_STATE_CORRUPTED"); validateTimestamp(entry.at); if (ids.has(entry.operationId) || !["start", "pause", "resume"].includes(entry.command) || !FINGERPRINT.test(entry.payloadFingerprint) || entry.resultingRevision !== previousRevision + 1) fail("EXECUTION_STATE_CORRUPTED", "История выполнения повреждена."); ids.add(entry.operationId); previousRevision = entry.resultingRevision; });
    if (value.revision !== previousRevision || value.fingerprint !== stateFingerprint(value)) fail("EXECUTION_STATE_CORRUPTED", "Целостность выполнения нарушена.");
    if (options.assessment?.lifecycle === "ready" && (value.projectId !== options.assessment.projectId || value.calculationId !== options.assessment.calculationId || canonicalize(value.source) !== canonicalize(options.assessment.source) || canonicalize(value.executionPlan) !== canonicalize(options.assessment.executionPlan))) fail("SOURCE_STALE", "Исходные данные проекта изменились.");
    return deepFreeze(value);
  }
  function safeDestination(value, projectId) { try { const url = new URL(value, "http://localhost"); return { valid: url.pathname === ROUTE_PATH && projectIdentityFromLocation(url) === projectId }; } catch { return { valid: false }; } }
  function projectIdentityFromLocation(location) { const url = location instanceof URL ? location : new URL(location.href); if (url.pathname !== ROUTE_PATH || url.hash || [...url.searchParams.keys()].length !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_MISMATCH", "Ссылка на выполнение недействительна."); return validateUuid(url.searchParams.get("project")); }

  const api = Object.freeze({ KIND, PROGRESS_KIND: KIND, SCHEMA_VERSION, ROUTE_PATH, LIFECYCLES, TRANSITIONS, FoundationSectionExecutionError, canonicalize, fingerprint, validateUuid, validateTimestamp, diagnostic, assessSource, deterministicIdentity, createInitialState, startExecution, pauseExecution, resumeExecution, validateProgressState, safeDestination, projectIdentityFromLocation });
  globalObject.YarnAIFoundationSectionExecution = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
