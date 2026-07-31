from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class _SectionAssistantParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: dict[str, dict[str, str | None]] = {}
        self.scripts: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if element_id := attributes.get("id"):
            self.ids[element_id] = attributes
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_section_assistant_route_and_assets_are_available(
    client: TestClient,
) -> None:
    response = client.get("/section-assistant")
    parser = _SectionAssistantParser()
    parser.feed(response.text)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Набор завершён. Определим следующий участок." in response.text
    assert parser.scripts == [
        "/static/project-system.js",
        "/static/first-knitting-step.js",
        "/static/first-fabric-section.js",
        "/static/section-assistant.js",
    ]
    for asset in parser.scripts:
        asset_response = client.get(asset)
        assert asset_response.status_code == 200
        assert asset_response.headers["content-type"].startswith(
            ("text/javascript", "application/javascript")
        )


def test_section_assistant_contains_collection_progress_and_completion_controls(
    client: TestClient,
) -> None:
    response = client.get("/section-assistant")
    parser = _SectionAssistantParser()
    parser.feed(response.text)

    assert {
        "section-assistant-workflow",
        "section-question-panel",
        "section-question-form",
        "section-ready-panel",
        "section-blocked-panel",
        "section-progress-panel",
        "section-current-row",
        "section-current-instruction",
        "section-row-complete-button",
        "section-row-back-button",
        "section-target-panel",
        "section-complete-button",
        "section-completed-panel",
        "section-project-link",
    } <= parser.ids.keys()
    assert 'name="viewport"' in response.text
    assert "Ряд завершён" in response.text
    assert "Для следующего этапа нужно определить формирование изделия." in response.text


def test_section_modules_are_connected_without_a_hardcoded_row_target() -> None:
    html = (STATIC / "section-assistant.html").read_text(encoding="utf-8")
    controller = (STATIC / "section-assistant.js").read_text(encoding="utf-8")
    engine = (STATIC / "first-fabric-section.js").read_text(encoding="utf-8")
    home = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    step_html = (STATIC / "step-assistant.html").read_text(encoding="utf-8")

    assert 'src="/static/first-fabric-section.js"' in html
    assert 'src="/static/section-assistant.js"' in html
    assert 'src="/static/first-fabric-section.js"' in home
    assert 'id="next-section-link"' in step_html
    assert "calculateRowCount" in engine
    assert "calculated_row_count" in engine
    assert "section.calculated_row_count" in controller
    assert "60 ряд" not in html
    assert "60 ряд" not in controller
    assert "calculated_row_count: 60" not in engine


def test_existing_routes_and_static_files_remain_available(
    client: TestClient,
) -> None:
    for route in [
        "/",
        "/calculator",
        "/smart-start",
        "/step-assistant",
        "/section-assistant",
        "/health",
    ]:
        assert client.get(route).status_code == 200

    for asset in [
        "/static/app.js",
        "/static/project-system.js",
        "/static/first-knitting-step.js",
        "/static/step-assistant.js",
        "/static/first-fabric-section.js",
        "/static/section-assistant.js",
        "/static/styles.css",
    ]:
        assert client.get(asset).status_code == 200


def test_calculator_and_standalone_step_assistant_guards_are_preserved() -> None:
    package = (ROOT / "package.json").read_text(encoding="utf-8")
    step_script = (STATIC / "step-assistant.js").read_text(encoding="utf-8")

    assert "src/yarnai/static/app.js" in package
    assert "src/yarnai/static/step-assistant-state.js" in package
    assert "src/yarnai/static/step-assistant.js" in package
    assert "calculationState.readCurrentCalculation(storage)" in step_script
    assert "initializeStandaloneMode()" in step_script
    assert "firstKnittingStep.loadForProject" in step_script
