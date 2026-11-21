from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient

from yarnai.http import app


STATIC = Path(__file__).parents[2] / "src" / "yarnai" / "static"


def test_pattern_execution_print_route_and_assets() -> None:
    client = TestClient(app)
    response = client.get("/pattern-execution-print")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"
    assert "Персональная адаптированная инструкция" in response.text
    for asset in (
        "/static/pattern-execution-export.js",
        "/static/pattern-execution-print-assistant.js",
        "/static/pattern-execution-print.css",
    ):
        asset_response = client.get(asset)
        assert asset_response.status_code == 200, asset
        assert asset_response.content


def test_ready_stage_22_exposes_visible_export_action() -> None:
    html = (STATIC / "pattern-execution-plan.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-plan-assistant.js").read_text(encoding="utf-8")

    assert 'id="execution-plan-export"' in html
    assert "Сохранить инструкцию в PDF" in html
    assert "ui.exportInstruction.hidden = false" in controller
    assert 'if (state.status === "ready")' in controller
    assert "/pattern-execution-print?project=" in controller


def test_print_page_has_required_human_sections_and_no_source_pdf_content() -> None:
    html = (STATIC / "pattern-execution-print.html").read_text(encoding="utf-8")
    controller = (STATIC / "pattern-execution-print-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-export.js").read_text(encoding="utf-8")

    for label in (
        "Перед началом",
        "Что изменено для вашей адаптации",
        "Пошаговая инструкция",
        "Статус проверки",
        "Печать / сохранить PDF",
        "Вернуться к плану",
    ):
        assert label in html
    assert "window.print" not in html
    assert "globalObject.print()" in controller
    assert "innerHTML" not in controller
    assert "insertAdjacentHTML" not in controller
    assert "sourceLocator" not in controller
    assert "sourceOperationIdentity" not in controller
    assert "sourceDocument" not in controller
    assert "document сформирован" not in domain.lower()
    assert "Документ сформирован для владельца загруженного исходника" in domain


def test_print_css_is_a4_readable_and_hides_navigation_and_controls() -> None:
    css = (STATIC / "pattern-execution-print.css").read_text(encoding="utf-8")

    assert "@page { size: A4;" in css
    assert "@media print" in css
    assert ".no-print, .site-header, .noscript-message { display: none !important; }" in css
    assert "break-inside: avoid" in css
    assert "page-break-inside: avoid" in css
    assert "overflow-wrap: anywhere" in css
    assert "grid-template-columns: 9mm minmax(0, 1fr)" in css


def test_export_is_read_only_and_does_not_create_persistence_state() -> None:
    controller = (STATIC / "pattern-execution-print-assistant.js").read_text(encoding="utf-8")
    domain = (STATIC / "pattern-execution-export.js").read_text(encoding="utf-8")
    combined = f"{controller}\n{domain}"

    assert "repository.getProject(projectId)" in controller
    for forbidden in (
        "ensureForProject(",
        "updatePatternExecutionPlan",
        "updatePatternExecutionSession",
        "addCalculation",
        "createCheckpoint",
        "indexedDB.open",
        "window.localStorage",
        "fetch(",
    ):
        assert forbidden not in combined
