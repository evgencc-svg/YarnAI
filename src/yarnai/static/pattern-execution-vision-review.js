"use strict";

(function exposePatternExecutionVisionReview(globalObject) {
  const VERSION = 1;
  const DEFAULT_PROVIDER = "openai";
  const DEFAULT_MODEL = "gpt-5.6-terra";
  const MAX_INITIAL_PHOTOS = 3;
  const VERDICTS = Object.freeze([
    "verified_continue", "more_evidence_required", "correction_required", "cannot_determine",
  ]);
  const UI_MESSAGES = Object.freeze({
    verified_continue: "По фото всё совпадает. Можно продолжать.",
    more_evidence_required: "Этого фото недостаточно. Нужен ещё такой-то снимок.",
    correction_required: "Похоже на отклонение. Проверь и исправь вот это перед продолжением.",
    cannot_determine: "По этим фото нельзя определить уверенно.",
  });
  const DISABLED_MESSAGE = "Автоматическая фотопроверка пока не подключена. Можно продолжить без фотопроверки.";

  class PatternExecutionVisionReviewError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "PatternExecutionVisionReviewError";
      this.code = code;
      this.userMessage = message;
      this.details = copy(details);
    }
  }

  function initializeCompletedStepReview(step, session, options = {}) {
    requireCompletedStep(step);
    requireCurrentSessionBinding(step, session);
    if (step.visionReview) {
      if (existingReviewMatches(step.visionReview.identity, step, session)) return copy(step);
      throw reviewError("review_identity_mismatch", "Сохранённая фотопроверка относится к другой версии шага.");
    }
    checkRevision(step, options.expectedRevision);
    const now = options.now || timestampNow();
    const next = mutable(step);
    next.revision += 1;
    next.updatedAt = now;
    const identity = identityFor(step, session, options.checkpointRecord || null);
    next.visionReview = {
      schemaVersion: VERSION,
      reviewSessionId: options.reviewSessionId || makeId(),
      status: "decision_required",
      decision: null,
      visualVerification: false,
      identity,
      captureGuidance: captureGuidance(step),
      photos: [],
      request: null,
      automaticReview: {
        status: "not_requested", provider: null, model: null, verdict: null,
        uiMessage: null, observations: [], missingEvidence: [],
      },
      createdAt: now,
      updatedAt: now,
      events: [{ type: "decision_requested", at: now, operationId: options.operationId || null }],
      operations: options.operationId ? [{ operationId: options.operationId, type: "initialize" }] : [],
    };
    next.visionReviewHistory = Array.isArray(next.visionReviewHistory) ? next.visionReviewHistory : [];
    return finish(next);
  }

  function selfConfirm(step, options = {}) {
    return mutateReview(step, "self_confirm", options, (review, now) => {
      if (review.decision === "self_confirmed") return false;
      if (![
        "decision_required", "automatic_unavailable", "more_evidence_required",
        "correction_required", "cannot_determine", "photos_ready",
      ].includes(review.status)) {
        throw reviewError("self_confirmation_not_allowed", "Сейчас нельзя продолжить без фотопроверки.");
      }
      review.status = "self_confirmed";
      review.decision = "self_confirmed";
      review.visualVerification = false;
      review.updatedAt = now;
      review.events.push({
        type: "self_confirmed", at: now, operationId: options.operationId,
        automaticReviewStatus: review.automaticReview.status,
      });
      return true;
    });
  }

  function createPhotoReviewRequest(step, photos, gatewayConfiguration, options = {}) {
    return mutateReview(step, "create_photo_request", options, (review, now) => {
      const normalizedPhotos = normalizeStoredPhotos(photos);
      const duplicate = review.request && canonicalize(review.request.photos) === canonicalize(normalizedPhotos);
      if (duplicate) return false;
      if (review.request) throw reviewError("duplicate_review", "Для этого шага уже создан запрос фотопроверки.");
      const gateway = normalizeGatewayConfiguration(gatewayConfiguration);
      review.photos = normalizedPhotos;
      review.request = {
        schemaVersion: VERSION,
        reviewSessionId: review.reviewSessionId,
        identity: copy(review.identity),
        photos: normalizedPhotos.map((photo) => ({
          photoId: photo.photoId, sha256: photo.sha256, mimeType: photo.mimeType,
        })),
        expectedVisibleState: copy(review.captureGuidance.expectedVisibleState),
        photoRequirements: copy(review.captureGuidance.photoRequirements),
        allowedChecks: copy(review.captureGuidance.allowedChecks),
        visualLimits: copy(review.captureGuidance.visualLimits),
        createdAt: now,
      };
      review.status = gateway.enabled ? "photos_ready" : "automatic_unavailable";
      review.decision = null;
      review.visualVerification = false;
      review.automaticReview = {
        status: gateway.enabled ? "ready_to_submit" : "unavailable",
        provider: gateway.provider,
        model: gateway.model,
        verdict: null,
        uiMessage: gateway.enabled ? null : DISABLED_MESSAGE,
        observations: [],
        missingEvidence: [],
      };
      review.updatedAt = now;
      review.events.push({
        type: gateway.enabled ? "photo_request_ready" : "automatic_review_unavailable",
        at: now, operationId: options.operationId, photoCount: normalizedPhotos.length,
      });
      return true;
    });
  }

  function applyValidatedVerdict(step, response, options = {}) {
    return mutateReview(step, "apply_verdict", options, (review, now) => {
      const verdict = validateSanitizedVerdict(review, response);
      if (review.automaticReview.verdict) {
        if (canonicalize(review.automaticReview.verdict) === canonicalize(verdict)) return false;
        throw reviewError("duplicate_review", "Для этого запроса уже сохранён другой verdict.");
      }
      review.status = verdict.verdict;
      review.decision = verdict.verdict === "verified_continue" ? "automatic_verified" : null;
      review.visualVerification = verdict.verdict === "verified_continue";
      review.automaticReview = {
        status: "completed", provider: verdict.provider, model: verdict.model,
        verdict: verdict.verdict, uiMessage: UI_MESSAGES[verdict.verdict],
        observations: copy(verdict.observations), missingEvidence: copy(verdict.missing_evidence),
      };
      review.updatedAt = now;
      review.events.push({ type: "validated_verdict_saved", at: now, operationId: options.operationId, verdict: verdict.verdict });
      return true;
    });
  }

  async function buildServerRequest(step, photoRecords) {
    requireReview(step);
    const review = step.visionReview;
    if (!review.request) throw reviewError("photo_request_missing", "Запрос фотопроверки ещё не создан.");
    const recordMap = new Map(photoRecords.map((entry) => [entry?.metadata?.photo_id, entry]));
    const photos = [];
    for (const selected of review.request.photos) {
      const record = recordMap.get(selected.photoId);
      if (!record?.blob || record.metadata?.sha256 !== selected.sha256) {
        throw reviewError("photo_identity_mismatch", "Локальная фотография не совпадает с сохранённым запросом.");
      }
      photos.push({
        photo_id: selected.photoId,
        sha256: selected.sha256,
        mime_type: selected.mimeType,
        content_base64: await blobToBase64(record.blob),
      });
    }
    return {
      schema_version: VERSION,
      review_session_id: review.reviewSessionId,
      identity: serverIdentity(review.identity),
      photos,
      expected_visible_state: {
        action_title: review.request.expectedVisibleState.actionTitle,
        instruction: review.request.expectedVisibleState.instruction,
        expected_result: review.request.expectedVisibleState.expectedResult,
        references: copy(review.request.expectedVisibleState.references),
      },
      photo_requirements: copy(review.request.photoRequirements),
      allowed_checks: copy(review.request.allowedChecks),
      visual_limits: copy(review.request.visualLimits),
      current_execution_state: {
        status: "completed", integrity: "current", identity: serverIdentity(review.identity),
      },
      follow_up: false,
    };
  }

  async function fetchGatewayConfiguration() {
    const response = await globalObject.fetch("/api/v1/vision-reviews/configuration", {
      method: "GET", credentials: "same-origin", cache: "no-store",
    });
    if (!response.ok) return normalizeGatewayConfiguration(null);
    return normalizeGatewayConfiguration(await response.json());
  }

  async function submitServerReview(payload) {
    const response = await globalObject.fetch("/api/v1/vision-reviews", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      const error = reviewError(
        body?.error?.code || "vision_gateway_unavailable",
        "Автоматическая фотопроверка недоступна. Можно продолжить без фотопроверки.",
      );
      throw error;
    }
    return body;
  }

  function canAdvance(step) {
    const review = step?.visionReview;
    return Boolean(
      step?.status === "completed" && review &&
      (review.decision === "self_confirmed" || review.status === "verified_continue")
    );
  }

  function archiveForNextStep(step) {
    requireReview(step);
    if (!canAdvance(step)) throw reviewError("vision_review_decision_required", "Сначала выберите способ продолжения после завершённого шага.");
    return copy(step.visionReview);
  }

  function captureGuidance(step) {
    const snapshot = step.immutableSnapshot;
    const references = [
      `step:${step.id}`,
      `action:${step.actionId}`,
      `plan:${step.sourcePlanId}@${step.sourcePlanRevision}`,
    ];
    if (step.checkpointId) references.push(`checkpoint:${step.checkpointId}`);
    const requirements = [
      `Покажи целиком результат шага «${snapshot.action.title}».`,
      "Сними при ровном свете без фильтров и размытия.",
    ];
    const progress = step.completionState?.finalProgressValues || step.progressState;
    if (Number.isInteger(progress?.target)) {
      requirements.push(`Если возможно, покажи цель шага: ${progress.target}${progress.unit ? ` ${progress.unit}` : ""}.`);
    }
    const checks = ["overall_step_state"];
    if (progress?.type === "stitches") checks.push("stitch_count");
    if (progress?.type === "rows") checks.push("row_count");
    const expectedResult = stringifyExpected(snapshot.expectedResult);
    return {
      expectedVisibleState: {
        actionTitle: snapshot.action.title,
        instruction: snapshot.instruction || "",
        expectedResult,
        references,
      },
      photoRequirements: requirements,
      allowedChecks: checks,
      visualLimits: [
        "Количество петель или рядов нельзя подтверждать, если оно не видно надёжно.",
        "Положение маркера, край и детали конструкции нельзя додумывать за пределами фото.",
        "При недостаточной видимости допустим только запрос дополнительного фото или cannot_determine.",
      ],
    };
  }

  function identityFor(step, session, checkpointRecord) {
    const checkpoint = step.checkpointId ? normalizeCheckpointIdentity(step, checkpointRecord) : null;
    return {
      projectId: step.projectId,
      sessionId: session.id,
      sessionRevision: session.revision,
      planId: session.sourceExecutionPlanId,
      planRevision: session.sourceExecutionPlanRevision,
      planFingerprint: session.sourceExecutionPlanFingerprint,
      actionId: step.actionId,
      stepId: step.id,
      stepRevision: step.revision,
      checkpointIdentity: checkpoint,
    };
  }

  function normalizeCheckpointIdentity(step, record) {
    const state = record?.state || record || null;
    if (!state || state.checkpointId !== step.checkpointId || state.actionId !== step.actionId || !state.id || !Number.isInteger(state.revision) || !state.checkpointFingerprint) {
      throw reviewError("checkpoint_identity_unproven", "Identity контрольной точки не доказана.");
    }
    return { checkpointId: state.id, revision: state.revision, fingerprint: state.checkpointFingerprint };
  }

  function normalizeStoredPhotos(photos) {
    if (!Array.isArray(photos) || photos.length < 1 || photos.length > MAX_INITIAL_PHOTOS) {
      throw reviewError("photo_count_invalid", "Выбери от одной до трёх фотографий.");
    }
    const result = photos.map((photo) => {
      const photoId = text(photo?.photo_id || photo?.photoId);
      const sha256 = text(photo?.sha256).toLowerCase();
      const mimeType = text(photo?.source_mime || photo?.mimeType);
      const purpose = text(photo?.purpose);
      if (!photoId || !/^[0-9a-f]{64}$/.test(sha256) || !["image/jpeg", "image/png", "image/webp"].includes(mimeType) || purpose !== "STEP_VISION_REVIEW") {
        throw reviewError("photo_identity_invalid", "Сохранённая фотография не прошла проверку identity.");
      }
      return { photoId, sha256, mimeType };
    });
    if (new Set(result.map((entry) => entry.photoId)).size !== result.length || new Set(result.map((entry) => entry.sha256)).size !== result.length) {
      throw reviewError("duplicate_photo", "Одна и та же фотография выбрана повторно.");
    }
    return result;
  }

  function normalizeGatewayConfiguration(configuration) {
    const provider = text(configuration?.provider) || DEFAULT_PROVIDER;
    const model = text(configuration?.model) || DEFAULT_MODEL;
    if (provider !== DEFAULT_PROVIDER || !model) throw reviewError("gateway_configuration_invalid", "Конфигурация фотопроверки недействительна.");
    return { provider, model, enabled: configuration?.enabled === true };
  }

  function validateSanitizedVerdict(review, response) {
    if (!response || response.schema_version !== VERSION || response.review_session_id !== review.reviewSessionId) {
      throw reviewError("verdict_schema_invalid", "Ответ фотопроверки не прошёл строгую проверку.");
    }
    const outcome = text(response.verdict);
    if (!VERDICTS.includes(outcome) || response.ui_message !== UI_MESSAGES[outcome]) {
      throw reviewError("verdict_unknown", "Ответ содержит неизвестный verdict.");
    }
    const identity = clientIdentity(response.identity);
    if (!sameBinding(identity, review.identity)) throw reviewError("verdict_identity_mismatch", "Ответ относится к другой версии шага.");
    if (response.provider !== review.automaticReview.provider || response.model !== review.automaticReview.model) {
      throw reviewError("verdict_provider_mismatch", "Provider или model не совпадает с запросом.");
    }
    if (!Array.isArray(response.observations) || !Array.isArray(response.missing_evidence)) {
      throw reviewError("verdict_schema_invalid", "Ответ фотопроверки повреждён.");
    }
    return copy(response);
  }

  function mutateReview(step, type, options, apply) {
    requireCompletedStep(step);
    requireReview(step);
    const operationId = text(options.operationId);
    if (!operationId) throw reviewError("operation_id_required", "Для сохранения решения требуется operationId.");
    const existing = step.visionReview.operations.find((entry) => entry.operationId === operationId);
    if (existing) {
      if (existing.type !== type) throw reviewError("operation_id_reused", "operationId уже использован другой операцией.");
      return copy(step);
    }
    checkRevision(step, options.expectedRevision);
    const now = options.now || timestampNow();
    const next = mutable(step);
    const changed = apply(next.visionReview, now);
    if (changed === false) return copy(step);
    next.revision += 1;
    next.updatedAt = now;
    next.visionReview.operations = [...next.visionReview.operations, { operationId, type }].slice(-32);
    return finish(next);
  }

  function finish(step) {
    const stepApi = getStepApi();
    step.stepFingerprint = null;
    step.stepFingerprint = stepApi.calculateStepFingerprint(step);
    step.validation = stepApi.validateExecutionStep(step);
    step.stepFingerprint = null;
    step.stepFingerprint = stepApi.calculateStepFingerprint(step);
    return deepFreeze(step);
  }

  function requireCompletedStep(step) {
    if (!step || step.kind !== "PATTERN_EXECUTION_STEP" || step.status !== "completed") {
      throw reviewError("completed_step_required", "Фотопроверка доступна только после завершённого физического шага.");
    }
  }
  function requireReview(step) {
    if (!step.visionReview || step.visionReview.schemaVersion !== VERSION || !step.visionReview.identity) {
      throw reviewError("vision_review_missing", "Решение фотопроверки ещё не создано.");
    }
  }
  function requireCurrentSessionBinding(step, session) {
    const completed = Array.isArray(session?.execution?.actions) && session.execution.actions.some((entry) => entry.actionId === step.actionId && entry.status === "completed");
    if (!completed || session?.id !== step.sourceSessionId || session?.sourceExecutionPlanId !== step.sourcePlanId || session?.sourceExecutionPlanFingerprint !== step.sourcePlanFingerprint) {
      throw reviewError("source_identity_mismatch", "Сессия, план или action не совпадают с завершённым шагом.");
    }
  }
  function checkRevision(step, expectedRevision) {
    if (expectedRevision !== step.revision) throw reviewError("step_revision_conflict", "Шаг изменён в другой операции.");
  }
  function sameBinding(left, right) { return canonicalize(left) === canonicalize(right); }
  function existingReviewMatches(identity, step, session) {
    return Boolean(
      identity && identity.projectId === step.projectId && identity.sessionId === session.id &&
      identity.sessionRevision === session.revision && identity.planId === session.sourceExecutionPlanId &&
      identity.planRevision === session.sourceExecutionPlanRevision && identity.planFingerprint === session.sourceExecutionPlanFingerprint &&
      identity.actionId === step.actionId && identity.stepId === step.id && Number.isInteger(identity.stepRevision) &&
      identity.stepRevision > 0 && identity.stepRevision <= step.revision
    );
  }
  function serverIdentity(identity) {
    return {
      project_id: identity.projectId,
      session_id: identity.sessionId,
      session_revision: identity.sessionRevision,
      plan_id: identity.planId,
      plan_revision: identity.planRevision,
      plan_fingerprint: identity.planFingerprint,
      action_id: identity.actionId,
      step_id: identity.stepId,
      step_revision: identity.stepRevision,
      checkpoint_identity: identity.checkpointIdentity ? {
        checkpoint_id: identity.checkpointIdentity.checkpointId,
        revision: identity.checkpointIdentity.revision,
        fingerprint: identity.checkpointIdentity.fingerprint,
      } : null,
    };
  }
  function clientIdentity(identity) {
    return {
      projectId: identity?.project_id,
      sessionId: identity?.session_id,
      sessionRevision: identity?.session_revision,
      planId: identity?.plan_id,
      planRevision: identity?.plan_revision,
      planFingerprint: identity?.plan_fingerprint,
      actionId: identity?.action_id,
      stepId: identity?.step_id,
      stepRevision: identity?.step_revision,
      checkpointIdentity: identity?.checkpoint_identity ? {
        checkpointId: identity.checkpoint_identity.checkpoint_id,
        revision: identity.checkpoint_identity.revision,
        fingerprint: identity.checkpoint_identity.fingerprint,
      } : null,
    };
  }
  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return globalObject.btoa(binary);
  }
  function stringifyExpected(value) {
    if (value === null || value === undefined) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    return JSON.stringify(value);
  }
  function canonicalize(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
    return JSON.stringify(value);
  }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  function mutable(value) { return copy(value); }
  function timestampNow() { return new Date().toISOString(); }
  function makeId() { return globalObject.YarnAIProjectSystem?.uuidv7?.() || globalObject.crypto?.randomUUID?.() || `vision:${Date.now()}`; }
  function getStepApi() {
    const api = globalObject.YarnAIPatternExecutionStep;
    if (!api) throw reviewError("execution_step_api_missing", "Модуль физического шага не загружен.");
    return api;
  }
  function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
  function reviewError(code, message, details = {}) { return new PatternExecutionVisionReviewError(code, message, details); }

  const api = {
    VERSION, DEFAULT_PROVIDER, DEFAULT_MODEL, MAX_INITIAL_PHOTOS, VERDICTS, UI_MESSAGES, DISABLED_MESSAGE,
    PatternExecutionVisionReviewError, initializeCompletedStepReview, selfConfirm, createPhotoReviewRequest,
    applyValidatedVerdict, buildServerRequest, fetchGatewayConfiguration, submitServerReview,
    canAdvance, archiveForNextStep, captureGuidance,
    identityFor, normalizeStoredPhotos, normalizeGatewayConfiguration, validateSanitizedVerdict, canonicalize,
  };
  globalObject.YarnAIPatternExecutionVisionReview = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
