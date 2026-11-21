"use strict";

(function exposeGarmentReferenceAnalysis(globalObject) {
  const CONTRACT_VERSION = "GARMENT_REFERENCE_ANALYSIS_V1";
  const SCHEMA_VERSION = 1;
  const PROGRESS_KIND = "GARMENT_REFERENCE_ANALYSIS";
  const PHOTO_PURPOSE = "GARMENT_REFERENCE";
  const DEFAULT_PROVIDER = "openai";
  const DEFAULT_MODEL = "gpt-5.6-terra";
  const MAX_SOURCE_PHOTO_BYTES = 20_000_000;
  const MAX_SANITIZED_IMAGE_BYTES = 8_000_000;
  const MAX_SANITIZED_IMAGE_DIMENSION = 1_600;
  const MAX_SANITIZED_IMAGE_PIXELS = MAX_SANITIZED_IMAGE_DIMENSION * MAX_SANITIZED_IMAGE_DIMENSION;
  const DISABLED_MESSAGE = "Автоматический анализ фотографий пока не подключён.";
  const DECISIONS = Object.freeze(["draft", "confirmed", "needs_changes", "rejected", "awaiting_decision", "selected"]);
  const CLARIFICATION_TYPES = Object.freeze([
    "free_text", "observation_correction", "desired_change", "priority", "unseen_detail",
  ]);
  const SHA256 = /^[0-9a-f]{64}$/;
  const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const FINGERPRINT = /^fnv1a32:[0-9a-f]{8}$/;

  class GarmentReferenceError extends Error {
    constructor(code, userMessage, details = {}) {
      super(userMessage);
      this.name = "GarmentReferenceError";
      this.code = code;
      this.userMessage = userMessage;
      this.details = copy(details);
    }
  }

  function createInitialState(input = {}) {
    const now = timestamp(input.now);
    const projectId = uuid(input.projectId, "PROJECT_ID_INVALID");
    const calculationId = uuid(input.calculationId, "CALCULATION_ID_INVALID");
    const projectRevision = positiveInteger(input.projectRevision, "PROJECT_REVISION_INVALID");
    const photos = normalizePhotos(input.photos || []);
    const state = {
      contractVersion: CONTRACT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      kind: PROGRESS_KIND,
      projectId,
      calculationId,
      revision: 1,
      status: photos.length ? "collecting" : "waiting_for_photos",
      source: sourceIdentity(projectId, projectRevision, photos),
      request: null,
      provider: {
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        enabled: false,
        status: "disabled",
        message: DISABLED_MESSAGE,
      },
      analysis: null,
      clarifications: [],
      ownerDecision: ownerDecision("awaiting_decision", null, "", now),
      nextStageBoundary: {
        status: "not_started",
        requiredInputs: ["мерки", "пряжа", "спицы", "образец плотности"],
        calculationsCreated: false,
        executionPlanCreated: false,
      },
      staleReasons: [],
      audit: [auditEntry("created", 1, now, { photoCount: photos.length })],
      createdAt: now,
      updatedAt: now,
      fingerprint: "",
    };
    state.fingerprint = stateFingerprint(state);
    requireValidState(state);
    return freeze(state);
  }

  function addReferencePhotos(state, photos, options = {}) {
    const current = validCopy(state);
    const incoming = normalizePhotos(photos);
    if (!incoming.length) fail("PHOTO_REQUIRED", "Добавь хотя бы одну фотографию изделия.");
    const existingByHash = new Map(current.source.referencePhotos.map((photo) => [photo.sha256, photo]));
    incoming.forEach((photo) => {
      if (!existingByHash.has(photo.sha256)) existingByHash.set(photo.sha256, photo);
    });
    const nextPhotos = [...existingByHash.values()].sort(photoSort);
    if (canonicalize(nextPhotos) === canonicalize(current.source.referencePhotos)) return freeze(current);
    const next = copy(current);
    next.source = sourceIdentity(
      current.projectId,
      positiveInteger(options.projectRevision ?? current.source.projectRevision, "PROJECT_REVISION_INVALID"),
      nextPhotos,
    );
    if (next.analysis) {
      next.status = "stale";
      next.staleReasons = ["reference_photos_changed"];
      next.ownerDecision = ownerDecision("awaiting_decision", null, "", timestamp(options.now));
    } else {
      next.status = "collecting";
      next.staleReasons = [];
    }
    next.request = null;
    return commit(current, next, "reference_photos_changed", options.now, { photoCount: nextPhotos.length });
  }

  function removeReferencePhoto(state, photoId, options = {}) {
    const current = validCopy(state);
    const id = uuid(photoId, "PHOTO_ID_INVALID");
    const nextPhotos = current.source.referencePhotos.filter((photo) => photo.photoId !== id);
    if (nextPhotos.length === current.source.referencePhotos.length) return freeze(current);
    const next = copy(current);
    next.source = sourceIdentity(
      current.projectId,
      positiveInteger(options.projectRevision ?? current.source.projectRevision, "PROJECT_REVISION_INVALID"),
      nextPhotos,
    );
    next.request = null;
    next.analysis = current.analysis;
    next.status = current.analysis ? "stale" : nextPhotos.length ? "collecting" : "waiting_for_photos";
    next.staleReasons = current.analysis ? ["reference_photos_changed"] : [];
    next.ownerDecision = ownerDecision("awaiting_decision", null, "", timestamp(options.now));
    return commit(current, next, "reference_photo_removed", options.now, { photoId: id });
  }

  function recordClarification(state, input = {}, options = {}) {
    const current = validCopy(state);
    const type = CLARIFICATION_TYPES.includes(input.type) ? input.type : "free_text";
    const text = boundedText(input.text, "CLARIFICATION_TEXT_INVALID", 4000);
    const targetObservationId = nullableText(input.targetObservationId, 200);
    if (type === "observation_correction" && !targetObservationId) {
      fail("CLARIFICATION_TARGET_REQUIRED", "Укажи наблюдение, которое нужно исправить.");
    }
    const duplicate = current.clarifications.find((entry) =>
      entry.type === type && entry.text === text && entry.targetObservationId === targetObservationId,
    );
    if (duplicate) return freeze(current);
    const now = timestamp(options.now);
    const next = copy(current);
    next.clarifications.push({
      id: makeId("garment-clarification"),
      type,
      text,
      targetObservationId,
      authority: "user",
      createdAt: now,
    });
    next.clarifications.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    if (current.analysis) {
      next.status = "stale";
      next.staleReasons = stableStrings([...current.staleReasons, "user_clarifications_changed"]);
      next.ownerDecision = ownerDecision("awaiting_decision", null, "", now);
    }
    next.request = null;
    return commit(current, next, "clarification_recorded", now, { type, targetObservationId });
  }

  function buildAnalysisRequest(state, options = {}) {
    const current = validCopy(state);
    if (!current.source.referencePhotos.length) fail("PHOTO_REQUIRED", "Добавь хотя бы одну фотографию изделия.");
    const request = {
      contract_version: CONTRACT_VERSION,
      request_id: text(options.requestId) || makeId("garment-analysis-request"),
      project_id: current.projectId,
      project_revision: current.source.projectRevision,
      reference_photos: current.source.referencePhotos.map((photo) => ({
        photo_id: photo.photoId,
        sha256: photo.sha256,
        mime_type: photo.mimeType,
      })),
      user_clarifications: current.clarifications.map((entry) => ({
        clarification_id: entry.id,
        type: entry.type,
        text: entry.text,
        target_observation_id: entry.targetObservationId,
      })),
    };
    request.request_fingerprint = requestFingerprint(request);
    return freeze(request);
  }

  async function buildServerRequest(state, photoRecords, options = {}) {
    const request = buildAnalysisRequest(state, options);
    const records = new Map((Array.isArray(photoRecords) ? photoRecords : []).map((entry) => [entry?.metadata?.photo_id, entry]));
    const photos = [];
    for (const selected of request.reference_photos) {
      const record = records.get(selected.photo_id);
      if (
        !(record?.blob instanceof Blob) ||
        record.metadata?.purpose !== PHOTO_PURPOSE ||
        record.metadata?.sha256 !== selected.sha256 ||
        record.metadata?.source_mime !== selected.mime_type
      ) fail("PHOTO_IDENTITY_MISMATCH", "Локальная reference photo не совпадает с analysis request.");
      photos.push({
        ...selected,
        purpose: PHOTO_PURPOSE,
        content_base64: await blobToBase64(record.blob),
      });
    }
    return freeze({
      contract_version: request.contract_version,
      request_id: request.request_id,
      project_id: request.project_id,
      project_revision: request.project_revision,
      reference_photos: photos,
      user_clarifications: copy(request.user_clarifications),
      request_fingerprint: request.request_fingerprint,
    });
  }

  async function buildPilotServerRequest(state, photoRecord, options = {}) {
    const current = validCopy(state);
    const requestId = text(options.requestId);
    if (!requestId) fail("PILOT_REQUEST_ID_MISSING", "Сервер ещё не выдал одноразовое разрешение для этой фотографии.");
    if (options.userConfirmed !== true) fail("PILOT_CONFIRMATION_REQUIRED", "Подтверди отправку выбранной очищенной фотографии.");
    const prepared = await preparePilotPhoto(current, photoRecord, options);
    const analysisRequest = buildAnalysisRequest(current, { requestId });
    return freeze({
      contract_version: CONTRACT_VERSION,
      pilot_schema_version: 1,
      request_id: requestId,
      source_identity: {
        project_id: analysisRequest.project_id,
        project_revision: analysisRequest.project_revision,
        reference_photos: analysisRequest.reference_photos.map((photo) => ({ photo_id: photo.photo_id, sha256: photo.sha256 })),
        request_fingerprint: analysisRequest.request_fingerprint,
      },
      source_photo_id: prepared.source_photo_id,
      source_photo_sha256: prepared.source_photo_sha256,
      sanitized_image: normalizeSanitizedImage(prepared.sanitized),
      user_clarifications: current.clarifications.map((entry) => ({ type: entry.type, text: entry.text })),
      user_confirmed_exact_sanitized_photo: true,
      explicit_action: "run_one_shot_garment_photo_pilot",
    });
  }

  async function preparePilotPhoto(state, photoRecord, options = {}) {
    const current = validCopy(state);
    const metadata = photoRecord?.metadata;
    const selected = current.source.referencePhotos.find((photo) => photo.photoId === metadata?.photo_id);
    if (
      !selected || !(photoRecord?.blob instanceof Blob) || metadata?.purpose !== PHOTO_PURPOSE ||
      metadata?.sha256 !== selected.sha256 || metadata?.source_mime !== selected.mimeType
    ) fail("PHOTO_IDENTITY_MISMATCH", "Выбранная фотография не совпадает с текущим проектом и revision.");
    const originalBytes = new Uint8Array(await photoRecord.blob.arrayBuffer());
    const originalSha256 = await sha256Hex(originalBytes);
    if (originalSha256 !== selected.sha256) {
      fail("PHOTO_ORIGINAL_SHA256_MISMATCH", "Исходные байты фотографии не совпадают с сохранённым SHA-256.");
    }
    const sanitized = options.sanitizer
      ? await options.sanitizer(photoRecord.blob)
      : await sanitizePhotoForPilot(photoRecord.blob);
    if (!(sanitized?.bytes instanceof Uint8Array) || await sha256Hex(sanitized.bytes) !== sanitized.sha256) {
      fail("PHOTO_SANITIZED_SHA256_MISMATCH", "Очищенные PNG-байты не совпадают с вычисленным SHA-256.");
    }
    return {
      source_photo_id: selected.photoId,
      source_photo_sha256: selected.sha256,
      original_byte_size: originalBytes.byteLength,
      sanitized,
    };
  }

  async function sanitizePhotoForPilot(blob) {
    if (!(blob instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(blob.type) || blob.size <= 0 || blob.size > MAX_SOURCE_PHOTO_BYTES) {
      fail("PHOTO_SANITIZATION_INPUT_INVALID", "Для очистки поддерживаются JPEG, PNG и WebP до 20 МБ.");
    }
    if (typeof globalObject.createImageBitmap !== "function" || typeof document === "undefined") {
      fail("PHOTO_SANITIZATION_UNAVAILABLE", "В этом браузере нельзя безопасно подготовить очищенную копию фотографии.");
    }
    let bitmap;
    try { bitmap = await globalObject.createImageBitmap(blob); }
    catch { fail("PHOTO_DECODE_FAILED", "Фотография не декодируется как изображение."); }
    try {
      if (!bitmap.width || !bitmap.height) fail("PHOTO_DECODE_FAILED", "Фотография имеет неверные размеры.");
      const scale = Math.min(1, MAX_SANITIZED_IMAGE_DIMENSION / bitmap.width, MAX_SANITIZED_IMAGE_DIMENSION / bitmap.height);
      const width = Math.max(1, Math.floor(bitmap.width * scale));
      const height = Math.max(1, Math.floor(bitmap.height * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
      if (!context) fail("PHOTO_SANITIZATION_UNAVAILABLE", "Не удалось создать безопасную очищенную копию фотографии.");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
      const sanitizedBlob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG_ENCODE_FAILED")), "image/png"));
      if (sanitizedBlob.size <= 0 || sanitizedBlob.size > MAX_SANITIZED_IMAGE_BYTES) fail("PHOTO_SANITIZED_SIZE_INVALID", "Очищенная копия превышает безопасный лимит 8 МБ.");
      const bytes = new Uint8Array(await sanitizedBlob.arrayBuffer());
      if (bytes.length < 24 || bytes.slice(0, 8).some((byte, index) => byte !== [137,80,78,71,13,10,26,10][index])) fail("PHOTO_SANITIZATION_FAILED", "Очищенная копия не является PNG.");
      const sha256 = await sha256Hex(bytes);
      return { mimeType: "image/png", bytes, sha256, width, height };
    } finally { if (typeof bitmap?.close === "function") bitmap.close(); }
  }

  function normalizeSanitizedImage(value) {
    const bytes = value?.bytes instanceof Uint8Array ? value.bytes : null;
    if (!bytes || value?.mimeType !== "image/png" || !SHA256.test(value?.sha256 || "") || !Number.isInteger(value?.width) || !Number.isInteger(value?.height) || value.width < 1 || value.height < 1 || value.width > MAX_SANITIZED_IMAGE_DIMENSION || value.height > MAX_SANITIZED_IMAGE_DIMENSION || value.width * value.height > MAX_SANITIZED_IMAGE_PIXELS || bytes.length > MAX_SANITIZED_IMAGE_BYTES) {
      fail("PHOTO_SANITIZATION_FAILED", "Очищенная копия не прошла локальную проверку.");
    }
    return { mime_type: "image/png", content_base64: bytesToBase64(bytes), sha256: value.sha256, width: value.width, height: value.height };
  }

  function markProviderUnavailable(state, configuration = {}, options = {}) {
    const current = validCopy(state);
    const request = buildAnalysisRequest(current, options);
    const config = normalizeProviderConfiguration(configuration);
    if (config.enabled) fail("PROVIDER_EXPECTED_ENABLED", "Server сообщил доступный provider; disabled-переход отклонён.");
    if (current.request?.request_fingerprint === request.request_fingerprint && current.status === "provider_disabled") {
      return freeze(current);
    }
    const next = copy(current);
    next.request = copy(request);
    next.provider = { ...config, status: "disabled", message: DISABLED_MESSAGE };
    next.status = "provider_disabled";
    next.staleReasons = [];
    return commit(current, next, "provider_disabled", options.now, { requestFingerprint: request.request_fingerprint });
  }

  function applyProviderResponse(state, payload, configuration = {}, options = {}) {
    const current = validCopy(state);
    const config = normalizeProviderConfiguration(configuration);
    if (!config.enabled && options.allowTestProvider !== true) {
      fail("PROVIDER_DISABLED", DISABLED_MESSAGE);
    }
    const request = buildAnalysisRequest(current, { requestId: current.request?.request_id || options.requestId });
    const analysis = validateProviderResponse(payload, request, config);
    if (current.analysis && current.analysis.analysisFingerprint === analysis.analysisFingerprint) return freeze(current);
    const next = copy(current);
    next.request = copy(request);
    next.provider = { ...config, status: "response_validated", message: "Анализ прошёл строгую проверку." };
    next.analysis = copy(analysis);
    next.status = "awaiting_decision";
    next.staleReasons = [];
    next.ownerDecision = ownerDecision("awaiting_decision", null, "", timestamp(options.now));
    return commit(current, next, "analysis_validated", options.now, { analysisFingerprint: analysis.analysisFingerprint });
  }

  function applyPilotProviderResponse(state, payload, configuration = {}, options = {}) {
    const current = validCopy(state);
    const config = normalizeProviderConfiguration(configuration);
    if (!config.enabled) fail("PROVIDER_DISABLED", DISABLED_MESSAGE);
    const request = buildAnalysisRequest(current, { requestId: options.requestId });
    const value = exactObject(payload, [
      "contract_version", "pilot_schema_version", "request_id", "source_identity", "provider", "sanitized_photo_sha256",
      "visibleObservations", "uncertainObservations", "technologyOptions", "cannotDetermineFromPhoto", "clarifyingQuestions",
      "forbiddenExactClaims", "cost_upper_bound_usd",
    ], "PROVIDER_RESPONSE_SCHEMA_INVALID");
    if (value.contract_version !== CONTRACT_VERSION || value.pilot_schema_version !== 1 || value.request_id !== request.request_id || !SHA256.test(value.sanitized_photo_sha256 || "")) fail("PROVIDER_RESPONSE_IDENTITY_MISMATCH", "Ответ относится к другому одноразовому запросу.");
    const identity = exactObject(value.source_identity, ["project_id", "project_revision", "reference_photos", "request_fingerprint"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
    if (canonicalize(identity) !== canonicalize({ project_id: request.project_id, project_revision: request.project_revision, reference_photos: request.reference_photos.map((photo) => ({ photo_id: photo.photo_id, sha256: photo.sha256 })), request_fingerprint: request.request_fingerprint })) fail("PROVIDER_RESPONSE_IDENTITY_MISMATCH", "Ответ относится к другому проекту, revision или набору фотографий.");
    const provider = exactObject(value.provider, ["provider", "model"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
    if (provider.provider !== config.provider || provider.model !== config.model) fail("PROVIDER_RESPONSE_MODEL_MISMATCH", "Provider или model не совпадают с server configuration.");
    const ids = new Set();
    const visibleObservations = arrayBetween(value.visibleObservations, 1, 20, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, ["id", "description", "visualEvidence"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      const id = identifier(item.id); if (ids.has(id)) fail("PROVIDER_RESPONSE_SCHEMA_INVALID", "Stable ID повторяется."); ids.add(id);
      return { id, field: "visible_feature", value: boundedText(item.description, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000), evidencePhotoIds: [request.reference_photos[0].photo_id], status: "observed", explanation: boundedText(item.visualEvidence, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000) };
    });
    const inferences = arrayBetween(value.uncertainObservations, 1, 20, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, ["id", "possibleInterpretations", "uncertaintyReason", "clarificationMethod", "confidence"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      const id = identifier(item.id); if (ids.has(id) || !["low", "medium", "high"].includes(item.confidence)) fail("PROVIDER_RESPONSE_SCHEMA_INVALID", "Неопределённое наблюдение повреждено."); ids.add(id);
      return { id, field: "technology_interpretation", value: uniqueTextList(item.possibleInterpretations, 2, 5, 1000).join(" / "), status: "inferred", uncertainty: item.confidence, whyPlausible: boundedText(item.uncertaintyReason, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000), confirmOrReject: boundedText(item.clarificationMethod, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000) };
    });
    const observationIds = new Set([...visibleObservations, ...inferences].map((item) => item.id));
    const technologyOptions = arrayBetween(value.technologyOptions, 2, 3, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, ["id", "name", "construction", "knittingDirection", "suggestedTechniques", "observationIds", "visualEvidence", "alternativeExplanation", "confidence"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      const optionId = identifier(item.id); if (ids.has(optionId) || !["low", "medium", "high"].includes(item.confidence)) fail("PROVIDER_RESPONSE_SCHEMA_INVALID", "Вариант технологии повреждён."); ids.add(optionId);
      const evidenceObservationIds = uniqueTextList(item.observationIds, 1, 20, 200); if (evidenceObservationIds.some((id) => !observationIds.has(id))) fail("TECHNOLOGY_EVIDENCE_MISMATCH", "Вариант ссылается на неизвестное наблюдение.");
      const construction = boundedText(item.construction, "PROVIDER_RESPONSE_SCHEMA_INVALID", 3000);
      return { optionId, name: boundedText(item.name, "PROVIDER_RESPONSE_SCHEMA_INVALID", 300), constructionSummary: construction, knittingDirection: boundedText(item.knittingDirection, "PROVIDER_RESPONSE_SCHEMA_INVALID", 1000), seamMode: "Не заявляется по одной фотографии", majorComponents: [construction], shapingApproach: "Точные расчёты формирования ещё не выполнялись.", yarnCharacteristics: ["Точные свойства пряжи по фотографии не заявляются."], toolsAndTechniques: uniqueTextList(item.suggestedTechniques, 1, 12, 1000), expectedVisualSimilarity: boundedText(item.visualEvidence, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000), deliberateDifferences: [boundedText(item.alternativeExplanation, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000)], advantages: ["Вариант связан с указанными видимыми признаками."], risks: ["Скрытые детали конструкции остаются неопределёнными."], difficultyExplanation: "Сложность уточняется после выбора технологии и исходных данных.", missingInputsBeforeCalculation: ["Мерки", "Пряжа", "Спицы", "Контрольный образец плотности"], evidenceObservationIds, assumptionInferenceIds: evidenceObservationIds.filter((id) => inferences.some((entry) => entry.id === id)), confidence: item.confidence, visualEvidence: item.visualEvidence, alternativeExplanation: item.alternativeExplanation };
    });
    const unknowns = arrayBetween(value.cannotDetermineFromPhoto, 1, 20, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw, index) => { const item = exactObject(raw, ["feature", "reason"], "PROVIDER_RESPONSE_SCHEMA_INVALID"); return { id: `pilot-unknown:${index + 1}`, field: boundedText(item.feature, "PROVIDER_RESPONSE_SCHEMA_INVALID", 1000), explanation: boundedText(item.reason, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000) }; });
    const questions = arrayBetween(value.clarifyingQuestions, 1, 12, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw, index) => { const item = exactObject(raw, ["question", "reason", "distinguishes"], "PROVIDER_RESPONSE_SCHEMA_INVALID"); return { id: `pilot-question:${index + 1}`, text: boundedText(item.question, "PROVIDER_RESPONSE_SCHEMA_INVALID", 1000), reason: `${boundedText(item.reason, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000)} Различает: ${uniqueTextList(item.distinguishes, 2, 5, 1000).join(" / ")}` }; });
    const forbiddenExactClaims = uniqueTextList(value.forbiddenExactClaims, 8, 8, 100);
    const analysis = { contractVersion: CONTRACT_VERSION, pilotSchemaVersion: 1, sourceIdentity: { projectId: identity.project_id, projectRevision: identity.project_revision, referencePhotos: copy(identity.reference_photos), requestFingerprint: identity.request_fingerprint }, provider: copy(provider), visibleObservations, inferences, unknowns, questions, technologyOptions, forbiddenExactClaims, sanitizedPhotoSha256: value.sanitized_photo_sha256, costUpperBoundUsd: boundedText(value.cost_upper_bound_usd, "PROVIDER_RESPONSE_SCHEMA_INVALID", 20), analysisFingerprint: "" };
    analysis.analysisFingerprint = fnv1a32(analysis);
    const next = copy(current); next.request = copy(request); next.provider = { ...config, status: "response_validated", message: "Анализ прошёл строгую проверку." }; next.analysis = analysis; next.status = "awaiting_decision"; next.staleReasons = []; next.ownerDecision = ownerDecision("awaiting_decision", null, "", timestamp(options.now));
    return commit(current, next, "pilot_analysis_validated", options.now, { analysisFingerprint: analysis.analysisFingerprint });
  }

  function decideTechnology(state, input = {}, options = {}) {
    const current = validCopy(state);
    if (!current.analysis || current.status === "stale") fail("ANALYSIS_NOT_CURRENT", "Сначала нужен актуальный анализ фотографий.");
    const status = DECISIONS.includes(input.status) ? input.status : "awaiting_decision";
    const optionId = nullableText(input.optionId, 200);
    const comment = nullableText(input.comment, 4000) || "";
    const optionIds = new Set(current.analysis.technologyOptions.map((entry) => entry.optionId));
    if (status === "selected") {
      fail("EXPLICIT_CONFIRMATION_REQUIRED", "Сначала выбери вариант как черновик, затем подтверди его отдельным действием.");
    }
    if ((status === "draft" || status === "confirmed") && (!optionId || !optionIds.has(optionId))) {
      fail("OPTION_SELECTION_INVALID", "Выбери один из сохранённых вариантов технологии.");
    }
    if (optionId && !optionIds.has(optionId)) fail("OPTION_SELECTION_INVALID", "Вариант относится к другому анализу.");
    if (status === "needs_changes" && !comment) fail("CHANGE_REQUEST_REQUIRED", "Напиши, что нужно изменить.");
    if (status === "confirmed") {
      if (current.ownerDecision.status !== "draft" || current.ownerDecision.optionId !== optionId || !decisionMatchesAnalysis(current.ownerDecision, current.analysis)) {
        fail("DECISION_DRAFT_REQUIRED", "Подтвердить можно только текущий выбранный вариант из этого анализа.");
      }
    }
    const nextDecision = ownerDecision(status, optionId, comment, timestamp(options.now), current.analysis);
    if (status === "confirmed" && input.constructionIdentity !== undefined) {
      if (input.constructionIdentity !== "seamed_set_in_sleeve") fail("CONSTRUCTION_CHOICE_INVALID", "Для этого плана поддерживается только осознанный выбор отдельных деталей с втачным рукавом.");
      nextDecision.constructionIdentity = input.constructionIdentity;
    }
    if (canonicalize(decisionCore(current.ownerDecision)) === canonicalize(decisionCore(nextDecision))) return freeze(current);
    const next = copy(current);
    next.ownerDecision = nextDecision;
    next.status = status;
    return commit(current, next, "owner_decision_recorded", options.now, { status, optionId });
  }

  function selectTechnologyDraft(state, optionId, options = {}) {
    return decideTechnology(state, { status: "draft", optionId, comment: "" }, options);
  }

  function confirmTechnologyDecision(state, options = {}) {
    const current = validCopy(state);
    if (current.ownerDecision.status !== "draft" || !current.ownerDecision.optionId) {
      fail("DECISION_DRAFT_REQUIRED", "Сначала выбери один вариант технологии.");
    }
    return decideTechnology(current, { status: "confirmed", optionId: current.ownerDecision.optionId, comment: current.ownerDecision.comment || "", ...(options.constructionIdentity ? { constructionIdentity: options.constructionIdentity } : {}) }, options);
  }

  function reopenTechnologyDecision(state, options = {}) {
    const current = validCopy(state);
    if (!current.analysis || current.status === "stale") fail("ANALYSIS_NOT_CURRENT", "Сначала нужен актуальный анализ фотографий.");
    if (!["confirmed", "draft", "selected"].includes(current.ownerDecision.status)) return freeze(current);
    const next = copy(current);
    next.ownerDecision = ownerDecision("awaiting_decision", null, "", timestamp(options.now));
    next.status = "awaiting_decision";
    return commit(current, next, "owner_decision_reopened", options.now, { previousOptionId: current.ownerDecision.optionId || null });
  }

  function technologyDecisionHandoff(state) {
    const current = validCopy(state);
    const decision = current.ownerDecision;
    const selectedOption = current.analysis?.technologyOptions.find((entry) => entry.optionId === decision.optionId) || null;
    const currentBinding = decision.status === "confirmed" && decisionMatchesAnalysis(decision, current.analysis) && current.status !== "stale";
    const analysisId = currentBinding ? `garment-analysis:${current.analysis.analysisFingerprint.replace(/^fnv1a32:/, "")}` : null;
    const analysisRevision = currentBinding
      ? current.audit.findLast((entry) => ["analysis_validated", "pilot_analysis_validated"].includes(entry.event) && entry.details?.analysisFingerprint === current.analysis.analysisFingerprint)?.revision || null
      : null;
    const technologyDecisionId = currentBinding ? `garment-technology-decision:${fnv1a32({
      projectId: current.projectId,
      sourceAnalysisFingerprint: decision.sourceAnalysisFingerprint,
      sourceRequestFingerprint: decision.sourceRequestFingerprint,
      optionId: decision.optionId,
      confirmedAt: decision.confirmedAt,
      ...(decision.constructionIdentity ? { constructionIdentity: decision.constructionIdentity } : {}),
    }).replace(/^fnv1a32:/, "")}` : null;
    const technologyDecisionFingerprint = currentBinding ? fnv1a32(decisionCore(decision)) : null;
    return freeze({
      contractVersion: "GARMENT_TECHNOLOGY_DECISION_HANDOFF_V1",
      projectId: current.projectId,
      analysisId,
      analysisRevision,
      analysisRequestId: currentBinding ? current.request?.request_id || null : null,
      technologyDecisionId,
      technologyDecisionRevision: currentBinding ? current.revision : null,
      technologyDecisionFingerprint,
      decisionStatus: decision.status,
      selectedOptionId: selectedOption?.optionId || null,
      selectedOption: currentBinding ? copy(selectedOption) : null,
      ...(currentBinding && decision.constructionIdentity ? { selectedConstructionIdentity: decision.constructionIdentity } : {}),
      sourceAnalysisFingerprint: decision.sourceAnalysisFingerprint || null,
      sourceRequestFingerprint: decision.sourceRequestFingerprint || null,
      sourceProjectRevision: decision.sourceProjectRevision || null,
      isCurrent: currentBinding,
      allowedToStartTechnologyPlan: currentBinding && decision.readyForTechnologyPlan === true,
      confirmedAt: currentBinding ? decision.confirmedAt : null,
    });
  }

  function validateProviderResponse(payload, request, configuration = {}) {
    validateAnalysisRequest(request);
    const config = normalizeProviderConfiguration(configuration);
    const value = exactObject(payload, [
      "contract_version", "source_identity", "provider", "visible_observations", "inferences",
      "unknowns", "questions", "technology_options",
    ], "PROVIDER_RESPONSE_SCHEMA_INVALID");
    if (value.contract_version !== CONTRACT_VERSION) fail("PROVIDER_RESPONSE_SCHEMA_INVALID", "Provider вернул неподдерживаемую версию контракта.");
    const identity = exactObject(value.source_identity, [
      "project_id", "project_revision", "reference_photos", "request_fingerprint",
    ], "PROVIDER_RESPONSE_SCHEMA_INVALID");
    if (
      identity.project_id !== request.project_id ||
      identity.project_revision !== request.project_revision ||
      identity.request_fingerprint !== request.request_fingerprint ||
      canonicalize(identity.reference_photos) !== canonicalize(request.reference_photos.map((photo) => ({ photo_id: photo.photo_id, sha256: photo.sha256 })))
    ) fail("PROVIDER_RESPONSE_IDENTITY_MISMATCH", "Ответ относится к другому проекту, revision или набору фотографий.");
    const provider = exactObject(value.provider, ["provider", "model"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
    if (provider.provider !== config.provider || provider.model !== config.model) {
      fail("PROVIDER_RESPONSE_MODEL_MISMATCH", "Provider или model не совпадают с server configuration.");
    }
    const photoIds = new Set(request.reference_photos.map((photo) => photo.photo_id));
    const observations = arrayBetween(value.visible_observations, 0, 40, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, ["id", "field", "value", "evidence_photo_ids", "status", "explanation"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      if (item.status !== "observed") fail("OBSERVATION_STATUS_INVALID", "Visible observation должно иметь status observed.");
      const evidence = uniqueTextList(item.evidence_photo_ids, 1, 8, 200);
      if (evidence.some((id) => !photoIds.has(id))) fail("OBSERVATION_PHOTO_MISMATCH", "Наблюдение ссылается на неизвестную фотографию.");
      return { id: identifier(item.id), field: identifier(item.field), value: boundedText(item.value, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000), evidencePhotoIds: evidence, status: "observed", explanation: boundedText(item.explanation, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000) };
    });
    const inferences = arrayBetween(value.inferences, 0, 30, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, ["id", "field", "value", "status", "uncertainty", "why_plausible", "confirm_or_reject"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      if (item.status !== "inferred" || !["low", "medium", "high"].includes(item.uncertainty)) fail("INFERENCE_STATUS_INVALID", "Inference должен быть помечен как inferred с uncertainty.");
      return { id: identifier(item.id), field: identifier(item.field), value: boundedText(item.value, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000), status: "inferred", uncertainty: item.uncertainty, whyPlausible: boundedText(item.why_plausible, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000), confirmOrReject: boundedText(item.confirm_or_reject, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000) };
    });
    const unknowns = arrayBetween(value.unknowns, 1, 30, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, ["id", "field", "explanation"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      return { id: identifier(item.id), field: identifier(item.field), explanation: boundedText(item.explanation, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000) };
    });
    const questions = arrayBetween(value.questions, 0, 20, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, ["id", "text", "reason"], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      return { id: identifier(item.id), text: boundedText(item.text, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000), reason: boundedText(item.reason, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000) };
    });
    const observationIds = new Set(observations.map((entry) => entry.id));
    const inferenceIds = new Set(inferences.map((entry) => entry.id));
    const options = arrayBetween(value.technology_options, 1, 3, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((raw) => {
      const item = exactObject(raw, [
        "option_id", "name", "construction_summary", "knitting_direction", "seam_mode", "major_components",
        "shaping_approach", "yarn_characteristics", "tools_and_techniques", "expected_visual_similarity",
        "deliberate_differences", "advantages", "risks", "difficulty_explanation", "missing_inputs_before_calculation",
        "evidence_observation_ids", "assumption_inference_ids",
      ], "PROVIDER_RESPONSE_SCHEMA_INVALID");
      const evidenceIds = uniqueTextList(item.evidence_observation_ids, 0, 40, 200);
      const assumptionIds = uniqueTextList(item.assumption_inference_ids, 0, 30, 200);
      if (evidenceIds.some((id) => !observationIds.has(id)) || assumptionIds.some((id) => !inferenceIds.has(id))) {
        fail("TECHNOLOGY_EVIDENCE_MISMATCH", "Технология ссылается на неизвестное наблюдение или предположение.");
      }
      return {
        optionId: identifier(item.option_id), name: boundedText(item.name, "PROVIDER_RESPONSE_SCHEMA_INVALID", 300),
        constructionSummary: boundedText(item.construction_summary, "PROVIDER_RESPONSE_SCHEMA_INVALID", 4000),
        knittingDirection: boundedText(item.knitting_direction, "PROVIDER_RESPONSE_SCHEMA_INVALID", 500),
        seamMode: boundedText(item.seam_mode, "PROVIDER_RESPONSE_SCHEMA_INVALID", 500),
        majorComponents: uniqueTextList(item.major_components, 1, 30, 1000),
        shapingApproach: boundedText(item.shaping_approach, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000),
        yarnCharacteristics: uniqueTextList(item.yarn_characteristics, 1, 20, 1000),
        toolsAndTechniques: uniqueTextList(item.tools_and_techniques, 1, 30, 1000),
        expectedVisualSimilarity: boundedText(item.expected_visual_similarity, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000),
        deliberateDifferences: uniqueTextList(item.deliberate_differences, 0, 20, 1000),
        advantages: uniqueTextList(item.advantages, 1, 20, 1000), risks: uniqueTextList(item.risks, 1, 20, 1000),
        difficultyExplanation: boundedText(item.difficulty_explanation, "PROVIDER_RESPONSE_SCHEMA_INVALID", 2000),
        missingInputsBeforeCalculation: uniqueTextList(item.missing_inputs_before_calculation, 1, 30, 1000),
        evidenceObservationIds: evidenceIds, assumptionInferenceIds: assumptionIds,
      };
    });
    uniqueIds([...observations, ...inferences, ...unknowns, ...questions], "id");
    uniqueIds(options, "optionId");
    const normalized = {
      contractVersion: CONTRACT_VERSION,
      sourceIdentity: {
        projectId: identity.project_id,
        projectRevision: identity.project_revision,
        referencePhotos: copy(identity.reference_photos),
        requestFingerprint: identity.request_fingerprint,
      },
      provider: { provider: config.provider, model: config.model },
      visibleObservations: observations,
      inferences,
      unknowns,
      questions,
      technologyOptions: options,
      analysisFingerprint: "",
    };
    normalized.analysisFingerprint = fnv1a32({ ...normalized, analysisFingerprint: undefined });
    return freeze(normalized);
  }

  function validateAnalysisRequest(request) {
    const value = exactObject(request, [
      "contract_version", "request_id", "project_id", "project_revision", "reference_photos", "user_clarifications", "request_fingerprint",
    ], "ANALYSIS_REQUEST_SCHEMA_INVALID");
    if (value.contract_version !== CONTRACT_VERSION || !text(value.request_id) || !UUID_V7.test(value.project_id) || !Number.isSafeInteger(value.project_revision) || value.project_revision < 1) {
      fail("ANALYSIS_REQUEST_SCHEMA_INVALID", "Analysis request имеет неверную identity.");
    }
    const photos = arrayBetween(value.reference_photos, 1, 12, "ANALYSIS_REQUEST_SCHEMA_INVALID");
    photos.forEach((photo) => {
      exactObject(photo, ["photo_id", "sha256", "mime_type"], "ANALYSIS_REQUEST_SCHEMA_INVALID");
      if (!UUID_V7.test(photo.photo_id) || !SHA256.test(photo.sha256) || !["image/jpeg", "image/png", "image/webp"].includes(photo.mime_type)) fail("ANALYSIS_REQUEST_SCHEMA_INVALID", "Reference photo identity повреждена.");
    });
    if (new Set(photos.map((photo) => photo.photo_id)).size !== photos.length || new Set(photos.map((photo) => photo.sha256)).size !== photos.length) fail("ANALYSIS_REQUEST_DUPLICATE_PHOTO", "Одна фотография указана повторно.");
    arrayBetween(value.user_clarifications, 0, 100, "ANALYSIS_REQUEST_SCHEMA_INVALID").forEach((entry) => exactObject(entry, ["clarification_id", "type", "text", "target_observation_id"], "ANALYSIS_REQUEST_SCHEMA_INVALID"));
    if (requestFingerprint(value) !== value.request_fingerprint) fail("ANALYSIS_REQUEST_FINGERPRINT_MISMATCH", "Analysis request не прошёл проверку целостности.");
    return true;
  }

  function requireValidState(value) {
    exactKeys(value, [
      "contractVersion", "schemaVersion", "kind", "projectId", "calculationId", "revision", "status", "source",
      "request", "provider", "analysis", "clarifications", "ownerDecision", "nextStageBoundary", "staleReasons", "audit",
      "createdAt", "updatedAt", "fingerprint",
    ]);
    if (value.contractVersion !== CONTRACT_VERSION || value.schemaVersion !== 1 || value.kind !== PROGRESS_KIND) fail("STATE_INVALID", "Состояние photo-to-technology имеет неверную версию.");
    uuid(value.projectId, "STATE_INVALID"); uuid(value.calculationId, "STATE_INVALID"); positiveInteger(value.revision, "STATE_INVALID");
    normalizePhotos(value.source?.referencePhotos || []);
    if (value.source?.projectId !== value.projectId || !positiveInteger(value.source?.projectRevision, "STATE_INVALID") || !FINGERPRINT.test(value.source?.fingerprint || "")) fail("STATE_INVALID", "Source identity повреждена.");
    if (value.request) validateAnalysisRequest(value.request);
    normalizeProviderConfiguration(value.provider);
    if (value.analysis) {
      if (value.analysis.contractVersion !== CONTRACT_VERSION || !FINGERPRINT.test(value.analysis.analysisFingerprint || "")) fail("STATE_INVALID", "Сохранённый анализ повреждён.");
      if (value.status !== "stale" && value.analysis.sourceIdentity.requestFingerprint !== value.request?.request_fingerprint) fail("STATE_INVALID", "Анализ не связан с сохранённым запросом.");
    }
    if (!Array.isArray(value.clarifications) || !Array.isArray(value.audit) || !Array.isArray(value.staleReasons)) fail("STATE_INVALID", "История photo-to-technology повреждена.");
    validateOwnerDecision(value.ownerDecision, value.analysis);
    timestamp(value.createdAt); timestamp(value.updatedAt);
    if (stateFingerprint(value) !== value.fingerprint) fail("STATE_FINGERPRINT_MISMATCH", "Состояние photo-to-technology не прошло проверку целостности.");
    return true;
  }

  function projectStateAgainstAggregate(state, aggregate) {
    const current = validCopy(state);
    const photos = normalizePhotos((aggregate?.photos || []).filter((photo) => !photo.deleted_at && photo.purpose === PHOTO_PURPOSE));
    const currentIdentity = sourceIdentity(current.projectId, aggregate.project.revision, photos);
    const samePhotos = canonicalize(currentIdentity.referencePhotos) === canonicalize(current.source.referencePhotos);
    if (samePhotos) return freeze(current);
    const projected = copy(current);
    projected.source = currentIdentity;
    projected.status = current.analysis ? "stale" : photos.length ? "collecting" : "waiting_for_photos";
    projected.staleReasons = current.analysis ? ["reference_photos_changed"] : [];
    projected.request = null;
    projected.ownerDecision = ownerDecision("awaiting_decision", null, "", projected.updatedAt);
    projected.fingerprint = stateFingerprint(projected);
    return freeze(projected);
  }

  async function ensureForProject(repository, projectId) {
    let aggregate = await repository.getProject(projectId);
    let calculation = activeCalculation(aggregate);
    if (!calculation) {
      const created = await repository.addCalculation(
        projectId,
        { workflow_kind: "garment_reference", version: 1, source: "reference_photos" },
        { status: "READY", normalized_inputs: { source: "reference_photos" }, axes: {}, warnings: [], errors: [], clarifications: [], canon_version: "garment-reference-1", specification_version: CONTRACT_VERSION },
        { engine_version: "garment-reference-1" },
      );
      aggregate = await repository.getProject(created.project.project_id);
      calculation = activeCalculation(aggregate);
    }
    if (calculation?.request?.workflow_kind !== "garment_reference") fail("CALCULATION_MISMATCH", "Проект уже относится к другому пользовательскому пути.");
    let progress = aggregate.progress.find((entry) => entry.kind === PROGRESS_KIND && entry.calculation_id === calculation.calculation_id && entry.epoch === 1);
    if (!progress) {
      const initial = createInitialState({ projectId, calculationId: calculation.calculation_id, projectRevision: aggregate.project.revision, photos: aggregate.photos.filter((photo) => photo.purpose === PHOTO_PURPOSE && !photo.deleted_at) });
      progress = await repository.ensureCalculationProgress(projectId, calculation.calculation_id, PROGRESS_KIND, initial, { projectStage: "garment_reference_collecting", operationKind: "GARMENT_REFERENCE_ANALYSIS_CREATED" });
      aggregate = await repository.getProject(projectId);
    }
    requireValidState(progress.state);
    return { aggregate, project: aggregate.project, calculation, progress, state: projectStateAgainstAggregate(progress.state, aggregate) };
  }

  async function persist(repository, inspected, state, operationKind, projectStage) {
    requireValidState(state);
    await repository.updateCalculationProgress(inspected.project.project_id, inspected.calculation.calculation_id, PROGRESS_KIND, state, { baseProgressRevision: inspected.progress.revision, operationKind, projectStage });
    return ensureForProject(repository, inspected.project.project_id);
  }

  async function addPhotosForProject(repository, projectId, files) {
    let inspected = await ensureForProject(repository, projectId);
    if (!Array.isArray(files) || !files.length) return inspected;
    if (inspected.state.source.referencePhotos.length + files.length > 12) {
      fail("PHOTO_SET_INVALID", "Можно сохранить не больше 12 reference photos.");
    }
    files.forEach((file) => {
      if (!(file instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        fail("PHOTO_TYPE_INVALID", "Поддерживаются только JPEG, PNG и WebP фотографии.");
      }
      if (file.size <= 0 || file.size > MAX_SOURCE_PHOTO_BYTES) {
        fail("PHOTO_SIZE_INVALID", "Фотография изделия должна быть не больше 20 МБ.");
      }
    });
    const photos = [];
    for (const file of files) photos.push(await repository.addPhoto(projectId, file, { purpose: PHOTO_PURPOSE, calculation_id: inspected.calculation.calculation_id, display_name: file.name || "Фотография изделия" }));
    const aggregate = await repository.getProject(projectId);
    inspected = { ...inspected, aggregate, project: aggregate.project };
    const next = addReferencePhotos(inspected.progress.state, photos, { projectRevision: aggregate.project.revision });
    if (next.fingerprint === inspected.progress.state.fingerprint) return ensureForProject(repository, projectId);
    return persist(repository, inspected, next, "GARMENT_REFERENCE_PHOTOS_ADDED", next.status === "stale" ? "garment_reference_stale" : "garment_reference_collecting");
  }

  async function removePhotoForProject(repository, projectId, photoId) {
    let inspected = await ensureForProject(repository, projectId);
    const selected = inspected.state.source.referencePhotos.find((photo) => photo.photoId === photoId);
    if (!selected) return inspected;
    await repository.deletePhoto(projectId, photoId);
    const aggregate = await repository.getProject(projectId);
    inspected = { ...inspected, aggregate, project: aggregate.project };
    const next = removeReferencePhoto(inspected.progress.state, photoId, { projectRevision: aggregate.project.revision });
    return persist(repository, inspected, next, "GARMENT_REFERENCE_PHOTO_REMOVED", next.status === "stale" ? "garment_reference_stale" : "garment_reference_collecting");
  }

  async function recordClarificationForProject(repository, projectId, input) {
    const inspected = await ensureForProject(repository, projectId);
    const next = recordClarification(inspected.state, input);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    return persist(repository, inspected, next, "GARMENT_REFERENCE_CLARIFICATION_RECORDED", next.status === "stale" ? "garment_reference_stale" : "garment_reference_collecting");
  }

  async function markProviderDisabledForProject(repository, projectId, configuration = {}) {
    const inspected = await ensureForProject(repository, projectId);
    const next = markProviderUnavailable(inspected.state, configuration);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    return persist(repository, inspected, next, "GARMENT_REFERENCE_PROVIDER_DISABLED", "garment_reference_provider_disabled");
  }

  async function applyProviderResponseForProject(repository, projectId, payload, configuration = {}, options = {}) {
    const inspected = await ensureForProject(repository, projectId);
    const next = applyProviderResponse(inspected.state, payload, configuration, options);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    return persist(repository, inspected, next, "GARMENT_REFERENCE_ANALYSIS_VALIDATED", "garment_reference_awaiting_decision");
  }

  async function applyPilotProviderResponseForProject(repository, projectId, payload, configuration = {}, options = {}) {
    const inspected = await ensureForProject(repository, projectId);
    const next = applyPilotProviderResponse(inspected.state, payload, configuration, options);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    return persist(repository, inspected, next, "OPENAI_GARMENT_PHOTO_PILOT_RESPONSE_VALIDATED", "garment_reference_awaiting_decision");
  }

  async function decideForProject(repository, projectId, input) {
    const inspected = await ensureForProject(repository, projectId);
    const next = decideTechnology(inspected.state, input);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    return persist(repository, inspected, next, "GARMENT_REFERENCE_OWNER_DECISION", `garment_reference_${next.status}`);
  }

  async function selectDraftForProject(repository, projectId, optionId) {
    const inspected = await ensureForProject(repository, projectId);
    const next = selectTechnologyDraft(inspected.state, optionId);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    return persist(repository, inspected, next, "GARMENT_REFERENCE_DECISION_DRAFTED", "garment_reference_draft");
  }

  async function confirmDecisionForProject(repository, projectId, options = {}) {
    const inspected = await ensureForProject(repository, projectId);
    const next = confirmTechnologyDecision(inspected.state, options);
    return persist(repository, inspected, next, "GARMENT_REFERENCE_DECISION_CONFIRMED", "garment_reference_confirmed");
  }

  async function reopenDecisionForProject(repository, projectId) {
    const inspected = await ensureForProject(repository, projectId);
    const next = reopenTechnologyDecision(inspected.state);
    if (next.fingerprint === inspected.state.fingerprint) return inspected;
    return persist(repository, inspected, next, "GARMENT_REFERENCE_DECISION_REOPENED", "garment_reference_awaiting_decision");
  }

  function sourceIdentity(projectId, projectRevision, photos) {
    const referencePhotos = normalizePhotos(photos);
    const source = { projectId, projectRevision, referencePhotos, fingerprint: "" };
    source.fingerprint = fnv1a32({ projectId, projectRevision, referencePhotos });
    return source;
  }

  function normalizePhotos(photos) {
    if (!Array.isArray(photos) || photos.length > 12) fail("PHOTO_SET_INVALID", "Набор reference photos имеет неверный формат.");
    const normalized = photos.map((photo) => {
      const photoId = photo?.photoId || photo?.photo_id;
      const sha256 = String(photo?.sha256 || "").toLowerCase();
      const mimeType = photo?.mimeType || photo?.source_mime || photo?.normalized_mime;
      const purpose = photo?.purpose || PHOTO_PURPOSE;
      if (!UUID_V7.test(photoId || "") || !SHA256.test(sha256) || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) || purpose !== PHOTO_PURPOSE) fail("PHOTO_IDENTITY_INVALID", "Reference photo не прошла проверку identity и purpose.");
      return { photoId, sha256, mimeType, displayName: nullableText(photo?.displayName || photo?.display_name, 120) || "Фотография изделия", purpose: PHOTO_PURPOSE };
    }).sort(photoSort);
    if (new Set(normalized.map((photo) => photo.photoId)).size !== normalized.length || new Set(normalized.map((photo) => photo.sha256)).size !== normalized.length) fail("PHOTO_DUPLICATE", "Одна фотография добавлена повторно.");
    return normalized;
  }

  function normalizeProviderConfiguration(value = {}) {
    const provider = text(value.provider) || DEFAULT_PROVIDER;
    const model = text(value.model) || DEFAULT_MODEL;
    if (provider !== DEFAULT_PROVIDER || model !== DEFAULT_MODEL || typeof (value.enabled ?? false) !== "boolean") fail("PROVIDER_CONFIGURATION_INVALID", "Server vision configuration не поддерживается.");
    return { provider, model, enabled: value.enabled === true, status: text(value.status) || (value.enabled ? "available" : "disabled"), message: nullableText(value.message, 1000) || (value.enabled ? "" : DISABLED_MESSAGE) };
  }

  function stateFingerprint(state) {
    const core = copy(state); delete core.fingerprint;
    return fnv1a32(core);
  }

  function requestFingerprint(request) {
    const core = copy(request); delete core.request_fingerprint;
    return fnv1a32(core);
  }

  function commit(previous, next, event, nowValue, details) {
    const now = timestamp(nowValue);
    next.revision = previous.revision + 1;
    next.updatedAt = now;
    next.audit.push(auditEntry(event, next.revision, now, details));
    next.fingerprint = stateFingerprint(next);
    requireValidState(next);
    return freeze(next);
  }

  function ownerDecision(status, optionId, comment, at, analysis = null) {
    const bound = ["draft", "confirmed"].includes(status) && analysis;
    return {
      status,
      optionId,
      comment,
      decidedAt: status === "awaiting_decision" ? null : at,
      sourceAnalysisFingerprint: bound ? analysis.analysisFingerprint : null,
      sourceRequestFingerprint: bound ? analysis.sourceIdentity.requestFingerprint : null,
      sourceProjectId: bound ? analysis.sourceIdentity.projectId : null,
      sourceProjectRevision: bound ? analysis.sourceIdentity.projectRevision : null,
      confirmedAt: status === "confirmed" ? at : null,
      readyForTechnologyPlan: status === "confirmed",
    };
  }
  function decisionCore(value) {
    return {
      status: value.status, optionId: value.optionId, comment: value.comment,
      sourceAnalysisFingerprint: value.sourceAnalysisFingerprint || null,
      sourceRequestFingerprint: value.sourceRequestFingerprint || null,
      sourceProjectId: value.sourceProjectId || null,
      sourceProjectRevision: value.sourceProjectRevision || null,
      confirmedAt: value.confirmedAt || null,
      readyForTechnologyPlan: value.readyForTechnologyPlan === true,
      ...(value.constructionIdentity ? { constructionIdentity: value.constructionIdentity } : {}),
    };
  }
  function decisionMatchesAnalysis(decision, analysis) {
    return Boolean(
      analysis && decision &&
      decision.sourceAnalysisFingerprint === analysis.analysisFingerprint &&
      decision.sourceRequestFingerprint === analysis.sourceIdentity.requestFingerprint &&
      decision.sourceProjectId === analysis.sourceIdentity.projectId &&
      decision.sourceProjectRevision === analysis.sourceIdentity.projectRevision,
    );
  }
  function validateOwnerDecision(value, analysis) {
    if (!value || !DECISIONS.includes(value.status)) fail("STATE_INVALID", "Owner decision повреждён.");
    if (value.constructionIdentity !== undefined && (value.status !== "confirmed" || value.constructionIdentity !== "seamed_set_in_sleeve")) fail("STATE_INVALID", "Явный выбор конструкции повреждён.");
    if (value.status === "selected") return true;
    if (!["draft", "confirmed"].includes(value.status)) return true;
    if (!value.optionId || !analysis?.technologyOptions.some((entry) => entry.optionId === value.optionId) || !decisionMatchesAnalysis(value, analysis)) {
      fail("STATE_INVALID", "Решение относится к другому анализу или варианту.");
    }
    if (value.status === "draft" && (value.confirmedAt !== null || value.readyForTechnologyPlan !== false)) fail("STATE_INVALID", "Черновик ошибочно отмечен готовым.");
    if (value.status === "confirmed" && (timestamp(value.confirmedAt) !== value.confirmedAt || value.readyForTechnologyPlan !== true)) fail("STATE_INVALID", "Подтверждение не готово к передаче.");
    return true;
  }
  function auditEntry(event, revision, at, details) { return { event, revision, at, details: copy(details || {}) }; }
  function activeCalculation(aggregate) { return aggregate.calculations.find((entry) => entry.calculation_id === aggregate.project.active_calculation_id); }
  function photoSort(left, right) { return left.photoId.localeCompare(right.photoId); }
  function validCopy(state) { requireValidState(state); return copy(state); }
  function exactObject(value, keys, code) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(code, "JSON object не соответствует строгому контракту."); return value; }
  function exactKeys(value, keys) { exactObject(value, keys, "STATE_INVALID"); }
  function arrayBetween(value, min, max, code) { if (!Array.isArray(value) || value.length < min || value.length > max) fail(code, "Array выходит за границы контракта."); return value; }
  function uniqueTextList(value, min, max, textMax) { const values = arrayBetween(value, min, max, "PROVIDER_RESPONSE_SCHEMA_INVALID").map((entry) => boundedText(entry, "PROVIDER_RESPONSE_SCHEMA_INVALID", textMax)); if (new Set(values).size !== values.length) fail("PROVIDER_RESPONSE_SCHEMA_INVALID", "Array содержит дубли."); return values; }
  function uniqueIds(values, field) { if (new Set(values.map((entry) => entry[field])).size !== values.length) fail("PROVIDER_RESPONSE_SCHEMA_INVALID", "Stable IDs должны быть уникальны."); }
  function identifier(value) { const result = boundedText(value, "PROVIDER_RESPONSE_SCHEMA_INVALID", 200); if (!/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(result)) fail("PROVIDER_RESPONSE_SCHEMA_INVALID", "Stable ID имеет неверный формат."); return result; }
  function boundedText(value, code, maximum) { if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) fail(code, "Текстовое поле выходит за границы контракта."); return value.trim(); }
  function nullableText(value, maximum) { if (value === null || value === undefined || value === "") return null; if (typeof value !== "string" || value.trim().length > maximum) fail("TEXT_INVALID", "Текстовое поле выходит за границы контракта."); return value.trim(); }
  function text(value) { return typeof value === "string" && value.trim() ? value.trim() : ""; }
  function uuid(value, code) { if (!UUID_V7.test(String(value || ""))) fail(code, "UUID identity повреждена."); return value; }
  function positiveInteger(value, code) { if (!Number.isSafeInteger(value) || value < 1) fail(code, "Revision должна быть положительным целым числом."); return value; }
  function timestamp(value) { const result = value || new Date().toISOString(); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || !Number.isFinite(Date.parse(result))) fail("TIMESTAMP_INVALID", "Время действия повреждено."); return result; }
  function stableStrings(values) { return [...new Set(values)].sort(); }
  async function blobToBase64(blob) { const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ""; for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]); return globalObject.btoa ? globalObject.btoa(binary) : Buffer.from(bytes).toString("base64"); }
  function bytesToBase64(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]); return globalObject.btoa ? globalObject.btoa(binary) : Buffer.from(bytes).toString("base64"); }
  async function sha256Hex(bytes) { const digest = await globalObject.crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
  function makeId(prefix) { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`; }
  function fnv1a32(value) { const source = canonicalize(value); let hash = 0x811c9dc5; for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`; }
  function canonicalize(value) { if (value === undefined) return "undefined"; if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`; return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; }
  function fail(code, message, details) { throw new GarmentReferenceError(code, message, details); }

  const api = Object.freeze({
    CONTRACT_VERSION, SCHEMA_VERSION, PROGRESS_KIND, PHOTO_PURPOSE, DEFAULT_PROVIDER, DEFAULT_MODEL,
    MAX_SOURCE_PHOTO_BYTES, MAX_SANITIZED_IMAGE_BYTES, MAX_SANITIZED_IMAGE_DIMENSION, MAX_SANITIZED_IMAGE_PIXELS,
    DISABLED_MESSAGE, DECISIONS, CLARIFICATION_TYPES, GarmentReferenceError,
    createInitialState, addReferencePhotos, removeReferencePhoto, recordClarification, buildAnalysisRequest, buildServerRequest,
    buildPilotServerRequest, preparePilotPhoto, sanitizePhotoForPilot, markProviderUnavailable, applyProviderResponse, applyPilotProviderResponse, decideTechnology,
    selectTechnologyDraft, confirmTechnologyDecision, reopenTechnologyDecision, technologyDecisionHandoff, validateProviderResponse,
    validateAnalysisRequest, requireValidState, projectStateAgainstAggregate, normalizePhotos,
    normalizeProviderConfiguration, stateFingerprint, requestFingerprint, canonicalize,
    ensureForProject, addPhotosForProject, removePhotoForProject, recordClarificationForProject, markProviderDisabledForProject,
    applyProviderResponseForProject, applyPilotProviderResponseForProject, decideForProject,
    selectDraftForProject, confirmDecisionForProject, reopenDecisionForProject,
  });
  globalObject.YarnAIGarmentReferenceAnalysis = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
