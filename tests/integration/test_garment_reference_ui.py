from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


def test_polo_execution_route_serves_external_assets_under_existing_csp() -> None:
    import re
    with TestClient(create_app()) as client:
        response = client.get("/garment-polo-execution")
        assert response.status_code == 200
        assert "Вяжем поло шаг за шагом" in response.text
        assert "<style>" not in response.text
        for asset in re.findall(r'(?:src|href)="(/static/[^" ]+)"', response.text):
            assert client.get(asset).status_code == 200, asset


def test_workspace_shows_two_explicit_user_intents() -> None:
    html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    assert "У меня есть готовая схема или PDF" in html
    assert "Связать похожую вещь по фото" in html
    assert "/import-pattern?intent=pattern_source" in html
    assert "/import-pattern?intent=garment_reference" in html


def test_garment_reference_route_contains_honest_russian_sections() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/garment-reference-analysis")
    assert response.status_code == 200
    for phrase in (
        "Вижу", "Предполагаю", "Не могу определить", "Вопросы и твои поправки",
        "Варианты технологии", "Это будет авторская технология", "Данные и расчёт изделия",
    ):
        assert phrase in response.text


def test_technology_decision_ui_requires_draft_then_explicit_confirmation() -> None:
    html = (STATIC / "garment-reference-analysis.html").read_text(encoding="utf-8")
    controller = (STATIC / "garment-reference-analysis-assistant.js").read_text(encoding="utf-8")
    css = (STATIC / "garment-reference-analysis.css").read_text(encoding="utf-8")
    for phrase in (
        'id="decision-confirmation"',
        'id="confirm-technology"',
        "Подтвердить выбранную технологию",
        "Сначала выбери один вариант",
        'id="change-technology-choice"',
        "Изменить выбор",
    ):
        assert phrase in html
    assert 'id="confirm-technology" class="button" type="button" disabled' in html
    assert "domain.selectDraftForProject(repository, projectId, option.optionId)" in controller
    assert "domain.confirmDecisionForProject(repository, projectId," in controller
    assert 'id="construction-choice"' in html
    assert 'constructionIdentity: choice' in controller
    assert "domain.reopenDecisionForProject(repository, projectId)" in controller
    assert 'ui.confirmTechnology.disabled = !draft' in controller
    assert "Будет принят вариант" in controller
    assert "Решение актуально и готово к передаче следующему этапу" in controller
    assert "grid-template-columns:repeat(auto-fit,minmax(280px,1fr))" in css

    decision_actions = controller[controller.index("async function saveDecision") : controller.index("async function mutate")]
    for forbidden in ("fetch(", "garment-reference-analyses", "OPENAI_API_KEY", "Authorization", "credential"):
        assert forbidden not in decision_actions


