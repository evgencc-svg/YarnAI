from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import create_app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


def test_manual_calculation_intake_is_a_separate_production_screen() -> None:
    with TestClient(create_app()) as client:
        response = client.get("/manual-calculation-intake")
    assert response.status_code == 200
    for phrase in (
        "Подготовка данных для расчёта",
        "У вас уже есть пряжа, которую вы хотите использовать для этого изделия?",
        "Да, пряжа уже есть",
        "Нет, помогите выбрать",
        "Фотография этикетки",
        "Фотография мотка или нити",
        "Использовать эту пряжу",
        "Недостаточно данных для оценки",
        "Мерки человека",
        "Мерки и параметры изделия",
        "Наблюдение по фотографии не заполняет мерки человека или готового изделия",
        "Обхват рукава в верхней части",
        "Глубина кокетки реглан",
        "Предпочтения готового изделия",
        "Желаемые размеры готового изделия",
        "Свобода облегания",
        "Пряжа ещё не выбрана",
        "Сколько нитей вяжешь одновременно",
        "Какая пряжа подойдёт для похожего результата",
        "Выбери целевую характеристику будущей пряжи",
        "Этот вариант станет целевой характеристикой будущей пряжи",
        "Конкретную пряжу и фактическую плотность образца нужно будет указать отдельно",
        "Гладкость, ворс и начёс",
        "Обязательная проверка образцом",
        "Профиль требований к пряже",
        "Это только ориентир из сохранённого анализа, не факт",
        "Спицы ещё не выбраны",
        "Контрольный образец",
        "Дополнительные фотографии",
        "базовый перевод размеров в петли и ряды",
        "Полная инструкция требует отдельного расчёта формы деталей",
        "Расчёт по подтверждённому образцу",
        "Проверка данных",
        "Проверить данные",
        "Подтверждаются только введённые исходные данные. Расчёт изделия ещё не выполнен.",
    ):
        assert phrase in response.text
    controller = (STATIC / "manual-calculation-intake-assistant.js").read_text(encoding="utf-8")
    actual_controller = (STATIC / "garment-actual-yarn-assistant.js").read_text(encoding="utf-8")
    actual_domain = (STATIC / "garment-actual-yarn.js").read_text(encoding="utf-8")
    assert "Тоньше" in controller and "Толще" in controller
    assert "Максимально близко к фотографии" in controller
    assert "Близко к выбранному ориентиру" in actual_controller
    assert "Можно использовать, но результат будет отличаться" in actual_controller
    assert "Риск заметного отличия" in actual_controller
    assert 'CONTRACT_VERSION = "GARMENT_ACTUAL_YARN_V1"' in actual_domain
    assert 'method: "POST"' not in actual_controller + actual_domain
    assert "OPENAI_API_KEY" not in actual_controller + actual_domain


