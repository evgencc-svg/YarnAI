"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { afterEach, test } = require("node:test");
require("fake-indexeddb/auto");

global.window = globalThis;
require("../src/yarnai/static/project-system.js");
const api = require("../src/yarnai/static/garment-reference-analysis.js");
const executionVision = require("../src/yarnai/static/pattern-execution-vision-review.js");

const system = global.YarnAIProjectSystem;
const repositories = [];
const stamp = (seconds) => new Date(Date.UTC(2026, 8, 1, 0, 0, seconds)).toISOString();
const configuration = { provider: "openai", model: "gpt-5.6-terra", enabled: true };

function photo(byte = "a", name = "front.jpg") {
  return {
    photo_id: system.uuidv7(),
    sha256: byte.repeat(64),
    source_mime: "image/jpeg",
    display_name: name,
    purpose: api.PHOTO_PURPOSE,
  };
}

function initial(photos = [photo()]) {
  return api.createInitialState({
    projectId: system.uuidv7(),
    calculationId: system.uuidv7(),
    projectRevision: 3,
    photos,
    now: stamp(1),
  });
}

function responseFor(state, optionCount = 2) {
  const request = api.buildAnalysisRequest(state, { requestId: "request:test" });
  const options = [
    {
      option_id: "option:simple",
      name: "Простой способ снизу вверх",
      construction_summary: "Корпус вяжется отдельно от рукавов и соединяется аккуратными швами.",
      knitting_direction: "Снизу вверх",
      seam_mode: "Со швами",
      major_components: ["Перед", "Спинка", "Два рукава"],
      shaping_approach: "Плавные убавки по краям деталей.",
      yarn_characteristics: ["Средняя толщина", "Хорошо держит форму"],
      tools_and_techniques: ["Прямые или круговые спицы", "Матрасный шов"],
      expected_visual_similarity: "Силуэт и пропорции будут близки к фотографии.",
      deliberate_differences: ["Скрытая конструкция интерпретирована"],
      advantages: ["Проще контролировать форму"],
      risks: ["Швы могут быть заметны на пластичной пряже"],
      difficulty_explanation: "Средняя сложность: детали простые, но нужна аккуратная сборка.",
      missing_inputs_before_calculation: ["Мерки", "Пряжа", "Спицы", "Образец плотности"],
      evidence_observation_ids: ["observed:silhouette"],
      assumption_inference_ids: ["inferred:direction"],
    },
    {
      option_id: "option:photo",
      name: "Ближе к фотографии сверху вниз",
      construction_summary: "Изделие вяжется единым полотном сверху вниз с минимальной сборкой.",
      knitting_direction: "Сверху вниз",
      seam_mode: "Почти без швов",
      major_components: ["Кокетка", "Корпус", "Рукава"],
      shaping_approach: "Форма создаётся распределёнными прибавками и примерками.",
      yarn_characteristics: ["Пластичная", "С ровным полотном"],
      tools_and_techniques: ["Круговые спицы", "Укороченные ряды"],
      expected_visual_similarity: "Посадка и мягкость будут ближе к видимому изделию.",
      deliberate_differences: [],
      advantages: ["Можно уточнять длину по ходу"],
      risks: ["Направление вязания по фото не доказано"],
      difficulty_explanation: "Выше средней: нужно уверенно распределять формирование.",
      missing_inputs_before_calculation: ["Мерки", "Пряжа", "Спицы", "Образец плотности"],
      evidence_observation_ids: ["observed:silhouette"],
      assumption_inference_ids: ["inferred:direction"],
    },
    {
      option_id: "option:shaped",
      name: "Детали точно по форме",
      construction_summary: "Детали вяжутся отдельно с формированием контуров и затем соединяются.",
      knitting_direction: "Снизу вверх",
      seam_mode: "Со швами",
      major_components: ["Перед", "Спинка", "Два сформированных рукава"],
      shaping_approach: "Контуры деталей формируются по подтверждённым меркам.",
      yarn_characteristics: ["Стабильная", "Хорошо держит контур"],
      tools_and_techniques: ["Спицы", "Формирование деталей"],
      expected_visual_similarity: "Контуры можно приблизить к видимой форме изделия.",
      deliberate_differences: ["Скрытая сборка остаётся технологическим решением YarnAI"],
      advantages: ["Форма каждой детали контролируется отдельно"],
      risks: ["Требует аккуратного соединения деталей"],
      difficulty_explanation: "Выше средней: важны точные контуры и сборка.",
      missing_inputs_before_calculation: ["Мерки", "Пряжа", "Спицы", "Образец плотности"],
      evidence_observation_ids: ["observed:silhouette"],
      assumption_inference_ids: ["inferred:direction"],
    },
  ].slice(0, optionCount);
  return {
    contract_version: api.CONTRACT_VERSION,
    source_identity: {
      project_id: request.project_id,
      project_revision: request.project_revision,
      reference_photos: request.reference_photos.map((entry) => ({ photo_id: entry.photo_id, sha256: entry.sha256 })),
      request_fingerprint: request.request_fingerprint,
    },
    provider: { provider: "openai", model: "gpt-5.6-terra" },
    visible_observations: [{ id: "observed:silhouette", field: "silhouette", value: "Свободный прямой силуэт", evidence_photo_ids: [request.reference_photos[0].photo_id], status: "observed", explanation: "На фотографии виден запас объёма по корпусу." }],
    inferences: [{ id: "inferred:direction", field: "construction_direction", value: "Возможно сверху вниз", status: "inferred", uncertainty: "high", why_plausible: "Линия плеча выглядит непрерывной.", confirm_or_reject: "Фото изнанки плеча покажет наличие шва." }],
    unknowns: [{ id: "unknown:gauge", field: "exact_gauge", explanation: "По фотографии нельзя узнать точную плотность." }],
    questions: [{ id: "question:back", text: "Как выглядит спинка?", reason: "На исходной фотографии она не видна." }],
    technology_options: options,
  };
}

