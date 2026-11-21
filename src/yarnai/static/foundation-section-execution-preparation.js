"use strict";

(function exposeFoundationSectionExecutionPreparation(globalObject) {
  const KIND = "FOUNDATION_SECTION_EXECUTION_PREPARATION";
  const SCHEMA_VERSION = 1;
  const ROUTE_PATH = "/project-foundation-section-preparation";
  const POLICY_VERSIONS = Object.freeze({
    ribPattern: "foundation-rib-patterns/v1",
    tool: "foundation-tool-confirmation/v1",
    instruction: "foundation-user-instruction/v1",
    measurement: "foundation-height-measurement/v1",
    rowEstimate: "foundation-row-estimate-null/v1",
  });
  const EDGE_NONE_VERSION = "foundation-edge-none/v1";
  const EDGE_FLAT_VERSION = "foundation-flat-edge-one-each-side/v1";
  const SOURCE_STAGE_KEYS = Object.freeze(["stage60", "stage61", "stage63", "stage64", "stage65", "stage66", "stage67", "stage68"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;
  const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  const LIFECYCLES = Object.freeze(["collecting", "reviewing", "blocked", "stale", "completed"]);
  const STATE_KEYS = Object.freeze(["kind", "schemaVersion", "identity", "projectId", "calculationId", "epoch", "predecessorIdentity", "lifecycle", "revision", "source", "draft", "blocker", "completedSnapshot", "operations", "timestamps", "fingerprint"]);
  const DRAFT_KEYS = Object.freeze(["ribPattern", "workingMethod", "edgePolicy", "toolConfirmation", "instructionSource", "measurementAcknowledged", "stitchAllocation", "rowEstimate", "reviewFingerprint"]);

  class FoundationSectionExecutionPreparationError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "FoundationSectionExecutionPreparationError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = details;
    }
  }

  function fail(code, message, details) { throw new FoundationSectionExecutionPreparationError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }
  function exactKeys(value, expected, code = "CORRUPTED_DRAFT") {
    if (!record(value)) fail(code, "Сохранённые данные подготовки повреждены.");
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code, "Сохранённые данные подготовки повреждены.");
    return value;
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("NON_CANONICAL_VALUE", "Числовое значение повреждено.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("NON_CANONICAL_VALUE", "Значение нельзя безопасно сохранить.");
  }
  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    const bytes = typeof TextEncoder === "function" ? new TextEncoder().encode(input) : Buffer.from(input, "utf8");
    for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193) >>> 0; }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }
  function validateUuid(value, code = "PROJECT_MISMATCH") {
    if (typeof value !== "string" || !UUID_V7.test(value)) fail(code, "Ссылка на проект недействительна.");
    return value;
  }
  function validateTimestamp(value) {
    if (typeof value !== "string" || !TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) fail("CORRUPTED_DRAFT", "Время изменения подготовки повреждено.");
    return value;
  }
  function normalizeTool(value) {
    const normalized = typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/gu, " ") : "";
    if (!normalized || [...normalized].length > 180) fail("TOOL_CONFIRMATION_REQUIRED", "Подтвердите спицы или другой рабочий инструмент.");
    return normalized;
  }
  function normalizeInstruction(value) {
    const normalized = typeof value === "string"
      ? value.normalize("NFC").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[\t\p{Zs}]+/gu, " ").replace(/\s+$/u, "")).join("\n").trim()
      : "";
    if (!normalized) fail("MISSING_INSTRUCTION", "Добавьте свою инструкцию для выбранной резинки.");
    if ([...normalized].length > 10000) fail("INVALID_INSTRUCTION_SOURCE", "Инструкция должна содержать не более 10 000 символов.");
    return normalized;
  }
  function validateRibPattern(source) {
    exactKeys(source, ["kind", "repeatLength"], "UNSUPPORTED_RIB");
    if (source.kind === "rib_1x1" && source.repeatLength === 2) return deepFreeze(clone(source));
    if (source.kind === "rib_2x2" && source.repeatLength === 4) return deepFreeze(clone(source));
    fail("UNSUPPORTED_RIB", "Выбранный вид резинки пока не поддерживается.");
  }
  function ribPattern(kind) {
    if (kind === "rib_1x1") return deepFreeze({ kind, repeatLength: 2 });
    if (kind === "rib_2x2") return deepFreeze({ kind, repeatLength: 4 });
    fail("UNSUPPORTED_RIB", "Выбранный вид резинки пока не поддерживается.");
  }
  function edgePolicyFor(method) {
    if (method === "in_round") return deepFreeze({ edgeKind: "none", edgeCount: 0, policyVersion: EDGE_NONE_VERSION });
    if (method === "flat") return deepFreeze({ edgeKind: "one_each_side_included", edgeCount: 2, policyVersion: EDGE_FLAT_VERSION });
    fail("INVALID_WORKING_METHOD", "Выберите вязание рядами или по кругу.");
  }
  function validateWorkingMethod(source, assessment = null) {
    if (!record(source) || !["flat", "in_round"].includes(source.value)) fail("INVALID_WORKING_METHOD", "Выберите вязание рядами или по кругу.");
    if (source.origin === "stage65") {
      exactKeys(source, ["value", "origin", "source"], "INVALID_WORKING_METHOD");
      exactKeys(source.source, ["planIdentity", "planFingerprint", "field"], "INVALID_WORKING_METHOD");
      if (!FINGERPRINT.test(source.source.planFingerprint) || !["technologyContext.workingMethod", "planScope.boundedInputs.workingMethod"].includes(source.source.field)) fail("INVALID_WORKING_METHOD", "Подтверждённый способ вязания повреждён.");
      if (assessment?.workingMethod?.origin === "stage65" && canonicalize(source) !== canonicalize(assessment.workingMethod)) fail("SOURCE_STALE", "Исходные данные проекта изменились. Подготовьте участок заново.");
    } else if (source.origin === "user") {
      exactKeys(source, ["value", "origin", "explicit", "confirmedAt"], "INVALID_WORKING_METHOD");
      if (source.explicit !== true) fail("INVALID_WORKING_METHOD", "Выберите способ вязания явно.");
      validateTimestamp(source.confirmedAt);
      if (assessment?.workingMethod?.origin === "stage65") fail("SOURCE_CONFLICT", "Подтверждённый способ вязания нельзя заменить.");
    } else fail("INVALID_WORKING_METHOD", "Выберите вязание рядами или по кругу.");
    return deepFreeze(clone(source));
  }
  function validateEdgePolicy(source, method) {
    const expected = edgePolicyFor(method.value);
    exactKeys(source, ["edgeKind", "edgeCount", "policyVersion"], "INVALID_EDGE_POLICY");
    if (canonicalize(source) !== canonicalize(expected)) fail("EDGE_POLICY_VERSION_INVALID", "Сохранённое правило кромочных не поддерживается.");
    return expected;
  }
  function allocationFor(patternSource, methodSource, totalCastOn = 100) {
    const pattern = validateRibPattern(patternSource);
    const method = validateWorkingMethod(methodSource);
    if (!Number.isSafeInteger(totalCastOn) || totalCastOn <= 0) fail("CAST_ON_MISMATCH", "Подтверждённое количество петель изменилось.");
    const edge = edgePolicyFor(method.value);
    const workingStitches = totalCastOn - edge.edgeCount;
    const compatible = workingStitches > 0 && workingStitches % pattern.repeatLength === 0;
    const value = { totalCastOn, edgeCount: edge.edgeCount, workingStitches, repeatLength: pattern.repeatLength, repeatCount: compatible ? workingStitches / pattern.repeatLength : null };
    return deepFreeze({ ...value, compatible });
  }
  function validateAllocation(source, pattern, method) {
    exactKeys(source, ["totalCastOn", "edgeCount", "workingStitches", "repeatLength", "repeatCount"], "CORRUPTED_DRAFT");
    const expected = allocationFor(pattern, method, 100);
    const canonical = { totalCastOn: expected.totalCastOn, edgeCount: expected.edgeCount, workingStitches: expected.workingStitches, repeatLength: expected.repeatLength, repeatCount: expected.repeatCount };
    if (canonicalize(source) !== canonicalize(canonical)) fail(expected.compatible ? "CORRUPTED_DRAFT" : "INCOMPATIBLE_REPEAT", "Рабочие петли не делятся на раппорт выбранной резинки. Количество петель не изменено.");
    if (!expected.compatible) fail("INCOMPATIBLE_REPEAT", "Рабочие петли не делятся на раппорт выбранной резинки. Количество петель не изменено.");
    return deepFreeze(canonical);
  }
  function instructionSupport(pattern, method) {
    const edge = edgePolicyFor(method.value);
    return deepFreeze({ ribPatternKind: pattern.kind, repeatLength: pattern.repeatLength, workingMethod: method.value, edgeKind: edge.edgeKind, edgeCount: edge.edgeCount, edgePolicyVersion: edge.policyVersion });
  }
  function validateToolConfirmation(source, assessment = null) {
    if (!record(source) || !["source_bound", "user_provided"].includes(source.kind)) fail("TOOL_CONFIRMATION_REQUIRED", "Подтвердите спицы или другой рабочий инструмент.");
    const label = normalizeTool(source.label);
    if (source.kind === "source_bound") {
      exactKeys(source, ["kind", "source", "label", "authoritative", "policyVersion"], "TOOL_CONFIRMATION_REQUIRED");
      exactKeys(source.source, ["kind", "identity", "fingerprint"], "TOOL_CONFIRMATION_REQUIRED");
      if (source.source.kind !== "stage63_gauge" || source.authoritative !== true || source.policyVersion !== POLICY_VERSIONS.tool || !FINGERPRINT.test(source.source.fingerprint)) fail("TOOL_POLICY_VERSION_INVALID", "Версия правила подтверждения инструмента не поддерживается.");
      if (assessment && (!assessment.authoritativeTool || canonicalize({ ...source, label }) !== canonicalize(assessment.authoritativeTool))) fail("SOURCE_STALE", "Подтверждённый инструмент больше не относится к текущему проекту.");
    } else {
      exactKeys(source, ["kind", "label", "explicit", "policyVersion", "confirmedAt"], "TOOL_CONFIRMATION_REQUIRED");
      if (source.explicit !== true || source.policyVersion !== POLICY_VERSIONS.tool) fail("TOOL_POLICY_VERSION_INVALID", "Версия правила подтверждения инструмента не поддерживается.");
      validateTimestamp(source.confirmedAt);
    }
    return deepFreeze({ ...clone(source), label });
  }
  function validateInstructionSource(source, pattern, method) {
    exactKeys(source, ["kind", "text", "support", "policyVersion", "attestation", "contentFingerprint"], "INVALID_INSTRUCTION_SOURCE");
    if (source.kind !== "user_provided") fail("INVALID_INSTRUCTION_SOURCE", "Инструкция не соответствует выбранному способу вязания.");
    if (source.policyVersion !== POLICY_VERSIONS.instruction) fail("INSTRUCTION_POLICY_VERSION_INVALID", "Версия правила пользовательской инструкции не поддерживается.");
    const text = normalizeInstruction(source.text);
    const support = instructionSupport(pattern, method);
    exactKeys(source.support, Object.keys(support), "INVALID_INSTRUCTION_SOURCE");
    if (canonicalize(source.support) !== canonicalize(support)) fail("INVALID_INSTRUCTION_SOURCE", "Инструкция относится к другому способу вязания.");
    exactKeys(source.attestation, ["explicit", "authority", "yarnAiTechnicalVerification", "confirmedAt"], "INVALID_INSTRUCTION_SOURCE");
    if (source.attestation.explicit !== true || source.attestation.authority !== "user" || source.attestation.yarnAiTechnicalVerification !== false) fail("INVALID_INSTRUCTION_SOURCE", "Подтвердите, что инструкция предоставлена пользователем и не проверена YarnAI.");
    validateTimestamp(source.attestation.confirmedAt);
    if (source.contentFingerprint !== fingerprint(text)) fail("INVALID_INSTRUCTION_SOURCE", "Целостность пользовательской инструкции не подтверждена.");
    return deepFreeze({ ...clone(source), text, support, contentFingerprint: fingerprint(text) });
  }
  function measurementPolicy() {
    return deepFreeze({
      authority: "physical_measurement", target: { kind: "height", value: 5, unit: "cm" },
      origin: "physical_start_of_ribbing_after_cast_on_to_current_top_edge", onNeedles: true,
      tensionState: "natural_unstretched", comparison: "at_least", toleranceCm: null,
      policyVersion: POLICY_VERSIONS.measurement, acknowledgementRequired: true,
      physicalCompletionAuthority: "explicit_user_measurement_acknowledgement",
    });
  }
  function validateMeasurementPolicy(source) {
    if (canonicalize(source) !== canonicalize(measurementPolicy())) fail("MEASUREMENT_POLICY_VERSION_INVALID", "Версия правила измерения не поддерживается.");
    return measurementPolicy();
  }
  function validatePolicyVersions(source, edge) {
    exactKeys(source, ["ribPattern", "edge", "tool", "instruction", "measurement", "rowEstimate"], "RIB_PATTERN_POLICY_VERSION_INVALID");
    const expected = { ...POLICY_VERSIONS, edge: edge.policyVersion };
    if (source.ribPattern !== expected.ribPattern) fail("RIB_PATTERN_POLICY_VERSION_INVALID", "Версия правила доступных видов резинки не поддерживается.");
    if (source.edge !== expected.edge) fail("EDGE_POLICY_VERSION_INVALID", "Сохранённое правило кромочных не поддерживается.");
    if (source.tool !== expected.tool) fail("TOOL_POLICY_VERSION_INVALID", "Версия правила подтверждения инструмента не поддерживается.");
    if (source.instruction !== expected.instruction) fail("INSTRUCTION_POLICY_VERSION_INVALID", "Версия правила пользовательской инструкции не поддерживается.");
    if (source.measurement !== expected.measurement) fail("MEASUREMENT_POLICY_VERSION_INVALID", "Версия правила измерения не поддерживается.");
    if (source.rowEstimate !== expected.rowEstimate) fail("ROW_ESTIMATE_POLICY_VERSION_INVALID", "Версия правила ориентира по рядам не поддерживается.");
    return deepFreeze(expected);
  }
  function diagnostic(code, fallback = "Подготовка временно недоступна.") {
    const messages = {
      STAGE69_MISSING: "Сначала подтвердите следующий участок проекта.", STAGE69_CONFLICT: "Сохранённые подтверждения следующего участка конфликтуют. Продолжение заблокировано.",
      STAGE69_NOT_COMPLETED: "Подтверждение следующего участка ещё не завершено.", SOURCE_STALE: "Исходные данные проекта изменились. Подготовьте участок заново.",
      SOURCE_CONFLICT: "Подтверждённые данные проекта противоречат друг другу.", SOURCE_IDENTITY_MISMATCH: "Сохранённый результат относится к другой версии проекта.",
      SOURCE_FINGERPRINT_MISMATCH: "Не удалось подтвердить целостность исходных данных.", PROJECT_MISMATCH: "Откройте подготовку из нужного проекта.",
      CALCULATION_MISMATCH: "Расчёт проекта изменился. Подготовьте участок заново.", CAST_ON_MISMATCH: "Подтверждённое количество петель изменилось.",
      REVISION_CONFLICT: "Проект изменён в другой вкладке. Обновите страницу.", PREPARATION_RECORD_CONFLICT: "Сохранённые версии подготовки конфликтуют; автоматический выбор невозможен.",
    };
    return deepFreeze({ code, message: messages[code] || fallback });
  }

  function latestStage65(progress, kind, calculationId, projectId) {
    const records = progress.filter((entry) => entry?.kind === kind && entry.calculation_id === calculationId && !entry.deleted_at && !entry.conflict_id);
    if (records.length !== 1) fail("SOURCE_CONFLICT", "Не удалось однозначно определить подтверждённый план.");
    if (records[0].project_id !== projectId) fail("PROJECT_MISMATCH", "Сохранённый результат относится к другому проекту.");
    return records[0];
  }
  function semanticStepFingerprint(step, stage65Domain) {
    stage65Domain.validateStep(step);
    return stage65Domain.fingerprint({ identity: step.identity, sequenceNumber: step.sequenceNumber, type: step.type, status: step.status, source: clone(step.source), requiredInputs: [...new Set(step.requiredInputs || [])].sort(), expectedOutput: clone(step.expectedOutput), dependencies: [...new Set(step.dependencies || [])].sort() });
  }
  function resolvePlanWorkingMethod(plan) {
    const first = plan?.technologyContext?.workingMethod;
    const second = plan?.planScope?.boundedInputs?.workingMethod;
    const known = [first, second].filter((value) => ["flat", "in_round"].includes(value));
    if (known.length === 2 && known[0] !== known[1]) fail("SOURCE_CONFLICT", "Подтверждённые данные проекта противоречат друг другу.");
    const value = known[0] || "unknown";
    if (value === "unknown") return null;
    const field = ["flat", "in_round"].includes(first) ? "technologyContext.workingMethod" : "planScope.boundedInputs.workingMethod";
    return deepFreeze({ value, origin: "stage65", source: { planIdentity: plan.identity, planFingerprint: plan.fingerprint, field } });
  }
  function resolveAuthoritativeTool(project, stage63Domain, stage69Snapshot) {
    if (!stage63Domain) return null;
    try {
      const history = project?.draft_input?.[stage63Domain.HISTORY_KEY];
      const normalized = stage63Domain.normalizeHistory(history, { projectIdentity: project.project_id });
      const gauge = normalized.records.at(-1);
      if (!gauge || gauge.lifecycle !== "confirmed") return null;
      const identity = stage69Snapshot.source.sourceIdentities.stage63;
      const sourceFingerprint = stage69Snapshot.source.sourceFingerprints.stage63;
      if (gauge.identity !== identity || gauge.fingerprint !== sourceFingerprint) return null;
      const label = normalizeTool(gauge.snapshot?.source?.tool || "");
      return deepFreeze({ kind: "source_bound", source: { kind: "stage63_gauge", identity, fingerprint: sourceFingerprint }, label, authoritative: true, policyVersion: POLICY_VERSIONS.tool });
    } catch { return null; }
  }
  function assessSource(input = {}) {
    const projectId = input.projectId || input.projectIdentity;
    try {
      validateUuid(projectId);
      const project = input.project;
      if (!record(project) || project.project_id !== projectId || ["DELETED", "QUARANTINED"].includes(project.workspace_status)) fail("PROJECT_MISMATCH", "Откройте подготовку из нужного проекта.");
      const calculationId = project.active_calculation_id;
      validateUuid(calculationId, "CALCULATION_MISMATCH");
      const progress = Array.isArray(input.progress) ? input.progress : [];
      const stage69Domain = input.stage69Domain;
      const stage65Domain = input.stage65Domain;
      if (!stage69Domain || !stage65Domain || !input.stage66Domain || !input.stage67Domain || !input.stage68Domain) fail("STORAGE_UNAVAILABLE", "Проверка исходных данных временно недоступна.");
      const allStage69Records = progress.filter((entry) => entry?.kind === stage69Domain.KIND && !entry.deleted_at);
      if (allStage69Records.some((entry) => entry.project_id !== projectId)) fail("PROJECT_MISMATCH", "Подтверждение относится к другому проекту.");
      if (allStage69Records.some((entry) => entry.calculation_id !== calculationId)) fail("CALCULATION_MISMATCH", "Подтверждение относится к другому расчёту.");
      if (allStage69Records.some((entry) => entry.conflict_id)) fail("STAGE69_CONFLICT", "Сохранённые подтверждения следующего участка конфликтуют.");
      const stage69Records = allStage69Records.filter((entry) => !entry.conflict_id);
      if (!stage69Records.length) fail("STAGE69_MISSING", "Сначала подтвердите следующий участок проекта.");
      if (stage69Records.length !== 1 || (stage69Records[0].epoch ?? 1) !== 1) fail("STAGE69_CONFLICT", "Сохранённые подтверждения следующего участка конфликтуют. Продолжение заблокировано.");
      const stage69Record = stage69Records[0];
      const stage69State = stage69Domain.validateProgressState(stage69Record.state, { projectIdentity: projectId, calculationId });
      if (stage69State.lifecycle !== "completed" || stage69State.snapshot.confirmation?.explicit !== true || stage69State.snapshot.revision !== 1) fail("STAGE69_NOT_COMPLETED", "Подтверждение следующего участка ещё не завершено.");
      const upstream = stage69Domain.assessSource({ projectIdentity: projectId, project, progress, stage65Domain, stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain, stage68Domain: input.stage68Domain });
      if (upstream.lifecycle !== "ready") fail(upstream.diagnostic?.code || "SOURCE_STALE", upstream.diagnostic?.message || "Исходные данные проекта изменились.");
      const stage69Snapshot = stage69Domain.validateBinding(stage69State.snapshot, upstream);
      if (stage69Snapshot.clarification.foundationType !== "ribbing" || canonicalize(stage69Snapshot.clarification.target) !== canonicalize({ kind: "height", value: 5, unit: "cm" })) fail("UNSUPPORTED_RIB", "Подтверждённый начальный участок не поддерживается.");
      const stage65Record = latestStage65(progress, stage65Domain.KIND, calculationId, projectId);
      const stage65State = stage65Domain.validateProgressState(stage65Record.state, { projectIdentity: projectId, calculationId });
      const plan = stage65State.history.at(-1);
      if (!plan || plan.lifecycle !== "completed" || plan.identity !== stage69Snapshot.source.stage65PlanIdentity || plan.fingerprint !== stage69Snapshot.source.stage65Fingerprint) fail("SOURCE_FINGERPRINT_MISMATCH", "План проекта изменился.");
      const step = plan.steps?.[1];
      if (!step || step.sequenceNumber !== 2 || step.type !== "FOUNDATION_SECTION" || step.identity !== stage69Snapshot.source.stepIdentity) fail("SOURCE_IDENTITY_MISMATCH", "Начальный участок проекта изменился.");
      const stepFingerprint = semanticStepFingerprint(step, stage65Domain);
      const stage67Record = latestStage65(progress, input.stage67Domain.KIND, calculationId, projectId);
      const stage67State = input.stage67Domain.validateProgressState(stage67Record.state, { projectIdentity: projectId, calculationId });
      const castOn = stage67State.snapshot;
      if (castOn.lifecycle !== "completed" || castOn.identity !== stage69Snapshot.source.stage67SnapshotIdentity || castOn.fingerprint !== stage69Snapshot.source.stage67Fingerprint || castOn.step?.targetStitchCount !== 100 || castOn.check?.observedStitchCount !== 100 || castOn.check?.explicitConfirmation !== true || castOn.check?.result !== "match") fail("CAST_ON_MISMATCH", "Подтверждённое количество петель изменилось.");
      SOURCE_STAGE_KEYS.forEach((key) => {
        if (!stage69Snapshot.source.sourceIdentities[key] || !stage69Snapshot.source.sourceFingerprints[key]) fail("SOURCE_FINGERPRINT_MISMATCH", "Цепочка исходных данных неполна.");
      });
      const source = {
        stage69: { progressIdentity: stage69Record.progress_id, epoch: stage69Record.epoch ?? 1, snapshotIdentity: stage69Snapshot.identity, fingerprint: stage69Snapshot.fingerprint },
        stage65: { progressIdentity: stage65Record.progress_id, planIdentity: plan.identity, planFingerprint: plan.fingerprint, stepIdentity: step.identity, stepFingerprint },
        stage67: { progressIdentity: stage67Record.progress_id, snapshotIdentity: castOn.identity, fingerprint: castOn.fingerprint },
        inheritedSourceIdentities: clone(stage69Snapshot.source.sourceIdentities), inheritedSourceFingerprints: clone(stage69Snapshot.source.sourceFingerprints),
        observedStorageRevisions: { project: project.revision, stage65Progress: stage65Record.revision ?? 1, stage66Progress: (progress.find((e) => e.kind === input.stage66Domain.KIND)?.revision ?? 1), stage67Progress: stage67Record.revision ?? 1, stage68Progress: (progress.find((e) => e.kind === input.stage68Domain.KIND)?.revision ?? 1), stage69Progress: stage69Record.revision ?? 1, preparationProgress: input.preparationProgressRevision ?? null },
        validatedAt: input.validatedAt || new Date().toISOString(),
      };
      const confirmedContext = { step: { sequence: 2, type: "FOUNDATION_SECTION", identity: step.identity, fingerprint: stepFingerprint }, foundationType: "ribbing", castOnCount: 100, target: { kind: "height", value: 5, unit: "cm" } };
      return deepFreeze({ lifecycle: "ready", projectId, calculationId, source, confirmedContext, workingMethod: resolvePlanWorkingMethod(plan), authoritativeTool: resolveAuthoritativeTool(project, input.stage63Domain, stage69Snapshot), projectRevision: project.revision });
    } catch (error) {
      const code = error?.code || "STORAGE_UNAVAILABLE";
      return deepFreeze({ lifecycle: "blocked", projectId: typeof projectId === "string" ? projectId : "", calculationId: input.project?.active_calculation_id || "", diagnostic: diagnostic(code, error?.userMessage || "Подготовка временно недоступна."), error: { code } });
    }
  }
  function requireReady(assessment) { if (assessment?.lifecycle !== "ready") fail(assessment?.diagnostic?.code || "SOURCE_STALE", assessment?.diagnostic?.message || "Исходные данные проекта изменились."); return assessment; }
  function deterministicIdentity(assessment, epoch) {
    requireReady(assessment);
    return `${assessment.projectId}:foundation-section-execution-preparation:${epoch}:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: assessment.projectId, calculationId: assessment.calculationId, epoch, stage69SnapshotIdentity: assessment.source.stage69.snapshotIdentity, stage69Fingerprint: assessment.source.stage69.fingerprint })}`;
  }
  function initialDraft(assessment) {
    const method = assessment.workingMethod ? clone(assessment.workingMethod) : null;
    return { ribPattern: null, workingMethod: method, edgePolicy: method ? edgePolicyFor(method.value) : null, toolConfirmation: assessment.authoritativeTool ? clone(assessment.authoritativeTool) : null, instructionSource: null, measurementAcknowledged: false, stitchAllocation: null, rowEstimate: null, reviewFingerprint: null };
  }
  function semanticStatePayload(state) {
    return { kind: state.kind, schemaVersion: state.schemaVersion, identity: state.identity, projectId: state.projectId, calculationId: state.calculationId, epoch: state.epoch, predecessorIdentity: state.predecessorIdentity, lifecycle: state.lifecycle, source: state.source, draft: state.draft, blocker: state.blocker, completedSnapshot: state.completedSnapshot };
  }
  function stateFingerprint(state) { return fingerprint(semanticStatePayload(state)); }
  function createInitialState(assessmentSource, metadata = {}) {
    const assessment = requireReady(assessmentSource);
    const epoch = Number.isSafeInteger(metadata.epoch) && metadata.epoch > 0 ? metadata.epoch : 1;
    const createdAt = validateTimestamp(metadata.createdAt || assessment.source.validatedAt);
    const value = { kind: KIND, schemaVersion: SCHEMA_VERSION, identity: deterministicIdentity(assessment, epoch), projectId: assessment.projectId, calculationId: assessment.calculationId, epoch, predecessorIdentity: metadata.predecessorIdentity || null, lifecycle: "collecting", revision: 1, source: clone(assessment.source), draft: initialDraft(assessment), blocker: null, completedSnapshot: null, operations: [], timestamps: { createdAt, updatedAt: createdAt }, fingerprint: "" };
    value.source.observedStorageRevisions.preparationProgress = null;
    value.fingerprint = stateFingerprint(value);
    return validateProgressState(value, { assessment });
  }
  function canonicalDraftInput(state, input, metadata = {}) {
    const pattern = input.ribPattern ? ribPattern(typeof input.ribPattern === "string" ? input.ribPattern : input.ribPattern.kind) : null;
    let method = state.draft.workingMethod;
    if (input.workingMethod) {
      const supplied = typeof input.workingMethod === "string" ? { value: input.workingMethod, origin: "user", explicit: true, confirmedAt: metadata.timestamp } : input.workingMethod;
      method = validateWorkingMethod(supplied, metadata.assessment);
    }
    const edge = method ? edgePolicyFor(method.value) : null;
    const rawAllocation = pattern && method ? allocationFor(pattern, method, 100) : null;
    const allocation = rawAllocation?.compatible ? { totalCastOn: 100, edgeCount: rawAllocation.edgeCount, workingStitches: rawAllocation.workingStitches, repeatLength: rawAllocation.repeatLength, repeatCount: rawAllocation.repeatCount } : null;
    let tool = input.toolConfirmation || state.draft.toolConfirmation;
    if (typeof input.tool === "string") tool = { kind: "user_provided", label: input.tool, explicit: true, policyVersion: POLICY_VERSIONS.tool, confirmedAt: metadata.timestamp };
    if (tool) tool = validateToolConfirmation(tool, metadata.assessment);
    let instruction = input.instructionSource || null;
    if (!instruction && typeof input.instruction === "string" && pattern && method) {
      const text = normalizeInstruction(input.instruction);
      instruction = { kind: "user_provided", text, support: instructionSupport(pattern, method), policyVersion: POLICY_VERSIONS.instruction, attestation: { explicit: input.instructionAttested === true, authority: "user", yarnAiTechnicalVerification: false, confirmedAt: metadata.timestamp }, contentFingerprint: fingerprint(text) };
    }
    if (instruction && pattern && method) instruction = validateInstructionSource(instruction, pattern, method);
    return { ribPattern: pattern, workingMethod: method ? clone(method) : null, edgePolicy: edge ? clone(edge) : null, toolConfirmation: tool ? clone(tool) : null, instructionSource: instruction ? clone(instruction) : null, measurementAcknowledged: input.measurementAcknowledged === true, stitchAllocation: allocation, rowEstimate: null, reviewFingerprint: null };
  }
  function operationReceipt(operationId, command, payload, resultingRevision, at) {
    validateUuid(operationId, "OPERATION_ID_CONFLICT"); validateTimestamp(at);
    return { operationId, command, payloadFingerprint: fingerprint(payload), resultingRevision, at };
  }
  function replayOrConflict(state, operationId, command, payload) {
    const found = state.operations.find((entry) => entry.operationId === operationId);
    if (!found) return false;
    if (found.command !== command || found.payloadFingerprint !== fingerprint(payload)) fail("OPERATION_ID_CONFLICT", "Операция уже использована для другого изменения.");
    return true;
  }
  function editDraft(stateSource, input = {}, metadata = {}) {
    const state = validateProgressState(stateSource, { assessment: metadata.assessment, allowSourceInvalid: false });
    if (!["collecting", "reviewing"].includes(state.lifecycle)) fail(state.lifecycle === "completed" ? "COMPLETED_PREPARATION_IMMUTABLE" : "INVALID_LIFECYCLE_TRANSITION", "Это действие недоступно в текущем состоянии.");
    const at = validateTimestamp(metadata.timestamp);
    const operationId = metadata.operationId;
    const nextDraft = canonicalDraftInput(state, input, metadata);
    const payload = { command: "edit", draft: nextDraft };
    if (replayOrConflict(state, operationId, "edit", payload)) return state;
    const next = clone(state); next.lifecycle = "collecting"; next.revision += 1; next.draft = nextDraft; next.blocker = null; next.timestamps.updatedAt = at;
    next.operations.push(operationReceipt(operationId, "edit", payload, next.revision, at)); next.fingerprint = stateFingerprint(next);
    return validateProgressState(next, { assessment: metadata.assessment });
  }
  function reviewSemanticPayload(state) {
    const draft = state.draft;
    if (!draft?.ribPattern || !draft.workingMethod || !draft.edgePolicy || !draft.toolConfirmation || !draft.instructionSource || draft.measurementAcknowledged !== true || draft.rowEstimate !== null) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Заполните и подтвердите все данные подготовки.");
    const pattern = validateRibPattern(draft.ribPattern); const method = validateWorkingMethod(draft.workingMethod); const edge = validateEdgePolicy(draft.edgePolicy, method);
    if (!allocationFor(pattern, method, 100).compatible) fail("INCOMPATIBLE_REPEAT", "Рабочие петли не делятся на раппорт выбранной резинки. Количество петель не изменено.");
    const allocation = validateAllocation(draft.stitchAllocation, pattern, method); const tool = validateToolConfirmation(draft.toolConfirmation); const instruction = validateInstructionSource(draft.instructionSource, pattern, method);
    const policies = validatePolicyVersions({ ...POLICY_VERSIONS, edge: edge.policyVersion }, edge);
    return { kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: state.projectId, calculationId: state.calculationId, epoch: state.epoch, source: semanticSource(state.source), confirmedContext: clone(state.confirmedContext || null), executionParameters: semanticExecutionParameters({ ribPattern: pattern, workingMethod: method, edgePolicy: edge, stitchAllocation: allocation, toolConfirmation: tool }), policyVersions: policies, measurementPolicy: measurementPolicy(), instructionSource: semanticInstructionSource(instruction), rowEstimate: null };
  }
  function semanticSource(source) { const value = clone(source); if (value?.observedStorageRevisions) delete value.observedStorageRevisions; if (value) delete value.validatedAt; return value; }
  function semanticExecutionParameters(source) { const value = clone(source); if (value.workingMethod?.confirmedAt) delete value.workingMethod.confirmedAt; if (value.toolConfirmation?.confirmedAt) delete value.toolConfirmation.confirmedAt; return value; }
  function semanticInstructionSource(source) { const value = clone(source); if (value.attestation) delete value.attestation.confirmedAt; return value; }
  function reviewFingerprintFor(state) {
    const payload = reviewSemanticPayload(state);
    payload.confirmedContext = clone(state.sourceConfirmedContext || state.confirmedContext || state._confirmedContext || null);
    return fingerprint(payload);
  }
  function startReviewing(stateSource, metadata = {}) {
    const state = validateProgressState(stateSource, { assessment: metadata.assessment });
    if (state.lifecycle !== "collecting") fail("INVALID_LIFECYCLE_TRANSITION", "Проверка недоступна в текущем состоянии.");
    const at = validateTimestamp(metadata.timestamp); const payload = { command: "review", draft: clone(state.draft) };
    if (replayOrConflict(state, metadata.operationId, "review", payload)) return state;
    reviewSemanticPayload(state);
    const next = clone(state); next.lifecycle = "reviewing"; next.revision += 1; next.draft.reviewFingerprint = fingerprint(reviewSnapshotPayload(next)); next.timestamps.updatedAt = at;
    next.operations.push(operationReceipt(metadata.operationId, "review", payload, next.revision, at)); next.fingerprint = stateFingerprint(next);
    return validateProgressState(next, { assessment: metadata.assessment });
  }
  function block(stateSource, code, metadata = {}) {
    const state = validateProgressState(stateSource, { assessment: metadata.assessment });
    if (!["collecting", "reviewing"].includes(state.lifecycle)) fail("INVALID_LIFECYCLE_TRANSITION", "Это действие недоступно в текущем состоянии.");
    const at = validateTimestamp(metadata.timestamp); const payload = { command: "block", code };
    if (replayOrConflict(state, metadata.operationId, "block", payload)) return state;
    const next = clone(state); next.lifecycle = "blocked"; next.revision += 1; next.blocker = { code: String(code || "STORAGE_UNAVAILABLE"), previousLifecycle: state.lifecycle }; next.draft.reviewFingerprint = null; next.timestamps.updatedAt = at;
    next.operations.push(operationReceipt(metadata.operationId, "block", payload, next.revision, at)); next.fingerprint = stateFingerprint(next);
    return validateProgressState(next, { assessment: metadata.assessment });
  }
  function revalidateBlocked(stateSource, metadata = {}) {
    const assessment = requireReady(metadata.assessment); const state = validateProgressState(stateSource, { allowSourceInvalid: true });
    if (state.lifecycle !== "blocked" || !state.blocker) fail("INVALID_LIFECYCLE_TRANSITION", "Повторная проверка сейчас недоступна.");
    if (canonicalize(semanticSource(state.source)) !== canonicalize(semanticSource(assessment.source))) fail("SOURCE_STALE", "Исходные данные проекта изменились. Подготовьте участок заново.");
    const at = validateTimestamp(metadata.timestamp); const payload = { command: "revalidate", blocker: clone(state.blocker) };
    if (replayOrConflict(state, metadata.operationId, "revalidate", payload)) return state;
    const next = clone(state); next.lifecycle = state.blocker.previousLifecycle; next.revision += 1; next.blocker = null; if (next.lifecycle === "reviewing") next.draft.reviewFingerprint = fingerprint(reviewSnapshotPayload(next)); next.timestamps.updatedAt = at;
    next.operations.push(operationReceipt(metadata.operationId, "revalidate", payload, next.revision, at)); next.fingerprint = stateFingerprint(next);
    return validateProgressState(next, { assessment });
  }
  function markStale(stateSource, metadata = {}) {
    const state = validateProgressState(stateSource, { allowSourceInvalid: true });
    if (!["collecting", "reviewing", "blocked"].includes(state.lifecycle)) fail(state.lifecycle === "completed" ? "COMPLETED_PREPARATION_IMMUTABLE" : "INVALID_LIFECYCLE_TRANSITION", "Это действие недоступно в текущем состоянии.");
    const at = validateTimestamp(metadata.timestamp); const payload = { command: "stale", sourceFingerprint: metadata.sourceFingerprint || null };
    if (replayOrConflict(state, metadata.operationId, "stale", payload)) return state;
    const next = clone(state); next.lifecycle = "stale"; next.revision += 1; next.blocker = null; next.draft.reviewFingerprint = null; next.timestamps.updatedAt = at;
    next.operations.push(operationReceipt(metadata.operationId, "stale", payload, next.revision, at)); next.fingerprint = stateFingerprint(next);
    return validateProgressState(next, { allowSourceInvalid: true });
  }
  function reviewSnapshotPayload(state) {
    const draft = state.draft; const edge = draft.edgePolicy;
    return { kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: state.projectId, calculationId: state.calculationId, epoch: state.epoch,
      source: semanticSource(state.source), confirmedContext: clone(state.confirmedContext || state.sourceContext || { step: { sequence: 2, type: "FOUNDATION_SECTION", identity: state.source.stage65.stepIdentity, fingerprint: state.source.stage65.stepFingerprint }, foundationType: "ribbing", castOnCount: 100, target: { kind: "height", value: 5, unit: "cm" } }),
      executionParameters: semanticExecutionParameters({ ribPattern: draft.ribPattern, workingMethod: draft.workingMethod, edgePolicy: edge, stitchAllocation: draft.stitchAllocation, toolConfirmation: draft.toolConfirmation }),
      policyVersions: { ...POLICY_VERSIONS, edge: edge.policyVersion }, measurementPolicy: measurementPolicy(), instructionSource: semanticInstructionSource(draft.instructionSource), rowEstimate: null };
  }
  function complete(stateSource, metadata = {}) {
    const assessment = requireReady(metadata.assessment);
    const state = validateProgressState(stateSource, { assessment });
    if (state.lifecycle === "completed") return state;
    if (state.lifecycle !== "reviewing" || metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Проверьте сводку и подтвердите подготовку явно.");
    const freshReview = fingerprint(reviewSnapshotPayload(state));
    if (state.draft.reviewFingerprint !== freshReview) fail("SOURCE_STALE", "Сводка изменилась. Проверьте её ещё раз.");
    const at = validateTimestamp(metadata.timestamp); const payload = { command: "complete", reviewFingerprint: freshReview, explicit: true };
    if (replayOrConflict(state, metadata.operationId, "complete", payload)) return state;
    const snapshot = { ...reviewSnapshotPayload(state), source: clone(state.source), executionParameters: { ribPattern: clone(state.draft.ribPattern), workingMethod: clone(state.draft.workingMethod), edgePolicy: clone(state.draft.edgePolicy), stitchAllocation: clone(state.draft.stitchAllocation), toolConfirmation: clone(state.draft.toolConfirmation) }, instructionSource: clone(state.draft.instructionSource), identity: state.identity, lifecycle: "completed", revision: 1,
      explicitConfirmation: { explicit: true, measurementAcknowledged: true, reviewFingerprint: freshReview, operationId: validateUuid(metadata.operationId, "OPERATION_ID_CONFLICT"), confirmedAt: at },
      timestamps: { createdAt: state.timestamps.createdAt, updatedAt: at, completedAt: at }, fingerprint: freshReview };
    const next = clone(state); next.lifecycle = "completed"; next.revision += 1; next.draft = null; next.blocker = null; next.completedSnapshot = snapshot; next.timestamps.updatedAt = at;
    next.operations.push(operationReceipt(metadata.operationId, "complete", payload, next.revision, at)); next.fingerprint = stateFingerprint(next);
    return validateProgressState(next, { assessment });
  }
  function validateSourceBinding(source) {
    exactKeys(source, ["stage69", "stage65", "stage67", "inheritedSourceIdentities", "inheritedSourceFingerprints", "observedStorageRevisions", "validatedAt"], "CORRUPTED_DRAFT");
    exactKeys(source.stage69, ["progressIdentity", "epoch", "snapshotIdentity", "fingerprint"], "CORRUPTED_DRAFT"); exactKeys(source.stage65, ["progressIdentity", "planIdentity", "planFingerprint", "stepIdentity", "stepFingerprint"], "CORRUPTED_DRAFT"); exactKeys(source.stage67, ["progressIdentity", "snapshotIdentity", "fingerprint"], "CORRUPTED_DRAFT");
    exactKeys(source.inheritedSourceIdentities, SOURCE_STAGE_KEYS, "CORRUPTED_DRAFT"); exactKeys(source.inheritedSourceFingerprints, SOURCE_STAGE_KEYS, "CORRUPTED_DRAFT"); exactKeys(source.observedStorageRevisions, ["project", "stage65Progress", "stage66Progress", "stage67Progress", "stage68Progress", "stage69Progress", "preparationProgress"], "CORRUPTED_DRAFT"); validateTimestamp(source.validatedAt);
    if (source.stage69.epoch !== 1 || !FINGERPRINT.test(source.stage69.fingerprint) || !FINGERPRINT.test(source.stage65.planFingerprint) || !FINGERPRINT.test(source.stage65.stepFingerprint) || !FINGERPRINT.test(source.stage67.fingerprint)) fail("CORRUPTED_DRAFT", "Привязка к проекту повреждена.");
    SOURCE_STAGE_KEYS.forEach((key) => { if (typeof source.inheritedSourceIdentities[key] !== "string" || !source.inheritedSourceIdentities[key] || !FINGERPRINT.test(source.inheritedSourceFingerprints[key])) fail("CORRUPTED_DRAFT", "Цепочка проекта повреждена."); });
    return deepFreeze(clone(source));
  }
  function validateProgressState(source, options = {}) {
    exactKeys(source, STATE_KEYS, source?.lifecycle === "completed" ? "CORRUPTED_COMPLETED_SNAPSHOT" : "CORRUPTED_DRAFT");
    const value = clone(source); if (value.kind !== KIND || value.schemaVersion !== SCHEMA_VERSION || !LIFECYCLES.includes(value.lifecycle)) fail("CORRUPTED_DRAFT", "Черновик подготовки повреждён.");
    validateUuid(value.projectId); validateUuid(value.calculationId, "CALCULATION_MISMATCH"); if (!Number.isSafeInteger(value.epoch) || value.epoch < 1 || !Number.isSafeInteger(value.revision) || value.revision < 1) fail("CORRUPTED_DRAFT", "Версия подготовки повреждена.");
    validateSourceBinding(value.source); if (value.identity !== `${value.projectId}:foundation-section-execution-preparation:${value.epoch}:${fingerprint({ kind: KIND, schemaVersion: SCHEMA_VERSION, projectId: value.projectId, calculationId: value.calculationId, epoch: value.epoch, stage69SnapshotIdentity: value.source.stage69.snapshotIdentity, stage69Fingerprint: value.source.stage69.fingerprint })}`) fail("CORRUPTED_DRAFT", "Идентификатор подготовки повреждён.");
    exactKeys(value.timestamps, ["createdAt", "updatedAt"], "CORRUPTED_DRAFT"); validateTimestamp(value.timestamps.createdAt); validateTimestamp(value.timestamps.updatedAt);
    if (!Array.isArray(value.operations) || value.operations.length > 128) fail("CORRUPTED_DRAFT", "История операций повреждена.");
    const operationIds = new Set(); value.operations.forEach((entry) => { exactKeys(entry, ["operationId", "command", "payloadFingerprint", "resultingRevision", "at"], "CORRUPTED_DRAFT"); validateUuid(entry.operationId, "CORRUPTED_DRAFT"); if (operationIds.has(entry.operationId) || !FINGERPRINT.test(entry.payloadFingerprint) || !Number.isSafeInteger(entry.resultingRevision)) fail("CORRUPTED_DRAFT", "История операций повреждена."); operationIds.add(entry.operationId); validateTimestamp(entry.at); });
    if (value.lifecycle === "completed") {
      if (value.draft !== null || value.blocker !== null || !record(value.completedSnapshot)) fail("CORRUPTED_COMPLETED_SNAPSHOT", "Подтверждённый результат повреждён.");
      const snapshot = value.completedSnapshot;
      exactKeys(snapshot, ["kind", "schemaVersion", "projectId", "calculationId", "epoch", "source", "confirmedContext", "executionParameters", "policyVersions", "measurementPolicy", "instructionSource", "rowEstimate", "identity", "lifecycle", "revision", "explicitConfirmation", "timestamps", "fingerprint"], "CORRUPTED_COMPLETED_SNAPSHOT");
      if (snapshot.kind !== KIND || snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.projectId !== value.projectId || snapshot.calculationId !== value.calculationId || snapshot.epoch !== value.epoch || snapshot.identity !== value.identity || snapshot.lifecycle !== "completed" || snapshot.revision !== 1 || snapshot.rowEstimate !== null) fail("CORRUPTED_COMPLETED_SNAPSHOT", "Подтверждённый результат повреждён.");
      validateSourceBinding(snapshot.source); exactKeys(snapshot.confirmedContext, ["step", "foundationType", "castOnCount", "target"], "CORRUPTED_COMPLETED_SNAPSHOT"); exactKeys(snapshot.confirmedContext.step, ["sequence", "type", "identity", "fingerprint"], "CORRUPTED_COMPLETED_SNAPSHOT"); exactKeys(snapshot.confirmedContext.target, ["kind", "value", "unit"], "CORRUPTED_COMPLETED_SNAPSHOT");
      if (canonicalize(snapshot.source) !== canonicalize(value.source)) fail("CORRUPTED_COMPLETED_SNAPSHOT", "Привязка подтверждённого результата повреждена.");
      if (snapshot.confirmedContext.step.sequence !== 2 || snapshot.confirmedContext.step.type !== "FOUNDATION_SECTION" || snapshot.confirmedContext.foundationType !== "ribbing" || snapshot.confirmedContext.castOnCount !== 100 || canonicalize(snapshot.confirmedContext.target) !== canonicalize({ kind: "height", value: 5, unit: "cm" })) fail("CORRUPTED_COMPLETED_SNAPSHOT", "Подтверждённый контекст повреждён.");
      exactKeys(snapshot.executionParameters, ["ribPattern", "workingMethod", "edgePolicy", "stitchAllocation", "toolConfirmation"], "CORRUPTED_COMPLETED_SNAPSHOT"); const pattern = validateRibPattern(snapshot.executionParameters.ribPattern); const method = validateWorkingMethod(snapshot.executionParameters.workingMethod, options.assessment); const edge = validateEdgePolicy(snapshot.executionParameters.edgePolicy, method); validateAllocation(snapshot.executionParameters.stitchAllocation, pattern, method); validateToolConfirmation(snapshot.executionParameters.toolConfirmation, options.assessment); validatePolicyVersions(snapshot.policyVersions, edge); validateMeasurementPolicy(snapshot.measurementPolicy); validateInstructionSource(snapshot.instructionSource, pattern, method);
      exactKeys(snapshot.explicitConfirmation, ["explicit", "measurementAcknowledged", "reviewFingerprint", "operationId", "confirmedAt"], "CORRUPTED_COMPLETED_SNAPSHOT"); if (snapshot.explicitConfirmation.explicit !== true || snapshot.explicitConfirmation.measurementAcknowledged !== true || !FINGERPRINT.test(snapshot.explicitConfirmation.reviewFingerprint)) fail("CORRUPTED_COMPLETED_SNAPSHOT", "Явное подтверждение повреждено."); validateUuid(snapshot.explicitConfirmation.operationId, "CORRUPTED_COMPLETED_SNAPSHOT"); validateTimestamp(snapshot.explicitConfirmation.confirmedAt);
      if (!value.operations.some((entry) => entry.operationId === snapshot.explicitConfirmation.operationId && entry.command === "complete")) fail("CORRUPTED_COMPLETED_SNAPSHOT", "Операция подтверждения отсутствует.");
      exactKeys(snapshot.timestamps, ["createdAt", "updatedAt", "completedAt"], "CORRUPTED_COMPLETED_SNAPSHOT"); Object.values(snapshot.timestamps).forEach(validateTimestamp);
      if (snapshot.fingerprint !== snapshot.explicitConfirmation.reviewFingerprint || snapshot.fingerprint !== fingerprint(reviewPayloadFromSnapshot(snapshot))) fail("CORRUPTED_COMPLETED_SNAPSHOT", "Целостность подтверждённого результата нарушена.");
    }
    else { exactKeys(value.draft, DRAFT_KEYS, "CORRUPTED_DRAFT"); if (value.draft.rowEstimate !== null) fail("ROW_ESTIMATE_POLICY_VERSION_INVALID", "Для этой резинки ориентир по рядам не используется."); if (value.completedSnapshot !== null) fail("CORRUPTED_DRAFT", "Черновик содержит недопустимый результат."); if (value.lifecycle === "blocked") { exactKeys(value.blocker, ["code", "previousLifecycle"], "CORRUPTED_DRAFT"); if (typeof value.blocker.code !== "string" || !["collecting", "reviewing"].includes(value.blocker.previousLifecycle)) fail("CORRUPTED_DRAFT", "Причина блокировки повреждена."); } else if (value.blocker !== null) fail("CORRUPTED_DRAFT", "Черновик содержит недопустимую блокировку."); if (value.draft.ribPattern) validateRibPattern(value.draft.ribPattern); if (value.draft.workingMethod) { const method = validateWorkingMethod(value.draft.workingMethod, options.assessment); validateEdgePolicy(value.draft.edgePolicy, method); if (value.draft.ribPattern && value.draft.stitchAllocation) validateAllocation(value.draft.stitchAllocation, value.draft.ribPattern, method); } else if (value.draft.edgePolicy !== null) fail("INVALID_EDGE_POLICY", "Правило кромочных задано без способа вязания."); if (value.draft.toolConfirmation) validateToolConfirmation(value.draft.toolConfirmation, options.assessment); if (value.draft.instructionSource) { if (!value.draft.ribPattern || !value.draft.workingMethod) fail("INVALID_INSTRUCTION_SOURCE", "Инструкция не привязана к способу вязания."); validateInstructionSource(value.draft.instructionSource, value.draft.ribPattern, value.draft.workingMethod); } if (value.lifecycle === "reviewing" && !FINGERPRINT.test(value.draft.reviewFingerprint)) fail("CORRUPTED_DRAFT", "Сводка подготовки повреждена."); if (value.lifecycle !== "reviewing" && value.draft.reviewFingerprint !== null) fail("CORRUPTED_DRAFT", "Черновик содержит недействительную сводку."); }
    if (value.fingerprint !== stateFingerprint(value)) fail(value.lifecycle === "completed" ? "CORRUPTED_COMPLETED_SNAPSHOT" : "CORRUPTED_DRAFT", "Целостность подготовки не подтверждена.");
    if (options.assessment?.lifecycle === "ready" && (value.projectId !== options.assessment.projectId || value.calculationId !== options.assessment.calculationId || canonicalize(semanticSource(value.source)) !== canonicalize(semanticSource(options.assessment.source)))) fail("SOURCE_STALE", "Исходные данные проекта изменились. Подготовьте участок заново.");
    return deepFreeze(value);
  }
  function reviewPayloadFromSnapshot(snapshot) {
    return { kind: snapshot.kind, schemaVersion: snapshot.schemaVersion, projectId: snapshot.projectId, calculationId: snapshot.calculationId, epoch: snapshot.epoch, source: semanticSource(snapshot.source), confirmedContext: snapshot.confirmedContext, executionParameters: semanticExecutionParameters(snapshot.executionParameters), policyVersions: snapshot.policyVersions, measurementPolicy: snapshot.measurementPolicy, instructionSource: semanticInstructionSource(snapshot.instructionSource), rowEstimate: snapshot.rowEstimate };
  }
  function safeDestination(value, projectId) {
    try { validateUuid(projectId); const url = new URL(value, "http://localhost"); const values = url.searchParams.getAll("project"); const valid = url.origin === "http://localhost" && !url.username && !url.password && url.pathname === ROUTE_PATH && !url.hash && url.searchParams.size === 1 && values.length === 1 && values[0] === projectId; return deepFreeze({ valid, href: valid ? `${ROUTE_PATH}?project=${encodeURIComponent(projectId)}` : "" }); } catch { return deepFreeze({ valid: false, href: "" }); }
  }
  function projectIdentityFromLocation(location) {
    try { const url = new URL(location.href || `${location.origin || "http://localhost"}${location.pathname || ""}${location.search || ""}${location.hash || ""}`, "http://localhost"); if (url.pathname !== ROUTE_PATH || url.hash || url.searchParams.size !== 1 || url.searchParams.getAll("project").length !== 1) fail("PROJECT_MISMATCH", "Ссылка на подготовку недействительна."); return validateUuid(url.searchParams.get("project")); } catch (error) { if (error?.code) throw error; fail("PROJECT_MISMATCH", "Ссылка на подготовку недействительна."); }
  }

  const api = Object.freeze({ KIND, PROGRESS_KIND: KIND, SCHEMA_VERSION, ROUTE_PATH, POLICY_VERSIONS, EDGE_NONE_VERSION, EDGE_FLAT_VERSION, SOURCE_STAGE_KEYS, LIFECYCLES, FoundationSectionExecutionPreparationError, canonicalize, fingerprint, validateUuid, normalizeTool, normalizeInstruction, ribPattern, validateRibPattern, validateWorkingMethod, edgePolicyFor, allocationFor, validateAllocation, instructionSupport, validateToolConfirmation, validateInstructionSource, measurementPolicy, validateMeasurementPolicy, validatePolicyVersions, diagnostic, semanticStepFingerprint, assessSource, deterministicIdentity, createInitialState, editDraft, startReviewing, block, revalidateBlocked, markStale, complete, validateProgressState, reviewSnapshotPayload, safeDestination, projectIdentityFromLocation });
  globalObject.YarnAIFoundationSectionExecutionPreparation = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
