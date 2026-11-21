"use strict";

(function initializeProjectExecutionNextStepClarification(globalObject) {
  const FORMAT = "yarnai-project-execution-next-step-clarification";
  const VERSION = 1;
  const KIND = "PROJECT_EXECUTION_NEXT_STEP_CLARIFICATION";
  const PROGRESS_KIND = KIND;
  const LIFECYCLES = Object.freeze(["completed"]);
  const VIEW_LIFECYCLES = Object.freeze(["preparing", "ready", "completed", "blocked"]);
  const REQUIRED_INPUTS = Object.freeze(["foundation_type", "foundation_height"]);
  const SOURCE_STAGE_KEYS = Object.freeze(["stage60", "stage61", "stage63", "stage64", "stage65", "stage66", "stage67", "stage68"]);
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "calculationId", "lifecycle", "revision",
    "source", "clarification", "confirmation", "timestamps", "audit", "fingerprint",
  ]);
  const SOURCE_KEYS = Object.freeze([
    "stage68ProgressIdentity", "stage68SnapshotIdentity", "stage68Fingerprint",
    "stage67SnapshotIdentity", "stage67Fingerprint", "stage66SnapshotIdentity", "stage66Fingerprint",
    "stage65PlanIdentity", "stage65Fingerprint", "stepIdentity", "sourceIdentities", "sourceFingerprints",
  ]);
  const CLARIFICATION_KEYS = Object.freeze(["stepSequence", "stepType", "foundationType", "target"]);
  const TARGET_KEYS = Object.freeze(["kind", "value", "unit"]);
  const CONFIRMATION_KEYS = Object.freeze(["explicit", "confirmedAt"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "completedAt"]);
  const AUDIT_KEYS = Object.freeze(["event", "operationId"]);
  const PROGRESS_KEYS = Object.freeze(["kind", "version", "projectId", "calculationId", "lifecycle", "snapshot"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  class ProjectExecutionNextStepClarificationError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "ProjectExecutionNextStepClarificationError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function fail(code, message, details) { throw new ProjectExecutionNextStepClarificationError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  }
  function exactKeys(value, keys, code = "SNAPSHOT_NOT_ALLOWLISTED") {
    if (!record(value)) fail(code, "Сохранённое уточнение повреждено.");
    const actual = Object.keys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !actual.includes(key))) {
      fail(code, "Сохранённое уточнение содержит неподдерживаемые поля.");
    }
  }
  function safeText(value, limit = 360, code = "SNAPSHOT_INVALID") {
    const result = typeof value === "string" && value.trim() ? value.trim() : "";
    if (!result || result.length > limit || /<[^>]*>|(?:^|\s)(?:blob:|javascript:|data:text\/html)/i.test(result)) {
      fail(code, "Сохранённое уточнение содержит небезопасный текст.");
    }
    return result;
  }
  function timestamp(value) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value || ""); }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("VALUE_INVALID", "Высота должна быть конечным числом.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("SNAPSHOT_INVALID", "Сохранённое уточнение содержит неподдерживаемое значение.");
  }
  function fingerprint(value) {
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }
  function semanticSnapshot(value) { const result = clone(value); delete result.fingerprint; return result; }
  function validateProjectIdentity(value, expected = "") {
    const identity = safeText(value, 180, "PROJECT_ID_INVALID");
    if (!UUID_V7.test(identity) || expected && identity !== expected) fail("PROJECT_ID_INVALID", "Ссылка на проект повреждена.");
    return identity;
  }
  function validateOperationId(value) {
    const identity = safeText(value, 180, "OPERATION_ID_INVALID");
    if (!UUID_V7.test(identity)) fail("OPERATION_ID_INVALID", "Идентификатор операции повреждён.");
    return identity;
  }
  function latestRecord(progress, kind, calculationId) {
    return (Array.isArray(progress) ? progress : [])
      .filter((entry) => entry?.kind === kind && entry?.calculation_id === calculationId && !entry?.deleted_at)
      .sort((left, right) => String(left.updated_at || "").localeCompare(String(right.updated_at || "")))
      .at(-1) || null;
  }
  function diagnostic(code, message) {
    const messages = {
      PROJECT_ID_REQUIRED: "Откройте уточнение из сохранённого проекта.",
      PROJECT_ID_INVALID: "Ссылка на проект повреждена.",
      PROJECT_NOT_FOUND: "Проект не найден.",
      SOURCE_PROJECT_MISMATCH: "Сохранённые данные относятся к другому проекту.",
      STAGE68_NOT_AVAILABLE: "Сначала откройте сохранённый следующий шаг.",
      STAGE68_STATE_INVALID: "Уточнение для этого состояния не требуется.",
      STAGE68_FINGERPRINT_MISMATCH: "Сохранённый следующий шаг повреждён.",
      STAGE67_RESULT_INVALID: "Подтверждённый набор петель повреждён.",
      STAGE65_FINGERPRINT_MISMATCH: "Сохранённый план работы повреждён.",
      CONDITIONAL_STEP_INVALID: "Не удалось безопасно определить, что нужно уточнить.",
      REQUIRED_INPUTS_UNSUPPORTED: "Не удалось безопасно определить все необходимые уточнения.",
      STORAGE_UNAVAILABLE: "Не удалось открыть сохранённые данные.",
      REVISION_CONFLICT: "Проект изменён в другой вкладке. Обновите страницу.",
    };
    return deepFreeze({ code, message: messages[code] || message || "Не удалось открыть уточнение.", recovery: { path: "/saved-projects", label: "Мои проекты" } });
  }
  function blocked(code, message, projectIdentity = "", calculationId = "") {
    return deepFreeze({ lifecycle: "blocked", projectIdentity, calculationId, source: null, step: null, missingInputs: [], confirmed: null, diagnostic: diagnostic(code, message) });
  }
  function positiveNumber(value, code = "FOUNDATION_HEIGHT_INVALID") {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) fail(code, "Укажите высоту больше нуля в сантиметрах.");
    return Object.is(value, -0) ? 0 : value;
  }
  function foundationHeight(output) {
    if (!record(output)) return null;
    for (const key of ["foundationHeightCm", "heightCm", "lengthCm"]) {
      if (typeof output[key] === "number" && Number.isFinite(output[key]) && output[key] > 0) return output[key];
    }
    if (record(output.target) && output.target.unit === "cm" && typeof output.target.value === "number" && Number.isFinite(output.target.value) && output.target.value > 0) return output.target.value;
    return null;
  }
  function foundationTypeOptions(stage65Domain) {
    const configured = stage65Domain?.BOUNDED_INPUTS?.foundationType;
    if (!Array.isArray(configured)) return deepFreeze([]);
    return deepFreeze(configured.filter((value) => value !== "unknown").map((value) => safeText(value, 80)));
  }

  function assessSource(input = {}) {
    const projectIdentity = typeof input.projectIdentity === "string" ? input.projectIdentity.trim() : "";
    let calculationId = "";
    try {
      validateProjectIdentity(projectIdentity);
      if (!record(input.project)) fail("PROJECT_NOT_FOUND", "Проект не найден.");
      if (input.project.project_id !== projectIdentity) fail("SOURCE_PROJECT_MISMATCH", "Проект не совпадает со ссылкой.");
      calculationId = safeText(input.project.active_calculation_id, 180, "SOURCE_PROJECT_MISMATCH");
      const stage65Domain = input.stage65Domain;
      const stage68Domain = input.stage68Domain;
      if (!stage65Domain || !stage68Domain || !input.stage66Domain || !input.stage67Domain) fail("STORAGE_UNAVAILABLE", "Проверка источников недоступна.");

      const stage68Record = input.stage68Record || latestRecord(input.progress, stage68Domain.KIND, calculationId);
      if (!record(stage68Record)) fail("STAGE68_NOT_AVAILABLE", "Следующий шаг ещё не сохранён.");
      if (stage68Record.project_id !== projectIdentity || stage68Record.calculation_id !== calculationId) fail("SOURCE_PROJECT_MISMATCH", "Следующий шаг относится к другому проекту.");
      let stage68State;
      try { stage68State = stage68Domain.validateProgressState(stage68Record.state, { projectIdentity, calculationId }); }
      catch (error) { fail("STAGE68_FINGERPRINT_MISMATCH", error?.userMessage || error?.message); }
      const stage68 = stage68State.snapshot;
      const stage68Assessment = stage68Domain.assessSource({
        projectIdentity, project: input.project, progress: input.progress,
        stage65Record: input.stage65Record, stage66Record: input.stage66Record, stage67Record: input.stage67Record,
        stage65Domain, stage66Domain: input.stage66Domain, stage67Domain: input.stage67Domain,
      });
      if (stage68Assessment.lifecycle === "blocked") fail(stage68Assessment.diagnostic.code, stage68Assessment.diagnostic.message);
      try { stage68Domain.validateBinding(stage68, stage68Assessment); }
      catch (error) { fail("STAGE68_FINGERPRINT_MISMATCH", error?.userMessage || error?.message); }
      if (stage68.lifecycle !== "unavailable" || stage68.reasonCode !== "NEXT_STEP_CONDITIONAL") fail("STAGE68_STATE_INVALID", "Этот следующий шаг не ожидает уточнений.");

      const stage65Record = input.stage65Record || latestRecord(input.progress, stage65Domain.KIND, calculationId);
      if (!record(stage65Record) || stage65Record.project_id !== projectIdentity || stage65Record.calculation_id !== calculationId) fail("SOURCE_PROJECT_MISMATCH", "План относится к другому проекту.");
      let stage65State;
      try { stage65State = stage65Domain.validateProgressState(stage65Record.state, { projectIdentity, calculationId }); }
      catch (error) { fail("STAGE65_FINGERPRINT_MISMATCH", error?.userMessage || error?.message); }
      const stage65 = stage65State.history.at(-1);
      if (!stage65 || stage65.lifecycle !== "completed" || stage65.identity !== stage68.source.stage65PlanIdentity || stage65.fingerprint !== stage68.source.stage65Fingerprint) fail("STAGE65_FINGERPRINT_MISMATCH", "План не совпадает с сохранённым следующим шагом.");
      const step = stage65.steps?.[1];
      if (!step || step.sequenceNumber !== 2 || step.type !== "FOUNDATION_SECTION" || step.status !== "conditional" || step.identity === stage65.steps[0]?.identity) fail("CONDITIONAL_STEP_INVALID", "Ожидаемый начальный участок не найден.");
      if (stage65.steps[0]?.identity !== stage68.completedStep.identity || stage68.completedStep.type !== "CAST_ON" || stage68.completedStep.observedResult?.explicitConfirmation !== true || stage68.completedStep.target?.value !== 100 || stage68.completedStep.observedResult?.value !== 100) fail("STAGE67_RESULT_INVALID", "Набор петель не подтверждён.");

      const required = Array.isArray(step.requiredInputs) ? [...new Set(step.requiredInputs)] : [];
      if (!required.length || required.some((name) => !REQUIRED_INPUTS.includes(name))) fail("REQUIRED_INPUTS_UNSUPPORTED", "Перечень уточнений не поддерживается.");
      const options = foundationTypeOptions(stage65Domain);
      const candidateFoundationType = typeof step.expectedOutput?.foundationType === "string" ? step.expectedOutput.foundationType.trim() : "";
      const confirmed = {
        foundationType: options.includes(candidateFoundationType) ? candidateFoundationType : null,
        foundationHeight: foundationHeight(step.expectedOutput),
      };
      const missingInputs = required.filter((name) => name === "foundation_type" ? !confirmed.foundationType : !confirmed.foundationHeight);
      if (!missingInputs.length) fail("CONDITIONAL_STEP_INVALID", "В плане не осталось отсутствующих уточнений.");
      if (missingInputs.includes("foundation_type") && !options.length) fail("REQUIRED_INPUTS_UNSUPPORTED", "Допустимые типы начального участка не определены.");

      const sourceIdentities = { ...clone(stage68.source.sourceIdentities), stage68: stage68.identity };
      const sourceFingerprints = { ...clone(stage68.source.sourceFingerprints), stage68: stage68.fingerprint };
      exactKeys(sourceIdentities, SOURCE_STAGE_KEYS, "STAGE68_FINGERPRINT_MISMATCH");
      exactKeys(sourceFingerprints, SOURCE_STAGE_KEYS, "STAGE68_FINGERPRINT_MISMATCH");
      return deepFreeze({
        lifecycle: "ready", projectIdentity, calculationId,
        source: {
          stage68ProgressIdentity: safeText(stage68Record.progress_id, 240), stage68SnapshotIdentity: stage68.identity, stage68Fingerprint: stage68.fingerprint,
          stage67SnapshotIdentity: stage68.source.stage67SnapshotIdentity, stage67Fingerprint: stage68.source.stage67Fingerprint,
          stage66SnapshotIdentity: stage68.source.stage66SnapshotIdentity, stage66Fingerprint: stage68.source.stage66Fingerprint,
          stage65PlanIdentity: stage68.source.stage65PlanIdentity, stage65Fingerprint: stage68.source.stage65Fingerprint,
          stepIdentity: step.identity, sourceIdentities, sourceFingerprints,
        },
        step: { identity: step.identity, sequenceNumber: 2, type: "FOUNDATION_SECTION" },
        missingInputs: deepFreeze(clone(missingInputs)), confirmed: deepFreeze(confirmed), foundationTypeOptions: options,
        context: { stitchCount: 100 }, diagnostic: null,
      });
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "STORAGE_UNAVAILABLE";
      return blocked(code, error?.userMessage || error?.message, projectIdentity, calculationId);
    }
  }

  function deterministicIdentity(assessment) {
    if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Уточнение нельзя сохранить без проверенного источника.");
    return `${assessment.projectIdentity}:execution-next-step-clarification:${fingerprint({
      projectIdentity: assessment.projectIdentity, calculationId: assessment.calculationId,
      stage68Fingerprint: assessment.source.stage68Fingerprint, stepIdentity: assessment.step.identity,
    })}`;
  }
  function resolveClarification(assessment, input = {}) {
    if (assessment?.lifecycle !== "ready") fail("SOURCE_INVALID", "Уточнение нельзя подтвердить.");
    const allowedTypes = assessment.foundationTypeOptions || [];
    const missingType = assessment.missingInputs.includes("foundation_type");
    const missingHeight = assessment.missingInputs.includes("foundation_height");
    const suppliedType = typeof input.foundationType === "string" ? input.foundationType.trim() : "";
    const suppliedHeight = input.foundationHeight;
    if (!missingType && suppliedType && suppliedType !== assessment.confirmed.foundationType) fail("CONFIRMED_VALUE_IMMUTABLE", "Подтверждённый тип нельзя заменить.");
    if (!missingHeight && suppliedHeight !== undefined && suppliedHeight !== assessment.confirmed.foundationHeight) fail("CONFIRMED_VALUE_IMMUTABLE", "Подтверждённую высоту нельзя заменить.");
    const foundationType = missingType ? suppliedType : assessment.confirmed.foundationType;
    const height = missingHeight ? positiveNumber(suppliedHeight) : positiveNumber(assessment.confirmed.foundationHeight);
    if (!foundationType) fail("FOUNDATION_TYPE_REQUIRED", "Выберите тип начального участка.");
    if (!allowedTypes.includes(foundationType) && missingType) fail("FOUNDATION_TYPE_INVALID", "Выбран неподдерживаемый тип начального участка.");
    return deepFreeze({ stepSequence: 2, stepType: "FOUNDATION_SECTION", foundationType, target: { kind: "height", value: height, unit: "cm" } });
  }
  function createCompletedSnapshot(assessment, input = {}, metadata = {}) {
    const clarification = resolveClarification(assessment, input);
    if (metadata.explicitConfirmation !== true) fail("EXPLICIT_CONFIRMATION_REQUIRED", "Подтвердите следующий шаг явно.");
    const confirmedAt = safeText(metadata.confirmedAt, 40);
    const createdAt = safeText(metadata.createdAt || confirmedAt, 40);
    if (!timestamp(createdAt) || !timestamp(confirmedAt)) fail("SNAPSHOT_INVALID", "Время подтверждения повреждено.");
    const operationId = validateOperationId(metadata.operationId);
    const value = {
      format: FORMAT, version: VERSION, identity: deterministicIdentity(assessment), projectIdentity: assessment.projectIdentity,
      calculationId: assessment.calculationId, lifecycle: "completed", revision: 1, source: clone(assessment.source), clarification: clone(clarification),
      confirmation: { explicit: true, confirmedAt }, timestamps: { createdAt, completedAt: confirmedAt },
      audit: { event: "NEXT_STEP_CLARIFICATION_COMPLETED", operationId }, fingerprint: "",
    };
    value.fingerprint = fingerprint(semanticSnapshot(value));
    return validateSnapshot(value);
  }
  function validateSnapshot(source) {
    exactKeys(source, SNAPSHOT_KEYS);
    canonicalize(source);
    const value = clone(source);
    validateProjectIdentity(value.projectIdentity);
    if (value.format !== FORMAT || value.version !== VERSION || value.lifecycle !== "completed" || value.revision !== 1 || !safeText(value.identity, 420) || !safeText(value.calculationId, 180)) fail("SNAPSHOT_INVALID", "Сохранённое уточнение повреждено.");
    exactKeys(value.source, SOURCE_KEYS);
    for (const key of SOURCE_KEYS.slice(0, 10)) safeText(value.source[key], 420);
    exactKeys(value.source.sourceIdentities, SOURCE_STAGE_KEYS);
    exactKeys(value.source.sourceFingerprints, SOURCE_STAGE_KEYS);
    SOURCE_STAGE_KEYS.forEach((key) => { safeText(value.source.sourceIdentities[key], 420); safeText(value.source.sourceFingerprints[key], 420); });
    if (value.source.sourceIdentities.stage68 !== value.source.stage68SnapshotIdentity || value.source.sourceFingerprints.stage68 !== value.source.stage68Fingerprint || value.source.sourceIdentities.stage67 !== value.source.stage67SnapshotIdentity || value.source.sourceFingerprints.stage67 !== value.source.stage67Fingerprint || value.source.sourceIdentities.stage66 !== value.source.stage66SnapshotIdentity || value.source.sourceFingerprints.stage66 !== value.source.stage66Fingerprint || value.source.sourceIdentities.stage65 !== value.source.stage65PlanIdentity || value.source.sourceFingerprints.stage65 !== value.source.stage65Fingerprint) fail("SNAPSHOT_INVALID", "Provenance уточнения повреждён.");
    exactKeys(value.clarification, CLARIFICATION_KEYS);
    exactKeys(value.clarification.target, TARGET_KEYS);
    if (value.clarification.stepSequence !== 2 || value.clarification.stepType !== "FOUNDATION_SECTION" || !safeText(value.clarification.foundationType, 80) || value.clarification.target.kind !== "height" || value.clarification.target.unit !== "cm") fail("SNAPSHOT_INVALID", "Уточнение начального участка повреждено.");
    positiveNumber(value.clarification.target.value, "SNAPSHOT_INVALID");
    exactKeys(value.confirmation, CONFIRMATION_KEYS);
    if (value.confirmation.explicit !== true || !timestamp(value.confirmation.confirmedAt)) fail("SNAPSHOT_INVALID", "Подтверждение повреждено.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS);
    if (!timestamp(value.timestamps.createdAt) || !timestamp(value.timestamps.completedAt) || value.timestamps.completedAt !== value.confirmation.confirmedAt) fail("SNAPSHOT_INVALID", "Время уточнения повреждено.");
    exactKeys(value.audit, AUDIT_KEYS);
    if (value.audit.event !== "NEXT_STEP_CLARIFICATION_COMPLETED") fail("SNAPSHOT_INVALID", "Audit уточнения повреждён.");
    validateOperationId(value.audit.operationId);
    if (value.identity !== `${value.projectIdentity}:execution-next-step-clarification:${fingerprint({ projectIdentity: value.projectIdentity, calculationId: value.calculationId, stage68Fingerprint: value.source.stage68Fingerprint, stepIdentity: value.source.stepIdentity })}`) fail("SNAPSHOT_INVALID", "Identity уточнения повреждён.");
    if (value.fingerprint !== fingerprint(semanticSnapshot(value))) fail("SOURCE_FINGERPRINT_MISMATCH", "Fingerprint уточнения не совпадает с содержимым.");
    return deepFreeze(value);
  }
  function createProgressState(snapshotSource) {
    const snapshot = validateSnapshot(snapshotSource);
    return validateProgressState({ kind: KIND, version: VERSION, projectId: snapshot.projectIdentity, calculationId: snapshot.calculationId, lifecycle: snapshot.lifecycle, snapshot }, { projectIdentity: snapshot.projectIdentity, calculationId: snapshot.calculationId });
  }
  function validateProgressState(source, options = {}) {
    exactKeys(source, PROGRESS_KEYS, "PROGRESS_STATE_INVALID");
    const value = clone(source);
    if (value.kind !== KIND || value.version !== VERSION || value.lifecycle !== "completed" || value.projectId !== options.projectIdentity || value.calculationId !== options.calculationId) fail("PROGRESS_STATE_INVALID", "Запись уточнения повреждена.");
    value.snapshot = clone(validateSnapshot(value.snapshot));
    if (value.snapshot.projectIdentity !== value.projectId || value.snapshot.calculationId !== value.calculationId) fail("PROGRESS_STATE_INVALID", "Запись уточнения не согласована со snapshot.");
    return deepFreeze(value);
  }
  function validateBinding(snapshotSource, assessment) {
    const snapshot = validateSnapshot(snapshotSource);
    if (assessment?.lifecycle !== "ready" || snapshot.identity !== deterministicIdentity(assessment) || canonicalize(snapshot.source) !== canonicalize(assessment.source)) fail("SOURCE_FINGERPRINT_MISMATCH", "Уточнение не соответствует текущей цепочке проекта.");
    if (assessment.missingInputs.includes("foundation_type") && !assessment.foundationTypeOptions.includes(snapshot.clarification.foundationType)) fail("FOUNDATION_TYPE_INVALID", "Сохранённый тип больше не поддерживается.");
    if (!assessment.missingInputs.includes("foundation_type") && snapshot.clarification.foundationType !== assessment.confirmed.foundationType) fail("CONFIRMED_VALUE_IMMUTABLE", "Подтверждённый тип был изменён.");
    if (!assessment.missingInputs.includes("foundation_height") && snapshot.clarification.target.value !== assessment.confirmed.foundationHeight) fail("CONFIRMED_VALUE_IMMUTABLE", "Подтверждённая высота была изменена.");
    return snapshot;
  }
  function safeDestination(value, projectIdentity) {
    try {
      validateProjectIdentity(projectIdentity);
      const url = new URL(value, "http://localhost");
      const valid = url.origin === "http://localhost" && !url.username && !url.password && url.pathname === "/project-execution-next-step-clarification" && url.searchParams.size === 1 && url.searchParams.get("project") === projectIdentity;
      return deepFreeze({ valid, href: valid ? `${url.pathname}${url.search}` : "" });
    } catch { return deepFreeze({ valid: false, href: "" }); }
  }

  const api = Object.freeze({
    FORMAT, VERSION, KIND, PROGRESS_KIND, LIFECYCLES, VIEW_LIFECYCLES, REQUIRED_INPUTS, SOURCE_STAGE_KEYS,
    SNAPSHOT_KEYS, SOURCE_KEYS, CLARIFICATION_KEYS, TARGET_KEYS, CONFIRMATION_KEYS, TIMESTAMP_KEYS, AUDIT_KEYS, PROGRESS_KEYS,
    ProjectExecutionNextStepClarificationError, canonicalize, fingerprint, validateProjectIdentity, validateOperationId,
    latestRecord, diagnostic, foundationHeight, foundationTypeOptions, assessSource, deterministicIdentity, resolveClarification,
    createCompletedSnapshot, validateSnapshot, createProgressState, validateProgressState, validateBinding, safeDestination,
  });
  globalObject.YarnAIProjectExecutionNextStepClarification = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