function pilotResponseFor(state, requestId = "pilot:one") {
  const request = api.buildAnalysisRequest(state, { requestId });
  return {
    contract_version: api.CONTRACT_VERSION,
    pilot_schema_version: 1,
    request_id: requestId,
    source_identity: { project_id: request.project_id, project_revision: request.project_revision, reference_photos: request.reference_photos.map((entry) => ({ photo_id: entry.photo_id, sha256: entry.sha256 })), request_fingerprint: request.request_fingerprint },
    provider: { provider: "openai", model: "gpt-5.6-terra" },
    sanitized_photo_sha256: "b".repeat(64),
    visibleObservations: [{ id: "visible:silhouette", description: "Прямой свободный силуэт", visualEvidence: "Боковые линии почти параллельны." }],
    uncertainObservations: [{ id: "uncertain:direction", possibleInterpretations: ["Снизу вверх", "Сверху вниз"], uncertaintyReason: "Швы не видны.", clarificationMethod: "Показать изнанку плеча.", confidence: "medium" }],
    technologyOptions: [
      { id: "option:bottom", name: "Снизу вверх", construction: "Отдельные части", knittingDirection: "Снизу вверх", suggestedTechniques: ["Резинка"], observationIds: ["visible:silhouette", "uncertain:direction"], visualEvidence: "Совместимо с силуэтом.", alternativeExplanation: "Возможна бесшовная версия.", confidence: "medium" },
      { id: "option:top", name: "Сверху вниз", construction: "Единая верхняя часть", knittingDirection: "Сверху вниз", suggestedTechniques: ["Прибавки"], observationIds: ["visible:silhouette", "uncertain:direction"], visualEvidence: "Также совместимо с силуэтом.", alternativeExplanation: "Возможны плечевые швы.", confidence: "low" },
    ],
    cannotDetermineFromPhoto: [{ feature: "Точная плотность", reason: "Нет образца с линейкой." }],
    clarifyingQuestions: [{ question: "Есть ли плечевой шов?", reason: "Он различает конструкции.", distinguishes: ["Со швом", "Без шва"] }],
    forbiddenExactClaims: ["authorship", "exact_yarn_composition", "gauge", "measurements", "original_pattern_reconstruction", "row_counts", "stitch_counts", "yarn_usage"],
    cost_upper_bound_usd: "0.048900",
  };
}