def test_production_ui_keeps_analysis_post_behind_explicit_disabled_button() -> None:
    controller = (STATIC / "garment-reference-analysis-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "garment-reference-analysis.js").read_text(encoding="utf-8")
    assert "Автоматический анализ фотографий пока не подключён." in domain
    assert 'fetch("/api/v1/garment-reference-analyses/configuration"' in controller
    assert 'ui.runPilot.addEventListener("click", runPilot)' in controller
    assert 'fetch("/api/v1/garment-reference-analyses"' in controller
    assert 'method: "POST"' in controller
    assert 'ui.runPilot.disabled = !(ready && ui.pilotPhoto.value && ui.pilotConfirm.checked)' in controller
    assert 'pilotReady: false' in controller
    assert "OPENAI_API_KEY" not in controller
    assert "innerHTML" not in controller
    assert "textContent" in controller
    for binding in (
        "title.textContent = option.name",
        "summary.textContent = option.constructionSummary",
        "strong.textContent = item.text",
        "li.textContent = value",
    ):
        assert binding in controller
    assert "ТЕСТОВЫЙ ЭКРАН — детерминированный пример без подключения реального провайдера анализа изображений." in controller
    assert 'globalObject.location.port !== "8000"' in controller


def test_pilot_ui_explains_one_shot_cost_and_data_retention_without_secret_fields() -> None:
    html = (STATIC / "garment-reference-analysis.html").read_text(encoding="utf-8")
    controller = (STATIC / "garment-reference-analysis-assistant.js").read_text(encoding="utf-8")
    for phrase in (
        "Реальный анализ ещё не запускался",
        "Запустить один разрешённый анализ",
        "не больше $0.05",
        "до 30 дней",
        "Автоматических повторов нет",
    ):
        assert phrase in html


def test_local_pilot_preparation_uses_exact_domain_path_without_analysis_post() -> None:
    html = (STATIC / "garment-reference-analysis.html").read_text(encoding="utf-8")
    controller = (STATIC / "garment-reference-analysis-assistant.js").read_text(encoding="utf-8")
    assert 'id="pilot-preparation"' in html
    assert 'query.get("pilotPreparation") === "local"' in controller
    assert 'globalObject.location.hostname === "127.0.0.1"' in controller
    assert 'globalObject.location.port === "8023"' in controller
    assert "domain.preparePilotPhoto(inspected.state, record)" in controller
    assert "exact_payload_hash_verified: true" in controller
    preparation = controller[controller.index("async function renderLocalPilotPreparation") : controller.index("async function readConfiguration")]
    assert 'method: "POST"' not in preparation
    assert "API key" not in html
    assert "Authorization" not in html
    assert "content_base64" not in preparation


def test_garment_reference_ui_localizes_internal_english_labels_without_changing_fixture_identity() -> None:
    controller = (STATIC / "garment-reference-analysis-assistant.js").read_text(encoding="utf-8")
    fixture = (STATIC / "garment-reference-happy-path-fixture.js").read_text(encoding="utf-8")
    for phrase in (
        'exact_gauge:"Точная плотность вязания"',
        'shoulder_and_sleeve_construction:"Конструкция плеча и рукава"',
        '"ТЕСТОВЫЙ ЭКРАН"',
        "Фотографии изделия не используются как подтверждение выполненного шага.",
    ):
        assert phrase in controller
    for phrase in ("Reference photos", "photo-проект", "vision provider", "provider response"):
        assert phrase not in controller
    assert 'inspected.project.title.startsWith("TEST ONLY —")' in controller
    assert 'title: "TEST ONLY — пуловер цвета слоновой кости"' in fixture


def test_existing_pattern_pdf_route_and_material_flow_remain_available() -> None:
    with TestClient(create_app()) as client:
        intake = client.get("/import-pattern?intent=pattern_source")
        analysis = client.get("/pattern-analysis")
    assert intake.status_code == 200
    assert analysis.status_code == 200
    assert "PDF" in intake.text
    assert "pattern-analysis" in intake.text
    assert "YarnAIPatternImport" in (STATIC / "pattern-import.js").read_text(encoding="utf-8")


def test_reference_and_execution_photo_purposes_are_explicitly_distinct() -> None:
    garment = (STATIC / "garment-reference-analysis.js").read_text(encoding="utf-8")
    execution = (STATIC / "pattern-execution-step-assistant.js").read_text(encoding="utf-8")
    assert 'PHOTO_PURPOSE = "GARMENT_REFERENCE"' in garment
    assert 'purpose: "STEP_VISION_REVIEW"' in execution


def test_fake_provider_fixture_is_isolated_and_has_visible_deterministic_garment() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/garment-reference-happy-path-fixture?testStorage=isolated")
    fixture = (STATIC / "garment-reference-happy-path-fixture.js").read_text(encoding="utf-8")
    garment = (STATIC / "garment-reference-test-pullover.png").read_bytes()
    assert response.status_code == 200
    assert "TEST/DEV ONLY" in fixture
    assert "FIXTURE_PRODUCTION_STORAGE_FORBIDDEN" in fixture
    assert '"http://127.0.0.1:8000"' in fixture
    assert "FIXTURE_ISOLATION_MARKER_REQUIRED" in fixture
    assert "allowTestProvider: true" in fixture
    assert 'fetch(TEST_GARMENT_PATH, { cache: "no-store" })' in fixture
    assert '"/api/v1/' not in fixture
    assert "tinyPngFile" not in fixture
    assert garment.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(garment) > 1_000_000
    assert int.from_bytes(garment[16:20], "big") == 1448
    assert int.from_bytes(garment[20:24], "big") == 1086
    for phrase in (
        "Пуловер цвета слоновой кости с длинными рукавами",
        "Круглая горловина с широкой резинкой",
        "Резинки на манжетах и по нижнему краю",
        "По виду спереди нельзя доказать направление вязания",
    ):
        assert phrase in fixture
