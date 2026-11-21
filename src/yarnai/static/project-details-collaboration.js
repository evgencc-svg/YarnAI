"use strict";

(function exposeProjectDetailsCollaboration(globalObject) {
  const VERSION = 1;
  const REQUEST_KIND = "YARNAI_PROJECT_DETAILS_COLLABORATION_REQUEST";
  const RESPONSE_KIND = "YARNAI_PROJECT_DETAILS_COLLABORATION_RESPONSE";
  const BODY_FIELDS = Object.freeze(["bust", "waist", "hips", "shoulderWidth", "upperArm", "armholeDepth", "neck", "head", "footLength", "hand"]);
  const GARMENT_FIELDS = Object.freeze(["garmentWidth", "garmentLength", "sleeveLength", "necklineDepth"]);
  const SCALAR_FIELDS = Object.freeze(["sizeMode", "standardSize", "recipient", "fit"]);
  const GROUPS = Object.freeze({
    recipient_information: Object.freeze({ label: "Общая информация о получателе", paths: Object.freeze(["details.recipient"]), editable: true }),
    standard_size: Object.freeze({ label: "Стандартный размер", paths: Object.freeze(["details.sizeMode", "details.standardSize"]), editable: true }),
    fit: Object.freeze({ label: "Посадка", paths: Object.freeze(["details.fit"]), editable: true }),
    body_measurements: Object.freeze({ label: "Мерки тела", paths: Object.freeze(BODY_FIELDS.map((field) => `details.bodyMeasurements.${field}`)), editable: true }),
    garment_measurements: Object.freeze({ label: "Мерки готового изделия", paths: Object.freeze(GARMENT_FIELDS.map((field) => `details.garmentMeasurements.${field}`)), editable: true }),
    garment_type: Object.freeze({ label: "Тип изделия", paths: Object.freeze(["context.garmentType"]), editable: false }),
    summary: Object.freeze({ label: "Сводка «известно / не хватает»", paths: Object.freeze(["context.summary"]), editable: false }),
  });
  const GROUP_ORDER = Object.freeze(Object.keys(GROUPS));
  const EDITABLE_PATHS = Object.freeze(GROUP_ORDER.flatMap((group) => GROUPS[group].editable ? GROUPS[group].paths : []));
  const READ_ONLY_PATHS = Object.freeze(GROUP_ORDER.flatMap((group) => GROUPS[group].editable ? [] : GROUPS[group].paths));
  const ALL_PATHS = new Set([...EDITABLE_PATHS, ...READ_ONLY_PATHS]);

  class CollaborationError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "CollaborationError";
      this.code = code;
      this.userMessage = message;
      this.details = details;
    }
  }

  function fail(code, message, details) {
    throw new CollaborationError(code, message, details);
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function clean(value, maximum = 300) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maximum);
  }

  function canonicalize(value) {
    const system = globalObject.YarnAIProjectSystem;
    if (system?.canonicalize) return system.canonicalize(value);
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("INVALID_NUMBER", "Данные содержат недопустимое число.");
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    fail("INVALID_VALUE", "Данные содержат неподдерживаемое значение.");
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

  function equal(left, right) {
    return canonicalize(left) === canonicalize(right);
  }

  function parsePackage(value, code = "MALFORMED_PACKAGE") {
    if (typeof value !== "string") return clone(value);
    try {
      return JSON.parse(value);
    } catch {
      fail(code, "Файл содержит некорректный JSON.");
    }
  }

  function normalizeEditableScope(groups) {
    if (!Array.isArray(groups)) return Object.freeze([]);
    const selected = new Set(groups.map((group) => clean(group, 80)).filter((group) => GROUPS[group]));
    return Object.freeze(GROUP_ORDER.filter((group) => selected.has(group)));
  }

  function pathsForGroups(groups, editableOnly = false) {
    return normalizeEditableScope(groups).flatMap((group) => editableOnly && !GROUPS[group].editable ? [] : GROUPS[group].paths);
  }

  function fieldForPath(path) {
    const parts = String(path || "").split(".");
    if (parts[0] !== "details") return "";
    return parts.at(-1) || "";
  }

  function valueAtPath(details, path) {
    const normalized = globalObject.YarnAIProjectDetailsExperience?.normalizeProjectDetails(details) || clone(details || {});
    const field = fieldForPath(path);
    if (SCALAR_FIELDS.includes(field)) return normalized[field] || null;
    const measurement = normalized.bodyMeasurements?.[field] || normalized.garmentMeasurements?.[field];
    return measurement ? measurement.value : null;
  }

  function provenanceAtPath(details, path) {
    const normalized = globalObject.YarnAIProjectDetailsExperience?.normalizeProjectDetails(details) || clone(details || {});
    const field = fieldForPath(path);
    if (SCALAR_FIELDS.includes(field)) return normalized.provenance?.[field] || null;
    return normalized.bodyMeasurements?.[field]?.provenance || normalized.garmentMeasurements?.[field]?.provenance || null;
  }

  function labelForPath(path) {
    if (path === "context.garmentType") return "Тип изделия";
    if (path === "context.summary") return "Сводка проекта";
    const field = fieldForPath(path);
    return globalObject.YarnAIProjectDetailsExperience?.FIELD_CATALOG?.[field]?.label || field;
  }

  function buildRequestSnapshot(input = {}) {
    const groups = normalizeEditableScope(input.groups);
    if (!groups.length) fail("EMPTY_SCOPE", "Выбери хотя бы одну группу данных.");
    const experience = globalObject.YarnAIProjectDetailsExperience;
    if (!experience) fail("DETAILS_API_MISSING", "Модуль параметров проекта недоступен.");
    const details = experience.normalizeProjectDetails(input.details);
    const values = {};
    for (const path of pathsForGroups(groups)) {
      if (path === "context.garmentType") {
        values[path] = { value: clean(input.garmentType, 180) || null, provenance: "project_description", label: labelForPath(path), editable: false };
      } else if (path === "context.summary") {
        const context = { details, garmentType: input.garmentType, technology: input.technology, intent: input.intent };
        values[path] = {
          value: {
            known: experience.knownSummary(context).map((entry) => ({ label: clean(entry.label), value: clean(entry.value), source: clean(entry.source) })),
            missing: experience.missingFields(context).map((entry) => ({ field: entry.field, label: clean(entry.label) })),
          },
          provenance: "derived",
          label: labelForPath(path),
          editable: false,
        };
      } else {
        values[path] = {
          value: valueAtPath(details, path),
          provenance: provenanceAtPath(details, path),
          label: labelForPath(path),
          editable: true,
        };
      }
    }
    const snapshot = {
      project: {
        id: clean(input.projectId, 180),
        title: clean(input.projectTitle, 180) || "Проект",
        ownerLabel: clean(input.ownerLabel, 120) || null,
      },
      projectRevision: Number.isInteger(input.projectRevision) && input.projectRevision > 0 ? input.projectRevision : 1,
      values,
    };
    snapshot.fingerprint = fingerprint(snapshot);
    return snapshot;
  }

  function requestFingerprintInput(request) {
    const result = clone(request);
    delete result.fingerprint;
    return result;
  }

  function responseFingerprintInput(response) {
    const result = clone(response);
    delete result.fingerprint;
    return result;
  }

  function buildCollaborationRequest(input = {}, metadata = {}) {
    const groups = normalizeEditableScope(input.groups);
    const snapshot = buildRequestSnapshot({ ...input, groups });
    const editablePaths = pathsForGroups(groups, true);
    const request = {
      kind: REQUEST_KIND,
      schemaVersion: VERSION,
      requestId: clean(metadata.requestId, 180),
      projectId: snapshot.project.id,
      sourceIdentity: fingerprint({ projectId: snapshot.project.id, projectRevision: snapshot.projectRevision, snapshotFingerprint: snapshot.fingerprint }),
      helper: {
        label: clean(input.helperLabel, 120) || "Помощник",
        instruction: clean(input.instruction, 1000) || null,
      },
      scope: { groups: [...groups], editablePaths },
      snapshot,
      audit: {
        createdAt: clean(metadata.createdAt, 40),
        expiresAt: clean(metadata.expiresAt, 40) || null,
        createdBy: "project_owner",
      },
      state: { importedUnproven: false, quarantined: false, collision: false },
    };
    if (!request.requestId || !request.projectId || !request.audit.createdAt) fail("INVALID_REQUEST_METADATA", "Не удалось создать идентификатор запроса.");
    request.fingerprint = fingerprint(requestFingerprintInput(request));
    validateCollaborationRequest(request);
    return request;
  }

  function staleByTime(audit, now) {
    if (!now || !audit?.expiresAt) return false;
    const current = Date.parse(now);
    const expires = Date.parse(audit.expiresAt);
    return !Number.isFinite(current) || !Number.isFinite(expires) || current > expires;
  }

  function validateState(state, prefix) {
    if (state?.importedUnproven) fail(`${prefix}_IMPORTED_UNPROVEN`, "Происхождение пакета не доказано.");
    if (state?.quarantined) fail(`${prefix}_QUARANTINED`, "Пакет помещён в карантин.");
    if (state?.collision) fail(`${prefix}_COLLISION`, "Обнаружена коллизия идентификатора пакета.");
  }

  function validateCollaborationRequest(source, options = {}) {
    const request = parsePackage(source, "MALFORMED_REQUEST");
    if (!isRecord(request) || request.kind !== REQUEST_KIND) fail("INVALID_REQUEST_KIND", "Файл не является запросом совместной проверки YarnAI.");
    if (request.schemaVersion !== VERSION) fail("UNSUPPORTED_REQUEST_VERSION", "Версия запроса не поддерживается.");
    if (!clean(request.requestId, 180) || !clean(request.projectId, 180)) fail("INVALID_REQUEST_IDENTITY", "Идентификаторы запроса повреждены.");
    if (options.projectId && request.projectId !== options.projectId) fail("REQUEST_PROJECT_MISMATCH", "Запрос относится к другому проекту.");
    validateState(request.state, "REQUEST");
    if (staleByTime(request.audit, options.now)) fail("STALE_REQUEST", "Срок действия запроса истёк.");
    const groups = normalizeEditableScope(request.scope?.groups);
    if (!groups.length || !equal(groups, request.scope?.groups)) fail("INVALID_REQUEST_SCOPE", "Группы запроса повреждены или не поддерживаются.");
    const expectedEditable = pathsForGroups(groups, true);
    if (!Array.isArray(request.scope?.editablePaths)) fail("INVALID_REQUEST_SCOPE", "Editable scope запроса отсутствует.");
    for (const path of request.scope.editablePaths) {
      if (!EDITABLE_PATHS.includes(path)) fail("UNKNOWN_EDITABLE_PATH", "Запрос содержит неизвестное редактируемое поле.", { path });
    }
    if (!equal(expectedEditable, request.scope.editablePaths)) fail("EDITABLE_SCOPE_MISMATCH", "Editable scope запроса был изменён.");
    const expectedPaths = pathsForGroups(groups);
    const actualPaths = isRecord(request.snapshot?.values) ? Object.keys(request.snapshot.values) : [];
    if (!equal([...expectedPaths].sort(), [...actualPaths].sort())) fail("SNAPSHOT_SCOPE_MISMATCH", "Snapshot раскрывает данные вне выбранных групп или потерял поля.");
    for (const path of actualPaths) {
      if (!ALL_PATHS.has(path)) fail("UNKNOWN_SNAPSHOT_PATH", "Snapshot содержит неизвестное поле.", { path });
      const entry = request.snapshot.values[path];
      if (!isRecord(entry) || Boolean(entry.editable) !== EDITABLE_PATHS.includes(path)) fail("INVALID_SNAPSHOT_ENTRY", "Поле snapshot повреждено.", { path });
    }
    if (request.snapshot?.project?.id !== request.projectId) fail("SNAPSHOT_PROJECT_MISMATCH", "Project identity snapshot не совпадает с запросом.");
    const snapshotInput = clone(request.snapshot);
    delete snapshotInput.fingerprint;
    if (request.snapshot.fingerprint !== fingerprint(snapshotInput)) fail("SNAPSHOT_FINGERPRINT_MISMATCH", "Immutable snapshot запроса был изменён.");
    const expectedSource = fingerprint({ projectId: request.projectId, projectRevision: request.snapshot.projectRevision, snapshotFingerprint: request.snapshot.fingerprint });
    if (request.sourceIdentity !== expectedSource) fail("SOURCE_IDENTITY_MISMATCH", "Source identity запроса не совпадает со snapshot.");
    if (request.fingerprint !== fingerprint(requestFingerprintInput(request))) fail("REQUEST_FINGERPRINT_MISMATCH", "Fingerprint запроса не совпадает.");
    return { valid: true, request: clone(request), fingerprint: request.fingerprint };
  }

  function normalizeProposalValue(path, value) {
    const experience = globalObject.YarnAIProjectDetailsExperience;
    const field = fieldForPath(path);
    if (!EDITABLE_PATHS.includes(path) || !field) fail("UNKNOWN_EDITABLE_PATH", "Предложение содержит неизвестное поле.", { path });
    const validation = experience?.validateField(field, value);
    if (!validation?.valid || validation.empty) fail("INVALID_PROPOSAL_VALUE", validation?.error || "Предложенное значение не прошло проверку.", { path });
    if (BODY_FIELDS.includes(field) || GARMENT_FIELDS.includes(field)) return Number(String(value).replace(",", "."));
    if (field === "sizeMode") return experience.normalizeMode(value);
    if (field === "standardSize") return experience.normalizeSize(value);
    if (field === "fit") return experience.normalizeFit(value);
    return value;
  }

  function normalizeProposals(request, proposals) {
    const source = Array.isArray(proposals) ? proposals : [];
    const allowed = new Set(request.scope.editablePaths);
    const seen = new Set();
    return source.map((proposal) => {
      const path = clean(proposal?.path, 180);
      if (!ALL_PATHS.has(path)) fail("UNKNOWN_EDITABLE_PATH", "Ответ содержит неизвестное поле.", { path });
      if (!allowed.has(path)) fail(READ_ONLY_PATHS.includes(path) ? "READ_ONLY_FIELD" : "SCOPE_EXPANSION", "Ответ пытается изменить поле вне разрешённого scope.", { path });
      if (seen.has(path)) fail("DUPLICATE_PROPOSAL", "Ответ содержит несколько предложений для одного поля.", { path });
      seen.add(path);
      return { path, value: normalizeProposalValue(path, proposal.value), explanation: clean(proposal.explanation, 600) || null };
    }).filter((proposal) => !equal(proposal.value, request.snapshot.values[proposal.path].value))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  function buildCollaborationResponse(requestSource, proposals, metadata = {}) {
    const request = validateCollaborationRequest(requestSource, { now: metadata.now }).request;
    const response = {
      kind: RESPONSE_KIND,
      schemaVersion: VERSION,
      responseId: clean(metadata.responseId, 180),
      requestId: request.requestId,
      requestFingerprint: request.fingerprint,
      projectId: request.projectId,
      sourceIdentity: request.sourceIdentity,
      snapshotFingerprint: request.snapshot.fingerprint,
      editablePaths: [...request.scope.editablePaths],
      helper: { label: request.helper.label },
      proposals: normalizeProposals(request, proposals),
      audit: {
        createdAt: clean(metadata.createdAt, 40),
        expiresAt: clean(metadata.expiresAt, 40) || null,
        createdBy: "project_helper",
      },
      state: { importedUnproven: false, quarantined: false, collision: false },
    };
    if (!response.responseId || !response.audit.createdAt) fail("INVALID_RESPONSE_METADATA", "Не удалось создать идентификатор ответа.");
    response.fingerprint = fingerprint(responseFingerprintInput(response));
    validateCollaborationResponse(response, request, { now: metadata.now });
    return response;
  }

  function validateCollaborationResponse(responseSource, requestSource, options = {}) {
    const response = parsePackage(responseSource, "MALFORMED_RESPONSE");
    const request = validateCollaborationRequest(requestSource, { projectId: options.projectId, now: options.now }).request;
    if (!isRecord(response) || response.kind !== RESPONSE_KIND) fail("INVALID_RESPONSE_KIND", "Файл не является ответом на совместную проверку YarnAI.");
    if (response.schemaVersion !== VERSION) fail("UNSUPPORTED_RESPONSE_VERSION", "Версия ответа не поддерживается.");
    validateState(response.state, "RESPONSE");
    if (staleByTime(response.audit, options.now)) fail("STALE_RESPONSE", "Срок действия ответа истёк.");
    if (response.projectId !== request.projectId) fail("RESPONSE_PROJECT_MISMATCH", "Ответ относится к другому проекту.");
    if (response.requestId !== request.requestId) fail("RESPONSE_REQUEST_MISMATCH", "Ответ относится к другому запросу.");
    if (response.requestFingerprint !== request.fingerprint || response.snapshotFingerprint !== request.snapshot.fingerprint) fail("RESPONSE_SNAPSHOT_MISMATCH", "Ответ не связан с исходным immutable snapshot.");
    if (response.sourceIdentity !== request.sourceIdentity) fail("RESPONSE_SOURCE_MISMATCH", "Source identity ответа не совпадает с запросом.");
    if (!equal(response.editablePaths, request.scope.editablePaths)) fail("RESPONSE_SCOPE_EXPANSION", "Editable scope ответа был изменён.");
    const proposals = normalizeProposals(request, response.proposals);
    if (!equal(proposals, response.proposals)) fail("RESPONSE_NOT_CANONICAL", "Предложения ответа имеют недопустимый или нестабильный формат.");
    if (response.fingerprint !== fingerprint(responseFingerprintInput(response))) fail("RESPONSE_FINGERPRINT_MISMATCH", "Fingerprint ответа не совпадает.");
    const existing = Array.isArray(options.existingResponses) ? options.existingResponses.find((entry) => entry?.responseId === response.responseId) : null;
    if (existing && existing.fingerprint !== response.fingerprint) fail("RESPONSE_IDENTITY_COLLISION", "Ответ с таким identity уже существует с другим содержимым.");
    return { valid: true, response: clone(response), duplicate: Boolean(existing), fingerprint: response.fingerprint };
  }

  function computeCollaborationDiff(currentDetails, requestSource, responseSource, options = {}) {
    const request = validateCollaborationRequest(requestSource, options).request;
    const response = validateCollaborationResponse(responseSource, request, options).response;
    return response.proposals.map((proposal) => {
      const entry = request.snapshot.values[proposal.path];
      const current = valueAtPath(currentDetails, proposal.path);
      const base = entry.value;
      return {
        path: proposal.path,
        field: fieldForPath(proposal.path),
        label: entry.label,
        base,
        current,
        proposed: proposal.value,
        currentProvenance: provenanceAtPath(currentDetails, proposal.path),
        explanation: proposal.explanation,
        changed: !equal(current, proposal.value),
        conflict: !equal(current, base),
        decision: "undecided",
      };
    });
  }

  function computeReviewSummary(diff, decisions = {}) {
    const rows = Array.isArray(diff) ? diff : [];
    const summary = { total: rows.length, changed: 0, conflicts: 0, accepted: 0, rejected: 0, undecided: 0 };
    rows.forEach((row) => {
      if (row.changed) summary.changed += 1;
      if (row.conflict) summary.conflicts += 1;
      const decision = decisions[row.path] || row.decision || "undecided";
      if (decision === "accepted") summary.accepted += 1;
      else if (decision === "rejected") summary.rejected += 1;
      else summary.undecided += 1;
    });
    return summary;
  }

  function buildApplyPatch(diff, decisions = {}, confirmedConflicts = []) {
    const confirmed = new Set(Array.isArray(confirmedConflicts) ? confirmedConflicts : []);
    const patch = {};
    for (const row of Array.isArray(diff) ? diff : []) {
      if (decisions[row.path] !== "accepted" || !row.changed) continue;
      if (row.conflict && !confirmed.has(row.path)) fail("UNCONFIRMED_CONFLICT", "Подтверди замену значения, изменённого после создания запроса.", { path: row.path });
      patch[row.field] = normalizeProposalValue(row.path, row.proposed);
    }
    return patch;
  }

  function normalizeProvenance(existing, acceptedRows, metadata = {}) {
    const source = isRecord(existing) ? clone(existing) : {};
    const byPath = isRecord(source.byPath) ? source.byPath : {};
    for (const row of Array.isArray(acceptedRows) ? acceptedRows : []) {
      byPath[row.path] = {
        source: "collaboration_response",
        requestId: clean(metadata.requestId, 180),
        responseId: clean(metadata.responseId, 180),
        helperLabel: clean(metadata.helperLabel, 120) || "Помощник",
        acceptedAt: clean(metadata.acceptedAt, 40),
      };
    }
    const ordered = {};
    Object.keys(byPath).sort().forEach((path) => { ordered[path] = byPath[path]; });
    return { version: VERSION, byPath: ordered };
  }

  function applyAllowedPatchToDraft(draftInput, currentDetails, diff, decisions = {}, metadata = {}) {
    const experience = globalObject.YarnAIProjectDetailsExperience;
    if (!experience) fail("DETAILS_API_MISSING", "Модуль параметров проекта недоступен.");
    const before = isRecord(draftInput) ? clone(draftInput) : {};
    const patch = buildApplyPatch(diff, decisions, metadata.confirmedConflicts);
    const acceptedRows = (Array.isArray(diff) ? diff : []).filter((row) => Object.prototype.hasOwnProperty.call(patch, row.field));
    if (!acceptedRows.length) return before;
    const stored = experience.applyPatch(currentDetails, patch);
    before.project_details_experience = stored;
    before.project_intent = experience.applyDetailsToIntent(before.project_intent || before.projectIntent || {}, stored);
    const collaboration = isRecord(before.project_details_collaboration) ? before.project_details_collaboration : {};
    collaboration.provenance = normalizeProvenance(collaboration.provenance, acceptedRows, metadata);
    collaboration.lastApplied = {
      requestId: clean(metadata.requestId, 180),
      responseId: clean(metadata.responseId, 180),
      acceptedPaths: acceptedRows.map((row) => row.path).sort(),
      appliedAt: clean(metadata.acceptedAt, 40),
    };
    before.project_details_collaboration = collaboration;
    return before;
  }

  function serializePackage(value) {
    return `${canonicalize(value)}\n`;
  }

  const api = Object.freeze({
    VERSION, REQUEST_KIND, RESPONSE_KIND, GROUPS, GROUP_ORDER, EDITABLE_PATHS, READ_ONLY_PATHS,
    CollaborationError, canonicalize, fingerprint, parsePackage, normalizeEditableScope,
    buildRequestSnapshot, buildCollaborationRequest, validateCollaborationRequest,
    buildCollaborationResponse, validateCollaborationResponse, computeCollaborationDiff,
    buildApplyPatch, applyAllowedPatchToDraft, normalizeProvenance, computeReviewSummary,
    serializePackage, valueAtPath, provenanceAtPath,
  });
  globalObject.YarnAIProjectDetailsCollaboration = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