async function repository() {
  const instance = new system.ProjectRepository();
  repositories.push(instance);
  await instance.initialize();
  return instance;
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((entry) => entry.close()));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(system.DB_NAME);
    request.onsuccess = resolve; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("blocked"));
  });
});

test("disabled provider stores an honest state and creates no analysis", () => {
  const state = initial();
  const next = api.markProviderUnavailable(state, { provider: "openai", model: "gpt-5.6-terra", enabled: false }, { now: stamp(2), requestId: "request:disabled" });
  assert.equal(next.status, "provider_disabled");
  assert.equal(next.analysis, null);
  assert.equal(next.provider.message, api.DISABLED_MESSAGE);
  assert.equal(next.request.reference_photos[0].sha256, "a".repeat(64));
});

test("versioned server request contains exact photo bytes but no provider, model or key", async () => {
  const storedPhoto = photo();
  const state = initial([storedPhoto]);
  const request = await api.buildServerRequest(state, [{
    metadata: storedPhoto,
    blob: new Blob([Buffer.from("photo-bytes")], { type: "image/jpeg" }),
  }], { requestId: "request:server" });
  assert.equal(request.contract_version, api.CONTRACT_VERSION);
  assert.equal(request.reference_photos[0].purpose, api.PHOTO_PURPOSE);
  assert.equal(Buffer.from(request.reference_photos[0].content_base64, "base64").toString(), "photo-bytes");
  assert.equal("provider" in request, false);
  assert.equal("model" in request, false);
  assert.equal("api_key" in request, false);
});

test("strict response keeps observed, inferred and unknown facts separate", () => {
  const state = initial();
  const next = api.applyProviderResponse(state, responseFor(state), configuration, { allowTestProvider: true, now: stamp(2), requestId: "request:test" });
  assert.equal(next.analysis.visibleObservations[0].status, "observed");
  assert.equal(next.analysis.inferences[0].status, "inferred");
  assert.equal(next.analysis.unknowns[0].field, "exact_gauge");
  assert.equal(next.analysis.technologyOptions.length, 2);
  assert.equal(next.status, "awaiting_decision");
});

test("opening a validated analysis never selects an option automatically", () => {
  const state = initial();
  const next = api.applyProviderResponse(state, responseFor(state, 3), configuration, { allowTestProvider: true, now: stamp(2), requestId: "request:test" });
  assert.equal(next.analysis.technologyOptions.length, 3);
  assert.equal(next.ownerDecision.status, "awaiting_decision");
  assert.equal(next.ownerDecision.optionId, null);
  assert.equal(api.technologyDecisionHandoff(next).allowedToStartTechnologyPlan, false);
});

test("empty selection cannot be confirmed", () => {
  const state = initial();
  const analyzed = api.applyProviderResponse(state, responseFor(state), configuration, { allowTestProvider: true, now: stamp(2), requestId: "request:test" });
  assert.throws(() => api.confirmTechnologyDecision(analyzed, { now: stamp(3) }), { code: "DECISION_DRAFT_REQUIRED" });
  assert.throws(() => api.decideTechnology(analyzed, { status: "selected", optionId: "option:simple" }, { now: stamp(3) }), { code: "EXPLICIT_CONFIRMATION_REQUIRED" });
});

