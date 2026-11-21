"use strict";

(function exposeProjectInitialization(globalObject) {
  const FORMAT = "yarnai-project-initialization";
  const VERSION = 1;
  const KIND = "PROJECT_INITIALIZATION_FROM_CONFIRMED_DETAILS";
  const HISTORY_FORMAT = "yarnai-project-initialization-history";
  const HISTORY_VERSION = 1;
  const HISTORY_KEY = "project_initializations";
  const LIFECYCLES = Object.freeze(["draft", "reviewing", "ready", "initialized"]);
  const VERDICTS = Object.freeze(["ready", "blocked", "stale"]);
  const BODY_FIELDS = Object.freeze(["bust", "waist", "hips", "shoulderWidth", "upperArm", "armholeDepth", "neck", "head", "footLength", "hand"]);
  const GARMENT_FIELDS = Object.freeze(["garmentWidth", "garmentLength", "sleeveLength", "necklineDepth"]);
  const SNAPSHOT_KEYS = Object.freeze(["format", "project", "initialization", "source", "garment", "measurements", "validation", "assumptions", "warnings", "provenance", "collaboration", "audit"]);

  class ProjectInitializationError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "ProjectInitializationError";
      this.code = code;
      this.userMessage = message;
      this.details = details;
    }
  }

  function fail(code, message, details) {
    throw new ProjectInitializationError(code, message, details);
  }

  function record(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!record(value) && !Array.isArray(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function clean(value, maximum = 600) {
    if (typeof value !== "string") return "";
    return value.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function closureApi() {
    const api = globalObject.YarnAIProjectDetailsClosure;
    if (!api?.canonicalize || !api?.fingerprint || !api?.validateClosurePayload || !api?.evaluateStoredClosure) {
      fail("CLOSURE_API_MISSING", "Модуль итоговой проверки сведений недоступен.");
    }
    return api;
  }

  function canonicalize(value) {
    return closureApi().canonicalize(value);
  }

  function fingerprint(value) {
    return closureApi().fingerprint(value);
  }

  function equal(left, right) {
    return canonicalize(left) === canonicalize(right);
  }

  function stableValues(values, identity) {
    const byIdentity = new Map();
    (Array.isArray(values) ? values : []).forEach((source) => {
      const value = clone(source);
      const key = identity(value) || canonicalize(value);
      if (!byIdentity.has(key)) byIdentity.set(key, value);
    });
    return [...byIdentity.entries()].sort(([left], [right]) => left.localeCompare(right, "en")).map(([, value]) => value);
  }

  function normalizeIssue(value) {
    if (typeof value === "string") return { code: `message:${fingerprint(value)}`, path: "", label: clean(value), message: clean(value) };
    return {
      code: clean(value?.code, 180) || `issue:${fingerprint(value)}`,
      path: clean(value?.path, 300),
      label: clean(value?.label, 300),
      message: clean(value?.message || value?.label, 600),
    };
  }

  function normalizeIssues(values) {
    return stableValues((Array.isArray(values) ? values : []).map(normalizeIssue).filter((item) => item.message || item.label), (item) => `${item.code}|${item.path}|${item.label}|${item.message}`);
  }

  function normalizeMeasurement(value) {
    if (!record(value) || !Number.isFinite(Number(value.value)) || Number(value.value) <= 0) return null;
    return { value: Number(value.value), unit: clean(value.unit, 20) || "cm" };
  }

  function normalizeMeasurements(source, fields) {
    const result = {};
    fields.forEach((field) => {
      const normalized = normalizeMeasurement(source?.[field]);
      if (normalized) result[field] = normalized;
    });
    return result;
  }

  function normalizeProvenance(values) {
    return stableValues((Array.isArray(values) ? values : []).map((item) => ({
      path: clean(item?.path, 300),
      label: clean(item?.label, 300),
      source: clean(item?.source, 120),
      sourceLabel: clean(item?.sourceLabel, 600),
      collaboration: record(item?.collaboration) ? {
        requestId: clean(item.collaboration.requestId, 180),
        responseId: clean(item.collaboration.responseId, 180),
      } : null,
    })).filter((item) => item.path && item.source), (item) => item.path);
  }

  function normalizeCollaboration(value) {
    const applied = stableValues((Array.isArray(value?.applied) ? value.applied : []).map((item) => ({
      path: clean(item?.path, 300),
      requestId: clean(item?.requestId, 180),
      responseId: clean(item?.responseId, 180),
      helperLabel: clean(item?.helperLabel, 120),
      acceptedAt: clean(item?.acceptedAt, 40),
      value: clone(item?.value),
    })).filter((item) => item.path && item.requestId && item.responseId), (item) => item.path);
    return {
      applied,
      appliedCount: applied.length,
      requestIds: [...new Set(applied.map((item) => item.requestId))].sort(),
      responseIds: [...new Set(applied.map((item) => item.responseId))].sort(),
    };
  }

  function normalizeAssumptions(values) {
    const api = closureApi();
    return api.normalizeAssumptions(Array.isArray(values) ? values : []);
  }

  function validDestination(value) {
    const href = clean(value?.href, 1400);
    const forbidden = /stage[-_ ]?62|project[-_ ]?(technology|construction|calculation)/i.test(href);
    const allowed = href === "#swatch-assistant" || /^\/swatch-assistant\?project=[^&#]+$/.test(href) || /^\/user-workspace-entry\?[^#]+#swatch-assistant$/.test(href) || /^\/calculator\?/.test(href);
    return deepFreeze({
      enabled: Boolean(value?.enabled && allowed && !forbidden),
      href: allowed && !forbidden ? href : "",
      label: clean(value?.label, 120) || "Продолжить",
      description: clean(value?.description, 500),
    });
  }

  function validateClosureHistory(source, projectIdentity) {
    if (!record(source)) fail("COMPLETED_CLOSURE_MISSING", "Сначала завершите итоговую проверку сведений о проекте.");
    if (source.version !== closureApi().HISTORY_VERSION || !Array.isArray(source.records)) fail("BROKEN_CLOSURE_HISTORY", "История итоговых проверок повреждена.");
    if (!source.records.length) fail("COMPLETED_CLOSURE_MISSING", "Сначала завершите итоговую проверку сведений о проекте.");
    const identities = new Set();
    const records = source.records.map((entry) => {
      const checked = closureApi().validateClosurePayload(entry, { projectId: projectIdentity }).closure;
      if (identities.has(checked.closureId)) fail("AMBIGUOUS_LATEST_CLOSURE", "Актуальная итоговая проверка определена неоднозначно.");
      identities.add(checked.closureId);
      return checked;
    });
    const latest = records.at(-1);
    if (!clean(source.latestClosureId, 180) || source.latestClosureId !== latest.closureId) fail("BROKEN_CLOSURE_HISTORY", "Актуальная итоговая проверка не согласована с историей.");
    return deepFreeze({ version: source.version, records: clone(records), latest });
  }

  function buildInitializationSnapshot(closureSource, metadata = {}) {
    const closure = closureApi().validateClosurePayload(closureSource, { projectId: metadata.projectIdentity }).closure;
    if (closure.lifecycle !== "completed") fail("CLOSURE_NOT_COMPLETED", "Итоговая проверка ещё не завершена.");
    const identity = clean(metadata.identity, 180);
    const createdAt = clean(metadata.createdAt, 40);
    if (!identity || !createdAt) fail("INITIALIZATION_METADATA_MISSING", "Не удалось создать идентификатор и время инициализации.");
    const details = closure.snapshot.details;
    const sourceReadiness = clean(closure.readiness?.status, 40);
    if (!['ready', 'conditionally-ready'].includes(sourceReadiness)) fail("CLOSURE_BLOCKED", "Итоговая проверка не готова к инициализации.");
    if (sourceReadiness === "conditionally-ready" && closure.acknowledged !== true) fail("ACKNOWLEDGEMENT_REQUIRED", "Допущения итоговой проверки не подтверждены.");
    const assumptions = normalizeAssumptions(closure.assumptions);
    const warnings = normalizeIssues(closure.validation?.warnings || closure.readiness?.warnings);
    const snapshot = {
      format: { name: FORMAT, version: VERSION },
      project: { identity: closure.projectId },
      initialization: { identity },
      source: {
        closureIdentity: closure.closureId,
        closureFingerprint: closure.recordFingerprint,
        snapshotFingerprint: closure.snapshotFingerprint,
        completedAt: clean(closure.audit?.completedAt, 40),
        readiness: sourceReadiness,
        assumptionsAcknowledged: closure.acknowledged === true,
        supersession: {
          previousClosureIdentity: clean(closure.supersession?.previousClosureId, 180) || null,
          supersedesClosureIdentity: clean(closure.supersession?.supersedesClosureId, 180) || null,
        },
      },
      garment: {
        type: clean(closure.snapshot.garmentType, 180),
        sizeMode: clean(details?.sizeMode, 40),
        standardSize: clean(details?.standardSize, 80) || null,
        recipient: clean(details?.recipient, 80),
        fit: clean(details?.fit, 80),
      },
      measurements: {
        body: normalizeMeasurements(details?.bodyMeasurements, BODY_FIELDS),
        garment: normalizeMeasurements(details?.garmentMeasurements, GARMENT_FIELDS),
      },
      validation: {
        warningCount: warnings.length,
        noticeCount: Array.isArray(closure.validation?.notices) ? closure.validation.notices.length : 0,
        missingRecommendedCount: Array.isArray(closure.missingRecommended) ? closure.missingRecommended.length : 0,
        notices: normalizeIssues(closure.validation?.notices),
        missingRecommended: normalizeIssues((closure.missingRecommended || []).map((item) => ({ ...item, message: item.label }))),
      },
      assumptions,
      warnings,
      provenance: normalizeProvenance(closure.provenance),
      collaboration: normalizeCollaboration(closure.collaboration),
      audit: {
        createdAt,
        createdBy: clean(metadata.createdBy, 120) || "Владелец проекта",
        sourceHistoryVersion: closureApi().HISTORY_VERSION,
      },
    };
    validateInitializationSnapshot(snapshot, { projectIdentity: closure.projectId, identity });
    return deepFreeze(snapshot);
  }

  function validateInitializationSnapshot(source, options = {}) {
    if (!record(source)) fail("MALFORMED_INITIALIZATION_SNAPSHOT", "Основа проекта повреждена.");
    const unknown = Object.keys(source).filter((key) => !SNAPSHOT_KEYS.includes(key));
    if (unknown.length || SNAPSHOT_KEYS.some((key) => !(key in source))) fail("INITIALIZATION_SNAPSHOT_NOT_ALLOWLISTED", "Основа проекта содержит неподдерживаемые сведения.", { paths: unknown });
    if (source.format?.name !== FORMAT || source.format?.version !== VERSION) fail("UNSUPPORTED_INITIALIZATION_VERSION", "Версия основы проекта не поддерживается.");
    if (!clean(source.project?.identity, 180) || options.projectIdentity && source.project.identity !== options.projectIdentity) fail("PROJECT_ID_MISMATCH", "Основа относится к другому проекту.");
    if (!clean(source.initialization?.identity, 180) || options.identity && source.initialization.identity !== options.identity) fail("INITIALIZATION_IDENTITY_MISMATCH", "Идентификатор основы проекта повреждён.");
    if (!clean(source.source?.closureIdentity, 180) || !clean(source.source?.closureFingerprint, 180) || !clean(source.source?.completedAt, 40)) fail("SOURCE_CLOSURE_IDENTITY_MISSING", "Связь с итоговой проверкой повреждена.");
    if (!['ready', 'conditionally-ready'].includes(source.source.readiness)) fail("SOURCE_READINESS_INVALID", "Готовность итоговой проверки повреждена.");
    if (source.source.readiness === "conditionally-ready" && source.source.assumptionsAcknowledged !== true) fail("ACKNOWLEDGEMENT_REQUIRED", "Допущения итоговой проверки не подтверждены.");
    if (!clean(source.garment?.type, 180) || !clean(source.garment?.sizeMode, 40) || !clean(source.garment?.recipient, 80)) fail("INITIALIZATION_REQUIRED_FIELD_MISSING", "В подтверждённых сведениях не хватает данных для основы проекта.");
    if (source.garment.sizeMode === "standard" && !clean(source.garment.standardSize, 80)) fail("INITIALIZATION_REQUIRED_FIELD_MISSING", "Не указан подтверждённый стандартный размер.");
    if (!record(source.measurements) || !record(source.validation) || !Array.isArray(source.assumptions) || !Array.isArray(source.warnings) || !Array.isArray(source.provenance) || !record(source.collaboration) || !record(source.audit)) fail("MALFORMED_INITIALIZATION_SNAPSHOT", "Основа проекта неполна.");
    return { valid: true, snapshot: deepFreeze(clone(source)) };
  }

  function recordFingerprintInput(source) {
    const value = clone(source);
    if (record(value.integrity)) delete value.integrity.recordFingerprint;
    return value;
  }

  function validateInitializationRecord(source, options = {}) {
    const value = typeof source === "string" ? (() => { try { return JSON.parse(source); } catch { fail("MALFORMED_INITIALIZATION", "Запись основы проекта повреждена."); } })() : clone(source);
    if (!record(value) || value.format !== FORMAT || value.kind !== KIND) fail("MALFORMED_INITIALIZATION", "Запись основы проекта повреждена.");
    if (value.version !== VERSION) fail("UNSUPPORTED_INITIALIZATION_VERSION", "Версия основы проекта не поддерживается.");
    if (!clean(value.identity, 180) || !clean(value.project_identity, 180)) fail("INITIALIZATION_IDENTITY_MISSING", "Идентификатор основы проекта повреждён.");
    if (options.projectIdentity && value.project_identity !== options.projectIdentity) fail("PROJECT_ID_MISMATCH", "Основа относится к другому проекту.");
    if (!LIFECYCLES.includes(value.lifecycle) || !VERDICTS.includes(value.verdict)) fail("INITIALIZATION_LIFECYCLE_INVALID", "Состояние основы проекта повреждено.");
    validateInitializationSnapshot(value.snapshot, { projectIdentity: value.project_identity, identity: value.identity });
    if (value.source_closure_identity !== value.snapshot.source.closureIdentity || value.source_closure_fingerprint !== value.snapshot.source.closureFingerprint || value.source_closure_completed_at !== value.snapshot.source.completedAt) fail("SOURCE_CLOSURE_IDENTITY_MISMATCH", "Связь основы с итоговой проверкой повреждена.");
    if (value.snapshot_fingerprint !== fingerprint(value.snapshot)) fail("INITIALIZATION_SNAPSHOT_FINGERPRINT_MISMATCH", "Контрольная сумма основы проекта не совпадает.");
    if (!clean(value.created_at, 40) || value.created_at !== value.snapshot.audit.createdAt) fail("INITIALIZATION_TIME_INVALID", "Время создания основы проекта повреждено.");
    if (value.lifecycle === "draft" && (value.reviewed_at || value.initialized_at)) fail("INITIALIZATION_LIFECYCLE_INVALID", "Черновик содержит недопустимые даты переходов.");
    if (value.lifecycle === "reviewing" && (!clean(value.reviewed_at, 40) || value.initialized_at)) fail("INITIALIZATION_LIFECYCLE_INVALID", "Проверка основы содержит недопустимые даты переходов.");
    if (value.lifecycle === "ready" && (!clean(value.reviewed_at, 40) || value.initialized_at)) fail("INITIALIZATION_LIFECYCLE_INVALID", "Готовая основа содержит недопустимые даты переходов.");
    if (value.lifecycle === "initialized" && (!clean(value.reviewed_at, 40) || !clean(value.initialized_at, 40))) fail("INITIALIZATION_LIFECYCLE_INVALID", "Инициализированная основа не содержит обязательные даты.");
    if (!record(value.integrity)) fail("INITIALIZATION_INTEGRITY_MISSING", "Метаданные целостности основы отсутствуют.");
    if (!options.allowUntrusted && value.integrity.importedUnproven) fail("IMPORTED_UNPROVEN", "Происхождение импортированной основы не доказано.");
    if (!options.allowUntrusted && value.integrity.quarantined) fail("QUARANTINED", "Основа проекта помещена в карантин.");
    if (!options.allowUntrusted && value.integrity.collision) fail("INITIALIZATION_COLLISION", "Обнаружена коллизия основы проекта.");
    if (value.integrity.recordFingerprint !== fingerprint(recordFingerprintInput(value))) fail("INITIALIZATION_RECORD_FINGERPRINT_MISMATCH", "Контрольная сумма записи основы проекта не совпадает.");
    return { valid: true, trusted: !value.integrity.importedUnproven && !value.integrity.quarantined && !value.integrity.collision, record: deepFreeze(value) };
  }

  function withRecordFingerprint(value) {
    value.integrity.recordFingerprint = fingerprint(recordFingerprintInput(value));
    return deepFreeze(value);
  }

  function buildInitializationDraft(input = {}, metadata = {}) {
    const assessment = assessInitialization({ ...input, identity: metadata.identity, createdAt: metadata.createdAt, createdBy: metadata.createdBy });
    if (assessment.sourceVerdict !== "ready" || !assessment.canCreate) fail(assessment.reasons[0]?.code || "INITIALIZATION_BLOCKED", assessment.reasons[0]?.message || "Основа проекта пока не может быть создана.");
    const snapshot = assessment.candidateSnapshot;
    const value = {
      format: FORMAT,
      version: VERSION,
      kind: KIND,
      identity: snapshot.initialization.identity,
      project_identity: snapshot.project.identity,
      source_closure_identity: snapshot.source.closureIdentity,
      source_closure_fingerprint: snapshot.source.closureFingerprint,
      source_closure_completed_at: snapshot.source.completedAt,
      lifecycle: "draft",
      verdict: "ready",
      snapshot,
      snapshot_fingerprint: fingerprint(snapshot),
      created_at: snapshot.audit.createdAt,
      reviewed_at: null,
      initialized_at: null,
      audit: { createdBy: snapshot.audit.createdBy, historyVersion: HISTORY_VERSION },
      integrity: { importedUnproven: false, quarantined: false, collision: false, recordFingerprint: "" },
      supersession: { supersedes: assessment.latestInitialization?.identity || null },
    };
    return withRecordFingerprint(value);
  }

  function transitionInitialization(source, target, metadata = {}) {
    const checked = validateInitializationRecord(source).record;
    if (checked.lifecycle === "initialized") fail("INITIALIZED_RECORD_IMMUTABLE", "Инициализированную основу проекта нельзя изменить.");
    const allowed = { draft: "reviewing", reviewing: "ready", ready: "initialized" };
    if (allowed[checked.lifecycle] !== target) fail("INITIALIZATION_LIFECYCLE_VIOLATION", "Переход состояния основы проекта недопустим.");
    const next = clone(checked);
    next.lifecycle = target;
    if (target === "reviewing") {
      next.reviewed_at = clean(metadata.reviewedAt, 40);
      if (!next.reviewed_at) fail("REVIEW_TIME_MISSING", "Не указано время проверки основы проекта.");
    }
    if (target === "initialized") {
      next.initialized_at = clean(metadata.initializedAt, 40);
      if (!next.initialized_at) fail("INITIALIZATION_TIME_MISSING", "Не указано время инициализации проекта.");
    }
    return withRecordFingerprint(next);
  }

  function startReviewing(source, metadata = {}) { return transitionInitialization(source, "reviewing", metadata); }
  function markReady(source, metadata = {}) { return transitionInitialization(source, "ready", metadata); }
  function initializeProject(source, metadata = {}) { return transitionInitialization(source, "initialized", metadata); }

  function normalizeHistory(source, options = {}) {
    if (source === null || source === undefined) return { format: HISTORY_FORMAT, version: HISTORY_VERSION, records: [], latestInitializationIdentity: null };
    if (!record(source) || source.format !== HISTORY_FORMAT || source.version !== HISTORY_VERSION || !Array.isArray(source.records)) fail("MALFORMED_INITIALIZATION_HISTORY", "История основ проекта повреждена.");
    const seen = new Set();
    const sources = new Set();
    const records = source.records.map((entry) => {
      const checked = validateInitializationRecord(entry, { allowUntrusted: options.allowUntrusted === true, projectIdentity: options.projectIdentity }).record;
      if (checked.lifecycle !== "initialized") fail("INITIALIZATION_HISTORY_NOT_TERMINAL", "В истории может храниться только завершённая основа проекта.");
      if (seen.has(checked.identity)) fail("INITIALIZATION_IDENTITY_COLLISION", "В истории повторяется идентификатор основы проекта.");
      if (sources.has(checked.source_closure_identity)) fail("SOURCE_INITIALIZATION_COLLISION", "Для одной итоговой проверки обнаружено несколько основ проекта.");
      seen.add(checked.identity);
      sources.add(checked.source_closure_identity);
      return clone(checked);
    });
    const latest = records.at(-1) || null;
    if ((latest?.identity || null) !== (clean(source.latestInitializationIdentity, 180) || null)) fail("MALFORMED_INITIALIZATION_HISTORY", "Актуальная основа не согласована с историей.");
    return { format: HISTORY_FORMAT, version: HISTORY_VERSION, records, latestInitializationIdentity: latest?.identity || null };
  }

  function appendInitialized(historySource, recordSource) {
    const history = normalizeHistory(historySource, { allowUntrusted: true });
    const value = validateInitializationRecord(recordSource).record;
    if (value.lifecycle !== "initialized") fail("INITIALIZATION_NOT_COMPLETED", "В историю можно добавить только инициализированную основу.");
    const sameIdentity = history.records.find((item) => item.identity === value.identity);
    if (sameIdentity) {
      if (!equal(sameIdentity, value)) fail("INITIALIZATION_IDENTITY_COLLISION", "Основа с таким идентификатором уже содержит другие сведения.");
      return deepFreeze(history);
    }
    const sameSource = history.records.find((item) => item.source_closure_identity === value.source_closure_identity);
    if (sameSource) {
      if (equal(sameSource, value)) return deepFreeze(history);
      fail("SOURCE_INITIALIZATION_COLLISION", "Для этой итоговой проверки основа проекта уже создана.");
    }
    history.records.push(clone(value));
    history.latestInitializationIdentity = value.identity;
    return deepFreeze(history);
  }

  function latestInitialization(historySource, options = {}) {
    const history = normalizeHistory(historySource, { allowUntrusted: options.allowUntrusted === true, projectIdentity: options.projectIdentity });
    return history.records.length ? deepFreeze(clone(history.records.at(-1))) : null;
  }

  function meaningfulSnapshot(source) {
    if (!record(source)) return null;
    return clone({ garment: source.garment, measurements: source.measurements, validation: source.validation, assumptions: source.assumptions, warnings: source.warnings, provenance: source.provenance, collaboration: source.collaboration });
  }

  function changedFields(previousSource, currentSource) {
    const previous = meaningfulSnapshot(previousSource);
    const current = meaningfulSnapshot(currentSource);
    const changes = [];
    const labels = { type: "Тип изделия", sizeMode: "Режим размера", standardSize: "Размер", recipient: "Получатель", fit: "Посадка" };
    function walk(left, right, path) {
      if (equal(left, right)) return;
      if (record(left) && record(right)) {
        [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().forEach((key) => walk(left[key], right[key], path ? `${path}.${key}` : key));
        return;
      }
      const field = path.split(".").at(-1);
      const experience = globalObject.YarnAIProjectDetailsExperience;
      changes.push({ path, label: labels[field] || experience?.FIELD_CATALOG?.[field]?.label || "Сведения проекта", before: clone(left), after: clone(right) });
    }
    walk(previous, current, "");
    return deepFreeze(changes.filter((item) => !item.path.startsWith("validation") && !item.path.startsWith("provenance")));
  }

  function assessmentFailure(error, fallback = "INITIALIZATION_BLOCKED") {
    return deepFreeze({ verdict: "blocked", sourceVerdict: "blocked", canCreate: false, canContinue: false, current: false, existing: null, latestInitialization: null, sourceClosure: null, candidateSnapshot: null, destination: validDestination(null), changes: [], reasons: [{ code: error?.code || fallback, message: error?.userMessage || "Основа проекта пока недоступна." }] });
  }

  function assessInitialization(input = {}) {
    try {
      const projectIdentity = clean(input.projectIdentity || input.liveInput?.projectId, 180);
      if (!projectIdentity) fail("PROJECT_ID_MISSING", "Проект не найден.");
      const history = validateClosureHistory(input.closureHistory, projectIdentity);
      const closure = input.sourceClosureIdentity
        ? history.records.find((item) => item.closureId === input.sourceClosureIdentity)
        : history.latest;
      if (!closure) fail("COMPLETED_CLOSURE_MISSING", "Сначала завершите итоговую проверку сведений о проекте.");
      if (closure.closureId !== history.latest.closureId) {
        return deepFreeze({ ...assessmentFailure(new ProjectInitializationError("SOURCE_CLOSURE_SUPERSEDED", "Выбранная итоговая проверка устарела.")), verdict: "stale", sourceVerdict: "stale", sourceClosure: closure });
      }
      if (closure.lifecycle !== "completed") fail("CLOSURE_NOT_COMPLETED", "Сначала завершите итоговую проверку сведений о проекте.");
      const destination = validDestination(input.nextDestination || input.liveInput?.nextDestination);
      if (!destination.enabled) fail("INVALID_NEXT_DESTINATION", "Следующее безопасное действие пока не подключено.");
      const live = closureApi().evaluateStoredClosure(closure, { ...input.liveInput, projectId: projectIdentity });
      if (!live.valid) fail(live.error?.code || "MALFORMED_CLOSURE", live.error?.message || "Итоговая проверка повреждена.");
      if (!live.current || live.stale) {
        return deepFreeze({ verdict: "stale", sourceVerdict: "stale", canCreate: false, canContinue: false, current: false, existing: null, latestInitialization: null, sourceClosure: closure, candidateSnapshot: null, destination, changes: live.comparison?.changes || [], reasons: [{ code: "LIVE_SNAPSHOT_STALE", message: "Сведения проекта изменились. Сначала повторите итоговую проверку." }] });
      }
      if (!['ready', 'conditionally-ready'].includes(closure.readiness?.status)) fail("CLOSURE_BLOCKED", "Итоговая проверка заблокирована.");
      if (closure.readiness.status === "conditionally-ready" && closure.acknowledged !== true) fail("ACKNOWLEDGEMENT_REQUIRED", "Подтвердите допущения итоговой проверки.");
      const candidateIdentity = clean(input.identity, 180) || "pending-initialization";
      const candidateCreatedAt = clean(input.createdAt, 40) || closure.audit.completedAt;
      const candidateSnapshot = buildInitializationSnapshot(closure, { projectIdentity, identity: candidateIdentity, createdAt: candidateCreatedAt, createdBy: input.createdBy });
      const initHistory = normalizeHistory(input.initializationHistory, { allowUntrusted: true });
      const latest = initHistory.records.at(-1) || null;
      if (latest) validateInitializationRecord(latest);
      const existing = initHistory.records.find((item) => item.source_closure_identity === closure.closureId) || null;
      if (existing) {
        const same = existing.source_closure_fingerprint === closure.recordFingerprint && equal(meaningfulSnapshot(existing.snapshot), meaningfulSnapshot(candidateSnapshot));
        if (!same) fail("SOURCE_INITIALIZATION_COLLISION", "Сохранённая основа для этой проверки не совпадает с подтверждёнными сведениями.");
        return deepFreeze({ verdict: "ready", sourceVerdict: "ready", canCreate: false, canContinue: existing.lifecycle === "initialized", current: true, existing, latestInitialization: latest, sourceClosure: closure, candidateSnapshot, destination, changes: [], reasons: [] });
      }
      if (latest) {
        return deepFreeze({ verdict: "stale", sourceVerdict: "ready", canCreate: true, canContinue: false, current: false, existing: null, latestInitialization: latest, sourceClosure: closure, candidateSnapshot, destination, changes: changedFields(latest.snapshot, candidateSnapshot), reasons: [{ code: "INITIALIZATION_STALE", message: "Подтверждённые сведения изменились. Создайте новую основу проекта." }] });
      }
      return deepFreeze({ verdict: "ready", sourceVerdict: "ready", canCreate: true, canContinue: false, current: false, existing: null, latestInitialization: null, sourceClosure: closure, candidateSnapshot, destination, changes: [], reasons: [] });
    } catch (error) {
      return assessmentFailure(error);
    }
  }

  function validateContinue(input = {}) {
    const assessment = assessInitialization(input);
    if (assessment.verdict !== "ready" || !assessment.current || !assessment.existing || !assessment.canContinue) fail(assessment.reasons[0]?.code || "CONTINUE_BLOCKED", assessment.reasons[0]?.message || "Продолжение заблокировано.");
    const checked = validateInitializationRecord(assessment.existing, { projectIdentity: input.projectIdentity || input.liveInput?.projectId }).record;
    if (checked.lifecycle !== "initialized") fail("INITIALIZATION_NOT_COMPLETED", "Основа проекта ещё не создана.");
    if (!assessment.destination.enabled) fail("INVALID_NEXT_DESTINATION", "Следующее безопасное действие пока не подключено.");
    return deepFreeze({ allowed: true, destination: assessment.destination, initialization: checked });
  }

  function makeImportedUnproven(source, metadata = {}) {
    const value = clone(validateInitializationRecord(source, { allowUntrusted: true }).record);
    value.integrity.importedUnproven = true;
    value.audit.importedAt = clean(metadata.importedAt, 40) || null;
    value.audit.importedFromProjectIdentity = clean(metadata.sourceProjectIdentity, 180) || value.project_identity;
    return withRecordFingerprint(value);
  }

  function remapInitialization(source, referenceMap, metadata = {}) {
    const value = clone(validateInitializationRecord(source, { allowUntrusted: true }).record);
    const map = referenceMap instanceof Map ? referenceMap : new Map(Object.entries(record(referenceMap) ? referenceMap : {}));
    const mapValue = (current) => map.get(current) || current;
    value.identity = clean(metadata.identity, 180) || mapValue(value.identity);
    value.project_identity = mapValue(value.project_identity);
    value.source_closure_identity = mapValue(value.source_closure_identity);
    value.snapshot.project.identity = value.project_identity;
    value.snapshot.initialization.identity = value.identity;
    value.snapshot.source.closureIdentity = value.source_closure_identity;
    value.snapshot_fingerprint = fingerprint(value.snapshot);
    value.integrity.importedUnproven = true;
    value.integrity.collision = metadata.collision === true;
    value.audit.importedAt = clean(metadata.importedAt, 40) || null;
    return withRecordFingerprint(value);
  }

  function importInitializationHistory(source, options = {}) {
    const history = normalizeHistory(source, { allowUntrusted: true });
    const map = options.referenceMap instanceof Map ? options.referenceMap : new Map([[options.sourceProjectIdentity, options.projectIdentity]].filter(([left, right]) => left && right));
    const records = history.records.map((entry, index) => remapInitialization(entry, map, {
      identity: typeof options.identityProvider === "function" ? options.identityProvider(entry, index) : undefined,
      importedAt: options.importedAt,
      collision: options.collision,
    }));
    return deepFreeze({ format: HISTORY_FORMAT, version: HISTORY_VERSION, records, latestInitializationIdentity: records.at(-1)?.identity || null });
  }

  const api = Object.freeze({
    FORMAT, VERSION, KIND, HISTORY_FORMAT, HISTORY_VERSION, HISTORY_KEY, LIFECYCLES, VERDICTS, SNAPSHOT_KEYS,
    ProjectInitializationError, canonicalize, fingerprint, validDestination, validateClosureHistory,
    buildInitializationSnapshot, validateInitializationSnapshot, validateInitializationRecord,
    buildInitializationDraft, startReviewing, markReady, initializeProject, normalizeHistory,
    appendInitialized, latestInitialization, meaningfulSnapshot, changedFields, assessInitialization,
    validateContinue, makeImportedUnproven, remapInitialization, importInitializationHistory,
  });
  globalObject.YarnAIProjectInitialization = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
