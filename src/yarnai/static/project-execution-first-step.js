"use strict";

(function initializeProjectExecutionFirstStep(globalObject) {
  const FORMAT = "yarnai-project-execution-first-step";
  const VERSION = 1;
  const KIND = "PROJECT_EXECUTION_FIRST_STEP";
  const PROGRESS_KIND = KIND;
  const AUDIT_LIMIT = 64;
  const LIFECYCLES = Object.freeze(["ready", "active", "paused", "checking", "completed"]);
  const TRANSITIONS = Object.freeze({
    ready: Object.freeze(["active"]),
    active: Object.freeze(["paused", "checking"]),
    paused: Object.freeze(["active"]),
    checking: Object.freeze(["active", "completed"]),
    completed: Object.freeze([]),
  });
  const AUDIT_EVENTS = Object.freeze([
    "FIRST_STEP_CREATED",
    "FIRST_STEP_ACTIVATED",
    "FIRST_STEP_PAUSED",
    "FIRST_STEP_RESUMED",
    "FIRST_STEP_CHECKING_STARTED",
    "FIRST_STEP_CHECK_MISMATCH",
    "FIRST_STEP_CHECK_CANCELLED",
    "FIRST_STEP_COMPLETED",
  ]);
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "calculationId", "lifecycle",
    "revision", "source", "step", "context", "check", "timestamps", "nextAction",
    "audit", "fingerprint",
  ]);
  const SOURCE_KEYS = Object.freeze([
    "stage66ProgressIdentity", "stage66SnapshotIdentity", "stage66Fingerprint",
    "stage65StepIdentity", "sourceIdentities", "sourceFingerprints",
  ]);
  const SOURCE_STAGE_KEYS = Object.freeze(["stage60", "stage61", "stage63", "stage64", "stage65", "stage66"]);
  const STEP_KEYS = Object.freeze(["sequenceNumber", "type", "instruction", "targetStitchCount", "unit"]);
  const CONTEXT_KEYS = Object.freeze(["product", "yarn", "tools", "technique", "gaugeSummary", "warnings", "assumptions"]);
  const GAUGE_KEYS = Object.freeze(["stitchesPer10Cm", "rowsPer10Cm", "display"]);
  const ISSUE_KEYS = Object.freeze(["code", "message"]);
  const CHECK_KEYS = Object.freeze(["method", "observedStitchCount", "result", "explicitConfirmation", "confirmedBy"]);
  const TIMESTAMP_KEYS = Object.freeze(["createdAt", "activatedAt", "lastPausedAt", "lastResumedAt", "checkingAt", "completedAt"]);
  const NEXT_ACTION_KEYS = Object.freeze(["status", "destination", "reasonCode"]);
  const AUDIT_EVENT_KEYS = Object.freeze(["event", "operationId", "revision", "timestamp"]);
  const PROGRESS_KEYS = Object.freeze(["kind", "version", "projectId", "calculationId", "lifecycle", "snapshot"]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  class ProjectExecutionFirstStepError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "ProjectExecutionFirstStepError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function fail(code, message, details) { throw new ProjectExecutionFirstStepError(code, message, details); }
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
    if (!result || result.length > limit || /<[^>]*>|(?:^|\s)(?:blob:|javascript:|data:text\/html)/i.test(result)) {
      fail(code, "Снимок первого шага содержит небезопасный текст.");
    }
    return result;
  }
  function optionalSafeText(value, limit = 500) {
    if (value === null) return null;
    return safeText(value, limit);
  }
  function exactKeys(value, keys, code = "SNAPSHOT_NOT_ALLOWLISTED") {
    if (!record(value)) fail(code, "Сохранённый первый шаг повреждён.");
    const actual = Object.keys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !actual.includes(key))) {
      fail(code, "Сохранённый первый шаг содержит неподдерживаемые поля.");
    }
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("SNAPSHOT_INVALID", "Снимок первого шага содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("SNAPSHOT_INVALID", "Снимок первого шага содержит неподдерживаемое значение.");
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
  function validateProjectIdentity(value, expected = "") {
    const identity = safeText(value, 180, "PROJECT_NOT_FOUND");
    if (!UUID_V7.test(identity) || expected && identity !== expected) fail("PROJECT_NOT_FOUND", "Проект не найден или ссылка на него повреждена.");
    return identity;
  }
  function validateOperationId(value) {
    const operationId = safeText(value, 180, "OPERATION_ID_INVALID");
    if (!UUID_V7.test(operationId)) fail("OPERATION_ID_INVALID", "Идентификатор операции повреждён.");
    return operationId;
  }
  function semanticSnapshot(value) { const result = clone(value); delete result.fingerprint; return result; }
  function seal(value) { value.fingerprint = fingerprint(semanticSnapshot(value)); return validateSnapshot(value); }

  function recoveryFor(code) {
    const mapping = {
      PROJECT_NOT_FOUND: { path: "/saved-projects", label: "Мои проекты" },
      STAGE66_NOT_STARTED: { path: "/project-execution-start", label: "Вернуться к началу выполнения" },
      STAGE66_SOURCE_INVALID: { path: "/saved-projects", label: "Вернуться к проектам" },
      SOURCE_PROJECT_MISMATCH: { path: "/saved-projects", label: "Выбрать проект заново" },
      SOURCE_FINGERPRINT_MISMATCH: { path: "/saved-projects", label: "Вернуться к проектам" },
      FIRST_STEP_INVALID: { path: "/project-execution-start", label: "Проверить начало выполнения" },
      STORAGE_UNAVAILABLE: { path: "/saved-projects", label: "Мои проекты" },
      INVALID_NEXT_DESTINATION: { path: "/saved-projects", label: "Мои проекты" },
    };
    return clone(mapping[code] || mapping.STAGE66_SOURCE_INVALID);
  }
  function diagnostic(code, message, details = {}) {
    return deepFreeze({ code, message, recovery: recoveryFor(code), details: clone(details) });
  }
  function sourceFailure(code, message, projectIdentity = "") {
    return deepFreeze({ ready: false, projectIdentity, source: null, context: null, step: null, diagnostic: diagnostic(code, message) });
  }
  function mapSourceError(problem) {
    const code = String(problem?.code || "");
    if (/PROJECT_NOT_FOUND|PROJECT_ID|INVALID_PROGRESS_SCOPE/.test(code)) return "PROJECT_NOT_FOUND";
    if (/PROJECT_MISMATCH/.test(code)) return "SOURCE_PROJECT_MISMATCH";
    if (/FINGERPRINT/.test(code)) return "SOURCE_FINGERPRINT_MISMATCH";
    if (/FIRST_STEP|STAGE65_NOT_READY/.test(code)) return "FIRST_STEP_INVALID";
    return "STAGE66_SOURCE_INVALID";
  }
  function stage66RecordFrom(progress, calculationId = null) {
    return (Array.isArray(progress) ? progress : [])
      .filter((entry) => entry?.kind === "PROJECT_EXECUTION_START" && (!calculationId || entry?.calculation_id === calculationId) && !entry?.deleted_at)
      .sort((left, right) => String(left.updated_at || "").localeCompare(String(right.updated_at || "")))
      .at(-1) || null;
  }
  function stage67RecordFrom(progress, calculationId = null) {
    return (Array.isArray(progress) ? progress : [])
      .filter((entry) => entry?.kind === KIND && (!calculationId || entry?.calculation_id === calculationId) && !entry?.deleted_at)
      .sort((left, right) => String(left.updated_at || "").localeCompare(String(right.updated_at || "")))
      .at(-1) || null;
  }
  function sourceStages(stage66Snapshot) {
    const identities = stage66Snapshot.sourceIdentities || {};
    const fingerprints = stage66Snapshot.sourceFingerprints || {};
    return {
      sourceIdentities: {
        stage60: identities.closure,
        stage61: identities.initialization,
        stage63: identities.gauge,
        stage64: identities.calculation,
        stage65: identities.stage65,
        stage66: stage66Snapshot.identity,
      },
      sourceFingerprints: {
        stage60: fingerprints.closure,
        stage61: fingerprints.initialization,
        stage63: fingerprints.gauge,
        stage64: fingerprints.calculation,
        stage65: fingerprints.stage65,
        stage66: stage66Snapshot.fingerprint,
      },
    };
  }
  function assessSource(input = {}) {
    const projectIdentity = typeof input.projectIdentity === "string" ? input.projectIdentity.trim() : "";
    try {
      validateProjectIdentity(projectIdentity);
      const project = input.project;
      if (!record(project)) fail("PROJECT_NOT_FOUND", "Проект не найден.");
      if (project.project_id !== projectIdentity) fail("SOURCE_PROJECT_MISMATCH", "Источник относится к другому проекту.");
      const calculationId = project.active_calculation_id;
      if (!safeText(calculationId, 180, "STAGE66_SOURCE_INVALID")) fail("STAGE66_SOURCE_INVALID", "Активный расчёт проекта недоступен.");
      const stage66Record = input.stage66Record || stage66RecordFrom(input.progress, calculationId);
      if (!record(stage66Record)) fail("STAGE66_NOT_STARTED", "Сначала явно начните выполнение проекта.");
      if (stage66Record.project_id !== projectIdentity || stage66Record.calculation_id !== calculationId) fail("SOURCE_PROJECT_MISMATCH", "Начало выполнения относится к другому проекту.");
      const stage66Domain = input.stage66Domain;
      if (!stage66Domain?.validateProgressState) fail("STAGE66_SOURCE_INVALID", "Проверка начала выполнения недоступна.");
      if (stage66Record.state?.lifecycle !== "started" || stage66Record.state?.snapshot?.lifecycle !== "started") {
        fail("STAGE66_NOT_STARTED", "Сначала явно начните выполнение проекта.");
      }
      const state = stage66Domain.validateProgressState(stage66Record.state, { projectIdentity, calculationId });
      const snapshot = state.snapshot;
      if (state.lifecycle !== "started" || snapshot.lifecycle !== "started") fail("STAGE66_NOT_STARTED", "Сначала явно начните выполнение проекта.");
      if (snapshot.projectIdentity !== projectIdentity || state.projectId !== projectIdentity) fail("SOURCE_PROJECT_MISMATCH", "Начало выполнения относится к другому проекту.");
      if (snapshot.sourceStage65Identity !== snapshot.sourceIdentities?.stage65 || snapshot.sourceStage65Fingerprint !== snapshot.sourceFingerprints?.stage65) {
        fail("STAGE66_SOURCE_INVALID", "Ссылка на подтверждённый план повреждена.");
      }
      const firstStep = snapshot.firstStep;
      if (!record(firstStep) || firstStep.type !== "CAST_ON" || firstStep.stitchCount !== 100 || !safeText(firstStep.sourceIdentity, 240, "FIRST_STEP_INVALID")) {
        fail("FIRST_STEP_INVALID", "Первый подтверждённый шаг повреждён или не поддерживается.");
      }
      if (safeText(firstStep.instruction, 240, "FIRST_STEP_INVALID") !== "Набрать 100 петель") fail("FIRST_STEP_INVALID", "Инструкция первого шага повреждена.");
      const stages = sourceStages(snapshot);
      for (const key of SOURCE_STAGE_KEYS) {
        if (!safeText(stages.sourceIdentities[key], 300, "STAGE66_SOURCE_INVALID") || !safeText(stages.sourceFingerprints[key], 300, "STAGE66_SOURCE_INVALID")) {
          fail("STAGE66_SOURCE_INVALID", "Provenance-цепочка начала выполнения сохранена не полностью.", { key });
        }
      }
      return deepFreeze({
        ready: true,
        projectIdentity,
        diagnostic: null,
        source: {
          stage66ProgressIdentity: safeText(stage66Record.progress_id, 240, "STAGE66_SOURCE_INVALID"),
          stage66SnapshotIdentity: snapshot.identity,
          stage66Fingerprint: snapshot.fingerprint,
          stage65StepIdentity: firstStep.sourceIdentity,
          sourceIdentities: stages.sourceIdentities,
          sourceFingerprints: stages.sourceFingerprints,
          calculationId,
        },
        step: {
          sequenceNumber: 1,
          type: "CAST_ON",
          instruction: firstStep.instruction,
          targetStitchCount: firstStep.stitchCount,
          unit: "stitches",
        },
        context: {
          product: snapshot.product,
          yarn: snapshot.yarn,
          tools: clone(snapshot.tools),
          technique: snapshot.technique,
          gaugeSummary: clone(snapshot.gaugeSummary),
          warnings: clone(snapshot.warnings),
          assumptions: clone(snapshot.assumptions),
        },
      });
    } catch (problem) {
      const code = ["PROJECT_NOT_FOUND", "STAGE66_NOT_STARTED", "STAGE66_SOURCE_INVALID", "SOURCE_PROJECT_MISMATCH", "SOURCE_FINGERPRINT_MISMATCH", "FIRST_STEP_INVALID"].includes(problem?.code)
        ? problem.code : mapSourceError(problem);
      return sourceFailure(code, problem?.userMessage || problem?.message || "Первый шаг недоступен.", projectIdentity);
    }
  }
  function deterministicIdentity(assessment) {
    return `${assessment.projectIdentity}:execution-first-step:${fingerprint({
      projectId: assessment.projectIdentity,
      stage66Fingerprint: assessment.source.stage66Fingerprint,
      stage65StepIdentity: assessment.source.stage65StepIdentity,
    })}`;
  }
  function nextActionFor(lifecycle, projectIdentity = "") {
    return lifecycle === "completed"
      ? { status: "available", destination: `/project-execution-next-step?project=${encodeURIComponent(validateProjectIdentity(projectIdentity))}`, reasonCode: null }
      : { status: "available", destination: null, reasonCode: "LIFECYCLE_ACTION_AVAILABLE" };
  }
  function createSnapshot(assessment, metadata = {}) {
    if (!assessment?.ready || !assessment.source || !assessment.step || !assessment.context) fail("STAGE66_SOURCE_INVALID", "Первый шаг нельзя создать без валидного подтверждённого плана.");
    const createdAt = safeText(metadata.createdAt, 40);
    if (!timestamp(createdAt)) fail("SNAPSHOT_INVALID", "Не указано время создания первого шага.");
    const operationId = validateOperationId(metadata.operationId);
    const value = {
      format: FORMAT,
      version: VERSION,
      identity: deterministicIdentity(assessment),
      projectIdentity: assessment.projectIdentity,
      calculationId: assessment.source.calculationId,
      lifecycle: "ready",
      revision: 1,
      source: {
        stage66ProgressIdentity: assessment.source.stage66ProgressIdentity,
        stage66SnapshotIdentity: assessment.source.stage66SnapshotIdentity,
        stage66Fingerprint: assessment.source.stage66Fingerprint,
        stage65StepIdentity: assessment.source.stage65StepIdentity,
        sourceIdentities: clone(assessment.source.sourceIdentities),
        sourceFingerprints: clone(assessment.source.sourceFingerprints),
      },
      step: clone(assessment.step),
      context: clone(assessment.context),
      check: { method: "manual_count", observedStitchCount: null, result: "pending", explicitConfirmation: false, confirmedBy: null },
      timestamps: { createdAt, activatedAt: null, lastPausedAt: null, lastResumedAt: null, checkingAt: null, completedAt: null },
      nextAction: nextActionFor("ready", assessment.projectIdentity),
      audit: [{ event: "FIRST_STEP_CREATED", operationId, revision: 1, timestamp: createdAt }],
      fingerprint: "",
    };
    return seal(value);
  }

  function validateIssue(value) {
    exactKeys(value, ISSUE_KEYS);
    safeText(value.code, 100);
    safeText(value.message, 500);
  }
  function validateSnapshot(source) {
    exactKeys(source, SNAPSHOT_KEYS);
    canonicalize(source);
    const value = clone(source);
    validateProjectIdentity(value.projectIdentity);
    if (value.format !== FORMAT || value.version !== VERSION || !safeText(value.identity, 360) || !safeText(value.calculationId, 180) || !LIFECYCLES.includes(value.lifecycle) || !Number.isSafeInteger(value.revision) || value.revision < 1) {
      fail("SNAPSHOT_INVALID", "Сохранённый первый шаг повреждён.");
    }
    exactKeys(value.source, SOURCE_KEYS);
    exactKeys(value.source.sourceIdentities, SOURCE_STAGE_KEYS);
    exactKeys(value.source.sourceFingerprints, SOURCE_STAGE_KEYS);
    for (const key of ["stage66ProgressIdentity", "stage66SnapshotIdentity", "stage66Fingerprint", "stage65StepIdentity"]) safeText(value.source[key], 300);
    for (const key of SOURCE_STAGE_KEYS) {
      safeText(value.source.sourceIdentities[key], 300);
      safeText(value.source.sourceFingerprints[key], 300);
    }
    if (value.source.stage66SnapshotIdentity !== value.source.sourceIdentities.stage66 || value.source.stage66Fingerprint !== value.source.sourceFingerprints.stage66) fail("STAGE66_SOURCE_INVALID", "Источник подтверждённого плана не согласован.");
    if (value.source.stage65StepIdentity === value.source.sourceIdentities.stage65) fail("FIRST_STEP_INVALID", "Identity шага ошибочно совпадает с identity плана.");
    exactKeys(value.step, STEP_KEYS);
    if (value.step.sequenceNumber !== 1 || value.step.type !== "CAST_ON" || safeText(value.step.instruction, 240, "FIRST_STEP_INVALID") !== "Набрать 100 петель" || value.step.targetStitchCount !== 100 || value.step.unit !== "stitches") fail("FIRST_STEP_INVALID", "Первый шаг повреждён.");
    exactKeys(value.context, CONTEXT_KEYS);
    safeText(value.context.product, 180);
    safeText(value.context.yarn, 180);
    if (!Array.isArray(value.context.tools) || !value.context.tools.length) fail("SNAPSHOT_INVALID", "Инструменты первого шага не указаны.");
    value.context.tools.forEach((item) => safeText(item, 180));
    safeText(value.context.technique, 180);
    exactKeys(value.context.gaugeSummary, GAUGE_KEYS);
    if (!Number.isFinite(value.context.gaugeSummary.stitchesPer10Cm) || !Number.isFinite(value.context.gaugeSummary.rowsPer10Cm)) fail("SNAPSHOT_INVALID", "Плотность первого шага повреждена.");
    safeText(value.context.gaugeSummary.display, 180);
    if (!Array.isArray(value.context.warnings) || !Array.isArray(value.context.assumptions)) fail("SNAPSHOT_INVALID", "Контекст первого шага повреждён.");
    value.context.warnings.forEach(validateIssue);
    value.context.assumptions.forEach(validateIssue);
    exactKeys(value.check, CHECK_KEYS);
    if (value.check.method !== "manual_count" || !["pending", "match", "mismatch"].includes(value.check.result) || typeof value.check.explicitConfirmation !== "boolean") fail("SNAPSHOT_INVALID", "Проверка первого шага повреждена.");
    if (value.check.observedStitchCount !== null && (!Number.isSafeInteger(value.check.observedStitchCount) || value.check.observedStitchCount <= 0)) fail("COUNT_INVALID", "Фактическое количество петель повреждено.");
    if (value.check.confirmedBy !== null) optionalSafeText(value.check.confirmedBy, 100);
    exactKeys(value.timestamps, TIMESTAMP_KEYS);
    if (!timestamp(value.timestamps.createdAt)) fail("SNAPSHOT_INVALID", "Время создания первого шага повреждено.");
    for (const key of TIMESTAMP_KEYS.slice(1)) if (value.timestamps[key] !== null && !timestamp(value.timestamps[key])) fail("SNAPSHOT_INVALID", "Временные отметки первого шага повреждены.");
    exactKeys(value.nextAction, NEXT_ACTION_KEYS);
    if (value.lifecycle !== "completed" && value.nextAction.destination !== null) fail("INVALID_NEXT_DESTINATION", "Сохранён неподдерживаемый маршрут продолжения.");
    if (value.lifecycle === "completed") {
      const legacy = value.nextAction.status === "unavailable" && value.nextAction.destination === null && value.nextAction.reasonCode === "NO_COMPATIBLE_NEXT_STEP_ROUTE";
      const current = value.nextAction.status === "available" && value.nextAction.reasonCode === null && safeDestination(value.nextAction.destination, value.projectIdentity).href === value.nextAction.destination;
      if (!legacy && !current) fail("INVALID_NEXT_DESTINATION", "После завершения сохранён неподдерживаемый маршрут.");
      if (value.check.observedStitchCount !== 100 || value.check.result !== "match" || value.check.explicitConfirmation !== true || value.check.confirmedBy !== "project_owner" || !value.timestamps.completedAt) fail("SNAPSHOT_INVALID", "Завершение первого шага не подтверждено.");
    } else {
      if (value.nextAction.status !== "available" || value.nextAction.reasonCode !== "LIFECYCLE_ACTION_AVAILABLE" || value.timestamps.completedAt !== null || value.check.result === "match" || value.check.confirmedBy !== null) fail("SNAPSHOT_INVALID", "Состояние незавершённого шага повреждено.");
    }
    if (value.lifecycle !== "ready" && !value.timestamps.activatedAt) fail("SNAPSHOT_INVALID", "Время активации первого шага отсутствует.");
    if (value.lifecycle === "ready" && Object.values(value.timestamps).slice(1).some((item) => item !== null)) fail("SNAPSHOT_INVALID", "Готовый шаг содержит преждевременные временные отметки.");
    if (value.lifecycle === "paused" && !value.timestamps.lastPausedAt) fail("SNAPSHOT_INVALID", "Пауза первого шага не зафиксирована.");
    if (["checking", "completed"].includes(value.lifecycle) && !value.timestamps.checkingAt) fail("SNAPSHOT_INVALID", "Проверка первого шага не зафиксирована.");
    if (!Array.isArray(value.audit) || !value.audit.length || value.audit.length > AUDIT_LIMIT) fail("SNAPSHOT_INVALID", "Audit первого шага повреждён.");
    const operations = new Set();
    value.audit.forEach((entry, index) => {
      exactKeys(entry, AUDIT_EVENT_KEYS);
      if (!AUDIT_EVENTS.includes(entry.event) || !Number.isSafeInteger(entry.revision) || entry.revision !== index + 1 || !timestamp(entry.timestamp)) fail("SNAPSHOT_INVALID", "Audit первого шага повреждён.");
      validateOperationId(entry.operationId);
      if (operations.has(entry.operationId)) fail("OPERATION_ID_CONFLICT", "Operation ID использован повторно для разных audit-событий.");
      operations.add(entry.operationId);
    });
    if (value.audit[0].event !== "FIRST_STEP_CREATED" || value.audit.at(-1).revision !== value.revision || value.audit.length !== value.revision) fail("SNAPSHOT_INVALID", "Revision первого шага не согласована с audit.");
    if (value.fingerprint !== fingerprint(semanticSnapshot(value))) fail("SOURCE_FINGERPRINT_MISMATCH", "Fingerprint первого шага не совпадает с содержимым.");
    return deepFreeze(value);
  }
  function createProgressState(snapshotSource) {
    const snapshot = validateSnapshot(snapshotSource);
    const value = { kind: KIND, version: VERSION, projectId: snapshot.projectIdentity, calculationId: snapshot.calculationId, lifecycle: snapshot.lifecycle, snapshot: clone(snapshot) };
    return validateProgressState(value, { projectIdentity: snapshot.projectIdentity, calculationId: snapshot.calculationId });
  }
  function validateProgressState(source, options = {}) {
    exactKeys(source, PROGRESS_KEYS, "PROGRESS_STATE_INVALID");
    const value = clone(source);
    if (value.kind !== KIND || value.version !== VERSION || value.projectId !== options.projectIdentity || value.calculationId !== options.calculationId || !LIFECYCLES.includes(value.lifecycle)) fail("PROGRESS_STATE_INVALID", "Запись первого шага повреждена.");
    const snapshot = validateSnapshot(value.snapshot);
    if (snapshot.projectIdentity !== value.projectId || snapshot.calculationId !== value.calculationId || snapshot.lifecycle !== value.lifecycle) fail("PROGRESS_STATE_INVALID", "Snapshot первого шага не согласован с записью прогресса.");
    value.snapshot = clone(snapshot);
    return deepFreeze(value);
  }
  function validateBinding(snapshotSource, assessment) {
    const snapshot = validateSnapshot(snapshotSource);
    if (!assessment?.ready || snapshot.projectIdentity !== assessment.projectIdentity || snapshot.calculationId !== assessment.source.calculationId ||
      snapshot.source.stage66ProgressIdentity !== assessment.source.stage66ProgressIdentity || snapshot.source.stage66SnapshotIdentity !== assessment.source.stage66SnapshotIdentity ||
      snapshot.source.stage66Fingerprint !== assessment.source.stage66Fingerprint || snapshot.source.stage65StepIdentity !== assessment.source.stage65StepIdentity ||
      canonicalize(snapshot.source.sourceIdentities) !== canonicalize(assessment.source.sourceIdentities) || canonicalize(snapshot.source.sourceFingerprints) !== canonicalize(assessment.source.sourceFingerprints) ||
      canonicalize(snapshot.step) !== canonicalize(assessment.step) || canonicalize(snapshot.context) !== canonicalize(assessment.context)) {
      fail("SOURCE_FINGERPRINT_MISMATCH", "Первый шаг не соответствует сохранённому подтверждённому плану.");
    }
    return snapshot;
  }
  function validateCommand(snapshot, command = {}) {
    const operationId = validateOperationId(command.operationId);
    const replay = snapshot.audit.find((entry) => entry.operationId === operationId);
    if (replay) return { operationId, replay: true };
    if (command.expectedRevision !== snapshot.revision) fail("REVISION_CONFLICT", "Первый шаг изменён в другой вкладке. Обновите страницу.");
    if (command.expectedFingerprint !== snapshot.fingerprint) fail("SOURCE_FINGERPRINT_MISMATCH", "Открыта устаревшая версия первого шага.");
    const at = safeText(command.timestamp, 40);
    if (!timestamp(at)) fail("SNAPSHOT_INVALID", "Не указано время операции.");
    return { operationId, replay: false, at };
  }
  function validateFirstStepTransition(from, to) {
    if (!LIFECYCLES.includes(from) || !LIFECYCLES.includes(to) || !TRANSITIONS[from]?.includes(to)) fail("LIFECYCLE_TRANSITION_INVALID", "Такой переход первого шага запрещён.");
    return true;
  }
  function appendAudit(value, event, operationId, at) {
    value.revision += 1;
    value.audit.push({ event, operationId, revision: value.revision, timestamp: at });
  }
  function transition(source, target, command = {}) {
    const current = validateSnapshot(source);
    const checked = validateCommand(current, command);
    if (checked.replay) return current;
    validateFirstStepTransition(current.lifecycle, target);
    const value = clone(current);
    const event = current.lifecycle === "ready" && target === "active" ? "FIRST_STEP_ACTIVATED"
      : current.lifecycle === "active" && target === "paused" ? "FIRST_STEP_PAUSED"
        : current.lifecycle === "paused" && target === "active" ? "FIRST_STEP_RESUMED"
          : current.lifecycle === "active" && target === "checking" ? "FIRST_STEP_CHECKING_STARTED"
            : current.lifecycle === "checking" && target === "active" ? "FIRST_STEP_CHECK_CANCELLED" : null;
    if (!event || target === "completed") fail("LIFECYCLE_TRANSITION_INVALID", "Для завершения нужна проверка количества.");
    value.lifecycle = target;
    if (event === "FIRST_STEP_ACTIVATED") value.timestamps.activatedAt = checked.at;
    if (event === "FIRST_STEP_PAUSED") value.timestamps.lastPausedAt = checked.at;
    if (event === "FIRST_STEP_RESUMED") value.timestamps.lastResumedAt = checked.at;
    if (event === "FIRST_STEP_CHECKING_STARTED") {
      value.timestamps.checkingAt = checked.at;
      value.check = { method: "manual_count", observedStitchCount: null, result: "pending", explicitConfirmation: false, confirmedBy: null };
    }
    if (event === "FIRST_STEP_CHECK_CANCELLED") value.check = { method: "manual_count", observedStitchCount: null, result: "pending", explicitConfirmation: false, confirmedBy: null };
    value.nextAction = nextActionFor(target, value.projectIdentity);
    appendAudit(value, event, checked.operationId, checked.at);
    return seal(value);
  }
  function activateFirstStep(source, command) { return transition(source, "active", command); }
  function pauseFirstStep(source, command) { return transition(source, "paused", command); }
  function resumeFirstStep(source, command) { return transition(source, "active", command); }
  function startCheckingFirstStep(source, command) { return transition(source, "checking", command); }
  function returnToActiveFromChecking(source, command) { return transition(source, "active", command); }
  function mismatchMessage(observed, target = 100) {
    const difference = Math.abs(target - observed);
    if (observed < target) return difference === 1 ? "Не хватает 1 петли." : `Не хватает петель: ${difference}.`;
    return difference === 1 ? "Набрана 1 лишняя петля." : `Лишних петель: ${difference}.`;
  }
  function completeFirstStep(source, input = {}, command = {}) {
    const current = validateSnapshot(source);
    const checked = validateCommand(current, command);
    if (checked.replay) {
      const last = current.audit.find((entry) => entry.operationId === checked.operationId);
      const mismatch = last?.event === "FIRST_STEP_CHECK_MISMATCH";
      return deepFreeze({ snapshot: current, replayed: true, diagnostic: mismatch ? diagnostic("COUNT_MISMATCH", mismatchMessage(current.check.observedStitchCount, current.step.targetStitchCount)) : null });
    }
    if (current.lifecycle !== "checking") fail("LIFECYCLE_TRANSITION_INVALID", "Завершить шаг можно только из режима проверки.");
    if (current.step.type !== "CAST_ON" || current.step.targetStitchCount !== 100) fail("FIRST_STEP_INVALID", "Цель первого шага повреждена.");
    const observed = input.observedStitchCount;
    if (typeof observed !== "number" || !Number.isSafeInteger(observed) || observed <= 0) fail("COUNT_INVALID", "Введите целое положительное количество петель.");
    if (observed !== current.step.targetStitchCount) {
      const value = clone(current);
      value.check = { method: "manual_count", observedStitchCount: observed, result: "mismatch", explicitConfirmation: input.explicitConfirmation === true, confirmedBy: null };
      appendAudit(value, "FIRST_STEP_CHECK_MISMATCH", checked.operationId, checked.at);
      const snapshot = seal(value);
      return deepFreeze({ snapshot, replayed: false, diagnostic: diagnostic("COUNT_MISMATCH", mismatchMessage(observed, current.step.targetStitchCount), { observed, target: current.step.targetStitchCount }) });
    }
    if (input.explicitConfirmation !== true) fail("CONFIRMATION_REQUIRED", "Подтвердите, что вы пересчитали петли.");
    validateFirstStepTransition(current.lifecycle, "completed");
    const value = clone(current);
    value.lifecycle = "completed";
    value.check = { method: "manual_count", observedStitchCount: 100, result: "match", explicitConfirmation: true, confirmedBy: "project_owner" };
    value.timestamps.completedAt = checked.at;
    value.nextAction = nextActionFor("completed", value.projectIdentity);
    appendAudit(value, "FIRST_STEP_COMPLETED", checked.operationId, checked.at);
    return deepFreeze({ snapshot: seal(value), replayed: false, diagnostic: null });
  }
  function safeDestination(value, projectIdentity) {
    try {
      validateProjectIdentity(projectIdentity);
      const url = new URL(value, "http://localhost");
      const projectRoutes = new Set(["/project-execution-next-step", "/project-execution-first-step", "/project-execution-start"]);
      const staticRoutes = new Set(["/saved-projects"]);
      const validProjectRoute = projectRoutes.has(url.pathname) && url.searchParams.size === 1 && url.searchParams.get("project") === projectIdentity;
      const validStaticRoute = staticRoutes.has(url.pathname) && url.search === "";
      const valid = url.origin === "http://localhost" && !url.username && !url.password && (validProjectRoute || validStaticRoute);
      return deepFreeze({ valid, href: valid ? `${url.pathname}${url.search}${url.hash || ""}` : "" });
    } catch { return deepFreeze({ valid: false, href: "" }); }
  }

  const api = Object.freeze({
    FORMAT, VERSION, KIND, PROGRESS_KIND, AUDIT_LIMIT, LIFECYCLES, TRANSITIONS, AUDIT_EVENTS,
    SNAPSHOT_KEYS, SOURCE_KEYS, SOURCE_STAGE_KEYS, STEP_KEYS, CONTEXT_KEYS, CHECK_KEYS,
    TIMESTAMP_KEYS, NEXT_ACTION_KEYS, PROGRESS_KEYS, ProjectExecutionFirstStepError,
    canonicalize, fingerprint, validateProjectIdentity, validateOperationId, diagnostic, recoveryFor,
    stage66RecordFrom, stage67RecordFrom, assessSource, deterministicIdentity, nextActionFor,
    createSnapshot, validateSnapshot, createProgressState, validateProgressState, validateBinding,
    validateFirstStepTransition, activateFirstStep, pauseFirstStep, resumeFirstStep,
    startCheckingFirstStep, returnToActiveFromChecking, completeFirstStep, mismatchMessage,
    safeDestination,
  });
  globalObject.YarnAIProjectExecutionFirstStep = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