test("draft can change before confirmation and confirmation preserves exact AI analysis", () => {
  const state = initial();
  const analyzed = api.applyProviderResponse(state, responseFor(state, 3), configuration, { allowTestProvider: true, now: stamp(2), requestId: "request:test" });
  const originalAnalysis = JSON.stringify(analyzed.analysis);
  const firstDraft = api.selectTechnologyDraft(analyzed, "option:simple", { now: stamp(3) });
  assert.equal(firstDraft.ownerDecision.status, "draft");
  assert.equal(firstDraft.ownerDecision.optionId, "option:simple");
  assert.equal(firstDraft.ownerDecision.readyForTechnologyPlan, false);
  const changedDraft = api.selectTechnologyDraft(firstDraft, "option:shaped", { now: stamp(4) });
  assert.equal(changedDraft.ownerDecision.optionId, "option:shaped");
  const confirmed = api.confirmTechnologyDecision(changedDraft, { now: stamp(5) });
  const handoff = api.technologyDecisionHandoff(confirmed);
  assert.equal(confirmed.ownerDecision.status, "confirmed");
  assert.equal(confirmed.ownerDecision.confirmedAt, stamp(5));
  assert.equal(handoff.selectedOptionId, "option:shaped");
  assert.equal(handoff.selectedOption.name, "Детали точно по форме");
  assert.equal(handoff.sourceAnalysisFingerprint, analyzed.analysis.analysisFingerprint);
  assert.equal(handoff.isCurrent, true);
  assert.equal(handoff.allowedToStartTechnologyPlan, true);
  assert.equal(JSON.stringify(confirmed.analysis), originalAnalysis);
});

test("changing a confirmed choice explicitly removes readiness until reconfirmed", () => {
  const state = initial();
  const analyzed = api.applyProviderResponse(state, responseFor(state), configuration, { allowTestProvider: true, now: stamp(2), requestId: "request:test" });
  const draft = api.selectTechnologyDraft(analyzed, "option:simple", { now: stamp(3) });
  const confirmed = api.confirmTechnologyDecision(draft, { now: stamp(4) });
  const reopened = api.reopenTechnologyDecision(confirmed, { now: stamp(5) });
  assert.equal(reopened.ownerDecision.status, "awaiting_decision");
  assert.equal(reopened.ownerDecision.optionId, null);
  assert.equal(reopened.ownerDecision.confirmedAt, null);
  assert.equal(api.technologyDecisionHandoff(reopened).allowedToStartTechnologyPlan, false);
  const replacement = api.selectTechnologyDraft(reopened, "option:photo", { now: stamp(6) });
  assert.equal(replacement.ownerDecision.status, "draft");
  assert.equal(api.technologyDecisionHandoff(replacement).allowedToStartTechnologyPlan, false);
});

test("replacement analysis invalidates a prior confirmation even when option ids are reused", () => {
  const state = initial();
  const analyzed = api.applyProviderResponse(state, responseFor(state), configuration, { allowTestProvider: true, now: stamp(2), requestId: "request:test" });
  const draft = api.selectTechnologyDraft(analyzed, "option:simple", { now: stamp(3) });
  const confirmed = api.confirmTechnologyDecision(draft, { now: stamp(4) });
  const replacement = responseFor(confirmed);
  replacement.technology_options[0].construction_summary = "Изменённое описание нового анализа.";
  const refreshed = api.applyProviderResponse(confirmed, replacement, configuration, { allowTestProvider: true, now: stamp(5), requestId: "request:test" });
  assert.notEqual(refreshed.analysis.analysisFingerprint, confirmed.analysis.analysisFingerprint);
  assert.equal(refreshed.ownerDecision.status, "awaiting_decision");
  assert.equal(refreshed.ownerDecision.optionId, null);
  assert.equal(api.technologyDecisionHandoff(refreshed).allowedToStartTechnologyPlan, false);
});

test("invalid provider response and foreign project or photo fail closed", () => {
  const state = initial();
  const extra = responseFor(state); extra.unexpected = true;
  assert.throws(() => api.applyProviderResponse(state, extra, configuration, { allowTestProvider: true, requestId: "request:test" }), { code: "PROVIDER_RESPONSE_SCHEMA_INVALID" });
  const foreign = responseFor(state); foreign.source_identity.project_id = system.uuidv7();
  assert.throws(() => api.applyProviderResponse(state, foreign, configuration, { allowTestProvider: true, requestId: "request:test" }), { code: "PROVIDER_RESPONSE_IDENTITY_MISMATCH" });
  const wrongPhoto = responseFor(state); wrongPhoto.visible_observations[0].evidence_photo_ids = [system.uuidv7()];
  assert.throws(() => api.applyProviderResponse(state, wrongPhoto, configuration, { allowTestProvider: true, requestId: "request:test" }), { code: "OBSERVATION_PHOTO_MISMATCH" });
});

