"use strict";

// TEST/DEV ONLY: seeds a disposable project through public repository/domain
// APIs, validates one deterministic fake-provider response, then opens the real UI.
(function runGarmentReferenceHappyPathFixture(globalObject) {
  const CANONICAL_ORIGINS = Object.freeze([
    "http://127.0.0.1:8000",
    "http://localhost:8000",
  ]);
  const REQUEST_ID = "request:isolated-garment-reference-v1";
  const TEST_GARMENT_PATH = "/static/garment-reference-test-pullover.png";
  const TEST_GARMENT_SHA256 = "b42e9ce043aee6feca6a4057936656118b827917704f4a90ca2bdcd894c65b78";
  const TEST_GARMENT_WIDTH = 1448;
  const TEST_GARMENT_HEIGHT = 1086;

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  function assertIsolated() {
    const location = globalObject.location;
    if (CANONICAL_ORIGINS.includes(location.origin)) {
      fail("FIXTURE_PRODUCTION_STORAGE_FORBIDDEN", "Fixture cannot use canonical YarnAI storage.");
    }
    if (!["127.0.0.1", "localhost"].includes(location.hostname)) {
      fail("FIXTURE_NONLOCAL_ORIGIN_FORBIDDEN", "Fixture is available only on localhost.");
    }
    if (new URLSearchParams(location.search).get("testStorage") !== "isolated") {
      fail("FIXTURE_ISOLATION_MARKER_REQUIRED", "Fixture requires testStorage=isolated.");
    }
  }

  function requireApi(name) {
    const api = globalObject[name];
    if (!api) fail("FIXTURE_DEPENDENCY_MISSING", `Missing fixture dependency: ${name}`);
    return api;
  }

  async function sha256Hex(blob) {
    const digest = await globalObject.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function testGarmentFile() {
    const response = await globalObject.fetch(TEST_GARMENT_PATH, { cache: "no-store" });
    if (!response.ok) fail("FIXTURE_GARMENT_LOAD_FAILED", `Test garment returned HTTP ${response.status}.`);
    const blob = await response.blob();
    if (blob.type !== "image/png") fail("FIXTURE_GARMENT_TYPE_INVALID", `Expected image/png, got ${blob.type || "unknown"}.`);
    if (await sha256Hex(blob) !== TEST_GARMENT_SHA256) fail("FIXTURE_GARMENT_HASH_MISMATCH", "Test garment bytes do not match the deterministic fixture contract.");
    const bitmap = await globalObject.createImageBitmap(blob);
    const dimensionsMatch = bitmap.width === TEST_GARMENT_WIDTH && bitmap.height === TEST_GARMENT_HEIGHT;
    bitmap.close();
    if (!dimensionsMatch) fail("FIXTURE_GARMENT_DIMENSIONS_INVALID", `Expected ${TEST_GARMENT_WIDTH}x${TEST_GARMENT_HEIGHT}.`);
    return new File([blob], "test-ivory-pullover-front.png", { type: "image/png" });
  }

  function fakeProviderResponse(api, state) {
    const request = api.buildAnalysisRequest(state, { requestId: REQUEST_ID });
    const photoId = request.reference_photos[0].photo_id;
    return {
      contract_version: api.CONTRACT_VERSION,
      source_identity: {
        project_id: request.project_id,
        project_revision: request.project_revision,
        reference_photos: request.reference_photos.map((photo) => ({ photo_id: photo.photo_id, sha256: photo.sha256 })),
        request_fingerprint: request.request_fingerprint,
      },
      provider: { provider: "openai", model: "gpt-5.6-terra" },
      visible_observations: [{
        id: "observed:garment", field: "garment_type_and_color", value: "Пуловер цвета слоновой кости с длинными рукавами",
        evidence_photo_ids: [photoId], status: "observed",
        explanation: "Пуловер показан целиком спереди на тёмно-синем фоне: в кадр входят оба рукава, корпус и нижний край.",
      }, {
        id: "observed:neckline", field: "neckline", value: "Круглая горловина с широкой резинкой",
        evidence_photo_ids: [photoId], status: "observed",
        explanation: "Круглый вырез и ребристая отделка горловины видны крупно и контрастно.",
      }, {
        id: "observed:finishes", field: "edge_finishes", value: "Резинки на манжетах и по нижнему краю",
        evidence_photo_ids: [photoId], status: "observed",
        explanation: "Ребристые манжеты и нижняя планка заметно отличаются от основного лицевого полотна.",
      }],
      inferences: [{
        id: "inferred:fit", field: "intended_fit", value: "Вероятно, посадка задумана свободной",
        status: "inferred", uncertainty: "medium",
        why_plausible: "Корпус выглядит широким относительно горловины и рукавов.",
        confirm_or_reject: "Нужны мерки человека и желаемая прибавка на свободу облегания.",
      }],
      unknowns: [{
        id: "unknown:gauge", field: "exact_gauge",
        explanation: "По фотографии нельзя определить точную плотность вязания.",
      }, {
        id: "unknown:construction", field: "shoulder_and_sleeve_construction",
        explanation: "По виду спереди нельзя доказать направление вязания и способ соединения плеча с рукавом.",
      }],
      questions: [{
        id: "question:fit", text: "Насколько свободной должна быть посадка?",
        reason: "На фотографии нет человека и масштаба, поэтому точную прибавку нужно выбрать отдельно.",
      }, {
        id: "question:back", text: "Как выглядит спинка?",
        reason: "На исходной фотографии она не видна.",
      }],
      technology_options: [{
        option_id: "option:set-in", name: "Вязание отдельными деталями с втачным рукавом",
        construction_summary: "Перед, спинка и втачные рукава вяжутся отдельно, затем соединяются аккуратными швами.",
        knitting_direction: "Снизу вверх", seam_mode: "Со швами",
        major_components: ["Перед", "Спинка", "Два рукава"],
        shaping_approach: "Плавные убавки по краям деталей.",
        yarn_characteristics: ["Средняя толщина", "Хорошо держит форму"],
        tools_and_techniques: ["Прямые или круговые спицы", "Матрасный шов"],
        expected_visual_similarity: "Можно сохранить видимые круглую горловину, длинные рукава, широкий корпус и резинки по краям.",
        deliberate_differences: ["На фотографии способ сборки не виден; швы являются осознанным технологическим выбором"],
        advantages: ["Проще контролировать форму каждой детали"],
        risks: ["Швы могут быть заметны на пластичной пряже"],
        difficulty_explanation: "Средняя сложность: форма деталей проста, но нужна аккуратная сборка.",
        missing_inputs_before_calculation: ["Мерки", "Пряжа", "Спицы", "Образец плотности"],
        evidence_observation_ids: ["observed:garment", "observed:neckline", "observed:finishes"],
        assumption_inference_ids: ["inferred:fit"],
      }, {
        option_id: "option:raglan", name: "Вязание сверху вниз с рукавами реглан",
        construction_summary: "Пуловер с круглой горловиной и рукавами реглан вяжется сверху вниз единым полотном с минимальной сборкой.",
        knitting_direction: "Сверху вниз", seam_mode: "Почти без швов",
        major_components: ["Кокетка", "Корпус", "Рукава"],
        shaping_approach: "Форма создаётся распределёнными прибавками и примерками.",
        yarn_characteristics: ["Пластичная", "С ровным полотном"],
        tools_and_techniques: ["Круговые спицы", "Укороченные ряды"],
        expected_visual_similarity: "Можно сохранить видимые круглую горловину, длинные рукава, широкий корпус и резинки по краям.",
        deliberate_differences: ["На фотографии направление вязания и конструкция плеча не доказаны"],
        advantages: ["Можно уточнять длину по ходу работы"],
        risks: ["Выбранный способ может отличаться от скрытой конструкции сфотографированного изделия"],
        difficulty_explanation: "Выше средней: нужно уверенно распределять формирование.",
        missing_inputs_before_calculation: ["Мерки", "Пряжа", "Спицы", "Образец плотности"],
        evidence_observation_ids: ["observed:garment", "observed:neckline", "observed:finishes"],
        assumption_inference_ids: ["inferred:fit"],
      }, {
        option_id: "option:industrial", name: "Промышленное вязание деталей точно по форме",
        construction_summary: "Детали формируются точно по контуру на промышленном оборудовании и затем соединяются.",
        knitting_direction: "По промышленной технологической карте", seam_mode: "Промышленная сборка",
        major_components: ["Перед", "Спинка", "Два рукава"],
        shaping_approach: "Fully-fashioned формирование деталей на вязальном оборудовании.",
        yarn_characteristics: ["Промышленная пряжа заданного номера", "Стабильная партия"],
        tools_and_techniques: ["Промышленная вязальная машина", "Производственная технологическая карта"],
        expected_visual_similarity: "Контуры деталей можно приблизить к видимой форме изделия.",
        deliberate_differences: ["Yarn AI V1 сохраняет этот вариант только как информационный"],
        advantages: ["Точное формирование контура деталей"],
        risks: ["Маршрут требует промышленного оборудования и отдельного расчётного контракта"],
        difficulty_explanation: "Промышленный маршрут не поддерживается расчётами Yarn AI V1.",
        missing_inputs_before_calculation: ["Промышленное оборудование", "Машинная плотность", "Технологическая карта"],
        evidence_observation_ids: ["observed:garment", "observed:neckline", "observed:finishes"],
        assumption_inference_ids: ["inferred:fit"],
      }],
    };
  }

  async function seed() {
    assertIsolated();
    const system = requireApi("YarnAIProjectSystem");
    const domain = requireApi("YarnAIGarmentReferenceAnalysis");
    const garmentFile = await testGarmentFile();
    const repository = new system.ProjectRepository();
    await repository.initialize();
    const project = await repository.createProject({
      title: "TEST ONLY — пуловер цвета слоновой кости",
      notes: "Disposable isolated-origin UI evidence; never use as a real project.",
      draft_input: { workflow_intent: { version: 1, kind: "garment_reference" } },
    });
    let inspected = await domain.addPhotosForProject(repository, project.project_id, [garmentFile]);
    inspected = await domain.recordClarificationForProject(repository, project.project_id, {
      type: "desired_change", text: "Сохранить круглую горловину, длинные рукава и резинки по краям; не добавлять карманы.",
    });
    inspected = await domain.applyProviderResponseForProject(
      repository,
      project.project_id,
      fakeProviderResponse(domain, inspected.state),
      { provider: "openai", model: "gpt-5.6-terra", enabled: true },
      { allowTestProvider: true, requestId: REQUEST_ID },
    );
    inspected = await domain.selectDraftForProject(repository, project.project_id, "option:raglan");
    inspected = await domain.confirmDecisionForProject(repository, project.project_id);
    await repository.close();
    globalObject.__YARNAI_GARMENT_REFERENCE_FIXTURE__ = Object.freeze({
      projectId: project.project_id,
      calculationId: inspected.calculation.calculation_id,
    });
    globalObject.location.assign(`/garment-reference-analysis?project=${encodeURIComponent(project.project_id)}&fixture=garment-reference-v1`);
  }

  globalObject.addEventListener("DOMContentLoaded", () => {
    seed().catch((error) => {
      globalObject.__YARNAI_GARMENT_REFERENCE_FIXTURE_ERROR__ = {
        code: error.code || "FIXTURE_FAILED", message: error.message,
      };
      const status = globalObject.document.getElementById("fixture-status");
      if (status) status.textContent = `${error.code || "FIXTURE_FAILED"}: ${error.message}`;
    });
  }, { once: true });
})(globalThis);