def test_actual_yarn_photo_delete_is_project_scoped_and_provider_free() -> None:
    controller = (STATIC / "garment-actual-yarn-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "garment-actual-yarn.js").read_text(encoding="utf-8")
    repository = (STATIC / "project-system.js").read_text(encoding="utf-8")
    joined = controller + domain
    assert "Удалить фотографию" in controller
    assert "removePhotoForProject" in controller + domain
    assert "deletePhotoAndUpdateCalculationProgress" in domain + repository
    assert 'expectedPurpose: intakeDomain().PHOTO_PURPOSE' in domain
    assert 'operationKind: "GARMENT_ACTUAL_YARN_PHOTO_DELETED"' in domain
    for forbidden in ("/api/", 'method: "POST"', "OPENAI_API_KEY", "Authorization", "credential"):
        assert forbidden not in joined


def test_confirmed_manual_route_and_industrial_gate_are_explicit() -> None:
    html = (STATIC / "garment-reference-analysis.html").read_text(encoding="utf-8")
    controller = (STATIC / "garment-reference-analysis-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "manual-calculation-intake.js").read_text(encoding="utf-8")
    assert 'id="open-manual-intake"' in html
    assert '/static/garment-yarn-requirements.js' in html
    assert "Открыть данные и расчёт" in html
    assert 'ui.openIntake.hidden = true' in controller
    assert 'if (route === "manual")' in controller
    assert 'if (route === "industrial")' in controller
    assert "Yarn AI V1 пока не рассчитывает промышленное вязание. Этот вариант сохранён как информационный." in domain
    assert "Вязание сверху вниз с рукавами реглан" in domain
    assert "Вязание отдельными деталями с втачным рукавом" in domain


def test_intake_controller_has_only_explicit_one_shot_yarn_supplement_path() -> None:
    controller = (STATIC / "manual-calculation-intake-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "manual-calculation-intake.js").read_text(encoding="utf-8")
    recommendation = (STATIC / "garment-yarn-recommendation.js").read_text(encoding="utf-8")
    validation = (STATIC / "manual-intake-validation.js").read_text(encoding="utf-8")
    joined = controller + domain + validation
    for forbidden in (
        "XMLHttpRequest",
        "/api/v1/garment-reference-analyses",
        "Authorization",
        "OPENAI_API_KEY",
        "credential",
    ):
        assert forbidden not in joined
    assert controller.count('method: "POST"') == 1
    assert controller.count('"/api/v1/garment-yarn-recommendations"') == 1
    assert "!ui.supplementConfirm.checked" in controller
    assert "Повтор автоматически не выполняется" in controller
    assert "detail.reason_code" in controller
    assert "detail.path" in controller
    assert "error.userMessage" in controller
    supplement = controller[controller.index("async function runYarnSupplement"):controller.index("function render()")]
    assert "fallback" not in supplement
    assert supplement.index("if (!response.ok)") < supplement.index("yarnRecommendationDomain.saveForProject")
    assert supplement.index("busy = true") < supplement.index('globalObject.fetch("/api/v1/garment-yarn-recommendations"')
    assert "supplementControlState.available !== true" in supplement
    assert "preparePilotPhoto" in controller
    assert "retryControlState" in controller and "retryControlState" in recommendation
    assert "RECOMMENDATION_SEMANTIC_CONTRACT_MISSING" in recommendation
    assert "AUTHORIZATION_NOT_APPROVED_OR_CONSUMED" in recommendation
    assert "AUTHORIZATION_BINDING_MISMATCH" in recommendation
    assert "authorizationMatchesPreparedRequest" in recommendation
    assert "pilot_authorization_binding" in controller
    assert "PHOTO_OR_SANITIZED_PNG_UNAVAILABLE" in recommendation
    assert "Существующая рекомендация не прошла текущую проверку качества" in controller
    assert "rev1 будет заменена rev2 только после полного validation PASS" in controller
    assert "При ошибке rev1 останется без изменений; автоматического повтора не будет" in controller
    assert "Binding не совпадает или состояние stale" in controller
    assert "mediumHalo" in controller and "strongHalo" in controller
    assert 'purpose: PHOTO_PURPOSE' in domain
    assert 'storage: "local_only"' in domain
    assert "normalizedPer10Cm" in domain
    assert "sourceMeasurement" in domain


def test_intake_ui_exposes_partial_draft_and_separate_validation_state() -> None:
    html = (STATIC / "manual-calculation-intake.html").read_text(encoding="utf-8")
    controller = (STATIC / "manual-calculation-intake-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "manual-calculation-intake.js").read_text(encoding="utf-8")
    validation = (STATIC / "manual-intake-validation.js").read_text(encoding="utf-8")
    requirements = (STATIC / "garment-measurement-requirements.js").read_text(encoding="utf-8")
    yarn_requirements = (STATIC / "garment-yarn-requirements.js").read_text(encoding="utf-8")
    yarn_recommendation = (STATIC / "garment-yarn-recommendation.js").read_text(encoding="utf-8")
    yarn_target_decision = (STATIC / "garment-yarn-target-decision.js").read_text(encoding="utf-8")
    assert "Сохранить черновик" in html
    assert "Можно заполнять в любом порядке" in html
    assert "Заполненность раздела и достаточность данных — разные вещи" in html
    assert 'id="validation-completed"' in html
    assert 'id="validation-blockers"' in html
    assert 'id="validation-conflicts"' in html
    assert 'id="validation-unresolved"' in html
    assert 'id="validation-warnings"' in html
    assert 'id="confirm-validation"' in html
    assert 'id="reopen-validation"' in html
    assert 'value === null || value === undefined ? ""' in controller
    assert 'return null' in domain
    assert 'CONTRACT_VERSION = "MANUAL_INTAKE_VALIDATION_V1"' in validation
    assert 'PROGRESS_KIND = "MANUAL_INTAKE_VALIDATION"' in validation
    assert 'status = "ready_to_confirm"' in validation
    assert 'status = "confirmed"' in validation
    assert 'CONTRACT_VERSION = "GARMENT_MEASUREMENT_REQUIREMENTS_V1"' in requirements
    assert 'GARMENT_CATEGORY = "sleeved_upper_body_garment"' in requirements
    assert 'REASON_UNRESOLVED = "GARMENT_REQUIREMENTS_UNRESOLVED"' in requirements
    assert '"BODY_MEASUREMENT"' in requirements
    assert '"FINISHED_GARMENT_MEASUREMENT"' in requirements
    assert '"FIT_PREFERENCE"' in requirements
    assert '"CONSTRUCTION_INPUT"' in requirements
    assert '/static/garment-measurement-requirements.js' in html
    assert '/static/garment-yarn-requirements.js' in html
    assert '/static/garment-yarn-recommendation.js' in html
    assert '/static/garment-yarn-target-decision.js' in html
    assert 'CONTRACT_VERSION = "GARMENT_YARN_REQUIREMENTS_V1"' in yarn_requirements
    assert 'REASON_UNRESOLVED = "YARN_REQUIREMENTS_UNRESOLVED"' in yarn_requirements
    assert 'valuePath: "yarn.name"' in yarn_requirements
    assert 'valuePath: "yarn.strandCount"' in yarn_requirements
    assert 'noImplicitStrandCount: true' in yarn_requirements
    assert 'id="yarn-requirements-list"' in html
    assert 'id="photo-yarn-advisory"' in html
    assert 'CONTRACT_VERSION = "GARMENT_YARN_RECOMMENDATION_V1"' in yarn_recommendation
    assert 'PROGRESS_KIND = "GARMENT_YARN_RECOMMENDATION"' in yarn_recommendation
    assert 'targetIsNotActualGauge' in yarn_recommendation
    assert 'CONTRACT_VERSION = "GARMENT_YARN_TARGET_DECISION_V1"' in yarn_target_decision
    assert 'PROGRESS_KIND = "GARMENT_YARN_TARGET_DECISION"' in yarn_target_decision
    assert 'MOST_SIMILAR_OPTION_AMBIGUOUS' in yarn_target_decision
    assert 'TARGET_OPTION_CONFLICTS_WITH_OWNER_INTENT' in yarn_target_decision
    assert 'GARMENT_YARN_TARGET_DECISION_CONFIRMED' in yarn_target_decision
    for forbidden in ("ready_for_calculation", "readyForCalculation", "confirmed_intake"):
        assert forbidden not in (html + controller + domain + validation)