test("correction creates one authoritative revision and identical repeat is idempotent", () => {
  let state = initial();
  state = api.recordClarification(state, { type: "desired_change", text: "Карман не нужен" }, { now: stamp(2) });
  const revision = state.revision;
  const repeated = api.recordClarification(state, { type: "desired_change", text: "Карман не нужен" }, { now: stamp(3) });
  assert.equal(repeated.revision, revision);
  assert.equal(repeated.clarifications.length, 1);
});

test("additional reference photo makes a prior analysis stale", () => {
  let state = initial();
  state = api.applyProviderResponse(state, responseFor(state), configuration, { allowTestProvider: true, now: stamp(2), requestId: "request:test" });
  state = api.addReferencePhotos(state, [photo("b", "back.jpg")], { now: stamp(3), projectRevision: 4 });
  assert.equal(state.status, "stale");
  assert.deepEqual(state.staleReasons, ["reference_photos_changed"]);
  assert.equal(state.ownerDecision.status, "awaiting_decision");
});

test("confirmed technology decision survives repository close and reopen with exact source binding", async () => {
  const repo = await repository();
  const project = await repo.createProject({ title: "Платье по фото", draft_input: { workflow_intent: { version: 1, kind: "garment_reference" } } });
  let inspected = await api.addPhotosForProject(repo, project.project_id, [new Blob([Buffer.from("front")], { type: "image/jpeg" })]);
  const payload = responseFor(inspected.state, 1);
  inspected = await api.applyProviderResponseForProject(repo, project.project_id, payload, configuration, { allowTestProvider: true, requestId: "request:test" });
  inspected = await api.selectDraftForProject(repo, project.project_id, "option:simple");
  inspected = await api.confirmDecisionForProject(repo, project.project_id);
  const originalAnalysis = JSON.stringify(inspected.state.analysis);
  await repo.close(); repositories.splice(repositories.indexOf(repo), 1);
  const reopened = await repository();
  let restored = await api.ensureForProject(reopened, project.project_id);
  assert.equal(restored.state.ownerDecision.status, "confirmed");
  assert.equal(restored.state.ownerDecision.optionId, "option:simple");
  assert.equal(restored.state.ownerDecision.sourceAnalysisFingerprint, restored.state.analysis.analysisFingerprint);
  assert.equal(api.technologyDecisionHandoff(restored.state).allowedToStartTechnologyPlan, true);
  assert.equal(JSON.stringify(restored.state.analysis), originalAnalysis);
});

test("technology decision stays inside its exact project", async () => {
  const repo = await repository();
  const first = await repo.createProject({ title: "Первый", draft_input: { workflow_intent: { version: 1, kind: "garment_reference" } } });
  const second = await repo.createProject({ title: "Второй", draft_input: { workflow_intent: { version: 1, kind: "garment_reference" } } });
  let inspected = await api.addPhotosForProject(repo, first.project_id, [new Blob([Buffer.from("front")], { type: "image/jpeg" })]);
  inspected = await api.applyProviderResponseForProject(repo, first.project_id, responseFor(inspected.state), configuration, { allowTestProvider: true, requestId: "request:test" });
  inspected = await api.selectDraftForProject(repo, first.project_id, "option:simple");
  inspected = await api.confirmDecisionForProject(repo, first.project_id);
  const untouched = await api.ensureForProject(repo, second.project_id);
  assert.equal(api.technologyDecisionHandoff(inspected.state).projectId, first.project_id);
  assert.equal(untouched.state.ownerDecision.status, "awaiting_decision");
  assert.equal(api.technologyDecisionHandoff(untouched.state).selectedOptionId, null);
  assert.equal(api.technologyDecisionHandoff(untouched.state).allowedToStartTechnologyPlan, false);
});

