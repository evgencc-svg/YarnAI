"use strict";

(function exposeProjectDetailsClosure(globalObject) {
  const VERSION = 1;
  const KIND = "PROJECT_DETAILS_CLOSURE";
  const HISTORY_VERSION = 1;
  const HISTORY_KEY = "project_details_closures";
  const LIFECYCLES = Object.freeze(["draft", "reviewing", "ready", "completed"]);
  const READINESS = Object.freeze(["ready", "conditionally-ready", "blocked"]);
  const DECISIONS = Object.freeze(["cannot_close", "requires_acknowledgement", "ready_to_close", "closed", "stale", "superseded"]);
  const SCALAR_FIELDS = Object.freeze(["sizeMode", "standardSize", "recipient", "fit"]);
  const BODY_FIELDS = Object.freeze(["bust", "waist", "hips", "shoulderWidth", "upperArm", "armholeDepth", "neck", "head", "footLength", "hand"]);
  const GARMENT_FIELDS = Object.freeze(["garmentWidth", "garmentLength", "sleeveLength", "necklineDepth"]);
  const DETAIL_FIELDS = new Set([...SCALAR_FIELDS, ...BODY_FIELDS, ...GARMENT_FIELDS]);
  const SNAPSHOT_KEYS = Object.freeze([
    "projectId", "garmentType", "details", "required", "missingRequired", "missingRecommended",
    "known", "validation", "assumptions", "provenance", "collaboration", "conflicts",
  ]);

  class ProjectDetailsClosureError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "ProjectDetailsClosureError";
      this.code = code;
      this.userMessage = message;
      this.details = details;
    }
  }

  function fail(code, message, details) {
    throw new ProjectDetailsClosureError(code, message, details);
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
    return value.replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function canonicalize(value) {
    const collaboration = globalObject.YarnAIProjectDetailsCollaboration;
    if (collaboration?.canonicalize) return collaboration.canonicalize(value);
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("INVALID_NUMBER", "Данные содержат недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("INVALID_VALUE", "Данные содержат неподдерживаемое значение.");
  }

  function fingerprint(value) {
    const collaboration = globalObject.YarnAIProjectDetailsCollaboration;
    if (collaboration?.fingerprint) return collaboration.fingerprint(value);
    const input = canonicalize(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
  }

  function equal(left, right) {
    return canonicalize(left) === canonicalize(right);
  }

  function stableObjects(values, keys = ["code", "path", "label"]) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map((value) => clone(value)).filter((value) => {
      const identity = keys.map((key) => clean(value?.[key], 1000)).join("|") || canonicalize(value);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).sort((left, right) => keys.map((key) => clean(left?.[key], 1000)).join("|").localeCompare(keys.map((key) => clean(right?.[key], 1000)).join("|")));
  }

  function normalizeDestination(value) {
    const href = clean(value?.href, 1400);
    const allowed = href === "#swatch-assistant" || /\/user-workspace-entry\?[^#]*#swatch-assistant$/.test(href) || href.startsWith("/calculator?");
    return {
      enabled: Boolean(value?.enabled && allowed),
      label: clean(value?.label, 120) || "Продолжить",
      href: allowed ? href : "",
      description: clean(value?.description, 500),
    };
  }

  function fieldPath(field) {
    if (SCALAR_FIELDS.includes(field)) return `details.${field}`;
    if (BODY_FIELDS.includes(field)) return `details.bodyMeasurements.${field}`;
    if (GARMENT_FIELDS.includes(field)) return `details.garmentMeasurements.${field}`;
    return "";
  }

  function fieldValue(details, field) {
    if (SCALAR_FIELDS.includes(field)) return details[field] || null;
    return details.bodyMeasurements?.[field] || details.garmentMeasurements?.[field] || null;
  }

  function pathValue(details, path) {
    const field = clean(path, 300).split(".").at(-1);
    const value = fieldValue(details, field);
    return record(value) && "value" in value ? value.value : value;
  }

  function unknownDetailPaths(source) {
    const issues = [];
    if (!record(source)) return issues;
    for (const group of ["bodyMeasurements", "garmentMeasurements"]) {
      if (!record(source[group])) continue;
      Object.keys(source[group]).forEach((field) => {
        const supported = group === "bodyMeasurements" ? BODY_FIELDS.includes(field) : GARMENT_FIELDS.includes(field);
        if (!supported) issues.push({ code: "unknown_snapshot_path", path: `details.${group}.${field}`, message: "Обнаружено неподдерживаемое поле мерки." });
      });
    }
    if (record(source.provenance)) Object.keys(source.provenance).forEach((field) => {
      if (!SCALAR_FIELDS.includes(field)) issues.push({ code: "unknown_provenance_path", path: `details.provenance.${field}`, message: "Происхождение ссылается на неизвестное поле." });
    });
    return issues;
  }

  function normalizeCollaboration(details, state, projectId) {
    const source = record(state) ? state : {};
    const byPath = record(source.provenance?.byPath) ? source.provenance.byPath : {};
    const requests = record(source.requests) ? source.requests : {};
    const responses = record(source.responses) ? source.responses : {};
    const reviews = record(source.reviews) ? source.reviews : {};
    const applied = [];
    const integrityErrors = [];
    Object.keys(byPath).sort().forEach((path) => {
      const entry = byPath[path];
      const field = path.split(".").at(-1);
      if (!DETAIL_FIELDS.has(field) || !fieldPath(field) || fieldPath(field) !== path) {
        integrityErrors.push({ code: "collaboration_unknown_path", path, message: "Принятое изменение ссылается на неизвестное поле." });
        return;
      }
      const request = requests[entry?.requestId];
      const response = responses[entry?.responseId];
      const review = reviews[entry?.responseId];
      const proposal = Array.isArray(response?.proposals) ? response.proposals.find((item) => item?.path === path) : null;
      const valid = entry?.source === "collaboration_response" && request && response && proposal &&
        request.projectId === projectId && response.projectId === projectId && response.requestId === request.requestId &&
        review?.decisions?.[path] === "accepted" && equal(proposal.value, pathValue(details, path));
      if (!valid) {
        integrityErrors.push({ code: "collaboration_provenance_broken", path, message: "Не удалось доказать связь принятого значения с проверенным ответом помощника." });
        return;
      }
      applied.push({
        path,
        requestId: clean(entry.requestId, 180),
        responseId: clean(entry.responseId, 180),
        helperLabel: clean(entry.helperLabel || response.helper?.label, 120) || "Помощник",
        acceptedAt: clean(entry.acceptedAt, 40),
        value: clone(proposal.value),
      });
    });
    return {
      summary: {
        applied,
        appliedCount: applied.length,
        requestIds: [...new Set(applied.map((item) => item.requestId))].sort(),
        responseIds: [...new Set(applied.map((item) => item.responseId))].sort(),
      },
      integrityErrors: stableObjects(integrityErrors),
    };
  }

  function normalizeProvenance(details, collaborationSummary, experience) {
    const collaborationByPath = new Map(collaborationSummary.applied.map((item) => [item.path, item]));
    const rows = [];
    const add = (field, source) => {
      const value = fieldValue(details, field);
      if (!value) return;
      const path = fieldPath(field);
      const collaboration = collaborationByPath.get(path) || null;
      rows.push({
        path,
        label: experience.FIELD_CATALOG[field]?.label || field,
        source: collaboration ? "collaboration_response" : clean(source, 120) || "project_description",
        sourceLabel: collaboration ? `Принято от помощника: ${collaboration.helperLabel}` : experience.sourceLabel(source),
        collaboration: collaboration ? { requestId: collaboration.requestId, responseId: collaboration.responseId } : null,
      });
    };
    SCALAR_FIELDS.forEach((field) => add(field, details.provenance?.[field]));
    BODY_FIELDS.forEach((field) => add(field, details.bodyMeasurements?.[field]?.provenance));
    GARMENT_FIELDS.forEach((field) => add(field, details.garmentMeasurements?.[field]?.provenance));
    return stableObjects(rows, ["path"]);
  }

  function normalizeAssumptions(input = {}) {
    const values = Array.isArray(input) ? input : [];
    return stableObjects(values.map((item) => typeof item === "string"
      ? { code: `assumption:${fingerprint(item)}`, label: clean(item, 600), path: "" }
      : { code: clean(item?.code, 180) || `assumption:${fingerprint(item)}`, label: clean(item?.label || item?.message, 600), path: clean(item?.path, 300) }
    ).filter((item) => item.label), ["code", "path"]);
  }

  function consistencyChecks(details, experience) {
    const blockingErrors = unknownDetailPaths(details);
    const warnings = [];
    const notices = [];
    const modeConflict = experience.detectModeConflict(details);
    if (modeConflict.active) blockingErrors.push({ code: "size_mode_conflict", path: "details.sizeMode", message: modeConflict.message });
    else if (details.standardSize && Object.keys(details.bodyMeasurements || {}).length) warnings.push({ code: "standard_custom_values_coexist", path: "details.sizeMode", message: modeConflict.message || "В проекте сохранены и стандартный размер, и собственные мерки; используется явно выбранный режим." });
    const bust = details.bodyMeasurements?.bust?.value;
    const width = details.garmentMeasurements?.garmentWidth?.value;
    if (Number.isFinite(bust) && Number.isFinite(width)) {
      const finishedCircumference = width * 2;
      if (finishedCircumference < bust * 0.5) blockingErrors.push({ code: "impossible_finished_width", path: "details.garmentMeasurements.garmentWidth", message: "Ширина готового изделия несовместима с указанным обхватом груди." });
      else if (["regular", "relaxed", "oversized"].includes(details.fit) && finishedCircumference < bust) warnings.push({ code: "positive_fit_width_warning", path: "details.garmentMeasurements.garmentWidth", message: "Готовое изделие уже мерки тела при выбранной свободной посадке. Проверь ширину." });
      else notices.push({ code: "body_finished_width_compared", path: "details.garmentMeasurements.garmentWidth", message: "Обхват груди сопоставлен с шириной готового изделия." });
    }
    if (record(details.provenance)) Object.keys(details.provenance).forEach((field) => {
      if (SCALAR_FIELDS.includes(field) && !fieldValue(details, field)) blockingErrors.push({ code: "orphaned_provenance", path: `details.${field}`, message: "Происхождение указано для отсутствующего значения." });
    });
    return {
      blockingErrors: stableObjects(blockingErrors),
      warnings: stableObjects(warnings),
      notices: stableObjects(notices),
    };
  }

  function buildProjectDetailsSnapshot(input = {}) {
    const experience = globalObject.YarnAIProjectDetailsExperience;
    if (!experience) fail("DETAILS_API_MISSING", "Модуль параметров проекта недоступен.");
    const projectId = clean(input.projectId, 180);
    if (!projectId) fail("PROJECT_ID_MISSING", "Проект не найден.");
    const rawDetails = record(input.details) ? input.details : {};
    const details = experience.normalizeProjectDetails(rawDetails);
    const context = { details, garmentType: input.garmentType, technology: input.technology, intent: input.intent };
    const required = experience.requiredFields(context).map((item) => ({ field: item.field, path: fieldPath(item.field), label: item.label, present: Boolean(item.value) }));
    const visible = experience.visibleFields(context);
    const missingRequired = required.filter((item) => !item.present).map(({ field, path, label }) => ({ field, path, label }));
    const requiredFields = new Set(required.map((item) => item.field));
    const missingRecommended = visible.filter((item) => !requiredFields.has(item.field) && !item.value).map((item) => ({ field: item.field, path: fieldPath(item.field), label: item.label }));
    const validationErrors = [];
    const validationWarnings = [];
    visible.forEach((item) => {
      if (!item.value) return;
      const value = record(item.value) ? item.value.value : item.value;
      const result = experience.validateField(item.field, value);
      if (!result.valid) validationErrors.push({ code: "invalid_value", path: fieldPath(item.field), message: result.error, label: item.label });
      else if (result.warning) validationWarnings.push({ code: "unusual_value", path: fieldPath(item.field), message: result.warning, label: item.label });
    });
    (Array.isArray(input.validationErrors) ? input.validationErrors : []).forEach((item) => validationErrors.push(item));
    (Array.isArray(input.validationWarnings) ? input.validationWarnings : []).forEach((item) => validationWarnings.push(item));
    const collaboration = normalizeCollaboration(details, input.collaborationState, projectId);
    const consistency = consistencyChecks(rawDetails, experience);
    consistency.blockingErrors.push(...collaboration.integrityErrors);
    const provenance = normalizeProvenance(details, collaboration.summary, experience);
    const assumptions = [];
    if (details.sizeMode === "standard") assumptions.push({ code: "standard_size_assumption", path: "details.standardSize", label: "Для расчёта используется стандартный размер вместо полного набора собственных мерок." });
    missingRecommended.forEach((item) => assumptions.push({ code: `recommended_missing:${item.field}`, path: item.path, label: `Рекомендуемое значение «${item.label}» пока не указано.` }));
    collaboration.summary.applied.forEach((item) => assumptions.push({ code: `collaboration_value:${item.path}`, path: item.path, label: `Значение «${experience.FIELD_CATALOG[item.path.split(".").at(-1)]?.label || item.path}» принято от помощника ${item.helperLabel}.` }));
    assumptions.push(...(Array.isArray(input.assumptions) ? input.assumptions : []));
    const snapshot = {
      projectId,
      garmentType: clean(input.garmentType, 180) || "изделие",
      details,
      required,
      missingRequired,
      missingRecommended,
      known: experience.knownSummary(context).map((item) => ({ label: clean(item.label), value: clean(item.value), source: clean(item.source) })),
      validation: {
        blockingErrors: stableObjects([...validationErrors, ...consistency.blockingErrors]),
        warnings: stableObjects([...validationWarnings, ...consistency.warnings]),
        notices: consistency.notices,
      },
      assumptions: normalizeAssumptions(assumptions),
      provenance,
      collaboration: collaboration.summary,
      conflicts: stableObjects(input.conflicts),
    };
    return deepFreeze(snapshot);
  }

  function validateSnapshot(snapshot, options = {}) {
    if (!record(snapshot)) fail("MALFORMED_SNAPSHOT", "Снимок данных проекта повреждён.");
    const unknown = Object.keys(snapshot).filter((key) => !SNAPSHOT_KEYS.includes(key));
    if (unknown.length) fail("UNKNOWN_SNAPSHOT_PATH", "Снимок содержит неподдерживаемые поля.", { paths: unknown });
    if (!clean(snapshot.projectId, 180) || options.projectId && snapshot.projectId !== options.projectId) fail("PROJECT_ID_MISMATCH", "Снимок относится к другому проекту.");
    if (!record(snapshot.details) || !Array.isArray(snapshot.required) || !Array.isArray(snapshot.missingRequired) || !record(snapshot.validation)) fail("MALFORMED_SNAPSHOT", "Снимок данных проекта неполон.");
    const expected = buildProjectDetailsSnapshot({
      projectId: snapshot.projectId,
      garmentType: snapshot.garmentType,
      details: snapshot.details,
      assumptions: snapshot.assumptions,
      collaborationState: {},
    });
    if (unknownDetailPaths(snapshot.details).length) fail("UNKNOWN_SNAPSHOT_PATH", "Снимок содержит неподдерживаемые поля мерок.");
    if (!equal(expected.details, snapshot.details)) fail("SNAPSHOT_NOT_CANONICAL", "Снимок данных проекта имеет нестабильную форму.");
    return { valid: true, snapshot: clone(snapshot) };
  }

  function computeReadiness(input = {}) {
    const snapshot = input.snapshot || buildProjectDetailsSnapshot(input);
    const blockingErrors = [...snapshot.validation.blockingErrors];
    if (snapshot.missingRequired.length) blockingErrors.push(...snapshot.missingRequired.map((item) => ({ code: "missing_required", path: item.path, label: item.label, message: `Не указано обязательное значение «${item.label}».` })));
    if (snapshot.conflicts.length) blockingErrors.push(...snapshot.conflicts.map((item) => ({ code: clean(item.code) || "unresolved_conflict", path: clean(item.path), message: clean(item.message) || "Остался неразрешённый конфликт." })));
    if (input.safe === false) blockingErrors.push({ code: "untrusted_project_state", path: "", message: "Связанные данные проекта не прошли проверку доверия." });
    const state = record(input.state) ? input.state : {};
    if (state.importedUnproven || state.imported_unproven) blockingErrors.push({ code: "imported_unproven", path: "", message: "Происхождение записи не доказано." });
    if (state.quarantined) blockingErrors.push({ code: "quarantined", path: "", message: "Запись помещена в карантин." });
    if (state.collided || state.collision) blockingErrors.push({ code: "collided", path: "", message: "Обнаружена коллизия identity." });
    const normalizedBlocking = stableObjects(blockingErrors);
    const warnings = stableObjects(snapshot.validation.warnings);
    const conditionallyReady = snapshot.missingRecommended.length > 0 || snapshot.assumptions.length > 0 || warnings.length > 0;
    const status = normalizedBlocking.length ? "blocked" : conditionallyReady ? "conditionally-ready" : "ready";
    return deepFreeze({
      status,
      blockingErrors: normalizedBlocking,
      warnings,
      notices: clone(snapshot.validation.notices),
      missingRequired: clone(snapshot.missingRequired),
      missingRecommended: clone(snapshot.missingRecommended),
      assumptions: clone(snapshot.assumptions),
      acknowledgementRequired: status === "conditionally-ready",
    });
  }

  function closureDecision(input = {}) {
    if (input.stale) return "stale";
    if (input.superseded) return "superseded";
    if (input.lifecycle === "completed") return "closed";
    if (input.readiness?.status === "blocked") return "cannot_close";
    if (input.readiness?.status === "conditionally-ready" && !input.acknowledged) return "requires_acknowledgement";
    return "ready_to_close";
  }

  function recordFingerprintInput(value) {
    const result = clone(value);
    delete result.recordFingerprint;
    return result;
  }

  function buildClosureDraft(input = {}, metadata = {}) {
    const snapshot = input.snapshot || buildProjectDetailsSnapshot(input);
    const readiness = input.readiness || computeReadiness({ snapshot, safe: input.safe, state: input.state });
    const closureId = clean(metadata.closureId, 180);
    const createdAt = clean(metadata.createdAt, 40);
    if (!closureId || !createdAt) fail("CLOSURE_METADATA_MISSING", "Не удалось создать identity завершения.");
    const snapshotFingerprint = fingerprint(snapshot);
    const closure = {
      kind: KIND,
      schemaVersion: VERSION,
      closureId,
      projectId: snapshot.projectId,
      sourceIdentity: fingerprint({ projectId: snapshot.projectId, snapshotFingerprint }),
      snapshot,
      snapshotFingerprint,
      readiness,
      validation: clone(snapshot.validation),
      missingRequired: clone(snapshot.missingRequired),
      missingRecommended: clone(snapshot.missingRecommended),
      assumptions: clone(snapshot.assumptions),
      provenance: clone(snapshot.provenance),
      collaboration: clone(snapshot.collaboration),
      conflicts: clone(snapshot.conflicts),
      decision: closureDecision({ readiness, lifecycle: "draft" }),
      lifecycle: "draft",
      status: "draft",
      acknowledged: false,
      audit: { createdAt, createdBy: clean(metadata.createdBy, 120) || "Владелец проекта", reviewedAt: null, completedAt: null },
      supersession: { previousClosureId: clean(metadata.previousClosureId, 180) || null, supersedesClosureId: clean(metadata.previousClosureId, 180) || null },
      state: { importedUnproven: false, quarantined: false, collided: false },
    };
    closure.recordFingerprint = fingerprint(recordFingerprintInput(closure));
    return deepFreeze(closure);
  }

  function transitionClosure(source, lifecycle, metadata = {}) {
    const checked = validateClosurePayload(source).closure;
    if (checked.lifecycle === "completed") fail("COMPLETED_CLOSURE_IMMUTABLE", "Завершённую запись нельзя изменить.");
    const allowed = { draft: ["reviewing"], reviewing: ["ready", "completed"], ready: ["completed"] };
    if (!allowed[checked.lifecycle]?.includes(lifecycle)) fail("LIFECYCLE_VIOLATION", "Переход closure lifecycle недопустим.");
    const next = clone(checked);
    next.lifecycle = lifecycle;
    next.status = lifecycle;
    if (lifecycle === "reviewing") next.audit.reviewedAt = clean(metadata.reviewedAt, 40);
    if (metadata.acknowledged !== undefined) next.acknowledged = metadata.acknowledged === true;
    if (lifecycle === "completed") {
      const readiness = computeReadiness({ snapshot: next.snapshot, safe: true, state: next.state });
      if (readiness.status === "blocked") fail("CLOSURE_BLOCKED", "Обязательные данные или ошибки не позволяют завершить проверку.");
      if (readiness.acknowledgementRequired && !next.acknowledged) fail("ACKNOWLEDGEMENT_REQUIRED", "Подтверди перечисленные допущения.");
      next.readiness = readiness;
      next.decision = "closed";
      next.audit.completedAt = clean(metadata.completedAt, 40);
      if (!next.audit.completedAt) fail("COMPLETION_TIME_MISSING", "Время подтверждения не указано.");
    } else next.decision = closureDecision({ readiness: next.readiness, lifecycle, acknowledged: next.acknowledged });
    next.recordFingerprint = fingerprint(recordFingerprintInput(next));
    return deepFreeze(next);
  }

  function startReviewing(source, metadata = {}) {
    return transitionClosure(source, "reviewing", metadata);
  }

  function markReady(source, metadata = {}) {
    return transitionClosure(source, "ready", metadata);
  }

  function completeClosure(source, metadata = {}) {
    return transitionClosure(source, "completed", metadata);
  }

  function validateClosurePayload(source, options = {}) {
    const closure = typeof source === "string" ? (() => { try { return JSON.parse(source); } catch { fail("MALFORMED_CLOSURE", "Запись завершения повреждена."); } })() : clone(source);
    if (!record(closure)) fail("MALFORMED_CLOSURE", "Запись завершения повреждена.");
    if (closure.kind !== KIND) fail("UNKNOWN_CLOSURE_KIND", "Тип записи завершения не поддерживается.");
    if (closure.schemaVersion !== VERSION) fail("UNSUPPORTED_CLOSURE_VERSION", "Версия записи завершения не поддерживается.");
    if (!clean(closure.closureId, 180) || !clean(closure.projectId, 180)) fail("CLOSURE_IDENTITY_MISSING", "Identity записи завершения повреждён.");
    if (options.projectId && closure.projectId !== options.projectId) fail("PROJECT_ID_MISMATCH", "Запись относится к другому проекту.");
    if (!LIFECYCLES.includes(closure.lifecycle) || closure.status !== closure.lifecycle) fail("LIFECYCLE_VIOLATION", "Lifecycle записи завершения повреждён.");
    if (closure.state?.importedUnproven) fail("IMPORTED_UNPROVEN", "Происхождение записи не доказано.");
    if (closure.state?.quarantined) fail("QUARANTINED", "Запись помещена в карантин.");
    if (closure.state?.collided) fail("COLLIDED", "Обнаружена коллизия identity.");
    validateSnapshot(closure.snapshot, { projectId: closure.projectId });
    const expectedSnapshotFingerprint = fingerprint(closure.snapshot);
    if (closure.snapshotFingerprint !== expectedSnapshotFingerprint) fail("SNAPSHOT_FINGERPRINT_MISMATCH", "Fingerprint снимка не совпадает.");
    if (closure.sourceIdentity !== fingerprint({ projectId: closure.projectId, snapshotFingerprint: expectedSnapshotFingerprint })) fail("SOURCE_IDENTITY_MISMATCH", "Source identity записи не совпадает со снимком.");
    if (!DECISIONS.includes(closure.decision)) fail("INVALID_CLOSURE_DECISION", "Решение closure повреждено.");
    const expectedDecision = closureDecision({ readiness: closure.readiness, lifecycle: closure.lifecycle, acknowledged: closure.acknowledged });
    if (closure.decision !== expectedDecision) fail("INVALID_CLOSURE_DECISION", "Сохранённое решение не выводится из данных записи.");
    if (closure.lifecycle === "completed") {
      const readiness = computeReadiness({ snapshot: closure.snapshot, safe: true, state: closure.state });
      if (readiness.status === "blocked") fail("COMPLETED_CLOSURE_BLOCKED", "Заблокированная запись не может быть завершённой.");
      if (readiness.acknowledgementRequired && !closure.acknowledged) fail("ACKNOWLEDGEMENT_REQUIRED", "Условная готовность не подтверждена.");
      if (!clean(closure.audit?.completedAt, 40)) fail("COMPLETION_TIME_MISSING", "Время подтверждения отсутствует.");
    }
    if (closure.recordFingerprint !== fingerprint(recordFingerprintInput(closure))) fail("CLOSURE_FINGERPRINT_MISMATCH", "Fingerprint записи завершения не совпадает.");
    return { valid: true, closure: deepFreeze(clone(closure)) };
  }

  function staleDiff(stored, live) {
    const changes = [];
    const derivedPaths = ["known", "required", "missingRequired", "missingRecommended", "validation", "assumptions", "provenance"];
    function walk(left, right, path) {
      if (equal(left, right)) return;
      if (record(left) && record(right)) {
        [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().forEach((key) => walk(left[key], right[key], path ? `${path}.${key}` : key));
        return;
      }
      changes.push({ path, before: clone(left), after: clone(right), label: humanPathLabel(path) });
    }
    walk(stored, live, "");
    return deepFreeze(changes.filter((change) => !derivedPaths.some((prefix) => change.path === prefix || change.path.startsWith(`${prefix}.`))));
  }

  function humanPathLabel(path) {
    const field = clean(path, 500).split(".").find((part) => DETAIL_FIELDS.has(part));
    const experience = globalObject.YarnAIProjectDetailsExperience;
    if (field) return experience?.FIELD_CATALOG?.[field]?.label || field;
    if (path === "garmentType") return "Тип изделия";
    if (path.startsWith("collaboration")) return "Принятые изменения помощника";
    if (path.startsWith("missing")) return "Полнота обязательных данных";
    if (path.startsWith("assumptions")) return "Допущения";
    return "Сведения проекта";
  }

  function compareSnapshots(stored, live) {
    const storedFingerprint = fingerprint(stored);
    const liveFingerprint = fingerprint(live);
    return deepFreeze({ current: storedFingerprint === liveFingerprint, storedFingerprint, liveFingerprint, changes: storedFingerprint === liveFingerprint ? [] : staleDiff(stored, live) });
  }

  function evaluateStoredClosure(source, liveInput = {}) {
    try {
      const closure = validateClosurePayload(source, { projectId: liveInput.projectId }).closure;
      const snapshot = liveInput.snapshot || buildProjectDetailsSnapshot(liveInput);
      const comparison = compareSnapshots(closure.snapshot, snapshot);
      const readiness = computeReadiness({ snapshot, safe: liveInput.safe, state: liveInput.state });
      const current = closure.lifecycle === "completed" && comparison.current && readiness.status !== "blocked";
      return deepFreeze({
        valid: true,
        current,
        stale: !comparison.current,
        decision: !comparison.current ? "stale" : closure.decision,
        canContinue: current,
        closure,
        liveSnapshot: snapshot,
        liveReadiness: readiness,
        comparison,
        error: null,
      });
    } catch (error) {
      return deepFreeze({ valid: false, current: false, stale: false, decision: "cannot_close", canContinue: false, closure: null, liveSnapshot: null, liveReadiness: null, comparison: null, error: { code: error?.code || "MALFORMED_CLOSURE", message: error?.userMessage || "Запись завершения не прошла проверку." } });
    }
  }

  function normalizeHistory(source) {
    const history = record(source) ? source : {};
    const records = Array.isArray(history.records) ? history.records.map((item) => clone(item)) : [];
    return { version: HISTORY_VERSION, records, latestClosureId: clean(history.latestClosureId, 180) || null };
  }

  function appendCompletedClosure(historySource, closureSource) {
    const history = normalizeHistory(historySource);
    const closure = validateClosurePayload(closureSource).closure;
    if (closure.lifecycle !== "completed") fail("CLOSURE_NOT_COMPLETED", "В историю можно добавить только завершённую запись.");
    const existing = history.records.find((item) => item?.closureId === closure.closureId);
    if (existing) {
      if (!equal(existing, closure)) fail("CLOSURE_IDENTITY_COLLISION", "Closure с таким identity уже существует с другим содержимым.");
      return deepFreeze(history);
    }
    history.records.push(clone(closure));
    history.latestClosureId = closure.closureId;
    return deepFreeze(history);
  }

  function latestClosure(historySource) {
    const history = normalizeHistory(historySource);
    if (!history.records.length) return null;
    const selected = history.records.find((item) => item?.closureId === history.latestClosureId) || history.records.at(-1);
    return selected ? deepFreeze(clone(selected)) : null;
  }

  function buildReviewSummary(input = {}) {
    const snapshot = input.snapshot || buildProjectDetailsSnapshot(input);
    const readiness = input.readiness || computeReadiness({ snapshot, safe: input.safe, state: input.state });
    const stored = input.latestClosure ? evaluateStoredClosure(input.latestClosure, { ...input, snapshot }) : null;
    return deepFreeze({
      readiness,
      snapshot,
      decision: stored?.current ? "closed" : closureDecision({ readiness }),
      previous: stored ? { valid: stored.valid, current: stored.current, stale: stored.stale, closureId: stored.closure?.closureId || null, completedAt: stored.closure?.audit?.completedAt || null, changes: stored.comparison?.changes || [], error: stored.error } : null,
      canConfirm: readiness.status !== "blocked" && !stored?.current && (!stored || stored.valid),
      acknowledgementRequired: readiness.acknowledgementRequired,
      canContinue: Boolean(stored?.canContinue),
      nextDestination: normalizeDestination(input.nextDestination),
    });
  }

  const api = Object.freeze({
    VERSION, KIND, HISTORY_VERSION, HISTORY_KEY, LIFECYCLES, READINESS, DECISIONS, SNAPSHOT_KEYS,
    ProjectDetailsClosureError, canonicalize, fingerprint, fieldPath, normalizeAssumptions,
    normalizeProvenance, normalizeCollaboration, consistencyChecks, buildProjectDetailsSnapshot,
    validateSnapshot, computeReadiness, closureDecision, buildClosureDraft, startReviewing, markReady,
    completeClosure, validateClosurePayload, staleDiff, compareSnapshots, evaluateStoredClosure,
    normalizeHistory, appendCompletedClosure, latestClosure, buildReviewSummary,
  });
  globalObject.YarnAIProjectDetailsClosure = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
