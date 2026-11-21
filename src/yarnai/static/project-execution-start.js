"use strict";

(function initializeProjectExecutionStart(globalObject) {
  const FORMAT = "yarnai-project-execution-start";
  const VERSION = 1;
  const KIND = "PROJECT_EXECUTION_START";
  const PROGRESS_KIND = KIND;
  const AUDIT_LIMIT = 12;
  const LIFECYCLES = Object.freeze(["draft", "ready", "started"]);
  const ACKNOWLEDGMENT_CODE = "MATERIALS_AND_TOOLS_READY";
  const SNAPSHOT_KEYS = Object.freeze([
    "format", "version", "identity", "projectIdentity", "lifecycle",
    "sourceStage65Identity", "sourceStage65Fingerprint", "sourceIdentities",
    "sourceFingerprints", "product", "size", "recipient", "yarn", "tools", "technique", "materials",
    "gaugeSummary", "firstStep", "warnings", "assumptions", "acknowledgments",
    "createdAt", "startedAt", "nextAction", "fingerprint", "audit",
  ]);
  const PROGRESS_KEYS = Object.freeze([
    "kind", "version", "projectId", "calculationId", "lifecycle", "snapshot",
  ]);
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  class ProjectExecutionStartError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "ProjectExecutionStartError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = clone(details);
    }
  }

  function fail(code, message, details) { throw new ProjectExecutionStartError(code, message, details); }
  function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function text(value, limit = 240) { return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : ""; }
  function timestamp(value) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value || ""); }
  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.values(value).forEach(deepFreeze);
    }
    return value;
  }
  function canonicalize(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("SNAPSHOT_INVALID", "Снимок начала содержит недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("SNAPSHOT_INVALID", "Снимок начала содержит неподдерживаемое значение.");
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
  function exactKeys(value, keys, code = "SNAPSHOT_NOT_ALLOWLISTED") {
    if (!record(value)) fail(code, "Сохранённый снимок начала повреждён.");
    const actual = Object.keys(value);
    if (actual.length !== keys.length || actual.some((key) => !keys.includes(key)) || keys.some((key) => !actual.includes(key))) {
      fail(code, "Сохранённый снимок начала содержит неподдерживаемые поля.");
    }
  }
  function validateProjectIdentity(value, expected = "") {
    const identity = text(value, 180);
    if (!UUID_V7.test(identity) || expected && identity !== expected) fail("PROJECT_NOT_FOUND", "Проект не найден или ссылка на него повреждена.");
    return identity;
  }
  function diagnostic(code, message, recovery) {
    return deepFreeze({ code, message, recovery: recoveryFor(code, recovery) });
  }
  function recoveryFor(code, fallback = null) {
    const mapping = {
      PROJECT_NOT_FOUND: { path: "/saved-projects", label: "Вернуться к сохранённым проектам" },
      STAGE60_SOURCE_INVALID: { path: "/user-workspace-entry", label: "Проверить сведения о проекте" },
      STAGE61_SOURCE_INVALID: { path: "/user-workspace-entry", label: "Восстановить основу проекта" },
      STAGE63_SOURCE_INVALID: { path: "/swatch-assistant", label: "Проверить контрольный образец" },
      STAGE64_SOURCE_INVALID: { path: "/project-calculation-entry", label: "Проверить начальный расчёт" },
      STAGE65_SOURCE_INVALID: { path: "/project-execution-plan", label: "Проверить план работы" },
      STAGE65_NOT_READY: { path: "/project-execution-plan", label: "Завершить подготовку плана" },
      SOURCE_PROJECT_MISMATCH: { path: "/saved-projects", label: "Выбрать проект заново" },
      SOURCE_FINGERPRINT_MISMATCH: { path: "/project-execution-plan", label: "Перепроверить план работы" },
      SOURCE_STALE: { path: "/project-execution-plan", label: "Обновить план работы" },
      ACKNOWLEDGMENT_REQUIRED: { path: "/project-execution-start", label: "Подтвердить готовность на этой странице" },
      EXECUTION_ALREADY_STARTED: { path: "/project-execution-start", label: "Открыть начатое выполнение" },
      INVALID_NEXT_DESTINATION: { path: "/saved-projects", label: "Вернуться к проекту" },
    };
    return clone(mapping[code] || fallback || mapping.STAGE65_SOURCE_INVALID);
  }
  function sourceFailure(code, message, projectIdentity = "") {
    return deepFreeze({
      ready: false,
      started: false,
      projectIdentity,
      diagnostic: diagnostic(code, message),
      preparation: null,
      source: null,
    });
  }
  function mapSourceCode(code) {
    const value = String(code || "");
    if (/PROJECT_(MISSING|NOT_FOUND|ID)|INVALID_PROJECT/.test(value)) return "PROJECT_NOT_FOUND";
    if (/CLOSURE|CONFIRMED_DETAILS/.test(value)) return "STAGE60_SOURCE_INVALID";
    if (/INITIALIZATION/.test(value)) return "STAGE61_SOURCE_INVALID";
    if (/GAUGE|SWATCH/.test(value)) return "STAGE63_SOURCE_INVALID";
    if (/CALCULATION|WORKING_WIDTH|FINAL_RESULT|ENTRY_/.test(value)) return "STAGE64_SOURCE_INVALID";
    if (/FINGERPRINT/.test(value)) return "SOURCE_FINGERPRINT_MISMATCH";
    if (/STALE/.test(value)) return "SOURCE_STALE";
    return "STAGE65_SOURCE_INVALID";
  }
  function identityOf(source, ...keys) {
    for (const key of keys) {
      const value = text(source?.[key], 200);
      if (value) return value;
    }
    return "";
  }
  function findStage65Record(progress, calculationId) {
    return (Array.isArray(progress) ? progress : [])
      .filter((entry) => entry?.kind === "PROJECT_EXECUTION_PLAN_PREPARATION" && entry?.calculation_id === calculationId && !entry?.deleted_at)
      .sort((left, right) => String(left.updated_at || "").localeCompare(String(right.updated_at || "")))
      .at(-1) || null;
  }
  function firstStepFromPlan(plan) {
    const source = Array.isArray(plan?.steps) ? plan.steps[0] : null;
    const stitchCount = source?.expectedOutput?.stitchCount;
    if (!source || source.sequenceNumber !== 1 || source.status !== "confirmed" || source.type !== "CAST_ON" || !Number.isInteger(stitchCount) || stitchCount < 1) {
      fail("STAGE65_NOT_READY", "В подтверждённом плане нет пригодного первого физического шага.");
    }
    return deepFreeze({
      sourceIdentity: text(source.identity, 240),
      type: source.type,
      instruction: `Набрать ${stitchCount} петель`,
      stitchCount,
    });
  }
  function preparationFrom(verified, plan) {
    const garment = record(plan.garmentContext) ? plan.garmentContext : {};
    const sizing = record(plan.sizingContext) ? plan.sizingContext : {};
    const gauge = record(plan.gaugeContext) ? plan.gaugeContext : {};
    const gaugeSource = verified?.gauge?.snapshot?.source || {};
    const materials = (Array.isArray(plan.materialContext) ? plan.materialContext : [])
      .map((item) => text(item?.label || item?.name, 180))
      .filter(Boolean);
    const yarn = text(gaugeSource.yarn, 180);
    if (yarn && !materials.includes(yarn)) materials.unshift(yarn);
    const tools = [text(gaugeSource.tool, 180)].filter(Boolean);
    const size = text(garment.standardSize, 80)
      || text(garment.sizeMode, 80)
      || (sizing.garment?.garmentWidth?.value ? `${sizing.garment.garmentWidth.value} ${sizing.garment.garmentWidth.unit || "см"}` : "Не указан");
    return deepFreeze({
      product: text(garment.type, 180) || text(plan.projectContext?.title, 180) || "Изделие",
      size,
      recipient: text(plan.recipientContext?.recipient, 180) || text(garment.recipient, 180) || "Не указан",
      yarn: yarn || "Не указана",
      tools: tools.length ? tools : ["Не указан"],
      technique: text(gaugeSource.technique, 180) || text(plan.technologyContext?.workingMethod, 180) || "Не указан",
      materials: materials.length ? materials : ["Подтверждённые дополнительные материалы не указаны"],
      gaugeSummary: {
        stitchesPer10Cm: gauge.stitchesPer10Cm,
        rowsPer10Cm: gauge.rowsPer10Cm,
        display: `${gauge.stitchesPer10Cm} п. × ${gauge.rowsPer10Cm} р. на 10 см`,
      },
      firstStep: firstStepFromPlan(plan),
      warnings: (Array.isArray(plan.warnings) ? plan.warnings : []).map((item) => ({ code: text(item?.code, 100), message: text(item?.message, 500) })).filter((item) => item.code && item.message),
      assumptions: (Array.isArray(plan.assumptions) ? plan.assumptions : []).map((item) => ({ code: text(item?.code, 100), message: text(item?.message, 500) })).filter((item) => item.code && item.message),
    });
  }
  function assessReadiness(input = {}) {
    const projectIdentity = text(input.projectIdentity, 180);
    try {
      validateProjectIdentity(projectIdentity);
      const project = input.project;
      if (!record(project)) fail("PROJECT_NOT_FOUND", "Проект не найден.");
      if (project.project_id !== projectIdentity) fail("SOURCE_PROJECT_MISMATCH", "Открыт план другого проекта.");
      const verified = input.verified;
      if (!record(verified)) {
        const sourceProblem = input.sourceProblem || {};
        fail(mapSourceCode(sourceProblem.code), sourceProblem.userMessage || sourceProblem.message || "Цепочка исходных данных не прошла проверку.");
      }
      if (verified.closure?.lifecycle !== "completed") fail("STAGE60_SOURCE_INVALID", "Подтверждённые сведения о проекте недоступны.");
      if (verified.initialization?.lifecycle !== "initialized") fail("STAGE61_SOURCE_INVALID", "Основа проекта недоступна.");
      if (verified.gauge?.lifecycle !== "confirmed") fail("STAGE63_SOURCE_INVALID", "Подтверждённая плотность недоступна.");
      if (verified.calculation?.snapshot?.lifecycle !== "completed") fail("STAGE64_SOURCE_INVALID", "Начальный расчёт не завершён.");
      const calculationId = identityOf(verified.calculation?.record, "calculation_id");
      if (!calculationId || project.active_calculation_id !== calculationId) fail("SOURCE_STALE", "Активная версия начального расчёта изменилась.");
      const planRecord = input.planRecord || findStage65Record(input.progress, calculationId);
      if (!record(planRecord) || planRecord.project_id !== projectIdentity || planRecord.calculation_id !== calculationId) fail("STAGE65_SOURCE_INVALID", "Подтверждённый план работы не найден.");
      const planDomain = input.planDomain;
      if (!planDomain?.validateProgressState || !planDomain?.validateSnapshot) fail("STAGE65_SOURCE_INVALID", "Валидатор подтверждённого плана недоступен.");
      const state = planDomain.validateProgressState(planRecord.state, { projectIdentity, calculationId });
      const plan = state.history.at(-1) || null;
      if (!plan || state.currentRevisionIdentity !== plan.identity) fail("STAGE65_SOURCE_INVALID", "Активная версия плана не определена.");
      planDomain.validateSnapshot(plan);
      if (plan.lifecycle !== "completed" || plan.readiness === "blocked" || plan.validation?.stale === true) fail("STAGE65_NOT_READY", "План ещё не готов к началу выполнения.");
      const currentAssessment = planDomain.assessPlan({
        sourceChain: verified.sourceChain,
        technology: verified.technology,
        materials: verified.materials,
        boundedInputs: plan.planScope?.boundedInputs,
        acknowledgedWarningCodes: plan.validation?.acknowledgedWarningCodes,
      });
      const currency = planDomain.staleStatus(plan, currentAssessment);
      if (!currency.current) fail("SOURCE_STALE", currency.reasons?.[0]?.message || "План построен по устаревшим исходным данным.");
      const expectedIdentities = {
        closure: identityOf(verified.closure, "closureId", "identity"),
        initialization: identityOf(verified.initialization, "identity"),
        gauge: identityOf(verified.gauge, "identity"),
        calculation: calculationId,
      };
      const expectedFingerprints = {
        closure: identityOf(verified.closure, "recordFingerprint", "fingerprint"),
        initialization: identityOf(verified.initialization?.integrity, "recordFingerprint") || identityOf(verified.initialization, "snapshot_fingerprint"),
        gauge: identityOf(verified.gauge, "fingerprint"),
        calculation: identityOf(verified.calculation?.snapshot, "fingerprint"),
      };
      for (const key of Object.keys(expectedIdentities)) {
        if (!expectedIdentities[key] || plan.sourceIdentities?.[key] !== expectedIdentities[key]) fail("SOURCE_PROJECT_MISMATCH", "Один из источников плана относится к другой версии проекта.", { key });
        if (!expectedFingerprints[key] || plan.sourceFingerprints?.[key] !== expectedFingerprints[key]) fail("SOURCE_FINGERPRINT_MISMATCH", "Контрольная сумма одного из источников плана изменилась.", { key });
      }
      const preparation = preparationFrom(verified, plan);
      return deepFreeze({
        ready: true,
        started: false,
        projectIdentity,
        diagnostic: null,
        preparation,
        source: {
          projectRevision: project.revision,
          calculationId,
          planProgressIdentity: text(planRecord.progress_id, 180),
          planIdentity: plan.identity,
          planFingerprint: plan.fingerprint,
          sourceIdentities: { ...expectedIdentities, stage65: plan.identity },
          sourceFingerprints: { ...expectedFingerprints, stage65: plan.fingerprint },
        },
      });
    } catch (problem) {
      const code = [
        "PROJECT_NOT_FOUND", "STAGE60_SOURCE_INVALID", "STAGE61_SOURCE_INVALID", "STAGE63_SOURCE_INVALID",
        "STAGE64_SOURCE_INVALID", "STAGE65_SOURCE_INVALID", "STAGE65_NOT_READY", "SOURCE_PROJECT_MISMATCH",
        "SOURCE_FINGERPRINT_MISMATCH", "SOURCE_STALE",
      ].includes(problem?.code) ? problem.code : mapSourceCode(problem?.code);
      return sourceFailure(code, problem?.userMessage || problem?.message || "Начало выполнения заблокировано.", projectIdentity);
    }
  }
  function nextActionDescriptor() {
    return deepFreeze({
      status: "unavailable",
      destination: null,
      reasonCode: "NO_COMPATIBLE_EXECUTION_ROUTE",
      label: "Маршрут продолжения будет подключён отдельно",
    });
  }
  function semanticSnapshot(value) {
    const payload = clone(value);
    delete payload.fingerprint;
    return payload;
  }
  function seal(value) {
    value.fingerprint = fingerprint(semanticSnapshot(value));
    return validateSnapshot(value);
  }
  function buildDraft(assessment, metadata = {}) {
    if (!assessment?.ready || !assessment.source || !assessment.preparation) fail("STAGE65_NOT_READY", "План ещё не готов к началу выполнения.");
    const createdAt = text(metadata.createdAt, 40);
    if (!timestamp(createdAt)) fail("SNAPSHOT_INVALID", "Не указано время подготовки начала.");
    const acknowledgedAt = text(metadata.acknowledgedAt, 40);
    const acknowledged = metadata.acknowledged === true && timestamp(acknowledgedAt);
    const value = {
      format: FORMAT,
      version: VERSION,
      identity: `${assessment.projectIdentity}:execution-start:${assessment.source.planFingerprint}`,
      projectIdentity: assessment.projectIdentity,
      lifecycle: "draft",
      sourceStage65Identity: assessment.source.planIdentity,
      sourceStage65Fingerprint: assessment.source.planFingerprint,
      sourceIdentities: clone(assessment.source.sourceIdentities),
      sourceFingerprints: clone(assessment.source.sourceFingerprints),
      product: assessment.preparation.product,
      size: assessment.preparation.size,
      recipient: assessment.preparation.recipient,
      yarn: assessment.preparation.yarn,
      materials: clone(assessment.preparation.materials),
      tools: clone(assessment.preparation.tools),
      technique: assessment.preparation.technique,
      gaugeSummary: clone(assessment.preparation.gaugeSummary),
      firstStep: clone(assessment.preparation.firstStep),
      warnings: clone(assessment.preparation.warnings),
      assumptions: clone(assessment.preparation.assumptions),
      acknowledgments: acknowledged ? [{ code: ACKNOWLEDGMENT_CODE, confirmed: true, confirmedAt: acknowledgedAt }] : [],
      createdAt,
      startedAt: null,
      nextAction: nextActionDescriptor(),
      fingerprint: "",
      audit: {
        createdBy: text(metadata.createdBy, 80) || "project_owner",
        projectRevision: Number.isInteger(assessment.source.projectRevision) ? assessment.source.projectRevision : null,
        explicitStart: false,
        sourceChecked: true,
        events: [{ event: "draft_created", at: createdAt }],
      },
    };
    return seal(value);
  }
  function appendAudit(value, event, at) {
    value.audit.events = [...value.audit.events, { event, at }].slice(-AUDIT_LIMIT);
  }
  function markReady(source, metadata = {}) {
    const value = clone(validateSnapshot(source));
    if (value.lifecycle !== "draft") fail("LIFECYCLE_TRANSITION_INVALID", "К готовности можно перейти только из черновика.");
    if (!value.acknowledgments.some((item) => item.code === ACKNOWLEDGMENT_CODE && item.confirmed === true)) fail("ACKNOWLEDGMENT_REQUIRED", "Подтвердите, что материалы и инструменты подготовлены.");
    const at = text(metadata.timestamp, 40);
    if (!timestamp(at)) fail("SNAPSHOT_INVALID", "Не указано время подтверждения готовности.");
    value.lifecycle = "ready";
    appendAudit(value, "readiness_confirmed", at);
    return seal(value);
  }
  function start(source, metadata = {}) {
    const value = clone(validateSnapshot(source));
    if (value.lifecycle !== "ready") fail("LIFECYCLE_TRANSITION_INVALID", "Начать выполнение можно только после проверки готовности.");
    const at = text(metadata.startedAt, 40);
    if (!timestamp(at)) fail("SNAPSHOT_INVALID", "Не указано время начала выполнения.");
    value.lifecycle = "started";
    value.startedAt = at;
    value.audit.explicitStart = true;
    appendAudit(value, "execution_started", at);
    return seal(value);
  }
  function validateSnapshot(source) {
    exactKeys(source, SNAPSHOT_KEYS);
    const value = clone(source);
    validateProjectIdentity(value.projectIdentity);
    if (value.format !== FORMAT || value.version !== VERSION || !text(value.identity, 300) || !LIFECYCLES.includes(value.lifecycle)) fail("SNAPSHOT_INVALID", "Сохранённый снимок начала повреждён.");
    if (!text(value.sourceStage65Identity, 300) || !text(value.sourceStage65Fingerprint, 180) || !record(value.sourceIdentities) || !record(value.sourceFingerprints)) fail("STAGE65_SOURCE_INVALID", "Ссылка на подтверждённый план повреждена.");
    if (!text(value.product, 180) || !text(value.size, 180) || !text(value.recipient, 180) || !text(value.yarn, 180) || !text(value.technique, 180) || !Array.isArray(value.materials) || !Array.isArray(value.tools)) fail("SNAPSHOT_INVALID", "Подготовка к началу сохранена не полностью.");
    if (!record(value.gaugeSummary) || !Number.isFinite(value.gaugeSummary.stitchesPer10Cm) || !Number.isFinite(value.gaugeSummary.rowsPer10Cm) || !text(value.gaugeSummary.display, 180)) fail("SNAPSHOT_INVALID", "Подтверждённая плотность повреждена.");
    if (!record(value.firstStep) || value.firstStep.type !== "CAST_ON" || !Number.isInteger(value.firstStep.stitchCount) || value.firstStep.stitchCount < 1 || !text(value.firstStep.instruction, 240)) fail("STAGE65_NOT_READY", "Первый шаг плана повреждён.");
    if (!Array.isArray(value.warnings) || !Array.isArray(value.assumptions) || !Array.isArray(value.acknowledgments) || !record(value.nextAction) || !record(value.audit) || !Array.isArray(value.audit.events) || value.audit.events.length > AUDIT_LIMIT) fail("SNAPSHOT_INVALID", "Сохранённый снимок начала повреждён.");
    if (value.nextAction.status !== "unavailable" || value.nextAction.destination !== null || value.nextAction.reasonCode !== "NO_COMPATIBLE_EXECUTION_ROUTE") fail("INVALID_NEXT_DESTINATION", "Сохранён неподдерживаемый следующий маршрут.");
    if (!timestamp(value.createdAt) || value.startedAt !== null && !timestamp(value.startedAt)) fail("SNAPSHOT_INVALID", "Временные отметки начала повреждены.");
    if (value.lifecycle === "started" && (!value.startedAt || value.audit.explicitStart !== true || !value.acknowledgments.some((item) => item.code === ACKNOWLEDGMENT_CODE && item.confirmed === true))) fail("SNAPSHOT_INVALID", "Начало выполнения не было явно подтверждено.");
    if (value.lifecycle !== "started" && value.startedAt !== null) fail("SNAPSHOT_INVALID", "Время старта появилось до начала выполнения.");
    if (value.fingerprint !== fingerprint(semanticSnapshot(value))) fail("SOURCE_FINGERPRINT_MISMATCH", "Контрольная сумма снимка начала не совпадает с содержимым.");
    canonicalize(value);
    return deepFreeze(value);
  }
  function createProgressState(snapshotSource, calculationId) {
    const snapshot = validateSnapshot(snapshotSource);
    if (snapshot.lifecycle !== "started") fail("LIFECYCLE_TRANSITION_INVALID", "Сохранять можно только явно начатое выполнение.");
    const value = {
      kind: KIND,
      version: VERSION,
      projectId: snapshot.projectIdentity,
      calculationId: text(calculationId, 180),
      lifecycle: "started",
      snapshot: clone(snapshot),
    };
    return validateProgressState(value, { projectIdentity: snapshot.projectIdentity, calculationId: value.calculationId });
  }
  function validateProgressState(source, options = {}) {
    exactKeys(source, PROGRESS_KEYS, "PROGRESS_STATE_INVALID");
    const value = clone(source);
    if (value.kind !== KIND || value.version !== VERSION || value.lifecycle !== "started" || value.projectId !== options.projectIdentity || value.calculationId !== options.calculationId) fail("PROGRESS_STATE_INVALID", "Сохранённое начало выполнения повреждено.");
    const snapshot = validateSnapshot(value.snapshot);
    if (snapshot.projectIdentity !== value.projectId || snapshot.lifecycle !== "started") fail("PROGRESS_STATE_INVALID", "Снимок начала не соответствует проекту.");
    value.snapshot = clone(snapshot);
    return deepFreeze(value);
  }
  function existingStatus(progressRecord, options = {}) {
    if (!progressRecord) return null;
    try {
      const state = validateProgressState(progressRecord.state, { projectIdentity: options.projectIdentity, calculationId: progressRecord.calculation_id });
      return deepFreeze({ valid: true, started: true, state, snapshot: state.snapshot, diagnostic: diagnostic("EXECUTION_ALREADY_STARTED", "Выполнение этого проекта уже начато.") });
    } catch (problem) {
      return deepFreeze({ valid: false, started: false, state: null, snapshot: null, diagnostic: diagnostic(problem.code || "STAGE65_SOURCE_INVALID", problem.userMessage || problem.message || "Сохранённое начало повреждено.") });
    }
  }
  function safeDestination(value, projectIdentity) {
    try {
      validateProjectIdentity(projectIdentity);
      const url = new URL(value, "http://localhost");
      const allowed = new Set(["/project-execution-first-step", "/project-execution-start", "/project-execution-plan", "/project-calculation-entry", "/swatch-assistant", "/user-workspace-entry"]);
      const valid = url.origin === "http://localhost" && allowed.has(url.pathname) && url.searchParams.get("project") === projectIdentity && !url.username && !url.password;
      return deepFreeze({ valid, href: valid ? `${url.pathname}?project=${encodeURIComponent(projectIdentity)}${url.hash || ""}` : "" });
    } catch { return deepFreeze({ valid: false, href: "" }); }
  }

  const api = Object.freeze({
    FORMAT, VERSION, KIND, PROGRESS_KIND, AUDIT_LIMIT, LIFECYCLES, ACKNOWLEDGMENT_CODE,
    SNAPSHOT_KEYS, PROGRESS_KEYS, ProjectExecutionStartError, canonicalize, fingerprint,
    validateProjectIdentity, diagnostic, recoveryFor, mapSourceCode, findStage65Record,
    firstStepFromPlan, assessReadiness, nextActionDescriptor, buildDraft, markReady, start,
    validateSnapshot, createProgressState, validateProgressState, existingStatus, safeDestination,
  });
  globalObject.YarnAIProjectExecutionStart = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