test("photo deduplication is scoped by purpose and calculation", async () => {
  const repo = await repository();
  const project = await repo.createProject({ title: "Purpose" });
  const blob = new Blob([Buffer.from("same")], { type: "image/png" });
  const reference = await repo.addPhoto(project.project_id, blob, { purpose: api.PHOTO_PURPOSE });
  const repeated = await repo.addPhoto(project.project_id, blob, { purpose: api.PHOTO_PURPOSE });
  const evidence = await repo.addPhoto(project.project_id, blob, { purpose: "STEP_VISION_REVIEW" });
  assert.equal(repeated.photo_id, reference.photo_id);
  assert.notEqual(evidence.photo_id, reference.photo_id);
});

test("unsupported reference image fails before any photo record is written", async () => {
  const repo = await repository();
  const project = await repo.createProject({ title: "Unsupported reference" });
  await assert.rejects(
    () => api.addPhotosForProject(repo, project.project_id, [new Blob([Buffer.from("gif")], { type: "image/gif" })]),
    { code: "PHOTO_TYPE_INVALID" },
  );
  const aggregate = await repo.getProject(project.project_id);
  assert.equal(aggregate.photos.length, 0);
});

test("reference photo cannot be passed to execution evidence contract", () => {
  const garmentPhoto = photo();
  assert.throws(() => executionVision.normalizeStoredPhotos([garmentPhoto]), { code: "photo_identity_invalid" });
});

test("pilot request sanitizes one exact accepted photo and needs explicit confirmation", async () => {
  const original = Buffer.from("original-private-photo");
  const stored = photo(); stored.sha256 = createHash("sha256").update(original).digest("hex");
  const state = initial([stored]);
  const record = { metadata: stored, blob: new Blob([original], { type: "image/jpeg" }) };
  const sanitizedBytes = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,2]);
  const sanitizedSha = createHash("sha256").update(sanitizedBytes).digest("hex");
  await assert.rejects(() => api.buildPilotServerRequest(state, record, { requestId: "pilot:one", userConfirmed: false, sanitizer: async () => ({ mimeType: "image/png", bytes: sanitizedBytes, sha256: sanitizedSha, width: 2, height: 2 }) }), { code: "PILOT_CONFIRMATION_REQUIRED" });
  const request = await api.buildPilotServerRequest(state, record, { requestId: "pilot:one", userConfirmed: true, sanitizer: async () => ({ mimeType: "image/png", bytes: sanitizedBytes, sha256: sanitizedSha, width: 2, height: 2 }) });
  assert.equal(request.request_id, "pilot:one");
  assert.equal(request.source_photo_id, stored.photo_id);
  assert.equal(request.source_photo_sha256, stored.sha256);
  assert.equal(request.sanitized_image.mime_type, "image/png");
  assert.equal(request.sanitized_image.sha256, sanitizedSha);
  assert.equal("provider" in request, false);
  assert.equal("model" in request, false);
  assert.equal("api_key" in request, false);
  assert.equal(JSON.stringify(request).includes("original-private-photo"), false);
  assert.equal(JSON.stringify(request).includes(stored.display_name), false);
});

test("pilot preparation uses the exact future payload path and rejects changed original bytes", async () => {
  const original = Buffer.from("exact-original-photo");
  const stored = photo(); stored.sha256 = createHash("sha256").update(original).digest("hex");
  const state = initial([stored]);
  const sanitizedBytes = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,2]);
  const sanitizedSha = createHash("sha256").update(sanitizedBytes).digest("hex");
  const sanitizer = async () => ({ mimeType: "image/png", bytes: sanitizedBytes, sha256: sanitizedSha, width: 2, height: 2 });
  const prepared = await api.preparePilotPhoto(state, { metadata: stored, blob: new Blob([original], { type: "image/jpeg" }) }, { sanitizer });
  const request = await api.buildPilotServerRequest(state, { metadata: stored, blob: new Blob([original], { type: "image/jpeg" }) }, { requestId: "pilot:one", userConfirmed: true, sanitizer });
  assert.equal(prepared.sanitized.sha256, request.sanitized_image.sha256);
  assert.equal(Buffer.from(prepared.sanitized.bytes).toString("base64"), request.sanitized_image.content_base64);
  await assert.rejects(
    () => api.preparePilotPhoto(state, { metadata: stored, blob: new Blob([Buffer.from("changed")], { type: "image/jpeg" }) }, { sanitizer }),
    { code: "PHOTO_ORIGINAL_SHA256_MISMATCH" },
  );
});

