from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path

import pytest
from starlette.testclient import TestClient

import yarnai.http as http_api


ROOT = Path(__file__).parents[2]
STATIC = ROOT / "src" / "yarnai" / "static"


class _ShapingAssistantParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if element_id := attributes.get("id"):
            self.ids.add(element_id)
        if tag == "script" and attributes.get("src"):
            self.scripts.append(attributes["src"])
        if (
            tag == "link"
            and attributes.get("rel") == "stylesheet"
            and attributes.get("href")
        ):
            self.stylesheets.append(attributes["href"])


@pytest.fixture
def client() -> TestClient:
    with TestClient(http_api.create_app()) as test_client:
        yield test_client


def test_shaping_assistant_route_and_assets_are_available(
    client: TestClient,
) -> None:
    response = client.get("/shaping-assistant")
    parser = _ShapingAssistantParser()
    parser.feed(response.text)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Равномерно уменьшим ширину полотна" in response.text
    assert parser.scripts == [
        "/static/project-system.js",
        "/static/first-knitting-step.js",
        "/static/first-fabric-section.js",
        "/static/first-simple-shaping.js",
        "/static/shaping-assistant.js",
    ]
    assert parser.stylesheets == [
        "/static/styles.css",
        "/static/shaping-assistant.css",
    ]
    for asset in [*parser.scripts, *parser.stylesheets]:
        assert client.get(asset).status_code == 200


def test_shaping_page_contains_plan_progress_blocking_and_completion_controls(
    client: TestClient,
) -> None:
    response = client.get("/shaping-assistant")
    parser = _ShapingAssistantParser()
    parser.feed(response.text)

    assert {
        "shaping-assistant-workflow",
        "shaping-question-panel",
        "shaping-declined-panel",
        "shaping-plan-panel",
        "shaping-start-count",
        "shaping-target-count",
        "shaping-total-rows",
        "shaping-events-count",
        "shaping-decrease-rows",
        "shaping-blocked-panel",
        "shaping-progress-panel",
        "shaping-current-row",
        "shaping-current-count",
        "shaping-current-instruction",
        "shaping-row-complete-button",
        "shaping-row-back-button",
        "shaping-target-panel",
        "shaping-complete-button",
        "shaping-completed-panel",
        "shaping-project-link",
    } <= parser.ids
    assert "Ряд завершён" in response.text
    assert "Этап ещё не завершён автоматически" in response.text


def test_first_user_flow_and_completed_section_link_to_shaping() -> None:
    home_html = (STATIC / "first-user-flow.html").read_text(encoding="utf-8")
    home_script = (STATIC / "first-user-flow.js").read_text(encoding="utf-8")
    section_html = (STATIC / "section-assistant.html").read_text(encoding="utf-8")
    section_script = (STATIC / "section-assistant.js").read_text(encoding="utf-8")

    assert 'src="/static/first-simple-shaping.js"' in home_html
    assert "firstSimpleShaping.ensureForProject" in home_script
    assert "shapingHome?.href" in home_script
    assert 'id="section-shaping-link"' in section_html
    assert "/shaping-assistant?project=" in section_script


def test_existing_pages_and_assets_remain_available(client: TestClient) -> None:
    for route in [
        "/",
        "/calculator",
        "/smart-start",
        "/step-assistant",
        "/section-assistant",
        "/shaping-assistant",
        "/health",
    ]:
        assert client.get(route).status_code == 200

    for asset in [
        "/static/app.js",
        "/static/first-user-flow.js",
        "/static/section-assistant.js",
        "/static/styles.css",
        "/static/first-simple-shaping.js",
        "/static/shaping-assistant.js",
        "/static/shaping-assistant.css",
    ]:
        assert client.get(asset).status_code == 200
