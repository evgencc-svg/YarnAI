from pathlib import Path

from starlette.testclient import TestClient

import yarnai.http as http_api


STATIC = Path(__file__).parents[1] / "src" / "yarnai" / "static"


def test_stage63_route_serves_the_project_scoped_workspace() -> None:
    with TestClient(http_api.create_app()) as client:
        response = client.get(
            "/swatch-assistant?project=018f5f64-8b27-7a36-8c58-4f491a95cd01"
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert 'id="gauge-form"' in response.text
    assert "Подтвердить плотность" in response.text
    assert 'src="/static/swatch-gauge.js"' in response.text
    assert 'src="/static/swatch-assistant-workspace.js"' in response.text


def test_stage63_html_has_semantic_controls_and_live_regions() -> None:
    html = (STATIC / "swatch-assistant.html").read_text(encoding="utf-8")
    assert "<h1" in html
    assert html.count("<fieldset") >= 2
    assert html.count("<legend") >= 2
    assert 'for="stitches"' in html
    assert 'for="rows"' in html
    assert 'for="width"' in html
    assert 'for="height"' in html
    assert 'aria-describedby="stitches-error"' in html
    assert 'aria-describedby="rows-error"' in html
    assert 'aria-live="polite"' in html
    assert 'role="alert"' in html
    assert 'inputmode="decimal"' in html
    assert 'accept="image/jpeg,image/png,image/webp"' in html
    assert "placeholder=" not in html


def test_stage63_ui_exposes_preparation_measurement_photo_and_confirmation() -> None:
    html = (STATIC / "swatch-assistant.html").read_text(encoding="utf-8")
    for text in (
        "Образец связан",
        "Полностью высушен",
        "Измерен без растягивания",
        "Количество петель",
        "Количество рядов",
        "Ширина участка",
        "Высота участка",
        "Сантиметры",
        "Дюймы",
        "Фотография образца",
        "петель на 10 см",
        "рядов на 10 см",
        "Подтвердить плотность",
        "Продолжить работу над изделием",
    ):
        assert text in html


def test_stage63_controller_revalidates_and_fails_closed() -> None:
    script = (STATIC / "swatch-assistant-workspace.js").read_text(encoding="utf-8")
    for token in (
        "buildVerifiedSource",
        "assessInitialization",
        "validateInitializationRecord",
        "checked.trusted",
        "PROJECT_ID_MISMATCH",
        "sourceFingerprint",
        "selectCurrentRecord",
        "buildConfirmedRecord",
        "appendHistory",
        "baseRevision",
        "safeDestination",
        'purpose: "SWATCH"',
        "deletePhoto",
        "revokeObjectURL",
        "pagehide",
        "renderHistory(current.history, current)",
        "selectedKey",
        'selection.state === "stale"',
    ):
        assert token in script
    assert "fetch(" not in script
    assert "WebSocket" not in script
    assert "javascript:" not in script


def test_stage63_restores_only_complete_warning_acknowledgement() -> None:
    script = (STATIC / "swatch-assistant-workspace.js").read_text(encoding="utf-8")
    assert "hydratedAcknowledgedWarningCodes = [...draft.acknowledgedWarningCodes]" in script
    assert "assessment.requiredAcknowledgements.length > 0" in script
    assert "every((code) => acknowledged.has(code))" in script
    assert 'document.readyState === "complete"' not in script
    assert script.index("await waitForPageShow();") < script.index("restoreHistoryAndDraft();")
    assert script.index("restoreHydratedAcknowledgement();", script.index("restoreHistoryAndDraft();")) < script.index("bindEvents();", script.index("restoreHistoryAndDraft();"))


def test_stage63_domain_is_deterministic_and_closed() -> None:
    script = (STATIC / "swatch-gauge.js").read_text(encoding="utf-8")
    for token in (
        'FORMAT = "yarnai-confirmed-swatch-gauge"',
        "RECORD_KEYS",
        "exactKeys",
        "INCH_IN_CM = 2.54",
        "stitchesPer10CmExact",
        "rowsPer10CmExact",
        "confirmationKey",
        "explicitConfirmation",
        "normalizeHistory",
        "PROJECT_SCOPE_MISMATCH",
        "aiAnalysis: false",
    ):
        assert token in script
    assert "Math.random" not in script
    assert "Date.now" not in script
    assert "document." not in script
    assert "indexedDB" not in script
    assert "createObjectURL" not in script


def test_stage63_responsive_css_has_touch_focus_and_three_viewport_breakpoints() -> None:
    css = (STATIC / "swatch-assistant-workspace.css").read_text(encoding="utf-8")
    assert "min-height: 44px" in css
    assert ":focus-visible" in css
    assert "@media (max-width: 800px)" in css
    assert "@media (max-width: 460px)" in css
    assert "@media (max-width: 340px)" in css
    assert "overflow-wrap: anywhere" in css
    assert "max-width: 320px" not in css
    assert "position: fixed" not in css
    assert "position: sticky" not in css


def test_stage63_uses_existing_indexeddb_schema_only() -> None:
    project_system = (STATIC / "project-system.js").read_text(encoding="utf-8")
    assert "const DB_VERSION = 4;" in project_system
    assert "const HISTORY_KEY = \"swatch_gauge_history\"" in (
        STATIC / "swatch-gauge.js"
    ).read_text(encoding="utf-8")
    stores_block = project_system.split("const STORE_NAMES = [", 1)[1].split("];", 1)[0]
    stores = [
        line.strip().strip(chr(34) + ",")
        for line in stores_block.splitlines()
        if line.strip().startswith(chr(34))
    ]
    assert len(stores) == 16
    assert len(set(stores)) == 16
    assert "swatch" not in stores
    assert project_system.count("database.createObjectStore(") == 1


def test_stage62_controller_routes_swatch_to_stage63_without_changing_domain_contract() -> None:
    domain = (STATIC / "user-workspace-entry.js").read_text(encoding="utf-8")
    controller = (STATIC / "user-workspace-entry-assistant.js").read_text(
        encoding="utf-8"
    )
    assert 'projectRoute("/user-workspace-entry", projectId, "swatch-assistant")' in domain
    assert 'workspace.projectRoute("/swatch-assistant", projectId)' in controller
    assert '"/swatch-assistant"' in controller
    assert "allowedDestination(action.destination)" in controller
