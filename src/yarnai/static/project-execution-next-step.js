"use strict";

(function initializeProjectExecutionNextStep(globalObject) {
  const FORMAT = "yarnai-project-execution-next-step-preparation";
  const VERSION = 1;
  const KIND = "PROJECT_EXECUTION_NEXT_STEP_PREPARATION";
  const PROGRESS_KIND = KIND;
  const LIFECYCLES = Object.freeze(["prepared", "unavailable", "blocked"]);
  const SUPPORTED_NEXT_STEP_TYPES = Object.freeze(["FOUNDATION_SECTION"]);
  const SOURCE_STAGE_KEYS = Object.freeze(["stage60", "stage61", "stage63", "stage64", "stage65", "stage66", "stage67"]);
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "calculationId", "lifecycle", "revision",
    "source", "completedStep", "nextStep", "context", "nextAction", "reasonCode", "timestamps", "audit", "fingerprint",
  ]);
  const SOURCE_KEYS = Object.freeze([
    "stage67ProgressIdentity", "stage67SnapshotIdentity", "stage67Fingerprint",
    "stage66ProgressIdentity", "stage66SnapshotIdentity", "stage66Fingerprint",
    "stage65PlanIdentity", "stage65Fingerprint", "sourceIdentities", "sourceFingerprints",
  ]);
  const COMPLETED_STEP_KEYS = Object.freeze(["identity", "sequenceNumber", "type", "instruction", "target", "observedResult", "completedAt"]);
  const NEXT_STEP_KEYS = Object.freeze(["identity", "sequenceNumber", "type", "title", "instruction", "measurableGoal", "executionParameters", "sourceIdentity", "warnings", "assumptions"]);
  const GOAL_KEYS = Object.freeze(["value", "unit", "criterion"]);
  const CONTEXT_KEYS = Object.freeze(["product", "yarn", "tools", "technique", "gauge", "warnings", "assumptions"]);
  const GAUGE_KEYS = Object.freeze(["stitchesPer10Cm", "rowsPer10Cm", "display"]);
  const ACTION_KEYS = Object.freeze(["status", "destination", "label", "reasonCode"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "preparedAt"]);
  const AUDIT_KEYS = Object.freeze(["event", "operationId"]);
  const PROGRESS_KEYS = Object.freeze(["kind", "version", "projectId", "calculationId", "lifecycle", "snapshot"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const REASON_CODES = Object.freeze([
    "NO_NEXT_PLAN_STEP", "NEXT_STEP_CONDITIONAL", "NEXT_STEP_INCOMPLETE", "NEXT_STEP_UNSUPPORTED",
    "NEXT_STEP_EXECUTION_ROUTE_UNAVAILABLE",
  ]);
  const BLOCKING_CODES = Object.freeze([
    "PROJECT_ID_REQUIRED", "PROJECT_ID_INVALID", "PROJECT_NOT_FOUND", "SOURCE_PROJECT_MISMATCH",
    "STAGE67_NOT_COMPLETED", "STAGE67_FINGERPRINT_MISMATCH", "STAGE66_FINGERPRINT_MISMATCH", "STAGE65_FINGERPRINT_MISMATCH",
    "COMPLETED_STEP_MISMATCH", "COMPLETED_STEP_RESULT_INVALID", "INVALID_NEXT_DESTINATION", "REVISION_CONFLICT", "STORAGE_UNAVAILABLE",
  ]);

  class ProjectExecutionNextStepError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "ProjectExecutionNextStepError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function fail(code, message, details) { throw new ProjectExecutionNextStepError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  }
  function timestamp(value) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value || ""); }
  function safeText(value, limit = 500, code = "SNAPSHOT_INVALID") {
    const result = typeof value === "string" && value.trim() ? value.trim() : "";
    if (!result || result.length > limit || /<[^>]*>|(?:^|\s)(?:blob:|javascript:|data:text\/html)/i.test(result)) fail(code, "Снимок следующего шага содержит небезопасный текст.");
    return result;
  }
  function optionalText(value, limit = 500) { return value === null ? null : safeText(value, limit); }
  function exactKeys(value, keys, code = "SNAPSHOT_NOT_ALLOWLISTED") {
    if (!record(value)) fail(code, "Снимок следующего шага повреждён.");
    const actual = Object.keys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !actual.includes(key))) {
      fail(code, "Снимок следующего шага содержит неподдерживаемые поля.");
    }
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("SNAPSHOT_INVALID", "Снимок содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("SNAPSHOT_INVALID", "Снимок содержит неподдерживаемое значение.");
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
  function diagnostic(code, message, details = {}) {
    const safeMessages = {
      PROJECT_ID_REQUIRED: "Откройте следующий шаг из сохранённого проекта.",
      PROJECT_ID_INVALID: "Ссылка на проект повреждена.",
      PROJECT_NOT_FOUND: "Проект не найден.",
      SOURCE_PROJECT_MISMATCH: "Источник относится к другому проекту.",
      STAGE67_NOT_COMPLETED: "Сначала завершите набор петель.",
      STAGE67_FINGERPRINT_MISMATCH: "Сохранённый результат набора петель повреждён.",
      STAGE66_FINGERPRINT_MISMATCH: "Сохранённое начало выполнения повреждено.",
      STAGE65_FINGERPRINT_MISMATCH: "Сохранённый план работы повреждён.",
      COMPLETED_STEP_MISMATCH: "Завершённый шаг не совпадает с подтверждённым планом.",
      COMPLETED_STEP_RESULT_INVALID: "Результат набора петель не подтверждён.",
      REVISION_CONFLICT: "Подготовка следующего шага уже изменена в другой вкладке.",
      STORAGE_UNAVAILABLE: "Не удалось открыть сохранённую подготовку следующего шага.",
    };
    return deepFreeze({ code, message: safeMessages[code] || message || "Не удалось открыть следующий шаг.", recovery: { path: "/saved-projects", label: "Мои проекты" }, details: clone(details) });
  }
  function blocked(code, message, projectIdentity = "", calculationId = "") {
    return deepFreeze({ status: "blocked", lifecycle: "blocked", projectIdentity, calculationId, source: null, completedStep: null, nextStep: null, context: null, reasonCode: code, diagnostic: diagnostic(code, message) });
  }
  function latestRecord(progress, kind, calculationId) {
    return (Array.isArray(progress) ? progress : [])
      .filter((entry) => entry?.kind === kind && entry?.calculation_id === calculationId && !entry?.deleted_at)
      .sort((left, right) => String(left.updated_at || "").localeCompare(String(right.updated_at || "")))
      .at(-1) || null;
  }
  function mapValidationError(error, stage) {
    if (/FINGERPRINT/.test(String(error?.code || ""))) return `${stage}_FINGERPRINT_MISMATCH`;
    return stage === "STAGE67" ? "STAGE67_NOT_COMPLETED" : `${stage}_FINGERPRINT_MISMATCH`;
  }
  function measurableGoal(step) {
    const output = step?.expectedOutput;
    if (!record(output)) return null;
    const candidates = [
      ["rowCount", "rows", "row_count"], ["rows", "rows", "row_count"],
      ["lengthCm", "cm", "length"], ["heightCm", "cm", "height"],
    ];
    for (const [key, unit, criterion] of candidates) {
      const value = output[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) return { value, unit, criterion };
    }
    if (record(output.target) && typeof output.target.value === "number" && output.target.value > 0 && ["rows", "cm"].includes(output.target.unit)) {
      return { value: output.target.value, unit: output.target.unit, criterion: safeText(output.target.criterion || "target", 100) };
    }
    return null;
  }
  function issueList(values) {
    return (Array.isArray(values) ? values : []).map((item) => ({ code: safeText(item?.code || String(item), 100), message: safeText(item?.message || String(item), 500) }));
  }
  function classifyNextStep(plan, completedIdentity) {
    const index = plan.steps.findIndex((item) => item.identity === completedIdentity);
    if (index !== 0 || plan.steps[0]?.sequenceNumber !== 1 || plan.steps[0]?.type !== "CAST_ON") return { status: "blocked", reasonCode: "COMPLETED_STEP_MISMATCH", nextStep: null };
    const candidate = plan.steps[index + 1] || null;
    if (!candidate) return { status: "unavailable", reasonCode: "NO_NEXT_PLAN_STEP", nextStep: null };
    if (candidate.sequenceNumber !== 2) return { status: "blocked", reasonCode: "COMPLETED_STEP_MISMATCH", nextStep: null };
    if (candidate.status === "conditional" || candidate.requiredInputs?.length) return { status: "unavailable", reasonCode: "NEXT_STEP_CONDITIONAL", nextStep: null };
    if (candidate.status !== "confirmed" || !SUPPORTED_NEXT_STEP_TYPES.includes(candidate.type)) return { status: "unavailable", reasonCode: "NEXT_STEP_UNSUPPORTED", nextStep: null };
    const goal = measurableGoal(candidate);
    const sourceIdentity = typeof candidate.source?.identity === "string" ? candidate.source.identity.trim() : "";
    const instruction = typeof candidate.purpose === "string" ? candidate.purpose.trim() : "";
    if (!candidate.identity || !candidate.title || !instruction || !goal || !sourceIdentity) return { status: "unavailable", reasonCode: "NEXT_STEP_INCOMPLETE", nextStep: null };
    return {
      status: "ready",
      reasonCode: null,
      nextStep: {
        identity: candidate.identity,
        sequenceNumber: candidate.sequenceNumber,
        type: candidate.type,
        title: candidate.title,
        instruction,
        measurableGoal: goal,
        executionParameters: clone(candidate.expectedOutput),
        sourceIdentity,
        warnings: issueList(candidate.warnings),
        assumptions: issueList(candidate.assumptions),
      },
    };
  }
  function assessSource(input = {}) {
    const projectIdentity = typeof input.projectIdentity === "string" ? input.projectIdentity.trim() : "";
    let calculationId = "";
    try {
      validateProjectIdentity(projectIdentity);
      const project = input.project;
      if (!record(project)) fail("PROJECT_NOT_FOUND", "Проект не найден.");
      if (project.project_id !== projectIdentity) fail("SOURCE_PROJECT_MISMATCH", "Источник относится к другому проекту.");
      calculationId = project.active_calculation_id;
      if (!safeText(calculationId, 180, "SOURCE_PROJECT_MISMATCH")) fail("SOURCE_PROJECT_MISMATCH", "Активный расчёт проекта повреждён.");
      const stage67Record = input.stage67Record || latestRecord(input.progress, "PROJECT_EXECUTION_FIRST_STEP", calculationId);
      if (!record(stage67Record) || stage67Record.state?.lifecycle !== "completed" || stage67Record.state?.snapshot?.lifecycle !== "completed") fail("STAGE67_NOT_COMPLETED", "Сначала завершите набор петель.");
      if (stage67Record.project_id !== projectIdentity || stage67Record.calculation_id !== calculationId) fail("SOURCE_PROJECT_MISMATCH", "Результат первого шага относится к другому проекту.");
      const rawStage67Snapshot = stage67Record.state?.snapshot;
      const rawStage67Semantic = clone(rawStage67Snapshot);
      if (record(rawStage67Semantic)) delete rawStage67Semantic.fingerprint;
      if (!record(rawStage67Snapshot) || rawStage67Snapshot.fingerprint !== input.stage67Domain.fingerprint(rawStage67Semantic)) fail("STAGE67_FINGERPRINT_MISMATCH", "Fingerprint первого шага повреждён.");
      let stage67State;
      try { stage67State = input.stage67Domain.validateProgressState(stage67Record.state, { projectIdentity, calculationId }); }
      catch (error) { fail(mapValidationError(error, "STAGE67"), error?.userMessage || error?.message); }
      const stage67 = stage67State.snapshot;
      if (stage67.lifecycle !== "completed") fail("STAGE67_NOT_COMPLETED", "Сначала завершите набор петель.");
      if (stage67.step.sequenceNumber !== 1 || stage67.step.type !== "CAST_ON" || stage67.step.targetStitchCount !== 100) fail("COMPLETED_STEP_MISMATCH", "Завершённый шаг не совпадает с планом.");
      if (stage67.check.result !== "match" || stage67.check.observedStitchCount !== 100 || stage67.check.explicitConfirmation !== true) fail("COMPLETED_STEP_RESULT_INVALID", "Результат набора петель не подтверждён.");

      const stage66Record = input.stage66Record || latestRecord(input.progress, "PROJECT_EXECUTION_START", calculationId);
      if (!record(stage66Record) || stage66Record.project_id !== projectIdentity || stage66Record.calculation_id !== calculationId) fail("SOURCE_PROJECT_MISMATCH", "Начало выполнения относится к другому проекту.");
      const rawStage66Snapshot = stage66Record.state?.snapshot;
      const rawStage66Semantic = clone(rawStage66Snapshot);
      if (record(rawStage66Semantic)) delete rawStage66Semantic.fingerprint;
      if (!record(rawStage66Snapshot) || rawStage66Snapshot.fingerprint !== input.stage66Domain.fingerprint(rawStage66Semantic)) fail("STAGE66_FINGERPRINT_MISMATCH", "Fingerprint начала выполнения повреждён.");
      let stage66State;
      try { stage66State = input.stage66Domain.validateProgressState(stage66Record.state, { projectIdentity, calculationId }); }
      catch (error) { fail(mapValidationError(error, "STAGE66"), error?.userMessage || error?.message); }
      const stage66 = stage66State.snapshot;
      if (stage66.lifecycle !== "started") fail("STAGE66_FINGERPRINT_MISMATCH", "Начало выполнения не зафиксировано.");
      if (stage67.source.stage66ProgressIdentity !== stage66Record.progress_id || stage67.source.stage66SnapshotIdentity !== stage66.identity || stage67.source.stage66Fingerprint !== stage66.fingerprint) fail("STAGE66_FINGERPRINT_MISMATCH", "Связь с началом выполнения повреждена.");

      const stage65Record = input.stage65Record || latestRecord(input.progress, "PROJECT_EXECUTION_PLAN_PREPARATION", calculationId);
      if (!record(stage65Record) || stage65Record.project_id !== projectIdentity || stage65Record.calculation_id !== calculationId) fail("SOURCE_PROJECT_MISMATCH", "План относится к другому проекту.");
      let stage65State;
      try { stage65State = input.stage65Domain.validateProgressState(stage65Record.state, { projectIdentity, calculationId }); }
      catch (error) { fail(mapValidationError(error, "STAGE65"), error?.userMessage || error?.message); }
      const stage65 = stage65State.history.at(-1);
      if (!stage65 || stage65.lifecycle !== "completed" || stage65State.currentRevisionIdentity !== stage65.identity) fail("STAGE65_FINGERPRINT_MISMATCH", "Подтверждённый план повреждён.");
      if (stage66.sourceStage65Identity !== stage65.identity || stage66.sourceStage65Fingerprint !== stage65.fingerprint || stage67.source.sourceIdentities.stage65 !== stage65.identity || stage67.source.sourceFingerprints.stage65 !== stage65.fingerprint) fail("STAGE65_FINGERPRINT_MISMATCH", "Связь с подтверждённым планом повреждена.");
      const transitive = { stage60: "closure", stage61: "initialization", stage63: "gauge", stage64: "calculation" };
      for (const [stageKey, planKey] of Object.entries(transitive)) {
        if (stage67.source.sourceIdentities[stageKey] !== stage65.sourceIdentities[planKey] || stage67.source.sourceFingerprints[stageKey] !== stage65.sourceFingerprints[planKey]) fail("STAGE65_FINGERPRINT_MISMATCH", "Транзитивная цепочка плана повреждена.", { stageKey });
      }
      const completedPlanStep = stage65.steps.find((item) => item.identity === stage67.source.stage65StepIdentity);
      if (!completedPlanStep || completedPlanStep !== stage65.steps[0] || completedPlanStep.type !== "CAST_ON" || completedPlanStep.sequenceNumber !== 1 || completedPlanStep.expectedOutput?.stitchCount !== 100) fail("COMPLETED_STEP_MISMATCH", "Завершённый шаг не совпадает с первым шагом плана.");
      const selection = classifyNextStep(stage65, stage67.source.stage65StepIdentity);
      if (selection.status === "blocked") fail(selection.reasonCode, "Последовательность шагов плана повреждена.");
      const stages = {
        sourceIdentities: { ...clone(stage67.source.sourceIdentities), stage67: stage67.identity },
        sourceFingerprints: { ...clone(stage67.source.sourceFingerprints), stage67: stage67.fingerprint },
      };
      const source = {
        stage67ProgressIdentity: safeText(stage67Record.progress_id, 240), stage67SnapshotIdentity: stage67.identity, stage67Fingerprint: stage67.fingerprint,
        stage66ProgressIdentity: safeText(stage66Record.progress_id, 240), stage66SnapshotIdentity: stage66.identity, stage66Fingerprint: stage66.fingerprint,
        stage65PlanIdentity: stage65.identity, stage65Fingerprint: stage65.fingerprint,
        sourceIdentities: stages.sourceIdentities, sourceFingerprints: stages.sourceFingerprints,
      };
      const completedStep = {
        identity: stage67.source.stage65StepIdentity, sequenceNumber: 1, type: "CAST_ON", instruction: stage67.step.instruction,
        target: { value: 100, unit: "stitches" }, observedResult: { value: 100, unit: "stitches", result: "match", explicitConfirmation: true }, completedAt: stage67.timestamps.completedAt,
      };
      const context = {
        product: stage67.context.product, yarn: stage67.context.yarn, tools: clone(stage67.context.tools), technique: stage67.context.technique,
        gauge: clone(stage67.context.gaugeSummary), warnings: clone(stage67.context.warnings), assumptions: clone(stage67.context.assumptions),
      };
      return deepFreeze({
        status: selection.status, lifecycle: selection.status === "ready" ? "prepared" : "unavailable", projectIdentity, calculationId,
        source, completedStep, nextStep: selection.nextStep, context, reasonCode: selection.reasonCode, diagnostic: null,
      });
    } catch (error) {
      const allowed = ["PROJECT_ID_INVALID", "PROJECT_NOT_FOUND", "SOURCE_PROJECT_MISMATCH", "STAGE67_NOT_COMPLETED", "STAGE67_FINGERPRINT_MISMATCH", "STAGE66_FINGERPRINT_MISMATCH", "STAGE65_FINGERPRINT_MISMATCH", "COMPLETED_STEP_MISMATCH", "COMPLETED_STEP_RESULT_INVALID"];
      const code = allowed.includes(error?.code) ? error.code : "STAGE65_FINGERPRINT_MISMATCH";
      return blocked(code, error?.userMessage || error?.message, projectIdentity, typeof calculationId === "string" && calculationId.trim() ? calculationId.trim() : "");
    }
  }
  function deterministicIdentity(assessment) {
    const identityInput = assessment.lifecycle === "blocked"
      ? { projectId: assessment.projectIdentity, calculationId: assessment.calculationId, reasonCode: assessment.reasonCode }
      : { projectId: assessment.projectIdentity, calculationId: assessment.calculationId, stage67Fingerprint: assessment.source.stage67Fingerprint, stage65Fingerprint: assessment.source.stage65Fingerprint, completedStepIdentity: assessment.completedStep.identity };
    return `${assessment.projectIdentity}:execution-next-step:${fingerprint(identityInput)}`;
  }
  function nextActionFor(assessment) {
    if (assessment.lifecycle === "blocked") return { status: "available", destination: "/saved-projects", label: "Мои проекты", reasonCode: assessment.reasonCode };
    if (assessment.lifecycle === "prepared") return { status: "unavailable", destination: null, label: null, reasonCode: "NEXT_STEP_EXECUTION_ROUTE_UNAVAILABLE" };
    if (assessment.reasonCode === "NEXT_STEP_CONDITIONAL") return { status: "available", destination: `/project-execution-next-step-clarification?project=${encodeURIComponent(validateProjectIdentity(assessment.projectIdentity))}`, label: "Уточнить следующий шаг", reasonCode: assessment.reasonCode };
    return { status: "unavailable", destination: null, label: null, reasonCode: assessment.reasonCode };
  }
  function createSnapshot(assessment, metadata = {}) {
    if (!assessment || !LIFECYCLES.includes(assessment.lifecycle) || assessment.lifecycle !== "blocked" && !assessment.source) fail("STAGE67_NOT_COMPLETED", "Нельзя подготовить следующий шаг без завершённого первого шага.");
    const createdAt = safeText(metadata.createdAt, 40);
    if (!timestamp(createdAt)) fail("SNAPSHOT_INVALID", "Не указано время подготовки следующего шага.");
    const operationId = validateOperationId(metadata.operationId);
    const value = {
      format: FORMAT, version: VERSION, identity: deterministicIdentity(assessment), projectIdentity: assessment.projectIdentity,
      calculationId: assessment.calculationId, lifecycle: assessment.lifecycle, revision: 1, source: clone(assessment.source),
      completedStep: clone(assessment.completedStep), nextStep: clone(assessment.nextStep), context: clone(assessment.context),
      nextAction: nextActionFor(assessment), reasonCode: assessment.reasonCode, timestamps: { createdAt, preparedAt: createdAt },
      audit: { event: "NEXT_STEP_PREPARATION_CREATED", operationId }, fingerprint: "",
    };
    value.fingerprint = fingerprint(semanticSnapshot(value));
    return validateSnapshot(value);
  }
  function validateIssueList(values) {
    if (!Array.isArray(values)) fail("SNAPSHOT_INVALID", "Список предупреждений повреждён.");
    values.forEach((item) => { exactKeys(item, ["code", "message"]); safeText(item.code, 100); safeText(item.message, 500); });
  }
  function validateSnapshot(source) {
    exactKeys(source, SNAPSHOT_KEYS);
    canonicalize(source);
    const value = clone(source);
    validateProjectIdentity(value.projectIdentity);
    if (value.format !== FORMAT || value.version !== VERSION || !safeText(value.identity, 360) || !safeText(value.calculationId, 180) || !LIFECYCLES.includes(value.lifecycle) || value.revision !== 1) fail("SNAPSHOT_INVALID", "Сохранённая подготовка следующего шага повреждена.");
    if (value.lifecycle === "blocked") {
      if (value.source !== null || value.completedStep !== null || value.nextStep !== null || value.context !== null || !BLOCKING_CODES.includes(value.reasonCode)) fail("SNAPSHOT_INVALID", "Заблокированный snapshot повреждён.");
    } else {
    exactKeys(value.source, SOURCE_KEYS);
    for (const key of SOURCE_KEYS.slice(0, 8)) safeText(value.source[key], 360);
    exactKeys(value.source.sourceIdentities, SOURCE_STAGE_KEYS);
    exactKeys(value.source.sourceFingerprints, SOURCE_STAGE_KEYS);
    SOURCE_STAGE_KEYS.forEach((key) => { safeText(value.source.sourceIdentities[key], 360); safeText(value.source.sourceFingerprints[key], 360); });
    if (value.source.stage67SnapshotIdentity !== value.source.sourceIdentities.stage67 || value.source.stage67Fingerprint !== value.source.sourceFingerprints.stage67 || value.source.stage66SnapshotIdentity !== value.source.sourceIdentities.stage66 || value.source.stage66Fingerprint !== value.source.sourceFingerprints.stage66 || value.source.stage65PlanIdentity !== value.source.sourceIdentities.stage65 || value.source.stage65Fingerprint !== value.source.sourceFingerprints.stage65) fail("SNAPSHOT_INVALID", "Provenance следующего шага повреждён.");
    exactKeys(value.completedStep, COMPLETED_STEP_KEYS);
    safeText(value.completedStep.identity, 360); safeText(value.completedStep.instruction, 240);
    if (value.completedStep.sequenceNumber !== 1 || value.completedStep.type !== "CAST_ON" || value.completedStep.target?.value !== 100 || value.completedStep.target?.unit !== "stitches" || value.completedStep.observedResult?.value !== 100 || value.completedStep.observedResult?.unit !== "stitches" || value.completedStep.observedResult?.result !== "match" || value.completedStep.observedResult?.explicitConfirmation !== true || !timestamp(value.completedStep.completedAt)) fail("COMPLETED_STEP_RESULT_INVALID", "Результат первого шага повреждён.");
    exactKeys(value.context, CONTEXT_KEYS); safeText(value.context.product, 180); safeText(value.context.yarn, 180); safeText(value.context.technique, 180);
    if (!Array.isArray(value.context.tools) || !value.context.tools.length) fail("SNAPSHOT_INVALID", "Инструмент не указан.");
    value.context.tools.forEach((item) => safeText(item, 180)); exactKeys(value.context.gauge, GAUGE_KEYS); safeText(value.context.gauge.display, 180);
    if (!Number.isFinite(value.context.gauge.stitchesPer10Cm) || !Number.isFinite(value.context.gauge.rowsPer10Cm)) fail("SNAPSHOT_INVALID", "Плотность повреждена.");
    validateIssueList(value.context.warnings); validateIssueList(value.context.assumptions);
    if (value.lifecycle === "prepared") {
      exactKeys(value.nextStep, NEXT_STEP_KEYS); exactKeys(value.nextStep.measurableGoal, GOAL_KEYS);
      if (!SUPPORTED_NEXT_STEP_TYPES.includes(value.nextStep.type) || value.nextStep.sequenceNumber !== 2 || !(value.nextStep.measurableGoal.value > 0) || !["rows", "cm"].includes(value.nextStep.measurableGoal.unit)) fail("NEXT_STEP_INCOMPLETE", "Следующий шаг определён не полностью.");
      for (const key of ["identity", "title", "instruction", "sourceIdentity"]) safeText(value.nextStep[key], 500);
      if (!record(value.nextStep.executionParameters)) fail("NEXT_STEP_INCOMPLETE", "Параметры следующего шага повреждены.");
      validateIssueList(value.nextStep.warnings); validateIssueList(value.nextStep.assumptions);
      if (value.reasonCode !== null) fail("SNAPSHOT_INVALID", "Prepared-состояние содержит ошибочную причину.");
    } else if (value.nextStep !== null || !REASON_CODES.includes(value.reasonCode) || value.reasonCode === "NEXT_STEP_EXECUTION_ROUTE_UNAVAILABLE") fail("SNAPSHOT_INVALID", "Unavailable-состояние повреждено.");
    }
    exactKeys(value.nextAction, ACTION_KEYS);
    const blockedAction = value.lifecycle === "blocked" && value.nextAction.status === "available" && value.nextAction.destination === "/saved-projects" && value.nextAction.label === "Мои проекты" && value.nextAction.reasonCode === value.reasonCode;
    const clarificationHref = value.projectIdentity ? `/project-execution-next-step-clarification?project=${encodeURIComponent(value.projectIdentity)}` : "";
    const clarificationAction = value.lifecycle === "unavailable" && value.reasonCode === "NEXT_STEP_CONDITIONAL" && value.nextAction.status === "available" && value.nextAction.destination === clarificationHref && value.nextAction.label === "Уточнить следующий шаг" && value.nextAction.reasonCode === value.reasonCode;
    const terminalAction = value.lifecycle !== "blocked" && value.nextAction.status === "unavailable" && value.nextAction.destination === null && value.nextAction.label === null && REASON_CODES.includes(value.nextAction.reasonCode);
    if (!blockedAction && !clarificationAction && !terminalAction) fail("INVALID_NEXT_DESTINATION", "Сохранён неподдерживаемый маршрут следующего шага.");
    exactKeys(value.timestamps, TIMESTAMP_KEYS); if (!timestamp(value.timestamps.createdAt) || !timestamp(value.timestamps.preparedAt)) fail("SNAPSHOT_INVALID", "Время подготовки повреждено.");
    exactKeys(value.audit, AUDIT_KEYS); if (value.audit.event !== "NEXT_STEP_PREPARATION_CREATED") fail("SNAPSHOT_INVALID", "Audit подготовки повреждён."); validateOperationId(value.audit.operationId);
    if (value.fingerprint !== fingerprint(semanticSnapshot(value))) fail("SOURCE_FINGERPRINT_MISMATCH", "Fingerprint подготовки следующего шага не совпадает с содержимым.");
    return deepFreeze(value);
  }
  function createProgressState(snapshotSource) {
    const snapshot = validateSnapshot(snapshotSource);
    return validateProgressState({ kind: KIND, version: VERSION, projectId: snapshot.projectIdentity, calculationId: snapshot.calculationId, lifecycle: snapshot.lifecycle, snapshot }, { projectIdentity: snapshot.projectIdentity, calculationId: snapshot.calculationId });
  }
  function validateProgressState(source, options = {}) {
    exactKeys(source, PROGRESS_KEYS, "PROGRESS_STATE_INVALID");
    const value = clone(source);
    if (value.kind !== KIND || value.version !== VERSION || value.projectId !== options.projectIdentity || value.calculationId !== options.calculationId || !LIFECYCLES.includes(value.lifecycle)) fail("PROGRESS_STATE_INVALID", "Запись подготовки следующего шага повреждена.");
    value.snapshot = clone(validateSnapshot(value.snapshot));
    if (value.snapshot.lifecycle !== value.lifecycle || value.snapshot.projectIdentity !== value.projectId || value.snapshot.calculationId !== value.calculationId) fail("PROGRESS_STATE_INVALID", "Snapshot не согласован с записью прогресса.");
    return deepFreeze(value);
  }
  function validateBinding(snapshotSource, assessment) {
    const snapshot = validateSnapshot(snapshotSource);
    if (!assessment || snapshot.identity !== deterministicIdentity(assessment) || snapshot.lifecycle !== assessment.lifecycle || canonicalize(snapshot.source) !== canonicalize(assessment.source) || canonicalize(snapshot.completedStep) !== canonicalize(assessment.completedStep) || canonicalize(snapshot.nextStep) !== canonicalize(assessment.nextStep) || canonicalize(snapshot.context) !== canonicalize(assessment.context) || snapshot.reasonCode !== assessment.reasonCode) fail("SOURCE_FINGERPRINT_MISMATCH", "Подготовка не соответствует подтверждённой цепочке проекта.");
    return snapshot;
  }
  function safeDestination(value, projectIdentity) {
    try {
      validateProjectIdentity(projectIdentity);
      const url = new URL(value, "http://localhost");
      const projectRoutes = new Set(["/project-execution-next-step-clarification", "/project-execution-next-step", "/project-execution-first-step", "/project-execution-plan"]);
      const staticRoutes = new Set(["/saved-projects"]);
      const projectRoute = projectRoutes.has(url.pathname) && url.searchParams.size === 1 && url.searchParams.get("project") === projectIdentity;
      const staticRoute = staticRoutes.has(url.pathname) && url.search === "";
      const valid = url.origin === "http://localhost" && !url.username && !url.password && (projectRoute || staticRoute);
      return deepFreeze({ valid, href: valid ? `${url.pathname}${url.search}${url.hash || ""}` : "" });
    } catch { return deepFreeze({ valid: false, href: "" }); }
  }

  const api = Object.freeze({
    FORMAT, VERSION, KIND, PROGRESS_KIND, LIFECYCLES, SUPPORTED_NEXT_STEP_TYPES, SOURCE_STAGE_KEYS, SNAPSHOT_KEYS, BLOCKING_CODES,
    SOURCE_KEYS, COMPLETED_STEP_KEYS, NEXT_STEP_KEYS, GOAL_KEYS, CONTEXT_KEYS, GAUGE_KEYS, ACTION_KEYS,
    TIMESTAMP_KEYS, AUDIT_KEYS, PROGRESS_KEYS, REASON_CODES, ProjectExecutionNextStepError, canonicalize, fingerprint,
    validateProjectIdentity, validateOperationId, diagnostic, latestRecord, measurableGoal, classifyNextStep, assessSource,
    deterministicIdentity, nextActionFor, createSnapshot, validateSnapshot, createProgressState, validateProgressState,
    validateBinding, safeDestination,
  });
  globalObject.YarnAIProjectExecutionNextStep = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