test("garment photo and sanitized image size constants remain one explicit frontend contract", async () => {
  assert.equal(api.MAX_SOURCE_PHOTO_BYTES, 20_000_000);
  assert.equal(api.MAX_SANITIZED_IMAGE_BYTES, 8_000_000);
  assert.equal(api.MAX_SANITIZED_IMAGE_DIMENSION, 1_600);
  assert.equal(api.MAX_SANITIZED_IMAGE_PIXELS, 2_560_000);

  const original = Buffer.from("exact-original-photo");
  const stored = photo(); stored.sha256 = createHash("sha256").update(original).digest("hex");
  const state = initial([stored]);
  const record = { metadata: stored, blob: new Blob([original], { type: "image/jpeg" }) };
  const tooLarge = new Uint8Array(api.MAX_SANITIZED_IMAGE_BYTES + 1);
  const tooLargeSha = createHash("sha256").update(tooLarge).digest("hex");
  await assert.rejects(
    () => api.buildPilotServerRequest(state, record, {
      requestId: "pilot:one",
      userConfirmed: true,
      sanitizer: async () => ({ mimeType: "image/png", bytes: tooLarge, sha256: tooLargeSha, width: 2, height: 2 }),
    }),
    { code: "PHOTO_SANITIZATION_FAILED" },
  );
});

test("validated pilot response maps two strict options into the explicit draft and confirmation flow", () => {
  const state = initial();
  const payload = pilotResponseFor(state);
  const next = api.applyPilotProviderResponse(state, payload, configuration, { requestId: "pilot:one", now: stamp(2) });
  assert.equal(next.status, "awaiting_decision");
  assert.equal(next.analysis.pilotSchemaVersion, 1);
  assert.equal(next.analysis.technologyOptions.length, 2);
  const draft = api.selectTechnologyDraft(next, "option:bottom", { now: stamp(3) });
  assert.equal(draft.ownerDecision.status, "draft");
  const confirmed = api.confirmTechnologyDecision(draft, { now: stamp(4) });
  assert.equal(confirmed.ownerDecision.optionId, "option:bottom");
  assert.equal(api.technologyDecisionHandoff(confirmed).allowedToStartTechnologyPlan, true);
});

test("valid Russian pilot response survives repository close and reopen with display fields intact", async () => {
  const repo = await repository();
  const project = await repo.createProject({ title: "Русский результат по фото", draft_input: { workflow_intent: { version: 1, kind: "garment_reference" } } });
  let inspected = await api.addPhotosForProject(repo, project.project_id, [new Blob([Buffer.from("front")], { type: "image/jpeg" })]);
  inspected = await api.applyPilotProviderResponseForProject(repo, project.project_id, pilotResponseFor(inspected.state), configuration, { requestId: "pilot:one" });
  assert.equal(inspected.state.analysis.visibleObservations[0].value, "Прямой свободный силуэт");
  assert.deepEqual(inspected.state.analysis.technologyOptions.map((option) => option.name), ["Снизу вверх", "Сверху вниз"]);
  assert.equal(inspected.state.analysis.questions[0].text, "Есть ли плечевой шов?");
  await repo.close(); repositories.splice(repositories.indexOf(repo), 1);

  const reopened = await repository();
  const restored = await api.ensureForProject(reopened, project.project_id);
  assert.equal(restored.state.status, "awaiting_decision");
  assert.equal(restored.state.analysis.visibleObservations[0].value, "Прямой свободный силуэт");
  assert.deepEqual(restored.state.analysis.technologyOptions.map((option) => option.name), ["Снизу вверх", "Сверху вниз"]);
  assert.equal(restored.state.analysis.questions[0].text, "Есть ли плечевой шов?");
});
